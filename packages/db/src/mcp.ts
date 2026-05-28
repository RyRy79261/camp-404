import { and, eq, gt, isNull } from "drizzle-orm";
import { createHttpDb } from "./index";
import * as schema from "./schema";

export type Team = (typeof schema.teamEnum.enumValues)[number];

/**
 * Rows needed to compute an MCP caller's effective scope.
 *
 * Kept thin and Drizzle-row-shaped (not McpScope-shaped) so the
 * derivation lives in app code and stays pure-testable. See
 * `apps/web/lib/mcp/scope.ts` for the resolver.
 */
export interface McpScopeRows {
  user: {
    id: string;
    rank: "captain" | "member";
    aiDataConsent: boolean;
  };
  teamMemberships: Array<{ team: Team; isLead: boolean }>;
  driverIntent: boolean;
}

/**
 * Single round-trip read of the three things every MCP tool needs to
 * know about its caller: the user row, their team memberships, and
 * whether they've registered intent to drive. Returns null if the camp
 * user row doesn't exist.
 */
export async function getMcpScopeRows(
  campUserId: string,
): Promise<McpScopeRows | null> {
  const db = createHttpDb();

  const [userRow] = await db
    .select({
      id: schema.users.id,
      rank: schema.users.rank,
      aiDataConsent: schema.users.aiDataConsent,
    })
    .from(schema.users)
    .where(eq(schema.users.id, campUserId))
    .limit(1);

  if (!userRow) return null;

  const [memberships, driverRows] = await Promise.all([
    db
      .select({
        team: schema.teamMemberships.team,
        isLead: schema.teamMemberships.isLead,
      })
      .from(schema.teamMemberships)
      .where(eq(schema.teamMemberships.userId, campUserId)),
    db
      .select({ intendsToDrive: schema.driverProfiles.intendsToDrive })
      .from(schema.driverProfiles)
      .where(eq(schema.driverProfiles.userId, campUserId))
      .limit(1),
  ]);

  return {
    user: userRow,
    teamMemberships: memberships,
    driverIntent: driverRows[0]?.intendsToDrive ?? false,
  };
}

/** Append one row to mcp_audit_log. Best-effort — never throws into the caller. */
export async function appendMcpAuditLog(input: {
  campUserId: string;
  clientId: string;
  tool: string;
  argsJson: Record<string, unknown> | null;
  outcome: "success" | "error";
  errorMessage?: string | null;
  durationMs?: number | null;
}): Promise<void> {
  try {
    const db = createHttpDb();
    await db.insert(schema.mcpAuditLog).values({
      userId: input.campUserId,
      clientId: input.clientId,
      tool: input.tool,
      argsJson: input.argsJson,
      outcome: input.outcome,
      errorMessage: input.errorMessage ?? null,
      durationMs: input.durationMs ?? null,
    });
  } catch {
    // Auditing must never break a tool call. Swallow + rely on DB-level
    // monitoring for persistent audit-log write failures.
  }
}

/** Bump `mcp_oauth_clients.last_used_at` and `mcp_access_tokens.last_used_at`. */
export async function touchAccessToken(tokenHash: string): Promise<void> {
  try {
    const db = createHttpDb();
    const now = new Date();
    const [token] = await db
      .update(schema.mcpAccessTokens)
      .set({ lastUsedAt: now })
      .where(eq(schema.mcpAccessTokens.tokenHash, tokenHash))
      .returning({ clientId: schema.mcpAccessTokens.clientId });
    if (token) {
      await db
        .update(schema.mcpOauthClients)
        .set({ lastUsedAt: now })
        .where(eq(schema.mcpOauthClients.clientId, token.clientId));
    }
  } catch {
    // Best-effort housekeeping.
  }
}

/**
 * Find a non-revoked, non-expired access token by its SHA-256 hash.
 * Returns null when the hash is unknown / expired / revoked.
 */
export async function findActiveAccessToken(tokenHash: string) {
  const db = createHttpDb();
  const [row] = await db
    .select()
    .from(schema.mcpAccessTokens)
    .where(
      and(
        eq(schema.mcpAccessTokens.tokenHash, tokenHash),
        isNull(schema.mcpAccessTokens.revokedAt),
        gt(schema.mcpAccessTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}
