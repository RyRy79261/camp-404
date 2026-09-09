import { eq } from "drizzle-orm";
import { humanizeKey, slugify, type AudienceScope } from "@camp404/core";
import { createHttpDb, withTransaction } from "./index";
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

// --- Cycles: the year namespace --------------------------------------------
// A "cycle" is one burn year, and the year IS the cycle. One number does both
// jobs: it is the identity a captain reads and types, and it is the value
// stamped on questionnaire_activations.cycle and questionnaire_responses.cycle
// that namespaces a year's data. A year is a date, not a name, so nothing in
// here carries a label.
//
// It lives in `camp_settings.config` rather than its own table because that one
// number is all the app needs; everything else that is year-scoped is
// append-only and already bracketed by `created_at`. Written once a year by one
// person, so the same JSONB trade the teams config already makes applies.

/**
 * The plausible range for a burn year. Four digits, wide enough that no camp
 * reaches either end and narrow enough that a typo ("202", "20267") is refused
 * rather than stamped onto every row for the rest of the camp's life. A STATIC
 * range, deliberately: packages/db never reads the wall clock — whoever has one
 * passes the year in.
 */
export const MIN_CYCLE_YEAR = 2000;
export const MAX_CYCLE_YEAR = 2100;

/** A usable burn year: a plausible four-digit integer. */
export function isCycleYear(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_CYCLE_YEAR &&
    value <= MAX_CYCLE_YEAR
  );
}

function assertCycleYear(year: number): void {
  if (!isCycleYear(year)) {
    throw new Error(
      `A year has to be a whole number between ${MIN_CYCLE_YEAR} and ${MAX_CYCLE_YEAR}.`,
    );
  }
}

/**
 * The `cycle` value migration 0019 stamped on every row that existed before the
 * year namespace did, and the value currentCycleNumber() keeps returning until
 * a captain says what year it is. NOT a year — it sits below MIN_CYCLE_YEAR so
 * it can never collide with one — and it is temporary: setFoundingYear()
 * rewrites every row carrying it to the real founding year, which is what makes
 * it safe for a send to land here in the meantime.
 */
export const UNSET_CYCLE = 1;

/** One camp cycle: a burn year. The year is the identity AND the namespace. */
export interface CycleEntry {
  /** The burn year, e.g. 2027. Increments; never repeats. */
  year: number;
  /** ISO timestamp. */
  startedAt: string;
  /** null on exactly ONE entry: the year the camp is in now. */
  endedAt: string | null;
}

/**
 * Whether a questionnaire's answers survive a rollover.
 *
 * `carry` — the member stays done; the rollover leaves this questionnaire
 * alone and a later send skips anyone who already answered.
 * `fresh` — the member must answer again on a blank form. It never means the
 * old answer is destroyed: prior years' responses stay readable forever.
 */
export type CarryOverPolicy = "carry" | "fresh";

export interface CampConfig extends TeamsConfig {
  /**
   * Absent until a captain names the camp's founding year — then one entry per
   * year, oldest first. An absent or malformed list reads as "no year yet".
   */
  cycles?: CycleEntry[];
  /**
   * Policy for the RESERVED code keys (burner_profile, dietary, driver), which
   * can never have a questionnaire_definitions row and so have nowhere else to
   * carry a `carry_over` column. Unset entries fall back per key — see
   * CODE_CARRY_OVER_DEFAULTS.
   */
  questionnaireCarryOver?: Record<string, CarryOverPolicy>;
}

/**
 * The camp owner's ruling on the three RESERVED code keys, seeded as the
 * per-key default so an untouched camp already behaves the way they asked:
 *
 *   burner_profile        carry — "people's data carries over and they can just
 *                                 have to go through saving it again or
 *                                 updating it".
 *   dietary_requirements  carry — NOT ruled on; inferred. A stable personal
 *                                 attribute like the bio — allergies rarely
 *                                 change, and a member can update it whenever.
 *   driver_profile        fresh — "who's driving in whose car ... have to be
 *                                 fresh".
 *
 * Anything else falls back to `carry`, matching the definitions column default:
 * the rollover does nothing at all until a captain opts a questionnaire in.
 */
