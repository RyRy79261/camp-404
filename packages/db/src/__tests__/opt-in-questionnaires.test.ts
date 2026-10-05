import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  fromBuilderQuestionnaire,
  type BuilderQuestionnaire,
} from "@camp404/types";
import { useTestDb } from "./_harness";
import {
  makeActivation,
  makeMembership,
  makeUser,
  requiredActionsFor,
} from "./_factories";
import { insertDefinitionDraft } from "../questionnaire-definitions";
import {
  closeActivation,
  publishDefinition,
  remindDueSoon,
  SEND_REFUSED,
  sendActivation,
  sendReminder,
} from "../questionnaire-lifecycle";
import {
  completeBuilderResponse,
  countOptInMembers,
  getOptInAccess,
  getActivationById,
  getPendingRequiredActions,
  listOptionalQuestionnaires,
  listPendingQuestionnaires,
  openActivation,
  reconcileOpenActivations,
} from "../activations";
import { upsertQuestionnaireResponse } from "../questionnaire-responses";
import {
  listActivationResponses,
  listOpenSendGates,
} from "../questionnaire-results";
import { advanceCycle } from "../cycle-rollover";
import { DEFAULT_CAMP_CONFIG } from "../camp-config";
import * as schema from "../schema";

// Optional questionnaires (opt_in, #313; owner approved 2026-10-03: "Build the
// opt in questionnaire and label it optional"). A captain puts a questionnaire
// in every camp member's My forms and asks nobody: no required_actions rows,
// no reminders, open until a captain closes it.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

const KEY = "art_build";
const TITLE = "Help build the art piece";

function definition(): BuilderQuestionnaire {
  return {
    version: "1",
    title: TITLE,
    pages: [
      {
        id: "p1",
        type: "question",
        title: "Skills",
        blocks: [
          {
            kind: "question",
            question: {
              id: "q1",
              kind: "short_text",
              prompt: "What can you do?",
              required: false,
              maxLength: 120,
            },
          },
        ],
      },
    ],
  };
}

async function publish(): Promise<void> {
  await insertDefinitionDraft({
    key: KEY,
    title: TITLE,
    createdBy: null,
    definition: fromBuilderQuestionnaire(definition()),
  });
  const res = await publishDefinition(KEY, null);
  if (!res.ok) throw new Error("publish failed");
}

async function putInMyForms(
  senderId: string,
  extra: { announce?: boolean } = {},
) {
  return sendActivation({
    questionnaireKey: KEY,
    scope: "opt_in",
    // A hand-made request may say blocking with a deadline; an optional
    // questionnaire stores neither.
    blocking: true,
    dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    activatedByUserId: senderId,
    ...extra,
  });
}

async function deliveries(db: DB) {
  return db
    .select({
      userId: schema.notificationDeliveries.userId,
      body: schema.notificationDeliveries.body,
      channel: schema.notificationDeliveries.channel,
      presentation: schema.notificationDeliveries.presentation,
      emailStatus: schema.notificationDeliveries.emailStatus,
      refId: schema.notificationDeliveries.refId,
    })
    .from(schema.notificationDeliveries);
}

async function answer(
  userId: string,
  activationId: string,
  text: string,
  firstSubmitOnly = true,
) {
  const act = await getActivationById(activationId);
  return completeBuilderResponse({
    userId,
    definitionKey: KEY,
    definitionVersion: act!.version,
    cycle: act!.cycle,
    responses: { q1: text },
    activationId,
    firstSubmitOnly,
  });
}

