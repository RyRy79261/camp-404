import "server-only";

import * as db from "@camp404/db/push";
import { twin } from "./twin";

type Platform = "web" | "ios" | "android";

interface PushTokenInput {
  userId: string;
  token: string;
  platform: Platform;
  topics?: string[];
}

// Server-only facade over the push-token data layer, so the registration
// route works under Playwright without a DB. Route handlers import here,
// never @camp404/db/push directly. The test store keeps no device tokens (it
// sends no push), so under E2E both writes do nothing; the switch is picked
// once (twin).
const tokens = twin(
  {
    upsertPushToken: (input: PushTokenInput) => db.upsertPushToken(input),
    deletePushTokenForUser: (userId: string, token: string) =>
      db.deletePushTokenForUser(userId, token),
  },
  {
    upsertPushToken: (_input: PushTokenInput) => undefined,
    deletePushTokenForUser: (_userId: string, _token: string) => undefined,
  },
  ["upsertPushToken", "deletePushTokenForUser"],
);

/** Register / refresh a device token. No-op under E2E test mode (no DB). */
export async function registerPushToken(input: PushTokenInput): Promise<void> {
  await tokens.upsertPushToken(input);
}

/** Unregister a token, scoped to its owner. No-op under E2E test mode. */
export async function unregisterPushToken(
  userId: string,
  token: string,
): Promise<void> {
  await tokens.deletePushTokenForUser(userId, token);
}
