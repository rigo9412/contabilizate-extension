import { parseStatement } from "./statement-parser";
import { db, save } from "./db";
import { pdfToLines } from "./pdf-text";
import type { CardStatement } from "./types";

/**
 * Guarda un estado de cuenta usando banco + tarjeta + fecha de corte como id,
 * así que volver a importar el mismo PDF lo actualiza en vez de duplicarlo.
 */
export async function importStatementPdf(
  file: File,
  password?: string,
): Promise<{ statement: CardStatement; warnings: string[] }> {
  const lines = await pdfToLines(await file.arrayBuffer(), password);
  const { statement, warnings } = parseStatement(lines);
  const saved = await save<CardStatement>(db.statements, {
    ...statement,
    id: `${statement.bank}-${statement.cardLast4}-${statement.periodEnd}`.toLowerCase(),
    deletedAt: null,
  });
  return { statement: saved, warnings };
}
