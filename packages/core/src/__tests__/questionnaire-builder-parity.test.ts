import { describe, expect, it } from "vitest";
import {
  BuilderQuestionnaire,
  Questionnaire,
  builderQuestionnaireIssues,
  evalVisibleIf,
  flattenBuilderQuestions,
  fromBuilderQuestionnaire,
  parseStoredDefinition,
  validateBuilderResponses,
  visiblePages,
  type Block,
  type QuestionnaireResponses,
} from "@camp404/types";
import {
  BUILDER_V1_ALL_SHOWN,
  BUILDER_V1_QUESTIONNAIRE,
} from "../__fixtures__/questionnaire-builder-v1";
import {
  validateQuestionnaireDefinition,
  type DefinitionIssueCode,
} from "../questionnaire-definition";
import {
  aggregateQuestions,
  aggregateResponses,
} from "../questionnaire-results";
import {
  deriveProgress,
  pageById,
  resolvePath,
  validateSubmission,
  visibleBlocks,
} from "../questionnaire-runtime";

// The frozen builder fixture, converted to the unified model, must behave
// EXACTLY as Camp 404's builder engine does on the original: the same pages
// and blocks shown, the same questions required, the same answers kept and
// dropped, the same errors, the same publish verdict and the same results.
// Each sample response set below targets one rule; every one is compared
// wholesale rather than spot-checked.

const BUILDER = BuilderQuestionnaire.parse(BUILDER_V1_QUESTIONNAIRE);
const UNIFIED = fromBuilderQuestionnaire(BUILDER);

const blockId = (block: Block): string =>
  block.kind === "question" ? block.question.id : block.id;

/** What the builder engine shows: visible pages, and each one's visible blocks. */
function builderView(responses: QuestionnaireResponses) {
  return visiblePages(BUILDER, responses).map((page) => ({
    page: page.id,
    blocks: page.blocks
      .filter((b) => !b.visibleIf || evalVisibleIf(b.visibleIf, responses))
      .map(blockId),
  }));
}

/** What the unified runtime shows, in the same form. */
function unifiedView(responses: QuestionnaireResponses) {
  return resolvePath(UNIFIED, responses).map((id) => ({
    page: id,
    blocks: visibleBlocks(pageById(UNIFIED, id)!, responses).map((b) => b.id),
  }));
}

const SAMPLES: Record<string, Record<string, unknown>> = {
  "nothing answered": {},
  "every conditional question shown": BUILDER_V1_ALL_SHOWN,
  "the minimum a traveller from New Zealand must give": {
    email: "kiri@example.com",
    country: "nz",
    meal: "braai",
  },
  "a hidden page's valid answer still drives a later page": {
    email: "kiri@example.com",
    country: "nz",
    meal: "potjie",
    vehicle: "no",
  },
  "hidden answers: valid ones kept, invalid ones dropped silently": {
    ...BUILDER_V1_ALL_SHOWN,
    country: "nz",
    has_allergies: false,
    allergies: "Kept: valid, but hidden",
    anaphylactic: "not a boolean",
    driving: "maybe",
    arrive: "26/04/2027",
    cooking: "none",
    kitchen_plan: "x".repeat(301),
    teams: ["build"],
    power_detail: "Kept too",
    build_later: "perhaps",
    kitchen_keen: 5,
    buddy_phone: "12",
    volume: 5,
    shade: 99,
    experience: 1,
    veteran_tip: 42,
  },
  "visible questions left blank": {
    country: "za",
    vehicle: "yes",
    cooking: "hands",
    teams: ["power"],
  },
  "visible questions answered wrongly": {
    ...BUILDER_V1_ALL_SHOWN,
    email: "nope",
    meal: "pizza",
    diets: ["vegan", "other:   ", "ghost"],
    arrive: "2027-02-30",
    experience: 21,
    kitchen_keen: 2.5,
    power_detail: 404,
  },
  "an invalid answer drives a condition": {
    ...BUILDER_V1_ALL_SHOWN,
    country: "nz",
    vehicle: "maybe",
    cooking: "michelin",
    teams: "power",
  },
  "an other: answer where it is not allowed": {
    ...BUILDER_V1_ALL_SHOWN,
    playa_name: "other:Sparkle",
    build_later: "other:depends",
  },
};

