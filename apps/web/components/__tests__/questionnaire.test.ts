import { describe, expect, it } from "vitest";
import { Questionnaire, validateResponses } from "@camp404/types";
import { QUESTIONNAIRE } from "@/lib/questionnaire";

// Minimum set of answers that satisfies every required question in the
// current catalogue. Update alongside questionnaire.ts.
const validResponses: Record<string, unknown> = {
  "name.first": "Ash",
  "name.last": "Dust",
  nationality: "South African",
  "id.type": "sa_id",
  "id.number": "1234567890123",
  "telegram.handle": "ash_in_the_dust",
  "ticket.assistance": "no",
  "intent.statement": "Cook, build, vibe.",
  "skills.kitchen": 7,
  "skills.vibes": 5,
  "skills.memes": 4,
  "skills.power_lighting": 2,
  "bio.statement": "Long-time burner, first-time member.",
  "referral.source": "member",
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
      "skills.kitchen": 99,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["skills.kitchen"]).toBeDefined();
  });

  it("rejects unknown single-select values", () => {
    const result = validateResponses(QUESTIONNAIRE, {
      ...validResponses,
      "ticket.assistance": "definitely",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["ticket.assistance"]).toBeDefined();
  });

  it("treats burner history as optional (virgin burner allowed)", () => {
    // No afrikaburn_years selected at all — virgin burner — must still pass.
    const result = validateResponses(QUESTIONNAIRE, validResponses);
    expect(result.ok).toBe(true);
  });
});
