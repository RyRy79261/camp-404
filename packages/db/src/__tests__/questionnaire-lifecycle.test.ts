import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  fromBuilderQuestionnaire,
  type BuilderQuestionnaire,
  type Questionnaire,
} from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeActivation, makeUser, requiredActionsFor } from "./_factories";
import { insertDefinitionDraft } from "../questionnaire-definitions";
import {
  closeActivation,
  getOpenActivationForKey,
  listOpenSendBlocking,
  publishDefinition,
  sendActivation,
  sendReminder,
  unpublishDefinition,
} from "../questionnaire-lifecycle";
import { completeBuilderResponse, getActivationById } from "../activations";
import { DEFAULT_CAMP_CONFIG } from "../camp-config";
import * as schema from "../schema";

/** The same one-question questionnaire in the builder's stored shape. */
function builderDef(
  title: string,
  opts: { prompt?: string; required?: boolean } = {},
): BuilderQuestionnaire {
  return {
    version: "1",
    title,
    pages: [
      {
        id: "p1",
        type: "question",
        title: "About you",
        blocks: [
          {
            kind: "question",
            question: {
              id: "q1",
              kind: "short_text",
              prompt: opts.prompt ?? "Your name",
              required: opts.required ?? false,
              maxLength: 120,
            },
          },
        ],
      },
    ],
  };
}

/** A one-question questionnaire, as a draft save now stores it (unified). */
function validDef(
  title: string,
  opts: { prompt?: string; required?: boolean } = {},
): Questionnaire {
  return fromBuilderQuestionnaire(builderDef(title, opts));
}

async function seedDraft(
  db: ReturnType<ReturnType<typeof useTestDb>["db"]>,
  key: string,
  def: Questionnaire,
  createdBy: string | null = null,
): Promise<void> {
  await insertDefinitionDraft({
    key,
    title: def.title ?? key,
    createdBy,
    definition: def,
  });
}

async function setHead(
  db: ReturnType<ReturnType<typeof useTestDb>["db"]>,
  key: string,
  def: Questionnaire | BuilderQuestionnaire,
): Promise<void> {
  await db
    .update(schema.questionnaireDefinitions)
    .set({ definition: def })
    .where(eq(schema.questionnaireDefinitions.key, key));
}

async function versionRows(
  db: ReturnType<ReturnType<typeof useTestDb>["db"]>,
  key: string,
) {
  return db
    .select()
    .from(schema.questionnaireVersions)
    .where(eq(schema.questionnaireVersions.definitionKey, key));
}

describe("listOpenSendBlocking", () => {
  const h = useTestDb();

  it("maps each open send to its blocking flag, skipping drafts and closed sends", async () => {
    const db = h.db();
    const send = (
      questionnaireKey: string,
      status: "open" | "closed" | "draft",
      blocking: boolean,
    ) => makeActivation(db, { questionnaireKey, status, blocking });
    await send("safety", "open", true);
    await send("skills", "open", false);
    await send("old", "closed", true);
    await send("draft", "draft", false);

    expect(Object.fromEntries(await listOpenSendBlocking())).toEqual({
      safety: true,
      skills: false,
    });
  });
});

