import { localDate } from "./auto-dates";
import { db, SYNC_TABLES, type SyncTableName } from "./db";
import { decryptJson, encryptJson } from "./crypto";
import type { EncryptedPayload, SyncRecord } from "./types";

const BACKUP_APP = "contabilizate";
const BACKUP_VERSION = 1;

export type Snapshot = Record<SyncTableName, SyncRecord[]>;

interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  tables?: Snapshot;
  encrypted?: EncryptedPayload;
}

export async function takeSnapshot(): Promise<Snapshot> {
  const entries = await Promise.all(
    SYNC_TABLES.map(async (name) => [name, await db.table<SyncRecord>(name).toArray()] as const),
  );
  return Object.fromEntries(entries) as Snapshot;
}

export interface MergeResult {
  added: number;
  updated: number;
}

/**
 * Combina un snapshot con la base local: por cada id gana el registro con el
 * updatedAt más reciente. Es la misma regla que usará la sincronización.
 */
export async function mergeSnapshot(snapshot: Partial<Snapshot>): Promise<MergeResult> {
  const result: MergeResult = { added: 0, updated: 0 };
  await db.transaction("rw", SYNC_TABLES.map((name) => db.table(name)), async () => {
    for (const name of SYNC_TABLES) {
      const incoming = snapshot[name] ?? [];
      if (incoming.length === 0) continue;
      const table = db.table<SyncRecord, string>(name);
      const current = await table.bulkGet(incoming.map((r) => r.id));
      const winners = incoming.filter((record, i) => {
        const local = current[i];
        if (!local) {
          result.added++;
          return true;
        }
        if (record.updatedAt > local.updatedAt) {
          result.updated++;
          return true;
        }
        return false;
      });
      await table.bulkPut(winners);
    }
  });
  return result;
}

export async function exportBackup(options: { password?: string; includeVault: boolean }): Promise<Blob> {
  const snapshot = await takeSnapshot();
  if (!options.includeVault) snapshot.vault = [];
  const file: BackupFile = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ...(options.password
      ? { encrypted: await encryptJson(snapshot, options.password) }
      : { tables: snapshot }),
  };
  return new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
}

export class BackupNeedsPasswordError extends Error {
  constructor() {
    super("Este respaldo está cifrado, escribe su contraseña");
  }
}

export async function importBackup(file: File, password?: string): Promise<MergeResult> {
  let parsed: BackupFile;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("El archivo no es un respaldo válido");
  }
  if (parsed.app !== BACKUP_APP) throw new Error("El archivo no es un respaldo de Contabilizate");
  if (parsed.version > BACKUP_VERSION) {
    throw new Error("El respaldo es de una versión más nueva de la extensión");
  }
  let snapshot = parsed.tables;
  if (parsed.encrypted) {
    if (!password) throw new BackupNeedsPasswordError();
    snapshot = await decryptJson<Snapshot>(parsed.encrypted, password);
  }
  return mergeSnapshot(snapshot ?? {});
}

export function backupFileName(): string {
  return `contabilizate-respaldo-${localDate()}.json`;
}
