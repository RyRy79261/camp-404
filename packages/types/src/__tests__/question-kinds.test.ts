import { describe, expect, it } from "vitest";
import {
  Question,
  type Questionnaire,
  validateOne,
  validateResponses,
} from "../questionnaire";
import {
  KIND_SAMPLE_ENTRIES,
  KIND_SAMPLES,
  QUESTION_KINDS,
  SAMPLED_KINDS,
} from "./_kind-samples";

// The contract these tests pin: every member of the `Question` union has a
// sample, and `validateOne` has a real opinion about each one. Wave 3's
// results engine switches over the same union, so a hole here becomes a hole
// there.

describe("KIND_SAMPLES covers the Question union", () => {
  it("reads a non-empty kind list off the schema", () => {
    // Guards every assertion below from passing vacuously if zod's
    // introspection API changes shape under us.
    expect(QUESTION_KINDS.length).toBeGreaterThan(0);
    expect(QUESTION_KINDS.length).toBe(Question.options.length);
  });

  it("has a sample for every kind the schema declares", () => {
    const missing = QUESTION_KINDS.filter((k) => !(k in KIND_SAMPLES));
    expect(missing).toEqual([]);
  });

  it("has no sample for a kind the schema does not declare", () => {
    const declared = new Set<string>(QUESTION_KINDS);
    const stale = SAMPLED_KINDS.filter((k) => !declared.has(k));
    expect(stale).toEqual([]);
  });

  it("matches the schema's kinds exactly, in both directions", () => {
    expect([...SAMPLED_KINDS].sort()).toEqual([...QUESTION_KINDS].sort());
  });
});

describe.each(KIND_SAMPLE_ENTRIES)("question kind: %s", (kind, sample) => {
  it("files its sample question under the matching key", () => {
    expect(sample.question.kind).toBe(kind);
  });

  it("has a sample question that parses cleanly, with nothing defaulted in", () => {
    const parsed = Question.parse(sample.question);
    // Round-tripping proves the sample is complete: zod filled no field in on
    // the way through, so the fixture states the whole shape rather than
    // leaning on defaults that could quietly move.
    expect(parsed).toEqual(sample.question);
  });

  it("accepts its valid answer", () => {
    const result = validateOne(sample.question, sample.valid);
    expect(result).toEqual({ ok: true, value: sample.valid });
  });

  it("uses an invalid answer that actually reaches the kind's own arm", () => {
    // `undefined` / `null` / `""` short-circuit as "missing" before the switch
    // runs, so an invalid sample that used one would test nothing.
    expect(sample.invalid).not.toBeUndefined();
    expect(sample.invalid).not.toBeNull();
    expect(sample.invalid).not.toBe("");
  });

  it("rejects its invalid answer with the kind's own error", () => {
    const result = validateOne(sample.question, sample.invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(sample.invalidError);
  });

  it.each([undefined, null, ""])(
    "rejects a missing required answer (%p)",
    (empty) => {
      const result = validateOne(sample.question, empty);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/required/i);
    },
  );
});

describe("validateResponses across every kind", () => {
  const everyKind: Questionnaire = {
    version: "every-kind",
    pages: [
      {
        id: "all",
        kind: "questions",
        title: "One of each",
        questions: KIND_SAMPLE_ENTRIES.map(([, s]) => s.question),
      },
    ],
  };

  it("accepts a response set with a valid answer for every kind", () => {
    const raw = Object.fromEntries(
      KIND_SAMPLE_ENTRIES.map(([, s]) => [s.question.id, s.valid]),
    );
    const result = validateResponses(everyKind, raw);
    expect(result).toEqual({ ok: true, responses: raw });
  });

  it("reports a per-question error for every kind when all answers are invalid", () => {
    const raw = Object.fromEntries(
      KIND_SAMPLE_ENTRIES.map(([, s]) => [s.question.id, s.invalid]),
    );
    const result = validateResponses(everyKind, raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Every kind must contribute an error — not just the first one that
      // fails. A silently-accepted kind shows up here as a missing key.
      expect(Object.keys(result.errors).sort()).toEqual(
        KIND_SAMPLE_ENTRIES.map(([, s]) => s.question.id).sort(),
      );
    }
  });
});

describe("the exhaustiveness guard", () => {
  it("throws on a question kind the switch does not handle", () => {
    // Simulates a fifteenth kind reaching `validateOne` — a definition read
    // back from JSONB that a newer version of the app wrote. Before the
    // `default` arm existed this returned `undefined` and the caller blew up
    // on `.ok` with a bare TypeError naming nothing.
    const alien = {
      id: "k_alien",
      kind: "hologram",
      prompt: "Which hologram?",
      required: true,
    } as unknown as Question;

    expect(() => validateOne(alien, "anything")).toThrow(
      /Unhandled question kind: hologram/,
    );
  });

  it("still short-circuits an unhandled kind's missing answer as required", () => {
    // The missing-value check runs before the switch, so an unknown kind with
    // no answer is still a plain "required" error rather than a throw.
    const alien = {
      id: "k_alien",
      kind: "hologram",
      prompt: "Which hologram?",
      required: true,
    } as unknown as Question;

    expect(validateOne(alien, undefined)).toEqual({
      ok: false,
      error: "This question is required",
    });
  });
});
