// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { McpScope } from "../../mcp/scope";
import { PREVIEWS } from "../previews";
import { resolveOutcome } from "../resolve";

// Review fixes (#356, PR #366): what Do runs is what the row says, the row
// never reads "undefined", and an answer cannot link off the site.

const SCOPE: McpScope = {
  campUserId: "11111111-1111-4111-8111-111111111111",
  rank: "captain",
  viewerRank: "captain",
  leadTeams: [],
  memberTeams: [],
  isDriver: false,
  isCaptain: true,
};
const ctx = { scope: SCOPE, now: new Date("2026-10-06T10:00:00Z") };

describe("previews", () => {
  it("keeps the dietary pick-list the captain said, so Do saves it", async () => {
    const args = {
      foods: [{ food: "peanuts", reaction: "anaphylaxis" }],
      diets: ["vegan"],
    };
    const p = await PREVIEWS.update_my_dietary_requirements!(args, ctx);
    expect(p.args).toEqual(args);
    expect(p.sentence).toBe(
      "Replace your dietary pick-list: 1 food, diets vegan",
    );
  });

  it("writes a gear change from the parts that were said, never 'undefined'", async () => {
    const p = await PREVIEWS.propose_inventory_change!(
      { itemId: "22222222-2222-4222-8222-222222222222", condition: "broken" },
      ctx,
    );
    expect(p.sentence).toBe("Suggest a change to a gear item: broken");
    expect(p.sentence).not.toContain("undefined");
  });
});

describe("answers", () => {
  it("drops a link that would leave the site", async () => {
    const outcome = await resolveOutcome(
      {
        kind: "reply",
        writes: [],
        ask: null,
        answers: [
          { text: "Off site", path: "//evil.example/x" },
          { text: "On site", path: "/calendar" },
        ],
        cannot: null,
        unsure: null,
        unknown: [],
        reads: [],
        usage: {
          calls: 1,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
      {
        scope: SCOPE,
        tools: [],
        words: "what's on",
        sessionId: "s",
        sealKey: "k",
        now: ctx.now,
        readRoster: async () => [],
        readWaitingClaims: async () => [],
      },
    );
    expect(outcome).toEqual({
      kind: "answers",
      answers: [
        { text: "Off site", path: null },
        { text: "On site", path: "/calendar" },
      ],
    });
  });
});
