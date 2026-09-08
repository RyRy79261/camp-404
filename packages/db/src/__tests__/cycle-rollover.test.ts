import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { BuilderQuestionnaire } from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeActivation, makeUser, requiredActionsFor } from "./_factories";
import { advanceCycle, planRollover } from "../cycle-rollover";
import { openActivation, completeBuilderResponse } from "../activations";
import { closeActivation } from "../questionnaire-lifecycle";
import { loadQuestionnaireResponse } from "../questionnaire-responses";
import { CYCLE_ONE, type CampConfig } from "../camp-config";
import * as schema from "../schema";

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

function minimalDef(title: string): BuilderQuestionnaire {
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
              prompt: "Anything to tell us?",
              required: false,
              maxLength: 120,
            },
          },
        ],
      },
    ],
  };
}

/**
 * A published builder definition. Written straight through the drizzle handle
 * (arrange), independent of publishDefinition, so a writer bug can't mask
 * itself by also corrupting the fixture.
 */
async function makeDefinition(
  db: DB,
  input: {
    key: string;
    title: string;
    carryOver: boolean;
    status?: (typeof schema.questionnaireStatusEnum.enumValues)[number];
  },
): Promise<void> {
  await db.insert(schema.questionnaireDefinitions).values({
    key: input.key,
    title: input.title,
    definition: minimalDef(input.title),
    status: input.status ?? "published",
    version: `${input.key}-v1`,
    carryOver: input.carryOver,
  });
}

/** Seed `camp_settings.config`, merging over the column's seeded default. */
async function setConfig(db: DB, patch: Partial<CampConfig>): Promise<void> {
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({ config: { ...row!.config, ...patch } })
    .where(eq(schema.campSettings.id, true));
}

async function storedConfig(db: DB) {
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  return row?.config as
    | { teams?: unknown[]; cycles?: { number: number; label: string; endedAt: string | null }[] }
    | undefined;
}

async function activationsFor(db: DB, key: string) {
  return db
    .select()
    .from(schema.questionnaireActivations)
    .where(eq(schema.questionnaireActivations.questionnaireKey, key));
}

/**
 * The camp §15 Phase 4 asks for: one `fresh` questionnaire with an open send,
 * one `carry` with an open send, one `fresh` whose send is already closed, and
 * one `carry` that was never sent. `gone` holds gates and is then sanitised, so
 * the rollover has someone it must expire and must NOT re-arm.
 */
async function seedCamp(db: DB) {
  const captain = await makeUser(db, { rank: "captain" });
  const m1 = await makeUser(db);
  const m2 = await makeUser(db);
  const gone = await makeUser(db);

  await makeDefinition(db, {
    key: "dietary_survey",
    title: "Dietary requirements",
    carryOver: false,
  });
  await makeDefinition(db, { key: "skills", title: "Skills", carryOver: true });
  await makeDefinition(db, {
    key: "workshop_pitch",
    title: "Workshop pitch",
    carryOver: false,
  });
  await makeDefinition(db, {
    key: "photos",
    title: "Photo consent",
    carryOver: true,
  });

  const freshOpen = await makeActivation(db, {
    questionnaireKey: "dietary_survey",
    version: "dietary_survey-v1",
    title: "Dietary requirements",
    carryOver: false,
    dueAt: new Date("2026-11-01T00:00:00.000Z"),
  });
  await openActivation(freshOpen.id);

  const carryOpen = await makeActivation(db, {
    questionnaireKey: "skills",
    version: "skills-v1",
    title: "Skills",
    carryOver: true,
  });
  await openActivation(carryOpen.id);

  const alreadyClosed = await makeActivation(db, {
    questionnaireKey: "workshop_pitch",
    version: "workshop_pitch-v1",
    title: "Workshop pitch",
    carryOver: false,
  });
  await openActivation(alreadyClosed.id);
  await closeActivation(alreadyClosed.id);

  // Left the camp AFTER being gated: computeAudience excludes them from the
  // replacement, so their expired gate is the one that survives the rollover.
  await db
    .update(schema.users)
    .set({ sanitised: true })
    .where(eq(schema.users.id, gone.id));

  return { captain, m1, m2, gone, freshOpen, carryOpen, alreadyClosed };
}

