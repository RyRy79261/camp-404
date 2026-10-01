import type { ReactNode } from "react";
import {
  MAINS_VOLTS,
  amps,
  connectedWatts,
  dayLabel,
  hoursOn,
  loadWatts,
} from "@camp404/core";
import type { PowerLoadRow } from "@/lib/power";
import { listPowerInventory, previousLoadCycle } from "@/lib/power";
import {
  CATEGORY_LABELS,
  START_UP_SPIKE,
  areaName,
  daysText,
  formatNumber,
  ownerText,
  scheduleText,
  watts,
} from "@/lib/power-copy";
import { getPowerOverview, powerViewer } from "@/lib/power-overview";
import { kvaText, loadVerdict } from "@/lib/power-summary";
import type { EditableLoad, InventoryOption } from "./load-editor-dialog";
import {
  AddLoadButton,
  CopyLastYearButton,
  LoadRowActions,
} from "./load-list-controls";
import {
  CardFoot,
  EmptyNote,
  GroupHead,
  HeadRow,
  PowerCard,
  Row,
  RowName,
  SectionHead,
  TONE_TEXT,
  Verdict,
  narrow,
  wide,
} from "./power-ui";

// The load list (#253), as the approved redesign draws it: the answer first
// (does everything fit the generator?), then the loads grouped by area, each
// row its name, how it runs, its draw and its kWh a day, and one Edit in a
// fixed column for an editor. The columns fit the window, so nothing hides
// behind a sideways scroll. No member id reaches the page: a load has none,
// and a member's own load reads "Member-owned".

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

/** kWh a day on a day the load runs. */
function kwhADay(load: PowerLoadRow): number {
  return (loadWatts(load) * hoursOn(load)) / 1000;
}

/** "2 × 320 W · 24 h", the parts of a load's quiet line both widths share. */
function howItRuns(load: PowerLoadRow): string[] {
  return [
    load.quantity > 1 ? `${load.quantity} × ${watts(load.wattsEach)}` : null,
    scheduleText(load),
    load.dutyPct < 100
      ? `on ${formatNumber(load.dutyPct, 0)}% of the time`
      : null,
    load.fromDay !== null || load.toDay !== null ? daysText(load) : null,
    load.volts !== MAINS_VOLTS
      ? `${formatNumber(amps(loadWatts(load), load.volts), 1)} A at ${formatNumber(load.volts, 1)} V`
      : null,
    load.owner !== "camp" ? ownerText(load) : null,
  ].filter((p): p is string => p !== null);
}

interface AreaGroup {
  key: string;
  name: string;
  loads: PowerLoadRow[];
  watts: number;
  kwh: number;
}

/** The loads by area, the busiest area first, the biggest draw first. */
function groups(loads: readonly PowerLoadRow[]): AreaGroup[] {
  const byKey = new Map<string, AreaGroup>();
  for (const load of loads) {
    const key = load.area.trim().toLowerCase() || "other";
    const group = byKey.get(key) ?? {
      key,
      name: areaName(load.area),
      loads: [],
      watts: 0,
      kwh: 0,
    };
    group.loads.push(load);
    group.watts += connectedWatts(load);
    group.kwh += kwhADay(load);
    byKey.set(key, group);
  }
  const list = [...byKey.values()];
  for (const g of list) {
    g.loads.sort((a, b) => connectedWatts(b) - connectedWatts(a));
  }
  return list.sort((a, b) => b.watts - a.watts || a.name.localeCompare(b.name));
}

const COLS = {
  edit: "grid-cols-[minmax(0,1fr)_72px_56px] page-sm:grid-cols-[minmax(0,1fr)_88px_80px_64px]",
  read: "grid-cols-[minmax(0,1fr)_72px] page-sm:grid-cols-[minmax(0,1fr)_88px_80px]",
};

