"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCampMemberDetail } from "@camp404/db/roster";
import { decryptOrNull } from "@camp404/db/crypto";
import { mergeIdNumber } from "@camp404/db/id-documents";
import {
  canDecidePromotion,
  canSendPromotion,
  deriveViewerRank,
  promotionStepState,
  requireClearance,
} from "@camp404/core";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  decideUserApproval,
  ensureCampUser,
  hasCampAccess,
  isApproved,
} from "@/lib/users";
import {
  decideCaptainPromotion,
  getOpenPromotionForTarget,
  getPromotionRequestById,
  sendCaptainPromotion,
} from "@/lib/promotion";
import {
  presentMemberDetail,
  type PresentedMember,
} from "@/lib/member-detail";
import {
  presentPublicMember,
  type PublicMemberProfile,
} from "@/lib/public-member";

export type MemberDetailResult =
  | {
      ok: true;
      member: PresentedMember;
      /** Whether the viewing captain may send this member a promotion request. */
      canAssignCaptain: boolean;
      /** In-flight two-step tracker for an open request (drives the dialog). */
      promotionStep: { sent: boolean; accepted: boolean };
      /** The open `sent` request's id, for the dialog's cancel action (or null). */
      promotionRequestId: string | null;
      /** Whether the open request was sent by THIS captain — only the requester
       * may cancel it, so this gates the dialog's cancel affordance. */
      promotionRequestIsMine: boolean;
    }
  | { ok: false; error: string };

export type PublicMemberProfileResult =
  | ({ ok: true } & PublicMemberProfile)
  | { ok: false; error: string };

export type ApprovalDecisionResult =
  | { ok: true }
  | { ok: false; error: string };

export type PromotionActionResult =
  | { ok: true }
  | { ok: false; error: string };

export type SendPromotionResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

// Opaque-id boundary schema: a non-empty string. Deliberately NOT .uuid() — the
// E2E test store uses ids like "test-user-1"; a bad id otherwise fails the
// downstream lookup anyway. (AGENTS.md: validate external input with Zod.)
const UserId = z.string().min(1);

// Guard reason code → captain-facing copy for the assign-captain flow.
const SEND_PROMOTION_COPY: Record<string, string> = {
  viewer_not_captain: "Captain access only.",
  cannot_promote_self: "You can't promote yourself.",
  target_already_captain: "They're already a captain.",
};

// Guard reason code → captain-facing copy for cancelling an in-flight request.
const CANCEL_PROMOTION_COPY: Record<string, string> = {
  request_not_open: "This request is no longer open.",
  only_requester_may_cancel: "Only the captain who sent it can cancel it.",
};

/**
 * Captain-gate every camp-management action at the data layer. Returns the
 * acting captain's camp user, or an error string for the caller to surface.
 */
async function requireCaptain(): Promise<
  { ok: true; captainId: string } | { ok: false; error: string }
> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return { ok: false, error: "Not signed in." };
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account isn't camp-active yet." };
  }
  // Same preview-but-locked comparator the captain pages gate on (D3).
  const { cleared } = requireClearance(
    deriveViewerRank(campUser.rank, false),
    "captain",
  );
  if (!cleared) {
    return { ok: false, error: "Captain access only." };
  }
  return { ok: true, captainId: campUser.id };
}

/**
 * Gate a member-facing camp-management read: authenticated, camp-active, and
 * approved — but NOT captain-gated. Backs the public member profile (decision:
 * any approved member may browse the roster + public cards). Returns the viewer's
 * id and whether they are a captain (so a captain hitting the public path is
 * still recognised).
 */
async function requireApprovedMember(): Promise<
  | { ok: true; userId: string; isCaptain: boolean }
  | { ok: false; error: string }
> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return { ok: false, error: "Not signed in." };
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account isn't camp-active yet." };
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account isn't approved yet." };
  }
  const { cleared } = requireClearance(
    deriveViewerRank(campUser.rank, false),
    "captain",
  );
  return { ok: true, userId: campUser.id, isCaptain: cleared };
}

/** Load the full burner detail behind a roster row, for the modal. */
export async function getMemberDetailAction(
  userId: string,
): Promise<MemberDetailResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;

  const detail = await getCampMemberDetail(userId);
  if (!detail) return { ok: false, error: "Member not found." };

  // Captain-gated above — decrypt this member's government ID number and merge
  // it back into the answers so the profile modal can show it. Captains and
  // the owner are the only readers of this field.
  const passport = decryptOrNull(detail.passportEncrypted);
  const saId = decryptOrNull(detail.saIdEncrypted);
  const id = passport
    ? { idType: "passport", idNumber: passport }
    : saId
      ? { idType: "sa_id", idNumber: saId }
      : { idType: null, idNumber: null };
  const responses = mergeIdNumber(detail.responses, id);

  // Assign-captain affordance for the modal: reuse the pure send-guard for
  // visibility (captain viewer, target not already a captain, not self) and the
  // pure step-state over the member's open request (if any).
  const canAssignCaptain = canSendPromotion({
    viewerRank: "captain",
    viewerId: gate.captainId,
    targetRank: deriveViewerRank(detail.rank, false),
    targetId: userId,
  }).ok;
  const openRequest = await getOpenPromotionForTarget(userId);
  const promotionStep = promotionStepState(openRequest);

  return {
    ok: true,
    member: presentMemberDetail({ ...detail, responses }),
    canAssignCaptain,
    promotionStep,
    promotionRequestId: openRequest?.id ?? null,
    promotionRequestIsMine: openRequest?.requestedByUserId === gate.captainId,
  };
}

