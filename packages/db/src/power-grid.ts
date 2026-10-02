import { and, asc, count, eq, isNotNull, lt, max, sql } from "drizzle-orm";
import { treeOrder, wouldLoop } from "@camp404/core";
import type {
  EditGridNodeInput,
  GridNodeInput,
  GridNodeKind,
} from "@camp404/types";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, type Tx } from "./index";
import {
  LOAD_GONE,
  NOTHING_TO_COPY,
  UUID,
  assertPowerEditor,
  refuse,
  write,
  type PowerWriteResult,
} from "./power";
import * as schema from "./schema";

// The grid plan (#256): the year's points from the generator out, each with
// the cable run that feeds it, and which point each load plugs in at.
//
//  - Anyone in the camp reads it; only a captain or a Power & Lighting lead
//    writes (assertPowerEditor, inside each write's transaction).
//  - The year's: stamped with currentCycleNumber() inside the write. A point
//    is fed only by a point of the same year, a load plugs in only at a point
//    of its own year, and the tree never loops (checked under a lock for the
//    year, so two moves at once cannot build a loop between them).
//  - An edit is a compare-and-set on the point's version. Plugging a load in
//    is a one-tap change that does not touch the load's version.
//
// No audit_log rows: team planning data. No money.

export const GRID_NODE_GONE =
  "That point isn't on the grid any more. Reload the page.";
export const GRID_NODE_CHANGED =
  "Someone changed this point first. Reload the page.";
export const GRID_PARENT_GONE =
  "The point that feeds it isn't on the grid any more. Reload the page.";
export const GRID_PARENT_END_POINT =
  "An end point feeds nothing. Pick the generator or a junction.";
export const GRID_LOOP =
  "That would feed the point from itself. Pick a point nearer the generator.";
export const GRID_FEEDS_OTHERS =
  "This point feeds other points. Move or remove them first.";
export const GRID_KIND_FIXED =
  "A generator stays a generator. Remove it and add the point again.";
export const ALREADY_HAS_GRID =
  "This year already has a grid plan, so last year's wasn't copied.";

export interface GridNodeRow {
  id: string;
  cycle: number;
  name: string;
  kind: GridNodeKind;
  parentId: string | null;
  cable: string | null;
  cableLengthM: number | null;
  cableGaugeMm2: number | null;
  cableRatedAmps: number | null;
  adapter: string | null;
  /** True has it, false must get it, null not checked yet. */
  haveCable: boolean | null;
  haveAdapter: boolean | null;
  sort: number;
  version: number;
}

const NODE_COLUMNS = {
  id: schema.powerGridNodes.id,
  cycle: schema.powerGridNodes.cycle,
  name: schema.powerGridNodes.name,
  kind: schema.powerGridNodes.kind,
  parentId: schema.powerGridNodes.parentId,
  cable: schema.powerGridNodes.cable,
  cableLengthM: schema.powerGridNodes.cableLengthM,
  cableGaugeMm2: schema.powerGridNodes.cableGaugeMm2,
  cableRatedAmps: schema.powerGridNodes.cableRatedAmps,
  adapter: schema.powerGridNodes.adapter,
  haveCable: schema.powerGridNodes.haveCable,
  haveAdapter: schema.powerGridNodes.haveAdapter,
  sort: schema.powerGridNodes.sort,
  version: schema.powerGridNodes.version,
};

// --- Reads -------------------------------------------------------------------

/** A year's grid points (this year by default), in the order they were added. */
export async function listGridNodes(cycle?: number): Promise<GridNodeRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  return db
    .select(NODE_COLUMNS)
    .from(schema.powerGridNodes)
    .where(eq(schema.powerGridNodes.cycle, year))
    .orderBy(
      asc(schema.powerGridNodes.sort),
      asc(schema.powerGridNodes.createdAt),
    );
}

/** Where each of a year's loads plugs in: load id to point id. */
export async function listLoadGridPoints(
  cycle?: number,
): Promise<Record<string, string>> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const rows = await db
    .select({
      loadId: schema.powerLoads.id,
      nodeId: schema.powerLoads.gridNodeId,
    })
    .from(schema.powerLoads)
    .where(
      and(
        eq(schema.powerLoads.cycle, year),
        isNotNull(schema.powerLoads.gridNodeId),
      ),
    );
  return Object.fromEntries(rows.map((r) => [r.loadId, r.nodeId!]));
}

