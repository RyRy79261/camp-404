import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { createHttpDb } from "../index";
import { eq } from "drizzle-orm";
import { appendMcpAuditLog, getMcpScopeRows, isActiveMcpUser } from "../mcp";
import { sanitiseAccount } from "../account";
import * as schema from "../schema";

// An MCP token outlives the moment it was authorized. Every tool call and
// every refresh re-checks that its user is still a real, approved member.

describe("MCP access follows camp membership", () => {
  const h = useTestDb();

  it("serves an approved member", async () => {
    const db = h.db();
    const member = await makeUser(db, { approvalStatus: "approved" });
    expect((await getMcpScopeRows(member.id))?.user.id).toBe(member.id);
    // The app handle, which the harness routes to the test database.
    expect(await isActiveMcpUser(createHttpDb(), member.id)).toBe(true);
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
      expect(await isActiveMcpUser(createHttpDb(), user.id)).toBe(false);
    }
  });
});

describe("the connector's log after an erasure", () => {
  const h = useTestDb();

  it("writes a member's call, and nothing once they are erased", async () => {
    const db = h.db();
    const member = await makeUser(db, { approvalStatus: "approved" });
    const call = () =>
      appendMcpAuditLog({
        campUserId: member.id,
        clientId: "client-1",
        tool: "update_my_history",
        argsJson: { fields: ["skills"] },
        outcome: "error",
        errorMessage: "Only a captain can do this.",
        durationMs: 5,
      });
    const rows = () =>
      db
        .select()
        .from(schema.mcpAuditLog)
        .where(eq(schema.mcpAuditLog.userId, member.id));

    await call();
    expect(await rows()).toEqual([
      expect.objectContaining({
        tool: "update_my_history",
        argsJson: { fields: ["skills"] },
        outcome: "error",
        errorMessage: "Only a captain can do this.",
        durationMs: 5,
        clientId: "client-1",
      }),
    ]);

    expect((await sanitiseAccount(member.id)).ok).toBe(true);
    // A call still running when the erasure committed writes nothing back.
    await call();
    const after = await rows();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ argsJson: null, errorMessage: null });
  });
});
