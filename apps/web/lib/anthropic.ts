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

// Camp 404 standardises on Claude Opus 4.8 for high-quality reasoning and
// Claude Haiku 4.5 for cheap, fast intent classification. Claude Sonnet 5.5
// turns a captain's spoken words into actions (voice, #356; owner,
// 2026-10-06). Each is a deliberate pin: never swap one in place.
export const MODELS = {
  opus: "claude-opus-4-8",
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-5-5",
} as const;
