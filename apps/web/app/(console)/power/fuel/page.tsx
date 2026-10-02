import { AlertTriangle, Zap } from "lucide-react";
import { burnRate, dayLabel, fuelLine } from "@camp404/core";
import { Alert } from "@camp404/ui/components/alert";
import { FuelDayByDay, FuelMethod } from "@/components/power/fuel-panels";
import {
  ChangePlanButton,
  CopyLastYearPlanButton,
  type GeneratorOption,
} from "@/components/power/fuel-plan-form";
import {
  AddGeneratorButton,
  GeneratorRowActions,
  type EditableGenerator,
} from "@/components/power/generator-dialog";
import { PowerFrame } from "@/components/power/power-frame";
import {
  CardHead,
  Chip,
  EmptyNote,
  Facts,
  Ledger,
  PowerCard,
  Row,
  RowName,
  SectionHead,
  Verdict,
} from "@/components/power/power-ui";
import {
  listPowerInventory,
  previousPlanCycle,
  type GeneratorRow,
} from "@/lib/power";
import {
  FUEL_LABELS,
  GENERATOR_OWNER_LABELS,
  formatNumber,
  hourText,
  litres,
} from "@/lib/power-copy";
import { getPowerOverview, powerViewer } from "@/lib/power-overview";
import {
  fuelSummary,
  kvaText,
  refillText,
  type PowerOverview,
  railName,
} from "@/lib/power-summary";
import { listRefuelEntries, previousRefuelCycle } from "@/lib/power-site";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fuel estimate — Camp 404" };

// The fuel estimate (#254) in the Power program's answer rail. It opens on
// the answer, the jerry cans to fill, then how the figure is reached, then the
// plan as a list of facts; the plan's settings sit behind "Change the plan"
// for an editor (a captain or a Power & Lighting lead). Every figure is worked
// out on the server with the core fuel functions, from the same loads the
// load list shows. No money here: litres and cans only.

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

/** What is still needed before there is an estimate. */
function missing(o: PowerOverview): string {
  if (!o.generator && o.loads.length === 0) {
    return "Add the generator below and choose it in the plan, and list what the camp plugs in on the load list.";
  }
  if (!o.generator) {
    return "Choose a generator in the plan, or add one below.";
  }
  return "The estimate needs the load list: add what the camp plugs in there.";
}

/** The litres a day last year's refuelling log shows, if it shows any. */
async function lastYearRate(): Promise<{
  cycle: number;
  litresPerDay: number;
} | null> {
  const cycle = await previousRefuelCycle();
  if (cycle === null) return null;
  const rate = burnRate(await listRefuelEntries(cycle), Infinity);
  return rate ? { cycle, litresPerDay: rate.litresPerDay } : null;
}

function runsText(from: number | null, to: number | null): string {
  return from === null || to === null
    ? "All day and night · 24 h"
    : `${hourText(from)}–${hourText(to)} each day`;
}

