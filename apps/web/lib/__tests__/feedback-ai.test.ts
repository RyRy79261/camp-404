import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/anthropic", () => ({
  anthropic: vi.fn(),
  MODELS: { opus: "claude-opus-4-8", haiku: "claude-haiku-4-5-20251001" },
}));

import { structureWithAi } from "@/lib/feedback-ai";
import { anthropic } from "@/lib/anthropic";

function clientReturning(content: unknown) {
  return {
    messages: { create: vi.fn().mockResolvedValue({ content }) },
  };
}

describe("structureWithAi", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("returns the parsed structured report from a tool_use block", async () => {
    vi.mocked(anthropic).mockReturnValue(
      clientReturning([
        {
          type: "tool_use",
          name: "format_report",
          input: { title: "T", summary: "S" },
        },
      ]) as never,
    );
    expect(await structureWithAi("bug", "it broke")).toEqual({
      title: "T",
      summary: "S",
    });
  });

  it("drops a severity the model sends anyway", async () => {
    vi.mocked(anthropic).mockReturnValue(
      clientReturning([
        {
          type: "tool_use",
          name: "format_report",
          input: { title: "T", summary: "S", severity: "critical" },
        },
      ]) as never,
    );
    expect(await structureWithAi("bug", "it broke")).toEqual({
      title: "T",
      summary: "S",
    });
  });

  it("does not ask the model for a severity", async () => {
    const create = vi.fn(async () => ({ content: [] }));
    vi.mocked(anthropic).mockReturnValue({ messages: { create } } as never);
    await structureWithAi("bug", "it broke");
    expect(JSON.stringify(create.mock.calls[0])).not.toMatch(/severity/i);
  });

  it("returns null when the client throws (e.g. no API key)", async () => {
    vi.mocked(anthropic).mockImplementation(() => {
      throw new Error("ANTHROPIC_API_KEY is not set");
    });
    expect(await structureWithAi("bug", "x")).toBeNull();
  });

  it("returns null when no tool_use block is present", async () => {
    vi.mocked(anthropic).mockReturnValue(
      clientReturning([{ type: "text", text: "hi" }]) as never,
    );
    expect(await structureWithAi("bug", "x")).toBeNull();
  });

  it("returns null when the tool input fails schema validation", async () => {
    vi.mocked(anthropic).mockReturnValue(
      clientReturning([
        { type: "tool_use", name: "format_report", input: { summary: "no title" } },
      ]) as never,
    );
    expect(await structureWithAi("bug", "x")).toBeNull();
  });
});
