import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Fuel, Lock, PlugZap, Zap } from "lucide-react";
import {
  canEditPower,
  dayLabel,
  fuelForPlan,
  fuelLine,
  jerryCansNeeded,
  type FuelPlan,
} from "@camp404/core";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import {
  FuelDayByDayCard,
  FuelMethodCard,
  ScenarioCompareCard,
  type ScenarioRow,
} from "@/components/power/fuel-panels";
import {
  CopyLastYearPlanButton,
  FuelPlanForm,
  type GeneratorOption,
} from "@/components/power/fuel-plan-form";
import {
  AddGeneratorButton,
  GeneratorRowActions,
  type EditableGenerator,
  type GeneratorInventoryOption,
} from "@/components/power/generator-dialog";
import { PowerKpiCards, type PowerKpi } from "@/components/power/load-panels";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getGenerator,
  getPowerPlan,
  listGenerators,
  listPowerInventory,
  listPowerLoads,
  previousPlanCycle,
  type GeneratorRow,
  type PowerPlan,
} from "@/lib/power";
import {
  FUEL_LABELS,
  GENERATOR_OWNER_LABELS,
  POWER_LOADS_PATH,
  POWER_REFUSAL,
  formatNumber,
  litres,
  runText,
} from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fuel estimate — Camp 404" };

// The fuel estimate (#254). Every approved member reads it; a captain or a
// Power & Lighting lead edits the plan and the generators. Composed like the
// load list, from the AfrikaBurn console: the status board's KPI row for the
// outputs, tables in cards for the comparison and the days, and the categories
// screen for the generators (the table, Add opening a dialog, Edit and a
// one-tap Archive per row; for everyone else the controls PRESENT BUT
// DISABLED, described by one Lock line).
//
// Every figure is worked out here, on the server, with the core fuel
// functions, from the same loads the load list shows. There is no money on
// this page: litres, cans and refills only.

/** The one refusal line every disabled control on this page describes to. */
const REFUSAL_ID = "power-fuel-refusal";

function editable(row: GeneratorRow): EditableGenerator {
  return {
    id: row.id,
    version: row.version,
    model: row.model,
    ratedKva: row.ratedKva,
    maxKva: row.maxKva,
    tankLitres: row.tankLitres,
    runtime50Hours: row.runtime50Hours,
    runtime100Hours: row.runtime100Hours,
    fuelType: row.fuelType,
    owner: row.owner,
    inventoryItemId: row.inventoryItemId,
    noiseNote: row.noiseNote,
  };
}

function generatorColumns(
  canEdit: boolean,
  inventory: GeneratorInventoryOption[],
  chosenId: string | null,
): ResponsiveColumn<GeneratorRow>[] {
  return [
    {
      id: "model",
      header: "Model",
      role: "title",
      cellClassName: "font-medium",
      cell: (g) => g.model,
    },
    {
      id: "chosen",
      header: "In the plan",
      role: "badge",
      hideHeader: true,
      cell: (g) =>
        g.id === chosenId ? <Badge variant="outline">In the plan</Badge> : null,
    },
    {
      id: "kva",
      header: "Rated / max",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (g) =>
        `${formatNumber(g.ratedKva, 1)} / ${formatNumber(g.maxKva, 1)} kVA`,
    },
    {
      id: "tank",
      header: "Tank",
      align: "right",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (g) => `${formatNumber(g.tankLitres, 1)} L`,
    },
    {
      id: "runtime",
      header: "Runtime 50% / 100%",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (g) =>
        `${formatNumber(g.runtime50Hours, 1)} h / ${formatNumber(g.runtime100Hours, 1)} h`,
    },
    {
      id: "fuel",
      header: "Fuel",
      cell: (g) => FUEL_LABELS[g.fuelType],
    },
    {
      id: "owner",
      header: "Owner",
      cellClassName: "text-muted-foreground",
      cell: (g) => GENERATOR_OWNER_LABELS[g.owner],
    },
    {
      id: "noise",
      header: "Noise",
      cellClassName: "text-muted-foreground",
      cell: (g) => g.noiseNote ?? "—",
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (g) => (
        <GeneratorRowActions
          generator={editable(g)}
          canEdit={canEdit}
          refusalId={REFUSAL_ID}
          inventory={inventory}
        />
      ),
    },
  ];
}

/** The litres of the thirstiest day. */
function busiestDay(fuel: FuelPlan): number {
  return Math.max(0, ...fuel.perDay.map((d) => d.litres));
}

/** Hours a full tank lasts on the thirstiest day, or null with no burn. */
function hoursPerTank(fuel: FuelPlan): number | null {
  return fuel.refillsPerDay > 0
    ? fuel.runningHoursPerDay / fuel.refillsPerDay
    : null;
}

/** "about 16.4 h", or a dash when nothing burns. */
function tankLastsText(fuel: FuelPlan): string {
  const every = hoursPerTank(fuel);
  return every === null ? "—" : `${formatNumber(every, 1)} h`;
}

