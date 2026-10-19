import "server-only";

import * as db from "@camp404/db/dietary";
import type { MyDietary } from "@camp404/db/dietary";
import { dietaryTestStore } from "./test-store-dietary";
import { twin } from "./twin";

// A member's own dietary needs (#245): the pick-list and the old form's
// words, from @camp404/db/dietary or, under E2E, its twin. Only the member's
// own row: the caller passes the signed-in member's id, never another's. How
// the old form's words read back is oldDietaryAnswer in @camp404/core;
// lib/__tests__/dietary-agreement.test.ts holds the two sides equal.

export type { MyDietary };

const dietary = twin(db, dietaryTestStore, ["getMyDietary", "saveMyDietary"]);

export const getMyDietary = dietary.getMyDietary;
export const saveMyDietary = dietary.saveMyDietary;
