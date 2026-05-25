import { describe, expect, it } from "vitest";
import type { Questionnaire } from "../questionnaire";
import { validateResponses } from "../questionnaire";

const sample: Questionnaire = {
  version: "v1",
  pages: [
    {
      id: "page1",
      kind: "questions",
      title: "Basics",
      questions: [
        {
          id: "experience",
          kind: "slider",
          prompt: "How many burns?",
          min: 0,
          max: 20,
          step: 1,
          required: true,
        },
        {
          id: "tier",
          kind: "single_select",
          prompt: "Membership tier?",
          options: [
            { value: "full", label: "Full" },
            { value: "build_week_only", label: "Build week only" },
          ],
          required: true,
        },
        {
          id: "diet",
          kind: "multi_select",
          prompt: "Dietary requirements?",
          options: [
            { value: "vegan", label: "Vegan" },
            { value: "gluten_free", label: "Gluten free" },
            { value: "nut_free", label: "Nut free" },
          ],
          required: false,
        },
        {
          id: "bio",
          kind: "short_text",
          prompt: "Camp name",
          maxLength: 30,
          required: false,
        },
      ],
    },
  ],
};

describe("validateResponses", () => {
  it("accepts a fully valid response set", () => {
    const result = validateResponses(sample, {
      experience: 3,
      tier: "full",
      diet: ["vegan", "nut_free"],
      bio: "Sparkle",
    });
    expect(result).toEqual({
      ok: true,
      responses: {
        experience: 3,
        tier: "full",
        diet: ["vegan", "nut_free"],
        bio: "Sparkle",
      },
    });
  });

  it("rejects a slider value outside the configured range", () => {
    const result = validateResponses(sample, {
      experience: 99,
      tier: "full",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.experience).toMatch(/between 0 and 20/);
  });

  it("rejects a single_select value not in the options list", () => {
    const result = validateResponses(sample, {
      experience: 2,
      tier: "spectator",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.tier).toMatch(/valid option/);
  });

  it("silently filters multi_select values that are not in the allowed set", () => {
    const result = validateResponses(sample, {
      experience: 1,
      tier: "full",
      diet: ["vegan", "carnivore", "gluten_free"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.responses.diet).toEqual(["vegan", "gluten_free"]);
  });

  it("flags missing required questions but not missing optional ones", () => {
    const result = validateResponses(sample, {
      experience: 1,
      // tier omitted (required) → should error
      // diet omitted (optional) → should be fine
      // bio omitted (optional) → should be fine
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.tier).toMatch(/required/);
      expect(result.errors).not.toHaveProperty("diet");
      expect(result.errors).not.toHaveProperty("bio");
    }
  });

  it("enforces short_text maxLength", () => {
    const result = validateResponses(sample, {
      experience: 1,
      tier: "full",
      bio: "x".repeat(31),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.bio).toMatch(/Max 30/);
  });

  it("drops unknown response keys without erroring", () => {
    const result = validateResponses(sample, {
      experience: 1,
      tier: "full",
      removed_in_v2: "stale value",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.responses).not.toHaveProperty("removed_in_v2");
  });

  it("returns a root error when the payload itself is malformed", () => {
    const result = validateResponses(sample, "not an object");
    expect(result).toEqual({
      ok: false,
      errors: { _root: "Malformed response payload" },
    });
  });

  it("skips intro pages when validating (they have no questions to check)", () => {
    const withIntro: Questionnaire = {
      version: "v1",
      pages: [
        {
          id: "welcome",
          kind: "intro",
          heading: "Welcome to Camp 404",
          body: "We'll ask a few questions next.",
        },
        sample.pages[0]!,
      ],
    };
    const result = validateResponses(withIntro, {
      experience: 2,
      tier: "full",
    });
    expect(result.ok).toBe(true);
  });
});
