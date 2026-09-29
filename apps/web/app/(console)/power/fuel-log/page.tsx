import type { ReactNode } from "react";
import { AlertTriangle, Fuel, Lock, Printer } from "lucide-react";
import {
  CAMP_TIME_ZONE,
  actualAgainstEstimate,
  burnRate,
  campLocalText,
  canEditPower,
  daysOfFuelLeft,
  effectiveRefuels,
  fuelForPlan,
  lowFuelWarning,
  remainingBurnDays,
} from "@camp404/core";
import { Alert } from "@camp404/ui/components/alert";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { EmptyState } from "@camp404/ui/components/empty-state";
import { PageHeading } from "@camp404/ui/components/page-heading";
import {
  ResponsiveDataTable,
  type ResponsiveColumn,
} from "@camp404/ui/components/responsive-data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@camp404/ui/components/table";
import {
  AddCansButton,
  CanRowActions,
  LogRefuelButton,
  LowFuelForm,
  RefuelRowActions,
  type EditableEntry,
  type RefuelOptions,
} from "@/components/power/fuel-log-controls";
import { PowerKpiCards, type PowerKpi } from "@/components/power/load-panels";
import { PowerTabs } from "@/components/power/power-tabs";
import { captainPageGate } from "@/lib/captain-gate";
import {
  getGenerator,
  getPowerPlan,
  listGenerators,
  listPowerLoads,
} from "@/lib/power";
import {
  CAN_LOCATION_LABELS,
  POWER_REFUSAL,
  PRINT_REFUEL_SHEET_PATH,
  formatNumber,
  litres,
} from "@/lib/power-copy";
import {
  listFuelCans,
  listRefuelEntries,
  type FuelCanRow,
  type RefuelEntryRow,
} from "@/lib/power-site";
import { listAssignableMembers } from "@/lib/tasks";
import { getLeadTeams } from "@/lib/users";

export const dynamic = "force-dynamic";

export const metadata = { title: "Refuelling — Camp 404" };

// Fuel on site (#255). Every approved member reads it; a captain or a Power &
// Lighting lead adds cans, logs refuellings and sets the warning. Composed as
// the other power pages, from AfrikaBurn's console: the status board's KPI row
// for the stock and the days left, the categories screen for the cans and the
// log (a table in a card, Add opening a dialog, a row's own buttons, and for
// everyone else the controls PRESENT BUT DISABLED with one Lock line).
//
// The log is append-only: a correction or a strike-out is a new entry, and
// the old one stays, marked. Every figure is worked out here on the server
// with the core functions. The member who filled the generator is named, as
// the task board names who a task is for; there is no other member data and
// no money here.

const REFUSAL_ID = "power-fuel-log-refusal";

const WHEN = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: CAMP_TIME_ZONE,
});

function whenText(at: Date): string {
  return WHEN.format(at);
}

