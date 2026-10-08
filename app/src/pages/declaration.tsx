import { useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, CheckCircle2, Download, Send, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CompareTable } from "@/features/declaration/compare-table";
import { DeclarationReminder } from "@/features/declaration/declaration-reminder";
import { CreditIvaToggle, ExpenseList, IncomeTable, IsrBreakdown, IvaBreakdown, Line, Step } from "@/features/declaration/guide-steps";
import { importCfdiXml } from "@/lib/bill-import";
import { availableYears, MONTH_LABELS } from "@/lib/dashboard";
import { alive, db, PROFILE_ID, save } from "@/lib/db";
import { useHideAmounts } from "@/lib/privacy";
import { dueDate, monthKey, monthlyDeclaration, potentialCreditable, previousMonth } from "@/lib/resico";
import { downloadFromSat, type InvoiceType } from "@/lib/sat-download";
import {
  compareValues,
  DeclarationCancelledError,
  fillDeclaration,
  portalValues,
  waitForAcuse,
  type FillProgress,
} from "@/lib/sat-declaration";
import type { Bill, Declaration, Profile } from "@/lib/types";
import { useVaultStatus } from "@/lib/use-vault-status";

const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTH_OPTIONS = Object.fromEntries(MONTH_LABELS.map((_, i) => [String(i + 1).padStart(2, "0"), MONTH_NAMES[i]]));

const STATUS_LABEL: Record<Declaration["status"], string> = {
  borrador: "Borrador",
  autorizada: "Autorizada",
  llenada: "Capturada en el SAT",
  presentada: "Presentada",
};

const lastDay = (year: number, month: number) => new Date(year, month, 0).getDate();

