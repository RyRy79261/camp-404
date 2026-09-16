# Unit 19 — End-to-end test harness: personas, factories, fixtures, mail, per-role specs

**Donor:** `quagga-portal` / AfrikaBurn Contributors App
**Donor root (this session):** `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
**All paths below are donor-repo-relative unless stated otherwise.**

---

## 1. Purpose

`@quagga/e2e` is a **dedicated pnpm workspace** (`pnpm-workspace.yaml:4` lists `"e2e"` alongside `apps/*` and `packages/*`) holding a Playwright suite that **drives the real UI of a running deployment with no database back doors and no test-only product routes**. Its own package description states the contract verbatim:

> `e2e/package.json:6` — `"description": "End-to-end Playwright suite for the three Quagga Portal apps (web / org / suppliers). Drives the REAL UI against a deployed preview — no DB back doors."`

Verified: `find apps -path '*/api/*' -name 'route.ts' | grep -iE 'test|e2e|debug'` returns **nothing** in the donor. There is no `/api/test/*` layer at all. This is the structural opposite of Camp 404, whose whole e2e suite hangs off `E2E_TEST_MODE=1` + `apps/web/lib/test-store.ts` + seven `/api/test/*` routes, and whose `DEFERRED.md:46-52` records the resulting divergence problems (captain approval UI not drivable, account deletion a hard no-op under test mode, PII-decrypt path never exercised).

The harness has four load-bearing layers:

1. **Environment resolution** (`e2e/lib/env.ts`) — every URL, credential, timeout and *capability flag* comes from env. Capability flags model "what this deployment can actually do" (does it send mail? do we have a god account?) so specs **skip honestly** instead of failing or faking.
2. **Identity generation** (`e2e/lib/identity.ts`) — collision-proof emails / names / usernames per Playwright worker per run.
3. **Persona factories** (`e2e/personas/factories.ts`, 861 lines) — the shared vocabulary: sign up, sign in, complete onboarding, create a camp, mint an invite, redeem an invite signed-out, submit a six-section registration, register a supplier, elevate to god. Every one drives real DOM.
4. **A declarative authz matrix** (`e2e/personas/registry.ts`) — one file naming every (persona × forbidden capability) pair with a `refusalHint` naming the server guard, plus a meta-test that fails when a registry entry has no spec claiming it.

Underneath sit an orchestration script (`scripts/e2e-local.sh`, 219 lines of shell with ~120 lines of incident-report comments), a three-container local DB stack (`docker-compose.local.yml`), a god-account bootstrap (`packages/auth/scripts/e2e-god-bootstrap.mts`), and two GitHub workflows that shard the suite **by persona, not by `--shard=n/8`**.

**Why this matters to Camp 404.** Camp 404's `docs/e2e-true-auth.md` is NOT BUILT and its three open questions are unanswered; an abandoned `apps/web/tests/e2e/lib/mailtm.ts` sits untracked in the working tree — i.e. someone started exactly the disposable-inbox half of this and stopped. The donor finished it. Everything in §3 marked `drop-in` or `light-adapt` closes that gap directly, and the persona-registry + no-back-door discipline is the single highest-leverage import in this whole harvest.

---

## 2. File inventory (line counts from `wc -l`)

### 2.1 Harness core — `e2e/`

| Path | Lines | What it is |
| --- | --- | --- |
| `e2e/package.json` | 25 | Workspace manifest; 6 scripts; pins `@playwright/test` to exactly `1.62.0` |
| `e2e/tsconfig.json` | 21 | Extends `@quagga/typescript-config/base.json`; `noEmit`, `types:["node"]` |
| `e2e/eslint.config.js` | 8 | `...base` + ignores `playwright-report/**`, `test-results/**` |
| `e2e/.gitignore` | 7 | `node_modules/ playwright-report/ test-results/ blob-report/ .playwright/ .env .env.local` |
| `e2e/playwright.config.ts` | 86 | Two projects, env-driven timeouts, prod-host guard called at module load |
| `e2e/fixtures.ts` | 86 | Extended `test` with 4 fixtures + `skipUnlessMail()` / `skipUnlessGod()` |
| `e2e/README.md` | 272 | The harness manual; §"Selector traps" is 7 hard-won DOM lessons |
| `e2e/lib/env.ts` | 196 | Env + capability flags + production guard |
| `e2e/lib/identity.ts` | 108 | Unique email / name / username / camp name / supplier name |
| `e2e/lib/dom.ts` | 17 | `appAlerts()` — the Next route-announcer workaround |
| `e2e/lib/mail.ts` | 198 | mail.tm disposable-inbox client |
| `e2e/personas/registry.ts` | 365 | The authz matrix: 9 personas × 18 capabilities |
| `e2e/personas/factories.ts` | 861 | 12 exported factories + `Account` + `RegistrationInput` + `GodUnavailableError` |

### 2.2 Harness demo / cross-cutting specs — `e2e/tests/`

| Path | Lines | Tests |
| --- | --- | --- |
| `e2e/tests/smoke.spec.ts` | 32 | 3 — `@smoke`-tagged; each app shell renders its auth form |
| `e2e/tests/auth-round-trip.spec.ts` | 27 | 1 — `@smoke`; sign-up → bio → create camp |
| `e2e/tests/negative-paths.spec.ts` | 128 | 3 — registry-driven adversarial authz + the **registry-coverage meta-test** |

### 2.3 Per-persona suites — `e2e/specs/<persona>/`

`test(` call counts measured with `grep -rhoE '(^|[^.\w])test\(' <dir> | wc -l`.

| Persona dir | Spec files | `test(` calls | Support module (lines) |
| --- | --- | --- | --- |
| `specs/anon/` | 8 | 27 | — |
| `specs/new-burner/` | 12 | 31 | `support.ts` (120) |
| `specs/camp-member/` | 6 | 14 | `support.ts` (243) |
| `specs/camp-lead/` | 8 | 22 | `support.ts` (387) |
| `specs/officer/` | 5 | 6 | `support.ts` (217) |
| `specs/org-staff/` | 13 | 27 | `_helpers.ts` (204) |
| `specs/god/` | 8 | 22 | `support.ts` (135) |
| `specs/supplier/` | 7 | 16 | `support.ts` (144) |
| `tests/` | 3 | 7 | — |
| **Total** | **70 spec files** | **172** | 8 personas |

Full spec-file list (for anyone wanting to lift a particular journey):

- **anon** (8): `burner-profile-privacy` (166), `directory-public-browse` (67), `free-camp-undiscoverable` (97), `gated-web-surfaces-refused` (62), `landing-and-entry-points` (121), `org-console-refused` (61), `signed-out-invite-acceptance` (208), `supplier-portal-refused` (59)
- **new-burner** (12): `account-management` (189), `art-and-vehicle-registration` (179), `auth-rate-limit` (89), `burner-bio` (227), `directory-and-join` (82), `onboarding-gate` (73), `passkeys` (130), `password-reset` (90), `privacy-projection` (123), `session-lifecycle` (88), `sign-up` (130), `two-factor` (141)
- **camp-member** (6): `camp-member-blocking-questionnaire` (93), `camp-member-cross-camp-isolation` (174), `camp-member-forbidden` (155), `camp-member-gate-released-by-close` (118), `camp-member-lifecycle` (164), `leaving-a-camp` (96)
- **camp-lead** (8): `camp-lifecycle` (97), `decision-outcomes` (155), `invites` (122), `layout-uploads` (194), `officers` (128), `registration` (123), `review-loop` (151), `roles` (211)
- **officer** (5): `officer-assignment-request-and-consent` (90), `officer-decline-frees-slot` (92), `officer-phone-shared-with-org-only-after-consent` (89), `officer-required-counts` (82), `officer-roles-not-aliasable` (75)
- **org-staff** (13): `access-and-gate` (61), `account-suite` (182), `bulletins-audience-reach` (153), `bulletins-targeting` (66), `camp-categories-crud` (98), `cannot-elevate-accounts` (54), `engineer-rank` (198), `medical-notes-access` (143), `questionnaire-build-activate-results` (201), `registration-review` (229), `suppliers-standing-notes-onboarding` (73), `system-panel` (227), `wrangler-assignment` (182)
- **god** (8): `camp-categories-crud` (86), `department-domain-scoping` (338), `god-account-elevation-lifecycle` (176), `god-bootstrap-and-surfaces` (84), `god-privilege-escalation-refused` (140), `god-roles-management` (237), `god-sole-god-cannot-self-delete` (78), `god-verified-email-bootstrap-guard` (104)
- **supplier** (7): `account-suite` (114), `claim-by-email` (136), `documents` (78), `isolation` (110), `onboarding-lifecycle` (125), `self-registration` (121), `standing` (86)

**e2e directory total: 12,543 lines.**

### 2.4 Orchestration outside `e2e/`

| Path | Lines | What it is |
| --- | --- | --- |
| `scripts/e2e-local.sh` | 219 | Cold-start runner: compose up → migrate → seed → god bootstrap → boot 3 apps → playwright |
| `docker-compose.local.yml` | 67 | Postgres 16-alpine + wsproxy + local-neon-http-proxy |
| `packages/auth/scripts/e2e-god-bootstrap.mts` | 112 | Idempotent god-account creator (the ONE non-UI write in the whole harness) |
| `.github/workflows/ci.yml` | 558 | `commitlint` / `ci` / `e2e` (8-way persona matrix) / `coverage` (8 workspaces) / `CI pass` |
| `.github/workflows/mobile.yml` | 114 | Nightly `mobile-360` triage run, 8-way persona matrix, no `pull_request` trigger |
| root `package.json:15` | — | `"e2e:local": "./scripts/e2e-local.sh"` |

---

## 3. Capability list (exhaustive, each cited)

### 3.1 Configuration & safety

| Capability | Where | Detail |
| --- | --- | --- |
| Points at ANY deployment without a code change | `lib/env.ts:39-57` | `baseUrl(app)` reads `E2E_WEB_URL` / `E2E_ORG_URL` / `E2E_SUPPLIERS_URL`, defaults `http://localhost:3000` / `:3001` / `:3002`, strips a trailing `/` |
| Lazy per-app base URLs | `lib/env.ts:59-69` | `APP_URLS` is a `Record<AppName,string>` built from **getters**, so an env change between config-load and test-run is honoured |
| **Refuses to run against production** | `lib/env.ts:169-194`, called at `playwright.config.ts:15` | Hard-codes the three prod hosts `app.quagga.ryanjnoble.dev`, `org.quagga.ryanjnoble.dev`, `suppliers.quagga.ryanjnoble.dev`; throws unless `E2E_ALLOW_PRODUCTION=true`. Runs at **module load of the config**, so it aborts before a single browser starts |
| Vercel Deployment-Protection bypass | `lib/env.ts:76-84` | Emits `x-vercel-protection-bypass: <E2E_VERCEL_PROTECTION_BYPASS>` **and** `x-vercel-set-bypass-cookie: true` so client-side navigations pass too. Comment: without it "Playwright silently HANGS" |
| Mail-capability flag | `lib/env.ts:87-98` | `mailMode()` → `"off" \| "mailtm"` from `E2E_MAIL_MODE` (default `"off"`); `isMailCaptureAvailable()` |
| Email-verification flag, derived not asserted | `lib/env.ts:107-114` | `requiresEmailVerification()` — false when mail is off; overridable to false with `E2E_REQUIRE_EMAIL_VERIFICATION` ∈ `["false","0","off","no"]`. Mirrors the app's own `resolveRequireEmailVerification` |
| God-capability flag | `lib/env.ts:123-128` | `godCredentials()` → `{email,password} \| null` from `E2E_GOD_EMAIL` / `E2E_GOD_PASSWORD` |
| A *deliberately unverified* god address | `lib/env.ts:141-144` | `unverifiedGodEmail()` reads `E2E_UNVERIFIED_GOD_EMAIL` — used by ONE spec (`specs/god/god-verified-email-bootstrap-guard.spec.ts`) to isolate `emailVerified` as the deciding variable. Carries an explicit WARNING that this address would bootstrap to god the moment it became verified |
| Google-OAuth drivability flag | `lib/env.ts:147-151` | `isGoogleDriveable()` reads `E2E_GOOGLE_DRIVEABLE === "true"`. **Currently referenced by no spec** (dead) |
| Five tunable timeouts | `lib/env.ts:154-163` | `test 90_000` / `expect 15_000` / `action 20_000` / `mail 45_000`, each overridable (`E2E_TEST_TIMEOUT`, `E2E_EXPECT_TIMEOUT`, `E2E_ACTION_TIMEOUT`, `E2E_MAIL_TIMEOUT`) |
| CI detection | `lib/env.ts:166` | `IS_CI = process.env.CI === "true" \|\| process.env.CI === "1"` |

### 3.2 Playwright configuration

| Capability | Where | Detail |
| --- | --- | --- |
| Never boots an app | `playwright.config.ts:1-3` header | "points at a DEPLOYED app (preview / localhost / prod), **never spins one up**". There is no `webServer` key. Camp 404's config does the opposite (boots `next dev` with `E2E_TEST_MODE: "1"`) |
| Package-rooted discovery | `:24-29` | `testDir: "."`, `testIgnore` = node_modules / test-results / playwright-report. Helper modules named `support.ts` / `_helpers.ts` are never collected because `testMatch` only takes `*.spec.ts` / `*.test.ts` |
| Fully parallel by construction | `:31` | `fullyParallel: true` — legitimate because every spec creates its own accounts and data |
| `test.only` fails CI | `:33` | `forbidOnly: IS_CI` |
| Retries only in CI, ONE by default | `:41` | `retries: IS_CI ? Number(process.env.E2E_RETRIES ?? 1) : 0`. **README.md:67 says "Retries: 2 in CI only" — stale, contradicts the code** |
| Worker policy | `:47` | `workers: IS_CI ? Number(process.env.E2E_WORKERS ?? 4) : undefined` |
| Failure-only diagnostics | `:60-62` | `trace: "retain-on-failure"`, `screenshot: "only-on-failure"`, `video: "retain-on-failure"` |
| Reporters | `:50-52` | CI: `list` + `html {open:"never"}` + `github`; local: `list` + `html` |
| Two viewport projects | `:67-85` | `desktop-chromium` = `devices["Desktop Chrome"]` @ `1280×800`; `mobile-360` = `devices["Pixel 7"]` @ `360×780`, `isMobile:true`, `hasTouch:true` |

### 3.3 Fixtures (`e2e/fixtures.ts`)

| Fixture / helper | Signature | Detail |
| --- | --- | --- |
| `makeAppPage` | `(app: AppName) => Promise<Page>` (`:34-54`) | Creates an isolated `BrowserContext` bound to that app's `baseURL` with the bypass headers, **inheriting the running project's device profile** (`viewport`, `userAgent`, `deviceScaleFactor`, `isMobile`, `hasTouch` — `:44-47`) so a hand-made context reflows exactly like the default page. All created contexts are closed at test end (`:53`) |
| `webPage` / `orgPage` / `suppliersPage` | `Page` (`:56-64`) | Lazy convenience wrappers over `makeAppPage` |
| `skipUnlessMail()` | `(): void` (`:73-78`) | `test.skip(!isMailCaptureAvailable(), "mail capture unavailable (E2E_MAIL_MODE=off)")` |
| `skipUnlessGod()` | `(): void` (`:81-86`) | `test.skip(!godCredentials(), "no god credentials (E2E_GOD_EMAIL/E2E_GOD_PASSWORD)")` — used by **34 spec files** |

The per-app-context design exists because "cross-subdomain SSO does not span the different HOSTS of a preview (`app-…` / `org-…` / `suppliers-…` are separate origins on `*.vercel.app`)" (`fixtures.ts:3-5`). **Camp 404 is one app on one origin, so this whole reason evaporates — but `makeAppPage` remains valuable as a "give me another isolated logged-out browser" primitive, which is what multi-actor specs like `account-management.spec.ts` and `camp-member-blocking-questionnaire.spec.ts` actually use it for.**

### 3.4 Identity generation (`e2e/lib/identity.ts`)

| Capability | Where | Detail |
| --- | --- | --- |
| Worker-slot namespacing | `:29-33` | `workerSlot()` parses `TEST_WORKER_INDEX`, falls back to `0` if not finite |
| Per-**process** run id | `:47` | `RUN_ID = randomBytes(16).toString("hex").slice(0, 6)` — added because worker slot + counter alone regenerate run one's names on run two, and camp names must be exactly unique (`checkCampName` refuses an exact normalized match) |
| Random token | `:50-52` | `token(len = 6)` = `randomBytes(16).toString("hex").slice(0, len)` |
| Unique email | `:59-66` | `` `${slug}-w${workerSlot()}-${counter}-${RUN_ID}${token()}@${SYNTHETIC_DOMAIN}` ``; slug is `label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-\|-$/g,"")` |
| Synthetic domain is RFC 6761 `.test` | `:19-20` | `SYNTHETIC_DOMAIN = process.env.E2E_SYNTHETIC_EMAIL_DOMAIN ?? "e2e.quagga.test"` — a reserved TLD that "can never resolve or receive mail" |
| Standard password | `:23` | `TEST_PASSWORD = "correct-horse-battery-staple-e2e"` (32 chars; comment: "NIST-compliant … ≥15 chars, no composition rules") |
| Negative-test password | `:26` | `TOO_SHORT_PASSWORD = "short"` — used by `specs/new-burner/sign-up.spec.ts` |
| Unique display name | `:69-72` | `` `${prefix} ${workerSlot()}-${counter}-${RUN_ID}${token(4)}` `` |
| **Unique USERNAME under real field rules** | `:87-98` | 3–20 chars, must start with a letter, `[a-z0-9_]` only, no doubled/trailing underscore, globally unique. Builds `suffix = ${slot}${counter}${RUN_ID}${token(3)}`, then **truncates the prefix, not the entropy**: `stem.slice(0, Math.max(1, 19 - suffix.length))`, prepends `u` if the stem isn't letter-initial, returns `` `${head}_${suffix}`.slice(0, 20) `` |
| Domain-flavoured wrappers | `:101-108` | `uniqueCampName()` → `uniqueName("Dust Bunnies")`; `uniqueSupplierName()` → `uniqueName("LosKop Logistics")` — comment: "fictional per AGENTS.md — never a real business" |

### 3.5 DOM helper (`e2e/lib/dom.ts`)

One export, 17 lines, and it is worth its own file:

```ts
export function appAlerts(scope: Page | Locator): Locator {
  return scope.locator('[role="alert"]:not(#__next-route-announcer__)');
}
```

Rationale (`:5-13`): Next injects `<div role="alert" aria-live="assertive" id="__next-route-announcer__">` into **every** page, so `getByRole("alert")` can never resolve to a single element and `toHaveCount(0)` can **never** pass — *in any Next app*. "Nine assertions across the suite were written against that impossible contract."

**This applies verbatim to Camp 404 (Next 16 App Router) and is a drop-in file with a one-word rename at most.** Used by 6 donor specs plus `specs/camp-lead/support.ts`.

### 3.6 Mail capture (`e2e/lib/mail.ts`)

| Capability | Where | Detail |
| --- | --- | --- |
| Disposable-inbox provisioning | `:110-131` | `createMailbox(localHint = "burner")`. Picks an **active** mail.tm domain (`:84-90`), builds `` `${slug}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2,8)}@${domain}` `` with `slug = localHint.toLowerCase().replace(/[^a-z0-9]+/g,"").slice(0,12) \|\| "burner"`, password `"e2e-mailbox-correct-horse-staple"`, `POST /accounts` then `POST /token` |
| API base | `:22` | `MAILTM_API = process.env.E2E_MAILTM_API ?? "https://api.mail.tm"` |
| Typed error for skip translation | `:25-33` | `class MailUnavailableError extends Error`, `name = "MailUnavailableError"` |
| Message polling | `:133-175` | `waitForMessage(match?)` polls `GET /messages` (Hydra `"hydra:member"` shape) every **1500 ms** until `TIMEOUTS.mail` (default 45 000 ms); on a match fetches `GET /messages/{id}`; error names how many messages were seen but did not match |
| Link extraction | `:92-103` | `URL_RE = /https?:\/\/[^\s"'<>)\]]+/g` over **text and html**, dedup via `Set`, then `.replace(/&amp;/g,"&").replace(/[.,;]+$/,"")` |
| Link waiting | `:177-190` | `waitForLink(pattern, match?)` — throws naming the message subject and **all** links found when none match |
| Intent-naming alias | `:196-198` | `requireMailbox(hint)` — same as `createMailbox`, used at every call site so the intent reads at the call |

**The rejected alternatives are documented in the source and in the README, and the guardrail if one is ever adopted is specified:** (`lib/mail.ts:5-12`, `README.md:134-141`) — a test-only "peek the latest token" endpoint is refused as "a product-code auth side-door"; if flakiness ever forces it, it "MUST be secret-gated, MUST hard-refuse when the secret is unset, and MUST arrive with a route-census entry and a test asserting the refusal". Mailpit/MailHog is rejected because it can't be reached from a Vercel preview; better-auth's `getTestInstance()`/`getOTP()` is rejected as in-process-only.

### 3.7 Persona factories (`e2e/personas/factories.ts`) — see §5 for signatures

Beyond the 12 exported factories, the file carries four internal capabilities that are the actual reason it works:

| Internal | Where | Detail |
| --- | --- | --- |
| `waitForSessionCookie(page, what)` | `:77-93` | Polls `page.context().cookies()` every **100 ms** for **15 000 ms** for a cookie matching `/quagga\.session_token$/` with a truthy value. Comment: waiting on the sign-up *response* is not enough — "`waitForResponse` resolves on response headers; the cookie jar is updated a beat later". Throws a message that names the likely real causes (duplicate address, password policy, rate limit) |
| `assertConfigured(page)` | `:96-104` | Fails loudly if `/not configured\|preview mode\|isn['’]t set up/i` is on screen — catches "you pointed the suite at a half-wired preview" instead of letting it look like a product bug |
| `signInPath(app)` | `:48-50` | `app === "suppliers" ? "/signin" : "/auth/sign-in"` |
| `isCampDetailUrl(url)` | `:59-63` | `/\/camps\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/camps/new")` — because `waitForURL` **resolves synchronously when the current URL already matches**, and camp flows start on `/camps/new` which a naive regex false-matches |

### 3.8 The persona registry (`e2e/personas/registry.ts`)

| Capability | Where | Detail |
| --- | --- | --- |
| 9 persona kinds | `:68-77` | `anonymous \| burner \| camp_lead \| camp_member \| other_camp_lead \| supplier \| engineer \| org_staff \| god` |
| 18 named capabilities with refusal hints | `:106-221` | `const C = {...} as const satisfies Record<string, Capability>` |
| Per-persona allowed/forbidden lists | `:225-329` | `PERSONAS: Record<PersonaKind, PersonaSpec>` |
| Flat iteration for the negative suite | `:332-343` | `forbiddenMatrix(): Array<{kind, capability}>` |
| Literal mirror of the app's hard-locked field list | `:357-365` | `HARD_LOCKED_PRIVATE_FIELDS` — 7 strings, kept literal "so the harness stays pointable at a remote deployment without the monorepo" |
| **Honest two-tier proof declaration** | `:10-42` | Tier (A) = E2E-provable refusals; Tier (B) = mutations with no client entry point for the wrong persona, where the E2E can only prove no UI path exists and the *real* refusal is a `@quagga/core` predicate unit test — each named with its test file path |

### 3.9 The registry-coverage meta-test (`e2e/tests/negative-paths.spec.ts:81-127`)

A test that **reads the filesystem**: it walks `e2e/specs/**` and `e2e/tests/**` recursively, concatenates every `.ts` file (excluding itself, "so counting it would make the gate self-satisfying"), and asserts that every `forbiddenMatrix()` capability id appears somewhere in that corpus. Failure message names the unclaimed ids and tells you the two legal fixes.

The file header (`:8-36`) documents what it replaced: five `test.fixme` stubs claiming data-heavy guards were "the M3-30 owner's to complete" when every one had been implemented for weeks. "A skipped test that says 'nobody has done this yet' about work that IS done is worse than no test."

### 3.10 Local orchestration (`scripts/e2e-local.sh`)

| Capability | Line region | Detail |
| --- | --- | --- |
| Compose up + readiness | `:57-59` | `docker compose -f docker-compose.local.yml up -d`; `until docker exec quagga-pg pg_isready -U postgres -d quagga` |
| Optional DB reset that drops **both** schemas | `:61-70` | `DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;` — because dropping only `public` leaves drizzle's migration tracker and the migrator then reports "up to date" against an empty database |
| Migrate + seed | `:72-74` | `pnpm --filter @quagga/db db:migrate:deploy` then `db:seed` |
| God bootstrap | `:76-84` | `pnpm --filter @quagga/auth exec tsx scripts/e2e-god-bootstrap.mts` — run from `@quagga/auth` because it is "the only package that resolves BOTH `@quagga/auth` and `@quagga/db`" |
| dev vs build serve modes | `:86-104`, `:130-171` | `E2E_SERVE` defaults to `build` in CI, `dev` locally. Build mode runs `turbo run build --concurrency=1` (three simultaneous `next build`s "took down a 32GB dev machine outright") |
| **Port reclamation by pid, refusing to continue if it fails** | `:112-128` | `pkill -f "next dev"` does NOT work — "Next renames its own process to `next-server (v16.2.11)` once it boots", so the pattern only matched the wrapper. Real fix: `ss -ltnpH "sport = :$port" \| grep -o 'pid=[0-9]*'`, three attempts (SIGTERM, SIGKILL, fail), and `exit 1` rather than silently running against the previous run's build |
| `.next/dev` deletion | `:154` | `rm -rf apps/*/.next/cache apps/*/.next/dev` — measured 5.7 GB (web) + 4.6 GB (org) after ONE dev-mode run |
| Readiness gate that actually fails | `:174-192` | 60 × 2 s per port; on failure prints `tail -30` of the server log and `exit 1` |
| "Module not found" abort | `:194-198` | `grep -qi "module not found"` on the dev log → exit 1 before trusting any result |
| Auth rate-limit ceiling raise, local only | `:38-46` | `AUTH_RATE_LIMIT_WINDOW_SECONDS=60`, `AUTH_RATE_LIMIT_MAX=10000`, with "NEVER set these on a real deployment" |
| Project selection | `:205-214` | `E2E_PROJECTS` (default `desktop-chromium mobile-360`) → repeated `--project=` args. Comment records that the previous hard-coded `--project=desktop-chromium` meant `mobile-360` "had never executed once" |
| Optional sharding | `:216-222` | `E2E_SHARD=2/4` → `--shard=`; explicitly "CI does NOT use it — it splits by persona instead" |
| Worker default | `:224-226` | `--workers="${E2E_WORKERS:-2}"` |

### 3.11 CI wiring

| Capability | Where | Detail |
| --- | --- | --- |
| 8-way persona matrix | `ci.yml:138-163` | Each entry has `persona`, a human `label` and a `side` (web/org/suppliers). Rationale at `:128-137`: "A mechanical slice cannot be named: 'shard 2 of 8 failed' tells you nothing" |
| `fail-fast: false` | `ci.yml:127` | A partial picture is less useful than the whole one |
| Per-shard worker count derived from god-account sharing | `ci.yml:219-224` | `god`, `org-staff`, `camp-lead`, `officer`, `supplier` get **1** worker; the rest get **2**. Measured 29 Jul 2026: 2 workers on org-staff → "2 failed / 19 passed, a DIFFERENT pair each run"; 1 worker → clean, repeatedly |
| Per-shard env | `ci.yml:189-268` | `E2E_RESET_DB=1`, `E2E_TEST_TIMEOUT=180000`, `E2E_SERVE=build`, `E2E_RETRIES=1`, `E2E_PROJECTS=desktop-chromium`, plus `BETTER_AUTH_SECRET` / `PGCRYPTO_KEY` placeholders |
| `tests/` rides with the `anon` shard | `ci.yml:269-283` | Because `e2e/tests/` is not a persona, smoke + auth round trip + the registry-driven authz suite "had NEVER run in the gate, while the gate was described as covering the whole suite" |
| **Server log uploaded on every run** | `ci.yml:293-295` | `cp "${TMPDIR:-/tmp}/quagga-e2e/dev.log" server.log` — "a page that takes 20s to render and a page that 500s look identical from here" |
| Artifacts per persona | `ci.yml:297-308` | `playwright-report-<persona>` containing `e2e/playwright-report`, `e2e/test-results`, `server.log`; 14-day retention |
| **One required check by name** | `ci.yml:518-558` | `CI pass` with `if: always()` and `needs: [commitlint, ci, e2e, coverage]`. `needs.e2e.result` aggregates the WHOLE matrix, so adding a persona needs no branch-protection edit. `if: always()` is load-bearing — "a skipped required check does not block a merge" |
| Nightly mobile triage, off the PR path | `mobile.yml:23-26, :92-95` | `cron: "0 2 * * *"` + `workflow_dispatch`; same 8-way matrix; `E2E_RETRIES=0` ("this job exists to produce a triage list"); artifacts named `mobile-report-<persona>` |
| Why mobile lives in its own file | `mobile.yml:3-11` | "GitHub cannot interpolate a matrix for a SKIPPED job, so the checks list showed a literal `mobile · ${{ matrix.label }}` on every pull request" |

### 3.12 God bootstrap (`packages/auth/scripts/e2e-god-bootstrap.mts`)

| Capability | Line | Detail |
| --- | --- | --- |
| Skip cleanly with no creds | `:38-44` | Prints "nothing to do. The god and org-staff suites will skip." and `exit 0` |
| **Refuse if the address is not on `GOD_EMAILS`** | `:46-61` | Parses `GOD_EMAILS.split(",").map(trim().toLowerCase())`; `exit 1` with "Fix the env, not this script" |
| Create via the REAL sign-up API | `:72-79` | `auth.api.signUpEmail({ body: { email, password, name: "E2E God" } })` — "a hand-built row would let the suite pass against something the product cannot actually create" |
| The ONE non-product write | `:98-107` | `db.update(schema.user).set({ emailVerified: true })` — because `canBootstrapGodEmail` deliberately refuses an unverified address and `E2E_MAIL_MODE=off` means there is no inbox to click |
| Idempotent | `:25`, `:66-82` | Existing account left alone apart from the verified flag |
| Refuses to continue on an inconsistent result | `:90-96` | "sign-up reported success but no user row exists — refusing to continue, the suite would fail confusingly" |

---

## 4. Data model

**The harness owns no database tables, no columns and no enums.** That is its defining property: it never writes SQL except the two operator escapes below.

Tables/columns the harness *touches indirectly*, and the exact literals it depends on:

| Literal | Where in the harness | Donor source of truth |
| --- | --- | --- |
| Session cookie name pattern `/quagga\.session_token$/` | `factories.ts:83`, `factories.ts:249` | Better Auth `advanced.cookiePrefix = "quagga"`; the harness matches the suffix so it works with the `__Secure-` prefix on https |
| `schema.user.id`, `schema.user.email`, `schema.user.emailVerified` | `e2e-god-bootstrap.mts:67, :69, :101-102` | `packages/db/src/schema.ts` `user` table |
| SQL table name `"user"` (quoted) and column `email_verified` | `e2e/README.md:169` | The documented manual escape: `UPDATE "user" SET email_verified = true WHERE email = 'e2e-god@quagga.local';` |
| Schema names `public` and `drizzle` | `scripts/e2e-local.sh:68-69` | The drizzle migration tracker lives in schema `drizzle` |
| `HARD_LOCKED_PRIVATE_FIELDS` (7 strings, verbatim) | `registry.ts:357-365` | `packages/core/src/privacy.ts` — the harness keeps a literal copy deliberately |

```ts
// e2e/personas/registry.ts:357-365
export const HARD_LOCKED_PRIVATE_FIELDS = [
  "saId",
  "passport",
  "phone",
  "onsiteContactName",
  "onsiteContactPhone",
  "offsiteContactName",
  "offsiteContactPhone",
] as const;
```

`medical` is **deliberately excluded** (`:350-355`): it belongs to the second never-public class `SAFETY_VISIBLE_FIELDS` — never public, but visible to the burner's own camp leads and org staff on a member DETAIL view. "A spec that asserted medical was invisible to a camp LEAD would be asserting the wrong law."

Other domain literals the harness hard-codes (each a small porting surface):

- `specs/officer/support.ts:37-43` — `OFFICER_NAMES = { lnt: "LNT Lead", safety: "Safety Officer", fireBaron: "Safety Baron", sound: "Sound Officer", monitor: "Safety Monitor" }`
- `specs/camp-member/support.ts:26` — `const EDIT_STEP_COUNT = 3` mirroring `EDIT_STEPS` in `bio-flow.tsx`
- `specs/supplier/support.ts:294-297` — the six standing labels: `"Good standing" | "Watch" | "Suspended" | "Diligent First Timer" | "Able & Willing To Adapt" | "Absolute Beginners"`
- `specs/new-burner/auth-rate-limit.spec.ts:31-33` — `SIGN_IN_ENDPOINT = "/api/auth/sign-in/email"`, `MAX_ATTEMPTS = 40`, `WRONG_PASSWORD = "definitely-not-the-right-password-000"`

---

## 5. Public API surface (verbatim signatures)

### `e2e/lib/env.ts`

```ts
export type AppName = "web" | "org" | "suppliers";
export type MailMode = "off" | "mailtm";

export function baseUrl(app: AppName): string;
export const APP_URLS: Record<AppName, string>;
export function protectionBypassHeaders(): Record<string, string>;
export function mailMode(): MailMode;
export function isMailCaptureAvailable(): boolean;
export function requiresEmailVerification(): boolean;
export function godCredentials(): { email: string; password: string } | null;
export function unverifiedGodEmail(): string | null;
export function isGoogleDriveable(): boolean;
export const TIMEOUTS: { test: number; expect: number; action: number; mail: number };
export const IS_CI: boolean;
export function assertNotProductionUnlessAllowed(): void;
export { required };   // lib/env.ts:196 — see §9, DEAD
```

### `e2e/lib/identity.ts`

```ts
export const TEST_PASSWORD = "correct-horse-battery-staple-e2e";
export const TOO_SHORT_PASSWORD = "short";
export function uniqueEmail(label = "burner"): string;
export function uniqueName(prefix: string): string;
export function uniqueUsername(prefix = "dusty"): string;
export function uniqueCampName(): string;
export function uniqueSupplierName(): string;
```

### `e2e/lib/dom.ts`

```ts
export function appAlerts(scope: Page | Locator): Locator;
```

### `e2e/lib/mail.ts`

```ts
export class MailUnavailableError extends Error;

export interface Mailbox {
  address: string;
  password: string;
  token: string;
  waitForMessage(match?: MessageMatcher): Promise<CapturedMessage>;
  waitForLink(pattern: RegExp, match?: MessageMatcher): Promise<string>;
}

export interface CapturedMessage {
  id: string;
  subject: string;
  from: string;
  text: string;
  html: string;
  links: string[];
}

export type MessageMatcher = (m: { subject: string; from: string }) => boolean;

export async function createMailbox(localHint = "burner"): Promise<Mailbox>;
export async function requireMailbox(localHint = "burner"): Promise<Mailbox>;
```

### `e2e/fixtures.ts`

```ts
interface Fixtures {
  makeAppPage: (app: AppName) => Promise<Page>;
  webPage: Page;
  orgPage: Page;
  suppliersPage: Page;
}

export const test: ReturnType<typeof base.extend<Fixtures>>;
export { expect };
export function skipUnlessMail(): void;
export function skipUnlessGod(): void;
```

### `e2e/personas/registry.ts`

```ts
export type PersonaKind =
  | "anonymous" | "burner" | "camp_lead" | "camp_member" | "other_camp_lead"
  | "supplier" | "engineer" | "org_staff" | "god";

export interface Capability {
  id: string;
  app: AppName;
  action: string;
  refusalHint?: string;
}

export interface PersonaSpec {
  kind: PersonaKind;
  summary: string;
  allowed: Capability[];
  forbidden: Capability[];
}

export const PERSONAS: Record<PersonaKind, PersonaSpec>;
export function forbiddenMatrix(): Array<{ kind: PersonaKind; capability: Capability }>;
export const HARD_LOCKED_PRIVATE_FIELDS: readonly [...7 strings];
```

### `e2e/personas/factories.ts` — all 12 exports

```ts
export interface Account {
  email: string;
  password: string;
  mailbox?: Mailbox;   // present only when created against a real disposable inbox
  name: string;
}

export interface RegistrationInput {
  description?: string;
  contactEmail?: string;
  lntPlan?: string;
  lntLeadName?: string;
  lntLeadPhone?: string;
  lntLeadEmail?: string;
  participationPlan?: string;
  expectedPopulation?: number;
  firstArrivalDate?: string;      // yyyy-mm-dd
  areaDimensions?: string;
  layoutUrls?: string[];
  soundPlan?: string;
  feeStructure?: string;
}

export class GodUnavailableError extends Error;

export async function signUpBurner(
  page: Page,
  opts: { onboard?: boolean; username?: string } = {},
): Promise<Account>;

export async function signInAs(
  page: Page,
  account: Pick<Account, "email" | "password">,
  app: AppName = "web",
): Promise<void>;

export async function signOut(page: Page): Promise<void>;

export async function completeBio(
  page: Page,
  opts: { username?: string | null; homeCity?: string } = {},
): Promise<{ username: string | null }>;

export async function createCamp(
  page: Page,
  opts: { name?: string; description?: string; joinability?: "open" | "invite_only" } = {},
): Promise<{ slug: string; name: string }>;

export async function inviteToCamp(
  page: Page,
  slug: string,
  kind: "member" | "lead_transfer" = "member",
): Promise<{ token: string; url: string }>;

export async function joinByInvite(
  page: Page,
  tokenOrUrl: string,
): Promise<{ slug: string }>;

export async function acceptInviteAsNewBurner(
  page: Page,
  tokenOrUrl: string,
  opts: { username?: string } = {},
): Promise<{ account: Account; slug: string }>;

export async function submitRegistration(
  page: Page,
  slug: string,
  input: RegistrationInput = {},
): Promise<void>;

export async function createArtProject(
  page: Page,
  opts: { name?: string } = {},
): Promise<{ name: string; slug: string }>;

export async function registerSupplier(
  page: Page,
  opts: { email?: string; businessName?: string; contactPerson?: string; category?: string } = {},
): Promise<Account>;

export async function elevateToGod(orgPage: Page): Promise<{ email: string }>;
```

### `e2e/specs/camp-lead/support.ts` — 10 exports

```ts
export async function attemptCreateCamp(
  page: Page, name: string, description?: string,
): Promise<{ outcome: "created" | "warn" | "error"; message?: string }>;

export async function confirmWarnedCreate(page: Page): Promise<{ slug: string }>;

export async function completeBioWithPhone(
  page: Page, opts: { username?: string; phone: string },
): Promise<{ username: string; phone: string }>;

export async function gotoRolesSettings(page: Page, slug: string): Promise<void>;

export interface CustomRoleInput {
  name: string;
  emoji: string;
  colorLabel: string;      // a ROLE_COLOR_LABELS label, e.g. "Rust" (the swatch's aria-label)
  privileges?: string[];   // PrivilegeToggles aria-labels to switch ON
}
export async function createCustomRole(page: Page, slug: string, role: CustomRoleInput): Promise<void>;

export async function assignRoleToMember(page: Page, slug: string, memberName: string, roleName: string): Promise<void>;
export async function revokeRoleFromMember(page: Page, slug: string, memberName: string, roleName: string): Promise<void>;
export async function assignOfficer(page: Page, slug: string, officerName: string, memberName: string): Promise<void>;
export async function acceptOfficerRequest(page: Page, slug: string): Promise<void>;
export async function openRegistrationInConsole(orgPage: Page, campName: string): Promise<string>;
export async function addSectionComment(orgPage: Page, sectionKey: string, comment: string): Promise<void>;
export async function decide(
  orgPage: Page,
  action: "Start review" | "Approve" | "Request changes" | "Reject",
  reason?: string,
): Promise<void>;
```

### `e2e/specs/camp-member/support.ts` — 4 exports

```ts
export interface AuthorQuestionnaireOptions { title: string; prompt: string; blocking?: boolean }
export async function authorCampQuestionnaire(
  leadPage: Page, slug: string, opts: AuthorQuestionnaireOptions,
): Promise<{ activationId: string }>;

export async function answerRequiredQuestion(
  page: Page, opts: { prompt: string; answer: string; submitLabel?: string },
): Promise<void>;

export async function setHardLockedBioData(
  page: Page, sentinels: { onsiteContactName: string; medicalNotes: string },
): Promise<{ onsiteContactName: string; medicalNotes: string }>;

export async function expectServerNotFound(
  page: Page, url: string, absent: string[] = [],
): Promise<{ finalUrl: string }>;
```

### `e2e/specs/new-burner/support.ts` — 3 exports

```ts
export interface DetailedBioInput {
  username: string;
  homeCity: string;
  homeCityPublic: boolean;
  attendedYears: number[];
  about: string;
  phoneNational: string;
  onsiteName: string;
  offsiteName: string;
  medical: string;
  idNumber: string;
}
export async function fillDetailedBio(page: Page, input: DetailedBioInput): Promise<void>;
export async function readBurnerIdFromRoster(page: Page, username: string): Promise<string>;
```

### `e2e/specs/officer/support.ts` — 8 exports

```ts
export const OFFICER_NAMES: { lnt; safety; fireBaron; sound; monitor };
export function uniquePhone(): { national: string; marker: string };
export async function setBioPhone(page: Page): Promise<{ marker: string }>;
export interface OfficerActor { account: Account; username: string; phoneMarker: string }
export async function onboardOfficerWithPhone(page: Page): Promise<OfficerActor>;
export interface CampWithOfficer { slug: string; campName: string; leadUsername: string; officer: OfficerActor }
export async function setUpCampWithMember(leadPage: Page, officerPage: Page): Promise<CampWithOfficer>;
export async function expandRow(page: Page, nameRe: RegExp): Promise<void>;
export async function assignOfficer(leadPage: Page, slug: string, officerName: string, memberDisplayName: string): Promise<void>;
export async function respondToConsent(officerPage: Page, slug: string, decision: "accept" | "decline"): Promise<void>;
export async function openOrgRegistration(orgPage: Page, campName: string): Promise<string>;
```

### `e2e/specs/org-staff/_helpers.ts` — 6 exports

```ts
export type MakeAppPage = (app: AppName) => Promise<Page>;
export interface OrgStaff { account: Account; org: Page }
export async function elevateAccountToOrgStaff(godOrg: Page, email: string): Promise<void>;
export async function makeAccountEngineer(godOrg: Page, email: string): Promise<void>;
export async function provisionEngineer(makeAppPage: MakeAppPage): Promise<OrgStaff>;
export async function provisionOrgStaff(makeAppPage: MakeAppPage, opts: { username?: string } = {}): Promise<OrgStaff>;
export function desktopOnly(test: { skip: (condition: boolean, reason: string) => void }, projectName: string): void;
```

### `e2e/specs/god/support.ts` — 9 exports

```ts
export function consoleNav(page: Page): Locator;                  // getByRole("navigation", { name: "Console" })
export async function expectConsoleReached(page: Page): Promise<void>;
export async function expectConsoleForbidden(page: Page): Promise<void>;
export async function expectGodPrivileges(page: Page): Promise<void>;
export async function gotoAccount(page: Page, email: string): Promise<void>;
export function rowElevateButton(page: Page): Locator;
export function rowRemoveButton(page: Page): Locator;
export function confirmDialog(page: Page): Locator;
export async function openElevateDialog(page: Page): Promise<Locator>;
export async function openDemoteDialog(page: Page): Promise<Locator>;
export async function elevateVisibleRow(page: Page): Promise<void>;
export async function demoteVisibleRow(page: Page): Promise<void>;
```

### `e2e/specs/supplier/support.ts` — 4 exports

```ts
export function orgSupplierRow(orgPage: Page, name: string): Locator;
export async function orgAddSupplier(orgPage: Page, opts: { name: string; contact?: string; services?: string }): Promise<void>;
export async function orgSetStanding(orgPage: Page, supplierName: string, label: string): Promise<void>;
export async function orgAddNote(orgPage: Page, supplierName: string, body: string): Promise<string>;
export async function orgCreateDocument(orgPage: Page, opts: { title: string; url: string; bindStepLabel?: string }): Promise<string>;
```

---

## 6. UX behaviours the harness drives (and therefore documents)

Every factory carries **selector provenance** comments naming the exact component file each selector was verified against, dated `2026-07-26` — e.g. `factories.ts:10-18`, `camp-lead/support.ts:10-20`, `camp-member/support.ts:8-14`, `officer/support.ts:11-21`, `supplier/support.ts:234-241`, `new-burner/support.ts:257-261`. This is a portable practice regardless of whether the selectors themselves port.

Concrete UI contracts the suite encodes:

- **Sign-up** (`factories.ts:136-140`): `/auth/sign-up`, `getByLabel("Email",{exact:true})`, `getByLabel("Password",{exact:true})`, `getByRole("button",{name:"Create account"})`, then `waitForResponse` on `POST …/api/auth/sign-up`.
- **Sign-in is asserted by leaving the route, never by message text** (`factories.ts:204-206`) — because "enumeration-safe copy means a wrong password shows the SAME message as an unknown email". Then `page.waitForLoadState("load")` (`:215`) so a caller's next `goto` doesn't race the post-sign-in navigation ("Navigation to /profile is interrupted by another navigation to /directory").
- **Sign-out is loud, not silent** (`factories.ts:219-258`): `waitFor({state:"visible", timeout:10_000})` on the control (never `count()`, which "resolves immediately … while the page is still rendering"), then `expect(page).toHaveURL(/\/(auth\/sign-in|signin)?$|\/$/)`, then polls until the session cookie is actually gone.
- **The 5-step onboarding bio** (`factories.ts:279-304`): `/onboarding` → `"Get started"` → username/home-city → `"Save & continue"` → `"Save & continue"` → `"Complete my bio"` → assert `/you['’]re all set/i`. Idempotent: if the app has already redirected to `/profile`, treat as done (`:283`).
- **Create-camp soft-dedupe requires a SECOND confirming submit** (`factories.ts:344-361`): the factory races `waitForURL(isCampDetailUrl)` against `getByText(/similar to existing camp/i)` and clicks again if the warning appeared. The three-outcome verdict (`created` / `warn` / `error`) is exposed for specs at `camp-lead/support.ts:59-102`.
- **The signed-out invite journey** (`factories.ts:440-532`) — the flagship: open `/join/<token>` with no session, assert **not** bounced to `/auth/sign-in`, click `/^(join |accept lead role)/i`, wait for `/auth/sign-up`, create the account, clear the bio gate, click `/continue to your camp/i`, then click through the `/join/continue` **confirm page** (which exists precisely so a join can't happen by landing on a URL). The invite survives via an httpOnly cookie — "nothing in this journey ever puts the token back in a url; the spec proves the OUTCOME".
- **The six-section registration wizard** (`factories.ts:579-693`) with an explicit **autosave barrier before submit** (`:677-679`: `await expect(page.getByText(/saved just now/i)).toBeVisible({timeout:15_000})`) because "the server re-checks completeness against what it has stored".
- **Blocking-gate chrome contract** (`specs/camp-member/camp-member-blocking-questionnaire.spec.ts:56-69`): `/required · blocks until done/i` badge, `/you can['’]t use the portal until this is done/i`, a visible sign-out **button**, and `getByRole("link",{name:/directory/i})` at count **0** — "a nav link would be an escape hatch the gate must not have".
- **Two ways out of a blocking gate** — submit (`camp-member-blocking-questionnaire.spec.ts:79-91`) and the sender **closing** the activation (`camp-member-gate-released-by-close.spec.ts`), the latter with its own reasoning for why it needs a separate spec (§8).
- **Account security surfaces** (`specs/new-burner/account-management.spec.ts`): active-session list with a `"This device"` badge and per-other-session `Revoke` buttons; password change with a `/sign out my other devices/i` switch defaulting **on** (asserted at `:73-75` "so a default flip can't silently weaken this test"); delete-with-grace showing `/scheduled for deletion/i` + `/left to change your mind/i` and a `/keep my account/i` restore control.

---

## 7. Validation and edge-case rules — digit-exact

| Rule | Value | Cite |
| --- | --- | --- |
| Test timeout (default) | `90_000` ms | `lib/env.ts:156` |
| Expect timeout | `15_000` ms | `lib/env.ts:158` |
| Action + navigation timeout | `20_000` ms | `lib/env.ts:160`, `playwright.config.ts:57-58` |
| Mail poll deadline | `45_000` ms | `lib/env.ts:162` |
| Mail poll interval | `1500` ms | `lib/mail.ts:169` |
| CI test timeout override | `180000` ms | `ci.yml:238`, `mobile.yml:90` |
| CI retries | `1` | `ci.yml:258`; config default `E2E_RETRIES ?? 1` at `playwright.config.ts:41` |
| Mobile-nightly retries | `0` | `mobile.yml:94` |
| CI workers, god-sharing shards | `1` | `ci.yml:219-224` (`god`, `org-staff`, `camp-lead`, `officer`, `supplier`) |
| CI workers, isolated shards | `2` | same |
| Local default workers | `2` | `scripts/e2e-local.sh:226` |
| Playwright config CI worker fallback | `4` | `playwright.config.ts:47` |
| Session-cookie wait | `15_000` ms deadline, `100` ms poll | `factories.ts:78, :86` |
| Sign-out cookie-clear wait | `10_000` ms deadline, `100` ms poll | `factories.ts:246, :254` |
| Sign-out control wait | `10_000` ms | `factories.ts:230` |
| Sign-up POST wait | `15_000` ms | `factories.ts:152, :482, :792` |
| Supplier `/onboarding` landing wait | `20_000` ms | `factories.ts:816` |
| Create-camp warning wait | `10_000` ms | `factories.ts:356` |
| `attemptCreateCamp` three-way race | `10_000` ms each | `camp-lead/support.ts:74, :80, :84` |
| Registration autosave barrier | `15_000` ms | `factories.ts:678` |
| Bio-edit outer retry | `toPass({ timeout: 90_000, intervals: [1_000, 2_000, 4_000] })` | `camp-member/support.ts:183` |
| Bio-edit step waits | `10_000` ms each; final URL wait `15_000` ms | `camp-member/support.ts:171-182` |
| Org registrations-queue paging cap | `MAX_PAGES = 25` | `camp-lead/support.ts:308`, `officer/support.ts:202` |
| Rate-limit attempts cap | `MAX_ATTEMPTS = 40` | `new-burner/auth-rate-limit.spec.ts:32` |
| Two-factor / passkey per-test timeout | `test.setTimeout(180_000)` | `two-factor.spec.ts:39`, `passkeys.spec.ts:49` |
| Passkey label visibility wait / removal wait | `30_000` ms | `passkeys.spec.ts:95, :112` |
| 2FA "turn on" reappearance wait | `20_000` ms | `two-factor.spec.ts:124` |
| TOTP secret length sanity | `> 15` after base32 decode | `two-factor.spec.ts:64` |
| Username length envelope | 3–20; prefix truncated to `19 - suffix.length`; final `.slice(0,20)` | `lib/identity.ts:87-98` |
| Synthetic email domain | `e2e.quagga.test` (RFC 6761 reserved TLD) | `lib/identity.ts:19-20` |
| Run id entropy | `randomBytes(16).toString("hex").slice(0,6)` | `lib/identity.ts:47` |
| Local auth rate-limit ceiling | window `60` s, max `10000` | `scripts/e2e-local.sh:45-46` |
| Readiness loop | 60 attempts × 2 s per port = 120 s, then `exit 1` | `scripts/e2e-local.sh:178-192` |
| Port reclamation | 3 attempts: SIGTERM, SIGKILL, then `exit 1`; 2 s between | `scripts/e2e-local.sh:113-128` |
| Build concurrency | `--concurrency=1` | `scripts/e2e-local.sh:139` |
| Desktop viewport | `1280 × 800` | `playwright.config.ts:72` |
| Mobile viewport | `360 × 780`, Pixel 7 device profile | `playwright.config.ts:80-82` |
| Nightly mobile cron | `0 2 * * *` | `mobile.yml:25` |
| CI e2e job timeout | `30` minutes | `ci.yml:122`, `mobile.yml:45` |
| Artifact retention | `14` days | `ci.yml:306`, `mobile.yml:113` |

Edge-case rules encoded as *behaviour*, not numbers:

1. **`waitForURL` resolves synchronously against the CURRENT url.** Hence `isCampDetailUrl` excludes `/camps/new` — `"new"` is a valid `[^/]+` segment (`factories.ts:52-63`, restated at `:363-366`, `:419-421`, and independently in `camp-lead/support.ts:34-39`).
2. **A `required` field's accessible label contains the asterisk.** `Field` renders `{label}<span aria-hidden>*</span>`, so `getByLabel("Email",{exact:true})` matches nothing on the suppliers forms. Fix: anchored regex `getByLabel(/^Email/)` (`factories.ts:196-200`, `:769-775`, `README.md:238-241`).
3. **Bio text fields collide with their own privacy switch.** The switch's aria-label is `"Home city — public or private"`, so `getByLabel(/home city/i)` is a strict-mode violation. Fix: `getByRole("textbox", { name: /home city/i })` (`README.md:242-248`, `camp-member/support.ts:152-162`).
4. **`toHaveCount(0)` immediately after `toHaveURL` proves nothing** — `toHaveURL` resolves before paint, so the first poll can land on an empty document. "Four assertions across three specs did exactly this, and one of them (`camp-member-forbidden`) had been green for months on a page it never actually looked at." Rule: assert something PRESENT first (`README.md:254-264`).
5. **`.click()` is not "the request finished."** Sign-up factories wait for the POST **and** for the cookie (`factories.ts:142-163`; `README.md:265-269`; restated for the questionnaire submit at `org-staff/questionnaire-build-activate-results.spec.ts:165-178`).
6. **`role="alert"` paragraphs rendered unconditionally-but-empty** make a bare alert count useless — filter to alerts with text: `(await page.getByRole("alert").allInnerTexts()).filter(t => t.trim())` (`two-factor.spec.ts:125-133`).
7. **`ResponsiveDataTable` renders BOTH layouts into the DOM at once** (desktop `<tr>` at md+ and the stacked mobile `<li>`), so every row locator must be `.filter({ visible: true })`-scoped or strict mode trips (`god/support.ts:6-12`, `org-staff/_helpers.ts:220-222`, `supplier/support.ts:246-252`).
8. **`notFound()` returns HTTP 200 in this app, and three fixes were tried and measured.** `camp-member/support.ts:190-231` records: removing every `loading.tsx`, removing the segment's `not-found.tsx`, and hoisting the check into a `layout.tsx` — none moved the status. Cause: `(app)/layout.tsx` declares `dynamic = "force-dynamic"` for the whole group, so the response is committed before any descendant decides anything. The spec therefore asserts the *property* (`/we couldn['’]t find/i` renders, and the named secrets are absent) rather than the status line. **This is directly relevant: Camp 404's `apps/web/app/page.tsx:27` also sets `dynamic = "force-dynamic"`.**
9. **The 5-minute signed session `cookieCache` makes "the other tab bounces instantly" flaky**, so revocation is proven cache-independently — the server-rendered session list shrinks, and the old password stops authenticating while the new one starts (`account-management.spec.ts:13-20`, `password-reset.spec.ts:15-20`).
10. **Threshold-agnostic rate-limit assertion.** If no 429 appears in 40 attempts the test **skips with a reason**, never fails and never fabricates a pass (`auth-rate-limit.spec.ts:64-69`). And the cross-context proof: a brand-new cookieless context must ALSO get 429, which "only server-side, shared (DB-backed) state" can produce (`:74-87`).

---

## 8. Test coverage — what this suite actually proves

**8 personas · 70 spec files · 172 `test(` calls.** (Three donor documents disagree on the count — see §9.)

Notable coverage that Camp 404 has zero equivalent of and that is fully portable in shape:

| Journey | Spec | What it proves |
| --- | --- | --- |
| **Real TOTP enrolment** | `new-burner/two-factor.spec.ts` (141) | Uses `@better-auth/utils/base32` + `createOTP` to derive the same TOTP the server verifies, **from the setup key the page itself prints**. Asserts, in order of trust: a WRONG code is refused; the right code enrols and backup codes appear; a FRESH server render still says on (durability, not a client flag); turning off asks for the password. Digit-exact trap recorded at `:53-59`: the key is grouped in fours AND is base32 of the secret, while `createOTP` takes the **decoded** secret — feeding it the base32 produces valid-looking digits the server rejects |
| **Real passkey enrolment** | `new-burner/passkeys.spec.ts` (130) | Installs a **CDP virtual authenticator** (`WebAuthn.enable` + `WebAuthn.addVirtualAuthenticator` with `protocol:"ctap2"`, `transport:"internal"`, `hasResidentKey:true`, `hasUserVerification:true`, `isUserVerified:true`, `automaticPresenceSimulation:true`), creates a named passkey, verifies `WebAuthn.getCredentials(...).credentials.length === 1`, asserts durability on a fresh render, removes it, and **removes the authenticator in a `finally`** so it doesn't leak into a reused context |
| **Session list + revoke + password rotation** | `new-burner/account-management.spec.ts` (189) | Three live sessions (deliberately three, not two — `:41-47` explains that with one other device the test passed while a rotated session cookie was being dropped on the way out of the server action); revoke leaves "This device" intact; after a password change the survivor still shows "This device" ("A list that cannot find you in it is not a working security page") |
| **Delete-with-grace + restore** | `account-management.spec.ts:137-188` | Re-auth by password → `/scheduled for deletion/i` → `/keep my account/i` → assert the control **disappears** (`toHaveCount(0)`), not that it re-enables ("Waiting for a control to come back that is meant to disappear is a wait that can only ever time out") |
| **Password reset over a real inbox** | `new-burner/password-reset.spec.ts` (90) | `skipUnlessMail()`, real mail.tm inbox, real Resend delivery, single-use link, then credential-rotation proof |
| **Enumeration-safe sign-in copy** | `new-burner/session-lifecycle.spec.ts:54-87` | Captures the alert text for wrong-password and for never-registered-email in **separate contexts** and asserts they are byte-identical, plus `toMatch(/don['’]t match/i)` |
| **DB-backed, cross-request rate limiting** | `new-burner/auth-rate-limit.spec.ts` (89) | Drives the real `/api/auth/sign-in/email` endpoint and asserts a cold context inherits the 429 |
| **Blocking gate traps AND releases** | `camp-member/camp-member-blocking-questionnaire.spec.ts` (93) | Three trap surfaces + the stripped chrome contract + release on submit |
| **Closing an activation frees trapped users** | `camp-member/camp-member-gate-released-by-close.spec.ts` (118) | Its header (`:9-18`) is a model of why-this-needs-its-own-spec reasoning: closing flips `questionnaire_activations.status` to `closed` without completing the `required_actions` row, so release depends entirely on `listRequiredActions` joining the activation. "Deleting the `activationStatus === 'open'` filter would leave every other questionnaire spec green while every recipient of a closed blocking send stayed locked out of the app permanently" |
| **Questionnaire build → activate → answer → aggregate** | `org-staff/questionnaire-build-activate-results.spec.ts` (201) | Builds a 2-section, 4-question questionnaire with a forward-only branch, publishes, activates non-blocking to an outbound audience, has a dedicated fresh burner answer it, then asserts the aggregate reads `/1 of \d+ completed/` and `"1 · 100%"`. **This is exactly Camp 404's unbuilt questionnaire-builder Phase E (metrics + responses view) driven end to end** |
| **Onboarding gate loop** | `new-burner/onboarding-gate.spec.ts` (73) | Loops `["/directory","/camps/new","/profile","/"]` asserting each redirects, with a per-route failure message `` `route ${route} should be gated` `` |
| **Anon refusal loop** | `anon/gated-web-surfaces-refused.spec.ts` (62) | A `SESSION_ONLY_ROUTES` const array generating one `test()` per route, plus a positive proof (`getByLabel("Email")` visible) so it can't pass against a blank page |
| **Signed-out invite acceptance** | `anon/signed-out-invite-acceptance.spec.ts` (208) | The full stranger→member round trip, plus the dead-token half ("a DEAD token (used, expired, revoked) or a bogus one buys NOTHING: no camp name, no inviter, no action") |

Coverage **honestly declared absent**:

- Google OAuth is not E2E-tested — "Real Google sign-in cannot be driven headlessly in CI (bot detection, consent screens, 2FA), and mocking the provider callback would require a product-code side-door we refuse to ship" (`README.md:145-151`).
- Signing IN with a passkey is not tested because "the sign-in page has no passkey button yet" (`passkeys.spec.ts:32-34`).
- Registry tier-(B) capabilities are proven only as "no UI path exposes the action", with the real refusal deferred to a named `@quagga/core` predicate test (`registry.ts:22-42`).
- `mobile-360` "has never been triaged, so it is expected red" (`README.md:41-43`).

**Coverage instrumentation caveat, stated in CI itself** (`ci.yml:341-365`): "Vitest measures only what runs inside the vitest process. The persona suite drives real browsers against `next dev` / `next start` in separate processes with no instrumentation, so all 165 e2e tests contribute ZERO to any number here." Hence the three apps scope `coverage.include` to `lib/**` only — counting `app/**` and `components/**` "produced a ~3% figure that described the test runner rather than the code".

---

## 9. Dependency footprint

`e2e/package.json:16-24` — **devDependencies only, five real packages:**

```json
"@better-auth/utils": "^0.4.2",
"@playwright/test": "1.62.0",
"@quagga/eslint-config": "workspace:*",
"@quagga/typescript-config": "workspace:*",
"@types/node": "^25.9.1",
"eslint": "^10.4.0",
"typescript": "^6.0.3"
```

Node built-ins used: `node:crypto` (`randomBytes` — `lib/identity.ts:9`, `officer/support.ts:25`), `node:fs` (`readdirSync`, `readFileSync`, `statSync` — `tests/negative-paths.spec.ts:38`), `node:path` (`join`), `node:url` (`fileURLToPath`). Global `fetch` for mail.tm — **no HTTP client dependency**.

**Against Camp 404:**

| Package | Camp 404 today | Action |
| --- | --- | --- |
| `@playwright/test` | `^1.60.0` in `apps/web/package.json:52` (lock 1.60.0) | Donor pins **exactly** `1.62.0`. Bump or accept the drift; the CDP virtual-authenticator API used by `passkeys.spec.ts` is long-stable |
| `@better-auth/utils` | absent | Needed **only** by `two-factor.spec.ts`. Camp 404 has better-auth pinned to `~1.4.18` via a root `pnpm.overrides` — the `base32` + `createOTP` helpers are provider-side utilities, so this is a one-package add |
| `@types/node`, `eslint`, `typescript` | already present at matching majors | No action |
| `@quagga/eslint-config` / `@quagga/typescript-config` | `@camp404/*` equivalents are **byte-identical** (per the mechanical-delta brief) | Pure `s/@quagga/@camp404/` |

Runtime infra the harness assumes: Docker (`docker-compose.local.yml`: `postgres:16-alpine`, `ghcr.io/neondatabase/wsproxy:latest`, `ghcr.io/timowilhelm/local-neon-http-proxy:main`), `ss` (iproute2) for the port reclamation, `curl` for readiness, `pkill`, `psql` via `docker exec`. Camp 404 already has `@electric-sql/pglite` for DB integration tests but nothing at this layer.

Zero product-code dependency in either direction: the harness imports **nothing** from `@quagga/db`, `@quagga/core`, `@quagga/types`, `@quagga/ui` or `@quagga/auth`. The single exception is `packages/auth/scripts/e2e-god-bootstrap.mts`, which lives **outside** `e2e/` precisely so it can import `@quagga/db` + `@quagga/auth` (`:27-29`).

---

## 10. AfrikaBurn / multi-tenant coupling

### 10.1 Clean — zero coupling, port as-is

- `e2e/lib/dom.ts` — Next-specific, not app-specific.
- `e2e/lib/identity.ts` — only `uniqueCampName()` / `uniqueSupplierName()` carry AB flavour ("Dust Bunnies", "LosKop Logistics"), and those are one-line renames. The `.test` TLD, the RUN_ID mixing and the username-rule encoding are pure.
- `e2e/lib/mail.ts` — entirely provider-agnostic; nothing in it knows what the app is.
- `e2e/playwright.config.ts` — except the three hard-coded prod hosts in `assertNotProductionUnlessAllowed` (`lib/env.ts:173-177`), which become Camp 404's own apex.
- `scripts/e2e-local.sh`'s **shape** — the port reclamation, `.next/dev` deletion, readiness gate, module-not-found abort and the `DROP SCHEMA public + drizzle` reset are all generic Next+Turborepo+Drizzle lessons.
- CI's persona-matrix + `CI pass` aggregation pattern (`ci.yml:119-163`, `:518-558`). Note `ci.yml:326` says explicitly "Same pattern as camp-404 and ops-board" — **the `CI pass` idea already flowed from Camp 404 to the donor; the persona matrix is the return trip.**

### 10.2 Three-app coupling — collapses to nothing in Camp 404

`AppName = "web" | "org" | "suppliers"` threads through `lib/env.ts`, `fixtures.ts`, `factories.ts` (`signInAs(page, account, app)`, `signInPath(app)`) and `org-staff/_helpers.ts` (`MakeAppPage`). For a single-app target this becomes a constant:

- `APP_URLS` → one `E2E_BASE_URL`.
- `webPage` / `orgPage` / `suppliersPage` → one `appPage`; **keep `makeAppPage` renamed to something like `makeIsolatedPage()`**, because the multi-actor specs genuinely need N independent contexts on the same origin (`account-management.spec.ts:48-51` uses three; `camp-member-blocking-questionnaire.spec.ts:26-27` uses two).
- `signInPath(app)` → the literal `/auth/sign-in`.
- The whole `fixtures.ts:3-8` rationale about `*.vercel.app` origins and the Public Suffix List is donor-only infrastructure.

### 10.3 Org/participant-split coupling — delete, do not port

Everything in `specs/org-staff/`, `specs/god/` and `specs/supplier/` (28 spec files, 65 `test(` calls) exists because reviewers are a different organisation from the reviewed. Specifically un-portable: `org_departments` / `org_roles` / `org_department_domains` scoping (`god/department-domain-scoping.spec.ts`, 338 lines), the `god | org_staff | engineer` rank ladder, `provisionOrgStaff` / `provisionEngineer` / `elevateAccountToOrgStaff` / `makeAccountEngineer`, `consoleNav` and both console gate assertions, and the entire supplier portal.

**But the SHAPE of `provisionOrgStaff` (`org-staff/_helpers.ts:287-327`) is the single most reusable idea in that block for Camp 404's WP3 gap.** Its four-step sequence — (1) real participant sign-up, (2) first privileged-surface load hits the refusal wall (the pre-elevation ground truth), (3) an existing privileged actor grants through the real UI, (4) re-resolve and assert the wall is gone — maps exactly onto Camp 404's captain-promotion handshake, which per WP3 (#127) **can never complete today because no recipient-facing UI exists**. A `provisionCaptain(makeIsolatedPage)` written to that shape would be the acceptance test for WP3.

### 10.4 The `editions` dimension

The harness barely touches it — the only visible leakage is `org-staff/questionnaire-build-activate-results.spec.ts:24-28`'s honest note that `all_current_burners` "resolves edition-wide", and `supplier/support.ts:334-336`'s note that documents are "edition-global (shared by every supplier of the edition), not per-supplier". Neither survives a port; neither costs anything to drop.

### 10.5 Persona-registry shape mapped to Camp 404

The donor's 9 personas collapse to roughly 5 in a single-camp world:

| Donor persona | Camp 404 equivalent |
| --- | --- |
| `anonymous` | `anonymous` — `<LandingHero/>` at `app/page.tsx:31-33` |
| `burner` (signed up, un-onboarded) | **pending / un-approved member** — the `/signup/required` + `/pending-approval` states |
| `camp_member` | `camp_member` (`ViewerRank`) |
| `camp_lead` | `team_lead` — **derived** from `team_memberships.is_lead`, which per WP6 (#130) has NO production write path, so this persona is currently un-provisionable through the UI at all |
| `camp_lead`(structural) / `god` | `captain` (`rankEnum` `["captain","member"]`) |
| `other_camp_lead` | **delete** — no cross-tenant isolation to prove |
| `org_staff`, `engineer`, `supplier` | **delete** |

Camp 404-specific personas the donor has no analogue for and that would need writing: the **founder running `/setup`** (`FOUNDER_CODE = "meowzit"`, `apps/web/lib/bootstrap.ts:14`, latched once by `camp_settings.bootstrappedAt`) and the **invite-code holder** (`/signup/required`).

---

## 11. Verbatim excerpts — the five most valuable pieces

### 11.1 The capability-flag + honest-skip pattern (`e2e/lib/env.ts:100-128`, `e2e/fixtures.ts:69-86`)

This is the idea that makes the whole harness runnable against unequal environments without ever lying about coverage.

```ts
// e2e/lib/env.ts:100-114
/**
 * Whether the deployment gates sign-in on email verification. Derived from the
 * same signal as the app (auth env.ts resolveRequireEmailVerification): a mail
 * provider must exist for verification to be possible at all. Overridable with
 * E2E_REQUIRE_EMAIL_VERIFICATION for a deployment that has RESEND but keeps the
 * gate off (Ryan's decision 2).
 */
