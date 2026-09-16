import "server-only";

import { redirect } from "next/navigation";
import { getAuthenticatedUserOrRedirect, type AuthenticatedUser } from "./auth";
import { nextGate } from "./required-actions";
import {
  ensureCampUser,
  getPendingRequiredActions,
  hasCampAccess,
  isApproved,
  syncOpenGates,
  type CampUser,
} from "./users";

/** Why a member cannot use a member page yet, and where to send them. */
export type MemberBlock =
  | { reason: "invite"; href: "/signup/required" }
  | { reason: "questionnaire"; href: string }
  | { reason: "onboarding"; href: "/onboarding/questionnaire" }
  | { reason: "approval"; href: "/pending-approval" };

/**
 * The one ladder every member page walks, in the order home walks it: an
 * invite, then any blocking questionnaire (owner's call, 2026-09-16: this
 * server check owns the blocking questionnaire across the app, so there is no
 * client overlay), then a finished burner profile, then captain approval.
 * Returns null when nothing stands in the way.
 *
 * `syncOpenGates` runs first so a member who joined an open send's audience
 * after it opened is gated here too, not only on home.
 */
export async function memberBlock(
  campUser: CampUser,
  email: string | null,
): Promise<MemberBlock | null> {
  if (!hasCampAccess(campUser, email)) {
    return { reason: "invite", href: "/signup/required" };
  }
  await syncOpenGates(campUser.id);
  const gate = nextGate(await getPendingRequiredActions(campUser.id));
  if (gate) {
    // The burner profile is the onboarding rung; any other gate is a
    // questionnaire someone sent.
    return gate === "/onboarding/questionnaire"
      ? { reason: "onboarding", href: gate }
      : { reason: "questionnaire", href: gate };
  }
  if (!isApproved(campUser, email)) {
    return { reason: "approval", href: "/pending-approval" };
  }
  return null;
}

/**
 * Sign-in plus the member ladder for a server page: redirects on the first
 * rung the viewer has not cleared, otherwise returns who they are.
 */
export async function requireMemberPage(): Promise<{
  authUser: AuthenticatedUser;
  campUser: CampUser;
}> {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  const block = await memberBlock(campUser, authUser.primaryEmail);
  if (block) redirect(block.href);
  return { authUser, campUser };
}
