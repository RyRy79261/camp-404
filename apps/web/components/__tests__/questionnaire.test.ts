import { describe, expect, it } from "vitest";
import { Questionnaire, validateResponses } from "@camp404/types";
import { QUESTIONNAIRE } from "@/lib/questionnaire";

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
    const responses: Record<string, unknown> = {
      "chef.create": 5,
      "chef.teach": 3,
      "chef.execute": 7,
      "chef.burn": 2,
      "build.power_tools": 4,
      "fire.experience": "spinner",
    };
    const result = validateResponses(QUESTIONNAIRE, responses);
    expect(result.ok).toBe(true);
  });

  it("rejects slider values outside [min, max]", () => {
    const responses: Record<string, unknown> = {
      "chef.create": 99,
      "chef.teach": 0,
      "chef.execute": 0,
      "chef.burn": 0,
      "build.power_tools": 0,
      "fire.experience": "none",
    };
    const result = validateResponses(QUESTIONNAIRE, responses);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["chef.create"]).toBeDefined();
  });

  it("rejects unknown single-select values", () => {
    const responses: Record<string, unknown> = {
      "chef.create": 0,
      "chef.teach": 0,
      "chef.execute": 0,
      "chef.burn": 0,
      "build.power_tools": 0,
      "fire.experience": "wizard",
    };
    const result = validateResponses(QUESTIONNAIRE, responses);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors["fire.experience"]).toBeDefined();
  });
});
