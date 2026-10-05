import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { netIncome, savingsRate, type MonthSummary } from "@/lib/dashboard";
import { useHideAmounts } from "@/lib/privacy";

/** Desglose de cómo se obtiene el porcentaje ahorrado, mes por mes y en el año. */
export function HealthBreakdown({
  months,
  cardByMonth,
  year,
}: {
  months: MonthSummary[];
  /** Pagos a tarjetas por mes (índice 0 = enero). */
  cardByMonth: number[];
  year: number;
}) {
  const { money } = useHideAmounts();
  const pct = (rate: number | null) => (rate === null ? "—" : `${rate}%`);
  const rows = months.map((m, i) => {
    const net = netIncome(m);
    const spent = cardByMonth[i] ?? 0;
    return {
      label: m.label,
      incomes: m.incomes,
      iva: m.taxesTranslated,
      net,
      spent,
      left: net - spent,
      rate: savingsRate(net, spent),
    };
  });
  const sum = (key: "incomes" | "iva" | "net" | "spent") =>
    rows.reduce((a, r) => a + r[key], 0);
  const total = {
    incomes: sum("incomes"),
    iva: sum("iva"),
    net: sum("net"),
    spent: sum("spent"),
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Info /> ¿Cómo se calcula?
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Porcentaje ahorrado {year}</DialogTitle>
          <DialogDescription>
            Ahorrado = (ingresos − IVA trasladado − pagos a tarjetas) ÷
            (ingresos − IVA trasladado). El IVA no cuenta como ingreso porque es
            del SAT; las facturas de gasto no se restan.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">− IVA</TableHead>
                <TableHead className="text-right">= Netos</TableHead>
                <TableHead className="text-right">− Pagos</TableHead>
                <TableHead className="text-right">= Te queda</TableHead>
                <TableHead className="text-right">% ahorrado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell>{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(r.incomes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(r.iva)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(r.net)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(r.spent)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${r.left < 0 ? "text-destructive" : ""}`}
                  >
                    {money(r.left)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(r.rate)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-medium">
                <TableCell>Año</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(total.incomes)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(total.iva)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(total.net)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(total.spent)}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${total.net - total.spent < 0 ? "text-destructive" : ""}`}
                >
                  {money(total.net - total.spent)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {pct(savingsRate(total.net, total.spent))}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
