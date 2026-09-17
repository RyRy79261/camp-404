/**
 * Boot-time validation of server env vars that, if missing or malformed, break
 * a core user flow in a way that is otherwise hard to diagnose. The motivating
 * case: without `PGCRYPTO_KEY`, every questionnaire save that includes a
 * government ID number throws mid-flow (the encrypt call has no key) and the
 * member is silently stuck between onboarding pages. Validating at startup
 * turns that into a loud, actionable failure at deploy time instead.
 *
 * Called from `instrumentation.ts`'s `register()`. Skipped under
 * E2E_TEST_MODE: the in-memory test backend never encrypts, so the e2e harness
 * deliberately runs without these secrets.
 */

/**
 * The shortest PGCRYPTO_KEY the app boots with. Below this the key is too weak
 * to encrypt member ID numbers.
 */
export const PGCRYPTO_KEY_MIN_LENGTH = 16;

interface RequiredVar {
  name: string;
  minLength?: number;
  hint: string;
}

const REQUIRED: RequiredVar[] = [
  {
    name: "PGCRYPTO_KEY",
    minLength: PGCRYPTO_KEY_MIN_LENGTH,
    hint: "16+ required, 32+ recommended (e.g. `openssl rand -base64 32`). Encrypts member ID-document PII at rest.",
  },
];

/**
 * Throw if any required env var is missing/invalid. Under E2E test mode the
 * secrets are skipped, but only off a real deploy (see below).
 * Pure on its inputs (reads process.env) so it can be unit-tested directly.
 */
export function assertServerEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.E2E_TEST_MODE === "1") {
    // The test harness turns on /api/test/login, which signs anyone in as any
    // user and any email, god addresses included. A deploy with this flag set
    // is an open door, so refuse to boot rather than trust nobody sets it.
    // Playwright runs `next dev` (NODE_ENV=development); CI may also run a
    // production build, and it sets CI. A Vercel deploy is refused whatever
    // NODE_ENV says.
    const onVercel =
      env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview";
    const productionOutsideCi = env.NODE_ENV === "production" && !env.CI;
    if (onVercel || productionOutsideCi) {
      throw new Error(
        "Camp 404: E2E_TEST_MODE=1 is set on a deployed server. It enables a test login that signs anyone in as anyone. Remove E2E_TEST_MODE from this environment.",
      );
    }
    return;
  }

  const problems: string[] = [];
  for (const v of REQUIRED) {
    const value = env[v.name];
    if (!value) {
      problems.push(`  - ${v.name} is not set. ${v.hint}`);
    } else if (v.minLength && value.length < v.minLength) {
      problems.push(
        `  - ${v.name} is too short (needs at least ${v.minLength} characters). ${v.hint}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Camp 404: missing or invalid required environment variables:\n${problems.join(
        "\n",
      )}\nSee .env.example. The app cannot encrypt member PII without these, and onboarding will fail.`,
    );
  }
}
