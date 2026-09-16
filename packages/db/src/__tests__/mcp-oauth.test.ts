import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  consumeAuthCode,
  findClient,
  issueAccessToken,
  issueAuthCode,
  registerClient,
  rotateRefreshToken,
  sha256,
  verifyClientSecret,
} from "../mcp-oauth";
import * as schema from "../schema";

// The MCP OAuth store against real Postgres: a code works once, a refresh
// token rotates once, and two requests racing for either get one winner.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "a-long-enough-pkce-code-verifier-for-the-test-0123456789";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

async function setup(
  db: DB,
  approvalStatus: "approved" | "pending" = "approved",
) {
  const user = await makeUser(db, { approvalStatus });
  const client = await registerClient({
    clientName: "Claude",
    redirectUris: [REDIRECT],
    tokenEndpointAuthMethod: "none",
  });
  return { user, client };
}

async function code(db: DB) {
  const { user, client } = await setup(db);
  const issued = await issueAuthCode({
    clientId: client.clientId,
    userId: user.id,
    redirectUri: REDIRECT,
    codeChallenge: CHALLENGE,
    codeChallengeMethod: "S256",
    scope: "mcp:user",
  });
  const exchange = (
    overrides: Partial<Parameters<typeof consumeAuthCode>[0]> = {},
  ) =>
    consumeAuthCode({
      code: issued,
      clientId: client.clientId,
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
      ...overrides,
    });
  return { user, client, issued, exchange };
}

describe("client registration", () => {
  const h = useTestDb();

  it("stores only a hash of a client secret and hands the secret back once", async () => {
    h.db();
    const client = await registerClient({
      clientName: "Confidential",
      redirectUris: [REDIRECT],
      tokenEndpointAuthMethod: "client_secret_post",
    });
    expect(client.clientSecret).toBeTruthy();
    const stored = await findClient(client.clientId);
    expect(stored?.clientSecretHash).toBe(sha256(client.clientSecret!));
    expect(
      verifyClientSecret(client.clientSecret!, stored!.clientSecretHash),
    ).toBe(true);
    expect(verifyClientSecret("wrong", stored!.clientSecretHash)).toBe(false);
    expect(verifyClientSecret("anything", null)).toBe(false);
    expect(await findClient("no-such-client")).toBeNull();
  });
});

describe("authorization codes", () => {
  const h = useTestDb();

  it("exchange once, for the right client, redirect and verifier", async () => {
    const db = h.db();
    const { user, client, exchange } = await code(db);

    // A mismatch spends nothing: the real exchange still works afterwards.
    expect(await exchange({ clientId: "other-client" })).toBeNull();
    expect(
      await exchange({ redirectUri: "http://localhost:1234/cb" }),
    ).toBeNull();
    expect(await exchange({ codeVerifier: "not-the-verifier" })).toBeNull();

    expect(await exchange()).toEqual({ userId: user.id, scope: "mcp:user" });
    expect(await exchange()).toBeNull();
    void client;
  });

  it("refuses an expired code", async () => {
    const db = h.db();
    const { issued, exchange } = await code(db);
    await db
      .update(schema.mcpAuthCodes)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.mcpAuthCodes.code, issued));
    expect(await exchange()).toBeNull();
  });

  it("gives one winner when two exchanges race", async () => {
    const db = h.db();
    const { exchange } = await code(db);
    const results = await Promise.all([exchange(), exchange()]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });
});

describe("access and refresh tokens", () => {
  const h = useTestDb();

  it("stores hashes only", async () => {
    const db = h.db();
    const { user, client } = await setup(db);
    const tokens = await issueAccessToken({
      clientId: client.clientId,
      userId: user.id,
      scope: "mcp:user",
    });
    const [row] = await db.select().from(schema.mcpAccessTokens);
    expect(row).toMatchObject({
      tokenHash: sha256(tokens.accessToken),
      refreshTokenHash: sha256(tokens.refreshToken),
    });
    expect(JSON.stringify(row)).not.toContain(tokens.accessToken);
    expect(JSON.stringify(row)).not.toContain(tokens.refreshToken);
  });

  it("rotates once: the old refresh token is spent and the new one works", async () => {
    const db = h.db();
    const { user, client } = await setup(db);
    const first = await issueAccessToken({
      clientId: client.clientId,
      userId: user.id,
      scope: "mcp:user",
    });
    const rotate = (refreshToken: string, clientId = client.clientId) =>
      rotateRefreshToken({ refreshToken, clientId });

    expect(await rotate(first.refreshToken, "other-client")).toBeNull();
    const second = await rotate(first.refreshToken);
    expect(second?.scope).toBe("mcp:user");
    expect(await rotate(first.refreshToken)).toBeNull();
    expect(await rotate(second!.refreshToken)).not.toBeNull();
  });

  it("refuses an expired refresh token", async () => {
    const db = h.db();
    const { user, client } = await setup(db);
    const tokens = await issueAccessToken({
      clientId: client.clientId,
      userId: user.id,
      scope: "mcp:user",
    });
    await db
      .update(schema.mcpAccessTokens)
      .set({ refreshExpiresAt: new Date(Date.now() - 60_000) });
    expect(
      await rotateRefreshToken({
        refreshToken: tokens.refreshToken,
        clientId: client.clientId,
      }),
    ).toBeNull();
  });

  it("gives one winner when two rotations of the same token race", async () => {
    const db = h.db();
    const { user, client } = await setup(db);
    const tokens = await issueAccessToken({
      clientId: client.clientId,
      userId: user.id,
      scope: "mcp:user",
    });
    const results = await Promise.all([
      rotateRefreshToken({
        refreshToken: tokens.refreshToken,
        clientId: client.clientId,
      }),
      rotateRefreshToken({
        refreshToken: tokens.refreshToken,
        clientId: client.clientId,
      }),
    ]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const live = await db
      .select()
      .from(schema.mcpAccessTokens)
      .where(sql`${schema.mcpAccessTokens.revokedAt} is null`);
    expect(live).toHaveLength(1);
  });

  it("gives a member who is no longer approved nothing, and still spends the token", async () => {
    const db = h.db();
    const { user, client } = await setup(db);
    const tokens = await issueAccessToken({
      clientId: client.clientId,
      userId: user.id,
      scope: "mcp:user",
    });
    await db
      .update(schema.users)
      .set({ approvalStatus: "rejected" })
      .where(eq(schema.users.id, user.id));
    expect(
      await rotateRefreshToken({
        refreshToken: tokens.refreshToken,
        clientId: client.clientId,
      }),
    ).toBeNull();
    const [row] = await db.select().from(schema.mcpAccessTokens);
    expect(row?.revokedAt).toBeInstanceOf(Date);
  });
});
