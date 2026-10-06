import { describe, expect, it } from "vitest";
import { TAXES_IVA, TYPE_TAXES_TRASLATE } from "./catalogs";
import { computeItem, formatTax, ratesOf } from "./bill-calc";
import type { BillTax } from "./types";

const baseItem = {
  serviceId: "84121500",
  description: "INTERESES EXENTOS",
  quantity: 1,
  unitValue: 347.09,
  unit: "E48",
  unitId: "Unidad de servicio",
  noIdentification: "",
  objectImp: "02",
};

describe("IVA exento", () => {
  const exempt: BillTax = { type: TAXES_IVA, section: TYPE_TAXES_TRASLATE, base: 347.09, total: 0, porcentageOrValue: "Exento" };

  it("conserva el exento al recalcular el concepto", () => {
    const rates = ratesOf({ taxes: [exempt] });
    expect(rates).toMatchObject({ iva: null, ivaExempt: true });
    expect(computeItem(baseItem, rates).taxes).toEqual([exempt]);
  });

  it("muestra el impuesto sin NaN", () => {
    expect(formatTax(exempt)).toBe("IVA exento");
    expect(formatTax({ ...exempt, porcentageOrValue: "Tasa", factor: "0.160000", total: 55.53 })).toBe("+16%");
  });
});
