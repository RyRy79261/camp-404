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

interface RequiredVar {
  name: string;
  minLength?: number;
  hint: string;
}

const REQUIRED: RequiredVar[] = [
  {
    name: "PGCRYPTO_KEY",
    minLength: 16,
    hint: "16+ required, 32+ recommended (e.g. `openssl rand -base64 32`). Encrypts member ID-document PII at rest.",
  },
];

/**
 * Throw if any required env var is missing/invalid. No-op under E2E test mode.
 * Pure on its inputs (reads process.env) so it can be unit-tested directly.
 */
export function assertServerEnv(
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.E2E_TEST_MODE === "1") return;

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