export function requiresEmailVerification(): boolean {
  if (!isMailCaptureAvailable()) return false;
  const override = (process.env.E2E_REQUIRE_EMAIL_VERIFICATION ?? "")
    .trim()
    .toLowerCase();
  if (["false", "0", "off", "no"].includes(override)) return false;
  return true;
}
```

```ts
// e2e/fixtures.ts:69-86
/**
 * Skip the current test unless the deployment sends+captures email. Use for any
 * flow that must READ a verification/reset link.
 */
export function skipUnlessMail(): void {
  test.skip(
    !isMailCaptureAvailable(),
    "mail capture unavailable (E2E_MAIL_MODE=off)",
  );
}

/** Skip the current test unless god credentials are configured. */
export function skipUnlessGod(): void {
  test.skip(
    !godCredentials(),
    "no god credentials (E2E_GOD_EMAIL/E2E_GOD_PASSWORD)",
  );
}
```

And the counterweight that stops honest skipping degenerating into a green run that proves nothing (`scripts/e2e-local.sh:48-58`):

> `# GOD CREDENTIALS, or the god and org-staff suites SILENTLY SKIP and the script`
> `# still exits 0 — a green run that proves nothing, on exactly the two personas`
> `# every permission change touches. Measured: without these,`
> `# `E2E_RESET_DB=1 ./scripts/e2e-local.sh specs/god specs/org-staff`` reports`
> `# "37 skipped, 2 passed" and succeeds. A gate that cannot fail is not a gate.`

