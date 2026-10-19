// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { lostCatName } from "@camp404/core";
import { DIETARY_NOT_A_MEMBER } from "@camp404/db/dietary";
import { DIETS, Team, type EmergencyContact } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// Account erasure, through lib/account.ts, on the database and on the E2E
// store: the camp's last captain is refused (canLeaveCamp), an erased member
// becomes the next "Lost Cat #N" stub (lostCatName, nextLostCatNumber), their
// login no longer finds them, and every read of what the store holds says
// they are gone, as production's sanitiseAccount leaves it. The blob sweeps
// are the database side's only and are stubbed here. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));
vi.mock("../avatar-blob", () => ({ deleteAvatarBlobs: vi.fn() }));
vi.mock("../payment-proof", () => ({ deletePaymentProofBlobs: vi.fn() }));
vi.mock("../claim-receipts", () => ({ deleteClaimReceiptBlobs: vi.fn() }));
vi.mock("../report-screenshots", () => ({
  deleteReportScreenshotBlobs: vi.fn(),
}));
vi.mock("../pet-photos", () => ({ deletePetPhotoBlobs: vi.fn() }));
vi.mock("../background-work", () => ({ deliverAfterResponse: vi.fn() }));

import { testStore } from "../test-store";
import { deleteAccount } from "../account";
import { getMyDietary, saveMyDietary } from "../dietary";
import { getMyParticipation } from "../participations";
import { getReferralRoster } from "../relations";
import {
  getCampHeadcount,
  getCampManagementRoster,
  getTeamCoverage,
  listTeamPeople,
} from "../roster";
import { getMyTicket, setMyTicketStatus } from "../tickets";
import {
  findCampUserByAuthId,
  findCampUserById,
  getBurnerProfile,
  getEmergencyContacts,
  getIdDocuments,
  getMyMemberships,
  getPendingRequiredActions,
  seedBurnerProfileAction,
  setCampUserRank,
  setEmergencyContacts,
  setIdDocuments,
  setProfileImage,
  setTelegramHandle,
  upsertBurnerProfile,
} from "../users";

const KITCHEN = Team.enum.kitchen;
const contacts: EmergencyContact[] = [
  { name: "Ma", phone: "+27 82 000 0000", relationship: "Mother" },
];

describe("account erasure: the database and the test store agree", () => {
  const h = useTestDb();
  beforeAll(() => {
    process.env.PGCRYPTO_KEY ??= "test-key-for-the-account-agreement";
  });
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("refuses the camp's last captain, and lets them go once there is another", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const alone = await deleteAccount({ userId: p.captain, authUserId: "x" });
      const stillThere = (await findCampUserById(p.captain))?.displayName;
      await setCampUserRank(p.other, "captain");
      const withTwo = await deleteAccount({
        userId: p.captain,
        authUserId: "x",
      });
      const lastAgain = await deleteAccount({
        userId: p.other,
        authUserId: "x",
      });
      return {
        alone,
        stillThere,
        withTwo,
        lastAgain,
        // The invite code is the seed's own (kept by erasure), so not compared.
        erased: { ...(await findCampUserById(p.captain)), inviteCode: "kept" },
        headcount: await getCampHeadcount(),
      };
    });
    expect(db).toMatchObject({
      alone: { ok: false, reason: "sole_captain" },
      stillThere: "Cap",
      withTwo: { ok: true, lostCatNumber: 1 },
      lastAgain: { ok: false, reason: "sole_captain" },
      erased: { displayName: lostCatName(1), rank: "member" },
      headcount: { members: 4, waiting: 0 },
    });
    expect(store).toEqual(db);
  });

  it("turns a member into the next Lost Cat and leaves nothing of theirs the store holds", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      await seed.join(p.member, KITCHEN);
      await seed.participation(p.member, "accepted");
      await setMyTicketStatus({ userId: p.member, ticketStatus: "buying_own" });
      await upsertBurnerProfile({
        userId: p.member,
        version: "v1",
        responses: { country: "ZA" },
        markComplete: true,
      });
      await setProfileImage(p.member, "/avatars/nova.png");
      await setTelegramHandle(p.member, "nova");
      await setIdDocuments(p.member, { idType: "passport", idNumber: "A123" });
      await setEmergencyContacts(p.member, contacts);
      await seedBurnerProfileAction(p.member);
      await saveMyDietary({ userId: p.member, foods: [], diets: [DIETS[0]] });
      const before = await findCampUserById(p.member);
      const first = await deleteAccount({
        userId: p.other,
        authUserId: "x",
      });
      const erased = await deleteAccount({
        userId: p.member,
        authUserId: before!.authUserId,
      });
      const after = await findCampUserById(p.member);
      return {
        first,
        erased,
        after: after && {
          displayName: after.displayName,
          profileImageUrl: after.profileImageUrl,
          rank: after.rank,
          approvalStatus: after.approvalStatus,
          signsIn: after.authUserId === before!.authUserId,
        },
        byOldLogin: await findCampUserByAuthId(before!.authUserId),
        teams: await getMyMemberships(p.member),
        kitchen: (await listTeamPeople(KITCHEN)).map((m) => m.displayName),
        coverage: await getTeamCoverage(),
        place: await getMyParticipation(p.member),
        ticket: await getMyTicket(p.member),
        profile: await getBurnerProfile(p.member),
        id: await getIdDocuments(p.member),
        contacts: await getEmergencyContacts(p.member),
        gates: await getPendingRequiredActions(p.member),
        dietary: await getMyDietary(p.member),
        dietarySave: await saveMyDietary({
          userId: p.member,
          foods: [],
          diets: [],
        }),
        headcount: await getCampHeadcount(),
        roster: (await getCampManagementRoster()).map((m) => m.displayName),
        tree: (await getReferralRoster()).map((r) => r.displayName),
      };
    });
    expect(db).toMatchObject({
      first: { ok: true, lostCatNumber: 1 },
      erased: { ok: true, lostCatNumber: 2 },
      after: {
        displayName: lostCatName(2),
        profileImageUrl: null,
        rank: "member",
        signsIn: false,
      },
      byOldLogin: null,
      teams: [],
      kitchen: ["Cook"],
      coverage: [
        { team: KITCHEN, members: 1, leads: 1 },
        { team: Team.enum.finance, members: 1, leads: 1 },
      ],
      place: null,
      ticket: { ticketStatus: "unknown" },
      profile: null,
      id: { idType: null, idNumber: null },
      contacts: null,
      gates: [],
      dietary: { diets: [], savedAt: null },
      dietarySave: { ok: false, error: DIETARY_NOT_A_MEMBER },
      headcount: { members: 3, waiting: 0 },
      roster: ["Cap", "Cook", "Fin"],
      tree: ["Cap", "Cook", "Fin", lostCatName(1), lostCatName(2)],
    });
    expect(store).toEqual(db);
  });
});
