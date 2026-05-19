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
| `E2E_TEST_MODE` | `1` | Enables `/api/test/{login,logout,reset,seed-invite,inspect}` and routes auth + DB through an in-memory store. The whole test-mode harness is gated on this flag — production never sets it. |
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
`getAuthenticatedUser()` which reads Stack's session cookie. In test
mode, that same helper looks for the `camp404_test_user` cookie first
and only falls back to Stack if it's absent. Playwright specs POST to
`/api/test/login` with a JSON body to set that cookie:

```ts
await login(request, { id: "alice-stack", email: "god@example.com" });
```

The `id` field becomes the synthetic Stack-user id, so the camp `users`
row that gets lazily created is keyed to it deterministically. The
in-memory store (`apps/web/lib/test-store.ts`) replaces all the
Neon-backed reads/writes in this mode.

### Spec coverage

- `home.spec.ts` — unauth home page shows both auth CTAs.
- `signup.spec.ts` — invite form renders, invalid codes error, valid
  codes set the cookie and redirect to Stack's sign-up handler.
- `api.spec.ts` — `/api/health` returns ok, `/api/voice/transcribe`
  rejects unauthenticated callers with 401.
- `authenticated.spec.ts` — god email reaches the questionnaire,
  non-god without invite is bounced to `/signup/required`, redeeming an
  invite at `/signup/required` unlocks the questionnaire, completing
  the questionnaire redirects home, voice transcribe accepts an authed
  request and rejects bad input.
- `invite-tracking.spec.ts` — env (bootstrap) code redemption survives
  signup, DB-backed codes record their issuer and use count, and an
  exhausted code can't be claimed even by a stale cookie.

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

Once a Neon database and a Stack project are wired up, the
`E2E_TEST_MODE` harness can stay as the fast development inner loop and
a parallel suite of "true" E2E specs can drive real Stack signups and
real DB rows. The shape that fits the existing scaffolding:

1. Create a dedicated test Stack project; surface `STACK_TEST_*` env
   vars to a separate Playwright config.
2. Use the Stack server SDK to create + delete a fresh user per spec.
3. Use Playwright's `context.addCookies()` to inject the Stack session
   token.
4. Drop a Neon branch DB per CI run via `neon branches create`, point
   the dev server at it, then delete the branch in teardown.

The existing `_helpers.ts` already isolates the
`login` / `resetTestState` shape — a real-Stack implementation would
share the same signature so the specs themselves don't change.

## CI

The Playwright suite is intentionally **not** in `.github/workflows/ci.yml`
yet. It runs locally / from a developer's machine until we have a stable
preview URL to point it at. The Vitest layer runs on every PR.
