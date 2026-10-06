import { describe, expect, it } from "vitest";
import { buildFillPlan, compareValues, parseAcuse, parseAmount, portalValues, PORTAL_FIELDS } from "./sat-declaration";
import type { IsrResico, IvaResico } from "./types";

const isr: IsrResico = { income: 30_000, rate: 0.011, tax: 330, retained: 375, due: 0 };
const iva: IvaResico = {
  taxed16: 30_000,
  taxed8: 0,
  taxed0: 0,
  exempt: 0,
  notObject: 0,
  translated: 4800,
  creditable: 300,
  retained: 3200.01,
  previousBalance: 0,
  result: 1299.99,
};

describe("portalValues", () => {
  it("tiene un valor por cada campo del portal, con la tasa en porcentaje", () => {
    const values = portalValues(isr, iva);
    expect(Object.keys(values).sort()).toEqual(PORTAL_FIELDS.map((f) => f.key).sort());
    expect(values["isr.tasa"]).toBe(1.1);
    expect(portalValues(isr, { ...iva, result: -50 })["iva.resultado"]).toBe(50);
  });
});

describe("compareValues", () => {
  it("marca diferencias y campos no encontrados", () => {
    const diffs = compareValues({ "isr.ingresos": 25_000, "isr.retenido": null }, portalValues(isr, iva));
    expect(diffs.find((d) => d.key === "isr.ingresos")).toMatchObject({ sat: 25_000, ours: 30_000, diff: 5000 });
    expect(diffs.find((d) => d.key === "isr.retenido")).toMatchObject({ sat: null, diff: null });
  });
});

describe("parseAmount", () => {
  it("entiende el formato del portal", () => {
    expect(parseAmount("$ 1,234.50")).toBe(1234.5);
    expect(parseAmount("1.10 %")).toBe(1.1);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("N/A")).toBeNull();
  });
});

describe("parseAcuse", () => {
  it("lee número de operación, línea de captura, importe y vigencia", () => {
    const text = `ACUSE DE RECIBO
      Número de operación: 260312345678
      Importe total a pagar: $ 1,300
      Línea de captura: 0426 0ABC 1234 5678 9012
      Vigente hasta: 31/10/2026`;
    expect(parseAcuse(text)).toEqual({
      operationNumber: "260312345678",
      amountDue: 1300,
      captureLine: "04260ABC123456789012",
      captureLineDueDate: "2026-10-31",
    });
  });

  it("regresa null si la página no es un acuse", () => {
    expect(parseAcuse("Datos iniciales Ejercicio Periodicidad")).toBeNull();
  });
});

describe("buildFillPlan", () => {
  // Caso del tutorial: el SAT prellenó menos ingreso y menos retención de lo cobrado.
  const ours = portalValues({ income: 139_700.4, rate: 0.02, tax: 2794, retained: 778.2, due: 2016 }, { ...iva, retained: 6634, creditable: 1170 });

  it("suma la diferencia de ingresos y de ISR retenido, en pesos enteros", () => {
    const plan = buildFillPlan({ "isr.ingresos": 136_000, "isr.retenido": 709 }, ours, "honorarios");
    expect(plan.isr).toEqual({
      income: 139_700,
      incomeToAdd: 3700,
      incomeToRemove: 0,
      activityOptions: ["honorarios", "servicios profesionales"],
      retainedToAdd: 69,
    });
  });

  it("pide a mano cuando el SAT prellenó de más", () => {
    expect(buildFillPlan({ "isr.ingresos": 150_000 }, ours).isr).toMatchObject({ incomeToAdd: 0, incomeToRemove: 10_300 });
  });

  it("escribe directo los renglones de IVA con valor y deja el acreditable para Capturar", () => {
    const plan = buildFillPlan({ "iva.retenido": 6800 }, ours);
    expect(plan.iva.direct.map((f) => [f.key, f.value])).toEqual([
      ["iva.gravados16", 30_000],
      ["iva.retenido", 6634],
    ]);
    expect(plan.iva.creditable).toBe(1170);
  });
});