/** What is still needed before there is an estimate, or null when ready. */
function missing(
  generator: GeneratorRow | null,
  loadCount: number,
): { title: string; description: string } | null {
  if (!generator && loadCount === 0) {
    return {
      title: "No generator and no loads yet",
      description:
        "Add the generator in Generators below and choose it in the plan, and list what the camp plugs in on the load list.",
    };
  }
  if (!generator) {
    return {
      title: "No generator chosen",
      description:
        "Choose a generator in the plan above, or add one in Generators below.",
    };
  }
  if (loadCount === 0) {
    return {
      title: "No loads yet",
      description:
        "The estimate needs the load list: add what the camp plugs in there.",
    };
  }
  return null;
}

function planValues(plan: PowerPlan) {
  return {
    generatorId: plan.generatorId,
    secondGeneratorNote: plan.secondGeneratorNote,
    runFromHour: plan.runFromHour,
    runToHour: plan.runToHour,
    compareRunFromHour: plan.compareRunFromHour,
    compareRunToHour: plan.compareRunToHour,
    daysOnSite: plan.daysOnSite,
    powerFactor: plan.powerFactor,
    lowLoadFactor: plan.lowLoadFactor,
    safetyMarginPct: plan.safetyMarginPct,
    canLitres: plan.canLitres,
    cansOwned: plan.cansOwned,
    version: plan.version,
  };
}

