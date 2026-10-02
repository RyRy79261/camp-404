import type { ReactNode } from "react";
import { Button } from "@camp404/ui/components/button";
import { connectedWatts, downstreamIds, treeOrder } from "@camp404/core";
import {
  AddPointButton,
  CopyLastYearGridButton,
  HaveToggle,
  LoadPointSelect,
  PointRowActions,
  type EditablePoint,
  type FeedOption,
} from "@/components/power/grid-controls";
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
  TONE_TEXT,
  Verdict,
} from "@/components/power/power-ui";
import {
  GRID_KIND_LABELS,
  PRINT_GRID_SHEET_PATH,
  areaName,
  formatNumber,
  watts,
} from "@/lib/power-copy";
import { getPowerOverview, powerViewer } from "@/lib/power-overview";
import { previousGridCycle, type GridNodeRow } from "@/lib/power-site";
import {
  gridSummary,
  loadAmps,
  type PowerOverview,
  type Tone,
} from "@/lib/power-summary";

export const dynamic = "force-dynamic";

export const metadata = { title: "Grid — Camp 404" };

// The grid plan (#256) in the Power program's answer rail. It opens on the
// answer, the worst run, then a card for each point: what feeds it, the amps
// its run carries against the cable's rating (fine below 80%, near its limit
// from 80%, over above 100%, "no rating" with none, never a guess), and what
// plugs in there. Then the loads not plugged in anywhere, and the cables and
// adapters, none of which counts as the camp's until someone says so.
//
// Every figure is worked out on the server with the core functions. No member
// data and no money on this page.

const BAND: Record<string, { label: string; tone: Tone }> = {
  ok: { label: "Fine", tone: "ok" },
  warn: { label: "Near limit", tone: "warn" },
  over: { label: "Over", tone: "bad" },
  unknown: { label: "No rating", tone: "mute" },
};

function editable(n: GridNodeRow): EditablePoint {
  return {
    id: n.id,
    version: n.version,
    name: n.name,
    kind: n.kind,
    parentId: n.parentId,
    cable: n.cable,
    cableLengthM: n.cableLengthM,
    cableGaugeMm2: n.cableGaugeMm2,
    cableRatedAmps: n.cableRatedAmps,
    adapter: n.adapter,
    haveCable: n.haveCable,
    haveAdapter: n.haveAdapter,
  };
}

/** "25 m cable, 2.5 mm²": what is known of a run's cable, as its name. */
function cableName(n: GridNodeRow): string {
  const size =
    n.cableGaugeMm2 !== null ? `${formatNumber(n.cableGaugeMm2, 2)} mm²` : null;
  if (n.cable) return [n.cable, size].filter(Boolean).join(", ");
  const base =
    n.cableLengthM !== null
      ? `${formatNumber(n.cableLengthM, 1)} m cable`
      : "Cable";
  return [base, size].filter(Boolean).join(", ");
}

