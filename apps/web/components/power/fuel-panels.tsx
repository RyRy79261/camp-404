import type { FuelLine } from "@camp404/core";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@camp404/ui/components/table";
import { formatNumber, litres } from "@/lib/power-copy";

// The fuel page's working (#254), folded away under the answer: the days, and
// how the litres are worked out, each opened only by whoever wants them.
// Presentational only: every figure arrives computed on the server from the
// core fuel functions. No money here: only litres and cans. There is no
// schedule comparison: the camp runs the generator 24/7 (owner, 2026-09-24).

/**
 * Each day on site against its litres, shown only when the days differ (a
 * load runs on some days only); otherwise one sentence says they are equal.
 */
export function FuelDayByDay({
  days,
}: {
  days: { label: string; litres: number; kWh: number }[];
}) {
  return (
    <details className="mb-4 border border-border bg-card">
      <summary className="cursor-pointer p-4 text-sm font-semibold">
        Each day on site
      </summary>
      <Table aria-label="Day by day">
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Day</TableHead>
            <TableHead className="text-right">Litres</TableHead>
            <TableHead className="pr-4 text-right">kWh</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => (
            <TableRow key={day.label}>
              <TableCell className="pl-4 tabular-nums">{day.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(day.litres, 1, true)}
              </TableCell>
              <TableCell className="pr-4 text-right tabular-nums">
                {formatNumber(day.kWh, 1, true)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>
  );
}

/**
 * How the litres are worked out: the straight line through the datasheet's
 * two points, and where it meets no load (the idle burn).
 */
export function FuelMethod({
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
    <details className="mb-4 border border-border bg-card">
      <summary className="cursor-pointer p-4 text-sm font-semibold">
        How the litres a day are worked out
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4 text-[13px] leading-5 text-muted-foreground">
        <p>
          A generator&apos;s datasheet gives two points: how long a full tank
          lasts at half load and at full load. A straight line through them
          gives the litres an hour at any load, and where the line meets no load
          is the idle burn: fuel it uses just to keep running.
        </p>
        {generator ? (
          <dl className="grid gap-x-6 gap-y-1 page-sm:grid-cols-3">
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
          kVA). An hour under half load is multiplied by the extra fuel when
          lightly loaded. Energy used in hours the generator is off is left out,
          with a warning. The safety margin is added to the litres for the burn,
          and the cans are those litres in cans, less the cans already owned.
        </p>
        {generator && (
          <p className="text-xs">
            For {generator.model}: {litres(generator.line.idle, 2)} an hour at
            idle, rising {litres(generator.line.slope / 10, 3)} an hour for each
            10% of rated load.
          </p>
        )}
      </div>
    </details>
  );
}
