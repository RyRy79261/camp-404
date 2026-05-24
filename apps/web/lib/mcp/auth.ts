import { findActiveAccessToken, touchAccessToken } from "@camp404/db/mcp";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { sha256 } from "./tokens";

/**
 * Bearer-token verifier passed to `withMcpAuth`. Hashes the presented
 * token, looks it up in `mcp_access_tokens`, and returns the standard
 * MCP `AuthInfo` shape. Returning `undefined` makes `withMcpAuth`
 * respond with 401 + the WWW-Authenticate hint.
 *
 * The camp user id is stuffed into `extra.campUserId` so tool handlers
 * can read `extra.authInfo?.extra?.campUserId` without an extra DB hop.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const hash = sha256(bearerToken);
  const row = await findActiveAccessToken(hash);
  if (!row) return undefined;

  // Best-effort housekeeping (last_used_at) — don't await; never block
  // the tool call on this.
  void touchAccessToken(hash);

  return {
    token: bearerToken,
    clientId: row.clientId,
    scopes: row.scope.split(/\s+/).filter(Boolean),
    expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
    extra: {
      campUserId: row.userId,
      scope: row.scope,
    },
  };
}

/** Pull the camp user id out of an `AuthInfo.extra` blob. */
export function getCampUserIdFromAuth(
  authInfo: AuthInfo | undefined,
): string | null {
  const id = (authInfo?.extra as { campUserId?: unknown } | undefined)
    ?.campUserId;
  return typeof id === "string" ? id : null;
}
