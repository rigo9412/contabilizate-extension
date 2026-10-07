import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  KeyRound,
  LayoutTemplate,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { CategoryPie } from "@/features/dashboard/category-pie";
import { GoalSuggestions } from "@/features/savings/goal-suggestions";
import { PlanTracking } from "@/features/savings/plan-tracking";
import { useSavings } from "@/features/savings/use-savings";
import { HealthBreakdown } from "@/features/dashboard/health-dialog";
import { SavingTips } from "@/features/dashboard/saving-tips";
import { IncomeChart } from "@/features/dashboard/income-chart";
import { monthlyCardPayments } from "@/lib/card-movements";
import { analyzeSpending, categorySlices, statementMonth } from "@/lib/spending-analysis";
import {
  availableYears,
  categorySummary,
  monthlyHealth,
  monthlySummary,
  netIncome,
  overallHealth,
} from "@/lib/dashboard";
import { alive, db, PROFILE_ID } from "@/lib/db";
import { useHideAmounts } from "@/lib/privacy";
import { openSatPortal } from "@/lib/sat";
import { useVaultStatus } from "@/lib/use-vault-status";

const VAULT_LABEL = {
  locked: "Bloqueada",
  session: "Desbloqueada (sesión)",
  remembered: "Desbloqueada (recordada)",
} as const;

const GRADE_COLOR = {
  A: "text-green-600",
  B: "text-lime-600",
  C: "text-amber-600",
  D: "text-destructive",
} as const;

function pct(rate: number | null) {
  return rate === null ? "—" : `${rate}%`;
}