describe("the frozen builder fixture converts cleanly", () => {
  it("parses under the unified schema to identical JSON", () => {
    expect(Questionnaire.parse(UNIFIED)).toStrictEqual(UNIFIED);
  });

  it("reads the same through parseStoredDefinition", () => {
    expect(parseStoredDefinition(BUILDER_V1_QUESTIONNAIRE)).toStrictEqual(
      UNIFIED,
    );
  });

  it("keeps every question, in order", () => {
    expect(
      UNIFIED.pages.flatMap((p) =>
        p.kind === "questions" ? p.questions.map((b) => b.id) : [],
      ),
    ).toEqual(BUILDER.pages.flatMap((p) => p.blocks.map(blockId)));
  });
});

describe.each(Object.entries(SAMPLES))("parity on: %s", (_name, raw) => {
  const responses = raw as QuestionnaireResponses;

  it("shows the same pages and blocks", () => {
    expect(unifiedView(responses)).toEqual(builderView(responses));
  });

  it("validates a submission identically — ok, errors and kept answers", () => {
    const builder = validateBuilderResponses(BUILDER, raw);
    const unified = validateSubmission(UNIFIED, raw);
    expect(unified.ok).toBe(builder.ok);
    if (builder.ok && unified.ok) {
      expect(unified.responses).toStrictEqual(builder.responses);
    }
    if (!builder.ok && !unified.ok) {
      expect(unified.errors).toStrictEqual(builder.errors);
    }
  });
});

describe("parity on the edges of the payload", () => {
  it.each([
    ["a non-object", "nope"],
    ["an array", ["nope"]],
    ["null", null],
    ["a value no response can hold", { email: { a: 1 } }],
  ])("refuses %s whole, the same way", (_name, raw) => {
    expect(validateSubmission(UNIFIED, raw)).toStrictEqual(
      validateBuilderResponses(BUILDER, raw),
    );
    expect(validateSubmission(UNIFIED, raw)).toEqual({
      ok: false,
      errors: { _root: "Malformed response payload" },
    });
  });

  it("drops keys no question owns, the same way", () => {
    const raw = { ...BUILDER_V1_ALL_SHOWN, is_captain: true, ghost: ["x"] };
    const builder = validateBuilderResponses(BUILDER, raw);
    const unified = validateSubmission(UNIFIED, raw);
    expect(unified.ok && builder.ok).toBe(true);
    if (unified.ok && builder.ok) {
      expect(unified.responses).toStrictEqual(builder.responses);
      expect(unified.responses).not.toHaveProperty("is_captain");
    }
  });
});

describe("progress over the converted fixture", () => {
  it("is complete for the all-shown answers and counts only asked questions", () => {
    const progress = deriveProgress(
      UNIFIED,
      BUILDER_V1_ALL_SHOWN as QuestionnaireResponses,
    );
    expect(progress.path).toEqual([
      "welcome",
      "about",
      "food",
      "transport",
      "skills",
    ]);
    expect(progress.complete).toBe(true);
    expect(progress.percent).toBe(100);
  });

  it("does not require a question on a hidden page", () => {
    const progress = deriveProgress(UNIFIED, {
      email: "kiri@example.com",
      country: "nz",
      meal: "braai",
    });
    expect(progress.path).toEqual(["welcome", "about", "food"]);
    expect(progress.complete).toBe(true);
  });
});

