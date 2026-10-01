import "server-only";

import { after } from "next/server";
import * as db from "@camp404/db/documents";
import type {
  GuideChapter,
  GuideChapterSummary,
  GuideChapterVersion,
  GuideDraft,
  GuideWriteResult,
} from "@camp404/db/documents";
import { usesTestStore } from "./test-mode";
import { guideTestStore } from "./test-store-guide";

// The Survival Guide's data (#250), from the database or, under E2E, the test
// store. The rules live in @camp404/db/documents; the store repeats them.

export type {
  GuideChapter,
  GuideChapterSummary,
  GuideChapterVersion,
  GuideDraft,
  GuideWriteResult,
};

export async function listPublishedChapters(
  input: { query?: string } = {},
): Promise<GuideChapterSummary[]> {
  return usesTestStore()
    ? guideTestStore.listPublishedChapters(input)
    : db.listPublishedChapters(input);
}

export async function getPublishedChapter(
  slug: string,
): Promise<GuideChapter | null> {
  return usesTestStore()
    ? guideTestStore.getPublishedChapter(slug)
    : db.getPublishedChapter(slug);
}

export async function getChapterVersion(
  slug: string,
  version: number,
): Promise<GuideChapterVersion | null> {
  return usesTestStore()
    ? guideTestStore.getChapterVersion(slug, version)
    : db.getChapterVersion(slug, version);
}

export async function listChapterVersions(
  documentId: string,
): ReturnType<typeof db.listChapterVersions> {
  return usesTestStore()
    ? guideTestStore.listChapterVersions(documentId)
    : db.listChapterVersions(documentId);
}

export async function listGuideDrafts(): Promise<GuideDraft[]> {
  return usesTestStore()
    ? guideTestStore.listGuideDrafts()
    : db.listGuideDrafts();
}

export async function getGuideDraft(slug: string): Promise<GuideDraft | null> {
  return usesTestStore()
    ? guideTestStore.getGuideDraft(slug)
    : db.getGuideDraft(slug);
}

export async function listChapterReads(
  userId: string,
): Promise<Record<string, number>> {
  return usesTestStore()
    ? guideTestStore.listChapterReads(userId)
    : db.listChapterReads(userId);
}

export async function recordChapterRead(
  input: Parameters<typeof db.recordChapterRead>[0],
): Promise<void> {
  if (usesTestStore()) guideTestStore.recordChapterRead(input);
  else await db.recordChapterRead(input);
}

/**
 * Note the read after the page has gone out, so opening a chapter never waits
 * on it. A failed write is logged; the mark just stays until the next read.
 */
export function recordChapterReadAfterResponse(
  input: Parameters<typeof db.recordChapterRead>[0],
): void {
  after(async () => {
    try {
      await recordChapterRead(input);
    } catch (error) {
      console.error("guide read write failed", error);
    }
  });
}

export async function createGuideChapter(
  input: Parameters<typeof db.createGuideChapter>[0],
): ReturnType<typeof db.createGuideChapter> {
  return usesTestStore()
    ? guideTestStore.createGuideChapter(input)
    : db.createGuideChapter(input);
}

export async function saveGuideChapter(
  input: Parameters<typeof db.saveGuideChapter>[0],
): ReturnType<typeof db.saveGuideChapter> {
  return usesTestStore()
    ? guideTestStore.saveGuideChapter(input)
    : db.saveGuideChapter(input);
}

export async function publishGuideChapter(
  input: Parameters<typeof db.publishGuideChapter>[0],
): ReturnType<typeof db.publishGuideChapter> {
  return usesTestStore()
    ? guideTestStore.publishGuideChapter(input)
    : db.publishGuideChapter(input);
}

export async function unpublishGuideChapter(
  input: Parameters<typeof db.unpublishGuideChapter>[0],
): ReturnType<typeof db.unpublishGuideChapter> {
  return usesTestStore()
    ? guideTestStore.unpublishGuideChapter(input)
    : db.unpublishGuideChapter(input);
}

export async function markGuideChapterReviewed(
  input: Parameters<typeof db.markGuideChapterReviewed>[0],
): ReturnType<typeof db.markGuideChapterReviewed> {
  return usesTestStore()
    ? guideTestStore.markGuideChapterReviewed(input)
    : db.markGuideChapterReviewed(input);
}

export async function setGuideChapterPublic(
  input: Parameters<typeof db.setGuideChapterPublic>[0],
): ReturnType<typeof db.setGuideChapterPublic> {
  return usesTestStore()
    ? guideTestStore.setGuideChapterPublic(input)
    : db.setGuideChapterPublic(input);
}
