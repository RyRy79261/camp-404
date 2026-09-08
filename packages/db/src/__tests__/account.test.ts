import { describe, expect, it } from "vitest";
import { sanitisedUserPatch } from "../account";

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