describe("publishDefinition", () => {
  const h = useTestDb();

  it("first publish mints <key>-v1, snapshots, flips status to published", async () => {
    const db = h.db();
    const owner = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"), owner.id);

    const res = await publishDefinition("feedback", owner.id);
    expect(res).toEqual({
      ok: true,
      version: "feedback-v1",
      change: "initial",
    });

    const versions = await versionRows(db, "feedback");
    expect(versions).toHaveLength(1);
    expect(versions[0]!.version).toBe("feedback-v1");
    expect(versions[0]!.publishedByUserId).toBe(owner.id);

    const [meta] = await db
      .select()
      .from(schema.questionnaireDefinitions)
      .where(eq(schema.questionnaireDefinitions.key, "feedback"));
    expect(meta!.status).toBe("published");
    expect(meta!.version).toBe("feedback-v1");
  });

  it("rejects an invalid definition with publish-time blockers and leaves it a draft", async () => {
    const db = h.db();
    // An empty, untitled page: nothing to answer, and a page with no title.
    const bad: Questionnaire = {
      version: "1",
      title: "Broken",
      pages: [{ id: "p1", kind: "questions", title: "", questions: [] }],
    };
    await seedDraft(db, "broken", bad);

    const res = await publishDefinition("broken", null);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      // Located, so an editor can show each problem where it is.
      expect(res.issues.map((i) => [i.code, i.pageId])).toEqual(
        expect.arrayContaining([
          ["missing_page_title", "p1"],
          ["empty_page", "p1"],
          ["no_inputs", undefined],
        ]),
      );
      expect(res.errors).toEqual(res.issues.map((i) => i.message));
    }

    const [meta] = await db
      .select()
      .from(schema.questionnaireDefinitions)
      .where(eq(schema.questionnaireDefinitions.key, "broken"));
    expect(meta!.status).toBe("draft");
    expect(meta!.version).toBeNull();
  });

  it("a cosmetic edit re-publishes in place: same version, snapshot overwritten", async () => {
    const db = h.db();
    await seedDraft(
      db,
      "feedback",
      validDef("Camp feedback", { prompt: "Your name" }),
    );
    await publishDefinition("feedback", null);

    // edit only the prompt — cosmetic
    await setHead(
      db,
      "feedback",
      validDef("Camp feedback", { prompt: "Full name" }),
    );
    const res = await publishDefinition("feedback", null);
    expect(res).toEqual({
      ok: true,
      version: "feedback-v1",
      change: "cosmetic",
    });

    const versions = await versionRows(db, "feedback");
    expect(versions).toHaveLength(1); // no new version row
    const snapshot = versions[0]!.definition as Questionnaire;
    expect(snapshot.pages[0]).toMatchObject({
      kind: "questions",
      questions: [{ id: "q1", prompt: "Full name" }],
    });
  });

  it("reads a head still in the builder's shape, and snapshots it unified", async () => {
    const db = h.db();
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await setHead(db, "feedback", builderDef("Camp feedback"));

    const res = await publishDefinition("feedback", null);
    expect(res).toEqual({
      ok: true,
      version: "feedback-v1",
      change: "initial",
    });
    const [version] = await versionRows(db, "feedback");
    expect(version!.definition).toEqual(validDef("Camp feedback"));
  });

  it("an old builder-shaped snapshot against the same questionnaire saved unified is NOT breaking", async () => {
    // THE REGRESSION THIS GUARDS: snapshots are never rewritten, so a live
    // version published before the move is still builder-shaped, while every
    // save since stores the unified shape. Compared as stored, the two differ
    // everywhere; read as what they are, they are the same questionnaire. A
    // spurious "breaking" would mint feedback-v2 and re-gate every member on
    // the next send for a change nobody made.
    const db = h.db();
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await db
      .update(schema.questionnaireDefinitions)
      .set({ status: "published", version: "feedback-v1" })
      .where(eq(schema.questionnaireDefinitions.key, "feedback"));
    await db.insert(schema.questionnaireVersions).values({
      definitionKey: "feedback",
      version: "feedback-v1",
      definition: builderDef("Camp feedback"),
    });

    const res = await publishDefinition("feedback", null);
    expect(res).toEqual({
      ok: true,
      version: "feedback-v1",
      change: "cosmetic",
    });
    expect(await versionRows(db, "feedback")).toHaveLength(1);

    // …while a real breaking edit against that old snapshot still mints one.
    await db
      .update(schema.questionnaireVersions)
      .set({ definition: builderDef("Camp feedback") })
      .where(eq(schema.questionnaireVersions.definitionKey, "feedback"));
    await setHead(
      db,
      "feedback",
      validDef("Camp feedback", { required: true }),
    );
    expect(await publishDefinition("feedback", null)).toEqual({
      ok: true,
      version: "feedback-v2",
      change: "breaking",
    });
  });

  it("refuses a head over the size limits, and a malformed or missing one", async () => {
    const db = h.db();
    await seedDraft(
      db,
      "feedback",
      validDef("Camp feedback", { prompt: "x".repeat(6_000) }),
    );
    const tooLong = await publishDefinition("feedback", null);
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.errors[0]).toMatch(/longer than 5000/);

    await setHead(db, "feedback", { version: "1", pages: "nope" } as never);
    expect(await publishDefinition("feedback", null)).toEqual({
      ok: false,
      errors: ["This questionnaire is malformed."],
      issues: [],
    });
    expect(await publishDefinition("nope", null)).toEqual({
      ok: false,
      errors: ["Questionnaire not found."],
      issues: [],
    });
  });

  it("a breaking edit mints a new version and keeps the old snapshot", async () => {
    const db = h.db();
    await seedDraft(
      db,
      "feedback",
      validDef("Camp feedback", { required: false }),
    );
    await publishDefinition("feedback", null);

    // flip required off→on — breaking
    await setHead(
      db,
      "feedback",
      validDef("Camp feedback", { required: true }),
    );
    const res = await publishDefinition("feedback", null);
    expect(res).toEqual({
      ok: true,
      version: "feedback-v2",
      change: "breaking",
    });

    const versions = await versionRows(db, "feedback");
    expect(versions.map((v) => v.version).sort()).toEqual([
      "feedback-v1",
      "feedback-v2",
    ]);

    const [meta] = await db
      .select()
      .from(schema.questionnaireDefinitions)
      .where(eq(schema.questionnaireDefinitions.key, "feedback"));
    expect(meta!.version).toBe("feedback-v2");
  });

  it("re-publishing an unpublished definition brings it back online", async () => {
    const db = h.db();
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);
    await unpublishDefinition("feedback");

    const res = await publishDefinition("feedback", null);
    expect(res.ok).toBe(true);
    const [meta] = await db
      .select()
      .from(schema.questionnaireDefinitions)
      .where(eq(schema.questionnaireDefinitions.key, "feedback"));
    expect(meta!.status).toBe("published");
    expect(meta!.version).toBe("feedback-v1"); // unchanged (cosmetic re-publish)
  });
});