### 11.2 The production guard (`e2e/lib/env.ts:168-194`) — runs before any browser starts

```ts
/** Guard: refuse to run the destructive suite against a production apex by accident. */
export function assertNotProductionUnlessAllowed(): void {
  const allow =
    (process.env.E2E_ALLOW_PRODUCTION ?? "").trim().toLowerCase() === "true";
  if (allow) return;
  const prodHosts = [
    "app.quagga.ryanjnoble.dev",
    "org.quagga.ryanjnoble.dev",
    "suppliers.quagga.ryanjnoble.dev",
  ];
  for (const app of ["web", "org", "suppliers"] as const) {
    const host = (() => {
      try {
        return new URL(baseUrl(app)).host;
      } catch {
        return "";
      }
    })();
    if (prodHosts.includes(host)) {
      throw new Error(
        `[e2e] Refusing to run against production host ${host}. The suite creates ` +
          `real accounts and rows. Point E2E_${app.toUpperCase()}_URL at a preview, ` +
          `or set E2E_ALLOW_PRODUCTION=true if you REALLY mean it.`,
      );
    }
  }
}
```

Invoked at `playwright.config.ts:15` — module scope, i.e. before test collection.

### 11.3 `waitForSessionCookie` — the cure for ~100 phantom auth failures (`e2e/personas/factories.ts:65-93`)

