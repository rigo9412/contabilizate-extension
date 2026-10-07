import { describe, expect, it } from "vitest";
import type { CardSeries } from "./card-movements";
import type { MonthSummary } from "./dashboard";
import { baseline, buildPlan, compareToPlan, fixedIncomeMonthly, suggestGoals, trailingMonths } from "./savings-plan";

function summary(incomes: number[]): MonthSummary[] {
  return incomes.map((i, idx) => ({ month: idx + 1, label: "", incomes: i, expenses: 0, taxesTranslated: 0, taxesRetention: 0 }));
}

describe("trailingMonths", () => {
  it("toma los meses completos previos, cruzando de año, sin el mes en curso", () => {
    const s = new Map([[2026, summary([0, 0, 0, 0, 0, 0, 0, 0, 100, 200, 0, 0])], [2025, summary([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50])]]);
    const cards = new Map<number, CardSeries[]>([[2026, [{ key: "a", label: "a", months: [10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }]]]);
    const h = trailingMonths(s, cards, new Date(2026, 9, 15), 12); // octubre 2026
    expect(h).toHaveLength(12);
    expect(h[0]).toMatchObject({ year: 2025, month: 10 });
    expect(h[11]).toMatchObject({ year: 2026, month: 9, income: 100 });
    expect(h.find((m) => m.year === 2025 && m.month === 12)?.income).toBe(50);
    expect(h.find((m) => m.year === 2026 && m.month === 1)?.spent).toBe(10);
  });
});

describe("baseline", () => {
  it("promedia solo los meses con movimientos", () => {
    const b = baseline([
      { year: 2026, month: 1, label: "Ene", income: 0, spent: 0 },
      { year: 2026, month: 2, label: "Feb", income: 1000, spent: 400 },
      { year: 2026, month: 3, label: "Mar", income: 2000, spent: 600 },
    ]);
    expect(b).toMatchObject({ months: 2, avgIncome: 1500, avgSpent: 500, avgSaving: 1000, minIncome: 1000 });
  });
  it("sin datos devuelve ceros", () => {
    expect(baseline([]).months).toBe(0);
  });
});

describe("buildPlan", () => {
  it("calcula la cuota necesaria y si alcanza", () => {
    const p = buildPlan({ target: 12000, saved: 0, deadlineMonths: 12, income: 5000, spent: 3500 });
    expect(p.requiredMonthly).toBe(1000);
    expect(p.requiredRate).toBe(20);
    expect(p.feasible).toBe(true);
    expect(p.monthsAtCurrentPace).toBe(8);
    expect(p.gap).toBe(0);
    expect(p.points.at(-1)?.atPlan).toBe(12000);
  });
  it("marca el faltante cuando no alcanza", () => {
    const p = buildPlan({ target: 12000, saved: 2000, deadlineMonths: 5, income: 5000, spent: 4500 });
    expect(p.requiredMonthly).toBe(2000);
    expect(p.feasible).toBe(false);
    expect(p.gap).toBe(1500);
    expect(p.monthsAtCurrentPace).toBe(20);
  });
  it("sin margen nunca llega", () => {
    const p = buildPlan({ target: 1000, saved: 0, deadlineMonths: 6, income: 1000, spent: 1200 });
    expect(p.monthsAtCurrentPace).toBeNull();
    expect(p.available).toBe(-200);
  });
  it("meta ya cumplida", () => {
    const p = buildPlan({ target: 1000, saved: 1500, deadlineMonths: 6, income: 0, spent: 0 });
    expect(p.remaining).toBe(0);
    expect(p.monthsAtCurrentPace).toBe(0);
    expect(p.requiredRate).toBeNull();
  });
});

describe("suggestGoals", () => {
  it("sugiere fondo de emergencia y % de ingreso", () => {
    const g = suggestGoals({ months: 6, avgIncome: 10000, avgSpent: 6000, avgSaving: 4000, minIncome: 8000 });
    expect(g.map((x) => x.key)).toEqual(["fund3", "fund6", "rate10", "rate20"]);
    expect(g[0].target).toBe(18000);
    expect(g[3].target).toBe(24000);
  });
  it("sin datos no sugiere nada", () => {
    expect(suggestGoals(baseline([]))).toEqual([]);
  });
});

describe("compareToPlan", () => {
  const data: Record<string, [number, number]> = { "2026-6": [5000, 3500], "2026-7": [5000, 4500], "2026-8": [5000, 3000] };
  const lookup = (year: number, month: number) => {
    const [income, spent] = data[`${year}-${month}`] ?? [0, 0];
    return { year, month, label: "", income, spent };
  };
  const plan = { target: 12000, initialSaved: 0, startMonth: "2026-06", deadlineMonths: 12, monthlyGoal: 1000 };

  it("acumula lo real contra el plan y deja el mes en curso fuera de los totales", () => {
    const c = compareToPlan(plan, lookup, new Date(2026, 7, 10)); // agosto en curso
    expect(c.rows.map((r) => r.inProgress)).toEqual([false, false, true]);
    expect(c.elapsed).toBe(2);
    expect(c.cumulativeActual).toBe(2000); // 1500 + 500
    expect(c.cumulativePlanned).toBe(2000);
    expect(c.status).toBe("ahead");
    expect(c.remainingMonths).toBe(10);
    expect(c.catchUpMonthly).toBe(1000);
    expect(c.monthsAtActualPace).toBe(10);
  });
  it("detecta el atraso y recalcula la cuota", () => {
    const c = compareToPlan({ ...plan, monthlyGoal: 1500 }, lookup, new Date(2026, 7, 10));
    expect(c.status).toBe("behind");
    expect(c.diff).toBe(-1000);
    expect(c.catchUpMonthly).toBe(1000);
  });
  it("antes del primer mes cerrado no hay comparación", () => {
    const c = compareToPlan(plan, lookup, new Date(2026, 5, 10));
    expect(c.status).toBe("none");
    expect(c.elapsed).toBe(0);
  });
  it("no pasa del plazo", () => {
    const c = compareToPlan({ ...plan, deadlineMonths: 2 }, lookup, new Date(2027, 0, 1));
    expect(c.rows).toHaveLength(2);
    expect(c.remainingMonths).toBe(0);
    expect(c.catchUpMonthly).toBeNull();
  });
});

describe("fixedIncomeMonthly", () => {
  it("lleva cada frecuencia a su equivalente mensual", () => {
    expect(
      fixedIncomeMonthly([
        { id: "1", name: "Sueldo", amount: 10000, frequency: "quincenal" },
        { id: "2", name: "Renta", amount: 3000, frequency: "mensual" },
        { id: "3", name: "Aguinaldo", amount: 12000, frequency: "anual" },
        { id: "4", name: "Semanal", amount: 1200, frequency: "semanal" },
      ]),
    ).toBe(20000 + 3000 + 1000 + 5200);
  });
  it("sin ingresos fijos es 0", () => {
    expect(fixedIncomeMonthly(undefined)).toBe(0);
  });
});
