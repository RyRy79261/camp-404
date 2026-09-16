import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import {
  addTarget,
  makeActivation,
  makeMembership,
  makeUser,
  requiredActionsFor,
} from "./_factories";
import {
  completeBuilderResponse,
  getActivationById,
  getPendingRequiredActions,
  getRequiredAction,
  listPendingQuestionnaires,
  openActivation,
  reconcileOpenActivations,
  satisfyRequiredAction,
} from "../activations";
import {
  closeActivation,
  isOpenActivationConflict,
} from "../questionnaire-lifecycle";
import * as schema from "../schema";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

describe("openActivation — fan-out", () => {
  const h = useTestDb();

  it("creates one pending required_action per real member for scope=everyone", async () => {
    const db = h.db();
    const a = await makeUser(db);
    const b = await makeUser(db);
    await makeUser(db, { isSystem: true }); // system actor — excluded
    await makeUser(db, { sanitised: true }); // sanitised — excluded
    const act = await makeActivation(db, {
      questionnaireKey: "feedback",
      version: "1",
      title: "Camp feedback",
      scope: "everyone",
      blocking: true,
    });

    const res = await openActivation(act.id);
    expect(res).toEqual({ ok: true, created: 2 });

    const rowsA = await requiredActionsFor(db, a.id);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]!.actionKey).toBe("feedback");
    expect(rowsA[0]!.version).toBe("1");
    expect(rowsA[0]!.activationId).toBe(act.id);
    expect(rowsA[0]!.status).toBe("pending");
    expect(rowsA[0]!.blocking).toBe(true);
    expect(await requiredActionsFor(db, b.id)).toHaveLength(1);

    // the activation itself flips draft → open
    expect((await getActivationById(act.id))?.status).toBe("open");
  });

  it("scope=team targets only that team's members", async () => {
    const db = h.db();
    const kitchen = await makeUser(db);
    const power = await makeUser(db);
    await makeMembership(db, { userId: kitchen.id, team: "kitchen" });
    await makeMembership(db, { userId: power.id, team: "power_and_lighting" });
    const act = await makeActivation(db, { scope: "team", team: "kitchen" });

    expect(await openActivation(act.id)).toEqual({ ok: true, created: 1 });
    expect(await requiredActionsFor(db, kitchen.id)).toHaveLength(1);
    expect(await requiredActionsFor(db, power.id)).toHaveLength(0);
  });

  it("scope=team_leads targets only leads", async () => {
    const db = h.db();
    const lead = await makeUser(db);
    const grunt = await makeUser(db);
    await makeMembership(db, { userId: lead.id, team: "kitchen", isLead: true });
    await makeMembership(db, { userId: grunt.id, team: "kitchen", isLead: false });
    const act = await makeActivation(db, { scope: "team_leads" });

    expect(await openActivation(act.id)).toEqual({ ok: true, created: 1 });
    expect(await requiredActionsFor(db, lead.id)).toHaveLength(1);
    expect(await requiredActionsFor(db, grunt.id)).toHaveLength(0);
  });

  it("scope=team is asked of the YEAR frozen on the activation", async () => {
    const db = h.db();
    const lastYear = await makeUser(db);
    const thisYear = await makeUser(db);
    await makeMembership(db, {
      userId: lastYear.id,
      team: "kitchen",
      cycle: 2026,
    });
    await makeMembership(db, {
      userId: thisYear.id,
      team: "kitchen",
      cycle: 2027,
    });
    const act = await makeActivation(db, {
      scope: "team",
      team: "kitchen",
      cycle: 2027,
    });
    // The camp is in 2027 too: openActivation refuses a draft stamped with a
    // year the camp has left (see cycle-rollover.test.ts).
    const [settings] = await db
      .insert(schema.campSettings)
      .values({ id: true })
      .returning({ config: schema.campSettings.config });
    await db
      .update(schema.campSettings)
      .set({
        config: {
          ...settings!.config,
          cycles: [
            {
              year: 2027,
              startedAt: "2027-01-01T00:00:00.000Z",
              endedAt: null,
            },
          ],
        },
      })
      .where(eq(schema.campSettings.id, true));

    // The activation's own year decides who is on the team, so last year's
    // kitchen crew is not asked.
    expect(await openActivation(act.id)).toEqual({ ok: true, created: 1 });
    expect(await requiredActionsFor(db, thisYear.id)).toHaveLength(1);
    expect(await requiredActionsFor(db, lastYear.id)).toHaveLength(0);
  });

  it("scope=individual uses the activation targets table", async () => {
    const db = h.db();
    const picked = await makeUser(db);
    const other = await makeUser(db);
    const act = await makeActivation(db, { scope: "individual" });
    await addTarget(db, act.id, picked.id);

    expect(await openActivation(act.id)).toEqual({ ok: true, created: 1 });
    expect(await requiredActionsFor(db, picked.id)).toHaveLength(1);
    expect(await requiredActionsFor(db, other.id)).toHaveLength(0);
  });

  it("re-open upserts in place: re-points version/activation and re-opens a completed gate", async () => {
    const db = h.db();
    const u = await makeUser(db);
    const act1 = await makeActivation(db, {
      questionnaireKey: "feedback",
      version: "1-v1",
    });
    await openActivation(act1.id);
    await satisfyRequiredAction(u.id, "feedback", "1-v1");
    expect((await requiredActionsFor(db, u.id))[0]!.status).toBe("completed");

    // The one-open-per-key invariant (partial unique index) forbids a second
    // overlapping open, so re-sending closes the current activation first; the
    // user's completed gate is left intact by the close (only pending → expired).
    await closeActivation(act1.id);
    const act2 = await makeActivation(db, {
      questionnaireKey: "feedback",
      version: "1-v2",
    });
    expect(await openActivation(act2.id)).toEqual({ ok: true, created: 1 });

    const rows = await requiredActionsFor(db, u.id);
    expect(rows).toHaveLength(1); // unique(userId, actionKey) → upsert, not a 2nd row
    expect(rows[0]!.status).toBe("pending");
    expect(rows[0]!.version).toBe("1-v2");
    expect(rows[0]!.activationId).toBe(act2.id);
    expect(rows[0]!.completedAt).toBeNull();
  });

  it("opens with zero recipients when nobody is in scope", async () => {
    const db = h.db();
    await makeUser(db, { isSystem: true });
    const act = await makeActivation(db, { scope: "everyone" });
    expect(await openActivation(act.id)).toEqual({ ok: true, created: 0 });
    expect((await getActivationById(act.id))?.status).toBe("open");
  });

  it("rejects a missing activation and an opt_in scope", async () => {
    const db = h.db();
    expect(await openActivation(NIL_UUID)).toEqual({
      ok: false,
      error: "Activation not found.",
    });
    const optin = await makeActivation(db, { scope: "opt_in" });
    expect((await openActivation(optin.id)).ok).toBe(false);
  });

  it("the partial unique index forbids a second concurrent open for one key", async () => {
    const db = h.db();
    // The Send pre-check normally catches this; here we drive openActivation
    // directly to prove the DB-level backstop ("...one_open_per_key_idx") fires
    // when two opens race past the application guard.
    const act1 = await makeActivation(db, {
      questionnaireKey: "feedback",
      scope: "individual",
    });
    const act2 = await makeActivation(db, {
      questionnaireKey: "feedback",
      scope: "individual",
    });
    expect((await openActivation(act1.id)).ok).toBe(true);
    const err = await openActivation(act2.id).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeTruthy();
    // The thrown error must be recognised by sendActivation's discriminator —
    // otherwise a real concurrent race would surface as a generic failure
    // instead of the "already open" message. Asserting via the shared helper
    // ties the actual driver error shape to the catch logic.
    expect(isOpenActivationConflict(err)).toBe(true);
  });
});

