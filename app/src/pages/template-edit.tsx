import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BillForm, emptyBill } from "@/features/bills/bill-form";
import { IssueInSatDialog } from "@/features/bills/issue-in-sat-dialog";
import { withTotals } from "@/lib/bill-calc";
import { db, newId, PROFILE_ID, save } from "@/lib/db";
import type { BillDraft, Template } from "@/lib/types";

export function TemplateEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [alias, setAlias] = useState("");
  const [draft, setDraft] = useState<BillDraft | null>(null);

  useEffect(() => {
    (async () => {
      if (id) {
        const template = await db.templates.get(id);
        if (!template || template.deletedAt) {
          toast.error("La plantilla no existe");
          navigate("/templates");
          return;
        }
        setAlias(template.alias);
        setDraft(template.bill);
      } else {
        const profile = await db.profile.get(PROFILE_ID);
        setDraft(emptyBill(profile?.rfc, profile?.postalCode));
      }
    })();
  }, [id, navigate]);

  if (!draft) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    if (draft.items.length === 0) {
      toast.error("Agrega al menos un concepto");
      return;
    }
    await save<Template>(db.templates, { id: id ?? newId(), alias: alias.trim(), bill: withTotals(draft) });
    toast.success("Plantilla guardada");
    navigate("/templates");
  }

  return (
    <form onSubmit={onSubmit}>
      <PageTitle title={id ? "Editar plantilla" : "Nueva plantilla"} />
      <Card className="mb-6">
        <CardContent className="pt-6">
          <Field label="Nombre de la plantilla">
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Cliente ACME · mensualidad" required />
          </Field>
        </CardContent>
      </Card>
      <BillForm value={draft} onChange={setDraft} showBillFields={false} />
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit">Guardar</Button>
        <IssueInSatDialog bill={draft} />
        <Button type="button" variant="ghost" onClick={() => navigate("/templates")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
