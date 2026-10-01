import { and, asc, desc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  canEditGuideChapter,
  canSetGuideChapterPublic,
  dutyCardProblem,
} from "@camp404/core";
import { DutyCard, type DutyCardDraft } from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import * as schema from "./schema";

// The Survival Guide's chapters (#250): the `documents` table and its
// published versions.
//
//  - A chapter's row is the writers' working copy. Publishing copies it into
//    `document_versions` as the next version (only when something changed),
//    and members read that copy, never the working one. Old versions stay.
//  - A captain writes any chapter; a lead writes the chapters of a team they
//    lead this year; a whole-camp chapter (no team) is a captain's
//    (canEditGuideChapter in @camp404/core). Every write re-reads the actor's
//    rank and led teams INSIDE its own transaction and locks them
//    (lockSenderReach), so a lead removed a moment ago cannot still write. A
//    caller passes only who is acting.
//  - Only a captain marks a chapter Public (canSetGuideChapterPublic). Nothing
//    serves a public chapter to anyone signed out yet.
//  - An edit is a compare-and-set on `version`: a lost race says so in a
//    sentence, never overwrites.
//  - A duty card is published only when its card passes DutyCard in full.
//  - Audit: publishing, taking off, the Public mark and "keep for this year"
//    always write an audit row in the same transaction; a saved draft does
//    when the writer is not the chapter's author (the issue's rule).
//
// PGlite has ONE connection: everything inside a transaction goes through
// `tx`, never createHttpDb().

export type DocumentRow = typeof schema.documents.$inferSelect;
export type DocumentTeam = (typeof schema.teamEnum.enumValues)[number];
export type DocumentKind = (typeof schema.documentKindEnum.enumValues)[number];

export type GuideWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export const NOT_A_CHAPTER_WRITER =
  "Only captains and this team's leads can write its chapters.";
export const NOT_A_CAMP_CHAPTER_WRITER =
  "Only captains can write whole-camp chapters.";
export const CHAPTER_GONE = "That chapter isn't there any more.";
export const CHAPTER_EDITED =
  "Someone else saved this chapter while you were editing. Open it again to see their changes.";
export const CHAPTER_SLUG_TAKEN =
  "A chapter with that name already exists. Pick another title.";
export const NOTHING_TO_PUBLISH =
  "Write something in the chapter before you publish it.";
export const CHAPTER_NOT_PUBLISHED = "Publish the chapter first.";
export const NOT_A_PUBLIC_MARKER = "Only captains can mark a chapter public.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A refusal thrown inside a transaction, so nothing it wrote is kept. */
class Refusal extends Error {}

function refuse(message: string): never {
  throw new Refusal(message);
}

/** Postgres unique_violation, which drizzle may nest under `.cause`. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err as { code?: string; cause?: unknown } | undefined; e; ) {
    if (e.code === "23505") return true;
    e = e.cause as typeof e;
  }
  return false;
}

async function write<T extends object>(
  fn: (tx: Tx) => Promise<T>,
): Promise<GuideWriteResult<T>> {
  try {
    return { ok: true, ...(await withTransaction(fn)) };
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, error: error.message };
    if (isUniqueViolation(error)) {
      return { ok: false, error: CHAPTER_SLUG_TAKEN };
    }
    throw error;
  }
}

/** JSON with its keys sorted, so two equal cards compare equal as text. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0,
          ),
        )
      : v,
  );
}

const displayName = (name: string | null | undefined) => name?.trim() || null;

// --- The write rule ------------------------------------------------------------

/** The actor's rung and the teams they lead, locked for the transaction. */
async function lockWriter(
  tx: DbOrTx,
  actorId: string,
): Promise<{ rank: "captain" | "team_lead" | "camp_member"; led: string[] }> {
  if (!UUID.test(actorId)) return { rank: "camp_member", led: [] };
  const reach = await lockSenderReach(tx, actorId);
  if (reach === undefined) return { rank: "captain", led: [] };
  return {
    rank: reach.length > 0 ? "team_lead" : "camp_member",
    led: [...reach],
  };
}

/** The refusal for someone who may not write a chapter of `team`, or null. */
export function chapterRefusal(
  writer: { rank: string; led: readonly string[] },
  team: string | null,
): string | null {
  if (canEditGuideChapter(writer.rank, writer.led, team)) return null;
  return team === null ? NOT_A_CAMP_CHAPTER_WRITER : NOT_A_CHAPTER_WRITER;
}

