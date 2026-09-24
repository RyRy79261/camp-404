import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  campDayKey,
  campDayStart,
  canApproveRecipe,
  sameSections,
  sectionText,
  sourceFromText,
  sourceText,
} from "@camp404/core";
import {
  DEFAULT_PLATES,
  DraftReport,
  KitchenRecipe,
  LINK_ONLY_TEXT,
  PROOFREAD_ANSWER_MAX,
  PlateProofread,
  ProofreadExchange,
  RECIPE_TEXT_MAX,
  RecipeDraft,
  RecipeSourceSections,
  SOURCE_SECTIONS,
  SourceProofread,
  titleFromText,
  type PlateLine,
  type RecipeSource,
  type RecipeStatus,
} from "@camp404/types";
import { writeAuditEvent, type DbOrTx } from "./audit";
import { lockSenderReach } from "./broadcasts";
import { currentCycleNumber } from "./cycles";
import { createHttpDb, withTransaction, type Tx } from "./index";
import { readMealPlanPeaks } from "./meal-plan";
import { reachRank } from "./power";
import * as schema from "./schema";

// Recipes (#243, Kitchen 1): the data layer.
//
//  - Anyone approved suggests a recipe. The submitter edits it only when a
//    reviewer asked for changes, which makes it a suggestion again.
//  - A Kitchen lead or a captain approves, rejects or asks for changes,
//    retypes the text and accepts a proofread version (canApproveRecipe).
//  - A captain or a Kitchen lead sends recipes to Claude (the owner's
//    decision 2A; lockKitchenReviewer), with no daily limit (the owner's
//    call, 2026-09-24). The plates per meal come from the year's meal plan
//    (./meal-plan).
//  - A recipe's source (recipe_sources) is what a reviewer edits and Claude
//    reads: one Tiptap document per section, versioned. Every suggestion,
//    resubmission and retype writes a version, and "Send for
//    proofreading" saves one when the content changed, in the same
//    transaction as the run (sendSourceForProofreading).
//  - A `source` run records its stage on the run row as the worker moves
//    (sending, reading, checking, saving; setRunStage), which is all the
//    editor's loading panel shows. It either asks questions, which hand the
//    recipe back to where it stood with the questions kept on the run
//    (answerProofreadQuestions queues the next round, carrying the whole
//    question-and-answer exchange), or writes the recipe straight into the
//    book as a new version with its scaling notes, with no accept step
//    (completeSourceRun). The notes are shown to every reader of the book.
//  - The worker gets work ONLY through claimSourceRun and claimPlateRun,
//    which return a run a reviewer queued and nothing else. Older `recipe`
//    runs (a draft for a reviewer) are no longer written or claimed; their
//    rows stay readable, a waiting draft can still be accepted
//    (acceptProofread), and resetStaleRuns still hands one back.
//  - There is no cron: a run starts from the click and runs in after(), and
//    a run stuck over ten minutes is reset when a Kitchen page loads
//    (resetStaleRuns).
//  - Another plate count is proofread by Claude once per version and kept
//    (queuePlateProofread): a count with a result is not run again unless a
//    captain or a Kitchen lead asks for a re-run.
//  - A version holds the whole recipe as one body in Noble Notations' shape
//    (KitchenRecipe), checked by Zod on every write, and its own plate count
//    as a recipe_plate_counts row written in the same transaction.
//
// Every write re-reads the actor inside its own transaction (lockSenderReach,
// the announcements' rule), never trusting a rank or team list from the
// caller, writes its audit row in the SAME transaction, and is compare-and-set:
// the WHERE names the status it expects and `.returning()` decides. A refusal
// throws inside the transaction, so nothing written before it survives.
//
// Nothing here fetches a recipe's link, and nothing here sends anything
// anywhere: approving is only a status.

type Team = (typeof schema.teamEnum.enumValues)[number];

export type { RecipeStatus };

export type RecipeWriteResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** This year's largest plates at each meal, as the prompts read them. */
export interface KitchenForPrompt {
  kitchenPlatesBreakfast: number | null;
  kitchenPlatesLunch: number | null;
  kitchenPlatesDinner: number | null;
}

/** A recipe from before #243 has no title. */
export const UNTITLED_RECIPE = "Untitled recipe";

export const RECIPE_GONE = "That recipe isn't there any more. Reload the page.";
export const RECIPE_DECIDED =
  "Someone else already decided this recipe. Reload the page.";
export const RECIPE_CHANGED =
  "This recipe changed since you opened it. Reload the page.";
export const NOT_A_KITCHEN_REVIEWER =
  "Only a Kitchen lead or a captain can do this.";
export const NOT_AN_APPROVED_MEMBER = "Only approved camp members can do this.";
export const NOT_YOUR_SUGGESTION =
  "Only the member who suggested this recipe can change it.";
export const REJECT_REASON_NEEDED = "Say why it is rejected.";
export const CHANGES_NOTE_NEEDED = "Say what should change.";
export const TITLE_NEEDED = "Give the recipe a name.";
export const TEXT_NEEDED = "Paste the recipe text.";
export const TEXT_TOO_LONG = `Keep the recipe under ${RECIPE_TEXT_MAX} characters.`;
export const ONLY_A_REVIEWER_SENDS =
  "Only a Kitchen lead or a captain can send a recipe to Claude.";
export const SOURCE_CHANGED =
  "Someone else changed this recipe's source. Reload the page.";
export const SOURCE_INVALID =
  "This recipe's text has something the editor cannot keep. Reload the page and try again.";
export const SERVES_OUT_OF_RANGE =
  "Say how many it serves as a whole number from 1 to 500, or leave it blank.";
export const ANSWER_NEEDED = "Write your answer.";
export const ANSWER_TOO_LONG = `Keep the answer under ${PROOFREAD_ANSWER_MAX} characters.`;
export const NO_TEXT_TO_SEND =
  "Paste the recipe's text first. Claude does not open links.";
export const NO_AI_CONSENT =
  "The member who wrote this hasn't agreed to send it to Claude. A Kitchen lead or captain can retype it.";
export const NOT_READY_TO_PROOFREAD =
  "This recipe can't be proofread now. Approve it first, or wait for the run in progress.";
export const NO_ACCEPTED_VERSION = "This recipe has no accepted version yet.";
export const VERSION_CHANGED =
  "Someone else saved a newer version of this recipe. Reload the page.";
export const VERSION_INVALID =
  "This version isn't complete. Check each ingredient and step.";
export const LESSON_NEEDED = "Write what the kitchen learned.";
export const LESSON_VERSION_GONE =
  "That version of the recipe isn't there any more. Reload the page.";
export const STALE_RUN_ERROR =
  "The run stopped before it finished. Nothing was retried.";
export const NEVER_STARTED_ERROR =
  "The run never started. Nothing was sent to Claude.";
/** An older run's answer that no longer reads as a recipe. */
export const DRAFT_UNREADABLE =
  "This run's answer is in an older shape and cannot be accepted.";
/** The sender lost the Kitchen reviewer's place while Claude worked. */
export const SENDER_NOT_A_REVIEWER =
  "The person who sent this is no longer a Kitchen lead or a captain, so nothing was saved.";

/**
 * A run still `running` this long after it started has stopped, and one still
 * `queued` this long after it was asked for never started. A Claude call is
 * cut off at four minutes, and after() lives at most five.
 */
export const STALE_RUN_AFTER_MS = 10 * 60_000;

const LESSON_MAX = 2_000;
const TITLE_MAX = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Pure rules, shared with the E2E store ----------------------------------

/** A refusal for one recipe of a batch names the recipe. */
export function forRecipe(title: string | null, sentence: string): string {
  return `${title ?? UNTITLED_RECIPE}: ${sentence}`;
}

/**
 * Why a recipe's working text may not be sent to Claude, or null when it may.
 * The member who wrote the text must have ticked "a captain or a Kitchen
 * lead may send this recipe's text to Claude" on the suggestion
 * (`aiConsentAt`). That tick is the only consent that counts for their
 * words: the account-wide `users.ai_data_consent` is about ID documents shown
 * to MCP sessions, and a member who left the box unticked must not have their
 * text sent because of it. A Kitchen lead or a captain who retypes the text becomes its author, and
 * their act is the agreement. A text with no known author (a row from before
 * #243) is refused until someone retypes it.
 */
export function textBlockedReason(recipe: {
  rawText: string | null;
  textAuthorId: string | null;
  submitterId: string | null;
  aiConsentAt: Date | null;
}): string | null {
  if (!recipe.rawText?.trim()) return NO_TEXT_TO_SEND;
  // Nobody opens links, so a text that is only a link has no recipe in it.
  if (LINK_ONLY_TEXT.test(recipe.rawText)) return NO_TEXT_TO_SEND;
  if (recipe.textAuthorId === null) return NO_AI_CONSENT;
  if (
    recipe.textAuthorId === recipe.submitterId &&
    recipe.aiConsentAt === null
  ) {
    return NO_AI_CONSENT;
  }
  return null;
}

/**
 * Where a recipe goes when its run fails, stops or loses its clearance: back
 * to where it stood when a reviewer queued the run. A re-run of a proofread
 * recipe hands back the earlier result it was waiting on (when that run
 * succeeded), so a paid answer is not lost; a recipe with an accepted version
 * stays in the book as `accepted`; anything else is `approved`. `runId` is the
 * run the recipe should point at afterwards.
 */
export function handBackTo(input: {
  failedRunId: string;
  previousStatus: RecipeStatus | null;
  previousRunId: string | null;
  previousRunSucceeded: boolean;
  acceptedVersionId: string | null;
}): { status: RecipeStatus; runId: string } {
  if (
    input.previousStatus === "proofread" &&
    input.previousRunId !== null &&
    input.previousRunSucceeded
  ) {
    return { status: "proofread", runId: input.previousRunId };
  }
  return {
    status: input.acceptedVersionId !== null ? "accepted" : "approved",
    runId: input.failedRunId,
  };
}

/** The instant this camp month began, for the monthly token total. */
export function campMonthStartOf(now: Date): Date {
  return campDayStart(`${campDayKey(now).slice(0, 7)}-01`);
}

/**
 * Why a recipe cannot be saved as a version: VERSION_INVALID with the first
 * problem Zod found, and where it is when the sentence does not say.
 */
export function versionInvalid(error: {
  issues: readonly {
    code: string;
    message: string;
    path: readonly PropertyKey[];
  }[];
}): string {
  const issue = error.issues[0];
  if (!issue) return VERSION_INVALID;
  const where =
    issue.code === "custom" || issue.path.length === 0
      ? ""
      : ` (at ${issue.path.map(String).join(".")})`;
  return `${VERSION_INVALID} ${issue.message}${where}`;
}

/** A recipe's own plate count: its lines as written, with no notes. */
export function baseLines(recipe: KitchenRecipe): PlateLine[] {
  return recipe.ingredients.map((line) => ({
    name: line.name,
    quantity: line.quantity,
    quantityMax: line.quantityMax,
    unit: line.unit,
    note: null,
  }));
}

/** A run's stored answer as a draft, or null when it is not one. */
export function readDraft(result: unknown): RecipeDraft | null {
  if (result === null || result === undefined) return null;
  const parsed = RecipeDraft.safeParse(result);
  return parsed.success ? parsed.data : null;
}

/** A version's stored report, or null when it is none (or an older shape). */
export function readReport(report: unknown): DraftReport | null {
  if (report === null || report === undefined) return null;
  const parsed = DraftReport.safeParse(report);
  return parsed.success ? parsed.data : null;
}

/** The stages a running `source` run moves through, in order. */
export const RUN_STAGES = ["sending", "reading", "checking", "saving"] as const;
export type RunStage = (typeof RUN_STAGES)[number];

function isRunStage(stage: unknown): stage is RunStage {
  return (RUN_STAGES as readonly unknown[]).includes(stage);
}

/**
 * Why a source may not be sent to Claude, or null when it may: the rule of
 * textBlockedReason, read on the source's text and its author. A text that is
 * only a link, under the section headers, is no recipe either.
 */
export function sourceBlockedReason(
  source: { sections: RecipeSourceSections; authorId: string | null } | null,
  recipe: { submitterId: string | null; aiConsentAt: Date | null },
): string | null {
  if (!source) return NO_TEXT_TO_SEND;
  const words = SOURCE_SECTIONS.map((key) => sectionText(source.sections[key]))
    .filter(Boolean)
    .join("\n");
  if (LINK_ONLY_TEXT.test(words)) return NO_TEXT_TO_SEND;
  return textBlockedReason({
    rawText: sourceText(source.sections),
    textAuthorId: source.authorId,
    submitterId: recipe.submitterId,
    aiConsentAt: recipe.aiConsentAt,
  });
}

/** A run's stored answer as Claude's questions, or null when it asked none. */
export function readQuestions(result: unknown): string[] | null {
  if (result === null || result === undefined) return null;
  const parsed = SourceProofread.safeParse(result);
  return parsed.success && parsed.data.needsInfo ? parsed.data.questions : null;
}

/** A run's stored exchange; an unreadable one reads as none. */
function readExchange(exchange: unknown): ProofreadExchange {
  const parsed = ProofreadExchange.safeParse(exchange ?? []);
  return parsed.success ? parsed.data : [];
}

