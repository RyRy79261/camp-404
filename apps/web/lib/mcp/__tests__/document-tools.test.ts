import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Document authoring over MCP: a captain writes any document, a team lead only
// their team's, a member none; drafts stay out of the member reads.

const CAPTAIN = "00000000-0000-4000-8000-0000000000aa";
const LEAD = "00000000-0000-4000-8000-0000000000bb";
const MEMBER = "00000000-0000-4000-8000-0000000000cc";

const callers: Record<string, { rank: "captain" | "member"; leads: string[] }> =
  {
    [CAPTAIN]: { rank: "captain", leads: [] },
    [LEAD]: { rank: "member", leads: ["kitchen"] },
    [MEMBER]: { rank: "member", leads: [] },
  };

vi.mock("@camp404/db/mcp", () => ({
  getMcpScopeRows: vi.fn(async (id: string) => ({
    user: { id, rank: callers[id]!.rank, aiDataConsent: false },
    teamMemberships: callers[id]!.leads.map((team) => ({ team, isLead: true })),
    driverIntent: false,
  })),
  appendMcpAuditLog: vi.fn(async () => {}),
}));
vi.mock("@camp404/db/documents", () => ({
  createDocument: vi.fn(async (input: { slug: string }) => ({
    ok: true,
    document: { slug: input.slug, version: 1 },
  })),
  getDocumentBySlug: vi.fn(async () => null),
  listDocumentDrafts: vi.fn(async () => []),
  setDocumentPublished: vi.fn(
    async (input: { slug: string; published: boolean }) => ({
      slug: input.slug,
      published: input.published,
      version: 2,
    }),
  ),
  updateDocument: vi.fn(async () => ({ ok: true, document: { version: 2 } })),
}));

import {
  createDocument,
  getDocumentBySlug,
  listDocumentDrafts,
  updateDocument,
} from "@camp404/db/documents";
import { registerDocumentTools } from "../tools/documents";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerDocumentTools({
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

const kitchenDoc = {
  slug: "kitchen-safety",
  team: "kitchen",
  version: 1,
  published: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDocumentBySlug).mockResolvedValue(null);
});

describe("document authoring tools", () => {
  it("lets a lead start a document for their team, with a slug from the title", async () => {
    const result = await call(
      "create_document",
      {
        title: "Kitchen Safety!",
        category: "manual",
        team: "kitchen",
        markdown: "# Gas",
      },
      LEAD,
    );
    expect(result.data).toEqual({ slug: "kitchen-safety", version: 1 });
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "kitchen-safety",
        team: "kitchen",
        authorId: LEAD,
      }),
    );
  });

  it("keeps a document with no team, or another team's, for those allowed", async () => {
    expect(
      await call(
        "create_document",
        { title: "Camp rules", category: "rules", markdown: "" },
        LEAD,
      ),
    ).toEqual({
      error: "A document with no team is a captain's. Name a team you lead.",
    });
    expect(
      await call(
        "create_document",
        {
          title: "Build",
          category: "manual",
          team: "structures",
          markdown: "",
        },
        LEAD,
      ),
    ).toEqual({ error: "You don't lead that team this year." });
    expect(
      (
        await call(
          "create_document",
          { title: "Camp rules", category: "rules", markdown: "" },
          CAPTAIN,
        )
      ).data,
    ).toMatchObject({ slug: "camp-rules" });
  });

  it("says a taken slug in words", async () => {
    vi.mocked(createDocument).mockResolvedValueOnce({
      ok: false,
      reason: "slug_taken",
    });
    expect(
      await call(
        "create_document",
        { title: "Rules", category: "rules", markdown: "" },
        CAPTAIN,
      ),
    ).toEqual({ error: 'The slug "rules" is taken. Pick another.' });
  });

  it("refuses a member everywhere, and a lead on another team's document", async () => {
    expect(await call("list_document_drafts", {}, MEMBER)).toEqual({
      error: "Only a captain or a team lead can see drafts.",
    });
    vi.mocked(getDocumentBySlug).mockResolvedValue({
      ...kitchenDoc,
      team: "structures",
    } as never);
    expect(
      await call(
        "update_document",
        { slug: "kitchen-safety", expectedVersion: 1, markdown: "x" },
        LEAD,
      ),
    ).toEqual({
      error:
        "Only a captain or the lead of this document's team can change it.",
    });
    expect(updateDocument).not.toHaveBeenCalled();
  });

  it("scopes a lead's draft list to their teams and their own", async () => {
    await call("list_document_drafts", {}, LEAD);
    expect(listDocumentDrafts).toHaveBeenLastCalledWith({
      teams: ["kitchen"],
      authorId: LEAD,
    });
    await call("list_document_drafts", {}, CAPTAIN);
    expect(listDocumentDrafts).toHaveBeenLastCalledWith();
  });

  it("edits on the version read, and says so when it went stale", async () => {
    vi.mocked(getDocumentBySlug).mockResolvedValue(kitchenDoc as never);
    vi.mocked(updateDocument).mockResolvedValueOnce({
      ok: false,
      reason: "stale",
    });
    expect(
      await call(
        "update_document",
        { slug: "kitchen-safety", expectedVersion: 1, markdown: "x" },
        LEAD,
      ),
    ).toEqual({
      error: "Someone saved this document since you read it. Read it again.",
    });
    expect(
      await call(
        "update_document",
        { slug: "kitchen-safety", expectedVersion: 1 },
        LEAD,
      ),
    ).toEqual({ error: "Say at least one field to change." });
  });

  it("publishes for the team's lead", async () => {
    vi.mocked(getDocumentBySlug).mockResolvedValue(kitchenDoc as never);
    expect(
      (
        await call(
          "publish_document",
          { slug: "kitchen-safety", published: true },
          LEAD,
        )
      ).data,
    ).toEqual({ slug: "kitchen-safety", published: true, version: 2 });
  });
});
