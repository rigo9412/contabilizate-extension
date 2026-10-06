import { describe, expect, it } from "vitest";
import { analyzeSpending, categorize, categorySlices, merchantKey, statementMonth } from "./spending-analysis";
import type { CardMovement, CardStatement } from "./types";

function statement(periodEnd: string, movements: [string, string, number][], bank = "BBVA"): CardStatement {
  const start = new Date(`${periodEnd}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 30);
  return {
    id: `${bank}-1234-${periodEnd}`,
    updatedAt: 0,
    bank,
    cardName: "TARJETA ORO BBVA",
    cardLast4: "1234",
    periodStart: start.toISOString().slice(0, 10),
    periodEnd,
    totalCharges: 0,
    totalPayments: 0,
    movements: movements.map(([date, description, amount]): CardMovement => ({ date, chargeDate: date, description, amount })),
  };
}

describe("categorize", () => {
  it.each([
    ["OXXO FRONTERA DE NL", "conveniencia"],
    ["OXXO GAS SUC 12", "transporte"],
    ["D LOCAL*REST RAPPI", "delivery"],
    ["MC DONALD S NVO LAREDO", "comida"],
    ["APPLE.COM/BILL", "suscripciones"],
    ["APPLEBEES TAMPICO", "comida"],
    ["STRIPE *AMAZON", "linea"],
    ["WAL MART AV REFORMA", "super"],
    ["SMART FIT", "personal"],
    ["BMOVIL.PAGO TDC", "pagos"],
    ["NETPAY *MACRO SERVICIO", "otros"],
  ])("%s → %s", (description, key) => {
    expect(categorize(description).key).toBe(key);
  });
});

it("statementMonth toma el mes donde cae la mitad del periodo", () => {
  expect(statementMonth({ periodStart: "2025-12-04", periodEnd: "2026-01-03" })).toBe("2025-12");
  expect(statementMonth({ periodStart: "2025-11-25", periodEnd: "2025-12-25" })).toBe("2025-12");
});

it("merchantKey quita números de sucursal", () => {
  expect(merchantKey("Farm Guadalajara 527")).toBe("FARM GUADALAJARA");
});

describe("analyzeSpending", () => {
  const oxxo = (date: string): [string, string, number] => [date, "OXXO CENTRO 1", 80];
  const statements = [
    statement("2025-11-03", [
      ["2025-10-10", "NETFLIX.COM", 219],
      ["2025-10-11", "BMOVIL.PAGO TDC", -5000],
      ["2025-10-12", "DLO*RAPPI MX", 300],
      ["2025-10-15", "BURGER KING 3", 400],
      oxxo("2025-10-16"), oxxo("2025-10-17"), oxxo("2025-10-18"),
    ]),
    statement("2025-12-03", [
      ["2025-11-10", "NETFLIX.COM", 219],
      ["2025-11-12", "DLO*RAPPI MX", 300],
      ["2025-11-14", "BURGER KING 3", 1200],
      oxxo("2025-11-16"), oxxo("2025-11-17"), oxxo("2025-11-18"),
    ]),
  ];
  const result = analyzeSpending(statements);

  it("ignora los pagos y promedia por estado de cuenta", () => {
    expect(result.periods).toBe(2);
    expect(result.totalSpent).toBe(219 * 2 + 300 * 2 + 1600 + 80 * 6);
    expect(result.perPeriod).toBe(result.totalSpent / 2);
  });

  it("detecta gastos hormiga sin contar comida ni suscripciones", () => {
    expect(result.hormiga).toMatchObject({ count: 6, total: 480, perPeriod: 240 });
    expect(result.hormiga.topMerchants[0]).toMatchObject({ merchant: "OXXO CENTRO", count: 6 });
  });

  it("detecta cargos recurrentes y suscripciones", () => {
    expect(result.recurring).toEqual([
      { merchant: "DLO*RAPPI MX", category: "Comida a domicilio", amount: 300, periods: 2, subscription: false },
      { merchant: "OXXO CENTRO", category: "Tiendas de conveniencia", amount: 240, periods: 2, subscription: false },
      { merchant: "NETFLIX.COM", category: "Suscripciones digitales", amount: 219, periods: 2, subscription: true },
    ]);
  });

  it("compara el último periodo contra el promedio", () => {
    const food = result.categories.find((c) => c.key === "comida");
    expect(food).toMatchObject({ total: 1600, perPeriod: 800, last: 1200, previousAverage: 400 });
  });

  it("recomienda dónde ahorrar, de mayor a menor ahorro", () => {
    expect(result.recommendations.map((r) => r.id)).toEqual(["comida", "suscripciones", "delivery"]);
    expect(result.potentialSaving).toBe(240 + 120);
  });

  it("agrupa el gasto por día de la semana", () => {
    // El pago del 2025-10-11 no cuenta.
    expect(result.byWeekday.reduce((a, d) => a + d.count, 0)).toBe(12);
  });

  it("junta las categorías chicas en Otras", () => {
    expect(categorySlices(result.categories, 2).at(-1)).toMatchObject({ key: "__otros", name: "Otras (2)" });
  });

  it("cuenta las tarjetas del mismo mes como un solo periodo", () => {
    const both = analyzeSpending([
      statement("2026-01-03", [["2025-12-10", "OXXO CENTRO", 100]]),
      statement("2025-12-25", [["2025-12-12", "OXXO CENTRO", 100]], "Nu"),
    ]);
    expect(both).toMatchObject({ periods: 1, perPeriod: 200 });
  });

  it("aprende la categoría del banco de estados de cuenta anteriores", () => {
    const old = statement("2025-12-25", [["2025-12-01", "Mta Nvo Reforma", 100]], "Nu");
    old.movements[0].bankCategory = "Supermercado";
    const latest = statement("2026-09-24", [["2026-09-01", "Mta Nvo Reforma", 300]], "Nu");
    expect(analyzeSpending([latest], [latest, old]).categories[0].key).toBe("super");
    expect(analyzeSpending([latest]).categories[0].key).toBe("otros");
    const extra = statement("2026-09-24", [["2026-09-02", "Mta Nvo Reforma Serv D", 50]], "Nu");
    expect(analyzeSpending([extra], [extra, old]).categories[0].key).toBe("super");
  });

  it("recomienda comprar el súper una vez por semana si vas muy seguido", () => {
    const visits = Array.from({ length: 10 }, (_, i): [string, string, number] => [`2025-10-${String(i + 10)}`, "HEB NUEVO LAREDO", 300]);
    const r = analyzeSpending([statement("2025-11-03", visits)]).recommendations.find((x) => x.id === "super");
    expect(r?.monthlySaving).toBe(450);
  });

  it("separa la anualidad y el seguro y los convierte en recomendaciones", () => {
    const result = analyzeSpending([
      statement("2025-11-03", [
        ["2025-10-10", "ADMINISTRACION TARJ. TITULAR", 1200],
        ["2025-10-11", "APP GNP MOVIL", 12000],
      ]),
    ]);
    expect(result.categories.map((c) => c.key).sort()).toEqual(["comisiones", "seguros"]);
    expect(result.recommendations.find((r) => r.id === "comisiones")?.monthlySaving).toBe(100);
    expect(result.recommendations.find((r) => r.id === "seguros")?.detail).toContain("$1,000 al mes");
    expect(result.hormiga.count).toBe(0);
  });
});
