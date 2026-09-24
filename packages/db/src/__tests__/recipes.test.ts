import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AuditAction } from "@camp404/core";
import { sourceFromText, sourceText } from "@camp404/core";
import {
  KitchenRecipe,
  RECIPE_TEXT_MAX,
  type KitchenRecipeInput,
  type RecipeSourceSections,
  type SourceProofread,
  type PlateProofread,
  type RecipeDraft,
  type RecipeStatus,
} from "@camp404/types";
import * as schema from "../schema";
import {
  ADJUST_INSTRUCTION_NEEDED,
  ADJUST_VERSION_GONE,
  ANSWER_NEEDED,
  NEVER_STARTED_ERROR,
  NO_AI_CONSENT,
  NO_TEXT_TO_SEND,
  NOT_A_KITCHEN_REVIEWER,
  NOT_AN_APPROVED_MEMBER,
  ONLY_A_REVIEWER_SENDS,
  PLATE_RUN_VERSION_GONE,
  RECIPE_CHANGED,
  RECIPE_DECIDED,
  RERUN_NOTE_NEEDED,
  SENDER_NOT_A_REVIEWER,
  SERVES_OUT_OF_RANGE,
  TEXT_TOO_LONG,
  SOURCE_CHANGED,
  SOURCE_INVALID,
  STALE_RUN_ERROR,
  LESSON_VERSION_GONE,
  VERSION_CHANGED,
  DRAFT_UNREADABLE,
  acceptProofread,
  adjustReason,
  adjustVersion,
  answerProofreadQuestions,
  addLesson,
  catalogueLines,
  claimPlateRun,
  claimSourceRun,
  completePlateRun,
  completeSourceRun,
  decideRecipe,
  draftPlatesMismatch,
  failPlateRun,
  failRun,
  failedPlateCounts,
  forRecipe,
  getPlateCount,
  getProofreadProgress,
  getRecipeDetail,
  getRecipeSource,
  isOpenPlateRunConflict,
  listReadyToProofread,
  listRecipeBook,
  listReviewQueue,
  proofreadTokenTotals,
  queuePlateProofread,
  queueProofread,
  requestRerun,
  resetStaleRuns,
  resubmitRecipe,
  retypeRecipeText,
  sendSourceForProofreading,
  setRunStage,
  suggestRecipe,
  listRecipeSources,
} from "../recipes";
import { setMealPlan } from "../meal-plan";
import { setLead } from "../team-memberships";
import { useTestDb } from "./_harness";
import { makeMembership, makeUser, seedAcceptedVersion } from "./_factories";

// Recipes (#243) on a real Postgres (PGlite). What matters: who may decide,
// queue and accept, checked again inside each write; that a decision is
// compare-and-set; that the consent rule refuses a whole batch; and that the worker can only ever claim a recipe a captain queued.

const NOW = new Date("2026-09-24T10:00:00Z");
const PROMPT = "2026-09-24.1";
const MODEL = "claude-opus-4-8";

// Audit actions from the real vocabulary: a typo is a type error.
const APPROVED: AuditAction = "recipe.approved";
const REJECTED: AuditAction = "recipe.rejected";
const QUEUED: AuditAction = "recipe.proofread_queued";
const ACCEPTED: AuditAction = "recipe.accepted";
const RETYPED: AuditAction = "recipe.text_retyped";
const RERUN_REQUESTED: AuditAction = "recipe.rerun_requested";

function recipe(overrides: Partial<KitchenRecipeInput> = {}): KitchenRecipe {
  return KitchenRecipe.parse({
    title: "Red lentil dhal",
    plates: 40,
    ingredients: [
      {
        name: "Red lentils",
        category: "legume",
        quantity: 2.4,
        unit: "kg",
        preparation: "rinsed",
      },
      { name: "Salt", category: "spice", quantity: 2, unit: "tbsp" },
    ],
    steps: [
      {
        phase: "Prep",
        instruction: "Rinse the lentils.",
        uses: ["Red lentils"],
      },
      {
        phase: "Cook",
        instruction: "Simmer until soft, then salt.",
        uses: ["Red lentils", "Salt"],
        durationMinutes: 25,
      },
    ],
    notes: [{ kind: "warning", body: "It catches on a big burner; stir." }],
    ...overrides,
  });
}

function draft(overrides: Partial<KitchenRecipeInput> = {}): RecipeDraft {
  return {
    recipe: recipe(overrides),
    report: { changed: ["Cups to kilograms."], unsure: [] },
  };
}

