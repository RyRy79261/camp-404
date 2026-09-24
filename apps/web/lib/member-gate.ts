import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser, type AuthenticatedUser } from "./auth";
import { nextGate } from "./required-actions";
import {
  ensureCampUser,
  getPendingRequiredActions,
  hasCampAccess,
  isApproved,
  syncOpenGates,
  type CampUser,
} from "./users";
import { runDueWorkAfterResponse } from "./background-work";

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

/** Where the signed-in viewer stands on the member ladder. */
export type MemberState =
  | { kind: "signed_out" }
  | {
      kind: "member";
      authUser: AuthenticatedUser;
      campUser: CampUser;
      block: MemberBlock | null;
    };

/**
 * Sign-in plus the member ladder, read once per request. The console layout
 * (to decide whether to draw the header) and the page (to redirect) both ask,
 * and `cache` makes the second ask free: one session read, one gate sync.
 */
export const resolveMemberState = cache(async (): Promise<MemberState> => {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return { kind: "signed_out" };
  const campUser = await ensureCampUser(authUser);
  const block = await memberBlock(campUser, authUser.primaryEmail);
  // No cron jobs: a member loading a page is what runs the due work (guarded,
  // after the response; lib/background-work.ts).
  runDueWorkAfterResponse();
  return { kind: "member", authUser, campUser, block };
});

/**
 * Sign-in plus the member ladder for a server page: redirects on the first
 * rung the viewer has not cleared, otherwise returns who they are.
 */
export async function requireMemberPage(): Promise<{
  authUser: AuthenticatedUser;
  campUser: CampUser;
}> {
  const state = await resolveMemberState();
  if (state.kind === "signed_out") redirect("/auth/sign-in");
  if (state.block) redirect(state.block.href);
  return { authUser: state.authUser, campUser: state.campUser };
}
