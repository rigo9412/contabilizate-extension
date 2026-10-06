// Cálculo de la declaración mensual de RESICO persona física (ISR art. 113-E
// LISR + IVA), con flujo de efectivo: solo cuenta lo cobrado y lo pagado en el
// mes. Las reglas y el mapeo al portal están en docs/declaracion-resico.md.
import { round2 } from "./bill-calc";
import { TAXES_ISR, TAXES_IVA, TYPE_TAXES_RETENTION, TYPE_TAXES_TRASLATE } from "./catalogs";
import { countable } from "./dashboard";
import type { Bill, BillTax, IsrResico, IvaResico, ResicoActivity } from "./types";

/** Tasas mensuales de ISR RESICO: hasta `upTo` de ingresos cobrados sin IVA. */
export const RESICO_ISR_BRACKETS = [
  { upTo: 25_000, rate: 0.01 },
  { upTo: 50_000, rate: 0.011 },
  { upTo: 83_333.33, rate: 0.015 },
  { upTo: 208_333.33, rate: 0.02 },
  { upTo: 3_500_000, rate: 0.025 },
] as const;

/** Tipos de ingreso en que el portal pide separar el total cobrado. */
export const RESICO_ACTIVITIES: Record<ResicoActivity, string> = {
  empresarial: "Actividad empresarial",
  honorarios: "Servicios profesionales (honorarios)",
  arrendamiento: "Arrendamiento (uso o goce temporal de bienes)",
  agricola: "Actividades agrícolas, ganaderas, silvícolas o pesqueras",
};

/** Tope anual de ingresos para seguir en RESICO. */
export const RESICO_ANNUAL_LIMIT = 3_500_000;

export function resicoRate(income: number): number {
  return (RESICO_ISR_BRACKETS.find((b) => income <= b.upTo) ?? RESICO_ISR_BRACKETS.at(-1)!).rate;
}

/** Un cobro (ingreso) o un pago (gasto) del mes, ya en pesos. */
export interface CashFlow {
  kind: "income" | "expense";
  /** Factura que origina el movimiento (la PPD en el caso de un complemento). */
  billId: string;
  /** Complemento de pago que lo registra, si es PPD. */
  paymentId?: string;
  source: "PUE" | "complemento" | "nota de crédito";
  date: string;
  counterpart: string;
  /** Bases sin IVA por tratamiento. */
  base16: number;
  base8: number;
  base0: number;
  exempt: number;
  notObject: number;
  iva: number;
  retIva: number;
  retIsr: number;
  /** Lo que realmente se movió de dinero. */
  total: number;
  /** El importe se estimó porque faltaba información (ver warnings). */
  estimated?: boolean;
  /** Conceptos de la factura, para reconocer el gasto. */
  description?: string;
  /** Gasto que el usuario desmarcó (Bill.count = false): se muestra pero no suma. */
  excluded?: boolean;
  /** Por qué este gasto no cumple los requisitos para acreditar su IVA. */
  ineligible?: string;
}

export interface PendingPpd {
  billId: string;
  date: string;
  counterpart: string;
  total: number;
  paid: number;
  description?: string;
}

export type WarningKind = "saldo-a-favor" | "ppd-sin-complemento" | "complemento-sin-factura" | "moneda" | "tasa-8" | "tope-anual" | "regimen" | "exentos";

export interface ResicoWarning {
  kind: WarningKind;
  message: string;
  billIds?: string[];
}

const EMPTY = { base16: 0, base8: 0, base0: 0, exempt: 0, notObject: 0, iva: 0, retIva: 0, retIsr: 0 };
type Amounts = typeof EMPTY;

const monthOf = (date: string) => date.slice(0, 7);
export const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** Suma impuestos (de conceptos o de un DoctoRelacionado) en bases por tasa. */
function amountsFromTaxes(taxes: BillTax[], baseWithoutIva: number): Amounts {
  const a = { ...EMPTY };
  const ivaTraslados = taxes.filter((t) => t.type === TAXES_IVA && t.section === TYPE_TAXES_TRASLATE);
  for (const t of ivaTraslados) {
    const base = t.base ?? 0;
    if (t.porcentageOrValue === "Exento") a.exempt += base;
    else {
      const rate = Number(t.factor ?? 0);
      if (rate >= 0.15) a.base16 += base;
      else if (rate > 0) a.base8 += base;
      else a.base0 += base;
      a.iva += t.total;
    }
  }
  if (ivaTraslados.length === 0) a.notObject += baseWithoutIva;
  for (const t of taxes) {
    if (t.section !== TYPE_TAXES_RETENTION) continue;
    if (t.type === TAXES_ISR) a.retIsr += t.total;
    else if (t.type === TAXES_IVA) a.retIva += t.total;
  }
  return a;
}

