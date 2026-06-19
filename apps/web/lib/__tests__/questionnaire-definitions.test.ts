import { describe, expect, it } from "vitest";
import { DEFAULT_TEAMS } from "@camp404/db/camp-config";
import {
  BURNER_PROFILE_TEMPLATE,
  DEFAULT_TEAM_OPTIONS,
  buildQuestionnaire,
  parseStoredBuilderDefinition,
  parseStoredDefinition,
  resolveTeamBindings,
  type TeamOption,
} from "@/lib/questionnaire";

// P1 (definition persistence): the burner questionnaire moved from a hardcoded
// code constant to a stored-shaped template + a pure team-binding resolver. These
// tests pin the load-bearing guarantee — resolving the template reproduces the old
// buildQuestionnaire(teams) output EXACTLY, so persisting the definition changes no
// behaviour — plus the drift guard between the template's default teams and the
// camp-config defaults.

const SETS: Record<string, TeamOption[]> = {
  "active subset": [
    { value: "kitchen", label: "Kitchen" },
    { value: "structures", label: "Structures" },
  ],
  "relabelled teams": [
    { value: "kitchen", label: "Cuisine" },
    { value: "structures", label: "Big Builds" },
  ],
  "all incl. archived": [
    { value: "kitchen", label: "Kitchen" },
    { value: "structures", label: "Structures" },
    { value: "ministry_of_memes", label: "Ministry of Memes" },
  ],
  "single team": [{ value: "kitchen", label: "Kitchen" }],
};

describe("resolveTeamBindings ≡ buildQuestionnaire (behaviour-preserving)", () => {
  for (const [name, teams] of Object.entries(SETS)) {
    it(`reproduces buildQuestionnaire(${name}) from the stored template`, () => {
      expect(resolveTeamBindings(BURNER_PROFILE_TEMPLATE, teams)).toEqual(
        buildQuestionnaire(teams),
      );
    });
  }

  it("injects exactly the two team anchors and leaves every other page intact", () => {
    const teams = SETS["active subset"]!;
    const resolved = resolveTeamBindings(BURNER_PROFILE_TEMPLATE, teams);

    const interests = resolved.pages.find((p) => p.id === "team_interests");
    if (interests?.kind !== "questions") throw new Error("expected page");
    expect(interests.questions.map((q) => q.id)).toEqual([
      "team_interest.kitchen",
      "team_interest.structures",
    ]);

    const lead = resolved.pages
      .flatMap((p) => (p.kind === "questions" ? p.questions : []))
      .find((q) => q.id === "team_lead.interests");
    expect(lead && "options" in lead && lead.options).toEqual(teams);

    // Non-team pages are byte-identical to the template's.
    const nonTeam = (q: typeof resolved) =>
      q.pages.filter(
        (p) => p.id !== "team_interests" && p.kind === "questions",
      );
    expect(nonTeam(resolved)).toEqual(
      nonTeam(BURNER_PROFILE_TEMPLATE).map((p) =>
        p.kind === "questions"
          ? {
              ...p,
              questions: p.questions.map((q) =>
                q.id === "team_lead.interests" && "options" in q
                  ? { ...q, options: SETS["active subset"]! }
                  : q,
              ),
            }
          : p,
      ),
    );
  });
});

describe("DEFAULT_TEAM_OPTIONS drift guard", () => {
  it("mirrors the camp-config DEFAULT_TEAMS keys + labels, in order", () => {
    expect(DEFAULT_TEAM_OPTIONS.map((t) => t.value)).toEqual(
      [...DEFAULT_TEAMS].sort((a, b) => a.order - b.order).map((t) => t.key),
    );
    expect(DEFAULT_TEAM_OPTIONS.map((t) => t.label)).toEqual(
      [...DEFAULT_TEAMS].sort((a, b) => a.order - b.order).map((t) => t.label),
    );
  });
});

describe("parseStoredDefinition (validate-or-fall-back)", () => {
  const fallback = BURNER_PROFILE_TEMPLATE;

  it("returns a stored definition that validates", () => {
    // ≥2 teams so the team-lead multi_select satisfies its min(2) options.
    const stored = buildQuestionnaire([
      { value: "kitchen", label: "Kitchen" },
      { value: "structures", label: "Structures" },
    ]);
    expect(parseStoredDefinition(stored, fallback)).toEqual(stored);
  });

  it("falls back when the stored definition is malformed", () => {
    expect(
      parseStoredDefinition({ version: "x", pages: "not-an-array" }, fallback),
    ).toEqual(fallback);
  });

  it("falls back when the row is empty / absent JSON", () => {
    expect(parseStoredDefinition(null, fallback)).toEqual(fallback);
    expect(parseStoredDefinition(undefined, fallback)).toEqual(fallback);
  });

  it("passes the null fallback through for an unknown key with bad data", () => {
    expect(parseStoredDefinition({ nope: true }, null)).toBeNull();
  });
});

describe("parseStoredBuilderDefinition (data-only, no fallback)", () => {
  it("returns a valid builder definition", () => {
    const def = {
      version: "1",
      title: "Survey",
      pages: [
        {
          id: "p1",
          type: "question",
          title: "P",
          blocks: [
            {
              kind: "question",
              question: { id: "a", kind: "short_text", prompt: "A" },
            },
          ],
        },
      ],
    };
    const parsed = parseStoredBuilderDefinition(def);
    expect(parsed?.title).toBe("Survey");
  });

  it("returns null for malformed, legacy, or absent definitions", () => {
    expect(parseStoredBuilderDefinition({ version: "1", pages: "x" })).toBeNull();
    // A legacy Questionnaire (pages carry `questions`, not `blocks`) is not a
    // builder definition.
    expect(parseStoredBuilderDefinition(BURNER_PROFILE_TEMPLATE)).toBeNull();
    expect(parseStoredBuilderDefinition(null)).toBeNull();
  });
});
