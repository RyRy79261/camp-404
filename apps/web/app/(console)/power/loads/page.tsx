import Link from "next/link";
import { Fuel, Lock, PlugZap } from "lucide-react";
import {
  MAINS_VOLTS,
  amps,
  canEditPower,
  dayLabel,
  generatorLoadPct,
  hoursOn,
  loadBand,
  loadWatts,
  powerTotals,
} from "@camp404/core";
import type { LoadCategory } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import type {
  EditableLoad,
  InventoryOption,
} from "@/components/power/load-editor-dialog";
import {
  AddLoadButton,
  CopyLastYearButton,
  LoadRowActions,
  PlanSettingsButton,
} from "@/components/power/load-list-controls";
import {
  BreakdownCard,
  DayByDayCard,
  GeneratorRail,
  PowerKpiCards,
  type GeneratorRailData,
  type PowerKpi,
} from "@/components/power/load-panels";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getGenerator,
  getPowerPlan,
  listPowerInventory,
  listPowerLoads,
  previousLoadCycle,
  type PowerLoadRow,
} from "@/lib/power";
import {
  CATEGORY_LABELS,
  POWER_FUEL_PATH,
  POWER_REFUSAL,
  daysText,
  formatNumber,
  kw,
  ownerText,
  scheduleText,
  watts,
} from "@/lib/power-copy";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Load list — Camp 404" };

// The camp's load list and power calculator (#253). Every approved member
// reads it; a captain or a Power & Lighting lead edits it. Composed from the
// AfrikaBurn console: the categories screen for the list (the table in a card,
// Add opening a dialog, Edit and Remove per row, and for everyone else the
// controls PRESENT BUT DISABLED with one Lock line above the table that each
// one describes to), and the status board for the results (the KPI row and the
// officer-coverage rail, here the generator).
//
// Everything is computed here on the server with the core functions, so the
// figures on the page are the ones the tests pin. No member id reaches the
// page: a load has none, and a member's own load reads "Member-owned".

/** The one refusal line every disabled control on this page describes to. */
const REFUSAL_ID = "power-edit-refusal";

/** The row as the edit dialog takes it: no year, order or timestamps. */
function editable(row: PowerLoadRow): EditableLoad {
  return {
    id: row.id,
    version: row.version,
    name: row.name,
    area: row.area,
    category: row.category,
    quantity: row.quantity,
    wattsEach: row.wattsEach,
    surgeWattsEach: row.surgeWattsEach,
    dutyPct: row.dutyPct,
    schedule: row.schedule,
    hoursPerDay: row.hoursPerDay,
    windows: row.windows,
    fromDay: row.fromDay,
    toDay: row.toDay,
    volts: row.volts,
    current: row.current,
    owner: row.owner,
    neighbourCamp: row.neighbourCamp,
    inventoryItemId: row.inventoryItemId,
    circuit: row.circuit,
  };
}

/** Current at a voltage, as "40 A at 12 V": amps = watts ÷ volts. */
function ampsText(w: number, volts: number): string {
  return `${formatNumber(amps(w, volts), 1)} A at ${formatNumber(volts, 1)} V`;
}

function loadColumns(
  canEdit: boolean,
  inventory: InventoryOption[],
): ResponsiveColumn<PowerLoadRow>[] {
  return [
    {
      id: "name",
      header: "Load",
      role: "title",
      cellClassName: "font-medium",
      cell: (r) => r.name,
    },
    {
      id: "category",
      header: "Category",
      role: "badge",
      cell: (r) => (
        <Badge variant="outline">{CATEGORY_LABELS[r.category]}</Badge>
      ),
    },
    {
      id: "area",
      header: "Area",
      cellClassName: "text-muted-foreground",
      cell: (r) => r.area,
    },
    {
      id: "qty",
      header: "Qty × W",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (r) => `${r.quantity} × ${watts(r.wattsEach)}`,
    },
    {
      id: "duty",
      header: "Duty",
      align: "right",
      cellClassName: "tabular-nums text-muted-foreground",
      cell: (r) => `${formatNumber(r.dutyPct, 0)}%`,
    },
    {
      id: "schedule",
      header: "Runs",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (r) => scheduleText(r),
    },
    {
      id: "days",
      header: "Days",
      cellClassName: "whitespace-nowrap text-muted-foreground",
      cell: (r) => daysText(r),
    },
    {
      id: "w",
      header: "W · A",
      align: "right",
      cellClassName: "tabular-nums whitespace-nowrap",
      // The current sits under the watts, so the table keeps its width. Mains
      // is the norm, so only a load on another voltage names it.
      cell: (r) => (
        <span className="inline-flex flex-col items-end">
          <span>{watts(loadWatts(r))}</span>
          <span className="text-xs text-muted-foreground">
            {r.volts === MAINS_VOLTS
              ? `${formatNumber(amps(loadWatts(r), r.volts), 1)} A`
              : ampsText(loadWatts(r), r.volts)}
          </span>
        </span>
      ),
    },
    {
      id: "wh",
      header: "Wh a day",
      align: "right",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (r) => formatNumber(loadWatts(r) * hoursOn(r), 0),
    },
    {
      id: "owner",
      header: "Owner",
      cellClassName: "text-muted-foreground",
      cell: (r) => ownerText(r),
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (r) => (
        <LoadRowActions
          load={editable(r)}
          canEdit={canEdit}
          refusalId={REFUSAL_ID}
          inventory={inventory}
        />
      ),
    },
  ];
}

