import {
  CAMP_TIME_ZONE,
  actualAgainstEstimate,
  campLocalText,
  effectiveRefuels,
} from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { cn } from "@camp404/ui/lib/utils";
import {
  AddCansButton,
  CanRowActions,
  CountCansButton,
  LogRefuelButton,
  RefuelRowActions,
  type EditableCan,
  type EditableEntry,
  type RefuelOptions,
} from "@/components/power/fuel-log-controls";
import { PowerFrame } from "@/components/power/power-frame";
import {
  Bar,
  CardHead,
  Chip,
  EmptyNote,
  PowerCard,
  Row,
  RowName,
  SectionHead,
  Verdict,
} from "@/components/power/power-ui";
import {
  PRINT_REFUEL_SHEET_PATH,
  formatNumber,
  litres,
} from "@/lib/power-copy";
import { getPowerOverview, powerViewer } from "@/lib/power-overview";
import type { RefuelEntryRow } from "@/lib/power-site";
import { fuelSummary, stockSummary } from "@/lib/power-summary";
import { listAssignableMembers } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Refuelling — Camp 404" };

// Fuel (#255) in the Power program's answer rail. There is no signal at the
// burn, so the paper log sheet taped to the generator is the record on site
// and the page's main button prints it; an editor types the lines in after.
// The answer is the fuel in stock against what the burn needs; then the cans,
// then the log. The log is append-only: a correction or a strike-out is a new
// entry, and the old one stays, marked. The member who filled the generator
// is named, as the task board names who a task is for; no money here.

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

