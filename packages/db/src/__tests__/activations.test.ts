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
  openActivation,
  satisfyRequiredAction,
} from "../activations";
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
    // blocking pending
    const blocking = await makeActivation(db, {
      questionnaireKey: "a",
      version: "1",
      scope: "individual",
      blocking: true,
    });
    await addTarget(db, blocking.id, u.id);
    await openActivation(blocking.id);
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
    expect(pending.map((p) => p.actionKey)).toEqual(["a"]);
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
