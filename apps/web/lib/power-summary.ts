import {
  MAINS_VOLTS,
  amps,
  connectedWatts,
  fixedSplit,
  fuelForPlan,
  fuelSplit,
  generatorLoadPct,
  gridRuns,
  jerryCansNeeded,
  loadBand,
  powerTotals,
  splitLitres,
  type FuelPlan,
  type GridLoad,
  type GridRunFigures,
  type PowerTotals,
} from "@camp404/core";
import type { GeneratorRow, PowerLoadRow, PowerPlan } from "@camp404/db/power";
import type { GridNodeRow } from "@camp404/db/power-grid";
import type {
  ReadinessItemRow,
  SharingAgreement,
} from "@camp404/db/power-readiness";
import type { FuelCanRow, RefuelEntryRow } from "@camp404/db/power-site";
import {
  POWER_FUEL_LOG_PATH,
  POWER_FUEL_PATH,
  POWER_GRID_PATH,
  POWER_LOADS_PATH,
  POWER_READINESS_PATH,
  POWER_SHARING_PATH,
  formatNumber,
} from "./power-copy";

// The Power program's answers (the owner's approved redesign, option B, the
// "answer rail", 2026-10-01): each of the six sections opens on one plain
// sentence, and the rail on the left carries every section's answer, so the
// whole power picture reads at a glance. Pure: the server reads the rows once
// (lib/power-overview.ts) and every figure here comes from the same core
// functions the sections use, so the rail and a section can never disagree.

/** Everything the six sections read for this year. */
export interface PowerOverview {
  loads: PowerLoadRow[];
  plan: PowerPlan;
  /** The camp's generators, not archived. */
  generators: GeneratorRow[];
  /** The plan's generator, archived or not; null with none chosen. */
  generator: GeneratorRow | null;
  cans: FuelCanRow[];
  entries: RefuelEntryRow[];
  nodes: GridNodeRow[];
  /** Where each load plugs in: load id to grid point id. */
  where: Record<string, string>;
  items: ReadinessItemRow[];
  agreement: SharingAgreement | null;
  /** The generator a sharing agreement runs on, when it is ours. */
  shareGenerator: GeneratorRow | null;
}

/** Ok, near the limit, over it, or nothing to say yet. */
export type Tone = "ok" | "warn" | "bad" | "info" | "mute";

/** "6.5", a kVA figure to one place. */
export function kvaText(kva: number): string {
  return formatNumber(kva, 1, true);
}

// --- Load list ----------------------------------------------------------------

export interface LoadVerdict {
  totals: PowerTotals;
  hasLoads: boolean;
  /** The chosen generator at the peak; null with none chosen. */
  generator: {
    model: string;
    ratedKva: number;
    maxKva: number;
    /** The peak as a share of the rated kVA. */
    pct: number;
    surgeOverMax: boolean;
  } | null;
  tone: Tone;
}

export function loadVerdict(o: PowerOverview): LoadVerdict {
  const totals = powerTotals(o.loads, o.plan.daysOnSite, o.plan.powerFactor);
  const hasLoads = o.loads.length > 0;
  if (!o.generator) {
    return { totals, hasLoads, generator: null, tone: "mute" };
  }
  const g = o.generator;
  const pct = generatorLoadPct(
    totals.peak.watts,
    o.plan.powerFactor,
    g.ratedKva,
  ).kvaBasedPct;
  const band = loadBand(pct, totals.surge.kva, g.maxKva);
  return {
    totals,
    hasLoads,
    generator: {
      model: g.model,
      ratedKva: g.ratedKva,
      maxKva: g.maxKva,
      pct,
      surgeOverMax: totals.surge.kva > g.maxKva,
    },
    tone: !hasLoads
      ? "mute"
      : band === "red"
        ? "bad"
        : band === "amber"
          ? "warn"
          : "ok",
  };
}

// --- Fuel estimate -----------------------------------------------------------

export interface FuelSummary {
  fuel: FuelPlan;
  /** Every can the litres fill, before the ones the camp owns. */
  totalCans: number;
  /** Cans still to buy, after the ones the camp owns. */
  toBuy: number;
  /** The litres of the thirstiest day. */
  busiestDayLitres: number;
  /** True when a load runs on some days only, so the days differ. */
  daysDiffer: boolean;
}

