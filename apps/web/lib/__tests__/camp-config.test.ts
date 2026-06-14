import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { teamEnum } from "@camp404/db/schema";
import {
  DEFAULT_TEAMS,
  DEFAULT_CAMP_CONFIG,
  activeTeams,
  assertStableTeamKeys,
  moveTeam,
  renameTeam,
  resolveTeamsConfig,
  setTeamArchived,
  teamLabelMap,
  type TeamsConfig,
} from "@camp404/db/camp-config";

// configurable-teams: the config layer. Covers the pure shaping + transform
// helpers and the seeded defaults. The DB-backed read/write (getTeamsConfig's
// query, mutateTeamsConfig's SELECT…FOR UPDATE read-modify-write) isn't unit-
// tested — packages/db has no DB-backed test harness — but the pure pieces it's
// built from are: resolveTeamsConfig (the fallback), the transforms, and
// assertStableTeamKeys (the writer's guard). The server actions that drive the
// write (incl. the captain gate + last-active-team guard) are covered in
// app/captains/camp-settings/actions.test.ts.

// A non-default config fixture for the transform tests (3 teams, one archived).
function fixture(): TeamsConfig {
  return {
    teams: [
      { key: "kitchen", label: "Kitchen", order: 0, archived: false },
      { key: "structures", label: "Structures", order: 1, archived: false },
      { key: "art_and_activities", label: "Art", order: 2, archived: true },
    ],
  };
}

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
  // The teams seed JSON is written by hand in THREE places that must agree:
  // DEFAULT_CAMP_CONFIG (the TS source of truth), the migration SQL, and the
  // inline column default in schema.ts (what drizzle-kit diffs future migrations
  // against). We can't derive the SQL literal from the const without a runtime
  // import cycle (schema.ts ← camp-config.ts ← schema.ts), so guard all three.
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "../../../..");

  /** Pull the `{"teams":…}` jsonb literal out of a source/SQL file. */
  function extractSeed(relPath: string): unknown {
    const src = readFileSync(join(repoRoot, relPath), "utf8");
    const json = src.match(/'(\{"teams":.*?\})'::jsonb/s)?.[1];
    expect(json, `no teams jsonb literal in ${relPath}`).toBeTruthy();
    return JSON.parse(json ?? "{}");
  }

  it("migration 0015 matches DEFAULT_CAMP_CONFIG", () => {
    expect(
      extractSeed("packages/db/migrations/0015_chemical_spiral.sql"),
    ).toEqual(DEFAULT_CAMP_CONFIG);
  });

  it("schema.ts inline column default matches DEFAULT_CAMP_CONFIG", () => {
    expect(extractSeed("packages/db/src/schema.ts")).toEqual(
      DEFAULT_CAMP_CONFIG,
    );
  });
});

describe("renameTeam", () => {
  it("changes only the matched team's label, immutably", () => {
    const before = fixture();
    const after = renameTeam(before, "kitchen", "Cuisine");
    expect(after.teams.find((t) => t.key === "kitchen")?.label).toBe("Cuisine");
    expect(after.teams[1]).toEqual(before.teams[1]); // others untouched
    expect(before.teams[0]?.label).toBe("Kitchen"); // input not mutated
  });

  it("returns an unchanged shape for an unknown key", () => {
    const before = fixture();
    expect(renameTeam(before, "nope", "X").teams).toEqual(before.teams);
  });
});

describe("setTeamArchived", () => {
  it("toggles only the matched team's archived flag, immutably", () => {
    const before = fixture();
    const after = setTeamArchived(before, "structures", true);
    expect(after.teams.find((t) => t.key === "structures")?.archived).toBe(true);
    expect(before.teams[1]?.archived).toBe(false); // input not mutated
    expect(setTeamArchived(before, "art_and_activities", false).teams[2]?.archived).toBe(
      false,
    );
  });
});

describe("moveTeam", () => {
  it("swaps neighbours and renormalises order to 0..n-1", () => {
    const after = moveTeam(fixture(), "structures", "up");
    expect(after.teams.map((t) => t.key)).toEqual([
      "structures",
      "kitchen",
      "art_and_activities",
    ]);
    expect(after.teams.map((t) => t.order)).toEqual([0, 1, 2]);
  });

  it("is a no-op at the edges and for unknown keys", () => {
    const before = fixture();
    expect(moveTeam(before, "kitchen", "up")).toBe(before);
    expect(moveTeam(before, "art_and_activities", "down")).toBe(before);
    expect(moveTeam(before, "nope", "up")).toBe(before);
  });

  it("renormalises sparse/duplicate orders by their sorted position", () => {
    const sparse: TeamsConfig = {
      teams: [
        { key: "a", label: "A", order: 5, archived: false },
        { key: "b", label: "B", order: 10, archived: false },
      ],
    };
    const after = moveTeam(sparse, "b", "up");
    expect(after.teams.map((t) => [t.key, t.order])).toEqual([
      ["b", 0],
      ["a", 1],
    ]);
  });
});

describe("assertStableTeamKeys", () => {
  it("accepts relabel / reorder / archive (same key set)", () => {
    const before = fixture();
    expect(() =>
      assertStableTeamKeys(before, renameTeam(before, "kitchen", "X")),
    ).not.toThrow();
    expect(() =>
      assertStableTeamKeys(before, moveTeam(before, "structures", "up")),
    ).not.toThrow();
  });

  it("throws when a key is added or removed", () => {
    const before = fixture();
    const added: TeamsConfig = {
      teams: [...before.teams, { key: "new", label: "New", order: 3, archived: false }],
    };
    const removed: TeamsConfig = { teams: before.teams.slice(1) };
    expect(() => assertStableTeamKeys(before, added)).toThrow(/team keys/);
    expect(() => assertStableTeamKeys(before, removed)).toThrow(/team keys/);
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
