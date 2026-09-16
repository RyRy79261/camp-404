import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  bootstrapFirstCaptain,
  FOUNDER_CODE_MAX_USES,
  getBootstrapState,
} from "../bootstrap";
import {
  consumeInviteCode,
  findUsableInviteCode,
  revokeInviteCode,
} from "../invite-codes";
import { sanitiseAccount } from "../account";
import * as schema from "../schema";

// The captain count is what /setup reads and what the sole-captain deletion
// guard trusts. Account erasure KEEPS the users row, so a bare
// `rank = 'captain'` count let a tombstone hold the camp's only captaincy.
// These run against real Postgres because the defect lives in the WHERE clause.

const FOUNDER_CODE = "meowzit";

describe("getBootstrapState — captainCount", () => {
  const h = useTestDb();

  it("counts a real captain", async () => {
    const db = h.db();
    await makeUser(db, { rank: "captain" });
    expect((await getBootstrapState()).captainCount).toBe(1);
  });

  it("does not count an erased captain", async () => {
    // Two captains because sanitiseAccount now refuses the camp's last one
    // (account.ts) — erasing the sole captain is the state this count exists
    // to keep the camp out of, so it can no longer be reached through the
    // erasure path.
    const db = h.db();
    const founder = await makeUser(db, { rank: "captain" });
    await makeUser(db, { rank: "captain" });
    expect((await getBootstrapState()).captainCount).toBe(2);

    await sanitiseAccount(founder.id);

    // The row is still there (lineage), it just no longer holds a captaincy.
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, founder.id));
    expect(row?.sanitised).toBe(true);
    expect((await getBootstrapState()).captainCount).toBe(1);
  });

  it("does not count a tombstone that kept `captain` from before the fix", async () => {
    // Rows erased BEFORE sanitisedUserPatch dropped rank still read
    // `rank = 'captain'`; only the `sanitised = false` filter catches them.
    const db = h.db();
    await makeUser(db, { rank: "captain", sanitised: true });
    expect((await getBootstrapState()).captainCount).toBe(0);
  });

  it("does not count a system actor holding captain rank", async () => {
    const db = h.db();
    await makeUser(db, { rank: "captain", isSystem: true });
    expect((await getBootstrapState()).captainCount).toBe(0);
  });

  it("counts only the real captains when ghosts sit alongside them", async () => {
    const db = h.db();
    await makeUser(db, { rank: "captain" });
    await makeUser(db, { rank: "captain" });
    await makeUser(db, { rank: "captain", sanitised: true });
    await makeUser(db, { rank: "captain", isSystem: true });
    await makeUser(db); // plain member
    expect((await getBootstrapState()).captainCount).toBe(2);
  });
});

describe("bootstrapFirstCaptain — the ghost-captain latch", () => {
  const h = useTestDb();

  it("elects a founder past a ghost captain on an unstamped camp", async () => {
    // The live-bug regression: a sanitised captain used to make the
    // in-transaction count non-zero, so a camp with no real captain and no
    // latch could never run the wizard.
    const db = h.db();
    await makeUser(db, { rank: "captain", sanitised: true });

    const res = await bootstrapFirstCaptain({
      authUserId: "auth-founder",
      displayName: "Ada",
      founderCode: FOUNDER_CODE,
    });

    expect(res).toEqual({ ok: true, userId: expect.any(String) });
    const [elected] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.authUserId, "auth-founder"));
    expect(elected?.rank).toBe("captain");
    expect(elected?.approvalStatus).toBe("approved");
    expect((await getBootstrapState()).captainCount).toBe(1);
  });

  it("still refuses once the latch is stamped, even with zero real captains", async () => {
    // THE REFUSED CASE. The count fix deliberately does NOT reopen /setup on a
    // camp that ran the wizard: the `bootstrapped_at` latch is absolute, so a
    // stranded camp is rescued by an operator, not by the first visitor to
    // reach /setup. Pinned here so nobody "fixes" the latch away later.
    const db = h.db();
    const first = await bootstrapFirstCaptain({
      authUserId: "auth-founder",
      displayName: "Ada",
      founderCode: FOUNDER_CODE,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Strand the camp by hand. sanitiseAccount now refuses to erase the last
    // captain, so the app can no longer produce this state — but a legacy
    // tombstone from before that guard, or an operator with psql, still can,
    // and the latch has to hold against it.
    await db
      .update(schema.users)
      .set({ sanitised: true, rank: "member" })
      .where(eq(schema.users.id, first.userId));
    expect((await getBootstrapState()).captainCount).toBe(0);

    const second = await bootstrapFirstCaptain({
      authUserId: "auth-opportunist",
      displayName: "Mallory",
      founderCode: FOUNDER_CODE,
    });

    expect(second).toEqual({ ok: false, reason: "already-bootstrapped" });
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.authUserId, "auth-opportunist"));
    expect(rows).toHaveLength(0);
  });

  it("refuses while a real captain exists, latch or no latch", async () => {
    const db = h.db();
    await makeUser(db, { rank: "captain" });

    const res = await bootstrapFirstCaptain({
      authUserId: "auth-opportunist",
      displayName: "Mallory",
      founderCode: FOUNDER_CODE,
    });

    expect(res).toEqual({ ok: false, reason: "already-bootstrapped" });
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.authUserId, "auth-opportunist"));
    expect(rows).toHaveLength(0);
  });
});

