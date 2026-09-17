// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

// The definitions facade is the one door between stored questionnaire JSON and
// the rest of the app. Every read hands back the unified model whichever shape
// the row was stored in (old rows are never rewritten), and every write stores
// the unified model. The SQL module is mocked; its round trips are covered by
// the PGlite suite in packages/db.

vi.mock("@camp404/db/questionnaire-definitions", () => ({
  RESERVED_DEFINITION_KEYS: new Set(["burner_profile"]),
  definitionKeyExists: vi.fn(async () => false),
  deleteDefinitionRow: vi.fn(),
  getDefinitionRowForClone: vi.fn(),
  getQuestionnaireDefinitionRow: vi.fn(),
  getQuestionnaireVersionRow: vi.fn(),
  insertDefinitionDraft: vi.fn(),
  listDefinitionRows: vi.fn(),
  updateDefinitionRow: vi.fn(),
}));
vi.mock("@camp404/db/questionnaire-lifecycle", () => ({
  listOpenSendBlocking: vi.fn(),
}));
vi.mock("../test-mode", () => ({ usesTestStore: vi.fn(() => false) }));

import {
  Questionnaire,
  flattenQuestions,
  type QuestionsPage,
} from "@camp404/types";
import { validateQuestionnaireDefinition } from "@camp404/core";
import {
  getDefinitionRowForClone,
  getQuestionnaireDefinitionRow,
  getQuestionnaireVersionRow,
  insertDefinitionDraft,
  listDefinitionRows,
  updateDefinitionRow,
} from "@camp404/db/questionnaire-definitions";
import {
  createDraft,
  duplicateDefinition,
  getBuilderDefinition,
  listDefinitionsForViewer,
  updateDefinition,
} from "../questionnaire-definitions";

/** A row as the builder stored it before the unified model. */
const BUILDER_ROW = {
  version: "1",
  title: "Transport",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "Driving",
      blocks: [
        {
          kind: "question",
          question: { id: "drives", kind: "boolean", prompt: "Driving?" },
        },
        {
          kind: "question",
          question: { id: "arrive", kind: "date", prompt: "Arriving" },
          visibleIf: { fieldId: "drives", op: "eq", value: true },
        },
      ],
    },
  ],
};

/** The same questionnaire as a save now stores it. */
const UNIFIED_ROW = {
  version: "1",
  title: "Transport",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "Driving",
      pageType: "question",
      questions: [
        { id: "drives", kind: "boolean", prompt: "Driving?", required: false },
        {
          id: "arrive",
          kind: "date",
          prompt: "Arriving",
          required: true,
          visibleIf: { fieldId: "drives", op: "eq", value: true },
        },
      ],
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getBuilderDefinition", () => {
  it("reads a builder-shaped head as the unified model", async () => {
    vi.mocked(getQuestionnaireDefinitionRow).mockResolvedValue({
      key: "transport",
      title: "Transport",
      definition: BUILDER_ROW,
      updatedAt: new Date(),
    });
    expect(await getBuilderDefinition("transport")).toEqual(UNIFIED_ROW);
  });

  it("reads the pinned version snapshot, in either shape", async () => {
    vi.mocked(getQuestionnaireVersionRow).mockResolvedValue({
      definitionKey: "transport",
      version: "transport-v1",
      definition: UNIFIED_ROW,
    });
    expect(await getBuilderDefinition("transport", "transport-v1")).toEqual(
      UNIFIED_ROW,
    );
    expect(getQuestionnaireVersionRow).toHaveBeenCalledWith(
      "transport",
      "transport-v1",
    );
    expect(getQuestionnaireDefinitionRow).not.toHaveBeenCalled();
  });

  it("is null for a missing or malformed row, and never reads a code questionnaire's key", async () => {
    vi.mocked(getQuestionnaireDefinitionRow).mockResolvedValueOnce(null);
    expect(await getBuilderDefinition("gone")).toBeNull();
    vi.mocked(getQuestionnaireDefinitionRow).mockResolvedValueOnce({
      key: "bad",
      title: "Bad",
      definition: { version: "1", pages: "nope" },
      updatedAt: new Date(),
    });
    expect(await getBuilderDefinition("bad")).toBeNull();

    vi.mocked(getQuestionnaireDefinitionRow).mockClear();
    expect(await getBuilderDefinition("burner_profile")).toBeNull();
    expect(getQuestionnaireDefinitionRow).not.toHaveBeenCalled();
  });
});