const CODE_CARRY_OVER_DEFAULTS: Readonly<Record<string, CarryOverPolicy>> = {
  burner_profile: "carry",
  dietary_requirements: "carry",
  driver_profile: "fresh",
};

function isCycleEntry(value: unknown): value is CycleEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    isCycleYear(entry.year) &&
    typeof entry.startedAt === "string" &&
    (entry.endedAt === null || typeof entry.endedAt === "string")
  );
}

/**
 * Coerce stored JSONB to a cycle list, year-ascending. EMPTY means this camp has
 * never said what year it is, and the cycle page's first screen asks. Wholesale
 * fallback (like resolveTeamsConfig, unlike resolveCodeCarryOver): a
 * half-written cycle list has no safe partial reading — a dropped entry would
 * silently renumber the camp — and reading it as "unset" routes a captain to a
 * screen that states the year out loud instead.
 */
export function resolveCycles(raw: unknown): CycleEntry[] {
  if (!raw || typeof raw !== "object") return [];
  const cycles = (raw as { cycles?: unknown }).cycles;
  if (
    !Array.isArray(cycles) ||
    cycles.length === 0 ||
    !cycles.every(isCycleEntry)
  ) {
    return [];
  }
  return [...(cycles as CycleEntry[])].sort((a, b) => a.year - b.year);
}

/**
 * The year the camp is in — the one entry with `endedAt === null`. NULL means no
 * year is configured yet, so every caller has to say what it does about that
 * rather than inheriting an invented founding year. Falls back to the latest
 * year if a write left none open, so a read never throws and the camp never
 * silently reverts to its first year.
 */
export function currentCycle(cycles: CycleEntry[]): CycleEntry | null {
  if (cycles.length === 0) return null;
  const open = cycles.filter((c) => c.endedAt === null);
  if (open.length === 1) return open[0]!;
  return cycles.reduce((a, b) => (b.year > a.year ? b : a), cycles[0]!);
}

/** PURE: the cycle list for a camp that has just named its founding year. */
export function foundingCycles(year: number, now: Date): CycleEntry[] {
  assertCycleYear(year);
  return [{ year, startedAt: now.toISOString(), endedAt: null }];
}

/**
 * PURE: close the year the camp is in and open the one it is moving to. Throws
 * rather than returning a bad list — every refusal here is a captain pressing
 * the button twice or fat-fingering the year, and the caller (advanceCycle) is
 * inside a transaction that must abort.
 *
 * The new year must be LATER than the current one, not merely different: a year
 * is a date and dates only go forwards. A camp that skips a burn goes straight
 * from 2026 to 2028, which is why this takes the year rather than incrementing.
 */
export function advanceCycles(
  cycles: CycleEntry[],
  year: number,
  now: Date,
): CycleEntry[] {
  assertCycleYear(year);
  const current = currentCycle(cycles);
  if (!current) {
    throw new Error("The camp hasn't said what year it is yet.");
  }
  // Checked separately from the comparison below: currentCycle picks the OPEN
  // entry, which a hand-edited config could leave behind the latest one.
  if (cycles.some((c) => c.year === year)) {
    throw new Error(`The camp has already had a ${year}.`);
  }
  if (year <= current.year) {
    throw new Error(`A new year has to be later than ${current.year}.`);
  }
  const stamp = now.toISOString();
  return [
    ...cycles.map((c) =>
      c.year === current.year && c.endedAt === null
        ? { ...c, endedAt: stamp }
        : c,
    ),
    { year, startedAt: stamp, endedAt: null },
  ];
}

/**
 * PER-KEY fallback, deliberately NOT the wholesale fallback resolveTeamsConfig
 * uses: one malformed entry must not discard the captain's other choices, nor
 * override the owner's default for the keys they ruled on.
 */
