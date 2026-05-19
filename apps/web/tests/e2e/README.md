# Camp 404 — End-to-end tests

Two complementary test layers cover the questionnaire flow today.

## Layer 1 — Vitest + React Testing Library

`apps/web/components/__tests__/*` — pure React tests run under jsdom. No
server, no DB, no network. Exercises:

- the questionnaire wizard's multi-page navigation, validation, and
  submission contract (`wizard.test.tsx`),
- the questionnaire schema + validator
  (`questionnaire.test.ts`),
- the in-memory rate limiter (`rate-limit.test.ts`).

Run with:

```bash
pnpm --filter @camp404/web test
```

This layer is the one we lean on hardest — it's fast (sub-second), runs in
CI, and exercises real React renders against real shadcn / Radix
primitives. Most regressions in the wizard logic land here first.

## Layer 2 — Playwright

`apps/web/tests/e2e/*.spec.ts` — runs Chromium against a real Next.js
server. The Playwright config (`playwright.config.ts`) auto-starts
`next dev` on port 3000 with `INVITE_CODES=TEST-INVITE` and
`GOD_EMAILS=god@example.com` in its environment so the gating specs have
known fixtures.

Run with:

```bash
# First time only:
pnpm --filter @camp404/web exec playwright install chromium

# Run the suite:
pnpm --filter @camp404/web test:e2e
```

Current spec coverage:

- `smoke.spec.ts` — server is up, branding renders.
- `home.spec.ts` — unauthenticated home page shows both auth CTAs and
  routes "Sign up" through `/signup`.
- `signup.spec.ts` — invite-code form renders, invalid codes surface
  errors and don't set a cookie, valid codes set the HttpOnly
  `camp404_invite` cookie and redirect to Stack's sign-up handler.
- `api.spec.ts` — `/api/health` returns 200, `/api/voice/transcribe`
  rejects unauthenticated callers with 401.

### Running against a deployed preview

Skip the bundled `webServer` block by exporting:

```bash
export PLAYWRIGHT_BASE_URL=https://your-preview.vercel.app
export PLAYWRIGHT_SKIP_WEB_SERVER=1
pnpm --filter @camp404/web test:e2e
```

## What's NOT covered today

Anything past the auth gate. Stack Auth is the source of truth for
sessions and we don't have a way to mint a Stack session in this
sandbox, so we can't yet drive the authenticated paths:

- Lazy-upsert of `users` rows from a Stack identity.
- Completing the questionnaire end-to-end (page 1 → 7 → redirect home).
- Successful voice transcription against Groq.
- God-email bypass redirecting straight to the questionnaire.

When the project gets a real Stack project + Neon database wired up,
add a `tests/e2e/fixtures/` directory that uses the Stack server SDK
to create a test user before each spec, store the session token in a
cookie via Playwright's `context.addCookies()`, and tear the user
down afterwards. The current scaffolding (`webServer.env`,
`PLAYWRIGHT_BASE_URL`) is ready for that.

## CI

The Playwright suite is intentionally **not** in the CI workflow yet
(see `.github/workflows/ci.yml`). It runs locally / from a developer's
machine until we have a stable preview URL to point it at. The Vitest
layer runs on every PR.