// --- Transactions ----------------------------------------------------------

/** A refusal thrown inside a transaction, so it rolls back everything. */
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
): Promise<RecipeWriteResult<T>> {
  try {
    const value = await withTransaction(fn);
    return { ok: true, ...value };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, error: error.sentence };
    throw error;
  }
}

/**
 * Whether the actor may review recipes, read and locked inside the write's
 * own transaction: a captain, or a lead of Kitchen this year. The lock
 * (lockSenderReach) means a demotion that committed first is seen, and one
 * that comes later waits for this transaction.
 */
export async function lockKitchenReviewer(
  tx: DbOrTx,
  actorId: string,
): Promise<boolean> {
  if (!UUID.test(actorId)) return false;
  const reach = await lockSenderReach(tx, actorId);
  return canApproveRecipe(reachRank(reach), (reach ?? []) as readonly Team[]);
}

async function assertKitchenReviewer(tx: Tx, actorId: string): Promise<void> {
  if (!(await lockKitchenReviewer(tx, actorId))) refuse(NOT_A_KITCHEN_REVIEWER);
}

/** An approved, current member, locked so an approval change waits. */
async function assertApprovedMember(tx: Tx, userId: string): Promise<void> {
  if (!UUID.test(userId)) refuse(NOT_AN_APPROVED_MEMBER);
  const [row] = await tx
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.id, userId),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
        eq(schema.users.approvalStatus, "approved"),
      ),
    )
    .for("share");
  if (!row) refuse(NOT_AN_APPROVED_MEMBER);
}

/** The recipe row, locked for the change, or a refusal when it is gone. */
async function lockRecipe(tx: Tx, recipeId: string) {
  if (!UUID.test(recipeId)) refuse(RECIPE_GONE);
  const [row] = await tx
    .select()
    .from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId))
    .for("update");
  return row ?? refuse(RECIPE_GONE);
}

async function recipeExists(tx: Tx, recipeId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: schema.recipes.id })
    .from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId));
  return Boolean(row);
}

function cleanText(text: string | null | undefined): string | null {
  const trimmed = text?.trim() ?? "";
  if (trimmed.length > RECIPE_TEXT_MAX) refuse(TEXT_TOO_LONG);
  return trimmed === "" ? null : trimmed;
}

/** A suggestion's name: the one typed, else the text's first line. */
export function suggestionTitle(title: string | null, text: string): string {
  const typed = title?.trim() ?? "";
  if (typed) return typed.slice(0, TITLE_MAX);
  return titleFromText(text) || UNTITLED_RECIPE;
}

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === "") refuse(TITLE_NEEDED);
  return trimmed.slice(0, TITLE_MAX);
}

// --- Sources ----------------------------------------------------------------

/** One saved version of a recipe's source. */
export interface RecipeSourceVersion {
  id: string;
  version: number;
  /** How many the source says it serves; null when it does not say. */
  serves: number | null;
  sections: RecipeSourceSections;
  /** Whose words these are. */
  authorId: string | null;
}

const SOURCE_COLUMNS = {
  id: schema.recipeSources.id,
  version: schema.recipeSources.version,
  serves: schema.recipeSources.serves,
  ingredients: schema.recipeSources.ingredients,
  equipment: schema.recipeSources.equipment,
  steps: schema.recipeSources.steps,
  notes: schema.recipeSources.notes,
  authorId: schema.recipeSources.authorId,
};

function sourceOf(row: {
  id: string;
  version: number;
  serves: number | null;
  ingredients: RecipeSourceSections["ingredients"];
  equipment: RecipeSourceSections["equipment"];
  steps: RecipeSourceSections["steps"];
  notes: RecipeSourceSections["notes"];
  authorId: string | null;
}): RecipeSourceVersion {
  const { ingredients, equipment, steps, notes, ...rest } = row;
  return { ...rest, sections: { ingredients, equipment, steps, notes } };
}

/** A recipe's newest source version, or null when it has none. */
async function latestSource(
  db: DbOrTx,
  recipeId: string,
): Promise<RecipeSourceVersion | null> {
  const [row] = await db
    .select(SOURCE_COLUMNS)
    .from(schema.recipeSources)
    .where(eq(schema.recipeSources.recipeId, recipeId))
    .orderBy(desc(schema.recipeSources.version))
    .limit(1);
  return row ? sourceOf(row) : null;
}

/** The sections, checked as the editor's schema allows, or a refusal. */
function checkSections(sections: unknown): RecipeSourceSections {
  const parsed = RecipeSourceSections.safeParse(sections);
  if (parsed.success) return parsed.data;
  const custom = parsed.error.issues.find((issue) => issue.code === "custom");
  return refuse(custom?.message ?? SOURCE_INVALID);
}

function servesOrRefuse(serves: number | null): number | null {
  if (serves === null) return null;
  return Number.isInteger(serves) && serves >= 1 && serves <= 500
    ? serves
    : refuse(SERVES_OUT_OF_RANGE);
}

/**
 * Write the next version of a recipe's source, in the caller's transaction.
 * The caller holds the recipe's lock (or just created the recipe), so two
 * versions cannot take the same number; the unique index would refuse it.
 */
async function insertSource(
  tx: Tx,
  input: {
    recipeId: string;
    serves: number | null;
    sections: RecipeSourceSections;
    authorId: string | null;
    now: Date;
  },
): Promise<{ id: string; version: number }> {
  const sections = checkSections(input.sections);
  const [top] = await tx
    .select({ max: sql<number | null>`max(${schema.recipeSources.version})` })
    .from(schema.recipeSources)
    .where(eq(schema.recipeSources.recipeId, input.recipeId));
  const version = (top?.max ?? 0) + 1;
  const [row] = await tx
    .insert(schema.recipeSources)
    .values({
      recipeId: input.recipeId,
      version,
      serves: servesOrRefuse(input.serves),
      ...sections,
      authorId: input.authorId,
      createdAt: input.now,
    })
    .returning({ id: schema.recipeSources.id });
  return { id: row!.id, version };
}

/** One source version in a recipe's history. */
export interface RecipeSourceHistoryEntry extends RecipeSourceVersion {
  authorName: string | null;
  createdAt: Date;
}

/**
 * Every version of a recipe's source, newest first, for the recipe page's
 * History tab. The member's words: the caller shows them only to the
 * submitter and the Kitchen's reviewers.
 */
export async function listRecipeSources(
  recipeId: string,
): Promise<RecipeSourceHistoryEntry[]> {
  if (!UUID.test(recipeId)) return [];
  const author = alias(schema.users, "source_author");
  const rows = await createHttpDb()
    .select({
      ...SOURCE_COLUMNS,
      authorName: author.displayName,
      createdAt: schema.recipeSources.createdAt,
    })
    .from(schema.recipeSources)
    .leftJoin(author, eq(author.id, schema.recipeSources.authorId))
    .where(eq(schema.recipeSources.recipeId, recipeId))
    .orderBy(desc(schema.recipeSources.version));
  return rows.map(({ authorName, createdAt, ...row }) => ({
    ...sourceOf(row),
    authorName,
    createdAt,
  }));
}

/** A recipe's newest source, for the editor. Null when it has none. */
export async function getRecipeSource(
  recipeId: string,
): Promise<RecipeSourceVersion | null> {
  if (!UUID.test(recipeId)) return null;
  return latestSource(createHttpDb(), recipeId);
}

// --- Suggestions and decisions ----------------------------------------------

/**
 * A member suggests a recipe. It lands as `suggested`; its text is the
 * member's own words. A dictated one keeps only its transcript, never audio.
 * Not audited: it is the member's own write.
 */
export async function suggestRecipe(input: {
  submitterId: string;
  /** Null or blank takes the text's first line; Claude's title replaces it. */
  title: string | null;
  source: RecipeSource;
  sourceUrl: string | null;
  text: string | null;
  suitabilityNote: string | null;
  aiConsent: boolean;
  now: Date;
}): Promise<RecipeWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertApprovedMember(tx, input.submitterId);
    const text = cleanText(input.text);
    if (!text) refuse(TEXT_NEEDED);
    const [row] = await tx
      .insert(schema.recipes)
      .values({
        submitterId: input.submitterId,
        source: input.source,
        status: "suggested",
        title: suggestionTitle(input.title, text),
        sourceUrl: input.sourceUrl?.trim() || null,
        rawText: text,
        transcript: input.source === "voice" ? text : null,
        suitabilityNote: input.suitabilityNote?.trim() || null,
        textAuthorId: input.submitterId,
        aiConsentAt: input.aiConsent ? input.now : null,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({ id: schema.recipes.id });
    // Version 1 of the source: the member's own words, split into sections
    // where the text names them.
    await insertSource(tx, {
      recipeId: row!.id,
      serves: null,
      sections: sourceFromText(text),
      authorId: input.submitterId,
      now: input.now,
    });
    return { id: row!.id };
  });
}

/**
 * The submitter's edit after a reviewer asked for changes: the recipe is a
 * suggestion again. Compare-and-set on `changes_requested`. The text is the
 * member's own words again, so the consent is theirs again too: their fresh
 * tick, or none. A reviewer's retype stamped `aiConsentAt` for the reviewer's
 * words; keeping that stamp would send the member's new words to Claude
 * without their agreement.
 */
export async function resubmitRecipe(input: {
  recipeId: string;
  actorId: string;
  title: string;
  text: string | null;
  suitabilityNote: string | null;
  aiConsent: boolean;
  now?: Date;
}): Promise<RecipeWriteResult> {
  const now = input.now ?? new Date();
  return write(async (tx) => {
    // A member put back into review, or erased, since the page loaded may
    // not send a recipe back into the queue.
    await assertApprovedMember(tx, input.actorId);
    if (!UUID.test(input.recipeId)) refuse(RECIPE_GONE);
    const [existing] = await tx
      .select({
        submitterId: schema.recipes.submitterId,
        source: schema.recipes.source,
      })
      .from(schema.recipes)
      .where(eq(schema.recipes.id, input.recipeId));
    if (!existing) refuse(RECIPE_GONE);
    if (existing.submitterId !== input.actorId) refuse(NOT_YOUR_SUGGESTION);
    const text = cleanText(input.text);
    if (existing.source !== "url" && !text) refuse(TEXT_NEEDED);
    const changed = await tx
      .update(schema.recipes)
      .set({
        status: "suggested",
        title: cleanTitle(input.title),
        rawText: text,
        transcript: existing.source === "voice" ? text : undefined,
        textAuthorId: input.actorId,
        aiConsentAt: input.aiConsent ? now : null,
        suitabilityNote: input.suitabilityNote?.trim() || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.recipes.id, input.recipeId),
          eq(schema.recipes.submitterId, input.actorId),
          eq(schema.recipes.status, "changes_requested"),
        ),
      )
      .returning({ id: schema.recipes.id });
    if (changed.length === 0) refuse(RECIPE_CHANGED);
    // The member's words are the source again, and theirs: the consent that
    // governs them is the fresh tick above.
    if (text) {
      await insertSource(tx, {
        recipeId: input.recipeId,
        serves: null,
        sections: sourceFromText(text),
        authorId: input.actorId,
        now,
      });
    }
    return {};
  });
}

export type RecipeDecision =
  | { decision: "approve" }
  | { decision: "reject"; reason: string }
  | { decision: "request_changes"; note: string };

/**
 * A Kitchen lead's or a captain's decision on a suggestion. Compare-and-set on
 * `suggested`: of two reviewers racing, the second is told. Approving sends
 * nothing anywhere.
 */
export async function decideRecipe(
  input: { recipeId: string; actorId: string } & RecipeDecision,
): Promise<RecipeWriteResult> {
  return write(async (tx) => {
    await assertKitchenReviewer(tx, input.actorId);
    if (!UUID.test(input.recipeId)) refuse(RECIPE_GONE);
    const now = new Date();
    let set: Partial<typeof schema.recipes.$inferInsert>;
    let detail: Record<string, unknown> = {};
    if (input.decision === "approve") {
      set = { status: "approved", approvedBy: input.actorId, approvedAt: now };
    } else if (input.decision === "reject") {
      const reason = input.reason.trim();
      if (!reason) refuse(REJECT_REASON_NEEDED);
      set = {
        status: "rejected",
        rejectedBy: input.actorId,
        rejectedAt: now,
        rejectionReason: reason,
      };
      detail = { reason };
    } else {
      const note = input.note.trim();
      if (!note) refuse(CHANGES_NOTE_NEEDED);
      set = { status: "changes_requested", changesNote: note };
      detail = { note };
    }
    const [decided] = await tx
      .update(schema.recipes)
      .set({ ...set, updatedAt: now })
      .where(
        and(
          eq(schema.recipes.id, input.recipeId),
          eq(schema.recipes.status, "suggested"),
        ),
      )
      .returning({ title: schema.recipes.title });
    if (!decided) {
      refuse(
        (await recipeExists(tx, input.recipeId)) ? RECIPE_DECIDED : RECIPE_GONE,
      );
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action:
        input.decision === "approve"
          ? "recipe.approved"
          : input.decision === "reject"
            ? "recipe.rejected"
            : "recipe.changes_requested",
      target: input.recipeId,
      metadata: { title: decided.title ?? UNTITLED_RECIPE, ...detail },
    });
    return {};
  });
}

