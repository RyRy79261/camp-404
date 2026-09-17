import { describe, expect, it } from "vitest";
import {
  BuilderQuestionnaire,
  Questionnaire,
  fromBuilderQuestionnaire,
  parseStoredDefinition,
  safeParseStoredDefinition,
  toBuilderQuestionnaire,
  type Block,
  type BuilderPage,
  type PageBlock,
  type QuestionsPage,
} from "../index";
import { FROZEN_V1_QUESTIONNAIRE } from "./_frozen-v1";

// `fromBuilderQuestionnaire` must lose nothing: every stored builder row is
// read through it once the runner moves to the unified model, and a version
// snapshot can never be rewritten to put a dropped field back. The strongest
// proof is a round trip — convert, convert back, compare — so the inverse
// lives here, in the test, where it can only be used to check the forward map.

function toBuilderBlock(block: PageBlock): Block {
  switch (block.kind) {
    case "image_block": {
      const { url, alt, sizeFit, ...rest } = block;
      return {
        ...rest,
        imageUrl: url,
        altText: alt,
        sizeFit: sizeFit ?? "fit",
      };
    }
    case "info_block":
      throw new Error("info_block has no builder equivalent");
    case "header_break":
    case "explainer":
    case "divider":
      return block;
    default: {
      const { visibleIf, ...question } = block;
      return visibleIf
        ? { kind: "question", question, visibleIf }
        : { kind: "question", question };
    }
  }
}

function toBuilderPage(page: QuestionsPage): BuilderPage {
  const { subtitle, questions, pageType, id, title, visibleIf } = page;
  return {
    id,
    type: pageType ?? "question",
    title,
    ...(subtitle !== undefined ? { intro: subtitle } : {}),
    ...(page.requiredToContinue !== undefined
      ? { requiredToContinue: page.requiredToContinue }
      : {}),
    blocks: questions.map(toBuilderBlock),
    ...(visibleIf ? { visibleIf } : {}),
  };
}

function toBuilder(def: Questionnaire): BuilderQuestionnaire {
  return {
    version: def.version,
    title: def.title ?? "",
    pages: def.pages.map((page) => {
      if (page.kind !== "questions")
        throw new Error("intro has no builder page");
      return toBuilderPage(page);
    }),
  };
}

const BUILDER_JSON = {
  version: "3",
  title: "Transport",
  pages: [
    {
      id: "welcome",
      type: "content",
      title: "Before you start",
      intro: "Two minutes.",
      requiredToContinue: true,
      blocks: [
        {
          id: "head",
          kind: "header_break",
          headingText: "Getting there",
          eyebrow: "Step 1",
          subtext: "Roads are rough.",
          alignment: "center",
        },
        {
          id: "pic",
          kind: "image_block",
          imageUrl: "/maps/r355.png",
          caption: "The R355",
          altText: "A dirt road",
          sizeFit: "full-width",
        },
        { id: "rule", kind: "divider" },
      ],
    },
    {
      id: "drive",
      type: "question",
      title: "Driving",
      blocks: [
        {
          kind: "question",
          question: {
            id: "driving",
            kind: "boolean",
            prompt: "Are you driving?",
            shortLabel: "Driving",
            role: "driving_this_year",
            required: false,
          },
        },
        {
          kind: "question",
          question: {
            id: "arrive",
            kind: "date",
            prompt: "Arrival day",
            role: "arrival_date",
            required: true,
          },
          visibleIf: { fieldId: "driving", op: "eq", value: true },
        },
        {
          id: "warn",
          kind: "explainer",
          bodyText: "Bring a spare tyre.",
          style: "warning",
          visibleIf: { fieldId: "driving", op: "eq", value: true },
        },
        {
          id: "bare",
          kind: "image_block",
          imageUrl: "",
          altText: "",
          sizeFit: "fit",
        },
      ],
      visibleIf: { fieldId: "welcome_seen", op: "is_empty" },
    },
  ],
};

