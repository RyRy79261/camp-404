"use server";

import { revalidatePath } from "next/cache";
import { slugify } from "@camp404/core";
import {
  GuideChapterRef,
  GuideSlug,
  NewGuideChapterInput,
  RESERVED_GUIDE_SLUGS,
  SaveGuideChapterInput,
  SetGuideChapterPublicInput,
} from "@camp404/types";
import { runAction, type ActionResult } from "@/lib/action-result";
import { captainActionGate } from "@/lib/captain-gate";
import {
  createGuideChapter,
  markGuideChapterReviewed,
  publishGuideChapter,
  saveGuideChapter,
  setGuideChapterPublic,
  unpublishGuideChapter,
} from "@/lib/guide";
import { GUIDE_PATH, guideChapterPath } from "@/lib/guide-copy";

// The Survival Guide's writes (#250). The rank gate lets captains and team
// leads ask; whether THIS writer may write THIS chapter (a captain, or a lead
// of the chapter's team) and whether a captain is marking it Public is decided
// inside each write's transaction, in @camp404/db/documents.

const NOT_A_WRITER = "Only captains and team leads write the Survival Guide.";

function firstIssue(error: { issues: readonly { message: string }[] }): string {
  return error.issues[0]?.message ?? "Check the chapter and try again.";
}

function revalidateChapter(slug: string) {
  revalidatePath(GUIDE_PATH);
  revalidatePath(guideChapterPath(slug));
}

/** The chapter's address, from its title. */
function slugFor(title: string): string {
  const slug = slugify(title);
  if (slug === "" || RESERVED_GUIDE_SLUGS.has(slug)) {
    return `${slug || "chapter"}-${Math.random().toString(36).slice(2, 7)}`;
  }
  return GuideSlug.safeParse(slug).success ? slug : `chapter-${Date.now()}`;
}

/** Start a chapter or a duty card, as a draft. */
export async function createGuideChapterAction(
  input: unknown,
): Promise<ActionResult<{ slug: string }>> {
  return runAction("createGuideChapterAction", async () => {
    const gate = await captainActionGate("team_lead", NOT_A_WRITER);
    if (!gate.ok) return gate;
    const parsed = NewGuideChapterInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const chapter = parsed.data;
    const slug = slugFor(chapter.title);
    const result = await createGuideChapter({
      actorId: gate.campUser.id,
      slug,
      ...chapter,
    });
    if (!result.ok) return result;
    revalidatePath(GUIDE_PATH);
    return { ok: true, data: { slug } };
  });
}

/** Save a chapter's draft. */
export async function saveGuideChapterAction(
  input: unknown,
): Promise<ActionResult<{ version: number }>> {
  return runAction("saveGuideChapterAction", async () => {
    const gate = await captainActionGate("team_lead", NOT_A_WRITER);
    if (!gate.ok) return gate;
    const parsed = SaveGuideChapterInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const { slug, expectedVersion, ...change } = parsed.data;
    const result = await saveGuideChapter({
      actorId: gate.campUser.id,
      slug,
      expectedVersion,
      change,
    });
    if (!result.ok) return result;
    revalidatePath(GUIDE_PATH);
    return { ok: true, data: { version: result.document.version } };
  });
}

/** Publish the draft the writer saw, for every member. */
export async function publishGuideChapterAction(
  input: unknown,
): Promise<ActionResult<{ version: number; created: boolean }>> {
  return runAction("publishGuideChapterAction", async () => {
    const gate = await captainActionGate("team_lead", NOT_A_WRITER);
    if (!gate.ok) return gate;
    const parsed = GuideChapterRef.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await publishGuideChapter({
      actorId: gate.campUser.id,
      ...parsed.data,
    });
    if (!result.ok) return result;
    revalidateChapter(parsed.data.slug);
    return {
      ok: true,
      data: { version: result.version, created: result.created },
    };
  });
}

/** Take a chapter off the guide; its versions stay. */
export async function unpublishGuideChapterAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("unpublishGuideChapterAction", async () => {
    const gate = await captainActionGate("team_lead", NOT_A_WRITER);
    if (!gate.ok) return gate;
    const parsed = GuideChapterRef.pick({ slug: true }).safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await unpublishGuideChapter({
      actorId: gate.campUser.id,
      slug: parsed.data.slug,
    });
    if (!result.ok) return result;
    revalidateChapter(parsed.data.slug);
    return { ok: true };
  });
}

/** Keep a published chapter for this year as it is. */
export async function markGuideChapterReviewedAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("markGuideChapterReviewedAction", async () => {
    const gate = await captainActionGate("team_lead", NOT_A_WRITER);
    if (!gate.ok) return gate;
    const parsed = GuideChapterRef.pick({ slug: true }).safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await markGuideChapterReviewed({
      actorId: gate.campUser.id,
      slug: parsed.data.slug,
    });
    if (!result.ok) return result;
    revalidateChapter(parsed.data.slug);
    return { ok: true };
  });
}

/** Mark a chapter Public or members only: a captain's call. */
export async function setGuideChapterPublicAction(
  input: unknown,
): Promise<ActionResult> {
  return runAction("setGuideChapterPublicAction", async () => {
    const gate = await captainActionGate(
      "captain",
      "Only captains can mark a chapter public.",
    );
    if (!gate.ok) return gate;
    const parsed = SetGuideChapterPublicInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
    const result = await setGuideChapterPublic({
      actorId: gate.campUser.id,
      ...parsed.data,
    });
    if (!result.ok) return result;
    revalidateChapter(parsed.data.slug);
    return { ok: true };
  });
}
