import {
  fuelForPlan,
  generatorLoadPct,
  jerryCansNeeded,
  loadBand,
  powerTotals,
  type Generator,
  type LoadBand,
  type PowerLoad,
} from "@camp404/core";
import type { PowerPlanSettings } from "@camp404/db/power";

// The Power and Lighting program's "power plan at a glance" (owner's ruling
// 2, 2026-09-27): the plan's headline figures, worked out with the SAME core
// calculations the load list and the fuel estimate use, so the three can never
// disagree. Pure: the panel reads the loads, the plan and the chosen
// generator, and this decides what the figures are. Read-only, for every
// member: it names no member and holds no money.

type Plan = Pick<
  PowerPlanSettings,
  | "daysOnSite"
  | "powerFactor"
  | "lowLoadFactor"
  | "safetyMarginPct"
  | "runFromHour"
  | "runToHour"
  | "canLitres"
  | "cansOwned"
>;

export interface PowerGlance {
  loadCount: number;
  /** The highest peak of any day; null with no loads. */
  peak: { watts: number; kva: number; assumesAllOn: boolean } | null;
  /** The chosen generator at that peak; null with none chosen. */
  generator: {
    model: string;
    ratedKva: number;
    kvaBasedPct: number;
    band: LoadBand;
  } | null;
  /** Fuel for the stay; null until there are loads and a generator. */
  fuel: {
    litresWithMargin: number;
    safetyMarginPct: number;
    days: number;
    cans: number;
    canLitres: number;
    cansOwned: number;
  } | null;
}

export function powerGlance(input: {
  loads: readonly PowerLoad[];
  plan: Plan;
  generator: (Generator & { model: string }) | null;
}): PowerGlance {
  const { loads, plan, generator } = input;
  const totals = powerTotals(loads, plan.daysOnSite, plan.powerFactor);
  const hasLoads = loads.length > 0;

  let rail: PowerGlance["generator"] = null;
  if (generator) {
    const load = generatorLoadPct(
      totals.peak.watts,
      plan.powerFactor,
      generator.ratedKva,
    );
    rail = {
      model: generator.model,
      ratedKva: generator.ratedKva,
      kvaBasedPct: load.kvaBasedPct,
      band: loadBand(load.kvaBasedPct, totals.surge.kva, generator.maxKva),
    };
  }

  let fuel: PowerGlance["fuel"] = null;
  if (generator && hasLoads) {
    const main = fuelForPlan({
      loads,
      generator,
      plan: {
        powerFactor: plan.powerFactor,
        daysOnSite: plan.daysOnSite,
        lowLoadFactor: plan.lowLoadFactor,
        safetyMarginPct: plan.safetyMarginPct,
      },
      schedule: { fromHour: plan.runFromHour, toHour: plan.runToHour },
    });
    fuel = {
      litresWithMargin: main.litresWithMargin,
      safetyMarginPct: plan.safetyMarginPct,
      days: plan.daysOnSite,
      cans: jerryCansNeeded(
        main.litresWithMargin,
        plan.canLitres,
        plan.cansOwned,
      ),
      canLitres: plan.canLitres,
      cansOwned: plan.cansOwned,
    };
  }

  return {
    loadCount: loads.length,
    peak: hasLoads
      ? {
          watts: totals.peak.watts,
          kva: totals.peak.kva,
          assumesAllOn: totals.peak.assumesAllOn,
        }
      : null,
    generator: rail,
    fuel,
  };
}
