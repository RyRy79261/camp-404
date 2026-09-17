import { describe, expect, it } from "vitest";
import {
  ContentBlock,
  PageBlock,
  QUESTION_KINDS,
  Question,
  isAnswerableBlock,
  type Questionnaire,
} from "@camp404/types";
import {
  PALETTE,
  allocateId,
  blockLabel,
  blockPaletteKind,
  convertBlock,
  createBlock,
  createSection,
  duplicateBlock,
  roleFits,
  takenIds,
} from "../block-kinds";

// The palette: every kind the engine has is one click away, a new block is
// what the draft schema expects once its words are written, and a retype keeps
// what the author wrote.

/** Fill every empty required string, as an author would. */
function withWords(block: PageBlock): PageBlock {
  const b = structuredClone(block) as Record<string, unknown>;
  if ("prompt" in b) b.prompt = "A question";
  for (const key of ["options", "steps", "rows", "columns"]) {
    const list = b[key];
    if (!Array.isArray(list)) continue;
    list.forEach(
      (item: { label: string }, i) => (item.label = `Item ${i + 1}`),
    );
  }
  if (b.kind === "info_block") b.body = "Read me";
  if (b.kind === "header_break") b.headingText = "A heading";
  if (b.kind === "explainer") b.bodyText = "A note";
  return b as PageBlock;
}

const KINDS = PALETTE.map((p) => p.kind);

describe("PALETTE", () => {
  it("offers every question kind and every content block the engine has", () => {
    const engineKinds = new Set(KINDS.map((k) => createBlock(k, "x").kind));
    for (const kind of QUESTION_KINDS) expect(engineKinds).toContain(kind);
    for (const option of ContentBlock.options) {
      expect(engineKinds).toContain(option.shape.kind.value);
    }
  });

  it("names every entry once", () => {
    const labels = PALETTE.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(KINDS).size).toBe(KINDS.length);
  });

  it("offers AB's typed number and Camp 404's number picker as different things", () => {
    expect(createBlock("number", "n")).toMatchObject({
      kind: "short_text",
      format: "number",
    });
    expect(createBlock("number_picker", "n")).toMatchObject({
      kind: "number",
      min: 0,
      max: 6,
    });
  });
});

describe("createBlock", () => {
  it.each(KINDS)("%s parses once its words are written", (kind) => {
    const block = withWords(createBlock(kind, "b1"));
    expect(PageBlock.safeParse(block).success).toBe(true);
    expect(block.id).toBe("b1");
  });

  it.each(KINDS)("%s presents as the palette kind it was made from", (kind) => {
    expect(blockPaletteKind(createBlock(kind, "b1"))).toBe(kind);
  });

  it("leaves a question's words empty, so the draft check asks for them", () => {
    expect(PageBlock.safeParse(createBlock("short_text", "q")).success).toBe(
      false,
    );
  });
});

