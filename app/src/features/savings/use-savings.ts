import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { monthlyCardPayments } from "@/lib/card-movements";
import { monthlySummary } from "@/lib/dashboard";
import { alive, db, PROFILE_ID, SAVINGS_PLAN_ID } from "@/lib/db";
import { baseline, compareToPlan, fixedIncomeMonthly, monthData, parseMonthKey, trailingMonths } from "@/lib/savings-plan";

const FORM_KEY = "savings-plan";

/** Borrador del formulario de meta; vive en el navegador y lo comparten el inicio y la página del plan. */
export interface GoalForm {
  name: string;
  target: string;
  saved: string;
  deadline: string;
  income: string;
  spent: string;
}

export const EMPTY_GOAL: GoalForm = { name: "", target: "", saved: "0", deadline: "12", income: "", spent: "" };

export function loadGoalForm(): GoalForm {
  try {
    return { ...EMPTY_GOAL, ...JSON.parse(localStorage.getItem(FORM_KEY) ?? "{}") };
  } catch {
    return EMPTY_GOAL;
  }
}

export function saveGoalForm(form: GoalForm) {
  try {
    localStorage.setItem(FORM_KEY, JSON.stringify(form));
  } catch {
    // Sin almacenamiento: el borrador solo vale para esta sesión.
  }
}

/** Datos reales + plan guardado + comparación mes a mes, para el inicio y la página del plan. */
export function useSavings() {
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID));
  const bills = useLiveQuery(async () => alive(await db.bills.toArray()), [], []);
  const statements = useLiveQuery(async () => alive(await db.statements.toArray()), [], []);
  const stored = useLiveQuery(async () => {
    const p = await db.savingsPlans.get(SAVINGS_PLAN_ID);
    return p && !p.deletedAt ? p : null;
  });
  const now = useMemo(() => new Date(), []);
  const rfc = profile?.rfc ?? "";

  const base = useMemo(() => {
    const years = [now.getFullYear() - 1, now.getFullYear()];
    return baseline(
      trailingMonths(
        new Map(years.map((y) => [y, monthlySummary(bills, rfc, y)])),
        new Map(years.map((y) => [y, monthlyCardPayments(statements, y)])),
        now,
      ),
    );
  }, [bills, statements, rfc, now]);

  // Referencia de ingreso: tus ingresos fijos del perfil; sin ellos, el promedio de tus últimos 12 meses.
  const fixedIncome = fixedIncomeMonthly(profile?.fixedIncomes);
  const refIncome = fixedIncome > 0 ? fixedIncome : base.avgIncome;

  const comparison = useMemo(() => {
    if (!stored) return null;
    const from = parseMonthKey(stored.startMonth)[0];
    const years = Array.from({ length: Math.max(1, now.getFullYear() - from + 1) }, (_, i) => from + i);
    const summaries = new Map(years.map((y) => [y, monthlySummary(bills, rfc, y)]));
    const cards = new Map(years.map((y) => [y, monthlyCardPayments(statements, y)]));
    return compareToPlan(stored, (y, m) => monthData(summaries, cards, y, m), now);
  }, [stored, bills, statements, rfc, now]);

  return { profile, now, base, fixedIncome, refIncome, stored, comparison };
}
