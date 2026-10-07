// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../inventory", () => ({ getInventoryItem: vi.fn() }));
vi.mock("../../recipes", () => ({ getRecipeDetail: vi.fn() }));
vi.mock("../reads", () => ({
  readNames: vi.fn(async () => new Map()),
  readTeamLabels: vi.fn(async () => ({ kitchen: "Kitchen" })),
  readTeamPeople: vi.fn(async () => []),
}));
vi.mock("../../questionnaire-config", () => ({
  getQuestionnaireForPicker: vi.fn(async () => ({
    title: "Burner profile",
    pages: [
      {
        kind: "questions",
        title: "You",
        questions: [
          {
            id: "playa_name",
            kind: "short_text",
            prompt: "Your playa name",
            shortLabel: "Playa name",
          },
        ],
      },
    ],
  })),
}));
vi.mock("@camp404/db/documents", () => ({
  getDocumentBySlug: vi.fn(async () => ({ title: "Water", version: 3 })),
}));

import { getInventoryItem } from "../../inventory";
import { getRecipeDetail } from "../../recipes";
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

  it("names the gear item a change is for, and says what it is now", async () => {
    vi.mocked(getInventoryItem).mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Gazebo",
      quantity: 4,
      unit: null,
      condition: "good",
      location: "storage_unit",
    } as never);
    const p = await PREVIEWS.propose_inventory_change!(
      {
        itemId: "22222222-2222-4222-8222-222222222222",
        quantity: 3,
        condition: "broken",
        location: "storage_unit",
      },
      ctx,
    );
    expect(p.sentence).toBe(
      "Suggest a change to “Gazebo”: count 3, broken, storage unit",
    );
    expect(p.facts).toContain("now 4, good, storage unit");
    expect(p.sentence).not.toContain("undefined");
    expect(p.blocked).toBeUndefined();
  });

  it("refuses a gear change for an item that isn't there", async () => {
    vi.mocked(getInventoryItem).mockResolvedValue(null);
    const p = await PREVIEWS.propose_inventory_change!(
      { itemId: "22222222-2222-4222-8222-222222222222", condition: "broken" },
      ctx,
    );
    expect(p.blocked).toBe("That gear item isn't in the inventory.");
  });

  it("names the recipe a cook's note goes on", async () => {
    vi.mocked(getRecipeDetail).mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      title: "Shakshuka",
      acceptedVersionId: "44444444-4444-4444-8444-444444444444",
    } as never);
    const p = await PREVIEWS.add_recipe_lesson!(
      {
        recipeId: "33333333-3333-4333-8333-333333333333",
        body: "Double the cumin",
      },
      ctx,
    );
    expect(p.sentence).toBe(
      "Add a cook's note to “Shakshuka”: “Double the cumin”",
    );
    expect(p.blocked).toBeUndefined();
  });

  it("shows the new value of each whole-field write", async () => {
    const doc = await PREVIEWS.update_document!(
      { slug: "water", markdown: "Bring 6 litres a day.", team: "kitchen" },
      ctx,
    );
    expect(doc.change).toEqual([
      "Team: Kitchen",
      "Text (the whole chapter): “Bring 6 litres a day.”",
    ]);
    const contacts = await PREVIEWS.update_my_emergency_contacts!(
      {
        contacts: [
          { name: "Sam Botha", relationship: "sister", phone: "+27825550101" },
        ],
      },
      ctx,
    );
    expect(contacts.change).toEqual([
      "Contacts: Sam Botha, sister, +27825550101",
    ]);
    const diet = await PREVIEWS.update_my_dietary_requirements!(
      { foods: [{ food: "peanuts", reaction: "anaphylaxis" }], diets: [] },
      ctx,
    );
    expect(diet.change).toEqual([
      "Foods: Peanuts (anaphylaxis)",
      "Diets: (none)",
    ]);
    const profile = await PREVIEWS.update_my_burner_profile!(
      { responses: { playa_name: "Dusty" } },
      ctx,
    );
    expect(profile.sentence).toBe("Change your burner profile: Playa name");
    expect(profile.change).toEqual(["Playa name: “Dusty”"]);
  });

  it("cuts a long value, and says how much more there is", async () => {
    const p = await PREVIEWS.update_document!(
      { slug: "water", markdown: "a".repeat(350) },
      ctx,
    );
    expect(p.change).toEqual([
      `Text (the whole chapter): “${"a".repeat(300)}…” (50 more characters)`,
    ]);
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
