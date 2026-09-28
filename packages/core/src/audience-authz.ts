import type { ViewerRank } from "@camp404/types";
import { hasClearance } from "./access";

// Who may send to WHICH audience — the pure half of the send gate.
//
// The rank gate ("may this viewer send at all?") comes first and separately:
// the announcement actions still require `captain` clearance, and the
// questionnaire send action requires `team_lead`. This module answers the
// narrower question that went live once `team_memberships` got a write path
// (WP6 item 2.1) and leads became real people rather than an empty table: a
// team lead can author a questionnaire, and may now send one — but only to
// their own team. That decision is made here, once, as a pure function over
// plain inputs — no DB, no session, no next/*.
//
// LIVE CALLER: `sendAction` / `previewAudienceCount` in
// apps/web/app/captains/questionnaires/actions.ts, which gate on
// `gateAuthor()` (>= team_lead) and THEN on this function for the specific
// audience. The two moves are the safety property: the rank gate alone would
// have put every member one questionnaire away from the whole camp.
//
// PRODUCT RULE (flagged for the camp owner — change it here, not at call
// sites): a team lead may send ONLY to a single team they themselves lead.
// Everything wider is refused: `everyone`, `team_leads` (peer-to-peer
// broadcast between leads), `drivers`, `individual` (an arbitrary member
// list is a way to reach the whole camp one id at a time), and `opt_in`.
// Fail-closed: an unknown rank, a `team` scope with no team, or a team the
// actor does not lead, all refuse.
//
// THE CAR (#270, owner 2026-09-24: "A driver can send messages to the people
// in their car"). `car` is the one scope that does not follow the rank ladder:
// it reaches the riders of ONE car, and only that car's driver may address it.
// Rank buys nothing here, a captain included: a captain who is not driving
// this year has no car, and may not write to someone else's. The actor must
// be driving this year (`drivesCar`, from `driver_profiles.intends_to_drive`,
// read by the caller inside its own transaction) AND the car named must be
// their own. A rider, a driver naming another driver's car, or an actor whose
// id or driving flag is missing, all refuse. The send path
// (`sendCarMessage` in @camp404/db/cars) never takes a car from its caller:
// it names the sender's own car here and reads the riders itself.

/** Every audience scope the camp can address (broadcasts ∪ questionnaires). */
export type AudienceScope =
  | "everyone"
  | "team"
  | "team_leads"
  | "drivers"
  | "individual"
  | "opt_in"
  | "car";

/** The actor's clearance plus the teams they lead THIS cycle. */
export interface AudienceActor {
  rank: ViewerRank;
  /**
   * Team keys where this actor holds `team_memberships.is_lead` for the
   * current cycle. Empty for a captain who leads nothing — captains are
   * allowed by rank, never by membership.
   */
  leadTeams: readonly string[];
  /** The actor's own member id. Only the `car` scope reads it. */
  userId?: string | null;
  /**
   * Whether the actor is driving this year (`driver_profiles.intends_to_drive`
   * for the current year). Only the `car` scope reads it; absent is false.
   */
  drivesCar?: boolean;
}

/** The audience being addressed: the scope, plus its team when scoped to one. */
export interface AudienceSpec {
  scope: AudienceScope;
  team?: string | null;
  /** For the `car` scope: the driver whose car it is. */
  driverUserId?: string | null;
}

/**
 * Whether `actor` may send to `audience`.
 *
 * A car may be addressed only by its own driver, while they drive this year,
 * whatever their rank. Otherwise: captains may send to anything, a team lead
 * only to a team they lead, and everyone else to nothing. Callers still apply
 * their own rank gate first — this decides the audience, not the right to be
 * on the screen.
 */
export function canSendToAudience(
  actor: AudienceActor,
  audience: AudienceSpec,
): boolean {
  if (audience.scope === "car") {
    return (
      hasClearance(actor.rank, "camp_member") &&
      actor.drivesCar === true &&
      !!actor.userId &&
      audience.driverUserId === actor.userId
    );
  }
  if (actor.rank === "captain") return true;
  if (!hasClearance(actor.rank, "team_lead")) return false;
  if (audience.scope !== "team") return false;
  return !!audience.team && actor.leadTeams.includes(audience.team);
}