/** The chapter's row, locked for the rest of the transaction. */
async function lockChapter(tx: Tx, slug: string): Promise<DocumentRow> {
  const [row] = await tx
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.slug, slug))
    .for("update");
  if (!row) refuse(CHAPTER_GONE);
  return row;
}

// --- Reads ---------------------------------------------------------------------

export interface GuideChapterSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  team: DocumentTeam | null;
  kind: DocumentKind;
  /** The published version members read. */
  version: number;
  publishedAt: Date;
  cycleReviewed: number | null;
}

export interface GuideVersionEntry {
  version: number;
  publishedAt: Date;
  publishedByName: string | null;
}

export interface GuideChapter extends GuideChapterSummary {
  markdown: string;
  card: DutyCard | null;
  public: boolean;
  /** Every published version, newest first. */
  versions: GuideVersionEntry[];
}

const v = schema.documentVersions;
const d = schema.documents;

function summaryColumns() {
  return {
    id: d.id,
    slug: d.slug,
    title: v.title,
    category: v.category,
    team: v.team,
    kind: v.kind,
    version: v.version,
    publishedAt: v.publishedAt,
    cycleReviewed: d.cycleReviewed,
  };
}

const liveVersion = and(
  eq(v.documentId, d.id),
  eq(v.version, d.publishedVersion),
);

/** `%` and `_` typed into the search box are letters, not wildcards. */
function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The chapters members read, by title. `query` keeps those whose published
 * title, text or card mentions it (any case).
 */
export async function listPublishedChapters(
  input: { query?: string } = {},
): Promise<GuideChapterSummary[]> {
  const query = input.query?.trim();
  const match = query
    ? or(
        sql`${v.title} ilike ${likePattern(query)}`,
        sql`${v.markdown} ilike ${likePattern(query)}`,
        sql`coalesce(${v.card}::text, '') ilike ${likePattern(query)}`,
      )
    : undefined;
  return createHttpDb()
    .select(summaryColumns())
    .from(d)
    .innerJoin(v, liveVersion)
    .where(and(eq(d.published, true), match))
    .orderBy(asc(v.title), asc(d.slug));
}

const publisher = alias(schema.users, "publisher");

/** Every published version of a chapter, newest first. */
export async function listChapterVersions(
  documentId: string,
): Promise<GuideVersionEntry[]> {
  if (!UUID.test(documentId)) return [];
  return versionsOf(documentId);
}

async function versionsOf(documentId: string): Promise<GuideVersionEntry[]> {
  const rows = await createHttpDb()
    .select({
      version: v.version,
      publishedAt: v.publishedAt,
      publishedByName: publisher.displayName,
    })
    .from(v)
    .leftJoin(publisher, eq(publisher.id, v.publishedBy))
    .where(eq(v.documentId, documentId))
    .orderBy(desc(v.version));
  return rows.map((r) => ({
    ...r,
    publishedByName: displayName(r.publishedByName),
  }));
}

/** One published chapter as members read it, or null. */
export async function getPublishedChapter(
  slug: string,
): Promise<GuideChapter | null> {
  const [row] = await createHttpDb()
    .select({
      ...summaryColumns(),
      markdown: v.markdown,
      card: v.card,
      public: d.public,
    })
    .from(d)
    .innerJoin(v, liveVersion)
    .where(and(eq(d.slug, slug), eq(d.published, true)));
  if (!row) return null;
  return { ...row, versions: await versionsOf(row.id) };
}

export interface GuideChapterVersion {
  documentId: string;
  slug: string;
  version: number;
  title: string;
  category: string;
  team: DocumentTeam | null;
  kind: DocumentKind;
  markdown: string;
  card: DutyCard | null;
  publishedAt: Date;
  publishedByName: string | null;
  /** The chapter as it stands: on the guide, which version, and its team. */
  chapter: {
    published: boolean;
    publishedVersion: number | null;
    team: DocumentTeam | null;
  };
}

/**
 * One published version of a chapter, whether or not the chapter is on the
 * guide now (the page decides who may read a chapter that was taken off).
 */
