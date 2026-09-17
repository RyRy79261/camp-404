import { describe, expect, it } from "vitest";
import { Question } from "@camp404/types";

import { morphQuestion } from "../field-kinds";

const short = Question.parse({
  id: "f1",
  kind: "short_text",
  prompt: "Name",
  helper: "Your name",
  required: true,
});

describe("morphQuestion", () => {
  it("preserves id, prompt, helper and required across a kind change", () => {
    const next = morphQuestion(short, "single_select");
    expect(next.id).toBe("f1");
    expect(next.prompt).toBe("Name");
    expect(next.helper).toBe("Your name");
    expect(next.required).toBe(true);
    expect(next.kind).toBe("single_select");
    expect("options" in next && next.options.length).toBe(2);
  });

  it("reuses the existing options when morphing between choice kinds", () => {
    const sel = Question.parse({
      id: "f2",
      kind: "single_select",
      prompt: "Pick",
      required: true,
      options: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
        { value: "c", label: "C" },
      ],
    });
    const multi = morphQuestion(sel, "multi_select");
    expect(multi.kind).toBe("multi_select");
    expect("options" in multi && multi.options.map((o) => o.value)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("injects sensible numeric defaults for number and slider", () => {
    const n = morphQuestion(short, "number");
    expect(n).toMatchObject({ kind: "number", min: 0, max: 6 });
    const s = morphQuestion(short, "slider");
    expect(s).toMatchObject({ kind: "slider", min: 1, max: 5, step: 1 });
  });

  it("falls back to two default options when the source has no usable options", () => {
    const m = morphQuestion(short, "single_select");
    expect("options" in m && m.options).toEqual([
      { value: "option-1", label: "Option 1" },
      { value: "option-2", label: "Option 2" },
    ]);
  });

  it("produces a parseable question for every builder kind", () => {
    for (const kind of [
      "short_text",
      "long_text",
      "email",
      "phone",
      "number",
      "slider",
      "single_select",
      "multi_select",
      "combobox",
      "date",
      "boolean",
      "image",
    ] as const) {
      expect(() => Question.parse(morphQuestion(short, kind))).not.toThrow();
    }
  });
});