const RETYPABLE: RecipeStatus[] = ["suggested", "approved", "proofread"];

/** The statuses a proofreading run may be queued from. */
const QUEUEABLE: RecipeStatus[] = ["approved", "proofread", "accepted"];

/**
 * A reviewer retypes the recipe's working text, and becomes its author. This
 * is the way past a missing consent, and the way to paste in the text of a
 * suggestion that came as a link.
 */
export async function retypeRecipeText(input: {
  recipeId: string;
  actorId: string;
  text: string;
}): Promise<RecipeWriteResult> {
  return write(async (tx) => {
    await assertKitchenReviewer(tx, input.actorId);
    if (!UUID.test(input.recipeId)) refuse(RECIPE_GONE);
    const text = cleanText(input.text);
    if (!text) refuse(TEXT_NEEDED);
    const now = new Date();
    const [changed] = await tx
      .update(schema.recipes)
      .set({
        rawText: text,
        textAuthorId: input.actorId,
        // The reviewer's retyping is their agreement. Without this, a lead
        // who suggested a recipe unticked and then retyped it stayed blocked:
        // they are both its submitter and its author.
        aiConsentAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.recipes.id, input.recipeId),
          inArray(schema.recipes.status, RETYPABLE),
        ),
      )
      .returning({ title: schema.recipes.title });
    if (!changed) {
      refuse(
        (await recipeExists(tx, input.recipeId)) ? RECIPE_CHANGED : RECIPE_GONE,
      );
    }
    // The retyped text is the next source version, and the reviewer's. The
    // Serves a reviewer set in the source editor carries over: a retype
    // changes the words, not how many the source feeds.
    await insertSource(tx, {
      recipeId: input.recipeId,
      serves: (await latestSource(tx, input.recipeId))?.serves ?? null,
      sections: sourceFromText(text),
      authorId: input.actorId,
      now,
    });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "recipe.text_retyped",
      target: input.recipeId,
      metadata: { title: changed.title ?? UNTITLED_RECIPE },
    });
    return {};
  });
}

export const RERUN_NOTE_NEEDED = "Say what Claude should do differently.";
export const RERUN_NOTE_MAX = 1_000;

/**
 * A Kitchen lead (or a captain) asks a captain to run proofreading again,
 * saying what should change. It costs nothing and sends nothing: the note
 * waits on the recipe, in the captain's Ready to proofread list, until a
 * captain queues the next run. Audited, compare-and-set on the statuses a run
 * can be queued from.
 */
export async function requestRerun(input: {
  recipeId: string;
  actorId: string;
  note: string;
  now?: Date;
}): Promise<RecipeWriteResult> {
  const now = input.now ?? new Date();
  return write(async (tx) => {
    await assertKitchenReviewer(tx, input.actorId);
    if (!UUID.test(input.recipeId)) refuse(RECIPE_GONE);
    const note = input.note.trim();
    if (!note) refuse(RERUN_NOTE_NEEDED);
    if (note.length > RERUN_NOTE_MAX) {
      refuse(`Keep the note under ${RERUN_NOTE_MAX} characters.`);
    }
    const [asked] = await tx
      .update(schema.recipes)
      .set({
        rerunRequest: note,
        rerunRequestedBy: input.actorId,
        rerunRequestedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.recipes.id, input.recipeId),
          inArray(schema.recipes.status, QUEUEABLE),
        ),
      )
      .returning({ title: schema.recipes.title });
    if (!asked) {
      refuse(
        (await recipeExists(tx, input.recipeId)) ? RECIPE_CHANGED : RECIPE_GONE,
      );
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "recipe.rerun_requested",
      target: input.recipeId,
      metadata: { title: asked.title ?? UNTITLED_RECIPE, note },
    });
    return {};
  });
}

// --- Proofreading ----------------------------------------------------------

export const PLATES_OUT_OF_RANGE =
  "Give a whole number of plates from 1 to 500.";

function platesOrRefuse(plates: number): number {
  return Number.isInteger(plates) && plates >= 1 && plates <= 500
    ? plates
    : refuse(PLATES_OUT_OF_RANGE);
}

/**
 * A reviewer (a captain or a Kitchen lead) sends a batch of recipes to Claude.
 * In ONE transaction: the reviewer check, and for each recipe
 * its newest source and the consent check on it, the move to `queued` and a
 * `source` run row. Any refusal rolls the whole batch back.
 */
export async function queueProofread(input: {
  recipeIds: readonly string[];
  actorId: string;
  note: string | null;
  /** The plates Claude writes each recipe for. */
  plates: number;
  now: Date;
  promptVersion: string;
  /** Recorded instead when the recipe already has an accepted version. */
  revisionPromptVersion?: string;
  model: string;
}): Promise<RecipeWriteResult<{ runIds: string[] }>> {
  return write(async (tx) => {
    if (!(await lockKitchenReviewer(tx, input.actorId))) {
      refuse(ONLY_A_REVIEWER_SENDS);
    }
    const ids = [...new Set(input.recipeIds)];
    if (ids.length === 0) refuse(NOT_READY_TO_PROOFREAD);
    const plates = platesOrRefuse(input.plates);

    const note = input.note?.trim() || null;
    const runIds: string[] = [];
    for (const recipeId of ids) {
      const recipe = await lockRecipe(tx, recipeId);
      if (!QUEUEABLE.includes(recipe.status)) {
        refuse(forRecipe(recipe.title, NOT_READY_TO_PROOFREAD));
      }
      const source = await latestSource(tx, recipeId);
      if (!source) refuse(forRecipe(recipe.title, NO_TEXT_TO_SEND));
      const blocked = sourceBlockedReason(source, recipe);
      if (blocked) refuse(forRecipe(recipe.title, blocked));

      const runId = await insertSourceRun(tx, {
        recipe,
        sourceId: source.id,
        actorId: input.actorId,
        now: input.now,
        note,
        plates,
        exchange: [],
        previousRunId: recipe.latestRunId,
        promptVersion: sourcePromptVersion(recipe.acceptedVersionId, input),
        model: input.model,
      });
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "recipe.proofread_queued",
        target: recipeId,
        metadata: {
          title: recipe.title ?? UNTITLED_RECIPE,
          runId,
          plates,
          sourceVersion: source.version,
          promptVersion: sourcePromptVersion(recipe.acceptedVersionId, input),
          model: input.model,
        },
      });
      runIds.push(runId);
    }
    return { runIds };
  });
}

/**
 * The prompt a `source` run is recorded under. A recipe that already has an
 * accepted version is revised from it (the revision prompt, which carries
 * that version and the questions and answers that settled it); any other is
 * written from its source alone.
 */
export function sourcePromptVersion(
  acceptedVersionId: string | null,
  input: { promptVersion: string; revisionPromptVersion?: string },
): string {
  return acceptedVersionId !== null && input.revisionPromptVersion
    ? input.revisionPromptVersion
    : input.promptVersion;
}

/**
 * Queue a `source` run and move its locked recipe to `queued`,
 * compare-and-set on the statuses a run may be queued from. The caller has
 * made every check.
 */
async function insertSourceRun(
  tx: Tx,
  input: {
    recipe: { id: string; title: string | null; status: RecipeStatus };
    sourceId: string;
    actorId: string;
    now: Date;
    note: string | null;
    plates: number;
    exchange: ProofreadExchange;
    previousRunId: string | null;
    promptVersion: string;
    model: string;
  },
): Promise<string> {
  const [run] = await tx
    .insert(schema.recipeProofreadRuns)
    .values({
      recipeId: input.recipe.id,
      requestedBy: input.actorId,
      requestedAt: input.now,
      note: input.note,
      promptVersion: input.promptVersion,
      model: input.model,
      outcome: "queued",
      kind: "source",
      plates: input.plates,
      sourceId: input.sourceId,
      stage: null,
      exchange: input.exchange,
      previousStatus: input.recipe.status,
      previousRunId: input.previousRunId,
    })
    .returning({ id: schema.recipeProofreadRuns.id });
  const queued = await tx
    .update(schema.recipes)
    .set({
      status: "queued",
      queuedBy: input.actorId,
      queuedAt: input.now,
      lastError: null,
      latestRunId: run!.id,
      // The send answers a lead's request to run it again.
      rerunRequest: null,
      rerunRequestedBy: null,
      rerunRequestedAt: null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.recipes.id, input.recipe.id),
        inArray(schema.recipes.status, QUEUEABLE),
      ),
    )
    .returning({ id: schema.recipes.id });
  if (queued.length === 0) {
    refuse(forRecipe(input.recipe.title, RECIPE_CHANGED));
  }
  return run!.id;
}

/**
 * "Send for proofreading" from the source editor. In ONE transaction:
 *  1. the reviewer check, the plates, and the recipe lock on a status a run
 *     may be queued from;
 *  2. the editor must have opened the newest source (`basedOnSourceId`);
 *  3. a source that differs from it is saved as the next version (no longer
 *     than pasted text may be). When the words changed, the reviewer becomes
 *     the text's author (as a retype does); a serves-only change keeps the
 *     author, and an unchanged send saves nothing, so a member's words they
 *     did not agree to send stay refused;
 *  4. the consent check on the source that will be sent;
 *  5. the `source` run and the move to `queued`, audited.
 */
export async function sendSourceForProofreading(input: {
  recipeId: string;
  actorId: string;
  basedOnSourceId: string | null;
  serves: number | null;
  sections: RecipeSourceSections;
  plates: number;
  now: Date;
  promptVersion: string;
  /** Recorded instead when the recipe already has an accepted version. */
  revisionPromptVersion?: string;
  model: string;
}): Promise<RecipeWriteResult<{ runId: string; sourceId: string }>> {
  return write(async (tx) => {
    if (!(await lockKitchenReviewer(tx, input.actorId))) {
      refuse(ONLY_A_REVIEWER_SENDS);
    }
    const plates = platesOrRefuse(input.plates);
    const serves = servesOrRefuse(input.serves);
    const sections = checkSections(input.sections);
    // The same ceiling as pasted text: it is also the cost guard on what
    // reaches Claude, and the working text below must fit a retype.
    const text = sourceText(sections);
    if (text.length > RECIPE_TEXT_MAX) refuse(TEXT_TOO_LONG);

    const recipe = await lockRecipe(tx, input.recipeId);
    if (!QUEUEABLE.includes(recipe.status)) refuse(NOT_READY_TO_PROOFREAD);

    const latest = await latestSource(tx, input.recipeId);
    if ((latest?.id ?? null) !== input.basedOnSourceId) refuse(SOURCE_CHANGED);

    let source: RecipeSourceVersion | null = latest;
    let aiConsentAt = recipe.aiConsentAt;
    const wordsChanged = !latest || !sameSections(latest.sections, sections);
    if (wordsChanged || latest.serves !== serves) {
      // Only a change to the words makes the reviewer their author. A
      // serves-only change keeps the author (and so the member's tick, or
      // its absence): typing a number must not clear a member's unticked
      // words for Claude.
      const authorId = wordsChanged ? input.actorId : latest.authorId;
      const saved = await insertSource(tx, {
        recipeId: input.recipeId,
        serves,
        sections,
        authorId,
        now: input.now,
      });
      source = { ...saved, serves, sections, authorId };
      if (wordsChanged) {
        // The reviewer's change is their agreement, as a retype is; the
        // working text follows the source so every older reader sees the
        // same words.
        aiConsentAt = input.now;
        await tx
          .update(schema.recipes)
          .set({
            rawText: text || null,
            textAuthorId: input.actorId,
            aiConsentAt,
            updatedAt: input.now,
          })
          .where(eq(schema.recipes.id, input.recipeId));
      }
      await writeAuditEvent(tx, {
        actorId: input.actorId,
        action: "recipe.source_saved",
        target: input.recipeId,
        metadata: {
          title: recipe.title ?? UNTITLED_RECIPE,
          version: saved.version,
        },
      });
    }

    const blocked = sourceBlockedReason(source, {
      submitterId: recipe.submitterId,
      aiConsentAt,
    });
    if (blocked) refuse(blocked);

    const runId = await insertSourceRun(tx, {
      recipe,
      sourceId: source!.id,
      actorId: input.actorId,
      now: input.now,
      note: null,
      plates,
      exchange: [],
      previousRunId: recipe.latestRunId,
      promptVersion: sourcePromptVersion(recipe.acceptedVersionId, input),
      model: input.model,
    });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "recipe.proofread_queued",
      target: input.recipeId,
      metadata: {
        title: recipe.title ?? UNTITLED_RECIPE,
        runId,
        plates,
        sourceVersion: source!.version,
        promptVersion: sourcePromptVersion(recipe.acceptedVersionId, input),
        model: input.model,
      },
    });
    return { runId, sourceId: source!.id };
  });
}

/**
 * A reviewer answers the questions Claude asked, which queues the next round:
 * a `source` run on the same source and plates that carries the whole
 * exchange so far. The same transaction shape as a send (the reviewer
 * check, the recipe lock), then
 * compare-and-set: the recipe still points at the question run, and that run
 * succeeded with questions. A second answer to the same run is refused.
 */
