import { useEffect, useRef, useState } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CardSeries } from "@/lib/card-movements";
import type { MonthSummary } from "@/lib/dashboard";
import { useHideAmounts } from "@/lib/privacy";

const INCOME = { label: "Ingresos", color: "var(--series-income)" };

/** Las tarjetas usan la paleta categórica sin el verde de ingresos (--category-1). */
function cardColor(i: number) {
  return i < 5 ? `var(--category-${i + 2})` : "var(--category-other)";
}

const HEIGHT = 260;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 56 };
const BAR_MAX = 24;
const BAR_GAP = 2;
const RADIUS = 4;

const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

/** Margen: lo que queda de los ingresos tras los pagos a tarjetas (las facturas de gasto no se restan). */
const MARGIN_SERIES = { label: "Margen", color: "hsl(var(--foreground))" };

/** Escala "bonita" con ~4 divisiones (pasos 1/2/2.5/5 × 10ⁿ); incluye el 0 y baja si hay negativos. */
function niceTicks(min: number, max: number): number[] {
  min = Math.min(min, 0);
  max = Math.max(max, 0);
  if (max - min <= 0) return [0, 1000, 2000, 3000, 4000];
  const raw = (max - min) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const lo = Math.floor(min / step);
  const hi = Math.ceil(max / step);
  return Array.from({ length: hi - lo + 1 }, (_, i) => (lo + i) * step);
}

/** Segmento intermedio de una barra apilada: rectángulo sin redondear. */
function rectPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  return `M${x},${y + h}V${y}H${x + w}V${y + h}Z`;
}

/** Barra con la punta redondeada y la base cuadrada sobre el eje. */
function barPath(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function IncomeChart({
  data,
  year,
  cards = [],
}: {
  data: MonthSummary[];
  year: number;
  /** Abonos a tarjetas por mes; se apilan en la segunda barra (gastos). */
  cards?: CardSeries[];
}) {
  const { money, hide } = useHideAmounts();
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

  const cardTotal = (i: number) => cards.reduce((a, c) => a + c.months[i], 0);
  const margins = data.map((d, i) => Math.round((d.incomes - cardTotal(i)) * 100) / 100);
  const marginTotal = Math.round(margins.reduce((a, m) => a + m, 0) * 100) / 100;
  const ticks = niceTicks(
    Math.min(...margins),
    Math.max(...data.flatMap((d, i) => [d.incomes, cardTotal(i)])),
  );
  const bottom = ticks[0];
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 100);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const band = plotW / data.length;
  const barW = Math.min(BAR_MAX, (band * 0.7 - BAR_GAP) / 2);
  const y = (v: number) => MARGIN.top + plotH - ((v - bottom) / (top - bottom)) * plotH;
  const cxOf = (i: number) => MARGIN.left + band * i + band / 2;
  const hovered = hover === null ? null : data[hover];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex gap-4 text-sm text-muted-foreground" aria-label="Leyenda">
          <li className="flex items-center gap-2">
            <span className="size-3 rounded-sm" style={{ background: INCOME.color }} aria-hidden />
            {INCOME.label}
          </li>
          {cards.map((c, i) => (
            <li key={c.key} className="flex items-center gap-2">
              <span className="size-3 rounded-sm" style={{ background: cardColor(i) }} aria-hidden />
              {c.label}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="h-0.5 w-3 rounded-full" style={{ background: MARGIN_SERIES.color }} aria-hidden />
            {MARGIN_SERIES.label}
          </li>
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
              {cards.map((c) => (
                <TableHead key={c.key} className="text-right">
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="text-right">{MARGIN_SERIES.label}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((d, i) => (
              <TableRow key={d.month}>
                <TableCell>{d.label}</TableCell>
                <TableCell className="text-right tabular-nums">{money(d.incomes)}</TableCell>
                {cards.map((c) => (
                  <TableCell key={c.key} className="text-right tabular-nums">
                    {money(c.months[i])}
                  </TableCell>
                ))}
                <TableCell className={`text-right tabular-nums ${margins[i] < 0 ? "text-destructive" : ""}`}>
                  {money(margins[i])}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-medium">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">{money(data.reduce((a, d) => a + d.incomes, 0))}</TableCell>
              {cards.map((c) => (
                <TableCell key={c.key} className="text-right tabular-nums">
                  {money(c.months.reduce((a, v) => a + v, 0))}
                </TableCell>
              ))}
              <TableCell className={`text-right tabular-nums ${marginTotal < 0 ? "text-destructive" : ""}`}>
                {money(marginTotal)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      ) : (
        <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={HEIGHT} role="img" aria-label={`Ingresos, pagos a tarjetas y margen por mes de ${year}`}>
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
                  {hide ? "••" : t === 0 ? "$0" : `$${compact.format(t)}`}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = cxOf(i);
              return (
                <g key={d.month} opacity={hover === null || hover === i ? 1 : 0.45}>
                  <path d={barPath(cx - barW - BAR_GAP / 2, y(d.incomes), barW, y(0) - y(d.incomes))} fill={INCOME.color} />
                  {/* Pagos a tarjetas: un segmento por tarjeta; solo la punta se redondea. */}
                  {(() => {
                    const x = cx + BAR_GAP / 2;
                    const segments = cards.map((c, k) => ({ key: c.key, v: c.months[i], color: cardColor(k) })).filter((seg) => seg.v > 0);
                    let base = 0;
                    return segments.map((seg, k) => {
                      const y0 = y(base);
                      base += seg.v;
                      const y1 = y(base);
                      const draw = k === segments.length - 1 ? barPath : rectPath;
                      return <path key={seg.key} d={draw(x, y1, barW, y0 - y1)} fill={seg.color} />;
                    });
                  })()}
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
            {/* Línea de margen encima de las barras; no captura el mouse para no tapar las zonas de hover. */}
            <g className="pointer-events-none">
              <polyline
                points={margins.map((m, i) => `${cxOf(i)},${y(m)}`).join(" ")}
                fill="none"
                stroke={MARGIN_SERIES.color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {margins.map((m, i) => (
                <circle
                  key={i}
                  cx={cxOf(i)}
                  cy={y(m)}
                  r={hover === i ? 4.5 : 3}
                  fill={m < 0 ? "hsl(var(--destructive))" : MARGIN_SERIES.color}
                  stroke="hsl(var(--background))"
                  strokeWidth={1.5}
                />
              ))}
            </g>
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
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="size-2 rounded-sm" style={{ background: INCOME.color }} aria-hidden />
                  {INCOME.label}
                </span>
                <span className="tabular-nums">{money(hovered.incomes)}</span>
              </div>
              {cards
                .map((c, k) => ({ c, k, v: c.months[hover!] }))
                .filter(({ v }) => v > 0)
                .map(({ c, k, v }) => (
                  <div key={c.key} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 rounded-sm" style={{ background: cardColor(k) }} aria-hidden />
                      {c.label}
                    </span>
                    <span className="tabular-nums">{money(v)}</span>
                  </div>
                ))}
              <div className="mt-1 flex items-center justify-between gap-3 border-t pt-1 font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-2 rounded-full" style={{ background: MARGIN_SERIES.color }} aria-hidden />
                  {MARGIN_SERIES.label}
                </span>
                <span className={`tabular-nums ${margins[hover!] < 0 ? "text-destructive" : ""}`}>
                  {money(margins[hover!])}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