describe("openActivation — the carry-over fan-out filter", () => {
  const h = useTestDb();

  /**
   * Re-send one key: the one-open-per-key index forbids two overlapping opens,
   * so a replay always closes the current activation first. `answered` completes
   * their gate under the first send before the replay.
   */
  async function replay(
    db: ReturnType<typeof h.db>,
    opts: { firstVersion: string; replayVersion: string; carryOver: boolean },
  ) {
    const answered = await makeUser(db);
    const silent = await makeUser(db);
    const act1 = await makeActivation(db, {
      questionnaireKey: "feedback",
      version: opts.firstVersion,
    });
    await openActivation(act1.id);
    expect(
      await satisfyRequiredAction(answered.id, "feedback", opts.firstVersion),
    ).toBe(true);
    await closeActivation(act1.id);

    const act2 = await makeActivation(db, {
      questionnaireKey: "feedback",
      version: opts.replayVersion,
      carryOver: opts.carryOver,
    });
    const res = await openActivation(act2.id);
    return { answered, silent, act1, act2, res };
  }

  it("carry: skips a member who already completed at a satisfying version", async () => {
    const db = h.db();
    const { answered, act1, act2, res } = await replay(db, {
      firstVersion: "feedback-v1",
      replayVersion: "feedback-v1",
      carryOver: true,
    });
    // only `silent` is re-gated; `answered` is not counted and not touched
    expect(res).toEqual({ ok: true, created: 1 });
    const row = (await requiredActionsFor(db, answered.id))[0]!;
    expect(row.status).toBe("completed");
    expect(row.activationId).toBe(act1.id); // still pointing at the old send
    expect(act2.carryOver).toBe(true);
  });

  it("carry: still gates a member who never answered", async () => {
    const db = h.db();
    const { silent, act2 } = await replay(db, {
      firstVersion: "feedback-v1",
      replayVersion: "feedback-v1",
      carryOver: true,
    });
    // The hole this closes: carry means "don't re-ask someone who already
    // answered", never "let everyone through".
    const row = (await requiredActionsFor(db, silent.id))[0]!;
    expect(row.status).toBe("pending");
    expect(row.activationId).toBe(act2.id);
  });

  it("fresh: gates everyone, including the member who already answered", async () => {
    const db = h.db();
    const { answered, silent, act2, res } = await replay(db, {
      firstVersion: "feedback-v1",
      replayVersion: "feedback-v1",
      carryOver: false,
    });
    expect(res).toEqual({ ok: true, created: 2 });
    const row = (await requiredActionsFor(db, answered.id))[0]!;
    expect(row.status).toBe("pending");
    expect(row.completedAt).toBeNull();
    expect(row.activationId).toBe(act2.id);
    expect((await requiredActionsFor(db, silent.id))[0]!.status).toBe(
      "pending",
    );
  });

  it("carry: a breaking version bump re-gates the member who answered", async () => {
    const db = h.db();
    const { answered, res } = await replay(db, {
      firstVersion: "feedback-v1",
      replayVersion: "feedback-v2", // BREAKING edit minted a new version
      carryOver: true,
    });
    expect(res).toEqual({ ok: true, created: 2 });
    expect((await requiredActionsFor(db, answered.id))[0]!.status).toBe(
      "pending",
    );
  });

  it("carry: a completion for a DIFFERENT key never satisfies this one", async () => {
    const db = h.db();
    const u = await makeUser(db);
    const other = await makeActivation(db, {
      questionnaireKey: "other",
      version: "other-v1",
      scope: "individual",
    });
    await addTarget(db, other.id, u.id);
    await openActivation(other.id);
    await satisfyRequiredAction(u.id, "other", "other-v1");

    const act = await makeActivation(db, {
      questionnaireKey: "feedback",
      version: "feedback-v1",
      carryOver: true,
    });
    expect(await openActivation(act.id)).toEqual({ ok: true, created: 1 });
  });
});

