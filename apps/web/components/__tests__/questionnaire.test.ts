import { describe, expect, it } from "vitest";
import { Questionnaire, validateResponses } from "@camp404/types";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import { buildQuestionnaire } from "@/lib/questionnaire";

// Phase 3: the catalogue is built from team config. Tests build it from the
// seeded defaults — the same teams the test store serves under E2E.
const QUESTIONNAIRE = buildQuestionnaire(
  DEFAULT_TEAMS.map((t) => ({ value: t.key, label: t.label })),
);

// Minimum set of answers that satisfies every required question in the
// current catalogue. Update alongside questionnaire.ts.
const validResponses: Record<string, unknown> = {
  birthday: "1990-04-12",
  phone: "+27 82 555 1234",
  country: "ZA",
  "id.type": "sa_id",
  "id.number": "1234567890123",
  "competency.cooking": "teach",
  "logistics.driving": "yes",
  "logistics.onsite_before": "yes_full",
  "logistics.onsite_after": "yes_partial",
  "history.afrikaburn_count": "1_2",
  "intent.this_year": "want",
  "bio.statement": "Long-time burner, first-time member.",
};

describe("burner-profile questionnaire", () => {
  it("config parses against the schema", () => {
    expect(() => Questionnaire.parse(QUESTIONNAIRE)).not.toThrow();
  });

  it("rejects empty submissions when questions are required", () => {
    const result = validateResponses(QUESTIONNAIRE, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).length).toBeGreaterThan(0);
    }
  });

  it("accepts a fully-answered submission", () => {
    const result = validateResponses(QUESTIONNAIRE, validResponses);
    expect(result.ok).toBe(true);
  });

  it("rejects team-interest number values outside [0, 6]", () => {
    const result = validateResponses(QUESTIONNAIRE, {
      ...validResponses,
      "team_interest.kitchen": 99,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["team_interest.kitchen"]).toBeDefined();
  });

  it("rejects unknown single-select values", () => {
    const result = validateResponses(QUESTIONNAIRE, {
      ...validResponses,
      "logistics.driving": "definitely",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["logistics.driving"]).toBeDefined();
  });

  it("rejects malformed dates", () => {
    const result = validateResponses(QUESTIONNAIRE, {
      ...validResponses,
      birthday: "12/04/1990",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.birthday).toBeDefined();
  });

  it("rejects unknown scale values", () => {
    const result = validateResponses(QUESTIONNAIRE, {
      ...validResponses,
      "competency.cooking": "transcendent",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors["competency.cooking"]).toBeDefined();
  });

  it("treats dietary lists as optional (none = empty checklists)", () => {
    const result = validateResponses(QUESTIONNAIRE, validResponses);
    expect(result.ok).toBe(true);
  });
});
