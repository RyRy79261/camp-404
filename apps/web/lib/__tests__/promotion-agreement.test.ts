// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays } from "./_agreement";

// The captain-promotion handshake, through lib/promotion.ts, on the database
// and on the E2E store: one open request per member, only its target accepts
// or declines and only its sender cancels, a decided request stays decided,
// and accepting makes the target a captain. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  acceptCaptainPromotion,
  decideCaptainPromotion,
  getIncomingPromotionsForUser,
  getOpenPromotionForTarget,
  getPromotionRequestById,
  sendCaptainPromotion,
} from "../promotion";
import { findCampUserById } from "../users";

const status = (row: { status: string } | null) => row?.status ?? null;

describe("captain promotion: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("sends one open request, binds each answer to its side, and makes an accepting target a captain", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const sent = await sendCaptainPromotion({
        targetUserId: p.member,
        requestedByUserId: p.captain,
      });
      const twice = await sendCaptainPromotion({
        targetUserId: p.member,
        requestedByUserId: p.captain,
      });
      const incoming = await getIncomingPromotionsForUser(p.member);
      const wrongCancel = await decideCaptainPromotion({
        requestId: sent.id,
        status: "cancelled",
        actorUserId: p.member,
      });
      const wrongAccept = await acceptCaptainPromotion({
        requestId: sent.id,
        actorUserId: p.kitchenLead,
      });
      const accepted = await acceptCaptainPromotion({
        requestId: sent.id,
        actorUserId: p.member,
      });
      const declinedAfter = await decideCaptainPromotion({
        requestId: sent.id,
        status: "declined",
        actorUserId: p.member,
      });
      const toOther = await sendCaptainPromotion({
        targetUserId: p.other,
        requestedByUserId: p.captain,
      });
      const cancelled = await decideCaptainPromotion({
        requestId: toOther.id,
        status: "cancelled",
        actorUserId: p.captain,
      });
      return {
        sameRequest: twice.id === sent.id,
        sent: { status: sent.status, decidedAt: sent.decidedAt },
        incoming: incoming.map((r) => ({
          requestedByUserId: r.requestedByUserId,
          requestedByName: r.requestedByName,
          status: r.status,
        })),
        wrongCancel,
        wrongAccept,
        accepted: status(accepted),
        declinedAfter,
        cancelled: status(cancelled),
        memberRank: (await findCampUserById(p.member))?.rank,
        otherRank: (await findCampUserById(p.other))?.rank,
        openForMember: await getOpenPromotionForTarget(p.member),
        openForOther: await getOpenPromotionForTarget(p.other),
        found: status(await getPromotionRequestById(sent.id)),
        incomingAfter: await getIncomingPromotionsForUser(p.member),
      };
    });
    expect(db).toMatchObject({
      sameRequest: true,
      sent: { status: "sent", decidedAt: null },
      incoming: [
        {
          requestedByUserId: "@captain",
          requestedByName: "Cap",
          status: "sent",
        },
      ],
      wrongCancel: null,
      wrongAccept: null,
      accepted: "accepted",
      declinedAfter: null,
      cancelled: "cancelled",
      memberRank: "captain",
      otherRank: "member",
      openForMember: null,
      openForOther: null,
      found: "accepted",
      incomingAfter: [],
    });
    expect(store).toEqual(db);
  });
});