/** "25 Apr 2027" from a YYYY-MM-DD day. */
function dayText(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

type EntryStatus = "counts" | "replaced" | "struck";

function canColumns(canEdit: boolean): ResponsiveColumn<FuelCanRow>[] {
  return [
    {
      id: "label",
      header: "Can",
      role: "title",
      cellClassName: "font-medium",
      cell: (c) => c.label,
    },
    {
      id: "litres",
      header: "Litres",
      align: "right",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (c) =>
        `${formatNumber(c.litres, 1)} of ${formatNumber(c.capacityLitres, 1)} L`,
    },
    {
      id: "where",
      header: "Where",
      cellClassName: "text-muted-foreground",
      cell: (c) => CAN_LOCATION_LABELS[c.location],
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (c) => (
        <CanRowActions
          can={{
            id: c.id,
            version: c.version,
            label: c.label,
            capacityLitres: c.capacityLitres,
            litres: c.litres,
            location: c.location,
          }}
          canEdit={canEdit}
          refusalId={REFUSAL_ID}
        />
      ),
    },
  ];
}

function entryColumns(
  canEdit: boolean,
  status: Map<string, EntryStatus>,
  options: RefuelOptions | null,
): ResponsiveColumn<RefuelEntryRow>[] {
  const muted = (e: RefuelEntryRow) =>
    status.get(e.id) !== "counts" ? "text-muted-foreground line-through" : "";
  return [
    {
      id: "when",
      header: "When",
      role: "title",
      cellClassName: "whitespace-nowrap font-medium",
      cell: (e) => <span className={muted(e)}>{whenText(e.refuelledAt)}</span>,
    },
    {
      id: "badges",
      header: "Marks",
      role: "badge",
      hideHeader: true,
      cell: (e) => {
        const marks: ReactNode[] = [];
        if (e.voided) {
          marks.push(
            <Badge key="struck" variant="destructive">
              Strike-out
            </Badge>,
          );
        } else if (e.correctsEntryId) {
          marks.push(
            <Badge key="fix" variant="warning">
              Correction
            </Badge>,
          );
        }
        if (status.get(e.id) === "replaced") {
          marks.push(
            <Badge key="replaced" variant="outline">
              Replaced
            </Badge>,
          );
        }
        if (e.fromPaper) {
          marks.push(
            <Badge key="paper" variant="secondary">
              From paper
            </Badge>,
          );
        }
        return marks.length > 0 ? (
          <span className="flex flex-wrap gap-1">{marks}</span>
        ) : null;
      },
    },
    {
      id: "litres",
      header: "Litres",
      align: "right",
      cellClassName: "tabular-nums whitespace-nowrap",
      cell: (e) => <span className={muted(e)}>{litres(e.litres, 1)}</span>,
    },
    {
      id: "generator",
      header: "Generator",
      cellClassName: "text-muted-foreground",
      cell: (e) => e.generatorModel ?? "—",
    },
    {
      id: "can",
      header: "From can",
      cellClassName: "text-muted-foreground",
      cell: (e) => e.fromCanLabel ?? "—",
    },
    {
      id: "who",
      header: "Filled by",
      cell: (e) => e.doneByName ?? "—",
    },
    {
      id: "meter",
      header: "Hour meter",
      align: "right",
      cellClassName: "tabular-nums text-muted-foreground",
      cell: (e) => (e.hourMeter === null ? "—" : formatNumber(e.hourMeter, 1)),
    },
    {
      id: "note",
      header: "Note",
      cellClassName: "text-muted-foreground",
      cell: (e) => e.note ?? "—",
    },
    {
      id: "actions",
      header: "Actions",
      role: "actions",
      hideHeader: true,
      align: "right",
      cell: (e) =>
        status.get(e.id) === "counts" ? (
          <RefuelRowActions
            entry={editableEntry(e)}
            canEdit={canEdit}
            refusalId={REFUSAL_ID}
            options={options}
          />
        ) : null,
    },
  ];
}

function editableEntry(e: RefuelEntryRow): EditableEntry {
  return {
    id: e.id,
    generatorId: e.generatorId,
    refuelledAt: campLocalText(e.refuelledAt),
    litres: e.litres,
    fromCanId: e.fromCanId,
    doneByUserId: e.doneByUserId,
    hourMeter: e.hourMeter,
    note: e.note,
    fromPaper: e.fromPaper,
    label: `the entry of ${whenText(e.refuelledAt)}`,
  };
}

/** Each entry: it counts, a later one replaced it, or it is a strike-out. */
function statuses(entries: readonly RefuelEntryRow[]) {
  const counting = new Set(effectiveRefuels(entries).map((e) => e.id));
  return new Map<string, EntryStatus>(
    entries.map((e) => [
      e.id,
      e.voided ? "struck" : counting.has(e.id) ? "counts" : "replaced",
    ]),
  );
}

function daysWord(n: number) {
  return `${formatNumber(n, 1)} day${n === 1 ? "" : "s"}`;
}

export default async function PowerFuelLogPage() {
  // Every approved member reads it.
  const { campUser, rank } = await captainPageGate("camp_member");
  const leadTeams = rank === "team_lead" ? await getLeadTeams(campUser.id) : [];
  const canEdit = canEditPower(rank, leadTeams);

  const [loads, plan, generators, cans, entries, members] = await Promise.all([
    listPowerLoads(),
    getPowerPlan(),
    listGenerators(),
    listFuelCans(),
    listRefuelEntries(),
    // Only an editor picks who filled the generator.
    canEdit ? listAssignableMembers() : Promise.resolve([]),
  ]);
  const generator = plan.generatorId
    ? (generators.find((g) => g.id === plan.generatorId) ??
      (await getGenerator(plan.generatorId)))
    : null;

  const now = new Date();
  const estimate =
    generator && loads.length > 0
      ? fuelForPlan({
          loads,
          generator,
          plan: {
            powerFactor: plan.powerFactor,
            daysOnSite: plan.daysOnSite,
            lowLoadFactor: plan.lowLoadFactor,
            safetyMarginPct: plan.safetyMarginPct,
          },
          schedule: { fromHour: plan.runFromHour, toHour: plan.runToHour },
        })
      : null;
  const estimatePerDay = estimate
    ? Math.max(0, ...estimate.perDay.map((d) => d.litres))
    : null;

  const onHand = cans.reduce((sum, c) => sum + c.litres, 0);
  const rate = burnRate(entries);
  const using = rate?.litresPerDay ?? estimatePerDay;
  const daysLeft = using ? daysOfFuelLeft(onHand, using) : null;
  const remaining = remainingBurnDays(
    plan.firstPoweredDay,
    plan.daysOnSite,
    now,
  );
  const warn = lowFuelWarning({
    daysLeft,
    thresholdDays: plan.lowFuelDays,
    remainingDays: remaining,
  });

  const kpis: PowerKpi[] = [
    {
      key: "on-hand",
      label: "Fuel on hand",
      value: litres(onHand, 1),
      hint: `in ${cans.length} can${cans.length === 1 ? "" : "s"}`,
    },
    {
      key: "using",
      label: "Using",
      value: using === null ? "—" : `${formatNumber(using, 1)} L`,
      hint: rate
        ? `a day, from the last ${rate.refuels} refuellings over ${formatNumber(rate.hours, 1)} h`
        : using === null
          ? "Log two refuellings, or set up the fuel estimate."
          : "a day, from the fuel estimate until two refuellings are logged",
    },
    {
      key: "days-left",
      label: "Days of fuel left",
      value: daysLeft === null ? "—" : formatNumber(daysLeft, 1),
      hint: [
        plan.lowFuelDays > 0
          ? `warns below ${daysWord(plan.lowFuelDays)}`
          : "the warning is off",
        remaining !== null ? `${daysWord(remaining)} of the burn to go` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    {
      key: "estimate",
      label: "Estimate",
      value:
        estimatePerDay === null ? "—" : `${formatNumber(estimatePerDay, 1)} L`,
      hint:
        estimatePerDay === null
          ? "Choose a generator and list the loads on the fuel estimate."
          : "a day on the busiest day, from the fuel estimate",
    },
  ];

  const options: RefuelOptions | null = canEdit
    ? {
        generators: generators.map((g) => ({ id: g.id, label: g.model })),
        cans: cans.map((c) => ({ id: c.id, label: c.label, litres: c.litres })),
        members: members.map((m) => ({ id: m.id, displayName: m.displayName })),
        defaultGeneratorId:
          generator?.archivedAt === null ? generator.id : null,
        selfId: campUser.id,
        now: campLocalText(now),
      }
    : null;

  const status = statuses(entries);
  const compare = actualAgainstEstimate({
    entries,
    estimate: estimate?.perDay ?? [],
    firstPoweredDay: plan.firstPoweredDay,
  });

  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Power & Lighting"
        title="Refuelling"
        description="The fuel in the cans and every time the generator is filled. Everyone can read it; captains and Power & Lighting leads keep it."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <a href={PRINT_REFUEL_SHEET_PATH} target="_blank" rel="noopener">
                <Printer aria-hidden />
                Paper log sheet
              </a>
            </Button>
            <LogRefuelButton
              canEdit={canEdit}
              refusalId={REFUSAL_ID}
              options={options}
            />
          </div>
        }
      />
      <PowerTabs tab="fuel-log" />

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

        {warn && daysLeft !== null && (
          <Alert variant="warning">
            <AlertTriangle aria-hidden />
            <span>
              Fuel is running low: {formatNumber(daysLeft, 1)} days left at{" "}
              {formatNumber(using ?? 0, 1)} L a day. Fetch more fuel, or cut
              what runs.
            </span>
          </Alert>
        )}

        <PowerKpiCards kpis={kpis} label="Fuel on site at a glance" />

        <section aria-labelledby="fuel-stock" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 id="fuel-stock" className="text-base font-semibold">
                Fuel stock
              </h2>
              <p className="text-xs text-muted-foreground">
                This year&apos;s cans and what is in them. A refuelling from a
                can takes its litres out; count a can to set it by hand.
              </p>
            </div>
            <AddCansButton canEdit={canEdit} refusalId={REFUSAL_ID} />
          </div>
          {cans.length === 0 ? (
            <EmptyState
              icon={<Fuel />}
              title="No cans yet"
              description="Add the jerry cans the camp brings, with the litres in each."
            />
          ) : (
            <div className="page-md:rounded-xl page-md:border page-md:bg-card page-md:text-card-foreground page-md:shadow-sm">
              <ResponsiveDataTable
                columns={canColumns(canEdit)}
                data={cans}
                getRowKey={(c) => c.id}
                label="Fuel stock"
              />
            </div>
          )}
        </section>

        <section aria-labelledby="refuel-log" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="refuel-log" className="text-base font-semibold">
              Refuelling log
            </h2>
            <p className="text-xs text-muted-foreground">
              Newest first. Nothing is changed or deleted: a correction or a
              strike-out is a new entry, and the old one stays, marked.
            </p>
          </div>
          {entries.length === 0 ? (
            <EmptyState
              icon={<Fuel />}
              title="Nothing logged yet"
              description="Log each time the generator is filled. With two or more, the page works out the litres a day and the days of fuel left."
            />
          ) : (
            <div className="page-md:rounded-xl page-md:border page-md:bg-card page-md:text-card-foreground page-md:shadow-sm">
              <ResponsiveDataTable
                columns={entryColumns(canEdit, status, options)}
                data={entries}
                getRowKey={(e) => e.id}
                label="Refuelling log"
              />
            </div>
          )}
        </section>

        {compare.length > 0 && (
          <Card role="article" aria-labelledby="actual-vs-estimate">
            <CardHeader>
              <CardTitle id="actual-vs-estimate" className="text-base">
                Put in against the estimate
              </CardTitle>
              <CardDescription>
                {plan.firstPoweredDay
                  ? "Litres put in each day beside the fuel estimate for that day."
                  : "Litres put in each day. Set the first powered day on the load list to see the estimate beside them."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Day</TableHead>
                    <TableHead className="text-right">Estimate</TableHead>
                    <TableHead className="pr-6 text-right">Put in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compare.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="pl-6 whitespace-nowrap">
                        {row.day !== null ? `Day ${row.day} · ` : ""}
                        {dayText(row.label)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.estimate === null ? "—" : litres(row.estimate, 1)}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums">
                        {litres(row.actual, 1)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        <Card role="article" aria-labelledby="low-fuel">
          <CardHeader>
            <CardTitle id="low-fuel" className="text-base">
              Low-fuel warning
            </CardTitle>
            <CardDescription>
              The page warns everyone who opens it when the fuel left runs
              short.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LowFuelForm
              key={plan.version}
              lowFuelDays={plan.lowFuelDays}
              version={plan.version}
              canEdit={canEdit}
              refusalId={REFUSAL_ID}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
