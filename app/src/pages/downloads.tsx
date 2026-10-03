import { localDate } from "@/lib/auto-dates";
import { useRef, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Download, X } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { importCfdiXml } from "@/lib/bill-import";
import { alive, db, newId, save } from "@/lib/db";
import {
  DownloadCancelledError,
  downloadFromSat,
  type DownloadProgress,
  type DownloadRequest,
  type InvoiceType,
} from "@/lib/sat-download";
import type { SatDownload } from "@/lib/types";
import { useVaultStatus } from "@/lib/use-vault-status";

const TYPES: Record<InvoiceType, string> = { emitidas: "Emitidas", recibidas: "Recibidas" };

const today = localDate;
const firstOfMonth = () => today().slice(0, 8) + "01";

export function DownloadsPage() {
  const [request, setRequest] = useState<DownloadRequest>({
    type: "emitidas",
    startDate: firstOfMonth(),
    endDate: today(),
    includePdf: true,
  });
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const cancelled = useRef(false);
  const vaultStatus = useVaultStatus();
  const history = useLiveQuery(async () => alive(await db.downloads.orderBy("updatedAt").reverse().limit(20).toArray()), [], []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (request.startDate > request.endDate) {
      toast.error("La fecha inicial debe ser anterior a la final");
      return;
    }
    cancelled.current = false;
    setProgress({ status: "Abriendo el portal del SAT…", percent: 0, done: 0, total: 0 });
    let status = "completada";
    let count = 0;
    let imported = 0;
    const notImported: string[] = [];
    try {
      const result = await downloadFromSat(request, setProgress, () => cancelled.current, async (xml, info) => {
        // Cada XML descargado también queda en Facturas para el dashboard.
        try {
          await importCfdiXml(xml, { cancelled: info.cancelled });
          imported++;
        } catch (err) {
          console.error("No se pudo importar", info.uuid, err);
          notImported.push(info.uuid);
        }
      });
      count = result.uuids.length;
      if (imported > 0) toast.success(`${imported} facturas agregadas a Facturas`);
      if (notImported.length > 0) toast.warning(`${notImported.length} XML no se pudieron leer`);
      if (result.failed.length > 0) {
        status = "con errores";
        toast.warning(`${count} descargadas, ${result.failed.length} fallaron`);
      } else {
        toast.success(count === 0 ? "No se encontraron facturas en el rango" : `${count} facturas descargadas`);
      }
    } catch (err) {
      status = err instanceof DownloadCancelledError ? "cancelada" : "error";
      toast.error((err as Error).message);
    } finally {
      setProgress(null);
      await save<SatDownload>(db.downloads, {
        id: newId(),
        typeBill: request.type === "emitidas" ? "issued" : "received",
        startDate: request.startDate,
        endDate: request.endDate,
        status,
        numberCFDI: count,
      });
    }
  }

  return (
    <>
      <PageTitle
        title="Descargar facturas"
        description="Descarga el XML y el PDF de tus CFDI del portal del SAT a Descargas/contabilizate y los agrega a Facturas."
      />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Nueva descarga</CardTitle>
            <CardDescription>
              Se abre una pestaña del portal del SAT. {vaultStatus === "locked"
                ? "Tu e.firma está bloqueada: si el SAT pide iniciar sesión, hazlo a mano en esa pestaña."
                : "Si el SAT pide iniciar sesión, la extensión entra con tu e.firma."}{" "}
              Deja esta pestaña abierta mientras termina.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-4">
              <Field label="Tipo">
                <NativeSelect
                  value={request.type}
                  options={TYPES}
                  showKey={false}
                  disabled={!!progress}
                  onChange={(e) => setRequest((r) => ({ ...r, type: e.target.value as InvoiceType }))}
                />
              </Field>
              <Field label="Desde">
                <Input type="date" value={request.startDate} disabled={!!progress} onChange={(e) => setRequest((r) => ({ ...r, startDate: e.target.value }))} required />
              </Field>
              <Field label="Hasta">
                <Input type="date" value={request.endDate} disabled={!!progress} onChange={(e) => setRequest((r) => ({ ...r, endDate: e.target.value }))} required />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={request.includePdf}
                  disabled={!!progress}
                  onChange={(e) => setRequest((r) => ({ ...r, includePdf: e.target.checked }))}
                />
                Incluir PDF
              </label>
              <div className="flex gap-2 sm:col-span-4">
                {progress ? (
                  <Button type="button" variant="destructive" onClick={() => (cancelled.current = true)}>
                    <X /> Cancelar
                  </Button>
                ) : (
                  <Button type="submit">
                    <Download /> Descargar
                  </Button>
                )}
              </div>
            </form>

            {progress && (
              <div className="mt-6 grid gap-2">
                <div className="flex justify-between text-sm">
                  <span>{progress.status}</span>
                  <span className="text-muted-foreground">{progress.percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} />
                </div>
                {progress.total > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {progress.done} de {progress.total} facturas
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Facturas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{new Date(d.updatedAt).toLocaleString("es-MX")}</TableCell>
                      <TableCell>{d.typeBill === "issued" ? "Emitidas" : "Recibidas"}</TableCell>
                      <TableCell>
                        {d.startDate} → {d.endDate}
                      </TableCell>
                      <TableCell>
                        <Badge variant={d.status === "completada" ? "primary" : "secondary"}>{d.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{d.numberCFDI}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
