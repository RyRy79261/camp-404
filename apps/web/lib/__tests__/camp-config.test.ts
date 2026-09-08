import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

// The apps/web facade below is server-only (so is the test store it reads);
// neutralize the import guard under vitest.
vi.mock("server-only", () => ({}));

import { teamEnum } from "@camp404/db/schema";
import {
  DEFAULT_TEAMS,
  DEFAULT_CAMP_CONFIG,
  MAX_CYCLE_YEAR,
  MIN_CYCLE_YEAR,
  UNSET_CYCLE,
  activeTeams,
  advanceCycles,
  assertStableTeamKeys,
  currentCycle,
  foundingCycles,
  moveTeam,
  renameTeam,
  resolveCodeCarryOver,
  resolveCycles,
  resolveTeamsConfig,
  setCodeCarryOver,
  setTeamArchived,
  teamLabelMap,
  type CampConfig,
  type CycleEntry,
  type TeamsConfig,
} from "@camp404/db/camp-config";
import { getCurrentCycle } from "../camp-config";

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

describe("the config transforms preserve unrelated top-level keys", () => {
  // `camp_settings.config` is one JSONB column and `teams` is only the first
  // thing to live in it. A transform that rebuilds the object from a bare
  // `{ teams }` literal silently discards everything else — so relabelling a
  // team would wipe unrelated camp config. Latent today; load-bearing the
  // moment a second key exists.
  const withExtra = {
    teams: [
      { key: "kitchen", label: "Kitchen", order: 0, archived: false },
      { key: "build", label: "Build", order: 1, archived: false },
    ],
    // Stand-in for any future sibling key.
    unrelated: { keep: "me" },
  } as unknown as TeamsConfig;

  const extraOf = (cfg: TeamsConfig) =>
    (cfg as unknown as { unrelated?: unknown }).unrelated;

  it("renameTeam keeps them", () => {
    expect(extraOf(renameTeam(withExtra, "kitchen", "Cuisine"))).toEqual({
      keep: "me",
    });
  });

  it("setTeamArchived keeps them", () => {
    expect(extraOf(setTeamArchived(withExtra, "kitchen", true))).toEqual({
      keep: "me",
    });
  });

  it("moveTeam keeps them", () => {
    expect(extraOf(moveTeam(withExtra, "build", "up"))).toEqual({ keep: "me" });
  });
});

// --- The year namespace ----------------------------------------------------
// A cycle IS a year: one number that both names the year a captain reads and
// namespaces the rows stamped with it. These are the pure halves — the DB
// writers that use them (setFoundingYear, advanceCycle) are covered by the
// PGlite suite in packages/db.

function cycle(year: number, endedAt: string | null = null): CycleEntry {
  return { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt };
}

describe("UNSET_CYCLE", () => {
  it("can never be mistaken for a year", () => {
    // Migration 0019 stamped it on every pre-existing row and
    // currentCycleNumber() returns it until a captain says what year it is.
    // setFoundingYear rewrites exactly the rows carrying it — which is only
    // safe while no real year can equal it.
    expect(UNSET_CYCLE).toBeLessThan(MIN_CYCLE_YEAR);
  });
});

describe("resolveCycles", () => {
  it("reads an absent or malformed list as 'no year yet'", () => {
    expect(resolveCycles(null)).toEqual([]);
    expect(resolveCycles(undefined)).toEqual([]);
    expect(resolveCycles({})).toEqual([]);
    expect(resolveCycles({ cycles: [] })).toEqual([]);
    expect(resolveCycles({ cycles: "nope" })).toEqual([]);
    // One bad entry discards the list wholesale: a dropped year would silently
    // renumber the camp, and "unset" routes the captain to a screen that asks.
    expect(resolveCycles({ cycles: [cycle(2026), { year: 2027 }] })).toEqual([]);
    // The sentinel is not a year, so a hand-edited config can't smuggle it in.
    expect(resolveCycles({ cycles: [cycle(UNSET_CYCLE)] })).toEqual([]);
  });

  it("returns a valid list, year-ascending", () => {
    expect(
      resolveCycles({
        cycles: [cycle(2028), cycle(2026, "2027-01-01T00:00:00.000Z")],
      }).map((c) => c.year),
    ).toEqual([2026, 2028]);
  });
});

describe("currentCycle", () => {
  it("is null when the camp has never said what year it is", () => {
    expect(currentCycle([])).toBeNull();
  });

  it("is the one entry still open", () => {
    const cycles = [cycle(2026, "2027-01-01T00:00:00.000Z"), cycle(2027)];
    expect(currentCycle(cycles)?.year).toBe(2027);
  });

  it("falls back to the latest year when a write left none open", () => {
    // A read must never throw, and it must never silently revert the camp to
    // its first year.
    const cycles = [
      cycle(2026, "2027-01-01T00:00:00.000Z"),
      cycle(2027, "2028-01-01T00:00:00.000Z"),
    ];
    expect(currentCycle(cycles)?.year).toBe(2027);
  });
});

