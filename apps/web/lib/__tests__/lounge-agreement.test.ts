// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOUNGE_TEAM } from "@camp404/core";
import {
  ALREADY_PLACED,
  NOT_A_LOUNGE_RUNNER,
  NOT_YOUR_OFFER,
  OFFER_CHANGED,
  OFFER_DECIDED,
  OFFER_GONE,
  OFFER_NOT_ACCEPTED,
  SETTINGS_CHANGED,
  SLOT_GONE,
} from "@camp404/db/lounge";
import {
  DecideLoungeOfferInput,
  LOUNGE_BANDS,
  LOUNGE_DECISIONS,
  LOUNGE_OFFER_KINDS,
  LoungeOfferInput,
  Team,
} from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// The lounge programme (#269), through lib/lounge.ts, on the database and on
// the E2E store: the same people, the same writes, the same answers and
// refusal sentences. Who runs the programme is one rule (LOUNGE_RUNNER: a
// captain or a Ministry of Vibes lead), and the offer checks live once in
// @camp404/core (loungeEditProblem, loungeDecisionProblem,
// loungePlaceProblem); this holds the rest equal. Any approved member offers
// something and changes only their own offer; the Finance and Kitchen leads
// are leads of ANOTHER team, refused where the programme is run. See
// _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  addLoungeOffer,
  decideLoungeOffer,
  getLoungeProgramme,
  getLoungeSettings,
  listLoungeOffers,
  listMyLoungeOffers,
  placeLoungeOffer,
  removeLoungeSlot,
  setLoungeMusicPolicy,
  updateLoungeOffer,
  withdrawLoungeOffer,
} from "../lounge";

const VIBES = Team.enum[LOUNGE_TEAM];
const [ACTIVITY, DJ_SET] = LOUNGE_OFFER_KINDS;
const [ACCEPTED, DECLINED, NEEDS_CHANGES] = LOUNGE_DECISIONS;
const [MORNING, , , LATE] = LOUNGE_BANDS;

const offer = (input: Partial<LoungeOfferInput> = {}): LoungeOfferInput =>
  LoungeOfferInput.parse({
    title: "Sunrise yoga",
    kind: ACTIVITY,
    durationMinutes: 60,
    preferredDays: [3, 1],
    preferredBands: [MORNING],
    ...input,
  });

const refused = (error: string) => ({ ok: false, error });
const ok = { ok: true };

