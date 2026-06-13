import { createHttpDb } from "./index";
import { campSettings } from "./schema";

// Editable camp-wide config that hangs off the `camp_settings` singleton.
// Phase 1 covers the team list: the Postgres `teamEnum` keys stay the type
// backbone (woven through ~9 tables); the config only governs the *active set*,
// display *labels*, and *order* (archive, never delete). Every consumer reads
// getTeamsConfig() so the previously-duplicated hardcoded label maps collapse
// into one source. App code goes through the E2E-aware wrapper in
// apps/web/lib/camp-config.ts so Playwright runs without a database.

export interface TeamConfigEntry {
  /** The `teamEnum` key — stable; config never renames it. */
  key: string;
  /** Display label (relabelable in Phase 2). */
  label: string;
  /** Display order, ascending. */
  order: number;
  /** Hidden from pickers/filters but still valid in stored responses. */
  archived: boolean;
}

export interface TeamsConfig {
  teams: TeamConfigEntry[];
}

// The 8 founding teams, seeded as the column default. Labels mirror the roster's
// previous `teamLabel()` humanizer ("Art and Activities") so Phase 1 renders
// identically. The schema.ts column seeds the SAME shape via a SQL default; the
// "seeds match DEFAULT_CAMP_CONFIG" test in camp-config.test.ts guards drift.
export const DEFAULT_TEAMS: TeamConfigEntry[] = [
  { key: "kitchen", label: "Kitchen", order: 0, archived: false },
  { key: "structures", label: "Structures", order: 1, archived: false },
  { key: "power_and_lighting", label: "Power and Lighting", order: 2, archived: false },
  { key: "sanitation_and_water", label: "Sanitation and Water", order: 3, archived: false },
  { key: "health_and_safety", label: "Health and Safety", order: 4, archived: false },
  { key: "art_and_activities", label: "Art and Activities", order: 5, archived: false },
  { key: "ministry_of_memes", label: "Ministry of Memes", order: 6, archived: false },
  { key: "ministry_of_vibes", label: "Ministry of Vibes", order: 7, archived: false },
];

export const DEFAULT_CAMP_CONFIG: TeamsConfig = { teams: DEFAULT_TEAMS };

/** Active (non-archived) teams, order-sorted — what pickers/filters render. */
export function activeTeams(config: TeamsConfig): TeamConfigEntry[] {
  return config.teams
    .filter((team) => !team.archived)
    .slice()
    .sort((a, b) => a.order - b.order);
}

/** A `key → label` lookup for rendering a team chip from a stored enum key. */
export function teamLabelMap(config: TeamsConfig): Record<string, string> {
  return Object.fromEntries(config.teams.map((team) => [team.key, team.label]));
}

function isTeamConfigEntry(value: unknown): value is TeamConfigEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.key === "string" &&
    typeof entry.label === "string" &&
    typeof entry.order === "number" &&
    typeof entry.archived === "boolean"
  );
}

/**
 * Coerce a stored config value (untyped JSONB) to a usable TeamsConfig, falling
 * back wholesale to the seeded defaults when it's missing, empty, or malformed
 * — every entry must validate, so a half-written config never renders a partial
 * team list. Pure, so it's unit-testable without a DB. (A hand-rolled check
 * rather than zod, which @camp404/db deliberately doesn't depend on.)
 */
export function resolveTeamsConfig(raw: unknown): TeamsConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_CAMP_CONFIG;
  const teams = (raw as { teams?: unknown }).teams;
  if (
    !Array.isArray(teams) ||
    teams.length === 0 ||
    !teams.every(isTeamConfigEntry)
  ) {
    return DEFAULT_CAMP_CONFIG;
  }
  return raw as TeamsConfig;
}

/**
 * Read the camp's team config from the `camp_settings` singleton (at most one
 * row), falling back to the seeded defaults via resolveTeamsConfig.
 */
export async function getTeamsConfig(): Promise<TeamsConfig> {
  const db = createHttpDb();
  const [row] = await db
    .select({ config: campSettings.config })
    .from(campSettings)
    .limit(1);
  return resolveTeamsConfig(row?.config);
}
