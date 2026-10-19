// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_TARGET } from "@camp404/core";
import { Team, type EmergencyContact } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, outcome, type People } from "./_agreement";

// The camp's people, through lib/users.ts and lib/relations.ts, on the
// database and on the E2E store: the same members, the same captain decisions,
// profile writes and gate rows, the same answers. What a decision keeps of the
// captain's reason lives once in @camp404/core (approvalDecisionReason); which
// moves are decisions is isReviewTransition. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));
// The approval writes a notice and asks for delivery after the response;
// there is no response here.
vi.mock("../background-work", () => ({ deliverAfterResponse: vi.fn() }));

import { testStore } from "../test-store";
import { getReferralRoster } from "../relations";
import { getCampHeadcount, listTeamPeople } from "../roster";
import {
  decideUserApproval,
  findCampUserById,
  getBurnerProfile,
  getEmergencyContacts,
  getIdDocuments,
  getMyMemberships,
  getPendingQuestionnaires,
  getPendingRequiredActions,
  satisfyBurnerProfileAction,
  saveBurnerProfileReplay,
  seedBurnerProfileAction,
  setCampUserRank,
  setDisplayName,
  setEmergencyContacts,
  setIdDocuments,
  setProfileImage,
  setTelegramHandle,
  syncOpenGates,
  upsertBurnerProfile,
} from "../users";

const KITCHEN = Team.enum.kitchen;
const { approve, reject, reopen } = REVIEW_TARGET;
/** A well-formed id nobody has, on both sides. */
const NOBODY = "00000000-0000-4000-8000-000000000000";

/** What a screen reads of a member's row (the invite code is the seed's). */
async function seen(userId: string) {
  const u = await findCampUserById(userId);
  return u
    ? {
        displayName: u.displayName,
        profileImageUrl: u.profileImageUrl,
        rank: u.rank,
        approvalStatus: u.approvalStatus,
        approvalDecisionReason: u.approvalDecisionReason,
      }
    : null;
}

const decide = (
  p: People,
  userId: string,
  from: (typeof REVIEW_TARGET)[keyof typeof REVIEW_TARGET],
  to: (typeof REVIEW_TARGET)[keyof typeof REVIEW_TARGET],
  reason?: string,
) =>
  outcome(() =>
    decideUserApproval({
      userId,
      from,
      to,
      decidedByUserId: p.captain,
      reason,
    }),
  );

