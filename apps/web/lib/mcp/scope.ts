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
 */
export interface McpScope {
  campUserId: string;
  rank: "captain" | "member";
  /** Teams this user leads (subset of `memberTeams`, plus `is_lead = true`). */
  leadTeams: Team[];
  /** Every team this user belongs to. */
  memberTeams: Team[];
  /** Driver intent flag — drives whether ride/lift tools are visible. */
  isDriver: boolean;
  /** `rank === "captain"`. Captains carry god rights in-app. */
  isCaptain: boolean;
  /** The subject's own AI data consent. Stored here for convenience. */
  aiDataConsent: boolean;
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
    leadTeams,
    memberTeams,
    isDriver: rows.driverIntent,
    isCaptain: rows.user.rank === "captain",
    aiDataConsent: rows.user.aiDataConsent,
  };
}

/**
 * Reads the scope rows for `campUserId` and resolves the capability
 * snapshot. Returns `null` if the user row doesn't exist.
 */
export async function getMcpScope(campUserId: string): Promise<McpScope | null> {
  const rows = await getMcpScopeRows(campUserId);
  if (!rows) return null;
  return resolveMcpScope(rows);
}

// --- Capability predicates ------------------------------------------------
// Per-domain checks that read the McpScope. Keeping them here (rather
// than spread across tool handlers) means the matrix in
// docs/mcp-tooling-proposal.md maps to one file you can grep.

/** Captain reads everything. Otherwise team-lead reads of own team. */
export function canReadTeamOps(scope: McpScope, team: Team): boolean {
  if (scope.isCaptain) return true;
  if (scope.memberTeams.includes(team)) return true;
  return false;
}

/** Lead of `team` or captain. */
export function canWriteTeam(scope: McpScope, team: Team): boolean {
  if (scope.isCaptain) return true;
  return scope.leadTeams.includes(team);
}

/** Any team lead OR captain. Used by cross-team approvers (inventory). */
export function canApproveCrossTeam(scope: McpScope): boolean {
  return scope.isCaptain || scope.leadTeams.length > 0;
}

/** Captain-only — admin surfaces (invite codes, audit log, etc.). */
export function canAdmin(scope: McpScope): boolean {
  return scope.isCaptain;
}
