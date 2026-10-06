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

const PAGO20 = `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Fecha="2026-04-05T09:00:00" SubTotal="0"
  Moneda="XXX" Total="0" TipoDeComprobante="P" Exportacion="01" LugarExpedicion="88240">
  <cfdi:Emisor Rfc="RAAR941112L88" Nombre="RIGOBERTO RAMOS APARICIO" RegimenFiscal="626"/>
  <cfdi:Receptor Rfc="EKU9003173C9" Nombre="ESCUELA KEMPER URGATE" DomicilioFiscalReceptor="42501" RegimenFiscalReceptor="601" UsoCFDI="CP01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales MontoTotalPagos="5675.00"/>
      <pago20:Pago FechaPago="2026-04-03T12:00:00" FormaDePagoP="03" MonedaP="MXN" TipoCambioP="1" Monto="5675.00">
        <pago20:DoctoRelacionado IdDocumento="aaaa1111-0000-4000-8000-000000000001" MonedaDR="MXN" EquivalenciaDR="1"
          NumParcialidad="1" ImpSaldoAnt="11350.00" ImpPagado="5675.00" ImpSaldoInsoluto="5675.00" ObjetoImpDR="02">
          <pago20:ImpuestosDR>
            <pago20:RetencionesDR>
              <pago20:RetencionDR BaseDR="5000.00" ImpuestoDR="001" TipoFactorDR="Tasa" TasaOCuotaDR="0.012500" ImporteDR="62.50"/>
            </pago20:RetencionesDR>
            <pago20:TrasladosDR>
              <pago20:TrasladoDR BaseDR="5000.00" ImpuestoDR="002" TipoFactorDR="Tasa" TasaOCuotaDR="0.160000" ImporteDR="800.00"/>
            </pago20:TrasladosDR>
          </pago20:ImpuestosDR>
        </pago20:DoctoRelacionado>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital Version="1.1" UUID="bbbb2222-0000-4000-8000-000000000002" FechaTimbrado="2026-04-05T09:01:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

describe("parseCfdi · complemento de pago", () => {
  it("lee los documentos pagados con sus impuestos proporcionales", () => {
    const { bill } = parseCfdi(PAGO20);
    expect(bill.typeBill).toBe("P");
    expect(bill.payments).toEqual([
      {
        date: "2026-04-03T12:00:00",
        relatedUuid: "AAAA1111-0000-4000-8000-000000000001",
        amountPaid: 5675,
        partiality: 1,
        taxes: [
          { type: "002", section: "traslado", base: 5000, total: 800, porcentageOrValue: "Tasa", factor: "0.160000" },
          { type: "001", section: "retencion", base: 5000, total: 62.5, porcentageOrValue: "Tasa", factor: "0.012500" },
        ],
      },
    ]);
  });

  it("lee complementos 1.0 (sin impuestos) y convierte a pesos", () => {
    const xml = PAGO20.replace(/pago20/g, "pago10")
      .replace('Version="2.0"', 'Version="1.0"')
      .replace('MonedaP="MXN" TipoCambioP="1" Monto="5675.00"', 'MonedaP="USD" TipoCambioP="20" Monto="100"')
      .replace('MonedaDR="MXN" EquivalenciaDR="1"', 'MonedaDR="USD"')
      .replace('ImpPagado="5675.00"', 'ImpPagado="100"')
      .replace(/<pago10:ImpuestosDR>[\s\S]*<\/pago10:ImpuestosDR>/, "");
    const [payment] = parseCfdi(xml).bill.payments!;
    expect(payment).toMatchObject({ amountPaid: 2000, taxes: [] });
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
