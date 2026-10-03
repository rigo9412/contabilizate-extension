import { Field } from "@/components/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { localDate } from "@/lib/auto-dates";
import { computeTotals, formatCurrency } from "@/lib/bill-calc";
import { GLOBAL_RECEPTOR_NAME, receptorErrors, RFC_GENERIC } from "@/lib/cfdi-rules";
import { cfdiUsages, currency, months, paymentForms, paymentMethods, periodicities, taxRegimes, typeCFDI } from "@/lib/catalogs";
import type { BillDraft, GlobalInfo } from "@/lib/types";
import { TriangleAlert } from "lucide-react";
import { ItemsEditor } from "./item-editor";

export function emptyBill(rfcEmisor = "", postalCodeEmisor = ""): BillDraft {
  return {
    date: localDate(),
    typeBill: "I",
    typePayment: "03",
    paymentMethod: "PUE",
    currency: "MXN",
    version: "4.0",
    rfcEmisor,
    postalCodeEmisor,
    rfcReceptor: "",
    nameReceptor: "",
    postalCodeReceptor: "",
    useCFDIReceptor: "G03",
    typeReceptorRegistration: "",
    subtotal: 0,
    totalTaxesTranslated: 0,
    totalTaxesRetention: 0,
    total: 0,
    count: true,
    items: [],
  };
}

/**
 * Formulario de factura compartido por facturas y plantillas. `showBillFields`
 * muestra los datos que solo tienen sentido en una factura ya emitida.
 */
export function BillForm({
  value,
  onChange,
  showBillFields,
}: {
  value: BillDraft;
  onChange: (bill: BillDraft) => void;
  showBillFields: boolean;
}) {
  const set = <K extends keyof BillDraft>(key: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, [key]: key === "rfcReceptor" || key === "rfcEmisor" ? e.target.value.toUpperCase() : e.target.value });
  const totals = computeTotals(value.items);
  const receptorWarnings = receptorErrors(value);
  const isGeneric = (value.rfcReceptor ?? "").trim().toUpperCase() === RFC_GENERIC;

  function toggleGlobal(enabled: boolean) {
    if (!enabled) {
      onChange({ ...value, globalInfo: undefined });
      return;
    }
    // Los datos que el SAT exige al receptor de una factura global.
    onChange({
      ...value,
      globalInfo: { periodicidad: "04", meses: "", anio: "" },
      nameReceptor: GLOBAL_RECEPTOR_NAME,
      typeReceptorRegistration: "616",
      useCFDIReceptor: "S01",
      postalCodeReceptor: value.postalCodeEmisor || value.postalCodeReceptor,
      typeBill: "I",
    });
  }
  const setGlobal = (key: keyof GlobalInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...value, globalInfo: { ...value.globalInfo!, [key]: e.target.value } });

  return (
    <div className="grid gap-6">
      {showBillFields && (
        <Card>
          <CardHeader>
            <CardTitle>Comprobante</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-4">
            <Field label="Fecha">
              <Input type="date" value={value.date.slice(0, 10)} onChange={set("date")} required />
            </Field>
            <Field label="Tipo">
              <NativeSelect value={value.typeBill} options={typeCFDI} onChange={set("typeBill")} />
            </Field>
            <Field label="Folio fiscal (UUID)" className="sm:col-span-2">
              <Input value={value.folio ?? ""} onChange={set("folio")} />
            </Field>
            <Field label="RFC emisor">
              <Input value={value.rfcEmisor} onChange={set("rfcEmisor")} required />
            </Field>
            <Field label="Forma de pago">
              <NativeSelect value={value.typePayment ?? ""} options={paymentForms} onChange={set("typePayment")} />
            </Field>
            <Field label="Método de pago">
              <NativeSelect value={value.paymentMethod ?? ""} options={paymentMethods} onChange={set("paymentMethod")} />
            </Field>
            <Field label="Moneda">
              <NativeSelect value={value.currency ?? "MXN"} options={currency} onChange={set("currency")} />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-4">
              <input type="checkbox" checked={value.count} onChange={(e) => onChange({ ...value, count: e.target.checked })} />
              Contar en el resumen de impuestos
            </label>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cliente (receptor)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <Field label="RFC">
            <Input value={value.rfcReceptor} onChange={set("rfcReceptor")} className="uppercase" required />
          </Field>
          <Field label="Nombre o razón social" className="sm:col-span-2">
            <Input value={value.nameReceptor ?? ""} onChange={set("nameReceptor")} required />
          </Field>
          <Field label="Código postal">
            <Input value={value.postalCodeReceptor ?? ""} onChange={set("postalCodeReceptor")} inputMode="numeric" maxLength={5} required />
          </Field>
          <Field label="Régimen fiscal" className="sm:col-span-2">
            <NativeSelect
              value={value.typeReceptorRegistration ?? ""}
              options={taxRegimes}
              placeholder="Selecciona"
              onChange={set("typeReceptorRegistration")}
              required
            />
          </Field>
          <Field label="Uso del CFDI" className="sm:col-span-2">
            <NativeSelect value={value.useCFDIReceptor ?? ""} options={cfdiUsages} placeholder="Selecciona" onChange={set("useCFDIReceptor")} required />
          </Field>
          {isGeneric && (
            <div className="grid gap-4 rounded-lg border bg-secondary/40 p-4 sm:col-span-4 sm:grid-cols-3">
              <label className="flex items-center gap-2 text-sm font-medium sm:col-span-3">
                <input type="checkbox" checked={!!value.globalInfo} onChange={(e) => toggleGlobal(e.target.checked)} />
                Factura global (ventas al público en general)
              </label>
              {value.globalInfo && (
                <>
                  <Field label="Periodicidad">
                    <NativeSelect value={value.globalInfo.periodicidad} options={periodicities} onChange={setGlobal("periodicidad")} />
                  </Field>
                  <Field label="Mes">
                    <NativeSelect
                      value={value.globalInfo.meses}
                      options={months}
                      placeholder="Automático (según fecha de emisión)"
                      onChange={setGlobal("meses")}
                    />
                  </Field>
                  <Field label="Año">
                    <Input
                      value={value.globalInfo.anio}
                      onChange={setGlobal("anio")}
                      inputMode="numeric"
                      maxLength={4}
                      placeholder="Automático"
                    />
                  </Field>
                </>
              )}
            </div>
          )}
          {receptorWarnings.length > 0 && (
            <ul className="grid gap-1 rounded-md bg-destructive/10 p-3 text-sm text-destructive sm:col-span-4">
              {receptorWarnings.map((w) => (
                <li key={w} className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {w}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conceptos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ItemsEditor items={value.items} onChange={(items) => onChange({ ...value, items })} />
          <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="text-right">{formatCurrency(totals.subtotal)}</dd>
            <dt className="text-muted-foreground">Impuestos trasladados</dt>
            <dd className="text-right">{formatCurrency(totals.totalTaxesTranslated)}</dd>
            <dt className="text-muted-foreground">Impuestos retenidos</dt>
            <dd className="text-right">−{formatCurrency(totals.totalTaxesRetention)}</dd>
            <dt className="font-semibold">Total</dt>
            <dd className="text-right font-semibold">{formatCurrency(totals.total)}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
