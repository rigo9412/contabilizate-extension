import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { IssueInSatDialog } from "@/features/bills/issue-in-sat-dialog";
import { formatCurrency } from "@/lib/bill-calc";
import { alive, db, softDelete } from "@/lib/db";

export function TemplatesPage() {
  const templates = useLiveQuery(async () => alive(await db.templates.orderBy("alias").toArray()), [], []);

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await softDelete(db.templates, id);
    toast.success("Plantilla eliminada");
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageTitle title="Plantillas" description="Facturas que emites seguido, listas para mandar al SAT en un clic." />
        <Button asChild>
          <Link to="/templates/new">
            <Plus /> Nueva plantilla
          </Link>
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Crea una plantilla con los datos de tu cliente y el concepto que facturas cada mes.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col">
              <CardHeader>
                <CardTitle>{t.alias}</CardTitle>
                <CardDescription>
                  {t.bill.nameReceptor} · {t.bill.rfcReceptor}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 text-sm">
                <p className="line-clamp-2 text-muted-foreground">{t.bill.description}</p>
                <p className="mt-2 text-2xl font-bold">{formatCurrency(t.bill.total, t.bill.currency)}</p>
              </CardContent>
              <CardFooter className="gap-2">
                <IssueInSatDialog bill={t.bill} />
                <Button variant="ghost" size="icon" asChild aria-label="Editar">
                  <Link to={`/templates/${t.id}`}>
                    <Pencil />
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(t.id)} aria-label="Eliminar">
                  <Trash2 />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