describe("reconcileOpenActivations — members who arrive after a send", () => {
  const h = useTestDb();

  it("gates a member who joined after an everyone send opened, once", async () => {
    const db = h.db();
    await makeUser(db);
    const act = await makeActivation(db, { scope: "everyone" });
    expect(await openActivation(act.id)).toEqual({ ok: true, created: 1 });
    const [before] = await db
      .select()
      .from(schema.questionnaireActivations)
      .where(eq(schema.questionnaireActivations.id, act.id));

    const late = await makeUser(db);
    // Before this, the late joiner had no gate: "not invited" in the runner.
    expect(await requiredActionsFor(db, late.id)).toEqual([]);

    expect(await reconcileOpenActivations(late.id)).toBe(1);
    const [gate] = await requiredActionsFor(db, late.id);
    expect(gate).toMatchObject({
      activationId: act.id,
      status: "pending",
      actionKey: act.questionnaireKey,
    });

    // A second call writes nothing, and the send itself is untouched.
    expect(await reconcileOpenActivations(late.id)).toBe(0);
    const [after] = await db
      .select()
      .from(schema.questionnaireActivations)
      .where(eq(schema.questionnaireActivations.id, act.id));
    expect(after!.openedAt).toEqual(before!.openedAt);
  });

  it("never re-opens a gate the member already answered for this send", async () => {
    const db = h.db();
    const u = await makeUser(db);
    const act = await makeActivation(db, { scope: "everyone" });
    await openActivation(act.id);
    await satisfyRequiredAction(u.id, act.questionnaireKey, act.version);

    expect(await reconcileOpenActivations(u.id)).toBe(0);
    expect((await requiredActionsFor(db, u.id))[0]!.status).toBe("completed");
  });

  it("gates a member put on the team after a team send opened, and nobody else", async () => {
    const db = h.db();
    const cook = await makeUser(db);
    const other = await makeUser(db);
    const act = await makeActivation(db, { scope: "team", team: "kitchen" });
    expect(await openActivation(act.id)).toEqual({ ok: true, created: 0 });

    await makeMembership(db, { userId: cook.id, team: "kitchen" });
    expect(await reconcileOpenActivations(cook.id)).toBe(1);
    expect(await reconcileOpenActivations(other.id)).toBe(0);
    expect(await requiredActionsFor(db, other.id)).toEqual([]);
  });

  it("gates a member picked for an individual send after it opened", async () => {
    const db = h.db();
    const picked = await makeUser(db);
    const act = await makeActivation(db, { scope: "individual" });
    await openActivation(act.id);
    expect(await reconcileOpenActivations(picked.id)).toBe(0);

    await addTarget(db, act.id, picked.id);
    expect(await reconcileOpenActivations(picked.id)).toBe(1);
  });

  it("under carry-over, skips a member who already answered a satisfying version", async () => {
    const db = h.db();
    const earlier = await makeActivation(db, {
      questionnaireKey: "skills",
      version: "skills-v1",
    });
    const late = await makeUser(db);
    await addTarget(db, earlier.id, late.id);
    await db
      .update(schema.questionnaireActivations)
      .set({ scope: "individual" })
      .where(eq(schema.questionnaireActivations.id, earlier.id));
    await openActivation(earlier.id);
    await satisfyRequiredAction(late.id, "skills", "skills-v1");
    await closeActivation(earlier.id);

    const resend = await makeActivation(db, {
      questionnaireKey: "skills",
      version: "skills-v1",
      scope: "team",
      team: "kitchen",
      carryOver: true,
    });
    await openActivation(resend.id);
    await makeMembership(db, { userId: late.id, team: "kitchen" });

    expect(await reconcileOpenActivations(late.id)).toBe(0);
    const [gate] = await requiredActionsFor(db, late.id);
    expect(gate).toMatchObject({ status: "completed", activationId: earlier.id });
  });

  it("does nothing for a closed send, or for an erased account", async () => {
    const db = h.db();
    const act = await makeActivation(db, { scope: "everyone" });
    await openActivation(act.id);
    await closeActivation(act.id);
    const late = await makeUser(db);
    expect(await reconcileOpenActivations(late.id)).toBe(0);

    const open = await makeActivation(db, {
      questionnaireKey: "other",
      scope: "everyone",
    });
    await openActivation(open.id);
    const gone = await makeUser(db, { sanitised: true });
    expect(await reconcileOpenActivations(gone.id)).toBe(0);
    expect(await requiredActionsFor(db, gone.id)).toEqual([]);
  });
});

