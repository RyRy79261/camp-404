import { describe, expect, it } from "vitest";
import {
  MultiSelectQuestion,
  OTHER_PREFIX,
  SingleSelectQuestion,
  displayResponseValue,
  isOtherAnswer,
  otherAnswerText,
  toOtherAnswer,
  validateOne,
} from "../questionnaire";

const OPTIONS = [
  { value: "pizza", label: "Pizza" },
  { value: "braai", label: "Braai" },
];

const single = (allowOther?: boolean) =>
  SingleSelectQuestion.parse({
    id: "meal",
    kind: "single_select",
    prompt: "Favourite camp meal",
    required: true,
    options: OPTIONS,
    ...(allowOther === undefined ? {} : { allowOther }),
  });

const multi = (allowOther?: boolean) =>
  MultiSelectQuestion.parse({
    id: "meals",
    kind: "multi_select",
    prompt: "Meals you'd cook",
    required: false,
    options: OPTIONS,
    ...(allowOther === undefined ? {} : { allowOther }),
  });

describe("the other: encoding helpers", () => {
  it("round-trips typed text through the reserved prefix", () => {
    const encoded = toOtherAnswer("shakshuka");
    expect(encoded).toBe(`${OTHER_PREFIX}shakshuka`);
    expect(isOtherAnswer(encoded)).toBe(true);
    expect(otherAnswerText(encoded)).toBe("shakshuka");
  });

  it("leaves a listed option value alone", () => {
    expect(isOtherAnswer("pizza")).toBe(false);
    expect(otherAnswerText("pizza")).toBe("pizza");
    expect(isOtherAnswer(42)).toBe(false);
  });
});

describe("validateOne accepts other: only where the author allowed it", () => {
  it("accepts an other: answer on a single_select with allowOther", () => {
    expect(validateOne(single(true), "other:shakshuka")).toEqual({
      ok: true,
      value: "other:shakshuka",
    });
  });

  it("refuses an other: answer when allowOther is off", () => {
    expect(validateOne(single(), "other:shakshuka")).toEqual({
      ok: false,
      error: "Not a valid option",
    });
  });

  it("refuses an other: answer with no typed text", () => {
    expect(validateOne(single(true), "other:   ")).toEqual({
      ok: false,
      error: "Tell us what your 'other' answer is",
    });
  });

  it("keeps a legal other: entry in a multi_select and drops an illegal one", () => {
    expect(validateOne(multi(true), ["pizza", "other:shakshuka"])).toEqual({
      ok: true,
      value: ["pizza", "other:shakshuka"],
    });
    expect(validateOne(multi(), ["pizza", "other:shakshuka"])).toEqual({
      ok: true,
      value: ["pizza"],
    });
    expect(validateOne(multi(true), ["pizza", "other: "])).toEqual({
      ok: true,
      value: ["pizza"],
    });
  });

  it("treats a required multi_select emptied by a dropped other: as unanswered", () => {
    const required = MultiSelectQuestion.parse({
      id: "meals",
      kind: "multi_select",
      prompt: "Meals you'd cook",
      required: true,
      options: OPTIONS,
    });
    expect(validateOne(required, ["other:shakshuka"])).toEqual({
      ok: false,
      error: "Pick at least one option",
    });
  });
});

describe("displayResponseValue renders other: as the typed text", () => {
  it("never shows a captain the raw encoding", () => {
    const rendered = displayResponseValue(single(true), "other:shakshuka");
    expect(rendered).toBe("Other: shakshuka");
    expect(rendered).not.toContain("other:shakshuka");
  });

  it("decodes an other: entry inside a multi_select list", () => {
    expect(
      displayResponseValue(multi(true), ["pizza", "other:shakshuka"]),
    ).toBe("Pizza, Other: shakshuka");
  });

  it("still decodes when the field no longer allows other (a published edit)", () => {
    expect(displayResponseValue(single(), "other:shakshuka")).toBe(
      "Other: shakshuka",
    );
  });

  it("renders an empty other: as a dash rather than a bare prefix", () => {
    expect(displayResponseValue(single(true), "other:")).toBe("Other: —");
  });
});