describe("sendActivation — opt_in", () => {
  const h = useTestDb();

  it("opens for a captain with no required_actions, not blocking and with no deadline", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await publish();

    const res = await putInMyForms(captain.id);
    expect(res).toMatchObject({ ok: true, created: 0 });
    if (!res.ok) return;

    const act = await getActivationById(res.activationId);
    expect(act).toMatchObject({
      status: "open",
      scope: "opt_in",
      blocking: false,
    });
    const [row] = await db
      .select({ dueAt: schema.questionnaireActivations.dueAt })
      .from(schema.questionnaireActivations)
      .where(eq(schema.questionnaireActivations.id, res.activationId));
    expect(row!.dueAt).toBeNull();

    // Nobody is gated, on nobody's to-do list, and nothing is said.
    for (const u of [captain, member]) {
      expect(await requiredActionsFor(db, u.id)).toEqual([]);
      expect(await getPendingRequiredActions(u.id)).toEqual([]);
      expect(await listPendingQuestionnaires(u.id)).toEqual([]);
      expect(await reconcileOpenActivations(u.id)).toBe(0);
    }
    expect(await deliveries(db)).toEqual([]);
  });

  it("tells every camp member once, quietly, when the captain asks", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await makeUser(db, { approvalStatus: "pending" });
    await makeUser(db, { isSystem: true });
    await makeUser(db, { sanitised: true });
    await publish();

    const res = await putInMyForms(captain.id, { announce: true });
    if (!res.ok) throw new Error(res.error);

    const notes = await deliveries(db);
    expect(notes.map((n) => n.userId).sort()).toEqual(
      [captain.id, member.id].sort(),
    );
    for (const note of notes) {
      expect(note).toMatchObject({
        channel: "in_app",
        presentation: "feed",
        emailStatus: "skipped",
        refId: res.activationId,
        body: `${TITLE} is in My forms under Optional. Nobody has to fill it in: answer it if you want to.`,
      });
    }
  });

  it("refuses a team lead and a plain member inside the write, and stores nothing", async () => {
    const db = h.db();
    const lead = await makeUser(db);
    await makeMembership(db, {
      userId: lead.id,
      team: "kitchen",
      isLead: true,
    });
    const member = await makeUser(db);
    await publish();

    for (const sender of [lead, member]) {
      expect(await putInMyForms(sender.id, { announce: true })).toEqual({
        ok: false,
        error: SEND_REFUSED,
      });
    }
    expect(await db.select().from(schema.questionnaireActivations)).toEqual([]);
    expect(await deliveries(db)).toEqual([]);
  });

  it("never reminds: not by a captain, not by the deadline reminders", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    await makeUser(db);
    await publish();
    const res = await putInMyForms(captain.id);
    if (!res.ok) throw new Error(res.error);

    expect(
      await sendReminder({ activationId: res.activationId, senderId: null }),
    ).toEqual({
      ok: false,
      error: "Nobody was asked to answer this, so there is nobody to remind.",
    });
    // Even with a deadline written straight onto the row, nothing goes out.
    await db
      .update(schema.questionnaireActivations)
      .set({ dueAt: new Date(Date.now() + 60 * 60 * 1000) })
      .where(eq(schema.questionnaireActivations.id, res.activationId));
    expect(await remindDueSoon()).toEqual({ activations: 1, reminded: 0 });
    expect(await deliveries(db)).toEqual([]);
  });

  it("is left off the Overview's answered-out-of-reached rail", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    await publish();
    const res = await putInMyForms(captain.id);
    if (!res.ok) throw new Error(res.error);
    expect(await listOpenSendGates()).toEqual([]);
  });
});

describe("My forms — the Optional section", () => {
  const h = useTestDb();

  it("lists an open optional questionnaire for every camp member until they answer it", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    const applicant = await makeUser(db, { approvalStatus: "pending" });
    await publish();
    const res = await putInMyForms(captain.id);
    if (!res.ok) throw new Error(res.error);

    const [listed] = await listOptionalQuestionnaires(member.id);
    expect(listed).toMatchObject({
      activationId: res.activationId,
      questionnaireKey: KEY,
      title: TITLE,
      started: false,
    });
    expect(listed!.questionnaire?.title).toBe(TITLE);
    expect(
      await getOptInAccess(
        member.id,
        (await getActivationById(res.activationId))!,
      ),
    ).toBe("answer");
    // An applicant the captains have not approved is not a camp member yet.
    expect(await listOptionalQuestionnaires(applicant.id)).toEqual([]);
    expect(
      await getOptInAccess(
        applicant.id,
        (await getActivationById(res.activationId))!,
      ),
    ).toBe("not-invited");

    // A saved draft keeps it listed, marked as started.
    const act = (await getActivationById(res.activationId))!;
    await upsertQuestionnaireResponse({
      userId: member.id,
      definitionKey: KEY,
      definitionVersion: act.version,
      cycle: act.cycle,
      responses: { q1: "Wel" },
      activationId: act.id,
      keepCompleted: true,
    });
    expect((await listOptionalQuestionnaires(member.id))[0]?.started).toBe(
      true,
    );

    // Submitted, it leaves Optional; nobody else's list changes.
    expect(await answer(member.id, act.id, "Welding")).toBe(true);
    expect(await listOptionalQuestionnaires(member.id)).toEqual([]);
    expect(await getOptInAccess(member.id, act)).toBe("completed");
    expect(await listOptionalQuestionnaires(captain.id)).toHaveLength(1);
  });

  it("fixes the answers once submitted: a second submit or a late draft writes nothing", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await publish();
    const res = await putInMyForms(captain.id);
    if (!res.ok) throw new Error(res.error);
    const act = (await getActivationById(res.activationId))!;

    expect(await answer(member.id, act.id, "Welding")).toBe(true);
    expect(await answer(member.id, act.id, "Painting")).toBe(false);
    expect(
      await upsertQuestionnaireResponse({
        userId: member.id,
        definitionKey: KEY,
        definitionVersion: act.version,
        cycle: act.cycle,
        responses: { q1: "Pain" },
        activationId: act.id,
        keepCompleted: true,
      }),
    ).toBe(false);

    const [stored] = await db
      .select({
        responses: schema.questionnaireResponses.responses,
        completedAt: schema.questionnaireResponses.completedAt,
      })
      .from(schema.questionnaireResponses)
      .where(eq(schema.questionnaireResponses.userId, member.id));
    expect(stored!.responses).toEqual({ q1: "Welding" });
    expect(stored!.completedAt).not.toBeNull();
  });

  it("closing the send takes it out of Optional and keeps the answers", async () => {
    const db = h.db();
    // Closes the send; a system user, so no audience counts it.
    const actor = await makeUser(db, { isSystem: true });
    const captain = await makeUser(db, { rank: "captain" });
    const answered = await makeUser(db);
    const other = await makeUser(db);
    await publish();
    const res = await putInMyForms(captain.id);
    if (!res.ok) throw new Error(res.error);
    await answer(answered.id, res.activationId, "Carpentry");

    expect(await closeActivation(res.activationId, actor.id)).toEqual({
      ok: true,
    });
    expect(await listOptionalQuestionnaires(other.id)).toEqual([]);
    const act = (await getActivationById(res.activationId))!;
    expect(await getOptInAccess(other.id, act)).toBe("closed");
    expect(await getOptInAccess(answered.id, act)).toBe("completed");
  });

  it("counts the camp members it is open to", async () => {
    const db = h.db();
    await makeUser(db, { rank: "captain" });
    await makeUser(db);
    await makeUser(db, { approvalStatus: "pending" });
    await makeUser(db, { approvalStatus: "rejected" });
    await makeUser(db, { isSystem: true });
    await makeUser(db, { sanitised: true });
    expect(await countOptInMembers()).toBe(2);
  });
});

