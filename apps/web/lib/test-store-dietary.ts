import "server-only";

import { canCheckMenuAllergens } from "@camp404/core";
import {
  DIETARY_NOT_A_MEMBER,
  menuDietary,
  type MenuDietary,
  type MyDietary,
} from "@camp404/db/dietary";
import { reachRank } from "@camp404/db/power";
import {
  readDiets,
  readFoodReactions,
  type Diet,
  type FoodReactionEntry,
} from "@camp404/types";
import { testStore } from "./test-store";

// The in-memory twin of @camp404/db/dietary, for E2E_TEST_MODE: each member's
// dietary row (the old form's words, seeded by /api/test/seed-allergy, and the
// pick-list, saved by the member's own form) and the same reads: the member's
// own row, and the meal plan's counts for a captain or a Kitchen lead, counts
// only. The daily sheet's twin reads its allergy line from here too. Kept
// apart from test-store.ts, which calls in here only to reset.

interface DietaryRow {
  allergies: string | null;
  isAnaphylactic: boolean;
  notes: string | null;
  foods: FoodReactionEntry[];
  diets: Diet[];
  foodsSavedAt: Date | null;
}

const KEY = "__camp404DietaryTestStore__";

function state(): Map<string, DietaryRow> {
  const g = globalThis as Record<string, unknown>;
  g[KEY] ??= new Map<string, DietaryRow>();
  return g[KEY] as Map<string, DietaryRow>;
}

/** Forget every row (testStore.reset calls this). */
export function resetDietaryStore(): void {
  state().clear();
}

const blank = (): DietaryRow => ({
  allergies: null,
  isAnaphylactic: false,
  notes: null,
  foods: [],
  diets: [],
  foodsSavedAt: null,
});

export const dietaryTestStore = {
  /** Test only: the old form's words for a member. */
  seedOldAnswer(
    userId: string,
    old: { allergies: string | null; isAnaphylactic: boolean },
  ): void {
    const row = state().get(userId) ?? blank();
    state().set(userId, { ...row, ...old });
  },

  /** Every member's row, for the daily sheet's twin. */
  rows(): [string, DietaryRow][] {
    return [...state().entries()];
  },

  /** The twin of getMyDietary. */
  getMyDietary(userId: string): MyDietary {
    const row = state().get(userId);
    if (!row) return { foods: [], diets: [], savedAt: null, old: null };
    const allergies = row.allergies?.trim() || null;
    const notes = row.notes?.trim() || null;
    return {
      foods: row.foods,
      diets: row.diets,
      savedAt: row.foodsSavedAt,
      old:
        allergies || notes || row.isAnaphylactic
          ? { allergies, isAnaphylactic: row.isAnaphylactic, notes }
          : null,
    };
  },

  /** The twin of saveMyDietary. */
  saveMyDietary(input: {
    userId: string;
    foods: readonly FoodReactionEntry[];
    diets: readonly Diet[];
  }): { ok: true; savedAt: Date } | { ok: false; error: string } {
    const user = testStore.findUserById(input.userId);
    if (!user) return { ok: false, error: DIETARY_NOT_A_MEMBER };
    const now = new Date();
    const row = state().get(input.userId) ?? blank();
    state().set(input.userId, {
      ...row,
      foods: readFoodReactions(input.foods),
      diets: readDiets(input.diets),
      foodsSavedAt: now,
    });
    return { ok: true, savedAt: now };
  },

  /** The twin of getMenuDietaryFor: counts only, for the meal plan's editors. */
  getMenuDietaryFor(viewerId: string): MenuDietary | null {
    const reach = testStore.senderReach(viewerId);
    if (!canCheckMenuAllergens(reachRank(reach), reach ?? [])) return null;
    const cycle = testStore.currentCycleNumber();
    return menuDietary(
      [...state().entries()].flatMap(([userId, row]) => {
        const user = testStore.findUserById(userId);
        if (!user || user.approvalStatus !== "approved") return [];
        return [
          {
            status: testStore.getParticipation(userId, cycle)?.status ?? null,
            foodReactions: row.foods,
            diets: row.diets,
            foodsSavedAt: row.foodsSavedAt,
            allergies: row.allergies,
            isAnaphylactic: row.isAnaphylactic,
            notes: row.notes,
          },
        ];
      }),
    );
  },
};
