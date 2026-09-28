import Link from "next/link";
import { Fuel, PlugZap, Zap } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { cn } from "@camp404/ui/lib/utils";
import { BAND_BAR, BAND_TEXT } from "@/components/power/load-panels";
import type { PowerGlance } from "@/lib/power-glance";
import {
  POWER_FUEL_PATH,
  POWER_LOADS_PATH,
  formatNumber,
  kw,
  litres,
  pct,
} from "@/lib/power-copy";

// The Power and Lighting program's own panel (owner's ruling 2, 2026-09-27):
// the power plan's headline figures, read-only, for every member. Composed as
// the console dashboard's figures row (AfrikaBurn's KPI cards, as the load
// list's), inside one card: peak load, the generator's load with its band,
// the fuel for the burn and the jerry cans. Every figure arrives worked out on
// the server with the load list's and the fuel estimate's own calculations.
// Those who may edit the plan get links into the Power tool that say so;
// everyone else gets the same pages to read.

interface Tile {
  key: string;
  label: string;
  value: string;
  hint: string;
  band?: keyof typeof BAND_BAR;
}

function tiles(glance: PowerGlance): Tile[] {
  const { peak, generator, fuel } = glance;
  return [
    {
      key: "peak",
      label: "Peak load",
      value: peak ? kw(peak.watts) : "—",
      hint: peak
        ? `${formatNumber(peak.kva, 2, true)} kVA, the most drawn at once`
        : "No loads on the list yet",
    },
    {
      key: "generator",
      label: "Generator load",
      value: generator && peak ? pct(generator.kvaBasedPct) : "—",
      hint: generator
        ? peak
          ? `${BAND_TEXT[generator.band]} · ${generator.model}, ${formatNumber(generator.ratedKva, 1)} kVA`
          : `${generator.model}, ${formatNumber(generator.ratedKva, 1)} kVA`
        : "No generator chosen yet",
      band: generator && peak ? generator.band : undefined,
    },
    {
      key: "fuel",
      label: "Fuel for the burn",
      value: fuel ? litres(fuel.litresWithMargin) : "—",
      hint: fuel
        ? `over ${fuel.days} day${fuel.days === 1 ? "" : "s"}, with the ${formatNumber(fuel.safetyMarginPct, 1)}% safety margin`
        : "Needs loads and a generator",
    },
    {
      key: "cans",
      label: "Jerry cans",
      value: fuel ? String(fuel.cans) : "—",
      hint: fuel
        ? fuel.cansOwned > 0
          ? `${formatNumber(fuel.canLitres, 1)} L cans, after the ${fuel.cansOwned} already owned`
          : `${formatNumber(fuel.canLitres, 1)} L cans`
        : "Needs loads and a generator",
    },
  ];
}

export function PowerGlanceCard({
  glance,
  canEdit,
}: {
  glance: PowerGlance;
  /** A captain or a Power & Lighting lead: the links say "Edit". */
  canEdit: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-accent" aria-hidden />
          Power plan at a glance
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <section
          aria-label="Power plan at a glance"
          className="grid gap-3 page-sm:grid-cols-2"
        >
          {tiles(glance).map((tile) => (
            <article
              key={tile.key}
              aria-labelledby={`glance-${tile.key}`}
              className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-4"
            >
              <span
                id={`glance-${tile.key}`}
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {tile.label}
              </span>
              <span className="flex items-center gap-2 text-2xl font-bold tabular-nums">
                {tile.band ? (
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      BAND_BAR[tile.band],
                    )}
                    aria-hidden
                  />
                ) : null}
                {tile.value}
              </span>
              <span className="text-xs text-muted-foreground">{tile.hint}</span>
            </article>
          ))}
        </section>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link
            href={POWER_LOADS_PATH}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            <PlugZap className="h-3.5 w-3.5" aria-hidden />
            {canEdit ? "Edit the load list" : "See the load list"}
          </Link>
          <Link
            href={POWER_FUEL_PATH}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
          >
            <Fuel className="h-3.5 w-3.5" aria-hidden />
            {canEdit ? "Edit the fuel plan" : "See the fuel estimate"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
