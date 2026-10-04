import { deriveViewerRank } from "@camp404/core";
import type { ViewerRank } from "@camp404/types";
import { getMcpScopeRows, type McpScopeRows, type Team } from "@camp404/db/mcp";

// Intentionally not `import "server-only"` — `resolveMcpScope` is a pure
// function exercised in unit tests under jsdom, and the DB-bound
// `getMcpScope` only runs from MCP tool handlers which themselves never
// reach a client bundle.

/**
 * Effective capability snapshot for one MCP call.
 *
 * Resolved fresh on every tool invocation — no caps cached on the access
 * token, so a rank change or new team membership takes effect on the
 * next call rather than next reconnect.
 *
 * Who may do what is NOT decided here. The tools ask the same predicates the
 * website asks (`./capabilities` for the rung, and @camp404/core's
 * canManageMoney, canEditTransport, canEditGuideChapter, … for the rest),
 * with `viewerRank` and `leadTeams` as their inputs.
 */
export interface McpScope {
  campUserId: string;
  rank: "captain" | "member";
  /**
   * The rung on the website's one ladder, camp_member < team_lead < captain:
   * `deriveViewerRank`, the function captain-gate.ts uses. Leading ANY team
   * this year makes a member a team lead everywhere (the owner's global-lead
   * ruling, AGENTS.md); which team they lead decides audiences, never
   * clearance.
   */
  viewerRank: ViewerRank;
  /** Teams this user leads THIS YEAR (subset of `memberTeams`). */
  leadTeams: Team[];
  /** Every team this user belongs to this year. */
  memberTeams: Team[];
  /** Whether they intend to drive this year. */
  isDriver: boolean;
  /** `rank === "captain"`. */
  isCaptain: boolean;
}

/**
 * Pure derivation of `McpScope` from the rows in `mcp_scope_rows`.
 *
 * Lives separately from the DB call so it can be exercised in unit
 * tests without a real Postgres.
 */
export function resolveMcpScope(rows: McpScopeRows): McpScope {
  const leadTeams: Team[] = [];
  const memberTeams: Team[] = [];
  for (const m of rows.teamMemberships) {
    memberTeams.push(m.team);
    if (m.isLead) leadTeams.push(m.team);
  }
  return {
    campUserId: rows.user.id,
    rank: rows.user.rank,
    viewerRank: deriveViewerRank(rows.user.rank, leadTeams.length > 0),
    leadTeams,
    memberTeams,
    isDriver: rows.driverIntent,
    isCaptain: rows.user.rank === "captain",
  };
}

/**
 * Reads the scope rows for `campUserId` and resolves the capability
 * snapshot. Returns `null` if the user row doesn't exist.
 */
export async function getMcpScope(
  campUserId: string,
): Promise<McpScope | null> {
  const rows = await getMcpScopeRows(campUserId);
  if (!rows) return null;
  return resolveMcpScope(rows);
}