describe("listPendingQuestionnaires — what the inbox shouts about", () => {
  const h = useTestDb();

  it("lists optional and blocking sends, blocking first, then by deadline", async () => {
    const db = h.db();
    const u = await makeUser(db);
    const optionalLate = await makeActivation(db, {
      questionnaireKey: "skills",
      title: "Skills",
      blocking: false,
      dueAt: new Date("2026-10-20T10:00:00Z"),
    });
    const optionalSoon = await makeActivation(db, {
      questionnaireKey: "photos",
      title: "Photo consent",
      blocking: false,
      dueAt: new Date("2026-10-01T10:00:00Z"),
    });
    const required = await makeActivation(db, {
      questionnaireKey: "safety",
      title: "Safety",
      blocking: true,
    });
    for (const act of [optionalLate, optionalSoon, required]) {
      await openActivation(act.id);
    }

    const pending = await listPendingQuestionnaires(u.id);
    expect(pending.map((p) => p.title)).toEqual([
      "Safety",
      "Photo consent",
      "Skills",
    ]);
    expect(pending[1]).toMatchObject({
      activationId: optionalSoon.id,
      blocking: false,
    });
  });

  it("drops a questionnaire once it is answered, or once its send closes", async () => {
    const db = h.db();
    const u = await makeUser(db);
    const answered = await makeActivation(db, {
      questionnaireKey: "skills",
      blocking: false,
    });
    const closed = await makeActivation(db, {
      questionnaireKey: "photos",
      blocking: false,
    });
    await openActivation(answered.id);
    await openActivation(closed.id);
    expect(await listPendingQuestionnaires(u.id)).toHaveLength(2);

    await satisfyRequiredAction(u.id, "skills", answered.version);
    await closeActivation(closed.id);
    expect(await listPendingQuestionnaires(u.id)).toEqual([]);
  });

  it("ignores the burner profile gate, which has no send", async () => {
    const db = h.db();
    const u = await makeUser(db);
    await db.insert(schema.requiredActions).values({
      userId: u.id,
      type: "questionnaire",
      actionKey: "burner_profile",
      title: "Complete your burner profile",
    });
    expect(await listPendingQuestionnaires(u.id)).toEqual([]);
  });
});