/** "Fri 10 Apr" from a YYYY-MM-DD day. */
function dayText(day: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

type EntryStatus = "counts" | "replaced" | "struck";

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

async function RefuellingSection() {
  const [{ canEdit, campUser }, o] = await Promise.all([
    powerViewer(),
    getPowerOverview(),
  ]);
  // Only an editor picks who filled the generator.
  const members = canEdit ? await listAssignableMembers() : [];
  const fuel = fuelSummary(o);
  const stock = stockSummary(o, fuel);
  const status = statuses(o.entries);

  const options: RefuelOptions | null = canEdit
    ? {
        generators: o.generators.map((g) => ({ id: g.id, label: g.model })),
        cans: o.cans.map((c) => ({
          id: c.id,
          label: c.label,
          litres: c.litres,
        })),
        members: members.map((m) => ({
          id: m.id,
          displayName: m.displayName,
        })),
        defaultGeneratorId:
          o.generator?.archivedAt === null ? o.generator.id : null,
        selfId: campUser.id,
        now: campLocalText(new Date()),
      }
    : null;
  const cans: EditableCan[] = o.cans.map((c) => ({
    id: c.id,
    version: c.version,
    label: c.label,
    capacityLitres: c.capacityLitres,
    litres: c.litres,
    location: c.location,
  }));
  const compare = actualAgainstEstimate({
    entries: o.entries,
    estimate: fuel?.fuel.perDay ?? [],
    firstPoweredDay: o.plan.firstPoweredDay,
  });
  const pct =
    stock.need && stock.need > 0 ? (stock.onHand / stock.need) * 100 : null;

  return (
    <>
      <SectionHead
        title="Refuelling"
        sentence="No signal on site."
        actions={
          <>
            {options && <LogRefuelButton options={options} />}
            <Button asChild>
              <a href={PRINT_REFUEL_SHEET_PATH} target="_blank" rel="noopener">
                Print the log sheet
              </a>
            </Button>
          </>
        }
      />

      <Verdict
        gauge={
          pct !== null
            ? {
                pct,
                tone: pct >= 100 ? "ok" : "neutral",
                label: `${formatNumber(pct, 0)}%`,
              }
            : undefined
        }
        legend={
          o.cans.length > 0
            ? [
                { tone: "neutral", text: `Full ${stock.full}` },
                { tone: "neutral", text: `Part full ${stock.part}` },
                { tone: "mute", text: `Empty ${stock.empty}` },
              ]
            : undefined
        }
      >
        <b>{litres(stock.onHand, 0)}</b> in stock
        {stock.need !== null
          ? ` of the ${litres(stock.need, 0)} the burn needs.`
          : ". The fuel estimate has no figure yet to set it against."}
      </Verdict>

      <PowerCard label="Cans">
        <CardHead
          title="Cans"
          meta={`${o.cans.length} can${o.cans.length === 1 ? "" : "s"} · ${litres(stock.onHand, 0)}`}
          actions={
            canEdit ? (
              <>
                <AddCansButton />
                <CountCansButton
                  key={cans.map((c) => c.version).join(",")}
                  cans={cans}
                />
              </>
            ) : undefined
          }
        />
        {o.cans.length === 0 ? (
          <EmptyNote title="No cans yet.">
            The jerry cans the camp brings, with the litres in each.
          </EmptyNote>
        ) : (
          <ul
            aria-label="Cans"
            className="grid grid-cols-1 page-sm:grid-cols-2 [&>li]:border-t [&>li]:border-border [&>li:first-child]:border-t-0 page-sm:[&>li:nth-child(2)]:border-t-0 page-sm:[&>li:nth-child(odd)]:border-r"
          >
            {cans.map((c) => (
              <li
                key={c.id}
                aria-label={c.label}
                className="grid min-h-[52px] grid-cols-[64px_minmax(0,1fr)_88px] items-center gap-3 px-3 py-3 text-sm page-sm:px-4"
              >
                {canEdit ? (
                  <CanRowActions can={c} />
                ) : (
                  <span className="truncate font-semibold">{c.label}</span>
                )}
                <Bar
                  pct={(c.litres / c.capacityLitres) * 100}
                  tone={c.litres <= 0 ? "mute" : "neutral"}
                />
                <span className="whitespace-nowrap text-right tabular-nums">
                  {formatNumber(c.litres, 1)} of{" "}
                  {formatNumber(c.capacityLitres, 1)} L
                </span>
              </li>
            ))}
          </ul>
        )}
      </PowerCard>

      <PowerCard label="Refuelling log">
        <CardHead
          title="Refuelling log"
          meta="Typed in from the paper sheet after the burn. Newest first."
        />
        {o.entries.length === 0 ? (
          <EmptyNote title="Nothing typed in yet.">
            The sheet taped to the generator is the record on site. After the
            burn, type in each line; a mistake gets a correction, nothing is
            deleted.
          </EmptyNote>
        ) : (
          <div role="list" aria-label="Refuelling log">
            {o.entries.map((e) => {
              const st = status.get(e.id);
              const counts = st === "counts";
              return (
                <Row
                  key={e.id}
                  label={whenText(e.refuelledAt)}
                  cols={
                    canEdit
                      ? "grid-cols-[minmax(0,1fr)_64px_88px] page-sm:grid-cols-[minmax(0,1fr)_80px_96px]"
                      : "grid-cols-[minmax(0,1fr)_64px] page-sm:grid-cols-[minmax(0,1fr)_80px]"
                  }
                >
                  <RowName
                    muted={!counts}
                    name={
                      <span className={cn(!counts && "line-through")}>
                        {whenText(e.refuelledAt)}
                      </span>
                    }
                    sub={
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>
                          {[
                            e.generatorModel,
                            e.fromCanLabel ? `from ${e.fromCanLabel}` : null,
                            e.doneByName,
                            e.hourMeter !== null
                              ? `meter ${formatNumber(e.hourMeter, 1)} h`
                              : null,
                            e.note,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        {e.voided ? (
                          <Chip tone="bad">Strike-out</Chip>
                        ) : e.correctsEntryId ? (
                          <Chip tone="warn">Correction</Chip>
                        ) : null}
                        {st === "replaced" && <Chip>Replaced</Chip>}
                      </span>
                    }
                  />
                  <div
                    className={cn(
                      "text-right tabular-nums whitespace-nowrap",
                      !counts && "text-muted-foreground line-through",
                    )}
                  >
                    {litres(e.litres, 1)}
                  </div>
                  {options && (
                    <div className="flex justify-end">
                      {counts && (
                        <RefuelRowActions
                          entry={editableEntry(e)}
                          options={options}
                        />
                      )}
                    </div>
                  )}
                </Row>
              );
            })}
          </div>
        )}
      </PowerCard>

      {compare.length > 0 && (
        <details className="mb-4 border border-border bg-card">
          <summary className="cursor-pointer p-4 text-sm font-semibold">
            Put in against the estimate, day by day
          </summary>
          <ul aria-label="Put in against the estimate" className="px-4 pb-4">
            {compare.map((row) => (
              <li
                key={row.label}
                className="grid grid-cols-[minmax(0,1fr)_80px_80px] gap-3 border-t border-border py-2 text-sm tabular-nums first:border-t-0"
              >
                <span>
                  {row.day !== null ? `Day ${row.day} · ` : ""}
                  {dayText(row.label)}
                </span>
                <span className="text-right text-muted-foreground">
                  {row.estimate === null ? "—" : litres(row.estimate, 1)}
                </span>
                <span className="text-right">{litres(row.actual, 1)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export default function PowerFuelLogPage() {
  return (
    <PowerFrame section="fuel-log">
      <RefuellingSection />
    </PowerFrame>
  );
}