describe("foundingCycles", () => {
  it("opens the camp's first year", () => {
    const now = new Date("2026-03-01T00:00:00.000Z");
    expect(foundingCycles(2026, now)).toEqual([
      { year: 2026, startedAt: now.toISOString(), endedAt: null },
    ]);
  });

  it("refuses an implausible year", () => {
    const now = new Date();
    for (const year of [202, 20267, 2026.5, MIN_CYCLE_YEAR - 1, MAX_CYCLE_YEAR + 1]) {
      expect(() => foundingCycles(year, now)).toThrow(/whole number between/);
    }
  });
});

describe("advanceCycles", () => {
  const now = new Date("2027-01-01T00:00:00.000Z");
  const founded = [cycle(2026)];

  it("closes the open year and appends the new one, immutably", () => {
    const next = advanceCycles(founded, 2027, now);
    expect(next).toEqual([
      { ...cycle(2026), endedAt: now.toISOString() },
      { year: 2027, startedAt: now.toISOString(), endedAt: null },
    ]);
    expect(founded[0]!.endedAt).toBeNull(); // input not mutated
  });

  it("lets a camp skip a burn", () => {
    // Years are dates, not an incrementing counter — 2026 to 2028 is legal.
    expect(advanceCycles(founded, 2028, now).map((c) => c.year)).toEqual([
      2026, 2028,
    ]);
  });

  it("refuses a year that isn't later than the current one", () => {
    expect(() => advanceCycles(founded, 2026, now)).toThrow(/already had/);
    expect(() => advanceCycles(founded, 2025, now)).toThrow(/later than 2026/);
  });

  it("refuses a duplicate even when it isn't the current year", () => {
    // A hand-edited config can leave the OPEN entry behind the latest one.
    const odd = [cycle(2026), cycle(2028, "2029-01-01T00:00:00.000Z")];
    expect(() => advanceCycles(odd, 2028, now)).toThrow(/already had/);
  });

  it("refuses an implausible year, and a camp with no year at all", () => {
    expect(() => advanceCycles(founded, 20267, now)).toThrow(
      /whole number between/,
    );
    expect(() => advanceCycles([], 2027, now)).toThrow(/what year it is/);
  });
});

describe("resolveCodeCarryOver", () => {
  // The owner's ruling, seeded as the per-key default so an untouched camp
  // already behaves the way they asked.
  it("defaults the bio and the diet to carry, the driver profile to fresh", () => {
    for (const raw of [null, undefined, {}, { questionnaireCarryOver: {} }]) {
      expect(resolveCodeCarryOver(raw, "burner_profile")).toBe("carry");
      expect(resolveCodeCarryOver(raw, "dietary_requirements")).toBe("carry");
      expect(resolveCodeCarryOver(raw, "driver_profile")).toBe("fresh");
    }
  });

  it("lets a captain's explicit choice win, in both directions", () => {
    const raw = {
      questionnaireCarryOver: {
        burner_profile: "fresh",
        driver_profile: "carry",
      },
    };
    expect(resolveCodeCarryOver(raw, "burner_profile")).toBe("fresh");
    expect(resolveCodeCarryOver(raw, "driver_profile")).toBe("carry");
  });

  it("falls back PER KEY, so one bad entry keeps the rest", () => {
    const raw = {
      questionnaireCarryOver: {
        burner_profile: "fresh",
        dietary_requirements: 42, // nonsense
      },
    };
    expect(resolveCodeCarryOver(raw, "burner_profile")).toBe("fresh");
    // The nonsense entry falls back to the owner's default for that key, and
    // does NOT discard the captain's choice above it.
    expect(resolveCodeCarryOver(raw, "dietary_requirements")).toBe("carry");
    expect(resolveCodeCarryOver(raw, "driver_profile")).toBe("fresh");
  });

  it("reads an unknown key as carry — nothing changes until it's opted in", () => {
    expect(resolveCodeCarryOver({}, "something_else")).toBe("carry");
  });
});

describe("setCodeCarryOver", () => {
  it("sets one key and keeps every other key in the config", () => {
    const before: CampConfig = {
      ...DEFAULT_CAMP_CONFIG,
      cycles: [cycle(2026)],
      questionnaireCarryOver: { burner_profile: "carry" },
    };
    const after = setCodeCarryOver(before, "driver_profile", "fresh");
    expect(after.questionnaireCarryOver).toEqual({
      burner_profile: "carry",
      driver_profile: "fresh",
    });
    expect(after.cycles).toBe(before.cycles);
    expect(after.teams).toBe(before.teams);
    expect(before.questionnaireCarryOver).toEqual({ burner_profile: "carry" });
  });
});

describe("getCurrentCycle under E2E_TEST_MODE", () => {
  // Playwright runs with no database. The test store seeds DEFAULT_CAMP_CONFIG,
  // which has no `cycles` key, so the facade's E2E branch runs the same pure
  // resolve the real path does and lands on "no year yet" — the E2E suite keeps
  // passing with no test-store change. This asserts that rather than assuming it.
  const previous = process.env.E2E_TEST_MODE;

  afterEach(() => {
    if (previous === undefined) delete process.env.E2E_TEST_MODE;
    else process.env.E2E_TEST_MODE = previous;
  });

  it("resolves to no year without touching the database", async () => {
    process.env.E2E_TEST_MODE = "1";
    // DEFAULT_CAMP_CONFIG is what the store clones, and it carries no cycles.
    expect("cycles" in DEFAULT_CAMP_CONFIG).toBe(false);
    await expect(getCurrentCycle()).resolves.toBeNull();
  });
});
