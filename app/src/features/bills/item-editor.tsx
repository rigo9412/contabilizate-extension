import { useEffect, useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  computeItem,
  formatCurrency,
  formatRate,
  IVA_RATES,
  ratesOf,
  RET_ISR_RATES,
  RET_IVA_RATES,
  type ItemRates,
} from "@/lib/bill-calc";
import { typeObjectImp, unitMeasure } from "@/lib/catalogs";
import type { BillItem } from "@/lib/types";

const NONE = "";
const rateOptions = (rates: number[]) => Object.fromEntries(rates.map((r) => [String(r), formatRate(r)]));

const EMPTY_ITEM = {
  serviceId: "",
  serviceName: "",
  description: "",
  quantity: 1,
  unitValue: 0,
  unit: "E48",
  unitId: unitMeasure.E48,
  noIdentification: "",
  objectImp: "02",
};
const DEFAULT_RATES: ItemRates = { iva: 0.16, retIva: null, retIsr: null };

type ItemFields = typeof EMPTY_ITEM;

export function ItemsEditor({ items, onChange }: { items: BillItem[]; onChange: (items: BillItem[]) => void }) {
  const [editing, setEditing] = useState<number | null>(items.length === 0 ? -1 : null);

  function commit(item: BillItem) {
    if (editing === null) return;
    onChange(editing === -1 ? [...items, item] : items.map((it, i) => (i === editing ? item : it)));
    setEditing(null);
  }

  return (
    <div className="grid gap-4">
      {items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Concepto</TableHead>
              <TableHead className="text-right">Cant.</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="font-medium">{item.description}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.serviceId} · {item.taxes.map((t) => `${t.section === "traslado" ? "+" : "−"}${formatRate(Number(t.factor))}`).join(" ")}
                  </div>
                </TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.unitValue)}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.subtotal)}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="icon" onClick={() => setEditing(i)} aria-label="Editar concepto">
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onChange(items.filter((_, j) => j !== i))}
                    aria-label="Quitar concepto"
                  >
                    <X />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {editing !== null ? (
        <ItemForm
          key={editing}
          initial={editing >= 0 ? items[editing] : undefined}
          onSave={commit}
          onCancel={items.length > 0 ? () => setEditing(null) : undefined}
        />
      ) : (
        <Button type="button" variant="outline" className="justify-self-start" onClick={() => setEditing(-1)}>
          <Plus /> Agregar concepto
        </Button>
      )}
    </div>
  );
}

function ItemForm({ initial, onSave, onCancel }: { initial?: BillItem; onSave: (item: BillItem) => void; onCancel?: () => void }) {
  const [fields, setFields] = useState<ItemFields>(EMPTY_ITEM);
  const [rates, setRates] = useState<ItemRates>(DEFAULT_RATES);

  useEffect(() => {
    if (!initial) return;
    const { subtotal: _s, taxes: _t, ...rest } = initial;
    setFields({ ...EMPTY_ITEM, ...rest, serviceName: rest.serviceName ?? "" });
    setRates(ratesOf(initial));
  }, [initial]);

  const set = <K extends keyof ItemFields>(key: K, value: ItemFields[K]) => setFields((f) => ({ ...f, [key]: value }));
  const setRate = (key: keyof ItemRates) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setRates((r) => ({ ...r, [key]: e.target.value === NONE ? null : Number(e.target.value) }));
  const preview = computeItem(fields, rates);
  const valid = fields.description.trim() && fields.serviceId.trim() && fields.quantity > 0 && fields.unitValue > 0;

  return (
    <div className="grid gap-4 rounded-lg border bg-secondary/40 p-4 sm:grid-cols-6">
      <Field label="Descripción" className="sm:col-span-6">
        <Input value={fields.description} onChange={(e) => set("description", e.target.value)} placeholder="Servicio de desarrollo de software" />
      </Field>
      <Field label="Clave producto/servicio" className="sm:col-span-2">
        <Input value={fields.serviceId} onChange={(e) => set("serviceId", e.target.value)} placeholder="81111600" />
      </Field>
      <Field label="Nombre en el buscador del SAT" className="sm:col-span-4">
        <Input
          value={fields.serviceName}
          onChange={(e) => set("serviceName", e.target.value)}
          placeholder="Programadores de computador"
        />
      </Field>
      <Field label="Unidad" className="sm:col-span-2">
        <NativeSelect
          value={fields.unit}
          options={unitMeasure}
          onChange={(e) => setFields((f) => ({ ...f, unit: e.target.value, unitId: unitMeasure[e.target.value] ?? "" }))}
        />
      </Field>
      <Field label="Cantidad" className="sm:col-span-1">
        <Input type="number" min="0" step="any" value={fields.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
      </Field>
      <Field label="Precio unitario" className="sm:col-span-2">
        <Input type="number" min="0" step="0.01" value={fields.unitValue} onChange={(e) => set("unitValue", Number(e.target.value))} />
      </Field>
      <Field label="No. identificación" className="sm:col-span-1">
        <Input value={fields.noIdentification} onChange={(e) => set("noIdentification", e.target.value)} placeholder="1" />
      </Field>
      <Field label="Objeto de impuesto" className="sm:col-span-3">
        <NativeSelect value={fields.objectImp} options={typeObjectImp} onChange={(e) => set("objectImp", e.target.value)} />
      </Field>
      <Field label="IVA trasladado" className="sm:col-span-1">
        <NativeSelect value={rates.iva ?? NONE} options={rateOptions(IVA_RATES)} placeholder="No aplica" onChange={setRate("iva")} />
      </Field>
      <Field label="Retención IVA" className="sm:col-span-1">
        <NativeSelect value={rates.retIva ?? NONE} options={rateOptions(RET_IVA_RATES)} placeholder="No aplica" onChange={setRate("retIva")} />
      </Field>
      <Field label="Retención ISR" className="sm:col-span-1">
        <NativeSelect value={rates.retIsr ?? NONE} options={rateOptions(RET_ISR_RATES)} placeholder="No aplica" onChange={setRate("retIsr")} />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
        <Button type="button" disabled={!valid} onClick={() => onSave(preview)}>
          {initial ? "Actualizar concepto" : "Agregar concepto"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <span className="text-sm text-muted-foreground">Importe: {formatCurrency(preview.subtotal)}</span>
      </div>
    </div>
  );
}