describe("closeActivation", () => {
  const h = useTestDb();

  async function publishedWithOpenSend(
    db: ReturnType<ReturnType<typeof useTestDb>["db"]>,
  ) {
    const u = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);
    const sent = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: u.id,
    });
    if (!sent.ok) throw new Error(sent.error);
    return { u, activationId: sent.activationId };
  }

  it("closes the activation and expires its still-pending gates", async () => {
    const db = h.db();
    const { u, activationId } = await publishedWithOpenSend(db);
    expect((await requiredActionsFor(db, u.id))[0]!.status).toBe("pending");

    expect(await closeActivation(activationId)).toEqual({ ok: true });

    const [act] = await db
      .select()
      .from(schema.questionnaireActivations)
      .where(eq(schema.questionnaireActivations.id, activationId));
    expect(act!.status).toBe("closed");
    expect(act!.closedAt).not.toBeNull();
    expect((await requiredActionsFor(db, u.id))[0]!.status).toBe("expired");
  });

  it("leaves completed gates untouched", async () => {
    const db = h.db();
    const { u, activationId } = await publishedWithOpenSend(db);
    await completeBuilderResponse({
      userId: u.id,
      definitionKey: "feedback",
      definitionVersion: "feedback-v1",
      cycle: 1,
      responses: { q1: "done" },
      activationId,
    });
    expect((await requiredActionsFor(db, u.id))[0]!.status).toBe("completed");

    await closeActivation(activationId);
    expect((await requiredActionsFor(db, u.id))[0]!.status).toBe("completed");
  });

  it("is idempotent on an already-closed activation and rejects a missing one", async () => {
    const db = h.db();
    const { activationId } = await publishedWithOpenSend(db);
    expect(await closeActivation(activationId)).toEqual({ ok: true });
    expect(await closeActivation(activationId)).toEqual({ ok: true });
    expect(
      await closeActivation("00000000-0000-0000-0000-000000000000"),
    ).toEqual({ ok: false, error: "Activation not found." });
  });
});

