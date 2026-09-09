import { describe, expect, it } from "vitest";
import {
  Questionnaire,
  diffResponses,
  displayResponseValue,
  flattenQuestions,
  validateResponses,
} from "../questionnaire";
import {
  FROZEN_V1_DISPLAY,
  FROZEN_V1_QUESTION_IDS,
  FROZEN_V1_QUESTIONNAIRE,
  FROZEN_V1_RESPONSES,
} from "./_frozen-v1";

// These tests exist to fail. `_frozen-v1.ts` is a verbatim copy of a shape
// already sitting in JSONB columns, and nothing migrates it; if a change to
// `questionnaire.ts` breaks anything here, it breaks rows in the database
// too. Fix the schema or add a migration path — never edit the fixture.
// See the header of `_frozen-v1.ts`.

describe("the frozen v1 questionnaire", () => {
  it("still parses under the current schema", () => {
    expect(() => Questionnaire.parse(FROZEN_V1_QUESTIONNAIRE)).not.toThrow();
  });

  it("survives a parse unchanged — nothing defaulted in, nothing stripped", () => {
    // The strongest of these assertions. A new field with a default would show
    // up as an added key; a removed or renamed field as a dropped one. Either
    // means stored rows no longer round-trip.
    expect(Questionnaire.parse(FROZEN_V1_QUESTIONNAIRE)).toEqual(
      FROZEN_V1_QUESTIONNAIRE,
    );
  });

  it("flattens to the same question ids, in the same order", () => {
    expect(flattenQuestions(FROZEN_V1_QUESTIONNAIRE).map((q) => q.id)).toEqual(
      FROZEN_V1_QUESTION_IDS,
    );
  });

  it("keeps its intro page out of the question list", () => {
    const ids = flattenQuestions(FROZEN_V1_QUESTIONNAIRE).map((q) => q.id);
    expect(ids).not.toContain("welcome");
  });
});

describe("the frozen v1 response set", () => {
  it("still validates against the frozen definition, unchanged", () => {
    const result = validateResponses(
      FROZEN_V1_QUESTIONNAIRE,
      FROZEN_V1_RESPONSES,
    );
    expect(result).toEqual({ ok: true, responses: FROZEN_V1_RESPONSES });
  });

  it("leaves skipped optional questions absent rather than filling them in", () => {
    const result = validateResponses(
      FROZEN_V1_QUESTIONNAIRE,
      FROZEN_V1_RESPONSES,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      // An unanswered optional question writes no key at all. Wave 3 counts
      // these as honest skips, so a schema change that started materialising
      // them as null would silently change every completion figure.
      expect(result.responses).not.toHaveProperty("playa_name");
      expect(result.responses).not.toHaveProperty("kitchen_keenness");
    }
  });

  it("diffs clean against itself", () => {
    expect(
      diffResponses(FROZEN_V1_QUESTIONNAIRE, FROZEN_V1_RESPONSES, {
        ...FROZEN_V1_RESPONSES,
      }),
    ).toEqual([]);
  });

  it("renders every answer to the same string a member was already shown", () => {
    const rendered = Object.fromEntries(
      flattenQuestions(FROZEN_V1_QUESTIONNAIRE).map((q) => [
        q.id,
        displayResponseValue(q, FROZEN_V1_RESPONSES[q.id]),
      ]),
    );
    expect(rendered).toEqual(FROZEN_V1_DISPLAY);
  });
});