describe("planRollover", () => {
  const h = useTestDb();

  it("sorts every published questionnaire into the four buckets", async () => {
    const db = h.db();
    const { freshOpen, carryOpen } = await seedCamp(db);

    const plan = await planRollover();

    expect(plan.from).toEqual(CYCLE_ONE);
    expect(plan.toNumber).toBe(2);

    // fresh + open send → re-gate. The count is computeAudience's, i.e. the
    // number that will actually be gated: three real members (the sanitised
    // one is excluded).
    expect(plan.reGate).toEqual([
      {
        key: "dietary_survey",
        title: "Dietary requirements",
        activationId: freshOpen.id,
        recipientCount: 3,
        sendable: true,
      },
    ]);

    // carry, sent or not → nothing happens.
    const carried = plan.carriesOver.filter((e) => e.sendable);
    expect(carried).toEqual([
      {
        key: "photos",
        title: "Photo consent",
        activationId: null,
        recipientCount: 0,
        sendable: true,
      },
      {
        key: "skills",
        title: "Skills",
        activationId: carryOpen.id,
        recipientCount: 0,
        sendable: true,
      },
    ]);

    // fresh with NO open send → deliberately left alone. This is the refusal
    // that keeps the rollover from widening what blocks a member.
    expect(plan.notSent.filter((e) => e.sendable)).toEqual([
      {
        key: "workshop_pitch",
        title: "Workshop pitch",
        activationId: null,
        recipientCount: 0,
        sendable: true,
      },
    ]);

    expect(plan.duesPaidCount).toBe(0);
    expect(plan.untouched.length).toBeGreaterThan(0);
  });

  it("writes nothing", async () => {
    const db = h.db();
    await seedCamp(db);
    const before = await db.select().from(schema.questionnaireActivations);

    await planRollover();

    expect(await db.select().from(schema.questionnaireActivations)).toEqual(
      before,
    );
    expect(await storedConfig(db)).toBeUndefined(); // singleton never created
  });

  it("carries the reserved code keys off the config map, flagged unsendable", async () => {
    const db = h.db();
    await setConfig(db, {
      questionnaireCarryOver: { burner_profile: "carry", driver_profile: "fresh" },
    });

    const plan = await planRollover();

    // Unset reads as `carry`, matching the column default.
    expect(plan.carriesOver.map((e) => e.key)).toEqual([
      "burner_profile",
      "dietary_requirements",
    ]);
    // A `fresh` code key lands in notSent and can never be acted on: only
    // sendActivation inserts an activation and it needs a definitions row.
    expect(plan.notSent).toEqual([
      {
        key: "driver_profile",
        title: "Driver profile",
        activationId: null,
        recipientCount: 0,
        sendable: false,
      },
    ]);
  });

  it("ignores an unpublished definition", async () => {
    const db = h.db();
    await makeDefinition(db, {
      key: "retired",
      title: "Retired survey",
      carryOver: false,
      status: "unpublished",
    });

    const plan = await planRollover();
    const keys = [...plan.reGate, ...plan.carriesOver, ...plan.notSent].map(
      (e) => e.key,
    );
    expect(keys).not.toContain("retired");
  });

  it("counts the dues ticks a captain may optionally clear", async () => {
    const db = h.db();
    await makeUser(db, { duesPaid: true });
    await makeUser(db, { duesPaid: true, isSystem: true }); // system actor — excluded
    await makeUser(db);

    expect((await planRollover()).duesPaidCount).toBe(1);
  });
});

