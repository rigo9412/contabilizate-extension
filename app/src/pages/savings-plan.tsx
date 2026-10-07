import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlanTracking } from "@/features/savings/plan-tracking";
import { Stat } from "@/features/savings/stat";
import { loadGoalForm, saveGoalForm, useSavings, type GoalForm } from "@/features/savings/use-savings";
import { db, SAVINGS_PLAN_ID, save, softDelete } from "@/lib/db";
import { useHideAmounts } from "@/lib/privacy";
import { buildPlan, futureLabel, monthKey } from "@/lib/savings-plan";
import type { SavingsPlan } from "@/lib/types";

const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function SavingsPlanPage() {
  const { money } = useHideAmounts();
  const { profile, now, base, fixedIncome, refIncome, stored, comparison } = useSavings();
  const [form, setForm] = useState<GoalForm>(loadGoalForm);
  const set = (k: keyof GoalForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => saveGoalForm(form), [form]);

  const usingAverages = form.income === "" && form.spent === "";
  const income = form.income === "" ? refIncome : num(form.income);
  const spent = form.spent === "" ? base.avgSpent : num(form.spent);
  const target = num(form.target);
  const plan = useMemo(
    () => buildPlan({ target, saved: num(form.saved), deadlineMonths: num(form.deadline) || 1, income, spent }),
    [target, form.saved, form.deadline, income, spent],
  );
  const maxPoint = Math.max(target, 1);

  async function savePlan() {
    await save<SavingsPlan>(db.savingsPlans, {
      id: SAVINGS_PLAN_ID,
      name: form.name.trim() || "Mi meta de ahorro",
      target,
      initialSaved: num(form.saved),
      startMonth: monthKey(now),
      deadlineMonths: Math.max(1, Math.floor(num(form.deadline))),
      monthlyGoal: plan.requiredMonthly,
      income,
      spent,
    });
    toast.success("Plan guardado. Cada mes se compara con tus datos reales.");
  }

  async function removePlan() {
    await softDelete(db.savingsPlans, SAVINGS_PLAN_ID);
    toast.success("Plan eliminado");
  }

  return (
    <>
      <PageTitle
        title="Plan de ahorro"
        description="Proyecta cuánto puedes apartar con tus ingresos periódicos y cuándo llegas a tu meta."
      />

      {!profile?.rfc && (
        <p className="mb-4 text-sm text-muted-foreground">
          Agrega tu RFC en{" "}
          <Link to="/profile" className="underline">
            Perfil
          </Link>{" "}
          para calcular tus ingresos a partir de tus facturas.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lo que tienes hoy</CardTitle>
          <CardDescription>
            {base.months > 0
              ? `Promedio de ${base.months} ${base.months === 1 ? "mes" : "meses"} con movimientos (últimos 12, sin el mes en curso). Ingresos sin IVA trasladado; gasto = pagos a tarjetas.`
              : "Aún no hay facturas ni estados de cuenta de los últimos 12 meses; escribe tus montos a mano."}
            {fixedIncome === 0 && (
              <>
                {" "}
                Captura tus ingresos fijos en{" "}
                <Link to="/profile" className="underline">
                  Perfil
                </Link>{" "}
                para usarlos como referencia.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Stat
            label={fixedIncome > 0 ? "Ingresos fijos (perfil)" : "Ingreso mensual promedio"}
            value={money(refIncome)}
          />
          <Stat label="Gasto mensual promedio" value={money(base.avgSpent)} />
          <Stat label="Te sobra al mes" value={money(refIncome - base.avgSpent)} negative={refIncome - base.avgSpent < 0} />
        </CardContent>
      </Card>

      {stored && comparison && (
        <PlanTracking className="mb-6" stored={stored} comparison={comparison} onRemove={removePlan} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tu meta</CardTitle>
          <CardDescription>
            Ajusta el ingreso y el gasto para simular escenarios (p. ej. un mes flojo de ingresos o recortar gastos). Vacío = tus ingresos fijos del perfil (o el promedio si no los has capturado).
          </CardDescription>
          {!usingAverages && (
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setForm((f) => ({ ...f, income: "", spent: "" }))}>
              Usar valores de referencia
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Nombre del plan">
            <Input value={form.name} onChange={set("name")} placeholder="Fondo de emergencia" />
          </Field>
          <Field label="Monto a ahorrar">
            <Input type="number" min="0" inputMode="decimal" value={form.target} onChange={set("target")} placeholder="50000" />
          </Field>
          <Field label="Ya tengo ahorrado">
            <Input type="number" min="0" inputMode="decimal" value={form.saved} onChange={set("saved")} />
          </Field>
          <Field label="Plazo (meses)">
            <Input type="number" min="1" step="1" inputMode="numeric" value={form.deadline} onChange={set("deadline")} />
          </Field>
          <Field label="Ingreso mensual esperado">
            <Input type="number" min="0" inputMode="decimal" value={form.income} onChange={set("income")} placeholder={String(refIncome)} />
          </Field>
          <Field label="Gasto mensual esperado">
            <Input type="number" min="0" inputMode="decimal" value={form.spent} onChange={set("spent")} placeholder={String(base.avgSpent)} />
          </Field>
        </CardContent>
      </Card>

      {target === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Escribe el monto a ahorrar para ver tu proyección. En Inicio encuentras metas sugeridas.
        </p>
      )}

      {target > 0 && (
        <>
          <Card className="mt-6">
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle>Proyección</CardTitle>
                <CardDescription>
                  Faltan {money(plan.remaining)}. Para llegar en {num(form.deadline) || 1} meses necesitas apartar{" "}
                  <strong>{money(plan.requiredMonthly)}</strong> al mes
                  {plan.requiredRate !== null && ` (${plan.requiredRate}% de tu ingreso)`}.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={plan.feasible ? "primary" : "destructive"}>{plan.feasible ? "Alcanzable" : "No alcanza"}</Badge>
                <Button size="sm" onClick={savePlan}>
                  {stored ? "Reemplazar plan guardado" : "Guardar plan"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid gap-4 sm:grid-cols-3">
                <Stat label="Cuota mensual necesaria" value={money(plan.requiredMonthly)} />
                <Stat label="Te sobra al mes" value={money(plan.available)} negative={plan.available < 0} />
                <Stat
                  label="Llegas a la meta en"
                  value={
                    plan.monthsAtCurrentPace === null
                      ? "Nunca, sin margen"
                      : `${plan.monthsAtCurrentPace} ${plan.monthsAtCurrentPace === 1 ? "mes" : "meses"} (${futureLabel(now, plan.monthsAtCurrentPace)})`
                  }
                />
              </dl>
              {!plan.feasible && (
                <p className="text-sm text-muted-foreground">
                  Con lo que te sobra hoy no llegas en el plazo: te faltan <strong>{money(plan.gap)}</strong> al mes. Recorta gastos
                  por ese monto, aumenta tus ingresos o alarga el plazo (revisa los{" "}
                  <Link to="/cards/analysis" className="underline">
                    tips de ahorro
                  </Link>
                  ).
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Mes a mes</CardTitle>
              <CardDescription>Ahorro acumulado apartando la cuota del plan, contra apartar todo lo que te sobra.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Con el plan</TableHead>
                    <TableHead className="text-right">Con lo que te sobra</TableHead>
                    <TableHead className="w-1/3">Avance del plan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.points.slice(1).map((p) => (
                    <TableRow key={p.month}>
                      <TableCell>{futureLabel(now, p.month)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(p.atPlan)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(p.atCurrentPace)}</TableCell>
                      <TableCell>
                        <div className="h-2 rounded-full bg-secondary" role="presentation">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, (p.atPlan / maxPoint) * 100)}%` }} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
