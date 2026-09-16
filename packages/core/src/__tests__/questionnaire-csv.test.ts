import { describe, expect, it } from "vitest";
import { Question } from "@camp404/types";

import { CSV_BOM, CSV_EOL } from "../csv";
import {
  buildQuestionnaireCsv,
  buildQuestionnaireCsvExport,
  buildQuestionnaireCsvRows,
  collectOrphanFieldIds,
  displayOrphanedAnswer,
  questionnaireCsvFilename,
  type QuestionnaireCsvRespondent,
} from "../questionnaire-csv";

// Parsed rather than cast: zod fills `required`, so a hand-written literal
// would need every default spelled out and would drift from the real shape.
const NAME = Question.parse({
  id: "name",
  kind: "short_text",
  prompt: "Playa name",
});

const MEAL = Question.parse({
  id: "meal",
  kind: "single_select",
  prompt: "Dinner slot",
  options: [
    { value: "early", label: "Early sitting" },
    { value: "late", label: "Late sitting" },
  ],
});

const SKILLS = Question.parse({
  id: "skills",
  kind: "multi_select",
  prompt: "Skills",
  options: [
    { value: "weld", label: "Welding" },
    { value: "cook", label: "Cooking" },
  ],
});

const COMFORT = Question.parse({
  id: "comfort",
  kind: "scale",
  prompt: "Comfort with power tools",
  steps: [
    { value: "low", label: "Never touched one" },
    { value: "high", label: "Own three" },
  ],
});

const CYCLE = 2026;

function respondent(
  over: Partial<QuestionnaireCsvRespondent> = {},
): QuestionnaireCsvRespondent {
  return {
    name: "Dusty",
    cycle: CYCLE,
    definitionVersion: "v1",
    submittedAt: new Date("2026-03-01T09:30:00.000Z"),
    responses: {},
    ...over,
  };
}

/** The file split back into logical rows, BOM stripped. */
function rowsOf(csv: string): string[] {
  return csv.replace(CSV_BOM, "").split(CSV_EOL).filter(Boolean);
}

