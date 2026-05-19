import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Camp 404 standardises on Claude Opus 4.7 for high-quality reasoning and
// Claude Haiku 4.5 for cheap, fast intent classification.
export const MODELS = {
  opus: "claude-opus-4-7",
  haiku: "claude-haiku-4-5-20251001",
} as const;