/** The fuel for the plan's generator and loads; null until both exist. */
export function fuelSummary(o: PowerOverview): FuelSummary | null {
  if (!o.generator || o.loads.length === 0) return null;
  const fuel = fuelForPlan({
    loads: o.loads,
    generator: o.generator,
    plan: {
      powerFactor: o.plan.powerFactor,
      daysOnSite: o.plan.daysOnSite,
      lowLoadFactor: o.plan.lowLoadFactor,
      safetyMarginPct: o.plan.safetyMarginPct,
    },
    schedule: { fromHour: o.plan.runFromHour, toHour: o.plan.runToHour },
  });
  return {
    fuel,
    totalCans: jerryCansNeeded(fuel.litresWithMargin, o.plan.canLitres, 0),
    toBuy: jerryCansNeeded(
      fuel.litresWithMargin,
      o.plan.canLitres,
      o.plan.cansOwned,
    ),
    busiestDayLitres: Math.max(0, ...fuel.perDay.map((d) => d.litres)),
    daysDiffer: o.loads.some((l) => l.fromDay !== null || l.toDay !== null),
  };
}

/** "Tank filled about once a day", from the refills on the thirstiest day. */
export function refillText(refillsPerDay: number): string | null {
  if (!(refillsPerDay > 0)) return null;
  // A rate up to 2/3 always rounds 1/rate to 2 days or more; above that,
  // 1/rate can round down to 1 ("every 1 days") before the once-a-day
  // wording below would otherwise take over at 0.75.
  if (refillsPerDay <= 2 / 3) {
    return `Tank filled about every ${formatNumber(1 / refillsPerDay, 0)} days`;
  }
  if (refillsPerDay < 1.5) return "Tank filled about once a day";
  if (refillsPerDay < 2.5) return "Tank filled about twice a day";
  return `Tank filled about ${formatNumber(refillsPerDay, 0)} times a day`;
}

// --- Refuelling (the cans) -----------------------------------------------------

export interface StockSummary {
  onHand: number;
  full: number;
  part: number;
  empty: number;
  /** The litres the burn needs, with the margin; null with no estimate. */
  need: number | null;
}

export function stockSummary(
  o: PowerOverview,
  fuel: FuelSummary | null,
): StockSummary {
  let full = 0;
  let part = 0;
  let empty = 0;
  for (const c of o.cans) {
    if (c.litres <= 0) empty += 1;
    else if (c.litres >= c.capacityLitres) full += 1;
    else part += 1;
  }
  return {
    onHand: o.cans.reduce((sum, c) => sum + c.litres, 0),
    full,
    part,
    empty,
    need: fuel ? fuel.fuel.litresWithMargin : null,
  };
}

// --- Grid ----------------------------------------------------------------------

export interface GridSummary {
  runs: Map<string, GridRunFigures>;
  over: GridNodeRow[];
  near: GridNodeRow[];
  fine: GridNodeRow[];
  unrated: GridNodeRow[];
  offGrid: PowerLoadRow[];
  /** Cables and adapters nobody has said the camp has or must get. */
  unchecked: number;
  /** Cables and adapters the camp must get. */
  toGet: number;
}

/** The amps one load draws at full draw, at mains. */
export function loadAmps(load: PowerLoadRow): number {
  return amps(connectedWatts(load), MAINS_VOLTS);
}

export function gridSummary(o: PowerOverview): GridSummary {
  const gridLoads: GridLoad[] = o.loads.map((l) => ({
    ...l,
    gridNodeId: o.where[l.id] ?? null,
  }));
  const runs = new Map(
    gridRuns(o.nodes, gridLoads, o.plan.daysOnSite).map((r) => [r.id, r]),
  );
  const byBand = (band: GridRunFigures["band"]) =>
    o.nodes.filter((n) => runs.get(n.id)?.band === band);
  let unchecked = 0;
  let toGet = 0;
  for (const n of o.nodes) {
    if (n.parentId === null) continue;
    for (const have of n.adapter
      ? [n.haveCable, n.haveAdapter]
      : [n.haveCable]) {
      if (have === null) unchecked += 1;
      else if (have === false) toGet += 1;
    }
  }
  return {
    runs,
    over: byBand("over"),
    near: byBand("warn"),
    fine: byBand("ok"),
    unrated: byBand("unknown"),
    offGrid: o.loads.filter((l) => !o.where[l.id]),
    unchecked,
    toGet,
  };
}

