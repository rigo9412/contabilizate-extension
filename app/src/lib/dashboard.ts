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

export type Grade = "A" | "B" | "C" | "D";

export interface Health {
  /** 0-100. */
  score: number;
  grade: Grade;
  /** Porcentaje realmente ahorrado: (ingresos netos − pagos) / ingresos netos; null sin ingresos. */
  rate: number | null;
}

export interface MonthHealth extends Health {
  month: number;
  label: string;
  margin: number;
  /** null cuando el mes no tiene movimientos. */
  hasData: boolean;
}

export function gradeOf(score: number): Grade {
  return score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : "D";
}

/** Score según la tasa de ahorro (margen / ingresos netos): ≥50% = 100, 0% = 50, ≤-50% = 0. */
export function scoreFromRate(incomes: number, spent: number): number {
  if (incomes <= 0) return spent > 0 ? 0 : 50;
  const rate = (incomes - spent) / incomes;
  const score = rate >= 0.5 ? 100 : 50 + rate * 100;
  return Math.max(0, Math.round(score));
}

/** Ingreso sin el IVA que cobraste y le debes al SAT. */
export function netIncome(m: MonthSummary): number {
  return Math.max(0, m.incomes - m.taxesTranslated);
}

/** Tasa de ahorro en % con un decimal; null si no hubo ingresos. */
export function savingsRate(incomes: number, spent: number): number | null {
  return incomes > 0 ? Math.round(((incomes - spent) / incomes) * 1000) / 10 : null;
}

/** Calificación de cada mes; `cardByMonth` son los abonos a tarjeta (índice 0 = enero). Los ingresos se toman sin IVA trasladado (no es dinero tuyo); las facturas de gasto no se restan. */
export function monthlyHealth(months: MonthSummary[], cardByMonth: number[]): MonthHealth[] {
  return months.map((m, i) => {
    const spent = cardByMonth[i] ?? 0;
    const net = netIncome(m);
    const score = scoreFromRate(net, spent);
    return {
      month: m.month,
      label: m.label,
      margin: round2(net - spent),
      hasData: m.incomes > 0 || spent > 0 || m.expenses > 0,
      score,
      grade: gradeOf(score),
      rate: savingsRate(net, spent),
    };
  });
}

/** Salud general del año: 70% tasa de ahorro anual, 30% proporción de meses con margen positivo. */
export function overallHealth(months: MonthHealth[], totalIncomes: number, totalSpent: number): Health | null {
  const active = months.filter((m) => m.hasData);
  if (active.length === 0) return null;
  const positive = active.filter((m) => m.margin >= 0).length / active.length;
  const score = Math.round(0.7 * scoreFromRate(totalIncomes, totalSpent) + 0.3 * positive * 100);
  return { score, grade: gradeOf(score), rate: savingsRate(totalIncomes, totalSpent) };
}