export default async function PowerFuelPage() {
  // Every approved member reads the estimate.
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditPower(rank, leadTeams);

  const [loads, plan, generators, inventory, earlier] = await Promise.all([
    listPowerLoads(),
    getPowerPlan(),
    listGenerators(),
    // Only an editor links a generator to the inventory.
    canEdit ? listPowerInventory() : Promise.resolve([]),
    previousPlanCycle(),
  ]);
  // The plan may name a generator archived since; it still reads.
  const generator = plan.generatorId
    ? (generators.find((g) => g.id === plan.generatorId) ??
      (await getGenerator(plan.generatorId)))
    : null;

  const options: GeneratorOption[] = generators.map((g) => ({
    id: g.id,
    label: `${g.model} (${formatNumber(g.ratedKva, 1)} kVA)`,
  }));
  if (generator && generator.archivedAt !== null) {
    options.push({ id: generator.id, label: `${generator.model} (archived)` });
  }
  const inventoryOptions: GeneratorInventoryOption[] = inventory.map((i) => ({
    id: i.id,
    name: i.name,
  }));

  const planSchedule = runText(plan.runFromHour, plan.runToHour);
  const compareSchedule = runText(
    plan.compareRunFromHour,
    plan.compareRunToHour,
  );
  const gap = missing(generator, loads.length);

  let results: ReactNode = null;
  if (generator && !gap) {
    const settings = {
      powerFactor: plan.powerFactor,
      daysOnSite: plan.daysOnSite,
      lowLoadFactor: plan.lowLoadFactor,
      safetyMarginPct: plan.safetyMarginPct,
    };
    const main = fuelForPlan({
      loads,
      generator,
      plan: settings,
      schedule: { fromHour: plan.runFromHour, toHour: plan.runToHour },
    });
    const compare = fuelForPlan({
      loads,
      generator,
      plan: settings,
      schedule: {
        fromHour: plan.compareRunFromHour,
        toHour: plan.compareRunToHour,
      },
    });
    const cans = (fuel: FuelPlan) =>
      jerryCansNeeded(fuel.litresWithMargin, plan.canLitres, plan.cansOwned);
    const unservedKwh = (fuel: FuelPlan) =>
      Math.max(0, ...fuel.perDay.map((d) => d.unservedWh)) / 1000;
    const days = plan.daysOnSite;
    const every = hoursPerTank(main);

    const kpis: PowerKpi[] = [
      {
        key: "litres-day",
        label: "Litres a day",
        value: litres(busiestDay(main), 2),
        hint: `on the busiest day, running ${planSchedule}`,
      },
      {
        key: "litres-burn",
        label: "Litres for the burn",
        value: litres(main.burnLitres),
        hint: `over ${days} day${days === 1 ? "" : "s"} on site`,
      },
      {
        key: "litres-margin",
        label: "With margin",
        value: litres(main.litresWithMargin),
        hint: `plus the ${formatNumber(plan.safetyMarginPct, 1)}% safety margin`,
      },
      {
        key: "cans",
        label: "Jerry cans needed",
        value: String(cans(main)),
        hint:
          plan.cansOwned > 0
            ? `${formatNumber(plan.canLitres, 1)} L cans, after the ${plan.cansOwned} already owned`
            : `${formatNumber(plan.canLitres, 1)} L cans`,
      },
      {
        key: "refills",
        label: "Tank refills a day",
        value: formatNumber(main.refillsPerDay, 1, true),
        hint:
          every === null
            ? `${formatNumber(generator.tankLitres, 1)} L tank`
            : `about every ${formatNumber(every, 1)} h · ${formatNumber(generator.tankLitres, 1)} L tank`,
      },
    ];

    const rows: ScenarioRow[] = [
      {
        label: "Hours running a day",
        values: [main, compare].map((f) => `${f.runningHoursPerDay} h`),
      },
      {
        label: "Litres a day",
        values: [main, compare].map((f) => litres(busiestDay(f), 2)),
      },
      {
        label: "Litres for the burn",
        values: [main, compare].map((f) => litres(f.burnLitres)),
      },
      {
        label: "With margin",
        values: [main, compare].map((f) => litres(f.litresWithMargin)),
      },
      {
        label: "Jerry cans",
        values: [main, compare].map((f) => String(cans(f))),
      },
      {
        label: "Refills a day",
        values: [main, compare].map((f) =>
          formatNumber(f.refillsPerDay, 1, true),
        ),
      },
      {
        label: "A full tank lasts",
        values: [main, compare].map(tankLastsText),
      },
      {
        label: "Energy while off, a day",
        values: [main, compare].map(
          (f) => `${formatNumber(unservedKwh(f), 2, true)} kWh`,
        ),
      },
    ];

    const offKwh = unservedKwh(main);
    results = (
      <>
        {(offKwh > 0 || main.overloaded) && (
          <div className="flex flex-col gap-2">
            {offKwh > 0 && (
              <Alert variant="warning">
                <AlertTriangle aria-hidden />
                <span>
                  {formatNumber(offKwh, 2, true)} kWh a day falls in hours the
                  generator is off. The litres leave it out: plan for it another
                  way (a battery, ice) or run the generator longer.
                </span>
              </Alert>
            )}
            {main.overloaded && (
              <Alert variant="error">
                <Zap aria-hidden />
                <span>
                  Load goes over the generator&apos;s rating in some hours. The
                  litres past 100% load are a guess; choose a bigger generator
                  or move loads.
                </span>
              </Alert>
            )}
          </div>
        )}

        <PowerKpiCards
          kpis={kpis}
          label="Fuel at a glance"
          className="lg:grid-cols-3 xl:grid-cols-5"
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <ScenarioCompareCard
            columns={[
              { key: "plan", title: "This plan", schedule: planSchedule },
              {
                key: "compare",
                title: "Comparison",
                schedule: compareSchedule,
              },
            ]}
            rows={rows}
          />
          <FuelDayByDayCard
            days={main.perDay.map((d) => ({
              label: dayLabel(plan.firstPoweredDay, d.day),
              litres: d.litres,
              kWh: d.kWh,
            }))}
          />
        </div>
      </>
    );
  }

  const copyPlan =
    plan.version === 0 && earlier !== null ? (
      <CopyLastYearPlanButton
        fromCycle={earlier}
        canEdit={canEdit}
        refusalId={REFUSAL_ID}
      />
    ) : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Power & Lighting"
        title="Fuel estimate"
        description="The litres and jerry cans the camp's generator needs for the load list. Everyone can read it; captains and Power & Lighting leads edit it."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={POWER_LOADS_PATH}>
                <PlugZap aria-hidden />
                Load list
              </Link>
            </Button>
            {copyPlan}
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        {!canEdit && (
          <p
            id={REFUSAL_ID}
            className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {POWER_REFUSAL}
          </p>
        )}

        <FuelPlanForm
          key={plan.version}
          plan={planValues(plan)}
          generators={options}
          canEdit={canEdit}
          refusalId={REFUSAL_ID}
        />

        {gap ? (
          <EmptyState
            icon={<Fuel />}
            title={gap.title}
            description={gap.description}
          />
        ) : (
          results
        )}

        <FuelMethodCard
          generator={
            generator
              ? {
                  model: generator.model,
                  tankLitres: generator.tankLitres,
                  runtime50Hours: generator.runtime50Hours,
                  runtime100Hours: generator.runtime100Hours,
                  line: fuelLine(generator),
                }
              : null
          }
        />

        <section aria-labelledby="generators" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 id="generators" className="text-base font-semibold">
                Generators
              </h2>
              <p className="text-xs text-muted-foreground">
                The camp&apos;s own, lent by a member, or hired. They carry from
                year to year; archive one that is gone.
              </p>
            </div>
            <AddGeneratorButton
              canEdit={canEdit}
              refusalId={REFUSAL_ID}
              inventory={inventoryOptions}
            />
          </div>
          {generators.length === 0 ? (
            <EmptyState
              icon={<Zap />}
              title="No generators yet"
              description="Add one from its datasheet: the rated and maximum kVA, the tank and how long it lasts at half and full load."
            />
          ) : (
            <div className="md:rounded-xl md:border md:bg-card md:text-card-foreground md:shadow-sm">
              <ResponsiveDataTable
                columns={generatorColumns(
                  canEdit,
                  inventoryOptions,
                  plan.generatorId,
                )}
                data={generators}
                getRowKey={(g) => g.id}
                label="Generators"
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
