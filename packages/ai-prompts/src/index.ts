export { recipeNormalisationPrompt } from "./recipe-normalisation";
export { manualGenerationPrompt } from "./manual-generation";
export { voiceIntentPrompt } from "./voice-intent";
export { recipeImportPrompt, type RecipeImportInput } from "./recipe-import";
export { recipePlatesPrompt, type RecipePlatesInput } from "./recipe-plates";
export { recipeSourcePrompt, type RecipeSourceInput } from "./recipe-source";

/**
 * Versioned prompt templates. Bump the `version` whenever the template
 * meaningfully changes — this is captured in the `documents.version`
 * column and in audit logs.
 */
export const PROMPT_VERSIONS = {
  recipeNormalisation: "2026-05-19.1",
  manualGeneration: "2026-05-19.1",
  voiceIntent: "2026-05-19.1",
  recipeImport: "2026-09-25.1",
  recipePlates: "2026-09-25.1",
  recipeSource: "2026-09-24.1",
} as const;
