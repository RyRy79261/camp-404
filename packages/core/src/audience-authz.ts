import type { ViewerRank } from "@camp404/types";
import { hasClearance } from "./access";

// Who may send to WHICH audience — the pure half of the send gate.
//
// The rank gate ("may this viewer send at all?") already exists: the
// questionnaire and announcement actions require `captain` clearance. This
// module answers the narrower question that only becomes live once
// `team_memberships` has a write path (WP6 item 2.1): a **team lead** can
// already author a questionnaire but cannot send one, and the moment leads are
// real people rather than an empty table, "a lead may send to their own team"
// becomes a decision someone has to make. It is made here, once, as a pure
// function over plain inputs — no DB, no session, no next/*.
//
// PRODUCT RULE (flagged for the camp owner — change it here, not at call
// sites): a team lead may send ONLY to a single team they themselves lead.
// Everything wider is refused: `everyone`, `team_leads` (peer-to-peer
// broadcast between leads), `drivers`, `individual` (an arbitrary member
// list is a way to reach the whole camp one id at a time), and `opt_in`.
// Fail-closed: an unknown rank, a `team` scope with no team, or a team the
// actor does not lead, all refuse.

/** Every audience scope the camp can address (broadcasts ∪ questionnaires). */
export type AudienceScope =
  | "everyone"
  | "team"
  | "team_leads"
  | "drivers"
  | "individual"
  | "opt_in";

/** The actor's clearance plus the teams they lead THIS cycle. */
export interface AudienceActor {
  rank: ViewerRank;
  /**
   * Team keys where this actor holds `team_memberships.is_lead` for the
   * current cycle. Empty for a captain who leads nothing — captains are
   * allowed by rank, never by membership.
   */
  leadTeams: readonly string[];
}

/** The audience being addressed: the scope, plus its team when scoped to one. */
export interface AudienceSpec {
  scope: AudienceScope;
  team?: string | null;
}

/**
 * Whether `actor` may send to `audience`.
 *
 * Captains may send to anything. A team lead may send only to a team they
 * lead. Everyone else may send to nothing. Callers still apply their own rank
 * gate first — this decides the audience, not the right to be on the screen.
 */
export function canSendToAudience(
  actor: AudienceActor,
  audience: AudienceSpec,
): boolean {
  if (actor.rank === "captain") return true;
  if (!hasClearance(actor.rank, "team_lead")) return false;
  if (audience.scope !== "team") return false;
  return !!audience.team && actor.leadTeams.includes(audience.team);
}
