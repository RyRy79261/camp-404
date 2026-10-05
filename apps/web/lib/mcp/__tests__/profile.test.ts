import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The self-profile tools over MCP. ID numbers never pass through them (owner,
// 2026-10-05): the burner profile refuses one before reading or writing
// anything, and there is no tool to read or change ID documents. The burner
// profile's save itself is tested on real rows in site-parity.test.ts.
//
// Mocked at the module boundary: only the Neon handle and the mcp_* DB helpers
// (scope lookup + audit log).

vi.mock("@camp404/db", () => ({
  createHttpDb: vi.fn(),
  // The driver profile's save runs in one transaction on the same fake.
  withTransaction: vi.fn(),
}));
vi.mock("@camp404/db/activations", () => ({
  satisfyRequiredAction: vi.fn(),
}));
vi.mock("@camp404/db/mcp", () => ({
  getMcpScopeRows: vi.fn(),
  appendMcpAuditLog: vi.fn(),
  findActiveAccessToken: vi.fn(),
  touchAccessToken: vi.fn(),
}));

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createHttpDb } from "@camp404/db";
import { getMcpScopeRows } from "@camp404/db/mcp";
import { registerProfileTools } from "@/lib/mcp/tools/profile";
import type { ToolExtra } from "@/lib/mcp/tool-utils";

const USER_ID = "00000000-0000-0000-0000-0000000000aa";

// --- harness --------------------------------------------------------------

type ToolShape = Record<string, z.ZodTypeAny>;
type ToolHandler = (args: never, extra: ToolExtra) => Promise<CallToolResult>;

const tools = new Map<string, { shape: ToolShape; handler: ToolHandler }>();

/** Columns `get_my_id_documents` selects, as the fake db returns them. */
let idColumns: {
  passport: string | null;
  saId: string | null;
  eft: string | null;
} | null = null;

/** Every patch object handed to `db.update(...).set(...)`. */
let patches: Record<string, unknown>[] = [];

const dbUpdate = vi.fn(() => ({
  set: (patch: Record<string, unknown>) => {
    patches.push(patch);
    return { where: async () => undefined };
  },
}));

/** Every row handed to `db.insert(...).values(...)` (the upsert tools). */
let inserts: Record<string, unknown>[] = [];

const dbInsert = vi.fn(() => ({
  values: (row: Record<string, unknown>) => {
    inserts.push(row);
    return { onConflictDoUpdate: () => ({ returning: async () => [row] }) };
  },
}));

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: async () => (idColumns ? [idColumns] : []) }),
    }),
  }),
  update: dbUpdate,
  insert: dbInsert,
};

/**
 * Invoke a registered handler the way the MCP SDK would: args parsed through
 * the tool's own declared input shape (so a rejected arg fails here rather
 * than sliding into the handler), plus the `extra` carrying the bearer
 * token's camp user binding.
 */
async function call(
  tool: string,
  args: Record<string, unknown> = {},
): Promise<CallToolResult> {
  const registered = tools.get(tool);
  if (!registered) throw new Error(`${tool} was never registered`);
  const parsed = z.object(registered.shape).parse(args);
  return registered.handler(
    parsed as never,
    {
      authInfo: {
        token: "t",
        clientId: "client-1",
        scopes: [],
        extra: { campUserId: USER_ID },
      },
    } as unknown as ToolExtra,
  );
}

/** The tool's single text content block — every profile tool returns one. */
function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (!block || block.type !== "text") {
    throw new Error(`expected a text content block, got ${block?.type}`);
  }
  return block.text;
}

function errorText(result: CallToolResult): string {
  expect(result.isError).toBe(true);
  return textOf(result);
}

beforeEach(() => {
  vi.clearAllMocks();
  tools.clear();
  patches = [];
  inserts = [];
  idColumns = null;
  registerProfileTools({
    registerTool: (
      name: string,
      config: { inputSchema?: ToolShape },
      handler: ToolHandler,
    ) => {
      tools.set(name, { shape: config.inputSchema ?? {}, handler });
    },
  } as unknown as McpServer);
  vi.mocked(createHttpDb).mockReturnValue(fakeDb as never);
  vi.mocked(getMcpScopeRows).mockResolvedValue({
    user: { id: USER_ID, rank: "member" },
    teamMemberships: [],
    driverIntent: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- ID numbers never pass through ---------------------------------------

describe("ID numbers and the burner profile", () => {
  it("refuses an ID number, valid or not, and writes nothing", async () => {
    for (const number of ["8001015009087", "12345"]) {
      const result = await call("update_my_burner_profile", {
        responses: { "id.type": "sa_id", "id.number": number },
      });
      expect(errorText(result)).toMatch(
        /^ID numbers aren't taken through Claude\. .*\/tools\/forms\/burner_profile$/,
      );
    }
    expect(dbInsert).not.toHaveBeenCalled();
    expect(dbUpdate).not.toHaveBeenCalled();
  });

  it("has no tool to read or change ID documents", () => {
    expect(tools.has("get_my_id_documents")).toBe(false);
    expect(tools.has("update_my_id_documents")).toBe(false);
  });
});
