import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import {
  DEFAULT_CAMP_CONFIG,
  DEFAULT_TEAMS,
  getTeamsConfig,
  type TeamConfigEntry,
} from "../camp-config";
import { useTestDb } from "./_harness";

// Transport and Logistics, Communications and HR and Mutant Vehicle join a camp
// that already exists (#236). The harness applies the migration to an empty
// database, so these tests store a camp's config first and run the migration's
// own SQL again.

const MIGRATION_SQL = readFileSync(
  new URL(
    "../../migrations/0045_new_teams_in_camp_config.sql",
    import.meta.url,
  ),
  "utf8",
);

const NEW_KEYS = [
  "transport_and_logistics",
  "communications_and_hr",
  "mutant_vehicle",
] as const;

/** A camp as production has it: the 8 founding teams and Finance, one
 *  relabelled and one archived by a captain, and a year list beside them. */
const LIVE_CONFIG = {
  teams: DEFAULT_TEAMS.slice(0, 9).map((t) =>
    t.key === "kitchen"
      ? { ...t, label: "Kitchen Crew" }
      : t.key === "ministry_of_memes"
        ? { ...t, archived: true }
        : t,
  ),
  cycles: [{ year: 2026 }],
};

interface StoredConfig {
  teams: TeamConfigEntry[];
  cycles?: unknown;
}

describe("0045_new_teams_in_camp_config", () => {
  const h = useTestDb();

  async function storeConfig(config: unknown) {
    await h
      .db()
      .insert(schema.campSettings)
      .values({ id: true, config: config as never });
  }

  async function storedConfig() {
    const [row] = await h
      .db()
      .select({ config: schema.campSettings.config })
      .from(schema.campSettings);
    return row!.config as unknown as StoredConfig;
  }

  it("starts from the camp production has: 9 teams, Finance last", () => {
    expect(LIVE_CONFIG.teams.map((t) => t.key)).toEqual([
      "kitchen",
      "structures",
      "power_and_lighting",
      "sanitation_and_water",
      "health_and_safety",
      "art_and_activities",
      "ministry_of_memes",
      "ministry_of_vibes",
      "finance",
    ]);
  });

  it("adds the three teams after the last team once, in order, and keeps the captain's edits", async () => {
    await storeConfig(LIVE_CONFIG);

    await h.client().exec(MIGRATION_SQL);
    await h.client().exec(MIGRATION_SQL);

    const config = await storedConfig();
    expect(config.teams.slice(9)).toEqual([
      {
        key: "transport_and_logistics",
        label: "Transport and Logistics",
        order: 9,
        archived: false,
      },
      {
        key: "communications_and_hr",
        label: "Communications and HR",
        order: 10,
        archived: false,
      },
      {
        key: "mutant_vehicle",
        label: "Mutant Vehicle",
        order: 11,
        archived: false,
      },
    ]);
    expect(config.teams).toHaveLength(12);
    expect(config.teams.slice(0, 9)).toEqual(LIVE_CONFIG.teams);
    expect(config.cycles).toEqual(LIVE_CONFIG.cycles);
    const teams = await getTeamsConfig();
    expect(teams.teams.map((t) => t.key)).toEqual(
      expect.arrayContaining([...NEW_KEYS]),
    );
  });

  it("keeps a team the camp already has untouched and adds only the others", async () => {
    const mutantVehicle = {
      key: "mutant_vehicle",
      label: "Art Car",
      order: 2,
      archived: true,
    };
    await storeConfig({ teams: [...LIVE_CONFIG.teams, mutantVehicle] });

    await h.client().exec(MIGRATION_SQL);

    const config = await storedConfig();
    expect(config.teams.slice(0, 10)).toEqual([
      ...LIVE_CONFIG.teams,
      mutantVehicle,
    ]);
    expect(config.teams.slice(10)).toEqual([
      {
        key: "transport_and_logistics",
        label: "Transport and Logistics",
        order: 9,
        archived: false,
      },
      {
        key: "communications_and_hr",
        label: "Communications and HR",
        order: 10,
        archived: false,
      },
    ]);
    expect(config.teams.filter((t) => t.key === "mutant_vehicle")).toEqual([
      mutantVehicle,
    ]);
  });

  it("leaves an empty team list alone, so it still reads as the default teams", async () => {
    await storeConfig({ teams: [] });

    await h.client().exec(MIGRATION_SQL);

    expect(await storedConfig()).toEqual({ teams: [] });
    const teams = await getTeamsConfig();
    expect(teams).toEqual(DEFAULT_CAMP_CONFIG);
  });

  it("stores the three teams under the team enum", () => {
    expect(schema.teamEnum.enumValues).toEqual(
      expect.arrayContaining([...NEW_KEYS]),
    );
  });
});
