import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { BuilderQuestionnaire } from "@camp404/types";
import { useTestDb } from "./_harness";
import {
  makeActivation,
  makeCarMember,
  makeDriverProfile,
  makeMembership,
  makeUser,
  requiredActionsFor,
} from "./_factories";
import { advanceCycle, planRollover, setFoundingYear } from "../cycle-rollover";
import { openActivation, completeBuilderResponse } from "../activations";
import { isTeamLead } from "../roster";
import { closeActivation } from "../questionnaire-lifecycle";
import { loadQuestionnaireResponse } from "../questionnaire-responses";
import { UNSET_CYCLE, type CampConfig } from "../camp-config";
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
    | { teams?: unknown[]; cycles?: { year: number; endedAt: string | null }[] }
    | undefined;
}

/**
 * A camp that already knows what year it is, written straight to the config so
 * the founding audit row doesn't show up in the rollover tests' receipts.
 * setFoundingYear itself is covered in its own describe.
 */
async function foundedAt(db: DB, year: number): Promise<void> {
  await setConfig(db, {
    cycles: [
      { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
    ],
  });
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
    await foundedAt(db, 2026);

    const plan = await planRollover();

    expect(plan.from).toMatchObject({ year: 2026, endedAt: null });
    // Offered as the input's starting value, not decided: a camp that skips a
    // burn types 2028 over it.
    expect(plan.suggestedYear).toBe(2027);

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
      questionnaireCarryOver: { driver_profile: "carry" },
    });

    const plan = await planRollover();

    // An explicit entry wins over the seeded default, in both directions.
    expect(plan.carriesOver.map((e) => e.key)).toEqual([
      "burner_profile",
      "dietary_requirements",
      "driver_profile",
    ]);
    expect(plan.notSent).toEqual([]);
  });

  it("applies the owner's per-key defaults when the map is unset", async () => {
    // No config at all: the bio and the diet carry (a member re-saves or
    // updates them), the driver profile is fresh — "who's driving in whose car
    // ... have to be fresh".
    const plan = await planRollover();

    expect(plan.carriesOver.map((e) => e.key)).toEqual([
      "burner_profile",
      "dietary_requirements",
    ]);
    // A `fresh` code key lands in notSent and can never be acted on: only
    // sendActivation inserts an activation and it needs a definitions row. The
    // plan says so rather than pretending the rollover will handle it.
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

  it("has no year on a camp that has never said what year it is", async () => {
    const db = h.db();
    await seedCamp(db);

    const plan = await planRollover();

    // Not an error — it is the page's first screen, which asks.
    expect(plan.from).toBeNull();
    expect(plan.suggestedYear).toBeNull();
    // …and the buckets are still real, so the screen behind it is honest.
    expect(plan.reGate).toHaveLength(1);
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
    await foundedAt(db, 2026);

    // A member answered the fresh questionnaire in 2026. It must survive.
    await completeBuilderResponse({
      userId: camp.m1.id,
      definitionKey: "dietary_survey",
      definitionVersion: "dietary_survey-v1",
      cycle: 2026,
      responses: { q1: "No nuts" },
      activationId: camp.freshOpen.id,
    });
    const gatesBefore = await db.select().from(schema.requiredActions);

    const res = await advanceCycle({
      year: 2027,
      actorUserId: camp.captain.id,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // --- the cycle itself ---------------------------------------------------
    expect(res.report.to).toMatchObject({ year: 2027, endedAt: null });
    const config = await storedConfig(db);
    expect(config?.cycles).toHaveLength(2);
    expect(config?.cycles?.[0]!.year).toBe(2026);
    expect(config?.cycles?.[0]!.endedAt).not.toBeNull();
    expect(config?.cycles?.[1]!.year).toBe(2027);
    // The spread kept the rest of the JSONB column — the seeded team list.
    expect(config?.teams).toHaveLength(8);

    // --- the fresh questionnaire: closed, then re-opened blank --------------
    const dietary = await activationsFor(db, "dietary_survey");
    expect(dietary).toHaveLength(2); // the old row is KEPT, not replaced
    const closed = dietary.find((a) => a.id === camp.freshOpen.id)!;
    expect(closed.status).toBe("closed");
    expect(closed.closedAt).not.toBeNull();
    expect(closed.cycle).toBe(UNSET_CYCLE); // opened before the year was named

    const fresh = dietary.find((a) => a.id !== camp.freshOpen.id)!;
    expect(fresh.status).toBe("open");
    expect(fresh.cycle).toBe(2027);
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
    expect(skills[0]!.cycle).toBe(UNSET_CYCLE);
    expect(
      (await requiredActionsFor(db, camp.m1.id)).find(
        (r) => r.actionKey === "skills",
      )!.status,
    ).toBe("pending");

    const pitch = await activationsFor(db, "workshop_pitch");
    expect(pitch).toHaveLength(1);
    expect(pitch[0]!.status).toBe("closed");

    // --- 2026's answers are still readable ---------------------------------
    const priorYear = await loadQuestionnaireResponse(
      camp.m1.id,
      "dietary_survey",
      { cycle: 2026, carryOver: true },
    );
    expect(priorYear?.responses).toEqual({ q1: "No nuts" });
    expect(priorYear?.completedAt).not.toBeNull();
    // …and 2027's form is blank, which is what `fresh` means.
    expect(
      await loadQuestionnaireResponse(camp.m1.id, "dietary_survey", {
        cycle: 2027,
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
      to: { year: 2027 },
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
    await foundedAt(db, 2026);

    const res = await advanceCycle({ year: 2027, actorUserId: null });
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

  it("a second press with the same year is refused", async () => {
    const db = h.db();
    await seedCamp(db);
    await foundedAt(db, 2026);

    // The FOR UPDATE lock on the singleton reduces two captains pressing at
    // once to exactly this: one runs, the other observes the year already in
    // the cycle list. (PGlite serves one connection, so the race is asserted in
    // its serialised form rather than by overlapping transactions.)
    expect((await advanceCycle({ year: 2027, actorUserId: null })).ok).toBe(
      true,
    );
    expect(await advanceCycle({ year: 2027, actorUserId: null })).toEqual({
      ok: false,
      reason: "already-advanced",
    });

    // The loser changed nothing: still one advance, one re-gate, one audit row.
    const config = await storedConfig(db);
    expect(config?.cycles).toHaveLength(2);
    expect(await activationsFor(db, "dietary_survey")).toHaveLength(2);
    expect(await db.select().from(schema.auditLog)).toHaveLength(1);
  });

  it("refuses an implausible year without opening a transaction", async () => {
    const db = h.db();
    await seedCamp(db);

    // A typo that would otherwise be stamped on every row for the rest of the
    // camp's life.
    for (const year of [202, 20267, 2026.5]) {
      expect(await advanceCycle({ year, actorUserId: null })).toEqual({
        ok: false,
        reason: "invalid-year",
      });
    }
    expect(await storedConfig(db)).toBeUndefined();
  });

  it("refuses a year that is not later than the one the camp is in", async () => {
    const db = h.db();
    await seedCamp(db);
    await foundedAt(db, 2026);

    // A year is a date. It only goes forwards — a camp skipping a burn types
    // 2028, it never goes back to 2025.
    expect(await advanceCycle({ year: 2025, actorUserId: null })).toEqual({
      ok: false,
      reason: "invalid-year",
    });
    expect((await storedConfig(db))?.cycles).toHaveLength(1);
  });

  it("refuses to advance a camp that never said what year it is", async () => {
    const db = h.db();
    await seedCamp(db);

    // There is no "next" year without a current one; the page's first screen
    // (setFoundingYear) is where this goes instead.
    expect(await advanceCycle({ year: 2027, actorUserId: null })).toEqual({
      ok: false,
      reason: "no-founding-year",
    });
    expect(await activationsFor(db, "dietary_survey")).toHaveLength(1);
  });

  it("clears the dues ticks only when asked, and enumerates who was cleared", async () => {
    const db = h.db();
    const paid = await makeUser(db, {
      duesPaid: true,
      duesPaidAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const unpaid = await makeUser(db);

    await foundedAt(db, 2026);

    const kept = await advanceCycle({ year: 2027, actorUserId: null });
    expect(kept.ok && kept.report.duesCleared).toEqual([]);
    expect(
      (await db.select().from(schema.users).where(eq(schema.users.id, paid.id)))[0]!
        .duesPaid,
    ).toBe(true);

    const res = await advanceCycle({
      year: 2028,
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
    await foundedAt(db, 2026);

    const res = await advanceCycle({
      year: 2027,
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

describe("setFoundingYear", () => {
  const h = useTestDb();

  it("names the year and adopts every row stamped before there was one", async () => {
    const db = h.db();
    const camp = await seedCamp(db);
    await completeBuilderResponse({
      userId: camp.m1.id,
      definitionKey: "dietary_survey",
      definitionVersion: "dietary_survey-v1",
      cycle: UNSET_CYCLE,
      responses: { q1: "No nuts" },
      activationId: camp.freshOpen.id,
    });

    const res = await setFoundingYear({
      year: 2026,
      actorUserId: camp.captain.id,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Migration 0019 could only default the column to a sentinel — a migration
    // cannot know what year it is. This is the captain saying so, and the same
    // transaction that records the year moves the rows onto it.
    expect(res.report).toMatchObject({
      year: 2026,
      activationsStamped: 3,
      responsesStamped: 1,
    });
    for (const act of await db
      .select()
      .from(schema.questionnaireActivations)) {
      expect(act.cycle).toBe(2026);
    }
    // Adopting a year is not a rewrite of the answer.
    expect(
      (
        await loadQuestionnaireResponse(camp.m1.id, "dietary_survey", {
          cycle: 2026,
          carryOver: false,
        })
      )?.responses,
    ).toEqual({ q1: "No nuts" });

    const config = await storedConfig(db);
    expect(config?.cycles).toEqual([
      { year: 2026, startedAt: expect.any(String), endedAt: null },
    ]);
    // The spread kept the rest of the JSONB column — the seeded team list.
    expect(config?.teams).toHaveLength(8);

    const audit = await db.select().from(schema.auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.id).toBe(res.report.auditLogId);
    expect(audit[0]!.action).toBe("camp.cycle.founded");
    expect(audit[0]!.target).toBe("2026");
  });

  it("cannot run twice", async () => {
    const db = h.db();
    expect((await setFoundingYear({ year: 2026, actorUserId: null })).ok).toBe(
      true,
    );
    expect(await setFoundingYear({ year: 2030, actorUserId: null })).toEqual({
      ok: false,
      reason: "already-founded",
    });

    // The loser changed nothing: one year, one audit row.
    expect((await storedConfig(db))?.cycles).toEqual([
      { year: 2026, startedAt: expect.any(String), endedAt: null },
    ]);
    expect(await db.select().from(schema.auditLog)).toHaveLength(1);
  });

  it("refuses an implausible year without writing anything", async () => {
    const db = h.db();
    await seedCamp(db);

    for (const year of [202, 20267, 1999, 2026.5]) {
      expect(await setFoundingYear({ year, actorUserId: null })).toEqual({
        ok: false,
        reason: "invalid-year",
      });
    }
    expect(await storedConfig(db)).toBeUndefined();
    expect((await activationsFor(db, "dietary_survey"))[0]!.cycle).toBe(
      UNSET_CYCLE,
    );
  });

  it("reports honestly when there is nothing to adopt", async () => {
    const res = await setFoundingYear({ year: 2026, actorUserId: null });
    expect(res.ok && res.report).toMatchObject({
      activationsStamped: 0,
      responsesStamped: 0,
    });
  });

  it("hands the rollover a camp it can advance", async () => {
    const db = h.db();
    await seedCamp(db);
    await setFoundingYear({ year: 2026, actorUserId: null });

    expect((await planRollover()).from).toMatchObject({ year: 2026 });
    expect((await advanceCycle({ year: 2027, actorUserId: null })).ok).toBe(
      true,
    );

    // Last year's send keeps the year it was adopted into; only the
    // replacement carries the new one.
    const dietary = await activationsFor(db, "dietary_survey");
    expect(dietary.find((a) => a.status === "closed")!.cycle).toBe(2026);
    expect(dietary.find((a) => a.status === "open")!.cycle).toBe(2027);
  });
});

// --- The facts that must NOT carry over ------------------------------------
// The camp owner: "who's driving in whose car and who's part of what team have
// to be fresh so that wouldn't carry over to the next year. Same with team lead
// roles." Those three live in their own tables, so a questionnaire's carry-over
// flag can't deliver it — each carries its own `cycle` instead, and freshness
// falls out of every read being scoped to the camp's year.
//
// Which means the rollover's job here is to do NOTHING. These tests pin that
// from both sides: the new year finds no rows, and last year's are all still
// there afterwards.

describe("teams, team leads and car seats go fresh at a rollover", () => {
  const h = useTestDb();

  /** A driver with a rider, a team and a lead role — all in one year. */
  async function seedRoster(db: DB, cycle: number) {
    const driver = await makeUser(db);
    const rider = await makeUser(db);
    await makeMembership(db, {
      userId: driver.id,
      team: "kitchen",
      isLead: true,
      cycle,
    });
    await makeMembership(db, { userId: rider.id, team: "kitchen", cycle });
    await makeDriverProfile(db, { userId: driver.id, cycle });
    await makeCarMember(db, {
      driverUserId: driver.id,
      memberUserId: rider.id,
      cycle,
    });
    return { driver, rider };
  }

  it("writes nothing to the three tables, and the new year finds no rows", async () => {
    const db = h.db();
    const { driver, rider } = await seedRoster(db, 2026);
    await foundedAt(db, 2026);

    const before = {
      memberships: await db.select().from(schema.teamMemberships),
      drivers: await db.select().from(schema.driverProfiles),
      seats: await db.select().from(schema.carMembers),
    };

    expect((await advanceCycle({ year: 2027, actorUserId: null })).ok).toBe(
      true,
    );

    // Rule 1: nothing destroyed. Byte-for-byte the same rows, still stamped
    // 2026 — the rollover neither copied them forward nor deleted them.
    expect(await db.select().from(schema.teamMemberships)).toEqual(
      before.memberships,
    );
    expect(await db.select().from(schema.driverProfiles)).toEqual(
      before.drivers,
    );
    expect(await db.select().from(schema.carMembers)).toEqual(before.seats);

    // And that is exactly what makes 2027 fresh: nobody is on a team, nobody
    // leads one, nobody has a seat, until it is established again.
    for (const table of [
      schema.teamMemberships,
      schema.driverProfiles,
      schema.carMembers,
    ]) {
      expect(
        await db.select().from(table).where(eq(table.cycle, 2027)),
      ).toHaveLength(0);
    }
    expect(await isTeamLead(driver.id)).toBe(false);
    expect(await isTeamLead(rider.id)).toBe(false);

    // Last year's roster is still readable — the point of not deleting it.
    const kept = await db
      .select()
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.cycle, 2026));
    expect(kept).toHaveLength(2);
    expect(kept.find((m) => m.userId === driver.id)!.isLead).toBe(true);
  });

  it("re-establishing the team in the new year brings the lead role back", async () => {
    const db = h.db();
    const { driver } = await seedRoster(db, 2026);
    await foundedAt(db, 2026);
    await advanceCycle({ year: 2027, actorUserId: null });

    await makeMembership(db, {
      userId: driver.id,
      team: "kitchen",
      isLead: true,
      cycle: 2027,
    });
    expect(await isTeamLead(driver.id)).toBe(true);

    // Two rows, one per year. The widened key is what allows that.
    expect(
      await db
        .select()
        .from(schema.teamMemberships)
        .where(eq(schema.teamMemberships.userId, driver.id)),
    ).toHaveLength(2);
  });

  it("says so on the confirm screen rather than letting a captain find out", async () => {
    const db = h.db();
    await foundedAt(db, 2026);
    const plan = await planRollover();
    const line = plan.untouched.find((u) => u.startsWith("Teams and cars"));
    expect(line).toBeDefined();
    // Both halves have to be there: kept on file, AND empty for the new year.
    expect(line).toMatch(/readable/i);
    expect(line).toMatch(/EMPTY for the new year/);
  });

  it("the widened keys allow the same fact in two years, never twice in one", async () => {
    const db = h.db();
    const driver = await makeUser(db);
    const rider = await makeUser(db);

    const membership = (cycle: number) =>
      db
        .insert(schema.teamMemberships)
        .values({ userId: driver.id, team: "kitchen", cycle });
    await membership(2026);
    await membership(2027); // a different year is a different row
    await expect(membership(2027)).rejects.toMatchObject({
      cause: { code: "23505" },
    });

    const profile = (cycle: number) =>
      db
        .insert(schema.driverProfiles)
        .values({ userId: driver.id, cycle, version: "1" });
    await profile(2026);
    await profile(2027);
    await expect(profile(2027)).rejects.toMatchObject({
      cause: { code: "23505" },
    });

    const seat = (cycle: number) =>
      db.insert(schema.carMembers).values({
        driverUserId: driver.id,
        memberUserId: rider.id,
        cycle,
      });
    await seat(2026);
    await seat(2027);
    await expect(seat(2027)).rejects.toMatchObject({
      cause: { code: "23505" },
    });

    // The composite FK is what keeps a seat pointing at THAT year's car: 2028
    // has no driver profile, so it has no seats either.
    await expect(seat(2028)).rejects.toMatchObject({
      cause: { code: "23503" },
    });
  });

  // The only production writer of driver_profiles (apps/web's
  // update_my_driver_profile MCP tool) upserts. Widening the primary key
  // silently invalidated its ON CONFLICT target, and that mistake TYPECHECKS —
  // Drizzle accepts any column there and Postgres only objects at runtime. So
  // the constraint contract is pinned here, against a real Postgres, from both
  // sides.
  it("upserting a driver profile has to name the whole key, not just the user", async () => {
    const db = h.db();
    const driver = await makeUser(db);
    await makeDriverProfile(db, { userId: driver.id, cycle: 2026 });

    // user_id alone is no longer unique, so Postgres has nothing to match.
    await expect(
      db
        .insert(schema.driverProfiles)
        .values({ userId: driver.id, cycle: 2026, version: "2" })
        .onConflictDoUpdate({
          target: schema.driverProfiles.userId,
          set: { version: "2" },
        }),
    ).rejects.toMatchObject({ cause: { code: "42P10" } });

    // (user_id, cycle) is the key, and it updates THIS year's row in place.
    await db
      .insert(schema.driverProfiles)
      .values({ userId: driver.id, cycle: 2026, version: "2" })
      .onConflictDoUpdate({
        target: [schema.driverProfiles.userId, schema.driverProfiles.cycle],
        set: { version: "2" },
      });

    // The same upsert in a new year INSERTS rather than overwriting, which is
    // what makes driving fresh without destroying last year's record.
    await db
      .insert(schema.driverProfiles)
      .values({ userId: driver.id, cycle: 2027, version: "3" })
      .onConflictDoUpdate({
        target: [schema.driverProfiles.userId, schema.driverProfiles.cycle],
        set: { version: "3" },
      });

    const rows = await db
      .select()
      .from(schema.driverProfiles)
      .where(eq(schema.driverProfiles.userId, driver.id));
    expect(
      rows.map((r) => [r.cycle, r.version]).sort((a, b) => +a[0]! - +b[0]!),
    ).toEqual([
      [2026, "2"],
      [2027, "3"],
    ]);
  });
});

describe("setFoundingYear adopts the year-scoped roster facts", () => {
  const h = useTestDb();

  it("moves them off the sentinel so naming the year does not blank the roster", async () => {
    const db = h.db();
    const driver = await makeUser(db);
    const rider = await makeUser(db);
    // Everything that existed before the camp had a year carries the sentinel.
    await makeMembership(db, {
      userId: driver.id,
      team: "kitchen",
      isLead: true,
      cycle: UNSET_CYCLE,
    });
    await makeDriverProfile(db, { userId: driver.id, cycle: UNSET_CYCLE });
    await makeCarMember(db, {
      driverUserId: driver.id,
      memberUserId: rider.id,
      cycle: UNSET_CYCLE,
    });

    const res = await setFoundingYear({ year: 2026, actorUserId: null });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.report).toMatchObject({
      teamMembershipsStamped: 1,
      driverProfilesStamped: 1,
      carSeatsStamped: 1,
    });

    // Without this, a live camp's driver profiles would vanish from the roster
    // the moment a captain answered "what year is it?".
    expect(await isTeamLead(driver.id)).toBe(true);
    for (const table of [
      schema.teamMemberships,
      schema.driverProfiles,
      schema.carMembers,
    ]) {
      const rows = await db.select().from(table);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.cycle).toBe(2026);
    }

    const audit = await db.select().from(schema.auditLog);
    expect(audit[0]!.metadata).toMatchObject({
      teamMembershipsStamped: 1,
      driverProfilesStamped: 1,
      carSeatsStamped: 1,
    });
  });
});
