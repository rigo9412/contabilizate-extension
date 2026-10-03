import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import { BillForm, emptyBill } from "@/features/bills/bill-form";
import { IssueInSatDialog } from "@/features/bills/issue-in-sat-dialog";
import { withTotals } from "@/lib/bill-calc";
import { db, newId, PROFILE_ID, save } from "@/lib/db";
import type { Bill, BillDraft, Template } from "@/lib/types";

export function BillEditPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [draft, setDraft] = useState<BillDraft | null>(null);

  useEffect(() => {
    (async () => {
      if (id) {
        const bill = await db.bills.get(id);
        if (!bill || bill.deletedAt) {
          toast.error("La factura no existe");
          navigate("/bills");
          return;
        }
        const { id: _id, updatedAt: _u, deletedAt: _d, ...rest } = bill;
        setDraft(rest);
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
    await save<Bill>(db.bills, { ...withTotals(draft), id: id ?? newId() });
    toast.success("Factura guardada");
    navigate("/bills");
  }

  async function onSaveAsTemplate() {
    if (!draft) return;
    const alias = prompt("Nombre de la plantilla", draft.nameReceptor ?? "");
    if (!alias) return;
    await save<Template>(db.templates, { id: newId(), alias, bill: withTotals(draft) });
    toast.success("Plantilla creada");
  }

  return (
    <form onSubmit={onSubmit}>
      <PageTitle title={isNew ? "Nueva factura" : "Editar factura"} description="Registro local; no se envía al SAT hasta que tú lo emitas." />
      <BillForm value={draft} onChange={setDraft} showBillFields />
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit">Guardar</Button>
        <Button type="button" variant="outline" onClick={onSaveAsTemplate}>
          <LayoutTemplate /> Guardar como plantilla
        </Button>
        <IssueInSatDialog bill={draft} />
        <Button type="button" variant="ghost" onClick={() => navigate("/bills")}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
