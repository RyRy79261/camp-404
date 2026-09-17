import { describe, expect, it } from "vitest";
import { BUILDER_ROLES, builderRolesFor } from "../builder-roles";
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