describe("the camp's people: the database and the test store agree", () => {
  const h = useTestDb();
  beforeAll(() => {
    process.env.PGCRYPTO_KEY ??= "test-key-for-the-users-agreement";
  });
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("decides a sign-up once, keeps the reason as core says, and offboards a rejected member", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const late = await seed.user("Late", { approval: "pending" });
      await seed.join(p.member, KITCHEN);
      const first = await decide(p, late, reopen, approve, "  Welcome  ");
      const stale = await decide(p, late, reopen, approve);
      const rejected = await decide(
        p,
        p.member,
        approve,
        reject,
        "  Not this year ",
      );
      const blank = await decide(p, p.other, approve, reject, "   ");
      const reopened = await decide(p, p.other, reject, reopen, "kept?");
      const notADecision = await decide(p, p.captain, approve, approve);
      const nobody = await decide(p, NOBODY, reopen, approve);
      return {
        first,
        stale,
        rejected,
        blank,
        reopened,
        notADecision,
        nobody,
        late: await seen(late),
        member: await seen(p.member),
        other: await seen(p.other),
        memberTeams: await getMyMemberships(p.member),
        kitchen: await listTeamPeople(KITCHEN),
        headcount: await getCampHeadcount(),
      };
    });
    expect(db).toMatchObject({
      first: { ok: true },
      stale: { ok: false },
      rejected: { ok: true },
      blank: { ok: true },
      reopened: { ok: true },
      notADecision: {
        threw: "Error: setUserApproval: approved -> approved is not a decision",
      },
      nobody: { ok: false },
      late: { approvalStatus: "approved", approvalDecisionReason: "Welcome" },
      member: {
        approvalStatus: "rejected",
        approvalDecisionReason: "Not this year",
      },
      other: { approvalStatus: "pending", approvalDecisionReason: null },
      memberTeams: [],
      kitchen: [{ displayName: "Cook", isLead: true }],
      headcount: { members: 4, waiting: 1 },
    });
    expect(store).toEqual(db);
  });

  it("writes a member's own profile, name, photo, handle, rank, ID and contacts the same way", async () => {
    const contacts: EmergencyContact[] = [
      { name: "Ma", phone: "+27 82 000 0000", relationship: "Mother" },
    ];
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await seed.join(p.member, KITCHEN);
      await upsertBurnerProfile({
        userId: p.member,
        version: "v1",
        responses: { country: "ZA" },
        markComplete: false,
      });
      const started = await getBurnerProfile(p.member);
      await upsertBurnerProfile({
        userId: p.member,
        version: "v2",
        responses: { country: "NA" },
        markComplete: true,
      });
      await setDisplayName(p.member, "Nova Prime");
      await setProfileImage(p.member, "/avatars/nova.png");
      await setTelegramHandle(p.member, "nova");
      await setCampUserRank(p.other, "captain");
      await setIdDocuments(p.member, { idType: "passport", idNumber: "A123" });
      await setEmergencyContacts(p.member, contacts);
      await setEmergencyContacts(p.other, []);
      return {
        started: started && {
          responses: started.responses,
          done: started.completedAt !== null,
          version: started.version,
        },
        profile: await getBurnerProfile(p.member),
        nobodysProfile: await getBurnerProfile(p.other),
        member: await seen(p.member),
        other: await seen(p.other),
        kitchen: await listTeamPeople(KITCHEN),
        id: await getIdDocuments(p.member),
        noId: await getIdDocuments(p.other),
        contacts: await getEmergencyContacts(p.member),
        noContacts: await getEmergencyContacts(p.other),
      };
    });
    expect(db).toMatchObject({
      started: { responses: { country: "ZA" }, done: false, version: "v1" },
      profile: { responses: { country: "NA" }, version: "v2" },
      nobodysProfile: null,
      member: {
        displayName: "Nova Prime",
        profileImageUrl: "/avatars/nova.png",
      },
      other: { rank: "captain" },
      kitchen: [
        { displayName: "Cook", isLead: true },
        { displayName: "Nova Prime", handle: "nova", isLead: false },
      ],
      id: { idType: "passport", idNumber: "A123" },
      contacts,
      noContacts: null,
    });
    expect(store).toEqual(db);
  });

  it("opens, lists and satisfies the burner-profile gate, and a My forms replay re-satisfies it", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      await seedBurnerProfileAction(p.member);
      await seedBurnerProfileAction(p.member);
      const open = await getPendingRequiredActions(p.member);
      await satisfyBurnerProfileAction(p.member);
      const done = await getPendingRequiredActions(p.member);
      await seedBurnerProfileAction(p.other);
      await saveBurnerProfileReplay({
        userId: p.other,
        version: "v1",
        responses: { country: "ZA" },
        id: null,
        emergencyContacts: [],
        telegramHandle: "zed",
        edit: null,
      });
      return {
        open,
        done,
        otherOpen: await getPendingRequiredActions(p.other),
        otherProfile: await getBurnerProfile(p.other),
        reconciled: await syncOpenGates(p.member),
        questionnaires: await getPendingQuestionnaires(p.member),
        captain: await getPendingRequiredActions(p.captain),
      };
    });
    expect(db).toMatchObject({
      open: [
        {
          actionKey: "burner_profile",
          type: "questionnaire",
          blocking: true,
          activationId: null,
        },
      ],
      done: [],
      otherOpen: [],
      otherProfile: { responses: { country: "ZA" }, version: "v1" },
      reconciled: 0,
      questionnaires: [],
      captain: [],
    });
    expect(store).toEqual(db);
  });

  it("lists the family tree by name, with no inviter for a seeded member", async () => {
    const { db, store } = await bothWays(mode, h, async () =>
      (await getReferralRoster()).map((r) => ({
        displayName: r.displayName,
        rank: r.rank,
        inviterId: r.inviterId,
      })),
    );
    expect(db).toEqual([
      { displayName: "Cap", rank: "captain", inviterId: null },
      { displayName: "Cook", rank: "member", inviterId: null },
      { displayName: "Fin", rank: "member", inviterId: null },
      { displayName: "Nova", rank: "member", inviterId: null },
      { displayName: "Zed", rank: "member", inviterId: null },
    ]);
    expect(store).toEqual(db);
  });
});
