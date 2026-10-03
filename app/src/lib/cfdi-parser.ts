// Convierte el XML de un CFDI (3.3 o 4.0) en una factura de la base local.
// Port de src/features/sat/mapper.ts de la web, con DOMParser en vez de cfdi-to-json.
import { TYPE_TAXES_RETENTION, TYPE_TAXES_TRASLATE } from "./catalogs";
import type { BillDraft, BillItem, BillTax } from "./types";

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

export function parseCfdi(xml: string): ParsedCfdi {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  if (!root || root.localName !== "Comprobante" || doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("El archivo no es un CFDI válido");
  }
  const attr = (el: Element | undefined, name: string) => el?.getAttribute(name) ?? "";

  const timbre = child(child(root, "Complemento"), "TimbreFiscalDigital");
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

  return {
    uuid,
    bill: {
      folio: uuid,
      description: items.map((i) => i.description).join(", "),
      date: attr(root, "Fecha"),
      typeBill: attr(root, "TipoDeComprobante") || "I",
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
