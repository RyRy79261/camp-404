import type { LoadBand, PowerBreakdownRow } from "@camp404/core";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@camp404/ui/components/table";
import { cn } from "@camp404/ui/lib/utils";
import {
  LegendDot,
  RailHead,
} from "@/app/(console)/captains/overview/status-board";
import { formatNumber, pct, watts } from "@/lib/power-copy";

// The load list's result panels (#253), composed from AfrikaBurn's status
// board: the KPI row (kpi-cards, as KpiCards on the captain Overview, without
// the links: these figures have no page of their own), the generator rail
// (OfficerCoverageCard's head + headline + bar + legend), and plain tables in
// cards for the breakdowns. Presentational only: every figure arrives
// computed on the server, and the bar is drawn from the number beside it.

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
      className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}
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

const BAND_BAR: Record<LoadBand, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
};

const BAND_TEXT: Record<LoadBand, string> = {
  green: "Comfortable",
  amber: "Working hard",
  red: "Too close to the limit",
};

export interface GeneratorRailData {
  model: string;
  ratedKva: number;
  maxKva: number;
  kvaBasedPct: number;
  kwBasedPct: number;
  band: LoadBand;
  surgeExceedsMax: boolean;
}

/** The chosen generator against the peak, banded on the kVA figure. */
export function GeneratorRail({
  generator,
}: {
  generator: GeneratorRailData | null;
}) {
  return (
    <Card role="article" aria-label="Generator" className="h-full">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <RailHead
          title="Generator"
          meta={
            generator
              ? `${generator.model} · ${formatNumber(generator.ratedKva, 1)} kVA rated, ${formatNumber(generator.maxKva, 1)} kVA max`
              : "None chosen"
          }
        />
        {generator === null ? (
          <p className="text-sm text-muted-foreground">
            No generator chosen yet. Pick one on the fuel estimate.
          </p>
        ) : (
          <>
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-extrabold tabular-nums">
                {pct(generator.kvaBasedPct)}
              </span>
              <span className="text-xs text-muted-foreground">
                of rated kVA at the peak · {BAND_TEXT[generator.band]}
              </span>
              <span className="text-xs text-muted-foreground">
                (kW-based: {pct(generator.kwBasedPct)})
              </span>
            </p>
            <span className="h-3 w-full overflow-hidden rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full",
                  BAND_BAR[generator.band],
                )}
                style={{ width: `${Math.min(100, generator.kvaBasedPct)}%` }}
                aria-hidden
              />
            </span>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <LegendDot className={BAND_BAR.green} />
                Under 70%
              </li>
              <li className="flex items-center gap-1.5">
                <LegendDot className={BAND_BAR.amber} />
                70–90%
              </li>
              <li className="flex items-center gap-1.5">
                <LegendDot className={BAND_BAR.red} />
                Over 90%, or a start-up spike past the maximum
              </li>
            </ul>
            <p className="mt-auto text-xs text-muted-foreground">
              Bands use the kVA figure (kW ÷ power factor).
            </p>
            {generator.surgeExceedsMax && (
              <p className="text-xs font-medium text-destructive">
                The start-up spike is more than the generator&apos;s maximum
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** A breakdown of the list by area or by category: W and kWh a day. */
export function BreakdownCard({
  id,
  title,
  keyHeader,
  rows,
  labelOf,
}: {
  id: string;
  title: string;
  keyHeader: string;
  rows: PowerBreakdownRow[];
  labelOf?: (key: string) => string;
}) {
  return (
    <Card role="article" aria-labelledby={id} className="h-full">
      <CardHeader>
        <CardTitle id={id} className="text-base">
          {title}
        </CardTitle>
        <CardDescription>
          Running watts, and kWh a day averaged over the days on site.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">{keyHeader}</TableHead>
              <TableHead className="text-right">W</TableHead>
              <TableHead className="pr-6 text-right">kWh a day</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="pl-6 font-medium">
                  {labelOf ? labelOf(row.key) : row.key}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {watts(row.watts)}
                </TableCell>
                <TableCell className="pr-6 text-right tabular-nums">
                  {formatNumber(row.whPerDay / 1000, 2, true)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Each day on site against the kWh it uses. */
export function DayByDayCard({
  days,
}: {
  days: { label: string; wh: number }[];
}) {
  return (
    <Card role="article" aria-labelledby="day-by-day">
      <CardHeader>
        <CardTitle id="day-by-day" className="text-base">
          Day by day
        </CardTitle>
        <CardDescription>
          What the list uses on each day on site. A load with a day range counts
          only on its days.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Day</TableHead>
              <TableHead className="pr-6 text-right">kWh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => (
              <TableRow key={day.label}>
                <TableCell className="pl-6 tabular-nums">{day.label}</TableCell>
                <TableCell className="pr-6 text-right tabular-nums">
                  {formatNumber(day.wh / 1000, 2, true)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