/** The latest year before this one with a grid plan, or null. */
export async function previousGridCycle(): Promise<number | null> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber(db);
  const [row] = await db
    .select({ cycle: max(schema.powerGridNodes.cycle) })
    .from(schema.powerGridNodes)
    .where(lt(schema.powerGridNodes.cycle, cycle));
  return row?.cycle ?? null;
}

// --- Writes ------------------------------------------------------------------

/** Holds the year's grid, so two moves at once cannot close a loop. */
async function lockGrid(tx: Tx, cycle: number) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('power_grid_nodes'), ${cycle})`,
  );
}

async function yearNodes(tx: Tx, cycle: number) {
  return tx
    .select({
      id: schema.powerGridNodes.id,
      parentId: schema.powerGridNodes.parentId,
      kind: schema.powerGridNodes.kind,
      cableRatedAmps: schema.powerGridNodes.cableRatedAmps,
    })
    .from(schema.powerGridNodes)
    .where(eq(schema.powerGridNodes.cycle, cycle));
}

/** A parent must be this year's generator or junction. */
function assertParent(
  nodes: Awaited<ReturnType<typeof yearNodes>>,
  parentId: string | null,
) {
  if (parentId === null) return;
  const parent = nodes.find((n) => n.id === parentId);
  if (!parent) refuse(GRID_PARENT_GONE);
  if (parent.kind === "end_point") refuse(GRID_PARENT_END_POINT);
}

function nodeValues(input: GridNodeInput) {
  return {
    name: input.name,
    kind: input.kind,
    parentId: input.parentId,
    cable: input.cable,
    cableLengthM: input.cableLengthM,
    cableGaugeMm2: input.cableGaugeMm2,
    cableRatedAmps: input.cableRatedAmps,
    adapter: input.adapter,
    haveCable: input.haveCable,
    haveAdapter: input.haveAdapter,
  };
}

/** Adds a point to this year's grid, fed from `parentId`. */
export async function addGridNode(
  input: GridNodeInput & { actorId: string },
): Promise<PowerWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    await lockGrid(tx, cycle);
    const nodes = await yearNodes(tx, cycle);
    if (input.parentId !== null && !UUID.test(input.parentId)) {
      refuse(GRID_PARENT_GONE);
    }
    assertParent(nodes, input.parentId);
    const [last] = await tx
      .select({ sort: max(schema.powerGridNodes.sort) })
      .from(schema.powerGridNodes)
      .where(eq(schema.powerGridNodes.cycle, cycle));
    const [row] = await tx
      .insert(schema.powerGridNodes)
      .values({
        ...nodeValues(input),
        cycle,
        sort: (last?.sort ?? -1) + 1,
        createdByUserId: input.actorId,
      })
      .returning({ id: schema.powerGridNodes.id });
    return { id: row!.id };
  });
}

/**
 * Changes a point, compare-and-set on the version the editor opened. Moving
 * it to another feed is refused when the new feed sits beyond it.
 */
export async function updateGridNode(
  input: EditGridNodeInput & { actorId: string },
): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.nodeId)) refuse(GRID_NODE_GONE);
    if (input.parentId !== null && !UUID.test(input.parentId)) {
      refuse(GRID_PARENT_GONE);
    }
    const cycle = await currentCycleNumber(tx);
    await lockGrid(tx, cycle);
    const nodes = await yearNodes(tx, cycle);
    const self = nodes.find((n) => n.id === input.nodeId);
    if (!self) refuse(GRID_NODE_GONE);
    if ((self.kind === "generator") !== (input.kind === "generator")) {
      refuse(GRID_KIND_FIXED);
    }
    assertParent(nodes, input.parentId);
    if (
      input.parentId !== null &&
      wouldLoop(nodes, input.nodeId, input.parentId)
    ) {
      refuse(GRID_LOOP);
    }
    if (
      input.kind === "end_point" &&
      nodes.some((n) => n.parentId === input.nodeId)
    ) {
      refuse(GRID_FEEDS_OTHERS);
    }
    const [row] = await tx
      .update(schema.powerGridNodes)
      .set({
        ...nodeValues(input),
        version: sql`${schema.powerGridNodes.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.powerGridNodes.id, input.nodeId),
          eq(schema.powerGridNodes.cycle, cycle),
          eq(schema.powerGridNodes.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.powerGridNodes.id });
    if (!row) refuse(GRID_NODE_CHANGED);
    return {};
  });
}

/**
 * Takes a point off the grid, if nobody changed it first and it feeds no
 * other point. Loads that plugged in there are left off the grid.
 */
