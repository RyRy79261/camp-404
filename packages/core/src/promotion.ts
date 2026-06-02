import type { PromotionRequestStatus, ViewerRank } from "@camp404/types";

// Pure captain-promotion guards + state machine (service-layer plan 05). The
// two-sided handshake's business invariants live here — "only a captain can
// send", "a captain can't promote themselves", "only the target accepts /
// declines", "only the requester cancels", "transitions are legal only from a
// `sent` row" — as decisions over plain inputs. No DB, no next/*, no session:
// the app actions wrap these (requireCaptain → canSendPromotion → db write;
// auth user → canDecidePromotion → db write → setUserRank on accept).

/** The three things an actor can do to an open request. */
export type PromotionAction = "accept" | "decline" | "cancel";

/** Why a guard refused — a machine-readable code; the app maps it to copy. */
export type PromotionDenyReason =
  | "viewer_not_captain"
  | "cannot_promote_self"
  | "target_already_captain"
  | "request_not_open"
  | "only_target_may_respond"
  | "only_requester_may_cancel";

/** A guard outcome: allowed, or refused with a reason. */
export type GuardResult = { ok: true } | { ok: false; reason: PromotionDenyReason };

/** The participants + state of a request, all `canDecidePromotion` needs. */
export interface PromotionParticipants {
  status: PromotionRequestStatus;
  targetUserId: string;
  requestedByUserId: string;
}

const ALLOW: GuardResult = { ok: true };
function deny(reason: PromotionDenyReason): GuardResult {
  return { ok: false, reason };
}

/**
 * The pure state machine — the single source of transition truth. Only a `sent`
 * row can move; it moves to the terminal status for the action. Everything else
 * (an action on an already-terminal row) is invalid → null. Total over every
 * (status, action) pair.
 */
export function nextPromotionStatus(
  current: PromotionRequestStatus,
  action: PromotionAction,
): PromotionRequestStatus | null {
  if (current !== "sent") return null;
  switch (action) {
    case "accept":
      return "accepted";
    case "decline":
      return "declined";
    case "cancel":
      return "cancelled";
    default: {
      // Exhaustiveness guard: adding a PromotionAction without a case here is a
      // compile error, so the `| null` contract can never silently leak undefined.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/**
 * May `viewer` send a captain-promotion request to `target`? Only a captain may
 * send (authorization first), never to themselves, never to someone already a
 * captain. Drives both the assign-captain dialog's visibility and the server-side
 * re-check in `sendCaptainPromotionAction`.
 */
export function canSendPromotion(params: {
  viewerRank: ViewerRank;
  viewerId: string;
  targetRank: ViewerRank;
  targetId: string;
}): GuardResult {
  const { viewerRank, viewerId, targetRank, targetId } = params;
  if (viewerRank !== "captain") return deny("viewer_not_captain");
  if (targetId === viewerId) return deny("cannot_promote_self");
  if (targetRank === "captain") return deny("target_already_captain");
  return ALLOW;
}

/**
 * May `actor` apply `action` to `request`? The transition must be legal (the row
 * is still `sent`), and the actor must own the side they're acting from: the
 * TARGET accepts or declines; the REQUESTER cancels.
 */
export function canDecidePromotion(params: {
  actorId: string;
  request: PromotionParticipants;
  action: PromotionAction;
}): GuardResult {
  const { actorId, request, action } = params;
  if (nextPromotionStatus(request.status, action) === null) {
    return deny("request_not_open");
  }
  if (action === "cancel") {
    if (actorId !== request.requestedByUserId) {
      return deny("only_requester_may_cancel");
    }
  } else if (actorId !== request.targetUserId) {
    // accept | decline are the target's to make
    return deny("only_target_may_respond");
  }
  return ALLOW;
}

/**
 * Two-step tracker state for the assign-captain dialog (spec §6): `sent` once a
 * request row exists, `accepted` once the target has accepted. No request → both
 * false.
 */
export function promotionStepState(
  request: { status: PromotionRequestStatus } | null,
): { sent: boolean; accepted: boolean } {
  if (!request) return { sent: false, accepted: false };
  return { sent: true, accepted: request.status === "accepted" };
}
