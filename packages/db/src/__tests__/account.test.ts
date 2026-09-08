import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { sanitiseAccount, sanitisedUserPatch } from "../account";
import * as schema from "../schema";

// Erasure keeps the users row for lineage, so whatever the patch does NOT
// overwrite survives the erasure. Rank is the load-bearing case: a tombstone
// that keeps `captain` holds a captaincy nobody can use — it closes /setup and
// tells the sole-captain deletion guard the camp has a spare captain it does
// not have. (The other columns the patch nulls are covered by
// apps/web/lib/__tests__/account.test.ts.)

describe("sanitisedUserPatch", () => {
  const patch = sanitisedUserPatch(
    "user-123",
    7,
    new Date("2026-05-30T12:00:00.000Z"),
  );

  it("drops the rank to member so a tombstone holds no captaincy", () => {
    expect(patch.rank).toBe("member");
  });

  it("still severs the auth link and marks the row sanitised", () => {
    // The two flags the captain-count filter in bootstrap.ts reads; asserted
    // here so the rank drop can never be mistaken for the whole defence.
    expect(patch.sanitised).toBe(true);
    expect(patch.authUserId).toBe("deleted:user-123");
  });
});

// --- sanitiseAccount (integration) ---------------------------------------
// Erasure is a POPIA promise, and both halves of it live in the WHERE clauses:
// which rows go, and whether the transaction is allowed to run at all. These
// exercise the real transaction against real Postgres.