describe("the lounge programme: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("lets a member offer something and change or withdraw only their own, until it is decided", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const yoga = await addLoungeOffer({ ...offer(), actorId: p.member });
      const set = await addLoungeOffer({
        ...offer({ title: "Deep house", kind: DJ_SET, preferredBands: [LATE] }),
        actorId: p.other,
      });
      if (!yoga.ok || !set.ok) throw new Error("no offer");
      const edit = (
        actorId: string,
        offerId: string,
        expectedVersion: number,
      ) =>
        updateLoungeOffer({
          ...offer({ title: "Sunrise yoga, longer", durationMinutes: 90 }),
          offerId,
          expectedVersion,
          actorId,
        });
      const notMine = await edit(p.other, yoga.id, 1);
      const captainEdit = await edit(p.captain, yoga.id, 1);
      const edited = await edit(p.member, yoga.id, 1);
      const stale = await edit(p.member, yoga.id, 1);
      const gone = await edit(p.member, randomUUID(), 1);
      await decideLoungeOffer({
        actorId: p.captain,
        offerId: set.id,
        decision: ACCEPTED,
        expectedStatus: "offered",
        expectedVersion: 1,
        reason: null,
      });
      const decided = await edit(p.other, set.id, 2);
      const withdrawOther = await withdrawLoungeOffer({
        actorId: p.member,
        offerId: set.id,
      });
      const mineBefore = await listMyLoungeOffers(p.member);
      const withdrawn = await withdrawLoungeOffer({
        actorId: p.member,
        offerId: yoga.id,
      });
      const withdrawnAgain = await withdrawLoungeOffer({
        actorId: p.member,
        offerId: yoga.id,
      });
      return {
        notMine,
        captainEdit,
        edited,
        stale,
        gone,
        decided,
        withdrawOther,
        mineBefore,
        withdrawn,
        withdrawnAgain,
        mine: await listMyLoungeOffers(p.member),
        all: await listLoungeOffers(),
      };
    });
    expect(db).toMatchObject({
      notMine: refused(NOT_YOUR_OFFER),
      captainEdit: refused(NOT_YOUR_OFFER),
      edited: ok,
      stale: refused(OFFER_CHANGED),
      gone: refused(OFFER_GONE),
      decided: refused(OFFER_DECIDED),
      withdrawOther: refused(NOT_YOUR_OFFER),
      mineBefore: [
        {
          hostId: "@member",
          hostName: "Nova",
          title: "Sunrise yoga, longer",
          durationMinutes: 90,
          preferredDays: [1, 3],
          status: "offered",
          version: 2,
        },
      ],
      withdrawn: ok,
      withdrawnAgain: refused(OFFER_GONE),
      mine: [],
      all: [{ title: "Deep house", status: "accepted", version: 2 }],
    });
    expect(store).toEqual(db);
  });

  it("lets a captain or a Ministry of Vibes lead decide offers on the status and version they saw, and send one back for changes", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const vibesLead = await seed.user("Vibe");
      await seed.lead(vibesLead, VIBES);
      const yoga = await addLoungeOffer({ ...offer(), actorId: p.member });
      if (!yoga.ok) throw new Error(yoga.error);
      const decide = (
        actorId: string,
        decision: (typeof LOUNGE_DECISIONS)[number],
        expectedStatus: "offered" | "accepted" | "declined" | "needs_changes",
        expectedVersion: number,
        reason: string | null = null,
      ) =>
        decideLoungeOffer({
          ...DecideLoungeOfferInput.parse({
            offerId: yoga.id,
            decision,
            expectedStatus,
            expectedVersion,
            reason,
          }),
          actorId,
        });
      const otherLead = await decide(p.financeLead, ACCEPTED, "offered", 1);
      const member = await decide(p.member, ACCEPTED, "offered", 1);
      const sentBack = await decide(
        vibesLead,
        NEEDS_CHANGES,
        "offered",
        1,
        "Which mats?",
      );
      const sentBackAgain = await decide(
        p.captain,
        DECLINED,
        "offered",
        1,
        "No",
      );
      const asSentBack = await listMyLoungeOffers(p.member);
      const fixed = await updateLoungeOffer({
        ...offer({ needsNote: "Ten mats" }),
        offerId: yoga.id,
        expectedVersion: 2,
        actorId: p.member,
      });
      const staleVersion = await decide(p.captain, ACCEPTED, "offered", 2);
      const accepted = await decide(p.captain, ACCEPTED, "offered", 3);
      const gone = await decideLoungeOffer({
        actorId: p.captain,
        offerId: randomUUID(),
        decision: ACCEPTED,
        expectedStatus: "offered",
        expectedVersion: 1,
        reason: null,
      });
      return {
        otherLead,
        member,
        sentBack,
        sentBackAgain,
        asSentBack,
        fixed,
        staleVersion,
        accepted,
        gone,
        all: await listLoungeOffers(),
      };
    });
    expect(db).toMatchObject({
      otherLead: refused(NOT_A_LOUNGE_RUNNER),
      member: refused(NOT_A_LOUNGE_RUNNER),
      sentBack: ok,
      sentBackAgain: refused(OFFER_CHANGED),
      asSentBack: [
        { status: "needs_changes", decisionNote: "Which mats?", version: 2 },
      ],
      fixed: ok,
      staleVersion: refused(OFFER_CHANGED),
      accepted: ok,
      gone: refused(OFFER_GONE),
      all: [
        {
          status: "accepted",
          decisionNote: null,
          needsNote: "Ten mats",
          version: 4,
        },
      ],
    });
    expect(store).toEqual(db);
  });

  it("places accepted offers on the programme once per time, takes them off on a decline, and keeps the music note compare-and-set", async () => {
    const { db, store } = await bothWays(mode, h, async (p, seed) => {
      const vibesLead = await seed.user("Vibe");
      await seed.lead(vibesLead, VIBES);
      const yoga = await addLoungeOffer({ ...offer(), actorId: p.member });
      const set = await addLoungeOffer({
        ...offer({ title: "Deep house", kind: DJ_SET }),
        actorId: p.other,
      });
      if (!yoga.ok || !set.ok) throw new Error("no offer");
      const place = (
        actorId: string,
        offerId: string,
        day: number,
        at: number,
      ) => placeLoungeOffer({ actorId, offerId, day, startMinute: at });
      const notAccepted = await place(p.captain, yoga.id, 1, 360);
      for (const offerId of [yoga.id, set.id]) {
        await decideLoungeOffer({
          actorId: p.captain,
          offerId,
          decision: ACCEPTED,
          expectedStatus: "offered",
          expectedVersion: 1,
          reason: null,
        });
      }
      const placed = await place(vibesLead, yoga.id, 1, 360);
      const twice = await place(p.captain, yoga.id, 1, 360);
      const again = await place(p.captain, yoga.id, 2, 360);
      const late = await place(p.captain, set.id, 1, 120);
      const otherLead = await place(p.kitchenLead, set.id, 2, 120);
      const gone = await place(p.captain, randomUUID(), 1, 360);
      const programme = await getLoungeProgramme();
      // A decline takes the set off the programme in the same write.
      await decideLoungeOffer({
        actorId: vibesLead,
        offerId: set.id,
        decision: DECLINED,
        expectedStatus: "accepted",
        expectedVersion: 2,
        reason: "Too loud for the lounge",
      });
      if (!again.ok) throw new Error(again.error);
      const removeMember = await removeLoungeSlot({
        actorId: p.member,
        slotId: again.id,
      });
      const removed = await removeLoungeSlot({
        actorId: vibesLead,
        slotId: again.id,
      });
      const removedAgain = await removeLoungeSlot({
        actorId: vibesLead,
        slotId: again.id,
      });
      const music = (actorId: string, expectedVersion: number, text: string) =>
        setLoungeMusicPolicy({ actorId, musicPolicy: text, expectedVersion });
      const noteMember = await music(p.member, 0, "Anything goes");
      const note = await music(vibesLead, 0, "No hard techno before 22:00");
      const noteFirstAgain = await music(p.captain, 0, "Mine");
      const noteChanged = await music(p.captain, 1, "Keep it mellow");
      const noteStale = await music(vibesLead, 1, "Too late");
      return {
        notAccepted,
        placed,
        twice,
        again,
        late,
        otherLead,
        gone,
        programme,
        removeMember,
        removed,
        removedAgain,
        noteMember,
        note,
        noteFirstAgain,
        noteChanged,
        noteStale,
        after: await getLoungeProgramme(),
        settings: await getLoungeSettings(),
      };
    });
    expect(db).toMatchObject({
      notAccepted: refused(OFFER_NOT_ACCEPTED),
      placed: { ok: true },
      twice: refused(ALREADY_PLACED),
      again: { ok: true },
      late: { ok: true },
      otherLead: refused(NOT_A_LOUNGE_RUNNER),
      gone: refused(OFFER_GONE),
      programme: {
        offers: [
          { title: "Deep house", hostName: "Zed" },
          { title: "Sunrise yoga", hostName: "Nova" },
        ],
        slots: [
          { day: 1, startMinute: 120 },
          { day: 1, startMinute: 360 },
          { day: 2, startMinute: 360 },
        ],
      },
      removeMember: refused(NOT_A_LOUNGE_RUNNER),
      removed: ok,
      removedAgain: refused(SLOT_GONE),
      noteMember: refused(NOT_A_LOUNGE_RUNNER),
      note: { ok: true, version: 1 },
      noteFirstAgain: refused(SETTINGS_CHANGED),
      noteChanged: { ok: true, version: 2 },
      noteStale: refused(SETTINGS_CHANGED),
      after: {
        offers: [{ title: "Sunrise yoga" }],
        slots: [{ day: 1, startMinute: 360 }],
      },
      settings: { musicPolicy: "Keep it mellow", version: 2 },
    });
    expect(store).toEqual(db);
  });
});
