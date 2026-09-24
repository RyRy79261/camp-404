import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import {
  DEFAULT_CAMP_CONFIG,
  getTeamsConfig,
  type TeamConfigEntry,
} from "../camp-config";
import { useTestDb } from "./_harness";

// The owner's final team list (2026-09-24) reaches a camp that already exists:
// Sound and Water join it, and three teams whose key stays get their new name
// unless a captain has named them. The harness applies the migration to an
// empty database, so these tests store a camp's config first and run the
// migration's own SQL again.

const MIGRATION_SQL = readFileSync(
  new URL(
    "../../migrations/0049_sound_water_and_relabels_in_camp_config.sql",
    import.meta.url,
  ),
  "utf8",
);

function team(key: string, label: string, order: number): TeamConfigEntry {
  return { key, label, order, archived: false };
}

/** A camp as production has it after 0045: twelve teams under their old
 *  default labels, one renamed and one archived by a captain, and a year list
 *  beside them. */
const LIVE_TEAMS: TeamConfigEntry[] = [
  team("kitchen", "Kitchen Crew", 0),
  team("structures", "Structures", 1),
  team("power_and_lighting", "Power and Lighting", 2),
  team("sanitation_and_water", "Sanitation and Water", 3),
  { ...team("health_and_safety", "Health and Safety", 4), archived: true },
  team("art_and_activities", "Art and Activities", 5),
  team("ministry_of_memes", "Ministry of Memes", 6),
  team("ministry_of_vibes", "Ministry of Vibes", 7),
  team("finance", "Finance", 8),
  team("transport_and_logistics", "Transport and Logistics", 9),
  team("communications_and_hr", "Communications and HR", 10),
  team("mutant_vehicle", "Mutant Vehicle", 11),
];

interface StoredConfig {
  teams: TeamConfigEntry[];
  cycles?: unknown;
}

describe("0049_sound_water_and_relabels_in_camp_config", () => {
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

  it("renames the three old default labels, adds Sound then Water once, and keeps the rest", async () => {
    await storeConfig({ teams: LIVE_TEAMS, cycles: [{ year: 2026 }] });

    await h.client().exec(MIGRATION_SQL);
    await h.client().exec(MIGRATION_SQL);

    const config = await storedConfig();
    expect(config.teams).toEqual([
      team("kitchen", "Kitchen Crew", 0),
      team("structures", "Structures", 1),
      team("power_and_lighting", "Power and Lighting", 2),
      team("sanitation_and_water", "Sanitation and MOOP", 3),
      // Renamed, and still archived: the flag is the captain's.
      { ...team("health_and_safety", "Safety", 4), archived: true },
      team("art_and_activities", "Art and Activities", 5),
      team("ministry_of_memes", "Ministry of Memes", 6),
      team("ministry_of_vibes", "Ministry of Vibes", 7),
      team("finance", "Finance", 8),
      team("transport_and_logistics", "Transport and Logistics", 9),
      team("communications_and_hr", "Communications & HR", 10),
      team("mutant_vehicle", "Mutant Vehicle", 11),
      team("sound", "Sound", 12),
      team("water", "Water", 13),
    ]);
    expect(config.cycles).toEqual([{ year: 2026 }]);
    // What a new camp gets and what this camp now has are the same list, apart
    // from the captain's own edits.
    expect(config.teams.map((t) => t.key)).toEqual(
      DEFAULT_CAMP_CONFIG.teams.map((t) => t.key),
    );
  });

  it("keeps a label a captain chose for a team that is being renamed", async () => {
    const captainsOwn = LIVE_TEAMS.map((t) =>
      t.key === "sanitation_and_water"
        ? { ...t, label: "Loos and Litter" }
        : t.key === "health_and_safety"
          ? { ...t, label: "Rangers" }
          : t,
    );
    await storeConfig({ teams: captainsOwn });

    await h.client().exec(MIGRATION_SQL);

    const labels = new Map(
      (await storedConfig()).teams.map((t) => [t.key, t.label]),
    );
    expect(labels.get("sanitation_and_water")).toBe("Loos and Litter");
    expect(labels.get("health_and_safety")).toBe("Rangers");
    // The one still on its old default is renamed beside them.
    expect(labels.get("communications_and_hr")).toBe("Communications & HR");
  });

  it("adds only the team a camp does not have yet", async () => {
    const water = { key: "water", label: "H2O", order: 3, archived: true };
    await storeConfig({ teams: [...LIVE_TEAMS, water] });

    await h.client().exec(MIGRATION_SQL);

    const config = await storedConfig();
    expect(config.teams.filter((t) => t.key === "water")).toEqual([water]);
    expect(config.teams.at(-1)).toEqual(team("sound", "Sound", 12));
    expect(config.teams).toHaveLength(14);
  });

  it("leaves an empty team list alone, so it still reads as the default teams", async () => {
    await storeConfig({ teams: [] });

    await h.client().exec(MIGRATION_SQL);

    expect(await storedConfig()).toEqual({ teams: [] });
    expect(await getTeamsConfig()).toEqual(DEFAULT_CAMP_CONFIG);
  });

  it("stores Sound and Water under the team enum", () => {
    expect(schema.teamEnum.enumValues).toEqual(
      expect.arrayContaining(["sound", "water"]),
    );
  });
});
