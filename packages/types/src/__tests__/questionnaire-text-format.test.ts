import { describe, expect, it } from "vitest";
import {
  ShortTextQuestion,
  TextFormat,
  type ShortTextQuestion as ShortTextQuestionType,
  checkTextFormat,
  validateOne,
  type Question,
} from "../questionnaire";

// One accepting and one rejecting case for EVERY member of the closed enum,
// driven off the schema's own option list so a member added without a case
// here fails the suite rather than shipping unchecked.
const CASES: Record<
  TextFormat,
  { accepts: string[]; rejects: string[]; error: string }
> = {
  text: { accepts: ["anything at all", "!!! 123"], rejects: [], error: "" },
  email: {
    accepts: ["burner@camp404.co.za", "  spaced@example.com  "],
    rejects: ["not-an-email", "two@@example.com", "a@b"],
    error: "Enter a valid email address",
  },
  url: {
    accepts: ["https://camp404.co.za/map", "http://example.com"],
    rejects: ["camp404.co.za", "ftp://example.com", "https://"],
    error: "Enter a link starting with http:// or https://",
  },
  phone: {
    accepts: ["+27 82 123 4567", "(021) 555-1234"],
    rejects: ["12345", "not a phone", "+2782123456789012345"],
    error: "Enter a valid phone number",
  },
  alphanumeric: {
    accepts: ["Camp 404", "abc123"],
    rejects: ["camp-404", "hello!", "@handle"],
    error: "Letters and numbers only",
  },
  // Telegram's own rule: 5 to 32 letters, digits or _, starting with a letter;
  // the leading @ is optional.
  telegram: {
    accepts: ["@nova_reyes", "nova_reyes", " @Camp404crew ", "abcde"],
    rejects: [
      "@abcd",
      "4nova",
      "nova-reyes",
      "nova_",
      "@",
      "a".repeat(33),
      "t.me/nova",
    ],
    error:
      "Enter a Telegram username, like @nova_reyes: 5 to 32 letters, numbers or _",
  },
  // AB's numeric presets. Unbounded here; `min`/`max` are exercised below.
  number: {
    accepts: ["12", " 1.5 ", "-3"],
    rejects: ["abc", "   ", "1,5"],
    error: "Enter a number",
  },
  integer: {
    accepts: ["12", "-3", " 7 "],
    rejects: ["twelve", "   "],
    error: "Enter a number",
  },
};

describe("checkTextFormat", () => {
  it("covers every member of the closed TextFormat enum", () => {
    expect(Object.keys(CASES).sort()).toEqual([...TextFormat.options].sort());
  });

  it("passes an absent format without checking anything", () => {
    expect(checkTextFormat(undefined, "@@@ not an email @@@")).toBeNull();
  });

  for (const [format, spec] of Object.entries(CASES) as [
    TextFormat,
    (typeof CASES)[TextFormat],
  ][]) {
    it(`accepts valid ${format} values`, () => {
      for (const value of spec.accepts) {
        expect(checkTextFormat(format, value)).toBeNull();
      }
    });

    if (spec.rejects.length > 0) {
      it(`rejects invalid ${format} values`, () => {
        for (const value of spec.rejects) {
          expect(checkTextFormat(format, value)).toBe(spec.error);
        }
      });
    }
  }

  it("checks the trimmed value but never rewrites it", () => {
    expect(checkTextFormat("email", "  burner@camp404.co.za  ")).toBeNull();
    // Whitespace-only is not a pass — "   " is not an email address.
    expect(checkTextFormat("email", "   ")).toBe("Enter a valid email address");
  });
});

describe("validateOne with a text format", () => {
  const shortText = (format?: TextFormat): Question =>
    ShortTextQuestion.parse({
      id: "contact",
      kind: "short_text",
      prompt: "Best contact",
      required: true,
      ...(format ? { format } : {}),
    });

  it("applies the format on top of the length bound", () => {
    const q = shortText("email");
    expect(validateOne(q, "burner@camp404.co.za")).toEqual({
      ok: true,
      value: "burner@camp404.co.za",
    });
    expect(validateOne(q, "nope")).toEqual({
      ok: false,
      error: "Enter a valid email address",
    });
  });

  it("stores the value verbatim, untrimmed", () => {
    const result = validateOne(shortText("email"), " a@b.co ");
    expect(result).toEqual({ ok: true, value: " a@b.co " });
  });

  it("still rejects on length before the format is consulted", () => {
    const q = ShortTextQuestion.parse({
      id: "contact",
      kind: "short_text",
      prompt: "Best contact",
      required: true,
      format: "email",
      maxLength: 5,
    });
    expect(validateOne(q, "burner@camp404.co.za")).toEqual({
      ok: false,
      error: "Max 5 characters",
    });
  });

  it("leaves an unformatted short text alone", () => {
    expect(validateOne(shortText(), "whatever !!")).toEqual({
      ok: true,
      value: "whatever !!",
    });
  });

  it("never format-checks a long_text — it shares the arm but not the rule", () => {
    const paragraph: Question = {
      id: "why",
      kind: "long_text",
      prompt: "Why?",
      maxLength: 1000,
      required: false,
    };
    expect(validateOne(paragraph, "not-an-email, and that's fine")).toEqual({
      ok: true,
      value: "not-an-email, and that's fine",
    });
  });

  it("skips the format check for a missing optional answer", () => {
    const q = ShortTextQuestion.parse({
      id: "contact",
      kind: "short_text",
      prompt: "Best contact",
      required: false,
      format: "email",
    });
    expect(validateOne(q, "")).toEqual({ ok: true, value: undefined });
    expect(validateOne(q, undefined)).toEqual({ ok: true, value: undefined });
  });
});

