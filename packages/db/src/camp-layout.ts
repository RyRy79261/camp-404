import { randomBytes } from "node:crypto";
import { and, desc, eq, gte, isNotNull, lt, max } from "drizzle-orm";
import {
  arrivalDayCounts,
  canEditLayout,
  canShareLayout,
  neighbourView,
  type ArrivalDayCount,
  type NeighbourLayout,
} from "@camp404/core";
import { CampLayout, LAYOUT_NOTE_MAX } from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { reachRank } from "./power";
import * as schema from "./schema";

// The camp layout (#271): the data layer.
//
//  - Every member reads this year's plan, its versions and the arrival counts.
//  - Only a captain or a Structures lead saves (canEditLayout). Every write
//    re-reads the actor's rank and led teams INSIDE its own transaction
//    (lockSenderReach), so a demotion that committed first is seen. A caller
//    passes only who is acting, never a rank or a team list.
//  - A save is a compare-and-set on camp_layouts.latest_version: a lost race
//    says so in a sentence and never overwrites.
//  - Only a captain turns the neighbour link on or off (canShareLayout), with
//    an audit row in the same transaction: it puts the plan in front of
//    people outside the camp.
//  - The neighbour page reads through getSharedLayout alone, which returns
//    neighbourView's allowlist and arrival COUNTS, never a label, a name or
//    who saved it.
//
// No audit row for a save: the plan is team planning data, like the power
// plan, not another member's data. PGlite has ONE connection: everything
// inside a transaction goes through `tx`.

export type LayoutWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_LAYOUT_EDITOR =
  "Only captains and Structures leads can change the layout.";
export const NOT_A_LAYOUT_SHARER =
  "Only captains can share the layout with neighbours.";
export const LAYOUT_CHANGED =
  "Someone saved the layout first. Reload the page to see their changes.";
export const LAYOUT_VERSION_GONE =
  "That version isn't there any more. Reload the page.";
export const ALREADY_HAS_LAYOUT =
  "This year already has a layout, so last year's wasn't copied.";
export const NO_EARLIER_LAYOUT = "There is no earlier year's layout to copy.";
export const NOTHING_TO_SHARE =
  "Save a layout first, then share it with neighbours.";
export const CHECK_LAYOUT = "Check the layout and try again.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A share token: 24 random bytes as base64url. */
const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** The neighbour link's audit target for a year. */
export function layoutAuditTarget(cycle: number): string {
  return `camp_layout:${cycle}`;
}

// --- Shapes ------------------------------------------------------------------

/** The year's plan as the page reads it. Version 0 means nothing saved yet. */
export interface CampLayoutState {
  cycle: number;
  version: number;
  layout: CampLayout | null;
  note: string | null;
  savedAt: Date | null;
  /** Who saved this version, for members; never sent to a neighbour. */
  savedByName: string | null;
  /** Whether the neighbour link is on. The link itself is getLayoutShare's. */
  shared: boolean;
}

/** One saved version, as the history lists it. */
export interface LayoutVersionRow {
  number: number;
  note: string | null;
  savedAt: Date;
  savedByName: string | null;
  pieces: number;
}

/** The neighbour link, for a captain. */
export interface LayoutShare {
  token: string | null;
  sharedAt: Date | null;
}

/** What the neighbour page may show: the plan cut down, and counts. */
export interface SharedLayout {
  cycle: number;
  layout: NeighbourLayout | null;
  arrivals: ArrivalDayCount[];
}

// --- Transactions ------------------------------------------------------------

class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<LayoutWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/**
 * Whether the actor may save the plan, read and locked inside the write's own
 * transaction: a captain, or a lead of Structures this year.
 */
export async function lockLayoutEditor(
  tx: DbOrTx,
  actorId: string,
): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const reach = await lockSenderReach(tx, actorId);
  return canEditLayout(reachRank(reach), reach ?? []);
}

async function lockLayoutSharer(tx: DbOrTx, actorId: string) {
  if (!UUID.test(actorId)) return false;
  const reach = await lockSenderReach(tx, actorId);
  return canShareLayout(reachRank(reach));
}

/**
 * Add version `expectedVersion + 1` of this year's plan, as a compare-and-set
 * on the year's latest version. The year's row is made on its first save.
 */
