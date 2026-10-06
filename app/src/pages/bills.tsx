import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { FileUp, Pencil, Plus, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IssueInSatDialog } from "@/features/bills/issue-in-sat-dialog";
import { formatCurrency } from "@/lib/bill-calc";
import { typeCFDI } from "@/lib/catalogs";
import { importCfdiXml } from "@/lib/bill-import";
import { isExpense, isIncome, MONTH_LABELS } from "@/lib/dashboard";
import { alive, db, PROFILE_ID, softDelete } from "@/lib/db";
import type { Bill } from "@/lib/types";

export function BillsPage() {
  const bills = useLiveQuery(async () => alive(await db.bills.orderBy("date").reverse().toArray()), [], []);
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID));
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [rfc, setRfc] = useState("");
  const [month, setMonth] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Arrastrar y soltar: el contador evita que el aviso parpadee al pasar sobre elementos hijos.
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes("Files");

  // Si sueltan el archivo fuera de la zona, que el navegador no abra el XML y saque de la app.
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
    const xmls = Array.from(e.dataTransfer.files).filter((f) => /\.xml$/i.test(f.name) || f.type.includes("xml"));
    const skipped = e.dataTransfer.files.length - xmls.length;
    if (skipped > 0) toast.warning(skipped === 1 ? "1 archivo no es XML y se omitió" : `${skipped} archivos no son XML y se omitieron`);
    onImportXml(xmls);
  }

  async function onImportXml(files: FileList | File[] | null) {
    if (!files?.length) return;
    setImporting(true);
    let ok = 0;
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      try {
        await importCfdiXml(await file.text());
        ok++;
      } catch {
        failed.push(file.name);
      }
    }
    setImporting(false);
    if (fileInput.current) fileInput.current.value = "";
    if (ok > 0) toast.success(ok === 1 ? "1 factura importada" : `${ok} facturas importadas`);
    if (failed.length > 0) toast.error(`No se pudieron leer: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`);
  }

  // RFC de las contrapartes que ya existen en tus facturas (sin el tuyo): "RFC" → nombre.
  const rfcOptions = useMemo(() => {
    const own = profile?.rfc;
    const found: Record<string, string> = {};
    for (const b of bills) {
      for (const [id, name] of [[b.rfcEmisor, b.nameEmisor], [b.rfcReceptor, b.nameReceptor]]) {
        if (!id || id === own) continue;
        if (!found[id] || (name && found[id] === id)) found[id] = name || id;
      }
    }
    return found;
  }, [bills, profile?.rfc]);

  // Meses que tienen facturas: "2026-03" → "Mar 2026".
  const monthOptions = useMemo(() => {
    const found: Record<string, string> = {};
    for (const b of bills) {
      const key = b.date.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(key)) found[key] = `${MONTH_LABELS[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`;
    }
    return found;
  }, [bills]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const own = profile?.rfc ?? "";
    return bills.filter((b) => {
      if (kind === "incomes" && !isIncome(b, own)) return false;
      if (kind === "expenses" && !isExpense(b, own)) return false;
      if (month && !b.date.startsWith(month)) return false;
      if (rfc && b.rfcEmisor !== rfc && b.rfcReceptor !== rfc) return false;
      if (!q) return true;
      return [b.rfcReceptor, b.rfcEmisor, b.nameReceptor, b.nameEmisor, b.description, b.folio].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [bills, query, kind, rfc, month, profile?.rfc]);

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar esta factura de tus registros? No se cancela en el SAT.")) return;
    await softDelete(db.bills, id);
    toast.success("Factura eliminada");
  }

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
          <p className="font-medium">Suelta tus XML para agregarlos a Facturas</p>
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageTitle title="Facturas" description="Tus facturas emitidas y recibidas. Arrastra aquí tus XML para importarlos." />
        <div className="flex gap-2">
          <input
            ref={fileInput}
            type="file"
            accept=".xml,text/xml,application/xml"
            multiple
            hidden
            onChange={(e) => onImportXml(e.target.files)}
          />
          <Button variant="outline" isLoading={importing} onClick={() => fileInput.current?.click()}>
            <FileUp /> Importar XML
          </Button>
          <Button asChild>
            <Link to="/bills/new">
              <Plus /> Nueva factura
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <Input placeholder="Buscar por RFC, cliente, concepto o folio" value={query} onChange={(e) => setQuery(e.target.value)} />
            <NativeSelect
              className="sm:w-40"
              aria-label="Tipo"
              placeholder="Ingresos y gastos"
              showKey={false}
              value={kind}
              options={{ expenses: "Gastos", incomes: "Ingresos" }}
              onChange={(e) => setKind(e.target.value)}
            />
            <NativeSelect
              className="sm:w-36"
              aria-label="Mes"
              placeholder="Todos los meses"
              showKey={false}
              value={month}
              options={monthOptions}
              onChange={(e) => setMonth(e.target.value)}
            />
            <NativeSelect
              className="sm:w-64"
              aria-label="RFC"
              placeholder="Todos los RFC"
              value={rfc}
              options={rfcOptions}
              onChange={(e) => setRfc(e.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {bills.length === 0
                ? "Aún no tienes facturas. Arrastra aquí tus XML, impórtalos con el botón o descárgalos del SAT."
                : "Ninguna factura coincide con la búsqueda."}
            </p>
          ) : (
            <>
              {/* En pantallas chicas, tarjetas: la tabla escondería el concepto. */}
              <ul className="divide-y rounded-md border md:hidden">
                {filtered.map((bill) => {
                  const issued = !!profile?.rfc && bill.rfcEmisor === profile.rfc;
                  return (
                    <li key={bill.id} className="grid gap-1 p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 break-words font-medium">{counterpart(bill, issued)}</span>
                        <span className="shrink-0 whitespace-nowrap tabular-nums">{formatCurrency(bill.total, bill.currency)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {bill.date.slice(0, 10)} · {issued ? bill.rfcReceptor : bill.rfcEmisor}
                      </div>
                      <BillConcepts bill={bill} />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <BillBadges bill={bill} issued={issued} />
                        <BillActions bill={bill} onDelete={onDelete} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Contraparte y concepto</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-32" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((bill) => {
                    const issued = !!profile?.rfc && bill.rfcEmisor === profile.rfc;
                    return (
                      <TableRow key={bill.id}>
                        <TableCell className="whitespace-nowrap align-top">{bill.date.slice(0, 10)}</TableCell>
                        <TableCell className="align-top">
                          <BillBadges bill={bill} issued={issued} />
                        </TableCell>
                        <TableCell className="whitespace-normal break-words">
                          <div className="font-medium">{counterpart(bill, issued)}</div>
                          <div className="text-xs text-muted-foreground">{issued ? bill.rfcReceptor : bill.rfcEmisor}</div>
                          <div className="mt-1">
                            <BillConcepts bill={bill} />
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right align-top">{formatCurrency(bill.total, bill.currency)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right align-top">
                          <BillActions bill={bill} onDelete={onDelete} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Conceptos completos de la factura, para reconocer de qué es cada gasto o ingreso. */
function BillConcepts({ bill }: { bill: Bill }) {
  if (bill.typeBill === "P") {
    const paid = bill.payments ?? [];
    return (
      <span className="text-sm text-muted-foreground">
        Complemento de pago{paid.length > 0 && ` de ${paid.length} factura${paid.length > 1 ? "s" : ""}`}
      </span>
    );
  }
  const concepts = bill.items.map((i) => i.description).filter(Boolean);
  if (concepts.length === 0) return <span className="text-sm">{bill.description || "—"}</span>;
  if (concepts.length === 1) return <span className="text-sm">{concepts[0]}</span>;
  return (
    <ul className="list-disc space-y-0.5 pl-4 text-sm">
      {concepts.map((c, i) => (
        <li key={i}>{c}</li>
      ))}
    </ul>
  );
}

const counterpart = (bill: Bill, issued: boolean) => (issued ? bill.nameReceptor || bill.rfcReceptor : bill.nameEmisor || bill.rfcEmisor);

function BillBadges({ bill, issued }: { bill: Bill; issued: boolean }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge variant={issued ? "primary" : "secondary"}>
        {typeCFDI[bill.typeBill] ?? bill.typeBill} {issued ? "emitida" : "recibida"}
      </Badge>
      {bill.cancelled && <Badge variant="destructive">Cancelada</Badge>}
    </div>
  );
}

function BillActions({ bill, onDelete }: { bill: Bill; onDelete: (id: string) => void }) {
  return (
    <div className="flex justify-end">
      <IssueInSatDialog
        bill={bill}
        trigger={
          <Button variant="ghost" size="icon" aria-label="Emitir de nuevo en el SAT">
            <Send />
          </Button>
        }
      />
      <Button variant="ghost" size="icon" asChild aria-label="Editar">
        <Link to={`/bills/${bill.id}`}>
          <Pencil />
        </Link>
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onDelete(bill.id)} aria-label="Eliminar">
        <Trash2 />
      </Button>
    </div>
  );
}