describe("recipes", () => {
  const h = useTestDb();

  async function people() {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const kitchenLead = await makeUser(db);
    await makeMembership(db, {
      userId: kitchenLead.id,
      team: "kitchen",
      isLead: true,
    });
    const structuresLead = await makeUser(db);
    await makeMembership(db, {
      userId: structuresLead.id,
      team: "structures",
      isLead: true,
    });
    const member = await makeUser(db);
    return { captain, kitchenLead, structuresLead, member };
  }

  async function suggest(
    submitterId: string,
    overrides: Partial<Parameters<typeof suggestRecipe>[0]> = {},
  ): Promise<string> {
    const made = await suggestRecipe({
      submitterId,
      title: "Dhal",
      source: "text",
      sourceUrl: null,
      text: "2 cups red lentils, salt. Simmer.",
      suitabilityNote: "Cheap and vegan.",
      aiConsent: true,
      now: NOW,
      ...overrides,
    });
    if (!made.ok) throw new Error(made.error);
    return made.id;
  }

  /** A suggestion a captain has approved, ready for proofreading. */
  async function approved(
    submitterId: string,
    captainId: string,
    overrides: Partial<Parameters<typeof suggestRecipe>[0]> = {},
  ): Promise<string> {
    const id = await suggest(submitterId, overrides);
    const decided = await decideRecipe({
      recipeId: id,
      actorId: captainId,
      decision: "approve",
    });
    if (!decided.ok) throw new Error(decided.error);
    return id;
  }

  function queue(actorId: string, recipeIds: string[], now = NOW) {
    return queueProofread({
      recipeIds,
      actorId,
      note: null,
      plates: 40,
      now,
      promptVersion: PROMPT,
      model: MODEL,
    });
  }

  /**
   * An older `recipe` run that came back with a draft for a reviewer, as rows
   * written before source runs look. Nothing writes one any more: the run is
   * queued as a `source` run, then rewritten into the old shape, with its
   * recipe `proofread` and pointing at it, so the accept path that still
   * reads these rows stays covered.
   */
  async function legacyDraft(
    actorId: string,
    recipeId: string,
    options: {
      result?: RecipeDraft;
      usage?: { inputTokens: number; outputTokens: number };
      now?: Date;
    } = {},
  ): Promise<string> {
    const now = options.now ?? NOW;
    const q = await queue(actorId, [recipeId], now);
    if (!q.ok) throw new Error(q.error);
    const runId = q.runIds[0]!;
    const usage = options.usage ?? { inputTokens: 1, outputTokens: 1 };
    await h
      .db()
      .update(schema.recipeProofreadRuns)
      .set({
        kind: "recipe",
        sourceId: null,
        exchange: null,
        outcome: "succeeded",
        startedAt: now,
        finishedAt: now,
        result: options.result ?? draft(),
        ...usage,
      })
      .where(eq(schema.recipeProofreadRuns.id, runId));
    await h
      .db()
      .update(schema.recipes)
      .set({ status: "proofread", latestRunId: runId })
      .where(eq(schema.recipes.id, recipeId));
    return runId;
  }

  async function statusOf(id: string): Promise<RecipeStatus | undefined> {
    const [row] = await h
      .db()
      .select({ status: schema.recipes.status })
      .from(schema.recipes)
      .where(eq(schema.recipes.id, id));
    return row?.status;
  }

  async function auditRows(action: AuditAction) {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  async function runCount(): Promise<number> {
    return (await h.db().select().from(schema.recipeProofreadRuns)).length;
  }

  it("carries a suggestion through approval, proofreading and acceptance, auditing each privileged step", async () => {
    const { captain, kitchenLead, member } = await people();
    const id = await suggest(member.id);
    expect(await statusOf(id)).toBe("suggested");
    expect((await listReviewQueue()).map((r) => r.id)).toEqual([id]);

    expect(
      await decideRecipe({
        recipeId: id,
        actorId: kitchenLead.id,
        decision: "approve",
      }),
    ).toEqual({ ok: true });
    expect(await statusOf(id)).toBe("approved");
    const [approval] = await auditRows(APPROVED);
    expect(approval).toMatchObject({ actorId: kitchenLead.id, target: id });

    // An older draft run, still waiting for a reviewer from before source
    // runs wrote straight into the book.
    const runId = await legacyDraft(captain.id, id, {
      usage: { inputTokens: 1200, outputTokens: 800 },
    });
    const [queuedAudit] = await auditRows(QUEUED);
    expect(queuedAudit).toMatchObject({
      actorId: captain.id,
      target: id,
      metadata: { runId, plates: 40, promptVersion: PROMPT, model: MODEL },
    });
    expect(await statusOf(id)).toBe("proofread");

    const accepted = await acceptProofread({
      recipeId: id,
      runId,
      actorId: kitchenLead.id,
    });
    expect(accepted).toMatchObject({ ok: true, version: 1 });
    expect(await statusOf(id)).toBe("accepted");
    const [acceptAudit] = await auditRows(ACCEPTED);
    expect(acceptAudit).toMatchObject({
      actorId: kitchenLead.id,
      target: id,
      metadata: { version: 1, runId },
    });

    const book = await listRecipeBook();
    expect(book).toEqual([
      expect.objectContaining({
        id,
        title: "Red lentil dhal",
        version: 1,
        plates: 40,
        readyPlates: [40],
      }),
    ]);
    const detail = await getRecipeDetail(id);
    expect(detail?.currentVersion?.recipe).toEqual(recipe());
    expect(detail?.currentVersion?.plates).toBe(40);
    // The report is the run's own.
    expect(detail?.currentVersion?.report).toEqual(draft().report);
    expect(detail?.currentVersion?.runId).toBe(runId);
    expect(detail?.latestRun?.draft).toEqual(draft());
    expect(detail?.plateCounts).toEqual([
      expect.objectContaining({ plates: 40, source: "version", pots: null }),
    ]);
    expect(detail?.openPlateRuns).toEqual([]);
    expect(detail?.history.map((e) => e.action)).toEqual([
      APPROVED,
      QUEUED,
      ACCEPTED,
    ]);
    expect(await proofreadTokenTotals(NOW)).toMatchObject({
      runs: 1,
      inputTokens: 1200,
      outputTokens: 800,
    });
  });

  it("writes a version's body and its own plate count in one transaction", async () => {
    const { captain, kitchenLead, member } = await people();
    const id = await approved(member.id, captain.id);
    const runId = await legacyDraft(captain.id, id, {
      result: draft({ plates: 45 }),
    });

    // Claude wrote it for 45: the body and the plate row both say 45, and the
    // recipe takes Claude's title.
    const accepted = await acceptProofread({
      recipeId: id,
      runId,
      actorId: kitchenLead.id,
    });
    if (!accepted.ok) throw new Error(accepted.error);
    const [version] = await h
      .db()
      .select()
      .from(schema.recipeVersions)
      .where(eq(schema.recipeVersions.id, accepted.versionId));
    expect(version).toMatchObject({
      servingsBasis: 45,
      body: recipe({ plates: 45 }),
      report: draft().report,
      method: null,
      prepPlan: null,
      flags: null,
    });
    // The legacy table is no longer written.
    expect(
      await h.db().select().from(schema.recipeVersionIngredients),
    ).toHaveLength(0);
    expect(await getPlateCount(accepted.versionId, 45)).toEqual({
      plates: 45,
      lines: [
        {
          name: "Red lentils",
          quantity: 2.4,
          quantityMax: null,
          unit: "kg",
          note: null,
        },
        {
          name: "Salt",
          quantity: 2,
          quantityMax: null,
          unit: "tbsp",
          note: null,
        },
      ],
      pots: null,
      notes: [],
      report: null,
      source: "version",
    });
    expect(await getPlateCount(accepted.versionId, 40)).toBeNull();
    const detail = await getRecipeDetail(id);
    expect(detail?.title).toBe("Red lentil dhal");
  });

  it("writes neither the version nor its plate count when the accept is refused", async () => {
    const { captain, kitchenLead, member } = await people();
    const id = await approved(member.id, captain.id);
    // A draft stored in a shape that no longer reads as a recipe: a step
    // that uses a line the recipe does not have.
    const broken = draft();
    broken.recipe.steps[0]!.uses = ["Red lentils", "Cumin"];
    const runId = await legacyDraft(captain.id, id, { result: broken });
    const refused = await acceptProofread({
      recipeId: id,
      runId,
      actorId: kitchenLead.id,
    });
    expect(refused).toEqual({ ok: false, error: DRAFT_UNREADABLE });
    // Nor for a run the reviewer did not read.
    expect(
      await acceptProofread({
        recipeId: id,
        runId: "00000000-0000-4000-8000-000000000000",
        actorId: kitchenLead.id,
      }),
    ).toEqual({ ok: false, error: RECIPE_CHANGED });
    expect(await h.db().select().from(schema.recipeVersions)).toHaveLength(0);
    expect(await h.db().select().from(schema.recipePlateCounts)).toHaveLength(
      0,
    );
    expect(await h.db().select().from(schema.ingredients)).toHaveLength(0);
    expect(await statusOf(id)).toBe("proofread");
    expect(await auditRows(ACCEPTED)).toHaveLength(0);
  });

  it("accepts only the run's own draft: a recipe from the caller is never stored", async () => {
    const { captain, kitchenLead, member } = await people();
    const id = await approved(member.id, captain.id);
    const runId = await legacyDraft(captain.id, id);
    // A crafted request carrying a hand-written body under Claude's name.
    const accepted = await acceptProofread({
      recipeId: id,
      runId,
      actorId: kitchenLead.id,
      recipe: recipe({ title: "Hand-written", plates: 45 }),
    } as Parameters<typeof acceptProofread>[0]);
    if (!accepted.ok) throw new Error(accepted.error);
    const [version] = await h
      .db()
      .select({ body: schema.recipeVersions.body })
      .from(schema.recipeVersions)
      .where(eq(schema.recipeVersions.id, accepted.versionId));
    expect(version?.body).toEqual(draft().recipe);
  });

  it("files each ingredient in the catalogue once, filling only an empty category", async () => {
    const { captain } = await people();
    const first = await approved(captain.id, captain.id);
    const firstRun = await legacyDraft(captain.id, first);
    await acceptProofread({
      recipeId: first,
      runId: firstRun,
      actorId: captain.id,
    });
    await h
      .db()
      .update(schema.ingredients)
      .set({ category: null })
      .where(eq(schema.ingredients.name, "Salt"));
    const second = await approved(captain.id, captain.id, { title: "Soup" });
    const secondRun = await legacyDraft(captain.id, second, {
      result: draft({
        title: "Soup",
        ingredients: [
          { name: "RED LENTILS", category: "grain", quantity: 1, unit: "kg" },
          { name: "Salt", category: "spice", quantity: 1, unit: "tsp" },
        ],
        steps: [{ instruction: "Boil.", uses: ["red lentils", "salt"] }],
      }),
    });
    await acceptProofread({
      recipeId: second,
      runId: secondRun,
      actorId: captain.id,
    });
    const catalogue = await h.db().select().from(schema.ingredients);
    expect(catalogue.map((c) => [c.name, c.category]).sort()).toEqual([
      ["Red lentils", "legume"],
      ["Salt", "spice"],
    ]);
  });

  it("writes catalogue rows in name order, one per name, so two saves lock them alike", () => {
    const lines = recipe({
      ingredients: [
        { name: "Salt", category: "spice", quantity: 1, unit: "tsp" },
        { component: "Base", name: "onion", category: "produce", quantity: 2 },
        { name: "Garlic", category: "produce", quantity: 4 },
        { component: "To serve", name: "ONION", category: "herb" },
      ],
      steps: [
        {
          instruction: "Cook.",
          uses: ["Salt", "Garlic", "Base: onion", "To serve: ONION"],
        },
      ],
    });
    expect(catalogueLines(lines)).toEqual([
      { name: "Garlic", category: "produce" },
      { name: "onion", category: "produce" },
      { name: "Salt", category: "spice" },
    ]);
  });

  describe("who may decide", () => {
    it("refuses a lead of another team and a plain member", async () => {
      const { structuresLead, member } = await people();
      const id = await suggest(member.id);
      for (const actorId of [structuresLead.id, member.id]) {
        expect(
          await decideRecipe({ recipeId: id, actorId, decision: "approve" }),
        ).toEqual({ ok: false, error: NOT_A_KITCHEN_REVIEWER });
      }
      expect(await statusOf(id)).toBe("suggested");
      expect(await auditRows(APPROVED)).toHaveLength(0);
    });

    it("refuses a Kitchen lead whose lead flag was dropped before the write", async () => {
      const { kitchenLead, member } = await people();
      const id = await suggest(member.id);
      const dropped = await setLead({
        userId: kitchenLead.id,
        team: "kitchen",
        isLead: false,
      });
      expect(dropped).toEqual({ ok: true, changed: true });
      expect(
        await decideRecipe({
          recipeId: id,
          actorId: kitchenLead.id,
          decision: "approve",
        }),
      ).toEqual({ ok: false, error: NOT_A_KITCHEN_REVIEWER });
      expect(await statusOf(id)).toBe("suggested");
    });

    it("tells the second of two racing reviewers that the recipe was decided", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await suggest(member.id);
      expect(
        (
          await decideRecipe({
            recipeId: id,
            actorId: kitchenLead.id,
            decision: "approve",
          })
        ).ok,
      ).toBe(true);
      expect(
        await decideRecipe({
          recipeId: id,
          actorId: captain.id,
          decision: "reject",
          reason: "Too much chilli.",
        }),
      ).toEqual({ ok: false, error: RECIPE_DECIDED });
      expect(await statusOf(id)).toBe("approved");
      expect(await auditRows(REJECTED)).toHaveLength(0);
    });

    it("sends a suggestion back for changes, and the submitter's edit makes it a suggestion again", async () => {
      const { kitchenLead, member } = await people();
      const id = await suggest(member.id);
      await decideRecipe({
        recipeId: id,
        actorId: kitchenLead.id,
        decision: "request_changes",
        note: "Say how many it feeds.",
      });
      expect(await statusOf(id)).toBe("changes_requested");
      const other = await makeUser(h.db());
      expect(
        (
          await resubmitRecipe({
            recipeId: id,
            actorId: other.id,
            title: "Dhal",
            text: "x",
            suitabilityNote: null,
            aiConsent: true,
          })
        ).ok,
      ).toBe(false);
      expect(
        await resubmitRecipe({
          recipeId: id,
          actorId: member.id,
          title: "Dhal for 4",
          text: "Feeds 4.",
          suitabilityNote: null,
          aiConsent: true,
        }),
      ).toEqual({ ok: true });
      expect(await statusOf(id)).toBe("suggested");
    });

    it("refuses a resubmission from a member no longer approved", async () => {
      const { kitchenLead, member } = await people();
      const id = await suggest(member.id);
      await decideRecipe({
        recipeId: id,
        actorId: kitchenLead.id,
        decision: "request_changes",
        note: "Say how many it feeds.",
      });
      await h
        .db()
        .update(schema.users)
        .set({ approvalStatus: "pending" })
        .where(eq(schema.users.id, member.id));
      expect(
        await resubmitRecipe({
          recipeId: id,
          actorId: member.id,
          title: "Dhal for 4",
          text: "Feeds 4.",
          suitabilityNote: null,
          aiConsent: true,
        }),
      ).toEqual({ ok: false, error: NOT_AN_APPROVED_MEMBER });
      expect(await statusOf(id)).toBe("changes_requested");
    });
  });

  describe("asking a captain to run it again", () => {
    it("lets a Kitchen lead leave a note for the captains, audited, and clears it when a captain queues", async () => {
      const { captain, kitchenLead, structuresLead, member } = await people();
      const id = await approved(member.id, captain.id);
      await legacyDraft(captain.id, id);

      for (const actorId of [structuresLead.id, member.id]) {
        expect(
          await requestRerun({ recipeId: id, actorId, note: "Use grams." }),
        ).toEqual({ ok: false, error: NOT_A_KITCHEN_REVIEWER });
      }
      expect(
        await requestRerun({
          recipeId: id,
          actorId: kitchenLead.id,
          note: " ",
        }),
      ).toEqual({ ok: false, error: RERUN_NOTE_NEEDED });
      expect(await auditRows(RERUN_REQUESTED)).toHaveLength(0);

      expect(
        await requestRerun({
          recipeId: id,
          actorId: kitchenLead.id,
          note: "Use grams, not cups.",
        }),
      ).toEqual({ ok: true });
      // Asking costs nothing: no run, and the status is unchanged.
      expect(await runCount()).toBe(1);
      expect(await statusOf(id)).toBe("proofread");
      const [audit] = await auditRows(RERUN_REQUESTED);
      expect(audit).toMatchObject({
        actorId: kitchenLead.id,
        target: id,
        metadata: { title: "Dhal", note: "Use grams, not cups." },
      });
      expect(
        (await listReadyToProofread()).find((r) => r.id === id)?.rerunRequest,
      ).toEqual({
        note: "Use grams, not cups.",
        byName: kitchenLead.displayName,
      });
      expect((await getRecipeDetail(id))?.rerunRequest).toMatchObject({
        note: "Use grams, not cups.",
        byName: kitchenLead.displayName,
      });

      expect((await queue(captain.id, [id])).ok).toBe(true);
      expect((await getRecipeDetail(id))?.rerunRequest).toBeNull();
    });

    it("refuses a recipe that cannot be queued", async () => {
      const { kitchenLead, member } = await people();
      const id = await suggest(member.id);
      expect(
        await requestRerun({
          recipeId: id,
          actorId: kitchenLead.id,
          note: "Use grams.",
        }),
      ).toEqual({ ok: false, error: RECIPE_CHANGED });
    });
  });

  describe("queueing proofreading", () => {
    it("lets a Kitchen lead send (2A), refuses a Structures lead and a member, and writes a source run", async () => {
      const { captain, kitchenLead, structuresLead, member } = await people();
      const id = await approved(member.id, captain.id);
      for (const actorId of [structuresLead.id, member.id]) {
        expect(await queue(actorId, [id])).toEqual({
          ok: false,
          error: ONLY_A_REVIEWER_SENDS,
        });
      }
      expect(await runCount()).toBe(0);
      expect(await auditRows(QUEUED)).toHaveLength(0);
      expect(await statusOf(id)).toBe("approved");

      const q = await queue(kitchenLead.id, [id]);
      if (!q.ok) throw new Error(q.error);
      const [run] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, q.runIds[0]!));
      const source = await getRecipeSource(id);
      expect(run).toMatchObject({
        kind: "source",
        sourceId: source?.id,
        stage: null,
        exchange: [],
        requestedBy: kitchenLead.id,
        plates: 40,
      });
      expect(await statusOf(id)).toBe("queued");
    });

    it("refuses, recipe by recipe, a batch whose recipe has no source", async () => {
      const { captain } = await people();
      const [linked] = await h
        .db()
        .insert(schema.recipes)
        .values({
          source: "url",
          status: "approved",
          title: "Link only",
          sourceUrl: "https://example.com/dhal",
        })
        .returning({ id: schema.recipes.id });
      expect(await queue(captain.id, [linked!.id])).toEqual({
        ok: false,
        error: forRecipe("Link only", NO_TEXT_TO_SEND),
      });
      expect(await runCount()).toBe(0);
    });

    it("has no daily limit: a batch and one more on the same camp day all queue", async () => {
      const { captain, member } = await people();
      const ids = [];
      for (let i = 0; i < 4; i++)
        ids.push(await approved(member.id, captain.id));
      // A batch, then one more on its own, all on the same camp day.
      expect((await queue(captain.id, ids.slice(0, 3))).ok).toBe(true);
      expect((await queue(captain.id, [ids[3]!])).ok).toBe(true);
      expect(await runCount()).toBe(4);
    });

    it("refuses text its author did not agree to send, until a reviewer retypes it", async () => {
      const { captain, kitchenLead, member } = await people();
      const ok = await approved(member.id, captain.id);
      const id = await approved(member.id, captain.id, {
        title: "Secret curry",
        aiConsent: false,
      });
      // The whole batch goes back, the recipe that was fine too.
      expect(await queue(captain.id, [ok, id])).toEqual({
        ok: false,
        error: forRecipe("Secret curry", NO_AI_CONSENT),
      });
      expect(await runCount()).toBe(0);
      expect(await statusOf(ok)).toBe("approved");
      const ready = await listReadyToProofread();
      expect(ready.find((r) => r.id === id)?.blockedReason).toBe(NO_AI_CONSENT);

      expect(
        await retypeRecipeText({
          recipeId: id,
          actorId: kitchenLead.id,
          text: "Curry, retyped by the Kitchen lead.",
        }),
      ).toEqual({ ok: true });
      expect(await auditRows(RETYPED)).toHaveLength(1);
      expect((await queue(captain.id, [id])).ok).toBe(true);
    });

    it("lets a Kitchen lead who suggested unticked clear their own recipe by retyping it", async () => {
      const { captain, kitchenLead } = await people();
      const id = await approved(kitchenLead.id, captain.id, {
        title: "Lead's own stew",
        aiConsent: false,
      });
      expect((await queue(captain.id, [id])).ok).toBe(false);
      expect(
        await retypeRecipeText({
          recipeId: id,
          actorId: kitchenLead.id,
          text: "Stew, retyped by the lead who suggested it.",
        }),
      ).toEqual({ ok: true });
      expect((await queue(captain.id, [id])).ok).toBe(true);
    });

    it("asks the member again when they resubmit their own words after a reviewer's retype", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await suggest(member.id, {
        title: "Unticked soup",
        aiConsent: false,
      });
      // The lead retypes the suggestion, which is their agreement for their
      // own words, then asks the member for changes.
      expect(
        await retypeRecipeText({
          recipeId: id,
          actorId: kitchenLead.id,
          text: "Soup, retyped by the Kitchen lead.",
        }),
      ).toEqual({ ok: true });
      await decideRecipe({
        recipeId: id,
        actorId: kitchenLead.id,
        decision: "request_changes",
        note: "Say how many it feeds.",
      });
      // The member writes new words and leaves the box unticked.
      expect(
        await resubmitRecipe({
          recipeId: id,
          actorId: member.id,
          title: "Unticked soup",
          text: "Soup for 40, the member's own words.",
          suitabilityNote: null,
          aiConsent: false,
        }),
      ).toEqual({ ok: true });
      await decideRecipe({
        recipeId: id,
        actorId: kitchenLead.id,
        decision: "approve",
      });
      expect(await queue(captain.id, [id])).toEqual({
        ok: false,
        error: forRecipe("Unticked soup", NO_AI_CONSENT),
      });
      expect(await runCount()).toBe(0);
    });

    it("sends a resubmitted text the member ticked for", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await suggest(member.id, { aiConsent: false });
      await decideRecipe({
        recipeId: id,
        actorId: kitchenLead.id,
        decision: "request_changes",
        note: "Say how many it feeds.",
      });
      await resubmitRecipe({
        recipeId: id,
        actorId: member.id,
        title: "Dhal",
        text: "Dhal for 40.",
        suitabilityNote: null,
        aiConsent: true,
      });
      await decideRecipe({
        recipeId: id,
        actorId: kitchenLead.id,
        decision: "approve",
      });
      expect((await queue(captain.id, [id])).ok).toBe(true);
    });

    it("does not let the account-wide switch stand in for an unticked box", async () => {
      const { captain } = await people();
      // ai_data_consent is about ID documents shown to MCP sessions. A member
      // who left the recipe's box unticked has not agreed to send its text.
      const consenting = await makeUser(h.db(), { aiDataConsent: true });
      const id = await approved(consenting.id, captain.id, {
        title: "Unticked",
        aiConsent: false,
      });
      expect(await queue(captain.id, [id])).toEqual({
        ok: false,
        error: forRecipe("Unticked", NO_AI_CONSENT),
      });
      expect(
        (await listReadyToProofread()).find((r) => r.id === id)?.blockedReason,
      ).toBe(NO_AI_CONSENT);
      expect((await getRecipeDetail(id))?.blockedReason).toBe(NO_AI_CONSENT);
      expect(await runCount()).toBe(0);
    });

    it("refuses text that is only a link: Claude does not open links", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id, {
        title: "Linked",
        text: "  https://www.noble-notations.com/recipes/gai-yang-isaan-oven ",
      });
      expect(await queue(captain.id, [id])).toEqual({
        ok: false,
        error: forRecipe("Linked", NO_TEXT_TO_SEND),
      });
      expect(
        (await listReadyToProofread()).find((r) => r.id === id)?.blockedReason,
      ).toBe(NO_TEXT_TO_SEND);
      expect(await runCount()).toBe(0);
      // A link with the recipe's words around it is fine.
      const withText = await approved(member.id, captain.id, {
        text: "Gai yang: marinate, then roast. From https://example.com/gai-yang",
      });
      expect((await queue(captain.id, [withText])).ok).toBe(true);
    });

    it("names a suggestion from its text's first line when no name is typed", async () => {
      const { member } = await people();
      const id = await suggest(member.id, {
        title: null,
        text: "\n## **Gai yang** (Isaan, oven)\n1 kg tofu",
      });
      expect((await getRecipeDetail(id))?.title).toBe("Gai yang (Isaan, oven)");
      expect(
        await suggestRecipe({
          submitterId: member.id,
          title: "Soup",
          source: "text",
          sourceUrl: null,
          text: "  ",
          suitabilityNote: null,
          aiConsent: true,
          now: NOW,
        }),
      ).toEqual({ ok: false, error: "Paste the recipe text." });
    });
  });

  describe("the worker", () => {
    it("claims nothing whose recipe is not queued, even when a stray queued run points at it", async () => {
      const { captain, member } = await people();
      const db = h.db();
      const statuses: RecipeStatus[] = [
        "suggested",
        "approved",
        "proofread",
        "accepted",
        "analysing",
      ];
      const strays: string[] = [];
      for (const status of statuses) {
        const id = await suggest(member.id);
        const source = await getRecipeSource(id);
        const [run] = await db
          .insert(schema.recipeProofreadRuns)
          .values({
            recipeId: id,
            requestedBy: captain.id,
            // Last month, so they do not use up today's cap.
            requestedAt: new Date("2026-08-01T10:00:00Z"),
            promptVersion: PROMPT,
            model: MODEL,
            outcome: "queued",
            kind: "source",
            sourceId: source!.id,
            plates: 40,
          })
          .returning({ id: schema.recipeProofreadRuns.id });
        await db
          .update(schema.recipes)
          .set({ status, latestRunId: run!.id })
          .where(eq(schema.recipes.id, id));
        strays.push(run!.id);
      }
      for (const runId of strays) {
        expect(await claimSourceRun(runId)).toBeNull();
      }
      const running = await db
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.outcome, "running"));
      expect(running).toHaveLength(0);

      // A real queued run beside them is still claimed.
      const real = await approved(member.id, captain.id);
      const q = await queue(captain.id, [real]);
      if (!q.ok) throw new Error(q.error);
      expect((await claimSourceRun(q.runIds[0]!))?.recipeId).toBe(real);
      for (const [i, status] of statuses.entries()) {
        const [run] = await db
          .select({ outcome: schema.recipeProofreadRuns.outcome })
          .from(schema.recipeProofreadRuns)
          .where(eq(schema.recipeProofreadRuns.id, strays[i]!));
        expect({ status, outcome: run?.outcome }).toEqual({
          status,
          outcome: "queued",
        });
      }
    });

    it("never claims an older `recipe` run; the stale reset hands its recipe back", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const q = await queue(captain.id, [id]);
      if (!q.ok) throw new Error(q.error);
      const runId = q.runIds[0]!;
      // A text run queued before source runs, still waiting on deploy day.
      await h
        .db()
        .update(schema.recipeProofreadRuns)
        .set({ kind: "recipe", sourceId: null, exchange: null })
        .where(eq(schema.recipeProofreadRuns.id, runId));
      expect(await claimSourceRun(runId)).toBeNull();
      expect(await claimPlateRun(runId)).toBeNull();
      expect(await statusOf(id)).toBe("queued");

      expect(await resetStaleRuns(new Date("2026-09-24T10:11:00Z"))).toEqual({
        reset: 1,
      });
      expect(await getRecipeDetail(id)).toMatchObject({
        status: "approved",
        lastError: NEVER_STARTED_ERROR,
      });
    });

    it("sends a failed run's recipe back to approved with the error, keeping the tokens", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const q = await queue(captain.id, [id]);
      if (!q.ok) throw new Error(q.error);
      const runId = q.runIds[0]!;
      await claimSourceRun(runId);
      expect(
        await failRun({
          runId,
          error: "The reply did not match the recipe shape.",
          usage: { inputTokens: 900, outputTokens: 40 },
        }),
      ).toEqual({ ok: true });
      const [recipe] = await h
        .db()
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, id));
      expect(recipe).toMatchObject({
        status: "approved",
        lastError: "The reply did not match the recipe shape.",
      });
      const [run] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, runId));
      expect(run).toMatchObject({
        outcome: "failed",
        inputTokens: 900,
        outputTokens: 40,
      });
      // Nothing retried it.
      expect(await claimSourceRun(runId)).toBeNull();
    });

    it("fails, unsent, a queued run whose text lost its clearance, and still takes another", async () => {
      const { captain, member } = await people();
      const a = await approved(member.id, captain.id, { title: "Withdrawn" });
      const b = await approved(member.id, captain.id);
      const qa = await queue(captain.id, [a], new Date("2026-09-24T08:00:00Z"));
      const qb = await queue(captain.id, [b], new Date("2026-09-24T09:00:00Z"));
      if (!qa.ok || !qb.ok) throw new Error("queue failed");
      await h
        .db()
        .update(schema.recipes)
        .set({ aiConsentAt: null })
        .where(eq(schema.recipes.id, a));

      expect(await claimSourceRun(qa.runIds[0]!)).toBeNull();
      const [recipe] = await h
        .db()
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, a));
      expect(recipe).toMatchObject({
        status: "approved",
        lastError: NO_AI_CONSENT,
      });
      const [run] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, qa.runIds[0]!));
      expect(run).toMatchObject({ outcome: "failed", error: NO_AI_CONSENT });
      expect(run?.startedAt).toBeNull();
      expect((await claimSourceRun(qb.runIds[0]!))?.recipeId).toBe(b);
    });

    it("hands a failed re-run of a proofread recipe back with the earlier result still acceptable", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const r1 = await legacyDraft(captain.id, id);

      const second = await queue(captain.id, [id]);
      if (!second.ok) throw new Error(second.error);
      await claimSourceRun(second.runIds[0]!);
      await failRun({ runId: second.runIds[0]!, error: "Timed out." });

      const detail = await getRecipeDetail(id);
      expect(detail).toMatchObject({
        status: "proofread",
        lastError: "Timed out.",
      });
      expect(detail?.latestRun?.id).toBe(r1);
      expect(
        await acceptProofread({
          recipeId: id,
          runId: r1,
          actorId: kitchenLead.id,
        }),
      ).toMatchObject({ ok: true, version: 1 });
    });

    it("keeps an accepted recipe accepted when its re-run fails or stops", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const v1 = await seedAcceptedVersion(h.db(), {
        recipeId: id,
        authorId: captain.id,
        reason: "First",
        recipe: recipe(),
      });

      const failed = await queue(captain.id, [id]);
      if (!failed.ok) throw new Error(failed.error);
      await claimSourceRun(failed.runIds[0]!);
      await failRun({ runId: failed.runIds[0]!, error: "Timed out." });
      expect(await statusOf(id)).toBe("accepted");

      const stopped = await queue(captain.id, [id]);
      if (!stopped.ok) throw new Error(stopped.error);
      await claimSourceRun(
        stopped.runIds[0]!,
        new Date("2026-09-24T10:00:00Z"),
      );
      expect(await resetStaleRuns(new Date("2026-09-24T10:16:00Z"))).toEqual({
        reset: 1,
      });
      const detail = await getRecipeDetail(id);
      expect(detail).toMatchObject({
        status: "accepted",
        acceptedVersionId: v1.versionId,
        lastError: STALE_RUN_ERROR,
      });
      expect((await listRecipeBook()).map((r) => r.id)).toEqual([id]);
    });

    it("fails runs that stopped, and returns their recipes to approved", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const q = await queue(captain.id, [id]);
      if (!q.ok) throw new Error(q.error);
      const started = new Date("2026-09-24T10:00:00Z");
      await claimSourceRun(q.runIds[0]!, started);

      expect(await resetStaleRuns(new Date("2026-09-24T10:09:00Z"))).toEqual({
        reset: 0,
      });
      expect(await statusOf(id)).toBe("analysing");

      expect(await resetStaleRuns(new Date("2026-09-24T10:11:00Z"))).toEqual({
        reset: 1,
      });
      const [run] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, q.runIds[0]!));
      expect(run).toMatchObject({ outcome: "failed", error: STALE_RUN_ERROR });
      expect(await statusOf(id)).toBe("approved");
      // A late reply from the stopped run changes nothing.
      expect(
        await completeSourceRun({
          runId: q.runIds[0]!,
          result: {
            needsInfo: false,
            questions: [],
            recipe: recipe(),
            report: draft().report,
            scalingNotes: ["Kept as written."],
          },
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      ).toEqual({ ok: false, error: RECIPE_CHANGED });
    });

    it("hands back an older `recipe` run that stopped, as it always did", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const q = await queue(captain.id, [id]);
      if (!q.ok) throw new Error(q.error);
      const runId = q.runIds[0]!;
      await h
        .db()
        .update(schema.recipeProofreadRuns)
        .set({
          kind: "recipe",
          sourceId: null,
          exchange: null,
          outcome: "running",
          startedAt: new Date("2026-09-24T10:00:00Z"),
        })
        .where(eq(schema.recipeProofreadRuns.id, runId));
      await h
        .db()
        .update(schema.recipes)
        .set({ status: "analysing" })
        .where(eq(schema.recipes.id, id));
      expect(await resetStaleRuns(new Date("2026-09-24T10:11:00Z"))).toEqual({
        reset: 1,
      });
      expect(await getRecipeDetail(id)).toMatchObject({
        status: "approved",
        lastError: STALE_RUN_ERROR,
        latestRun: { id: runId, outcome: "failed" },
      });
    });
  });

  describe("runs that never started", () => {
    it("fails a queued run after ten minutes, unsent, and hands its recipe back", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const q = await queue(captain.id, [id]);
      if (!q.ok) throw new Error(q.error);
      const runId = q.runIds[0]!;
      expect(await statusOf(id)).toBe("queued");

      expect(await resetStaleRuns(new Date("2026-09-24T10:09:00Z"))).toEqual({
        reset: 0,
      });
      expect(await statusOf(id)).toBe("queued");

      expect(await resetStaleRuns(new Date("2026-09-24T10:11:00Z"))).toEqual({
        reset: 1,
      });
      const [run] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, runId));
      expect(run).toMatchObject({
        outcome: "failed",
        error: NEVER_STARTED_ERROR,
        startedAt: null,
      });
      const [row] = await h
        .db()
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, id));
      expect(row).toMatchObject({
        status: "approved",
        lastError: NEVER_STARTED_ERROR,
      });
      // A late after() finds nothing to claim.
      expect(await claimSourceRun(runId)).toBeNull();
      // It is queued again from where it was.
      expect((await queue(captain.id, [id])).ok).toBe(true);
    });

    it("changes only its own row for a plate-count run", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const v1 = await seedAcceptedVersion(h.db(), {
        recipeId: id,
        authorId: captain.id,
        reason: "First",
        recipe: recipe(),
      });
      const [run] = await h
        .db()
        .insert(schema.recipeProofreadRuns)
        .values({
          recipeId: id,
          requestedBy: captain.id,
          requestedAt: NOW,
          promptVersion: PROMPT,
          model: MODEL,
          outcome: "queued",
          kind: "plates",
          plates: 45,
          versionId: v1.versionId,
        })
        .returning({ id: schema.recipeProofreadRuns.id });
      expect((await getRecipeDetail(id))?.openPlateRuns).toEqual([45]);

      expect(await resetStaleRuns(new Date("2026-09-24T10:11:00Z"))).toEqual({
        reset: 1,
      });
      const [after] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, run!.id));
      expect(after).toMatchObject({
        outcome: "failed",
        error: NEVER_STARTED_ERROR,
      });
      const detail = await getRecipeDetail(id);
      expect(detail).toMatchObject({ status: "accepted", lastError: null });
      expect(detail?.openPlateRuns).toEqual([]);
    });
  });

  describe("lessons", () => {
    it("takes a lesson on one of an accepted recipe's versions only, and keeps which one", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const other = await approved(member.id, captain.id, {
        title: "Other dhal",
      });
      const v1 = await seedAcceptedVersion(h.db(), {
        recipeId: id,
        authorId: captain.id,
        reason: "First",
        recipe: recipe(),
      });
      const v2 = await seedAcceptedVersion(h.db(), {
        recipeId: id,
        authorId: captain.id,
        reason: "Second",
        recipe: recipe(),
      });
      const elsewhere = await seedAcceptedVersion(h.db(), {
        recipeId: other,
        authorId: captain.id,
        reason: "First",
        recipe: recipe(),
      });
      // Another recipe's version, or no real version, is refused.
      for (const versionId of [
        elsewhere.versionId,
        "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        "v1",
      ]) {
        expect(
          await addLesson({
            recipeId: id,
            versionId,
            authorId: member.id,
            body: "x",
          }),
        ).toEqual({ ok: false, error: LESSON_VERSION_GONE });
      }

      const lesson = await addLesson({
        recipeId: id,
        versionId: v1.versionId,
        authorId: member.id,
        body: "Tinned lentils work fine.",
      });
      expect(lesson.ok).toBe(true);
      const [stored] = await h.db().select().from(schema.recipeLessons);
      expect(stored).toMatchObject({
        recipeId: id,
        versionId: v1.versionId,
        cycle: 1,
      });
      expect((await getRecipeDetail(id))?.lessons).toEqual([
        expect.objectContaining({
          versionId: v1.versionId,
          body: "Tinned lentils work fine.",
        }),
      ]);
      expect(v2.versionId).not.toBe(v1.versionId);
    });

    it("refuses a lesson on a recipe with no accepted version", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      expect(
        (
          await addLesson({
            recipeId: id,
            versionId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
            authorId: member.id,
            body: "x",
          })
        ).ok,
      ).toBe(false);
    });
  });

  describe("plate counts", () => {
    const PLATES_QUEUED: AuditAction = "recipe.plates_queued";

    function answer(lentils: number, salt: number): PlateProofread {
      return {
        lines: [
          {
            name: "Red lentils",
            quantity: lentils,
            quantityMax: null,
            unit: "kg",
            note: null,
          },
          {
            name: "Salt",
            quantity: salt,
            quantityMax: null,
            unit: "tbsp",
            note: null,
          },
        ],
        pots: 2,
        notes: ["Cook in two pots."],
        report: { changed: ["Less salt than a straight resize."], unsure: [] },
      };
    }

    /** A recipe with an accepted version written for 40 plates. */
    async function accepted(captainId: string, memberId: string) {
      const id = await approved(memberId, captainId);
      const v = await seedAcceptedVersion(h.db(), {
        recipeId: id,
        authorId: captainId,
        reason: "First",
        recipe: recipe(),
      });
      return { id, versionId: v.versionId };
    }

    function plates(
      actorId: string,
      target: { id: string; versionId: string },
      count: number,
      options: { rerun?: boolean; now?: Date } = {},
    ) {
      return queuePlateProofread({
        recipeId: target.id,
        versionId: target.versionId,
        plates: count,
        rerun: options.rerun ?? false,
        actorId,
        now: options.now ?? NOW,
        promptVersion: PROMPT,
        model: MODEL,
      });
    }

    /** Queue, claim and store `count` plates; returns the run id. */
    async function proofread(
      captainId: string,
      target: { id: string; versionId: string },
      count: number,
      result: PlateProofread,
      rerun = false,
    ): Promise<string> {
      const q = await plates(captainId, target, count, { rerun });
      if (!q.ok) throw new Error(q.error);
      const claimed = await claimPlateRun(q.runId);
      if (!claimed) throw new Error("not claimed");
      const done = await completePlateRun({
        runId: q.runId,
        result,
        usage: { inputTokens: 900, outputTokens: 300 },
      });
      if (!done.ok) throw new Error(done.error);
      return q.runId;
    }

    it("queues a captain's run, audited, hands the worker the version alone, and stores the answer", async () => {
      const { captain, member } = await people();
      const target = await accepted(captain.id, member.id);
      const q = await plates(captain.id, target, 45);
      if (!q.ok) throw new Error(q.error);
      const [audit] = await auditRows(PLATES_QUEUED);
      expect(audit).toMatchObject({
        actorId: captain.id,
        target: target.id,
        metadata: {
          title: "Red lentil dhal",
          version: 1,
          plates: 45,
          runId: q.runId,
        },
      });
      expect((await getRecipeDetail(target.id))?.openPlateRuns).toEqual([45]);

      const claimed = await claimPlateRun(q.runId);
      expect(claimed).toEqual({
        runId: q.runId,
        recipeId: target.id,
        title: "Red lentil dhal",
        fromPlates: 40,
        plates: 45,
        recipe: recipe(),
      });
      // Never the member's text or their note.
      expect(JSON.stringify(claimed)).not.toContain("2 cups red lentils");
      expect(JSON.stringify(claimed)).not.toContain("Cheap and vegan");
      expect(await claimPlateRun(q.runId)).toBeNull();
      // Nor does the text worker take it.
      expect(await claimSourceRun(q.runId)).toBeNull();

      expect(
        await completePlateRun({
          runId: q.runId,
          result: answer(2.6, 2),
          usage: { inputTokens: 900, outputTokens: 300 },
        }),
      ).toEqual({ ok: true });
      expect(await getPlateCount(target.versionId, 45)).toEqual({
        plates: 45,
        lines: answer(2.6, 2).lines,
        pots: 2,
        notes: ["Cook in two pots."],
        report: answer(2.6, 2).report,
        source: "proofread",
      });
      const detail = await getRecipeDetail(target.id);
      expect(detail?.plateCounts.map((c) => [c.plates, c.source])).toEqual([
        [40, "version"],
        [45, "proofread"],
      ]);
      expect(detail?.openPlateRuns).toEqual([]);
      expect(detail).toMatchObject({ status: "accepted", lastError: null });
      const [run] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, q.runId));
      expect(run).toMatchObject({
        outcome: "succeeded",
        inputTokens: 900,
        outputTokens: 300,
      });
    });

    it("has no daily limit on plate runs either", async () => {
      const { captain, member } = await people();
      const target = await accepted(captain.id, member.id);
      const other = await approved(member.id, captain.id);
      expect((await queue(captain.id, [other])).ok).toBe(true);
      expect((await plates(captain.id, target, 45)).ok).toBe(true);
      expect((await plates(captain.id, target, 60)).ok).toBe(true);
      expect(await auditRows(PLATES_QUEUED)).toHaveLength(2);
    });

    it("refuses a Structures lead and a member inside the transaction, writing nothing, and lets a Kitchen lead", async () => {
      const { captain, kitchenLead, structuresLead, member } = await people();
      const target = await accepted(captain.id, member.id);
      for (const actorId of [structuresLead.id, member.id]) {
        expect(await plates(actorId, target, 45)).toEqual({
          ok: false,
          error: ONLY_A_REVIEWER_SENDS,
        });
      }
      expect(await runCount()).toBe(0);
      expect(await auditRows(PLATES_QUEUED)).toHaveLength(0);
      expect((await plates(kitchenLead.id, target, 45)).ok).toBe(true);
      expect(await auditRows(PLATES_QUEUED)).toHaveLength(1);
    });

    it("refuses a count that is ready, and the version's own count, without a run row", async () => {
      const { captain, member } = await people();
      const target = await accepted(captain.id, member.id);
      expect(await plates(captain.id, target, 40)).toEqual({
        ok: false,
        error: "This recipe is written for 40 plates already.",
      });
      expect(await plates(captain.id, target, 40, { rerun: true })).toEqual({
        ok: false,
        error: "This recipe is written for 40 plates already.",
      });
      await proofread(captain.id, target, 45, answer(2.6, 2));
      expect(await runCount()).toBe(1);

      // 45 is ready: reading it again costs nothing, and no run is written.
      expect(await plates(captain.id, target, 45)).toEqual({
        ok: false,
        error: "Already proofread for 45 plates.",
      });
      expect(await runCount()).toBe(1);
      expect(await auditRows(PLATES_QUEUED)).toHaveLength(1);
    });

    it("replaces the stored result when a captain asks for a re-run", async () => {
      const { captain, member } = await people();
      const target = await accepted(captain.id, member.id);
      const first = await proofread(captain.id, target, 45, answer(2.6, 2));
      const second = await proofread(
        captain.id,
        target,
        45,
        { ...answer(2.7, 1.5), pots: 3, notes: [] },
        true,
      );
      expect(second).not.toBe(first);
      expect(await getPlateCount(target.versionId, 45)).toMatchObject({
        lines: answer(2.7, 1.5).lines,
        pots: 3,
        notes: [],
        source: "proofread",
      });
      const rows = await h
        .db()
        .select()
        .from(schema.recipePlateCounts)
        .where(eq(schema.recipePlateCounts.plates, 45));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.runId).toBe(second);
      const audits = await auditRows(PLATES_QUEUED);
      expect(audits.map((a) => a.metadata)).toEqual([
        expect.objectContaining({ rerun: false }),
        expect.objectContaining({ rerun: true }),
      ]);
    });

    it("never lets two runs for one count be open at once", async () => {
      const { captain, member } = await people();
      const target = await accepted(captain.id, member.id);
      const q = await plates(captain.id, target, 45);
      if (!q.ok) throw new Error(q.error);
      expect(await plates(captain.id, target, 45)).toEqual({
        ok: false,
        error: "Claude is already working on 45 plates. Reload in a minute.",
      });
      // Still open once the worker has it.
      await claimPlateRun(q.runId);
      expect(
        await plates(captain.id, target, 45, { rerun: true }),
      ).toMatchObject({ ok: false });
      expect(await runCount()).toBe(1);

      // A write that slips past the read meets the partial unique index,
      // and the sentence is the same.
      const err = await h
        .db()
        .insert(schema.recipeProofreadRuns)
        .values({
          recipeId: target.id,
          requestedBy: captain.id,
          requestedAt: NOW,
          promptVersion: PROMPT,
          model: MODEL,
          outcome: "queued",
          kind: "plates",
          plates: 45,
          versionId: target.versionId,
        })
        .catch((e: unknown) => e);
      expect(isOpenPlateRunConflict(err)).toBe(true);
      expect(isOpenPlateRunConflict(new Error("other"))).toBe(false);

      // Another count is its own run.
      expect((await plates(captain.id, target, 60)).ok).toBe(true);
    });

    it("resets a stale plate run and leaves the recipe alone; a failed run keeps its tokens", async () => {
      const { captain, member } = await people();
      const target = await accepted(captain.id, member.id);
      const q = await plates(captain.id, target, 45);
      if (!q.ok) throw new Error(q.error);
      await claimPlateRun(q.runId, NOW);
      expect(await resetStaleRuns(new Date("2026-09-24T10:11:00Z"))).toEqual({
        reset: 1,
      });
      const [stale] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, q.runId));
      expect(stale).toMatchObject({
        outcome: "failed",
        error: STALE_RUN_ERROR,
      });
      expect(await getRecipeDetail(target.id)).toMatchObject({
        status: "accepted",
        lastError: null,
        openPlateRuns: [],
      });
      // A late answer is not stored.
      expect(
        await completePlateRun({
          runId: q.runId,
          result: answer(2.6, 2),
          usage: { inputTokens: 1, outputTokens: 1 },
        }),
      ).toEqual({ ok: false, error: RECIPE_CHANGED });
      expect(await getPlateCount(target.versionId, 45)).toBeNull();

      // The count can be asked for again, and a failure keeps the tokens.
      const again = await plates(captain.id, target, 45, {
        now: new Date("2026-09-24T10:12:00Z"),
      });
      if (!again.ok) throw new Error(again.error);
      await claimPlateRun(again.runId);
      expect(
        await failPlateRun({
          runId: again.runId,
          error: "Claude took too long.",
          usage: { inputTokens: 700, outputTokens: 0 },
        }),
      ).toEqual({ ok: true });
      const [failed] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, again.runId));
      expect(failed).toMatchObject({
        outcome: "failed",
        error: "Claude took too long.",
        inputTokens: 700,
      });
      const detail = await getRecipeDetail(target.id);
      expect(detail).toMatchObject({ status: "accepted", lastError: null });
      // The recipe page can say why the paid run gave nothing: the newest
      // failure for the count, not the stale reset before it.
      expect(detail?.failedPlateRuns).toEqual([
        {
          plates: 45,
          error: "Claude took too long.",
          finishedAt: expect.any(Date),
        },
      ]);

      // Asked for again, the count is with Claude, not failed.
      const third = await plates(captain.id, target, 45, {
        now: new Date("2026-09-24T10:20:00Z"),
      });
      if (!third.ok) throw new Error(third.error);
      const reopened = await getRecipeDetail(target.id);
      expect(reopened?.openPlateRuns).toEqual([45]);
      expect(reopened?.failedPlateRuns).toEqual([]);
    });

    it("reports a failed count only while it has no result and no open run", () => {
      const at = new Date("2026-09-24T10:00:00Z");
      const run = (
        plates: number,
        outcome: "queued" | "running" | "succeeded" | "failed",
        error: string | null = null,
      ) => ({ plates, outcome, error, finishedAt: at });
      expect(
        failedPlateCounts(
          [
            run(60, "failed", "Newest for 60."),
            run(60, "failed", "Older for 60."),
            run(45, "succeeded"),
            run(45, "failed", "Before the good run."),
            run(80, "failed", "Re-run failed."),
            run(30, "failed", null),
          ],
          [40, 80],
          [],
        ),
      ).toEqual([
        { plates: 30, error: "The run failed.", finishedAt: at },
        { plates: 60, error: "Newest for 60.", finishedAt: at },
      ]);
    });

    it("refuses a version that is no longer the accepted one, and fails a queued run on it unsent", async () => {
      const { captain, member } = await people();
      const target = await accepted(captain.id, member.id);
      const q = await plates(captain.id, target, 45);
      if (!q.ok) throw new Error(q.error);

      const v2 = await seedAcceptedVersion(h.db(), {
        recipeId: target.id,
        authorId: captain.id,
        reason: "More lentils",
        recipe: recipe({ plates: 50 }),
      });

      expect(await plates(captain.id, target, 60)).toEqual({
        ok: false,
        error: VERSION_CHANGED,
      });
      expect(await claimPlateRun(q.runId)).toBeNull();
      const [run] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, q.runId));
      expect(run).toMatchObject({
        outcome: "failed",
        error: PLATE_RUN_VERSION_GONE,
        inputTokens: null,
      });
      // The new version starts with its own count only.
      expect(
        (await getRecipeDetail(target.id))?.plateCounts.map((c) => c.plates),
      ).toEqual([50]);
      expect(
        (await plates(captain.id, { ...target, versionId: v2.versionId }, 60))
          .ok,
      ).toBe(true);
    });
  });

  describe("the source editor", () => {
    const SOURCE_SAVED: AuditAction = "recipe.source_saved";
    const ANSWERED: AuditAction = "recipe.questions_answered";
    const WRITTEN: AuditAction = "recipe.written_by_claude";

    function send(
      actorId: string,
      recipeId: string,
      input: {
        basedOnSourceId: string | null;
        sections: RecipeSourceSections;
        serves?: number | null;
        plates?: number;
        now?: Date;
        revisionPromptVersion?: string;
      },
    ) {
      return sendSourceForProofreading({
        recipeId,
        actorId,
        basedOnSourceId: input.basedOnSourceId,
        serves: input.serves ?? null,
        sections: input.sections,
        plates: input.plates ?? 40,
        now: input.now ?? NOW,
        promptVersion: PROMPT,
        revisionPromptVersion: input.revisionPromptVersion,
        model: MODEL,
      });
    }

    /** Send the recipe's newest source unchanged. */
    async function sendAsIs(actorId: string, recipeId: string, now = NOW) {
      const source = await getRecipeSource(recipeId);
      if (!source) throw new Error("no source");
      return send(actorId, recipeId, {
        basedOnSourceId: source.id,
        serves: source.serves,
        sections: source.sections,
        now,
      });
    }

    async function sourceRows(recipeId: string) {
      return h
        .db()
        .select()
        .from(schema.recipeSources)
        .where(eq(schema.recipeSources.recipeId, recipeId))
        .orderBy(schema.recipeSources.version);
    }

    async function runRow(runId: string) {
      const [row] = await h
        .db()
        .select()
        .from(schema.recipeProofreadRuns)
        .where(eq(schema.recipeProofreadRuns.id, runId));
      return row;
    }

    async function recipeRow(id: string) {
      const [row] = await h
        .db()
        .select()
        .from(schema.recipes)
        .where(eq(schema.recipes.id, id));
      return row!;
    }

    const QUESTIONS: SourceProofread = {
      needsInfo: true,
      questions: ["How many does the source serve?", "Dry or tinned lentils?"],
      recipe: null,
      report: null,
      scalingNotes: [],
    };

    function written(
      overrides: Partial<KitchenRecipeInput> = {},
    ): SourceProofread {
      return {
        needsInfo: false,
        questions: [],
        recipe: recipe(overrides),
        report: { changed: ["Cups to kilograms."], unsure: ["The salt."] },
        scalingNotes: ["The source serves 4; the lentils are ten times it."],
      };
    }

    const USAGE = { inputTokens: 700, outputTokens: 500 };

    it("seeds version 1 from a suggestion, split where the text names its sections", async () => {
      const { member } = await people();
      const id = await suggest(member.id, {
        text: "Camp dhal\nIngredients:\n- 2 cups red lentils\n- Salt\nMethod\nSimmer.",
      });
      const source = await getRecipeSource(id);
      expect(source).toMatchObject({
        version: 1,
        serves: null,
        authorId: member.id,
      });
      expect(source?.sections).toEqual(
        sourceFromText(
          "Camp dhal\nIngredients:\n- 2 cups red lentils\n- Salt\nMethod\nSimmer.",
        ),
      );
      expect(sourceText(source!.sections)).toBe(
        "## Ingredients\n- 2 cups red lentils\n- Salt\n\n## Steps\nCamp dhal\nSimmer.",
      );
    });

    it("writes a source version for a resubmission and a retype", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await suggest(member.id);
      await decideRecipe({
        recipeId: id,
        actorId: kitchenLead.id,
        decision: "request_changes",
        note: "Say how many it feeds.",
      });
      const resubmitted = await resubmitRecipe({
        recipeId: id,
        actorId: member.id,
        title: "Dhal",
        text: "Feeds 4.\nSimmer.",
        suitabilityNote: null,
        aiConsent: true,
      });
      expect(resubmitted).toEqual({ ok: true });
      await decideRecipe({
        recipeId: id,
        actorId: captain.id,
        decision: "approve",
      });
      // The reviewer sets Serves in the editor (a serves-only change, so the
      // member stays the words' author).
      const v2 = (await getRecipeSource(id))!;
      const sent = await send(kitchenLead.id, id, {
        basedOnSourceId: v2.id,
        sections: v2.sections,
        serves: 4,
      });
      if (!sent.ok) throw new Error(sent.error);
      await claimSourceRun(sent.runId);
      await failRun({ runId: sent.runId, error: "Timed out." });
      expect(
        await retypeRecipeText({
          recipeId: id,
          actorId: kitchenLead.id,
          text: "Retyped.",
        }),
      ).toEqual({ ok: true });
      const rows = await sourceRows(id);
      expect(rows.map((r) => [r.version, r.authorId, r.serves])).toEqual([
        [1, member.id, null],
        [2, member.id, null],
        [3, member.id, 4],
        // The retype changes the words, and keeps the Serves the editor set.
        [4, kitchenLead.id, 4],
      ]);
      expect(rows[1]!.steps).toEqual(sourceFromText("Feeds 4.\nSimmer.").steps);
      expect(rows[3]!.steps).toEqual(sourceFromText("Retyped.").steps);
    });

    it("lets a Kitchen lead send; a Structures lead and a member are refused with nothing written", async () => {
      const { captain, kitchenLead, structuresLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const source = (await getRecipeSource(id))!;
      const edited = sourceFromText(
        "Ingredients\n- 2 kg red lentils\nMethod\nSimmer.",
      );
      for (const actorId of [structuresLead.id, member.id]) {
        expect(
          await send(actorId, id, {
            basedOnSourceId: source.id,
            sections: edited,
          }),
        ).toEqual({ ok: false, error: ONLY_A_REVIEWER_SENDS });
      }
      expect(await sourceRows(id)).toHaveLength(1);
      expect(await runCount()).toBe(0);
      expect(await auditRows(SOURCE_SAVED)).toHaveLength(0);
      expect(await auditRows(QUEUED)).toHaveLength(0);
      expect(await statusOf(id)).toBe("approved");

      const sent = await send(kitchenLead.id, id, {
        basedOnSourceId: source.id,
        sections: edited,
        serves: 4,
      });
      if (!sent.ok) throw new Error(sent.error);
      expect(await statusOf(id)).toBe("queued");
      expect(await runRow(sent.runId)).toMatchObject({
        kind: "source",
        sourceId: sent.sourceId,
        plates: 40,
        stage: null,
        exchange: [],
        previousStatus: "approved",
        requestedBy: kitchenLead.id,
      });
      const [queuedAudit] = await auditRows(QUEUED);
      expect(queuedAudit).toMatchObject({
        actorId: kitchenLead.id,
        target: id,
        metadata: { runId: sent.runId, plates: 40, sourceVersion: 2 },
      });
    });

    it("sees a demotion that committed before the send", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      await setLead({ userId: kitchenLead.id, team: "kitchen", isLead: false });
      expect(await sendAsIs(kitchenLead.id, id)).toEqual({
        ok: false,
        error: ONLY_A_REVIEWER_SENDS,
      });
      expect(await runCount()).toBe(0);
    });

    it("saves nothing on an unchanged send, so a member's unticked words stay refused; a change saves v2 as the reviewer's", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id, { aiConsent: false });
      expect(await sendAsIs(kitchenLead.id, id)).toEqual({
        ok: false,
        error: NO_AI_CONSENT,
      });
      expect(await sourceRows(id)).toHaveLength(1);
      expect(await runCount()).toBe(0);
      expect(await auditRows(SOURCE_SAVED)).toHaveLength(0);

      const v1 = (await getRecipeSource(id))!;
      const sent = await send(kitchenLead.id, id, {
        basedOnSourceId: v1.id,
        serves: v1.serves,
        sections: sourceFromText("2 cups red lentils, salt. Simmer gently."),
      });
      if (!sent.ok) throw new Error(sent.error);
      const rows = await sourceRows(id);
      expect(rows.map((r) => [r.version, r.authorId])).toEqual([
        [1, member.id],
        [2, kitchenLead.id],
      ]);
      expect(sent.sourceId).toBe(rows[1]!.id);
      const after = await recipeRow(id);
      expect(after).toMatchObject({
        textAuthorId: kitchenLead.id,
        aiConsentAt: NOW,
        rawText: "## Steps\n2 cups red lentils, salt. Simmer gently.",
      });
      const [saved] = await auditRows(SOURCE_SAVED);
      expect(saved).toMatchObject({
        actorId: kitchenLead.id,
        target: id,
        metadata: { title: "Dhal", version: 2 },
      });
    });

    it("keeps a member's unticked words refused when only Serves changes", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id, { aiConsent: false });
      const v1 = (await getRecipeSource(id))!;
      // Typing a number into Serves is no change to the member's words.
      expect(
        await send(kitchenLead.id, id, {
          basedOnSourceId: v1.id,
          sections: v1.sections,
          serves: 4,
        }),
      ).toEqual({ ok: false, error: NO_AI_CONSENT });
      expect(await sourceRows(id)).toHaveLength(1);
      expect(await runCount()).toBe(0);
      expect(await auditRows(SOURCE_SAVED)).toHaveLength(0);
      expect(await recipeRow(id)).toMatchObject({
        textAuthorId: member.id,
        aiConsentAt: null,
        status: "approved",
      });
    });

    it("saves a serves-only change as a version the member still authors, when they ticked", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const before = await recipeRow(id);
      const v1 = (await getRecipeSource(id))!;
      const sent = await send(kitchenLead.id, id, {
        basedOnSourceId: v1.id,
        sections: v1.sections,
        serves: 4,
      });
      if (!sent.ok) throw new Error(sent.error);
      const rows = await sourceRows(id);
      expect(rows.map((r) => [r.version, r.authorId, r.serves])).toEqual([
        [1, member.id, null],
        [2, member.id, 4],
      ]);
      // The member's tick is still the consent that counts.
      expect(await recipeRow(id)).toMatchObject({
        textAuthorId: member.id,
        aiConsentAt: before.aiConsentAt,
        rawText: before.rawText,
      });
      expect(await auditRows(SOURCE_SAVED)).toHaveLength(1);
    });

    it("refuses a source longer than pasted text may be, writing nothing", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const v1 = (await getRecipeSource(id))!;
      const long = sourceFromText("x".repeat(RECIPE_TEXT_MAX + 1));
      expect(
        await send(kitchenLead.id, id, {
          basedOnSourceId: v1.id,
          sections: long,
        }),
      ).toEqual({ ok: false, error: TEXT_TOO_LONG });
      expect(await sourceRows(id)).toHaveLength(1);
      expect(await runCount()).toBe(0);
      expect(await statusOf(id)).toBe("approved");
    });

    it("sends an unchanged source the member ticked for, keeping them its author", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const sent = await sendAsIs(kitchenLead.id, id);
      if (!sent.ok) throw new Error(sent.error);
      expect(await sourceRows(id)).toHaveLength(1);
      expect((await recipeRow(id)).textAuthorId).toBe(member.id);
      expect(await auditRows(SOURCE_SAVED)).toHaveLength(0);
    });

    it("refuses an editor that opened an older source", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const v1 = (await getRecipeSource(id))!;
      await retypeRecipeText({
        recipeId: id,
        actorId: captain.id,
        text: "Newer.",
      });
      for (const basedOnSourceId of [v1.id, null]) {
        expect(
          await send(kitchenLead.id, id, {
            basedOnSourceId,
            sections: sourceFromText("Mine."),
          }),
        ).toEqual({ ok: false, error: SOURCE_CHANGED });
      }
      expect(await sourceRows(id)).toHaveLength(2);
      expect(await runCount()).toBe(0);
    });

    it("refuses what the editor cannot keep, and a serves outside 1..500", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const v1 = (await getRecipeSource(id))!;
      const table = {
        ...v1.sections,
        notes: { type: "doc", content: [{ type: "table" }] },
      } as unknown as RecipeSourceSections;
      expect(
        await send(captain.id, id, { basedOnSourceId: v1.id, sections: table }),
      ).toEqual({ ok: false, error: SOURCE_INVALID });
      expect(
        await send(captain.id, id, {
          basedOnSourceId: v1.id,
          sections: v1.sections,
          serves: 0,
        }),
      ).toEqual({ ok: false, error: SERVES_OUT_OF_RANGE });
      expect(await sourceRows(id)).toHaveLength(1);
      expect(await runCount()).toBe(0);
    });

    it("has no daily limit on a send", async () => {
      const { captain, kitchenLead, member } = await people();
      const a = await approved(member.id, captain.id);
      const b = await approved(member.id, captain.id);
      expect((await sendAsIs(kitchenLead.id, a)).ok).toBe(true);
      const bSource = (await getRecipeSource(b))!;
      expect(
        (
          await send(kitchenLead.id, b, {
            basedOnSourceId: bSource.id,
            sections: sourceFromText("Changed, and sent the same day."),
          })
        ).ok,
      ).toBe(true);
      expect(await sourceRows(b)).toHaveLength(2);
      expect(await runCount()).toBe(2);
    });

    it("hands the worker the source text and nothing private, starting at `sending`", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const v1 = (await getRecipeSource(id))!;
      const sent = await send(kitchenLead.id, id, {
        basedOnSourceId: v1.id,
        sections: sourceFromText("Ingredients\n- Red lentils\nMethod\nSimmer."),
        serves: 4,
      });
      if (!sent.ok) throw new Error(sent.error);
      // The plate-count claim does not take a source run.
      expect(await claimPlateRun(sent.runId)).toBeNull();
      const claimed = await claimSourceRun(sent.runId);
      expect(claimed).toEqual({
        runId: sent.runId,
        recipeId: id,
        title: "Dhal",
        sourceText: "## Ingredients\n- Red lentils\n\n## Steps\nSimmer.",
        serves: 4,
        plates: 40,
        exchange: [],
        note: null,
        kitchen: {
          kitchenPlatesBreakfast: null,
          kitchenPlatesLunch: null,
          kitchenPlatesDinner: null,
        },
        // Not in the book yet: nothing to revise.
        previous: null,
        // A source run, not an adjustment.
        adjust: null,
      });
      expect(JSON.stringify(claimed)).not.toContain("Cheap and vegan");
      expect(JSON.stringify(claimed)).not.toContain(member.displayName);
      expect(await statusOf(id)).toBe("analysing");
      expect(await runRow(sent.runId)).toMatchObject({
        outcome: "running",
        stage: "sending",
      });
      expect(await claimSourceRun(sent.runId)).toBeNull();
    });

    it("revises a recipe in the book from its accepted version and the exchange that settled it", async () => {
      const { captain, kitchenLead, member } = await people();
      const REVISION = "revision-2026-09-24.1";
      const id = await approved(member.id, captain.id);
      const v1 = (await getRecipeSource(id))!;

      // First round: questions, answered; then the recipe, into the book.
      const first = await send(kitchenLead.id, id, {
        basedOnSourceId: v1.id,
        sections: v1.sections,
        revisionPromptVersion: REVISION,
      });
      if (!first.ok) throw new Error(first.error);
      // Not in the book yet: the source prompt, whatever the caller offered.
      expect((await runRow(first.runId))?.promptVersion).toBe(PROMPT);
      await claimSourceRun(first.runId);
      await completeSourceRun({
        runId: first.runId,
        result: QUESTIONS,
        usage: USAGE,
      });
      const answered = await answerProofreadQuestions({
        recipeId: id,
        runId: first.runId,
        actorId: kitchenLead.id,
        answer: "Four, and dry lentils.",
        now: NOW,
        promptVersion: PROMPT,
        revisionPromptVersion: REVISION,
        model: MODEL,
      });
      if (!answered.ok) throw new Error(answered.error);
      expect((await runRow(answered.runId))?.promptVersion).toBe(PROMPT);
      await claimSourceRun(answered.runId);
      const book = await completeSourceRun({
        runId: answered.runId,
        result: written(),
        usage: USAGE,
      });
      expect(book.ok).toBe(true);
      // Every version carries its whole recipe, for the History tab.
      expect((await getRecipeDetail(id))?.versions).toEqual([
        expect.objectContaining({
          version: 1,
          plates: written().recipe!.plates,
          recipe: written().recipe,
          report: written().report,
          scalingNotes: written().scalingNotes,
        }),
      ]);

      // The year's meal plan gives the kitchen its plates at each meal.
      expect(
        await setMealPlan({
          actorId: captain.id,
          daysOnSite: 2,
          days: [
            { breakfast: 45, lunch: 0, dinner: 50 },
            { breakfast: 45, lunch: 0, dinner: 60 },
          ],
          expectedVersion: 0,
        }),
      ).toEqual({ ok: true, version: 1 });

      // Sent again: the revision prompt, and the claim carries version 1
      // and the round that settled it.
      const again = await sendAsIs(kitchenLead.id, id);
      if (!again.ok) throw new Error(again.error);
      expect((await runRow(again.runId))?.promptVersion).toBe(PROMPT);
      const revised = await send(kitchenLead.id, id, {
        basedOnSourceId: (await getRecipeSource(id))!.id,
        sections: sourceFromText("Red lentils, more cumin.\nSimmer."),
        revisionPromptVersion: REVISION,
      });
      // The first re-send is still queued: the second is refused, as ever.
      expect(revised.ok).toBe(false);
      await claimSourceRun(again.runId);
      await failRun({ runId: again.runId, error: "Timed out." });
      const resend = await send(kitchenLead.id, id, {
        basedOnSourceId: (await getRecipeSource(id))!.id,
        sections: sourceFromText("Red lentils, more cumin.\nSimmer."),
        revisionPromptVersion: REVISION,
      });
      if (!resend.ok) throw new Error(resend.error);
      expect((await runRow(resend.runId))?.promptVersion).toBe(REVISION);
      const claimed = await claimSourceRun(resend.runId);
      expect(claimed?.previous).toEqual({
        version: 1,
        recipe: written().recipe,
        exchange: [
          {
            questions: QUESTIONS.questions,
            answer: "Four, and dry lentils.",
          },
        ],
      });
      // The new round starts its own exchange.
      expect(claimed?.exchange).toEqual([]);
      expect(claimed?.kitchen).toMatchObject({
        kitchenPlatesBreakfast: 45,
        kitchenPlatesLunch: null,
        kitchenPlatesDinner: 60,
      });
    });

    it("lists every source version, newest first, with its author", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const v1 = (await getRecipeSource(id))!;
      const sent = await send(kitchenLead.id, id, {
        basedOnSourceId: v1.id,
        sections: sourceFromText("Retyped by the lead."),
      });
      if (!sent.ok) throw new Error(sent.error);
      const sources = await listRecipeSources(id);
      expect(sources.map((s) => [s.version, s.authorName])).toEqual([
        [2, kitchenLead.displayName],
        [1, member.displayName],
      ]);
      expect(sources[1]?.sections).toEqual(v1.sections);
      expect(await listRecipeSources("not-a-uuid")).toEqual([]);
    });

    it("fails, unsent, a queued source run whose words lost their consent", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const sent = await sendAsIs(kitchenLead.id, id);
      if (!sent.ok) throw new Error(sent.error);
      await h
        .db()
        .update(schema.recipes)
        .set({ aiConsentAt: null })
        .where(eq(schema.recipes.id, id));
      expect(await claimSourceRun(sent.runId)).toBeNull();
      expect(await runRow(sent.runId)).toMatchObject({
        outcome: "failed",
        error: NO_AI_CONSENT,
        startedAt: null,
      });
      expect(await recipeRow(id)).toMatchObject({
        status: "approved",
        lastError: NO_AI_CONSENT,
      });
    });

    it("moves the stage only while the run is running", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const sent = await sendAsIs(captain.id, id);
      if (!sent.ok) throw new Error(sent.error);
      // Queued: nothing to move yet.
      expect(await setRunStage(sent.runId, "reading")).toBe(false);
      expect((await runRow(sent.runId))?.stage).toBeNull();
      await claimSourceRun(sent.runId);
      expect(await setRunStage(sent.runId, "reading")).toBe(true);
      expect(await setRunStage(sent.runId, "checking")).toBe(true);
      expect(await getProofreadProgress(id)).toEqual({
        runId: sent.runId,
        kind: "source",
        outcome: "running",
        stage: "checking",
        questions: null,
        error: null,
      });
      expect((await getRecipeDetail(id))?.latestRun?.stage).toBe("checking");
      await failRun({ runId: sent.runId, error: "Timed out." });
      expect(await setRunStage(sent.runId, "saving")).toBe(false);
      expect((await runRow(sent.runId))?.stage).toBe("checking");
      // A stage the panel does not know is refused before it is written.
      expect(await setRunStage(sent.runId, "dancing" as never)).toBe(false);
    });

    it("hands the recipe back with Claude's questions on the run, then an answer queues the next round once", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const sent = await sendAsIs(kitchenLead.id, id);
      if (!sent.ok) throw new Error(sent.error);
      await claimSourceRun(sent.runId);
      expect(
        await completeSourceRun({
          runId: sent.runId,
          result: QUESTIONS,
          usage: USAGE,
        }),
      ).toEqual({ ok: true, versionId: null });
      expect(await recipeRow(id)).toMatchObject({
        status: "approved",
        latestRunId: sent.runId,
        lastError: null,
        acceptedVersionId: null,
      });
      expect(await runRow(sent.runId)).toMatchObject({
        outcome: "succeeded",
        inputTokens: 700,
        outputTokens: 500,
      });
      expect(await getProofreadProgress(id)).toMatchObject({
        runId: sent.runId,
        outcome: "succeeded",
        questions: QUESTIONS.questions,
      });
      const detail = await getRecipeDetail(id);
      expect(detail?.latestRun).toMatchObject({
        questions: QUESTIONS.questions,
        draft: null,
        draftUnreadable: false,
      });
      expect(await h.db().select().from(schema.recipeVersions)).toHaveLength(0);

      // An empty answer is refused before anything is written.
      expect(
        await answerProofreadQuestions({
          recipeId: id,
          runId: sent.runId,
          actorId: kitchenLead.id,
          answer: "  ",
          now: NOW,
          promptVersion: PROMPT,
          model: MODEL,
        }),
      ).toEqual({ ok: false, error: ANSWER_NEEDED });

      const answer = (actorId: string, text: string) =>
        answerProofreadQuestions({
          recipeId: id,
          runId: sent.runId,
          actorId,
          answer: text,
          now: NOW,
          promptVersion: PROMPT,
          model: MODEL,
        });
      expect(await answer(member.id, "Four.")).toEqual({
        ok: false,
        error: ONLY_A_REVIEWER_SENDS,
      });
      const answered = await answer(kitchenLead.id, " Serves 4. Dry lentils. ");
      if (!answered.ok) throw new Error(answered.error);
      expect(await runRow(answered.runId)).toMatchObject({
        kind: "source",
        sourceId: sent.sourceId,
        plates: 40,
        outcome: "queued",
        previousRunId: sent.runId,
        previousStatus: "approved",
        exchange: [
          { questions: QUESTIONS.questions, answer: "Serves 4. Dry lentils." },
        ],
      });
      expect(await recipeRow(id)).toMatchObject({
        status: "queued",
        latestRunId: answered.runId,
      });
      const [audit] = await auditRows(ANSWERED);
      expect(audit).toMatchObject({
        actorId: kitchenLead.id,
        target: id,
        metadata: {
          runId: answered.runId,
          answeredRunId: sent.runId,
          round: 1,
        },
      });

      // A second answer to the same questions loses the compare-and-set.
      expect(await answer(captain.id, "Serves 6.")).toEqual({
        ok: false,
        error: RECIPE_CHANGED,
      });
      expect(await runCount()).toBe(2);
      expect(await auditRows(ANSWERED)).toHaveLength(1);

      // The next round carries the whole exchange to the worker.
      expect((await claimSourceRun(answered.runId))?.exchange).toEqual([
        { questions: QUESTIONS.questions, answer: "Serves 4. Dry lentils." },
      ]);

      // Once that round has come back, the old questions stay answered.
      await failRun({ runId: answered.runId, error: "Timed out." });
      expect(await statusOf(id)).toBe("approved");
      expect(await answer(captain.id, "Serves 6.")).toEqual({
        ok: false,
        error: RECIPE_CHANGED,
      });
    });

    it("writes nothing into the book when the sender lost the Kitchen while Claude worked", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const sent = await sendAsIs(kitchenLead.id, id);
      if (!sent.ok) throw new Error(sent.error);
      await claimSourceRun(sent.runId);
      await setLead({ userId: kitchenLead.id, team: "kitchen", isLead: false });
      expect(
        await completeSourceRun({
          runId: sent.runId,
          result: written({ plates: 40 }),
          usage: USAGE,
        }),
      ).toEqual({ ok: false, error: SENDER_NOT_A_REVIEWER });
      expect(await h.db().select().from(schema.recipeVersions)).toHaveLength(0);
      expect(await auditRows(WRITTEN)).toHaveLength(0);
      // Rolled back: the run is still running, for the worker to fail.
      expect(await runRow(sent.runId)).toMatchObject({ outcome: "running" });
      await failRun({
        runId: sent.runId,
        error: SENDER_NOT_A_REVIEWER,
        usage: USAGE,
      });
      expect(await recipeRow(id)).toMatchObject({
        status: "approved",
        acceptedVersionId: null,
        lastError: SENDER_NOT_A_REVIEWER,
      });
      expect(await runRow(sent.runId)).toMatchObject({
        outcome: "failed",
        inputTokens: 700,
      });
    });

    it("reports the run the editor started, not the older run a failure points back at", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      // An older draft still waiting: the recipe is `proofread`.
      const older = await legacyDraft(captain.id, id);
      const sent = await sendAsIs(kitchenLead.id, id);
      if (!sent.ok) throw new Error(sent.error);
      await claimSourceRun(sent.runId);
      await failRun({ runId: sent.runId, error: "Timed out." });
      // The recipe points back at the older, succeeded run...
      expect(await getProofreadProgress(id)).toMatchObject({
        runId: older,
        outcome: "succeeded",
      });
      // ...but the run the editor started failed, and says why.
      expect(await getProofreadProgress(id, sent.runId)).toMatchObject({
        runId: sent.runId,
        outcome: "failed",
        error: "Timed out.",
      });
      // A run of another recipe reads as none.
      const other = await approved(member.id, captain.id);
      expect(await getProofreadProgress(other, sent.runId)).toBeNull();
    });

    it("answers a round of questions with no daily limit", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const sent = await sendAsIs(kitchenLead.id, id);
      if (!sent.ok) throw new Error(sent.error);
      await claimSourceRun(sent.runId);
      await completeSourceRun({
        runId: sent.runId,
        result: QUESTIONS,
        usage: USAGE,
      });
      expect(
        (
          await answerProofreadQuestions({
            recipeId: id,
            runId: sent.runId,
            actorId: kitchenLead.id,
            answer: "Four.",
            now: NOW,
            promptVersion: PROMPT,
            model: MODEL,
          })
        ).ok,
      ).toBe(true);
      expect(await runCount()).toBe(2);
    });

    it("refuses an answer once the source changed under the questions", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const sent = await sendAsIs(kitchenLead.id, id);
      if (!sent.ok) throw new Error(sent.error);
      await claimSourceRun(sent.runId);
      await completeSourceRun({
        runId: sent.runId,
        result: QUESTIONS,
        usage: USAGE,
      });
      await retypeRecipeText({
        recipeId: id,
        actorId: captain.id,
        text: "Newer.",
      });
      expect(
        await answerProofreadQuestions({
          recipeId: id,
          runId: sent.runId,
          actorId: kitchenLead.id,
          answer: "Four.",
          now: NOW,
          promptVersion: PROMPT,
          model: MODEL,
        }),
      ).toEqual({ ok: false, error: SOURCE_CHANGED });
      expect(await runCount()).toBe(1);
    });

    it("writes the version, its plate count, the scaling notes and the audit row together, straight into the book", async () => {
      const { captain, kitchenLead, member } = await people();
      const id = await approved(member.id, captain.id);
      const sent = await sendAsIs(kitchenLead.id, id);
      if (!sent.ok) throw new Error(sent.error);
      await claimSourceRun(sent.runId);

      // Written for the source's 4, not the 40 asked for: refused, and nothing
      // is written; the run stays with the worker to fail.
      expect(
        await completeSourceRun({
          runId: sent.runId,
          result: written({ plates: 4 }),
          usage: USAGE,
        }),
      ).toEqual({ ok: false, error: draftPlatesMismatch(40, 4) });
      expect(await h.db().select().from(schema.recipeVersions)).toHaveLength(0);
      expect(await h.db().select().from(schema.recipePlateCounts)).toHaveLength(
        0,
      );
      expect(await auditRows(WRITTEN)).toHaveLength(0);
      expect(await runRow(sent.runId)).toMatchObject({ outcome: "running" });
      expect(await statusOf(id)).toBe("analysing");

      const done = await completeSourceRun({
        runId: sent.runId,
        result: written(),
        usage: USAGE,
      });
      if (!done.ok) throw new Error(done.error);
      expect(await recipeRow(id)).toMatchObject({
        status: "accepted",
        acceptedVersionId: done.versionId,
        latestRunId: sent.runId,
        title: "Red lentil dhal",
      });
      const [version] = await h
        .db()
        .select()
        .from(schema.recipeVersions)
        .where(eq(schema.recipeVersions.id, done.versionId!));
      expect(version).toMatchObject({
        version: 1,
        servingsBasis: 40,
        body: recipe(),
        report: written().report,
        scalingNotes: written().scalingNotes,
        sourceId: sent.sourceId,
        runId: sent.runId,
        authorId: kitchenLead.id,
      });
      expect(await getPlateCount(done.versionId!, 40)).toMatchObject({
        plates: 40,
        source: "version",
      });
      const [audit] = await auditRows(WRITTEN);
      expect(audit).toMatchObject({
        actorId: kitchenLead.id,
        target: id,
        metadata: { title: "Red lentil dhal", version: 1, runId: sent.runId },
      });
      const detail = await getRecipeDetail(id);
      expect(detail?.currentVersion?.scalingNotes).toEqual(
        written().scalingNotes,
      );
      expect(detail?.latestRun).toMatchObject({
        questions: null,
        draftUnreadable: false,
      });
      // A late second reply changes nothing.
      expect(
        await completeSourceRun({
          runId: sent.runId,
          result: written(),
          usage: USAGE,
        }),
      ).toEqual({ ok: false, error: RECIPE_CHANGED });
      expect(await h.db().select().from(schema.recipeVersions)).toHaveLength(1);
    });

    it("refuses an answer that breaks its own contract", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const sent = await sendAsIs(captain.id, id);
      if (!sent.ok) throw new Error(sent.error);
      await claimSourceRun(sent.runId);
      const noNotes = { ...written(), scalingNotes: [] };
      const done = await completeSourceRun({
        runId: sent.runId,
        result: noNotes,
        usage: USAGE,
      });
      expect(done.ok).toBe(false);
      expect(await runRow(sent.runId)).toMatchObject({ outcome: "running" });
    });

    it("hands a failed or stopped source run's recipe back, as the older runs do", async () => {
      const { captain, member } = await people();
      const id = await approved(member.id, captain.id);
      const failed = await sendAsIs(captain.id, id);
      if (!failed.ok) throw new Error(failed.error);
      await claimSourceRun(failed.runId);
      await failRun({ runId: failed.runId, error: "Timed out." });
      expect(await recipeRow(id)).toMatchObject({
        status: "approved",
        lastError: "Timed out.",
        latestRunId: failed.runId,
      });

      const stopped = await sendAsIs(captain.id, id);
      if (!stopped.ok) throw new Error(stopped.error);
      await claimSourceRun(stopped.runId, new Date("2026-09-24T10:00:00Z"));
      expect(await resetStaleRuns(new Date("2026-09-24T10:16:00Z"))).toEqual({
        reset: 1,
      });
      expect(await recipeRow(id)).toMatchObject({
        status: "approved",
        lastError: STALE_RUN_ERROR,
      });
    });

    describe("adjusting a version with Claude", () => {
      const ADJUST_QUEUED: AuditAction = "recipe.adjust_queued";
      const ADJUST_PROMPT = "adjust-2026-09-24.1";

      function adjust(
        actorId: string,
        recipeId: string,
        versionId: string,
        instruction = "Use butternut instead of the lentils.",
        plates = 40,
      ) {
        return adjustVersion({
          recipeId,
          versionId,
          actorId,
          instruction,
          plates,
          now: NOW,
          promptVersion: ADJUST_PROMPT,
          model: MODEL,
        });
      }

      /** A recipe in the book with two versions: v1 (40) and v2 (50). */
      async function inTheBook() {
        const folks = await people();
        const id = await approved(folks.member.id, folks.captain.id);
        const v1 = await seedAcceptedVersion(h.db(), {
          recipeId: id,
          authorId: folks.captain.id,
          recipe: recipe({ title: "Dhal one" }),
        });
        const v2 = await seedAcceptedVersion(h.db(), {
          recipeId: id,
          authorId: folks.captain.id,
          recipe: recipe({ title: "Dhal two", plates: 50 }),
        });
        return { ...folks, id, v1, v2 };
      }

      it("lets a captain and a Kitchen lead ask; a Structures lead and a member are refused with nothing written", async () => {
        const { captain, kitchenLead, structuresLead, member, id, v1 } =
          await inTheBook();
        for (const who of [structuresLead, member]) {
          expect(await adjust(who.id, id, v1.versionId)).toEqual({
            ok: false,
            error: ONLY_A_REVIEWER_SENDS,
          });
        }
        expect(await runCount()).toBe(0);
        expect(await auditRows(ADJUST_QUEUED)).toHaveLength(0);

        const byLead = await adjust(kitchenLead.id, id, v1.versionId);
        if (!byLead.ok) throw new Error(byLead.error);
        expect(await runRow(byLead.runId)).toMatchObject({
          kind: "adjust",
          versionId: v1.versionId,
          instruction: "Use butternut instead of the lentils.",
          sourceId: null,
          plates: 40,
          outcome: "queued",
          promptVersion: ADJUST_PROMPT,
          previousStatus: "accepted",
          requestedBy: kitchenLead.id,
        });
        expect(await recipeRow(id)).toMatchObject({
          status: "queued",
          latestRunId: byLead.runId,
        });
        const [audit] = await auditRows(ADJUST_QUEUED);
        expect(audit).toMatchObject({
          actorId: kitchenLead.id,
          target: id,
          metadata: { runId: byLead.runId, fromVersion: 1, plates: 40 },
        });

        // A run is open: a second ask waits for it.
        expect(await adjust(captain.id, id, v1.versionId)).toEqual({
          ok: false,
          error: expect.stringContaining("can't be proofread now"),
        });
        await claimSourceRun(byLead.runId);
        await failRun({ runId: byLead.runId, error: "Timed out." });
        const byCaptain = await adjust(captain.id, id, v1.versionId);
        expect(byCaptain.ok).toBe(true);
      });

      it("sees a Kitchen lead's demotion that committed before the ask", async () => {
        const { kitchenLead, id, v1 } = await inTheBook();
        await setLead({
          userId: kitchenLead.id,
          team: "kitchen",
          isLead: false,
        });
        expect(await adjust(kitchenLead.id, id, v1.versionId)).toEqual({
          ok: false,
          error: ONLY_A_REVIEWER_SENDS,
        });
        expect(await runCount()).toBe(0);
      });

      it("refuses an empty instruction and a version of another recipe, writing nothing", async () => {
        const { captain, member, id, v1 } = await inTheBook();
        expect(await adjust(captain.id, id, v1.versionId, "   ")).toEqual({
          ok: false,
          error: ADJUST_INSTRUCTION_NEEDED,
        });
        const other = await approved(member.id, captain.id);
        expect(await adjust(captain.id, other, v1.versionId)).toEqual({
          ok: false,
          error: ADJUST_VERSION_GONE,
        });
        expect(await runCount()).toBe(0);
      });

      it("hands the worker the version and the words, not the source, and writes the next version into the book", async () => {
        const { kitchenLead, id, v1 } = await inTheBook();
        const asked = await adjust(kitchenLead.id, id, v1.versionId);
        if (!asked.ok) throw new Error(asked.error);

        const claim = await claimSourceRun(asked.runId);
        expect(claim).toMatchObject({
          runId: asked.runId,
          sourceText: "",
          serves: null,
          plates: 40,
          previous: null,
          adjust: {
            instruction: "Use butternut instead of the lentils.",
            base: { version: 1, exchange: [] },
          },
        });
        expect(claim?.adjust?.base.recipe.title).toBe("Dhal one");
        expect(await setRunStage(asked.runId, "reading")).toBe(true);
        expect(await getProofreadProgress(id)).toMatchObject({
          kind: "adjust",
          outcome: "running",
          stage: "reading",
        });

        const done = await completeSourceRun({
          runId: asked.runId,
          result: written({ title: "Butternut dhal", plates: 40 }),
          usage: USAGE,
        });
        if (!done.ok) throw new Error(done.error);
        const [v3] = await h
          .db()
          .select()
          .from(schema.recipeVersions)
          .where(eq(schema.recipeVersions.id, done.versionId!));
        expect(v3).toMatchObject({
          version: 3,
          runId: asked.runId,
          sourceId: null,
          authorId: kitchenLead.id,
          reason: "Changed by Claude: Use butternut instead of the lentils.",
        });
        expect(await recipeRow(id)).toMatchObject({
          status: "accepted",
          acceptedVersionId: done.versionId,
          title: "Butternut dhal",
        });
        expect(await auditRows(WRITTEN)).toHaveLength(1);
      });

      it("asks questions, and an answer queues the next round on the same version and words", async () => {
        const { captain, kitchenLead, id, v1, v2 } = await inTheBook();
        const asked = await adjust(kitchenLead.id, id, v1.versionId);
        if (!asked.ok) throw new Error(asked.error);
        await claimSourceRun(asked.runId);
        await completeSourceRun({
          runId: asked.runId,
          result: QUESTIONS,
          usage: USAGE,
        });
        // Back in the book, the current version unchanged, pointing at the
        // questions.
        expect(await recipeRow(id)).toMatchObject({
          status: "accepted",
          acceptedVersionId: v2.versionId,
          latestRunId: asked.runId,
        });
        expect(await getProofreadProgress(id)).toMatchObject({
          kind: "adjust",
          questions: QUESTIONS.questions,
        });

        const answered = await answerProofreadQuestions({
          recipeId: id,
          runId: asked.runId,
          actorId: captain.id,
          answer: "Three kilograms of butternut.",
          now: NOW,
          promptVersion: PROMPT,
          model: MODEL,
        });
        if (!answered.ok) throw new Error(answered.error);
        expect(await runRow(answered.runId)).toMatchObject({
          kind: "adjust",
          versionId: v1.versionId,
          instruction: "Use butternut instead of the lentils.",
          // The round stays on the prompt the adjustment began under.
          promptVersion: ADJUST_PROMPT,
          previousRunId: asked.runId,
          exchange: [
            {
              questions: QUESTIONS.questions,
              answer: "Three kilograms of butternut.",
            },
          ],
        });
        const claim = await claimSourceRun(answered.runId);
        expect(claim?.exchange).toHaveLength(1);
        expect(claim?.adjust?.base.version).toBe(1);
      });

      it("writes nothing into the book when the sender lost the Kitchen while Claude worked", async () => {
        const { kitchenLead, id, v1, v2 } = await inTheBook();
        const asked = await adjust(kitchenLead.id, id, v1.versionId);
        if (!asked.ok) throw new Error(asked.error);
        await claimSourceRun(asked.runId);
        await setLead({
          userId: kitchenLead.id,
          team: "kitchen",
          isLead: false,
        });
        expect(
          await completeSourceRun({
            runId: asked.runId,
            result: written({ plates: 40 }),
            usage: USAGE,
          }),
        ).toEqual({ ok: false, error: SENDER_NOT_A_REVIEWER });
        expect(await recipeRow(id)).toMatchObject({
          acceptedVersionId: v2.versionId,
        });
      });

      it("shortens a long instruction in the version's reason", () => {
        const long = "a ".repeat(200);
        const reason = adjustReason(long);
        expect(reason.startsWith("Changed by Claude: a a")).toBe(true);
        expect(reason.endsWith("…")).toBe(true);
        expect(reason.length).toBeLessThan(200);
      });
    });
  });
});
