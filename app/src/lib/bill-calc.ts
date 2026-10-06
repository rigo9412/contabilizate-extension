import { TAXES_ISR, TAXES_IVA, TYPE_TAXES_RETENTION, TYPE_TAXES_TRASLATE } from "./catalogs";
import type { BillDraft, BillItem, BillTax } from "./types";

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Tasas de un concepto; null significa que el impuesto no aplica. */
export interface ItemRates {
  /** Con ivaExempt, iva es null: el traslado va como TipoFactor "Exento", sin tasa ni importe. */
  iva: number | null;
  ivaExempt?: boolean;
  retIva: number | null;
  retIsr: number | null;
}

export const IVA_RATES = [0.16, 0.08, 0];
export const RET_IVA_RATES = [0.106667, 0.04];
export const RET_ISR_RATES = [0.0125, 0.1];

function tax(type: string, section: string, base: number, rate: number): BillTax {
  return {
    type,
    section,
    base,
    total: round2(base * rate),
    porcentageOrValue: "Tasa",
    factor: rate.toString(),
  };
}

export function buildTaxes(subtotal: number, rates: ItemRates): BillTax[] {
  const taxes: BillTax[] = [];
  if (rates.ivaExempt)
    taxes.push({ type: TAXES_IVA, section: TYPE_TAXES_TRASLATE, base: subtotal, total: 0, porcentageOrValue: "Exento" });
  else if (rates.iva !== null) taxes.push(tax(TAXES_IVA, TYPE_TAXES_TRASLATE, subtotal, rates.iva));
  if (rates.retIva !== null) taxes.push(tax(TAXES_IVA, TYPE_TAXES_RETENTION, subtotal, rates.retIva));
  if (rates.retIsr !== null) taxes.push(tax(TAXES_ISR, TYPE_TAXES_RETENTION, subtotal, rates.retIsr));
  return taxes;
}

export function ratesOf(item: Pick<BillItem, "taxes">): ItemRates {
  const find = (type: string, section: string) => {
    const t = item.taxes.find((x) => x.type === type && x.section === section);
    return t?.factor !== undefined && t.porcentageOrValue !== "Exento" ? Number(t.factor) : null;
  };
  const ivaExempt = item.taxes.some(
    (t) => t.type === TAXES_IVA && t.section === TYPE_TAXES_TRASLATE && t.porcentageOrValue === "Exento",
  );
  return {
    iva: find(TAXES_IVA, TYPE_TAXES_TRASLATE),
    ...(ivaExempt && { ivaExempt }),
    retIva: find(TAXES_IVA, TYPE_TAXES_RETENTION),
    retIsr: find(TAXES_ISR, TYPE_TAXES_RETENTION),
  };
}

/** Recalcula subtotal e impuestos de un concepto a partir de cantidad, precio y tasas. */
export function computeItem(item: Omit<BillItem, "subtotal" | "taxes">, rates: ItemRates): BillItem {
  const subtotal = round2(item.quantity * item.unitValue);
  return { ...item, subtotal, taxes: buildTaxes(subtotal, rates) };
}

export function computeTotals(items: BillItem[]) {
  let subtotal = 0;
  let translated = 0;
  let retention = 0;
  for (const item of items) {
    subtotal += item.subtotal;
    for (const t of item.taxes) {
      if (t.section === TYPE_TAXES_TRASLATE) translated += t.total;
      else retention += t.total;
    }
  }
  return {
    subtotal: round2(subtotal),
    totalTaxesTranslated: round2(translated),
    totalTaxesRetention: round2(retention),
    total: round2(subtotal + translated - retention),
  };
}

export function withTotals<T extends BillDraft>(bill: T): T {
  return { ...bill, ...computeTotals(bill.items), description: bill.items.map((i) => i.description).join(", ") };
}

export function formatCurrency(value: number, currency = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(value);
}

export function formatRate(rate: number): string {
  return `${Number((rate * 100).toFixed(4))}%`;
}

/** Resumen corto de un impuesto del concepto: "+16%", "−10%", "IVA exento". */
export function formatTax(t: BillTax): string {
  if (t.porcentageOrValue === "Exento") return t.type === TAXES_IVA ? "IVA exento" : "Exento";
  const sign = t.section === TYPE_TAXES_TRASLATE ? "+" : "−";
  const rate = Number(t.factor);
  return Number.isFinite(rate) && t.factor !== undefined ? `${sign}${formatRate(rate)}` : `${sign}${formatCurrency(t.total)}`;
}
