import { and, desc, eq, isNotNull, lt, sql } from "drizzle-orm";
import { JoinPageSave } from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import * as schema from "./schema";

// The join page (#264, owner's rulings 2026-09-24): what join.camp-404.com
// shows for the camp's current burn year, written by a captain in Camp
// settings. Bespoke on purpose: one row per year, no generic content store.
//
//  - Anyone reads the published copy, signed in or not: the join site calls
//    getPublishedJoinPage with no session at all, and it reads nothing else.
//  - Only a captain writes. The rank is read again, and locked, inside the
//    write's own transaction (lockJoinPageEditor), never trusted from the caller.
//  - Every write is a compare-and-set on `version` and commits with its audit
//    row. A lost race says so in a sentence, never overwrites.
//  - Year-scoped: a write lands on the camp's current year, read inside the
//    transaction. A year with no page yet opens the editor on the newest
//    earlier year's text, so next year starts from this year's words.
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type JoinPageWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_JOIN_PAGE_EDITOR =
  "Only a captain can change the join page.";
export const JOIN_PAGE_CHANGED =
  "Someone changed the join page first. Reload the page to see their version.";
export const JOIN_PAGE_NOT_PUBLISHED = "The join page is not published.";
export const CHECK_JOIN_PAGE = "Check the join page and try again.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One year's join page as the editor reads it. */
export interface JoinPage {
  cycle: number;
  /** The editor's text, saved or not yet published. */
  draft: string;
  /** What the join site shows, or null when nothing is published. */
  published: string | null;
  publishedAt: Date | null;
  /** 0 when the year has no page yet. */
  version: number;
  updatedAt: Date | null;
  /**
   * When the year has no page yet: the earlier year whose text the draft
   * starts from, or null when there is none.
   */
  startedFrom: number | null;
}

/** The published page, as the join site reads it. */
export interface PublishedJoinPage {
  cycle: number;
  markdown: string;
  publishedAt: Date | null;
}

type JoinPageRow = typeof schema.joinPages.$inferSelect;

function fromRow(row: JoinPageRow): JoinPage {
  return {
    cycle: row.cycle,
    draft: row.draft,
    published: row.published,
    publishedAt: row.publishedAt,
    version: row.version,
    updatedAt: row.updatedAt,
    startedFrom: null,
  };
}

// --- Reads -------------------------------------------------------------------

/** A year's page, read through `db`, or null when the year has none. */
export async function readJoinPage(
  db: DbOrTx,
  cycle: number,
): Promise<JoinPage | null> {
  const [row] = await db
    .select()
    .from(schema.joinPages)
    .where(eq(schema.joinPages.cycle, cycle));
  return row ? fromRow(row) : null;
}

/**
 * This year's page for the editor. A year with no page yet opens on the
 * newest earlier year's draft (version 0, nothing published), so a captain
 * edits last year's words instead of starting from nothing.
 */
export async function getJoinPageForEditor(): Promise<JoinPage> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber(db);
  const page = await readJoinPage(db, cycle);
  if (page) return page;
  const [earlier] = await db
    .select({ cycle: schema.joinPages.cycle, draft: schema.joinPages.draft })
    .from(schema.joinPages)
    .where(lt(schema.joinPages.cycle, cycle))
    .orderBy(desc(schema.joinPages.cycle))
    .limit(1);
  return {
    cycle,
    draft: earlier?.draft ?? "",
    published: null,
    publishedAt: null,
    version: 0,
    updatedAt: null,
    startedFrom: earlier?.cycle ?? null,
  };
}

/**
 * The page the join site shows: the current year's published copy, or null.
 * An earlier year's page is never shown: its dates and fee would be wrong.
 * Read-only, and needs no session.
 */
export async function getPublishedJoinPage(
  db: DbOrTx = createHttpDb(),
): Promise<PublishedJoinPage | null> {
  const cycle = await currentCycleNumber(db);
  const [row] = await db
    .select({
      cycle: schema.joinPages.cycle,
      markdown: schema.joinPages.published,
      publishedAt: schema.joinPages.publishedAt,
    })
    .from(schema.joinPages)
    .where(
      and(
        eq(schema.joinPages.cycle, cycle),
        isNotNull(schema.joinPages.published),
      ),
    );
  if (!row || row.markdown === null) return null;
  return {
    cycle: row.cycle,
    markdown: row.markdown,
    publishedAt: row.publishedAt,
  };
}

// --- Writes ------------------------------------------------------------------

