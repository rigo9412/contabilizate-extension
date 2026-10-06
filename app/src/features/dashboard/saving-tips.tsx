import type { ReactNode } from "react";
import { Info, PiggyBank } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useHideAmounts } from "@/lib/privacy";
import type { Recommendation } from "@/lib/spending-analysis";

/** Recomendaciones de ahorro, ordenadas por lo que más ahorran; el detalle va en el tooltip. */
export function SavingTips({
  recommendations,
  potentialSaving,
  description,
  actions,
  className,
}: {
  recommendations: Recommendation[];
  potentialSaving?: number;
  description: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const { hide, money } = useHideAmounts();
  // Las recomendaciones traen montos en el texto; en modo privado se tapan.
  const text = (value: string) => (hide ? value.replace(/\$[\d,.]+/g, "$ ••••") : value);

  return (
    <Card className={className}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="grid gap-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <PiggyBank className="size-4" /> Cómo ahorrar
            {!!potentialSaving && (
              <Badge variant="primary" className="tabular-nums">
                ~{money(potentialSaving)}/mes
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {actions}
      </CardHeader>
      <CardContent>
        {recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No encontramos gastos fuera de lo normal. Sigue importando tus estados de cuenta para ver tendencias.
          </p>
        ) : (
          <ol className="grid gap-x-6 sm:grid-cols-2">
            {recommendations.map((r) => (
              <li
                key={r.id}
                title={text(r.detail)}
                className="flex cursor-help items-center justify-between gap-2 border-b py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{r.title}</span>
                  <Info className="size-3.5 shrink-0 text-muted-foreground" aria-label={text(r.detail)} />
                </span>
                {r.monthlySaving > 0 && (
                  <Badge variant="primary" className="shrink-0 tabular-nums">
                    {r.upTo ? "hasta " : "~"}
                    {money(r.monthlySaving)}/mes
                  </Badge>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
