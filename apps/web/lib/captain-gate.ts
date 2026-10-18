import "server-only";

import {
  deriveViewerRank,
  requireClearance,
  toActor,
  type Actor,
} from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { getAuthenticatedUser, type AuthenticatedUser } from "./auth";
import { requireMemberPage } from "./member-gate";
import {
  ensureCampUser,
  getLeadTeams,
  hasCampAccess,
  isApproved,
  type CampUser,
} from "./users";

// The one gate behind every captain-console page and action (/captains/*).
// Pages and actions used to hand-roll the same prelude, and drifted: some
// skipped approval, some hardcoded the team-lead flag to false.
//
// The viewer's rank resolves the team-lead flag (a DB read) only when the flag
// can change the answer: never for a captain, and never when the bar is
// `captain` (team_lead < captain). So `rank` is exact whenever the viewer is
// cleared, and whenever the bar is below captain. A locked captain-bar page
// must not read `rank`.
//
// The same read gives the teams the viewer leads this year, so the gate hands
// back the `actor` (rank and led teams) and a page or action asks its rule
// `RULE.allows(gate.actor)` with no second read. A captain's `ledTeams` is
// empty (never read): no rule asks a captain's teams. The screen's answer
// only; every write reads and locks its own actor (`lockActor`).

const REFUSAL: Record<ViewerRank, string> = {
  captain: "Captain access only.",
  team_lead: "Team-lead access only.",
  camp_member: "Camp members only.",
};

async function viewerActor(
  campUser: CampUser,
  required: ViewerRank,
): Promise<Actor> {
  const leadCanMatter = campUser.rank !== "captain" && required !== "captain";
  const led = leadCanMatter ? await getLeadTeams(campUser.id) : [];
  const rank = deriveViewerRank(campUser.rank, led.length > 0);
  return toActor(rank, led) ?? { rank, ledTeams: [] };
}

export interface CaptainPageAccess {
  authUser: AuthenticatedUser;
  campUser: CampUser;
  rank: ViewerRank;
  /** Who is looking: `rank` and the teams they lead this year. */
  actor: Actor;
  /** False: render the page chrome with a CaptainLock, and fetch no data. */
  cleared: boolean;
}

/**
 * For a captain-console server page: sign-in and the member ladder (invite,
 * blocking questionnaire, onboarding, approval) redirect exactly as on every
 * member page. Then clearance against `required` decides between the full page
 * and the preview-but-locked shell (D3).
 */
export async function captainPageGate(
  required: ViewerRank,
): Promise<CaptainPageAccess> {
  const { authUser, campUser } = await requireMemberPage();
  const actor = await viewerActor(campUser, required);
  return {
    authUser,
    campUser,
    rank: actor.rank,
    actor,
    cleared: requireClearance(actor.rank, required).cleared,
  };
}

export type CaptainActionAccess =
  | { ok: true; campUser: CampUser; rank: ViewerRank; actor: Actor }
  | { ok: false; error: string };

/**
 * For a captain-console server action, which is reachable without its page:
 * signed in, camp-active, approved, and cleared for `required`. Returns the
 * actor, or the sentence to show beside the control.
 *
 * Actions do not walk the blocking-questionnaire rung. The page does, and an
 * autosave firing every few seconds should not re-sync every open send.
 */
export async function captainActionGate(
  required: ViewerRank,
  refusal: string = REFUSAL[required],
): Promise<CaptainActionAccess> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) return { ok: false, error: "Not signed in." };
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account isn't camp-active yet." };
  }
  if (!isApproved(campUser, authUser.primaryEmail)) {
    return { ok: false, error: "Your account is still awaiting approval." };
  }
  const actor = await viewerActor(campUser, required);
  if (!requireClearance(actor.rank, required).cleared) {
    return { ok: false, error: refusal };
  }
  return { ok: true, campUser, rank: actor.rank, actor };
}
