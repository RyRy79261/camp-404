import "server-only";

import { canEditBuilderDefinition } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import type { CampUser } from "./users";

export type AuthoringCheck = { ok: true } | { ok: false; error: string };

/**
 * Whether this author may change this questionnaire: a captain may change any,
 * a team lead only their own. Editing a PUBLISHED head is allowed (the §4.2
 * re-version flow): autosave changes the working head while the live snapshot
 * keeps serving open sends until a captain re-publishes. Shared by the builder
 * actions, the builder image upload route and the MCP drafting tools.
 */
export async function canEditQuestionnaire(
  author: { campUser: Pick<CampUser, "id">; rank: ViewerRank },
  key: string,
): Promise<AuthoringCheck> {
  const meta = await getDefinitionMetaRow(key);
  if (!meta) return { ok: false, error: "Questionnaire not found." };
  if (
    !canEditBuilderDefinition(
      { rank: author.rank, userId: author.campUser.id },
      meta,
    )
  ) {
    return { ok: false, error: "You can only edit your own questionnaires." };
  }
  return { ok: true };
}
