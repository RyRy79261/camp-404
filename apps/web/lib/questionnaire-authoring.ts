import "server-only";

import type { ViewerRank } from "@camp404/types";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import type { CampUser } from "./users";

export type AuthoringCheck = { ok: true } | { ok: false; error: string };

/**
 * Whether this author may change this questionnaire: a captain may change any,
 * a team lead only their own. Editing a PUBLISHED head is allowed (the §4.2
 * re-version flow): autosave changes the working head while the live snapshot
 * keeps serving open sends until a captain re-publishes. Shared by the builder
 * actions and the builder image upload route.
 */
export async function canEditQuestionnaire(
  author: { campUser: CampUser; rank: ViewerRank },
  key: string,
): Promise<AuthoringCheck> {
  const meta = await getDefinitionMetaRow(key);
  if (!meta) return { ok: false, error: "Questionnaire not found." };
  if (author.rank === "captain") return { ok: true };
  if (meta.createdBy !== author.campUser.id) {
    return { ok: false, error: "You can only edit your own questionnaires." };
  }
  return { ok: true };
}
