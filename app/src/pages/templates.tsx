import { useLiveQuery } from "dexie-react-hooks";
import { Link, useNavigate } from "react-router-dom";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportLegacyDialog } from "@/features/bills/import-legacy-dialog";
import { IssueInSatDialog } from "@/features/bills/issue-in-sat-dialog";
import { formatCurrency } from "@/lib/bill-calc";
import { alive, db, newId, save, softDelete } from "@/lib/db";
import type { Template } from "@/lib/types";

export function TemplatesPage() {
  const templates = useLiveQuery(async () => alive(await db.templates.orderBy("alias").toArray()), [], []);

  const navigate = useNavigate();

  async function onDuplicate(template: Template) {
    const id = newId();
    await save<Template>(db.templates, {
      id,
      alias: `${template.alias} (copia)`,
      bill: structuredClone(template.bill),
    });
    toast.success("Plantilla duplicada");
    navigate(`/templates/${id}`);
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    await softDelete(db.templates, id);
    toast.success("Plantilla eliminada");
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageTitle title="Plantillas" description="Facturas que emites seguido, listas para mandar al SAT en un clic." />
        <div className="flex gap-2">
          <ImportLegacyDialog />
          <Button asChild>
            <Link to="/templates/new">
              <Plus /> Nueva plantilla
            </Link>
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Crea una plantilla con los datos de tu cliente y el concepto que facturas cada mes, o importa el JSON que usabas en el popup.
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
                <Button variant="ghost" size="icon" onClick={() => onDuplicate(t)} aria-label="Duplicar">
                  <Copy />
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