export async function LoadsSection() {
  const [{ canEdit }, o] = await Promise.all([
    powerViewer(),
    getPowerOverview(),
  ]);
  const [inventory, earlier] = await Promise.all([
    // Only an editor fills a load from the inventory.
    canEdit ? listPowerInventory() : Promise.resolve([]),
    canEdit && o.loads.length === 0
      ? previousLoadCycle()
      : Promise.resolve(null),
  ]);
  const inventoryOptions: InventoryOption[] = inventory.map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    wattsEach: i.wattsEach,
  }));

  const v = loadVerdict(o);
  const t = v.totals;
  const cols = canEdit ? COLS.edit : COLS.read;
  const needs = t.peak.assumesAllOn
    ? "Everything on at once needs"
    : "At its busiest hour the camp needs";
  const peak = `${kvaText(t.peak.kva)} kVA`;

  let sentence: ReactNode;
  let note: ReactNode = null;
  if (!v.generator) {
    sentence = (
      <>
        <b>No generator chosen yet.</b> {needs} {peak}.
      </>
    );
    note = "Choose the generator in the fuel estimate's plan.";
  } else {
    const g = v.generator;
    const rated = `${kvaText(g.ratedKva)} kVA`;
    const head =
      g.pct > 100
        ? "Over the generator."
        : v.tone === "bad"
          ? "Too close to the limit."
          : v.tone === "warn"
            ? "Near the limit."
            : "Fits the generator.";
    sentence = (
      <>
        <b className={TONE_TEXT[v.tone]}>{head}</b>{" "}
        {g.pct > 100
          ? `${needs} ${peak}; the ${g.model} gives ${rated}.`
          : `${needs} ${peak} of the ${g.model}'s ${rated}.`}
      </>
    );
    if (g.surgeOverMax) {
      note = `The start-up spike, ${kvaText(t.surge.kva)} kVA, is more than the ${g.model}'s most, ${kvaText(g.maxKva)} kVA.`;
    }
  }

  const daysDiffer = o.loads.some(
    (l) => l.fromDay !== null || l.toDay !== null,
  );
  const busiest = t.perDay.reduce(
    (best, d) => (d.wh > best.wh ? d : best),
    t.perDay[0] ?? { day: 1, wh: 0 },
  );

  return (
    <>
      <SectionHead
        title="Load list"
        sentence="Everything the camp plugs in, by area."
        actions={
          canEdit ? <AddLoadButton inventory={inventoryOptions} /> : undefined
        }
      />

      {v.hasLoads && (
        <Verdict
          gauge={
            v.generator
              ? {
                  pct: v.generator.pct,
                  tone: v.tone,
                  label: `${formatNumber(v.generator.pct, 0)}%`,
                }
              : undefined
          }
          legend={[
            { tone: v.generator ? v.tone : "neutral", text: `Peak ${peak}` },
            {
              tone: "neutral",
              text: `${START_UP_SPIKE} ${kvaText(t.surge.kva)} kVA`,
            },
            {
              tone: "neutral",
              text: `${formatNumber(t.busiestDayKwh, 1, true)} kWh a day`,
            },
          ]}
          note={note}
        >
          {sentence}
        </Verdict>
      )}

      <PowerCard label="This year's loads">
        {o.loads.length === 0 ? (
          <EmptyNote
            title="No loads yet."
            action={
              earlier !== null ? (
                <CopyLastYearButton fromCycle={earlier} />
              ) : undefined
            }
          >
            {earlier !== null
              ? `Start from ${earlier}'s list and change what is different, or add the first load.`
              : "The fridges, lights, sound and chargers the camp plugs in go here."}
          </EmptyNote>
        ) : (
          <>
            <HeadRow cols={cols}>
              <div>Load</div>
              <div className="text-right">Draw</div>
              <div className={`text-right ${wide}`}>kWh a day</div>
              {canEdit && <div />}
            </HeadRow>
            <div role="list" aria-label="Loads">
              {groups(o.loads).map((group) => (
                <div key={group.key}>
                  <GroupHead
                    label={group.name}
                    figure={`${watts(group.watts)} · ${formatNumber(group.kwh, 1, true)} kWh a day`}
                  />
                  {group.loads.map((load) => {
                    const parts = howItRuns(load);
                    const kwh = kwhADay(load);
                    return (
                      <Row key={load.id} cols={cols} label={load.name}>
                        <RowName
                          name={load.name}
                          sub={
                            <>
                              <span className={wide}>
                                {[
                                  ...parts,
                                  CATEGORY_LABELS[load.category],
                                ].join(" · ")}
                              </span>
                              <span className={narrow}>
                                {parts.join(" · ")}
                              </span>
                            </>
                          }
                        />
                        <div className="text-right tabular-nums whitespace-nowrap">
                          <div>{watts(connectedWatts(load))}</div>
                          <div
                            className={`mt-1 text-xs text-muted-foreground ${narrow}`}
                          >
                            {formatNumber(kwh, 1, true)} kWh
                          </div>
                        </div>
                        <div
                          className={`text-right tabular-nums whitespace-nowrap ${wide}`}
                        >
                          {formatNumber(kwh, 2, true)}
                        </div>
                        {canEdit && (
                          <div className="flex justify-end">
                            <LoadRowActions
                              load={editable(load)}
                              inventory={inventoryOptions}
                            />
                          </div>
                        )}
                      </Row>
                    );
                  })}
                </div>
              ))}
            </div>
            <CardFoot>
              {daysDiffer ? (
                <details>
                  <summary className="cursor-pointer">
                    Some loads run on some days only. The busiest is{" "}
                    {dayLabel(o.plan.firstPoweredDay, busiest.day)}, at{" "}
                    {formatNumber(busiest.wh / 1000, 1, true)} kWh.
                  </summary>
                  <ul aria-label="Day by day" className="mt-2 flex flex-col">
                    {t.perDay.map((d) => (
                      <li
                        key={d.day}
                        className="flex justify-between border-t border-border py-1.5 tabular-nums first:border-t-0"
                      >
                        <span>{dayLabel(o.plan.firstPoweredDay, d.day)}</span>
                        <span>{formatNumber(d.wh / 1000, 1, true)} kWh</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                "Every day is the same. No load is set to some days only."
              )}
            </CardFoot>
          </>
        )}
      </PowerCard>
    </>
  );
}
