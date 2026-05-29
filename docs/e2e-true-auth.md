# Brief — True E2E with a real Neon Auth login

> Goal: stand up a second, smaller Playwright suite that drives **real Neon
> Auth sign-in against a real Neon Postgres branch**, covering the credential
> exchange (and the screens that need a real DB) that the fast in-memory
> `E2E_TEST_MODE` suite deliberately bypasses.

## Why this is needed

`E2E_TEST_MODE=1` is our fast inner loop: it swaps Neon Auth and the Neon DB
for an in-memory store and a synthetic session cookie (`/api/test/login`). It
covers the *gating* around auth — the invite gate, the sign-up cookie guard,
the unauthenticated→sign-in redirect, onboarding, and the approval gate — but
by design it never runs the real auth code paths. See
`apps/web/tests/e2e/README.md` → "What is NOT covered (and why)". The gaps a
true-auth suite closes:

- **Real email/password (+ Google) sign-in** via Better Auth
  (`authClient.signIn.email` / `.social`) — that a real session cookie is
  minted and the app accepts it.
- **Real DB-backed reads** — `ensureCampUser`, `isTeamLead`, and the
  **captains' camp-management roster + approve/reject modal**
  (`getCampManagementRoster` / `getCampMemberDetail`), which read the live DB
  and so can't be driven under `E2E_TEST_MODE`.

Prior art: `RyRy79261/intake-tracker` runs exactly this shape — ephemeral Neon
branch per run + a dedicated test identity + `ENABLE_E2E_TEST_ROUTES`.

## Recommended approach

Run it as a **separate Playwright project**, with `E2E_TEST_MODE` **off**, so
the app uses real Neon Auth + a real (ephemeral) Postgres branch.

1. **One dedicated Neon Auth test identity** (email/password), provisioned
   once in the Neon Console. Reused across runs — don't create/delete users
   per run (Neon Auth identities are managed by the Auth project, not the
   Postgres branch, so they'd leak). Stored as CI secrets.
2. **A fresh Neon Postgres branch per CI run** (we already do this in the
   `schema-migration` job via `neondatabase/create-branch-action`). The camp
   `users` / `invite_codes` / `burner_profiles` tables start empty, so each
   run onboards the identity from scratch and tears the branch down after.
3. **Bypass the invite gate for the test identity** by adding its email to
   `GOD_EMAILS` for the job. The invite-redemption paths are already covered
   by the in-memory suite; this suite's job is the *real auth + real DB*
   delta, so we skip straight past the invite wall. (intake-tracker does the
   equivalent with `ALLOWED_EMAILS`.)
4. **Mint the session once in global setup, reuse via `storageState`.** A
   Playwright `globalSetup` signs in through the real form (or posts to
   `/api/auth/sign-in/email`), then saves the authenticated context to a
   `storageState` file every spec loads. Keep **one** spec that drives the
   actual `/auth/sign-in` form UI end-to-end (so the form itself is covered),
   and let the rest reuse the saved state for speed.

### What the suite should assert (the delta)

- Real sign-in via the `/auth/sign-in` form → lands authenticated (home or
  questionnaire).
- A wrong password surfaces the form's error and stays unauthenticated.
- Sign-out clears the session (protected page → `/auth/sign-in`).
- **Captain camp-management** (only reachable with the real DB): the roster
  lists members, the burner modal opens, and **Approve / Reject** flips a
  pending applicant's status (the one workflow the in-memory suite can't
  touch). Seed a second pending member directly in the branch DB for this.

## Architecture / mechanics

| Concern | In-memory suite (today) | True-auth suite (this brief) |
|---|---|---|
| `E2E_TEST_MODE` | `1` | unset |
| Auth | `/api/test/login` cookie | real `authClient.signIn.email` → Better Auth session cookie (signed with `NEON_AUTH_COOKIE_SECRET`) |
| DB | in-memory `test-store` | real Neon branch via `DATABASE_URL` |
| Server | `next dev` (playwright webServer) | `next build` + `next start` recommended (closer to prod; avoids dev-compile flakiness) |
| Session reuse | n/a | `globalSetup` → `storageState.json` |

Session cookie: our server owns it via `createNeonAuth({ cookies: { secret:
NEON_AUTH_COOKIE_SECRET }})` (`apps/web/lib/neon-auth.ts`); the managed Neon
Auth project (`NEON_AUTH_BASE_URL`) verifies credentials. Both must be real
(not the build-time placeholders) for this suite.

## Implementation steps

1. **Provision** a Neon Auth test user in the Console; record its
   email + password.
