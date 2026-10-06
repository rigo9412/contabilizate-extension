import { describe, expect, it } from "vitest";
import { buildTaxes } from "./bill-calc";
import { cashFlows, computeIsr, computeIva, dueDate, extraDays, monthlyDeclaration, previousMonth, resicoRate } from "./resico";
import type { Bill, BillPayment } from "./types";

const RFC = "RAAR941112L88";
const CLIENT = "EKU9003173C9";
const SHOP = "SHO900101AAA";

let seq = 0;
function bill(over: Partial<Bill> & { base?: number; rates?: Parameters<typeof buildTaxes>[1] }): Bill {
  const { base = 10_000, rates = { iva: 0.16, retIva: null, retIsr: null }, ...rest } = over;
  const taxes = buildTaxes(base, rates);
  const translated = taxes.filter((t) => t.section === "traslado").reduce((a, t) => a + t.total, 0);
  const retention = taxes.filter((t) => t.section === "retencion").reduce((a, t) => a + t.total, 0);
  return {
    id: `B${++seq}`,
    updatedAt: 1,
    date: "2026-03-10T10:00:00",
    typeBill: "I",
    paymentMethod: "PUE",
    rfcEmisor: RFC,
    rfcReceptor: CLIENT,
    subtotal: base,
    totalTaxesTranslated: translated,
    totalTaxesRetention: retention,
    total: base + translated - retention,
    count: true,
    items: [{ serviceId: "", description: "", quantity: 1, unit: "", unitId: "", noIdentification: "", objectImp: "02", unitValue: base, subtotal: base, taxes }],
    ...rest,
  };
}

function payment(id: string, relatedUuid: string, p: Partial<BillPayment>): Bill {
  return {
    ...bill({ base: 0 }),
    id,
    typeBill: "P",
    paymentMethod: undefined,
    items: [],
    total: 0,
    payments: [{ date: "2026-03-20T12:00:00", relatedUuid, amountPaid: 0, taxes: [], ...p }],
  };
}

describe("resicoRate", () => {
  it("aplica la tasa del tramo mensual", () => {
    expect(resicoRate(25_000)).toBe(0.01);
    expect(resicoRate(25_000.01)).toBe(0.011);
    expect(resicoRate(83_333.33)).toBe(0.015);
    expect(resicoRate(100_000)).toBe(0.02);
    expect(resicoRate(300_000)).toBe(0.025);
  });
});

describe("cashFlows", () => {
  it("cuenta PUE por fecha y deja PPD pendientes hasta su complemento", () => {
    const pue = bill({});
    const ppd = bill({ paymentMethod: "PPD", base: 5000 });
    const otherMonth = bill({ date: "2026-04-01" });
    const { flows, pending } = cashFlows([pue, ppd, otherMonth], RFC, 2026, 3);
    expect(flows.map((f) => f.billId)).toEqual([pue.id]);
    expect(pending).toEqual([expect.objectContaining({ billId: ppd.id, total: 5800, paid: 0 })]);
  });

  it("cuenta el complemento en el mes del pago, con impuestos del DoctoRelacionado", () => {
    const ppd = bill({ paymentMethod: "PPD", date: "2026-02-15", base: 5000 });
    const p = payment("P1", ppd.id, {
      amountPaid: 2900,
      taxes: buildTaxes(2500, { iva: 0.16, retIva: null, retIsr: null }),
    });
    const { flows, pending } = cashFlows([ppd, p], RFC, 2026, 3);
    expect(flows).toEqual([expect.objectContaining({ source: "complemento", base16: 2500, iva: 400, total: 2900 })]);
    expect(pending[0]).toMatchObject({ paid: 2900, total: 5800 });
  });

  it("prorratea complementos sin impuestos con la factura original", () => {
    const ppd = bill({ paymentMethod: "PPD", date: "2026-02-15", base: 10_000 });
    const p = payment("P1", ppd.id, { amountPaid: 5800 });
    const [flow] = cashFlows([ppd, p], RFC, 2026, 3).flows;
    expect(flow).toMatchObject({ base16: 5000, iva: 800 });
  });

  it("usa gastos PUE como IVA acreditable y resta notas de crédito", () => {
    const gasto = bill({ rfcEmisor: SHOP, rfcReceptor: RFC, base: 1000 });
    const nota = bill({ typeBill: "E", base: 500 });
    const { flows } = cashFlows([gasto, nota], RFC, 2026, 3);
    expect(flows.find((f) => f.kind === "expense")).toMatchObject({ iva: 160 });
    expect(flows.find((f) => f.kind === "expense")?.ineligible).toBeUndefined();
    expect(flows.find((f) => f.source === "nota de crédito")).toMatchObject({ base16: -500, iva: -80 });
  });

  it("marca gastos desmarcados y los que no cumplen requisitos para acreditar", () => {
    const personal = bill({ rfcEmisor: SHOP, rfcReceptor: RFC, count: false });
    const s01 = bill({ rfcEmisor: SHOP, rfcReceptor: RFC, useCFDIReceptor: "S01" });
    const cash = bill({ rfcEmisor: SHOP, rfcReceptor: RFC, typePayment: "01", base: 5000 });
    const smallCash = bill({ rfcEmisor: SHOP, rfcReceptor: RFC, typePayment: "01", base: 1000 });
    const { flows } = cashFlows([personal, s01, cash, smallCash], RFC, 2026, 3);
    expect(flows.find((f) => f.billId === personal.id)).toMatchObject({ excluded: true });
    expect(flows.find((f) => f.billId === s01.id)?.ineligible).toMatch(/S01/);
    expect(flows.find((f) => f.billId === cash.id)?.ineligible).toMatch(/efectivo/);
    expect(flows.find((f) => f.billId === smallCash.id)?.ineligible).toBeUndefined();
    expect(computeIva(flows, 0, true).creditable).toBe(160);
  });

  it("ignora canceladas, excluidas, nómina y pagos de facturas excluidas", () => {
    const excluded = bill({ paymentMethod: "PPD", date: "2026-02-01", count: false });
    const bills = [
      bill({ cancelled: true }),
      bill({ typeBill: "N" }),
      excluded,
      payment("P1", excluded.id, { amountPaid: 100 }),
    ];
    expect(cashFlows(bills, RFC, 2026, 3).flows).toEqual([]);
  });
});

