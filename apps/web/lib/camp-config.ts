import "server-only";

import {
  getTeamsConfig as dbGetTeamsConfig,
  getCurrentCycle as dbGetCurrentCycle,
  mutateTeamsConfig as dbMutateTeamsConfig,
  activeTeams,
  currentCycle,
  resolveCycles,
  teamLabelMap,
  type CycleEntry,
  type TeamsConfig,
  type TeamConfigEntry,
} from "@camp404/db/camp-config";
import { isE2ETestMode } from "./test-mode";
import { testStore } from "./test-store";

// Camp-config data facade. Routes reads/writes through the Neon-backed
// `@camp404/db/camp-config` normally, and through the in-memory test store under
// E2E_TEST_MODE (no database during Playwright runs) — the same real-vs-test
// split lib/roster.ts / lib/notifications.ts use. The store seeds with the same
// DEFAULT_CAMP_CONFIG the column default seeds, so reads match Phase-1 behaviour
// while now also reflecting edits made via mutateTeamsConfig in the same run.
// The pure shaping helpers (activeTeams/teamLabelMap) are re-exported so server
// pages compute serialisable lists/maps to pass into client islands; the
// @camp404/db module is never imported client-side (it pulls the DB driver).

export type { CycleEntry, TeamsConfig, TeamConfigEntry };
export { activeTeams, teamLabelMap };

export function getTeamsConfig(): Promise<TeamsConfig> {
  return isE2ETestMode()
    ? Promise.resolve(testStore.getTeamsConfig())
    : dbGetTeamsConfig();
}

/**
 * Apply a pure transform to the camp's team config (under the singleton lock in
 * the real path; against the test store under E2E). The transform must come from
 * the @camp404/db/camp-config helpers (renameTeam / moveTeam / setTeamArchived)
 * so the key set stays stable. Returns the persisted config.
 */
export function mutateTeamsConfig(
  transform: (current: TeamsConfig) => TeamsConfig,
): Promise<TeamsConfig> {
  if (isE2ETestMode()) {
    const next = transform(testStore.getTeamsConfig());
    testStore.setTeamsConfig(next);
    return Promise.resolve(next);
  }
  return dbMutateTeamsConfig(transform);
}

/**
 * The camp's current cycle — the year namespace an activation is stamped with
 * at Send. Callers that already hold an activation must read `activation.cycle`
 * instead: that copy is frozen, and a rollover landing mid-collection must not
 * move an in-flight form into the next year.
 *
 * The E2E branch runs the same pure resolve over the test store, which seeds
 * DEFAULT_CAMP_CONFIG — no `cycles` key — so `resolveCycles` yields [CYCLE_ONE]
 * and Playwright keeps running with no database and no test-store change. It
 * stays honest if the store ever grows a cycles key.
 */
export function getCurrentCycle(): Promise<CycleEntry> {
  return isE2ETestMode()
    ? Promise.resolve(currentCycle(resolveCycles(testStore.getTeamsConfig())))
    : dbGetCurrentCycle();
}
