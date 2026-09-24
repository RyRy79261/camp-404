import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { FOUNDER_CODE } from "@camp404/core";
import * as schema from "../schema";
import { useTestDb } from "./_harness";

// The root code is single use (owner, 2026-09-24). The harness applies the
// migration to an empty database, so these tests store the codes first and run
// the migration's own SQL again, twice, as a redeploy would.

const MIGRATION_SQL = readFileSync(
  new URL("../../migrations/0060_founder_code_single_use.sql", import.meta.url),
  "utf8",
);

describe("0060_founder_code_single_use", () => {
  const h = useTestDb();

  async function maxUses(code: string) {
    const [row] = await h
      .db()
      .select({ maxUses: schema.inviteCodes.maxUses })
      .from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.code, code));
    return row?.maxUses;
  }

  it("caps the stored root code at one use, and touches no other code", async () => {
    await h
      .db()
      .insert(schema.inviteCodes)
      .values([
        { code: FOUNDER_CODE, maxUses: 100, useCount: 1 },
        { code: "other-code", maxUses: 100 },
        { code: "uncapped", maxUses: null },
      ]);

    await h.client().exec(MIGRATION_SQL);
    await h.client().exec(MIGRATION_SQL);

    expect(await maxUses(FOUNDER_CODE)).toBe(1);
    expect(await maxUses("other-code")).toBe(100);
    expect(await maxUses("uncapped")).toBeNull();
  });

  it("caps a root code stored with no cap at all", async () => {
    await h
      .db()
      .insert(schema.inviteCodes)
      .values({ code: FOUNDER_CODE, maxUses: null });

    await h.client().exec(MIGRATION_SQL);

    expect(await maxUses(FOUNDER_CODE)).toBe(1);
  });

  it("runs cleanly on a camp with no root code", async () => {
    await h.client().exec(MIGRATION_SQL);
    expect(await maxUses(FOUNDER_CODE)).toBeUndefined();
  });
});
