import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Lifts over MCP: the driver list is a captain's, a driver manages their own
// car, a captain any car, and a refusal comes back in words.

const CAPTAIN = "00000000-0000-4000-8000-0000000000aa";
const DRIVER = "00000000-0000-4000-8000-0000000000bb";
const MEMBER = "00000000-0000-4000-8000-0000000000cc";
const RIDER = "00000000-0000-4000-8000-0000000000dd";

const callers: Record<string, { rank: "captain" | "member"; driver: boolean }> =
  {
    [CAPTAIN]: { rank: "captain", driver: false },
    [DRIVER]: { rank: "member", driver: true },
    [MEMBER]: { rank: "member", driver: false },
  };

vi.mock("@camp404/db/mcp", () => ({
  getMcpScopeRows: vi.fn(async (id: string) => ({
    user: { id, rank: callers[id]!.rank, aiDataConsent: false },
    teamMemberships: [],
    driverIntent: callers[id]!.driver,
  })),
  appendMcpAuditLog: vi.fn(async () => {}),
}));
vi.mock("@camp404/db/cars", () => ({
  listDrivers: vi.fn(async () => []),
  listCarRiders: vi.fn(async () => []),
  addCarRider: vi.fn(async () => ({ ok: true })),
  removeCarRider: vi.fn(async () => true),
}));

import {
  addCarRider,
  listCarRiders,
  listDrivers,
  removeCarRider,
} from "@camp404/db/cars";
import { registerLiftTools } from "../tools/lifts";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerLiftTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown, as: string) {
  const result = await tools.get(name)!(args, {
    authInfo: { clientId: "test", extra: { campUserId: as } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError ? { error: text } : { data: JSON.parse(text) };
}

beforeEach(() => vi.clearAllMocks());

describe("lift tools", () => {
  it("keeps the driver list for captains", async () => {
    expect(await call("list_drivers", {}, DRIVER)).toEqual({
      error: "Only a captain can see the drivers.",
    });
    await call("list_drivers", {}, CAPTAIN);
    expect(listDrivers).toHaveBeenCalledTimes(1);
  });

  it("lets a driver fill their own car, as the actor", async () => {
    await call("add_car_rider", { memberUserId: RIDER }, DRIVER);
    expect(addCarRider).toHaveBeenCalledWith({
      driverUserId: DRIVER,
      memberUserId: RIDER,
      actorId: DRIVER,
    });
    expect(listCarRiders).toHaveBeenCalledWith(DRIVER);
  });

  it("refuses a driver on someone else's car, and a member with no car", async () => {
    expect(
      await call(
        "add_car_rider",
        { memberUserId: RIDER, driverUserId: CAPTAIN },
        DRIVER,
      ),
    ).toEqual({ error: "Only a captain can manage someone else's car." });
    expect(await call("list_car_riders", {}, MEMBER)).toEqual({
      error: "You aren't driving this year.",
    });
    expect(addCarRider).not.toHaveBeenCalled();
  });

  it("lets a captain change any car, and words a refusal", async () => {
    vi.mocked(addCarRider).mockResolvedValueOnce({
      ok: false,
      reason: "car_full",
    });
    expect(
      await call(
        "add_car_rider",
        { memberUserId: RIDER, driverUserId: DRIVER },
        CAPTAIN,
      ),
    ).toEqual({ error: "That car is full: every seat offered is taken." });
    vi.mocked(removeCarRider).mockResolvedValueOnce(false);
    expect(
      await call(
        "remove_car_rider",
        { memberUserId: RIDER, driverUserId: DRIVER },
        CAPTAIN,
      ),
    ).toEqual({ error: "They aren't in that car." });
  });
});
