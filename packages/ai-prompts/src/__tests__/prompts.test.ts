import { describe, expect, it } from "vitest";
import { voiceIntentPrompt } from "../voice-intent";
import { recipeNormalisationPrompt } from "../recipe-normalisation";
import { manualGenerationPrompt } from "../manual-generation";

describe("voiceIntentPrompt", () => {
  it("interpolates the transcript into the user message verbatim", () => {
    expect(voiceIntentPrompt.user("turn off the lights")).toBe(
      'Transcript: "turn off the lights"',
    );
  });

  it("system prompt covers every intent the discriminated union expects", () => {
    // The VoiceIntent zod schema in @camp404/types lists these five intents;
    // if a new one is added to the model side, the system prompt must be kept
    // in sync or the LLM will silently never emit it.
    for (const intent of [
      "add_recipe",
      "mark_shift_done",
      "log_expense",
      "note_to_team",
      "unknown",
    ]) {
      expect(voiceIntentPrompt.system).toContain(intent);
    }
  });
});

describe("recipeNormalisationPrompt", () => {
  it("system prompt enforces the vegan camp baseline", () => {
    expect(recipeNormalisationPrompt.system).toMatch(/vegan/i);
  });

  it("user message wraps the raw recipe in a <recipe> tag", () => {
    const out = recipeNormalisationPrompt.user("2 onions, fried");
    expect(out).toContain("<recipe>\n2 onions, fried\n</recipe>");
  });
});

describe("manualGenerationPrompt", () => {
  it("formats each step with its photo URL and transcript and 1-based numbering", () => {
    const out = manualGenerationPrompt.user(
      [
        { photoUrl: "https://x/1.jpg", transcript: "Strike the post" },
        { photoUrl: "https://x/2.jpg", transcript: "Anchor the guy line" },
      ],
      "Shade Structure",
    );
    expect(out).toContain('Manual title: "Shade Structure"');
    expect(out).toContain("Step 1:");
    expect(out).toContain("Photo: https://x/1.jpg");
    expect(out).toContain("Description: Strike the post");
    expect(out).toContain("Step 2:");
    expect(out).toContain("Description: Anchor the guy line");
  });
});
