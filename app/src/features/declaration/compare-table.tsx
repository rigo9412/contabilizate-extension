import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useHideAmounts } from "@/lib/privacy";
import type { FieldDiff } from "@/lib/sat-declaration";
import { cn } from "@/lib/utils";

/** El portal captura pesos enteros: menos de un peso de diferencia es redondeo. */
const significant = (diff: number | null) => diff !== null && Math.abs(diff) >= 1;

export function CompareTable({ diffs, missing }: { diffs: FieldDiff[]; missing: string[] }) {
  const { money } = useHideAmounts();
  const fmt = (key: string, value: number | null) =>
    value === null ? "—" : key === "isr.tasa" ? `${value.toFixed(2)}%` : money(value);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Concepto</TableHead>
          <TableHead className="text-right">El SAT prellenó</TableHead>
          <TableHead className="text-right">Contabilizate</TableHead>
          <TableHead className="text-right">Diferencia</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {diffs.map((d) => (
          <TableRow key={d.key} className={cn(significant(d.diff) && "bg-amber-50 dark:bg-amber-950/20")}>
            <TableCell>
              {d.label}
              {missing.includes(d.key) && <span className="block text-xs text-destructive">No se encontró: captúralo a mano</span>}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt(d.key, d.sat)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(d.key, d.ours)}</TableCell>
            <TableCell className="text-right tabular-nums">{significant(d.diff) ? fmt(d.key, d.diff) : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
