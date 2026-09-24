import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_QUESTION_PROMPT,
  BUILDER_ROLES,
  PARTICIPATION_INTENT_OPTIONS,
  attendanceQuestionnaire,
  builderRolesFor,
  hasParticipationOptions,
} from "../builder-roles";
import { PARTICIPATION_INTENTS } from "../participation";
import { Questionnaire, SingleSelectQuestion } from "../questionnaire";
import {
  BuilderQuestionnaire,
  validateBuilderQuestionnaire,
} from "../questionnaire-builder";

// A camp-authored Dietary or Transport questionnaire feeds the tables the app
// already reads, through the roles a captain puts on its questions.

const TRANSPORT = BuilderQuestionnaire.parse({
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
});

describe("builderRolesFor", () => {
  it("offers only the roles a kind can hold", () => {
    expect(builderRolesFor("boolean")).toEqual([
      "dietary_anaphylactic",
      "driving_this_year",
    ]);
    expect(builderRolesFor("date")).toEqual(["arrival_date", "departure_date"]);
    expect(builderRolesFor("long_text")).toEqual([
      "dietary_allergies",
      "dietary_notes",
    ]);
    expect(builderRolesFor("single_select")).toEqual(["participation_intent"]);
    expect(builderRolesFor("multi_select")).toEqual([]);
    expect(builderRolesFor("number")).toEqual([]);
  });

  it("gives every role a label", () => {
    for (const meta of Object.values(BUILDER_ROLES)) {
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});

describe("publishing roles", () => {
  it("refuses two questions marked for the same use", () => {
    const twice = BuilderQuestionnaire.parse({
      ...TRANSPORT,
      pages: [
        {
          ...TRANSPORT.pages[0]!,
          blocks: [
            ...TRANSPORT.pages[0]!.blocks,
            {
              kind: "question",
              question: {
                id: "again",
                kind: "date",
                prompt: "Arriving again",
                role: "arrival_date",
              },
            },
          ],
        },
      ],
    });
    expect(validateBuilderQuestionnaire(twice)).toContain(
      '"Arriving" and "Arriving again" are both marked for the same use. Mark only one.',
    );
  });
});

describe("the Coming this year question", () => {
  const coming = (over: Record<string, unknown> = {}) =>
    SingleSelectQuestion.parse({
      id: "coming",
      kind: "single_select",
      prompt: "Coming?",
      role: "participation_intent",
      options: PARTICIPATION_INTENT_OPTIONS,
      ...over,
    });

  it("offers the fixed values in the order members read them", () => {
    expect(PARTICIPATION_INTENT_OPTIONS.map((o) => o.value)).toEqual([
      ...PARTICIPATION_INTENTS,
    ]);
  });

  it("sits only on a single choice", () => {
    // A multiple choice has no role field, so the role is dropped on parse.
    const multi = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "p",
          kind: "questions",
          title: "P",
          questions: [
            {
              id: "c",
              kind: "multi_select",
              prompt: "Coming?",
              role: "participation_intent",
              options: PARTICIPATION_INTENT_OPTIONS,
            },
          ],
        },
      ],
    });
    const page = multi.pages[0]!;
    expect(page.kind === "questions" && page.questions[0]).not.toHaveProperty(
      "role",
    );
    expect(page.kind === "questions" && page.questions[0]).toHaveProperty(
      "prompt",
      "Coming?",
    );
  });

  it("accepts yes, maybe and no in any order and any wording, and nothing else", () => {
    expect(hasParticipationOptions(coming())).toBe(true);
    expect(
      hasParticipationOptions(
        coming({
          options: [
            { value: "no", label: "Nope" },
            { value: "yes", label: "Yebo" },
            { value: "maybe", label: "Dunno" },
          ],
        }),
      ),
    ).toBe(true);
    expect(
      hasParticipationOptions(
        coming({ options: PARTICIPATION_INTENT_OPTIONS.slice(0, 2) }),
      ),
    ).toBe(false);
    expect(
      hasParticipationOptions(
        coming({
          options: [
            ...PARTICIPATION_INTENT_OPTIONS,
            { value: "later", label: "Later" },
          ],
        }),
      ),
    ).toBe(false);
    expect(
      hasParticipationOptions(
        coming({
          options: [
            { value: "yes", label: "Yes" },
            { value: "maybe", label: "Maybe" },
            { value: "nah", label: "No" },
          ],
        }),
      ),
    ).toBe(false);
    expect(hasParticipationOptions(coming({ allowOther: true }))).toBe(false);
  });

  it("builds the one-click questionnaire: one required radio question with the role", () => {
    const q = attendanceQuestionnaire();
    expect(Questionnaire.parse(q)).toEqual(q);
    expect(q).toMatchObject({ version: "1", title: "Coming this year?" });
    expect(q.pages).toHaveLength(1);
    const page = q.pages[0]!;
    expect(page).toMatchObject({
      kind: "questions",
      title: "Coming this year?",
    });
    expect(page.kind === "questions" && page.questions).toEqual([
      {
        id: "coming",
        kind: "single_select",
        prompt: ATTENDANCE_QUESTION_PROMPT,
        required: true,
        display: "radio",
        role: "participation_intent",
        options: PARTICIPATION_INTENT_OPTIONS,
      },
    ]);
  });

  it("refuses to publish a builder question whose options were changed", () => {
    const form = (options: unknown, allowOther?: boolean) =>
      BuilderQuestionnaire.parse({
        version: "1",
        title: "Coming?",
        pages: [
          {
            id: "p1",
            type: "question",
            title: "Coming",
            blocks: [
              {
                kind: "question",
                question: {
                  id: "coming",
                  kind: "single_select",
                  prompt: "Coming?",
                  role: "participation_intent",
                  options,
                  allowOther,
                },
              },
            ],
          },
        ],
      });
    const refusal = expect.stringContaining(
      "must be exactly yes, maybe and no",
    );
    expect(
      validateBuilderQuestionnaire(form(PARTICIPATION_INTENT_OPTIONS)),
    ).toEqual([]);
    expect(
      validateBuilderQuestionnaire(form(PARTICIPATION_INTENT_OPTIONS, true)),
    ).toEqual([refusal]);
    expect(
      validateBuilderQuestionnaire(
        form([
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]),
      ),
    ).toEqual([refusal]);
  });
});
