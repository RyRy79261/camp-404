import "server-only";

import { isComingThisYear } from "@camp404/core";
import type { SheetAllergyRow } from "@camp404/db/daily-sheet";
import { dietaryTestStore, resetDietaryStore } from "./test-store-dietary";
import { testStore } from "./test-store";

// The in-memory twin of @camp404/db/daily-sheet, for E2E_TEST_MODE: each
// member's allergy facts come from the dietary twin (test-store-dietary.ts:
// the old form's words, seeded by /api/test/seed-allergy, and the pick-list
// a member saves), and the same read: members who are coming this year,
// approved, with an allergy on the pick-list once saved, otherwise with the
// old allergy words or the severe flag. Kept apart from test-store.ts, which
// calls in here only to reset.

/** Forget every allergy (testStore.reset calls this). */
export function resetDailySheetStore(): void {
  resetDietaryStore();
}

export const dailySheetTestStore = {
  seedAllergy(
    userId: string,
    allergy: { allergies: string | null; isAnaphylactic: boolean },
  ): void {
    dietaryTestStore.seedOldAnswer(userId, allergy);
  },

  listSheetAllergies(cycle: number): SheetAllergyRow[] {
    return dietaryTestStore.rows().flatMap(([userId, a]) => {
      const user = testStore.findUserById(userId);
      if (!user || user.approvalStatus !== "approved") return [];
      const status = testStore.getParticipation(userId, cycle)?.status ?? null;
      if (!isComingThisYear(status)) return [];
      const foods = a.foodsSavedAt ? a.foods : null;
      const allergic = foods
        ? foods.some((f) => f.reaction !== "intolerance")
        : a.isAnaphylactic || (a.allergies ?? "").trim().length > 0;
      if (!allergic) return [];
      return [
        {
          userId,
          name: user.displayName ?? null,
          allergies: a.allergies,
          isAnaphylactic: a.isAnaphylactic,
          foods,
        },
      ];
    });
  },
};