// --- Readiness -----------------------------------------------------------------

export interface ReadinessSummary {
  model: string;
  total: number;
  done: number;
}

/** The plan's generator's checklist; null with no generator chosen. */
export function readinessSummary(o: PowerOverview): ReadinessSummary | null {
  if (!o.generator) return null;
  const mine = o.items.filter((i) => i.generatorId === o.generator?.id);
  return {
    model: o.generator.model,
    total: mine.length,
    done: mine.filter((i) => i.doneAt !== null).length,
  };
}

// --- Sharing -------------------------------------------------------------------

export interface SharingSummary {
  partnerCamp: string;
  /** Agreed: their share is typed in, or they have loads on the list. */
  agreed: boolean;
  ourPct: number;
  theirPct: number;
  /** How the split was reached. */
  how: "typed" | "energy";
  /** The litres the shared generator needs, when it is ours. */
  litres: number | null;
  ours: number | null;
  theirs: number | null;
}

/** The year's sharing agreement, or null when the camp shares nothing. */
export function sharingSummary(o: PowerOverview): SharingSummary | null {
  const a = o.agreement;
  if (!a) return null;
  const theirLoads = o.loads.filter((l) => l.owner === "neighbour");
  const ourLoads = o.loads.filter((l) => l.owner !== "neighbour");
  const ourKwh = powerTotals(
    ourLoads,
    o.plan.daysOnSite,
    o.plan.powerFactor,
  ).burnKwh;
  const theirKwh = powerTotals(
    theirLoads,
    o.plan.daysOnSite,
    o.plan.powerFactor,
  ).burnKwh;
  const typed = a.partnerFuelPct != null;
  const split = typed
    ? fixedSplit(a.partnerFuelPct as number)
    : fuelSplit(ourKwh, theirKwh);
  const gen = o.shareGenerator;
  const fuel =
    gen && o.loads.length > 0
      ? fuelForPlan({
          loads: o.loads,
          generator: gen,
          plan: {
            powerFactor: o.plan.powerFactor,
            daysOnSite: o.plan.daysOnSite,
            lowLoadFactor: o.plan.lowLoadFactor,
            safetyMarginPct: o.plan.safetyMarginPct,
          },
          schedule: { fromHour: o.plan.runFromHour, toHour: o.plan.runToHour },
        })
      : null;
  const shared = fuel ? splitLitres(fuel.litresWithMargin, split) : null;
  return {
    partnerCamp: a.partnerCamp,
    agreed: typed || theirKwh > 0,
    ourPct: split.ourPct,
    theirPct: split.theirPct,
    how: typed ? "typed" : "energy",
    litres: fuel ? fuel.litresWithMargin : null,
    ours: shared ? shared.ours : null,
    theirs: shared ? shared.theirs : null,
  };
}

// --- The rail ------------------------------------------------------------------

export type PowerSection =
  | "loads"
  | "fuel"
  | "fuel-log"
  | "grid"
  | "readiness"
  | "sharing";