/** "From Main junction · 15 m reel": the run that feeds a point. */
function feedText(n: GridNodeRow, names: Map<string, string>): string {
  if (n.parentId === null) return GRID_KIND_LABELS[n.kind];
  return [
    `From ${names.get(n.parentId) ?? "?"}`,
    n.cable ??
      (n.cableLengthM !== null
        ? `${formatNumber(n.cableLengthM, 1)} m cable`
        : null),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Cable ratings a camp can buy, in amps: the next one up is the advice. */
const CABLE_RATINGS = [10, 16, 20, 25, 32, 40, 63];

/** "the coffee urn": a load's name inside a sentence, an acronym kept. */
function inSentence(name: string): string {
  const t = name.trim();
  return /^[A-Z][a-z]/.test(t) ? t[0]!.toLowerCase() + t.slice(1) : t;
}

/**
 * What to do about the one run over its rating, named: give its biggest load
 * its own run (when it shares the point), or lay the next cable up.
 */
function overAdvice(
  n: GridNodeRow,
  amps: number,
  o: Pick<PowerOverview, "loads" | "where">,
): string {
  const here = o.loads.filter((l) => o.where[l.id] === n.id);
  const biggest = [...here].sort((a, b) => loadAmps(b) - loadAmps(a))[0];
  const next = CABLE_RATINGS.find(
    (r) => r >= amps && r > (n.cableRatedAmps ?? 0),
  );
  const cable = next ? `a ${next} A cable` : "a heavier cable";
  return here.length > 1 && biggest
    ? `Give the ${inSentence(biggest.name)} its own run, or lay ${cable} to the ${n.name}.`
    : `Move a load to another run, or lay ${cable} to the ${n.name}.`;
}

function haveText(have: boolean | null): { text: string; tone: Tone } {
  if (have === null) return { text: "Not checked yet", tone: "mute" };
  return have
    ? { text: "Have it", tone: "ok" }
    : { text: "Need to get", tone: "warn" };
}

async function GridSection() {
  const [{ canEdit }, o] = await Promise.all([
    powerViewer(),
    getPowerOverview(),
  ]);
  const earlier =
    canEdit && o.nodes.length === 0 ? await previousGridCycle() : null;
  const g = gridSummary(o);
  const tree = treeOrder(o.nodes);
  const names = new Map(o.nodes.map((n) => [n.id, n.name]));

  // Points a load can plug in at, and points that can feed another.
  const pointOptions: FeedOption[] = tree.map(({ point }) => ({
    id: point.id,
    label: point.name,
  }));
  const feeders = o.nodes.filter((n) => n.kind !== "end_point");
  const feedOptions = (except?: GridNodeRow): FeedOption[] => {
    const beyond = except
      ? downstreamIds(o.nodes, except.id)
      : new Set<string>();
    return feeders
      .filter((n) => !beyond.has(n.id))
      .map((n) => ({ id: n.id, label: n.name }));
  };

  const ratingOf = (n: GridNodeRow) =>
    `${formatNumber(n.cableRatedAmps ?? 0, 0)} A`;
  const ampsOf = (id: string) =>
    `${formatNumber(g.runs.get(id)?.amps ?? 0, 1, true)} A`;

  let verdict: ReactNode;
  let advice: string | null = null;
  if (g.over.length === 1) {
    const n = g.over[0]!;
    verdict = (
      <>
        <b className={TONE_TEXT.bad}>{n.name} is over its rating:</b>{" "}
        {ampsOf(n.id)} on a {ratingOf(n)} run.
      </>
    );
    advice = overAdvice(n, g.runs.get(n.id)?.amps ?? 0, o);
  } else if (g.over.length > 1) {
    verdict = (
      <>
        <b className={TONE_TEXT.bad}>
          {g.over.length} runs are over their rating:
        </b>{" "}
        {g.over.map((n) => n.name).join(", ")}.
      </>
    );
    advice = "Move loads to other runs, or lay heavier cables.";
  } else if (g.near.length > 0) {
    const n = g.near[0]!;
    verdict = (
      <>
        <b className={TONE_TEXT.warn}>
          {g.near.length === 1
            ? `${n.name} is near its limit:`
            : `${g.near.length} runs are near their limit:`}
        </b>{" "}
        {g.near.length === 1
          ? `${ampsOf(n.id)} on a ${ratingOf(n)} run.`
          : `${g.near.map((x) => x.name).join(", ")}.`}
      </>
    );
    advice = "A cable near its rating may run warm.";
  } else if (g.unrated.length > 0) {
    verdict = (
      <>
        <b>No run is over its rating</b>, but{" "}
        {g.unrated.length === 1
          ? "one cable has"
          : `${g.unrated.length} cables have`}{" "}
        no rating yet.
      </>
    );
    advice = "Type the rating from the cable's label to check it.";
  } else {
    verdict = (
      <>
        <b className={TONE_TEXT.ok}>Every run is fine.</b> No cable carries more
        than its rating.
      </>
    );
  }

  const needs = o.nodes.flatMap((n) => {
    if (n.parentId === null) return [];
    const rows: {
      key: string;
      name: string;
      point: GridNodeRow;
      which: "cable" | "adapter";
      have: boolean | null;
    }[] = [
      {
        key: `${n.id}:cable`,
        name: cableName(n),
        point: n,
        which: "cable",
        have: n.haveCable,
      },
    ];
    if (n.adapter) {
      rows.push({
        key: `${n.id}:adapter`,
        name: n.adapter,
        point: n,
        which: "adapter",
        have: n.haveAdapter,
      });
    }
    return rows;
  });

  return (
    <>
      <SectionHead
        title="Grid"
        sentence="What feeds each point, and what plugs in."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={PRINT_GRID_SHEET_PATH} target="_blank" rel="noopener">
                Print the grid sheet
              </a>
            </Button>
            {canEdit && <AddPointButton feeds={feedOptions()} />}
          </>
        }
      />

      {o.nodes.length === 0 ? (
        <PowerCard label="The answer">
          <EmptyNote
            title="No grid yet."
            action={
              earlier !== null ? (
                <CopyLastYearGridButton fromCycle={earlier} />
              ) : undefined
            }
          >
            {earlier !== null
              ? `Start from ${earlier}'s grid and change what is different, or add the generator first.`
              : "Add the generator first, then the junctions and the points it feeds."}
          </EmptyNote>
        </PowerCard>
      ) : (
        <>
          <Verdict
            note={advice}
            legend={[
              { tone: "bad", text: `Over ${g.over.length}` },
              { tone: "warn", text: `Near limit ${g.near.length}` },
              { tone: "ok", text: `Fine ${g.fine.length}` },
              ...(g.unrated.length > 0
                ? [
                    {
                      tone: "mute" as const,
                      text: `No rating ${g.unrated.length}`,
                    },
                  ]
                : []),
              { tone: "mute", text: `Not plugged in ${g.offGrid.length}` },
            ]}
          >
            {verdict}
          </Verdict>

          <ul
            aria-label="Grid points"
            className="mb-4 grid grid-cols-1 gap-3 page-md:grid-cols-2"
          >
            {tree.map(({ point }) => {
              const run = g.runs.get(point.id);
              const band = run ? BAND[run.band]! : null;
              const children = o.nodes.filter((n) => n.parentId === point.id);
              const plugged = o.loads.filter((l) => o.where[l.id] === point.id);
              return (
                <li
                  key={point.id}
                  aria-label={point.name}
                  className="flex flex-col gap-3 border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <RowName name={point.name} sub={feedText(point, names)} />
                    {canEdit && (
                      <PointRowActions
                        point={editable(point)}
                        feeds={feedOptions(point)}
                      />
                    )}
                  </div>
                  {run && band && (
                    <div className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] items-center gap-3 text-sm font-bold tabular-nums">
                      <span className={TONE_TEXT[band.tone]}>
                        {point.cableRatedAmps !== null
                          ? `${formatNumber(run.amps, 1, true)} of ${ratingOf(point)}`
                          : `${formatNumber(run.amps, 1, true)} A`}
                      </span>
                      <Bar
                        pct={run.pct ?? 0}
                        tone={band.tone === "mute" ? "mute" : band.tone}
                      />
                      <Chip tone={band.tone}>{band.label}</Chip>
                    </div>
                  )}
                  {(children.length > 0 || plugged.length > 0) && (
                    <ul className="border-t border-border">
                      {children.map((c) => (
                        <li
                          key={c.id}
                          className="flex justify-between gap-3 pt-2 text-[13px] leading-5"
                        >
                          <span>{c.name} run</span>
                          <span className="tabular-nums">{ampsOf(c.id)}</span>
                        </li>
                      ))}
                      {plugged.map((l) => (
                        <li
                          key={l.id}
                          className="flex justify-between gap-3 pt-2 text-[13px] leading-5"
                        >
                          <span>{l.name}</span>
                          <span className="tabular-nums">
                            {formatNumber(loadAmps(l), 1, true)} A
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          {g.offGrid.length > 0 && (
            <PowerCard label="Not plugged in yet">
              <CardHead
                title="Not plugged in yet"
                meta={`${g.offGrid.length} load${g.offGrid.length === 1 ? "" : "s"} on the load list ${g.offGrid.length === 1 ? "has" : "have"} no point on the grid`}
              />
              <div role="list" aria-label="Not plugged in yet">
                {g.offGrid.map((l) => (
                  <Row
                    key={l.id}
                    label={l.name}
                    cols={
                      canEdit
                        ? "grid-cols-1 page-sm:grid-cols-[minmax(0,1fr)_216px]"
                        : "grid-cols-1"
                    }
                  >
                    <RowName
                      name={l.name}
                      sub={`${watts(connectedWatts(l))} · ${areaName(l.area)}`}
                    />
                    {canEdit && (
                      <LoadPointSelect
                        key={`${l.id}:none`}
                        loadId={l.id}
                        loadName={l.name}
                        nodeId={null}
                        points={pointOptions}
                      />
                    )}
                  </Row>
                ))}
              </div>
            </PowerCard>
          )}

          {canEdit && o.loads.length > g.offGrid.length && (
            <details className="mb-4 border border-border bg-card">
              <summary className="cursor-pointer p-4 text-sm font-semibold">
                Move a load to another point
              </summary>
              <div role="list" aria-label="What plugs in where">
                {o.loads
                  .filter((l) => o.where[l.id])
                  .map((l) => (
                    <Row
                      key={l.id}
                      label={l.name}
                      cols="grid-cols-1 page-sm:grid-cols-[minmax(0,1fr)_216px]"
                    >
                      <RowName
                        name={l.name}
                        sub={`${watts(connectedWatts(l))} · ${areaName(l.area)}`}
                      />
                      <LoadPointSelect
                        key={`${l.id}:${o.where[l.id]}`}
                        loadId={l.id}
                        loadName={l.name}
                        nodeId={o.where[l.id] ?? null}
                        points={pointOptions}
                      />
                    </Row>
                  ))}
              </div>
            </details>
          )}

          {needs.length > 0 && (
            <PowerCard label="Cables and adapters">
              <CardHead
                title="Cables and adapters"
                meta={[
                  g.unchecked > 0 ? `${g.unchecked} not checked yet.` : null,
                  g.toGet > 0 ? `${g.toGet} to get.` : null,
                  "None counts as ours until someone says so.",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
              <div role="list" aria-label="Cables and adapters">
                {needs.map((need) => {
                  const h = haveText(need.have);
                  return (
                    <Row
                      key={need.key}
                      label={need.name}
                      cols={
                        canEdit
                          ? "grid-cols-1 page-sm:grid-cols-[minmax(0,1fr)_216px]"
                          : "grid-cols-[minmax(0,1fr)_auto] page-sm:grid-cols-[minmax(0,1fr)_160px]"
                      }
                    >
                      <RowName
                        name={need.name}
                        sub={`For ${need.point.name}`}
                      />
                      <div className="flex justify-end">
                        {canEdit ? (
                          <HaveToggle
                            key={`${need.key}:${need.point.version}`}
                            point={editable(need.point)}
                            which={need.which}
                            name={need.name}
                          />
                        ) : (
                          <span className={`text-right ${TONE_TEXT[h.tone]}`}>
                            {h.text}
                          </span>
                        )}
                      </div>
                    </Row>
                  );
                })}
              </div>
            </PowerCard>
          )}
        </>
      )}
    </>
  );
}

export default function PowerGridPage() {
  return (
    <PowerFrame section="grid">
      <GridSection />
    </PowerFrame>
  );
}
