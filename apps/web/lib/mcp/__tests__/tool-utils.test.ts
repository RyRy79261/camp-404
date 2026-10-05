import { beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";

// The connector's log (mcp_audit_log) records every call. A failed query's
// message carries the query's values, so the log keeps only the error's class
// and Postgres code; our own refusals (ToolError) keep their sentence.

vi.mock("@camp404/db/mcp", () => ({
  getMcpScopeRows: vi.fn(),
  appendMcpAuditLog: vi.fn(),
}));

import { appendMcpAuditLog, getMcpScopeRows } from "@camp404/db/mcp";
import { runTool, ToolError, type ToolExtra } from "@/lib/mcp/tool-utils";

const USER_ID = "00000000-0000-0000-0000-0000000000aa";
const PHONE = "+27 82 555 0199";
const extra = {
  authInfo: {
    token: "t",
    clientId: "client-1",
    scopes: [],
    extra: { campUserId: USER_ID },
  },
} as unknown as ToolExtra;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMcpScopeRows).mockResolvedValue({
    user: { id: USER_ID, rank: "member" },
    teamMemberships: [],
    driverIntent: false,
  });
});

function fail(err: unknown) {
  return runTool({
    toolName: "update_my_emergency_contacts",
    extra,
    argsForAudit: { count: 1 },
    handler: async () => {
      throw err;
    },
  });
}

function loggedError(): string | null | undefined {
  expect(appendMcpAuditLog).toHaveBeenCalledOnce();
  return vi.mocked(appendMcpAuditLog).mock.calls[0]![0].errorMessage;
}

describe("runTool's log of a failure", () => {
  it("keeps no query values from a failed query, only its class and code", async () => {
    const pgError = Object.assign(new Error("duplicate key"), {
      code: "23505",
    });
    const result = await fail(
      new DrizzleQueryError(
        'update "users" set "emergency_contacts" = $1',
        [JSON.stringify([{ name: "Ada", phone: PHONE }])],
        pgError,
      ),
    );
    expect(result.isError).toBe(true);
    const logged = loggedError();
    expect(logged).toBe("DrizzleQueryError (23505)");
    expect(logged).not.toContain(PHONE);
  });

  it("keeps no message from any other error", async () => {
    await fail(new Error(`could not save ${PHONE}`));
    expect(loggedError()).toBe("Error");
  });

  it("keeps our own refusal's sentence", async () => {
    await fail(new ToolError("Only a captain can do this."));
    expect(loggedError()).toBe("Only a captain can do this.");
  });
});