export default async function PowerLoadsPage() {
  // Every approved member reads the list.
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditPower(rank, leadTeams);

  const [loads, plan, inventory, earlier] = await Promise.all([
    listPowerLoads(),
    getPowerPlan(),
    // Only an editor fills a load from the inventory.
    canEdit ? listPowerInventory() : Promise.resolve([]),
    previousLoadCycle(),
  ]);
  const generator = plan.generatorId
    ? await getGenerator(plan.generatorId)
    : null;

  const totals = powerTotals(loads, plan.daysOnSite, plan.powerFactor);
  const days = plan.daysOnSite;
  const peakDay = dayLabel(plan.firstPoweredDay, totals.peak.day);

  const kpis: PowerKpi[] = [
    {
      key: "connected",
      label: "Connected load",
      value: kw(totals.connectedWatts),
      hint: "Everything plugged in, at full draw.",
    },
    {
      key: "peak",
      label: "Estimated peak",
      value: kw(totals.peak.watts),
      secondary: `${formatNumber(totals.peak.kva, 2, true)} kVA`,
      current: ampsText(totals.peak.watts, MAINS_VOLTS),
      hint:
        loads.length === 0
          ? "The most drawn at once."
          : `The most drawn at once, on ${peakDay}.`,
      note: totals.peak.assumesAllOn
        ? "assumes everything on at once"
        : undefined,
    },
    {
      key: "surge",
      label: "Surge headroom",
      value: kw(totals.surge.watts),
      secondary: `${formatNumber(totals.surge.kva, 2, true)} kVA`,
      current: ampsText(totals.surge.watts, MAINS_VOLTS),
      hint: "The peak plus the biggest start-up draw of any one item.",
    },
    {
      key: "energy",
      label: "Energy",
      value: `${formatNumber(totals.busiestDayKwh, 2, true)} kWh`,
      hint: `a day on the busiest day · ${formatNumber(totals.burnKwh, 1)} kWh for the burn over ${days} day${days === 1 ? "" : "s"}`,
    },
  ];

  let rail: GeneratorRailData | null = null;
  if (generator) {
    const load = generatorLoadPct(
      totals.peak.watts,
      plan.powerFactor,
      generator.ratedKva,
    );
    rail = {
      model: generator.model,
      ratedKva: generator.ratedKva,
      maxKva: generator.maxKva,
      kvaBasedPct: load.kvaBasedPct,
      kwBasedPct: load.kwBasedPct,
      band: loadBand(load.kvaBasedPct, totals.surge.kva, generator.maxKva),
      surgeExceedsMax: totals.surge.kva > generator.maxKva,
    };
  }

  const inventoryOptions: InventoryOption[] = inventory.map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    wattsEach: i.wattsEach,
  }));
  const canCopy = loads.length === 0 && earlier !== null;
  // Offered once, as the empty state's call to action (the only time it
  // applies), so the page never carries two identical buttons.
  const copyButton = canCopy ? (
    <CopyLastYearButton
      fromCycle={earlier}
      canEdit={canEdit}
      refusalId={REFUSAL_ID}
    />
  ) : null;

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Power & Lighting"
        title="Load list"
        description="Everything the camp plugs in this year and what it adds up to. Everyone can read it; captains and Power & Lighting leads edit it."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href={POWER_FUEL_PATH}>
                <Fuel aria-hidden />
                Fuel estimate
              </Link>
            </Button>
            {canEdit && (
              <PlanSettingsButton
                key={plan.version}
                plan={{
                  daysOnSite: plan.daysOnSite,
                  firstPoweredDay: plan.firstPoweredDay,
                  powerFactor: plan.powerFactor,
                  version: plan.version,
                }}
              />
            )}
            <AddLoadButton
              canEdit={canEdit}
              refusalId={REFUSAL_ID}
              inventory={inventoryOptions}
            />
          </div>
        }
      />

      <div className="flex flex-col gap-6">
        <PowerKpiCards kpis={kpis} />

        <GeneratorRail generator={rail} />

        <section aria-labelledby="load-list" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="load-list" className="text-base font-semibold">
              This year&apos;s loads
            </h2>
            <p className="text-xs text-muted-foreground">
              {loads.length} load{loads.length === 1 ? "" : "s"} · {days} day
              {days === 1 ? "" : "s"} on site · power factor{" "}
              {formatNumber(plan.powerFactor, 2)}
            </p>
          </div>

          {!canEdit && (
            <p
              id={REFUSAL_ID}
              className="flex items-start gap-2 rounded-lg border border-border bg-card/40 px-3 py-2.5 text-xs text-muted-foreground"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {POWER_REFUSAL}
            </p>
          )}

          {loads.length === 0 ? (
            <EmptyState
              icon={<PlugZap />}
              title="No loads yet"
              description={
                canCopy
                  ? `Start from ${earlier}'s list and change what is different, or add the first load.`
                  : "Add what the camp plugs in: fridges, lights, sound, chargers."
              }
              action={copyButton}
            />
          ) : (
            <div className="md:rounded-xl md:border md:bg-card md:text-card-foreground md:shadow-sm">
              <ResponsiveDataTable
                columns={loadColumns(canEdit, inventoryOptions)}
                data={loads}
                getRowKey={(r) => r.id}
                label="Load list"
              />
            </div>
          )}
        </section>

        {loads.length > 0 && (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <BreakdownCard
                id="by-area"
                title="By area"
                keyHeader="Area"
                rows={totals.byArea}
              />
              <BreakdownCard
                id="by-category"
                title="By category"
                keyHeader="Category"
                rows={totals.byCategory}
                labelOf={(key) => CATEGORY_LABELS[key as LoadCategory] ?? key}
              />
            </div>

            <DayByDayCard
              days={totals.perDay.map((d) => ({
                label: dayLabel(plan.firstPoweredDay, d.day),
                wh: d.wh,
              }))}
            />
          </>
        )}
      </div>
    </div>
  );
}