/** Bases e impuestos de una factura completa, en pesos. */
function billAmounts(bill: Bill): Amounts {
  const a = { ...EMPTY };
  for (const item of bill.items) {
    const part = amountsFromTaxes(item.taxes, item.subtotal);
    for (const k of Object.keys(a) as (keyof Amounts)[]) a[k] += part[k];
  }
  return scale(a, bill.exchangeRate ?? 1);
}

function scale(a: Amounts, factor: number): Amounts {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof Amounts)[]) out[k] = round2(out[k] * factor);
  return out;
}

const isPpd = (bill: Bill) => bill.paymentMethod === "PPD";

/** Usos del CFDI con los que el gasto puede ser de la actividad (G01, G03 e inversiones I01-I08). */
const CREDITABLE_USES = /^(G01|G03|I0[1-8])$/;

/**
 * Requisitos del art. 5 LIVA que se pueden revisar en el CFDI. Que el gasto sea
 * indispensable para la actividad solo lo sabe el usuario (lo desmarca).
 */
export function ineligibleReason(bill: Bill, payment = false): string | undefined {
  if (bill.useCFDIReceptor && !CREDITABLE_USES.test(bill.useCFDIReceptor)) {
    return `Uso del CFDI ${bill.useCFDIReceptor}: pide al proveedor uso G03 (gastos en general)`;
  }
  if (bill.typeReceptorRegistration && bill.typeReceptorRegistration !== "626") {
    return `Facturada al régimen ${bill.typeReceptorRegistration}, no a RESICO (626)`;
  }
  // En complementos la forma de pago es la de cada pago y no se guarda.
  if (!payment && bill.typePayment === "01" && bill.total * (bill.exchangeRate ?? 1) > 2000) {
    return "Pagada en efectivo y mayor a $2,000";
  }
  return undefined;
}

/**
 * Cobros y pagos del mes. PUE cuenta en la fecha de la factura; PPD cuando se
 * cobra (fecha del complemento de pago); las notas de crédito restan.
 */
