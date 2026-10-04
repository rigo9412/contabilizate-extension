// Piezas compartidas por los lectores de estados de cuenta de cada banco.
import { round2 } from "./bill-calc";
import type { CardMovement, CardStatement } from "./types";

export type ParsedStatement = Omit<CardStatement, "id" | "updatedAt" | "deletedAt">;

export interface StatementParseResult {
  statement: ParsedStatement;
  /** Avisos que no impiden importar (p. ej. los totales no cuadran). */
  warnings: string[];
}

export const MONTHS: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", sept: "09", oct: "10", nov: "11", dic: "12",
};

/** "$1,234.50" o "$0" → número. */
export function parseMoney(value: string): number {
  return Number(value.replace(/[$,\s]/g, ""));
}

/** Compara lo leído contra los totales que imprime el banco. */
export function checkTotals(
  movements: CardMovement[],
  totalCharges: number | undefined,
  totalPayments: number | undefined,
): { sumCharges: number; sumPayments: number; warnings: string[] } {
  const sumCharges = round2(movements.filter((m) => m.amount > 0).reduce((a, m) => a + m.amount, 0));
  const sumPayments = round2(-movements.filter((m) => m.amount < 0).reduce((a, m) => a + m.amount, 0));
  const warnings: string[] = [];
  if (movements.length === 0) warnings.push("No se encontraron movimientos en el estado de cuenta");
  if (totalCharges !== undefined && totalCharges !== sumCharges) {
    warnings.push(`Los cargos leídos (${sumCharges}) no cuadran con el total del estado de cuenta (${totalCharges})`);
  }
  if (totalPayments !== undefined && totalPayments !== sumPayments) {
    warnings.push(`Los abonos leídos (${sumPayments}) no cuadran con el total del estado de cuenta (${totalPayments})`);
  }
  return { sumCharges, sumPayments, warnings };
}
