import "server-only";

import { deriveViewerRank, requireClearance } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { getAuthenticatedUser, type AuthenticatedUser } from "./auth";
import { requireMemberPage } from "./member-gate";
import {
  ensureCampUser,
  hasCampAccess,
  isApproved,
  isTeamLead,
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

const REFUSAL: Record<ViewerRank, string> = {
  captain: "Captain access only.",
  team_lead: "Team-lead access only.",
  camp_member: "Camp members only.",
};

async function viewerRank(
  campUser: CampUser,
  required: ViewerRank,
): Promise<ViewerRank> {
  const leadCanMatter = campUser.rank !== "captain" && required !== "captain";
  return deriveViewerRank(
    campUser.rank,
    leadCanMatter ? await isTeamLead(campUser.id) : false,
  );
}

export interface CaptainPageAccess {
  authUser: AuthenticatedUser;
  campUser: CampUser;
  rank: ViewerRank;
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
  const rank = await viewerRank(campUser, required);
  return {
    authUser,
    campUser,
    rank,
    cleared: requireClearance(rank, required).cleared,
  };
}

export type CaptainActionAccess =
  | { ok: true; campUser: CampUser; rank: ViewerRank }
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
  const rank = await viewerRank(campUser, required);
  if (!requireClearance(rank, required).cleared) {
    return { ok: false, error: refusal };
  }
  return { ok: true, campUser, rank };
}
