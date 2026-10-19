import "server-only";

import { cache } from "react";
import * as cars from "@camp404/db/cars";
import type { MyLift } from "@camp404/db/cars";
import { getCampSettings } from "./camp-config";
import { testStore } from "./test-store";
import { twin } from "./twin";

// The year comes from the request's one settings read on the database side;
// the store reads its own year.
const lift = twin(
  {
    getMyLift: async (userId: string): Promise<MyLift | null> => {
      const { cycleNumber } = await getCampSettings();
      return cars.getMyLift(userId, cycleNumber);
    },
  },
  testStore,
  ["getMyLift"],
);

/**
 * The signed-in member's own lift this year (driving, riding, or neither).
 *
 * Under E2E it reads the test store's lift twin (`testStore.getMyLift`, seeded
 * through /api/test/seed-lift), which mirrors the database read case for case
 * (lib/__tests__/lifts.test.ts), so the home page's lift card and the My lift
 * program can be driven by Playwright.
 *
 * React `cache()`, keyed by the member: the program manifest (does this member
 * get My lift?) and the page that shows the lift share one read per request.
 * The year comes from the request's one settings read.
 */
export const getMyLift = cache(lift.getMyLift);
