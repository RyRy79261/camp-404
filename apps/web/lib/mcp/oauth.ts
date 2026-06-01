import { createHttpDb, createPooledDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { constantTimeEqual, generateOpaqueToken, sha256, verifyPkce } from "./tokens";

// --- Lifetimes -----------------------------------------------------------
// All in seconds. Re-tune per security/UX trade-offs.
export const AUTH_CODE_TTL_SEC = 5 * 60; // 5 min — RFC recommends ≤ 10 min
export const ACCESS_TOKEN_TTL_SEC = 24 * 60 * 60; // 24 hours
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

// Single coarse scope for now. Per-tool scopes can carve this later.
export const DEFAULT_SCOPE = "mcp:user";
const ALLOWED_SCOPES = new Set([DEFAULT_SCOPE]);

export function isAllowedScope(scope: string): boolean {
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .every((s) => ALLOWED_SCOPES.has(s));
}

// --- Redirect URI allow-list (DCR hardening) -----------------------------
// DCR is unauthenticated by design (RFC 7591). Hardening rule: only allow
// localhost (any port) or claude.ai / anthropic.com subdomains. Tightens
// the attack surface for anyone hitting /register.
export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    if (isLoopback) return u.protocol === "http:" || u.protocol === "https:";
    if (u.protocol !== "https:") return false;
    return (
      u.hostname === "claude.ai" ||
      u.hostname.endsWith(".claude.ai") ||
      u.hostname === "anthropic.com" ||
      u.hostname.endsWith(".anthropic.com")
    );
  } catch {
    return false;
  }
}

// --- Dynamic Client Registration (RFC 7591) ------------------------------

export interface RegisterClientInput {
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_basic" | "client_secret_post";
  scope?: string;
}

export interface RegisteredClient {
  clientId: string;
  /** Plaintext secret returned ONCE to the registrant; not retrievable later. */
  clientSecret?: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: RegisterClientInput["tokenEndpointAuthMethod"];
  scope: string | null;
  createdAt: Date;
}

export async function registerClient(
  input: RegisterClientInput,
): Promise<RegisteredClient> {
  const db = createHttpDb();
  const clientId = generateOpaqueToken(16);
  const clientSecret =
    input.tokenEndpointAuthMethod === "none"
      ? undefined
      : generateOpaqueToken(32);

  const [row] = await db
    .insert(schema.mcpOauthClients)
    .values({
      clientId,
      clientSecretHash: clientSecret ? sha256(clientSecret) : null,
      clientName: input.clientName,
      redirectUris: input.redirectUris,
      tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
      scope: input.scope ?? DEFAULT_SCOPE,
    })
    .returning();

  if (!row) throw new Error("Failed to insert mcp_oauth_clients row");

  return {
    clientId: row.clientId,
    clientSecret,
    clientName: row.clientName,
    redirectUris: row.redirectUris,
    tokenEndpointAuthMethod: row.tokenEndpointAuthMethod,
    scope: row.scope,
    createdAt: row.createdAt,
  };
}

export async function findClient(clientId: string) {
  const db = createHttpDb();
  const [row] = await db
    .select()
    .from(schema.mcpOauthClients)
    .where(eq(schema.mcpOauthClients.clientId, clientId))
    .limit(1);
  return row ?? null;
}

/** Constant-time check: hashes the presented secret then does a timing-safe compare. */
export function verifyClientSecret(
  presented: string,
  storedHash: string | null,
): boolean {
  if (!storedHash) return false;
  return constantTimeEqual(sha256(presented), storedHash);
}

// --- Authorization codes -------------------------------------------------

export interface IssueAuthCodeInput {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256" | "plain";
  scope: string;
}

export async function issueAuthCode(input: IssueAuthCodeInput): Promise<string> {
  const db = createHttpDb();
  const code = generateOpaqueToken(32);
  const now = new Date();
  await db.insert(schema.mcpAuthCodes).values({
    code,
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    scope: input.scope,
    expiresAt: new Date(now.getTime() + AUTH_CODE_TTL_SEC * 1000),
  });
  return code;
}

