import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { writeAuditEvent } from "./audit";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";

// Screenshots attached to bug reports (#313, owner approved 2026-10-02).
//
// A member's report goes to the public GitHub tracker; the picture never does.
// It is a private blob, and this table is the only thing that knows where.
// Captains alone list, open and delete them (the caller gates; this module
// trusts the actor it is handed). Each opening is recorded by the image route;
// a delete is recorded here, in the same transaction as the delete.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The picture types a report may carry. The table's CHECK says the same. */
export const REPORT_SCREENSHOT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;
export type ReportScreenshotType = (typeof REPORT_SCREENSHOT_TYPES)[number];

/** The largest picture kept, in bytes. The table's CHECK says the same. */
export const REPORT_SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024;

/** How long an upload whose report was never filed is kept, in ms. */
export const UNFILED_SCREENSHOT_TTL_MS = 24 * 60 * 60 * 1000;

export const SCREENSHOT_GONE =
  "That screenshot is already gone. Reload the page.";

/** Record an uploaded picture, before its report is filed. */
export async function createReportScreenshot(input: {
  userId: string;
  pathname: string;
  contentType: ReportScreenshotType;
  sizeBytes: number;
}): Promise<{ id: string }> {
  const db = createHttpDb();
  const [row] = await db
    .insert(schema.reportScreenshots)
    .values(input)
    .returning({ id: schema.reportScreenshots.id });
  return { id: row!.id };
}

/**
 * Whether `id` is this member's own picture, uploaded and not yet filed with
 * a report. A report may only point at a picture its sender uploaded.
 */
export async function isUnfiledScreenshotOf(
  id: string,
  userId: string,
): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const db = createHttpDb();
  const [row] = await db
    .select({ id: schema.reportScreenshots.id })
    .from(schema.reportScreenshots)
    .where(
      and(
        eq(schema.reportScreenshots.id, id),
        eq(schema.reportScreenshots.userId, userId),
        isNull(schema.reportScreenshots.filedAt),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Stamp the filed report on its picture. A compare-and-set on "not filed
 * yet", owned by this member: a second filing that names the same picture
 * wins nothing, and says so (false).
 */
export async function markReportScreenshotFiled(input: {
  id: string;
  userId: string;
  issueNumber: number;
  issueUrl: string;
  reportTitle: string;
  reportText: string;
}): Promise<boolean> {
  if (!UUID.test(input.id)) return false;
  const db = createHttpDb();
  const rows = await db
    .update(schema.reportScreenshots)
    .set({
      issueNumber: input.issueNumber,
      issueUrl: input.issueUrl,
      reportTitle: input.reportTitle,
      reportText: input.reportText,
      filedAt: new Date(),
    })
    .where(
      and(
        eq(schema.reportScreenshots.id, input.id),
        eq(schema.reportScreenshots.userId, input.userId),
        isNull(schema.reportScreenshots.filedAt),
      ),
    )
    .returning({ id: schema.reportScreenshots.id });
  return rows.length > 0;
}

/** One filed screenshot, as the captains' page lists it. */
export interface ReportScreenshotRow {
  id: string;
  userId: string;
  /** The sender's name now: "Lost Cat #N" never shows, erasure deletes it. */
  fromName: string | null;
  issueNumber: number | null;
  issueUrl: string | null;
  reportTitle: string | null;
  reportText: string | null;
  filedAt: Date;
}

/** Every filed screenshot, newest first. Captain-only data: gate the caller. */
export async function listReportScreenshots(): Promise<ReportScreenshotRow[]> {
  const db = createHttpDb();
  const rows = await db
    .select({
      id: schema.reportScreenshots.id,
      userId: schema.reportScreenshots.userId,
      fromName: schema.users.displayName,
      issueNumber: schema.reportScreenshots.issueNumber,
      issueUrl: schema.reportScreenshots.issueUrl,
      reportTitle: schema.reportScreenshots.reportTitle,
      reportText: schema.reportScreenshots.reportText,
      filedAt: schema.reportScreenshots.filedAt,
    })
    .from(schema.reportScreenshots)
    .leftJoin(
      schema.users,
      eq(schema.users.id, schema.reportScreenshots.userId),
    )
    .where(isNotNull(schema.reportScreenshots.filedAt))
    .orderBy(
      desc(schema.reportScreenshots.filedAt),
      desc(schema.reportScreenshots.id),
    );
  return rows.flatMap((r) => (r.filedAt ? [{ ...r, filedAt: r.filedAt }] : []));
}

/** Where a filed screenshot's bytes are, for the route that streams them. */
export interface ReportScreenshotFile {
  id: string;
  userId: string;
  pathname: string;
  contentType: string;
  issueNumber: number | null;
}

/** A filed screenshot's file, or null. Never an unfiled one. */
export async function getReportScreenshotFile(
  id: string,
): Promise<ReportScreenshotFile | null> {
  if (!UUID.test(id)) return null;
  const db = createHttpDb();
  const [row] = await db
    .select({
      id: schema.reportScreenshots.id,
      userId: schema.reportScreenshots.userId,
      pathname: schema.reportScreenshots.pathname,
      contentType: schema.reportScreenshots.contentType,
      issueNumber: schema.reportScreenshots.issueNumber,
    })
    .from(schema.reportScreenshots)
    .where(
      and(
        eq(schema.reportScreenshots.id, id),
        isNotNull(schema.reportScreenshots.filedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type DeleteScreenshotResult =
  | { ok: true; pathname: string }
  | { ok: false; error: string };

/**
 * A captain deletes a screenshot. The row and its audit receipt commit
 * together; the caller then deletes the blob (best effort: with no row, no
 * one can reach it). A second delete of the same one is told it is gone.
 */
export async function deleteReportScreenshot(input: {
  id: string;
  actorId: string;
}): Promise<DeleteScreenshotResult> {
  if (!UUID.test(input.id)) return { ok: false, error: SCREENSHOT_GONE };
  return withTransaction(async (tx) => {
    const [row] = await tx
      .delete(schema.reportScreenshots)
      .where(
        and(
          eq(schema.reportScreenshots.id, input.id),
          isNotNull(schema.reportScreenshots.filedAt),
        ),
      )
      .returning({
        userId: schema.reportScreenshots.userId,
        pathname: schema.reportScreenshots.pathname,
        issueNumber: schema.reportScreenshots.issueNumber,
      });
    if (!row) return { ok: false as const, error: SCREENSHOT_GONE };
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "report_screenshot.deleted",
      target: row.userId,
      metadata: { screenshotId: input.id, issueNumber: row.issueNumber },
    });
    return { ok: true as const, pathname: row.pathname };
  });
}

/**
 * Take out the uploads whose report was never filed, older than `before`,
 * and hand back their blob pathnames to delete. Run lazily when the captains'
 * page loads (there is no cron). A filed screenshot is never touched here.
 */
export async function takeStaleUnfiledScreenshots(
  before: Date,
): Promise<string[]> {
  const db = createHttpDb();
  const rows = await db
    .delete(schema.reportScreenshots)
    .where(
      and(
        isNull(schema.reportScreenshots.filedAt),
        lt(schema.reportScreenshots.createdAt, before),
      ),
    )
    .returning({ pathname: schema.reportScreenshots.pathname });
  return rows.map((r) => r.pathname);
}
