"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCampMemberDetail } from "@camp404/db/roster";
import { decryptOrNull } from "@camp404/db/crypto";
import { mergeIdNumber } from "@camp404/db/id-documents";
import {
  canSendPromotion,
  deriveViewerRank,
  promotionStepState,
} from "@camp404/core";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  decideUserApproval,
  ensureCampUser,
  hasCampAccess,
} from "@/lib/users";
import {
  getOpenPromotionForTarget,
  sendCaptainPromotion,
} from "@/lib/promotion";
import {
  presentMemberDetail,
  type PresentedMember,
} from "@/lib/member-detail";

export type MemberDetailResult =
  | {
      ok: true;
      member: PresentedMember;
      /** Whether the viewing captain may send this member a promotion request. */
      canAssignCaptain: boolean;
      /** In-flight two-step tracker for an open request (drives the dialog). */
      promotionStep: { sent: boolean; accepted: boolean };
    }
  | { ok: false; error: string };

export type ApprovalDecisionResult =
  | { ok: true }
  | { ok: false; error: string };

export type PromotionActionResult =
  | { ok: true }
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
  if (campUser.rank !== "captain") {
    return { ok: false, error: "Captain access only." };
  }
  return { ok: true, captainId: campUser.id };
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
  const promotionStep = promotionStepState(
    await getOpenPromotionForTarget(userId),
  );

  return {
    ok: true,
    member: presentMemberDetail({ ...detail, responses }),
    canAssignCaptain,
    promotionStep,
  };
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
): Promise<PromotionActionResult> {
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

  await sendCaptainPromotion({
    targetUserId,
    requestedByUserId: gate.captainId,
  });
  revalidatePath("/captains/camp-management");
  return { ok: true };
}
