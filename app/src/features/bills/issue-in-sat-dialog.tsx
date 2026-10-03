import { useState } from "react";
import { Link } from "react-router-dom";
import { Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency, withTotals } from "@/lib/bill-calc";
import { months, periodicities } from "@/lib/catalogs";
import { resolveGlobalInfo } from "@/lib/cfdi-rules";
import { issueInSat, toLegacyBill } from "@/lib/sat-fill";
import type { BillDraft } from "@/lib/types";
import { useVaultStatus } from "@/lib/use-vault-status";

/**
 * Confirma antes de mandar la factura al portal: el script de llenado la sella
 * en cuanto los totales coinciden, así que esto emite una factura real.
 */
export function IssueInSatDialog({ bill, trigger }: { bill: BillDraft; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const vaultStatus = useVaultStatus();
  const draft = withTotals(bill);
  const { entries, errors } = toLegacyBill(draft);
  const global = resolveGlobalInfo(draft);

  async function onConfirm() {
    if (!entries) return;
    await issueInSat(entries);
    setOpen(false);
    toast.success("Abriendo el portal del SAT para emitir la factura");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button">
            <Send /> Emitir en el SAT
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Emitir factura en el SAT</DialogTitle>
          <DialogDescription>
            Se abrirá el portal del SAT, se llenará el formulario y, si los totales coinciden, la factura se sellará
            automáticamente.
          </DialogDescription>
        </DialogHeader>

        {errors.length > 0 ? (
          <ul className="grid gap-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Cliente</dt>
            <dd>
              {draft.nameReceptor} ({draft.rfcReceptor})
            </dd>
            <dt className="text-muted-foreground">Concepto</dt>
            <dd>{draft.items[0]?.description}</dd>
            {global && (
              <>
                <dt className="text-muted-foreground">Factura global</dt>
                <dd>
                  {periodicities[global.periodicidad]} · {months[global.meses]} {global.anio}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Total</dt>
            <dd className="font-semibold">{formatCurrency(draft.total)}</dd>
          </dl>
        )}

        {vaultStatus === "locked" && (
          <p className="flex items-start gap-2 rounded-md bg-secondary p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              Tu e.firma está bloqueada, así que tendrás que iniciar sesión en el SAT a mano.{" "}
              <Link to="/profile" className="underline">
                Desbloquearla
              </Link>
            </span>
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!entries} onClick={onConfirm}>
            Emitir y sellar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
