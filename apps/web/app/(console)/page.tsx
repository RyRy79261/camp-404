import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { isCampBootstrapped } from "@/lib/bootstrap";
import { isAwaitingApproval, resolveMemberState } from "@/lib/member-gate";
import { signInRedirect } from "@/lib/sign-in-redirect";
import { LandingHero } from "../landing-hero";

// Reads the sign-in session cookie on every request, so can't be
// statically prerendered.
export const dynamic = "force-dynamic";

/**
 * Home. Signed out, the landing page. Signed in, the 404 OS desktop, which
 * the console layout draws: its icons are the programs, and the member's own
 * summary (owner, 2026-09-23: what they need to do, what's coming up) is the
 * Today gadget, which the layout draws on every screen now (the prototype's
 * pop-out, owner's approval 2026-09-26). So this page is the desktop's
 * heading and nothing more. The whole-camp view is /captains/overview.
 *
 * The member ladder still applies — a fresh member goes to the invite gate or
 * the Burner Bio first — with one change: someone waiting for approval lands
 * here and is told so (in Today), rather than on a separate page. A declined
 * applicant still goes to /pending-approval, which gives the captain's reason.
 */
export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return <LandingHero />;
  }

  // First-time setup: on a fresh system (no captain yet) the first signed-in
  // person becomes the founding captain, before any invite or onboarding gate.
  if (!(await isCampBootstrapped())) {
    redirect("/setup");
  }

  const state = await resolveMemberState();
  if (state.kind === "signed_out") return signInRedirect();
  const { campUser, block } = state;
  if (block && !isAwaitingApproval(campUser, block)) redirect(block.href);

  return <h1 className="sr-only">Desktop</h1>;
}
