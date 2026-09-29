import "server-only";

import {
  deriveViewerRank,
  hasClearance,
  hasLeadsOnlyContent,
} from "@camp404/core";
import type { Questionnaire } from "@camp404/types";
import { isTeamLead, type CampUser } from "./users";

/**
 * Whether this member may see a questionnaire's "team leads and up" pages and
 * questions (#251): a captain, or a lead of any team this year (clearance is
 * global, AGENTS.md). Reads the lead flag only when the definition has such
 * content and the member is not a captain, so an ordinary form costs no query.
 */
export async function viewerSeesLeadsOnly(
  campUser: Pick<CampUser, "id" | "rank">,
  definition: Questionnaire,
): Promise<boolean> {
  if (campUser.rank === "captain") return true;
  if (!hasLeadsOnlyContent(definition)) return false;
  const rank = deriveViewerRank(campUser.rank, await isTeamLead(campUser.id));
  return hasClearance(rank, "team_lead");
}
