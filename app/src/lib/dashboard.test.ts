import { describe, expect, it } from "vitest";
import { categorySummary } from "./dashboard";
import type { Bill } from "./types";

const bill = (o: Partial<Bill>): Bill =>
  ({
    id: Math.random().toString(),
    updatedAt: 0,
    date: "2026-03-10",
    typeBill: "I",
    rfcEmisor: "AAA010101AAA",
    rfcReceptor: "ME",
    subtotal: 0,
    totalTaxesTranslated: 0,
    totalTaxesRetention: 0,
    total: 100,
    count: true,
    items: [],
    ...o,
  }) as Bill;

describe("categorySummary", () => {
  it("agrupa gastos por emisor y junta el resto en Otros", () => {
    const bills = [
      bill({ nameEmisor: "Uno", total: 300 }),
      bill({ nameEmisor: "Uno", total: 200 }),
      bill({ rfcEmisor: "B", total: 50 }),
      bill({ rfcEmisor: "C", total: 10 }),
      bill({ rfcEmisor: "ME", rfcReceptor: "X", total: 999 }), // ingreso, no cuenta
    ];
    const r = categorySummary(bills, "ME", 2026, "expenses", 2);
    expect(r.map((s) => [s.name, s.total, s.count])).toEqual([
      ["Uno", 500, 2],
      ["B", 50, 1],
      ["Otros (1)", 10, 1],
    ]);
  });

  it("agrupa ingresos por cliente", () => {
    const r = categorySummary([bill({ rfcEmisor: "ME", rfcReceptor: "CLI", nameReceptor: "Cliente" })], "ME", 2026, "incomes");
    expect(r).toEqual([{ key: "CLI", name: "Cliente", total: 100, count: 1 }]);
  });
});