describe("allocateId", () => {
  it("hands out a prefixed id that is not taken, and claims it", () => {
    const taken = new Set(["q_1"]);
    const a = allocateId("q", taken);
    const b = allocateId("q", taken);
    expect(a).toMatch(/^q_[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
    expect(taken.has(a) && taken.has(b)).toBe(true);
  });

  it("never re-issues the number of a deleted question (answers are keyed by id)", () => {
    // AB would hand out q_2 again here.
    const draft: Questionnaire = {
      version: "1",
      pages: [
        {
          id: "s",
          kind: "questions",
          title: "S",
          questions: [createBlock("short_text", "q_1")],
        },
      ],
    };
    expect(allocateId("q", takenIds(draft))).not.toBe("q_2");
  });
});

describe("convertBlock", () => {
  const short = Question.parse({
    id: "f1",
    kind: "short_text",
    prompt: "Name",
    helper: "Your name",
    shortLabel: "Name",
    required: true,
    visibleIf: { fieldId: "x", op: "is_answered" },
  });

  it("keeps id, prompt, helper, required, short label and condition across a kind change", () => {
    const next = convertBlock(short, "single_select");
    expect(next).toMatchObject({
      id: "f1",
      kind: "single_select",
      prompt: "Name",
      helper: "Your name",
      shortLabel: "Name",
      required: true,
      visibleIf: { fieldId: "x", op: "is_answered" },
    });
    expect("options" in next && next.options).toHaveLength(2);
  });

  it("reuses the options between choice kinds, dropping what the new kind can't hold", () => {
    const pick = Question.parse({
      id: "f2",
      kind: "single_select",
      prompt: "Pick",
      options: [
        { value: "a", label: "A", goTo: "later" },
        { value: "b", label: "B", imageUrl: "/api/avatar?pathname=b.png" },
        { value: "c", label: "C" },
      ],
    });
    const multi = convertBlock(pick, "multi_select");
    expect("options" in multi && multi.options).toEqual([
      { value: "a", label: "A" },
      { value: "b", label: "B", imageUrl: "/api/avatar?pathname=b.png" },
      { value: "c", label: "C" },
    ]);
    const list = convertBlock(pick, "combobox");
    expect("options" in list && list.options).toEqual([
      { value: "a", label: "A" },
      { value: "b", label: "B" },
      { value: "c", label: "C" },
    ]);
    const scale = convertBlock(pick, "scale");
    expect(scale.kind === "scale" && scale.steps.map((s) => s.value)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("gives the numeric kinds their defaults", () => {
    expect(convertBlock(short, "number_picker")).toMatchObject({
      kind: "number",
      min: 0,
      max: 6,
    });
    expect(convertBlock(short, "slider")).toMatchObject({
      kind: "slider",
      min: 1,
      max: 5,
      step: 1,
    });
  });

  it("keeps a role only where the new kind may hold it", () => {
    const allergies = Question.parse({
      id: "a",
      kind: "short_text",
      prompt: "Allergies",
      role: "dietary_allergies",
    });
    expect(convertBlock(allergies, "long_text")).toMatchObject({
      role: "dietary_allergies",
    });
    expect("role" in convertBlock(allergies, "number_picker")).toBe(false);
    expect(roleFits("boolean", "driving_this_year")).toBe(true);
    expect(roleFits("slider", "driving_this_year")).toBe(false);
  });

  it("carries a question's words into a content block and back", () => {
    const info = convertBlock(short, "info_block");
    expect(info).toMatchObject({
      id: "f1",
      kind: "info_block",
      heading: "Name",
      body: "Your name",
    });
    expect(convertBlock(info, "short_text")).toMatchObject({
      prompt: "Name",
    });
  });

  it("produces a parseable block for every palette kind", () => {
    for (const kind of KINDS) {
      const next = convertBlock(short, kind);
      expect(PageBlock.safeParse(withWords(next)).success, kind).toBe(true);
      expect(isAnswerableBlock(next)).toBe(
        PALETTE.find((p) => p.kind === kind)!.group === "question",
      );
    }
  });
});

describe("duplicateBlock", () => {
  it("copies under the new id", () => {
    expect(duplicateBlock(createBlock("date", "d1"), "d2")).toMatchObject({
      id: "d2",
      kind: "date",
    });
  });

  it("leaves behind a role only one question may have, and keeps a repeating one", () => {
    const driving = Question.parse({
      id: "d",
      kind: "boolean",
      prompt: "Driving?",
      role: "driving_this_year",
    });
    expect("role" in duplicateBlock(driving, "d2")).toBe(false);
    const contact = Question.parse({
      id: "c",
      kind: "short_text",
      prompt: "Contact",
      role: "emergency_contact_name",
    });
    expect(duplicateBlock(contact, "c2")).toMatchObject({
      role: "emergency_contact_name",
    });
  });
});

describe("blockLabel and createSection", () => {
  it("names a block by its words, else its place", () => {
    expect(blockLabel(withWords(createBlock("email", "e")), 0)).toBe(
      "A question",
    );
    expect(blockLabel(createBlock("divider", "d"), 2)).toBe("block 3");
  });

  it("makes a titled, empty question section", () => {
    expect(createSection("s2", 1)).toEqual({
      id: "s2",
      kind: "questions",
      title: "Section 2",
      pageType: "question",
      questions: [],
    });
  });
});