/**
 * Load the PUBLIC member card behind a roster row for a non-captain viewer.
 * Gated to approved camp members (not captains). Returns an allowlisted
 * projection — bio + this-year ideas only — so approval status, contact details,
 * government ID and invite provenance never reach a member. The decrypt path and
 * `getMemberDetailAction` stay captain-only.
 */
export async function getPublicMemberProfileAction(
  userId: string,
): Promise<PublicMemberProfileResult> {
  const gate = await requireApprovedMember();
  if (!gate.ok) return gate;

  if (!UserId.safeParse(userId).success) {
    return { ok: false, error: "Invalid member." };
  }

  const detail = await getCampMemberDetail(userId);
  if (!detail) return { ok: false, error: "Member not found." };

  // Allowlist projection (no decrypt, no status, no email, no provenance).
  return { ok: true, ...presentPublicMember(detail) };
}

/**
 * Apply a captain's vetting decision to a pending applicant. Approving
 * unblocks the app on their next load; rejecting holds them at the blocking
 * screen with a terminal message.
 */
export async function decideApprovalAction(
  userId: string,
  decision: "approved" | "rejected",
): Promise<ApprovalDecisionResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;

  if (decision !== "approved" && decision !== "rejected") {
    return { ok: false, error: "Unknown decision." };
  }
  if (userId === gate.captainId) {
    return { ok: false, error: "You can't decide on your own account." };
  }

  await decideUserApproval({
    userId,
    status: decision,
    decidedByUserId: gate.captainId,
  });
  revalidatePath("/captains/camp-management");
  return { ok: true };
}

/**
 * Send a "make captain" request to a roster member (captain → target side of
 * the double-opt-in). Captain-gated; the pure `canSendPromotion` guard rejects
 * self / already-captain. The target's rank does NOT change here — it flips only
 * when the target accepts in their own app. Idempotent: a second send while a
 * request is open returns the existing one (no duplicate).
 */
export async function sendCaptainPromotionAction(
  targetUserId: string,
): Promise<SendPromotionResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;

  if (!UserId.safeParse(targetUserId).success) {
    return { ok: false, error: "Invalid member." };
  }

  const target = await getCampMemberDetail(targetUserId);
  if (!target) return { ok: false, error: "Member not found." };

  // The viewer is a captain by construction (requireCaptain). team-lead is
  // irrelevant to this guard (it only checks `=== "captain"`), so isLead=false.
  const guard = canSendPromotion({
    viewerRank: "captain",
    viewerId: gate.captainId,
    targetRank: deriveViewerRank(target.rank, false),
    targetId: targetUserId,
  });
  if (!guard.ok) {
    return {
      ok: false,
      error: SEND_PROMOTION_COPY[guard.reason] ?? "Couldn't send the request.",
    };
  }

  const created = await sendCaptainPromotion({
    targetUserId,
    requestedByUserId: gate.captainId,
  });
  revalidatePath("/captains/camp-management");
  return { ok: true, requestId: created.id };
}

/**
 * Cancel an in-flight "make captain" request the viewing captain sent. Captain-
 * gated; the pure `canDecidePromotion` guard enforces that only the requester can
 * cancel and only while the row is still `sent`. No rank ever changes.
 */
export async function cancelCaptainPromotionAction(
  requestId: string,
): Promise<PromotionActionResult> {
  const gate = await requireCaptain();
  if (!gate.ok) return gate;

  if (!UserId.safeParse(requestId).success) {
    return { ok: false, error: "Invalid request." };
  }

  const request = await getPromotionRequestById(requestId);
  if (
    !request ||
    request.targetUserId === null ||
    request.requestedByUserId === null
  ) {
    return { ok: false, error: "Request not found." };
  }

  const guard = canDecidePromotion({
    actorId: gate.captainId,
    request: {
      status: request.status,
      targetUserId: request.targetUserId,
      requestedByUserId: request.requestedByUserId,
    },
    action: "cancel",
  });
  if (!guard.ok) {
    return {
      ok: false,
      error: CANCEL_PROMOTION_COPY[guard.reason] ?? "Couldn't cancel the request.",
    };
  }

  await decideCaptainPromotion({ requestId, status: "cancelled" });
  revalidatePath("/captains/camp-management");
  return { ok: true };
}
