import { readFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  consumeInviteCode,
  createInviteCode,
  findInviteCodeByCode,
  findUsableInviteCode,
} from "../invite-codes";
import * as schema from "../schema";

// Invite codes have one spelling: lowercase. A phone keyboard capitalises the
// first letter of a field, and redemption used to match the typed code
// verbatim, so "Meowzit" failed where "meowzit" worked.

describe("invite codes are case-insensitive", () => {
  const h = useTestDb();

  it("stores a new code in lowercase and finds it however it is typed", async () => {
    const row = await createInviteCode({
      code: " Berlin-Crew ",
      createdByUserId: null,
    });
    expect(row.code).toBe("berlin-crew");
    expect((await findInviteCodeByCode("BERLIN-CREW"))?.code).toBe(
      "berlin-crew",
    );
    expect((await findUsableInviteCode("Berlin-Crew"))?.code).toBe(
      "berlin-crew",
    );
    expect((await consumeInviteCode("  berlin-CREW"))?.useCount).toBe(1);
  });

  it("migration 0023 lowercases old codes, and the members who used them", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    // Rows written before codes were normalised, straight to the table.
    await db.insert(schema.inviteCodes).values([
      { code: "BERLIN24", createdByUserId: captain.id },
      // A capitalised code whose lowercase twin already exists stays put.
      { code: "Twin", createdByUserId: captain.id },
      { code: "twin", createdByUserId: captain.id },
    ]);
    const berliner = await makeUser(db, { inviteCode: "BERLIN24" });
    const twinUser = await makeUser(db, { inviteCode: "Twin" });
    const envUser = await makeUser(db, { inviteCode: "TEST-INVITE" });

    const migration = readFileSync(
      new URL(
        "../../migrations/0023_lowercase_invite_codes.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      await db.execute(sql.raw(statement));
    }

    const codes = (await db.select().from(schema.inviteCodes))
      .map((c) => c.code)
      .sort();
    expect(codes).toEqual(["Twin", "berlin24", "twin"]);

    const codeOf = async (id: string) =>
      (
        await db
          .select({ code: schema.users.inviteCode })
          .from(schema.users)
          .where(eq(schema.users.id, id))
      )[0]!.code;
    expect(await codeOf(berliner.id)).toBe("berlin24");
    // Its code still exists as spelled, so the member's record is not moved.
    expect(await codeOf(twinUser.id)).toBe("Twin");
    // An env-list code has no row; the member's record is lowercased.
    expect(await codeOf(envUser.id)).toBe("test-invite");
  });
});

describe("the root code", () => {
  useTestDb();

  it("lets exactly one person in, whatever cap its row still carries", async () => {
    // Setup used to mint it with 100 uses; the owner made it single-use.
    await createInviteCode({
      code: "meowzit",
      createdByUserId: null,
      maxUses: 100,
    });
    expect((await findUsableInviteCode("meowzit"))?.code).toBe("meowzit");
    expect((await consumeInviteCode("meowzit"))?.useCount).toBe(1);
    expect(await findUsableInviteCode("Meowzit")).toBeNull();
    expect(await consumeInviteCode("meowzit")).toBeNull();
  });

  it("leaves any other code's cap alone", async () => {
    await createInviteCode({
      code: "berlin-crew",
      createdByUserId: null,
      maxUses: 3,
    });
    await consumeInviteCode("berlin-crew");
    expect((await consumeInviteCode("berlin-crew"))?.useCount).toBe(2);
  });
});
