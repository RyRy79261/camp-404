import "server-only";

import * as db from "@camp404/db/dietary";
import type { MyDietary } from "@camp404/db/dietary";
import type { Diet, FoodReactionEntry } from "@camp404/types";
import { usesTestStore } from "./test-mode";
import { dietaryTestStore } from "./test-store-dietary";

// A member's own dietary needs (#245): the pick-list and the old form's
// words, from @camp404/db/dietary or, under E2E, its twin. Only the member's
// own row: the caller passes the signed-in member's id, never another's.

export type { MyDietary };

export async function getMyDietary(userId: string): Promise<MyDietary> {
  return usesTestStore()
    ? dietaryTestStore.getMyDietary(userId)
    : db.getMyDietary(userId);
}

export async function saveMyDietary(input: {
  userId: string;
  foods: readonly FoodReactionEntry[];
  diets: readonly Diet[];
}): Promise<{ ok: true; savedAt: Date } | { ok: false; error: string }> {
  return usesTestStore()
    ? dietaryTestStore.saveMyDietary(input)
    : db.saveMyDietary(input);
}
