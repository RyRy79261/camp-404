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
