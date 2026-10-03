// Resumen mensual con las mismas reglas que la web (src/features/dashboard/server/queries.ts).
import { round2 } from "./bill-calc";
import type { Bill } from "./types";

export const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export interface MonthSummary {
  month: number;
  label: string;
  incomes: number;
  expenses: number;
  taxesTranslated: number;
  taxesRetention: number;
}

/** Ingreso: nómina, o factura de ingreso emitida por mí. */
export function isIncome(bill: Bill, rfc: string): boolean {
  return bill.typeBill === "N" || (bill.typeBill === "I" && bill.rfcEmisor === rfc);
}

/** Gasto: egreso, o factura de ingreso que otro me emitió. */
export function isExpense(bill: Bill, rfc: string): boolean {
  return bill.typeBill === "E" || (bill.typeBill === "I" && bill.rfcReceptor === rfc && bill.rfcEmisor !== rfc);
}

/** Facturas que cuentan: ni borradas, ni canceladas, ni excluidas a mano. */
export function countable(bills: Bill[]): Bill[] {
  return bills.filter((b) => !b.deletedAt && !b.cancelled && b.count !== false);
}

export function monthlySummary(bills: Bill[], rfc: string, year: number): MonthSummary[] {
  const months: MonthSummary[] = MONTH_LABELS.map((label, i) => ({
    month: i + 1,
    label,
    incomes: 0,
    expenses: 0,
    taxesTranslated: 0,
    taxesRetention: 0,
  }));
  for (const bill of countable(bills)) {
    // La fecha viene como "YYYY-MM-DD" o "YYYY-MM-DDTHH:mm:ss"; se lee sin zona horaria.
    if (Number(bill.date.slice(0, 4)) !== year) continue;
    const m = months[Number(bill.date.slice(5, 7)) - 1];
    if (!m) continue;
    if (isIncome(bill, rfc)) {
      m.incomes += bill.total;
      m.taxesTranslated += bill.totalTaxesTranslated;
      m.taxesRetention += bill.totalTaxesRetention;
    } else if (isExpense(bill, rfc)) {
      m.expenses += bill.total;
    }
  }
  return months.map((m) => ({
    ...m,
    incomes: round2(m.incomes),
    expenses: round2(m.expenses),
    taxesTranslated: round2(m.taxesTranslated),
    taxesRetention: round2(m.taxesRetention),
  }));
}

export function availableYears(bills: Bill[], current = new Date().getFullYear()): number[] {
  const years = new Set<number>([current]);
  for (const b of bills) {
    const y = Number(b.date.slice(0, 4));
    if (y > 2000) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

export interface CategorySlice {
  key: string;
  name: string;
  total: number;
  count: number;
}

/**
 * Agrupa por contraparte: de quién viene cada gasto (emisor) o a quién le
 * facturaste cada ingreso (receptor). Muestra las `max` mayores y junta el
 * resto en "Otros".
 */
export function categorySummary(
  bills: Bill[],
  rfc: string,
  year: number,
  kind: "incomes" | "expenses",
  max = 6,
): CategorySlice[] {
  const groups = new Map<string, CategorySlice>();
  for (const bill of countable(bills)) {
    if (Number(bill.date.slice(0, 4)) !== year) continue;
    const mine = kind === "incomes" ? isIncome(bill, rfc) : isExpense(bill, rfc);
    if (!mine) continue;
    // Nómina: el emisor soy yo y el receptor es el patrón; en ingresos siempre se agrupa por quien paga.
    const incoming = kind === "expenses";
    const key = (incoming ? bill.rfcEmisor : bill.rfcReceptor) || "SIN-RFC";
    const name = (incoming ? bill.nameEmisor : bill.nameReceptor) || key;
    const slice = groups.get(key) ?? { key, name, total: 0, count: 0 };
    slice.total += bill.total;
    slice.count += 1;
    groups.set(key, slice);
  }
  const sorted = [...groups.values()]
    .filter((s) => s.total > 0)
    .map((s) => ({ ...s, total: round2(s.total) }))
    .sort((a, b) => b.total - a.total);
  if (sorted.length <= max) return sorted;
  const rest = sorted.slice(max);
  return [
    ...sorted.slice(0, max),
    {
      key: "__otros",
      name: `Otros (${rest.length})`,
      total: round2(rest.reduce((a, s) => a + s.total, 0)),
      count: rest.reduce((a, s) => a + s.count, 0),
    },
  ];
}