```ts
/**
 * Block until the browser actually HOLDS a session cookie.
 *
 * Waiting for the sign-up response is not enough and the difference is not
 * theoretical — it produced an intermittent failure in every persona that signs
 * up. `waitForResponse` resolves on response headers; the cookie jar is updated
 * a beat later, and a `page.goto` issued in that gap carries no session, so the
 * gate correctly bounces to sign-in and the spec blames the product.
 *
 * It also turns a FAILED sign-up into an honest error here, instead of a
 * confusing "expected not to be on /auth/sign-in" fifteen seconds later.
 */
async function waitForSessionCookie(page: Page, what: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const cookies = await page.context().cookies();
    // Better Auth prefixes with "quagga" (advanced.cookiePrefix), and adds
    // "__Secure-" on https origins — match either.
    if (cookies.some((c) => /quagga\.session_token$/.test(c.name) && c.value)) {
      return;
    }
    await page.waitForTimeout(100);
  }
  throw new Error(
    `[e2e] ${what} did not produce a session cookie within 15s. The request may ` +
      `have been refused (duplicate address, password policy, rate limit) — check ` +
      `the app log rather than treating this as a navigation problem.`,
  );
}
```

For Camp 404 the only change is the cookie-name predicate — Neon Auth / Better Auth 1.4.x under `@neondatabase/auth`, whose cookie prefix must be read off a real session before porting.

