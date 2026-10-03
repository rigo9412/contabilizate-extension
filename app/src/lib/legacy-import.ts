import { computeItem, computeTotals, round2, withTotals, type ItemRates } from "./bill-calc";
import { cfdiUsages, keyProductService, taxRegimes, unitMeasure } from "./catalogs";
import type { BillDraft } from "./types";

/** Formato JSON del popup clásico (el de "Cargar JSON" y "Descargar plantilla"). */
export interface LegacyBillJson {
  rfc?: string;
  razonSocial?: string;
  codigoPostal?: string;
  regimenFiscal?: string;
  usoCFDI?: string;
  concepto?: {
    descripcion?: string;
    producto?: string;
    unidad?: string;
    cantidad?: string | number;
    valor?: string | number;
    id?: string | number;
    impuesto?: string;
    iva?: string | number;
    retIva?: string | number;
    retIsr?: string | number;
  };
  total?: string | number;
  subtotal?: string | number;
  impuestosTrasladados?: string | number;
  impuestosRetenidos?: string | number;
}

export interface LegacyImport {
  bill: BillDraft;
  warnings: string[];
}

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.\s]+$/, "")
    .trim()
    .toLowerCase();

/** Busca la clave de un catálogo por su clave o por su descripción. */
function findKey(catalog: Record<string, string>, text: string): string | undefined {
  const target = normalize(text);
  if (!target) return undefined;
  return Object.keys(catalog).find((key) => normalize(key) === target || normalize(catalog[key]) === target);
}

const toNumber = (value: string | number | undefined) => {
  const n = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** "16" → 0.16; "00", "0" o vacío en retenciones → no aplica. */
function toRate(value: string | number | undefined, zeroMeansNone: boolean): number | null {
  const text = String(value ?? "").replace("%", "").trim();
  if (text === "") return null;
  const percent = Number(text);
  if (!Number.isFinite(percent)) return null;
  if (percent === 0 && zeroMeansNone) return null;
  return Number((percent / 100).toFixed(6));
}

export function fromLegacyJson(json: LegacyBillJson, emisor: { rfc?: string; postalCode?: string } = {}): LegacyImport {
  const warnings: string[] = [];
  const c = json.concepto ?? {};

  const resolve = (catalog: Record<string, string>, text: string | undefined, label: string) => {
    if (!text) return "";
    const key = findKey(catalog, text);
    if (key) return key;
    warnings.push(`No se encontró "${text}" en el catálogo de ${label}; se conserva el texto tal cual.`);
    return text;
  };

  const unit = findKey(unitMeasure, c.unidad ?? "");
  const rates: ItemRates = {
    iva: toRate(c.iva, false),
    retIva: toRate(c.retIva, true),
    retIsr: toRate(c.retIsr, true),
  };
  const item = computeItem(
    {
      serviceId: findKey(keyProductService, c.producto ?? "") ?? "",
      serviceName: c.producto ?? "",
      description: c.descripcion ?? "",
      quantity: toNumber(c.cantidad) || 1,
      unitValue: toNumber(c.valor),
      unit: unit ?? "",
      unitId: c.unidad ?? "",
      noIdentification: String(c.id ?? ""),
      objectImp: c.impuesto || "02",
    },
    rates,
  );

  const bill = withTotals<BillDraft>({
    date: new Date().toISOString().slice(0, 10),
    typeBill: "I",
    typePayment: "03",
    paymentMethod: "PUE",
    currency: "MXN",
    version: "4.0",
    rfcEmisor: emisor.rfc ?? "",
    postalCodeEmisor: emisor.postalCode ?? "",
    rfcReceptor: (json.rfc ?? "").trim().toUpperCase(),
    nameReceptor: json.razonSocial ?? "",
    postalCodeReceptor: json.codigoPostal ?? "",
    typeReceptorRegistration: resolve(taxRegimes, json.regimenFiscal, "regímenes fiscales"),
    useCFDIReceptor: resolve(cfdiUsages, json.usoCFDI, "usos del CFDI"),
    subtotal: 0,
    totalTaxesTranslated: 0,
    totalTaxesRetention: 0,
    total: 0,
    count: true,
    items: [item],
  });

  // El script de llenado compara estos totales contra los del portal antes de
  // sellar; si los del JSON no cuadran con las tasas, la factura no se sellaría.
  const computed = computeTotals(bill.items);
  const expected: [string, string | number | undefined, number][] = [
    ["Subtotal", json.subtotal, computed.subtotal],
    ["Impuestos trasladados", json.impuestosTrasladados, computed.totalTaxesTranslated],
    ["Impuestos retenidos", json.impuestosRetenidos, computed.totalTaxesRetention],
    ["Total", json.total, computed.total],
  ];
  for (const [label, given, calc] of expected) {
    if (given === undefined) continue;
    if (round2(toNumber(given)) !== calc) {
      warnings.push(`${label}: el JSON dice ${toNumber(given).toFixed(2)} pero con las tasas da ${calc.toFixed(2)}.`);
    }
  }

  return { bill, warnings };
}

/** Acepta un objeto o una lista de objetos en el formato del popup. */
export function parseLegacyJson(text: string): LegacyBillJson[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("El texto no es un JSON válido");
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0 || !list.every((x) => x && typeof x === "object" && ("concepto" in x || "rfc" in x))) {
    throw new Error("El JSON no tiene el formato de plantilla del popup (rfc, razonSocial, concepto…)");
  }
  return list as LegacyBillJson[];
}

/** Reconstruye el JSON a partir de lo que el popup dejó guardado en chrome.storage.local. */
export function legacyJsonFromStorage(s: Record<string, unknown>): LegacyBillJson | null {
  if (!s.conceptoDescripcion && !s.razonSocial) return null;
  const str = (key: string) => (s[key] === undefined ? undefined : String(s[key]));
  return {
    rfc: str("rfc"),
    razonSocial: str("razonSocial"),
    codigoPostal: str("codigoPostal"),
    regimenFiscal: str("regimenFiscal"),
    usoCFDI: str("usoCFDI"),
    concepto: {
      descripcion: str("conceptoDescripcion"),
      producto: str("conceptoProducto"),
      unidad: str("conceptoUnidad"),
      cantidad: str("conceptoCantidad"),
      valor: str("conceptoValor"),
      id: str("conceptoId"),
      impuesto: str("conceptoImpuesto"),
      iva: str("conceptoIva"),
      retIva: str("conceptoRetIva"),
      retIsr: str("conceptoRetIsr"),
    },
    total: str("total"),
    subtotal: str("subtotal"),
    impuestosTrasladados: str("impuestosTrasladados"),
    impuestosRetenidos: str("impuestosRetenidos"),
  };
}