describe("fromBuilderQuestionnaire", () => {
  const builder = BuilderQuestionnaire.parse(BUILDER_JSON);
  const unified = fromBuilderQuestionnaire(builder);

  it("keeps the title and version, and turns every page into a questions page", () => {
    expect(unified.version).toBe("3");
    expect(unified.title).toBe("Transport");
    expect(unified.pages.map((p) => p.kind)).toEqual([
      "questions",
      "questions",
    ]);
  });

  it("marks a content page, moves intro to subtitle and keeps requiredToContinue", () => {
    const [welcome, drive] = unified.pages as QuestionsPage[];
    expect(welcome).toMatchObject({
      pageType: "content",
      subtitle: "Two minutes.",
      requiredToContinue: true,
    });
    expect(drive?.pageType).toBe("question");
    expect(drive).not.toHaveProperty("subtitle");
    expect(drive).not.toHaveProperty("requiredToContinue");
    expect(drive?.visibleIf).toEqual({
      fieldId: "welcome_seen",
      op: "is_empty",
    });
  });

  it("unwraps a question block, moving its visibleIf onto the question", () => {
    const drive = unified.pages[1] as QuestionsPage;
    expect(drive.questions[0]).toEqual({
      id: "driving",
      kind: "boolean",
      prompt: "Are you driving?",
      shortLabel: "Driving",
      role: "driving_this_year",
      required: false,
    });
    expect(drive.questions[1]).toEqual({
      id: "arrive",
      kind: "date",
      prompt: "Arrival day",
      role: "arrival_date",
      required: true,
      visibleIf: { fieldId: "driving", op: "eq", value: true },
    });
  });

  it("renames an image block's fields and keeps its fit, caption and condition", () => {
    const welcome = unified.pages[0] as QuestionsPage;
    expect(welcome.questions[1]).toEqual({
      id: "pic",
      kind: "image_block",
      url: "/maps/r355.png",
      alt: "A dirt road",
      caption: "The R355",
      sizeFit: "full-width",
    });
    const drive = unified.pages[1] as QuestionsPage;
    expect(drive.questions[3]).toEqual({
      id: "bare",
      kind: "image_block",
      url: "",
      alt: "",
      sizeFit: "fit",
    });
  });

  it("passes the shared content blocks through untouched", () => {
    const welcome = unified.pages[0] as QuestionsPage;
    expect(welcome.questions[0]).toEqual(BUILDER_JSON.pages[0]!.blocks[0]);
    expect(welcome.questions[2]).toEqual({ id: "rule", kind: "divider" });
    const drive = unified.pages[1] as QuestionsPage;
    expect(drive.questions[2]).toEqual(BUILDER_JSON.pages[1]!.blocks[2]);
  });

  it("produces a definition the unified schema parses to identical JSON", () => {
    expect(Questionnaire.parse(unified)).toStrictEqual(unified);
    expect(JSON.parse(JSON.stringify(unified))).toEqual(unified);
  });

  it("is lossless: converting back gives the builder definition it came from", () => {
    expect(toBuilder(unified)).toStrictEqual(builder);
    expect(BuilderQuestionnaire.parse(toBuilder(unified))).toEqual(builder);
  });
});

describe("parseStoredDefinition", () => {
  it("reads a stored builder definition as the unified model", () => {
    expect(parseStoredDefinition(BUILDER_JSON)).toEqual(
      fromBuilderQuestionnaire(BuilderQuestionnaire.parse(BUILDER_JSON)),
    );
  });

  it("reads a stored unified (legacy code) definition as itself", () => {
    expect(parseStoredDefinition(FROZEN_V1_QUESTIONNAIRE)).toEqual(
      FROZEN_V1_QUESTIONNAIRE,
    );
  });

  it("throws on JSON that is neither shape", () => {
    expect(() => parseStoredDefinition({ version: "1", pages: [] })).toThrow();
    expect(() =>
      parseStoredDefinition({
        version: "1",
        title: "Broken",
        pages: [
          { id: "p", type: "question", title: "P", blocks: [{ kind: "nope" }] },
        ],
      }),
    ).toThrow();
    expect(() => parseStoredDefinition(null)).toThrow();
  });
});

describe("safeParseStoredDefinition", () => {
  it("returns the unified model for either valid shape", () => {
    expect(safeParseStoredDefinition(BUILDER_JSON)?.title).toBe("Transport");
    expect(safeParseStoredDefinition(FROZEN_V1_QUESTIONNAIRE)).toEqual(
      FROZEN_V1_QUESTIONNAIRE,
    );
  });

  it("returns null rather than throwing for a malformed row of either shape", () => {
    expect(safeParseStoredDefinition("not json")).toBeNull();
    expect(
      safeParseStoredDefinition({
        version: "",
        title: "x",
        pages: [{ id: "p", type: "question", title: "P", blocks: [] }],
      }),
    ).toBeNull();
    expect(safeParseStoredDefinition({ version: "1", pages: [] })).toBeNull();
  });
});