describe("sanitiseAccount", () => {
  const h = useTestDb();

  async function makeResponse(
    db: ReturnType<typeof h.db>,
    userId: string,
    definitionKey: string,
  ): Promise<void> {
    await db.insert(schema.questionnaireResponses).values({
      userId,
      definitionKey,
      definitionVersion: "1",
      responses: { favourite_meal: "braai" },
      completedAt: new Date(),
    });
  }

  async function responsesFor(
    db: ReturnType<typeof h.db>,
    userId: string,
  ): Promise<(typeof schema.questionnaireResponses.$inferSelect)[]> {
    return db
      .select()
      .from(schema.questionnaireResponses)
      .where(eq(schema.questionnaireResponses.userId, userId));
  }

  async function readUser(
    db: ReturnType<typeof h.db>,
    userId: string,
  ): Promise<typeof schema.users.$inferSelect> {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    return row!;
  }

  it("removes every questionnaire answer the member ever gave", async () => {
    // The defect: erasure deleted the bespoke questionnaire tables but left
    // the generic builder store, so "erase my account" kept the answers.
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);
    await makeResponse(db, member.id, "feedback");
    await makeResponse(db, member.id, "build-week");
    await makeResponse(db, other.id, "feedback");

    const result = await sanitiseAccount(member.id);

    expect(result.ok).toBe(true);
    expect(await responsesFor(db, member.id)).toHaveLength(0);
    // Another member's answers to the same questionnaire are not theirs to lose.
    expect(await responsesFor(db, other.id)).toHaveLength(1);
  });

  it("revokes every live access grant, so an erased account cannot still act", async () => {
    // Same class as the answers above, and the one a member would assume
    // happened FIRST. All three tables declare onDelete: "cascade" on users.id,
    // but erasure keeps the users row, so the cascade never fires: an issued
    // MCP access token kept answering for the member until it expired.
    const db = h.db();
    const member = await makeUser(db);
    const other = await makeUser(db);
    await db.insert(schema.mcpOauthClients).values({
      clientId: "client-1",
      clientName: "Test client",
      redirectUris: ["https://example.test/cb"],
      tokenEndpointAuthMethod: "none",
    });
    for (const userId of [member.id, other.id]) {
      await db.insert(schema.mcpAccessTokens).values({
        tokenHash: `access-${userId}`,
        refreshTokenHash: `refresh-${userId}`,
        clientId: "client-1",
        userId,
        scope: "profile",
        expiresAt: new Date(Date.now() + 3_600_000),
      });
      await db.insert(schema.mcpAuthCodes).values({
        code: `code-${userId}`,
        clientId: "client-1",
        userId,
        redirectUri: "https://example.test/cb",
        codeChallenge: "challenge",
        codeChallengeMethod: "S256",
        scope: "profile",
        expiresAt: new Date(Date.now() + 600_000),
      });
      await db.insert(schema.telegramInvites).values({
        userId,
        chatId: "chat-1",
        inviteLink: `https://t.me/+${userId}`,
      });
    }

    const result = await sanitiseAccount(member.id);
    expect(result.ok).toBe(true);

    const tokens = await db
      .select()
      .from(schema.mcpAccessTokens)
      .where(eq(schema.mcpAccessTokens.userId, member.id));
    const codes = await db
      .select()
      .from(schema.mcpAuthCodes)
      .where(eq(schema.mcpAuthCodes.userId, member.id));
    const invites = await db
      .select()
      .from(schema.telegramInvites)
      .where(eq(schema.telegramInvites.userId, member.id));
    expect(tokens).toHaveLength(0);
    expect(codes).toHaveLength(0);
    expect(invites).toHaveLength(0);

    // Another member's grants are not theirs to lose.
    const othersTokens = await db
      .select()
      .from(schema.mcpAccessTokens)
      .where(eq(schema.mcpAccessTokens.userId, other.id));
    expect(othersTokens).toHaveLength(1);
  });

  it("refuses the camp's sole captain and writes nothing", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    await makeResponse(db, captain.id, "feedback");

    const result = await sanitiseAccount(captain.id);

    expect(result).toEqual({ ok: false, reason: "sole_captain" });
    const row = await readUser(db, captain.id);
    expect(row.sanitised).toBe(false);
    expect(row.rank).toBe("captain");
    expect(row.displayName).toBe(captain.displayName);
    expect(row.authUserId).toBe(captain.authUserId);
    // The refusal returns before the first delete, so nothing downstream ran.
    expect(await responsesFor(db, captain.id)).toHaveLength(1);
  });

  it("lets a captain who has a peer go", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    await makeUser(db, { rank: "captain" });

    const result = await sanitiseAccount(captain.id);

    expect(result.ok).toBe(true);
    expect((await readUser(db, captain.id)).sanitised).toBe(true);
  });

  it("decides on the count at the moment of the write, not the caller's", async () => {
    // The race the guard closes: two captains each pass a pre-check that saw
    // two captains. Serialising them is what the `FOR UPDATE` in the recount
    // buys, and PGlite is single-connection — so this asserts the half that is
    // observable in one connection: the SECOND erasure re-reads the set the
    // first one shrank and refuses, even though nothing outside the
    // transaction ever told it the count had changed.
    const db = h.db();
    const first = await makeUser(db, { rank: "captain" });
    const second = await makeUser(db, { rank: "captain" });

    expect((await sanitiseAccount(first.id)).ok).toBe(true);
    expect(await sanitiseAccount(second.id)).toEqual({
      ok: false,
      reason: "sole_captain",
    });
    expect((await readUser(db, second.id)).sanitised).toBe(false);
  });

  it("does not count a tombstone or a system actor as the peer captain", async () => {
    // Same predicate as /setup reads (`isRealCaptain`). If the recount had
    // been written as a bare `rank = 'captain'` count, these two would each
    // look like the spare captain that lets the real one erase itself.
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    await makeUser(db, { rank: "captain", sanitised: true });
    await makeUser(db, { rank: "captain", isSystem: true });

    expect(await sanitiseAccount(captain.id)).toEqual({
      ok: false,
      reason: "sole_captain",
    });
  });

  it("lets a plain member go while the camp has a single captain", async () => {
    // The guard is about captaincy, not about erasure in general.
    const db = h.db();
    await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);

    expect((await sanitiseAccount(member.id)).ok).toBe(true);
    expect((await readUser(db, member.id)).sanitised).toBe(true);
  });
});