export async function answerProofreadQuestions(input: {
  recipeId: string;
  runId: string;
  actorId: string;
  answer: string;
  now: Date;
  promptVersion: string;
  /** Recorded instead when the recipe already has an accepted version. */
  revisionPromptVersion?: string;
  model: string;
}): Promise<RecipeWriteResult<{ runId: string }>> {
  return write(async (tx) => {
    if (!(await lockKitchenReviewer(tx, input.actorId))) {
      refuse(ONLY_A_REVIEWER_SENDS);
    }
    const answer = input.answer.trim();
    if (!answer) refuse(ANSWER_NEEDED);
    if (answer.length > PROOFREAD_ANSWER_MAX) refuse(ANSWER_TOO_LONG);

    const recipe = await lockRecipe(tx, input.recipeId);
    if (
      !UUID.test(input.runId) ||
      recipe.latestRunId !== input.runId ||
      !QUEUEABLE.includes(recipe.status)
    ) {
      refuse(RECIPE_CHANGED);
    }
    const [asked] = await tx
      .select({
        sourceId: schema.recipeProofreadRuns.sourceId,
        plates: schema.recipeProofreadRuns.plates,
        exchange: schema.recipeProofreadRuns.exchange,
        result: schema.recipeProofreadRuns.result,
      })
      .from(schema.recipeProofreadRuns)
      .where(
        and(
          eq(schema.recipeProofreadRuns.id, input.runId),
          eq(schema.recipeProofreadRuns.recipeId, input.recipeId),
          eq(schema.recipeProofreadRuns.kind, "source"),
          eq(schema.recipeProofreadRuns.outcome, "succeeded"),
        ),
      );
    const questions = readQuestions(asked?.result);
    if (!asked || !questions || asked.sourceId === null) {
      refuse(RECIPE_CHANGED);
    }
    // Claude asked about this source; a newer one has not been read.
    const latest = await latestSource(tx, input.recipeId);
    if (latest?.id !== asked.sourceId) refuse(SOURCE_CHANGED);
    const blocked = sourceBlockedReason(latest, recipe);
    if (blocked) refuse(blocked);

    const exchange = [...readExchange(asked.exchange), { questions, answer }];
    const plates = asked.plates ?? DEFAULT_PLATES;
    const runId = await insertSourceRun(tx, {
      recipe,
      sourceId: asked.sourceId,
      actorId: input.actorId,
      now: input.now,
      note: null,
      plates,
      exchange,
      previousRunId: input.runId,
      promptVersion: sourcePromptVersion(recipe.acceptedVersionId, input),
      model: input.model,
    });
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "recipe.questions_answered",
      target: input.recipeId,
      metadata: {
        title: recipe.title ?? UNTITLED_RECIPE,
        runId,
        answeredRunId: input.runId,
        round: exchange.length,
      },
    });
    return { runId };
  });
}

/**
 * Hand a recipe back after its run failed, stopped or lost its clearance:
 * where it stood when the run was queued (handBackTo), with the reason. Only
 * while the recipe is still in `from` and still points at this run.
 */
async function handBack(
  tx: Tx,
  run: {
    runId: string;
    recipeId: string;
    previousStatus: RecipeStatus | null;
    previousRunId: string | null;
  },
  from: RecipeStatus,
  error: string,
  now: Date,
): Promise<void> {
  const [recipe] = await tx
    .select({ acceptedVersionId: schema.recipes.acceptedVersionId })
    .from(schema.recipes)
    .where(eq(schema.recipes.id, run.recipeId));
  if (!recipe) return;
  const [previous] = run.previousRunId
    ? await tx
        .select({ outcome: schema.recipeProofreadRuns.outcome })
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, run.previousRunId))
    : [];
  const to = handBackTo({
    failedRunId: run.runId,
    previousStatus: run.previousStatus,
    previousRunId: run.previousRunId,
    previousRunSucceeded: previous?.outcome === "succeeded",
    acceptedVersionId: recipe.acceptedVersionId,
  });
  await tx
    .update(schema.recipes)
    .set({
      status: to.status,
      latestRunId: to.runId,
      lastError: error,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.recipes.id, run.recipeId),
        eq(schema.recipes.status, from),
        eq(schema.recipes.latestRunId, run.runId),
      ),
    );
}

export interface RunUsage {
  inputTokens: number;
  outputTokens: number;
}

/**
 * What the worker sends to Claude for one `source` run, and nothing more:
 * never the member's suitability note, anyone's name or any audio.
 */
export interface ClaimedSourceRun {
  runId: string;
  recipeId: string;
  title: string;
  /** The source as the Markdown-like text Claude reads. */
  sourceText: string;
  /** How many the source says it serves; null when it does not say. */
  serves: number | null;
  /** The plates Claude writes the recipe for. */
  plates: number;
  /** Every earlier round of Claude's questions and the answers. */
  exchange: ProofreadExchange;
  note: string | null;
  /**
   * The kitchen's size, with the plates at each meal from this year's meal
   * plan (its largest day at each).
   */
  kitchen: KitchenForPrompt;
  /**
   * The recipe's accepted version, when it has one, so Claude revises it
   * instead of starting from zero: the recipe as the book has it, and the
   * questions and answers that settled it (the exchange on the run that
   * wrote it; none for a version written any other way). Null for a recipe
   * not yet in the book.
   */
  previous: PreviousVersion | null;
}

/** The accepted version a revision run starts from. */
export interface PreviousVersion {
  version: number;
  recipe: KitchenRecipe;
  exchange: ProofreadExchange;
}

/** A recipe's accepted version and the exchange that settled it, or null. */
async function readPreviousVersion(
  tx: DbOrTx,
  acceptedVersionId: string | null,
): Promise<PreviousVersion | null> {
  if (acceptedVersionId === null) return null;
  const [row] = await tx
    .select({
      version: schema.recipeVersions.version,
      plates: schema.recipeVersions.servingsBasis,
      body: schema.recipeVersions.body,
      title: schema.recipes.title,
      exchange: schema.recipeProofreadRuns.exchange,
    })
    .from(schema.recipeVersions)
    .innerJoin(
      schema.recipes,
      eq(schema.recipes.id, schema.recipeVersions.recipeId),
    )
    .leftJoin(
      schema.recipeProofreadRuns,
      and(
        eq(schema.recipeProofreadRuns.id, schema.recipeVersions.runId),
        eq(schema.recipeProofreadRuns.kind, "source"),
      ),
    )
    .where(eq(schema.recipeVersions.id, acceptedVersionId));
  if (!row) return null;
  return {
    version: row.version,
    recipe: versionRecipe(row.body, {
      title: row.title ?? UNTITLED_RECIPE,
      plates: row.plates,
    }),
    exchange: readExchange(row.exchange),
  };
}

type SourceClaim = { claimed: ClaimedSourceRun } | { claimed: null };

/**
 * Take one queued `source` run for the worker: only a run a reviewer queued,
 * whose recipe is still `queued` and points at it, with SKIP LOCKED so two
 * workers never take the same run. The consent on the source is
 * read again at the moment it would leave; a run that lost it is failed here,
 * unsent, and the recipe goes back. The run starts at the `sending` stage.
 */
export async function claimSourceRun(
  runId: string,
  now: Date = new Date(),
): Promise<ClaimedSourceRun | null> {
  if (!UUID.test(runId)) return null;
  const result = await write<SourceClaim>(async (tx) => {
    const [row] = await tx
      .select({
        runId: schema.recipeProofreadRuns.id,
        recipeId: schema.recipes.id,
        title: schema.recipes.title,
        submitterId: schema.recipes.submitterId,
        aiConsentAt: schema.recipes.aiConsentAt,
        acceptedVersionId: schema.recipes.acceptedVersionId,
        note: schema.recipeProofreadRuns.note,
        plates: schema.recipeProofreadRuns.plates,
        exchange: schema.recipeProofreadRuns.exchange,
        previousStatus: schema.recipeProofreadRuns.previousStatus,
        previousRunId: schema.recipeProofreadRuns.previousRunId,
        source: SOURCE_COLUMNS,
      })
      .from(schema.recipeProofreadRuns)
      .innerJoin(
        schema.recipes,
        eq(schema.recipes.id, schema.recipeProofreadRuns.recipeId),
      )
      .leftJoin(
        schema.recipeSources,
        eq(schema.recipeSources.id, schema.recipeProofreadRuns.sourceId),
      )
      .where(
        and(
          eq(schema.recipeProofreadRuns.id, runId),
          eq(schema.recipeProofreadRuns.kind, "source"),
          eq(schema.recipeProofreadRuns.outcome, "queued"),
          eq(schema.recipes.status, "queued"),
          eq(schema.recipes.latestRunId, schema.recipeProofreadRuns.id),
        ),
      )
      .limit(1)
      .for("update", { of: schema.recipeProofreadRuns, skipLocked: true });
    if (!row) refuse("nothing to claim");

    const source = row.source ? sourceOf(row.source) : null;
    const blocked = sourceBlockedReason(source, row);
    if (blocked !== null || !source) {
      const error = blocked ?? NO_TEXT_TO_SEND;
      await tx
        .update(schema.recipeProofreadRuns)
        .set({ outcome: "failed", finishedAt: now, error })
        .where(
          and(
            eq(schema.recipeProofreadRuns.id, row.runId),
            eq(schema.recipeProofreadRuns.outcome, "queued"),
          ),
        );
      await handBack(tx, row, "queued", error, now);
      return { claimed: null };
    }

    const recipe = await tx
      .update(schema.recipes)
      .set({ status: "analysing", updatedAt: now })
      .where(
        and(
          eq(schema.recipes.id, row.recipeId),
          eq(schema.recipes.status, "queued"),
          eq(schema.recipes.latestRunId, row.runId),
        ),
      )
      .returning({ id: schema.recipes.id });
    const run = await tx
      .update(schema.recipeProofreadRuns)
      .set({ outcome: "running", startedAt: now, stage: "sending" })
      .where(
        and(
          eq(schema.recipeProofreadRuns.id, row.runId),
          eq(schema.recipeProofreadRuns.outcome, "queued"),
        ),
      )
      .returning({ id: schema.recipeProofreadRuns.id });
    if (recipe.length === 0 || run.length === 0) refuse("lost the claim");
    return {
      claimed: {
        runId: row.runId,
        recipeId: row.recipeId,
        title: row.title ?? UNTITLED_RECIPE,
        sourceText: sourceText(source.sections),
        serves: source.serves,
        plates: row.plates ?? DEFAULT_PLATES,
        exchange: readExchange(row.exchange),
        note: row.note,
        kitchen: await readMealPlanPeaks(tx),
        previous: await readPreviousVersion(tx, row.acceptedVersionId),
      } satisfies ClaimedSourceRun,
    };
  });
  return result.ok ? result.claimed : null;
}

/**
 * The worker says how far a running `source` run has got, for the loading
 * panel. Applies only while the run is still running; true when it did.
 */
export async function setRunStage(
  runId: string,
  stage: RunStage,
): Promise<boolean> {
  if (!UUID.test(runId) || !isRunStage(stage)) return false;
  const updated = await createHttpDb()
    .update(schema.recipeProofreadRuns)
    .set({ stage })
    .where(
      and(
        eq(schema.recipeProofreadRuns.id, runId),
        eq(schema.recipeProofreadRuns.kind, "source"),
        eq(schema.recipeProofreadRuns.outcome, "running"),
      ),
    )
    .returning({ id: schema.recipeProofreadRuns.id });
  return updated.length > 0;
}

/**
 * A `source` run came back with a valid answer. In one transaction,
 * compare-and-set on the recipe being `analysing` and pointing at this run:
 *  - Questions: the run succeeds with them stored, and the recipe goes back
 *    to where it stood (handBackTo), pointing at this run so the questions
 *    can be answered. The draft-keeping branch of handBackTo is off: the
 *    recipe must point at the question run, which holds no draft, so a
 *    `proofread` recipe goes back as approved (or accepted).
 *  - A recipe: it must be written for the run's plates, and the reviewer who
 *    sent it must still be a captain or a Kitchen lead, read and locked in
 *    this transaction (the call can take minutes; a demotion in between wins).
 *    It is saved as the next version, with its report, its scaling notes and
 *    its own plate count, straight into the book (`accepted`, no accept
 *    step), audited as that reviewer. A refusal rolls everything back and
 *    the worker fails the run with the sentence.
 */
