import {
  completeBuilderResponse,
  ensureRequiredAction,
  getActivationById,
  satisfyRequiredAction,
} from "@camp404/db/activations";
import { bootstrapFirstCaptain } from "@camp404/db/bootstrap";
import {
  createCampUser,
  setUserApproval,
  setUserRank,
  upsertBurnerProfile,
} from "@camp404/db/burner-profile";
import { setFoundingYear } from "@camp404/db/cycle-rollover";
import { createInviteCode } from "@camp404/db/invite-codes";
import { recordPayment } from "@camp404/db/payments";
import { insertDefinitionDraft } from "@camp404/db/questionnaire-definitions";
import {
  publishDefinition,
  sendActivation,
} from "@camp404/db/questionnaire-lifecycle";
import { countPeople, wipeAllPublicTables } from "@camp404/db/seed-support";
import { assignTeam, setLead } from "@camp404/db/team-memberships";
import type { BuilderQuestionnaire } from "@camp404/types";
import {
  planSmallCamp,
  SEED_AUTH_PREFIX,
  SEED_INVITE_CODE,
  SEED_YEAR,
} from "./seed-plan";

// `camp404 seed --scenario small-camp` and `camp404 wipe-test-data`.
//
// The seed goes through the app's own writers (bootstrap, invites, profiles,
// approvals, teams, publish, send, answers, payments), so every row carries
// the year stamp and the audit trail a real camp would. It refuses any
// database that already holds a real person, and so does the wipe: both are
// for a local stack or a throwaway Neon branch, never production.

export const SCENARIOS = ["small-camp"] as const;
export type Scenario = (typeof SCENARIOS)[number];

function refuseProduction(): void {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Refusing: VERCEL_ENV is production.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("Refusing: DATABASE_URL is not set.");
  }
}

const ARRIVAL_PLANS: BuilderQuestionnaire = {
  version: "1",
  title: "Arrival plans",
  pages: [
    {
      id: "arrival",
      type: "question",
      title: "Getting there",
      blocks: [
        {
          kind: "question",
          question: {
            id: "arrival_day",
            kind: "single_select",
            prompt: "Which day do you arrive?",
            options: [
              { value: "sunday", label: "Sunday" },
              { value: "monday", label: "Monday" },
              { value: "tuesday", label: "Tuesday" },
            ],
            required: true,
          },
        },
        {
          kind: "question",
          question: {
            id: "bringing",
            kind: "short_text",
            prompt: "What are you bringing for the camp?",
            maxLength: 120,
            required: false,
          },
        },
      ],
    },
  ],
};

const DAYS = ["sunday", "monday", "tuesday"] as const;

