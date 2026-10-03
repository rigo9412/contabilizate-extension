import { hasTokens } from "./auto-dates";
import { ratesOf } from "./bill-calc";
import { cfdiUsages, keyProductService, taxRegimes, unitMeasure } from "./catalogs";
import type { BillDraft } from "./types";

export const SAT_BILL_URL = "https://portal.facturaelectronica.sat.gob.mx/Factura/GeneraFactura";

/**
 * Marca que js/forms/fill-form-bill.js revisa para borrar los datos después de
 * sellar, y así no volver a emitir la misma factura al recargar el portal.
 */
export const STAGED_BY_APP_KEY = "billStagedBy";

// Formato que espera el script de llenado: el que comparan contra los totales
// del portal. Los importes en cero van vacíos, como en el JSON de ejemplo.
const amount = (value: number) => (value ? value.toFixed(2) : "");
const percent = (rate: number | null) => (rate ? String(Number((rate * 100).toFixed(4))) : "00");

export type LegacyBillEntries = Record<string, string>;

/** Convierte una factura al formato plano que lee fill-form-bill.js. */
export function toLegacyBill(bill: BillDraft): { entries?: LegacyBillEntries; errors: string[] } {
  const errors: string[] = [];
  if (bill.items.length !== 1) {
    errors.push("El llenado automático del SAT solo soporta facturas con un concepto.");
  }
  if (!bill.rfcReceptor) errors.push("Falta el RFC del cliente.");
  if (!bill.nameReceptor) errors.push("Falta la razón social del cliente.");
  if (!bill.postalCodeReceptor) errors.push("Falta el código postal del cliente.");
  if (!bill.typeReceptorRegistration) errors.push("Falta el régimen fiscal del cliente.");
  if (!bill.useCFDIReceptor) errors.push("Falta el uso del CFDI.");
  const item = bill.items[0];
  if (item) {
    if (!item.description) errors.push("Falta la descripción del concepto.");
    if (hasTokens(item.description)) {
      errors.push("La descripción tiene {inicio}/{fin}: activa las fechas automáticas en la plantilla.");
    }
    if (!item.serviceId && !item.serviceName) errors.push("Falta el producto o servicio del concepto.");
    if (!item.unit && !item.unitId) errors.push("Falta la unidad del concepto.");
    if (!(item.quantity > 0) || !(item.unitValue > 0)) errors.push("Cantidad y precio deben ser mayores a cero.");
  }
  if (errors.length > 0 || !item) return { errors };

  const rates = ratesOf(item);
  return {
    errors,
    entries: {
      rfc: bill.rfcReceptor,
      razonSocial: bill.nameReceptor ?? "",
      codigoPostal: bill.postalCodeReceptor ?? "",
      regimenFiscal: taxRegimes[bill.typeReceptorRegistration!] ?? bill.typeReceptorRegistration!,
      usoCFDI: cfdiUsages[bill.useCFDIReceptor!] ?? bill.useCFDIReceptor!,
      conceptoDescripcion: item.description,
      conceptoProducto: item.serviceName || keyProductService[item.serviceId] || item.serviceId,
      conceptoUnidad: unitMeasure[item.unit] ?? item.unitId,
      conceptoCantidad: String(item.quantity),
      conceptoValor: item.unitValue.toFixed(2),
      conceptoId: item.noIdentification || "1",
      conceptoImpuesto: item.objectImp || "02",
      conceptoIva: rates.iva === null ? "0" : percent(rates.iva).replace(/^00$/, "0"),
      conceptoRetIva: percent(rates.retIva),
      conceptoRetIsr: percent(rates.retIsr),
      subtotal: amount(bill.subtotal),
      impuestosTrasladados: amount(bill.totalTaxesTranslated),
      impuestosRetenidos: amount(bill.totalTaxesRetention),
      total: amount(bill.total),
    },
  };
}

/** Deja la factura lista para el script de llenado y abre el portal del SAT. */
export async function issueInSat(entries: LegacyBillEntries): Promise<void> {
  await chrome.storage.local.set({ ...entries, [STAGED_BY_APP_KEY]: "app" });
  await chrome.tabs.create({ url: SAT_BILL_URL });
}
