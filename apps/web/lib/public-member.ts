import type { CampMemberDetail } from "@camp404/db/roster";

// Pure presenter for the MEMBER-facing public profile. Non-captains may browse
// the roster and open a public card, but must never see approval status, contact
// details, government ID, or admin actions. This returns an explicit ALLOWLIST
// of self-expression fields (bio + this-year ideas) and nothing else, so no
// private answer can leak through a member's profile even though the caller reads
// the full `CampMemberDetail` server-side. Pure → unit-tested under jsdom; the
// identity fields (name, @handle, country, role, teams) come from the already-
// public roster row, not from here.

const BIO_QUESTION_ID = "bio.statement";
const CONTRIBUTION_QUESTION_ID = "ideas.this_year";

export interface PublicMemberProfile {
  /** Free-text bio (`bio.statement`); null when unanswered. */
  bio: string | null;
  /** "What do you want to make happen?" (`ideas.this_year`); null when unanswered. */
  contribution: string | null;
}

function pickText(
  responses: Record<string, unknown>,
  id: string,
): string | null {
  const raw = responses[id];
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

/**
 * Project a member's full detail down to the public, member-visible fields only.
 * Deliberately an allowlist (not a denylist): adding a new questionnaire question
 * never widens what a member can see unless it is named here.
 */
export function presentPublicMember(
  detail: Pick<CampMemberDetail, "responses">,
): PublicMemberProfile {
  return {
    bio: pickText(detail.responses, BIO_QUESTION_ID),
    contribution: pickText(detail.responses, CONTRIBUTION_QUESTION_ID),
  };
}
