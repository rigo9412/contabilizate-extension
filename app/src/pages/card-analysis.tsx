import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryPie } from "@/features/dashboard/category-pie";
import { SavingTips } from "@/features/dashboard/saving-tips";
import { alive, db } from "@/lib/db";
import { useHideAmounts } from "@/lib/privacy";
import { analyzeSpending, cardKey, categorySlices, HORMIGA_MAX, statementMonth } from "@/lib/spending-analysis";

const RANGES = { "1": "Último mes", "3": "Últimos 3 meses", "6": "Últimos 6 meses", "12": "Últimos 12 meses" };

export function CardAnalysisPage() {
  const statements = useLiveQuery(
    async () => alive(await db.statements.orderBy("periodEnd").reverse().toArray()),
    [],
    [],
  );
  const { hide, toggle, money } = useHideAmounts();
  const [card, setCard] = useState("");
  const [range, setRange] = useState("3");

  const cardOptions = useMemo(
    () => Object.fromEntries(statements.map((s) => [cardKey(s), `${s.bank} ···${s.cardLast4}`])),
    [statements],
  );
  // Los estados de cuenta de los últimos N meses con datos.
  const selected = useMemo(() => {
    const ofCard = statements.filter((s) => !card || cardKey(s) === card);
    const months = new Set([...new Set(ofCard.map(statementMonth))].sort().reverse().slice(0, Number(range)));
    return ofCard.filter((s) => months.has(statementMonth(s)));
  }, [statements, card, range]);
  const analysis = useMemo(() => analyzeSpending(selected, statements), [selected, statements]);
  const trend = analysis.periods >= 2;
  const maxWeekday = Math.max(1, ...analysis.byWeekday.map((d) => d.total));

  return (
    <>
      <PageTitle
        title="Análisis de gastos"
        description="Patrones de gasto de tus tarjetas y en qué puedes ahorrar. Cada estado de cuenta cuenta como un mes."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/cards">
                <ArrowLeft /> Tarjetas
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={toggle} aria-pressed={hide}>
              {hide ? <Eye /> : <EyeOff />} {hide ? "Mostrar montos" : "Ocultar montos"}
            </Button>
          </div>
        }
      />

      {statements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Importa al menos un estado de cuenta en <Link to="/cards" className="underline">Tarjetas</Link> para ver
            tu análisis.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          <div className="flex flex-wrap gap-3">
            <NativeSelect
              className="w-auto"
              aria-label="Periodo"
              showKey={false}
              value={range}
              options={RANGES}
              onChange={(e) => setRange(e.target.value)}
            />
            <NativeSelect
              className="w-auto"
              aria-label="Tarjeta"
              placeholder="Todas las tarjetas"
              showKey={false}
              value={card}
              options={cardOptions}
              onChange={(e) => setCard(e.target.value)}
            />
            <span className="self-center text-xs text-muted-foreground">
              {selected.length === 1 ? "1 estado de cuenta" : `${selected.length} estados de cuenta`}
              {analysis.periods > 1 && ` de ${analysis.periods} meses`}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Gasto promedio al mes</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{money(analysis.perPeriod)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Sin contar pagos a la tarjeta</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Gastos hormiga al mes</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{money(analysis.hormiga.perPeriod)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {Math.round(analysis.hormiga.count / Math.max(1, analysis.periods))} compras de menos de{" "}
                {money(HORMIGA_MAX)} al mes
              </CardContent>
            </Card>
            <Card className="border-primary">
              <CardHeader className="pb-2">
                <CardDescription>Podrías ahorrar al mes</CardDescription>
                <CardTitle className="text-2xl tabular-nums text-primary">{money(analysis.potentialSaving)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {money(analysis.potentialSaving * 12)} al año siguiendo las recomendaciones
              </CardContent>
            </Card>
          </div>

          <SavingTips
            recommendations={analysis.recommendations}
            description="Montos estimados. Pasa el cursor sobre un tip para ver el detalle."
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">En qué gastas</CardTitle>
              </CardHeader>
              <CardContent>
                {analysis.categories.length > 0 && (
                  <CategoryPie
                    data={categorySlices(analysis.categories)}
                    label="Gasto por categoría"
                    unit={["compra", "compras"]}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por día de la semana</CardTitle>
                <CardDescription>
                  {Math.round(analysis.weekendShare * 100)}% de tu gasto es en fin de semana
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {analysis.byWeekday.map((d) => (
                    <li key={d.label} className="grid grid-cols-[2.5rem_1fr_6rem] items-center gap-3">
                      <span className="text-muted-foreground">{d.label}</span>
                      <span className="h-3 rounded-sm bg-secondary">
                        <span
                          className="block h-full rounded-sm bg-primary"
                          style={{ width: `${(d.total / maxWeekday) * 100}%` }}
                        />
                      </span>
                      <span className="text-right tabular-nums">{money(d.total)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Categorías</CardTitle>
              {!trend && (
                <CardDescription>Con dos o más estados de cuenta verás si cada categoría sube o baja.</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoría</TableHead>
                    <TableHead className="text-right">Compras</TableHead>
                    <TableHead className="text-right">Al mes</TableHead>
                    <TableHead className="text-right">Del total</TableHead>
                    {trend && <TableHead className="text-right">Último mes vs promedio</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.categories.map((c) => {
                    const change = c.previousAverage ? (c.last ?? 0) / c.previousAverage - 1 : undefined;
                    return (
                      <TableRow key={c.key}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell className="text-right">{c.count}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(c.perPeriod)}</TableCell>
                        <TableCell className="text-right">{Math.round(c.share * 100)}%</TableCell>
                        {trend && (
                          <TableCell
                            className={`text-right tabular-nums ${change !== undefined && change > 0.1 ? "text-destructive" : change !== undefined && change < -0.1 ? "text-green-600" : ""}`}
                          >
                            {money(c.last ?? 0)}
                            {change !== undefined && ` (${change > 0 ? "+" : ""}${Math.round(change * 100)}%)`}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cargos recurrentes</CardTitle>
                <CardDescription>Suscripciones y comercios que se repiten cada mes con montos parecidos.</CardDescription>
              </CardHeader>
              <CardContent>
                {analysis.recurring.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No se detectaron cargos recurrentes.</p>
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {analysis.recurring.map((r) => (
                      <li key={r.merchant} className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate">{r.merchant}</span>
                          <span className="text-xs text-muted-foreground">
                            {r.category} · {r.periods} {r.periods === 1 ? "mes" : "meses"}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{money(r.amount)}/mes</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Donde compras más seguido</CardTitle>
                <CardDescription>Muchas compras pequeñas en el mismo lugar suman más de lo que parece.</CardDescription>
              </CardHeader>
              <CardContent>
                {analysis.frequent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ningún comercio tiene 3 compras o más.</p>
                ) : (
                  <ul className="grid gap-2 text-sm">
                    {analysis.frequent.map((m) => (
                      <li key={m.merchant} className="flex items-center justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate">{m.merchant}</span>
                          <span className="text-xs text-muted-foreground">
                            {m.count} compras · promedio {money(m.average)}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{money(m.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