export async function removeGridNode(input: {
  actorId: string;
  nodeId: string;
  expectedVersion: number;
}): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.nodeId)) refuse(GRID_NODE_GONE);
    const cycle = await currentCycleNumber(tx);
    await lockGrid(tx, cycle);
    const nodes = await yearNodes(tx, cycle);
    if (!nodes.some((n) => n.id === input.nodeId)) refuse(GRID_NODE_GONE);
    if (nodes.some((n) => n.parentId === input.nodeId))
      refuse(GRID_FEEDS_OTHERS);
    const [row] = await tx
      .delete(schema.powerGridNodes)
      .where(
        and(
          eq(schema.powerGridNodes.id, input.nodeId),
          eq(schema.powerGridNodes.version, input.expectedVersion),
        ),
      )
      .returning({ id: schema.powerGridNodes.id });
    if (!row) refuse(GRID_NODE_CHANGED);
    return {};
  });
}

/**
 * Plugs one of this year's loads in at one of this year's points, or takes it
 * off the grid (null). It leaves the load's own version alone.
 */
export async function assignLoadToGridNode(input: {
  actorId: string;
  loadId: string;
  nodeId: string | null;
}): Promise<PowerWriteResult> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    if (!UUID.test(input.loadId)) refuse(LOAD_GONE);
    const cycle = await currentCycleNumber(tx);
    if (input.nodeId !== null) {
      if (!UUID.test(input.nodeId)) refuse(GRID_NODE_GONE);
      const [node] = await tx
        .select({ id: schema.powerGridNodes.id })
        .from(schema.powerGridNodes)
        .where(
          and(
            eq(schema.powerGridNodes.id, input.nodeId),
            eq(schema.powerGridNodes.cycle, cycle),
          ),
        )
        .for("share");
      if (!node) refuse(GRID_NODE_GONE);
    }
    const [row] = await tx
      .update(schema.powerLoads)
      .set({ gridNodeId: input.nodeId })
      .where(
        and(
          eq(schema.powerLoads.id, input.loadId),
          eq(schema.powerLoads.cycle, cycle),
        ),
      )
      .returning({ id: schema.powerLoads.id });
    if (!row) refuse(LOAD_GONE);
    return {};
  });
}

/**
 * Copies the most recent earlier year's grid into this year, when this year
 * has none: every point with fresh ids and the same shape. Which load plugs in
 * where is not carried: the loads are the year's own.
 */
export async function copyLastYearGrid(input: {
  actorId: string;
}): Promise<PowerWriteResult<{ count: number }>> {
  return write(async (tx) => {
    await assertPowerEditor(tx, input.actorId);
    const cycle = await currentCycleNumber(tx);
    await lockGrid(tx, cycle);
    const [here] = await tx
      .select({ n: count() })
      .from(schema.powerGridNodes)
      .where(eq(schema.powerGridNodes.cycle, cycle));
    if ((here?.n ?? 0) > 0) refuse(ALREADY_HAS_GRID);
    const [prev] = await tx
      .select({ cycle: max(schema.powerGridNodes.cycle) })
      .from(schema.powerGridNodes)
      .where(lt(schema.powerGridNodes.cycle, cycle));
    const from = prev?.cycle ?? null;
    if (from === null) refuse(NOTHING_TO_COPY);
    const rows = await tx
      .select(NODE_COLUMNS)
      .from(schema.powerGridNodes)
      .where(eq(schema.powerGridNodes.cycle, from))
      .orderBy(
        asc(schema.powerGridNodes.sort),
        asc(schema.powerGridNodes.createdAt),
      );
    // One insert, parents listed first; the feed links are checked when the
    // statement ends, so every new point's feed already exists.
    const ids = new Map(rows.map((r) => [r.id, crypto.randomUUID()]));
    await tx.insert(schema.powerGridNodes).values(
      treeOrder(rows).map(({ point }) => ({
        id: ids.get(point.id)!,
        cycle,
        name: point.name,
        kind: point.kind,
        parentId: point.parentId ? (ids.get(point.parentId) ?? null) : null,
        cable: point.cable,
        cableLengthM: point.cableLengthM,
        cableGaugeMm2: point.cableGaugeMm2,
        cableRatedAmps: point.cableRatedAmps,
        adapter: point.adapter,
        haveCable: point.haveCable,
        haveAdapter: point.haveAdapter,
        sort: point.sort,
        createdByUserId: input.actorId,
      })),
    );
    return { count: rows.length };
  });
}
