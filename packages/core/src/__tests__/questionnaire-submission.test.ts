import { describe, expect, it } from "vitest";
import {
  BuilderQuestionnaire,
  PARTICIPATION_INTENTS,
  PARTICIPATION_INTENT_OPTIONS,
  Questionnaire,
  attendanceQuestionnaire,
  fromBuilderQuestionnaire,
} from "@camp404/types";
import {
  MAX_DRAFT_KEYS,
  boundDraftResponses,
  questionnaireRoleMirror,
} from "../questionnaire-submission";

const DRAFTABLE = Questionnaire.parse({
  version: "1",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "P",
      questions: [
        { id: "a", kind: "short_text", prompt: "A" },
        { id: "note", kind: "info_block", body: "Read me" },
        { id: "b", kind: "long_text", prompt: "B" },
      ],
    },
    { id: "intro", kind: "intro", heading: "Next", body: "Almost done" },
  ],
});

describe("boundDraftResponses", () => {
  it("drops keys that are not one of the definition's questions", () => {
    // REFUSED CASE: a draft save accepts whatever the client posts, so the
    // allow-list is the only thing keeping foreign keys out of the JSONB. A
    // content block and a page take no answer either.
    const res = boundDraftResponses(DRAFTABLE, {
      a: 1,
      note: "x",
      intro: "y",
      polluted: "z",
    });
    expect(res).toEqual({ ok: true, responses: { a: 1 } });
  });

  it("rejects an oversized draft", () => {
    // REFUSED CASE: one allowed key holding ~200 KB, past the 128 KB cap.
    const res = boundDraftResponses(DRAFTABLE, { a: "x".repeat(200 * 1024) });
    expect(res).toEqual({ ok: false, error: "Answers are too large" });
  });

  it("rejects a draft with too many keys, before looking at them", () => {
    const many = Object.fromEntries(
      Array.from({ length: MAX_DRAFT_KEYS + 1 }, (_, i) => [`k${i}`, "v"]),
    );
    expect(boundDraftResponses(DRAFTABLE, many)).toEqual({
      ok: false,
      error: "Too many answers",
    });
  });

  it("rejects a structurally malformed payload", () => {
    // REFUSED CASE: a map of booleans is not a legal response value.
    expect(boundDraftResponses(DRAFTABLE, { a: { nested: true } })).toEqual({
      ok: false,
      error: "Malformed response payload",
    });
    expect(boundDraftResponses(DRAFTABLE, "nope").ok).toBe(false);
  });

  it("accepts an incomplete draft, and an answer the final check would refuse", () => {
    // The resume guarantee: a draft may leave required answers absent, and is
    // not validated per question until the member submits.
    expect(boundDraftResponses(DRAFTABLE, { a: 42 })).toEqual({
      ok: true,
      responses: { a: 42 },
    });
  });
});

// A camp-authored Dietary or Transport questionnaire feeds the tables the app
// already reads, through the roles a captain puts on its questions.
const TRANSPORT = fromBuilderQuestionnaire(
  BuilderQuestionnaire.parse({
    version: "1",
    title: "Getting to camp",
    pages: [
      {
        id: "p1",
        type: "question",
        title: "Travel",
        blocks: [
          {
            kind: "question",
            question: {
              id: "drives",
              kind: "boolean",
              prompt: "Driving?",
              role: "driving_this_year",
            },
          },
          {
            kind: "question",
            question: {
              id: "arrive",
              kind: "date",
              prompt: "Arriving",
              role: "arrival_date",
              required: false,
            },
          },
          {
            kind: "question",
            question: {
              id: "allergies",
              kind: "long_text",
              prompt: "Allergies",
              role: "dietary_allergies",
            },
            visibleIf: { fieldId: "has", op: "eq", value: true },
          },
          {
            kind: "question",
            question: { id: "has", kind: "boolean", prompt: "Any allergies?" },
          },
        ],
      },
    ],
  }),
);

