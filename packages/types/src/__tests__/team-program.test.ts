import { describe, expect, it } from "vitest";
import { TEAM_DESCRIPTION_MAX, TeamProgramInput } from "../team-program";

// A team's description (owner's ruling 4, 2026-09-27), checked at the
// boundary. There are no links: everything happens inside the app.

const OK = {
  team: "power_and_lighting",
  description: "  We keep the lights on.  ",
  expectedVersion: 0,
};

function firstIssue(input: unknown): string | undefined {
  const parsed = TeamProgramInput.safeParse(input);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe("TeamProgramInput", () => {
  it("takes a description, trimmed", () => {
    expect(TeamProgramInput.parse(OK)).toEqual({
      team: "power_and_lighting",
      description: "We keep the lights on.",
      expectedVersion: 0,
    });
  });

  it("takes an empty description (clearing it)", () => {
    expect(TeamProgramInput.safeParse({ ...OK, description: "" }).success).toBe(
      true,
    );
  });

  it("drops anything else it is sent, such as links", () => {
    const parsed = TeamProgramInput.parse({
      ...OK,
      links: [{ label: "Drive", url: "https://drive.google.com" }],
    });
    expect(parsed).not.toHaveProperty("links");
  });

  it("refuses a key that is not a team", () => {
    expect(TeamProgramInput.safeParse({ ...OK, team: "moon" }).success).toBe(
      false,
    );
  });

  it("refuses a description over the limit", () => {
    expect(
      firstIssue({ ...OK, description: "x".repeat(TEAM_DESCRIPTION_MAX + 1) }),
    ).toBe(`Keep the description under ${TEAM_DESCRIPTION_MAX} characters.`);
    expect(
      TeamProgramInput.safeParse({
        ...OK,
        description: "x".repeat(TEAM_DESCRIPTION_MAX),
      }).success,
    ).toBe(true);
  });

  it("refuses a negative or fractional version", () => {
    expect(
      TeamProgramInput.safeParse({ ...OK, expectedVersion: -1 }).success,
    ).toBe(false);
    expect(
      TeamProgramInput.safeParse({ ...OK, expectedVersion: 1.5 }).success,
    ).toBe(false);
  });
});