describe("Results — who chose to answer", () => {
  const h = useTestDb();

  it("holds the finished answers and the started ones, with no gates", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const a = await makeUser(db);
    const b = await makeUser(db);
    const c = await makeUser(db);
    await publish();
    const res = await putInMyForms(captain.id);
    if (!res.ok) throw new Error(res.error);
    const act = (await getActivationById(res.activationId))!;

    await answer(a.id, act.id, "Welding");
    await answer(b.id, act.id, "Painting");
    await upsertQuestionnaireResponse({
      userId: c.id,
      definitionKey: KEY,
      definitionVersion: act.version,
      cycle: act.cycle,
      responses: { q1: "Elec" },
      activationId: act.id,
      keepCompleted: true,
    });

    const rows = await listActivationResponses({
      definitionKey: KEY,
      cycle: act.cycle,
    });
    expect(rows.filter((r) => r.completedAt !== null)).toHaveLength(2);
    expect(
      rows.filter((r) => r.responses !== null && r.completedAt === null),
    ).toHaveLength(1);
    expect(rows.every((r) => r.gateStatus === null)).toBe(true);
  });
});

describe("Year rollover — like any builder questionnaire", () => {
  const h = useTestDb();

  it("re-opens a fresh optional send for the new year, still asking nobody", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await db.insert(schema.campSettings).values({
      config: {
        ...DEFAULT_CAMP_CONFIG,
        cycles: [
          { year: 2026, startedAt: "2026-01-01T00:00:00.000Z", endedAt: null },
        ],
      },
    });
    await publish();
    await db
      .update(schema.questionnaireDefinitions)
      .set({ carryOver: false })
      .where(eq(schema.questionnaireDefinitions.key, KEY));
    const res = await putInMyForms(captain.id);
    if (!res.ok) throw new Error(res.error);
    await answer(member.id, res.activationId, "Welding");
    expect(await listOptionalQuestionnaires(member.id)).toEqual([]);

    const rolled = await advanceCycle({
      expectedFromYear: 2026,
      year: 2027,
      actorUserId: captain.id,
    });
    expect(rolled.ok).toBe(true);

    const rows = await db
      .select()
      .from(schema.questionnaireActivations)
      .where(eq(schema.questionnaireActivations.questionnaireKey, KEY));
    const open = rows.filter((r) => r.status === "open");
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ scope: "opt_in", cycle: 2027 });
    expect(await requiredActionsFor(db, member.id)).toEqual([]);
    // Last year's answer stays; this year the member may answer again.
    expect(await listOptionalQuestionnaires(member.id)).toMatchObject([
      { activationId: open[0]!.id, cycle: 2027, started: false },
    ]);
  });

  it("an opt_in draft opens through openActivation with zero gates", async () => {
    const db = h.db();
    await makeUser(db);
    const act = await makeActivation(db, { scope: "opt_in", blocking: false });
    expect(await openActivation(act.id)).toEqual({ ok: true, created: 0 });
    expect((await getActivationById(act.id))?.status).toBe("open");
  });
});
