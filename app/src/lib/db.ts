import Dexie, { type EntityTable } from "dexie";
import type { Bill, Profile, SatDownload, SyncRecord, Template, Vault } from "./types";

export const PROFILE_ID = "me";
export const VAULT_ID = "efirma";

export const db = new Dexie("contabilizate") as Dexie & {
  profile: EntityTable<Profile, "id">;
  vault: EntityTable<Vault, "id">;
  bills: EntityTable<Bill, "id">;
  templates: EntityTable<Template, "id">;
  downloads: EntityTable<SatDownload, "id">;
};

db.version(1).stores({
  profile: "id, updatedAt",
  vault: "id, updatedAt",
  bills: "id, updatedAt, date, typeBill, rfcEmisor, rfcReceptor",
  templates: "id, updatedAt, alias",
  downloads: "id, updatedAt, startDate",
});

export const SYNC_TABLES = ["profile", "vault", "bills", "templates", "downloads"] as const;
export type SyncTableName = (typeof SYNC_TABLES)[number];

export function newId(): string {
  return crypto.randomUUID();
}

/** Guarda un registro marcando updatedAt; siempre usar esto en vez de table.put. */
export async function save<T extends SyncRecord>(
  table: EntityTable<T, "id">,
  record: Omit<T, "updatedAt"> & { updatedAt?: number },
): Promise<T> {
  const saved = { ...record, updatedAt: Date.now() } as T;
  await table.put(saved);
  return saved;
}

/** Borrado lógico, para que el borrado también llegue a los otros dispositivos. */
export async function softDelete<T extends SyncRecord>(table: EntityTable<T, "id">, id: string) {
  const now = Date.now();
  await table.update(id as never, { deletedAt: now, updatedAt: now } as never);
}

export function alive<T extends SyncRecord>(records: T[]): T[] {
  return records.filter((r) => !r.deletedAt);
}
