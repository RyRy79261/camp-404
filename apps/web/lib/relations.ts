import "server-only";

import { deriveViewerRank, referralRosterForViewer } from "@camp404/core";
import type { ReferralUser } from "@camp404/types";
import { getReferralRoster as dbGetReferralRoster } from "@camp404/db/relations";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";
import { isTeamLead, type CampUser } from "./users";

// The family tree's referral list, from the database normally and from the
// in-memory test store under E2E_TEST_MODE, the same split lib/roster.ts uses,
// so /family-tree renders during Playwright runs.

export async function getReferralRoster(): Promise<ReferralUser[]> {
  return usesTestStore()
    ? testStore.getReferralRoster()
    : dbGetReferralRoster();
}

/**
 * The family tree as `viewer` may read it. The codes are cut on the server
 * (core referralRosterForViewer), so a member's page never receives another
 * member's invite code.
 */
export async function getReferralRosterForViewer(
  viewer: CampUser,
): Promise<ReferralUser[]> {
  const [roster, isLead] = await Promise.all([
    getReferralRoster(),
    viewer.rank === "captain" ? false : isTeamLead(viewer.id),
  ]);
  return referralRosterForViewer(roster, {
    id: viewer.id,
    rank: deriveViewerRank(viewer.rank, isLead),
  });
}