describe("computeIsr / computeIva", () => {
  it("calcula ISR sobre ingresos sin IVA menos la retención de personas morales", () => {
    const b = bill({ base: 30_000, rates: { iva: 0.16, retIva: 0.106667, retIsr: 0.0125 } });
    const { flows } = cashFlows([b], RFC, 2026, 3);
    expect(computeIsr(flows)).toEqual({ income: 30_000, rate: 0.011, tax: 330, retained: 375, due: 0 });
    expect(computeIva(flows)).toMatchObject({ taxed16: 30_000, translated: 4800, retained: 3200.01, result: 1599.99 });
  });

  it("solo acredita el IVA de gastos si se pide", () => {
    const flows = cashFlows([bill({ base: 10_000 }), bill({ rfcEmisor: SHOP, rfcReceptor: RFC, base: 1000 })], RFC, 2026, 3).flows;
    expect(computeIva(flows)).toMatchObject({ creditable: 0, result: 1600 });
    expect(computeIva(flows, 0, true)).toMatchObject({ creditable: 160, result: 1440 });
  });

  it("aplica el saldo a favor anterior solo si hay IVA a cargo", () => {
    const flows = cashFlows([bill({ base: 10_000 })], RFC, 2026, 3).flows;
    expect(computeIva(flows, 500)).toMatchObject({ previousBalance: 500, result: 1100 });
    expect(computeIva(flows, 5000)).toMatchObject({ previousBalance: 1600, result: 0 });
    const favor = cashFlows([bill({ rfcEmisor: SHOP, rfcReceptor: RFC, base: 10_000 })], RFC, 2026, 3).flows;
    expect(computeIva(favor, 500, true)).toMatchObject({ previousBalance: 0, result: -1600 });
  });
});

describe("monthlyDeclaration", () => {
  it("suma ISR e IVA a cargo y avisa si el régimen no es RESICO", () => {
    const d = monthlyDeclaration([bill({ base: 20_000 })], RFC, 2026, 3, { regimen: "612" });
    expect(d.isr.due).toBe(200);
    expect(d.iva.result).toBe(3200);
    expect(d.totalDue).toBe(3400);
    expect(d.warnings.map((w) => w.kind)).toContain("regimen");
  });
});

describe("fechas", () => {
  it("vence el 17 del mes siguiente, recorriendo fines de semana", () => {
    expect(dueDate(2026, 9)).toBe("2026-10-19"); // 17 oct 2026 es sábado.
    expect(dueDate(2026, 12)).toBe("2027-01-18"); // 17 ene 2027 es domingo.
    expect(dueDate(2026, 3)).toBe("2026-04-17");
  });

  it("suma días hábiles según el sexto dígito numérico del RFC", () => {
    expect(extraDays("RAAR941112L88")).toBe(1); // 941112 → 2
    expect(extraDays("RAAR941110L88")).toBe(5); // 0
    expect(extraDays("ABC9411157A1")).toBe(3); // persona moral: 941115 → 5
    expect(dueDate(2026, 3, "RAAR941112L88")).toBe("2026-04-20"); // vie 17 + 1 hábil = lun 20
    expect(dueDate(2026, 3, "RAAR941110L88")).toBe("2026-04-24");
  });

  it("toca declarar el mes anterior", () => {
    expect(previousMonth(new Date(2026, 9, 5))).toEqual({ year: 2026, month: 9 });
    expect(previousMonth(new Date(2027, 0, 5))).toEqual({ year: 2026, month: 12 });
  });
});