export function DashboardPage() {
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID));
  const hasVault = useLiveQuery(
    async () => !!(await db.vault.get("efirma"))?.payload,
  );
  const bills = useLiveQuery(
    async () => alive(await db.bills.toArray()),
    [],
    [],
  );
  const billCount = bills.length;
  const years = useMemo(() => availableYears(bills), [bills]);
  const [year, setYear] = useState(new Date().getFullYear());
  const statements = useLiveQuery(
    async () => alive(await db.statements.toArray()),
    [],
    [],
  );
  const cards = useMemo(
    () => monthlyCardPayments(statements, year),
    [statements, year],
  );
  const months = useMemo(
    () => monthlySummary(bills, profile?.rfc ?? "", year),
    [bills, profile?.rfc, year],
  );
  const [origin, setOrigin] = useState<"incomes" | "expenses">("expenses");
  const slices = useMemo(() => {
    if (origin === "incomes")
      return categorySummary(bills, profile?.rfc ?? "", year, origin);
    // Gastos: cargos de las tarjetas del año, por categoría.
    const inYear = statements.map((s) => ({
      ...s,
      movements: s.movements.filter((m) => Number(m.date.slice(0, 4)) === year),
    }));
    return categorySlices(analyzeSpending(inYear, statements).categories);
  }, [bills, statements, profile?.rfc, year, origin]);
  // Tips de ahorro con los últimos 12 meses de estados de cuenta, sin importar el año elegido:
  // así entran los cargos anuales (anualidad, seguros) y siempre reflejan lo reciente.
  const tips = useMemo(() => {
    const months = new Set([...new Set(statements.map(statementMonth))].sort().reverse().slice(0, 12));
    return analyzeSpending(statements.filter((s) => months.has(statementMonth(s))), statements);
  }, [statements]);
  const { hide, toggle } = useHideAmounts();
  const health = useMemo(() => {
    const byMonth = monthlyHealth(
      months,
      months.map((_, i) => cards.reduce((a, c) => a + c.months[i], 0)),
    );
    const incomes = months.reduce((a, m) => a + netIncome(m), 0);
    const spent = cards.reduce(
      (a, c) => a + c.months.reduce((x, y) => x + y, 0),
      0,
    );
    return { byMonth, overall: overallHealth(byMonth, incomes, spent) };
  }, [months, cards]);
  const totals = useMemo(() => {
    const incomes = months.reduce((a, m) => a + m.incomes, 0);
    const expenses = months.reduce((a, m) => a + m.expenses, 0);
    const cardCharges = cards.reduce(
      (a, c) => a + c.months.reduce((x, y) => x + y, 0),
      0,
    );
    return {
      incomes,
      expenses,
      cardCharges,
      // Mismo cálculo que la línea de margen de la gráfica.
      margin: incomes - cardCharges,
      translated: months.reduce((a, m) => a + m.taxesTranslated, 0),
      retention: months.reduce((a, m) => a + m.taxesRetention, 0),
    };
  }, [months, cards]);
  const templateCount = useLiveQuery(
    async () => alive(await db.templates.toArray()).length,
    [],
    0,
  );
  const vaultStatus = useVaultStatus();
  const savings = useSavings();

  return (
    <>
      <PageTitle
        title={profile?.name ? `Hola, ${profile.name}` : "Bienvenido"}
        description="Tus datos viven en este navegador. Respáldalos desde la sección Respaldo."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={toggle}
            aria-pressed={hide}
          >
            {hide ? <Eye /> : <EyeOff />}{" "}
            {hide ? "Mostrar montos" : "Ocultar montos"}
          </Button>
        }
      />

      {savings.stored && savings.comparison ? (
        <PlanTracking className="mb-6" stored={savings.stored} comparison={savings.comparison} />
      ) : (
        savings.stored === null && <GoalSuggestions className="mb-6 border-accent" />
      )}

      {statements.length > 0 && (
        <SavingTips
          className="mb-6"
          recommendations={tips.recommendations}
          potentialSaving={tips.potentialSaving}
          description={`Últimos ${tips.periods} ${tips.periods === 1 ? "mes" : "meses"} de tarjetas. Pasa el cursor sobre un tip para ver el detalle.`}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/cards/analysis">Ver análisis</Link>
            </Button>
          }
        />
      )}

      {!profile && (
        <Card className="mb-6 border-accent">
          <CardHeader>
            <CardTitle>Configura tu perfil</CardTitle>
            <CardDescription>
              Agrega tu RFC y tu e.firma para iniciar sesión en el SAT
              automáticamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/profile">Ir a perfil</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={FileText} label="Facturas" value={billCount} />
        <StatCard
          icon={LayoutTemplate}
          label="Plantillas"
          value={templateCount}
        />
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <KeyRound className="size-4" /> e.firma
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasVault ? (
              <Badge
                variant={vaultStatus === "locked" ? "secondary" : "primary"}
              >
                {VAULT_LABEL[vaultStatus]}
              </Badge>
            ) : (
              <Badge variant="outline">Sin configurar</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Ingresos por mes</CardTitle>
            <CardDescription>
              Facturas emitidas contra los pagos a tus tarjetas; no cuenta
              canceladas ni excluidas.
            </CardDescription>
          </div>
          <NativeSelect
            className="w-28"
            aria-label="Año"
            value={String(year)}
            options={Object.fromEntries(
              years.map((y) => [String(y), String(y)]),
            )}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </CardHeader>
        <CardContent className="grid gap-6">
          {!profile?.rfc ? (
            <p className="text-sm text-muted-foreground">
              Agrega tu RFC en{" "}
              <Link to="/profile" className="underline">
                Perfil
              </Link>{" "}
              para separar ingresos de gastos.
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <Stat label={`Ingresos ${year}`} value={totals.incomes} />
                <Stat label="Pagos a tarjetas" value={totals.cardCharges} />
                <Stat label={`Margen ${year}`} value={totals.margin} signed />
                <Stat label="IVA trasladado" value={totals.translated} />
                <Stat label="Retenciones" value={totals.retention} />
              </dl>
              {billCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay facturas.{" "}
                  <Link to="/downloads" className="underline">
                    Descárgalas del SAT
                  </Link>{" "}
                  o importa tus XML en{" "}
                  <Link to="/bills" className="underline">
                    Facturas
                  </Link>
                  .
                </p>
              ) : (
                <IncomeChart data={months} year={year} cards={cards} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!!profile?.rfc && health.overall && (
        <Card className="mt-6">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Salud financiera {year}</CardTitle>
              <CardDescription>
                Según cuánto te queda de tus ingresos cada mes (ingresos menos
                pagos a tarjetas; las facturas de gasto no entran). Se muestra
                el porcentaje de tus ingresos (sin IVA) que realmente ahorras.
              </CardDescription>
            </div>
            <HealthBreakdown
              months={months}
              cardByMonth={months.map((_, i) =>
                cards.reduce((a, c) => a + c.months[i], 0),
              )}
              year={year}
            />
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center gap-4">
              <span
                className={`text-5xl font-bold ${GRADE_COLOR[health.overall.grade]}`}
              >
                {health.overall.grade}
              </span>
              <div>
                <div className="text-2xl font-semibold tabular-nums">
                  {pct(health.overall.rate)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Ahorrado en el año
                </div>
              </div>
            </div>
            <ul
              className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12"
              aria-label="Calificación por mes"
            >
              {health.byMonth.map((m) => (
                <li key={m.month} className="rounded-md border p-2 text-center">
                  <div className="text-xs text-muted-foreground">{m.label}</div>
                  {m.hasData ? (
                    <>
                      <div
                        className={`text-xl font-bold ${GRADE_COLOR[m.grade]}`}
                      >
                        {m.grade}
                      </div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {pct(m.rate)}
                      </div>
                    </>
                  ) : (
                    <div className="py-2 text-sm text-muted-foreground">—</div>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {!!profile?.rfc && (billCount > 0 || statements.length > 0) && (
        <Card className="mt-6">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>
                {origin === "expenses"
                  ? "¿De dónde vienen tus gastos?"
                  : "¿De dónde vienen tus ingresos?"}
              </CardTitle>
              <CardDescription>
                {origin === "expenses"
                  ? `Cargos de tus tarjetas en ${year} agrupados por categoría.`
                  : `Ingresos de ${year} agrupados por cliente.`}
              </CardDescription>
            </div>
            <NativeSelect
              className="w-32"
              showKey={false}
              aria-label="Origen"
              value={origin}
              options={{ expenses: "Gastos", incomes: "Ingresos" }}
              onChange={(e) =>
                setOrigin(e.target.value as "incomes" | "expenses")
              }
            />
          </CardHeader>
          <CardContent>
            {slices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay {origin === "expenses" ? "gastos" : "ingresos"} en {year}
                .
              </p>
            ) : (
              <CategoryPie
                data={slices}
                label={`Origen de ${origin === "expenses" ? "gastos" : "ingresos"} ${year}`}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Portal del SAT</CardTitle>
          <CardDescription>
            Con la e.firma desbloqueada, la extensión inicia sesión y llena la
            factura por ti.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={openSatPortal}>
            <ExternalLink /> Abrir portal de facturación
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center gap-2">
          <Icon className="size-4" /> {label}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-3xl font-bold">{value}</CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  signed,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  const { money } = useHideAmounts();
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`text-xl font-semibold tabular-nums ${signed && value < 0 ? "text-destructive" : ""}`}
      >
        {money(value)}
      </dd>
    </div>
  );
}
