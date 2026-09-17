import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { BuilderQuestionnaire, Questionnaire } from "@camp404/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Drafting questionnaires over MCP: authors only, the builder's own edit rule
// and size limits, the stored version kept, and the publish problems returned
// so the author can fix them before a captain publishes in the app.

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
vi.mock("@camp404/db/questionnaire-definitions", () => ({
  getDefinitionMetaRow: vi.fn(async () => null),
}));
vi.mock("@/lib/questionnaire-authoring", () => ({
  canEditQuestionnaire: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/questionnaire-definitions", () => ({
  createDraft: vi.fn(async () => "gear-check"),
  getBuilderDefinition: vi.fn(async () => null),
  listDefinitionsForViewer: vi.fn(async () => []),
  updateDefinition: vi.fn(async () => {}),
}));

import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { canEditQuestionnaire } from "@/lib/questionnaire-authoring";
import {
  createDraft,
  getBuilderDefinition,
  listDefinitionsForViewer,
  updateDefinition,
} from "@/lib/questionnaire-definitions";
import { registerQuestionnaireTools } from "../tools/questionnaires";

type Handler = (args: unknown, extra: unknown) => Promise<CallToolResult>;
const tools = new Map<string, Handler>();
registerQuestionnaireTools({
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

// The builder's older shape — still accepted, converted and stored unified.
const BUILDER_DEFINITION: BuilderQuestionnaire = {
  version: "model-made-up",
  title: "Ignored title",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "Gear",
      blocks: [
        {
          id: "q1",
          kind: "question",
          question: {
            id: "q1",
            kind: "short_text",
            prompt: "What tent do you bring?",
            required: true,
          },
        },
      ],
    },
  ],
} as unknown as BuilderQuestionnaire;

// The unified questionnaire model the tools take and return.
const DEFINITION: Questionnaire = {
  version: "model-made-up",
  title: "Ignored title",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "Gear",
      questions: [
        {
          id: "q1",
          kind: "short_text",
          prompt: "What tent do you bring?",
          maxLength: 120,
          required: true,
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBuilderDefinition).mockResolvedValue(null);
  vi.mocked(canEditQuestionnaire).mockResolvedValue({ ok: true });
});

