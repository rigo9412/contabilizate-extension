// Sincronización con Google Drive: baja la copia remota, la combina con la
// base local (gana el registro más reciente, los borrados viajan como
// tombstones) y sube el resultado. Misma regla que importar un respaldo.
import { mergeSnapshot, takeSnapshot, type MergeResult, type Snapshot } from "./backup";
import { createDriveClient, getToken, type DriveClient } from "./drive";
import { createFileClient, ensurePermission, getSavedHandle } from "./file-sync";

const SYNC_FORMAT = "contabilizate-sync";
const SYNC_VERSION = 1;
const SETTINGS_KEY = "driveSync";

interface SyncFile {
  app: typeof SYNC_FORMAT;
  version: number;
  syncedAt: string;
  tables: Snapshot;
}

/** Dónde se guarda la copia compartida: Drive (por defecto) o un archivo que elige el usuario. */
export type SyncProvider = "drive" | "file";

export interface SyncSettings {
  enabled: boolean;
  provider?: SyncProvider;
  /** Nombre del archivo elegido, solo para mostrarlo. */
  fileName?: string;
  lastSyncAt?: number;
  lastError?: string;
  lastResult?: MergeResult;
}

export async function getSyncSettings(): Promise<SyncSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return (stored[SETTINGS_KEY] as SyncSettings | undefined) ?? { enabled: false };
}

export async function updateSyncSettings(patch: Partial<SyncSettings>): Promise<SyncSettings> {
  const next = { ...(await getSyncSettings()), ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** Un ciclo de sincronización contra un cliente de Drive (inyectable para pruebas). */
export async function syncWith(client: DriveClient): Promise<MergeResult> {
  const remote = await client.find();
  let result: MergeResult = { added: 0, updated: 0 };
  if (remote) {
    const parsed = JSON.parse(await client.download(remote.id)) as Partial<SyncFile>;
    if (parsed.app !== SYNC_FORMAT) throw new Error("El archivo de Drive no es de Contabilizate");
    if ((parsed.version ?? 0) > SYNC_VERSION) {
      throw new Error("Otro dispositivo usa una versión más nueva de la extensión; actualízala");
    }
    result = await mergeSnapshot(parsed.tables ?? {});
  }
  const file: SyncFile = {
    app: SYNC_FORMAT,
    version: SYNC_VERSION,
    syncedAt: new Date().toISOString(),
    tables: await takeSnapshot(),
  };
  await client.upload(JSON.stringify(file), remote?.id);
  return result;
}

async function createClient(provider: SyncProvider = "drive", interactive: boolean): Promise<DriveClient> {
  if (provider === "drive") return createDriveClient(await getToken(interactive));
  const handle = await getSavedHandle();
  if (!handle) throw new Error("No hay archivo de sincronización elegido");
  await ensurePermission(handle, interactive);
  return createFileClient(handle);
}

let running: Promise<MergeResult> | null = null;

/** Sincroniza ahora; si ya hay una sincronización en curso, espera esa. */
export function syncNow(options: { interactive?: boolean } = {}): Promise<MergeResult> {
  running ??= (async () => {
    try {
      const interactive = options.interactive ?? false;
      const result = await syncWith(await createClient((await getSyncSettings()).provider, interactive));
      await updateSyncSettings({ lastSyncAt: Date.now(), lastError: undefined, lastResult: result });
      return result;
    } catch (err) {
      await updateSyncSettings({ lastError: (err as Error).message });
      throw err;
    } finally {
      running = null;
    }
  })();
  return running;
}

export function isSyncing(): boolean {
  return running !== null;
}