export function resolveCodeCarryOver(
  raw: unknown,
  key: string,
): CarryOverPolicy {
  const fallback = CODE_CARRY_OVER_DEFAULTS[key] ?? "carry";
  if (!raw || typeof raw !== "object") return fallback;
  const map = (raw as { questionnaireCarryOver?: unknown })
    .questionnaireCarryOver;
  if (!map || typeof map !== "object") return fallback;
  const value = (map as Record<string, unknown>)[key];
  if (value === "fresh") return "fresh";
  if (value === "carry") return "carry";
  return fallback;
}

/** PURE toggle for the captain control, in the setTeamArchived shape. */
export function setCodeCarryOver(
  config: CampConfig,
  key: string,
  policy: CarryOverPolicy,
): CampConfig {
  return {
    ...config,
    questionnaireCarryOver: {
      ...(config.questionnaireCarryOver ?? {}),
      [key]: policy,
    },
  };
}

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

// --- The audience vocabulary -----------------------------------------------
// "Who is this going to" was written out longhand at five sites: the send
// screen's SCOPE_LABEL and its separate hardcoded TEAM_LABEL, the raw
// `m.teams.join(", ")` member subtitle beside it, the roster's teamLabel()
// humanizer, and the frozen DEFAULT_TEAM_OPTIONS in lib/questionnaire.ts. Four
// of them could disagree with the camp config the moment a captain renamed or
// archived a team — and three of them did.
//
// It lives HERE, beside teamLabelMap, because the team half of the vocabulary
// is camp config: only this module knows that `power_and_lighting` currently
// reads "Power and Lighting". The scope half is static, so the two are joined
// once and every surface asks the same question. AudienceScope is imported
// rather than restated so a new scope is a compile error in the map below, the
// same way it already is in computeAudience's switch.
//
// Client islands never import this module (it pulls the DB driver) — server
// pages call it and pass the resolved strings down as props, exactly as they
// already do with teamLabelMap.

/**
 * The static half: one display string per scope. A Record over the full union,
 * so adding a scope to AudienceScope fails to compile until it is named here.
 * `team` reads "A team" because unaccompanied by a key it is the *choice* of
 * scope on a picker, not a resolved audience — audienceLabel swaps in the
 * team's own label the moment one is chosen.
 */
export const AUDIENCE_SCOPE_LABELS: Readonly<Record<AudienceScope, string>> = {
  everyone: "Everyone",
  team: "A team",
  team_leads: "Team leads",
  drivers: "Drivers",
  individual: "Specific members",
  opt_in: "Anyone who opts in",
};

/**
 * The display string for an audience: a scope, and the team it names when the
 * scope is `team`.
 *
 * Pass `labels` (from teamLabelMap) to resolve a team key against the camp's
 * CURRENT config, so a rename propagates. Without it — or for a key the config
 * has never heard of — the key is humanised rather than printed raw, which is
 * the difference between reading "Power and Lighting" and reading
 * `power_and_lighting`.
 */
export function audienceLabel(
  scope: AudienceScope,
  team?: string | null,
  labels?: Record<string, string>,
): string {
  if (scope === "team") {
    if (!team) return AUDIENCE_SCOPE_LABELS.team;
    return labels?.[team] ?? humanizeKey(team);
  }
  return AUDIENCE_SCOPE_LABELS[scope];
}

/** One entry in an audience picker: the stored value, and what a captain reads. */
export interface AudienceOption {
  value: string;
  label: string;
}

/**
 * The team choices a send picker may offer: ACTIVE teams only, in the camp's
 * configured order, under their configured labels.
 *
 * The `activeTeams` filter is the load-bearing half. Enumerating the raw
 * `teamEnum` (as the send screen did) offers a team the camp has ARCHIVED —
 * hidden from the roster filter and from onboarding, but still a legal send
 * target, so a captain could aim a questionnaire at a team that no longer
 * exists and be told it sent fine.
 */
export function teamPickerOptions(config: TeamsConfig): AudienceOption[] {
  return activeTeams(config).map((team) => ({
    value: team.key,
    label: team.label,
  }));
}

/**
 * The teams one member holds, as one readable line — "Kitchen, Structures".
 *
 * Resolved against the FULL label map (archived included, which is why this
 * takes a map rather than filtering to the active set): a member can still hold
 * a team the camp has retired, and dropping it from their subtitle would hide a
 * fact the roster elsewhere shows.
 */
