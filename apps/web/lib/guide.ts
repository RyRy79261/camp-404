import "server-only";

import { errorLogText } from "@camp404/core";
import { after } from "next/server";
import * as db from "@camp404/db/documents";
import type {
  GuideChapter,
  GuideChapterSummary,
  GuideChapterVersion,
  GuideDraft,
  GuideSectionState,
  GuideWriteResult,
  PublishedDutyCard,
} from "@camp404/db/documents";
import { guideTestStore } from "./test-store-guide";
import { twin } from "./twin";

// The Survival Guide's data (#250), from the database or, under E2E, the test
// store, picked once (twin). Who may write a chapter and what may be published
// live once in @camp404/core (guideChapterRefusal, chapterPublishProblem,
// sameChapterText); lib/__tests__/guide-agreement.test.ts holds the rest
// equal. The public site (apps/guide) reads the database only, through the
// members-only cut in @camp404/db/documents (toPublicChapter), never here.

export type {
  GuideChapter,
  GuideChapterSummary,
  GuideChapterVersion,
  GuideDraft,
  GuideSectionState,
  GuideWriteResult,
  PublishedDutyCard,
};

const guide = twin(db, guideTestStore, [
  "listPublishedChapters",
  "listPublishedDutyCards",
  "listPublishedDutyCardsInFull",
  "getPublishedChapter",
  "getChapterVersion",
  "listChapterVersions",
  "listGuideDrafts",
  "getGuideDraft",
  "listChapterReads",
  "recordChapterRead",
  "createGuideChapter",
  "saveGuideChapter",
  "publishGuideChapter",
  "unpublishGuideChapter",
  "markGuideChapterReviewed",
  "setGuideChapterMembersOnly",
  "listGuideSections",
  "setGuideSectionPublic",
]);

export const listPublishedChapters = guide.listPublishedChapters;

/** Every published duty card, by title (no card): the shift set-up's choices. */
export const listPublishedDutyCards = guide.listPublishedDutyCards;

/** Every published duty card with its card, for "Print all duty cards". */
export const listPublishedDutyCardsInFull = guide.listPublishedDutyCardsInFull;

export const getPublishedChapter = guide.getPublishedChapter;
export const getChapterVersion = guide.getChapterVersion;
export const listChapterVersions = guide.listChapterVersions;
export const listGuideDrafts = guide.listGuideDrafts;
export const getGuideDraft = guide.getGuideDraft;
export const listChapterReads = guide.listChapterReads;
export const recordChapterRead = guide.recordChapterRead;

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
      console.error(
        "guide read write failed",
        errorLogText(error, process.env),
      );
    }
  });
}

export const createGuideChapter = guide.createGuideChapter;
export const saveGuideChapter = guide.saveGuideChapter;
export const publishGuideChapter = guide.publishGuideChapter;
export const unpublishGuideChapter = guide.unpublishGuideChapter;
export const markGuideChapterReviewed = guide.markGuideChapterReviewed;
export const setGuideChapterMembersOnly = guide.setGuideChapterMembersOnly;

/** Every section of the guide and whether it is on the public site. */
export const listGuideSections = guide.listGuideSections;

export const setGuideSectionPublic = guide.setGuideSectionPublic;