describe("advanceCycle", () => {
  const h = useTestDb();

  it("re-gates fresh, leaves carry and closed alone, and destroys nothing", async () => {
    const db = h.db();
    const camp = await seedCamp(db);

    // A member answered the fresh questionnaire in cycle 1. It must survive.
    await completeBuilderResponse({
      userId: camp.m1.id,
      definitionKey: "dietary_survey",
      definitionVersion: "dietary_survey-v1",
      cycle: 1,
      responses: { q1: "No nuts" },
      activationId: camp.freshOpen.id,
    });
    const gatesBefore = await db.select().from(schema.requiredActions);

    const res = await advanceCycle({
      label: "2027",
      actorUserId: camp.captain.id,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // --- the cycle itself ---------------------------------------------------
    expect(res.report.to).toMatchObject({
      number: 2,
      label: "2027",
      endedAt: null,
    });
    const config = await storedConfig(db);
    expect(config?.cycles).toHaveLength(2);
    expect(config?.cycles?.[0]!.number).toBe(1);
    expect(config?.cycles?.[0]!.endedAt).not.toBeNull();
    expect(config?.cycles?.[1]!.label).toBe("2027");
    // The spread kept the rest of the JSONB column — the seeded team list.
    expect(config?.teams).toHaveLength(8);

    // --- the fresh questionnaire: closed, then re-opened blank --------------
    const dietary = await activationsFor(db, "dietary_survey");
    expect(dietary).toHaveLength(2); // the old row is KEPT, not replaced
    const closed = dietary.find((a) => a.id === camp.freshOpen.id)!;
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).not.toBeNull();
    expect(closed.cycle).toBe(1);

    const fresh = dietary.find((a) => a.id !== camp.freshOpen.id)!;
    expect(fresh.status).toBe("open");
    expect(fresh.cycle).toBe(2);
    // Last year's deadline would flag the new send as overdue on day one.
    expect(fresh.dueAt).toBeNull();
    expect(fresh.carryOver).toBe(false);
    expect(fresh.scope).toBe("everyone");
    expect(fresh.blocking).toBe(true);
    expect(fresh.version).toBe("dietary_survey-v1");
    expect(fresh.title).toBe("Dietary requirements");
    expect(fresh.activatedByUserId).toBe(camp.captain.id);

    expect(res.report.reGated).toEqual([
      {
        key: "dietary_survey",
        title: "Dietary requirements",
        closedActivationId: camp.freshOpen.id,
        newActivationId: fresh.id,
        gatesWritten: 3,
      },
    ]);

    // --- gates: re-armed in place, expired where not re-armed, none deleted -
    expect(await db.select().from(schema.requiredActions)).toHaveLength(
      gatesBefore.length,
    );
    for (const member of [camp.captain, camp.m1, camp.m2]) {
      const row = (await requiredActionsFor(db, member.id)).find(
        (r) => r.actionKey === "dietary_survey",
      )!;
      expect(row.status).toBe("pending");
      expect(row.activationId).toBe(fresh.id);
      expect(row.completedAt).toBeNull();
    }
    // The member who left: expired (terminal, non-gating) and still on file.
    const goneRow = (await requiredActionsFor(db, camp.gone.id)).find(
      (r) => r.actionKey === "dietary_survey",
    )!;
    expect(goneRow.status).toBe("expired");
    expect(goneRow.activationId).toBe(camp.freshOpen.id);

    // --- carry + already-closed: untouched ---------------------------------
    const skills = await activationsFor(db, "skills");
    expect(skills).toHaveLength(1);
    expect(skills[0]!.status).toBe("open");
    expect(skills[0]!.cycle).toBe(1);
    expect(
      (await requiredActionsFor(db, camp.m1.id)).find(
        (r) => r.actionKey === "skills",
      )!.status,
    ).toBe("pending");

    const pitch = await activationsFor(db, "workshop_pitch");
    expect(pitch).toHaveLength(1);
    expect(pitch[0]!.status).toBe("closed");

    // --- cycle 1's answers are still readable ------------------------------
    const priorYear = await loadQuestionnaireResponse(
      camp.m1.id,
      "dietary_survey",
      { cycle: 1, carryOver: true },
    );
    expect(priorYear?.responses).toEqual({ q1: "No nuts" });
    expect(priorYear?.completedAt).not.toBeNull();
    // …and the new cycle's form is blank, which is what `fresh` means.
    expect(
      await loadQuestionnaireResponse(camp.m1.id, "dietary_survey", {
        cycle: 2,
        carryOver: false,
      }),
    ).toBeNull();

    // --- the receipt --------------------------------------------------------
    const audit = await db.select().from(schema.auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.id).toBe(res.report.auditLogId);
    expect(audit[0]!.action).toBe("camp.cycle.advanced");
    expect(audit[0]!.actorId).toBe(camp.captain.id);
    expect(audit[0]!.target).toBe("2027");
    expect(audit[0]!.metadata).toMatchObject({
      to: { number: 2, label: "2027" },
      duesCleared: [],
      announcementBroadcastId: null,
      reGated: [{ key: "dietary_survey", gatesWritten: 3 }],
    });
  });

  it("copies the recipients of an individual-scope send onto the replacement", async () => {
    const db = h.db();
    const picked = await makeUser(db);
    await makeUser(db); // in the camp, not on the list
    await makeDefinition(db, {
      key: "leads_only",
      title: "Leads only",
      carryOver: false,
    });
    const act = await makeActivation(db, {
      questionnaireKey: "leads_only",
      version: "leads_only-v1",
      title: "Leads only",
      scope: "individual",
      carryOver: false,
    });
    await db
      .insert(schema.questionnaireActivationTargets)
      .values({ activationId: act.id, userId: picked.id });
    await openActivation(act.id);

    const res = await advanceCycle({ label: "2027", actorUserId: null });
    expect(res.ok).toBe(true);

    const rows = await activationsFor(db, "leads_only");
    const fresh = rows.find((a) => a.id !== act.id)!;
    const targets = await db
      .select()
      .from(schema.questionnaireActivationTargets)
      .where(eq(schema.questionnaireActivationTargets.activationId, fresh.id));
    expect(targets.map((t) => t.userId)).toEqual([picked.id]);
    expect(
      (await requiredActionsFor(db, picked.id))[0]!.activationId,
    ).toBe(fresh.id);
  });

  it("a second press with the same label is refused", async () => {
    const db = h.db();
    await seedCamp(db);

    // The FOR UPDATE lock on the singleton reduces two captains pressing at
    // once to exactly this: one runs, the other observes the label already in
    // the cycle list. (PGlite serves one connection, so the race is asserted in
    // its serialised form rather than by overlapping transactions.)
    expect((await advanceCycle({ label: "2027", actorUserId: null })).ok).toBe(
      true,
    );
    expect(await advanceCycle({ label: "2027", actorUserId: null })).toEqual({
      ok: false,
      reason: "already-advanced",
    });

    // The loser changed nothing: still one advance, one re-gate, one audit row.
    const config = await storedConfig(db);
    expect(config?.cycles).toHaveLength(2);
    expect(await activationsFor(db, "dietary_survey")).toHaveLength(2);
    expect(await db.select().from(schema.auditLog)).toHaveLength(1);
  });

  it("refuses a blank label without opening a transaction", async () => {
    const db = h.db();
    await seedCamp(db);

    expect(await advanceCycle({ label: "   ", actorUserId: null })).toEqual({
      ok: false,
      reason: "needs-a-label",
    });
    expect(await storedConfig(db)).toBeUndefined();
  });

  it("clears the dues ticks only when asked, and enumerates who was cleared", async () => {
    const db = h.db();
    const paid = await makeUser(db, {
      duesPaid: true,
      duesPaidAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const unpaid = await makeUser(db);

    const kept = await advanceCycle({ label: "2027", actorUserId: null });
    expect(kept.ok && kept.report.duesCleared).toEqual([]);
    expect(
      (await db.select().from(schema.users).where(eq(schema.users.id, paid.id)))[0]!
        .duesPaid,
    ).toBe(true);

    const res = await advanceCycle({
      label: "2028",
      actorUserId: null,
      resetDues: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report.duesCleared).toEqual([paid.id]);
    const [after] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, paid.id));
    expect(after!.duesPaid).toBe(false);
    expect(after!.duesPaidAt).toBeNull();
    expect(
      (await db.select().from(schema.users).where(eq(schema.users.id, unpaid.id)))[0]!
        .duesPaid,
    ).toBe(false);
  });

  it("posts the optional announcement as a full-screen acknowledge", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);

    const res = await advanceCycle({
      label: "2027",
      actorUserId: captain.id,
      announcement: { title: "It's 2027", body: "Fresh forms are up." },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const [broadcast] = await db.select().from(schema.broadcasts);
    expect(broadcast!.id).toBe(res.report.announcementBroadcastId);
    expect(broadcast!.kind).toBe("announcement");
    expect(broadcast!.scope).toBe("everyone");
    expect(broadcast!.presentation).toBe("acknowledge");
    expect(broadcast!.publishedAt).not.toBeNull();

    // Everyone real except the sender, exactly as publishAnnouncement fans out.
    const deliveries = await db.select().from(schema.notificationDeliveries);
    expect(deliveries.map((d) => d.userId)).toEqual([member.id]);
    expect(deliveries[0]!.presentation).toBe("acknowledge");
    expect(deliveries[0]!.title).toBe("It's 2027");
  });
});
