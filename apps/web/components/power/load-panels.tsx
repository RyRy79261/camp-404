import type { LoadBand } from "@camp404/core";
import { Card, CardContent } from "@camp404/ui/components/card";
import { cn } from "@camp404/ui/lib/utils";

// A row of headline figures (kpi-cards, as KpiCards on the captain Overview)
// and the generator load bands' colours, shared by the transport page and the
// Power and Lighting team program's power glance. The Power program itself
// opens each section on a plain sentence instead (components/power/power-ui).

export interface PowerKpi {
  key: string;
  label: string;
  value: string;
  /** A second figure beside the value, such as the kVA. */
  secondary?: string;
  /** The current the figure draws, such as "6.2 A at 230 V". */
  current?: string;
  hint: string;
  /** A caveat under the hint, such as "assumes everything on at once". */
  note?: string;
}

export function PowerKpiCards({
  kpis,
  label = "Load at a glance",
  className,
}: {
  kpis: PowerKpi[];
  label?: string;
  /** The grid's columns, when the row is not four wide. */
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn(
        "grid gap-4 page-sm:grid-cols-2 page-lg:grid-cols-4",
        className,
      )}
    >
      {kpis.map((kpi) => (
        <Card
          key={kpi.key}
          role="article"
          aria-labelledby={`kpi-${kpi.key}`}
          className="h-full"
        >
          <CardContent className="flex flex-col gap-1 p-5">
            <span
              id={`kpi-${kpi.key}`}
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              {kpi.label}
            </span>
            <span className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-3xl font-bold tabular-nums">
                {kpi.value}
              </span>
              {kpi.secondary && (
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {kpi.secondary}
                </span>
              )}
            </span>
            {kpi.current && (
              <span className="text-sm font-semibold tabular-nums">
                {kpi.current}
              </span>
            )}
            <span className="text-xs text-muted-foreground">{kpi.hint}</span>
            {kpi.note && (
              <span className="text-xs font-medium text-warning">
                {kpi.note}
              </span>
            )}
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export const BAND_BAR: Record<LoadBand, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
};

export const BAND_TEXT: Record<LoadBand, string> = {
  green: "Comfortable",
  amber: "Working hard",
  red: "Too close to the limit",
};
