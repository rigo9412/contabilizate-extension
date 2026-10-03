import { useState } from "react";
import { FileJson, TriangleAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/bill-calc";
import { db, newId, PROFILE_ID, save } from "@/lib/db";
import { fromLegacyJson, legacyJsonFromStorage, parseLegacyJson, type LegacyBillJson, type LegacyImport } from "@/lib/legacy-import";
import type { Template } from "@/lib/types";

interface Candidate extends LegacyImport {
  alias: string;
}

/** Importa plantillas en el formato JSON del popup clásico. */
export function ImportLegacyDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  async function load(list: LegacyBillJson[]) {
    const profile = await db.profile.get(PROFILE_ID);
    setCandidates(
      list.map((json) => ({ ...fromLegacyJson(json, profile ?? {}), alias: json.razonSocial || "Plantilla importada" })),
    );
  }

  async function onPreview() {
    try {
      await load(parseLegacyJson(text));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    setText(content);
    try {
      await load(parseLegacyJson(content));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function onFromPopup() {
    const json = legacyJsonFromStorage(await chrome.storage.local.get(null));
    if (!json) {
      toast.error("El popup no tiene ninguna factura cargada");
      return;
    }
    setText(JSON.stringify(json, null, 2));
    await load([json]);
  }

  async function onImport() {
    for (const c of candidates) {
      await save<Template>(db.templates, { id: newId(), alias: c.alias.trim() || "Plantilla importada", bill: c.bill });
    }
    toast.success(candidates.length === 1 ? "Plantilla importada" : `${candidates.length} plantillas importadas`);
    setOpen(false);
    setText("");
    setCandidates([]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileJson /> Importar JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar plantilla del popup</DialogTitle>
          <DialogDescription>
            Pega el JSON que usabas en "Cargar JSON" (un objeto o una lista), sube el archivo, o toma la factura que
            el popup tiene cargada ahora.
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <div className="grid gap-3">
            <textarea
              className="min-h-48 w-full rounded-md border border-input bg-transparent p-3 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder='{ "rfc": "XAXX010101000", "razonSocial": "...", "concepto": { ... } }'
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={onPreview} disabled={!text.trim()}>
                Revisar
              </Button>
              <Button type="button" variant="outline" onClick={onFromPopup}>
                Usar lo cargado en el popup
              </Button>
              <Input type="file" accept=".json,application/json" className="max-w-60" onChange={(e) => onFile(e.target.files?.[0])} />
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            {candidates.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-lg border p-3">
                <Input
                  value={c.alias}
                  aria-label="Nombre de la plantilla"
                  onChange={(e) => setCandidates((list) => list.map((x, j) => (j === i ? { ...x, alias: e.target.value } : x)))}
                />
                <p className="text-sm text-muted-foreground">
                  {c.bill.rfcReceptor} · {c.bill.items[0]?.description}
                </p>
                <p className="text-sm">
                  Total calculado: <span className="font-semibold">{formatCurrency(c.bill.total)}</span>
                </p>
                {c.warnings.length > 0 && (
                  <ul className="grid gap-1 rounded-md bg-secondary p-3 text-sm">
                    {c.warnings.map((w) => (
                      <li key={w} className="flex items-start gap-2">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {candidates.some((c) => c.warnings.some((w) => w.includes("con las tasas"))) && (
              <p className="text-xs text-muted-foreground">
                La app calcula los totales a partir de las tasas. Si el SAT te da otros totales, el llenado no sellará
                la factura; revisa las retenciones de la plantilla después de importarla.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {candidates.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => setCandidates([])}>
              Atrás
            </Button>
          )}
          <Button type="button" onClick={onImport} disabled={candidates.length === 0}>
            Importar {candidates.length > 1 ? `${candidates.length} plantillas` : "plantilla"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