async function addVersion(
  tx: Tx,
  input: {
    cycle: number;
    layout: CampLayout;
    expectedVersion: number;
    note: string | null;
    actorId: string;
  },
): Promise<number> {
  await tx
    .insert(schema.campLayouts)
    .values({ cycle: input.cycle })
    .onConflictDoNothing({ target: schema.campLayouts.cycle });
  const next = input.expectedVersion + 1;
  const [won] = await tx
    .update(schema.campLayouts)
    .set({ latestVersion: next, updatedAt: new Date() })
    .where(
      and(
        eq(schema.campLayouts.cycle, input.cycle),
        eq(schema.campLayouts.latestVersion, input.expectedVersion),
      ),
    )
    .returning({ cycle: schema.campLayouts.cycle });
  if (!won) refuse(LAYOUT_CHANGED);
  await tx.insert(schema.campLayoutVersions).values({
    cycle: input.cycle,
    number: next,
    body: input.layout,
    note: input.note,
    savedByUserId: input.actorId,
  });
  return next;
}

function cleanNote(note: string | null | undefined): string | null {
  const text = note?.trim() ?? "";
  return text === "" ? null : text.slice(0, LAYOUT_NOTE_MAX);
}

// --- Reads -------------------------------------------------------------------

/** A year's plan (this year by default): its latest version, or none. */
export async function getCampLayout(
  cycle?: number,
  versionNumber?: number,
): Promise<CampLayoutState> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const [head] = await db
    .select({
      latestVersion: schema.campLayouts.latestVersion,
      shareToken: schema.campLayouts.shareToken,
    })
    .from(schema.campLayouts)
    .where(eq(schema.campLayouts.cycle, year));
  const latest = head?.latestVersion ?? 0;
  const shared = head?.shareToken != null;
  const wanted =
    versionNumber !== undefined &&
    Number.isInteger(versionNumber) &&
    versionNumber >= 1 &&
    versionNumber <= latest
      ? versionNumber
      : latest;
  if (wanted === 0) {
    return {
      cycle: year,
      version: 0,
      layout: null,
      note: null,
      savedAt: null,
      savedByName: null,
      shared,
    };
  }
  const [row] = await db
    .select({
      number: schema.campLayoutVersions.number,
      body: schema.campLayoutVersions.body,
      note: schema.campLayoutVersions.note,
      savedAt: schema.campLayoutVersions.savedAt,
      savedByName: schema.users.displayName,
    })
    .from(schema.campLayoutVersions)
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.campLayoutVersions.savedByUserId),
    )
    .where(
      and(
        eq(schema.campLayoutVersions.cycle, year),
        eq(schema.campLayoutVersions.number, wanted),
      ),
    );
  if (!row) {
    return {
      cycle: year,
      version: 0,
      layout: null,
      note: null,
      savedAt: null,
      savedByName: null,
      shared,
    };
  }
  // A stored plan that no longer passes the schema reads as none, rather
  // than drawing something the editor could not save back.
  const parsed = CampLayout.safeParse(row.body);
  return {
    cycle: year,
    version: row.number,
    layout: parsed.success ? parsed.data : null,
    note: row.note,
    savedAt: row.savedAt,
    savedByName: row.savedByName,
    shared,
  };
}

/** A year's saved versions, newest first (the last `limit`). */
export async function listLayoutVersions(
  cycle?: number,
  limit = 20,
): Promise<LayoutVersionRow[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const rows = await db
    .select({
      number: schema.campLayoutVersions.number,
      note: schema.campLayoutVersions.note,
      savedAt: schema.campLayoutVersions.savedAt,
      savedByName: schema.users.displayName,
      body: schema.campLayoutVersions.body,
    })
    .from(schema.campLayoutVersions)
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.campLayoutVersions.savedByUserId),
    )
    .where(eq(schema.campLayoutVersions.cycle, year))
    .orderBy(desc(schema.campLayoutVersions.number))
    .limit(limit);
  return rows.map((r) => ({
    number: r.number,
    note: r.note,
    savedAt: r.savedAt,
    savedByName: r.savedByName,
    pieces: Array.isArray(r.body?.pieces) ? r.body.pieces.length : 0,
  }));
}

async function previousCycleWithLayout(
  db: DbOrTx,
  cycle: number,
): Promise<number | null> {
  const [row] = await db
    .select({ cycle: max(schema.campLayouts.cycle) })
    .from(schema.campLayouts)
    .where(
      and(
        lt(schema.campLayouts.cycle, cycle),
        // A year whose row exists but holds no version has nothing to copy.
        gte(schema.campLayouts.latestVersion, 1),
      ),
    );
  return row?.cycle ?? null;
}

