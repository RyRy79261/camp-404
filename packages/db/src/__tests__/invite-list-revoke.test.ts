import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  createInviteCode,
  listInviteCodes,
  revokeInviteCode,
} from "../invite-codes";
import * as schema from "../schema";

// The invite tool's list and revoke: a member sees and revokes only the codes
// they made; a captain (no creator scope) sees and revokes any code, the root
// code included. The scope is in the WHERE clause, so this runs on real rows.

async function mint(code: string, createdByUserId: string | null) {
  await createInviteCode({
    code,
    createdByUserId,
    note: `for ${code}`,
    maxUses: 1,
    assignedRank: null,
    requiresApproval: true,
  });
}

describe("listInviteCodes", () => {
  const h = useTestDb();

  it("lists a member's own codes, or every code, with who made each", async () => {
    const ada = await makeUser(h.db(), { displayName: "Ada" });
    const bo = await makeUser(h.db(), { displayName: "Bo" });
    await mint("ada-one", ada.id);
    await mint("bo-one", bo.id);
    await mint("meowzit", null);

    const mine = await listInviteCodes({ createdByUserId: ada.id });
    expect(mine.map((c) => c.code)).toEqual(["ada-one"]);

    const all = await listInviteCodes();
    expect(all.map((c) => c.code).sort()).toEqual([
      "ada-one",
      "bo-one",
      "meowzit",
    ]);
    expect(all.find((c) => c.code === "bo-one")?.createdByName).toBe("Bo");
    expect(all.find((c) => c.code === "meowzit")?.createdByName).toBeNull();
  });
});

describe("revokeInviteCode, scoped to a creator", () => {
  const h = useTestDb();

  it("revokes a member's own code and refuses someone else's", async () => {
    const ada = await makeUser(h.db());
    const bo = await makeUser(h.db());
    await mint("ada-one", ada.id);
    await mint("bo-one", bo.id);

    expect(
      await revokeInviteCode({
        code: "bo-one",
        actorUserId: ada.id,
        createdByUserId: ada.id,
      }),
    ).toBe(false);
    expect(
      await revokeInviteCode({
        code: "ada-one",
        actorUserId: ada.id,
        createdByUserId: ada.id,
      }),
    ).toBe(true);

    const rows = await h
      .db()
      .select({
        code: schema.inviteCodes.code,
        revokedAt: schema.inviteCodes.revokedAt,
      })
      .from(schema.inviteCodes);
    expect(rows.find((r) => r.code === "ada-one")?.revokedAt).toBeInstanceOf(
      Date,
    );
    expect(rows.find((r) => r.code === "bo-one")?.revokedAt).toBeNull();

    const audits = await h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "invite.revoked"));
    expect(audits.map((a) => a.target)).toEqual(["ada-one"]);
  });

  it("lets an unscoped (captain) revoke reach the root code", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });
    await mint("meowzit", null);
    expect(
      await revokeInviteCode({ code: "meowzit", actorUserId: captain.id }),
    ).toBe(true);
    expect(
      await revokeInviteCode({ code: "meowzit", actorUserId: captain.id }),
    ).toBe(false);
  });
});
