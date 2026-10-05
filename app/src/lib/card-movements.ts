import { round2 } from "./bill-calc";
import type { CategorySlice } from "./dashboard";
import { categorize } from "./spending-analysis";
import type { CardMovement, CardStatement } from "./types";

export interface CardMovementRow extends CardMovement {
  key: string;
  statementId: string;
  bank: string;
  cardName: string;
  cardLast4: string;
  categoryKey: string;
  categoryName: string;
}

/** Todos los movimientos de los estados de cuenta, del más reciente al más antiguo. */
export function flattenMovements(statements: CardStatement[]): CardMovementRow[] {
  return statements
    .flatMap((s) =>
      s.movements.map((m, i) => {
        const category = categorize(m.description, m.bankCategory);
        return {
        ...m,
        categoryKey: category.key,
        categoryName: category.name,
        key: `${s.id}-${i}`,
        statementId: s.id,
        bank: s.bank,
        cardName: s.cardName,
        cardLast4: s.cardLast4,
        };
      }),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

export interface MerchantTotal {
  name: string;
  total: number;
  count: number;
}

/** Comercios donde más se gastó (solo cargos). */
export function topMerchants(rows: CardMovement[], limit = 8): MerchantTotal[] {
  const totals = new Map<string, MerchantTotal>();
  for (const row of rows) {
    if (row.amount <= 0) continue;
    const entry = totals.get(row.description) ?? { name: row.description, total: 0, count: 0 };
    entry.total = round2(entry.total + row.amount);
    entry.count++;
    totals.set(row.description, entry);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export interface CardSeries {
  key: string;
  label: string;
  /** Cargos de la tarjeta por mes (índice 0 = enero). */
  months: number[];
}

/**
 * Abonos (pagos) de cada tarjeta por mes del año, según la fecha del abono: lo que
 * realmente salió de tu bolsillo. Los cargos no se cuentan.
 */
export function monthlyCardPayments(statements: CardStatement[], year: number): CardSeries[] {
  const cards = new Map<string, CardSeries>();
  for (const s of statements) {
    const key = `${s.bank}-${s.cardLast4}`;
    const card = cards.get(key) ?? { key, label: `${s.cardName} ···${s.cardLast4}`, months: Array(12).fill(0) };
    for (const m of s.movements) {
      if (m.amount >= 0 || Number(m.date.slice(0, 4)) !== year) continue;
      const i = Number(m.date.slice(5, 7)) - 1;
      if (i >= 0 && i < 12) card.months[i] -= m.amount;
    }
    cards.set(key, card);
  }
  return [...cards.values()]
    .map((c) => ({ ...c, months: c.months.map(round2) }))
    .filter((c) => c.months.some((v) => v > 0))
    .sort((a, b) => b.months.reduce((x, y) => x + y, 0) - a.months.reduce((x, y) => x + y, 0));
}

export interface MonthTotal {
  /** Mes de la operación (YYYY-MM). */
  month: string;
  charges: number;
  payments: number;
  count: number;
}

/** Totales por mes (según la fecha de operación), del más reciente al más antiguo. */
export function monthlyTotals(rows: CardMovement[]): MonthTotal[] {
  const months = new Map<string, MonthTotal>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    const entry = months.get(month) ?? { month, charges: 0, payments: 0, count: 0 };
    if (row.amount > 0) entry.charges = round2(entry.charges + row.amount);
    else entry.payments = round2(entry.payments - row.amount);
    entry.count++;
    months.set(month, entry);
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** Cargos agrupados por categoría, de mayor a menor. */
export function categoryTotals(rows: CardMovementRow[]): CategorySlice[] {
  const totals = new Map<string, CategorySlice>();
  for (const row of rows) {
    if (row.amount <= 0) continue;
    const entry = totals.get(row.categoryKey) ?? { key: row.categoryKey, name: row.categoryName, total: 0, count: 0 };
    entry.total = round2(entry.total + row.amount);
    entry.count++;
    totals.set(row.categoryKey, entry);
  }
  return [...totals.values()].sort((a, b) => b.total - a.total);
}