/** The latest year before this one that has a saved plan, or null. */
export async function previousLayoutCycle(): Promise<number | null> {
  const db = createHttpDb();
  return previousCycleWithLayout(db, await currentCycleNumber(db));
}

/**
 * How many people arrive on each day of a year (this year by default): the
 * arrival days members gave (driver_profiles.arrival_at, written by a
 * questionnaire's "Arrival day" question), counted per day. Reads the days
 * alone, never who.
 */
export async function layoutArrivalCounts(
  cycle?: number,
): Promise<ArrivalDayCount[]> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  return arrivalsOf(db, year);
}

async function arrivalsOf(
  db: DbOrTx,
  year: number,
): Promise<ArrivalDayCount[]> {
  const rows = await db
    .select({ day: schema.driverProfiles.arrivalAt })
    .from(schema.driverProfiles)
    .where(
      and(
        eq(schema.driverProfiles.cycle, year),
        isNotNull(schema.driverProfiles.arrivalAt),
      ),
    );
  return arrivalDayCounts(rows.map((r) => r.day));
}

/** The neighbour link for a year (this year by default), for a captain. */
export async function getLayoutShare(cycle?: number): Promise<LayoutShare> {
  const db = createHttpDb();
  const year = cycle ?? (await currentCycleNumber(db));
  const [row] = await db
    .select({
      token: schema.campLayouts.shareToken,
      sharedAt: schema.campLayouts.sharedAt,
    })
    .from(schema.campLayouts)
    .where(eq(schema.campLayouts.cycle, year));
  return { token: row?.token ?? null, sharedAt: row?.sharedAt ?? null };
}

/**
 * What the neighbour page shows for a link, or null when the link is not on
 * (never made, turned off, or replaced): the page answers 404. The plan is
 * the link's year's latest, cut down by neighbourView; arrivals are counts.
 */
export async function getSharedLayout(
  token: string,
): Promise<SharedLayout | null> {
  if (!TOKEN.test(token)) return null;
  const db = createHttpDb();
  const [head] = await db
    .select({
      cycle: schema.campLayouts.cycle,
      latestVersion: schema.campLayouts.latestVersion,
    })
    .from(schema.campLayouts)
    .where(eq(schema.campLayouts.shareToken, token));
  if (!head) return null;
  const [version, arrivals] = await Promise.all([
    head.latestVersion >= 1
      ? db
          .select({ body: schema.campLayoutVersions.body })
          .from(schema.campLayoutVersions)
          .where(
            and(
              eq(schema.campLayoutVersions.cycle, head.cycle),
              eq(schema.campLayoutVersions.number, head.latestVersion),
            ),
          )
      : Promise.resolve([]),
    arrivalsOf(db, head.cycle),
  ]);
  const parsed = version[0] ? CampLayout.safeParse(version[0].body) : null;
  return {
    cycle: head.cycle,
    layout: parsed?.success ? neighbourView(parsed.data) : null,
    arrivals,
  };
}

// --- Writes ------------------------------------------------------------------

/** Save this year's plan as a new version. */
export async function saveCampLayout(input: {
  actorId: string;
  layout: CampLayout;
  expectedVersion: number;
  note?: string | null;
}): Promise<LayoutWriteResult<{ version: number }>> {
  const parsed = CampLayout.safeParse(input.layout);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? CHECK_LAYOUT,
    };
  }
  return write(async (tx) => {
    if (!(await lockLayoutEditor(tx, input.actorId))) {
      refuse(NOT_A_LAYOUT_EDITOR);
    }
    const cycle = await currentCycleNumber(tx);
    const version = await addVersion(tx, {
      cycle,
      layout: parsed.data,
      expectedVersion: input.expectedVersion,
      note: cleanNote(input.note),
      actorId: input.actorId,
    });
    return { version };
  });
}

/** Save an earlier version of this year's plan again, as the newest. */
export async function restoreLayoutVersion(input: {
  actorId: string;
  number: number;
  expectedVersion: number;
}): Promise<LayoutWriteResult<{ version: number }>> {
  return write(async (tx) => {
    if (!(await lockLayoutEditor(tx, input.actorId))) {
      refuse(NOT_A_LAYOUT_EDITOR);
    }
    const cycle = await currentCycleNumber(tx);
    const [old] = await tx
      .select({ body: schema.campLayoutVersions.body })
      .from(schema.campLayoutVersions)
      .where(
        and(
          eq(schema.campLayoutVersions.cycle, cycle),
          eq(schema.campLayoutVersions.number, input.number),
        ),
      );
    const parsed = old ? CampLayout.safeParse(old.body) : null;
    if (!parsed?.success) refuse(LAYOUT_VERSION_GONE);
    const version = await addVersion(tx, {
      cycle,
      layout: parsed.data,
      expectedVersion: input.expectedVersion,
      note: `Brought back version ${input.number}`,
      actorId: input.actorId,
    });
    return { version };
  });
}

