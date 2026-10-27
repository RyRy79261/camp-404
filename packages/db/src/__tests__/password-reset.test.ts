import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  RESET_CAPTAINS_ONLY,
  RESET_NO_SIGN_IN,
  recordPasswordResetLink,
} from "../password-reset";
import * as schema from "../schema";

// A captain's "Send password reset link" (owner's mock-up, step 7): the
// captain is re-read under lock, the member must still have a sign-in, and the
// audit row is written before the caller sends the email.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function signIn(db: DB, authUserId: string, email: string) {
  await db
    .insert(schema.user)
    .values({ id: authUserId, name: email, email, emailVerified: true });
}

async function auditRows(db: DB) {
  return db
    .select({
      actorId: schema.auditLog.actorId,
      action: schema.auditLog.action,
      target: schema.auditLog.target,
      metadata: schema.auditLog.metadata,
    })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, "member.password_reset_sent"));
}

describe("recordPasswordResetLink", () => {
  const h = useTestDb();

  it("hands a captain the member's sign-in email and audits the send", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await signIn(db, member.authUserId, "lerato@example.com");

    expect(
      await recordPasswordResetLink({
        actorId: captain.id,
        userId: member.id,
      }),
    ).toEqual({ ok: true, email: "lerato@example.com" });
    expect(await auditRows(db)).toEqual([
      {
        actorId: captain.id,
        action: "member.password_reset_sent",
        target: member.id,
        metadata: { via: "member_panel" },
      },
    ]);
  });

  it("refuses a member or a team lead, and writes nothing", async () => {
    const db = h.db();
    const notCaptain = await makeUser(db);
    await db.insert(schema.teamMemberships).values({
      userId: notCaptain.id,
      team: "kitchen",
      isLead: true,
      cycle: 1,
    });
    const member = await makeUser(db);
    await signIn(db, member.authUserId, "nova@example.com");

    expect(
      await recordPasswordResetLink({
        actorId: notCaptain.id,
        userId: member.id,
      }),
    ).toEqual({ ok: false, error: RESET_CAPTAINS_ONLY });
    expect(await auditRows(db)).toEqual([]);
  });

  it("refuses an erased member or one with no sign-in, and writes nothing", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const erased = await makeUser(db, { sanitised: true });
    await signIn(db, erased.authUserId, "gone@example.com");
    const noSignIn = await makeUser(db);

    for (const target of [erased, noSignIn]) {
      expect(
        await recordPasswordResetLink({
          actorId: captain.id,
          userId: target.id,
        }),
      ).toEqual({ ok: false, error: RESET_NO_SIGN_IN });
    }
    expect(await auditRows(db)).toEqual([]);
  });
});