export async function getChapterVersion(
  slug: string,
  version: number,
): Promise<GuideChapterVersion | null> {
  if (!Number.isInteger(version) || version < 1) return null;
  const [row] = await createHttpDb()
    .select({
      documentId: d.id,
      slug: d.slug,
      version: v.version,
      title: v.title,
      category: v.category,
      team: v.team,
      kind: v.kind,
      markdown: v.markdown,
      card: v.card,
      publishedAt: v.publishedAt,
      publishedByName: publisher.displayName,
      published: d.published,
      publishedVersion: d.publishedVersion,
      chapterTeam: d.team,
    })
    .from(d)
    .innerJoin(v, eq(v.documentId, d.id))
    .leftJoin(publisher, eq(publisher.id, v.publishedBy))
    .where(and(eq(d.slug, slug), eq(v.version, version)));
  if (!row) return null;
  const { published, publishedVersion, chapterTeam, ...rest } = row;
  return {
    ...rest,
    publishedByName: displayName(rest.publishedByName),
    chapter: { published, publishedVersion, team: chapterTeam },
  };
}

/** A chapter as its writers see it: the working copy and where it stands. */
export interface GuideDraft {
  id: string;
  slug: string;
  title: string;
  category: string;
  team: DocumentTeam | null;
  kind: DocumentKind;
  markdown: string;
  card: DutyCardDraft | null;
  /** The save count an edit compares and sets on. */
  version: number;
  authorId: string | null;
  authorName: string | null;
  published: boolean;
  publishedVersion: number | null;
  public: boolean;
  cycleReviewed: number | null;
  updatedAt: Date;
  /** The working copy differs from the newest published version (or none). */
  changedSincePublish: boolean;
}

const author = alias(schema.users, "author");
const latest = alias(schema.documentVersions, "latest");

async function readDrafts(where: SQL | undefined): Promise<GuideDraft[]> {
  const rows = await createHttpDb()
    .select({
      doc: d,
      authorName: author.displayName,
      latest: {
        title: latest.title,
        category: latest.category,
        team: latest.team,
        markdown: latest.markdown,
        card: latest.card,
        version: latest.version,
      },
    })
    .from(d)
    .leftJoin(author, eq(author.id, d.authorId))
    .leftJoin(
      latest,
      and(
        eq(latest.documentId, d.id),
        sql`${latest.version} = (select max(dv.version) from document_versions dv where dv.document_id = ${d.id})`,
      ),
    )
    .where(where)
    .orderBy(asc(d.title), asc(d.slug));
  return rows.map(({ doc, authorName, latest: last }) => ({
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    category: doc.category,
    team: doc.team,
    kind: doc.kind,
    markdown: doc.markdown,
    card: doc.card,
    version: doc.version,
    authorId: doc.authorId,
    authorName: displayName(authorName),
    published: doc.published,
    publishedVersion: doc.publishedVersion,
    public: doc.public,
    cycleReviewed: doc.cycleReviewed,
    updatedAt: doc.updatedAt,
    changedSincePublish:
      !last?.version ||
      last.title !== doc.title ||
      last.category !== doc.category ||
      last.team !== doc.team ||
      last.markdown !== doc.markdown ||
      canonical(last.card ?? null) !== canonical(doc.card ?? null),
  }));
}

/**
 * Every chapter's working copy, by title. The page keeps only those the
 * viewer may write (canEditGuideChapter) before anything leaves the server.
 */
export async function listGuideDrafts(): Promise<GuideDraft[]> {
  return readDrafts(undefined);
}

/** One chapter's working copy, or null. */
export async function getGuideDraft(slug: string): Promise<GuideDraft | null> {
  const [row] = await readDrafts(eq(d.slug, slug));
  return row ?? null;
}

/** The newest version of each chapter `userId` has opened, by chapter id. */
export async function listChapterReads(
  userId: string,
): Promise<Record<string, number>> {
  if (!UUID.test(userId)) return {};
  const rows = await createHttpDb()
    .select({
      documentId: schema.documentReads.documentId,
      version: schema.documentReads.version,
    })
    .from(schema.documentReads)
    .where(eq(schema.documentReads.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.documentId, r.version]));
}

/** Note that `userId` opened `version` of a chapter; never goes backwards. */
export async function recordChapterRead(input: {
  userId: string;
  documentId: string;
  version: number;
}): Promise<void> {
  if (!UUID.test(input.userId) || !UUID.test(input.documentId)) return;
  await createHttpDb()
    .insert(schema.documentReads)
    .values({
      userId: input.userId,
      documentId: input.documentId,
      version: input.version,
    })
    .onConflictDoUpdate({
      target: [schema.documentReads.userId, schema.documentReads.documentId],
      set: {
        version: sql`greatest(${schema.documentReads.version}, excluded.version)`,
        readAt: new Date(),
      },
    });
}

// --- Writes ----------------------------------------------------------------------

export interface GuideChapterFields {
  title: string;
  category: string;
  team: DocumentTeam | null;
  markdown: string;
  /** A duty card's parts; null on a plain chapter. */
  card: DutyCardDraft | null;
}