describe("unpublishDefinition — cascade", () => {
  const h = useTestDb();

  it("sets status unpublished, closes open activations, expires pending gates, preserves responses", async () => {
    const db = h.db();
    const u = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);
    const sent = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: u.id,
    });
    if (!sent.ok) throw new Error(sent.error);
    // record a response so we can prove unpublish preserves it
    await db.insert(schema.questionnaireResponses).values({
      userId: u.id,
      definitionKey: "feedback",
      definitionVersion: "feedback-v1",
      responses: { q1: "kept" },
      activationId: sent.activationId,
      completedAt: null,
    });

    const res = await unpublishDefinition("feedback");
    expect(res).toEqual({ ok: true, closedActivations: 1 });

    const [meta] = await db
      .select()
      .from(schema.questionnaireDefinitions)
      .where(eq(schema.questionnaireDefinitions.key, "feedback"));
    expect(meta!.status).toBe("unpublished");

    const [act] = await db
      .select()
      .from(schema.questionnaireActivations)
      .where(eq(schema.questionnaireActivations.id, sent.activationId));
    expect(act!.status).toBe("closed");
    expect((await requiredActionsFor(db, u.id))[0]!.status).toBe("expired");

    const responses = await db
      .select()
      .from(schema.questionnaireResponses)
      .where(eq(schema.questionnaireResponses.userId, u.id));
    expect(responses).toHaveLength(1);
    expect(responses[0]!.responses).toEqual({ q1: "kept" });
  });

  it("rejects a missing definition", async () => {
    expect(await unpublishDefinition("nope")).toEqual({
      ok: false,
      error: "Questionnaire not found.",
    });
  });
});

describe("sendActivation — one-open invariant", () => {
  const h = useTestDb();

  it("opens an activation pinned to the published version and fans out", async () => {
    const db = h.db();
    const a = await makeUser(db);
    const b = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);

    const res = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: a.id,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.created).toBe(2);

    const [act] = await db
      .select()
      .from(schema.questionnaireActivations)
      .where(eq(schema.questionnaireActivations.id, res.activationId));
    expect(act!.status).toBe("open");
    expect(act!.version).toBe("feedback-v1");
    expect((await requiredActionsFor(db, a.id))[0]!.version).toBe(
      "feedback-v1",
    );
    expect((await requiredActionsFor(db, b.id))[0]!.actionKey).toBe("feedback");
  });

  it("tells every member it gated, without spending their first reminder", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);

    const res = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: false,
      activatedByUserId: captain.id,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const notices = await db
      .select({
        userId: schema.notificationDeliveries.userId,
        body: schema.notificationDeliveries.body,
        refType: schema.notificationDeliveries.refType,
        refId: schema.notificationDeliveries.refId,
        kind: schema.broadcasts.kind,
      })
      .from(schema.notificationDeliveries)
      .innerJoin(
        schema.broadcasts,
        eq(schema.broadcasts.id, schema.notificationDeliveries.broadcastId),
      );
    expect(notices.map((n) => n.userId).sort()).toEqual(
      [captain.id, member.id].sort(),
    );
    expect(notices[0]).toMatchObject({
      body: "New questionnaire: Camp feedback. Tap to answer.",
      refType: "questionnaire_activation",
      refId: res.activationId,
      kind: "system",
    });

    // The reminder's 24-hour window counts reminders only, so a captain can
    // still nudge straight after sending.
    const nudge = await sendReminder({
      activationId: res.activationId,
      senderId: captain.id,
    });
    expect(nudge).toMatchObject({ ok: true, outcome: "sent", sent: 2 });
  });

  it("refuses to send an unpublished questionnaire", async () => {
    const db = h.db();
    const u = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback")); // still a draft
    const res = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: u.id,
    });
    expect(res).toEqual({
      ok: false,
      error: "Publish this questionnaire before sending it.",
    });
  });

  it("rejects a second open send for the same key, and allows it after close", async () => {
    const db = h.db();
    const u = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);

    const first = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: u.id,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: u.id,
    });
    expect(second.ok).toBe(false);

    // close the open one, then a re-send is allowed
    await closeActivation(first.activationId);
    expect(await getOpenActivationForKey("feedback")).toBeNull();
    const third = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: u.id,
    });
    expect(third.ok).toBe(true);
  });

  it("scope=individual only fans out to the chosen targets", async () => {
    const db = h.db();
    const picked = await makeUser(db);
    const other = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);

    const res = await sendActivation({
      questionnaireKey: "feedback",
      scope: "individual",
      blocking: false,
      activatedByUserId: picked.id,
      targetUserIds: [picked.id],
    });
    expect(res.ok).toBe(true);
    expect(await requiredActionsFor(db, picked.id)).toHaveLength(1);
    expect(await requiredActionsFor(db, other.id)).toHaveLength(0);
  });

  it("propagates the activation dueAt onto the fanned-out required_actions", async () => {
    const db = h.db();
    const u = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);
    const due = new Date("2026-07-01T12:00:00.000Z");

    const res = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: u.id,
      dueAt: due,
    });
    expect(res.ok).toBe(true);
    expect((await requiredActionsFor(db, u.id))[0]!.dueAt).toEqual(due);
  });
});