describe("questionnaireRoleMirror", () => {
  it("copies asked answers, and a day as the start of that UTC day", () => {
    expect(
      questionnaireRoleMirror(TRANSPORT, {
        drives: true,
        arrive: "2027-04-26",
        has: true,
        allergies: "  Peanuts ",
      }),
    ).toEqual({
      dietary: { allergies: "Peanuts" },
      driver: {
        intendsToDrive: true,
        arrivalAt: new Date("2027-04-26T00:00:00.000Z"),
      },
      participation: null,
    });
  });

  it("clears a hidden or unanswered role answer instead of keeping an old one", () => {
    expect(
      questionnaireRoleMirror(TRANSPORT, {
        drives: false,
        has: false,
        allergies: "Peanuts (last year)",
      }),
    ).toEqual({
      dietary: { allergies: null },
      driver: { intendsToDrive: false, arrivalAt: null },
      participation: null,
    });
  });

  it("reads each role's column, and a malformed day as no day", () => {
    const every = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "p",
          kind: "questions",
          title: "P",
          questions: [
            {
              id: "ana",
              kind: "boolean",
              prompt: "Anaphylactic?",
              role: "dietary_anaphylactic",
            },
            {
              id: "notes",
              kind: "short_text",
              prompt: "Notes",
              role: "dietary_notes",
            },
            {
              id: "leave",
              kind: "date",
              prompt: "Leaving",
              role: "departure_date",
            },
            {
              id: "name",
              kind: "short_text",
              prompt: "Name",
              role: "emergency_contact_name",
            },
          ],
        },
      ],
    });
    expect(
      questionnaireRoleMirror(every, {
        ana: true,
        notes: "   ",
        leave: "26/04/2027",
        name: "Not a builder role",
      }),
    ).toEqual({
      dietary: { isAnaphylactic: true, notes: null },
      driver: { departureAt: null },
      participation: null,
    });
  });

  it("clears a role question the member branched past", () => {
    // A goTo skips the dietary page, so its stored answer (kept, because it is
    // valid) was never ASKED this time and must not be copied.
    const branching = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "start",
          kind: "questions",
          title: "Start",
          questions: [
            {
              id: "eat",
              kind: "single_select",
              prompt: "Eating with the camp?",
              options: [
                { value: "yes", label: "Yes" },
                { value: "no", label: "No", goTo: "end" },
              ],
            },
          ],
        },
        {
          id: "food",
          kind: "questions",
          title: "Food",
          questions: [
            {
              id: "allergies",
              kind: "long_text",
              prompt: "Allergies",
              role: "dietary_allergies",
            },
          ],
        },
        {
          id: "end",
          kind: "questions",
          title: "End",
          questions: [
            { id: "bye", kind: "short_text", prompt: "Bye", required: false },
          ],
        },
      ],
    });
    expect(
      questionnaireRoleMirror(branching, { eat: "yes", allergies: "Nuts" }),
    ).toEqual({
      dietary: { allergies: "Nuts" },
      driver: null,
      participation: null,
    });
    expect(
      questionnaireRoleMirror(branching, { eat: "no", allergies: "Nuts" }),
    ).toEqual({
      dietary: { allergies: null },
      driver: null,
      participation: null,
    });
  });

  it("writes nothing for a questionnaire with no role questions", () => {
    expect(questionnaireRoleMirror(DRAFTABLE, { a: "Great" })).toEqual({
      dietary: null,
      driver: null,
      participation: null,
    });
  });
});

describe("questionnaireRoleMirror: Coming this year", () => {
  it("carries each Yes, Maybe or No the member gave", () => {
    for (const intent of PARTICIPATION_INTENTS) {
      expect(
        questionnaireRoleMirror(attendanceQuestionnaire(), { coming: intent }),
      ).toEqual({ dietary: null, driver: null, participation: { intent } });
    }
  });

  it("writes nothing for an unknown value or no answer, so a place is never cleared", () => {
    for (const value of ["other:Later", "YES", 1, true, null]) {
      expect(
        questionnaireRoleMirror(attendanceQuestionnaire(), { coming: value }),
      ).toMatchObject({ participation: null });
    }
    expect(
      questionnaireRoleMirror(attendanceQuestionnaire(), {}),
    ).toMatchObject({ participation: null });
  });

  it("writes nothing when the question was hidden", () => {
    const hidden = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "p",
          kind: "questions",
          title: "P",
          questions: [
            { id: "member", kind: "boolean", prompt: "Still a member?" },
            {
              id: "coming",
              kind: "single_select",
              prompt: "Coming?",
              role: "participation_intent",
              options: PARTICIPATION_INTENT_OPTIONS,
              visibleIf: { fieldId: "member", op: "eq", value: true },
            },
          ],
        },
      ],
    });
    expect(
      questionnaireRoleMirror(hidden, { member: true, coming: "no" }),
    ).toMatchObject({ participation: { intent: "no" } });
    expect(
      questionnaireRoleMirror(hidden, { member: false, coming: "no" }),
    ).toMatchObject({ participation: null });
  });
});
