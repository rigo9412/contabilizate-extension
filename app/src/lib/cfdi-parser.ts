// Convierte el XML de un CFDI (3.3 o 4.0) en una factura de la base local.
// Port de src/features/sat/mapper.ts de la web, con DOMParser en vez de cfdi-to-json.
import { TYPE_TAXES_RETENTION, TYPE_TAXES_TRASLATE } from "./catalogs";
import type { BillDraft, BillItem, BillPayment, BillTax } from "./types";

export interface ParsedCfdi {
  uuid: string;
  bill: BillDraft;
}

const num = (value: string | null | undefined) => {
  const n = Number(value ?? "");
  return Number.isFinite(n) ? n : 0;
};

/** Hijos directos con ese nombre local, sin importar el prefijo (cfdi:, tfd:…). */
function children(parent: Element | null | undefined, localName: string): Element[] {
  if (!parent) return [];
  return Array.from(parent.children).filter((el) => el.localName === localName);
}

const child = (parent: Element | null | undefined, localName: string) => children(parent, localName)[0];

function taxes(impuestos: Element | undefined): BillTax[] {
  const read = (group: string, node: string, section: string) =>
    children(child(impuestos, group), node).map((t) => ({
      type: t.getAttribute("Impuesto") ?? "",
      section,
      base: t.hasAttribute("Base") ? num(t.getAttribute("Base")) : undefined,
      total: num(t.getAttribute("Importe")),
      porcentageOrValue: t.getAttribute("TipoFactor") ?? undefined,
      factor: t.getAttribute("TasaOCuota") ?? undefined,
    }));
  return [
    ...read("Traslados", "Traslado", TYPE_TAXES_TRASLATE),
    ...read("Retenciones", "Retencion", TYPE_TAXES_RETENTION),
  ];
}

/**
 * Documentos pagados en un complemento de pago (1.0 o 2.0). Los importes se
 * pasan a pesos: ImpPagado viene en la moneda del documento, se lleva a la del
 * pago con EquivalenciaDR y a pesos con TipoCambioP.
 */
function payments(complemento: Element | undefined): BillPayment[] {
  const result: BillPayment[] = [];
  for (const pagos of children(complemento, "Pagos")) {
    for (const pago of children(pagos, "Pago")) {
      const date = pago.getAttribute("FechaPago") ?? "";
      const pagoRate = num(pago.getAttribute("TipoCambioP")) || 1;
      for (const doc of children(pago, "DoctoRelacionado")) {
        const equivalence = num(doc.getAttribute("EquivalenciaDR")) || num(doc.getAttribute("TipoCambioDR")) || 1;
        const toMxn = (value: number) => Math.round(((value / equivalence) * pagoRate + Number.EPSILON) * 100) / 100;
        const impuestos = child(doc, "ImpuestosDR");
        const read = (group: string, node: string, section: string) =>
          children(child(impuestos, group), node).map((t) => ({
            type: t.getAttribute("ImpuestoDR") ?? "",
            section,
            base: toMxn(num(t.getAttribute("BaseDR"))),
            total: toMxn(num(t.getAttribute("ImporteDR"))),
            porcentageOrValue: t.getAttribute("TipoFactorDR") ?? undefined,
            factor: t.getAttribute("TasaOCuotaDR") ?? undefined,
          }));
        result.push({
          date,
          relatedUuid: (doc.getAttribute("IdDocumento") ?? "").toUpperCase(),
          amountPaid: toMxn(num(doc.getAttribute("ImpPagado"))),
          partiality: doc.hasAttribute("NumParcialidad") ? num(doc.getAttribute("NumParcialidad")) : undefined,
          taxes: [
            ...read("TrasladosDR", "TrasladoDR", TYPE_TAXES_TRASLATE),
            ...read("RetencionesDR", "RetencionDR", TYPE_TAXES_RETENTION),
          ],
        });
      }
    }
  }
  return result;
}

export function parseCfdi(xml: string): ParsedCfdi {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "Comprobante" || doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("El archivo no es un CFDI válido");
  }
  const attr = (el: Element | undefined, name: string) => el?.getAttribute(name) ?? "";

  const complemento = child(root, "Complemento");
  const timbre = child(complemento, "TimbreFiscalDigital");
  const uuid = attr(timbre, "UUID").toUpperCase();
  if (!uuid) throw new Error("El CFDI no está timbrado (no tiene UUID)");

  const emisor = child(root, "Emisor");
  const receptor = child(root, "Receptor");
  const items: BillItem[] = children(child(root, "Conceptos"), "Concepto").map((c) => ({
    serviceId: attr(c, "ClaveProdServ"),
    description: attr(c, "Descripcion"),
    quantity: num(c.getAttribute("Cantidad")),
    unit: attr(c, "ClaveUnidad"),
    unitId: attr(c, "Unidad"),
    noIdentification: attr(c, "NoIdentificacion"),
    objectImp: attr(c, "ObjetoImp"),
    unitValue: num(c.getAttribute("ValorUnitario")),
    subtotal: num(c.getAttribute("Importe")),
    taxes: taxes(child(c, "Impuestos")),
  }));
  // Los totales de impuestos del comprobante están en su nodo Impuestos directo.
  const impuestos = child(root, "Impuestos");
  const informacionGlobal = child(root, "InformacionGlobal");
  const typeBill = attr(root, "TipoDeComprobante") || "I";
  const exchangeRate = num(root.getAttribute("TipoCambio"));

  return {
    uuid,
    bill: {
      folio: uuid,
      description: items.map((i) => i.description).join(", "),
      date: attr(root, "Fecha"),
      typeBill,
      typePayment: attr(root, "FormaPago") || undefined,
      paymentMethod: attr(root, "MetodoPago") || undefined,
      currency: attr(root, "Moneda") || "MXN",
      version: attr(root, "Version"),
      noCertificate: attr(root, "NoCertificado"),
      rfcEmisor: attr(emisor, "Rfc").toUpperCase(),
      nameEmisor: attr(emisor, "Nombre"),
      rfcReceptor: attr(receptor, "Rfc").toUpperCase(),
      nameReceptor: attr(receptor, "Nombre"),
      postalCodeEmisor: attr(root, "LugarExpedicion"),
      postalCodeReceptor: attr(receptor, "DomicilioFiscalReceptor"),
      useCFDIReceptor: attr(receptor, "UsoCFDI"),
      typeReceptorRegistration: attr(receptor, "RegimenFiscalReceptor"),
      subtotal: num(root.getAttribute("SubTotal")),
      totalTaxesTranslated: num(impuestos?.getAttribute("TotalImpuestosTrasladados")),
      totalTaxesRetention: num(impuestos?.getAttribute("TotalImpuestosRetenidos")),
      total: num(root.getAttribute("Total")),
      count: true,
      items,
      ...(exchangeRate && exchangeRate !== 1 && { exchangeRate }),
      ...(typeBill === "P" && { payments: payments(complemento) }),
      ...(informacionGlobal && {
        globalInfo: {
          periodicidad: attr(informacionGlobal, "Periodicidad"),
          meses: attr(informacionGlobal, "Meses"),
          anio: attr(informacionGlobal, "Año"),
        },
      }),
    },
  };
}
