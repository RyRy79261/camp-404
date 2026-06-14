import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { teamEnum } from "@camp404/db/schema";
import {
  DEFAULT_TEAMS,
  DEFAULT_CAMP_CONFIG,
  activeTeams,
  resolveTeamsConfig,
  teamLabelMap,
  type TeamsConfig,
} from "@camp404/db/camp-config";

// Phase-1 configurable-teams: the config layer. Covers the pure shaping helpers
// + the seeded defaults. (getTeamsConfig's DB read is exercised by the E2E
// suite; its fallback logic is resolveTeamsConfig, tested here.)

describe("DEFAULT_TEAMS", () => {
  it("covers exactly the teamEnum keys, in enum order, all active", () => {
    expect(DEFAULT_TEAMS.map((t) => t.key)).toEqual([...teamEnum.enumValues]);
    // order is the array index 0..n.
    expect(DEFAULT_TEAMS.map((t) => t.order)).toEqual(
      DEFAULT_TEAMS.map((_, i) => i),
    );
    expect(DEFAULT_TEAMS.every((t) => t.archived === false)).toBe(true);
    expect(DEFAULT_CAMP_CONFIG.teams).toBe(DEFAULT_TEAMS);
  });
});

describe("resolveTeamsConfig", () => {
  it("falls back to the seeded defaults for null / undefined / empty", () => {
    expect(resolveTeamsConfig(null)).toBe(DEFAULT_CAMP_CONFIG);
    expect(resolveTeamsConfig(undefined)).toBe(DEFAULT_CAMP_CONFIG);
    expect(resolveTeamsConfig({ teams: [] })).toBe(DEFAULT_CAMP_CONFIG);
  });

  it("passes a fully-valid config through unchanged", () => {
    const cfg: TeamsConfig = {
      teams: [{ key: "kitchen", label: "Cuisine", order: 0, archived: false }],
    };
    expect(resolveTeamsConfig(cfg)).toBe(cfg);
  });

  it("falls back wholesale when any entry is malformed", () => {
    // A missing label / wrong type must not render a partial team list.
    expect(
      resolveTeamsConfig({
        teams: [
          { key: "kitchen", label: "Kitchen", order: 0, archived: false },
          { key: "structures", order: 1, archived: false }, // no label
        ],
      }),
    ).toBe(DEFAULT_CAMP_CONFIG);
    expect(resolveTeamsConfig({ teams: "nope" })).toBe(DEFAULT_CAMP_CONFIG);
  });
});

describe("the seeded column default", () => {
  it("matches DEFAULT_CAMP_CONFIG (guards SQL-seed ⇄ TS-const drift)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sql = readFileSync(
      join(here, "../../../../packages/db/migrations/0015_chemical_spiral.sql"),
      "utf8",
    );
    const seededJson = sql.match(/DEFAULT '(\{.*\})'::jsonb/s)?.[1];
    expect(seededJson).toBeTruthy();
    expect(JSON.parse(seededJson ?? "{}")).toEqual(DEFAULT_CAMP_CONFIG);
  });
});

describe("activeTeams", () => {
  it("drops archived teams and sorts by order", () => {
    const cfg: TeamsConfig = {
      teams: [
        { key: "b", label: "B", order: 2, archived: false },
        { key: "z", label: "Z", order: 9, archived: true },
        { key: "a", label: "A", order: 1, archived: false },
      ],
    };
    expect(activeTeams(cfg).map((t) => t.key)).toEqual(["a", "b"]);
  });
});

describe("teamLabelMap", () => {
  it("maps every key (including archived) to its label", () => {
    const cfg: TeamsConfig = {
      teams: [
        { key: "kitchen", label: "Cuisine", order: 0, archived: false },
        { key: "old", label: "Old", order: 1, archived: true },
      ],
    };
    expect(teamLabelMap(cfg)).toEqual({ kitchen: "Cuisine", old: "Old" });
  });
});
