import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/page-title";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IssueInSatDialog } from "@/features/bills/issue-in-sat-dialog";
import { formatCurrency } from "@/lib/bill-calc";
import { typeCFDI } from "@/lib/catalogs";
import { alive, db, PROFILE_ID, softDelete } from "@/lib/db";

export function BillsPage() {
  const bills = useLiveQuery(async () => alive(await db.bills.orderBy("date").reverse().toArray()), [], []);
  const profile = useLiveQuery(() => db.profile.get(PROFILE_ID));
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bills;
    return bills.filter((b) =>
      [b.rfcReceptor, b.rfcEmisor, b.nameReceptor, b.description, b.folio].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [bills, query]);

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar esta factura de tus registros? No se cancela en el SAT.")) return;
    await softDelete(db.bills, id);
    toast.success("Factura eliminada");
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageTitle title="Facturas" description="Tus facturas emitidas y recibidas." />
        <Button asChild>
          <Link to="/bills/new">
            <Plus /> Nueva factura
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6">
          <Input placeholder="Buscar por RFC, cliente, concepto o folio" value={query} onChange={(e) => setQuery(e.target.value)} />
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {bills.length === 0 ? "Aún no tienes facturas registradas." : "Ninguna factura coincide con la búsqueda."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Contraparte</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((bill) => {
                  const issued = !!profile?.rfc && bill.rfcEmisor === profile.rfc;
                  return (
                    <TableRow key={bill.id}>
                      <TableCell className="whitespace-nowrap">{bill.date.slice(0, 10)}</TableCell>
                      <TableCell>
                        <Badge variant={issued ? "primary" : "secondary"}>
                          {typeCFDI[bill.typeBill] ?? bill.typeBill} {issued ? "emitida" : "recibida"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{issued ? bill.nameReceptor : bill.rfcEmisor}</div>
                        <div className="text-xs text-muted-foreground">{issued ? bill.rfcReceptor : ""}</div>
                      </TableCell>
                      <TableCell className="max-w-56 truncate">{bill.description}</TableCell>
                      <TableCell className="text-right">{formatCurrency(bill.total, bill.currency)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
