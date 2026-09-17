import { Team, type Team as TeamKey } from "@camp404/types";
import { activeTeams, getTeamsConfig } from "./camp-config";

/**
 * Resolve a submitted team key against the camp config. Shared by the roster
 * actions and the MCP captain tools.
 *
 * `requireActive` is the archived-team rule: a captain may not ASSIGN to (or
 * appoint a lead of) an archived team, but may still REMOVE a member from one —
 * archiving a team must not strand its roster. Validated server-side against the
 * config rather than trusting the list the client was handed.
 *
 * The `Team` enum check is the second half: the config's keys are `teamEnum`
 * keys by contract, and this makes a config that has drifted from the database
 * enum a refused action rather than a Postgres error.
 */
export async function resolveTeamKey(
  team: string,
  requireActive: boolean,
): Promise<{ ok: true; team: TeamKey } | { ok: false; error: string }> {
  const parsed = Team.safeParse(team);
  if (!parsed.success) return { ok: false, error: "Unknown team." };
  const config = await getTeamsConfig();
  const pool = requireActive ? activeTeams(config) : config.teams;
  if (!pool.some((t) => t.key === parsed.data)) {
    return {
      ok: false,
      error: requireActive ? "That team isn't active." : "Unknown team.",
    };
  }
  return { ok: true, team: parsed.data };
}