/**
 * Start this year's plan from the latest earlier year's, as version 1. Only
 * while this year has none, so it can never replace a plan.
 */
export async function copyLastYearLayout(input: {
  actorId: string;
}): Promise<LayoutWriteResult<{ version: number; fromCycle: number }>> {
  return write(async (tx) => {
    if (!(await lockLayoutEditor(tx, input.actorId))) {
      refuse(NOT_A_LAYOUT_EDITOR);
    }
    const cycle = await currentCycleNumber(tx);
    const [mine] = await tx
      .select({ latest: schema.campLayouts.latestVersion })
      .from(schema.campLayouts)
      .where(eq(schema.campLayouts.cycle, cycle));
    if ((mine?.latest ?? 0) > 0) refuse(ALREADY_HAS_LAYOUT);
    const fromCycle = await previousCycleWithLayout(tx, cycle);
    if (fromCycle === null) refuse(NO_EARLIER_LAYOUT);
    const [from] = await tx
      .select({ body: schema.campLayoutVersions.body })
      .from(schema.campLayoutVersions)
      .innerJoin(
        schema.campLayouts,
        and(
          eq(schema.campLayouts.cycle, schema.campLayoutVersions.cycle),
          eq(
            schema.campLayouts.latestVersion,
            schema.campLayoutVersions.number,
          ),
        ),
      )
      .where(eq(schema.campLayoutVersions.cycle, fromCycle));
    const parsed = from ? CampLayout.safeParse(from.body) : null;
    if (!parsed?.success) refuse(NO_EARLIER_LAYOUT);
    const version = await addVersion(tx, {
      cycle,
      layout: parsed.data,
      expectedVersion: 0,
      note: `Copied from ${fromCycle}`,
      actorId: input.actorId,
    });
    return { version, fromCycle };
  });
}

/**
 * Turn the neighbour link on, or replace it with a new one (the old one then
 * answers 404). A captain only, with an audit row in the same transaction.
 */
export async function shareCampLayout(input: {
  actorId: string;
}): Promise<LayoutWriteResult<{ token: string }>> {
  return write(async (tx) => {
    if (!(await lockLayoutSharer(tx, input.actorId))) {
      refuse(NOT_A_LAYOUT_SHARER);
    }
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .select({
        latest: schema.campLayouts.latestVersion,
        token: schema.campLayouts.shareToken,
      })
      .from(schema.campLayouts)
      .where(eq(schema.campLayouts.cycle, cycle))
      .for("update");
    if (!row || row.latest < 1) refuse(NOTHING_TO_SHARE);
    const token = randomBytes(24).toString("base64url");
    await tx
      .update(schema.campLayouts)
      .set({
        shareToken: token,
        sharedAt: new Date(),
        sharedByUserId: input.actorId,
      })
      .where(eq(schema.campLayouts.cycle, cycle));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.layout.shared",
      target: layoutAuditTarget(cycle),
      metadata: { cycle, replaced: row.token !== null },
    });
    return { token };
  });
}

/** Turn the neighbour link off: the link answers 404 from now on. */
export async function unshareCampLayout(input: {
  actorId: string;
}): Promise<LayoutWriteResult<{ changed: boolean }>> {
  return write(async (tx) => {
    if (!(await lockLayoutSharer(tx, input.actorId))) {
      refuse(NOT_A_LAYOUT_SHARER);
    }
    const cycle = await currentCycleNumber(tx);
    const cleared = await tx
      .update(schema.campLayouts)
      .set({ shareToken: null, sharedAt: null, sharedByUserId: null })
      .where(
        and(
          eq(schema.campLayouts.cycle, cycle),
          isNotNull(schema.campLayouts.shareToken),
        ),
      )
      .returning({ cycle: schema.campLayouts.cycle });
    if (cleared.length === 0) return { changed: false };
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.layout.unshared",
      target: layoutAuditTarget(cycle),
      metadata: { cycle },
    });
    return { changed: true };
  });
}
