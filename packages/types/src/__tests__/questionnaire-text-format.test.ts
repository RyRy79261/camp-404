import { describe, expect, it } from "vitest";
import {
  ShortTextQuestion,
  TextFormat,
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
