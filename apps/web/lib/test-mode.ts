import "server-only";

// E2E test harness. The entire bypass below is gated on E2E_TEST_MODE=1
// — production never sets this env, so the test-only login route is
// never registered and the auth/DB helpers always fall through to Neon
// Auth and the Neon database. Don't set this flag in any deployed
// environment.

export const TEST_USER_COOKIE = "camp404_test_user";

export function isE2ETestMode(): boolean {
  return process.env.E2E_TEST_MODE === "1";
}

/**
 * Whether data reads and writes go to the in-memory test store. True in the
 * default E2E run. False in the real-database E2E run
 * (E2E_DATABASE=real, playwright.db.config.ts): the test login and the other
 * outside-service stubs stay, but every query hits the local Postgres stack,
 * so the questionnaire engine and the year rollover run for real.
 */
export function usesTestStore(): boolean {
  return isE2ETestMode() && process.env.E2E_DATABASE !== "real";
}
