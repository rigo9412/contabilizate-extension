// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { parseCfdi } from "./cfdi-parser";
import { monthlySummary } from "./dashboard";
import type { Bill } from "./types";

const XML = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" Fecha="2026-03-16T10:20:30" FormaPago="03" NoCertificado="00001000000500000000" SubTotal="7200.00"
  Moneda="MXN" Total="7302.24" TipoDeComprobante="I" Exportacion="01" MetodoPago="PUE" LugarExpedicion="88240">
  <cfdi:Emisor Rfc="RAAR941112L88" Nombre="RIGOBERTO RAMOS APARICIO" RegimenFiscal="626"/>
  <cfdi:Receptor Rfc="TNM140723GFA" Nombre="TECNOLOGICO NACIONAL DE MEXICO" DomicilioFiscalReceptor="03330"
    RegimenFiscalReceptor="603" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="81111600" NoIdentificacion="1" Cantidad="1" ClaveUnidad="E48" Unidad="Unidad de servicio"
      Descripcion="Apoyo a la educación del 2026-03-01 al 2026-03-15" ValorUnitario="7200.00" Importe="7200.00" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados><cfdi:Traslado Base="7200.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.080000" Importe="576.00"/></cfdi:Traslados>
        <cfdi:Retenciones>
          <cfdi:Retencion Base="7200.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.053300" Importe="383.76"/>
          <cfdi:Retencion Base="7200.00" Impuesto="001" TipoFactor="Tasa" TasaOCuota="0.012500" Importe="90.00"/>
        </cfdi:Retenciones>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosRetenidos="473.76" TotalImpuestosTrasladados="576.00"/>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="ab12cd34-0000-4000-8000-1234567890ab" FechaTimbrado="2026-03-16T10:21:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

describe("parseCfdi", () => {
  it("lee comprobante, emisor, receptor, conceptos e impuestos", () => {
    const { uuid, bill } = parseCfdi(XML);
    expect(uuid).toBe("AB12CD34-0000-4000-8000-1234567890AB");
    expect(bill).toMatchObject({
      date: "2026-03-16T10:20:30",
      typeBill: "I",
      rfcEmisor: "RAAR941112L88",
      nameEmisor: "RIGOBERTO RAMOS APARICIO",
      rfcReceptor: "TNM140723GFA",
      typeReceptorRegistration: "603",
      useCFDIReceptor: "G03",
      subtotal: 7200,
      totalTaxesTranslated: 576,
      totalTaxesRetention: 473.76,
      total: 7302.24,
    });
    expect(bill.items).toHaveLength(1);
    expect(bill.items[0]).toMatchObject({ serviceId: "81111600", unit: "E48", unitValue: 7200 });
    expect(bill.items[0].taxes.map((t) => [t.type, t.section, t.factor, t.total])).toEqual([
      ["002", "traslado", "0.080000", 576],
      ["002", "retencion", "0.053300", 383.76],
      ["001", "retencion", "0.012500", 90],
    ]);
  });

  it("rechaza archivos que no son CFDI o no están timbrados", () => {
    expect(() => parseCfdi("<html/>")).toThrow("no es un CFDI válido");
    expect(() => parseCfdi(XML.replace(/<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, ""))).toThrow("no está timbrado");
  });
});

describe("monthlySummary", () => {
  const RFC = "RAAR941112L88";
  const base = { id: "x", updatedAt: 1, count: true, items: [], subtotal: 0, totalTaxesTranslated: 0, totalTaxesRetention: 0 };
  const bills = [
    { ...base, date: "2026-03-16T10:20:30", typeBill: "I", rfcEmisor: RFC, rfcReceptor: "TNM140723GFA", total: 7302.24, totalTaxesTranslated: 576 },
    { ...base, date: "2026-03-20", typeBill: "I", rfcEmisor: "OTRO000101AAA", rfcReceptor: RFC, total: 500 },
    { ...base, date: "2026-03-21", typeBill: "I", rfcEmisor: RFC, rfcReceptor: "X", total: 1000, cancelled: true },
    { ...base, date: "2026-04-01", typeBill: "I", rfcEmisor: RFC, rfcReceptor: "X", total: 200, count: false },
    { ...base, date: "2025-03-01", typeBill: "I", rfcEmisor: RFC, rfcReceptor: "X", total: 999 },
  ] as Bill[];

  it("suma ingresos y gastos por mes, sin canceladas ni excluidas", () => {
    const months = monthlySummary(bills, RFC, 2026);
    expect(months[2]).toMatchObject({ label: "Mar", incomes: 7302.24, expenses: 500, taxesTranslated: 576 });
    expect(months[3]).toMatchObject({ incomes: 0, expenses: 0 });
    expect(monthlySummary(bills, RFC, 2025)[2].incomes).toBe(999);
  });
});
