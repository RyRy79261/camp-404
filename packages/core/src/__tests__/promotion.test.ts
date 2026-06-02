import { describe, expect, it } from "vitest";
import type { PromotionRequestStatus } from "@camp404/types";

import {
  canDecidePromotion,
  canSendPromotion,
  nextPromotionStatus,
  promotionStepState,
  type PromotionAction,
  type PromotionParticipants,
} from "../promotion";

const STATUSES: PromotionRequestStatus[] = [
  "sent",
  "accepted",
  "declined",
  "cancelled",
];
const ACTIONS: PromotionAction[] = ["accept", "decline", "cancel"];

describe("nextPromotionStatus — pure state machine", () => {
  it("moves a sent row to the terminal status for each action", () => {
    expect(nextPromotionStatus("sent", "accept")).toBe("accepted");
    expect(nextPromotionStatus("sent", "decline")).toBe("declined");
    expect(nextPromotionStatus("sent", "cancel")).toBe("cancelled");
  });

  it("is null for any action on an already-terminal row", () => {
    for (const status of ["accepted", "declined", "cancelled"] as const) {
      for (const action of ACTIONS) {
        expect(nextPromotionStatus(status, action)).toBeNull();
      }
    }
  });

  it("is a total function over every (status, action) pair", () => {
    for (const status of STATUSES) {
      for (const action of ACTIONS) {
        const result = nextPromotionStatus(status, action);
        // Either a valid terminal status (only from `sent`) or null — never throws.
        if (status === "sent") {
          expect(result).not.toBeNull();
        } else {
          expect(result).toBeNull();
        }
      }
    }
  });
});

describe("canSendPromotion", () => {
  const base = {
    viewerRank: "captain" as const,
    viewerId: "cap-1",
    targetRank: "camp_member" as const,
    targetId: "member-1",
  };

  it("allows a captain to promote a non-captain who isn't themselves", () => {
    expect(canSendPromotion(base)).toEqual({ ok: true });
  });

  it("allows promoting a team_lead (not yet captain)", () => {
    expect(canSendPromotion({ ...base, targetRank: "team_lead" })).toEqual({
      ok: true,
    });
  });

  it("refuses a non-captain viewer (authorization first)", () => {
    expect(canSendPromotion({ ...base, viewerRank: "team_lead" })).toEqual({
      ok: false,
      reason: "viewer_not_captain",
    });
    expect(canSendPromotion({ ...base, viewerRank: "camp_member" })).toEqual({
      ok: false,
      reason: "viewer_not_captain",
    });
  });

  it("refuses promoting yourself", () => {
    expect(
      canSendPromotion({ ...base, targetId: "cap-1" }),
    ).toEqual({ ok: false, reason: "cannot_promote_self" });
  });

  it("refuses a target who is already a captain", () => {
    expect(
      canSendPromotion({ ...base, targetRank: "captain" }),
    ).toEqual({ ok: false, reason: "target_already_captain" });
  });

  it("reports viewer_not_captain before self/already-captain when several apply", () => {
    // Non-captain viewer trying to 'promote' themselves: authz wins.
    expect(
      canSendPromotion({
        viewerRank: "camp_member",
        viewerId: "u-1",
        targetRank: "captain",
        targetId: "u-1",
      }),
    ).toEqual({ ok: false, reason: "viewer_not_captain" });
  });
});

describe("canDecidePromotion", () => {
  const sentRequest: PromotionParticipants = {
    status: "sent",
    targetUserId: "target-1",
    requestedByUserId: "captain-1",
  };

  it("lets the target accept or decline an open request", () => {
    expect(
      canDecidePromotion({
        actorId: "target-1",
        request: sentRequest,
        action: "accept",
      }),
    ).toEqual({ ok: true });
    expect(
      canDecidePromotion({
        actorId: "target-1",
        request: sentRequest,
        action: "decline",
      }),
    ).toEqual({ ok: true });
  });

  it("lets the requester cancel an open request", () => {
    expect(
      canDecidePromotion({
        actorId: "captain-1",
        request: sentRequest,
        action: "cancel",
      }),
    ).toEqual({ ok: true });
  });

  it("forbids the requester from accepting their own outgoing request", () => {
    expect(
      canDecidePromotion({
        actorId: "captain-1",
        request: sentRequest,
        action: "accept",
      }),
    ).toEqual({ ok: false, reason: "only_target_may_respond" });
  });

  it("forbids the requester from declining (decline is the target's)", () => {
    expect(
      canDecidePromotion({
        actorId: "captain-1",
        request: sentRequest,
        action: "decline",
      }),
    ).toEqual({ ok: false, reason: "only_target_may_respond" });
  });

  it("forbids the target from cancelling (cancel is the requester's)", () => {
    expect(
      canDecidePromotion({
        actorId: "target-1",
        request: sentRequest,
        action: "cancel",
      }),
    ).toEqual({ ok: false, reason: "only_requester_may_cancel" });
  });

  it("forbids an unrelated third party — with the action-appropriate reason", () => {
    expect(
      canDecidePromotion({
        actorId: "stranger",
        request: sentRequest,
        action: "accept",
      }),
    ).toEqual({ ok: false, reason: "only_target_may_respond" });
    expect(
      canDecidePromotion({
        actorId: "stranger",
        request: sentRequest,
        action: "decline",
      }),
    ).toEqual({ ok: false, reason: "only_target_may_respond" });
    expect(
      canDecidePromotion({
        actorId: "stranger",
        request: sentRequest,
        action: "cancel",
      }),
    ).toEqual({ ok: false, reason: "only_requester_may_cancel" });
  });

  it("refuses any action on an already-terminal request (transition checked first)", () => {
    for (const status of ["accepted", "declined", "cancelled"] as const) {
      // Even the rightful actor can't act once the row is terminal.
      expect(
        canDecidePromotion({
          actorId: "target-1",
          request: { ...sentRequest, status },
          action: "accept",
        }),
      ).toEqual({ ok: false, reason: "request_not_open" });
      expect(
        canDecidePromotion({
          actorId: "captain-1",
          request: { ...sentRequest, status },
          action: "cancel",
        }),
      ).toEqual({ ok: false, reason: "request_not_open" });
    }
  });

  it("checks transition-legality BEFORE actor (wrong actor on terminal → request_not_open)", () => {
    // A stranger acting on a terminal row gets request_not_open, never an
    // actor-permission reason — proving the precedence order.
    expect(
      canDecidePromotion({
        actorId: "stranger",
        request: { ...sentRequest, status: "accepted" },
        action: "accept",
      }),
    ).toEqual({ ok: false, reason: "request_not_open" });
  });
});

describe("promotionStepState", () => {
  it("is both-false when there is no request", () => {
    expect(promotionStepState(null)).toEqual({ sent: false, accepted: false });
  });

  it("marks sent (not accepted) for an open request", () => {
    expect(promotionStepState({ status: "sent" })).toEqual({
      sent: true,
      accepted: false,
    });
  });

  it("marks sent + accepted once accepted", () => {
    expect(promotionStepState({ status: "accepted" })).toEqual({
      sent: true,
      accepted: true,
    });
  });

  it("marks sent (not accepted) for declined / cancelled rows", () => {
    expect(promotionStepState({ status: "declined" })).toEqual({
      sent: true,
      accepted: false,
    });
    expect(promotionStepState({ status: "cancelled" })).toEqual({
      sent: true,
      accepted: false,
    });
  });
});
