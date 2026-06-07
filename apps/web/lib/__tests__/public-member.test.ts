import { describe, expect, it } from "vitest";
import { presentPublicMember } from "@/lib/public-member";
import { QUESTIONNAIRE } from "@/lib/questionnaire";

// The member-facing allowlist projection. Privacy invariant: ONLY bio +
// this-year ideas are surfaced — adding any other answer to `responses` must not
// widen what a member can read.

describe("presentPublicMember", () => {
  it("surfaces only bio + this-year ideas", () => {
    const out = presentPublicMember({
      responses: {
        "bio.statement": "Runs a darkroom in Cape Town.",
        "ideas.this_year": "A full analog photo lab.",
      },
    });
    expect(out).toEqual({
      bio: "Runs a darkroom in Cape Town.",
      contribution: "A full analog photo lab.",
    });
  });

  it("ignores every private answer (email, ID, dietary, country, etc.)", () => {
    const out = presentPublicMember({
      responses: {
        "bio.statement": "Hi.",
        "id.number": "A0148822",
        "id.type": "passport",
        email: "nova@example.com",
        "dietary.needs": "vegan",
        "emergency.contact": "+27 11 555 0000",
        country: "ZA",
        birthday: "1990-01-01",
      },
    });
    expect(out).toEqual({ bio: "Hi.", contribution: null });
    // No private key bleeds into the projection.
    expect(Object.keys(out).sort()).toEqual(["bio", "contribution"]);
  });

  it("returns null for missing / blank / non-string answers", () => {
    expect(
      presentPublicMember({ responses: {} }),
    ).toEqual({ bio: null, contribution: null });
    expect(
      presentPublicMember({
        responses: { "bio.statement": "   ", "ideas.this_year": 42 },
      }),
    ).toEqual({ bio: null, contribution: null });
  });

  it("keeps the allowlist tied to real questionnaire ids (catch a rename)", () => {
    // If either id is renamed in the catalogue, the allowlist would silently
    // return null forever and the public card would go blank — fail loudly here.
    const ids: string[] = [];
    for (const page of QUESTIONNAIRE.pages) {
      if (page.kind === "questions") {
        for (const q of page.questions) ids.push(q.id);
      }
    }
    expect(ids).toContain("bio.statement");
    expect(ids).toContain("ideas.this_year");
  });
});