export async function seedScenario(scenario: Scenario): Promise<string[]> {
  refuseProduction();
  const people = await countPeople(SEED_AUTH_PREFIX);
  if (people.all > 0) {
    throw new Error(
      `Refusing: the database already has ${people.all} people. Seed an empty database (a fresh Neon branch, or pnpm db:local:up on a new volume).`,
    );
  }
  if (scenario !== "small-camp")
    throw new Error(`Unknown scenario ${scenario}`);

  const log: string[] = [];

  // The founder: first-time setup, as /setup does it.
  const founderResult = await bootstrapFirstCaptain({
    authUserId: `${SEED_AUTH_PREFIX}founder`,
    displayName: "Sam Founder",
    founderCode: "meowzit",
  });
  if (!founderResult.ok) throw new Error("The camp is already set up.");
  const founder = founderResult.userId;
  await upsertBurnerProfile({
    userId: founder,
    version: "seed",
    responses: {},
    markComplete: true,
  });
  const founded = await setFoundingYear({
    year: SEED_YEAR,
    actorUserId: founder,
  });
  if (!founded.ok)
    throw new Error(`Could not name the year: ${founded.reason}`);
  log.push(`Founder Sam Founder, camp year ${SEED_YEAR}.`);

  await createInviteCode({
    code: SEED_INVITE_CODE,
    createdByUserId: founder,
    note: "Seeded crew code",
  });

  const members = planSmallCamp();
  const ids = new Map<string, string>();
  for (const member of members) {
    const row = await createCampUser({
      authUserId: member.authUserId,
      displayName: member.displayName,
      inviteCode: SEED_INVITE_CODE,
      approvalStatus: "pending",
    });
    ids.set(member.authUserId, row.id);
    await ensureRequiredAction({
      userId: row.id,
      type: "questionnaire",
      actionKey: "burner_profile",
      title: "Complete your burner profile",
    });
    const finished = member.standing !== "onboarding";
    await upsertBurnerProfile({
      userId: row.id,
      version: "seed",
      responses: {},
      markComplete: finished,
    });
    if (finished) await satisfyRequiredAction(row.id, "burner_profile");
    if (member.standing === "approved" || member.standing === "rejected") {
      await setUserApproval({
        userId: row.id,
        from: "pending",
        to: member.standing,
        decidedByUserId: founder,
        reason:
          member.standing === "rejected" ? "The camp is full this year." : null,
      });
    }
    if (member.captain) await setUserRank(row.id, "captain");
    if (member.team) {
      await assignTeam({ userId: row.id, team: member.team, actorId: founder });
      if (member.leadsTeam) {
        await setLead({
          userId: row.id,
          team: member.team,
          isLead: true,
          actorId: founder,
        });
      }
    }
  }
  const count = (standing: string) =>
    members.filter((m) => m.standing === standing).length;
  log.push(
    `${members.length} members: ${count("approved")} approved, ${count("pending")} pending, ${count("rejected")} rejected, ${count("onboarding")} still onboarding.`,
  );

  // A published questionnaire, sent to everyone (not blocking), partly answered.
  await insertDefinitionDraft({
    key: "arrival-plans",
    title: ARRIVAL_PLANS.title,
    createdBy: founder,
    definition: ARRIVAL_PLANS,
  });
  const published = await publishDefinition("arrival-plans", founder);
  if (!published.ok) throw new Error(published.errors.join(" "));
  const sent = await sendActivation({
    questionnaireKey: "arrival-plans",
    scope: "everyone",
    blocking: false,
    activatedByUserId: founder,
  });
  if (!sent.ok) throw new Error(sent.error);
  const activation = await getActivationById(sent.activationId);
  if (!activation) throw new Error("The send did not read back.");
  const answering = members.filter((m) => m.answers);
  for (const [i, member] of answering.entries()) {
    await completeBuilderResponse({
      userId: ids.get(member.authUserId)!,
      definitionKey: activation.questionnaireKey,
      definitionVersion: activation.version,
      cycle: activation.cycle,
      activationId: activation.id,
      responses: {
        arrival_day: DAYS[i % DAYS.length]!,
        bringing: "A gazebo and two chairs",
      },
    });
  }
  log.push(`"Arrival plans" sent to everyone; ${answering.length} answered.`);

  const paying = members.filter((m) => m.paid);
  for (const member of paying) {
    await recordPayment({
      userId: ids.get(member.authUserId)!,
      amountCents: 150_000,
      status: "reconciled",
      note: "Seeded payment",
      recordedByUserId: founder,
    });
  }
  log.push(`${paying.length} dues payments received.`);
  return log;
}

/**
 * Empty a database that holds only seeded people. Refuses when anyone real is
 * there, so it can never wipe a camp.
 */
export async function wipeSeededData(): Promise<string> {
  refuseProduction();
  const people = await countPeople(SEED_AUTH_PREFIX);
  if (people.real > 0) {
    throw new Error(
      `Refusing: ${people.real} people here were not seeded. This only empties a seeded database.`,
    );
  }
  await wipeAllPublicTables();
  return `Emptied ${people.all} seeded people and everything they made.`;
}