export interface RailEntry {
  section: PowerSection;
  label: string;
  href: string;
  /** The section's answer, in a few words. */
  answer: string;
  /** One more plain line under it. */
  detail: string;
  tone: Tone;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function loadsEntry(o: PowerOverview, v: LoadVerdict): RailEntry {
  const base = { section: "loads", label: "Load list", href: POWER_LOADS_PATH };
  if (!v.hasLoads) {
    return {
      ...base,
      section: "loads",
      answer: "No loads yet",
      detail: "List what the camp plugs in",
      tone: "mute",
    };
  }
  const peak = v.totals.peak.kva;
  if (!v.generator) {
    return {
      ...base,
      section: "loads",
      answer: `${kvaText(peak)} kVA at the peak`,
      detail: "No generator chosen yet",
      tone: "mute",
    };
  }
  const g = v.generator;
  const over = peak - g.ratedKva;
  return {
    ...base,
    section: "loads",
    answer: `${kvaText(peak)} of ${kvaText(g.ratedKva)} kVA`,
    detail:
      over > 0
        ? `${kvaText(over)} kVA over the ${railName(g.model)}`
        : `${formatNumber(g.pct, 0)}% of the ${railName(g.model)}`,
    tone: v.tone,
  };
}

/**
 * A generator as the rail's one short line names it: its make, the model's
 * first word ("the Honda" for a Honda EU70is), so the line fits the 208px rail.
 */
export function railName(model: string): string {
  return model.trim().split(/\s+/)[0] ?? model;
}

/** The six answers, in the order the rail lists them. */
export function powerRail(o: PowerOverview): RailEntry[] {
  const verdict = loadVerdict(o);
  const fuel = fuelSummary(o);
  const stock = stockSummary(o, fuel);
  const grid = gridSummary(o);
  const ready = readinessSummary(o);
  const share = sharingSummary(o);

  const fuelEntry: RailEntry = fuel
    ? {
        section: "fuel",
        label: "Fuel estimate",
        href: POWER_FUEL_PATH,
        answer: plural(fuel.totalCans, "jerry can"),
        detail: `${formatNumber(fuel.fuel.litresWithMargin, 0)} L for ${plural(o.plan.daysOnSite, "day")}`,
        tone: "info",
      }
    : {
        section: "fuel",
        label: "Fuel estimate",
        href: POWER_FUEL_PATH,
        answer: "No estimate yet",
        detail: o.generator
          ? "Needs the load list"
          : "Needs a generator in the plan",
        tone: "mute",
      };

  const stockEntry: RailEntry =
    stock.need !== null && fuel
      ? {
          section: "fuel-log",
          label: "Refuelling",
          href: POWER_FUEL_LOG_PATH,
          answer: `${formatNumber(stock.onHand, 0)} of ${formatNumber(stock.need, 0)} L`,
          detail:
            fuel.toBuy > 0
              ? `${plural(fuel.toBuy, "can")} still to buy`
              : "Enough cans for the burn",
          tone: stock.onHand >= stock.need ? "ok" : "warn",
        }
      : {
          section: "fuel-log",
          label: "Refuelling",
          href: POWER_FUEL_LOG_PATH,
          answer: `${formatNumber(stock.onHand, 0)} L in stock`,
          detail: plural(o.cans.length, "can"),
          tone: "mute",
        };

  const gridBase = {
    section: "grid" as const,
    label: "Grid",
    href: POWER_GRID_PATH,
    detail:
      grid.offGrid.length > 0
        ? `${plural(grid.offGrid.length, "load")} not plugged in`
        : plural(o.nodes.length, "point"),
  };
  const gridEntry: RailEntry =
    o.nodes.length === 0
      ? {
          ...gridBase,
          answer: "No grid yet",
          detail: "Add the generator first",
          tone: "mute",
        }
      : grid.over.length > 0
        ? {
            ...gridBase,
            answer: `${plural(grid.over.length, "run")} over`,
            tone: "bad",
          }
        : grid.near.length > 0
          ? {
              ...gridBase,
              answer: `${plural(grid.near.length, "run")} near the limit`,
              tone: "warn",
            }
          : {
              ...gridBase,
              answer:
                grid.unrated.length > 0 ? "No run over" : "Every run fine",
              tone: "ok",
            };

  const readyEntry: RailEntry = !ready
    ? {
        section: "readiness",
        label: "Readiness",
        href: POWER_READINESS_PATH,
        answer: "No generator yet",
        detail: "Choose one in the fuel plan",
        tone: "mute",
      }
    : {
        section: "readiness",
        label: "Readiness",
        href: POWER_READINESS_PATH,
        answer:
          ready.total === 0
            ? "Not started"
            : `${ready.done} of ${ready.total} done`,
        detail: ready.model,
        tone:
          ready.total > 0 && ready.done === ready.total
            ? "ok"
            : ready.total === 0
              ? "mute"
              : "warn",
      };

  const shareEntry: RailEntry = !share
    ? {
        section: "sharing",
        label: "Sharing",
        href: POWER_SHARING_PATH,
        answer: "Not shared",
        detail: "No neighbouring camp this year",
        tone: "mute",
      }
    : {
        section: "sharing",
        label: "Sharing",
        href: POWER_SHARING_PATH,
        answer: share.agreed
          ? `They take ${formatNumber(share.theirPct, 0)}%`
          : "Not agreed yet",
        detail: share.partnerCamp,
        tone: share.agreed ? "ok" : "warn",
      };

  return [
    loadsEntry(o, verdict),
    fuelEntry,
    stockEntry,
    gridEntry,
    readyEntry,
    shareEntry,
  ];
}