export async function completeSourceRun(input: {
  runId: string;
  result: SourceProofread;
  usage: RunUsage;
  now?: Date;
}): Promise<RecipeWriteResult<{ versionId: string | null }>> {
  const now = input.now ?? new Date();
  return write(async (tx) => {
    if (!UUID.test(input.runId)) refuse(RECIPE_GONE);
    const parsed = SourceProofread.safeParse(input.result);
    if (!parsed.success) refuse(versionInvalid(parsed.error));
    const answer = parsed.data;
    // The sender's clearance first, in the lock order every send takes
    // (the sender, then the recipe), so the two never wait on
    // each other.
    const [sent] = await tx
      .select({ requestedBy: schema.recipeProofreadRuns.requestedBy })
      .from(schema.recipeProofreadRuns)
      .where(eq(schema.recipeProofreadRuns.id, input.runId));
    const senderMayWrite = sent?.requestedBy
      ? await lockKitchenReviewer(tx, sent.requestedBy)
      : false;
    const [run] = await tx
      .update(schema.recipeProofreadRuns)
      .set({
        outcome: "succeeded",
        finishedAt: now,
        result: answer,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        error: null,
      })
      .where(
        and(
          eq(schema.recipeProofreadRuns.id, input.runId),
          eq(schema.recipeProofreadRuns.kind, "source"),
          eq(schema.recipeProofreadRuns.outcome, "running"),
        ),
      )
      .returning({
        recipeId: schema.recipeProofreadRuns.recipeId,
        plates: schema.recipeProofreadRuns.plates,
        sourceId: schema.recipeProofreadRuns.sourceId,
        requestedBy: schema.recipeProofreadRuns.requestedBy,
        previousStatus: schema.recipeProofreadRuns.previousStatus,
        previousRunId: schema.recipeProofreadRuns.previousRunId,
      });
    if (!run) refuse(RECIPE_CHANGED);
    const [recipe] = await tx
      .select({
        title: schema.recipes.title,
        acceptedVersionId: schema.recipes.acceptedVersionId,
      })
      .from(schema.recipes)
      .where(
        and(
          eq(schema.recipes.id, run.recipeId),
          eq(schema.recipes.status, "analysing"),
          eq(schema.recipes.latestRunId, input.runId),
        ),
      )
      .for("update");
    if (!recipe) refuse(RECIPE_CHANGED);

    if (answer.needsInfo) {
      const to = handBackTo({
        failedRunId: input.runId,
        previousStatus: run.previousStatus,
        previousRunId: run.previousRunId,
        previousRunSucceeded: false,
        acceptedVersionId: recipe.acceptedVersionId,
      });
      await tx
        .update(schema.recipes)
        .set({
          status: to.status,
          latestRunId: input.runId,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(schema.recipes.id, run.recipeId));
      return { versionId: null };
    }

    const written = answer.recipe!;
    const asked = run.plates ?? DEFAULT_PLATES;
    if (written.plates !== asked) {
      // Rolls the run's update back: it stays running for the worker to fail.
      refuse(draftPlatesMismatch(asked, written.plates));
    }
    if (!senderMayWrite) refuse(SENDER_NOT_A_REVIEWER);
    const version = await insertVersion(tx, {
      recipeId: run.recipeId,
      authorId: run.requestedBy,
      runId: input.runId,
      reason: "Written by Claude",
      recipe: written,
      report: answer.report,
      sourceId: run.sourceId,
      scalingNotes: answer.scalingNotes,
    });
    await tx
      .update(schema.recipes)
      .set({
        status: "accepted",
        acceptedVersionId: version.id,
        title: written.title,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(schema.recipes.id, run.recipeId));
    await writeAuditEvent(tx, {
      actorId: run.requestedBy,
      action: "recipe.written_by_claude",
      target: run.recipeId,
      metadata: {
        title: written.title,
        version: version.version,
        runId: input.runId,
      },
    });
    return { versionId: version.id };
  });
}

/** Where a recipe's newest run stands, for the loading panel. */
export interface ProofreadProgress {
  runId: string;
  kind: string;
  outcome: RunOutcome;
  /** The stage a running `source` run has reached; null before it starts. */
  stage: RunStage | null;
  /** Claude's questions, when the run asked instead of writing. */
  questions: string[] | null;
  error: string | null;
}

/**
 * Where one run stands: `runId` when the editor knows the run it started (a
 * failure can point the recipe back at an older run, which must not read as
 * this one's success), else the recipe's newest run. A run of another recipe
 * reads as none. Null when there is no such run.
 */
export async function getProofreadProgress(
  recipeId: string,
  runId?: string | null,
): Promise<ProofreadProgress | null> {
  if (!UUID.test(recipeId)) return null;
  if (runId != null && !UUID.test(runId)) return null;
  const [row] = await createHttpDb()
    .select({
      runId: schema.recipeProofreadRuns.id,
      kind: schema.recipeProofreadRuns.kind,
      outcome: schema.recipeProofreadRuns.outcome,
      stage: schema.recipeProofreadRuns.stage,
      result: schema.recipeProofreadRuns.result,
      error: schema.recipeProofreadRuns.error,
    })
    .from(schema.recipes)
    .innerJoin(
      schema.recipeProofreadRuns,
      runId != null
        ? and(
            eq(schema.recipeProofreadRuns.id, runId),
            eq(schema.recipeProofreadRuns.recipeId, schema.recipes.id),
          )
        : eq(schema.recipeProofreadRuns.id, schema.recipes.latestRunId),
    )
    .where(eq(schema.recipes.id, recipeId));
  if (!row) return null;
  return {
    runId: row.runId,
    kind: row.kind,
    outcome: row.outcome,
    stage: isRunStage(row.stage) ? row.stage : null,
    questions: row.outcome === "succeeded" ? readQuestions(row.result) : null,
    error: row.error,
  };
}

/**
 * Claude wrote the recipe for another number of plates than the captain asked
 * for (the source's own "serves 4", say). The answer is not stored as a
 * result: a version for the wrong count would be the book's base count.
 */
export function draftPlatesMismatch(asked: number, wrote: number): string {
  return `Claude wrote the recipe for ${wrote} plate${wrote === 1 ? "" : "s"}, not the ${asked} asked for.`;
}

/**
 * A run failed: a model error, a timeout or a reply that did not match the
 * contract. The run keeps whatever tokens are known, because the call still
 * cost money; the recipe goes back to where it stood when the run was queued
 * (`approved` for a first run; see handBackTo), with the error. Nothing is
 * retried.
 */
export async function failRun(input: {
  runId: string;
  error: string;
  usage?: RunUsage | null;
  now?: Date;
}): Promise<RecipeWriteResult> {
  const now = input.now ?? new Date();
  const error = input.error.trim().slice(0, 1_000) || "The run failed.";
  return write(async (tx) => {
    if (!UUID.test(input.runId)) refuse(RECIPE_GONE);
    const [run] = await tx
      .update(schema.recipeProofreadRuns)
      .set({
        outcome: "failed",
        finishedAt: now,
        error,
        ...(input.usage
          ? {
              inputTokens: input.usage.inputTokens,
              outputTokens: input.usage.outputTokens,
            }
          : {}),
      })
      .where(
        and(
          eq(schema.recipeProofreadRuns.id, input.runId),
          eq(schema.recipeProofreadRuns.outcome, "running"),
        ),
      )
      .returning({
        runId: schema.recipeProofreadRuns.id,
        recipeId: schema.recipeProofreadRuns.recipeId,
        previousStatus: schema.recipeProofreadRuns.previousStatus,
        previousRunId: schema.recipeProofreadRuns.previousRunId,
        kind: schema.recipeProofreadRuns.kind,
      });
    if (!run) refuse(RECIPE_CHANGED);
    // A plate-count run never moved its recipe, so only its own row changes.
    if (run.kind !== "plates") {
      await handBack(tx, run, "analysing", error, now);
    }
    return {};
  });
}

/**
 * Runs that cannot still be working, reset when a Kitchen page loads (there
 * is no cron): one still `running` STALE_RUN_AFTER_MS after it started (the
 * function was killed), and one still `queued` that long after it was asked
 * for (its after() never ran, so nothing was sent). Each is marked failed. A
 * `recipe` or `source` run hands its recipe back to where it stood when the run was
 * queued, with the reason; a `plates` run changes only its own row. Nothing is
 * retried.
 */
export async function resetStaleRuns(
  now: Date,
  staleAfterMs: number = STALE_RUN_AFTER_MS,
): Promise<{ reset: number }> {
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const returning = {
    runId: schema.recipeProofreadRuns.id,
    recipeId: schema.recipeProofreadRuns.recipeId,
    previousStatus: schema.recipeProofreadRuns.previousStatus,
    previousRunId: schema.recipeProofreadRuns.previousRunId,
    kind: schema.recipeProofreadRuns.kind,
  };
  return withTransaction(async (tx) => {
    const stopped = await tx
      .update(schema.recipeProofreadRuns)
      .set({ outcome: "failed", finishedAt: now, error: STALE_RUN_ERROR })
      .where(
        and(
          eq(schema.recipeProofreadRuns.outcome, "running"),
          lt(schema.recipeProofreadRuns.startedAt, cutoff),
        ),
      )
      .returning(returning);
    for (const run of stopped) {
      if (run.kind !== "plates") {
        await handBack(tx, run, "analysing", STALE_RUN_ERROR, now);
      }
    }
    const neverStarted = await tx
      .update(schema.recipeProofreadRuns)
      .set({ outcome: "failed", finishedAt: now, error: NEVER_STARTED_ERROR })
      .where(
        and(
          eq(schema.recipeProofreadRuns.outcome, "queued"),
          lt(schema.recipeProofreadRuns.requestedAt, cutoff),
        ),
      )
      .returning(returning);
    for (const run of neverStarted) {
      if (run.kind !== "plates") {
        await handBack(tx, run, "queued", NEVER_STARTED_ERROR, now);
      }
    }
    return { reset: stopped.length + neverStarted.length };
  });
}

// --- Plate counts ----------------------------------------------------------
// Food does not scale by multiplying (the owner's ruling), so a captain has
// Claude proofread an accepted version for another number of plates, and the
// answer is kept per (version, plates) in recipe_plate_counts. A count that
// already has a result is shown with no new run, and is run again only when a
// captain asks for a re-run. The run sends Claude the kitchen's accepted
// recipe alone, never the member's text or note, so it needs no consent
// check.

const plateWord = (n: number) => `${n} plate${n === 1 ? "" : "s"}`;

/** The version's own count is its body; there is nothing to proofread. */
export function plateCountIsBase(plates: number): string {
  return `This recipe is written for ${plateWord(plates)} already.`;
}

/** A stored result is read, not paid for again, unless a re-run is asked. */
export function plateCountReady(plates: number): string {
  return `Already proofread for ${plateWord(plates)}.`;
}

/** One open run per (version, plates): the second press is refused. */
export function plateRunOpen(plates: number): string {
  return `Claude is already working on ${plateWord(plates)}. Reload in a minute.`;
}

/** The index that holds one open plate run per (version, plates). */
const OPEN_PLATES_INDEX = "recipe_proofread_runs_open_plates_idx";

/**
 * Whether an error is the open-plate-run index refusing a second run. Drizzle
 * nests the Postgres error under `.cause`, so the chain is walked.
 */
export function isOpenPlateRunConflict(err: unknown): boolean {
  for (let cur: unknown = err, depth = 0; cur && depth < 5; depth++) {
    if (typeof cur !== "object") break;
    const e = cur as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    };
    if (
      e.code === "23505" ||
      e.constraint === OPEN_PLATES_INDEX ||
      (typeof e.message === "string" && e.message.includes(OPEN_PLATES_INDEX))
    ) {
      return true;
    }
    cur = e.cause;
  }
  return false;
}

/**
 * A captain asks Claude to proofread the accepted version for `plates`
 * plates. In ONE transaction: the reviewer check, the recipe lock, the
 * refusals, the run row and its audit row. A refusal writes nothing.
 */
export async function queuePlateProofread(input: {
  recipeId: string;
  versionId: string;
  plates: number;
  /** Run a count that already has a result again. */
  rerun: boolean;
  actorId: string;
  now: Date;
  promptVersion: string;
  model: string;
}): Promise<RecipeWriteResult<{ runId: string }>> {
  return write(async (tx) => {
    if (!(await lockKitchenReviewer(tx, input.actorId))) {
      refuse(ONLY_A_REVIEWER_SENDS);
    }
    const plates = platesOrRefuse(input.plates);

    const recipe = await lockRecipe(tx, input.recipeId);
    if (recipe.acceptedVersionId === null) refuse(NO_ACCEPTED_VERSION);
    if (
      !UUID.test(input.versionId) ||
      recipe.acceptedVersionId !== input.versionId
    ) {
      refuse(VERSION_CHANGED);
    }
    const [version] = await tx
      .select({
        version: schema.recipeVersions.version,
        plates: schema.recipeVersions.servingsBasis,
      })
      .from(schema.recipeVersions)
      .where(eq(schema.recipeVersions.id, input.versionId));
    if (!version) refuse(VERSION_CHANGED);
    if (plates === version.plates) refuse(plateCountIsBase(plates));

    const [ready] = await tx
      .select({ id: schema.recipePlateCounts.id })
      .from(schema.recipePlateCounts)
      .where(
        and(
          eq(schema.recipePlateCounts.versionId, input.versionId),
          eq(schema.recipePlateCounts.plates, plates),
        ),
      );
    if (ready && !input.rerun) refuse(plateCountReady(plates));

    const [open] = await tx
      .select({ id: schema.recipeProofreadRuns.id })
      .from(schema.recipeProofreadRuns)
      .where(
        and(
          eq(schema.recipeProofreadRuns.versionId, input.versionId),
          eq(schema.recipeProofreadRuns.plates, plates),
          eq(schema.recipeProofreadRuns.kind, "plates"),
          inArray(schema.recipeProofreadRuns.outcome, ["queued", "running"]),
        ),
      );
    if (open) refuse(plateRunOpen(plates));

    // Two captains racing past the read above meet the partial unique index.
    // A plain insert, caught: ON CONFLICT against a partial index needs its
    // WHERE repeated (42P10), and a silent skip would hide the refusal.
    let runId: string;
    try {
      const [run] = await tx
        .insert(schema.recipeProofreadRuns)
        .values({
          recipeId: input.recipeId,
          requestedBy: input.actorId,
          requestedAt: input.now,
          promptVersion: input.promptVersion,
          model: input.model,
          outcome: "queued",
          kind: "plates",
          plates,
          versionId: input.versionId,
        })
        .returning({ id: schema.recipeProofreadRuns.id });
      runId = run!.id;
    } catch (error) {
      if (isOpenPlateRunConflict(error)) refuse(plateRunOpen(plates));
      throw error;
    }
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "recipe.plates_queued",
      target: input.recipeId,
      metadata: {
        title: recipe.title ?? UNTITLED_RECIPE,
        version: version.version,
        plates,
        runId,
        rerun: Boolean(ready),
        promptVersion: input.promptVersion,
        model: input.model,
      },
    });
    return { runId };
  });
}

