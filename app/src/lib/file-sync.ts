// Sincronización por archivo: el usuario elige un .json dentro de una carpeta que
// ya sincroniza otro servicio (iCloud, OneDrive, Dropbox, Syncthing…) y la
// extensión lo lee y escribe con el mismo formato que usa Drive. Sin cuentas ni OAuth.
import type { DriveClient } from "./drive";

export const SYNC_FILE_DEFAULT_NAME = "contabilizate-sync.json";

type Mode = { mode: "readwrite" };
export interface SyncFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission(options: Mode): Promise<PermissionState>;
  requestPermission(options: Mode): Promise<PermissionState>;
}

interface FilePickerWindow {
  showSaveFilePicker(options: object): Promise<SyncFileHandle>;
  showOpenFilePicker(options: object): Promise<SyncFileHandle[]>;
}

const pickerTypes = [{ description: "Sincronización de Contabilizate", accept: { "application/json": [".json"] } }];

export function isFileSyncSupported(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window && "showOpenFilePicker" in window;
}

/** Crea un archivo nuevo (o reemplaza uno existente tras confirmar el diálogo del sistema). */
export async function pickNewSyncFile(): Promise<SyncFileHandle> {
  const handle = await (window as unknown as FilePickerWindow).showSaveFilePicker({
    suggestedName: SYNC_FILE_DEFAULT_NAME,
    types: pickerTypes,
  });
  await saveHandle(handle);
  return handle;
}

/** Elige el archivo que ya creó otro navegador. */
export async function pickExistingSyncFile(): Promise<SyncFileHandle> {
  const [handle] = await (window as unknown as FilePickerWindow).showOpenFilePicker({ types: pickerTypes });
  await saveHandle(handle);
  return handle;
}

export class FilePermissionError extends Error {
  constructor() {
    super("Chrome necesita que vuelvas a dar permiso al archivo: pulsa «Sincronizar ahora»");
  }
}

/** Sin `interactive` solo consulta; pedir permiso requiere un clic del usuario. */
export async function ensurePermission(handle: SyncFileHandle, interactive: boolean): Promise<void> {
  const mode: Mode = { mode: "readwrite" };
  if ((await handle.queryPermission(mode)) === "granted") return;
  if (interactive && (await handle.requestPermission(mode)) === "granted") return;
  throw new FilePermissionError();
}

export function createFileClient(handle: SyncFileHandle): DriveClient {
  return {
    async find() {
      const file = await handle.getFile();
      return file.size === 0 ? null : { id: handle.name };
    },
    async download() {
      return (await handle.getFile()).text();
    },
    async upload(content) {
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return { id: handle.name };
    },
  };
}

// --- El handle se guarda en IndexedDB (no cabe en chrome.storage); es aparte de Dexie
// para que no viaje en los respaldos ni en la sincronización.
const DB_NAME = "contabilizate-file-sync";
const STORE = "handles";
const KEY = "syncFile";

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const idb = await openHandleDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(idb.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    idb.close();
  }
}

async function saveHandle(handle: SyncFileHandle): Promise<void> {
  await withStore("readwrite", (s) => s.put(handle, KEY));
}

export async function getSavedHandle(): Promise<SyncFileHandle | null> {
  return ((await withStore("readonly", (s) => s.get(KEY))) as SyncFileHandle | undefined) ?? null;
}

export async function forgetHandle(): Promise<void> {
  await withStore("readwrite", (s) => s.delete(KEY));
}