2. **Add a Playwright project** for real-auth specs — either a second config
   (`playwright.auth.config.ts`) or a `projects[]` entry with its own
   `testDir` (e.g. `tests/e2e-auth/`), `globalSetup`, and `storageState`.
   Its `webServer` runs `next build && next start` **without**
   `E2E_TEST_MODE`, with the env below.
3. **Write `globalSetup`** that signs the test user in (real form or
   `/api/auth/sign-in/email`) and writes `storageState.json`.
4. **Write the specs** (delta list above). Seed the extra pending member for
   the approve/reject test by inserting via Drizzle against the branch
   `DATABASE_URL`, or a build-time-gated `/api/test/*` route guarded by a
   distinct flag (do **not** reuse `E2E_TEST_MODE`, which would re-enable the
   in-memory bypass).
5. **Add the CI job** (sketch below).
6. **Keep the in-memory suite as the primary gate**; run true-auth on PRs but
   treat early flakiness with retries (`retries: 2` in CI) until stable.

### CI job sketch (`.github/workflows/ci.yml`)

```yaml
  e2e-auth:
    needs: [changes]
    if: needs.changes.outputs.src == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - uses: actions/cache@v4
        id: pw-cache
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
      - if: steps.pw-cache.outputs.cache-hit != 'true'
        run: pnpm --filter @camp404/web exec playwright install --with-deps chromium
      - name: Create Neon test branch
        id: neon
        uses: neondatabase/create-branch-action@v5
        with:
          api_key: ${{ secrets.NEON_API_KEY }}
          project_id: ${{ secrets.NEON_PROJECT_ID }}
          branch_name: ci-e2e-auth-${{ github.run_id }}
      - name: Apply migrations
        env: { DATABASE_URL: "${{ steps.neon.outputs.db_url }}" }
        run: pnpm --filter @camp404/db db:migrate
      - name: Run true-auth e2e
        env:
          DATABASE_URL: ${{ steps.neon.outputs.db_url }}
          NEON_AUTH_BASE_URL: ${{ secrets.NEON_AUTH_BASE_URL }}
          NEON_AUTH_COOKIE_SECRET: ${{ secrets.NEON_AUTH_COOKIE_SECRET }}
          GOD_EMAILS: ${{ secrets.E2E_AUTH_EMAIL }}
          E2E_AUTH_EMAIL: ${{ secrets.E2E_AUTH_EMAIL }}
          E2E_AUTH_PASSWORD: ${{ secrets.E2E_AUTH_PASSWORD }}
        run: pnpm --filter @camp404/web test:e2e:auth
      - name: Delete Neon test branch
        if: always()
        uses: neondatabase/delete-branch-action@v3
        with:
          api_key: ${{ secrets.NEON_API_KEY }}
          project_id: ${{ secrets.NEON_PROJECT_ID }}
          branch: ci-e2e-auth-${{ github.run_id }}
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with: { name: playwright-auth-report, path: apps/web/playwright-report/, retention-days: 7 }
```

Wire `e2e-auth` into `ci-pass` as a gated job (success or skipped), alongside
`e2e`.

## Secrets / config checklist

- `NEON_API_KEY`, `NEON_PROJECT_ID` — **already configured** (used by
  `schema-migration`).
- `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` — real values for the test
  Auth project (cookie secret ≥ 32 chars).
- `E2E_AUTH_EMAIL`, `E2E_AUTH_PASSWORD` — the dedicated test identity.
- New script `test:e2e:auth` in `apps/web/package.json`
  (`playwright test --config playwright.auth.config.ts`).

## Risks & trade-offs

- **Slower / flakier** than the in-memory suite (real network, real DB,
  `next start`). Keep it small and high-value; the in-memory suite stays the
  fast primary gate.
- **Shared identity** across runs — fine because each run gets a fresh DB
  branch, but the managed Auth user is global, so don't mutate its
  credentials in specs.
- **Cost** — one ephemeral Neon branch per run (already the pattern; bounded
  by `delete-branch` on `always()`).
- **Account-creation coverage** (real sign-*up*, not just sign-in) is a
  stretch goal: it needs a disposable email per run + cleanup via the Neon
  Auth admin API. Defer unless we specifically want to test account creation.

## Open questions to confirm before building

1. Where does Neon Auth store identities — fully managed by the Auth project
   (shared across branches, as assumed here), or in our Postgres? This
   decides whether per-run user creation is even possible.
2. Exact Better Auth sign-in endpoint/shape for `globalSetup`
   (`/api/auth/sign-in/email` vs. driving the form) — confirm against
   `@neondatabase/auth`.
3. Do we want real **sign-up** coverage now, or just **sign-in** + the
   real-DB captain flows?
