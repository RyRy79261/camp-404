import "server-only";

import {
  getTeamsConfig as dbGetTeamsConfig,
  DEFAULT_CAMP_CONFIG,
  activeTeams,
  teamLabelMap,
  type TeamsConfig,
  type TeamConfigEntry,
} from "@camp404/db/camp-config";
import { isE2ETestMode } from "./test-mode";

// Camp-config data facade. Routes through the Neon-backed `@camp404/db/camp-config`
// read normally, and returns the seeded defaults under E2E_TEST_MODE (no
// database during Playwright runs) — the same real-vs-test split lib/roster.ts /
// lib/notifications.ts use. The pure shaping helpers (activeTeams/teamLabelMap)
// are re-exported so server pages compute the serialisable lists/maps to pass
// into client islands; the @camp404/db module is never imported client-side
// (it pulls the DB driver).

export type { TeamsConfig, TeamConfigEntry };
export { activeTeams, teamLabelMap };

export function getTeamsConfig(): Promise<TeamsConfig> {
  // The seeded defaults are the test camp's teams; no DB read in E2E mode.
  return isE2ETestMode()
    ? Promise.resolve(DEFAULT_CAMP_CONFIG)
    : dbGetTeamsConfig();
}