describe("the root invite code", () => {
  const h = useTestDb();

  it("is minted capped, and every redeemer waits for a captain", async () => {
    // The word is public (the repo is), so it must never wave anyone in.
    const db = h.db();
    const res = await bootstrapFirstCaptain({
      authUserId: "auth-founder",
      displayName: "Ada",
      founderCode: FOUNDER_CODE,
    });
    expect(res.ok).toBe(true);

    const [code] = await db
      .select()
      .from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.code, FOUNDER_CODE));
    expect(code).toMatchObject({
      requiresApproval: true,
      maxUses: FOUNDER_CODE_MAX_USES,
      createdByUserId: null,
    });
  });

  it("migration 0022 puts the policy on a root code minted before it", async () => {
    // The harness applies every migration to an empty database, so the live
    // case is rebuilt by hand: an old unlimited, pre-approved root code, a
    // captain's own code, and a root code already used past the cap.
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    await db.insert(schema.inviteCodes).values([
      {
        code: FOUNDER_CODE,
        createdByUserId: null,
        note: "Camp root invite (first-time setup)",
        maxUses: null,
        useCount: 12,
        requiresApproval: false,
      },
      {
        code: "berlin-crew",
        createdByUserId: captain.id,
        note: "Camp root invite (first-time setup)",
        maxUses: null,
        requiresApproval: false,
      },
      {
        code: "busy-root",
        createdByUserId: null,
        note: "Camp root invite (first-time setup)",
        maxUses: null,
        useCount: 140,
        requiresApproval: false,
      },
    ]);

    const migration = readFileSync(
      new URL("../../migrations/0022_founder_code_policy.sql", import.meta.url),
      "utf8",
    );
    await db.execute(sql.raw(migration));

    const rows = await db.select().from(schema.inviteCodes);
    const byCode = Object.fromEntries(rows.map((r) => [r.code, r]));
    expect(byCode[FOUNDER_CODE]).toMatchObject({
      requiresApproval: true,
      maxUses: 100,
      useCount: 12,
    });
    expect(byCode["busy-root"]).toMatchObject({
      requiresApproval: true,
      maxUses: 140,
    });
    // A captain's own code keeps the policy the captain chose.
    expect(byCode["berlin-crew"]).toMatchObject({
      requiresApproval: false,
      maxUses: null,
    });
  });

  it("can be revoked, which stops redemption and leaves an audit row", async () => {
    const db = h.db();
    await bootstrapFirstCaptain({
      authUserId: "auth-founder",
      displayName: "Ada",
      founderCode: FOUNDER_CODE,
    });
    expect(await consumeInviteCode(FOUNDER_CODE)).not.toBeNull();

    expect(
      await revokeInviteCode({ code: FOUNDER_CODE, actorUserId: null }),
    ).toBe(true);
    expect(await findUsableInviteCode(FOUNDER_CODE)).toBeNull();
    expect(await consumeInviteCode(FOUNDER_CODE)).toBeNull();

    // A second revoke, or an unknown code, changes nothing.
    expect(
      await revokeInviteCode({ code: FOUNDER_CODE, actorUserId: null }),
    ).toBe(false);
    expect(
      await revokeInviteCode({ code: "no-such-code", actorUserId: null }),
    ).toBe(false);

    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "invite.revoked"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      target: FOUNDER_CODE,
      metadata: { useCount: 1 },
    });
  });
});
