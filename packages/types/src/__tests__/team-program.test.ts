import { describe, expect, it } from "vitest";
import {
  TEAM_DESCRIPTION_MAX,
  TEAM_LINK_LABEL_MAX,
  TEAM_LINK_URL_MAX,
  TEAM_LINKS_MAX,
  TeamProgramInput,
  isWebAddress,
} from "../team-program";

// A team's description and links (owner's ruling 4, 2026-09-27): checked at
// the boundary. Links are web addresses only, so no javascript:, data: or
// mailto: address can ride into an href on every member's screen.

const OK = {
  team: "power_and_lighting",
  description: "  We keep the lights on.  ",
  links: [{ label: " Grid plan ", url: " https://example.com/grid " }],
  expectedVersion: 0,
};

function firstIssue(input: unknown): string | undefined {
  const parsed = TeamProgramInput.safeParse(input);
  return parsed.success ? undefined : parsed.error.issues[0]?.message;
}

describe("TeamProgramInput", () => {
  it("takes a description and links, trimmed", () => {
    expect(TeamProgramInput.parse(OK)).toEqual({
      team: "power_and_lighting",
      description: "We keep the lights on.",
      links: [{ label: "Grid plan", url: "https://example.com/grid" }],
      expectedVersion: 0,
    });
  });

  it("takes an empty description and no links (clearing both)", () => {
    expect(
      TeamProgramInput.safeParse({ ...OK, description: "", links: [] }).success,
    ).toBe(true);
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

  it("refuses too many links, and over-long names and addresses", () => {
    const link = { label: "A", url: "https://example.com" };
    expect(
      firstIssue({
        ...OK,
        links: Array.from({ length: TEAM_LINKS_MAX + 1 }, () => link),
      }),
    ).toBe(`A team can keep up to ${TEAM_LINKS_MAX} links.`);
    expect(
      firstIssue({
        ...OK,
        links: [{ ...link, label: "x".repeat(TEAM_LINK_LABEL_MAX + 1) }],
      }),
    ).toMatch(/name under/);
    expect(
      firstIssue({
        ...OK,
        links: [
          {
            ...link,
            url: `https://example.com/${"x".repeat(TEAM_LINK_URL_MAX)}`,
          },
        ],
      }),
    ).toMatch(/web address under/);
    expect(firstIssue({ ...OK, links: [{ ...link, label: "  " }] })).toBe(
      "Give each link a name.",
    );
  });

  it("refuses any link that is not http or https", () => {
    for (const url of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "mailto:someone@example.com",
      "ftp://example.com/file",
      "example.com",
      "//example.com",
      "https://",
      "https:///path",
      "https://exa mple.com",
      " javascript:alert(1)",
      "",
    ]) {
      expect(
        TeamProgramInput.safeParse({ ...OK, links: [{ label: "A", url }] })
          .success,
        url,
      ).toBe(false);
    }
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

describe("isWebAddress", () => {
  it("accepts http and https addresses", () => {
    expect(isWebAddress("https://docs.google.com/x")).toBe(true);
    expect(isWebAddress("http://example.com")).toBe(true);
    expect(isWebAddress("HTTPS://example.com/a?b=c#d")).toBe(true);
  });
});
