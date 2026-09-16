import "server-only";

import {
  getCampManagementRoster as dbGetCampManagementRoster,
  type CampManagementMember,
  type CampManagementRosterOptions,
} from "@camp404/db/roster";
import { isE2ETestMode } from "./test-mode";
import { testStore } from "./test-store";

// Camp-management roster data facade. Routes through the Neon-backed
// `@camp404/db/roster` query normally, and through the in-memory test store under
// E2E_TEST_MODE — the same real-vs-test split `lib/notifications.ts` /
// `lib/promotion.ts` use, so the captain roster renders without a database during
// Playwright runs. The captain pages import the read from here; the pure
// view-models stay in `lib/camp-roster.ts`.

export type { CampManagementMember };

interface RosterBackend {
  getCampManagementRoster(
    options?: CampManagementRosterOptions,
  ): Promise<CampManagementMember[]>;
}

const realBackend: RosterBackend = {
  getCampManagementRoster: dbGetCampManagementRoster,
};

const testBackend: RosterBackend = {
  async getCampManagementRoster(options) {
    return testStore.getCampManagementRoster(options);
  },
};

function backend(): RosterBackend {
  return isE2ETestMode() ? testBackend : realBackend;
}

/** Pass `includeEmail` only for a captain viewer. */
export function getCampManagementRoster(
  options?: CampManagementRosterOptions,
): Promise<CampManagementMember[]> {
  return backend().getCampManagementRoster(options);
}
