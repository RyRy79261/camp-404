import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser, type AuthenticatedUser } from "./auth";
import { getCampSettings } from "./camp-config";
import { nextGate } from "./required-actions";
import {
  ensureCampUser,
  getPendingRequiredActions,
  hasCampAccess,
  isApproved,
  getMyMemberships,
  peekCampUser,
  syncOpenGates,
  type CampUser,
} from "./users";
import { runDueWorkAfterResponse } from "./background-work";
import { signInRedirect } from "./sign-in-redirect";

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
 * `syncOpenGates` runs with the read (and the read is repeated when it wrote)
 * so a member who joined an open send's audience after it opened is gated
 * here too, not only on home.
 */
export async function memberBlock(
  campUser: CampUser,
  email: string | null,
): Promise<MemberBlock | null> {
  if (!hasCampAccess(campUser, email)) {
    return { reason: "invite", href: "/signup/required" };
  }
  // The sync and the read go out together: the sync writes only when it
  // finds a gate missing (rarely), and then the read is made again, so the
  // answer is the same as syncing first, one database wait sooner.
  const [written, pending] = await Promise.all([
    syncOpenGates(campUser.id),
    getPendingRequiredActions(campUser.id),
  ]);
  const gate = nextGate(
    written > 0 ? await getPendingRequiredActions(campUser.id) : pending,
  );
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
 * An applicant waiting for a captain: their only block is approval, and they
 * are still pending (a rejected applicant is blocked the same way, but is not
 * waiting for anything). Home lets them in and shows them they are waiting;
 * the program manifest gives them the restricted desktop. One predicate, so
 * the two cannot drift.
 */
export function isAwaitingApproval(
  campUser: Pick<CampUser, "approvalStatus">,
  block: MemberBlock | null,
): boolean {
  return block?.reason === "approval" && campUser.approvalStatus === "pending";
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
  const campUser = await ensureCampUser(authUser, peekCampUser(authUser.id));
  const block = await memberBlock(campUser, authUser.primaryEmail);
  // No cron jobs: a member loading a page is what runs the due work (guarded,
  // after the response; lib/background-work.ts).
  runDueWorkAfterResponse();
  return { kind: "member", authUser, campUser, block };
});

/**
 * Start this request's plain reads before anything waits on them: the
 * member's camp row, then their teams this year, and the camp settings. Pure
 * reads, request-cached, so the ladder and the desktop later pick them up
 * finished instead of waiting on the database one after another; nothing is
 * written and nothing is decided here. The console layout and Home call it
 * first, ahead of the setup check that decides whether the ladder runs at
 * all. A failed read is left for the reader that needs it to throw.
 */
export function prefetchMemberState(): void {
  const quiet = () => undefined;
  getCampSettings().catch(quiet);
  getAuthenticatedUser()
    .then((authUser) => (authUser ? peekCampUser(authUser.id) : null))
    .then((campUser) =>
      campUser?.id ? getMyMemberships(campUser.id) : undefined,
    )
    .catch(quiet);
}

/**
 * Sign-in plus the member ladder for a server page: redirects on the first
 * rung the viewer has not cleared, otherwise returns who they are.
 */
export async function requireMemberPage(): Promise<{
  authUser: AuthenticatedUser;
  campUser: CampUser;
}> {
  const state = await resolveMemberState();
  if (state.kind === "signed_out") return signInRedirect();
  if (state.block) redirect(state.block.href);
  return { authUser: state.authUser, campUser: state.campUser };
}
