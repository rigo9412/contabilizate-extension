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
import { categoryTotals, flattenMovements, monthlyTotals, topMerchants } from "@/lib/card-movements";
import { MONTH_LABELS } from "@/lib/dashboard";
import { alive, db, softDelete } from "@/lib/db";
import { PdfPasswordError } from "@/lib/pdf-text";
import { useHideAmounts } from "@/lib/privacy";
import { importStatementPdf } from "@/lib/statement-import";
import type { CardStatement } from "@/lib/types";

const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

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
  const [category, setCategory] = useState("");
  const [stmtQuery, setStmtQuery] = useState("");
  const [stmtCard, setStmtCard] = useState("");
  const [stmtYear, setStmtYear] = useState("");
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

  // Filtros de la tabla de estados de cuenta: tarjeta, año del corte y texto (periodo, tarjeta, banco).
  const stmtYearOptions = useMemo(
    () => Object.fromEntries(statements.map((s) => [s.periodEnd.slice(0, 4), s.periodEnd.slice(0, 4)])),
    [statements],
  );
  const filteredStatements = useMemo(() => {
    const q = stmtQuery.trim().toLowerCase();
    return statements.filter((s) => {
      if (stmtCard && s.cardLast4 !== stmtCard) return false;
      if (stmtYear && !s.periodEnd.startsWith(stmtYear)) return false;
      return !q || `${s.cardName} ${s.bank} ${s.cardLast4} ${s.periodStart} ${s.periodEnd}`.toLowerCase().includes(q);
    });
  }, [statements, stmtQuery, stmtCard, stmtYear]);

  // Meses con movimientos (por fecha de operación): "2026-03" → "Mar 2026".
  const monthOptions = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.date.slice(0, 7), monthLabel(r.date)])),
    [rows],
  );

  // Filtros sin el mes: alimentan la vista "Gastos por mes", que debe mostrar todos los meses.
  const unmonthed = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind === "charges" && r.amount <= 0) return false;
      if (kind === "payments" && r.amount >= 0) return false;
      if (card && r.cardLast4 !== card) return false;
      if (category && r.categoryKey !== category) return false;
      return !q || r.description.toLowerCase().includes(q);
    });
  }, [rows, query, kind, card, category]);
  const filtered = useMemo(
    () => (month ? unmonthed.filter((r) => r.date.startsWith(month)) : unmonthed),
    [unmonthed, month],
  );
  const byMonth = useMemo(() => monthlyTotals(unmonthed), [unmonthed]);

  // Categorías según card/búsqueda/mes pero sin el filtro de categoría, para poder cambiar de una a otra.
  const categoryScope = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.amount > 0 &&
        (!card || r.cardLast4 === card) &&
        (!month || r.date.startsWith(month)) &&
        (!q || r.description.toLowerCase().includes(q)),
    );
  }, [rows, query, card, month]);
  const categories = useMemo(() => categoryTotals(categoryScope), [categoryScope]);
  const categoryOptions = useMemo(
    () => Object.fromEntries(categoryTotals(rows).map((c) => [c.key, c.name])),
    [rows],
  );
  // Las 6 categorías mayores tienen color propio; el resto comparte el gris.
  const categoryColor = useMemo(() => {
    const colors = new Map<string, string>();
    categoryTotals(unmonthed).forEach((c, i) => colors.set(c.key, i < 6 ? `var(--category-${i + 1})` : "var(--category-other)"));
    return (key: string) => colors.get(key) ?? "var(--category-other)";
  }, [unmonthed]);
  // Por mes, los cargos de cada categoría (segmentos de la columna apilada).
  const monthSegments = useMemo(() => {
    const out = new Map<string, Map<string, number>>();
    for (const r of unmonthed) {
      if (r.amount <= 0) continue;
      const m = r.date.slice(0, 7);
      const segs = out.get(m) ?? new Map<string, number>();
      segs.set(r.categoryKey, (segs.get(r.categoryKey) ?? 0) + r.amount);
      out.set(m, segs);
    }
    return out;
  }, [unmonthed]);
  const showCharges = kind !== "payments";
  const monthMax = Math.max(...byMonth.map((m) => (showCharges ? m.charges : m.payments)), 1);

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
            <CardContent className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                <Input
                  placeholder="Buscar por tarjeta, banco o fecha"
                  value={stmtQuery}
                  onChange={(e) => setStmtQuery(e.target.value)}
                />
                <NativeSelect
                  className="sm:w-56"
                  aria-label="Tarjeta de los estados de cuenta"
                  placeholder="Todas las tarjetas"
                  showKey={false}
                  value={stmtCard}
                  options={cardOptions}
                  onChange={(e) => setStmtCard(e.target.value)}
                />
                <NativeSelect
                  className="sm:w-32"
                  aria-label="Año del corte"
                  placeholder="Todos los años"
                  showKey={false}
                  value={stmtYear}
                  options={stmtYearOptions}
                  onChange={(e) => setStmtYear(e.target.value)}
                />
              </div>
              {filteredStatements.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Ningún estado de cuenta coincide con los filtros.</p>
              ) : (
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
                  {filteredStatements.map((s) => (
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
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-4 pt-6">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-[1fr_auto_auto_auto_auto]">
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
                  className="lg:w-52"
                  aria-label="Categoría"
                  placeholder="Todas las categorías"
                  showKey={false}
                  value={category}
                  options={categoryOptions}
                  onChange={(e) => setCategory(e.target.value)}
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

              {byMonth.length > 0 && (
                <div className="grid gap-3 rounded-lg border bg-muted/30 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-medium">{showCharges ? "Gastos por mes" : "Pagos y abonos por mes"}</h2>
                    <p className="text-xs text-muted-foreground">
                      {month ? (
                        <button type="button" className="underline underline-offset-2" onClick={() => setMonth("")}>
                          Quitar filtro de {monthLabel(month)}
                        </button>
                      ) : (
                        "Haz clic en un mes para filtrar los movimientos"
                      )}
                    </p>
                  </div>
                  <div className="overflow-x-auto pb-1">
                    <ul className="flex min-w-max items-end gap-2">
                      {[...byMonth].reverse().map((m) => {
                        const value = showCharges ? m.charges : m.payments;
                        const selected = month === m.month;
                        return (
                          <li key={m.month} className="w-16 shrink-0">
                            <button
                              type="button"
                              aria-pressed={selected}
                              title={`${monthLabel(m.month)}: ${m.count} ${m.count === 1 ? "movimiento" : "movimientos"}`}
                              onClick={() => setMonth(selected ? "" : m.month)}
                              className={`flex w-full flex-col items-center gap-1 rounded-md px-1 pb-1 pt-2 transition-colors hover:bg-accent ${selected ? "bg-accent ring-1 ring-primary" : ""}`}
                            >
                              <span className="text-[11px] font-medium tabular-nums">{hide ? "••••" : compact.format(value)}</span>
                              <span className="flex h-28 w-full items-end justify-center">
                                <span
                                  className={`flex w-8 flex-col-reverse overflow-hidden rounded-t ${selected || !month ? "" : "opacity-40"}`}
                                  style={{ height: `${Math.max((value / monthMax) * 100, value > 0 ? 3 : 0)}%` }}
                                >
                                  {showCharges ? (
                                    [...(monthSegments.get(m.month) ?? [])]
                                      .sort((a, b) => b[1] - a[1])
                                      .map(([key, amount]) => (
                                        <span
                                          key={key}
                                          style={{ flexGrow: amount, backgroundColor: categoryColor(key) }}
                                        />
                                      ))
                                  ) : (
                                    <span className="flex-1 bg-primary" />
                                  )}
                                </span>
                              </span>
                              <span className="text-xs text-muted-foreground">{monthLabel(m.month)}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              )}

              {categories.length > 0 && kind !== "payments" && (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-medium">En qué gastas{month ? ` · ${monthLabel(month)}` : ""}</h2>
                    {category && (
                      <button type="button" className="text-xs underline underline-offset-2" onClick={() => setCategory("")}>
                        Quitar filtro de categoría
                      </button>
                    )}
                  </div>
                  <ul className="grid gap-1 text-sm">
                    {categories.map((c) => {
                      const selected = category === c.key;
                      const share = categories.reduce((a, x) => a + x.total, 0);
                      return (
                        <li key={c.key}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            onClick={() => setCategory(selected ? "" : c.key)}
                            className={`grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 rounded-md px-2 py-1.5 text-left hover:bg-accent ${selected ? "bg-accent ring-1 ring-primary" : ""}`}
                          >
                            <span className="size-2.5 rounded-full" style={{ backgroundColor: categoryColor(c.key) }} />
                            <span className="min-w-0 truncate">
                              {c.name}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {c.count} {c.count === 1 ? "compra" : "compras"}
                              </span>
                            </span>
                            <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                              {hide ? "" : `${Math.round((c.total / share) * 100)}%`}
                            </span>
                            <span className="w-28 text-right tabular-nums">{money(c.total)}</span>
                            <span className="col-span-4 mt-1 h-1.5 rounded-full bg-secondary">
                              <span
                                className="block h-full rounded-full"
                                style={{ width: `${(c.total / categories[0].total) * 100}%`, backgroundColor: categoryColor(c.key) }}
                              />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

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
                      <TableHead>Categoría</TableHead>
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
                          {r.amount > 0 ? (
                            <span className="inline-flex items-center gap-2 text-sm">
                              <span className="size-2 rounded-full" style={{ backgroundColor: categoryColor(r.categoryKey) }} />
                              {r.categoryName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
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
