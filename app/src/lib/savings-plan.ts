// Proyección de ahorro: toma tus ingresos periódicos (netos de IVA) y tus pagos a tarjeta
// recientes para estimar cuánto puedes apartar y cuándo llegas a una meta.
import { round2 } from "./bill-calc";
import type { CardSeries } from "./card-movements";
import type { FixedIncome, IncomeFrequency } from "./types";
import { MONTH_LABELS, netIncome, type MonthSummary } from "./dashboard";

export interface HistoryMonth {
  year: number;
  month: number;
  label: string;
  income: number;
  spent: number;
}

const EMPTY_MONTH: MonthSummary = { month: 0, label: "", incomes: 0, expenses: 0, taxesTranslated: 0, taxesRetention: 0 };

/** Ingreso neto y pagos a tarjeta de un mes (1-12). */
export function monthData(
  summaries: Map<number, MonthSummary[]>,
  cards: Map<number, CardSeries[]>,
  year: number,
  month: number,
): HistoryMonth {
  const idx = month - 1;
  const income = netIncome(summaries.get(year)?.[idx] ?? EMPTY_MONTH);
  const spent = (cards.get(year) ?? []).reduce((a, c) => a + (c.months[idx] ?? 0), 0);
  return { year, month, label: MONTH_LABELS[idx], income: round2(income), spent: round2(spent) };
}

/** Los `count` meses completos anteriores a `now`, del más viejo al más reciente. `summaries` y `cards` se indexan por año. */
export function trailingMonths(
  summaries: Map<number, MonthSummary[]>,
  cards: Map<number, CardSeries[]>,
  now: Date,
  count = 12,
): HistoryMonth[] {
  const out: HistoryMonth[] = [];
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-based: el mes en curso queda fuera por estar incompleto
  for (let i = 0; i < count; i++) {
    if (month === 0) {
      year -= 1;
      month = 12;
    }
    out.unshift(monthData(summaries, cards, year, month));
    month -= 1;
  }
  return out;
}

export interface Baseline {
  /** Meses con movimientos que entraron al promedio. */
  months: number;
  avgIncome: number;
  avgSpent: number;
  /** Ingreso menos gasto promedio (puede ser negativo). */
  avgSaving: number;
  /** Mes de menor ingreso: sirve para un plan prudente. */
  minIncome: number;
}

export function baseline(history: HistoryMonth[]): Baseline {
  const active = history.filter((m) => m.income > 0 || m.spent > 0);
  if (active.length === 0) return { months: 0, avgIncome: 0, avgSpent: 0, avgSaving: 0, minIncome: 0 };
  const avg = (f: (m: HistoryMonth) => number) => round2(active.reduce((a, m) => a + f(m), 0) / active.length);
  const avgIncome = avg((m) => m.income);
  const avgSpent = avg((m) => m.spent);
  return {
    months: active.length,
    avgIncome,
    avgSpent,
    avgSaving: round2(avgIncome - avgSpent),
    minIncome: Math.min(...active.map((m) => m.income)),
  };
}

export interface PlanInput {
  target: number;
  saved: number;
  /** Plazo deseado en meses. */
  deadlineMonths: number;
  /** Ingreso mensual esperado (neto de IVA). */
  income: number;
  /** Gasto mensual esperado. */
  spent: number;
}

export interface ProjectionPoint {
  /** 0 = hoy. */
  month: number;
  /** Ahorro acumulado si apartas lo que realmente te sobra. */
  atCurrentPace: number;
  /** Ahorro acumulado si apartas la cuota necesaria para llegar a tiempo. */
  atPlan: number;
}

export interface Plan {
  remaining: number;
  /** Cuota mensual para llegar a la meta en el plazo. */
  requiredMonthly: number;
  /** Lo que te sobra hoy cada mes (ingreso − gasto). */
  available: number;
  /** Porcentaje del ingreso que exige la cuota; null sin ingresos. */
  requiredRate: number | null;
  feasible: boolean;
  /** Meses para llegar a la meta apartando todo lo que sobra; null si nunca. */
  monthsAtCurrentPace: number | null;
  /** Cuánto habría que recortar al gasto mensual para llegar a tiempo (0 si ya alcanza). */
  gap: number;
  points: ProjectionPoint[];
}

export function buildPlan({ target, saved, deadlineMonths, income, spent }: PlanInput): Plan {
  const months = Math.max(1, Math.floor(deadlineMonths));
  const remaining = Math.max(0, round2(target - saved));
  const requiredMonthly = round2(remaining / months);
  const available = round2(income - spent);
  const pace = Math.max(0, available);
  const monthsAtCurrentPace = remaining === 0 ? 0 : pace > 0 ? Math.ceil(remaining / pace) : null;
  // La gráfica cubre el plazo, o hasta que el ritmo actual alcance la meta si tarda más (máx. 10 años).
  const horizon = Math.min(120, Math.max(months, monthsAtCurrentPace ?? months));
  const points: ProjectionPoint[] = [];
  for (let i = 0; i <= horizon; i++) {
    points.push({
      month: i,
      atCurrentPace: round2(Math.min(target, saved + pace * i) ),
      atPlan: round2(Math.min(target, saved + requiredMonthly * i)),
    });
  }
  return {
    remaining,
    requiredMonthly,
    available,
    requiredRate: income > 0 ? Math.round((requiredMonthly / income) * 1000) / 10 : null,
    feasible: available >= requiredMonthly,
    monthsAtCurrentPace,
    gap: Math.max(0, round2(requiredMonthly - available)),
    points,
  };
}