describe("completeBuilderResponse — atomic submit", () => {
  const h = useTestDb();

  it("records the response (completedAt set) and satisfies the gate together", async () => {
    const db = h.db();
    const u = await makeUser(db);
    const act = await makeActivation(db, {
      questionnaireKey: "feedback",
      version: "1",
    });
    await openActivation(act.id);

    await completeBuilderResponse({
      userId: u.id,
      definitionKey: "feedback",
      definitionVersion: "1",
      cycle: act.cycle,
      responses: { q1: "hello" },
      activationId: act.id,
    });

    const [resp] = await db
      .select()
      .from(schema.questionnaireResponses)
      .where(eq(schema.questionnaireResponses.userId, u.id));
    expect(resp!.completedAt).not.toBeNull();
    expect(resp!.responses).toEqual({ q1: "hello" });
    expect(resp!.definitionVersion).toBe("1");
    expect(resp!.activationId).toBe(act.id);

    const ra = (await requiredActionsFor(db, u.id))[0]!;
    expect(ra.status).toBe("completed");
    expect(ra.completedAt).not.toBeNull();
  });

  it("records the response but leaves the gate pending for an older version", async () => {
    const db = h.db();
    const u = await makeUser(db);
    const act = await makeActivation(db, {
      questionnaireKey: "feedback",
      version: "1-v2",
    });
    await openActivation(act.id);

    await completeBuilderResponse({
      userId: u.id,
      definitionKey: "feedback",
      definitionVersion: "1-v1", // older than required 1-v2
      cycle: act.cycle,
      responses: {},
      activationId: act.id,
    });

    const rows = await db
      .select()
      .from(schema.questionnaireResponses)
      .where(eq(schema.questionnaireResponses.userId, u.id));
    expect(rows).toHaveLength(1);
    expect((await requiredActionsFor(db, u.id))[0]!.status).toBe("pending");
  });

  it("keeps only the latest answer per (user, key)", async () => {
    const db = h.db();
    const u = await makeUser(db);
    const act = await makeActivation(db, {
      questionnaireKey: "feedback",
      version: "1",
    });
    await openActivation(act.id);

    for (const answer of ["first", "second"]) {
      await completeBuilderResponse({
        userId: u.id,
        definitionKey: "feedback",
        definitionVersion: "1",
        cycle: act.cycle,
        responses: { q: answer },
        activationId: act.id,
      });
    }

    const rows = await db
      .select()
      .from(schema.questionnaireResponses)
      .where(eq(schema.questionnaireResponses.userId, u.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.responses).toEqual({ q: "second" });
  });
});

describe("required-action getters", () => {
  const h = useTestDb();

  it("getPendingRequiredActions returns only pending blocking rows, oldest first", async () => {
    const db = h.db();
    const u = await makeUser(db);
    // older blocking pending
    const blockingA = await makeActivation(db, {
      questionnaireKey: "a",
      version: "1",
      scope: "individual",
      blocking: true,
    });
    await addTarget(db, blockingA.id, u.id);
    await openActivation(blockingA.id);
    // newer blocking pending — proves the createdAt ordering, not just filtering
    const blockingC = await makeActivation(db, {
      questionnaireKey: "c",
      version: "1",
      scope: "individual",
      blocking: true,
    });
    await addTarget(db, blockingC.id, u.id);
    await openActivation(blockingC.id);
    // non-blocking pending (excluded)
    const nonBlocking = await makeActivation(db, {
      questionnaireKey: "b",
      version: "1",
      scope: "individual",
      blocking: false,
    });
    await addTarget(db, nonBlocking.id, u.id);
    await openActivation(nonBlocking.id);

    const pending = await getPendingRequiredActions(u.id);
    expect(pending.map((p) => p.actionKey)).toEqual(["a", "c"]);
  });

  it("getRequiredAction returns null when the user was never targeted", async () => {
    const db = h.db();
    const u = await makeUser(db);
    expect(await getRequiredAction(u.id, "never-sent")).toBeNull();
  });

  it("satisfyRequiredAction is a no-op for an already-completed row", async () => {
    const db = h.db();
    const u = await makeUser(db);
    const act = await makeActivation(db, {
      questionnaireKey: "feedback",
      version: "1",
      scope: "individual",
    });
    await addTarget(db, act.id, u.id);
    await openActivation(act.id);

    expect(await satisfyRequiredAction(u.id, "feedback", "1")).toBe(true);
    expect(await satisfyRequiredAction(u.id, "feedback", "1")).toBe(false); // already completed
  });
});
