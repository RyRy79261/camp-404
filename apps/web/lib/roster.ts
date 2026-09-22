import "server-only";

import {
  getCampManagementRoster as dbGetCampManagementRoster,
  type CampManagementMember,
  type CampManagementRosterOptions,
} from "@camp404/db/roster";
import {
  getTeamCoverage as dbGetTeamCoverage,
  type TeamCoverage,
} from "@camp404/db/team-memberships";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Camp-management roster data facade. Routes through the Neon-backed
// `@camp404/db/roster` query normally, and through the in-memory test store under
// E2E_TEST_MODE — the same real-vs-test split `lib/notifications.ts` /
// `lib/promotion.ts` use, so the captain roster renders without a database during
// Playwright runs. The captain pages import the read from here; the pure
// view-models stay in `lib/camp-roster.ts`.

export type { CampManagementMember, TeamCoverage };

interface RosterBackend {
  getCampManagementRoster(
    options?: CampManagementRosterOptions,
  ): Promise<CampManagementMember[]>;
  getTeamCoverage(): Promise<TeamCoverage[]>;
}

const realBackend: RosterBackend = {
  getCampManagementRoster: dbGetCampManagementRoster,
  getTeamCoverage: dbGetTeamCoverage,
};

const testBackend: RosterBackend = {
  async getCampManagementRoster(options) {
    return testStore.getCampManagementRoster(options);
  },
  async getTeamCoverage() {
    return testStore.getTeamCoverage();
  },
};

function backend(): RosterBackend {
  return usesTestStore() ? testBackend : realBackend;
}

/** Pass `includeEmail` only for a captain viewer. */
export function getCampManagementRoster(
  options?: CampManagementRosterOptions,
): Promise<CampManagementMember[]> {
  return backend().getCampManagementRoster(options);
}

/**
 * Head count and lead count per team for THIS year — the Overview's coverage
 * rail. Only teams somebody is on come back; the caller renders the camp's
 * configured teams and fills the missing ones in as empty, so a team with
 * nobody on it still shows.
 */
export function getTeamCoverage(): Promise<TeamCoverage[]> {
  return backend().getTeamCoverage();
}
