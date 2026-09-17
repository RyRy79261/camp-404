import { describe, expect, it } from "vitest";
import { BuilderQuestionnaire, Question } from "@camp404/types";
import {
  defaultConditionFor,
  describeVisibleIf,
  fieldsBefore,
  withOperator,
} from "../visibility";

// The pure half of the "show this when…" editor: which questions a condition
// may point at, what a fresh condition starts as, and how one reads.

const diet = Question.parse({
  id: "diet",
  kind: "single_select",
  prompt: "Diet",
  options: [
    { value: "omni", label: "Everything" },
    { value: "veg", label: "Vegetarian" },
  ],
});
const drives = Question.parse({
  id: "drives",
  kind: "boolean",
  prompt: "Driving?",
});
const seats = Question.parse({
  id: "seats",
  kind: "number",
  prompt: "Seats",
  min: 1,
  max: 6,
});
const name = Question.parse({ id: "name", kind: "short_text", prompt: "Name" });

const DEF = BuilderQuestionnaire.parse({
  version: "1",
  title: "T",
  pages: [
    {
      id: "p1",
      type: "question",
      title: "One",
      blocks: [
        { kind: "question", question: diet },
        { id: "note", kind: "explainer", bodyText: "Hi", style: "plain" },
        { kind: "question", question: drives },
      ],
    },
    {
      id: "p2",
      type: "question",
      title: "Two",
      blocks: [
        { kind: "question", question: seats },
        { kind: "question", question: name },
      ],
    },
  ],
});

describe("fieldsBefore", () => {
  it("gives a block the questions above it, across pages", () => {
    expect(fieldsBefore(DEF, "p2", "name").map((f) => f.id)).toEqual([
      "diet",
      "drives",
      "seats",
    ]);
    expect(fieldsBefore(DEF, "p1", "note").map((f) => f.id)).toEqual(["diet"]);
    expect(fieldsBefore(DEF, "p1", "diet")).toEqual([]);
  });

  it("gives a page only the questions on earlier pages", () => {
    expect(fieldsBefore(DEF, "p2", null).map((f) => f.id)).toEqual([
      "diet",
      "drives",
    ]);
    expect(fieldsBefore(DEF, "p1", null)).toEqual([]);
  });
});

describe("defaultConditionFor", () => {
  it("starts a complete condition that fits the question", () => {
    expect(defaultConditionFor(diet)).toEqual({
      fieldId: "diet",
      op: "eq",
      value: "omni",
    });
    expect(defaultConditionFor(drives)).toEqual({
      fieldId: "drives",
      op: "eq",
      value: true,
    });
    expect(defaultConditionFor(seats)).toEqual({
      fieldId: "seats",
      op: "eq",
      value: 1,
    });
    expect(defaultConditionFor(name)).toEqual({
      fieldId: "name",
      op: "is_answered",
    });
  });
});

describe("withOperator", () => {
  it("keeps a value that still fits, and drops it for answered-or-not", () => {
    const veg = { fieldId: "diet", op: "eq" as const, value: "veg" };
    expect(withOperator(veg, diet, "ne")).toEqual({ ...veg, op: "ne" });
    expect(withOperator(veg, diet, "is_empty")).toEqual({
      fieldId: "diet",
      op: "is_empty",
    });
  });

  it("gives a value back when moving from answered-or-not to a comparison", () => {
    expect(
      withOperator({ fieldId: "seats", op: "is_answered" }, seats, "gte"),
    ).toEqual({ fieldId: "seats", op: "gte", value: 1 });
  });
});

describe("describeVisibleIf", () => {
  const fields = [diet, drives, seats, name];

  it("reads as one sentence, with option labels and Yes or No", () => {
    expect(
      describeVisibleIf({ fieldId: "diet", op: "ne", value: "veg" }, fields),
    ).toEqual({
      text: "Shown when “Diet” is not Vegetarian.",
      broken: false,
    });
    expect(
      describeVisibleIf({ fieldId: "drives", op: "eq", value: false }, fields)
        .text,
    ).toBe("Shown when “Driving?” is No.");
    expect(
      describeVisibleIf({ fieldId: "seats", op: "gt", value: 2 }, fields).text,
    ).toBe("Shown when “Seats” is more than 2.");
    expect(
      describeVisibleIf({ fieldId: "name", op: "is_empty" }, fields).text,
    ).toBe("Shown when “Name” is not answered.");
  });

  it("marks a condition broken when its question is missing or no longer fits", () => {
    expect(
      describeVisibleIf({ fieldId: "gone", op: "is_answered" }, fields).broken,
    ).toBe(true);
    expect(
      describeVisibleIf({ fieldId: "diet", op: "eq", value: "vegan" }, fields)
        .broken,
    ).toBe(true);
  });
});