/** What the worker sends to Claude for one plate-count run, and nothing more. */
export interface ClaimedPlateRun {
  runId: string;
  recipeId: string;
  title: string;
  /** The plates the version is written for. */
  fromPlates: number;
  /** The plates Claude writes the amounts for. */
  plates: number;
  /** The accepted version's body: the kitchen's recipe, never the member's text. */
  recipe: KitchenRecipe;
}

/** A plate run whose version is no longer the recipe's accepted one. */
export const PLATE_RUN_VERSION_GONE =
  "The recipe got a new version before the run started. Nothing was sent to Claude.";

type PlateClaim = { claimed: ClaimedPlateRun } | { claimed: null };

/**
 * Take one queued plate-count run for the worker: queued moves to running,
 * compare-and-set, with SKIP LOCKED so two workers never take the same run.
 * A run whose version is no longer the accepted one is failed unsent. Null
 * when the run is not a queued plate run.
 */
export async function claimPlateRun(
  runId: string,
  now: Date = new Date(),
): Promise<ClaimedPlateRun | null> {
  if (!UUID.test(runId)) return null;
  const result = await write<PlateClaim>(async (tx) => {
    const [run] = await tx
      .select({
        runId: schema.recipeProofreadRuns.id,
        recipeId: schema.recipeProofreadRuns.recipeId,
        versionId: schema.recipeProofreadRuns.versionId,
        plates: schema.recipeProofreadRuns.plates,
      })
      .from(schema.recipeProofreadRuns)
      .where(
        and(
          eq(schema.recipeProofreadRuns.id, runId),
          eq(schema.recipeProofreadRuns.kind, "plates"),
          eq(schema.recipeProofreadRuns.outcome, "queued"),
        ),
      )
      .for("update", { skipLocked: true });
    if (!run || run.versionId === null || run.plates === null) {
      refuse("nothing to claim");
    }

    const [row] = await tx
      .select({
        title: schema.recipes.title,
        acceptedVersionId: schema.recipes.acceptedVersionId,
        body: schema.recipeVersions.body,
      })
      .from(schema.recipeVersions)
      .innerJoin(
        schema.recipes,
        eq(schema.recipes.id, schema.recipeVersions.recipeId),
      )
      .where(eq(schema.recipeVersions.id, run.versionId));
    const body = KitchenRecipe.safeParse(row?.body);
    if (!row || row.acceptedVersionId !== run.versionId || !body.success) {
      await tx
        .update(schema.recipeProofreadRuns)
        .set({
          outcome: "failed",
          finishedAt: now,
          error:
            !body.success && row ? VERSION_INVALID : PLATE_RUN_VERSION_GONE,
        })
        .where(
          and(
            eq(schema.recipeProofreadRuns.id, run.runId),
            eq(schema.recipeProofreadRuns.outcome, "queued"),
          ),
        );
      return { claimed: null };
    }

    const started = await tx
      .update(schema.recipeProofreadRuns)
      .set({ outcome: "running", startedAt: now })
      .where(
        and(
          eq(schema.recipeProofreadRuns.id, run.runId),
          eq(schema.recipeProofreadRuns.outcome, "queued"),
        ),
      )
      .returning({ id: schema.recipeProofreadRuns.id });
    if (started.length === 0) refuse("lost the claim");
    return {
      claimed: {
        runId: run.runId,
        recipeId: run.recipeId,
        title: row.title ?? UNTITLED_RECIPE,
        fromPlates: body.data.plates,
        plates: run.plates,
        recipe: body.data,
      } satisfies ClaimedPlateRun,
    };
  });
  return result.ok ? result.claimed : null;
}

/**
 * A plate run came back with a valid answer: the run succeeds with its
 * tokens, and the count is stored for its version. A re-run replaces the
 * stored result (ON CONFLICT on the full unique index); the version's own
 * count is never overwritten.
 */
export async function completePlateRun(input: {
  runId: string;
  result: PlateProofread;
  usage: RunUsage;
  now?: Date;
}): Promise<RecipeWriteResult> {
  const now = input.now ?? new Date();
  return write(async (tx) => {
    if (!UUID.test(input.runId)) refuse(RECIPE_GONE);
    const parsed = PlateProofread.safeParse(input.result);
    if (!parsed.success) refuse(versionInvalid(parsed.error));
    const answer = parsed.data;
    const [run] = await tx
      .update(schema.recipeProofreadRuns)
      .set({
        outcome: "succeeded",
        finishedAt: now,
        result: answer,
        inputTokens: input.usage.inputTokens,
        outputTokens: input.usage.outputTokens,
        error: null,
      })
      .where(
        and(
          eq(schema.recipeProofreadRuns.id, input.runId),
          eq(schema.recipeProofreadRuns.kind, "plates"),
          eq(schema.recipeProofreadRuns.outcome, "running"),
        ),
      )
      .returning({
        versionId: schema.recipeProofreadRuns.versionId,
        plates: schema.recipeProofreadRuns.plates,
      });
    if (!run || run.versionId === null || run.plates === null) {
      refuse(RECIPE_CHANGED);
    }
    const stored = {
      lines: answer.lines,
      pots: answer.pots,
      notes: answer.notes,
      report: answer.report,
      source: "proofread",
      runId: input.runId,
      createdAt: now,
    };
    const written = await tx
      .insert(schema.recipePlateCounts)
      .values({ versionId: run.versionId, plates: run.plates, ...stored })
      .onConflictDoUpdate({
        target: [
          schema.recipePlateCounts.versionId,
          schema.recipePlateCounts.plates,
        ],
        set: stored,
        setWhere: eq(schema.recipePlateCounts.source, "proofread"),
      })
      .returning({ id: schema.recipePlateCounts.id });
    if (written.length === 0) refuse(plateCountIsBase(run.plates));
    return {};
  });
}

/**
 * A plate run failed: running moves to failed with the reason, keeping any
 * tokens, because the call may still have cost money. The recipe is not
 * touched. Nothing is retried.
 */
export async function failPlateRun(input: {
  runId: string;
  error: string;
  usage?: RunUsage | null;
  now?: Date;
}): Promise<RecipeWriteResult> {
  const now = input.now ?? new Date();
  const error = input.error.trim().slice(0, 1_000) || "The run failed.";
  return write(async (tx) => {
    if (!UUID.test(input.runId)) refuse(RECIPE_GONE);
    const [run] = await tx
      .update(schema.recipeProofreadRuns)
      .set({
        outcome: "failed",
        finishedAt: now,
        error,
        ...(input.usage
          ? {
              inputTokens: input.usage.inputTokens,
              outputTokens: input.usage.outputTokens,
            }
          : {}),
      })
      .where(
        and(
          eq(schema.recipeProofreadRuns.id, input.runId),
          eq(schema.recipeProofreadRuns.kind, "plates"),
          eq(schema.recipeProofreadRuns.outcome, "running"),
        ),
      )
      .returning({ id: schema.recipeProofreadRuns.id });
    if (!run) refuse(RECIPE_CHANGED);
    return {};
  });
}

// --- Versions ----------------------------------------------------------------

function checkRecipe(recipe: unknown): KitchenRecipe {
  const parsed = KitchenRecipe.safeParse(recipe);
  return parsed.success ? parsed.data : refuse(versionInvalid(parsed.error));
}

/**
 * Add each line's ingredient to the catalogue by lower-cased name. A known
 * ingredient keeps its category; only an empty one is filled, as Noble
 * Notations keeps the category on its ingredient record.
 */
/**
 * The catalogue rows a version writes: one per name (case-blind, the first
 * line's spelling and category), in name order rather than the recipe's. Two
 * versions saved at once that share ingredients then lock the catalogue rows
 * in the same order, so neither waits on the other in a deadlock.
 */
export function catalogueLines(recipe: Pick<KitchenRecipe, "ingredients">): {
  name: string;
  category: KitchenRecipe["ingredients"][number]["category"];
}[] {
  const byName = new Map<
    string,
    { name: string; category: KitchenRecipe["ingredients"][number]["category"] }
  >();
  for (const line of recipe.ingredients) {
    const name = line.name.trim();
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { name, category: line.category });
  }
  return [...byName.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, line]) => line);
}

async function upsertIngredients(tx: Tx, recipe: KitchenRecipe): Promise<void> {
  for (const { name, category } of catalogueLines(recipe)) {
    await tx.execute(sql`
      INSERT INTO ingredients (name, category)
      VALUES (${name}, ${category})
      ON CONFLICT (lower(name)) DO UPDATE SET
        category = COALESCE(ingredients.category, EXCLUDED.category),
        updated_at = now()
    `);
  }
}

/**
 * Write a version (the whole recipe as its body) and its own plate count, in
 * the caller's transaction; the recipe is pointed at it after.
 */
async function insertVersion(
  tx: Tx,
  input: {
    recipeId: string;
    authorId: string | null;
    runId: string | null;
    reason: string;
    recipe: KitchenRecipe;
    report: DraftReport | null;
    /** The source a `source` run wrote the version from. */
    sourceId?: string | null;
    /** How the source was scaled to the version's plates. */
    scalingNotes?: string[];
  },
): Promise<{ id: string; version: number }> {
  const [top] = await tx
    .select({ max: sql<number | null>`max(${schema.recipeVersions.version})` })
    .from(schema.recipeVersions)
    .where(eq(schema.recipeVersions.recipeId, input.recipeId));
  const version = (top?.max ?? 0) + 1;
  const { recipe } = input;
  const [row] = await tx
    .insert(schema.recipeVersions)
    .values({
      recipeId: input.recipeId,
      version,
      servingsBasis: recipe.plates,
      body: recipe,
      report: input.report,
      runId: input.runId,
      reason: input.reason,
      authorId: input.authorId,
      sourceId: input.sourceId ?? null,
      scalingNotes: input.scalingNotes ?? [],
    })
    .returning({ id: schema.recipeVersions.id });
  await tx.insert(schema.recipePlateCounts).values({
    versionId: row!.id,
    plates: recipe.plates,
    lines: baseLines(recipe),
    source: "version",
  });
  await upsertIngredients(tx, recipe);
  return { id: row!.id, version };
}

/**
 * A reviewer accepts an older run's draft, exactly as Claude wrote it, as the
 * recipe's next version. The draft is read from the run in this transaction,
 * never taken from the caller: nobody writes the structured recipe by hand.
 * Compare-and-set on `proofread` and on the run the reviewer read.
 */
export async function acceptProofread(input: {
  recipeId: string;
  runId: string;
  actorId: string;
  reason?: string | null;
}): Promise<RecipeWriteResult<{ versionId: string; version: number }>> {
  return write(async (tx) => {
    await assertKitchenReviewer(tx, input.actorId);
    const recipe = await lockRecipe(tx, input.recipeId);
    if (recipe.status !== "proofread" || recipe.latestRunId !== input.runId) {
      refuse(RECIPE_CHANGED);
    }
    const [run] = await tx
      .select({ result: schema.recipeProofreadRuns.result })
      .from(schema.recipeProofreadRuns)
      .where(
        and(
          eq(schema.recipeProofreadRuns.id, input.runId),
          eq(schema.recipeProofreadRuns.recipeId, input.recipeId),
        ),
      );
    const draft = readDraft(run?.result);
    if (!draft) refuse(DRAFT_UNREADABLE);
    const result = checkRecipe(draft.recipe);
    const written = await insertVersion(tx, {
      recipeId: input.recipeId,
      authorId: input.actorId,
      runId: input.runId,
      reason: input.reason?.trim() || "Written by Claude",
      recipe: result,
      report: draft.report ?? null,
    });
    const accepted = await tx
      .update(schema.recipes)
      .set({
        status: "accepted",
        acceptedVersionId: written.id,
        title: result.title,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.recipes.id, input.recipeId),
          eq(schema.recipes.status, "proofread"),
          eq(schema.recipes.latestRunId, input.runId),
        ),
      )
      .returning({ id: schema.recipes.id });
    if (accepted.length === 0) refuse(RECIPE_CHANGED);
    await writeAuditEvent(tx, {
      actorId: input.actorId,
      action: "recipe.accepted",
      target: input.recipeId,
      metadata: {
        title: result.title,
        version: written.version,
        runId: input.runId,
      },
    });
    return { versionId: written.id, version: written.version };
  });
}

