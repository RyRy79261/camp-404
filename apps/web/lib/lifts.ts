import "server-only";

import { getMyLift as dbGetMyLift, type MyLift } from "@camp404/db/cars";
import { usesTestStore } from "./test-mode";

/**
 * The signed-in member's own lift this year (driving, riding, or neither).
 * The in-memory E2E store models no cars, so under E2E it is always "neither"
 * and the home page's car card has no browser cover; its content is covered by
 * lib/__tests__/home.test.ts and the query by packages/db cars.test.ts.
 */
export async function getMyLift(userId: string): Promise<MyLift | null> {
  if (usesTestStore()) return null;
  return dbGetMyLift(userId);
}
