import { describe, expect, it } from "vitest";
import { Team } from "@camp404/types";
import {
  EVENTS_SHEET_STYLE,
  FALLBACK_SHEET_STYLE,
  TEAM_SHEET_STYLES,
  teamSheetStyle,
} from "../team-style";

// Each team's quiet colour and line icon on the daily site sheet (#249): one
// map covering every team in the enum, a fallback for a team it does not
// know, and icons that still tell the sections apart in black and white.

describe("the team style map", () => {
  it("has a style for every team in the enum, and nothing else", () => {
    expect(Object.keys(TEAM_SHEET_STYLES).sort()).toEqual(
      [...Team.options].sort(),
    );
    for (const team of Team.options) {
      expect(teamSheetStyle(team)).toBe(TEAM_SHEET_STYLES[team]);
    }
  });

  it("gives each team its own icon and colour, so black and white still tells them apart", () => {
    const styles = [
      ...Object.values(TEAM_SHEET_STYLES),
      FALLBACK_SHEET_STYLE,
      EVENTS_SHEET_STYLE,
    ];
    expect(new Set(styles.map((s) => s.Icon)).size).toBe(styles.length);
    expect(new Set(styles.map((s) => s.edge)).size).toBe(styles.length);
  });

  it("keeps the colours quiet: a pale heading ground, never a loud one", () => {
    for (const { tint } of Object.values(TEAM_SHEET_STYLES)) {
      const [r, g, b] = [1, 3, 5].map((i) =>
        parseInt(tint.slice(i, i + 2), 16),
      );
      // Light enough for black text and a lot of it.
      expect(Math.min(r!, g!, b!)).toBeGreaterThanOrEqual(0xd8);
    }
  });

  it("falls back for a team added after this map", () => {
    expect(teamSheetStyle("a_new_team")).toBe(FALLBACK_SHEET_STYLE);
    expect(teamSheetStyle("toString")).toBe(FALLBACK_SHEET_STYLE);
  });
});