/**
 * What the cooks learned making one version of a recipe, stamped with the burn
 * year. Any approved member. The version must be one of this recipe's.
 */
export async function addLesson(input: {
  recipeId: string;
  versionId: string;
  authorId: string;
  body: string;
}): Promise<RecipeWriteResult<{ id: string }>> {
  return write(async (tx) => {
    await assertApprovedMember(tx, input.authorId);
    const body = input.body.trim();
    if (!body) refuse(LESSON_NEEDED);
    if (body.length > LESSON_MAX) {
      refuse(`Keep the lesson under ${LESSON_MAX} characters.`);
    }
    if (!UUID.test(input.recipeId)) refuse(RECIPE_GONE);
    const [recipe] = await tx
      .select({ acceptedVersionId: schema.recipes.acceptedVersionId })
      .from(schema.recipes)
      .where(eq(schema.recipes.id, input.recipeId))
      .for("share");
    if (!recipe) refuse(RECIPE_GONE);
    if (!recipe.acceptedVersionId) refuse(NO_ACCEPTED_VERSION);
    if (!UUID.test(input.versionId)) refuse(LESSON_VERSION_GONE);
    const [version] = await tx
      .select({ id: schema.recipeVersions.id })
      .from(schema.recipeVersions)
      .where(
        and(
          eq(schema.recipeVersions.id, input.versionId),
          eq(schema.recipeVersions.recipeId, input.recipeId),
        ),
      );
    if (!version) refuse(LESSON_VERSION_GONE);
    const [row] = await tx
      .insert(schema.recipeLessons)
      .values({
        recipeId: input.recipeId,
        versionId: input.versionId,
        authorId: input.authorId,
        body,
        cycle: await currentCycleNumber(tx),
      })
      .returning({ id: schema.recipeLessons.id });
    return { id: row!.id };
  });
}

// --- Reads -----------------------------------------------------------------

export interface RecipeBookEntry {
  id: string;
  title: string;
  status: RecipeStatus;
  version: number;
  /** The plates the accepted version is written for. */
  plates: number;
  /** Every plate count the accepted version has a result for, smallest first. */
  readyPlates: number[];
  versionCreatedAt: Date;
}

/** The plate counts each version has a result for, smallest first. */
async function readyPlatesByVersion(
  db: DbOrTx,
  versionIds: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (versionIds.length === 0) return out;
  const rows = await db
    .select({
      versionId: schema.recipePlateCounts.versionId,
      plates: schema.recipePlateCounts.plates,
    })
    .from(schema.recipePlateCounts)
    .where(inArray(schema.recipePlateCounts.versionId, versionIds))
    .orderBy(asc(schema.recipePlateCounts.plates));
  for (const row of rows) {
    const list = out.get(row.versionId) ?? [];
    list.push(row.plates);
    out.set(row.versionId, list);
  }
  return out;
}

/** The camp's recipe book: every recipe with an accepted version, by name. */
export async function listRecipeBook(): Promise<RecipeBookEntry[]> {
  const db = createHttpDb();
  const rows = await db
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      status: schema.recipes.status,
      versionId: schema.recipeVersions.id,
      version: schema.recipeVersions.version,
      plates: schema.recipeVersions.servingsBasis,
      versionCreatedAt: schema.recipeVersions.createdAt,
    })
    .from(schema.recipes)
    .innerJoin(
      schema.recipeVersions,
      eq(schema.recipeVersions.id, schema.recipes.acceptedVersionId),
    )
    .orderBy(asc(sql`lower(${schema.recipes.title})`));
  const ready = await readyPlatesByVersion(
    db,
    rows.map((r) => r.versionId),
  );
  return rows.map(({ versionId, title, ...row }) => ({
    ...row,
    title: title ?? UNTITLED_RECIPE,
    readyPlates: ready.get(versionId) ?? [],
  }));
}

export interface MySuggestion {
  id: string;
  title: string;
  status: RecipeStatus;
  source: RecipeSource;
  createdAt: Date;
  /** What a reviewer asked to change, while it is `changes_requested`. */
  changesNote: string | null;
  rejectionReason: string | null;
}

/** A member's own suggestions, newest first. */
export async function listMySuggestions(
  userId: string,
): Promise<MySuggestion[]> {
  if (!UUID.test(userId)) return [];
  const rows = await createHttpDb()
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      status: schema.recipes.status,
      source: schema.recipes.source,
      createdAt: schema.recipes.createdAt,
      changesNote: schema.recipes.changesNote,
      rejectionReason: schema.recipes.rejectionReason,
    })
    .from(schema.recipes)
    .where(eq(schema.recipes.submitterId, userId))
    .orderBy(desc(schema.recipes.createdAt));
  return rows.map((r) => ({ ...r, title: r.title ?? UNTITLED_RECIPE }));
}

export interface ReviewQueueEntry {
  id: string;
  title: string;
  status: RecipeStatus;
  source: RecipeSource;
  sourceUrl: string | null;
  submitterId: string | null;
  submitterName: string | null;
  suitabilityNote: string | null;
  changesNote: string | null;
  createdAt: Date;
}

/** Suggestions waiting for a decision, oldest first, then those sent back. */
export async function listReviewQueue(): Promise<ReviewQueueEntry[]> {
  const submitter = alias(schema.users, "submitter");
  const rows = await createHttpDb()
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      status: schema.recipes.status,
      source: schema.recipes.source,
      sourceUrl: schema.recipes.sourceUrl,
      submitterId: schema.recipes.submitterId,
      submitterName: submitter.displayName,
      suitabilityNote: schema.recipes.suitabilityNote,
      changesNote: schema.recipes.changesNote,
      createdAt: schema.recipes.createdAt,
    })
    .from(schema.recipes)
    .leftJoin(submitter, eq(submitter.id, schema.recipes.submitterId))
    .where(inArray(schema.recipes.status, ["suggested", "changes_requested"]))
    .orderBy(
      sql`${schema.recipes.status} = 'changes_requested'`,
      asc(schema.recipes.createdAt),
    );
  return rows.map((r) => ({ ...r, title: r.title ?? UNTITLED_RECIPE }));
}

export interface ProofreadCandidate {
  id: string;
  title: string;
  status: RecipeStatus;
  /** Why it cannot be sent to Claude now, or null when it can. */
  blockedReason: string | null;
  lastError: string | null;
  acceptedVersionId: string | null;
  /** A Kitchen lead's request to run it again, for the captain to read. */
  rerunRequest: { note: string; byName: string | null } | null;
  updatedAt: Date;
}

/** Approved recipes, then proofread and accepted ones for a re-run. */
export async function listReadyToProofread(): Promise<ProofreadCandidate[]> {
  const requester = alias(schema.users, "rerun_requester");
  const rows = await createHttpDb()
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      status: schema.recipes.status,
      rawText: schema.recipes.rawText,
      textAuthorId: schema.recipes.textAuthorId,
      submitterId: schema.recipes.submitterId,
      aiConsentAt: schema.recipes.aiConsentAt,
      lastError: schema.recipes.lastError,
      acceptedVersionId: schema.recipes.acceptedVersionId,
      rerunRequest: schema.recipes.rerunRequest,
      rerunRequestedByName: requester.displayName,
      updatedAt: schema.recipes.updatedAt,
    })
    .from(schema.recipes)
    .leftJoin(requester, eq(requester.id, schema.recipes.rerunRequestedBy))
    .where(inArray(schema.recipes.status, QUEUEABLE))
    .orderBy(
      sql`${schema.recipes.status} <> 'approved'`,
      asc(sql`lower(${schema.recipes.title})`),
    );
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? UNTITLED_RECIPE,
    status: r.status,
    blockedReason: textBlockedReason(r),
    lastError: r.lastError,
    acceptedVersionId: r.acceptedVersionId,
    rerunRequest: r.rerunRequest
      ? { note: r.rerunRequest, byName: r.rerunRequestedByName }
      : null,
    updatedAt: r.updatedAt,
  }));
}

export interface AwaitingAcceptance {
  id: string;
  title: string;
  latestRunId: string | null;
  finishedAt: Date | null;
  acceptedVersionId: string | null;
}

/** Proofread recipes waiting for a reviewer, oldest run first. */
export async function listAwaitingAcceptance(): Promise<AwaitingAcceptance[]> {
  const rows = await createHttpDb()
    .select({
      id: schema.recipes.id,
      title: schema.recipes.title,
      latestRunId: schema.recipes.latestRunId,
      finishedAt: schema.recipeProofreadRuns.finishedAt,
      acceptedVersionId: schema.recipes.acceptedVersionId,
    })
    .from(schema.recipes)
    .leftJoin(
      schema.recipeProofreadRuns,
      eq(schema.recipeProofreadRuns.id, schema.recipes.latestRunId),
    )
    .where(eq(schema.recipes.status, "proofread"))
    .orderBy(asc(schema.recipeProofreadRuns.finishedAt));
  return rows.map((r) => ({ ...r, title: r.title ?? UNTITLED_RECIPE }));
}

export interface RecipeVersionDetail {
  id: string;
  version: number;
  /** The plates the recipe is written for. */
  plates: number;
  recipe: KitchenRecipe;
  /** What Claude changed and was unsure of; null for one written by hand. */
  report: DraftReport | null;
  /** How Claude scaled the source to these plates, for every reader. */
  scalingNotes: string[];
  runId: string | null;
  reason: string | null;
  authorName: string | null;
  createdAt: Date;
}

export type RunOutcome = "queued" | "running" | "succeeded" | "failed";

export interface RecipeRunDetail {
  id: string;
  outcome: RunOutcome;
  requestedAt: Date;
  finishedAt: Date | null;
  note: string | null;
  /** The plates the run writes the recipe for; null on a first-draft run. */
  plates: number | null;
  promptVersion: string;
  model: string;
  error: string | null;
  /** Claude's recipe, when the run succeeded with one this app can read. */
  draft: RecipeDraft | null;
  /** The run stored an answer in an older shape, which cannot be accepted. */
  draftUnreadable: boolean;
  /** How far a running `source` run has got; null for any other run. */
  stage: RunStage | null;
  /** Claude's questions, when a `source` run asked instead of writing. */
  questions: string[] | null;
}

/** One plate count a version has a result for. */
export interface PlateCountSummary {
  plates: number;
  source: "version" | "proofread";
  pots: number | null;
  createdAt: Date;
}

/** A version's recipe for one plate count. */
export interface PlateCountDetail {
  plates: number;
  lines: PlateLine[];
  pots: number | null;
  notes: string[];
  report: DraftReport | null;
  source: "version" | "proofread";
}