describe("sendActivation — the cycle + carry-over stamp", () => {
  const h = useTestDb();

  it("stamps the year current at Send and carry_over off the definition", async () => {
    const db = h.db();
    const u = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);
    // the camp has rolled over twice; 2028 is the open year
    await db.insert(schema.campSettings).values({
      config: {
        ...DEFAULT_CAMP_CONFIG,
        cycles: [
          {
            year: 2026,
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2027-01-01T00:00:00.000Z",
          },
          {
            year: 2027,
            startedAt: "2027-01-01T00:00:00.000Z",
            endedAt: "2028-01-01T00:00:00.000Z",
          },
          {
            year: 2028,
            startedAt: "2028-01-01T00:00:00.000Z",
            endedAt: null,
          },
        ],
      },
    });

    const sent = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: u.id,
    });
    if (!sent.ok) throw new Error(sent.error);

    const act = await getActivationById(sent.activationId);
    expect(act?.cycle).toBe(2028);
    expect(act?.carryOver).toBe(true); // the definition column's default
    expect(await getOpenActivationForKey("feedback")).toMatchObject({
      cycle: 2028,
      carryOver: true,
    });
  });

  it("copies carry_over = false off the definition, and the copy is FROZEN", async () => {
    const db = h.db();
    const u = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);
    await db
      .update(schema.questionnaireDefinitions)
      .set({ carryOver: false })
      .where(eq(schema.questionnaireDefinitions.key, "feedback"));

    const sent = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: u.id,
    });
    if (!sent.ok) throw new Error(sent.error);
    expect((await getActivationById(sent.activationId))?.carryOver).toBe(false);

    // A captain flipping the toggle mid-collection affects the NEXT send, never
    // the one in flight.
    await db
      .update(schema.questionnaireDefinitions)
      .set({ carryOver: true })
      .where(eq(schema.questionnaireDefinitions.key, "feedback"));
    expect((await getActivationById(sent.activationId))?.carryOver).toBe(false);
  });
});

describe("data survival across the full lifecycle", () => {
  const h = useTestDb();

  it("preserves a completed response (and the completed gate) through unpublish → re-publish", async () => {
    const db = h.db();
    const u = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"));
    await publishDefinition("feedback", null);
    const sent = await sendActivation({
      questionnaireKey: "feedback",
      scope: "everyone",
      blocking: true,
      activatedByUserId: u.id,
    });
    if (!sent.ok) throw new Error(sent.error);

    await completeBuilderResponse({
      userId: u.id,
      definitionKey: "feedback",
      definitionVersion: "feedback-v1",
      cycle: 1,
      responses: { q1: "kept" },
      activationId: sent.activationId,
    });
    expect((await requiredActionsFor(db, u.id))[0]!.status).toBe("completed");

    // unpublish closes the activation but leaves a COMPLETED gate + the response
    await unpublishDefinition("feedback");
    expect((await requiredActionsFor(db, u.id))[0]!.status).toBe("completed");
    const afterUnpublish = await db
      .select()
      .from(schema.questionnaireResponses)
      .where(eq(schema.questionnaireResponses.userId, u.id));
    expect(afterUnpublish[0]!.responses).toEqual({ q1: "kept" });

    // re-publish brings it back online with the response intact
    expect((await publishDefinition("feedback", null)).ok).toBe(true);
    const afterRepublish = await db
      .select()
      .from(schema.questionnaireResponses)
      .where(eq(schema.questionnaireResponses.userId, u.id));
    expect(afterRepublish).toHaveLength(1);
    expect(afterRepublish[0]!.responses).toEqual({ q1: "kept" });
  });
});