export function cashFlows(bills: Bill[], rfc: string, year: number, month: number) {
  const key = monthKey(year, month);
  const valid = countable(bills);
  // Los gastos desmarcados siguen en la lista (tachados) para poder regresarlos.
  const live = bills.filter((b) => !b.deletedAt && !b.cancelled);
  const byId = new Map(live.map((b) => [b.id.toUpperCase(), b]));
  const flows: CashFlow[] = [];
  const warnings: ResicoWarning[] = [];
  const orphanPayments: string[] = [];
  const paidByBill = new Map<string, number>();

  for (const bill of live) {
    const mine = bill.rfcEmisor === rfc;
    const toMe = bill.rfcReceptor === rfc && !mine;
    if (!mine && !toMe) continue;
    if (mine && bill.count === false) continue;
    const kind = mine ? "income" : "expense";

    if (bill.typeBill === "P") {
      for (const p of bill.payments ?? []) {
        paidByBill.set(p.relatedUuid, (paidByBill.get(p.relatedUuid) ?? 0) + p.amountPaid);
        if (monthOf(p.date) !== key) continue;
        const related = byId.get(p.relatedUuid);
        // Factura original cancelada, o ingreso excluido a mano: tampoco cuentan sus pagos.
        if (!related && bills.some((b) => b.id.toUpperCase() === p.relatedUuid)) continue;
        if (mine && related?.count === false) continue;
        let amounts: Amounts;
        let estimated = false;
        if (p.taxes.length > 0) {
          amounts = amountsFromTaxes(p.taxes, p.amountPaid);
        } else if (related && related.total > 0) {
          // Complemento 1.0 o sin desglose: proporcional a la factura.
          amounts = scale(billAmounts(related), p.amountPaid / (related.total * (related.exchangeRate ?? 1)));
        } else {
          amounts = { ...EMPTY, notObject: p.amountPaid };
          estimated = true;
          orphanPayments.push(p.relatedUuid);
        }
        flows.push({
          kind,
          billId: p.relatedUuid,
          paymentId: bill.id,
          source: "complemento",
          date: p.date,
          counterpart: (mine ? bill.nameReceptor : bill.nameEmisor) || (mine ? bill.rfcReceptor : bill.rfcEmisor),
          ...roundAll(amounts),
          total: p.amountPaid,
          ...(estimated && { estimated }),
          ...(related?.description && { description: related.description }),
          ...(kind === "expense" && expenseFlags(related ?? bill, bill, true)),
        });
      }
      continue;
    }

    if (monthOf(bill.date) !== key) continue;
    if (bill.typeBill !== "I" && bill.typeBill !== "E") continue; // Nómina y traslados no son RESICO.
    if (bill.typeBill === "I" && isPpd(bill)) continue; // Cuenta cuando llegue su complemento.
    const sign = bill.typeBill === "E" ? -1 : 1;
    const amounts = scale(billAmounts(bill), sign);
    flows.push({
      kind,
      billId: bill.id,
      source: bill.typeBill === "E" ? "nota de crédito" : "PUE",
      date: bill.date,
      counterpart: (mine ? bill.nameReceptor : bill.nameEmisor) || (mine ? bill.rfcReceptor : bill.rfcEmisor),
      ...amounts,
      total: round2(sign * bill.total * (bill.exchangeRate ?? 1)),
      ...(bill.description && { description: bill.description }),
      ...(kind === "expense" && expenseFlags(bill, bill, false)),
    });
  }

  // Facturas PPD emitidas hasta este mes que no se han cobrado completas.
  const pending: PendingPpd[] = valid
    .filter((b) => b.typeBill === "I" && isPpd(b) && b.rfcEmisor === rfc && monthOf(b.date) <= key)
    .map((b) => ({
      billId: b.id,
      date: b.date,
      counterpart: b.nameReceptor || b.rfcReceptor,
      total: round2(b.total * (b.exchangeRate ?? 1)),
      paid: round2(paidByBill.get(b.id.toUpperCase()) ?? 0),
      ...(b.description && { description: b.description }),
    }))
    .filter((p) => p.total - p.paid > 0.01 && monthOf(p.date) >= `${year}-01`);

  if (pending.length > 0) {
    warnings.push({
      kind: "ppd-sin-complemento",
      message: `${pending.length} factura(s) PPD no tienen complemento de pago completo: no cuentan hasta que te paguen y emitas el complemento.`,
      billIds: pending.map((p) => p.billId),
    });
  }
  if (orphanPayments.length > 0) {
    warnings.push({
      kind: "complemento-sin-factura",
      message: "Hay complementos de pago sin su factura original en la app; descárgala para conocer su IVA. Mientras, se toman sin IVA.",
      billIds: orphanPayments,
    });
  }
  const foreign = valid.filter((b) => b.exchangeRate && monthOf(b.date) === key);
  if (foreign.length > 0) {
    warnings.push({
      kind: "moneda",
      message: "Hay facturas en otra moneda; se convirtieron con el tipo de cambio del CFDI.",
      billIds: foreign.map((b) => b.id),
    });
  }
  if (flows.some((f) => f.kind === "income" && f.base8 !== 0)) {
    warnings.push({
      kind: "tasa-8",
      message: "Cobraste IVA al 8% (estímulo de la región fronteriza): en el portal se declara en su propio renglón.",
    });
  }
  return { flows, pending, warnings };
}

function expenseFlags(source: Bill, holder: Bill, payment: boolean): Pick<CashFlow, "excluded" | "ineligible"> {
  const excluded = source.count === false || holder.count === false;
  const ineligible = ineligibleReason(source, payment);
  return { ...(excluded && { excluded }), ...(ineligible && { ineligible }) };
}

/** Gastos cuyo IVA se puede acreditar: ni desmarcados ni sin requisitos. */
export const creditableFlows = (flows: CashFlow[]) => flows.filter((f) => f.kind === "expense" && !f.excluded && !f.ineligible);

function roundAll(a: Amounts): Amounts {
  return scale(a, 1);
}

const sum = (flows: CashFlow[], kind: CashFlow["kind"], field: keyof Amounts) =>
  round2(flows.filter((f) => f.kind === kind && !f.excluded).reduce((acc, f) => acc + f[field], 0));

/** IVA que se podría acreditar con los gastos que cumplen requisitos. */
export const potentialCreditable = (flows: CashFlow[]) => Math.max(0, sum(creditableFlows(flows), "expense", "iva"));

/** Ingresos cobrados sin IVA (lo que el portal llama "ingresos percibidos"). */
export function incomeOf(flows: CashFlow[]): number {
  const fields: (keyof Amounts)[] = ["base16", "base8", "base0", "exempt", "notObject"];
  return Math.max(0, round2(fields.reduce((acc, f) => acc + sum(flows, "income", f), 0)));
}

export function computeIsr(flows: CashFlow[]): IsrResico {
  const income = incomeOf(flows);
  const rate = resicoRate(income);
  const tax = round2(income * rate);
  const retained = sum(flows, "income", "retIsr");
  return { income, rate, tax, retained, due: Math.max(0, round2(tax - retained)) };
}

/**
 * IVA a cargo = trasladado cobrado − retenido − acreditable pagado. Si queda a
 * cargo, se le acredita el saldo a favor de meses anteriores que indique el usuario.
 * Acreditar es opcional (`creditIva`): muchos contadores no lo hacen en RESICO
 * porque genera saldos a favor que solo se recuperan pidiendo devolución.
 */