export interface RecipeHistoryEntry {
  action: string;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface FailedPlateRun {
  plates: number;
  error: string;
  finishedAt: Date | null;
}

/**
 * The newest failed run per plate count, for the counts with no result and no
 * open run. `runs` may hold every outcome, newest first.
 */
export function failedPlateCounts(
  runs: readonly {
    plates: number | null;
    outcome: RunOutcome;
    error: string | null;
    finishedAt: Date | null;
  }[],
  ready: readonly number[],
  open: readonly number[],
): FailedPlateRun[] {
  const newest = new Map<number, (typeof runs)[number]>();
  for (const run of runs) {
    if (run.plates === null || newest.has(run.plates)) continue;
    newest.set(run.plates, run);
  }
  return [...newest.values()]
    .filter(
      (run) =>
        run.outcome === "failed" &&
        !ready.includes(run.plates!) &&
        !open.includes(run.plates!),
    )
    .map((run) => ({
      plates: run.plates!,
      error: run.error ?? "The run failed.",
      finishedAt: run.finishedAt,
    }))
    .sort((a, b) => a.plates - b.plates);
}

export interface RecipeDetail {
  id: string;
  title: string;
  status: RecipeStatus;
  source: RecipeSource;
  sourceUrl: string | null;
  text: string | null;
  suitabilityNote: string | null;
  submitterId: string | null;
  submitterName: string | null;
  textAuthorId: string | null;
  /** Why it cannot be sent to Claude now, or null when it can. */
  blockedReason: string | null;
  /** A Kitchen lead's request that a captain run it again. */
  rerunRequest: { note: string; byName: string | null; at: Date } | null;
  changesNote: string | null;
  rejectionReason: string | null;
  lastError: string | null;
  acceptedVersionId: string | null;
  createdAt: Date;
  /** The newest run with its result. No token counts: those are captains'. */
  latestRun: RecipeRunDetail | null;
  currentVersion: RecipeVersionDetail | null;
  /** The plate counts the accepted version has a result for, smallest first. */
  plateCounts: PlateCountSummary[];
  /** Plate counts with a run queued or under way on the accepted version. */
  openPlateRuns: number[];
  /**
   * Plate counts whose newest run on the accepted version failed, and that
   * have no result and no run open: why the paid run gave nothing.
   */
  failedPlateRuns: FailedPlateRun[];
  /** Every version, newest first, each readable on the History tab. */
  versions: {
    id: string;
    version: number;
    /** The plates the version is written for. */
    plates: number;
    recipe: KitchenRecipe;
    /** Claude's report; the page shows it to the Kitchen's reviewers only. */
    report: DraftReport | null;
    scalingNotes: string[];
    reason: string | null;
    runId: string | null;
    authorName: string | null;
    createdAt: Date;
  }[];
  /** Every lesson, newest first, each on the version it was learned on. */
  lessons: {
    id: string;
    versionId: string;
    body: string;
    cycle: number;
    authorName: string | null;
    createdAt: Date;
  }[];
  history: RecipeHistoryEntry[];
}

/** A run row as the page reads it: its draft parsed, never trusted. */
export function runDetail(run: {
  id: string;
  outcome: RunOutcome;
  requestedAt: Date;
  finishedAt: Date | null;
  note: string | null;
  plates: number | null;
  promptVersion: string;
  model: string;
  error: string | null;
  result: unknown;
  stage?: string | null;
}): RecipeRunDetail {
  const { result, stage, ...rest } = run;
  const draft = readDraft(result);
  const questions = run.outcome === "succeeded" ? readQuestions(result) : null;
  return {
    ...rest,
    draft,
    // Questions are a readable answer, not an older shape.
    draftUnreadable:
      result !== null && result !== undefined && !draft && !questions,
    stage: isRunStage(stage) ? stage : null,
    questions,
  };
}

/** A version's stored body; a row the migration has not reached reads bare. */
function versionRecipe(
  body: KitchenRecipe | null,
  fallback: { title: string; plates: number },
): KitchenRecipe {
  return (
    body ?? {
      title: fallback.title,
      summary: null,
      plates: fallback.plates,
      totalTimeMinutes: null,
      activeTimeMinutes: null,
      ingredients: [],
      steps: [],
      notes: [],
    }
  );
}

/** Everything the recipe page shows. Null when there is no such recipe. */
export async function getRecipeDetail(
  recipeId: string,
): Promise<RecipeDetail | null> {
  if (!UUID.test(recipeId)) return null;
  const db = createHttpDb();
  const submitter = alias(schema.users, "submitter");
  const rerunRequester = alias(schema.users, "rerun_requester");
  const [recipe] = await db
    .select({
      row: schema.recipes,
      submitterName: submitter.displayName,
      rerunRequesterName: rerunRequester.displayName,
    })
    .from(schema.recipes)
    .leftJoin(submitter, eq(submitter.id, schema.recipes.submitterId))
    .leftJoin(
      rerunRequester,
      eq(rerunRequester.id, schema.recipes.rerunRequestedBy),
    )
    .where(eq(schema.recipes.id, recipeId));
  if (!recipe) return null;
  const r = recipe.row;

  const author = alias(schema.users, "author");
  const [runRows, versionRows, lessonRows, historyRows] = await Promise.all([
    r.latestRunId
      ? db
          .select({
            id: schema.recipeProofreadRuns.id,
            outcome: schema.recipeProofreadRuns.outcome,
            requestedAt: schema.recipeProofreadRuns.requestedAt,
            finishedAt: schema.recipeProofreadRuns.finishedAt,
            note: schema.recipeProofreadRuns.note,
            plates: schema.recipeProofreadRuns.plates,
            promptVersion: schema.recipeProofreadRuns.promptVersion,
            model: schema.recipeProofreadRuns.model,
            error: schema.recipeProofreadRuns.error,
            result: schema.recipeProofreadRuns.result,
            stage: schema.recipeProofreadRuns.stage,
          })
          .from(schema.recipeProofreadRuns)
          .where(eq(schema.recipeProofreadRuns.id, r.latestRunId))
      : Promise.resolve([]),
    db
      .select({
        id: schema.recipeVersions.id,
        version: schema.recipeVersions.version,
        servingsBasis: schema.recipeVersions.servingsBasis,
        body: schema.recipeVersions.body,
        report: schema.recipeVersions.report,
        scalingNotes: schema.recipeVersions.scalingNotes,
        runId: schema.recipeVersions.runId,
        reason: schema.recipeVersions.reason,
        authorName: author.displayName,
        createdAt: schema.recipeVersions.createdAt,
      })
      .from(schema.recipeVersions)
      .leftJoin(author, eq(author.id, schema.recipeVersions.authorId))
      .where(eq(schema.recipeVersions.recipeId, recipeId))
      .orderBy(desc(schema.recipeVersions.version)),
    db
      .select({
        id: schema.recipeLessons.id,
        versionId: schema.recipeLessons.versionId,
        body: schema.recipeLessons.body,
        cycle: schema.recipeLessons.cycle,
        authorName: author.displayName,
        createdAt: schema.recipeLessons.createdAt,
      })
      .from(schema.recipeLessons)
      .leftJoin(author, eq(author.id, schema.recipeLessons.authorId))
      .where(eq(schema.recipeLessons.recipeId, recipeId))
      .orderBy(desc(schema.recipeLessons.createdAt)),
    db
      .select({
        action: schema.auditLog.action,
        actorName: author.displayName,
        metadata: schema.auditLog.metadata,
        createdAt: schema.auditLog.createdAt,
      })
      .from(schema.auditLog)
      .leftJoin(author, eq(author.id, schema.auditLog.actorId))
      .where(
        and(
          eq(schema.auditLog.target, recipeId),
          sql`${schema.auditLog.action} like 'recipe.%'`,
        ),
      )
      .orderBy(asc(schema.auditLog.createdAt)),
  ]);

  let currentVersion: RecipeVersionDetail | null = null;
  let plateCounts: PlateCountSummary[] = [];
  let openPlateRuns: number[] = [];
  let failedPlateRuns: FailedPlateRun[] = [];
  const current = versionRows.find((v) => v.id === r.acceptedVersionId);
  if (current) {
    currentVersion = {
      id: current.id,
      version: current.version,
      plates: current.servingsBasis,
      recipe: versionRecipe(current.body, {
        title: r.title ?? UNTITLED_RECIPE,
        plates: current.servingsBasis,
      }),
      report: readReport(current.report),
      scalingNotes: current.scalingNotes,
      runId: current.runId,
      reason: current.reason,
      authorName: current.authorName,
      createdAt: current.createdAt,
    };
    const [counts, plateRuns] = await Promise.all([
      db
        .select({
          plates: schema.recipePlateCounts.plates,
          source: schema.recipePlateCounts.source,
          pots: schema.recipePlateCounts.pots,
          createdAt: schema.recipePlateCounts.createdAt,
        })
        .from(schema.recipePlateCounts)
        .where(eq(schema.recipePlateCounts.versionId, current.id))
        .orderBy(asc(schema.recipePlateCounts.plates)),
      db
        .select({
          plates: schema.recipeProofreadRuns.plates,
          outcome: schema.recipeProofreadRuns.outcome,
          error: schema.recipeProofreadRuns.error,
          finishedAt: schema.recipeProofreadRuns.finishedAt,
        })
        .from(schema.recipeProofreadRuns)
        .where(
          and(
            eq(schema.recipeProofreadRuns.versionId, current.id),
            eq(schema.recipeProofreadRuns.kind, "plates"),
          ),
        )
        .orderBy(desc(schema.recipeProofreadRuns.requestedAt)),
    ]);
    plateCounts = counts.map((c) => ({
      ...c,
      source: c.source === "proofread" ? "proofread" : "version",
    }));
    openPlateRuns = plateRuns
      .filter((o) => o.outcome === "queued" || o.outcome === "running")
      .map((o) => o.plates)
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);
    failedPlateRuns = failedPlateCounts(
      plateRuns,
      plateCounts.map((c) => c.plates),
      openPlateRuns,
    );
  }

  return {
    id: r.id,
    title: r.title ?? UNTITLED_RECIPE,
    status: r.status,
    source: r.source,
    sourceUrl: r.sourceUrl,
    text: r.rawText,
    suitabilityNote: r.suitabilityNote,
    submitterId: r.submitterId,
    submitterName: recipe.submitterName,
    textAuthorId: r.textAuthorId,
    blockedReason: textBlockedReason(r),
    rerunRequest:
      r.rerunRequest && r.rerunRequestedAt
        ? {
            note: r.rerunRequest,
            byName: recipe.rerunRequesterName,
            at: r.rerunRequestedAt,
          }
        : null,
    changesNote: r.changesNote,
    rejectionReason: r.rejectionReason,
    lastError: r.lastError,
    acceptedVersionId: r.acceptedVersionId,
    createdAt: r.createdAt,
    latestRun: runRows[0] ? runDetail(runRows[0]) : null,
    currentVersion,
    plateCounts,
    openPlateRuns,
    failedPlateRuns,
    versions: versionRows.map((v) => ({
      id: v.id,
      version: v.version,
      plates: v.servingsBasis,
      recipe: versionRecipe(v.body, {
        title: r.title ?? UNTITLED_RECIPE,
        plates: v.servingsBasis,
      }),
      report: readReport(v.report),
      scalingNotes: v.scalingNotes,
      reason: v.reason,
      runId: v.runId,
      authorName: v.authorName,
      createdAt: v.createdAt,
    })),
    lessons: lessonRows,
    history: historyRows,
  };
}

/** A version's recipe for `plates` plates, or null when it has none yet. */
export async function getPlateCount(
  versionId: string,
  plates: number,
): Promise<PlateCountDetail | null> {
  if (!UUID.test(versionId) || !Number.isInteger(plates)) return null;
  const [row] = await createHttpDb()
    .select({
      plates: schema.recipePlateCounts.plates,
      lines: schema.recipePlateCounts.lines,
      pots: schema.recipePlateCounts.pots,
      notes: schema.recipePlateCounts.notes,
      report: schema.recipePlateCounts.report,
      source: schema.recipePlateCounts.source,
    })
    .from(schema.recipePlateCounts)
    .where(
      and(
        eq(schema.recipePlateCounts.versionId, versionId),
        eq(schema.recipePlateCounts.plates, plates),
      ),
    );
  if (!row) return null;
  return {
    ...row,
    report: readReport(row.report),
    source: row.source === "proofread" ? "proofread" : "version",
  };
}

export interface ProofreadRunRow {
  id: string;
  recipeId: string;
  recipeTitle: string;
  requestedByName: string | null;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  outcome: "queued" | "running" | "succeeded" | "failed";
  inputTokens: number | null;
  outputTokens: number | null;
  promptVersion: string;
  model: string;
  error: string | null;
}

/** The newest proofreading runs, for captains: tokens, never a price. */
export async function listProofreadRuns(
  options: { limit?: number } = {},
): Promise<ProofreadRunRow[]> {
  const limit = Math.min(Math.max(1, options.limit ?? 20), 200);
  const requester = alias(schema.users, "requester");
  const rows = await createHttpDb()
    .select({
      id: schema.recipeProofreadRuns.id,
      recipeId: schema.recipeProofreadRuns.recipeId,
      recipeTitle: schema.recipes.title,
      requestedByName: requester.displayName,
      requestedAt: schema.recipeProofreadRuns.requestedAt,
      startedAt: schema.recipeProofreadRuns.startedAt,
      finishedAt: schema.recipeProofreadRuns.finishedAt,
      outcome: schema.recipeProofreadRuns.outcome,
      inputTokens: schema.recipeProofreadRuns.inputTokens,
      outputTokens: schema.recipeProofreadRuns.outputTokens,
      promptVersion: schema.recipeProofreadRuns.promptVersion,
      model: schema.recipeProofreadRuns.model,
      error: schema.recipeProofreadRuns.error,
    })
    .from(schema.recipeProofreadRuns)
    .innerJoin(
      schema.recipes,
      eq(schema.recipes.id, schema.recipeProofreadRuns.recipeId),
    )
    .leftJoin(
      requester,
      eq(requester.id, schema.recipeProofreadRuns.requestedBy),
    )
    .orderBy(
      desc(schema.recipeProofreadRuns.requestedAt),
      desc(schema.recipeProofreadRuns.id),
    )
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    recipeTitle: r.recipeTitle ?? UNTITLED_RECIPE,
  }));
}

export interface TokenTotals {
  /** The start of this camp month. */
  since: Date;
  runs: number;
  inputTokens: number;
  outputTokens: number;
}

/** Tokens spent on proofreading this camp month (Johannesburg). */
export async function proofreadTokenTotals(now: Date): Promise<TokenTotals> {
  const since = campMonthStartOf(now);
  const [row] = await createHttpDb()
    .select({
      runs: sql<number>`count(*)::int`,
      inputTokens: sql<number>`coalesce(sum(${schema.recipeProofreadRuns.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.recipeProofreadRuns.outputTokens}), 0)::int`,
    })
    .from(schema.recipeProofreadRuns)
    .where(gte(schema.recipeProofreadRuns.requestedAt, since));
  return {
    since,
    runs: row?.runs ?? 0,
    inputTokens: row?.inputTokens ?? 0,
    outputTokens: row?.outputTokens ?? 0,
  };
}
