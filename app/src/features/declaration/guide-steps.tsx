import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHideAmounts } from "@/lib/privacy";
import { RESICO_ISR_BRACKETS, type CashFlow, type PendingPpd } from "@/lib/resico";
import type { IsrResico, IvaResico } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Step({ n, title, description, children }: { n: number; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span>
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

/** Renglón de una operación: "− ISR que te retuvieron  $375.00". */
export function Line({ op, label, value, strong, hint }: { op?: string; label: string; value: number; strong?: boolean; hint?: string }) {
  const { money } = useHideAmounts();
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1", strong && "border-t pt-2 font-semibold")}>
      <span className="flex min-w-0">
        {op && <span className="w-5 shrink-0 text-muted-foreground">{op}</span>}
        <span className="min-w-0">
          {label}
          {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">{money(value)}</span>
    </div>
  );
}

const shortDate = (d: string) => d.slice(0, 10);
const baseOf = (f: CashFlow) => f.base16 + f.base8 + f.base0 + f.exempt + f.notObject;

export function IncomeTable({ flows, pending }: { flows: CashFlow[]; pending: PendingPpd[] }) {
  const { money } = useHideAmounts();
  const incomes = flows.filter((f) => f.kind === "income");
  return (
    <>
      {incomes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay cobros este mes. Si sí cobraste, descarga tus facturas emitidas del SAT.</p>
      ) : (
        <>
          {/* En pantallas chicas, tarjetas: la tabla escondería el concepto. */}
          <ul className="divide-y rounded-md border md:hidden">
            {incomes.map((f) => (
              <li key={`${f.paymentId ?? ""}${f.billId}`} className="grid gap-0.5 p-3 text-sm">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 break-words font-medium">{f.counterpart}</span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums">{money(baseOf(f))}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {shortDate(f.date)} · {f.source}
                  {f.estimated && " · estimado"}
                </span>
                {f.description && <span className="break-words">{f.description}</span>}
                <span className="text-xs tabular-nums text-muted-foreground">
                  IVA {money(f.iva)} · Retenciones {money(f.retIsr + f.retIva)}
                </span>
              </li>
            ))}
          </ul>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente y concepto</TableHead>
                <TableHead>Origen</TableHead>
                <TableHead className="text-right">Sin IVA</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Retenciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incomes.map((f) => (
                <TableRow key={`${f.paymentId ?? ""}${f.billId}`}>
                  <TableCell className="whitespace-nowrap align-top">{shortDate(f.date)}</TableCell>
                  <TableCell className="whitespace-normal break-words">
                    <div className="font-medium">{f.counterpart}</div>
                    {f.description && <div className="text-xs text-muted-foreground">{f.description}</div>}
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge variant={f.source === "PUE" ? "secondary" : "outline"}>{f.source}</Badge>
                    {f.estimated && <Badge variant="outline" className="ml-1 border-amber-400 text-amber-700">estimado</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right align-top tabular-nums">{money(baseOf(f))}</TableCell>
                  <TableCell className="whitespace-nowrap text-right align-top tabular-nums">{money(f.iva)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right align-top tabular-nums">{money(f.retIsr + f.retIva)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
      {pending.length > 0 && (
        <div className="rounded-md border border-dashed p-3 text-sm">
          <p className="font-medium">Pendientes de cobro (PPD)</p>
          <p className="mb-2 text-muted-foreground">
            Estas facturas no cuentan todavía: cuentan el mes en que te paguen y emitas su complemento de pago.
          </p>
          <ul className="grid gap-2">
            {pending.map((p) => (
              <li key={p.billId} className="grid gap-0.5">
                <span className="flex flex-wrap justify-between gap-x-4">
                  <span className="min-w-0 break-words">
                    {shortDate(p.date)} · {p.counterpart}
                  </span>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-muted-foreground">
                    cobrado {money(p.paid)} de {money(p.total)}
                  </span>
                </span>
                {p.description && <span className="break-words text-xs text-muted-foreground">{p.description}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function IsrBreakdown({ isr }: { isr: IsrResico }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="text-sm">
        <Line label="Lo que cobraste sin IVA" value={isr.income} />
        <Line op="×" label={`Tasa RESICO ${(isr.rate * 100).toFixed(2)}%`} value={isr.tax} hint="ISR del mes" />
        <Line op="−" label="ISR que te retuvieron empresas" value={isr.retained} hint="Las personas morales te retienen 1.25%" />
        <Line op="=" label="ISR a pagar" value={isr.due} strong />
        {isr.retained > isr.tax && (
          <p className="mt-2 text-xs text-muted-foreground">
            Te retuvieron más de lo que causaste: este mes no pagas ISR y la diferencia se recupera en la declaración anual.
          </p>
        )}
      </div>
      <table className="text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-1 font-normal">Si cobras al mes hasta</th>
            <th className="pb-1 text-right font-normal">pagas</th>
          </tr>
        </thead>
        <tbody>
          {RESICO_ISR_BRACKETS.map((b) => (
            <tr key={b.upTo} className={cn(b.rate === isr.rate && "bg-accent/30 font-semibold")}>
              <td className="px-1 py-0.5 tabular-nums">{b.upTo.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</td>
              <td className="px-1 py-0.5 text-right tabular-nums">{(b.rate * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IvaBreakdown({ iva, creditIva }: { iva: IvaResico; creditIva: boolean }) {
  return (
    <div className="text-sm">
      <Line label="IVA que cobraste a tus clientes" value={iva.translated} />
      <Line op="−" label="IVA que te retuvieron empresas" value={iva.retained} hint="Dos terceras partes del IVA" />
      {creditIva && <Line op="−" label="IVA de tus gastos" value={iva.creditable} hint="Solo los marcados que cumplen requisitos" />}
      {iva.previousBalance > 0 && <Line op="−" label="Saldo a favor de meses anteriores" value={iva.previousBalance} />}
      <Line op="=" label={iva.result >= 0 ? "IVA a pagar" : "Saldo a favor (no pagas)"} value={Math.abs(iva.result)} strong />
    </div>
  );
}

export function CreditIvaToggle({
  checked,
  potential,
  onChange,
}: {
  checked: boolean;
  potential: number;
  onChange: (checked: boolean) => void;
}) {
  const { money } = useHideAmounts();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm hover:bg-secondary/60">
      <input type="checkbox" className="mt-1 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="grid gap-1">
        <span className="font-medium">
          Acreditar el IVA de mis gastos{potential > 0 && <span className="font-normal text-muted-foreground"> · hasta {money(potential)}</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          Apagado es lo más común en RESICO: si te retienen IVA, lo que pagas ya es poco y acreditar suele dejar saldo a favor que solo
          se recupera pidiendo devolución (y eso trae revisión). Actívalo si tus gastos son 100% de tu actividad, con factura uso G03 y
          pagados con tarjeta o transferencia.
        </span>
      </span>
    </label>
  );
}

export function ExpenseList({
  flows,
  creditIva,
  onToggle,
}: {
  flows: CashFlow[];
  creditIva: boolean;
  onToggle: (billId: string, count: boolean) => void;
}) {
  const { money } = useHideAmounts();
  const expenses = flows.filter((f) => f.kind === "expense");
  if (expenses.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay gastos pagados este mes. Descarga tus facturas recibidas para verlos aquí.</p>;
  }
  return (
    <div className="grid min-w-0 gap-2">
      <div>
        <p className="text-sm font-medium">Tus gastos del mes</p>
        <p className="text-xs text-muted-foreground">
          {creditIva
            ? "Desmarca los gastos personales: solo se acredita el IVA de los gastos de tu actividad que cumplen requisitos."
            : "Solo para que los revises: con el acreditamiento apagado no cambian lo que pagas."}
        </p>
      </div>
      <ul className="divide-y rounded-md border">
        {expenses.map((f) => {
          const credited = creditIva && !f.excluded && !f.ineligible;
          return (
            <li key={`${f.paymentId ?? ""}${f.billId}`}>
              <label className={cn("flex cursor-pointer items-start gap-3 p-3 text-sm hover:bg-secondary/60", f.excluded && "text-muted-foreground")}>
                <input type="checkbox" className="mt-1 shrink-0" checked={!f.excluded} onChange={(e) => onToggle(f.billId, e.target.checked)} />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="min-w-0 break-words font-medium">{f.counterpart}</span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums">{money(f.total)}</span>
                  </span>
                  <span className="break-words text-xs text-muted-foreground">
                    {shortDate(f.date)}
                    {f.source !== "PUE" && ` · ${f.source}`}
                    {f.description && ` · ${f.description}`}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <span className="tabular-nums">IVA {money(f.iva)}</span>
                    {f.excluded ? (
                      <Badge variant="outline">Personal: no cuenta</Badge>
                    ) : f.ineligible ? (
                      <span className="text-amber-700 dark:text-amber-400">⚠ {f.ineligible}</span>
                    ) : (
                      credited && <Badge variant="primary">Se acredita</Badge>
                    )}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
