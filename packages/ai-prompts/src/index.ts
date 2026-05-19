export { recipeNormalisationPrompt } from "./recipe-normalisation";
export { manualGenerationPrompt } from "./manual-generation";
export { voiceIntentPrompt } from "./voice-intent";

/**
 * Versioned prompt templates. Bump the `version` whenever the template
 * meaningfully changes — this is captured in the `documents.version`
 * column and in audit logs.
 */
export const PROMPT_VERSIONS = {
  recipeNormalisation: "2026-05-19.1",
  manualGeneration: "2026-05-19.1",
  voiceIntent: "2026-05-19.1",
} as const;
