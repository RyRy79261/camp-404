import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { writeAuditEvent } from "./audit";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// Camp documents (manuals, how-tos) as drafts that are published when ready.
// Each write commits with its audit row. Who may write which document is the
// caller's check (the MCP tools: a captain, or the lead of the document's
// team); this module refuses only a taken slug or a stale edit.

export type DocumentRow = typeof schema.documents.$inferSelect;
export type DocumentTeam = (typeof schema.teamEnum.enumValues)[number];

/** Postgres unique_violation, which drizzle may nest under `.cause`. */
function isUniqueViolation(err: unknown): boolean {
  for (let e = err as { code?: string; cause?: unknown } | undefined; e; ) {
    if (e.code === "23505") return true;
    e = e.cause as typeof e;
  }
  return false;
}

/** One document by slug, draft or published, or null. */
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

export type CreateDocumentResult =
  | { ok: true; document: DocumentRow }
  | { ok: false; reason: "slug_taken" };

/** A new unpublished document, version 1. */
export async function createDocument(input: {
  title: string;
  slug: string;
  category: string;
  team: DocumentTeam | null;
  markdown: string;
  authorId: string;
}): Promise<CreateDocumentResult> {
  try {
    return await withTransaction(async (tx) => {
      const [row] = await tx
        .insert(schema.documents)
        .values({
          title: input.title,
          slug: input.slug,
          category: input.category,
          team: input.team,
          markdown: input.markdown,
          authorId: input.authorId,
        })
        .returning();
      await writeAuditEvent(tx, {
        actorId: input.authorId,
        action: "document.created",
        target: input.slug,
        metadata: { title: input.title, team: input.team },
      });
      return { ok: true as const, document: row! };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "slug_taken" };
    throw err;
  }
}

export type UpdateDocumentResult =
  | { ok: true; document: DocumentRow }
  | { ok: false; reason: "stale" };

/**
 * Change a document's title, category or text. Bumps the version, and refuses
 * when `expectedVersion` is not the stored one (someone saved in between).
 */
export async function updateDocument(input: {
  slug: string;
  expectedVersion: number;
  change: { title?: string; category?: string; markdown?: string };
  actorId: string;
}): Promise<UpdateDocumentResult> {
  const set = Object.fromEntries(
    Object.entries(input.change).filter(([, value]) => value !== undefined),
  );
  return await withTransaction(async (tx) => {
    const [row] = await tx
      .update(schema.documents)
      .set({
        ...set,
        version: sql`${schema.documents.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.documents.slug, input.slug),
          eq(schema.documents.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!row) return { ok: false as const, reason: "stale" as const };
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "document.updated",
      target: input.slug,
      metadata: { version: row.version, fields: Object.keys(set) },
    });
    return { ok: true as const, document: row };
  });
}

/** Publish or unpublish. Returns the document, or null when there is none. */
export async function setDocumentPublished(input: {
  slug: string;
  published: boolean;
  actorId: string;
}): Promise<DocumentRow | null> {
  return await withTransaction(async (tx) => {
    const [row] = await tx
      .update(schema.documents)
      .set({ published: input.published, updatedAt: new Date() })
      .where(eq(schema.documents.slug, input.slug))
      .returning();
    if (!row) return null;
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: input.published ? "document.published" : "document.unpublished",
      target: input.slug,
      metadata: { title: row.title, version: row.version },
    });
    return row;
  });
}
