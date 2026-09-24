import type { FuelLine } from "@camp404/core";
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
import { formatNumber, litres } from "@/lib/power-copy";

// The fuel page's result panels (#254), composed as the load list's: plain
// tables in cards, as AfrikaBurn's status board lays its tables out.
// Presentational only: every figure arrives computed on the server from the
// core fuel functions. No money here: only litres and cans.

export interface ScenarioColumn {
  key: string;
  title: string;
  /** The schedule under the title, such as "18:00–06:00". */
  schedule: string;
}

export interface ScenarioRow {
  label: string;
  /** One value per column, in column order. */
  values: string[];
}

/** The plan's schedule against the comparison schedule, same loads. */
export function ScenarioCompareCard({
  columns,
  rows,
}: {
  columns: ScenarioColumn[];
  rows: ScenarioRow[];
}) {
  return (
    <Card
      role="article"
      aria-labelledby="scenario-compare"
      className="h-full min-w-0"
    >
      <CardHeader>
        <CardTitle id="scenario-compare" className="text-base">
          Scenario compare
        </CardTitle>
        <CardDescription>
          The same loads on two schedules. Energy used while the generator is
          off is not in the litres.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table aria-label="Scenario compare">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">
                <span className="sr-only">Figure</span>
              </TableHead>
              {columns.map((c, i) => (
                <TableHead
                  key={c.key}
                  scope="col"
                  className={
                    i === columns.length - 1 ? "pr-6 text-right" : "text-right"
                  }
                >
                  <span className="flex flex-col items-end">
                    <span>{c.title}</span>
                    <span className="text-xs font-normal tabular-nums">
                      {c.schedule}
                    </span>
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableHead
                  scope="row"
                  className="whitespace-normal pl-6 font-medium"
                >
                  {row.label}
                </TableHead>
                {row.values.map((value, i) => (
                  <TableCell
                    key={columns[i]?.key ?? i}
                    className={
                      i === row.values.length - 1
                        ? "pr-6 text-right tabular-nums"
                        : "text-right tabular-nums"
                    }
                  >
                    {value}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Each day on site against its litres and the kWh the generator delivers. */
export function FuelDayByDayCard({
  days,
}: {
  days: { label: string; litres: number; kWh: number }[];
}) {
  return (
    <Card
      role="article"
      aria-labelledby="fuel-day-by-day"
      className="h-full min-w-0"
    >
      <CardHeader>
        <CardTitle id="fuel-day-by-day" className="text-base">
          Day by day
        </CardTitle>
        <CardDescription>
          On the plan&apos;s schedule. A load with a day range counts only on
          its days.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">Day</TableHead>
              <TableHead className="text-right">Litres</TableHead>
              <TableHead className="pr-6 text-right">kWh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((day) => (
              <TableRow key={day.label}>
                <TableCell className="pl-6 tabular-nums">{day.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(day.litres, 2, true)}
                </TableCell>
                <TableCell className="pr-6 text-right tabular-nums">
                  {formatNumber(day.kWh, 2, true)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * How the litres are worked out: the straight line through the datasheet's
 * two points, and where it meets no load (the idle burn).
 */
export function FuelMethodCard({
  generator,
}: {
  generator: {
    model: string;
    tankLitres: number;
    runtime50Hours: number;
    runtime100Hours: number;
    line: FuelLine;
  } | null;
}) {
  return (
    <Card role="article" aria-labelledby="fuel-method">
      <CardHeader>
        <CardTitle id="fuel-method" className="text-base">
          How this is worked out
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>
          A generator&apos;s datasheet gives two points: how long a full tank
          lasts at half load and at full load. A straight line through them
          gives the litres an hour at any load, and where the line meets no load
          is the idle burn: fuel it uses just to keep running.
        </p>
        {generator ? (
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
            <div>
              <dt className="text-xs">At 50% load</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {formatNumber(generator.line.lph50, 3, true)} L/h
              </dd>
              <dd className="text-xs tabular-nums">
                {formatNumber(generator.tankLitres, 1)} L ÷{" "}
                {formatNumber(generator.runtime50Hours, 1)} h
              </dd>
            </div>
            <div>
              <dt className="text-xs">At 100% load</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {formatNumber(generator.line.lph100, 3, true)} L/h
              </dd>
              <dd className="text-xs tabular-nums">
                {formatNumber(generator.tankLitres, 1)} L ÷{" "}
                {formatNumber(generator.runtime100Hours, 1)} h
              </dd>
            </div>
            <div>
              <dt className="text-xs">Idle (no load)</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {formatNumber(generator.line.idle, 3, true)} L/h
              </dd>
              <dd className="text-xs">where the line meets no load</dd>
            </div>
          </dl>
        ) : (
          <p>Choose a generator to see its line.</p>
        )}
        <p>
          Each hour the generator runs burns the idle litres plus the
          line&apos;s rise for that hour&apos;s load (kW ÷ power factor ÷ rated
          kVA). An hour under half load is multiplied by the extra margin at low
          load. Energy used in hours the generator is off is left out, with a
          warning. The safety margin is added to the litres for the burn, and
          the cans are those litres in cans, less the cans already owned.
        </p>
        {generator && (
          <p className="text-xs">
            For {generator.model}: {litres(generator.line.idle, 2)} an hour at
            idle, rising {litres(generator.line.slope / 10, 3)} an hour for each
            10% of rated load.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