describe("questionnaire drafting tools", () => {
  it("refuses a member who is not an author", async () => {
    expect(
      await call("create_questionnaire_draft", { title: "Gear" }, MEMBER),
    ).toEqual({
      error: "Only a captain or a team lead can draft questionnaires.",
    });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("lists what the hub shows the author", async () => {
    await call("list_questionnaire_drafts", {}, LEAD);
    expect(listDefinitionsForViewer).toHaveBeenCalledWith({
      userId: LEAD,
      rank: "team_lead",
    });
  });

  it("creates a draft from a definition, keeping the title asked for and the stored version", async () => {
    vi.mocked(getBuilderDefinition)
      .mockResolvedValueOnce({
        version: "1",
        title: "Gear",
        pages: [],
      } as never)
      .mockImplementationOnce(
        async () => vi.mocked(updateDefinition).mock.calls[0]![1] as never,
      );
    const { data } = await call(
      "create_questionnaire_draft",
      { title: "Gear check", definition: DEFINITION },
      LEAD,
    );
    expect(createDraft).toHaveBeenCalledWith({
      title: "Gear check",
      createdBy: LEAD,
    });
    const saved = vi.mocked(updateDefinition).mock.calls[0]![1];
    expect(saved).toMatchObject({ title: "Gear check", version: "1" });
    expect(data).toMatchObject({
      key: "gear-check",
      builderPath: "/captains/questionnaires/gear-check",
    });
    expect(data.publishProblems).toEqual([]);
    expect(data.title).toBe("Gear check");
  });

  it("accepts a builder-shaped definition, stores it unified, and returns located publish problems", async () => {
    vi.mocked(getBuilderDefinition)
      .mockResolvedValueOnce({ version: "1", title: "Gear", pages: [] } as never)
      .mockImplementationOnce(
        async () => vi.mocked(updateDefinition).mock.calls[0]![1] as never,
      );
    const untitledPage = {
      ...BUILDER_DEFINITION,
      pages: [{ ...BUILDER_DEFINITION.pages[0]!, title: "" }],
    };
    const { data } = await call(
      "create_questionnaire_draft",
      { title: "Gear check", definition: untitledPage },
      CAPTAIN,
    );
    const saved = vi.mocked(updateDefinition).mock.calls[0]![1];
    expect(saved.pages[0]).toMatchObject({
      kind: "questions",
      pageType: "question",
      questions: [{ id: "q1", kind: "short_text" }],
    });
    expect(data.publishProblems).toEqual([
      {
        path: "pages[0].title",
        code: "missing_page_title",
        message: "Page 1 needs a title.",
        pageId: "p1",
      },
    ]);
  });

  it("refuses a definition over the size limits before creating anything", async () => {
    expect(
      await call(
        "create_questionnaire_draft",
        {
          title: "Gear check",
          definition: {
            ...DEFINITION,
            pages: [
              {
                ...DEFINITION.pages[0]!,
                subtitle: "x".repeat(6_000),
              },
            ],
          },
        },
        CAPTAIN,
      ),
    ).toEqual({
      error:
        "One piece of text is longer than 5000 characters. Shorten it or split it up.",
    });
    expect(createDraft).not.toHaveBeenCalled();
  });

  it("returns the working definition in the unified model", async () => {
    vi.mocked(getDefinitionMetaRow).mockResolvedValueOnce({
      key: "gear-check",
      status: "draft",
      version: null,
      createdBy: CAPTAIN,
    } as never);
    vi.mocked(getBuilderDefinition).mockResolvedValueOnce(DEFINITION);
    const { data } = await call(
      "get_questionnaire_draft",
      { key: "gear-check" },
      CAPTAIN,
    );
    expect(data).toMatchObject({
      key: "gear-check",
      status: "draft",
      canEdit: true,
      definition: DEFINITION,
      publishProblems: [],
    });
  });

  it("saves an update over the head in the unified model, keeping its version", async () => {
    vi.mocked(getBuilderDefinition).mockResolvedValueOnce({
      ...DEFINITION,
      version: "7",
    });
    await call(
      "update_questionnaire_draft",
      { key: "gear-check", definition: BUILDER_DEFINITION },
      CAPTAIN,
    );
    expect(updateDefinition).toHaveBeenCalledWith("gear-check", {
      ...DEFINITION,
      pages: [{ ...DEFINITION.pages[0]!, pageType: "question" }],
      version: "7",
    });
  });

  it("uses the builder's edit rule, and says someone else's questionnaire in its words", async () => {
    vi.mocked(canEditQuestionnaire).mockResolvedValueOnce({
      ok: false,
      error: "You can only edit your own questionnaires.",
    });
    expect(
      await call(
        "update_questionnaire_draft",
        { key: "gear-check", definition: DEFINITION },
        LEAD,
      ),
    ).toEqual({ error: "You can only edit your own questionnaires." });
    expect(canEditQuestionnaire).toHaveBeenCalledWith(
      { campUser: { id: LEAD }, rank: "team_lead" },
      "gear-check",
    );
    expect(updateDefinition).not.toHaveBeenCalled();
  });

  it("will not write over a questionnaire that is not a builder one", async () => {
    expect(
      await call(
        "update_questionnaire_draft",
        { key: "burner_profile", definition: DEFINITION },
        CAPTAIN,
      ),
    ).toEqual({ error: "No questionnaire with that key." });
    expect(updateDefinition).not.toHaveBeenCalled();
  });

  it("hides another author's draft from a lead as not found", async () => {
    vi.mocked(getDefinitionMetaRow).mockResolvedValueOnce({
      key: "secret",
      status: "draft",
      version: "1",
      createdBy: CAPTAIN,
    } as never);
    expect(
      await call("get_questionnaire_draft", { key: "secret" }, LEAD),
    ).toEqual({
      error: "No questionnaire with that key.",
    });
    expect(getBuilderDefinition).not.toHaveBeenCalled();
  });
});
