# Camp 404 — End-to-end tests

Two complementary layers cover the questionnaire and invite-gate flows.

## Layer 1 — Vitest + React Testing Library

`apps/web/components/__tests__/*` — pure React tests run under jsdom. No
server, no DB, no network. Exercises:

- the questionnaire wizard's multi-page navigation, validation, and
  submission contract (`wizard.test.tsx`),
- the questionnaire schema + validator (`questionnaire.test.ts`),
- the in-memory rate limiter (`rate-limit.test.ts`).

Run with:

```bash
pnpm --filter @camp404/web test
```

This is the fast feedback layer — sub-second, runs on every PR.

## Layer 2 — Playwright

`apps/web/tests/e2e/*.spec.ts`. Auto-starts `next dev` on port 3000 with
the following fixture env (see `playwright.config.ts`):

| Var | Value | Purpose |
|---|---|---|
| `E2E_TEST_MODE` | `1` | Enables `/api/test/{login,logout,reset,seed-invite,inspect,complete-onboarding}` and routes auth + DB through an in-memory store. The whole test-mode harness is gated on this flag — production never sets it. |
| `INVITE_CODES` | `TEST-INVITE` | One known bootstrap (env-list) code for redemption specs. |
| `GOD_EMAILS` | `god@example.com` | One whitelisted god account that bypasses the invite gate. |

Run with:

```bash
# First time only:
pnpm --filter @camp404/web exec playwright install chromium

# Run the suite:
pnpm --filter @camp404/web test:e2e
```

### How auth bypass works

In production, every page that needs a user calls
`getAuthenticatedUser()` which reads the Neon Auth session cookie. In
test mode, that same helper looks for the `camp404_test_user` cookie
first and only falls back to Neon Auth if it's absent. Playwright specs
POST to `/api/test/login` with a JSON body to set that cookie:

```ts
await login(request, { id: "alice-auth", email: "god@example.com" });
```

The `id` field becomes the synthetic auth-user id, so the camp `users`
row that gets lazily created is keyed to it deterministically. The
in-memory store (`apps/web/lib/test-store.ts`) replaces all the
Neon-backed reads/writes in this mode.

#### Reaching post-onboarding gates

The burner-profile questionnaire is a 13-page wizard. Its page-by-page
navigation, validation and submission contract are covered at the
component layer (`components/__tests__/wizard.test.tsx`), so e2e specs
don't re-drive every field — they call `completeOnboarding(request,
authUserId)` (POST `/api/test/complete-onboarding`) to mark the profile
complete and jump straight to the gates that follow it (home vs.
`/pending-approval`). The user row must exist first, so hit a gated page
(e.g. `/`) once after login before calling it.

> Note: the captains' camp-management roster (`getCampManagementRoster` /
> `getCampMemberDetail`) reads the **real** Neon DB, not the in-memory
> store, so the approve/reject UI isn't drivable under `E2E_TEST_MODE`.
> The approval *gate* (pending users blocked at `/pending-approval`) and
> the `users.approval_status` stamping on redemption are, since those go
> through the test-backed `users` helpers.

### Spec coverage

- `home.spec.ts` — unauth home page shows both auth CTAs.
- `signup.spec.ts` — invite form renders, invalid codes error, valid
  codes set the cookie and redirect to the Neon Auth sign-up page.
- `api.spec.ts` — `/api/health` returns ok, `/api/voice/transcribe`
  rejects unauthenticated callers with 401.
- `authenticated.spec.ts` — god email reaches the questionnaire,
  non-god without invite is bounced to `/signup/required`, redeeming an
  invite at `/signup` unlocks the questionnaire, an approved user who
  finishes onboarding lands home, a pending (vetting-required) user is
  held at `/pending-approval` after onboarding, and voice transcribe
  accepts an authed request while rejecting bad input.
- `invite-tracking.spec.ts` — env (bootstrap) code redemption survives
  signup, DB-backed codes record their issuer and use count, an
  approval-required code creates a `pending` account and a pre-approved
  one creates an `approved` account, and an exhausted code can't be
  claimed even by a stale cookie.

### Running against a deployed preview

The test-mode endpoints are deliberately disabled in production. To run
the unauth-only specs (`home`, `signup`, `api`, `smoke`) against a
deployed preview, point at it and skip the bundled server:

```bash
export PLAYWRIGHT_BASE_URL=https://your-preview.vercel.app
export PLAYWRIGHT_SKIP_WEB_SERVER=1
pnpm --filter @camp404/web test:e2e -- home.spec.ts signup.spec.ts api.spec.ts
```

The `authenticated.spec.ts` and `invite-tracking.spec.ts` specs depend
on `E2E_TEST_MODE` and so only run against the local dev server.

## What real production E2E will need

Once a Neon database and a Neon Auth project are wired up, the
`E2E_TEST_MODE` harness can stay as the fast development inner loop and
a parallel suite of "true" E2E specs can drive real Neon Auth signups
and real DB rows. The shape that fits the existing scaffolding:

1. Create a dedicated test Neon Auth project; surface
   `NEON_AUTH_TEST_*` env vars to a separate Playwright config.
2. Use the Neon Auth server API to create + delete a fresh user per
   spec.
3. Use Playwright's `context.addCookies()` to inject the Neon Auth
   session token.
4. Drop a Neon branch DB per CI run via `neon branches create`, point
   the dev server at it, then delete the branch in teardown.

The existing `_helpers.ts` already isolates the
`login` / `resetTestState` shape — a real-Neon-Auth implementation
would share the same signature so the specs themselves don't change.

## CI

The Playwright suite runs in `.github/workflows/ci.yml` as the `e2e` job on
every PR that touches `apps/**` / `packages/**` / config. It's self-contained:
the job installs the Chromium browser (cached on `~/.cache/ms-playwright`,
keyed by the lockfile) and runs `pnpm --filter @camp404/web test:e2e`, which
auto-starts `next dev` with `E2E_TEST_MODE=1`. Because that flag routes auth
and DB through the in-memory store, the job needs **no** Vercel preview, no
`DATABASE_URL`, and no Neon Auth secrets — the build-time placeholder env in
`lib/neon-auth.ts` / `packages/db/src/index.ts` carries module load. On
failure the Playwright HTML report is uploaded as a build artifact.

The Vitest layer also runs on every PR (the `test` job). A future "true" E2E
suite driving real Neon Auth + a real Neon branch (see below) would be a
separate job with its own secrets.
