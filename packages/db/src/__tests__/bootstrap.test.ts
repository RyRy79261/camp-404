import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { bootstrapFirstCaptain, getBootstrapState } from "../bootstrap";
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