export interface ConsumedAuthCode {
  userId: string;
  scope: string;
}

/**
 * Atomically consume an authorization code: must match client, redirect
 * URI, and PKCE verifier; must be unconsumed and unexpired. Flips
 * `consumed_at` in the same UPDATE so two parallel exchanges can't both
 * succeed. Returns null on any mismatch.
 */
export async function consumeAuthCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<ConsumedAuthCode | null> {
  const { db, pool } = createPooledDb();
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(schema.mcpAuthCodes)
        .where(
          and(
            eq(schema.mcpAuthCodes.code, input.code),
            eq(schema.mcpAuthCodes.clientId, input.clientId),
            isNull(schema.mcpAuthCodes.consumedAt),
            gt(schema.mcpAuthCodes.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (!row) return null;
      if (row.redirectUri !== input.redirectUri) return null;
      if (!verifyPkce(row.codeChallenge, row.codeChallengeMethod, input.codeVerifier)) {
        return null;
      }
      const updated = await tx
        .update(schema.mcpAuthCodes)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(schema.mcpAuthCodes.code, input.code),
            isNull(schema.mcpAuthCodes.consumedAt),
          ),
        )
        .returning({ code: schema.mcpAuthCodes.code });
      if (updated.length === 0) return null; // raced
      return { userId: row.userId, scope: row.scope };
    });
  } finally {
    await pool.end();
  }
}

// --- Access + refresh tokens --------------------------------------------

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  scope: string;
}

export async function issueAccessToken(input: {
  clientId: string;
  userId: string;
  scope: string;
}): Promise<IssuedTokens> {
  const db = createHttpDb();
  const access = generateOpaqueToken(32);
  const refresh = generateOpaqueToken(32);
  const now = new Date();
  await db.insert(schema.mcpAccessTokens).values({
    tokenHash: sha256(access),
    refreshTokenHash: sha256(refresh),
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SEC * 1000),
    refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000),
  });
  return {
    accessToken: access,
    refreshToken: refresh,
    expiresIn: ACCESS_TOKEN_TTL_SEC,
    refreshExpiresIn: REFRESH_TOKEN_TTL_SEC,
    scope: input.scope,
  };
}

/**
 * Refresh-token rotation. Must be transactional — atomic revoke-old +
 * insert-new in one txn so a transient DB failure doesn't permanently
 * kill the user's session.
 */
export async function rotateRefreshToken(input: {
  refreshToken: string;
  clientId: string;
}): Promise<IssuedTokens | null> {
  const { db, pool } = createPooledDb();
  const refreshHash = sha256(input.refreshToken);
  const now = new Date();

  try {
    return await db.transaction(async (tx) => {
      const revoked = await tx
        .update(schema.mcpAccessTokens)
        .set({ revokedAt: now })
        .where(
          and(
            eq(schema.mcpAccessTokens.refreshTokenHash, refreshHash),
            eq(schema.mcpAccessTokens.clientId, input.clientId),
            isNull(schema.mcpAccessTokens.revokedAt),
            gt(schema.mcpAccessTokens.refreshExpiresAt, now),
          ),
        )
        .returning({
          userId: schema.mcpAccessTokens.userId,
          scope: schema.mcpAccessTokens.scope,
        });
      const old = revoked[0];
      if (!old) return null; // unknown / expired / already rotated

      const access = generateOpaqueToken(32);
      const refresh = generateOpaqueToken(32);
      await tx.insert(schema.mcpAccessTokens).values({
        tokenHash: sha256(access),
        refreshTokenHash: sha256(refresh),
        clientId: input.clientId,
        userId: old.userId,
        scope: old.scope,
        expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SEC * 1000),
        refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000),
      });

      return {
        accessToken: access,
        refreshToken: refresh,
        expiresIn: ACCESS_TOKEN_TTL_SEC,
        refreshExpiresIn: REFRESH_TOKEN_TTL_SEC,
        scope: old.scope,
      };
    });
  } finally {
    await pool.end();
  }
}