describe("buildQuestionnaireCsvRows — shape", () => {
  it("leads with Member, Year, Submitted, Version then the questions in order", () => {
    const rows = buildQuestionnaireCsvRows({
      questions: [NAME, MEAL],
      respondents: [],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([
      "Member",
      "Year",
      "Submitted",
      "Version",
      "Playa name",
      "Dinner slot",
    ]);
  });

  it("writes one row per respondent, with the answers resolved to labels", () => {
    const rows = buildQuestionnaireCsvRows({
      questions: [NAME, MEAL],
      respondents: [
        respondent({ responses: { name: "Dusty", meal: "late" } }),
      ],
    });
    expect(rows[1]).toEqual([
      "Dusty",
      2026,
      "2026-03-01T09:30:00.000Z",
      "v1",
      "Dusty",
      // The option LABEL, not the stored `late` — the same string the screen
      // shows, because both go through displayResponseValue.
      "Late sitting",
    ]);
  });

  it("leaves Submitted blank for a member who is still mid-form", () => {
    const rows = buildQuestionnaireCsvRows({
      questions: [NAME],
      respondents: [respondent({ submittedAt: null })],
    });
    expect(rows[1]?.[2]).toBe("");
  });

  it("disambiguates duplicate prompts with the field id, and only those", () => {
    const dupA = Question.parse({
      id: "a",
      kind: "short_text",
      prompt: "Notes",
    });
    const dupB = Question.parse({
      id: "b",
      kind: "short_text",
      prompt: "Notes",
    });
    const rows = buildQuestionnaireCsvRows({
      questions: [NAME, dupA, dupB],
      respondents: [],
    });
    expect(rows[0]).toEqual([
      "Member",
      "Year",
      "Submitted",
      "Version",
      "Playa name",
      "Notes (a)",
      "Notes (b)",
    ]);
  });
});

describe("the four robustness properties", () => {
  it("1. a question added after someone answered reports an honest skip", () => {
    // COMFORT was added later; this member's map has no `comfort` key at all.
    const rows = buildQuestionnaireCsvRows({
      questions: [NAME, COMFORT],
      respondents: [respondent({ responses: { name: "Dusty" } })],
    });
    expect(rows[1]?.[5]).toBe("—");
    // ...and the column still exists, so the skip is countable rather than
    // invisible.
    expect(rows[0]?.[5]).toBe("Comfort with power tools");
  });

  it("2. an answer whose question no longer exists gets its own column", () => {
    const rows = buildQuestionnaireCsvRows({
      questions: [NAME],
      respondents: [
        respondent({ responses: { name: "Dusty", ghost: "still here" } }),
      ],
    });
    expect(rows[0]?.[5]).toBe("ghost (removed question)");
    expect(rows[1]?.[5]).toBe("still here");
  });

  it("3. a deleted option still gets a cell, labelled by its raw stored value", () => {
    const rows = buildQuestionnaireCsvRows({
      questions: [MEAL, SKILLS],
      respondents: [
        respondent({
          responses: { meal: "midnight", skills: ["weld", "juggling"] },
        }),
      ],
    });
    expect(rows[1]?.[4]).toBe("midnight");
    expect(rows[1]?.[5]).toBe("Welding, juggling");
  });

  it("4. an out-of-range scale value keeps itself instead of being clamped", () => {
    const rows = buildQuestionnaireCsvRows({
      questions: [COMFORT],
      respondents: [respondent({ responses: { comfort: "stratospheric" } })],
    });
    expect(rows[1]?.[4]).toBe("stratospheric");
  });
});

describe("the year", () => {
  it("stamps each row with the year its answers belong to", () => {
    const rows = buildQuestionnaireCsvRows({
      questions: [NAME],
      respondents: [
        respondent({ name: "Dusty", cycle: 2026 }),
        respondent({ name: "Ash", cycle: 2025 }),
      ],
    });
    // A blended export is VISIBLE, never silent — the Year column differs.
    expect(rows[1]?.[1]).toBe(2026);
    expect(rows[2]?.[1]).toBe(2025);
  });

  it("puts the year in the filename", () => {
    expect(questionnaireCsvFilename("Camp Sign-Up", 2026)).toBe(
      "camp-sign-up-2026-responses.csv",
    );
  });
});

describe("collectOrphanFieldIds", () => {
  it("returns unknown keys once, in first-seen order", () => {
    expect(
      collectOrphanFieldIds(
        [NAME],
        [
          { responses: { name: "a", zeta: 1 } },
          { responses: { alpha: 2, zeta: 3 } },
        ],
      ),
    ).toEqual(["zeta", "alpha"]);
  });

  it("returns nothing when every key has a question", () => {
    expect(
      collectOrphanFieldIds([NAME, MEAL], [{ responses: { name: "a" } }]),
    ).toEqual([]);
  });
});

describe("displayOrphanedAnswer", () => {
  it("formats the raw value the way the fallback arm would", () => {
    expect(displayOrphanedAnswer("free text")).toBe("free text");
    expect(displayOrphanedAnswer(7)).toBe("7");
    expect(displayOrphanedAnswer(["a", "b"])).toBe("a, b");
    expect(displayOrphanedAnswer(true)).toBe("Yes");
    expect(displayOrphanedAnswer(false)).toBe("No");
  });

  it("dashes an empty value", () => {
    expect(displayOrphanedAnswer(undefined)).toBe("—");
    expect(displayOrphanedAnswer(null)).toBe("—");
    expect(displayOrphanedAnswer("")).toBe("—");
    expect(displayOrphanedAnswer([])).toBe("—");
  });
});

describe("buildQuestionnaireCsv — the file", () => {
  it("carries the BOM and CRLF terminators", () => {
    const csv = buildQuestionnaireCsv({
      questions: [NAME],
      respondents: [respondent({ responses: { name: "Zoë" } })],
    });
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.endsWith(CSV_EOL)).toBe(true);
    expect(csv).toContain("Zoë");
  });

  it("round-trips a member name holding a comma, an accent and a quote", () => {
    const csv = buildQuestionnaireCsv({
      questions: [NAME],
      respondents: [respondent({ name: 'Naudé, Zoë "Sparks"' })],
    });
    expect(rowsOf(csv)[1]).toBe(
      '"Naudé, Zoë ""Sparks""",2026,2026-03-01T09:30:00.000Z,v1,—',
    );
  });

  it("neutralises a formula a member typed into a free-text answer", () => {
    const csv = buildQuestionnaireCsv({
      questions: [NAME],
      respondents: [
        respondent({ name: "Dusty", responses: { name: "=1+1" } }),
      ],
    });
    expect(csv).toContain("'=1+1");
    expect(csv).not.toContain(",=1+1");
  });

  it("keeps a multi-line answer inside one quoted cell", () => {
    const notes = Question.parse({
      id: "notes",
      kind: "long_text",
      prompt: "Anything else",
    });
    const csv = buildQuestionnaireCsv({
      questions: [notes],
      respondents: [
        respondent({ responses: { notes: "first line\nsecond line" } }),
      ],
    });
    // Two logical rows (header + one member), even though the file holds a LF.
    expect(rowsOf(csv)).toHaveLength(2);
    expect(csv).toContain('"first line\nsecond line"');
  });

  it("still writes a header row when nobody has answered", () => {
    const csv = buildQuestionnaireCsv({ questions: [NAME], respondents: [] });
    expect(rowsOf(csv)).toEqual(["Member,Year,Submitted,Version,Playa name"]);
  });
});

describe("buildQuestionnaireCsvExport", () => {
  it("hands back filename, content and MIME in one call", () => {
    const out = buildQuestionnaireCsvExport({
      questionnaireKey: "sign-up",
      cycle: 2026,
      questions: [NAME],
      respondents: [respondent()],
    });
    expect(out.filename).toBe("sign-up-2026-responses.csv");
    expect(out.mimeType).toBe("text/csv;charset=utf-8");
    expect(out.content.startsWith(CSV_BOM)).toBe(true);
  });
});