export function memberTeamsLabel(
  teams: readonly string[],
  labels: Record<string, string>,
): string {
  return teams.map((team) => audienceLabel("team", team, labels)).join(", ");
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
 * Read the whole camp config — teams, years and the code-key carry-over map —
 * from the `camp_settings` singleton. Each section falls back independently, so
 * a malformed cycle list does not cost you the team labels.
 */
export async function getCampConfig(): Promise<CampConfig> {
  const db = createHttpDb();
  const [row] = await db
    .select({ config: campSettings.config })
    .from(campSettings)
    .limit(1);
  return {
    ...resolveTeamsConfig(row?.config),
    cycles: resolveCycles(row?.config),
    questionnaireCarryOver:
      (row?.config as CampConfig | undefined)?.questionnaireCarryOver ?? {},
  };
}

/**
 * The year the camp is in. NULL until a captain names the founding year — the
 * cycle page's first screen is what asks. One SELECT against the singleton.
 */
export async function getCurrentCycle(): Promise<CycleEntry | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({ config: campSettings.config })
    .from(campSettings)
    .limit(1);
  return currentCycle(resolveCycles(row?.config));
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

// --- Phase 2: pure config transforms (relabel / reorder / archive) ----------
// These are the ONLY edits Phase 2 allows: they never add or remove a team key
// (a new key needs an enum migration — Phase 4). Each is pure so it's unit-
// testable and can run identically against the DB row or the E2E test store.
//
// Each SPREADS the incoming config rather than returning a bare `{ teams }`
// literal. `camp_settings.config` is a single JSONB column and `teams` is only
// the first thing to live in it; a transform that rebuilds the object from
// scratch silently discards every other top-level key, so relabelling a team
// would wipe unrelated camp config. Latent while `teams` is the only key —
// load-bearing the moment it is not.

/**
 * Two teams may not answer to the same name. The team KEY is what the database
 * stores, so a duplicate label is not a data corruption — it is worse in a
 * quieter way: the roster filter, the send picker and every team chip render
 * the label, so two "Kitchen"s make a captain pick between two identical rows
 * and never learn which one they sent to.
 *
 * Sameness is judged on the SLUG, not the raw string: "Kitchen", "kitchen",
 * " Kitchen " and "Kïtchen" are one name to everyone reading the screen, so
 * they are one name here. That rule already exists — `slugify` (@camp404/core)
 * does NFKD → strip marks → lowercase → collapse to hyphens — and it is reused
 * rather than restated, so the two can never drift apart.
 *
 * `exceptNormalized` is the half that is easy to get wrong. Renaming a team to
 * a case or accent variant of ITS OWN name ("kitchen" → "Kitchen") must be
 * allowed: the row being renamed is not a rival. Pass the slug of the name that
 * row holds today and it is skipped; omit it and every existing name competes,
 * which is what an ADD (Phase 4) wants.
 *
 * An empty candidate slug (a label of nothing but punctuation or emoji) never
 * conflicts — it is not a name at all, and the caller's own min-length parse is
 * what refuses it. Returning "conflict" here would blame the wrong thing.
 */
export function roleNameConflicts(
  existing: Iterable<string>,
  candidate: string,
  exceptNormalized?: string,
): boolean {
  const wanted = slugify(candidate);
  if (!wanted) return false;
  for (const name of existing) {
    const taken = slugify(name);
    if (!taken) continue;
    if (exceptNormalized !== undefined && taken === exceptNormalized) continue;
    if (taken === wanted) return true;
  }
  return false;
}

/**
 * Thrown by renameTeam when the new label collides with another team's. It is a
 * named class so the caller can turn it into ONE captain-facing sentence
 * without string-matching a message — the same shape the last-active-team guard
 * uses. Thrown from the transform (rather than checked before the write) so the
 * comparison runs against the freshly-locked config inside mutateTeamsConfig's
 * transaction: two captains renaming two teams to "Logistics" at the same time
 * cannot both win, and the loser's transaction rolls back.
 */
export class TeamNameConflictError extends Error {
  constructor(public readonly label: string) {
    super(`Another team is already called "${label}".`);
    this.name = "TeamNameConflictError";
  }
}

/**
 * Rename one team's display label. Unknown key → config returned unchanged.
 * Throws TeamNameConflictError when another team already answers to that name
 * (case- and accent-insensitively); renaming a team to a variant of its own
 * name is always allowed.
 */
export function renameTeam(
  config: TeamsConfig,
  key: string,
  label: string,
): TeamsConfig {
  const target = config.teams.find((team) => team.key === key);
  if (!target) return config;
  // The whole list competes, minus the row being renamed — identified by the
  // slug of the name it holds today, which is what lets "kitchen" → "Kitchen"
  // through instead of colliding with itself.
  if (
    roleNameConflicts(
      config.teams.map((team) => team.label),
      label,
      slugify(target.label),
    )
  ) {
    throw new TeamNameConflictError(label);
  }
  return {
    ...config,
    teams: config.teams.map((team) =>
      team.key === key ? { ...team, label } : team,
    ),
  };
}

/** Archive / unarchive one team. Unknown key → config returned unchanged. */
export function setTeamArchived(
  config: TeamsConfig,
  key: string,
  archived: boolean,
): TeamsConfig {
  return {
    ...config,
    teams: config.teams.map((team) =>
      team.key === key ? { ...team, archived } : team,
    ),
  };
}

/**
 * Move one team up/down in the configured order, renormalising every `order` to
 * a contiguous 0..n-1 so the column never accumulates gaps. Unknown key or a
 * no-op move (already at the relevant edge) → config returned unchanged.
 */
export function moveTeam(
  config: TeamsConfig,
  key: string,
  direction: "up" | "down",
): TeamsConfig {
  const ordered = [...config.teams].sort((a, b) => a.order - b.order);
  const from = ordered.findIndex((team) => team.key === key);
  if (from === -1) return config;
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ordered.length) return config;
  const swapped = ordered[from]!;
  ordered[from] = ordered[to]!;
  ordered[to] = swapped;
  return {
    ...config,
    teams: ordered.map((team, index) => ({ ...team, order: index })),
  };
}

