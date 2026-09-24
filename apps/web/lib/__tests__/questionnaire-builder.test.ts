import { describe, expect, it } from "vitest";
import { MEDICAL_AUDIENCE_NOTE } from "@camp404/core";
import { pageQuestions, validateResponses } from "@camp404/types";
import {
  BURNER_PROFILE_TEMPLATE,
  DEFAULT_TEAM_OPTIONS,
  QUESTIONNAIRE_VERSION,
  buildQuestionnaire,
  resolveTeamBindings,
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
  "emergency.1.name": "Ada Byron",
  "emergency.1.phone": "+27 82 555 0199",
  "emergency.1.relationship": "sister",
};

describe("buildQuestionnaire", () => {
  it("builds one team-interest 0–6 number picker per team, keyed + labelled from the input", () => {
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
    // Board OB-step-06: a 0–6 number picker, not a slider.
    const first = pageQuestions(page)[0]!;
    expect(first.kind).toBe("number");
    expect(first.prompt).toBe("Cuisine"); // the relabel flows into the prompt
    if (first.kind === "number") {
      expect(first.min).toBe(0);
      expect(first.max).toBe(6);
    }
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

  it("holds the version literal (a bump marks a shape change)", () => {
    // Bump only for a shape change (a question added or removed, a required
    // flag flipped). Relabel/reorder/archive must NOT change it, so pin the
    // literal: a deliberate bump updates this assertion on purpose.
    //
    // A bump does not by itself re-ask members who already finished: nothing
    // compares a completed burner_profile gate to the current version. Asking
    // everyone again would take its own deliberate migration. v10 added the
    // emergency contacts page (2026-09-16); members who finished before it
    // are asked the next time they save My forms.
    expect(QUESTIONNAIRE_VERSION).toBe("2026.09.16-v10");
  });
});

describe("the teams added in #236 and the owner's final list on the burner profile", () => {
  const NEW_KEYS = [
    "transport_and_logistics",
    "communications_and_hr",
    "mutant_vehicle",
    "sound",
    "water",
  ];
  // What production serves: the stored template with the camp's teams bound in.
  const q = resolveTeamBindings(BURNER_PROFILE_TEMPLATE, DEFAULT_TEAM_OPTIONS);
  const questions = q.pages.flatMap((p) =>
    p.kind === "questions" ? pageQuestions(p) : [],
  );

  it("asks about each new team as an optional 0–6 pick", () => {
    const page = q.pages.find((p) => p.id === "team_interests");
    if (page?.kind !== "questions") throw new Error("expected questions page");
    const byId = new Map(pageQuestions(page).map((x) => [x.id, x]));
    for (const key of NEW_KEYS) {
      const question = byId.get(`team_interest.${key}`);
      expect(question, key).toBeDefined();
      expect(question?.required).toBe(false);
    }
  });

  it("offers each new team to someone who wants to lead", () => {
    const lead = questions.find((x) => x.id === "team_lead.interests");
    const values =
      lead && "options" in lead ? lead.options.map((o) => o.value) : [];
    expect(values).toEqual(expect.arrayContaining(NEW_KEYS));
  });

  it("keeps a profile finished before the new teams complete, so no one redoes it", () => {
    // A burner profile saved when the camp had nine teams: an answer for each
    // of those, and none for the five added since.
    const oldTeams = DEFAULT_TEAM_OPTIONS.filter(
      (t) => !NEW_KEYS.includes(t.value),
    );
    expect(oldTeams).toHaveLength(9);
    const stored = {
      ...requiredAnswers,
      ...Object.fromEntries(
        oldTeams.map((t) => [`team_interest.${t.value}`, 3]),
      ),
      "team_lead.interests": ["kitchen"],
    };

    const result = validateResponses(q, stored);

    expect(result.ok).toBe(true);
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

describe("the safety pages tell the member who can see their answers", () => {
  it("puts MEDICAL_AUDIENCE_NOTE on the emergency contacts and dietary pages", () => {
    const q = buildQuestionnaire(ACTIVE);
    for (const id of ["emergency_contacts", "dietary"]) {
      const page = q.pages.find((p) => p.id === id);
      expect(page && "subtitle" in page ? page.subtitle : "").toContain(
        MEDICAL_AUDIENCE_NOTE,
      );
    }
  });

  it("asks for one required contact and one optional, each marked by role", () => {
    const page = buildQuestionnaire(ACTIVE).pages.find(
      (p) => p.id === "emergency_contacts",
    );
    const questions = page?.kind === "questions" ? pageQuestions(page) : [];
    expect(
      questions.map((q) => [q.id, "role" in q ? q.role : null, q.required]),
    ).toEqual([
      ["emergency.1.name", "emergency_contact_name", true],
      ["emergency.1.phone", "emergency_contact_phone", true],
      ["emergency.1.relationship", "emergency_contact_relationship", true],
      ["emergency.2.name", "emergency_contact_name", false],
      ["emergency.2.phone", "emergency_contact_phone", false],
      ["emergency.2.relationship", "emergency_contact_relationship", false],
    ]);
  });
});
