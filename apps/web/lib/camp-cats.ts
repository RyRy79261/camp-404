import "server-only";

import { isE2ETestMode } from "./test-mode";

/**
 * How long a program's window stays open before the two visiting cats turn
 * up, under the E2E harness only: a couple of seconds instead of the games
 * package's 1.5 minutes, so Playwright need not sit through it. Undefined
 * (the package's own default) everywhere else; there is no setting of its
 * own for a deployment to trip.
 */
export const E2E_CATS_DELAY_MS = 2_000;

export function campCatsDelayMs(): number | undefined {
  return isE2ETestMode() ? E2E_CATS_DELAY_MS : undefined;
}
