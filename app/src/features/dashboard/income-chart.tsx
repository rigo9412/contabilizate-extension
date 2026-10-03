import { useEffect, useRef, useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/bill-calc";
import type { MonthSummary } from "@/lib/dashboard";

const SERIES = [
  { key: "incomes", label: "Ingresos", color: "var(--series-income)" },
  { key: "expenses", label: "Gastos", color: "var(--series-expense)" },
] as const;

const HEIGHT = 260;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 56 };
const BAR_MAX = 24;
const BAR_GAP = 2;
const RADIUS = 4;

const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

/** Escala "bonita": 4 divisiones con pasos 1/2/2.5/5 × 10ⁿ. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1000, 2000, 3000, 4000];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  return Array.from({ length: 5 }, (_, i) => i * step);
}

/** Barra con la punta redondeada y la base cuadrada sobre el eje. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function IncomeChart({ data, year }: { data: MonthSummary[]; year: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [showTable]);

  const ticks = niceTicks(Math.max(...data.flatMap((d) => [d.incomes, d.expenses])));
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 100);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = plotW / data.length;
  const barW = Math.min(BAR_MAX, (band * 0.7 - BAR_GAP) / 2);
  const y = (v: number) => MARGIN.top + plotH - (v / top) * plotH;
  const hovered = hover === null ? null : data[hover];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex gap-4 text-sm text-muted-foreground" aria-label="Leyenda">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="size-3 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
          {showTable ? <BarChart3 /> : <Table2 />} {showTable ? "Ver gráfica" : "Ver tabla"}
        </Button>
      </div>

      {showTable ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mes {year}</TableHead>
              <TableHead className="text-right">Ingresos</TableHead>
              <TableHead className="text-right">Gastos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((d) => (
              <TableRow key={d.month}>
                <TableCell>{d.label}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(d.incomes)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatCurrency(d.expenses)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={HEIGHT} role="img" aria-label={`Ingresos y gastos por mes de ${year}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="hsl(var(--border))"
                  strokeDasharray={t === 0 ? undefined : "2 4"}
                />
                <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px]">
                  {t === 0 ? "$0" : `$${compact.format(t)}`}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = MARGIN.left + band * i + band / 2;
              return (
                <g key={d.month} opacity={hover === null || hover === i ? 1 : 0.45}>
                  {SERIES.map((s, j) => {
                    const v = d[s.key];
                    const x = cx - barW - BAR_GAP / 2 + j * (barW + BAR_GAP);
                    return <path key={s.key} d={barPath(x, y(v), barW, y(0) - y(v))} fill={s.color} />;
                  })}
                  <text x={cx} y={HEIGHT - 8} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                    {d.label}
                  </text>
                  {/* Zona de hover: toda la columna del mes, más grande que las barras. */}
                  <rect
                    x={MARGIN.left + band * i}
                    y={MARGIN.top}
                    width={band}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                  />
                </g>
              );
            })}
          </svg>
          {hovered && (
            <div
              className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-md border bg-background p-2 text-xs shadow-md"
              style={{
                left: Math.min(MARGIN.left + band * hover! + band / 2 + 12, width - 170),
              }}
            >
              <div className="mb-1 font-medium">
                {hovered.label} {year}
              </div>
              {SERIES.map((s) => (
                <div key={s.key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                    {s.label}
                  </span>
                  <span className="tabular-nums">{formatCurrency(hovered[s.key])}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
