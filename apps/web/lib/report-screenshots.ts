import "server-only";

import { errorLogText } from "@camp404/core";
import { del, get, list, put } from "@vercel/blob";
import {
  createReportScreenshot as dbCreate,
  deleteReportScreenshot as dbDelete,
  getReportScreenshotFile as dbGetFile,
  isUnfiledScreenshotOf as dbIsUnfiled,
  listReportScreenshots as dbList,
  markReportScreenshotFiled as dbMarkFiled,
  takeStaleUnfiledScreenshots as dbTakeStale,
  SCREENSHOT_GONE,
  UNFILED_SCREENSHOT_TTL_MS,
  type ReportScreenshotRow,
  type ReportScreenshotType,
} from "@camp404/db/report-screenshots";
import { proofBytesMatch } from "./payment-proof";
import { SCREENSHOT_TYPES } from "./report-screenshot-copy";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Screenshots attached to bug reports (#313, owner approved 2026-10-02).
//
// WHERE THE PICTURE LIVES: a PRIVATE Vercel Blob (`access: "private"`, the
// store payment proofs already use), under `report-screenshots/<member id>/`
// with a random suffix. A private blob has no public address: reading it
// takes the store's token, which only the server holds. The pathname never
// leaves the server; /api/report-screenshot/<id> streams the bytes to
// captains and records each read. Under E2E the in-memory store keeps the
// bytes on the row instead.

export type { ReportScreenshotRow };
export { SCREENSHOT_GONE };

export function screenshotFolder(userId: string): string {
  return `report-screenshots/${userId}/`;
}

/** Whether a picture's first bytes are what its type says (PNG, JPEG, WebP). */
export function screenshotBytesMatch(type: string, head: Uint8Array): boolean {
  return Object.hasOwn(SCREENSHOT_TYPES, type) && proofBytesMatch(type, head);
}

export type StoreResult =
  | { ok: true; id: string }
  | { ok: false; error: string; status: number };

/** Keep an uploaded picture, not yet filed with any report. */
export async function storeReportScreenshot(input: {
  userId: string;
  contentType: ReportScreenshotType;
  bytes: Uint8Array;
}): Promise<StoreResult> {
  if (usesTestStore()) {
    return { ok: true, ...testStore.createReportScreenshot(input) };
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return {
      ok: false,
      error:
        "Screenshots aren't set up on this site yet. Send the report without one.",
      status: 501,
    };
  }
  const ext = SCREENSHOT_TYPES[input.contentType]!;
  let pathname: string;
  try {
    const blob = await put(
      `${screenshotFolder(input.userId)}screenshot.${ext}`,
      Buffer.from(input.bytes),
      {
        access: "private",
        addRandomSuffix: true,
        contentType: input.contentType,
        token,
      },
    );
    pathname = blob.pathname;
  } catch (err) {
    console.error("report-screenshot upload error", err);
    return { ok: false, error: "The upload failed. Try again.", status: 502 };
  }
  try {
    const { id } = await dbCreate({
      userId: input.userId,
      pathname,
      contentType: input.contentType,
      sizeBytes: input.bytes.byteLength,
    });
    return { ok: true, id };
  } catch (err) {
    // No row points at the file, so nothing could show or delete it.
    await del(pathname, { token }).catch((cleanupErr: unknown) =>
      console.error("report-screenshot cleanup error", cleanupErr),
    );
    console.error(
      "report-screenshot record error",
      errorLogText(err, process.env),
    );
    return { ok: false, error: "The upload failed. Try again.", status: 500 };
  }
}

/** Whether `id` is this member's own picture, not yet filed. */
export async function isUnfiledScreenshotOf(
  id: string,
  userId: string,
): Promise<boolean> {
  if (usesTestStore()) return testStore.isUnfiledScreenshotOf(id, userId);
  return dbIsUnfiled(id, userId);
}

/** Stamp the filed report on its picture (compare-and-set). */
export async function markReportScreenshotFiled(input: {
  id: string;
  userId: string;
  issueNumber: number;
  issueUrl: string;
  reportTitle: string;
  reportText: string;
}): Promise<boolean> {
  if (usesTestStore()) return testStore.markReportScreenshotFiled(input);
  return dbMarkFiled(input);
}

/** Every filed screenshot, newest first. Captain-only: gate the caller. */
export async function listReportScreenshots(): Promise<ReportScreenshotRow[]> {
  if (usesTestStore()) return testStore.listReportScreenshots();
  return dbList();
}

/** A filed screenshot's bytes, for the image route. Captain-only. */
export async function readReportScreenshot(id: string): Promise<{
  userId: string;
  contentType: string;
  issueNumber: number | null;
  body: ReadableStream<Uint8Array> | Uint8Array;
} | null> {
  if (usesTestStore()) {
    const row = testStore.getReportScreenshot(id);
    return row ? { ...row, body: row.bytes } : null;
  }
  const file = await dbGetFile(id);
  if (!file) return null;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const result = await get(file.pathname, { access: "private", token });
    if (!result || result.statusCode !== 200) return null;
    return {
      userId: file.userId,
      contentType: file.contentType,
      issueNumber: file.issueNumber,
      body: result.stream,
    };
  } catch (err) {
    console.error("report-screenshot read error", err);
    return null;
  }
}

/**
 * A captain deletes a screenshot: the row and its audit receipt first, in one
 * transaction, then the picture (best effort: with no row, nothing reaches
 * it).
 */
export async function removeReportScreenshot(input: {
  id: string;
  actorId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (usesTestStore()) {
    return testStore.deleteReportScreenshot(input.id)
      ? { ok: true }
      : { ok: false, error: SCREENSHOT_GONE };
  }
  const result = await dbDelete(input);
  if (!result.ok) return result;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token) {
    await del(result.pathname, { token }).catch((err: unknown) =>
      console.error("report-screenshot delete error", err),
    );
  }
  return { ok: true };
}

/**
 * Clear uploads whose report was never filed, a day on (no cron: the
 * captains' page calls this as it loads). A filed screenshot is never touched.
 */
export async function clearStaleUnfiledScreenshots(): Promise<void> {
  if (usesTestStore()) return;
  const pathnames = await dbTakeStale(
    new Date(Date.now() - UNFILED_SCREENSHOT_TTL_MS),
  );
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (token && pathnames.length > 0) {
    await del(pathnames, { token });
  }
}

/**
 * Delete every screenshot file a member uploaded, at erasure (their rows are
 * already gone with the erasure's transaction). Best effort, like the proofs.
 */
export async function deleteReportScreenshotBlobs(
  userId: string,
): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    console.warn(
      "[report-screenshot] BLOB_READ_WRITE_TOKEN is not set, so screenshot files were not deleted.",
    );
    return;
  }
  const prefix = screenshotFolder(userId);
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, token, cursor });
    urls.push(...page.blobs.map((b) => b.url));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (urls.length > 0) await del(urls, { token });
}
