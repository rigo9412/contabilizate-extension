import { parseCfdi } from "./cfdi-parser";
import { db, save } from "./db";
import type { Bill } from "./types";

/**
 * Guarda un CFDI en Facturas usando su UUID como id, así que volver a
 * descargarlo o importarlo actualiza la misma factura en vez de duplicarla.
 */
export async function importCfdiXml(xml: string, options: { cancelled?: boolean } = {}): Promise<Bill> {
  const { uuid, bill } = parseCfdi(xml);
  const existing = await db.bills.get(uuid);
  return save<Bill>(db.bills, {
    ...bill,
    id: uuid,
    // Se respeta si el usuario lo había excluido del resumen a mano.
    count: options.cancelled ? false : (existing?.count ?? true),
    cancelled: options.cancelled ?? existing?.cancelled ?? false,
    deletedAt: null,
  });
}
