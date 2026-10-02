import "server-only";

import { isComingThisYear } from "@camp404/core";
import type { SheetAllergyRow } from "@camp404/db/daily-sheet";
import { testStore } from "./test-store";

// The in-memory twin of @camp404/db/daily-sheet, for E2E_TEST_MODE: each
// member's allergy facts (the store does not model dietary_requirements
// otherwise), seeded by /api/test/seed-allergy, and the same read: members
// who are coming this year, approved, with allergy words or the severe flag.
// Kept apart from test-store.ts, which calls in here only to reset.

interface Allergy {
  allergies: string | null;
  isAnaphylactic: boolean;
}

const KEY = "__camp404DailySheetTestStore__";

function state(): Map<string, Allergy> {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= new Map<string, Allergy>();
  return g[KEY] as Map<string, Allergy>;
}

/** Forget every allergy (testStore.reset calls this). */
export function resetDailySheetStore(): void {
  state().clear();
}

export const dailySheetTestStore = {
  seedAllergy(userId: string, allergy: Allergy): void {
    state().set(userId, { ...allergy });
  },

  listSheetAllergies(cycle: number): SheetAllergyRow[] {
    return [...state().entries()].flatMap(([userId, a]) => {
      const user = testStore.findUserById(userId);
      if (!user || user.approvalStatus !== "approved") return [];
      const status = testStore.getParticipation(userId, cycle)?.status ?? null;
      if (!isComingThisYear(status)) return [];
      if (!a.isAnaphylactic && !(a.allergies ?? "").trim()) return [];
      return [
        {
          userId,
          name: user.displayName ?? null,
          allergies: a.allergies,
          isAnaphylactic: a.isAnaphylactic,
        },
      ];
    });
  },
};