export function DeclarationPage() {
  const initial = previousMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const key = monthKey(year, month);
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID));
  const bills = useLiveQuery(async () => alive(await db.bills.toArray()), [], []);
  const saved = useLiveQuery(() => db.declarations.get(key), [key]);
  const years = useMemo(() => [...new Set([initial.year, ...availableYears(bills)])].sort((a, b) => b - a), [bills, initial.year]);
  const [balanceInput, setBalanceInput] = useState<string | null>(null);
  const previousIvaBalance = Number(balanceInput ?? saved?.iva.previousBalance ?? 0) || 0;
  const rfc = profile?.rfc ?? "";
  const creditIva = profile?.creditIva ?? false;
  const calc = useMemo(
    () => monthlyDeclaration(bills, rfc, year, month, { previousIvaBalance, regimen: profile?.regimenFiscal, creditIva }),
    [bills, rfc, year, month, previousIvaBalance, profile?.regimenFiscal, creditIva],
  );
  const ours = useMemo(() => portalValues(calc.isr, calc.iva), [calc]);
  const { money } = useHideAmounts();
  const vaultStatus = useVaultStatus();
  const [busy, setBusy] = useState<FillProgress | null>(null);
  const cancelled = useRef(false);
  const tabId = useRef<number | null>(null);

  async function toggleExpense(billId: string, count: boolean) {
    const bill = (await db.bills.get(billId)) ?? (await db.bills.get(billId.toLowerCase()));
    if (bill) await save<Bill>(db.bills, { ...bill, count });
  }

  async function setCreditIva(value: boolean) {
    if (profile) await save<Profile>(db.profile, { ...profile, creditIva: value });
  }

  async function downloadMonth(type: InvoiceType) {
    cancelled.current = false;
    let imported = 0;
    try {
      setBusy({ status: `Descargando ${type} de ${MONTH_NAMES[month - 1]}…`, percent: 0 });
      await downloadFromSat(
        { type, startDate: `${key}-01`, endDate: `${key}-${lastDay(year, month)}`, includePdf: false },
        (p) => setBusy({ status: p.status, percent: p.percent }),
        () => cancelled.current,
        async (xml, info) => {
          await importCfdiXml(xml, { cancelled: info.cancelled }).then(() => imported++, () => {});
        },
      );
      toast.success(`${imported} facturas ${type} actualizadas`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function record(over: Partial<Declaration>): Omit<Declaration, "updatedAt"> {
    return { id: key, year, month, status: "borrador", ...saved, isr: calc.isr, iva: calc.iva, deletedAt: null, ...over };
  }

  async function authorizeAndFill() {
    if (!rfc) {
      toast.error("Primero captura tu RFC en Perfil");
      return;
    }
    cancelled.current = false;
    await save<Declaration>(db.declarations, record({ status: "autorizada" }));
    try {
      setBusy({ status: "Abriendo el portal de Declaraciones…", percent: 0 });
      const result = await fillDeclaration(year, month, ours, profile?.resicoActivity, setBusy, () => cancelled.current);
      tabId.current = result.tabId;
      await save<Declaration>(
        db.declarations,
        record({ status: "llenada", satPrefill: result.prefill, missingFields: result.missing, manualSteps: result.manualSteps }),
      );
      toast.success("Declaración capturada. Revísala en el SAT y presiona Enviar tú mismo.");
      setBusy({ status: "Esperando a que envíes la declaración en el SAT…", percent: 100 });
      const acuse = await waitForAcuse(result.tabId, year, month, () => cancelled.current);
      await save<Declaration>(
        db.declarations,
        record({ status: "presentada", satPrefill: result.prefill, missingFields: result.missing, manualSteps: result.manualSteps, ...acuse }),
      );
      toast.success("Acuse guardado");
    } catch (err) {
      if (!(err instanceof DeclarationCancelledError)) toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveManualAcuse(form: FormData) {
    const captureLine = String(form.get("captureLine") ?? "").replace(/\s/g, "");
    if (!captureLine) return;
    await save<Declaration>(
      db.declarations,
      record({
        status: "presentada",
        captureLine,
        operationNumber: String(form.get("operationNumber") ?? "") || undefined,
        amountDue: calc.totalDue,
      }),
    );
    toast.success("Declaración marcada como presentada");
  }

  const due = dueDate(year, month, rfc);
  const status = saved?.status ?? "borrador";
  const monthName = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <>
      <PageTitle
        title="Declaración mensual"
        description="RESICO persona física: te explicamos de dónde sale cada número y, cuando lo autorices, lo capturamos en el portal del SAT."
        actions={
          <div className="flex gap-2">
            <NativeSelect className="w-36" value={String(month).padStart(2, "0")} options={MONTH_OPTIONS} showKey={false} onChange={(e) => setMonth(Number(e.target.value))} />
            <NativeSelect
              className="w-24"
              value={String(year)}
              options={Object.fromEntries(years.map((y) => [String(y), String(y)]))}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        }
      />

      <div className="grid min-w-0 gap-6">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
            <div>
              <p className="text-sm text-muted-foreground">Total a pagar de {monthName}</p>
              <p className="text-3xl font-bold tabular-nums">{money(calc.totalDue)}</p>
            </div>
            <div className="text-right text-sm">
              <Badge variant={status === "presentada" ? "primary" : "secondary"}>{STATUS_LABEL[status]}</Badge>
              <p className="mt-1 text-muted-foreground">Fecha límite: {due}</p>
            </div>
          </CardContent>
        </Card>

        <DeclarationReminder />

        {calc.warnings.length > 0 && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="grid gap-2 pt-6 text-sm">
              {calc.warnings.map((w) => (
                <p key={w.kind} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /> {w.message}
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        <Step
          n={1}
          title="Tus facturas del mes"
          description="La declaración se arma con tus facturas. Descarga las de este mes para que no falte ninguna."
        >
          {!rfc ? (
            <p className="text-sm">
              Primero captura tu RFC y régimen en <Link className="underline" to="/profile">Perfil</Link>.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={!!busy} onClick={() => downloadMonth("emitidas")}>
                <Download /> Emitidas de {MONTH_NAMES[month - 1]}
              </Button>
              <Button variant="outline" disabled={!!busy} onClick={() => downloadMonth("recibidas")}>
                <Download /> Recibidas de {MONTH_NAMES[month - 1]}
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                {vaultStatus === "locked"
                  ? "Tu e.firma está bloqueada: si el SAT pide iniciar sesión, hazlo a mano."
                  : "Si el SAT pide iniciar sesión, la extensión entra con tu e.firma."}{" "}
                Los complementos de pago también se descargan con las emitidas.
              </p>
            </div>
          )}
        </Step>

        <Step n={2} title="Lo que cobraste" description="En RESICO solo cuenta el dinero que ya te pagaron en el mes, no lo que facturaste.">
          <IncomeTable flows={calc.flows} pending={calc.pending} />
        </Step>

        <Step
          n={3}
          title="ISR"
          description="RESICO no tiene deducciones: pagas un porcentaje fijo de lo que cobraste, según cuánto fue."
        >
          <IsrBreakdown isr={calc.isr} />
        </Step>

        <Step n={4} title="IVA" description="El IVA no es tuyo: entregas al SAT el que cobraste, menos el que te retuvieron.">
          <div className="grid gap-6 md:grid-cols-2">
            <IvaBreakdown iva={calc.iva} creditIva={creditIva} />
            <div className="grid min-w-0 content-start gap-4">
              <CreditIvaToggle checked={creditIva} potential={potentialCreditable(calc.flows)} onChange={setCreditIva} />
              <Field label="Saldo a favor de IVA de meses anteriores (opcional)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={balanceInput ?? String(saved?.iva.previousBalance || "")}
                  onChange={(e) => setBalanceInput(e.target.value)}
                  placeholder="0.00"
                />
              </Field>
            </div>
          </div>
          <ExpenseList flows={calc.flows} creditIva={creditIva} onToggle={toggleExpense} />
        </Step>

        <Step n={5} title="Revisa y autoriza" description="Si los números te cuadran, la extensión los captura en el SAT. Tú revisas y presionas Enviar.">
          <div className="max-w-md text-sm">
            <Line label="ISR a pagar" value={calc.isr.due} />
            <Line label={calc.iva.result >= 0 ? "IVA a pagar" : "IVA a pagar (tienes saldo a favor)"} value={Math.max(0, calc.iva.result)} />
            <Line op="=" label="Total" value={calc.totalDue} strong />
          </div>
          {busy ? (
            <div className="grid gap-2">
              <div className="flex justify-between text-sm">
                <span>{busy.status}</span>
                <Button size="sm" variant="ghost" onClick={() => (cancelled.current = true)}>
                  <X /> Cancelar
                </Button>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-accent transition-all" style={{ width: `${busy.percent}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {!profile?.resicoActivity && (
                <p className="w-full text-sm text-muted-foreground">
                  Elige tu tipo de ingreso en <Link className="underline" to="/profile">Perfil</Link>: el SAT pide clasificar lo que cobraste
                  (se usará actividad empresarial).
                </p>
              )}
              <Button onClick={authorizeAndFill} disabled={!rfc || status === "presentada"}>
                <Send /> Autorizar y llenar en el SAT
              </Button>
              <p className="text-xs text-muted-foreground">
                La extensión no envía la declaración: una declaración enviada solo se corrige con una complementaria.
              </p>
            </div>
          )}
        </Step>

        {saved?.satPrefill && (
          <Card>
            <CardHeader>
              <CardTitle>Lo que el SAT tenía vs. lo que calculamos</CardTitle>
              <CardDescription>
                No te guíes solo por el prellenado: el SAT a veces trae menos ingresos de los que cobraste (o toma PPD por fecha de factura), y
                el IVA de tus gastos casi nunca viene. Declara lo que realmente cobraste. El portal captura pesos sin centavos.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <CompareTable diffs={compareValues(saved.satPrefill, ours)} missing={saved.missingFields ?? []} />
              {saved.manualSteps && saved.manualSteps.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20 text-sm">
                  <p className="mb-1 font-medium">Termina esto a mano en el portal antes de enviar:</p>
                  <ol className="list-decimal space-y-1 pl-5">
                    {saved.manualSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {status === "presentada" && saved ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-green-600" /> Declaración presentada
              </CardTitle>
              <CardDescription>Paga con la línea de captura en tu banco antes de su vigencia.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {saved.operationNumber && <p>Número de operación: <span className="font-mono">{saved.operationNumber}</span></p>}
              {saved.captureLine && <p>Línea de captura: <span className="font-mono">{saved.captureLine}</span></p>}
              {saved.amountDue !== undefined && <p>Importe: {money(saved.amountDue)}</p>}
              {saved.captureLineDueDate && <p>Vigencia: {saved.captureLineDueDate}</p>}
            </CardContent>
          </Card>
        ) : (
          status === "llenada" &&
          !busy && (
            <Card>
              <CardHeader>
                <CardTitle>¿Ya la enviaste?</CardTitle>
                <CardDescription>Si la app no pudo leer el acuse, copia los datos aquí.</CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4 sm:grid-cols-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveManualAcuse(new FormData(e.currentTarget));
                  }}
                >
                  <Field label="Número de operación">
                    <Input name="operationNumber" />
                  </Field>
                  <Field label="Línea de captura">
                    <Input name="captureLine" required />
                  </Field>
                  <Button type="submit" className="self-end">
                    Guardar
                  </Button>
                </form>
              </CardContent>
            </Card>
          )
        )}
      </div>
    </>
  );
}