/** Start a chapter as a draft, as a captain or a lead of its team. */
export async function createGuideChapter(
  input: GuideChapterFields & {
    actorId: string;
    slug: string;
    kind: DocumentKind;
  },
): Promise<GuideWriteResult<{ document: DocumentRow }>> {
  return write(async (tx) => {
    const refusal = chapterRefusal(
      await lockWriter(tx, input.actorId),
      input.team,
    );
    if (refusal) refuse(refusal);
    const card =
      input.kind === "duty_card"
        ? (input.card ?? {
            shiftTypeKey: "",
            subRoles: [],
            steps: [],
            hardRules: [],
            checklist: [],
            askRole: "",
          })
        : null;
    const [row] = await tx
      .insert(schema.documents)
      .values({
        title: input.title,
        slug: input.slug,
        category: input.category,
        team: input.team,
        kind: input.kind,
        markdown: input.markdown,
        card,
        authorId: input.actorId,
      })
      .returning();
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "document.created",
      target: input.slug,
      metadata: { title: input.title, team: input.team, kind: input.kind },
    });
    return { document: row! };
  });
}

/**
 * Save a chapter's working copy. Only the fields given change. A writer must
 * be allowed both the chapter's team and the team it moves to. A plain
 * chapter takes no card; a duty card keeps one.
 */
export async function saveGuideChapter(input: {
  actorId: string;
  slug: string;
  expectedVersion: number;
  change: Partial<GuideChapterFields>;
}): Promise<GuideWriteResult<{ document: DocumentRow }>> {
  return write(async (tx) => {
    const writer = await lockWriter(tx, input.actorId);
    const doc = await lockChapter(tx, input.slug);
    const refusal =
      chapterRefusal(writer, doc.team) ??
      (input.change.team !== undefined
        ? chapterRefusal(writer, input.change.team)
        : null);
    if (refusal) refuse(refusal);
    if (doc.version !== input.expectedVersion) refuse(CHAPTER_EDITED);

    const { card, ...rest } = input.change;
    const set = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );
    const nextCard = doc.kind === "duty_card" ? (card ?? doc.card) : null;
    const [row] = await tx
      .update(schema.documents)
      .set({
        ...set,
        card: nextCard,
        version: doc.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.documents.id, doc.id),
          eq(schema.documents.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!row) refuse(CHAPTER_EDITED);
    if (doc.authorId !== input.actorId) {
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "document.updated",
        target: doc.slug,
        metadata: {
          title: row.title,
          authorId: doc.authorId,
          fields: Object.keys(input.change).filter(
            (k) => input.change[k as keyof GuideChapterFields] !== undefined,
          ),
        },
      });
    }
    return { document: row };
  });
}

/**
 * Publish a chapter's working copy for every member. When it differs from the
 * newest version it becomes the next version; otherwise that version goes back
 * up as it was. Either way the chapter counts as reviewed this year. A duty
 * card must pass its full check first. `expectedVersion`, when given, is the
 * save the writer saw: a newer save is refused rather than published unseen.
 */
export async function publishGuideChapter(input: {
  actorId: string;
  slug: string;
  expectedVersion?: number;
}): Promise<GuideWriteResult<{ version: number; created: boolean }>> {
  return write(async (tx) => {
    const writer = await lockWriter(tx, input.actorId);
    const doc = await lockChapter(tx, input.slug);
    const refusal = chapterRefusal(writer, doc.team);
    if (refusal) refuse(refusal);
    if (
      input.expectedVersion !== undefined &&
      doc.version !== input.expectedVersion
    ) {
      refuse(CHAPTER_EDITED);
    }

    let card: DutyCard | null = null;
    if (doc.kind === "duty_card") {
      const problem = dutyCardProblem(doc.card);
      if (problem) refuse(problem);
      card = DutyCard.parse(doc.card);
    } else if (doc.markdown.trim() === "") {
      refuse(NOTHING_TO_PUBLISH);
    }

    const [last] = await tx
      .select()
      .from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, doc.id))
      .orderBy(desc(schema.documentVersions.version))
      .limit(1);
    const same =
      last !== undefined &&
      last.title === doc.title &&
      last.category === doc.category &&
      last.team === doc.team &&
      last.kind === doc.kind &&
      last.markdown === doc.markdown &&
      canonical(last.card ?? null) === canonical(card);
    const version = same ? last.version : (last?.version ?? 0) + 1;
    if (!same) {
      await tx.insert(schema.documentVersions).values({
        documentId: doc.id,
        version,
        title: doc.title,
        category: doc.category,
        team: doc.team,
        kind: doc.kind,
        markdown: doc.markdown,
        card,
        publishedBy: input.actorId,
      });
    }
    await tx
      .update(schema.documents)
      .set({
        published: true,
        publishedVersion: version,
        cycleReviewed: await currentCycleNumber(tx),
        updatedAt: new Date(),
      })
      .where(eq(schema.documents.id, doc.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "document.published",
      target: doc.slug,
      metadata: { title: doc.title, version, newVersion: !same },
    });
    return { version, created: !same };
  });
}

