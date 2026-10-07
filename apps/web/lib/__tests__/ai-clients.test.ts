import { afterEach, describe, expect, it, vi } from "vitest";

// No automatic retries on any AI call (owner, 2026-10-07). Both SDKs retry a
// 429 or a 5xx twice by default, so each shared client is built with
// maxRetries: 0, and every call through it inherits that.

const anthropicCtor = vi.fn();
const groqCtor = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(options: unknown) {
      anthropicCtor(options);
    }
  },
}));
vi.mock("groq-sdk", () => ({
  default: class {
    audio = {
      transcriptions: { create: vi.fn(async () => ({ text: "hi" })) },
    };
    constructor(options: unknown) {
      groqCtor(options);
    }
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the AI clients", () => {
  it("builds the Anthropic client with no retries", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const { anthropic } = await import("@/lib/anthropic");
    anthropic();
    expect(anthropicCtor).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });

  it("builds the Groq client with no retries", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const { transcribeAudio } = await import("@/lib/groq");
    await transcribeAudio(new File(["x"], "clip.webm"));
    expect(groqCtor).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: 0 }),
    );
  });
});
