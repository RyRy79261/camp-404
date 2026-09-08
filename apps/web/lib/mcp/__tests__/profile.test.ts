import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `update_my_id_documents` is the highest-privilege write the MCP surface
// exposes: it is the only path that writes a member's government ID ciphertext
// on the member's own say-so, through an LLM. Two columns
// (passport_encrypted, sa_id_encrypted) hold ONE document — idColumnsFor
// enforces that on every other write path by nulling the column it did not
// pick. This tool used to gate each column on `args.X !== undefined` alone and
// never touch the sibling, so setting `{ saId }` on a member who already held a
// passport left BOTH columns populated. getIdDocuments then prefers passport
// unconditionally, forms.ts merges it back as `id.type: "passport"`, and the
// member's next ordinary profile save runs idColumnsFor("passport", …) →
// saIdEncrypted: null. The MCP-set SA ID is destroyed, silently, by an action
// the member does not connect to it. So the load-bearing assertions here are
// about the column the caller did NOT name.
//
// Mocked at the module boundary: only the Neon handle and the mcp_* DB helpers
// (scope lookup + audit log). Crypto is deliberately REAL — the empty-string
// and corrupt-ciphertext cases below are exactly the ones a hand-written
// decryptField stub would get wrong, and a real round-trip is what proves the
// patch carries the value the caller passed. Runs under the suite's default
// jsdom environment; node:crypto is available there.

vi.mock("@camp404/db", () => ({ createHttpDb: vi.fn() }));
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
import { appendMcpAuditLog, getMcpScopeRows } from "@camp404/db/mcp";
import { decrypt, encrypt } from "@camp404/db/crypto";
import { registerProfileTools } from "@/lib/mcp/tools/profile";
import type { ToolExtra } from "@/lib/mcp/tool-utils";

// Lazily read inside encrypt/decrypt, so setting it here (after the import
// graph is evaluated, before the first test runs) is enough.
process.env.PGCRYPTO_KEY = "test-pgcrypto-key-at-least-16-chars";

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

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({ limit: async () => (idColumns ? [idColumns] : []) }),
    }),
  }),
  update: dbUpdate,
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

function payload(result: CallToolResult): Record<string, unknown> {
  expect(result.isError).toBeFalsy();
  return JSON.parse(textOf(result));
}

function errorText(result: CallToolResult): string {
  expect(result.isError).toBe(true);
  return textOf(result);
}

/** The single patch the tool issued. Fails loudly if it wrote 0 or 2+. */
function onlyPatch(): Record<string, unknown> {
  expect(patches).toHaveLength(1);
  return patches[0]!;
}