/** Take a chapter off the guide. Its versions stay; publishing brings it back. */
export async function unpublishGuideChapter(input: {
  actorId: string;
  slug: string;
}): Promise<GuideWriteResult> {
  return write(async (tx) => {
    const writer = await lockWriter(tx, input.actorId);
    const doc = await lockChapter(tx, input.slug);
    const refusal = chapterRefusal(writer, doc.team);
    if (refusal) refuse(refusal);
    if (!doc.published) return {};
    await tx
      .update(schema.documents)
      .set({ published: false, updatedAt: new Date() })
      .where(eq(schema.documents.id, doc.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "document.unpublished",
      target: doc.slug,
      metadata: { title: doc.title },
    });
    return {};
  });
}

/**
 * Keep a published chapter for this year without changing it (the "copy from
 * last year and review" step): an editor read it and it still holds.
 */
export async function markGuideChapterReviewed(input: {
  actorId: string;
  slug: string;
}): Promise<GuideWriteResult<{ cycle: number }>> {
  return write(async (tx) => {
    const writer = await lockWriter(tx, input.actorId);
    const doc = await lockChapter(tx, input.slug);
    const refusal = chapterRefusal(writer, doc.team);
    if (refusal) refuse(refusal);
    if (!doc.published) refuse(CHAPTER_NOT_PUBLISHED);
    const cycle = await currentCycleNumber(tx);
    await tx
      .update(schema.documents)
      .set({ cycleReviewed: cycle })
      .where(eq(schema.documents.id, doc.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "document.reviewed",
      target: doc.slug,
      metadata: { title: doc.title, cycle },
    });
    return { cycle };
  });
}

/**
 * Mark a chapter Public or members only. A captain's call. Stored and shown
 * in the editor; nothing serves a public chapter signed out yet.
 */
export async function setGuideChapterPublic(input: {
  actorId: string;
  slug: string;
  public: boolean;
}): Promise<GuideWriteResult> {
  return write(async (tx) => {
    const writer = await lockWriter(tx, input.actorId);
    if (!canSetGuideChapterPublic(writer.rank)) refuse(NOT_A_PUBLIC_MARKER);
    const doc = await lockChapter(tx, input.slug);
    if (doc.public === input.public) return {};
    await tx
      .update(schema.documents)
      .set({ public: input.public })
      .where(eq(schema.documents.id, doc.id));
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "document.public_set",
      target: doc.slug,
      metadata: { title: doc.title, public: input.public },
    });
    return {};
  });
}

// --- The Claude connector's reads (apps/web/lib/mcp/tools/documents.ts) -----------

/** One document's working copy by slug, draft or published, or null. */
export async function getDocumentBySlug(
  slug: string,
): Promise<DocumentRow | null> {
  const [row] = await createHttpDb()
    .select()
    .from(schema.documents)
    .where(eq(schema.documents.slug, slug))
    .limit(1);
  return row ?? null;
}

/**
 * Unpublished documents, by title. `teams` limits the read to those teams plus
 * the drafts `authorId` wrote (a team lead's view); leave both out for every
 * draft.
 */
export async function listDocumentDrafts(
  options: { teams?: readonly DocumentTeam[]; authorId?: string } = {},
): Promise<DocumentRow[]> {
  const visible: SQL[] = [];
  if (options.teams && options.teams.length > 0) {
    visible.push(inArray(schema.documents.team, [...options.teams]));
  }
  if (options.authorId) {
    visible.push(eq(schema.documents.authorId, options.authorId));
  }
  const scoped = options.teams !== undefined || options.authorId !== undefined;
  if (scoped && visible.length === 0) return [];
  return createHttpDb()
    .select()
    .from(schema.documents)
    .where(
      and(
        eq(schema.documents.published, false),
        scoped ? or(...visible) : undefined,
      ),
    )
    .orderBy(asc(schema.documents.title));
}
