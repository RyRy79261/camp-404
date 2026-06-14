import "server-only";

import {
  getTeamsConfig as dbGetTeamsConfig,
  mutateTeamsConfig as dbMutateTeamsConfig,
  activeTeams,
  teamLabelMap,
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

export type { TeamsConfig, TeamConfigEntry };
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
