import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import { DEFAULT_CAMP_CONFIG, getTeamsConfig } from "../camp-config";
import { useTestDb } from "./_harness";

// Finance joins a camp that already exists. The harness applies the migration
// to an empty database, so these tests store a camp's config first and run the
// migration's own SQL again.

const MIGRATION_SQL = readFileSync(
  new URL(
    "../../migrations/0040_finance_team_in_camp_config.sql",
    import.meta.url,
  ),
  "utf8",
);

/** A camp as production has it: the 8 founding teams, one relabelled and one
 *  archived by a captain, and a year list beside them. */
const LIVE_CONFIG = {
  teams: DEFAULT_CAMP_CONFIG.teams
    .filter((t) => t.key !== "finance")
    .map((t) =>
      t.key === "kitchen"
        ? { ...t, label: "Kitchen Crew" }
        : t.key === "ministry_of_memes"
          ? { ...t, archived: true }
          : t,
    ),
  cycles: [{ year: 2026 }],
};

describe("0040_finance_team_in_camp_config", () => {
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
    return row!.config as unknown as typeof LIVE_CONFIG;
  }

  it("adds Finance after the last team once, and keeps the captain's edits", async () => {
    await storeConfig(LIVE_CONFIG);

    await h.client().exec(MIGRATION_SQL);
    await h.client().exec(MIGRATION_SQL);

    const config = await storedConfig();
    expect(config.teams.filter((t) => t.key === "finance")).toEqual([
      { key: "finance", label: "Finance", order: 8, archived: false },
    ]);
    expect(config.teams.slice(0, 8)).toEqual(LIVE_CONFIG.teams);
    expect(config.cycles).toEqual(LIVE_CONFIG.cycles);
    const teams = await getTeamsConfig();
    expect(teams.teams.map((t) => t.key)).toContain("finance");
  });

  it("leaves a camp that already has Finance alone", async () => {
    const withFinance = {
      teams: [
        ...LIVE_CONFIG.teams,
        { key: "finance", label: "Money", order: 3, archived: true },
      ],
    };
    await storeConfig(withFinance);

    await h.client().exec(MIGRATION_SQL);

    expect(await storedConfig()).toEqual(withFinance);
  });

  it("leaves an empty team list alone, so it still reads as the default teams", async () => {
    await storeConfig({ teams: [] });

    await h.client().exec(MIGRATION_SQL);

    expect(await storedConfig()).toEqual({ teams: [] });
    const teams = await getTeamsConfig();
    expect(teams).toEqual(DEFAULT_CAMP_CONFIG);
  });

  it("stores Finance under the team enum", async () => {
    expect(schema.teamEnum.enumValues).toContain("finance");
  });
});
