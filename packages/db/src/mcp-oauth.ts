import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { createHttpDb, withTransaction } from "./index";
import { isActiveMcpUser } from "./mcp";
import * as schema from "./schema";

// The MCP OAuth store: client registration, single-use authorization codes,
// and access and refresh tokens with rotation. Tokens are stored as SHA-256
// hashes. The policy the routes apply first (allowed redirect URIs, allowed
// scopes) stays in apps/web/lib/mcp/oauth.ts; this module is the part that
// must hold under concurrent requests, tested against real Postgres in
// __tests__/mcp-oauth.test.ts.

/**
 * SHA-256 hash, hex-encoded. Used for storing access + refresh + client
 * secret hashes in the DB so a leaked snapshot can't be used to forge a
 * bearer token.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Generate a cryptographically random opaque token, base64url-encoded.
 * Default 32 bytes → 256 bits of entropy, well beyond the OAuth 2.1
 * recommendation of 128 bits.
 */
export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Constant-time equality on two strings of arbitrary length. Returns
 * false for length mismatches (safe — the caller already lost on
 * structural comparison).
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Verify a PKCE code_verifier against the stored code_challenge per
 * RFC 7636. Supports the two challenge methods the OAuth 2.1 spec
 * mandates: `S256` (required) and `plain` (allowed but discouraged).
 *
 * For S256 the challenge is `base64url(sha256(verifier))` and we
 * recompute it on the verifier we receive — byte-wise compared in
 * constant time.
 */
export function verifyPkce(
  challenge: string,
  method: "S256" | "plain",
  verifier: string,
): boolean {
  if (method === "plain") {
    return constantTimeEqual(challenge, verifier);
  }
  // S256: base64url(SHA256(ASCII(verifier)))
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return constantTimeEqual(challenge, computed);
}

// --- Lifetimes -----------------------------------------------------------
// All in seconds. Re-tune per security/UX trade-offs.
export const AUTH_CODE_TTL_SEC = 5 * 60; // 5 min — RFC recommends ≤ 10 min
export const ACCESS_TOKEN_TTL_SEC = 24 * 60 * 60; // 24 hours
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

/** The one scope a token carries today. */
export const DEFAULT_SCOPE = "mcp:user";

// --- Dynamic Client Registration (RFC 7591) ------------------------------

export interface RegisterClientInput {
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod:
    | "none"
    | "client_secret_basic"
    | "client_secret_post";
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

/** Constant-time-ish check via sha256 + string compare on the hashes. */
export function verifyClientSecret(
  presented: string,
  storedHash: string | null,
): boolean {
  if (!storedHash) return false;
  return sha256(presented) === storedHash;
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

export async function issueAuthCode(
  input: IssueAuthCodeInput,
): Promise<string> {
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
  return await withTransaction(async (tx) => {
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
    if (
      !verifyPkce(
        row.codeChallenge,
        row.codeChallengeMethod,
        input.codeVerifier,
      )
    ) {
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
  const refreshHash = sha256(input.refreshToken);
  const now = new Date();

  return await withTransaction(async (tx) => {
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

    // A member who is no longer approved gets no new tokens. Returning here
    // still commits the revoke above, so the old refresh token is spent too.
    if (!(await isActiveMcpUser(tx, old.userId))) return null;

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
}
