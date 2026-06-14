import { describe, expect, it } from "vitest";
import { validateResponses } from "@camp404/types";
import {
  QUESTIONNAIRE_VERSION,
  buildQuestionnaire,
  type TeamOption,
} from "@/lib/questionnaire";

// Phase 3: the questionnaire's team-interest sliders + team-lead multi-select are
// built from the supplied teams. These cover the pure builder + the load-bearing
// ARCHIVE invariant: validating against the full team set (incl. archived) keeps
// an archived pick, whereas validating against the active-only picker would
// silently drop it (the multi_select validator filters unknown values) — which
// is exactly why the server resolves a "responses" catalogue of ALL teams.

const ACTIVE: TeamOption[] = [
  { value: "kitchen", label: "Kitchen" },
  { value: "structures", label: "Structures" },
];
const ARCHIVED: TeamOption = {
  value: "ministry_of_memes",
  label: "Ministry of Memes",
};

// Every required answer, so validateResponses returns ok and we can inspect how
// it treats the (optional) team_lead.interests multi-select.
const requiredAnswers: Record<string, unknown> = {
  birthday: "1990-04-12",
  phone: "+27 82 555 1234",
  country: "ZA",
  "id.type": "sa_id",
  "id.number": "1234567890123",
  "competency.cooking": "teach",
  "logistics.driving": "yes",
  "logistics.onsite_before": "yes_full",
  "logistics.onsite_after": "yes_partial",
  "history.afrikaburn_count": "1_2",
  "intent.this_year": "want",
  "bio.statement": "Long-time burner.",
};

describe("buildQuestionnaire", () => {
  it("builds one team-interest slider per team, keyed + labelled from the input", () => {
    const q = buildQuestionnaire([
      { value: "kitchen", label: "Cuisine" }, // relabelled
      { value: "structures", label: "Structures" },
    ]);
    const page = q.pages.find((p) => p.id === "team_interests");
    expect(page?.kind).toBe("questions");
    if (page?.kind !== "questions") throw new Error("expected questions page");
    expect(page.questions.map((x) => x.id)).toEqual([
      "team_interest.kitchen",
      "team_interest.structures",
    ]);
    // The relabel flows into the slider prompt.
    expect(page.questions[0]?.prompt).toBe("Cuisine");
  });

  it("builds the team-lead multi-select options from the input teams", () => {
    const q = buildQuestionnaire(ACTIVE);
    const lead = q.pages
      .flatMap((p) => (p.kind === "questions" ? p.questions : []))
      .find((x) => x.id === "team_lead.interests");
    expect(lead && "options" in lead && lead.options).toEqual(ACTIVE);
  });

  it("pins the version regardless of the team set", () => {
    expect(buildQuestionnaire(ACTIVE).version).toBe(QUESTIONNAIRE_VERSION);
    expect(buildQuestionnaire([...ACTIVE, ARCHIVED]).version).toBe(
      QUESTIONNAIRE_VERSION,
    );
  });

  it("holds the version literal (changing it re-opens the gate for every member)", () => {
    // A bump forces a mass re-submit of the burner profile. Relabel/reorder/
    // archive must NOT change it — so pin the literal: a deliberate bump must
    // update this assertion (and own the gate-reopening migration) on purpose.
    expect(QUESTIONNAIRE_VERSION).toBe("2026.06.04-v9");
  });
});

describe("the archive validation invariant", () => {
  it("keeps an archived team pick when validating against the full team set", () => {
    const full = buildQuestionnaire([...ACTIVE, ARCHIVED]);
    const result = validateResponses(full, {
      ...requiredAnswers,
      "team_lead.interests": [ARCHIVED.value],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.responses["team_lead.interests"]).toEqual([ARCHIVED.value]);
  });

  it("silently drops an archived pick against the active-only picker (why responses use the full set)", () => {
    const picker = buildQuestionnaire(ACTIVE); // no archived team in options
    const result = validateResponses(picker, {
      ...requiredAnswers,
      "team_lead.interests": [ARCHIVED.value],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The validator filters values not in the options → the pick is lost.
    expect(result.responses["team_lead.interests"]).toEqual([]);
  });
});
