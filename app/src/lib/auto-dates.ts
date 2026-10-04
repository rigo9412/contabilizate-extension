import type { AutoDates, BillDraft } from "./types";

export const START_TOKEN = "{inicio}";
export const END_TOKEN = "{fin}";

export const PERIODS: Record<AutoDates["period"], string> = {
  quincena: "Quincena (1–15 / 16–fin de mes)",
  mes: "Mes completo",
};
export const WHICH: Record<AutoDates["which"], string> = {
  actual: "La de la fecha de emisión",
  anterior: "La anterior a la fecha de emisión",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD en hora local (toISOString usa UTC y de noche ya es "mañana"). */
export function localDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const lastDay = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

export function periodRange(date: Date, auto: AutoDates): { start: string; end: string } {
  let year = date.getFullYear();
  let month = date.getMonth();
  const fmt = (day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
  const previousMonth = () => {
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  };

  if (auto.period === "mes") {
    if (auto.which === "anterior") previousMonth();
    return { start: fmt(1), end: fmt(lastDay(year, month)) };
  }

  let firstHalf = date.getDate() <= 15;
  if (auto.which === "anterior") {
    if (firstHalf) previousMonth();
    firstHalf = !firstHalf;
  }
  return firstHalf ? { start: fmt(1), end: fmt(15) } : { start: fmt(16), end: fmt(lastDay(year, month)) };
}

export function hasTokens(text: string): boolean {
  return text.includes(START_TOKEN) || text.includes(END_TOKEN);
}

export function resolveText(text: string, range: { start: string; end: string }): string {
  return text.replaceAll(START_TOKEN, range.start).replaceAll(END_TOKEN, range.end);
}

/** Sustituye {inicio} y {fin} en los conceptos según la fecha de emisión. */
export function applyAutoDates(bill: BillDraft, auto: AutoDates | undefined, date: Date = new Date()): BillDraft {
  if (!auto?.enabled) return bill;
  const range = periodRange(date, auto);
  const items = bill.items.map((item) => ({ ...item, description: resolveText(item.description, range) }));
  // En factura global, el mes y año automáticos son los del periodo facturado.
  const globalInfo = bill.globalInfo && {
    ...bill.globalInfo,
    meses: bill.globalInfo.meses || range.start.slice(5, 7),
    anio: bill.globalInfo.anio || range.start.slice(0, 4),
  };
  return {
    ...bill,
    date: localDate(date),
    items,
    description: items.map((i) => i.description).join(", "),
    ...(globalInfo && { globalInfo }),
  };
}

const DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;

/**
 * Cambia las dos primeras fechas YYYY-MM-DD de un texto por {inicio} y {fin}, y
 * deduce si el rango es una quincena o un mes.
 */
export function detectDates(text: string): { text: string; period?: AutoDates["period"] } | null {
  const matches = [...text.matchAll(DATE_RE)];
  if (matches.length < 2) return null;
  const [start, end] = matches;
  const sameMonth = start[1] === end[1] && start[2] === end[2];
  const startDay = Number(start[3]);
  const endDay = Number(end[3]);
  const monthEnd = lastDay(Number(end[1]), Number(end[2]) - 1);
  let period: AutoDates["period"] | undefined;
  if (sameMonth && ((startDay === 1 && endDay === 15) || (startDay === 16 && endDay === monthEnd))) period = "quincena";
  else if (sameMonth && startDay === 1 && endDay === monthEnd) period = "mes";

  const replaced =
    text.slice(0, start.index) +
    START_TOKEN +
    text.slice(start.index! + start[0].length, end.index) +
    END_TOKEN +
    text.slice(end.index! + end[0].length);
  return { text: replaced, period };
}
