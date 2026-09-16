import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { getMcpScopeRows, isActiveMcpUser } from "../mcp";

// An MCP token outlives the moment it was authorized. Every tool call and
// every refresh re-checks that its user is still a real, approved member.

describe("MCP access follows camp membership", () => {
  const h = useTestDb();

  it("serves an approved member", async () => {
    const db = h.db();
    const member = await makeUser(db, { approvalStatus: "approved" });
    expect((await getMcpScopeRows(member.id))?.user.id).toBe(member.id);
    expect(await isActiveMcpUser(db, member.id)).toBe(true);
  });

  it("stops serving a member who is pending, rejected, erased or a system actor", async () => {
    const db = h.db();
    const users = [
      await makeUser(db, { approvalStatus: "pending" }),
      await makeUser(db, { approvalStatus: "rejected" }),
      await makeUser(db, { sanitised: true }),
      await makeUser(db, { isSystem: true }),
    ];
    for (const user of users) {
      expect(await getMcpScopeRows(user.id)).toBeNull();
      expect(await isActiveMcpUser(db, user.id)).toBe(false);
    }
  });
});
