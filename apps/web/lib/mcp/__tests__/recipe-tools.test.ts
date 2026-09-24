import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Suggesting a recipe over MCP goes through the app's own write, so the
// connector keeps every rule the form keeps (an approved member, text given).

const MEMBER = "00000000-0000-4000-8000-0000000000cc";

vi.mock("@camp404/db/mcp", () => ({
  getMcpScopeRows: vi.fn(async (id: string) => ({
    user: { id, rank: "member", aiDataConsent: false },
    teamMemberships: [],
    driverIntent: false,
  })),
  appendMcpAuditLog: vi.fn(async () => {}),
}));
vi.mock("@camp404/db", () => ({ createHttpDb: vi.fn() }));
vi.mock("@camp404/db/recipes", async (importOriginal) => ({
  // The real naming rule, so the answer shows the name the write stores.
  suggestionTitle: (
    await importOriginal<{
      suggestionTitle: (title: string | null, text: string) => string;
    }>()
  ).suggestionTitle,
  suggestRecipe: vi.fn(async () => ({ ok: true, id: "recipe-1" })),
  listRecipeBook: vi.fn(async () => [
    {
      id: "recipe-1",
      title: "Camp dhal",
      status: "accepted",
      version: 2,
      plates: 40,
      readyPlates: [40, 45, 60],
      versionCreatedAt: new Date("2026-09-24T08:00:00Z"),
    },
  ]),
}));

import { createHttpDb } from "@camp404/db";
import { suggestRecipe } from "@camp404/db/recipes";
import { registerRecipeTools } from "../tools/recipes";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerRecipeTools({
  registerTool: (name: string, _config: unknown, handler: Handler) => {
    tools.set(name, handler);
  },
} as unknown as McpServer);

async function call(name: string, args: unknown) {
  const result = await tools.get(name)!(args, {
    authInfo: { clientId: "test", extra: { campUserId: MEMBER } },
  });
  const text = (result.content[0] as { text: string }).text;
  return result.isError ? { error: text } : { data: JSON.parse(text) };
}

beforeEach(() => vi.clearAllMocks());

describe("submit_recipe", () => {
  it("suggests through the app's write, as the caller, never by a direct insert", async () => {
    expect(
      await call("submit_recipe", {
        title: "Camp dhal",
        text: "Lentils, onions, spices.",
        aiConsent: true,
      }),
    ).toEqual({
      data: { id: "recipe-1", title: "Camp dhal", status: "suggested" },
    });
    expect(suggestRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        submitterId: MEMBER,
        source: "text",
        text: "Lentils, onions, spices.",
        aiConsent: true,
      }),
    );
    expect(createHttpDb).not.toHaveBeenCalled();
  });

  it("passes the write's refusal back in words", async () => {
    vi.mocked(suggestRecipe).mockResolvedValueOnce({
      ok: false,
      error: "Only approved camp members can do that.",
    });
    expect(
      await call("submit_recipe", {
        title: "Camp dhal",
        text: "Lentils.",
      }),
    ).toEqual({ error: "Only approved camp members can do that." });
  });

  it("needs the text, takes the name from it when none is given, and keeps a link for reference", async () => {
    expect(
      await call("submit_recipe", {
        text: "Gai yang\nTofu, garlic, coriander root.",
        link: "https://www.noble-notations.com/recipes/gai-yang-isaan-oven",
      }),
    ).toEqual({
      data: { id: "recipe-1", title: "Gai yang", status: "suggested" },
    });
    expect(suggestRecipe).toHaveBeenCalledWith(
      expect.objectContaining({
        title: null,
        sourceUrl:
          "https://www.noble-notations.com/recipes/gai-yang-isaan-oven",
        aiConsent: false,
      }),
    );
  });

  it("refuses a link with no recipe, before any write", async () => {
    const result = await call("submit_recipe", {
      text: "https://www.noble-notations.com/recipes/gai-yang-isaan-oven",
    });
    expect(result).toHaveProperty("error");
    expect(suggestRecipe).not.toHaveBeenCalled();
  });
});

describe("list_recipes", () => {
  it("lists the book with the plates each recipe is written and ready for", async () => {
    const { data } = (await call("list_recipes", {})) as {
      data: { rows: unknown[]; truncated: boolean };
    };
    expect(data.truncated).toBe(false);
    expect(data.rows).toEqual([
      {
        id: "recipe-1",
        title: "Camp dhal",
        plates: 40,
        readyPlates: [40, 45, 60],
        version: 2,
      },
    ]);
  });
});