export function computeIva(flows: CashFlow[], previousBalance = 0, creditIva = false): IvaResico {
  const translated = sum(flows, "income", "iva");
  const retained = sum(flows, "income", "retIva");
  const creditable = creditIva ? potentialCreditable(flows) : 0;
  const beforeBalance = round2(translated - retained - creditable);
  const applied = beforeBalance > 0 ? Math.min(Math.max(0, previousBalance), beforeBalance) : 0;
  return {
    taxed16: sum(flows, "income", "base16"),
    taxed8: sum(flows, "income", "base8"),
    taxed0: sum(flows, "income", "base0"),
    exempt: sum(flows, "income", "exempt"),
    notObject: sum(flows, "income", "notObject"),
    translated,
    creditable,
    retained,
    previousBalance: round2(applied),
    result: round2(beforeBalance - applied),
  };
}

/** Ingresos cobrados de enero al mes indicado, para vigilar el tope de RESICO. */
export function annualIncome(bills: Bill[], rfc: string, year: number, month: number): number {
  let total = 0;
  for (let m = 1; m <= month; m++) total += incomeOf(cashFlows(bills, rfc, year, m).flows);
  return round2(total);
}

export interface MonthlyDeclaration {
  flows: CashFlow[];
  pending: PendingPpd[];
  warnings: ResicoWarning[];
  isr: IsrResico;
  iva: IvaResico;
  /** ISR a cargo + IVA a cargo (si el IVA queda a favor no resta al ISR). */
  totalDue: number;
}

export function monthlyDeclaration(
  bills: Bill[],
  rfc: string,
  year: number,
  month: number,
  options: { previousIvaBalance?: number; regimen?: string; creditIva?: boolean } = {},
): MonthlyDeclaration {
  const { flows, pending, warnings } = cashFlows(bills, rfc, year, month);
  const isr = computeIsr(flows);
  const iva = computeIva(flows, options.previousIvaBalance, options.creditIva);
  if (iva.result < 0) {
    warnings.push({
      kind: "saldo-a-favor",
      message:
        "Acreditar te deja saldo a favor de IVA. Solo sirve para restarlo en meses en que debas IVA o para pedir devolución, que suele traer revisión del SAT.",
    });
  }
  const accumulated = annualIncome(bills, rfc, year, month);
  if (accumulated > RESICO_ANNUAL_LIMIT) {
    warnings.push({
      kind: "tope-anual",
      message: "Tus ingresos del año ya pasan de 3.5 millones: dejas de tributar en RESICO. Consulta a un contador.",
    });
  }
  if (iva.exempt > 0 && iva.creditable > 0) {
    warnings.push({
      kind: "exentos",
      message: "Tienes ingresos exentos de IVA: el IVA acreditable debería ser proporcional y la app no lo calcula. Revísalo con un contador.",
    });
  }
  if (options.regimen && options.regimen !== "626") {
    warnings.push({
      kind: "regimen",
      message: "Tu perfil no tiene el régimen 626 (RESICO). Esta guía solo aplica a RESICO.",
    });
  }
  return { flows, pending, warnings, isr, iva, totalDue: round2(isr.due + Math.max(0, iva.result)) };
}

/**
 * Días hábiles adicionales al 17 según el sexto dígito numérico del RFC
 * (facilidad para personas físicas): 1-2 → 1, 3-4 → 2, 5-6 → 3, 7-8 → 4, 9-0 → 5.
 */
export function extraDays(rfc: string): number {
  const digit = rfc.slice(0, -3).replace(/\D/g, "")[5];
  if (digit === undefined) return 0;
  const n = Number(digit);
  return n === 0 ? 5 : Math.ceil(n / 2);
}

/**
 * Fecha límite: día 17 del mes siguiente más los días hábiles que da el RFC; si
 * cae en fin de semana se recorre. No considera días festivos.
 */
export function dueDate(year: number, month: number, rfc = ""): string {
  const d = new Date(year, month, 17); // `month` es 1-12, así que esto ya es el mes siguiente.
  const weekend = () => d.getDay() === 0 || d.getDay() === 6;
  for (let extra = extraDays(rfc); extra > 0; ) {
    d.setDate(d.getDate() + 1);
    if (!weekend()) extra--;
  }
  while (weekend()) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Mes que toca declarar: el anterior al de hoy. */
export function previousMonth(today = new Date()): { year: number; month: number } {
  const m = today.getMonth(); // 0 = enero → toca diciembre del año anterior.
  return m === 0 ? { year: today.getFullYear() - 1, month: 12 } : { year: today.getFullYear(), month: m };
}
