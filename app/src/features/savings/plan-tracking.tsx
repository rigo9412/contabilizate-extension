import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHideAmounts } from "@/lib/privacy";
import { futureLabel, parseMonthKey, type Comparison } from "@/lib/savings-plan";
import type { SavingsPlan } from "@/lib/types";
import { Stat } from "./stat";

/** Plan guardado contra lo real mes a mes. Sin `onRemove` (inicio) ofrece ir a la página del plan. */
export function PlanTracking({
  stored,
  comparison,
  onRemove,
  className,
}: {
  stored: SavingsPlan;
  comparison: Comparison;
  onRemove?: () => void;
  className?: string;
}) {
  const { money } = useHideAmounts();
  return (
    <Card className={className}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>{stored.name}</CardTitle>
          <CardDescription>
            Meta de {money(stored.target)} en {stored.deadlineMonths} meses desde {futureLabel(new Date(parseMonthKey(stored.startMonth)[0], parseMonthKey(stored.startMonth)[1] - 1, 1), 0)}, apartando{" "}
            {money(stored.monthlyGoal)} al mes. Cada mes se compara con tus ingresos menos pagos a tarjeta.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {comparison.status !== "none" && (
            <Badge variant={comparison.status === "ahead" ? "primary" : "destructive"}>
              {comparison.status === "ahead" ? "Vas al corriente" : "Vas atrasado"}
            </Badge>
          )}
          {onRemove ? (
            <Button variant="outline" size="sm" onClick={onRemove}>
              Eliminar plan
            </Button>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link to="/savings">Ver plan</Link>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {comparison.status === "none" ? (
          <p className="text-sm text-muted-foreground">
            La primera comparación aparece cuando termine el mes en curso y tengas cargadas tus facturas y estados de cuenta.
          </p>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-4">
              <Stat label="Ahorrado (real)" value={money(comparison.cumulativeActual)} />
              <Stat label="Debería llevar" value={money(comparison.cumulativePlanned)} />
              <Stat
                label={comparison.diff >= 0 ? "Adelanto" : "Atraso"}
                value={money(Math.abs(comparison.diff))}
                negative={comparison.diff < 0}
              />
              <Stat
                label="Avance de la meta"
                value={`${Math.max(0, Math.min(100, Math.round((comparison.cumulativeActual / stored.target) * 100)))}%`}
              />
            </dl>
            <p className="text-sm text-muted-foreground">
              {comparison.catchUpMonthly === null
                ? "El plazo ya terminó."
                : comparison.status === "behind"
                  ? `Para llegar a tiempo ahora necesitas apartar ${money(comparison.catchUpMonthly)} al mes durante ${comparison.remainingMonths} meses.`
                  : `Con ${money(comparison.catchUpMonthly)} al mes durante ${comparison.remainingMonths} meses terminas a tiempo.`}
              {comparison.monthsAtActualPace !== null &&
                ` Al ritmo real promedio llegarías en ${comparison.monthsAtActualPace} ${comparison.monthsAtActualPace === 1 ? "mes" : "meses"}.`}
            </p>
          </>
        )}
        {comparison.rows.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Meta del mes</TableHead>
                <TableHead className="text-right">Real del mes</TableHead>
                <TableHead className="text-right">Acumulado real</TableHead>
                <TableHead className="text-right">Acumulado plan</TableHead>
                <TableHead className="text-right">Diferencia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.rows.map((r) => (
                <TableRow key={`${r.year}-${r.month}`}>
                  <TableCell>
                    {r.label} {r.year}
                    {r.inProgress && <span className="ml-2 text-xs text-muted-foreground">en curso</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.planned)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.actual < r.planned ? "text-destructive" : ""}`}>{money(r.actual)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.cumulativeActual)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.cumulativePlanned)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.diff < 0 ? "text-destructive" : ""}`}>{money(r.diff)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