/** The sorted set of team keys, as a comparable string. */
function teamKeySignature(config: TeamsConfig): string {
  return config.teams
    .map((team) => team.key)
    .sort()
    .join(",");
}

/**
 * Guard the writer against a transform that adds or removes a team key — Phase 2
 * may only relabel / reorder / archive (key growth is Phase 4). Throws so a
 * buggy transform rolls the transaction back rather than corrupting the row.
 */
export function assertStableTeamKeys(
  before: TeamsConfig,
  after: TeamsConfig,
): void {
  if (teamKeySignature(before) !== teamKeySignature(after)) {
    throw new Error(
      "Team config mutation must not add or remove team keys (Phase 4).",
    );
  }
}

/**
 * Apply a transform to the stored config under the `camp_settings` singleton
 * lock — a `SELECT … FOR UPDATE` read-modify-write so concurrent captain edits
 * serialise (no lost updates), mirroring bootstrap.ts. Uses the pooled driver
 * (the HTTP driver has no transactions). Returns the persisted config.
 */
export async function mutateTeamsConfig(
  transform: (current: TeamsConfig) => TeamsConfig,
): Promise<TeamsConfig> {
  return await withTransaction(async (tx) => {
    // Ensure the singleton exists, then lock it for the read-modify-write.
    await tx
      .insert(campSettings)
      .values({ id: true })
      .onConflictDoNothing({ target: campSettings.id });
    const [locked] = await tx
      .select({ config: campSettings.config })
      .from(campSettings)
      .where(eq(campSettings.id, true))
      .for("update");
    const current = resolveTeamsConfig(locked?.config);
    const next = transform(current);
    assertStableTeamKeys(current, next);
    await tx
      .update(campSettings)
      .set({ config: next, updatedAt: new Date() })
      .where(eq(campSettings.id, true));
    return next;
  });
}