describe("the publish verdict matches", () => {
  function unifiedCodes(def: unknown): DefinitionIssueCode[] {
    const result = validateQuestionnaireDefinition(def);
    return result.ok ? [] : result.issues.map((issue) => issue.code);
  }

  it("publishes the fixture in both engines", () => {
    expect(builderQuestionnaireIssues(BUILDER)).toEqual([]);
    expect(unifiedCodes(UNIFIED)).toEqual([]);
  });

  /** A copy of the stored JSON with one edit applied. */
  function edited(
    edit: (def: {
      title: string;
      pages: {
        id: string;
        type: string;
        blocks: Record<string, unknown>[];
        visibleIf?: unknown;
      }[];
    }) => void,
  ) {
    const copy = JSON.parse(
      JSON.stringify(BUILDER_V1_QUESTIONNAIRE),
    ) as Parameters<typeof edit>[0];
    edit(copy);
    return BuilderQuestionnaire.parse(copy);
  }

  const BROKEN: Record<string, Parameters<typeof edited>[0]> = {
    "a blank title": (def) => {
      def.title = "  ";
    },
    "a condition on a later question": (def) => {
      def.pages[1]!.visibleIf = { fieldId: "meal", op: "is_answered" };
    },
    "a condition with the wrong operator": (def) => {
      def.pages[3]!.visibleIf = { fieldId: "country", op: "gt", value: 1 };
    },
    "a condition with an impossible value": (def) => {
      def.pages[3]!.visibleIf = { fieldId: "country", op: "eq", value: "mars" };
    },
    "an image with no alt text": (def) => {
      def.pages[0]!.blocks[2]!.altText = "";
    },
    "an image with no picture": (def) => {
      def.pages[0]!.blocks[2]!.imageUrl = "";
    },
    "an image from another website": (def) => {
      def.pages[0]!.blocks[2]!.imageUrl = "https://tracker.example/p.gif";
    },
    "an input on a content page": (def) => {
      def.pages[0]!.blocks.push({
        kind: "question",
        question: { id: "sneaky", kind: "email", prompt: "Email?" },
      });
    },
    "a duplicate id": (def) => {
      def.pages[5]!.blocks[0]!.id = "welcome_note";
    },
    "two questions with one role": (def) => {
      const q = def.pages[3]!.blocks[3]!.question as { role?: string };
      q.role = "arrival_date";
    },
    "an option value on the reserved prefix": (def) => {
      const q = def.pages[2]!.blocks[6]!.question as {
        options: { value: string }[];
      };
      q.options[0]!.value = "other:braai";
    },
    "two options with one value": (def) => {
      const q = def.pages[1]!.blocks[4]!.question as {
        options: { value: string }[];
      };
      q.options[1]!.value = "za";
    },
    "a range nobody can answer": (def) => {
      const q = def.pages[4]!.blocks[0]!.question as {
        min: number;
        max: number;
      };
      q.min = 20;
      q.max = 20;
    },
    "an empty page": (def) => {
      def.pages[5]!.blocks = [];
    },
    "no page shown before anything is answered": (def) => {
      for (const page of def.pages) {
        page.visibleIf = { fieldId: "email", op: "is_answered" };
      }
    },
  };

  it.each(Object.entries(BROKEN))(
    "refuses %s in both engines, with the same code",
    (_name, edit) => {
      const builder = edited(edit);
      const builderCodes = builderQuestionnaireIssues(builder).map(
        (i) => i.code,
      );
      const codes = unifiedCodes(fromBuilderQuestionnaire(builder));
      expect(builderCodes.length).toBeGreaterThan(0);
      for (const code of builderCodes) expect(codes).toContain(code);
    },
  );
});

describe("results match", () => {
  const responses = [
    BUILDER_V1_ALL_SHOWN,
    SAMPLES["the minimum a traveller from New Zealand must give"]!,
    { ...BUILDER_V1_ALL_SHOWN, meal: "braai", diets: ["vegan"], experience: 3 },
    { retired_question: "an orphan" },
  ] as QuestionnaireResponses[];

  it("aggregates the converted definition exactly as the builder's field list", () => {
    expect(aggregateResponses(UNIFIED, responses)).toStrictEqual(
      aggregateQuestions(flattenBuilderQuestions(BUILDER), responses),
    );
  });
});