class Refused extends Error {
  constructor(readonly sentence: string) {
    super(sentence);
    this.name = "Refused";
  }
}

function refuse(sentence: string): never {
  throw new Refused(sentence);
}

/**
 * Whether the actor is a captain, read and locked inside the write's own
 * transaction, so a demotion that committed first is seen and one that comes
 * later waits. The lock also holds the camp's year still for the write.
 */
async function lockJoinPageEditor(tx: Tx, actorId: string): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  await tx
    .select({ id: schema.campSettings.id })
    .from(schema.campSettings)
    .for("share");
  const [actor] = await tx
    .select({ rank: schema.users.rank })
    .from(schema.users)
    .where(eq(schema.users.id, actorId))
    .for("share");
  return actor?.rank === "captain";
}

async function run<T>(
  fn: (tx: Tx) => Promise<JoinPageWriteResult<T>>,
): Promise<JoinPageWriteResult<T>> {
  try {
    return await withTransaction(fn);
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/**
 * Saves this year's page, and publishes it too when `publish` is set.
 * `expectedVersion` 0 means the editor saw no page this year, so the save
 * inserts one; if someone saved first, the insert finds their row and
 * refuses. A save without publishing leaves the published copy as it was.
 */
export async function saveJoinPage(
  input: { actorId: string } & JoinPageSave,
): Promise<JoinPageWriteResult<{ version: number; cycle: number }>> {
  const parsed = JoinPageSave.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? CHECK_JOIN_PAGE,
    };
  }
  const { markdown, expectedVersion, publish } = parsed.data;
  return run(async (tx) => {
    if (!(await lockJoinPageEditor(tx, input.actorId))) {
      refuse(NOT_A_JOIN_PAGE_EDITOR);
    }
    const cycle = await currentCycleNumber(tx);
    const now = new Date();
    const published = publish ? { published: markdown, publishedAt: now } : {};
    let version: number;
    if (expectedVersion === 0) {
      const [row] = await tx
        .insert(schema.joinPages)
        .values({
          cycle,
          draft: markdown,
          ...published,
          version: 1,
          updatedByUserId: input.actorId,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: schema.joinPages.cycle })
        .returning({ version: schema.joinPages.version });
      if (!row) refuse(JOIN_PAGE_CHANGED);
      version = row.version;
    } else {
      const [row] = await tx
        .update(schema.joinPages)
        .set({
          draft: markdown,
          ...published,
          version: sql`${schema.joinPages.version} + 1`,
          updatedByUserId: input.actorId,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.joinPages.cycle, cycle),
            eq(schema.joinPages.version, expectedVersion),
          ),
        )
        .returning({ version: schema.joinPages.version });
      if (!row) refuse(JOIN_PAGE_CHANGED);
      version = row.version;
    }
    // The text itself is not copied into the row: it is up to 50,000
    // characters, and the page's own history is the version it replaced.
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: publish ? "camp.join_page.published" : "camp.join_page.saved",
      target: "join_page",
      metadata: { cycle, version, characters: markdown.length },
    });
    return { ok: true as const, version, cycle };
  });
}

/** Takes this year's page off the join site. The draft stays. */
export async function unpublishJoinPage(input: {
  actorId: string;
  expectedVersion: number;
}): Promise<JoinPageWriteResult<{ version: number }>> {
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    return { ok: false, error: JOIN_PAGE_NOT_PUBLISHED };
  }
  return run(async (tx) => {
    if (!(await lockJoinPageEditor(tx, input.actorId))) {
      refuse(NOT_A_JOIN_PAGE_EDITOR);
    }
    const cycle = await currentCycleNumber(tx);
    const [row] = await tx
      .update(schema.joinPages)
      .set({
        published: null,
        publishedAt: null,
        version: sql`${schema.joinPages.version} + 1`,
        updatedByUserId: input.actorId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.joinPages.cycle, cycle),
          eq(schema.joinPages.version, input.expectedVersion),
          isNotNull(schema.joinPages.published),
        ),
      )
      .returning({ version: schema.joinPages.version });
    if (!row) {
      // Say which: someone else wrote first, or there was nothing to take down.
      const now = await readJoinPage(tx, cycle);
      refuse(
        now && now.version === input.expectedVersion
          ? JOIN_PAGE_NOT_PUBLISHED
          : JOIN_PAGE_CHANGED,
      );
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "camp.join_page.unpublished",
      target: "join_page",
      metadata: { cycle, version: row.version },
    });
    return { ok: true as const, version: row.version };
  });
}