async function FuelSection() {
  const [{ canEdit }, o] = await Promise.all([
    powerViewer(),
    getPowerOverview(),
  ]);
  const [inventory, earlier, lastYear] = await Promise.all([
    // Only an editor links a generator to the inventory.
    canEdit ? listPowerInventory() : Promise.resolve([]),
    canEdit && o.plan.version === 0
      ? previousPlanCycle()
      : Promise.resolve(null),
    lastYearRate(),
  ]);
  const plan = o.plan;
  const generator = o.generator;
  const summary = fuelSummary(o);
  const fuelWord = generator
    ? FUEL_LABELS[generator.fuelType].toLowerCase()
    : "fuel";

  const options: GeneratorOption[] = o.generators.map((g) => ({
    id: g.id,
    label: `${g.model} (${formatNumber(g.ratedKva, 1)} kVA)`,
  }));
  if (generator && generator.archivedAt !== null) {
    options.push({ id: generator.id, label: `${generator.model} (archived)` });
  }
  const inventoryOptions = inventory.map((i) => ({ id: i.id, name: i.name }));

  const days = plan.daysOnSite;

  return (
    <>
      <SectionHead
        title="Fuel estimate"
        sentence={`How much ${fuelWord} the generator needs for the burn.`}
        actions={
          canEdit ? (
            <>
              {earlier !== null && (
                <CopyLastYearPlanButton fromCycle={earlier} />
              )}
              <ChangePlanButton
                key={plan.version}
                plan={{
                  generatorId: plan.generatorId,
                  secondGeneratorNote: plan.secondGeneratorNote,
                  runFromHour: plan.runFromHour,
                  runToHour: plan.runToHour,
                  daysOnSite: plan.daysOnSite,
                  firstPoweredDay: plan.firstPoweredDay,
                  powerFactor: plan.powerFactor,
                  lowLoadFactor: plan.lowLoadFactor,
                  safetyMarginPct: plan.safetyMarginPct,
                  canLitres: plan.canLitres,
                  cansOwned: plan.cansOwned,
                  version: plan.version,
                }}
                generators={options}
              />
            </>
          ) : undefined
        }
      />

      {summary && generator ? (
        <FuelAnswer
          o={o}
          summary={summary}
          fuelWord={fuelWord}
          lastYear={lastYear}
        />
      ) : (
        <PowerCard label="The answer">
          <EmptyNote title="No estimate yet.">{missing(o)}</EmptyNote>
        </PowerCard>
      )}

      <PowerCard className="p-4" label="The plan">
        <CardHead title="The plan" flat />
        <Facts
          items={[
            {
              label: "Generator",
              value: generator
                ? `${generator.model} · ${kvaText(generator.ratedKva)} kVA`
                : "None chosen yet",
            },
            {
              label: "Runs",
              value: runsText(plan.runFromHour, plan.runToHour),
            },
            {
              label: "Days on site",
              value: plan.firstPoweredDay
                ? `${days}, from ${dayLabel(plan.firstPoweredDay, 1)}`
                : String(days),
            },
            {
              label: "Safety margin",
              value: `${formatNumber(plan.safetyMarginPct, 1)}%`,
            },
            {
              label: "Jerry can size",
              value: `${formatNumber(plan.canLitres, 1)} L`,
            },
            { label: "Power factor", value: formatNumber(plan.powerFactor, 2) },
            ...(plan.lowLoadFactor !== 1
              ? [
                  {
                    label: "Extra fuel when lightly loaded",
                    value: `× ${formatNumber(plan.lowLoadFactor, 2)}`,
                  },
                ]
              : []),
            ...(plan.secondGeneratorNote
              ? [
                  {
                    label: "Spare generator",
                    value: `${plan.secondGeneratorNote.trim()} Not in the sums.`,
                  },
                ]
              : []),
          ]}
        />
      </PowerCard>

      <PowerCard label="Generators">
        <CardHead
          title="Generators"
          meta="The camp's own, lent by a member, or hired. They carry from year to year."
          actions={
            canEdit ? (
              <AddGeneratorButton inventory={inventoryOptions} />
            ) : undefined
          }
        />
        {o.generators.length === 0 ? (
          <EmptyNote title="No generators yet.">
            Add one from its datasheet: the rated and most kVA, the tank, and
            how long a tank lasts at half and full load.
          </EmptyNote>
        ) : (
          <div role="list" aria-label="Generators">
            {o.generators.map((g) => (
              <Row
                key={g.id}
                label={g.model}
                cols={
                  canEdit
                    ? "grid-cols-[minmax(0,1fr)_56px] page-sm:grid-cols-[minmax(0,1fr)_64px]"
                    : "grid-cols-1"
                }
              >
                <RowName
                  name={g.model}
                  sub={
                    <>
                      {g.id === plan.generatorId && (
                        <span className="mb-1 block">
                          <Chip tone="info">In the plan</Chip>
                        </span>
                      )}
                      {[
                        `${kvaText(g.ratedKva)} kVA (most ${kvaText(g.maxKva)})`,
                        `${formatNumber(g.tankLitres, 1)} L tank`,
                        FUEL_LABELS[g.fuelType],
                        GENERATOR_OWNER_LABELS[g.owner],
                        g.noiseNote,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </>
                  }
                />
                {canEdit && (
                  <div className="flex justify-end">
                    <GeneratorRowActions
                      generator={editable(g)}
                      inventory={inventoryOptions}
                    />
                  </div>
                )}
              </Row>
            ))}
          </div>
        )}
      </PowerCard>

      <FuelMethod
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
    </>
  );
}

function FuelAnswer({
  o,
  summary,
  fuelWord,
  lastYear,
}: {
  o: PowerOverview;
  summary: NonNullable<ReturnType<typeof fuelSummary>>;
  fuelWord: string;
  lastYear: { cycle: number; litresPerDay: number } | null;
}) {
  const { fuel, totalCans, toBuy } = summary;
  const plan = o.plan;
  const generator = o.generator!;
  const days = plan.daysOnSite;
  const daysWord = `${days} day${days === 1 ? "" : "s"}`;
  const avgLitres = days > 0 ? fuel.burnLitres / days : 0;
  const avgKwh =
    days > 0 ? fuel.perDay.reduce((sum, d) => sum + d.kWh, 0) / days : 0;
  const offKwh = Math.max(0, ...fuel.perDay.map((d) => d.unservedWh)) / 1000;
  const refills = refillText(fuel.refillsPerDay);
  const cans = (n: number) => `${n} can${n === 1 ? "" : "s"}`;

  return (
    <>
      <Verdict
        legend={[
          {
            tone: "neutral",
            text: `${formatNumber(summary.daysDiffer ? summary.busiestDayLitres : avgLitres, 1, true)} L a day${summary.daysDiffer ? " at the busiest" : ""}`,
          },
          plan.cansOwned > 0
            ? {
                tone: toBuy > 0 ? "warn" : "ok",
                text:
                  toBuy > 0
                    ? `We own ${cans(plan.cansOwned)}: buy ${cans(toBuy)}`
                    : `We own ${cans(plan.cansOwned)}: enough`,
              }
            : { tone: "warn", text: `Buy ${cans(toBuy)}` },
          ...(refills ? [{ tone: "neutral" as const, text: refills }] : []),
          ...(lastYear
            ? [
                {
                  tone: "neutral" as const,
                  text: `${lastYear.cycle} used ${formatNumber(lastYear.litresPerDay, 1)} L a day`,
                },
              ]
            : []),
        ]}
      >
        Fill <b>{`${totalCans} jerry can${totalCans === 1 ? "" : "s"}`}</b>:{" "}
        {formatNumber(fuel.litresWithMargin, 0)} L of {fuelWord} for {daysWord}.
      </Verdict>

      {(offKwh > 0 || fuel.overloaded) && (
        <div className="mb-4 flex flex-col gap-2">
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
          {fuel.overloaded && (
            <Alert variant="error">
              <Zap aria-hidden />
              <span>
                The load goes over the generator&apos;s rating in some hours.
                The litres past full load are a guess: choose a bigger generator
                or move loads.
              </span>
            </Alert>
          )}
        </div>
      )}

      <PowerCard className="p-4" label="How we get there">
        <CardHead title="How we get there" flat />
        <Ledger
          rows={[
            {
              label: `Fuel a day for ${formatNumber(avgKwh, 1, true)} kWh on the ${railName(generator.model)}${summary.daysDiffer ? " (on average)" : ""}`,
              figure: litres(avgLitres, 1),
            },
            {
              label: `× ${daysWord} on site`,
              figure: litres(fuel.burnLitres, 1),
            },
            {
              label: `+ ${formatNumber(plan.safetyMarginPct, 1)}% safety margin`,
              figure: litres(fuel.litresWithMargin - fuel.burnLitres, 1),
            },
            {
              label: "Litres for the burn",
              figure: litres(fuel.litresWithMargin, 1),
              total: true,
            },
            {
              label: `÷ ${formatNumber(plan.canLitres, 1)} L a can, rounded up`,
              figure: `${totalCans} can${totalCans === 1 ? "" : "s"}`,
            },
            { label: "− cans we already own", figure: String(plan.cansOwned) },
            { label: "Cans to buy", figure: String(toBuy), total: true },
          ]}
        />
      </PowerCard>

      {summary.daysDiffer && (
        <FuelDayByDay
          days={fuel.perDay.map((d) => ({
            label: dayLabel(plan.firstPoweredDay, d.day),
            litres: d.litres,
            kWh: d.kWh,
          }))}
        />
      )}
    </>
  );
}

export default function PowerFuelPage() {
  return (
    <PowerFrame section="fuel">
      <FuelSection />
    </PowerFrame>
  );
}
