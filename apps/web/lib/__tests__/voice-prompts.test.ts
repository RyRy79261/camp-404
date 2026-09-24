import { describe, expect, it } from "vitest";
import {
  QUESTIONNAIRE_PROMPT,
  RECIPE_PROMPT,
  voicePromptFor,
} from "../voice-prompts";

// Whisper reads only about 224 tokens of prompt, so each stays short; a key a
// form sends picks its prompt, and an unknown or inherited key picks none.

describe("voicePromptFor", () => {
  it("maps each form's key to its prompt", () => {
    expect(voicePromptFor("questionnaire")).toBe(QUESTIONNAIRE_PROMPT);
    expect(voicePromptFor("recipe")).toBe(RECIPE_PROMPT);
  });

  it("gives no prompt for an unknown or inherited key", () => {
    expect(voicePromptFor("")).toBeUndefined();
    expect(voicePromptFor("bug")).toBeUndefined();
    expect(voicePromptFor("toString")).toBeUndefined();
    expect(voicePromptFor("__proto__")).toBeUndefined();
  });

  it("keeps the recipe prompt short and names the kitchen's words", () => {
    // Roughly four characters a token: stay well under Whisper's limit.
    expect(RECIPE_PROMPT.length).toBeLessThan(700);
    for (const word of [
      "grams",
      "millilitres",
      "tablespoon",
      "teaspoon",
      "nutritional yeast",
      "chickpeas",
      "lentils",
      "tofu",
      "tempeh",
      "coconut milk",
      "potjie",
      "braai",
      "stock",
      "cumin",
      "turmeric",
      "garam masala",
    ]) {
      expect(RECIPE_PROMPT).toContain(word);
    }
  });
});
