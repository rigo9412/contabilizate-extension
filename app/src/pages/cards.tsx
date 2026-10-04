import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChartPie, Eye, EyeOff, FileUp, Trash2, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { flattenMovements, topMerchants } from "@/lib/card-movements";
import { MONTH_LABELS } from "@/lib/dashboard";
import { alive, db, softDelete } from "@/lib/db";
import { PdfPasswordError } from "@/lib/pdf-text";
import { useHideAmounts } from "@/lib/privacy";
import { importStatementPdf } from "@/lib/statement-import";
import type { CardStatement } from "@/lib/types";

function monthLabel(key: string): string {
  return `${MONTH_LABELS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

export function CardsPage() {
  const statements = useLiveQuery(
    async () => alive(await db.statements.orderBy("periodEnd").reverse().toArray()),
    [],
    [],
  );
  const { hide, toggle, money } = useHideAmounts();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("charges");
  const [card, setCard] = useState("");
  const [month, setMonth] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Arrastrar y soltar: el contador evita que el aviso parpadee al pasar sobre elementos hijos.
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  // Si sueltan el archivo fuera de la zona, que el navegador no abra el PDF y saque de la app.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  function onDragEnter(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current++;
    setDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const pdfs = Array.from(e.dataTransfer.files).filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    const skipped = e.dataTransfer.files.length - pdfs.length;
    if (skipped > 0) toast.warning(skipped === 1 ? "1 archivo no es PDF y se omitió" : `${skipped} archivos no son PDF y se omitieron`);
    onImportPdf(pdfs);
  }

  /** Importa un PDF; si tiene contraseña la pide hasta que sea correcta o el usuario cancele. */
  async function importOne(file: File) {
    let password: string | undefined;
    for (;;) {
      try {
        return await importStatementPdf(file, password);
      } catch (err) {
        if (!(err instanceof PdfPasswordError)) throw err;
        const typed = prompt(`${err.message}. Escribe la contraseña de ${file.name}:`);
        if (typed === null) throw err;
        password = typed;
      }
    }
  }

  async function onImportPdf(files: FileList | File[] | null) {
    if (!files?.length) return;
    setImporting(true);
    for (const file of Array.from(files)) {
      try {
        const { statement, warnings } = await importOne(file);
        toast.success(
          `${statement.cardName} ···${statement.cardLast4}: ${statement.movements.length} movimientos (corte ${statement.periodEnd})`,
        );
        for (const warning of warnings) toast.warning(`${file.name}: ${warning}`);
      } catch (err) {
        toast.error(`${file.name}: ${(err as Error).message}`);
      }
    }
    setImporting(false);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onDelete(statement: CardStatement) {
    if (!confirm(`¿Eliminar el estado de cuenta con corte ${statement.periodEnd} y sus movimientos?`)) return;
    await softDelete(db.statements, statement.id);
    toast.success("Estado de cuenta eliminado");
  }

  const rows = useMemo(() => flattenMovements(statements), [statements]);

  const cardOptions = useMemo(
    () => Object.fromEntries(statements.map((s) => [s.cardLast4, `${s.cardName} ···${s.cardLast4}`])),
    [statements],
  );

  // Meses con movimientos (por fecha de operación): "2026-03" → "Mar 2026".
  const monthOptions = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.date.slice(0, 7), monthLabel(r.date)])),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind === "charges" && r.amount <= 0) return false;
      if (kind === "payments" && r.amount >= 0) return false;
      if (card && r.cardLast4 !== card) return false;
      if (month && !r.date.startsWith(month)) return false;
      return !q || r.description.toLowerCase().includes(q);
    });
  }, [rows, query, kind, card, month]);

  const totals = useMemo(
    () => ({
      charges: filtered.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0),
      payments: filtered.filter((r) => r.amount < 0).reduce((a, r) => a - r.amount, 0),
    }),
    [filtered],
  );
  const merchants = useMemo(() => topMerchants(filtered), [filtered]);
  const latest = statements[0];

  return (
    <div
      className="relative min-h-[60vh]"
      onDragEnter={onDragEnter}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-background/90 text-primary">
          <Upload className="size-8" />
          <p className="font-medium">Suelta tus estados de cuenta en PDF</p>
        </div>
      )}
      <PageTitle
        title="Tarjetas de crédito"
        description="Concentra los gastos de tus tarjetas. Arrastra aquí tus estados de cuenta de BBVA o Nu en PDF."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={toggle} aria-pressed={hide}>
              {hide ? <Eye /> : <EyeOff />} {hide ? "Mostrar montos" : "Ocultar montos"}
            </Button>
            {statements.length > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link to="/cards/analysis">
                  <ChartPie /> Analizar gastos
                </Link>
              </Button>
            )}
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              hidden
              onChange={(e) => onImportPdf(e.target.files)}
            />
            <Button size="sm" isLoading={importing} onClick={() => fileInput.current?.click()}>
              <FileUp /> Importar estado de cuenta
            </Button>
          </div>
        }
      />

      {statements.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Aún no tienes estados de cuenta. Descarga el PDF desde la app de BBVA o de Nu y arrástralo aquí.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Gastos</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{money(totals.charges)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Según los filtros seleccionados</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Pagos y abonos</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{money(totals.payments)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">Según los filtros seleccionados</CardContent>
            </Card>
            {latest && (
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Pago para no generar intereses</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">{money(latest.paymentNoInterest ?? 0)}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  ···{latest.cardLast4}
                  {latest.dueDate && ` · fecha límite ${latest.dueDate}`}
                </CardContent>
              </Card>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estados de cuenta</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarjeta</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead className="text-right">Cargos</TableHead>
                    <TableHead className="text-right">Abonos</TableHead>
                    <TableHead className="text-right">Movimientos</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statements.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.cardName}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.bank} ···{s.cardLast4}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {s.periodStart} al {s.periodEnd}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(s.totalCharges)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(s.totalPayments)}</TableCell>
                      <TableCell className="text-right">{s.movements.length}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => onDelete(s)} aria-label="Eliminar">
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[1fr_auto_auto_auto]">
                <div className="sm:col-span-3 lg:col-span-1">
                  <Input placeholder="Buscar comercio" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <NativeSelect
                  className="lg:w-40"
                  aria-label="Tipo"
                  placeholder="Cargos y abonos"
                  showKey={false}
                  value={kind}
                  options={{ charges: "Gastos", payments: "Pagos y abonos" }}
                  onChange={(e) => setKind(e.target.value)}
                />
                <NativeSelect
                  className="lg:w-36"
                  aria-label="Mes"
                  placeholder="Todos los meses"
                  showKey={false}
                  value={month}
                  options={monthOptions}
                  onChange={(e) => setMonth(e.target.value)}
                />
                <NativeSelect
                  className="lg:w-56"
                  aria-label="Tarjeta"
                  placeholder="Todas las tarjetas"
                  showKey={false}
                  value={card}
                  options={cardOptions}
                  onChange={(e) => setCard(e.target.value)}
                />
              </div>

              {merchants.length > 0 && kind !== "payments" && (
                <div className="grid gap-2">
                  <h2 className="text-sm font-medium">Dónde más gastas</h2>
                  <ul className="grid gap-1.5 text-sm">
                    {merchants.map((m) => (
                      <li key={m.name} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
                        <span className="min-w-0 truncate" title={m.name}>
                          {m.name}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {m.count} {m.count === 1 ? "compra" : "compras"}
                          </span>
                        </span>
                        <span className="tabular-nums">{money(m.total)}</span>
                        <span className="col-span-2 h-1.5 rounded-full bg-secondary">
                          <span
                            className="block h-full rounded-full bg-primary"
                            style={{ width: `${(m.total / merchants[0].total) * 100}%` }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Ningún movimiento coincide con la búsqueda.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Tarjeta</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="whitespace-nowrap">{r.date}</TableCell>
                        <TableCell>
                          <div>{r.description}</div>
                          {r.foreignCurrency && !hide && (
                            <div className="text-xs text-muted-foreground">
                              {r.foreignCurrency} {r.foreignAmount?.toFixed(2)} · tipo de cambio {r.exchangeRate}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {r.bank} ···{r.cardLast4}
                          {r.digitalCard && (
                            <Badge variant="secondary" className="ml-2">
                              Digital ···{r.digitalCard}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums ${r.amount < 0 ? "text-green-600" : ""}`}>
                          {money(r.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