// --- Ported from AB ------------------------------------------------------

// `format` presets are a CLOSED enum on purpose — author-supplied regex would
// be a ReDoS surface on a server-side validator. The presets are reachable only
// through a short_text question, so nothing else in the package exercises them,
// and a preset that silently accepted everything would look identical to a
// working one in the UI. Hence: every arm gets an accept AND a refuse, and the
// refusal copy (which a respondent reads) is asserted verbatim.

function textQuestion(
  extra: Partial<ShortTextQuestionType> = {},
): ShortTextQuestionType {
  return {
    id: "answer",
    kind: "short_text",
    prompt: "Your answer",
    maxLength: 200,
    required: false,
    ...extra,
  };
}

describe("text format — the pass-through arms", () => {
  it("accepts anything when no format is set, and when it is explicitly 'text'", () => {
    const anything = "Camp 404 — 100% dust, #nofilter";
    expect(validateOne(textQuestion(), anything)).toEqual({
      ok: true,
      value: anything,
    });
    expect(validateOne(textQuestion({ format: "text" }), anything)).toEqual({
      ok: true,
      value: anything,
    });
  });
});

describe("text format — email, url, alphanumeric", () => {
  it("email accepts an address and refuses anything else", () => {
    const q = textQuestion({ format: "email" });
    expect(validateOne(q, "alice@example.com").ok).toBe(true);
    expect(validateOne(q, "alice at example")).toEqual({
      ok: false,
      error: "Enter a valid email address",
    });
  });

  it("url refuses a bare domain and names both schemes it accepts", () => {
    const q = textQuestion({ format: "url" });
    expect(validateOne(q, "https://afrikaburn.org/camps").ok).toBe(true);
    expect(validateOne(q, "afrikaburn.org")).toEqual({
      ok: false,
      error: "Enter a link starting with http:// or https://",
    });
  });

  it("alphanumeric allows spaces but refuses punctuation", () => {
    const q = textQuestion({ format: "alphanumeric" });
    expect(validateOne(q, "Camp 404").ok).toBe(true);
    expect(validateOne(q, "Camp #404")).toEqual({
      ok: false,
      error: "Letters and numbers only",
    });
  });
});

describe("text format — phone applies the same digit bound as the phone kind", () => {
  // The 7–15 digit E.164 rule is written twice in the source: once in
  // validateOne's `phone` arm, once in this preset. They are tested separately
  // (here and in questionnaire-validate-one.test.ts) precisely so drift between
  // the two shows up as a failure rather than as inconsistent product behaviour.
  const q = textQuestion({ format: "phone" });

  it("accepts a spaced South African number", () => {
    expect(validateOne(q, "+27 82 123 4567").ok).toBe(true);
  });

  it("refuses too few digits even when the character shape passes", () => {
    // Seven characters, four digits.
    expect(validateOne(q, "1-2-3-4")).toEqual({
      ok: false,
      error: "Enter a valid phone number",
    });
  });

  it("refuses more digits than E.164 allows", () => {
    expect(validateOne(q, "1234567890123456789")).toEqual({
      ok: false,
      error: "Enter a valid phone number",
    });
  });
});

describe("text format — the numeric presets", () => {
  it("number refuses a whitespace-only answer and a non-number", () => {
    // A whitespace-only answer reaches here because validateOne treats only the
    // literal empty string as missing.
    const q = textQuestion({ format: "number" });
    expect(validateOne(q, "   ")).toEqual({
      ok: false,
      error: "Enter a number",
    });
    expect(validateOne(q, "abc")).toEqual({
      ok: false,
      error: "Enter a number",
    });
    expect(validateOne(q, "1.5").ok).toBe(true);
  });

  it("integer refuses a fraction that number would accept", () => {
    const q = textQuestion({ format: "integer" });
    expect(validateOne(q, "1.5")).toEqual({
      ok: false,
      error: "Enter a whole number",
    });
    expect(validateOne(q, "5").ok).toBe(true);
  });

  it("min and max carry the bound in the message", () => {
    expect(
      validateOne(textQuestion({ format: "number", min: 2 }), "1"),
    ).toEqual({
      ok: false,
      error: "Must be at least 2",
    });
    expect(
      validateOne(textQuestion({ format: "number", max: 2 }), "3"),
    ).toEqual({
      ok: false,
      error: "Must be at most 2",
    });
    const bounded = textQuestion({ format: "number", min: 2, max: 5 });
    expect(validateOne(bounded, "3")).toEqual({ ok: true, value: "3" });
  });

  it("min and max bind only on the numeric presets", () => {
    // Same bound, non-numeric preset: a plain text answer is not compared
    // against min/max, so "1" passes.
    const q = textQuestion({ format: "text", min: 2, max: 5 });
    expect(validateOne(q, "1")).toEqual({ ok: true, value: "1" });
  });
});

describe("text format — ordering and trimming", () => {
  it("reports the LENGTH error first when an answer is both too long and malformed", () => {
    const q = textQuestion({ format: "email", maxLength: 5 });
    expect(validateOne(q, "not-an-email")).toEqual({
      ok: false,
      error: "Max 5 characters",
    });
  });

  it("trims before the format check but stores the answer as posted", () => {
    // Deliberate: surrounding whitespace must not fail a valid email, and the
    // stored value is still the raw answer. Both halves are asserted so neither
    // can change invisibly.
    const q = textQuestion({ format: "email" });
    expect(validateOne(q, " alice@example.com ")).toEqual({
      ok: true,
      value: " alice@example.com ",
    });
  });
});