describe("toBuilderQuestionnaire (the proof that reading old rows loses nothing)", () => {
  const builder = BuilderQuestionnaire.parse(BUILDER_JSON);

  it("gives a stored builder definition back exactly, however it was read", () => {
    expect(
      toBuilderQuestionnaire(fromBuilderQuestionnaire(builder)),
    ).toStrictEqual(builder);
    expect(
      toBuilderQuestionnaire(parseStoredDefinition(BUILDER_JSON)),
    ).toStrictEqual(builder);
    // …including after a trip through the JSONB column in the unified shape.
    const storedUnified: unknown = JSON.parse(
      JSON.stringify(fromBuilderQuestionnaire(builder)),
    );
    expect(
      toBuilderQuestionnaire(parseStoredDefinition(storedUnified)),
    ).toStrictEqual(builder);
  });

  it("converts a unified definition that only leaves the builder's defaults unsaid", () => {
    const plain = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "p1",
          kind: "questions",
          title: "P",
          questions: [
            { id: "q", kind: "short_text", prompt: "Q" },
            { id: "img", kind: "image_block", url: "/a.png", alt: "A" },
          ],
        },
      ],
    });
    expect(toBuilderQuestionnaire(plain)).toEqual({
      version: "1",
      title: "",
      pages: [
        {
          id: "p1",
          type: "question",
          title: "P",
          blocks: [
            {
              kind: "question",
              question: {
                id: "q",
                kind: "short_text",
                prompt: "Q",
                maxLength: 120,
                required: true,
              },
            },
            {
              id: "img",
              kind: "image_block",
              imageUrl: "/a.png",
              altText: "A",
              sizeFit: "fit",
            },
          ],
        },
      ],
    });
  });

  const page = (questions: unknown[], extra: Record<string, unknown> = {}) => ({
    id: "p1",
    kind: "questions",
    title: "P",
    questions,
    ...extra,
  });
  const email = { id: "e", kind: "email", prompt: "Email" };
  const choice = (
    extra: Record<string, unknown> = {},
    option: Record<string, unknown> = {},
  ) => ({
    id: "c",
    kind: "single_select",
    prompt: "Pick",
    options: [
      { value: "a", label: "A", ...option },
      { value: "b", label: "B" },
    ],
    ...extra,
  });

  it.each<[string, unknown]>([
    [
      "an intro page",
      {
        version: "1",
        pages: [
          { id: "i", kind: "intro", heading: "H", body: "B" },
          page([email]),
        ],
      },
    ],
    [
      "a page's next",
      {
        version: "1",
        pages: [page([email], { next: "p2" }), { ...page([email]), id: "p2" }],
      },
    ],
    [
      "shuffled questions",
      { version: "1", pages: [page([email], { shuffleQuestions: true })] },
    ],
    [
      "an info block",
      {
        version: "1",
        pages: [page([email, { id: "i", kind: "info_block", body: "B" }])],
      },
    ],
    [
      "one of AB's kinds",
      {
        version: "1",
        pages: [
          page([
            { id: "l", kind: "linear_scale", prompt: "L", min: 1, max: 5 },
          ]),
        ],
      },
    ],
    [
      "an option's goTo",
      { version: "1", pages: [page([choice({}, { goTo: "__submit__" })])] },
    ],
    [
      "an option image",
      { version: "1", pages: [page([choice({}, { imageUrl: "/a.png" })])] },
    ],
    [
      "a display mode",
      { version: "1", pages: [page([choice({ display: "dropdown" })])] },
    ],
    [
      "a selection bound",
      {
        version: "1",
        pages: [
          page([{ ...choice(), kind: "multi_select", minSelections: 1 }]),
        ],
      },
    ],
    [
      "a minimum length",
      {
        version: "1",
        pages: [
          page([{ id: "t", kind: "long_text", prompt: "T", minLength: 3 }]),
        ],
      },
    ],
    [
      "a numeric text format",
      {
        version: "1",
        pages: [
          page([
            { id: "n", kind: "short_text", prompt: "N", format: "integer" },
          ]),
        ],
      },
    ],
  ])(
    "is null for a definition with %s, rather than dropping it",
    (_name, raw) => {
      expect(toBuilderQuestionnaire(Questionnaire.parse(raw))).toBeNull();
    },
  );
});