### 11.4 The persona registry's two-tier honesty declaration (`e2e/personas/registry.ts:10-42`)

```
// TWO TIERS OF PROOF — stated honestly so the "delete-the-guard, watch-it-go-red"
// guarantee (roadmap M3-30 adversarial pass) is claimed only where it truly holds:
//
//  (A) E2E-provable refusals. The protected surface itself is reachable by URL,
//      so navigating to it as the wrong persona yields an OBSERVABLE server
//      refusal (redirect / 404 / staff-wall / data-never-sent). Deleting the
//      server guard makes the corresponding negative spec go red. …
//
//  (B) Mutations with NO client entry point for the wrong persona. A few "cannot"s
//      are server actions the wrong persona has no reachable trigger for at all —
//      the control is server-OMITTED and the action id is Next-hashed, so there is
//      no build-stable way to POST it from Playwright and be refused. For these
//      the E2E proves only that NO UI path exposes the action, while the pure
//      server refusal is a @quagga/core PREDICATE test in the SAME `turbo run
//      test` gate (AGENTS.md rule 7: authz predicates live in core). Deleting the
//      predicate turns THAT test red. …
```

Paired with the capability shape it enforces:

```ts
// e2e/personas/registry.ts:79-93
/** A capability the persona either HAS (allowed) or MUST BE REFUSED (forbidden). */
export interface Capability {
  /** Stable id used by specs to select the guard to prove. */
  id: string;
  /** Which app the surface lives on. */
  app: AppName;
  /** Human description of the action. */
  action: string;
  /**
   * For a FORBIDDEN capability: how the guard should refuse. The negative-path
   * spec asserts this observable refusal, and (per the adversarial pass) a
   * reviewer deletes the server guard to confirm the spec then goes red.
   */
  refusalHint?: string;
}
```

Example entry showing what a `refusalHint` is worth (`:178-185`) — note it names *where* the refusal happens, which is the difference between a real guard and a hidden link:

```ts
readPersonalInformation: {
  id: "read-personal-information",
  app: "org",
  action:
    "receive a person's email / phone / emergency contact / ID / medical notes in a console payload",
  refusalHint:
    "the QUERY resolves canReadPersonalInformation BEFORE the select, so the column is never in the row — not merely unrendered",
},
```

### 11.5 The registry-coverage meta-test (`e2e/tests/negative-paths.spec.ts:81-127`)

A test whose subject is the test suite itself. This is the piece I would port first, because it is the thing that makes a matrix file *stay* true.

```ts
test("every forbidden capability in the registry is claimed by a spec", () => {
  // THE REGISTRY IS ONLY WORTH KEEPING IF IT IS ANSWERED. Adding a persona's
  // forbidden capability is cheap; writing the spec that proves the refusal is
  // not, and nothing used to notice the gap. This does: a capability id that
  // appears in no spec file fails here, by name, with nowhere to hide.
  //
  // The convention it enforces is the one the suite already follows — a spec
  // cites the registry id it proves, in its header comment or its test title
  // (`[reach-org-console]`). Cheap to satisfy, and it makes "which spec proves
  // this?" answerable with grep instead of archaeology.
  //
  // NOT a proof that the refusal works — that is each spec's job, re-proven by
  // deleting the guard. This is a proof that a claim EXISTS, which is the
  // failure mode five `fixme`s hid for weeks.
  const specsRoot = fileURLToPath(new URL("../specs", import.meta.url));
  const testsRoot = fileURLToPath(new URL(".", import.meta.url));

  function collect(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...collect(full));
      else if (entry.endsWith(".ts")) out.push(full);
    }
    return out;
  }

  const corpus = [...collect(specsRoot), ...collect(testsRoot)]
    // This file names every id in the map above, so counting it would make the
    // gate self-satisfying — exactly the tautology the `fixme`s were.
    .filter((f) => !f.endsWith("negative-paths.spec.ts"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  const unclaimed = [
    ...new Set(
      forbiddenMatrix()
        .map((row) => row.capability.id)
        .filter((id) => !corpus.includes(id)),
    ),
  ].sort();

  expect(
    unclaimed,
    `No spec cites these forbidden capabilities. Name the id in the owning spec's header or test title, or drop it from personas/registry.ts:\n  ${unclaimed.join("\n  ")}`,
  ).toEqual([]);
});
```

### 11.6 (bonus) The one write the harness makes that the product would not (`packages/auth/scripts/e2e-god-bootstrap.mts:1-29`)

Worth quoting whole because it is the model for how to document a necessary test-only escape without letting it metastasise into a back door.

```
// Create the E2E god account, if it does not already exist.
//
// TEST SETUP ONLY. Never run this against a real deployment: it marks an email
// address verified without the address holder doing anything, which is exactly
// the thing the product must never do. It lives here because the alternative is
// worse — see below.
//
// WHY THIS IS NEEDED. `elevateToGod` (e2e/personas/factories.ts:744) signs in
// with E2E_GOD_EMAIL/E2E_GOD_PASSWORD and expects the account to already exist.
// Nothing in the suite, the seed, or scripts/e2e-local.sh ever created it — so
// the 28 spec files behind `skipUnlessGod()` only ever ran on a database where
// somebody had made that account BY HAND, once, locally. …
//
// The email must be VERIFIED because the GOD_EMAILS bootstrap deliberately
// refuses an unverified address (apps/org/lib/god.ts canBootstrapGodEmail — an
// OIDC provider asserting an attacker-controlled `email` claim must never
// elevate). With E2E_MAIL_MODE=off there is no inbox to click, so the
// verification is applied directly here. That is the ONE step this script takes
// that the product would not.
//
// Idempotent: an existing account is left alone apart from ensuring the verified
// flag, so re-running is safe.
```

The corresponding README guardrail (`e2e/README.md:172-175`): *"Do **not** generalise this into a fixture that grants ranks directly — every rank above god's bootstrap must still be granted through the real Accounts UI, which is what the org-console specs are there to prove."*

---

## 12. Notable engineering practices worth stealing even where the code is not

1. **No product-code back doors, as a package-level contract.** Stated in `e2e/package.json:6` and enforced by the absence of any `/api/test/*` route. Camp 404's `apps/web/lib/test-store.ts` (22 KB in-memory `globalThis` store) + seven `/api/test/*` routes are the opposite bet; `DEFERRED.md:46-52` records the bill it has come due for.
2. **Capability flags + honest skip, with a companion rule that skipping must not produce a green gate** (§11.1).
3. **Selector-provenance headers** dated against the source files they were verified against, in every factory and support module.
4. **Incident comments in the code, with measurements and dates.** `scripts/e2e-local.sh` carries 5.7 GB / 4.6 GB / ~550 GB / "104 phantom E2E failures" / "37 skipped, 2 passed" / "2 failed / 19 passed, a DIFFERENT pair each run". `camp-member/support.ts:190-231` lists three fixes tried and measured, with the measured HTTP statuses.
5. **CI shards named by meaning, not by number** (`ci.yml:128-137`).
6. **One required check that aggregates a whole matrix** (`ci.yml:518-558`), with `if: always()` because "a skipped required check does not block a merge".
7. **A meta-test guarding a declarative matrix from rotting** (§11.5).
8. **Delete `test.fixme` stubs that lie about coverage** (`negative-paths.spec.ts:8-36`).
9. **Assert PRESENT before ABSENT** (`README.md:254-264`) — with a named spec (`camp-member-forbidden`) that was green for months against a page it never looked at.
10. **Prove state durability on a FRESH server render**, not on a post-action client render (`two-factor.spec.ts:96-108`, `passkeys.spec.ts:104-107`, `account-management.spec.ts:180-183`).
11. **Retry the whole flow, not the last click**, when a multi-step server-action wizard can be torn down mid-transition (`camp-member/support.ts:130-183`) — and say why retrying only the click cannot help.
12. **Wait for the observable outcome, not the click** — a completed navigation, a vanished dialog, a changed step counter — with the reason for each choice named inline.
13. **A red nightly job for un-triaged coverage, in its own workflow so it can never appear on a PR** (`mobile.yml:3-21`) — "a permanently red check teaches people to ignore checks".
14. **Upload the server's own log alongside the browser's** (`ci.yml:285-295`).

---

## 13. Gotchas, contradictions and dead code found while reading

1. **`e2e/.env.example` does not exist.** `lib/env.ts:28` tells the user to "see e2e/.env.example" and `README.md:34` instructs `cp e2e/.env.example e2e/.env`. `ls -la e2e/` shows no such file. Anyone following the README hits `cp: cannot stat`.
2. **`required()` at `lib/env.ts:24-32` is dead.** Defined, re-exported at `:196`, and called from **nowhere** (`grep -rn 'required(' --include='*.ts' e2e` returns only the definition). It is also the function whose error message names the missing `.env.example`.
3. **Three different test counts in three donor documents, none matching the code.** `e2e/README.md:3` — "153 tests across 56 spec files"; root `README.md:144` — "165 e2e tests"; `AGENTS.md:61` — "172 tests across 70 spec files". Measured: **172 `test(` calls across 70 `*.spec.ts` files**. AGENTS.md is the correct one; the e2e README is stale by 19 tests and 14 files. `ci.yml:106` adds a fourth figure ("58 spec files and 232 tests") and `ci.yml:345` a fifth ("all 165 e2e tests").
4. **`e2e/README.md:67` says "Retries: 2 in CI only"; `playwright.config.ts:41` sets `1`** (and `ci.yml:258` pins `E2E_RETRIES: "1"`). The README is wrong.
5. **`isGoogleDriveable()` (`lib/env.ts:147-151`) has zero call sites** in any spec — it is documented in the README as existing "only for a bespoke local run", but nothing reads it.
6. **`createMailbox` is only ever called by its own alias** `requireMailbox` (`lib/mail.ts:197`). Not a bug, but the public surface is one function wearing two names.
7. **`GodUnavailableError` (`factories.ts:831-840`) is thrown but never caught.** Specs gate on `skipUnlessGod()` instead, so the class is documentation with an exception attached.
8. **`PERSONAS` is exported but consumed only inside `registry.ts`** (by `forbiddenMatrix`). Specs read the flat matrix, never the map.
9. **`E2E_*` variables are absent from `turbo.json`'s `globalEnv`** (`turbo.json:5-21`, 15 entries, none prefixed `E2E_`). Correct — Playwright is not a turbo task — but it means there is no single declared census of the 23 `E2E_*` variables the harness reads. The census, measured: `E2E_WEB_URL`, `E2E_ORG_URL`, `E2E_SUPPLIERS_URL`, `E2E_VERCEL_PROTECTION_BYPASS`, `E2E_MAIL_MODE`, `E2E_MAILTM_API`, `E2E_REQUIRE_EMAIL_VERIFICATION`, `E2E_GOD_EMAIL`, `E2E_GOD_PASSWORD`, `E2E_UNVERIFIED_GOD_EMAIL`, `E2E_GOOGLE_DRIVEABLE`, `E2E_SYNTHETIC_EMAIL_DOMAIN`, `E2E_TEST_TIMEOUT`, `E2E_EXPECT_TIMEOUT`, `E2E_ACTION_TIMEOUT`, `E2E_MAIL_TIMEOUT`, `E2E_ALLOW_PRODUCTION`, `E2E_RETRIES`, `E2E_WORKERS`, `E2E_PROJECTS`, `E2E_SHARD`, `E2E_SERVE`, `E2E_RESET_DB`.
10. **`e2e/README.md:205-226` openly contradicts its own earlier CI section** and says so: "This section described a plan. What actually ships is in `.github/workflows/ci.yml`, and it is different — recorded here so the two do not disagree." In particular §"Cleanup / isolation" (`:201-203`) still claims CI runs "against a throwaway Neon branch behind a preview", while `ci.yml:104-118` and `scripts/e2e-local.sh` show CI stands up Docker Postgres itself with **no preview and no Neon branch**.
11. **`tests/auth-round-trip.spec.ts:6-7` still carries "NOTE: this has never been run — there is no deployed DB yet"**, which the rest of the repo contradicts (the suite has been run extensively; `ci.yml:279-283` runs this very file on the anon shard).
12. **`e2e-god-bootstrap.mts:8` cites `e2e/personas/factories.ts:744`** for `elevateToGod`; the function is actually at `:850`. A stale line reference.
13. **`camp-lead/support.ts:320-330` documents an un-root-caused failure honestly**: calling `openRegistrationInConsole` a second time inside one test failed twice (28 and 29 Jul 2026) with "the console rendering its chrome over an empty body". "I have not root-caused that, and I am not pretending otherwise." The workaround is to hold the returned URL. Worth knowing before lifting that helper.
14. **The five personas that share ONE god account** (`god`, `org-staff`, `camp-lead`, `officer`, `supplier`) are forced to 1 CI worker for that reason (`ci.yml:205-224`). In Camp 404 the analogous scarce actor is the founding captain (`/setup` latches shut after bootstrap, and per WP1 the sole-captain deletion guard is missing) — the same serialisation pressure will exist, for the same reason, and this is the place it is already reasoned about.
15. **`docs/simplification-audit.md`'s evidence is static-only — "the e2e suite was not run for this document"** (per the donor-architecture brief), so any claim about this harness in that audit is a hypothesis. Everything in *this* doc is read from source.
