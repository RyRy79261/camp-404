import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { BuilderQuestionnaire } from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeUser, requiredActionsFor } from "./_factories";
import { insertDefinitionDraft } from "../questionnaire-definitions";
import {
  closeActivation,
  getOpenActivationForKey,
  publishDefinition,
  sendActivation,
  unpublishDefinition,
} from "../questionnaire-lifecycle";
import { completeBuilderResponse } from "../activations";
import * as schema from "../schema";

function validDef(
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
        title: "",
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

async function seedDraft(
  db: ReturnType<ReturnType<typeof useTestDb>["db"]>,
  key: string,
  def: BuilderQuestionnaire,
  createdBy: string | null = null,
): Promise<void> {
  await insertDefinitionDraft({ key, title: def.title, createdBy, definition: def });
}

async function setHead(
  db: ReturnType<ReturnType<typeof useTestDb>["db"]>,
  key: string,
  def: BuilderQuestionnaire,
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

describe("publishDefinition", () => {
  const h = useTestDb();

  it("first publish mints <key>-v1, snapshots, flips status to published", async () => {
    const db = h.db();
    const owner = await makeUser(db);
    await seedDraft(db, "feedback", validDef("Camp feedback"), owner.id);

    const res = await publishDefinition("feedback", owner.id);
    expect(res).toEqual({ ok: true, version: "feedback-v1", change: "initial" });

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
    // a content page carrying an input field is a hard blocker; also no input field overall once removed
    const bad: BuilderQuestionnaire = {
      version: "1",
      title: "Broken",
      pages: [{ id: "p1", type: "question", title: "", blocks: [] }],
    };
    await seedDraft(db, "broken", bad);

    const res = await publishDefinition("broken", null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.length).toBeGreaterThan(0);

    const [meta] = await db
      .select()
      .from(schema.questionnaireDefinitions)
      .where(eq(schema.questionnaireDefinitions.key, "broken"));
    expect(meta!.status).toBe("draft");
    expect(meta!.version).toBeNull();
  });

  it("a cosmetic edit re-publishes in place: same version, snapshot overwritten", async () => {
    const db = h.db();
    await seedDraft(db, "feedback", validDef("Camp feedback", { prompt: "Your name" }));
    await publishDefinition("feedback", null);

    // edit only the prompt — cosmetic
    await setHead(db, "feedback", validDef("Camp feedback", { prompt: "Full name" }));
    const res = await publishDefinition("feedback", null);
    expect(res).toEqual({ ok: true, version: "feedback-v1", change: "cosmetic" });

    const versions = await versionRows(db, "feedback");
    expect(versions).toHaveLength(1); // no new version row
    const snapshot = versions[0]!.definition as BuilderQuestionnaire;
    expect(snapshot.pages[0]!.blocks[0]).toMatchObject({
      kind: "question",
      question: { prompt: "Full name" },
    });
  });

  it("a breaking edit mints a new version and keeps the old snapshot", async () => {
    const db = h.db();
    await seedDraft(db, "feedback", validDef("Camp feedback", { required: false }));
    await publishDefinition("feedback", null);

    // flip required off→on — breaking
    await setHead(db, "feedback", validDef("Camp feedback", { required: true }));
    const res = await publishDefinition("feedback", null);
    expect(res).toEqual({ ok: true, version: "feedback-v2", change: "breaking" });

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

  async function publishedWithOpenSend(db: ReturnType<ReturnType<typeof useTestDb>["db"]>) {
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
    expect((await requiredActionsFor(db, a.id))[0]!.version).toBe("feedback-v1");
    expect((await requiredActionsFor(db, b.id))[0]!.actionKey).toBe("feedback");
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
