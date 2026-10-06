// @vitest-environment node
import { describe, expect, it } from "vitest";
import { voiceCommandPrompt } from "@camp404/ai-prompts";
import type { McpScope } from "../../mcp/scope";
import { pickAreas } from "../areas";
import { requestTools } from "../command";
import { websitePaths } from "../service";
import { toolsFor } from "../tools";
import { CASES } from "../__eval__/cases";

// What one call sends before the conversation (#356, cost): the tools of the
// picked areas and the system prompt. Estimated at 3.6 characters a token
// (JSON and English); the eval's live run measures the real count. A guard
// against the request quietly growing back.

const CAPTAIN: McpScope = {
  campUserId: "c",
  rank: "captain",
  viewerRank: "captain",
  leadTeams: [],
  memberTeams: [],
  isDriver: false,
  isCaptain: true,
};

function tokens(words?: string): number {
  const tools = toolsFor(CAPTAIN, words ? pickAreas(words).areas : undefined);
  const body =
    JSON.stringify(requestTools(tools, websitePaths())) +
    voiceCommandPrompt.system;
  return Math.round(body.length / 3.6);
}

describe("the size of a voice request", () => {
  it("sends a fraction of the tools for a typical command", () => {
    const sizes = CASES.map((c) => tokens(c.words)).sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)]!;
    expect(median).toBeLessThan(4_500);
    expect(median * 4).toBeLessThan(tokens());
  });

  it("falls back to every area only for words it cannot place", () => {
    const fallbacks = CASES.filter((c) => pickAreas(c.words).fallback);
    expect(fallbacks.length).toBeLessThanOrEqual(6);
    expect(fallbacks.every((c) => c.expect.kind === "refused")).toBe(true);
  });

  it("sends no connector 'Who:' line and no link in a tool's description", () => {
    const sent = requestTools(toolsFor(CAPTAIN), websitePaths());
    for (const t of sent) {
      expect(t.description ?? "").not.toMatch(/^Who:/);
      expect((t.description ?? "").length).toBeLessThanOrEqual(421);
    }
  });
});
