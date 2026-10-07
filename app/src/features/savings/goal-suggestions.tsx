import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHideAmounts } from "@/lib/privacy";
import { suggestGoals } from "@/lib/savings-plan";
import { EMPTY_GOAL, loadGoalForm, saveGoalForm, useSavings } from "./use-savings";

/** Metas sugeridas con tu ingreso de referencia y gasto promedio; al elegir una abre el plan con la meta ya llenada. */
export function GoalSuggestions({ className }: { className?: string }) {
  const { money } = useHideAmounts();
  const navigate = useNavigate();
  const { base, refIncome } = useSavings();
  const suggestions = useMemo(() => suggestGoals({ ...base, avgIncome: refIncome }), [base, refIncome]);
  if (suggestions.length === 0) return null;
  return (
    <Card className={className ?? "border-accent"}>
      <CardHeader>
        <CardTitle>Empieza tu plan de ahorro</CardTitle>
        <CardDescription>
          Metas calculadas con tu ingreso de referencia y tu gasto promedio. Elige una para armar tu plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s.key}
            type="button"
            className="rounded-md border p-3 text-left hover:bg-secondary"
            onClick={() => {
              saveGoalForm({ ...(loadGoalForm() ?? EMPTY_GOAL), name: s.label, target: String(s.target), deadline: String(s.deadlineMonths) });
              navigate("/savings");
            }}
          >
            <div className="text-sm font-medium">{s.label}</div>
            <div className="text-lg font-semibold tabular-nums">{money(s.target)}</div>
            <div className="text-xs text-muted-foreground">
              {s.hint} · en {s.deadlineMonths} meses
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
