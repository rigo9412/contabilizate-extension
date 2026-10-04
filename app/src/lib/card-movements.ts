import { round2 } from "./bill-calc";
import type { CardMovement, CardStatement } from "./types";

export interface CardMovementRow extends CardMovement {
  key: string;
  statementId: string;
  bank: string;
  cardName: string;
  cardLast4: string;
}

/** Todos los movimientos de los estados de cuenta, del más reciente al más antiguo. */
export function flattenMovements(statements: CardStatement[]): CardMovementRow[] {
  return statements
    .flatMap((s) =>
      s.movements.map((m, i) => ({
        ...m,
        key: `${s.id}-${i}`,
        statementId: s.id,
        bank: s.bank,
        cardName: s.cardName,
        cardLast4: s.cardLast4,
      })),
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

/** Cargos (compras) de cada tarjeta por mes del año, según la fecha del movimiento. */
export function monthlyCardCharges(statements: CardStatement[], year: number): CardSeries[] {
  const cards = new Map<string, CardSeries>();
  for (const s of statements) {
    const key = `${s.bank}-${s.cardLast4}`;
    const card = cards.get(key) ?? { key, label: `${s.cardName} ···${s.cardLast4}`, months: Array(12).fill(0) };
    for (const m of s.movements) {
      if (m.amount <= 0 || Number(m.date.slice(0, 4)) !== year) continue;
      const i = Number(m.date.slice(5, 7)) - 1;
      if (i >= 0 && i < 12) card.months[i] += m.amount;
    }
    cards.set(key, card);
  }
  return [...cards.values()]
    .map((c) => ({ ...c, months: c.months.map(round2) }))
    .filter((c) => c.months.some((v) => v > 0))
    .sort((a, b) => b.months.reduce((x, y) => x + y, 0) - a.months.reduce((x, y) => x + y, 0));
}