beforeEach(() => {
  vi.clearAllMocks();
  tools.clear();
  patches = [];
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
    user: { id: USER_ID, rank: "member", aiDataConsent: false },
    teamMemberships: [],
    driverIntent: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- the write ------------------------------------------------------------

describe("update_my_id_documents holds the one-document invariant", () => {
  it("setting only saId clears the passport column in the same patch", async () => {
    // The member already holds a passport. The caller says nothing about it.
    idColumns = { passport: encrypt("P123456"), saId: null, eft: null };

    const result = await call("update_my_id_documents", {
      saId: "9001015800085",
    });
    expect(payload(result)).toEqual({ ok: true });

    const patch = onlyPatch();
    expect(decrypt(patch.saIdEncrypted as string)).toBe("9001015800085");
    // The defect: this used to be absent from the patch, leaving both columns
    // populated for idColumnsFor to silently resolve in passport's favour on
    // the member's next ordinary profile save.
    expect(patch.passportEncrypted).toBeNull();
  });

  it("setting only passport clears the SA ID column in the same patch", async () => {
    idColumns = { passport: null, saId: encrypt("9001015800085"), eft: null };

    await call("update_my_id_documents", { passport: "P123456" });

    const patch = onlyPatch();
    expect(decrypt(patch.passportEncrypted as string)).toBe("P123456");
    expect(patch.saIdEncrypted).toBeNull();
  });

  it("refuses both documents in one call and writes NOTHING", async () => {
    const result = await call("update_my_id_documents", {
      passport: "P123456",
      saId: "9001015800085",
    });

    expect(errorText(result)).toBe(
      "A member holds one ID document — pass either passport or saId, not both.",
    );
    // The point of the refusal: no UPDATE was ever built or issued, so neither
    // column moved. Asserting only on the error string would pass even if the
    // throw sat after the write.
    expect(dbUpdate).not.toHaveBeenCalled();
    expect(patches).toEqual([]);
  });

  it("an explicit null clears only the named column and leaves the sibling alone", async () => {
    // This is the distinction that makes undefined-vs-null load-bearing:
    // `{ passport: null }` means "clear my passport", NOT "I now hold an SA ID".
    idColumns = { passport: encrypt("P123456"), saId: null, eft: null };

    await call("update_my_id_documents", { passport: null });

    const patch = onlyPatch();
    expect(patch.passportEncrypted).toBeNull();
    expect(patch).not.toHaveProperty("saIdEncrypted");
  });

  it("leaves both ID columns untouched when only eft is cleared", async () => {
    await call("update_my_id_documents", { eft: null });

    const patch = onlyPatch();
    expect(patch.eftDetailsEncrypted).toBeNull();
    expect(patch).not.toHaveProperty("passportEncrypted");
    expect(patch).not.toHaveProperty("saIdEncrypted");
  });

  it("audit-logs the change as flags only — never the document numbers", async () => {
    await call("update_my_id_documents", { saId: "9001015800085" });

    expect(appendMcpAuditLog).toHaveBeenCalledTimes(1);
    const entry = vi.mocked(appendMcpAuditLog).mock.calls[0]![0];
    expect(entry.outcome).toBe("success");
    expect(entry.argsJson).toEqual({
      passport: "unchanged",
      saId: "set",
      eft: "unchanged",
    });
    expect(JSON.stringify(entry)).not.toContain("9001015800085");
  });

  it("audits an empty string as the clear it actually performs", async () => {
    // zod's `z.string().nullable().optional()` admits "", so a model can send
    // it. The write has always treated "" as falsy — i.e. a clear. The audit
    // label used to classify by `=== null` and recorded it as "set", so
    // mcp_audit_log said the opposite of what happened to the column. Both now
    // derive from one classifier, so they cannot disagree.
    idColumns = { passport: encrypt("P123456"), saId: null, eft: null };

    await call("update_my_id_documents", { passport: "" });

    expect(onlyPatch().passportEncrypted).toBeNull();
    const entry = vi.mocked(appendMcpAuditLog).mock.calls[0]![0];
    expect(entry.argsJson).toMatchObject({ passport: "cleared" });
  });

  it("an empty string does not count as a second document for the guard", async () => {
    // The both-documents guard reads as arity but branches on the classifier,
    // so `{ passport: "", saId: "X" }` is one set and one clear — a legal call,
    // not a refusal.
    await call("update_my_id_documents", { passport: "", saId: "9001015800085" });

    const patch = onlyPatch();
    expect(patch.saIdEncrypted).not.toBeNull();
    expect(patch.passportEncrypted).toBeNull();
  });
});

// --- the read -------------------------------------------------------------

describe("get_my_id_documents distinguishes absent from unreadable", () => {
  it("round-trips a readable document with no unreadable fields", async () => {
    idColumns = { passport: encrypt("P123456"), saId: null, eft: null };

    expect(payload(await call("get_my_id_documents"))).toEqual({
      passport: "P123456",
      saId: null,
      eft: null,
      unreadableFields: [],
    });
  });

  it("reports a ciphertext this key cannot read as unreadable, not absent", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // Stands in for a PGCRYPTO_KEY rotation: a non-empty column value that
    // AES-256-GCM refuses.
    idColumns = {
      passport: "bm90LWEtcmVhbC1jaXBoZXJ0ZXh0",
      saId: null,
      eft: null,
    };

    expect(payload(await call("get_my_id_documents"))).toEqual({
      passport: null,
      saId: null,
      eft: null,
      // Without this the LLM is handed a bare null and tells the member they
      // have no passport on file — and offers to "add" one over the top.
      unreadableFields: ["passport"],
    });
    expect(logged).toHaveBeenCalled();
  });

  it("lists every unreadable column, in field order", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    idColumns = { passport: "@@@", saId: "@@@", eft: "@@@" };

    expect(payload(await call("get_my_id_documents"))).toMatchObject({
      unreadableFields: ["passport", "saId", "eft"],
    });
  });

  it("nothing stored reads as absent — unreadableFields is empty", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    idColumns = { passport: null, saId: null, eft: null };

    expect(payload(await call("get_my_id_documents"))).toEqual({
      passport: null,
      saId: null,
      eft: null,
      unreadableFields: [],
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("a scrubbed empty-string column reads as absent, not unreadable", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // The falsy edge: decryptField short-circuits on `!stored`, so "" never
    // reaches decrypt(). An erased account must not present as a key problem.
    idColumns = { passport: "", saId: "", eft: "" };

    expect(payload(await call("get_my_id_documents"))).toEqual({
      passport: null,
      saId: null,
      eft: null,
      unreadableFields: [],
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("errors when the user row is gone rather than reporting empty documents", async () => {
    idColumns = null;

    expect(errorText(await call("get_my_id_documents"))).toBe(
      "User row not found.",
    );
  });
});
