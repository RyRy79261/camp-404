import "server-only";

import {
  upsertPushToken as dbUpsertPushToken,
  deletePushTokenForUser as dbDeletePushTokenForUser,
} from "@camp404/db/push";
import { isE2ETestMode } from "./test-mode";

type Platform = "web" | "ios" | "android";

// Server-only facade over the push-token data layer with the real-vs-test
// split, so the registration route works under Playwright without a DB
// (mirrors lib/users.ts / lib/notifications.ts). Route handlers import here,
// never @camp404/db/push directly.

/** Register / refresh a device token. No-op under E2E test mode (no DB). */
export async function registerPushToken(input: {
  userId: string;
  token: string;
  platform: Platform;
  topics?: string[];
}): Promise<void> {
  if (isE2ETestMode()) return;
  await dbUpsertPushToken(input);
}

/** Unregister a token, scoped to its owner. No-op under E2E test mode. */
export async function unregisterPushToken(
  userId: string,
  token: string,
): Promise<void> {
  if (isE2ETestMode()) return;
  await dbDeletePushTokenForUser(userId, token);
}
