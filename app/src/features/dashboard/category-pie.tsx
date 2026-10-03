import { useState } from "react";
import type { CategorySlice } from "@/lib/dashboard";
import { useHideAmounts } from "@/lib/privacy";

const SIZE = 200;
const R = 90;
const INNER = 54;

function colorOf(slice: CategorySlice, i: number) {
  return slice.key === "__otros" ? "var(--category-other)" : `var(--category-${(i % 6) + 1})`;
}

function arc(start: number, end: number): string {
  const c = SIZE / 2;
  const pt = (a: number, r: number) => `${c + r * Math.sin(a)},${c - r * Math.cos(a)}`;
  const large = end - start > Math.PI ? 1 : 0;
  return `M${pt(start, R)}A${R},${R} 0 ${large} 1 ${pt(end, R)}L${pt(end, INNER)}A${INNER},${INNER} 0 ${large} 0 ${pt(start, INNER)}Z`;
}

export function CategoryPie({ data, label }: { data: CategorySlice[]; label: string }) {
  const { money, hide } = useHideAmounts();
  const [hover, setHover] = useState<number | null>(null);
  const total = data.reduce((a, s) => a + s.total, 0);

  let angle = 0;
  const slices = data.map((s, i) => {
    const sweep = (s.total / total) * Math.PI * 2;
    // Un solo origen ocupa el círculo completo; un arco de 360° no se dibuja.
    const path = data.length === 1 ? arc(0, Math.PI * 2 - 0.0001) : arc(angle, angle + sweep);
    angle += sweep;
    return { s, i, path };
  });
  const active = hover === null ? null : data[hover];

  return (
    <div className="flex flex-wrap items-center justify-center gap-6 sm:justify-start">
      <svg width={SIZE} height={SIZE} role="img" aria-label={label} className="shrink-0">
        {slices.map(({ s, i, path }) => (
          <path
            key={s.key}
            d={path}
            fill={colorOf(s, i)}
            stroke="hsl(var(--background))"
            strokeWidth={2}
            opacity={hover === null || hover === i ? 1 : 0.45}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">
          {active ? `${Math.round((active.total / total) * 100)}%` : "Total"}
        </text>
        <text x={SIZE / 2} y={SIZE / 2 + 14} textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
          {hide ? "••••" : money(active ? active.total : total).replace(/\.\d\d$/, "")}
        </text>
      </svg>
      <ul className="grid min-w-0 flex-1 basis-64 gap-2 text-sm" aria-label="Leyenda">
        {data.map((s, i) => (
          <li
            key={s.key}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="flex min-w-0 max-w-full items-center gap-2">
              <span className="size-3 shrink-0 rounded-sm" style={{ background: colorOf(s, i) }} aria-hidden />
              <span className="min-w-0 truncate" title={s.name}>
                {s.name}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {s.count} {s.count === 1 ? "factura" : "facturas"}
              </span>
            </span>
            <span className="ml-5 tabular-nums sm:ml-0">
              {money(s.total)}
              <span className="ml-2 text-xs text-muted-foreground">{Math.round((s.total / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
