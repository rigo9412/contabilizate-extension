import { describe, expect, it } from "vitest";
import { fromLegacyJson, legacyJsonFromStorage, parseLegacyJson, parseLegacyText } from "./legacy-import";
import { toLegacyBill } from "./sat-fill";

const TECNM = {
  rfc: "TNM140723GFA",
  razonSocial: "TECNOLOGICO NACIONAL DE MEXICO",
  codigoPostal: "03330",
  regimenFiscal: "Personas Morales con Fines no Lucrativos",
  usoCFDI: "Gastos en general",
  concepto: {
    descripcion: "Apoyo a la educación como Coordinador de Desarrollo de Sistemas",
    producto: "Programadores de computador",
    unidad: "Unidad de servicio",
    cantidad: "1",
    valor: "7200",
    id: "1",
    impuesto: "02",
    iva: "8",
    retIva: "5.33",
    retIsr: "1.25",
  },
  total: "7392.24",
  subtotal: "7200.00",
  impuestosTrasladados: "576.00",
  impuestosRetenidos: "383.76",
};

describe("fromLegacyJson", () => {
  it("convierte los textos del popup a claves de catálogo", () => {
    const { bill } = fromLegacyJson(TECNM, { rfc: "AAAA000101AAA" });
    expect(bill).toMatchObject({
      rfcEmisor: "AAAA000101AAA",
      rfcReceptor: "TNM140723GFA",
      typeReceptorRegistration: "603",
      useCFDIReceptor: "G03",
    });
    expect(bill.items[0]).toMatchObject({ serviceId: "81111600", unit: "E48", unitValue: 7200, subtotal: 7200 });
  });

  it("al volver a emitirla manda al SAT los mismos campos que el JSON original", () => {
    const { entries } = toLegacyBill(fromLegacyJson(TECNM).bill);
    expect(entries).toMatchObject({
      rfc: TECNM.rfc,
      razonSocial: TECNM.razonSocial,
      codigoPostal: TECNM.codigoPostal,
      regimenFiscal: TECNM.regimenFiscal,
      usoCFDI: TECNM.usoCFDI,
      conceptoProducto: "Programadores de computador",
      conceptoUnidad: "Unidad de servicio",
      conceptoIva: "8",
      conceptoRetIva: "5.33",
      conceptoRetIsr: "1.25",
      subtotal: "7200.00",
      impuestosTrasladados: "576.00",
    });
  });

  it("avisa cuando los totales del JSON no cuadran con las tasas", () => {
    // 5.33% de 7200 = 383.76; con la retención de ISR del 1.25% serían 473.76.
    const { warnings, bill } = fromLegacyJson(TECNM);
    expect(bill.totalTaxesRetention).toBe(473.76);
    expect(warnings).toEqual([
      "Impuestos retenidos: el JSON dice 383.76 pero con las tasas da 473.76.",
      "Total: el JSON dice 7392.24 pero con las tasas da 7302.24.",
    ]);
  });

  it("trata 00 en retenciones como que no aplican", () => {
    const { bill, warnings } = fromLegacyJson({
      ...TECNM,
      concepto: { ...TECNM.concepto, retIva: "00", retIsr: "00", iva: "16" },
      impuestosTrasladados: "1152.00",
      impuestosRetenidos: "",
      total: "8352.00",
    });
    expect(bill.items[0].taxes).toHaveLength(1);
    expect(warnings).toEqual([]);
  });

  it("conserva textos que no están en el catálogo y lo avisa", () => {
    const { bill, warnings } = fromLegacyJson({ ...TECNM, regimenFiscal: "Régimen inventado" });
    expect(bill.typeReceptorRegistration).toBe("Régimen inventado");
    expect(warnings[0]).toContain('No se encontró "Régimen inventado"');
  });
});

describe("parseLegacyJson", () => {
  it("acepta un objeto o una lista", () => {
    expect(parseLegacyJson(JSON.stringify(TECNM))).toHaveLength(1);
    expect(parseLegacyJson(JSON.stringify([TECNM, TECNM]))).toHaveLength(2);
    expect(() => parseLegacyJson("{}")).toThrow("formato de plantilla");
    expect(() => parseLegacyJson("nope")).toThrow("JSON válido");
  });
});

describe("legacyJsonFromStorage", () => {
  it("reconstruye el JSON desde chrome.storage del popup", () => {
    const json = legacyJsonFromStorage({ rfc: "X", razonSocial: "Y", conceptoDescripcion: "Z", conceptoIva: "16" });
    expect(json).toMatchObject({ rfc: "X", razonSocial: "Y", concepto: { descripcion: "Z", iva: "16" } });
    expect(legacyJsonFromStorage({ passwordCertificado: "x" })).toBeNull();
  });
});

describe("parseLegacyCsv", () => {
  it("lee la plantilla CSV del popup, una plantilla por fila", () => {
    const csv = [
      "rfc,razonSocial,codigoPostal,regimenFiscal,usoCFDI,conceptoDescripcion,conceptoProducto,conceptoUnidad,conceptoCantidad,conceptoValor,conceptoId,conceptoImpuesto,conceptoIva,conceptoRetIva,conceptoRetIsr,total,subtotal,impuestosTrasladados,impuestosRetenidos",
      'XAXX010101000,PUBLICO GENERAL,88240,Sin obligaciones fiscales,Sin efectos fiscales.,"Servicio, basico",Programadores de computador,Unidad de servicio,1,1.00,1,02,16,0,0,1.16,1.00,0.16,0.00',
      "TNM140723GFA,TECNM,03330,Personas Morales con Fines no Lucrativos,Gastos en general,Apoyo,Programadores de computador,Unidad de servicio,1,7200,1,02,8,5.33,0,7392.24,7200.00,576.00,383.76",
    ].join("\r\n");
    const list = parseLegacyText(csv);
    expect(list).toHaveLength(2);
    expect(list[0].concepto?.descripcion).toBe("Servicio, basico");
    const { bill, warnings } = fromLegacyJson(list[1]);
    expect(warnings).toEqual([]);
    expect(bill.total).toBe(7392.24);
  });
});
