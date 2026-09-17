import { describe, expect, it } from "vitest";
import {
  INCOMPLETE_CONTACT_ERROR,
  incompleteContactErrors,
  mergeEmergencyContacts,
  questionIdForRole,
  splitEmergencyContacts,
} from "../question-roles";
import { Questionnaire } from "../questionnaire";

// Answers read by what they are for (a question's role), not by id.

const questionnaire = Questionnaire.parse({
  version: "1",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "About you",
      questions: [
        { id: "photo", kind: "image", prompt: "Photo", role: "profile_photo" },
        { id: "about", kind: "long_text", prompt: "About", role: "bio" },
      ],
    },
    {
      id: "p2",
      kind: "questions",
      title: "Emergency contacts",
      questions: [
        {
          id: "a.name",
          kind: "short_text",
          prompt: "Name",
          role: "emergency_contact_name",
        },
        {
          id: "a.phone",
          kind: "phone",
          prompt: "Phone",
          role: "emergency_contact_phone",
        },
        {
          id: "a.rel",
          kind: "short_text",
          prompt: "Relation",
          role: "emergency_contact_relationship",
        },
        {
          id: "b.name",
          kind: "short_text",
          prompt: "Name",
          required: false,
          role: "emergency_contact_name",
        },
        {
          id: "b.phone",
          kind: "phone",
          prompt: "Phone",
          required: false,
          role: "emergency_contact_phone",
        },
        {
          id: "b.rel",
          kind: "short_text",
          prompt: "Relation",
          required: false,
          role: "emergency_contact_relationship",
        },
      ],
    },
  ],
});

describe("questionIdForRole", () => {
  it("finds a question by role, whatever its id", () => {
    expect(questionIdForRole(questionnaire, "profile_photo")).toBe("photo");
    expect(questionIdForRole(questionnaire, "bio")).toBe("about");
  });

  it("is null when no question has the role", () => {
    const bare = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "p",
          kind: "questions",
          title: "t",
          questions: [{ id: "x", kind: "long_text", prompt: "Notes" }],
        },
      ],
    });
    expect(questionIdForRole(bare, "bio")).toBeNull();
  });
});

describe("the role schema", () => {
  function withQuestion(question: Record<string, unknown>) {
    return {
      version: "1",
      pages: [
        { id: "p", kind: "questions", title: "t", questions: [question] },
      ],
    };
  }

  it("drops a role from a kind that has no roles", () => {
    const parsed = Questionnaire.parse(
      withQuestion({ id: "x", kind: "email", prompt: "Email", role: "bio" }),
    );
    expect(questionIdForRole(parsed, "bio")).toBeNull();
  });

  it("refuses a role a kind cannot hold", () => {
    expect(
      Questionnaire.safeParse(
        withQuestion({ id: "x", kind: "image", prompt: "Pic", role: "bio" }),
      ).success,
    ).toBe(false);
  });
});

describe("splitEmergencyContacts", () => {
  it("takes every contact answer out and returns the complete contacts", () => {
    const { cleaned, contacts } = splitEmergencyContacts(questionnaire, {
      about: "Hi",
      "a.name": " Ada ",
      "a.phone": "+27 82 555 0199",
      "a.rel": "sister",
      "b.name": "Grace",
      "b.phone": "",
      "b.rel": "friend",
    });

    expect(cleaned).toEqual({ about: "Hi" });
    // The second slot has no phone, so it is dropped rather than half-stored.
    expect(contacts).toEqual([
      { name: "Ada", phone: "+27 82 555 0199", relationship: "sister" },
    ]);
  });

  it("returns no contacts when none were given", () => {
    expect(splitEmergencyContacts(questionnaire, { about: "Hi" })).toEqual({
      cleaned: { about: "Hi" },
      contacts: [],
    });
  });
});

describe("mergeEmergencyContacts", () => {
  it("puts stored contacts back into their slots", () => {
    const contacts = [
      { name: "Ada", phone: "+27 82 555 0199", relationship: "sister" },
      { name: "Grace", phone: "+27 82 555 0100", relationship: "friend" },
    ];
    const merged = mergeEmergencyContacts(
      questionnaire,
      { about: "Hi" },
      contacts,
    );

    expect(merged).toEqual({
      about: "Hi",
      "a.name": "Ada",
      "a.phone": "+27 82 555 0199",
      "a.rel": "sister",
      "b.name": "Grace",
      "b.phone": "+27 82 555 0100",
      "b.rel": "friend",
    });
    expect(splitEmergencyContacts(questionnaire, merged).contacts).toEqual(
      contacts,
    );
  });

  it("leaves the answers alone when there are no contacts", () => {
    const responses = { about: "Hi" };
    expect(mergeEmergencyContacts(questionnaire, responses, null)).toBe(
      responses,
    );
  });
});

describe("incompleteContactErrors", () => {
  it("flags the empty fields of a half-filled contact", () => {
    expect(
      incompleteContactErrors(questionnaire, {
        "a.name": "Ada",
        "a.phone": "+27 82 555 0199",
        "a.rel": "sister",
        "b.name": "Grace",
      }),
    ).toEqual({
      "b.phone": INCOMPLETE_CONTACT_ERROR,
      "b.rel": INCOMPLETE_CONTACT_ERROR,
    });
  });

  it("accepts a complete contact and an untouched one", () => {
    expect(
      incompleteContactErrors(questionnaire, {
        "a.name": "Ada",
        "a.phone": "+27 82 555 0199",
        "a.rel": "sister",
        "b.name": "  ",
      }),
    ).toEqual({});
  });
});
