import { CalendarClock, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect } from "@/components/ui/native-select";
import { applyAutoDates, detectDates, END_TOKEN, hasTokens, PERIODS, START_TOKEN, WHICH } from "@/lib/auto-dates";
import type { AutoDates, BillDraft } from "@/lib/types";

export const DEFAULT_AUTO_DATES: AutoDates = { enabled: false, period: "quincena", which: "actual" };

/** Configura las fechas que cambian solas en la descripción de una plantilla. */
export function AutoDatesCard({
  value,
  onChange,
  bill,
  onBillChange,
}: {
  value: AutoDates;
  onChange: (value: AutoDates) => void;
  bill: BillDraft;
  onBillChange: (bill: BillDraft) => void;
}) {
  const withTokens = bill.items.some((i) => hasTokens(i.description));
  const detectable = !withTokens && bill.items.some((i) => detectDates(i.description));
  const preview = applyAutoDates(bill, { ...value, enabled: true });

  function onConvert() {
    let period: AutoDates["period"] | undefined;
    const items = bill.items.map((item) => {
      const detected = detectDates(item.description);
      if (!detected) return item;
      period ??= detected.period;
      return { ...item, description: detected.text };
    });
    onBillChange({ ...bill, items });
    onChange({ ...value, enabled: true, period: period ?? value.period });
    toast.success("Fechas convertidas en automáticas");
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-5" /> Fechas automáticas
        </CardTitle>
        <CardDescription>
          Escribe {START_TOKEN} y {END_TOKEN} en la descripción del concepto y se reemplazan por el periodo que
          corresponde a la fecha en que emites la factura.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />
          Activar fechas automáticas en la descripción
        </label>

        {detectable && (
          <div className="flex flex-wrap items-center gap-3 rounded-md bg-secondary p-3 text-sm">
            <span>La descripción tiene fechas fijas.</span>
            <Button type="button" size="sm" variant="outline" onClick={onConvert}>
              <Wand2 /> Convertirlas en automáticas
            </Button>
          </div>
        )}

        {value.enabled && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Periodo">
                <NativeSelect
                  value={value.period}
                  options={PERIODS}
                  showKey={false}
                  onChange={(e) => onChange({ ...value, period: e.target.value as AutoDates["period"] })}
                />
              </Field>
              <Field label="¿Cuál periodo?">
                <NativeSelect
                  value={value.which}
                  options={WHICH}
                  showKey={false}
                  onChange={(e) => onChange({ ...value, which: e.target.value as AutoDates["which"] })}
                />
              </Field>
            </div>
            {withTokens ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="text-xs text-muted-foreground">Si emites hoy, la descripción será:</div>
                {preview.items.map((item, i) => (
                  <p key={i}>{item.description}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Ningún concepto usa {START_TOKEN} o {END_TOKEN} todavía.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
