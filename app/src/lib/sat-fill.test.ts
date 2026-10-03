import { describe, expect, it } from "vitest";
import { computeItem, computeTotals, withTotals } from "./bill-calc";
import { toLegacyBill } from "./sat-fill";
import type { BillDraft } from "./types";

const baseItem = {
  serviceId: "81111600",
  description: "Servicio basico",
  quantity: 1,
  unitValue: 1,
  unit: "E48",
  unitId: "Unidad de servicio",
  noIdentification: "1",
  objectImp: "02",
};

function bill(items: BillDraft["items"]): BillDraft {
  return withTotals({
    date: "2026-10-01",
    typeBill: "I",
    rfcEmisor: "AAAA000101AAA",
    rfcReceptor: "XAXX010101000",
    nameReceptor: "PUBLICO GENERAL",
    postalCodeReceptor: "88240",
    typeReceptorRegistration: "616",
    useCFDIReceptor: "S01",
    subtotal: 0,
    totalTaxesTranslated: 0,
    totalTaxesRetention: 0,
    total: 0,
    count: true,
    items,
  });
}

describe("computeTotals", () => {
  it("suma trasladados y resta retenciones (honorarios con retenciones)", () => {
    const item = computeItem({ ...baseItem, unitValue: 10000 }, { iva: 0.16, retIva: 0.106667, retIsr: 0.1 });
    expect(computeTotals([item])).toEqual({
      subtotal: 10000,
      totalTaxesTranslated: 1600,
      totalTaxesRetention: 2066.67,
      total: 9533.33,
    });
  });
});

describe("toLegacyBill", () => {
  it("genera el mismo formato que el JSON de ejemplo del popup", () => {
    const { entries, errors } = toLegacyBill(bill([computeItem(baseItem, { iva: 0.16, retIva: null, retIsr: null })]));
    expect(errors).toEqual([]);
    expect(entries).toEqual({
      rfc: "XAXX010101000",
      razonSocial: "PUBLICO GENERAL",
      codigoPostal: "88240",
      regimenFiscal: "Sin obligaciones fiscales",
      usoCFDI: "Sin efectos fiscales",
      conceptoDescripcion: "Servicio basico",
      conceptoProducto: "Programadores de computador",
      conceptoUnidad: "Unidad de servicio",
      conceptoCantidad: "1",
      conceptoValor: "1.00",
      conceptoId: "1",
      conceptoImpuesto: "02",
      conceptoIva: "16",
      conceptoRetIva: "00",
      conceptoRetIsr: "00",
      subtotal: "1.00",
      impuestosTrasladados: "0.16",
      impuestosRetenidos: "",
      total: "1.16",
    });
  });

  it("manda las retenciones como porcentaje", () => {
    const { entries } = toLegacyBill(bill([computeItem(baseItem, { iva: 0.16, retIva: 0.106667, retIsr: 0.0125 })]));
    expect(entries).toMatchObject({ conceptoRetIva: "10.6667", conceptoRetIsr: "1.25" });
  });

  it("rechaza facturas con más de un concepto", () => {
    const item = computeItem(baseItem, { iva: 0.16, retIva: null, retIsr: null });
    const { entries, errors } = toLegacyBill(bill([item, item]));
    expect(entries).toBeUndefined();
    expect(errors).toContain("El llenado automático del SAT solo soporta facturas con un concepto.");
  });
});
