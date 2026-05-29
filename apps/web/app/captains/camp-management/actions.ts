"use server";

import { revalidatePath } from "next/cache";
import { getCampMemberDetail } from "@camp404/db/roster";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  decideUserApproval,
  ensureCampUser,
  hasCampAccess,
} from "@/lib/users";
import {
  presentMemberDetail,
  type PresentedMember,
} from "@/lib/member-detail";

export type MemberDetailResult =
  | { ok: true; member: PresentedMember }
  | { ok: false; error: string };

export type ApprovalDecisionResult =
  | { ok: true }
  | { ok: false; error: string };

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
  return { ok: true, member: presentMemberDetail(detail) };
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