/** "Mar 2027" para el mes que está `offset` meses después de `now`. */
export function futureLabel(now: Date, offset: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

export interface GoalSuggestion {
  key: string;
  label: string;
  hint: string;
  target: number;
  deadlineMonths: number;
}

/** Metas sugeridas a partir de tu ingreso y gasto promedio; vacío si no hay datos con qué calcular. */
export function suggestGoals(b: Baseline): GoalSuggestion[] {
  const out: GoalSuggestion[] = [];
  const roundUp = (n: number) => Math.ceil(n / 100) * 100;
  if (b.avgSpent > 0) {
    out.push(
      { key: "fund3", label: "Fondo de emergencia (3 meses)", hint: "3 meses de tu gasto promedio", target: roundUp(b.avgSpent * 3), deadlineMonths: 12 },
      { key: "fund6", label: "Fondo de emergencia (6 meses)", hint: "6 meses de tu gasto promedio", target: roundUp(b.avgSpent * 6), deadlineMonths: 24 },
    );
  }
  if (b.avgIncome > 0) {
    out.push(
      { key: "rate10", label: "Ahorrar 10% de tu ingreso", hint: "Un año apartando el 10%", target: roundUp(b.avgIncome * 12 * 0.1), deadlineMonths: 12 },
      { key: "rate20", label: "Ahorrar 20% de tu ingreso", hint: "Un año apartando el 20%", target: roundUp(b.avgIncome * 12 * 0.2), deadlineMonths: 12 },
    );
  }
  return out;
}

export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export interface PlanTerms {
  target: number;
  initialSaved: number;
  startMonth: string;
  deadlineMonths: number;
  monthlyGoal: number;
}

export interface ComparisonRow {
  year: number;
  month: number;
  label: string;
  planned: number;
  /** Ingreso neto − pagos a tarjeta del mes. */
  actual: number;
  cumulativePlanned: number;
  cumulativeActual: number;
  /** Acumulado real − acumulado del plan; positivo = vas adelantado. */
  diff: number;
  /** Mes en curso: se muestra pero no cuenta en los totales. */
  inProgress: boolean;
}

export interface Comparison {
  rows: ComparisonRow[];
  /** Meses completos ya comparados. */
  elapsed: number;
  cumulativePlanned: number;
  cumulativeActual: number;
  diff: number;
  status: "none" | "ahead" | "behind";
  remainingMonths: number;
  /** Cuota mensual para llegar a la meta en los meses que quedan; null si el plazo ya venció. */
  catchUpMonthly: number | null;
  /** Meses que faltan al ritmo real promedio; null si ese ritmo no ahorra. */
  monthsAtActualPace: number | null;
}

/** Primer mes del plan a partir de "YYYY-MM": [año, mes 1-12]. */
export function parseMonthKey(key: string): [number, number] {
  return [Number(key.slice(0, 4)), Number(key.slice(5, 7))];
}

/** Compara mes a mes lo realmente ahorrado con la cuota del plan. `lookup` da los datos de cada mes. */
export function compareToPlan(
  plan: PlanTerms,
  lookup: (year: number, month: number) => HistoryMonth,
  now: Date,
): Comparison {
  const [sy, sm] = parseMonthKey(plan.startMonth);
  const current = now.getFullYear() * 12 + now.getMonth();
  const start = sy * 12 + (sm - 1);
  const rows: ComparisonRow[] = [];
  let cumPlanned = plan.initialSaved;
  let cumActual = plan.initialSaved;
  let elapsed = 0;
  let totalActual = 0;
  for (let i = 0; i < plan.deadlineMonths && start + i <= current; i++) {
    const idx = start + i;
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const data = lookup(year, month);
    const actual = round2(data.income - data.spent);
    const inProgress = idx === current;
    cumPlanned = round2(cumPlanned + plan.monthlyGoal);
    cumActual = round2(cumActual + actual);
    if (!inProgress) {
      elapsed += 1;
      totalActual += actual;
    }
    rows.push({
      year,
      month,
      label: data.label,
      planned: plan.monthlyGoal,
      actual,
      cumulativePlanned: cumPlanned,
      cumulativeActual: cumActual,
      diff: round2(cumActual - cumPlanned),
      inProgress,
    });
  }
  const done = rows.filter((r) => !r.inProgress);
  const last = done.at(-1);
  const cumulativeActual = last?.cumulativeActual ?? plan.initialSaved;
  const cumulativePlanned = last?.cumulativePlanned ?? plan.initialSaved;
  const remainingMonths = Math.max(0, plan.deadlineMonths - elapsed);
  const left = Math.max(0, plan.target - cumulativeActual);
  const pace = elapsed > 0 ? totalActual / elapsed : 0;
  return {
    rows,
    elapsed,
    cumulativePlanned,
    cumulativeActual,
    diff: round2(cumulativeActual - cumulativePlanned),
    status: !last ? "none" : cumulativeActual >= cumulativePlanned ? "ahead" : "behind",
    remainingMonths,
    catchUpMonthly: remainingMonths > 0 ? round2(left / remainingMonths) : null,
    monthsAtActualPace: left === 0 ? 0 : pace > 0 ? Math.ceil(left / pace) : null,
  };
}

export const FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
  bimestral: "Bimestral",
  anual: "Anual",
};

/** Cuántas veces al mes llega el ingreso (semanal = 52/12 pagos al mes). */
const PER_MONTH: Record<IncomeFrequency, number> = { semanal: 52 / 12, quincenal: 2, mensual: 1, bimestral: 1 / 2, anual: 1 / 12 };

export function monthlyEquivalent(income: Pick<FixedIncome, "amount" | "frequency">): number {
  return round2(income.amount * PER_MONTH[income.frequency]);
}

/** Total mensual de los ingresos fijos del perfil. */
export function fixedIncomeMonthly(incomes: FixedIncome[] | undefined): number {
  return round2((incomes ?? []).reduce((a, i) => a + monthlyEquivalent(i), 0));
}