describe("writes store the unified model", () => {
  it("creates a blank draft whose one page takes the questionnaire's name", async () => {
    const key = await createDraft({ title: "  Gear check ", createdBy: "u1" });
    expect(key).toBe("gear-check");
    const inserted = vi.mocked(insertDefinitionDraft).mock.calls[0]![0];
    expect(inserted).toMatchObject({
      key: "gear-check",
      title: "Gear check",
      createdBy: "u1",
    });
    const definition = Questionnaire.parse(inserted.definition);
    expect(definition).toMatchObject({
      version: "1",
      title: "Gear check",
      pages: [
        { kind: "questions", title: "Gear check", pageType: "question", questions: [] },
      ],
    });
    // Blank is not publishable (nothing to answer) — but not for want of a
    // page title.
    const verdict = validateQuestionnaireDefinition(definition);
    expect(verdict.ok ? [] : verdict.issues.map((i) => i.code)).toEqual([
      "empty_page",
      "no_inputs",
    ]);
  });

  it("names an unnamed draft", async () => {
    await createDraft({ title: "   ", createdBy: "u1" });
    expect(vi.mocked(insertDefinitionDraft).mock.calls[0]![0].title).toBe(
      "Untitled questionnaire",
    );
  });

  it("autosaves the head, keeping the title column in step", async () => {
    const definition = Questionnaire.parse(UNIFIED_ROW);
    await updateDefinition("transport", definition);
    expect(updateDefinitionRow).toHaveBeenCalledWith({
      key: "transport",
      title: "Transport",
      definition,
    });
    await updateDefinition("transport", { ...definition, title: undefined });
    expect(vi.mocked(updateDefinitionRow).mock.calls[1]![0].title).toBe(
      "Untitled questionnaire",
    );
  });

  it("duplicates a builder-shaped row into a unified copy with fresh, remapped ids", async () => {
    vi.mocked(getDefinitionRowForClone).mockResolvedValue({
      title: "Transport",
      definition: BUILDER_ROW,
    });
    const key = await duplicateDefinition({ key: "transport", createdBy: "u2" });
    expect(key).toBe("transport-copy");
    const inserted = vi.mocked(insertDefinitionDraft).mock.calls[0]![0];
    expect(inserted.title).toBe("Transport (copy)");
    const copy = Questionnaire.parse(inserted.definition);
    const [drives, arrive] = flattenQuestions(copy);
    expect(drives!.id).not.toBe("drives");
    expect(arrive!.visibleIf?.fieldId).toBe(drives!.id);
    expect((copy.pages[0] as QuestionsPage).id).not.toBe("p1");
    expect(copy.title).toBe("Transport (copy)");
  });

  it("duplicates nothing for a missing, malformed or reserved row", async () => {
    vi.mocked(getDefinitionRowForClone).mockResolvedValueOnce(null);
    expect(await duplicateDefinition({ key: "gone", createdBy: "u" })).toBeNull();
    vi.mocked(getDefinitionRowForClone).mockResolvedValueOnce({
      title: "Bad",
      definition: { pages: [] },
    });
    expect(await duplicateDefinition({ key: "bad", createdBy: "u" })).toBeNull();
    expect(
      await duplicateDefinition({ key: "burner_profile", createdBy: "u" }),
    ).toBeNull();
    expect(insertDefinitionDraft).not.toHaveBeenCalled();
  });
});

describe("listDefinitionsForViewer", () => {
  it("counts questions in rows of either shape, and none in a malformed one", async () => {
    const row = (key: string, definition: unknown, at: number) => ({
      key,
      title: key,
      status: "published" as const,
      version: `${key}-v1`,
      createdBy: "u1",
      definition,
      updatedAt: new Date(at),
    });
    vi.mocked(listDefinitionRows).mockResolvedValue([
      row("old", BUILDER_ROW, 1),
      row("new", UNIFIED_ROW, 3),
      row("bad", { pages: "nope" }, 2),
    ]);
    const list = await listDefinitionsForViewer({
      userId: "u1",
      rank: "captain",
    });
    expect(list.map((d) => [d.key, d.questionCount])).toEqual([
      ["new", 2],
      ["bad", 0],
      ["old", 2],
    ]);
  });
});
