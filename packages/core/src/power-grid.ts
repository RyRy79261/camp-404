import { MAINS_VOLTS, amps, powerTotals, type PowerLoad } from "./power";

// The grid plan (#256): the points from the generator out to where things
// plug in, the cable run that feeds each point, and the amps each run
// carries. Pure: no DB, no session, no next/*.
//
// A point holds the run that FEEDS it (from its parent), so the grid is a
// tree with the generator at the root and one run into every other point.
//
// THE AMPS A RUN CARRIES are the busiest hour of everything plugged in at or
// beyond its far end, at full draw: a fridge whose compressor runs 40% of the
// time pulls its whole current while it runs, so the duty cycle is left out.
// Time windows still count, so lights that only run at night do not add to
// daytime tools. It is mains current (230 V): a 12 V strip on a power supply
// draws its watts from the mains side. The app never guesses a cable's
// rating: a run with none says "rating unknown".

/** A point on the grid, as the maths needs it. */
export interface GridPoint {
  id: string;
  parentId: string | null;
  /** The rating of the cable that feeds it; null is unknown. */
  cableRatedAmps: number | null;
}

/** A load and the point it plugs in at (none: not on the grid yet). */
export type GridLoad = PowerLoad & { gridNodeId: string | null };

/** The points at and beyond `nodeId`, itself included. */
export function downstreamIds(
  points: readonly GridPoint[],
  nodeId: string,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const p of points) {
    if (p.parentId === null) continue;
    const list = children.get(p.parentId) ?? [];
    list.push(p.id);
    children.set(p.parentId, list);
  }
  const found = new Set<string>();
  const stack = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (found.has(id)) continue;
    found.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return found;
}

/**
 * Whether `candidateParentId` sits at or beyond `nodeId`, so feeding the
 * point from it would close a loop.
 */
export function wouldLoop(
  points: readonly GridPoint[],
  nodeId: string,
  candidateParentId: string,
): boolean {
  return downstreamIds(points, nodeId).has(candidateParentId);
}

/** Peak watts at full draw of the given loads, over the days on site. */
function peakFullDrawWatts(loads: readonly PowerLoad[], days: number): number {
  if (loads.length === 0) return 0;
  const full = loads.map((l) => ({ ...l, dutyPct: 100 }));
  return powerTotals(full, days, 1).peak.watts;
}

/** The amps a run carries: peak full-draw watts downstream, at mains. */
export function runAmps(
  points: readonly GridPoint[],
  loads: readonly GridLoad[],
  nodeId: string,
  daysOnSite: number,
): number {
  const below = downstreamIds(points, nodeId);
  const served = loads.filter(
    (l) => l.gridNodeId !== null && below.has(l.gridNodeId),
  );
  return amps(peakFullDrawWatts(served, daysOnSite), MAINS_VOLTS);
}

export type CableBand = "unknown" | "ok" | "warn" | "over";

/** The share of its rating a run warns at, and the share it fails above. */
export const CABLE_WARN_PCT = 80;
export const CABLE_OVER_PCT = 100;

/**
 * How hard a cable works: unknown with no rating, over above 100% of it,
 * warn from 80%, otherwise ok.
 */
export function cableBand(
  carried: number,
  ratedAmps: number | null,
): CableBand {
  if (ratedAmps === null || !(ratedAmps > 0)) return "unknown";
  const pct = (carried / ratedAmps) * 100;
  if (pct > CABLE_OVER_PCT) return "over";
  if (pct >= CABLE_WARN_PCT) return "warn";
  return "ok";
}

/**
 * A usual rating for a flexible copper cable of a conductor size, as a
 * suggestion to type in, never used on its own. Null for a size not listed.
 */
const USUAL_AMPS: ReadonlyMap<number, number> = new Map([
  [0.75, 6],
  [1, 10],
  [1.5, 15],
  [2.5, 20],
  [4, 25],
  [6, 32],
  [10, 40],
]);

export function suggestedAmpsForGauge(mm2: number | null): number | null {
  if (mm2 === null) return null;
  return USUAL_AMPS.get(mm2) ?? null;
}

export interface GridRunFigures {
  id: string;
  amps: number;
  band: CableBand;
  /** Amps as a share of the rating; null with no rating. */
  pct: number | null;
}

/** Every run's amps and band, for every point but the generators. */
export function gridRuns(
  points: readonly GridPoint[],
  loads: readonly GridLoad[],
  daysOnSite: number,
): GridRunFigures[] {
  return points
    .filter((p) => p.parentId !== null)
    .map((p) => {
      const carried = runAmps(points, loads, p.id, daysOnSite);
      return {
        id: p.id,
        amps: carried,
        band: cableBand(carried, p.cableRatedAmps),
        pct:
          p.cableRatedAmps && p.cableRatedAmps > 0
            ? (carried / p.cableRatedAmps) * 100
            : null,
      };
    });
}

/** The points in tree order, each with its depth: a parent before its children. */
export function treeOrder<T extends GridPoint>(
  points: readonly T[],
): { point: T; depth: number }[] {
  const ids = new Set(points.map((p) => p.id));
  const children = new Map<string | null, T[]>();
  for (const p of points) {
    // A point whose parent is not in the list is drawn as a root.
    const parent =
      p.parentId !== null && ids.has(p.parentId) ? p.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(p);
    children.set(parent, list);
  }
  const out: { point: T; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const p of children.get(parent) ?? []) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push({ point: p, depth });
      walk(p.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
