import "server-only";

import { SAFETY_COUNTS_READER } from "@camp404/core";
import {
  safetyCounts,
  type SafetyCountRow,
  type SafetyCounts,
  type TelegramReach,
} from "@camp404/db/team-glance";
import { testStore } from "./test-store";
import { dietaryTestStore } from "./test-store-dietary";

// The in-memory twin of @camp404/db/team-glance, for E2E_TEST_MODE: the same
// counts over the store's members (approved, never an erased stub), through
// the same pure `safetyCounts`. Counts only, as on the database.
// lib/__tests__/team-glance-agreement.test.ts holds the two sides equal.

function approvedMembers() {
  return testStore
    .allUsers()
    .filter((u) => !u.sanitised && u.approvalStatus === "approved");
}

export const teamGlanceTestStore = {
  getSafetyCountsFor(viewerId: string): SafetyCounts | null {
    if (!SAFETY_COUNTS_READER.allows(testStore.actorInStore(viewerId))) {
      return null;
    }
    const cycle = testStore.currentCycleNumber();
    const dietary = new Map(dietaryTestStore.rows());
    const rows: SafetyCountRow[] = approvedMembers().flatMap((user) => {
      const place = testStore.getParticipation(user.id, cycle);
      if (!place) return [];
      const diet = dietary.get(user.id);
      const anaphylactic =
        !!diet &&
        (diet.isAnaphylactic ||
          diet.foods.some((f) => f.reaction === "anaphylaxis"));
      return [
        {
          status: place.status,
          hasEmergencyContact:
            (testStore.getEmergencyContacts(user.id)?.length ?? 0) > 0,
          burnerProfileDone: !!testStore.getProfile(user.id)?.completedAt,
          anaphylactic,
          allergiesNoted:
            !!diet &&
            (anaphylactic ||
              diet.foods.length > 0 ||
              (diet.allergies?.trim() ?? "") !== ""),
        },
      ];
    });
    return safetyCounts(rows);
  },

  countTelegramReach(): TelegramReach {
    const members = approvedMembers();
    return {
      connected: members.filter(
        (u) => testStore.getTelegramConnection(u.id).connected,
      ).length,
      members: members.length,
    };
  },

  countAnnouncementsSince(since: Date): number {
    return testStore
      .listBroadcasts()
      .filter((b) => b.publishedAt !== null && b.publishedAt >= since).length;
  },
};
