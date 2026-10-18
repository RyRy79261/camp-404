import { Team, ViewerRank } from "@camp404/types";

// Who is acting, and the rules that decide what they may do. Pure: no DB, no
// session, no next/*. See GLOSSARY.md (Actor, Rule).
//
// AN ACTOR is the person doing something: the rung they stand on and the teams
// they lead this year. Clearance stays global (AGENTS.md): a lead of ANY team
// stands on the `team_lead` rung everywhere. Team identity decides only which
// team's tools a lead may work in, and that is what a rule asks.
//
// A write never takes an Actor from its caller: it reads and locks one inside
// its own transaction (`lockActor` in `@camp404/db/actor`), so a demotion that
// committed first is seen and one that comes later waits.
//
// A captain's `ledTeams` may be empty even when they lead a team: no rule here
// asks a captain's teams, so the readers do not read them.
//
// A RULE answers one question, `allows(actor)`. Each domain names its rule
// once, next to the domain (MONEY_KEEPER in ./dues, POWER_EDITOR in ./power,
// ...), built from the constructors below. Change a rule there, never at a
// call site. Every rule fails closed: no actor (an unknown rank, a bad id)
// answers false.

/** Who is acting: their rung, and the teams they lead this year. */
export interface Actor {
  readonly rank: ViewerRank;
  readonly ledTeams: readonly Team[];
}

/** A question about an actor. Fails closed: no actor answers false. */
export interface Rule {
  allows(actor: Actor | null | undefined): boolean;
}

export function isViewerRank(rank: string): rank is ViewerRank {
  return ViewerRank.safeParse(rank).success;
}

function isTeam(team: string): team is Team {
  return Team.safeParse(team).success;
}

/**
 * An actor from a rank and the team keys they lead, or null for a rank this
 * module does not know. A key that is not a team is dropped.
 */
export function toActor(
  rank: string,
  ledTeams: readonly string[],
): Actor | null {
  if (!isViewerRank(rank)) return null;
  return { rank, ledTeams: ledTeams.filter(isTeam) };
}

function rule(allows: (actor: Actor) => boolean): Rule {
  return {
    allows: (actor) => !!actor && isViewerRank(actor.rank) && allows(actor),
  };
}

/** Nobody, a captain included. */
export const NOBODY: Rule = rule(() => false);

/** A captain only. */
export const CAPTAIN_ONLY: Rule = rule((a) => a.rank === "captain");

/**
 * A captain, or a lead of `team` this year. A key that is not a team allows
 * nobody, a captain included.
 */
export function captainOrLeadOf(team: string): Rule {
  if (!isTeam(team)) return NOBODY;
  return rule(
    (a) =>
      a.rank === "captain" ||
      (a.rank === "team_lead" && a.ledTeams.includes(team)),
  );
}

/**
 * The same answer for a caller that still holds a rank and a list of led
 * teams: `rule.allows(toActor(rank, ledTeams))`.
 */
export function allowsRank(
  r: Rule,
  rank: string,
  ledTeams: readonly string[] = [],
): boolean {
  return r.allows(toActor(rank, ledTeams));
}
