import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as Documents from "@camp404/db/documents";

// The Survival Guide over MCP, on the guide editor's rules: the guide's real
// topics and the chapter / duty-card shapes, the writer rule (a captain any
// chapter, a team lead their teams'), drafts out of the member reads, and
// publishing only the version the writer read.

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
vi.mock("@camp404/db/documents", async (importOriginal) => {
  const actual = await importOriginal<typeof Documents>();
  return {
    // The writer rule is the real one, as the database applies it.
    chapterRefusal: actual.chapterRefusal,
    CHAPTER_EDITED: actual.CHAPTER_EDITED,
    NOT_A_CHAPTER_WRITER: actual.NOT_A_CHAPTER_WRITER,
    createGuideChapter: vi.fn(async (input: { slug: string }) => ({
      ok: true,
      document: { slug: input.slug, version: 1 },
    })),
    getDocumentBySlug: vi.fn(async () => null),
    getPublishedChapter: vi.fn(async () => null),
    listDocumentDrafts: vi.fn(async () => []),
    listPublishedChapters: vi.fn(async () => []),
    publishGuideChapter: vi.fn(async () => ({
      ok: true,
      version: 2,
      created: true,
    })),
    unpublishGuideChapter: vi.fn(async () => ({ ok: true })),
    saveGuideChapter: vi.fn(async () => ({
      ok: true,
      document: { version: 2 },
    })),
  };
});

import {
  CHAPTER_EDITED,
  NOT_A_CHAPTER_WRITER,
  createGuideChapter as createDocument,
  getDocumentBySlug,
  listDocumentDrafts,
  publishGuideChapter,
  saveGuideChapter as updateDocument,
} from "@camp404/db/documents";
import { registerDocumentTools } from "../tools/documents";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<
  string,
  { shape: z.ZodRawShape; handler: Handler; description: string }
>();
registerDocumentTools({
  registerTool: (
    name: string,
    config: { inputSchema?: z.ZodRawShape; description: string },
    handler: Handler,
  ) => {
    tools.set(name, {
      shape: config.inputSchema ?? {},
      handler,
      description: config.description,
    });
  },
} as unknown as McpServer);

/** Call a tool as the SDK would: its arguments parsed by its input schema. */
async function call(name: string, args: Record<string, unknown>, as: string) {
  const tool = tools.get(name)!;
  const parsed = z.object(tool.shape).safeParse(args);
  if (!parsed.success) return { invalid: parsed.error.issues[0]?.message };
  const result = await tool.handler(parsed.data, {
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

describe("starting a chapter", () => {
  it("lets a lead start a chapter in one of the guide's topics, with the address from the title", async () => {
    const result = await call(
      "create_document",
      {
        title: "Kitchen Safety!",
        category: "kitchen",
        team: "kitchen",
        markdown: "# Gas",
      },
      LEAD,
    );
    expect(result.data).toEqual({ slug: "kitchen-safety", version: 1 });
    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "kitchen-safety",
        kind: "chapter",
        category: "kitchen",
        team: "kitchen",
        card: null,
        actorId: LEAD,
      }),
    );
  });

  it("refuses a topic that isn't one of the guide's sections", async () => {
    const result = await call(
      "create_document",
      { title: "Rules", category: "manual", markdown: "x" },
      CAPTAIN,
    );
    expect(result).toEqual({ invalid: "Pick a topic." });
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("starts a duty card with an empty card, and checks a card's shape as the editor does", async () => {
    await call(
      "create_document",
      {
        kind: "duty_card",
        title: "Kitchen shift",
        category: "kitchen",
        team: "kitchen",
      },
      LEAD,
    );
    expect(createDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "duty_card",
        card: {
          subRoles: [],
          steps: [],
          hardRules: [],
          checklist: [],
          askRole: "",
        },
      }),
    );
    expect(
      await call(
        "create_document",
        {
          kind: "chapter",
          title: "Not a card",
          category: "kitchen",
          team: "kitchen",
          card: {
            subRoles: [],
            steps: [],
            hardRules: [],
            checklist: [],
            askRole: "",
          },
        },
        LEAD,
      ),
    ).toEqual({ error: "A duty card needs its card; a chapter has none." });
  });

  it("refuses a member before anything is written", async () => {
    expect(
      await call(
        "create_document",
        { title: "Rules", category: "on_site" },
        MEMBER,
      ),
    ).toEqual({
      error:
        "Only a team lead or a captain can do this. Leading any team this year counts.",
    });
    expect(await call("list_document_drafts", {}, MEMBER)).toMatchObject({
      error: expect.stringMatching(/team lead or a captain/),
    });
    expect(createDocument).not.toHaveBeenCalled();
    expect(listDocumentDrafts).not.toHaveBeenCalled();
  });
});

describe("editing", () => {
  it("refuses a lead on another team's chapter, in the database's words", async () => {
    vi.mocked(getDocumentBySlug).mockResolvedValue({
      ...kitchenDoc,
      team: "structures",
    } as never);
    expect(
      await call("get_document_draft", { slug: "kitchen-safety" }, LEAD),
    ).toEqual({ error: NOT_A_CHAPTER_WRITER });
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
    vi.mocked(updateDocument).mockResolvedValueOnce({
      ok: false,
      error: CHAPTER_EDITED,
    });
    expect(
      await call(
        "update_document",
        { slug: "kitchen-safety", expectedVersion: 1, markdown: "x" },
        LEAD,
      ),
    ).toEqual({ error: CHAPTER_EDITED });
    expect(
      await call(
        "update_document",
        { slug: "kitchen-safety", expectedVersion: 1 },
        LEAD,
      ),
    ).toEqual({ error: "Say at least one field to change." });
  });
});

describe("publishing", () => {
  it("publishes only the version the writer read", async () => {
    expect(
      (
        await call(
          "publish_document",
          { slug: "kitchen-safety", published: true, expectedVersion: 3 },
          LEAD,
        )
      ).data,
    ).toEqual({
      slug: "kitchen-safety",
      published: true,
      version: 2,
      newVersion: true,
    });
    expect(publishGuideChapter).toHaveBeenCalledWith({
      slug: "kitchen-safety",
      expectedVersion: 3,
      actorId: LEAD,
    });
  });

  it("refuses to publish without the version read, and reports a newer save", async () => {
    expect(
      await call(
        "publish_document",
        { slug: "kitchen-safety", published: true },
        LEAD,
      ),
    ).toMatchObject({ error: expect.stringMatching(/expectedVersion/) });
    expect(publishGuideChapter).not.toHaveBeenCalled();

    vi.mocked(publishGuideChapter).mockResolvedValueOnce({
      ok: false,
      error: CHAPTER_EDITED,
    });
    expect(
      await call(
        "publish_document",
        { slug: "kitchen-safety", published: true, expectedVersion: 1 },
        LEAD,
      ),
    ).toEqual({ error: CHAPTER_EDITED });
  });

  it("says what publishing does since the public site", () => {
    const { description } = tools.get("publish_document")!;
    expect(description).toContain("survival-guide.camp-404.com");
    expect(description).toMatch(/members only|:::members/);
  });
});
