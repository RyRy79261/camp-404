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
  makeRoomForClient,
  registerBoundedClient,
  sweepUnusedClients,
  UNUSED_CLIENT_TTL_MS,
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

describe("sweeping clients nobody authorized", () => {
  const h = useTestDb();

  it("deletes an old client that never got a code or a token, and keeps the rest", async () => {
    const db = h.db();
    const now = new Date();
    const old = new Date(now.getTime() - UNUSED_CLIENT_TTL_MS - 60_000);
    const register = async (name: string, createdAt: Date) => {
      const client = await registerClient({
        clientName: name,
        redirectUris: [REDIRECT],
        tokenEndpointAuthMethod: "none",
      });
      await db
        .update(schema.mcpOauthClients)
        .set({ createdAt })
        .where(eq(schema.mcpOauthClients.clientId, client.clientId));
      return client.clientId;
    };
    const abandoned = await register("Abandoned", old);
    const fresh = await register("Just registered", now);
    const authorized = await register("Authorized once", old);
    const withToken = await register("Holds a token", old);
    const used = await register("Used", old);
    const user = await makeUser(db, { approvalStatus: "approved" });
    await issueAuthCode({
      clientId: authorized,
      userId: user.id,
      redirectUri: REDIRECT,
      codeChallenge: CHALLENGE,
      codeChallengeMethod: "S256",
      scope: "mcp:user",
    });
    await issueAccessToken({
      clientId: withToken,
      userId: user.id,
      scope: "mcp:user",
    });
    await db
      .update(schema.mcpOauthClients)
      .set({ lastUsedAt: now })
      .where(eq(schema.mcpOauthClients.clientId, used));

    expect(await sweepUnusedClients(now)).toBe(1);
    const left = (
      await db
        .select({ clientId: schema.mcpOauthClients.clientId })
        .from(schema.mcpOauthClients)
    ).map((r) => r.clientId);
    expect(left).not.toContain(abandoned);
    expect(left).toEqual(
      expect.arrayContaining([fresh, authorized, withToken, used]),
    );
    // Run again: nothing left to sweep.
    expect(await sweepUnusedClients(now)).toBe(0);
  });
});

describe("bounding stored clients nobody authorized", () => {
  const h = useTestDb();

  it("pushes out the oldest unauthorized client past the grace period, never an authorized or a new one", async () => {
    const db = h.db();
    const now = new Date();
    const at = (msAgo: number) => new Date(now.getTime() - msAgo);
    const register = async (name: string, createdAt: Date) => {
      const client = await registerClient({
        clientName: name,
        redirectUris: [REDIRECT],
        tokenEndpointAuthMethod: "none",
      });
      await db
        .update(schema.mcpOauthClients)
        .set({ createdAt })
        .where(eq(schema.mcpOauthClients.clientId, client.clientId));
      return client.clientId;
    };
    const user = await makeUser(db, { approvalStatus: "approved" });
    const authorized = await register("Authorized long ago", at(3_600_000));
    await issueAccessToken({
      clientId: authorized,
      userId: user.id,
      scope: "mcp:user",
    });
    const oldest = await register("Oldest", at(1_800_000));
    const older = await register("Older", at(1_200_000));
    const fresh = await register("Mid sign-in", at(60_000));
    const ids = async () =>
      (
        await db
          .select({ clientId: schema.mcpOauthClients.clientId })
          .from(schema.mcpOauthClients)
      ).map((r) => r.clientId);

    // Under the cap: nothing goes.
    expect(await makeRoomForClient(4, now)).toBe(true);
    expect(await ids()).toHaveLength(4);
    // At the cap of 3 unauthorized: the oldest goes, nobody is refused.
    expect(await makeRoomForClient(3, now)).toBe(true);
    expect(await ids()).not.toContain(oldest);
    expect(await ids()).toEqual(
      expect.arrayContaining([authorized, older, fresh]),
    );
    // Two over a cap of 1, and only one past the grace period: it goes,
    // and the one mid sign-in is never pushed out, so this one is refused.
    expect(await makeRoomForClient(1, now)).toBe(false);
    const left = await ids();
    expect(left).not.toContain(older);
    expect(left).toEqual(expect.arrayContaining([authorized, fresh]));
  });
});

describe("registering under the cap", () => {
  const h = useTestDb();

  it("registers while there is room, and refuses only when every unauthorized client is mid sign-in", async () => {
    const db = h.db();
    const input = {
      clientName: "Claude",
      redirectUris: [REDIRECT],
      tokenEndpointAuthMethod: "none" as const,
    };
    const stored = async () =>
      (await db.select().from(schema.mcpOauthClients)).length;

    // Two at once against a cap of 2: both fit, never a third.
    const both = await Promise.all([
      registerBoundedClient(input, 2),
      registerBoundedClient(input, 2),
    ]);
    expect(both.every((c) => c !== null)).toBe(true);
    expect(await stored()).toBe(2);
    // Both are minutes old at most: no room, nothing stored.
    expect(await registerBoundedClient(input, 2)).toBeNull();
    expect(await stored()).toBe(2);
    // Later, the oldest is pushed out and the newcomer gets in.
    // An hour after the newest was stored (by the database's clock, which
    // stamps createdAt).
    const newest = Math.max(
      ...(await db.select().from(schema.mcpOauthClients)).map((c) =>
        c.createdAt.getTime(),
      ),
    );
    const later = new Date(newest + 60 * 60 * 1000);
    expect(await registerBoundedClient(input, 2, later)).not.toBeNull();
    expect(await stored()).toBe(2);
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
