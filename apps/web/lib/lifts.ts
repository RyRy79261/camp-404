import "server-only";

import { cache } from "react";
import { getMyLift as dbGetMyLift, type MyLift } from "@camp404/db/cars";
import { getCampSettings } from "./camp-config";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

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
export const getMyLift = cache(
  async (userId: string): Promise<MyLift | null> => {
    if (usesTestStore()) return testStore.getMyLift(userId);
    const { cycleNumber } = await getCampSettings();
    return dbGetMyLift(userId, cycleNumber);
  },
);
