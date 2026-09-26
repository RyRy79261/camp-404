import "server-only";

import { cache } from "react";
import {
  getCampConfig as dbGetCampConfig,
  mutateTeamsConfig as dbMutateTeamsConfig,
  activeTeams,
  audienceLabel,
  currentCycle,
  memberTeamsLabel,
  resolveCycles,
  resolveTeamsConfig,
  teamLabelMap,
  teamPickerOptions,
  AUDIENCE_SCOPE_LABELS,
  UNSET_CYCLE,
  type CycleEntry,
  type TeamsConfig,
  type TeamConfigEntry,
} from "@camp404/db/camp-config";
import type { AuditEvent } from "@camp404/db/audit";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Camp-config data facade. Routes reads/writes through the Neon-backed
// `@camp404/db/camp-config` normally, and through the in-memory test store under
// E2E_TEST_MODE (no database during Playwright runs) — the same real-vs-test
// split lib/roster.ts / lib/notifications.ts use. The store seeds with the same
// DEFAULT_CAMP_CONFIG the column default seeds, so reads match Phase-1 behaviour
// while now also reflecting edits made via mutateTeamsConfig in the same run.
// The pure shaping helpers (activeTeams/teamLabelMap/audienceLabel) are
// re-exported so server pages compute serialisable lists/maps to pass into
// client islands; the @camp404/db module is never imported client-side (it
// pulls the DB driver).

export type { CycleEntry, TeamsConfig, TeamConfigEntry };
export {
  activeTeams,
  audienceLabel,
  memberTeamsLabel,
  teamLabelMap,
  teamPickerOptions,
  AUDIENCE_SCOPE_LABELS,
};

/**
 * The camp settings one request needs, read once: the team config, every year
 * the camp has had, and the year it is in now.
 */
export interface CampSettings {
  teams: TeamsConfig;
  cycles: CycleEntry[];
  /** The year the camp is in, or null before a captain names the founding year. */
  current: CycleEntry | null;
  /**
   * The year every year-scoped read filters on: the current year, or the
   * `UNSET_CYCLE` sentinel on a camp with no year yet, exactly as
   * `currentCycleNumber()` in @camp404/db resolves it.
   */
  cycleNumber: number;
}

/**
 * The `camp_settings` singleton, read ONCE per request. The console used to
 * read it three or more times on every page: the team config for the nav,
 * then `currentCycleNumber()` inside each team-membership read. Everything on
 * the page that needs the teams or the year now shares this one read.
 *
 * React `cache()`, never `unstable_cache` or `"use cache"`: it lives for one
 * server request and is thrown away with it. No action reads this after
 * writing the config in the same call (the writes go through
 * `mutateTeamsConfig`, which reads the row itself); the re-render that
 * `revalidateManifest()` asks for is a new render and reads fresh.
 *
 * The E2E branch runs the same pure resolvers over the test store's config.
 */
export const getCampSettings = cache(async (): Promise<CampSettings> => {
  const raw: unknown = usesTestStore()
    ? testStore.getTeamsConfig()
    : await dbGetCampConfig();
  const cycles = resolveCycles(raw);
  const current = currentCycle(cycles);
  return {
    teams: resolveTeamsConfig(raw),
    cycles,
    current,
    cycleNumber: current?.year ?? UNSET_CYCLE,
  };
});

export async function getTeamsConfig(): Promise<TeamsConfig> {
  return (await getCampSettings()).teams;
}

/**
 * Apply a pure transform to the camp's team config (under the singleton lock in
 * the real path; against the test store under E2E). The transform must come from
 * the @camp404/db/camp-config helpers (renameTeam / moveTeam / setTeamArchived)
 * so the key set stays stable. Returns the persisted config.
 */
export function mutateTeamsConfig(
  transform: (current: TeamsConfig) => TeamsConfig,
  audit?: AuditEvent,
): Promise<TeamsConfig> {
  if (usesTestStore()) {
    const next = transform(testStore.getTeamsConfig());
    testStore.setTeamsConfig(next);
    return Promise.resolve(next);
  }
  return dbMutateTeamsConfig(transform, audit);
}

/**
 * The year the camp is in — the namespace an activation is stamped with at Send.
 * NULL until a captain names the founding year on the cycle page. Callers that
 * already hold an activation must read `activation.cycle` instead: that copy is
 * frozen, and a rollover landing mid-collection must not move an in-flight form
 * into the next year.
 *
 * The E2E branch runs the same pure resolve over the test store, which seeds
 * DEFAULT_CAMP_CONFIG — no `cycles` key — so `resolveCycles` yields an empty
 * list and this returns null. Playwright keeps running with no database and no
 * test-store change, and it stays honest if the store ever grows a cycles key.
 */
export async function getCurrentCycle(): Promise<CycleEntry | null> {
  return (await getCampSettings()).current;
}

/**
 * Every year the camp has had, oldest first, with their optional names. Empty
 * until a captain names the founding year. Same E2E split as getCurrentCycle.
 */
export async function getCycles(): Promise<CycleEntry[]> {
  return (await getCampSettings()).cycles;
}
