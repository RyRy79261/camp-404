import Link from "next/link";
import { ClipboardCheck, Fuel, PlugZap, Zap } from "lucide-react";
import { buttonVariants } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { cn } from "@camp404/ui/lib/utils";
import { BAND_BAR, BAND_TEXT } from "@/components/power/load-panels";
import type { PowerGlance, PowerSiteGlance } from "@/lib/power-glance";
import {
  POWER_FUEL_PATH,
  POWER_LOADS_PATH,
  POWER_READINESS_PATH,
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
// everyone else gets the same pages to read. With no loads and no generator
// and nothing on site either there is nothing to show: the card is one line,
// and the editor's link to start the load list. Two more tiles (2026-11-12) count the work before the
// burn: the fuel cans that travel with a car and the generator's readiness
// checks, with a link to each.

interface Tile {
  key: string;
  label: string;
  value: string;
  hint: string;
  band?: keyof typeof BAND_BAR;
  progress?: { value: number; max: number };
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

/** The work before the burn (2026-11-12): cans on a car, readiness checks. */
function siteTiles(site: PowerSiteGlance): Tile[] {
  return [
    {
      key: "cans-on-car",
      label: "Cans on a car",
      value: site.cans ? `${site.cans.onCar} of ${site.cans.all}` : "—",
      hint: site.cans
        ? site.cans.onCar === site.cans.all
          ? "every can travels with a car"
          : `${site.cans.all - site.cans.onCar} on no car yet`
        : "No cans on the register yet",
      progress: site.cans
        ? { value: site.cans.onCar, max: site.cans.all }
        : undefined,
    },
    {
      key: "readiness",
      label: "Generator ready",
      value: site.checks ? `${site.checks.done} of ${site.checks.all}` : "—",
      hint: site.checks ? "readiness checks done" : "No checklist started",
      progress: site.checks
        ? { value: site.checks.done, max: site.checks.all }
        : undefined,
    },
  ];
}

export function PowerGlanceCard({
  glance,
  canEdit,
  site,
}: {
  glance: PowerGlance;
  /** A captain or a Power & Lighting lead: the links say "Edit". */
  canEdit: boolean;
  /** The fuel cans and the readiness checks; left out, the card has four. */
  site?: PowerSiteGlance;
}) {
  // The one-line card only when there is nothing at all: registered fuel
  // cans or readiness checks need no load list or generator, so with any of
  // them the full card shows (its plan tiles say what is still missing).
  const siteHasWork = site ? site.cans !== null || site.checks !== null : false;
  if (glance.peak === null && glance.generator === null && !siteHasWork) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-2 p-6">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-accent" aria-hidden />
            Power plan
          </CardTitle>
          <span className="text-sm text-muted-foreground">
            No power plan yet.
          </span>
          {canEdit ? (
            <Link
              href={POWER_LOADS_PATH}
              className={`ml-auto ${buttonVariants({ variant: "outline", size: "sm" })}`}
            >
              <PlugZap aria-hidden />
              Start the load list
            </Link>
          ) : null}
        </CardContent>
      </Card>
    );
  }
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
          {[...tiles(glance), ...(site ? siteTiles(site) : [])].map((tile) => (
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
              {tile.progress ? (
                <ProgressBar
                  className="mt-1"
                  value={tile.progress.value}
                  max={tile.progress.max}
                  label={tile.label}
                />
              ) : null}
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
          {site ? (
            <Link
              href={POWER_READINESS_PATH}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
            >
              <ClipboardCheck className="h-3.5 w-3.5" aria-hidden />
              {canEdit
                ? "Edit the readiness checks"
                : "See the readiness checks"}
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
