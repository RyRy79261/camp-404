import { describe, expect, it } from "vitest";
import { Questionnaire, validateResponses } from "@camp404/types";
import { QUESTIONNAIRE } from "@/lib/questionnaire";

// Minimum set of answers that satisfies every required question in the
// current catalogue. Update alongside questionnaire.ts.
const validResponses: Record<string, unknown> = {
  "name.first": "Ash",
  "name.last": "Dust",
  birthday: "1990-04-12",
  phone: "+27 82 555 1234",
  country: "South Africa",
  "id.type": "sa_id",
  "id.number": "1234567890123",
  "team_interest.kitchen": 4,
  "team_interest.structures": 0,
  "team_interest.power_and_lighting": 1,
  "team_interest.sanitation_and_water": 0,
  "team_interest.health_and_safety": 0,
  "team_interest.art_and_activities": 2,
  "team_interest.ministry_of_memes": 3,
  "team_interest.ministry_of_vibes": 5,
  "competency.cooking": "teach",
  "competency.hardware": "assist",
  "logistics.driving": "yes",
  "logistics.onsite_before": "yes_full",
  "logistics.onsite_after": "yes_partial",
  "history.camp404_before": "no",
  "history.afrikaburn_count": "1_2",
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

  it("rejects slider values outside [min, max]", () => {
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
