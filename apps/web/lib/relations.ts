import "server-only";

import type { ReferralUser } from "@camp404/types";
import { getReferralRoster as dbGetReferralRoster } from "@camp404/db/relations";
import { isE2ETestMode } from "./test-mode";
import { testStore } from "./test-store";

// The family tree's referral list, from the database normally and from the
// in-memory test store under E2E_TEST_MODE, the same split lib/roster.ts uses,
// so /family-tree renders during Playwright runs.

export async function getReferralRoster(): Promise<ReferralUser[]> {
  return isE2ETestMode()
    ? testStore.getReferralRoster()
    : dbGetReferralRoster();
}
