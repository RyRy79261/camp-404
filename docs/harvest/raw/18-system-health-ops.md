# Unit 18 — System health checks, probes, config self-diagnosis, deploy/ops surface

**Donor:** quagga-portal / AfrikaBurn Contributors App
`/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
**Target:** Camp 404 `/home/ryan/repos/Personal/camp-404`
**Harvest date:** 2026-09-08. All paths donor-relative unless prefixed `camp-404/`.

---

## 1. Purpose of this subsystem

The donor's answer to *"someone says the app is broken — where do you look?"*.

It is **one page** (`/system` in `apps/org`) plus **two supporting layers**:

1. A **pure deriver** (`apps/org/lib/system-status.ts`, 746 lines) that takes an env bag
   and a database-probe result and returns a report of 18 named checks with a tone, a
   value, a human explanation of *why*, and the env var **names** (never values) that
   decide it.
2. A **server probe** (`apps/org/lib/system-probe.ts`, 94 lines) that does the one thing
   a config read cannot: a **real, timed database round trip**, plus a second read that
   answers "has this database ever been seeded?".

Around that sit the deploy/ops surfaces the panel reports on: the **deploy-time migration
planner** (`packages/db/src/migration-plan.ts` — the *same function the build calls*), the
**advisory-locked migration runner** (`packages/db/src/migrate.ts`), the shared **response
security headers** (`config/security-headers.mjs`), the **local Postgres + two Neon proxies**
compose stack (`docker-compose.local.yml`), the graceful **"not configured" boot** banners in
all three apps, a **34-file `loading.tsx` skeleton layer** with a shared kit, a **3-tier error
boundary** per app, and a **secret-token cron route** (`/api/account/deletion-sweep`).

The design rules the donor states for this subsystem, verbatim from
`apps/org/lib/system-status.ts:12-31`, are the reusable part:

> **THREE RULES, in order of how badly they would hurt if broken:**
> 1. **NEVER PRINT A SECRET.** … The one deliberate exception is a database HOSTNAME…
> 2. **DERIVE, DO NOT DUPLICATE.** … the migration verdict comes from `@quagga/db`'s
>    `planMigration`, the same function the build calls. A page that reported its own second
>    opinion of the config would be worse than no page, because it would be believed.
>    **If this file ever computes a policy itself, that is the bug.**
> 3. **SAY WHY, NOT JUST WHAT.** "Email verification: off" invites someone to go turn it on
>    and find no switch. "Off — impossible without an email sender; it switches on the moment
>    RESEND_API_KEY exists" ends the investigation.

**Why it matters to Camp 404.** Camp 404 has a bootstrap wizard (`apps/web/lib/bootstrap.ts`,
`/setup`) and a boot-time env assertion (`apps/web/lib/env.ts:assertServerEnv` +
`instrumentation.ts`) that **fails the process** on a missing/short `PGCRYPTO_KEY`. It has
`/api/health`. What it does *not* have is anything that answers "is this deployment healthy,
and which of the 20-odd optional integrations are silently off?" — and Camp 404 has *a lot* of
optionally-configured integrations that degrade invisibly: Firebase/VAPID push (inert until
four env vars are set, `DEFERRED.md:80-85`), Telegram (deliberately dormant), Anthropic/Groq
(feedback AI + voice), Vercel Blob, five crons of which three are stubs, `INVITE_CODES`
bootstrap values the operator is told to replace. Every one of those is an "honest in its own
corner" state exactly as the donor describes. This unit is the missing panel that puts them on
one page. It is also, per WP7 (#131), the donor's `loading.tsx` + error-boundary layer that
Camp 404 has zero of across 24 `force-dynamic` pages.

---

## 2. File inventory (with line counts)

### Core of the unit

| Path | Lines | What |
|---|---|---|
| `apps/org/lib/system-status.ts` | **746** | The pure deriver. 18 checks, `redactSecrets`, `humanDuration`, `deriveSystemStatus`. No `server-only`, no `process.env`, no DB. |
| `apps/org/lib/system-probe.ts` | **94** | Server half. `probeDatabase()` (timed `select 1` + active-edition read) and `getSystemStatus()`. Never throws. |
| `apps/org/components/system/check-list.tsx` | **107** | `CheckRow` + `CheckListCard`. Server components, a `<dl>` not a table, tone→badge map, sr-only tone prefix. |
| `apps/org/app/(console)/system/page.tsx` | **394** | The panel. Gate, headline banner, two check cards, org-access roster, roles link, audit link. |
| `apps/org/app/(console)/system/loading.tsx` | **43** | Skeleton matching the panel's real shape (`[6, 5]` rows per card). |
| `apps/org/app/(console)/system/roles/page.tsx` | **151** | Roles/departments sub-surface inside the panel (org-tier — see §9). |

### Deploy / migration ops

| Path | Lines | What |
|---|---|---|
| `packages/db/src/migration-plan.ts` | **124** | **Pure**: `connectionHost`, `isPoolerConnection`, `planMigration`, `MigrationPlan`, `MigrationEnv`. Split out of `migrate.ts` *specifically so the console can read it*. |
| `packages/db/src/migrate.ts` | **280** | The advisory-locked deploy runner. Re-exports the planners. Bootstrap-or-repair seeding. |
| `packages/db/src/local-proxy.ts` | **36** | `configureLocalProxy()` — one shared definition for `index.ts` and `migrate.ts`. |
| `packages/db/src/index.ts` | 160+ | `createHttpDb` / `createPooledDb`, `BUILD_PLACEHOLDER_URL`, opt-in `sqlLogger()` behind `QUAGGA_SQL_LOG=1`, local read-pool. |
| `packages/db/src/__tests__/migrate.test.ts` | **150** | 15 cases over `isPoolerConnection` / `connectionHost` / `planMigration`, incl. a named regression. |
| `docker-compose.local.yml` | **67** | Postgres 16 + wsproxy + http proxy. Health-checked. |
| `docs/deploy.md` | **234** | First-deployment runbook. |
| `.github/workflows/neon-pr-cleanup.yml` | 60+ | Deletes the preview Neon branch on PR close. |
| `scripts/e2e-local.sh` | **245** | Cold-start local stack: compose up, reset, migrate, seed, god bootstrap, port-reclaim, readiness poll, `.next/dev` deletion. |

### "Not configured" / env-less boot

| Path | Lines | What |
|---|---|---|
| `apps/web/lib/config.ts` | **30** | `isAuthConfigured`, `isDatabaseConfigured`, `isFullyConfigured`, `missingConfig`. |
| `apps/org/lib/config.ts` | **32** | Same minus `isFullyConfigured`, plus `participantAppUrl()`. |
| `apps/suppliers/lib/config.ts` | **36** | Same as org (different comment + `participantAppUrl` doc). |
| `apps/web/components/not-configured-banner.tsx` | **30** | The banner. |
| `apps/org/components/not-configured-banner.tsx` | **31** | Near-twin — differs only in one prose sentence. |
| `apps/suppliers/components/not-configured-banner.tsx` | **31** | Near-twin — differs in two prose sentences (verified by `diff`). |
| `apps/org/components/gate-screen.tsx` | **126** | Full-screen gate; embeds the same "Preview mode" card inline. |

### Response headers / boundaries / diagnostics

| Path | Lines | What |
|---|---|---|
| `config/security-headers.mjs` | **40** | `SECURITY_HEADERS` (6 headers) + `securityHeaders()`. Imported by all three `next.config.ts`. |
| `packages/ui/src/components/skeleton.tsx` | **204** | 8 exported skeleton primitives + `SkeletonRegion` live region + `data-loading` hook. |
| `apps/org/components/console-skeleton.tsx` | **76** | `ConsoleHeadingSkeleton`, `ConsoleTableSkeleton`. |
| `apps/*/app/**/loading.tsx` | 34 files | web 17, org 12, suppliers 5. |
| `apps/*/app/error.tsx`, `(group)/error.tsx`, `global-error.tsx`, `not-found.tsx` | 14 files | 3-tier boundary per app. |
| `packages/ui/src/lib/client-errors.ts` | **194** | In-memory recent-error ring buffer + `collectEnvironment()` device facts. |
| `packages/ui/src/components/client-error-capture.tsx` | **20** | Mounts the buffer in the root layout. Renders null. |

### Cron / scheduled ops

| Path | Lines | What |
|---|---|---|
| `apps/web/app/api/account/deletion-sweep/route.ts` | **149** | Bearer-token GET/POST sweeper. Timing-safe compare. 500 on partial failure. |
| `apps/web/vercel.json` | **9** | Exactly one cron: `/api/account/deletion-sweep` at `0 3 * * *`. |
| `apps/web/app/api/notifications/digest/route.ts` | **36** | Self-declared **design stub** returning `{ok:true, job:"notifications.digest", status:"stub", scheduled:false}`. |

### Tests

| Path | Lines | What |
|---|---|---|
| `apps/org/lib/__tests__/system-status.test.ts` | **368** | 6 describes, ~20 cases. Leads with "no secret is ever printed". |
| `packages/db/src/__tests__/migrate.test.ts` | **150** | Migration planner. |
| `e2e/specs/org-staff/system-panel.spec.ts` | **227** | 5 browser tests: rank access inversion, honest refusal, no PII on the panel. |
| `packages/ui/src/components/__tests__/skeleton.test.tsx` | — | `:52` "exposes data-loading so a browser test can prove a boundary appeared". |

---

## 3. Capability list (exhaustive, each cited)

### 3.1 The System panel itself

| # | Capability | Citation |
|---|---|---|
| C1 | Renders **8 health checks** in fixed order: `database`, `migrations`, `reference-data`, `auth-secret`, `email`, `blob`, `encryption-key`, `deployment` | `system-status.ts:708-717` |
| C2 | Renders **10 security checks** in fixed order: `email-verification`, `god-emails`, `rate-limit`, `session`, `two-factor`, `passkeys`, `sso`, `secure-cookies`, `google`, `password-policy` | `system-status.ts:718-729` |
| C3 | A **headline** line naming the worst thing on the page, in `attention` > `degraded` > `ok` order | `system-status.ts:694-699`, `:731-743` |
| C4 | Headline **names** the offending checks rather than counting them ("Needs attention: auth signing secret, …") | `system-status.ts:736-743` |
| C5 | **Live timed DB round trip**, latency reported in ms | `system-probe.ts:62-66`; rendered `system-status.ts:217` `Connected · ${probe.latencyMs} ms` |
| C6 | **5-second probe timeout**, per operation, with a labelled rejection message | `system-probe.ts:28` `PROBE_TIMEOUT_MS = 5_000`; `:30-53` `withTimeout` |
| C7 | **Never throws** — a failed probe becomes a rendered `unreachable`, never an error boundary | `system-probe.ts:22-25`, `:76-87` |
| C8 | Distinguishes **three** database states: `not_configured` / `ok` / `unreachable` | `system-status.ts:105-113` |
| C9 | Separately reports **"migrated but never seeded"** — a real, distinct state that otherwise reads as a missing env var | `system-probe.ts:67-69`; `system-status.ts:285-317` |
| C10 | Renders the **exact sentence the build would fail with** when `planMigration` throws | `system-status.ts:234-250` |
| C11 | Reports which connection the migrator **would** use, parsed to a hostname | `system-status.ts:262-282` |
| C12 | **Never prints a secret**; reports set/unset plus consequence | `system-status.ts:14-22`, test `system-status.test.ts:66-127` |
| C13 | The **one deliberate exception**: the DB hostname, parsed via `connectionHost` so a password cannot ride along | `system-status.ts:178-181`; asserted `system-status.test.ts:119-126` |
| C14 | `GOD_EMAILS` reported as a **count**, never as addresses ("2 addresses configured") | `system-status.ts:502-530`; asserted `system-status.test.ts:112-117` |
| C15 | `PGCRYPTO_KEY` **length** is reported (safe) when it is under 16 chars; the key never is | `system-status.ts:415-423` |
| C16 | Two-pass **`redactSecrets`** backstop over any text from outside (driver errors quote connection strings) | `system-status.ts:148-160` |
| C17 | Four **tones** with distinct meanings — `degraded` ("working as designed") is deliberately not `attention` | `system-status.ts:61-70`; badge map `check-list.tsx:32-40` |
| C18 | Only `attention` renders amber; "deliberately unconfigured" is muted so the page is not permanently warning | `check-list.tsx:23-31` |
| C19 | Screen-reader tone prefix so the badge is not colour-only (`"Healthy:"`, `"Not configured:"`, `"Needs attention:"`, `"For information:"`) | `check-list.tsx:42-48`, `:59` |
| C20 | Each check lists the **env var NAMES** that decide it, in a monospace strip | `check-list.tsx:68-74`; `SystemCheck.env` at `system-status.ts:91-92` |
| C21 | Rendered as a **definition list** (`<dl>/<dt>/<dd>`) not a table, because the sentence is the payload | `check-list.tsx:12-18`, `:98-102` |
| C22 | Every sub-read on the page **degrades independently** — roster, assignable roles, roles overview each `.catch(() => null/[])` | `system/page.tsx:131-149` |
| C23 | **Sole-System-manager warning** rendered as a count, never a name | `system/page.tsx:255-273` |
| C24 | "Accounts with console access and **no role at all**" surfaced (a half-finished grant nobody would go looking for) | `system/page.tsx:183-187`, `:335-346` |
| C25 | Refusal for the wrong rank is an **explained page**, not a `notFound()` | `system/page.tsx:88-118` |
| C26 | The refusal sentence comes from the **same resolver the guard uses** (`runsDeploymentRefusal()`), so page and guard cannot drift | `system/page.tsx:106`; `packages/core/src/org-permissions.ts:676-678` |
| C27 | A shape-matching **loading skeleton** (2 cards, 6 and 5 rows) | `system/loading.tsx:17-39` |

### 3.2 Derivation-not-duplication (rule 2 in practice)

| # | Capability | Citation |
|---|---|---|
| C28 | Email-verification verdict read from the **auth stack's own resolver** `resolveRequireEmailVerification` | `system-status.ts:463`; resolver `packages/auth/src/env.ts:223-227` |
| C29 | Rate-limit ceiling from `resolveRateLimit` | `system-status.ts:533`; resolver `packages/auth/src/env.ts:141-173` |
| C30 | Session lifetime from `AUTH_SESSION` constants, not literals | `system-status.ts:571-578`; `packages/auth/src/env.ts:56-60` |
| C31 | 2FA / backup-code / passkey availability read from the **capability matrix** `AUTH_CAPABILITIES` the account surfaces gate on | `system-status.ts:586-587`, `:601`; matrix `packages/core/src/auth-capabilities.ts:103-…` |
| C32 | Passkey scope from `resolvePasskeyRpID` | `system-status.ts:602`; `packages/auth/src/env.ts:246-248` |
| C33 | SSO cookie domain from `resolveCookieDomain` | `system-status.ts:624`; `packages/auth/src/env.ts:200-202` |
| C34 | Cookie Secure flag from `resolveUseSecureCookies` | `system-status.ts:640`; `packages/auth/src/env.ts:123-127` |
| C35 | Password policy bounds from `PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_LENGTH` in core | `system-status.ts:685` |
| C36 | Migration verdict from `planMigration` — literally the build's function | `system-status.ts:239`; `packages/db/src/migration-plan.ts:63` |

### 3.3 Deploy / migration ops

| # | Capability | Citation |
|---|---|---|
| C37 | Migrations apply **automatically at deploy**: every app's `build` is `db:migrate:deploy && next build` | `docs/deploy.md:12-14`, `:105-107` |
| C38 | Serialised by a **Postgres session advisory lock** on a dedicated connection, key `42_97_2027` | `migrate.ts:82`, `:150-166` |
| C39 | Acquisition is **blocking but bounded**: `LOCK_TIMEOUT_MS = 120_000`, applied as *both* `lock_timeout` and `statement_timeout`; `statement_timeout` is then lifted to `0` | `migrate.ts:98`, `:156-169` |
| C40 | **Refuses** a pooled/PgBouncer endpoint in any environment (host `-pooler.`, host `pgbouncer`, or `?pgbouncer=true`) | `migration-plan.ts:32-42`, `:90-97` |
| C41 | **Refuses** any Vercel deploy (production *or* preview) without `DATABASE_URL_UNPOOLED` | `migration-plan.ts:109-116` — regression documented at `:98-108` |
| C42 | **Refuses** a `VERCEL_ENV=production` build with no database at all | `migration-plan.ts:73-79` |
| C43 | **Skips and exits 0** with no DB outside production — the env-less-boot law | `migration-plan.ts:80-85`; `migrate.ts:127-130` |
| C44 | `NEON_LOCAL_PROXY=1` exempts the pooler guards (dev proxy reroutes to one backend) | `migration-plan.ts:70`, `:87-89` |
| C45 | **Bootstrap-or-repair seed**: seeds reference data only when `SELECT 1 FROM editions LIMIT 1` returns 0 rows | `migrate.ts:195-197` |
| C46 | Seed runs inside an **explicit BEGIN/COMMIT/ROLLBACK** so a half-seed can never latch the sentinel | `migrate.ts:198-225` |
| C47 | On an already-seeded DB, **insert-if-missing** repair of seeded org departments + roles, never an update | `migrate.ts:226-251` |
| C48 | The runner is idempotent via drizzle's `__drizzle_migrations` and safe to run three times concurrently | `migrate.ts:49-51` |
| C49 | `runDeployMigrations` is exported **only so a test can drive it**; nothing imports it, and the build invokes the module as a script | `migrate.ts:113-123`, `:269-280` |
| C50 | Explicit `pg_advisory_unlock` + `client.release()` + `pool.end()` in `finally` | `migrate.ts:252-266` |
| C51 | `BUILD_PLACEHOLDER_URL` lets `next build` page-data collection run with no DB secret; any real query fails loudly | `packages/db/src/index.ts` (`postgres://build:build@localhost:5432/build?sslmode=disable`) |
| C52 | Opt-in per-statement SQL logging behind `QUAGGA_SQL_LOG=1`, greppable prefix `[sql]`, truncated to 160 chars | `packages/db/src/index.ts` `sqlLogger()` |
| C53 | Preview Neon branches auto-deleted on PR close via `pull_request_target` + Neon REST API | `.github/workflows/neon-pr-cleanup.yml:46-60` |

### 3.4 Graceful degradation / env-less boot

| # | Capability | Citation |
|---|---|---|
| C54 | **All three apps must boot env-less** to a "not configured" state — a stated hard rule | `apps/web/lib/config.ts:1-3`; `docs/deploy.md:11` |
| C55 | `missingConfig()` returns human strings `"Better Auth (sign-in)"` / `"Neon Postgres (database)"` | `apps/web/lib/config.ts:25-29` |
| C56 | `NotConfiguredBanner` returns `null` when nothing is missing — no permanent chrome | `apps/web/components/not-configured-banner.tsx:10-11` |
| C57 | Banner mounted on **14 surfaces** across the three apps (landing, all `/auth/*`, all `(account)/*`) | grep: `apps/*/app/**` — 16 import/use pairs |
| C58 | `participantAppUrl()` falls back to `http://localhost:3000` so the button works env-less | `apps/org/lib/config.ts:22-24` |
| C59 | Missing service ⇒ honest fallback, never a crash: no Resend ⇒ log-only send with `delivered:false`; no blob token ⇒ **501** with paste-a-link advice; no `PGCRYPTO_KEY` ⇒ saving an ID **throws** rather than storing plaintext | `system-status.ts:338-341`, `:365-366`, `:408-410` |
| C60 | The org gate distinguishes **"no roles yet"** from **"roles that carry no `read`"**, because the header lists the held roles by name and the two screens contradicted each other | `apps/org/lib/gate.tsx:62-79`, `:104-120` |
| C61 | The **god-bootstrap dead end** is stated on the gate: address is configured but unverified, and on a provider-less deployment the verification mail can never arrive — with the Google-sign-in workaround named | `apps/org/components/gate-screen.tsx:46-61` |

### 3.5 Response security headers

| # | Capability | Citation |
|---|---|---|
| C62 | Six headers on **every route** of every app | `config/security-headers.mjs:15-35`, `:38-40` |
| C63 | Clickjacking closed twice — `Content-Security-Policy: frame-ancestors 'none'` **and** `X-Frame-Options: DENY` | `security-headers.mjs:18-19` |
| C64 | `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`; `Strict-Transport-Security: max-age=63072000; includeSubDomains` | `security-headers.mjs:21-34` |
| C65 | Deliberately **not** a full CSP — the reasoning is written down | `security-headers.mjs:7-12` |
| C66 | Wired identically in all three `next.config.ts` as `headers: securityHeaders` | `apps/{web,org,suppliers}/next.config.ts:16` / `:21` |

### 3.6 Loading + error boundary layer

| # | Capability | Citation |
|---|---|---|
| C67 | 8 skeleton primitives: `Skeleton`, `SkeletonRegion`, `SkeletonText`, `SkeletonHeading`, `SkeletonCard`, `SkeletonRow`, `SkeletonCardGrid`, `SkeletonField`, `SkeletonForm` | `packages/ui/src/components/skeleton.tsx:31,47,68,92,111,132,153,172,182` |
| C68 | `SkeletonRegion` owns **one** polite live region per boundary, `aria-busy="true"`, `sr-only` label default `"Loading…"` | `skeleton.tsx:47-65` |
| C69 | Individual blocks are `aria-hidden` — decorative, not announced one per bar | `skeleton.tsx:33` |
| C70 | `data-loading="true"` exists specifically so a browser test can prove the boundary rendered | `skeleton.tsx:41-46`, `:57` |
| C71 | Stated rule: a boundary must show the **destination's shape**, composed with the *same container classes* the page uses, so the swap is a fill and not a reflow | `skeleton.tsx:8-13`; `console-skeleton.tsx:5-9` |
| C72 | Three-tier error boundary per app: `(group)/error.tsx` (keeps chrome), `app/error.tsx` (root layout errors), `app/global-error.tsx` (renders its own `<html>/<body>` + imports the stylesheet) | `apps/org/app/(console)/error.tsx:8-11`; `apps/org/app/error.tsx:7-12`; `apps/org/app/global-error.tsx:8-12`, `:26-27` |
| C73 | Every boundary shows `error.digest` as `Reference: …` when present | `(console)/error.tsx:38-42`; `error.tsx:42-46`; `global-error.tsx:43-47` |
| C74 | Every boundary `console.error`s the real error in a `useEffect` while the UI stays reassuring | `error.tsx:21-24` |

### 3.7 Client-side diagnostics buffer

| # | Capability | Citation |
|---|---|---|
| C75 | Captures `window.error`, `unhandledrejection`, **and** `console.error` (React reports render/hydration failures only there) | `packages/ui/src/lib/client-errors.ts:88-124` |
| C76 | `console.error` passes through **first and unconditionally**, then records inside a try/catch — capturing must never itself throw | `client-errors.ts:105-123` |
| C77 | In-memory ring buffer, oldest dropped, **never persisted, never transmitted** unless someone submits a report | `client-errors.ts:7-12`, `:57-60` |
| C78 | Records `window.location.pathname` only — **never** query string or hash (tokens, invite codes, search terms) | `client-errors.ts:51-55` |
| C79 | Idempotent install returning a teardown | `client-errors.ts:84-86`, `:126-132` |
| C80 | `collectEnvironment()` returns **device** facts only, never person: App version, Build env, User agent, Locale, Online, Viewport (`w×h @ dprx`), Screen, Path, Timezone | `client-errors.ts:144-187` |
| C81 | Mounted in the **root layout, above everything**, because the errors worth having precede the person noticing | `client-error-capture.tsx:7-16` |

### 3.8 Scheduled/cron ops

| # | Capability | Citation |
|---|---|---|
| C82 | Sweeper refuses to exist as an unauthenticated destructive endpoint: with `ACCOUNT_SWEEP_SECRET` unset it returns 503 (POST) / a truthful `enabled:false` status (GET) and erases nothing | `deletion-sweep/route.ts:110-113`, `:129-138` |
| C83 | **Timing-safe** bearer compare with an explicit length pre-check | `deletion-sweep/route.ts:41-48` |
| C84 | Accepts **either** `ACCOUNT_SWEEP_SECRET` or the `CRON_SECRET` Vercel injects, because Vercel Cron can only GET | `deletion-sweep/route.ts:50-59`, `:24-31` |
| C85 | An unauthenticated GET is a **status probe** — enabled/disabled and the invocation method — and never sweeps | `deletion-sweep/route.ts:142-148` |
| C86 | **A failed erasure is not a successful run**: each failure logged, and HTTP **500** returned, so the scheduler's alerting sees it | `deletion-sweep/route.ts:74-99` |
| C87 | No database ⇒ **503** `{status:"no_database"}` | `deletion-sweep/route.ts:63-68` |
| C88 | "Why a route and not a build step or boot hook" is written down: the most destructive operation must be triggered deliberately | `deletion-sweep/route.ts:12-15` |
| C89 | A **self-declaring stub** route pattern: returns 200 with `status:"stub"`, `scheduled:false` and a message explaining what would wire it | `notifications/digest/route.ts:27-35` |

### 3.9 Local-stack ops

| # | Capability | Citation |
|---|---|---|
| C90 | Three containers because `@neondatabase/serverless` speaks two protocols and no single proxy implements both | `docker-compose.local.yml:5-11` |
| C91 | Postgres `healthcheck` `pg_isready -U postgres -d quagga`, `interval 3s / timeout 3s / retries 20`; both proxies `depends_on: condition: service_healthy` | `docker-compose.local.yml:32-36`, `:44-46`, `:57-59` |
| C92 | `configureLocalProxy()` uses **fixed localhost endpoints**, deliberately independent of the DB host in `DATABASE_URL` (two different resolvers) | `local-proxy.ts:6-14`, `:26-36` |
| C93 | Port defaults `NEON_LOCAL_WS_PORT=5433`, `NEON_LOCAL_HTTP_PORT=4444`, host `localhost` | `local-proxy.ts:28-30` |
| C94 | E2E script **reclaims the ports by pid** and refuses to run if one will not free — because `pkill -f "next dev"` misses the renamed `next-server` process and the suite silently tested a stale server | `scripts/e2e-local.sh:111-142` |
| C95 | **Readiness poll that can fail**: 60×2s per port, dumps 30 log lines and exits 1 | `e2e-local.sh:191-210` |
| C96 | Greps the dev log for `module not found` and refuses to trust a green run | `e2e-local.sh:212-216` |
| C97 | `rm -rf apps/*/.next/cache apps/*/.next/dev` before a dev-mode run — the 5.7 GB / 4.6 GB / ~550 GB incident | `e2e-local.sh:170-186`; the matching `!.next/dev/**` turbo exclusion at `turbo.json:22-46` |
| C98 | Resets **both** `public` and `drizzle` schemas, because dropping only `public` leaves the migration tracker and the migrator then reports "up to date" against an empty DB | `e2e-local.sh:62-70` |
| C99 | Builds `--concurrency=1` — three simultaneous `next build`s OOM'd a 32 GB machine | `e2e-local.sh:148-157` |

---

## 4. Data model

**This unit owns no tables.** That is its most portable property: the whole panel is derived
from `process.env` plus two reads.

Tables it **reads**:

| Table | Column(s) read | Where |
|---|---|---|
| `editions` | `id`, `name`, `year`, `startDate`, `endDate`, `isActive` | `apps/org/lib/queries.ts:119-134` `getActiveEdition()` — `where isActive = true`, `order by year desc`, `limit 1` |
| `editions` | existence only (`SELECT 1 FROM editions LIMIT 1`) | `migrate.ts:195` — the seed sentinel |
| — | `select 1` | `system-probe.ts:65` — the liveness probe |
| `drizzle.__drizzle_migrations` | implicitly, via drizzle's migrator | `migrate.ts:49-51`, `:177` |

Adjacent tables owned by neighbouring units that this panel *links to* rather than reads:
`audit_events` (the `/audit` link, `system/page.tsx:384`), `org_departments` / `org_roles` /
`org_role_assignments` (counts only, via `getOrgRolesOverview`, `system/page.tsx:146`).

**Rate-limit counters** live in the database rather than in memory, "so they are shared across
serverless instances — in-memory storage would be per-instance and effectively no limit at
all" (`system-status.ts:539-541`). Constants: `FORGOT_PASSWORD_MAX_PER_WINDOW = 3`,
`FORGOT_PASSWORD_WINDOW_SECONDS = 15 * 60` (`packages/db/src/rate-limit.ts:46-47`).

### Enums / literal unions this unit defines

```ts
// apps/org/lib/system-status.ts:70
export type CheckTone = "ok" | "degraded" | "attention" | "info";

// apps/org/lib/system-status.ts:105-113
export type DatabaseProbe =
  | { kind: "not_configured" }
  | { kind: "ok"; latencyMs: number; edition: { name: string; year: number } | null }
  | { kind: "unreachable"; message: string };

// packages/db/src/migration-plan.ts:51-53
export type MigrationPlan =
  | { kind: "skip"; reason: string }
  | { kind: "run"; connectionString: string; usingUnpooled: boolean };
```

Check ids, verbatim and complete (18):
`database`, `migrations`, `reference-data`, `auth-secret`, `email`, `blob`, `encryption-key`,
`deployment` (health); `email-verification`, `god-emails`, `rate-limit`, `session`,
`two-factor`, `passkeys`, `sso`, `secure-cookies`, `google`, `password-policy` (security).

Secret env var list, verbatim (`system-status.ts:123-133`):
```ts
const SECRET_ENV_VARS = [
  "BETTER_AUTH_SECRET", "DATABASE_URL", "DATABASE_URL_UNPOOLED",
  "RESEND_API_KEY", "BLOB_READ_WRITE_TOKEN", "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET", "PGCRYPTO_KEY", "GOD_EMAILS",
] as const;
```

Env vars read by the panel (names only — the panel never reads a value to display it):
`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`,
`PGCRYPTO_KEY`, `GOD_EMAILS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`AUTH_RATE_LIMIT_MAX`, `AUTH_RATE_LIMIT_WINDOW_SECONDS`, `VERCEL_ENV`, `NODE_ENV`,
`VERCEL`, `VERCEL_URL`, `NEON_LOCAL_PROXY`.

Ops env vars elsewhere in the unit: `ACCOUNT_SWEEP_SECRET`, `CRON_SECRET`,
`NEXT_PUBLIC_PARTICIPANT_APP_URL`, `NEXT_PUBLIC_APP_URL`, `QUAGGA_SQL_LOG`,
`NEON_LOCAL_PROXY_HOST`, `NEON_LOCAL_WS_PORT`, `NEON_LOCAL_HTTP_PORT`,
`NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_VERCEL_ENV`.

> **Note:** `.env.example` in the donor repo could not be read in this session — the tool
> harness applies a global deny rule to any path matching `.env.example`. The prior harvest
> recorded that it declares two dead vars (`NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`),
> contradicts the migration rule at `:12-13`, and covers only 6 of turbo's 15 `globalEnv`
> entries. `turbo.json:5-20` was read directly and lists exactly: `NODE_ENV`, `DATABASE_URL`,
> `DATABASE_URL_UNPOOLED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
> `BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION`, `AUTH_RATE_LIMIT_WINDOW_SECONDS`,
> `AUTH_RATE_LIMIT_MAX`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`,
> `GOD_EMAILS`, `BLOB_READ_WRITE_TOKEN`, `PGCRYPTO_KEY`, `NEON_LOCAL_PROXY` — **15 entries**,
> and `ACCOUNT_SWEEP_SECRET` / `CRON_SECRET` / `NEXT_PUBLIC_*` are indeed absent, confirming
> the recorded gap from a second angle.

---

## 5. Public API surface (verbatim signatures)

### `apps/org/lib/system-status.ts`

```ts
export type CheckTone = "ok" | "degraded" | "attention" | "info";
export type SystemEnv = Readonly<Record<string, string | undefined>>;

export interface SystemCheck {
  id: string;
  label: string;
  /** The state, short enough for a badge. NEVER a secret value. */
  value: string;
  tone: CheckTone;
  /** Why it is in that state, and what follows from it. */
  detail: string;
  /** The env var NAMES that decide it. Names only — never their values. */
  env?: readonly string[];
}

export interface SystemStatus {
  health: SystemCheck[];
  security: SystemCheck[];
  headline: { tone: CheckTone; summary: string };
}

export type DatabaseProbe =
  | { kind: "not_configured" }
  | { kind: "ok"; latencyMs: number; edition: { name: string; year: number } | null }
  | { kind: "unreachable"; message: string };

export function redactSecrets(text: string, env: SystemEnv): string;
export function humanDuration(seconds: number): string;
export function deriveSystemStatus(env: SystemEnv, probe: DatabaseProbe): SystemStatus;
```

Internal (module-private) check builders, all `(env: SystemEnv) => SystemCheck` unless noted:
`databaseCheck(env, probe)`, `migrationCheck(env)`, `referenceDataCheck(probe)`,
`emailCheck`, `blobCheck`, `authSecretCheck`, `encryptionCheck`, `deploymentCheck`,
`emailVerificationCheck`, `godBootstrapCheck`, `rateLimitCheck`, `sessionCheck()`,
`secondFactorCheck()`, `passkeyCheck`, `ssoCheck`, `cookieSecurityCheck`, `googleCheck`,
`passwordPolicyCheck()`, `worstTone(checks)`, `hostOf(connectionString)`.

### `apps/org/lib/system-probe.ts`

```ts
const PROBE_TIMEOUT_MS = 5_000;
async function withTimeout<T>(work: Promise<T>, label: string): Promise<T>;
export async function probeDatabase(): Promise<DatabaseProbe>;
export async function getSystemStatus(): Promise<SystemStatus>;
```

### `apps/org/components/system/check-list.tsx`

```ts
export function CheckRow({ check }: { check: SystemCheck }): JSX.Element;
export function CheckListCard({
  title, description, checks, footer,
}: {
  title: string;
  description: string;
  checks: SystemCheck[];
  footer?: ReactNode;
}): JSX.Element;
```

### `packages/db/src/migration-plan.ts` (re-exported from `packages/db/src/migrate.ts` and `packages/db/src/index.ts`)

```ts
export function connectionHost(connectionString: string): string | null;
export function isPoolerConnection(connectionString: string): boolean;
export type MigrationEnv = Readonly<Record<string, string | undefined>>;
export type MigrationPlan =
  | { kind: "skip"; reason: string }
  | { kind: "run"; connectionString: string; usingUnpooled: boolean };
export function planMigration(env: MigrationEnv = process.env): MigrationPlan;
```

### `packages/db/src/migrate.ts`

```ts
const MIGRATION_ADVISORY_LOCK_KEY = 42_97_2027;
const LOCK_TIMEOUT_MS = 120_000;
export async function runDeployMigrations(): Promise<void>;
export { connectionHost, isPoolerConnection, planMigration, type MigrationPlan } from "./migration-plan";
```

### `packages/db/src/local-proxy.ts`

```ts
export function configureLocalProxy(): void;
```

### `apps/{web,org,suppliers}/lib/config.ts`

```ts
export function isAuthConfigured(): boolean;      // Boolean(process.env.BETTER_AUTH_SECRET)
export function isDatabaseConfigured(): boolean;  // Boolean(process.env.DATABASE_URL)
export function isFullyConfigured(): boolean;     // web only
export function participantAppUrl(): string;      // org + suppliers only
export function missingConfig(): string[];
```

### `config/security-headers.mjs`

```js
export const SECURITY_HEADERS = [{ key, value }, …];  // 6 entries
export async function securityHeaders();              // [{ source: "/:path*", headers: SECURITY_HEADERS }]
```

### `packages/ui/src/components/skeleton.tsx`

```ts
export type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;
export function Skeleton({ className, ...props }: SkeletonProps);
export function SkeletonRegion({ className, children, label = "Loading…", ...props }: SkeletonProps & { label?: string });
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string });
export function SkeletonHeading({ eyebrow = true, description = true, className }: {...});
export function SkeletonCard({ lines = 3, className }: {...});
export function SkeletonRow({ columns = 3, className }: {...});
export function SkeletonCardGrid({ cards = 6, lines = 2, className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" }: {...});
export function SkeletonField({ className }: { className?: string });
export function SkeletonForm({ fields = 4, className }: {...});
```

### `packages/ui/src/lib/client-errors.ts`

```ts
export function installClientErrorCapture(): () => void;
export function recentClientErrors(): ReportErrorLog[];
export function clearClientErrors(): void;
export function collectEnvironment(extra: EnvField[] = []): EnvField[];
```

### `packages/core` predicates this unit gates on (org-tier — see §9)

```ts
export function runsDeployment(actor: OrgActor | null | undefined): boolean;   // rank === "engineer" || "god"
export function runsDeploymentRefusal(): string;
export function isSystemManager(actor: OrgActor | null | undefined): boolean;  // rank === "god"
export function systemManagerRefusal(what: string): string;
export function parseGodEmails(raw: string | undefined | null): string[];
export function isGodEmailIn(email: string | null | undefined, godEmails: readonly string[]): boolean;
export function canBootstrapGod(email: string | null | undefined, emailVerified: boolean, godEmails: readonly string[]): boolean;
```

### `packages/auth/src/env.ts` — the resolvers the panel *derives from* (provider-coupled, but the pattern is portable)

```ts
export const AUTH_APEX_DOMAIN = "quagga.ryanjnoble.dev";
export const AUTH_SESSION = {
  expiresInSeconds: 60 * 60 * 24 * 7,   // 7 days
  updateAgeSeconds: 60 * 60 * 24,       // refreshed once a day
  cookieCacheMaxAgeSeconds: 300,        // 5 minutes
} as const;
export const AUTH_RP_NAME = "AfrikaBurn Contributors";
export const AUTH_COOKIE_DOMAIN = `.${AUTH_APEX_DOMAIN}`;
export const PRODUCTION_ORIGINS: readonly string[];

export function isAuthConfigured(env: AuthEnv): boolean;
export function isEmailProviderConfigured(env: AuthEnv): boolean;
export function resolveBaseURL(env: AuthEnv): string | undefined;
export function resolveUseSecureCookies(env: AuthEnv): boolean | undefined;
export function resolveRateLimit(env: AuthEnv): { window?: number; max?: number; customRules?: Record<string, { window: number; max: number }> };
export function isUnderApex(env: AuthEnv): boolean;
export function resolveCookieDomain(env: AuthEnv): string | undefined;
export function parseBoolEnv(raw: string | undefined): boolean | undefined;
export function resolveRequireEmailVerification(env: AuthEnv): boolean;
export function isGoogleConfigured(env: AuthEnv): boolean;
export function resolvePasskeyRpID(env: AuthEnv): string | undefined;
export function resolvePasskeyOrigins(env: AuthEnv): string[] | undefined;
export function resolveTrustedOrigins(env: AuthEnv): string[];
export function authConfigWarnings(env: AuthEnv): string[];
```

`authConfigWarnings` is a **second, boot-time** shape of the same idea: loud `console.warn`
lines emitted at auth construction so a secretless build says so plainly. Four warnings:
missing `BETTER_AUTH_SECRET`, no email provider, explicit verification override, and
production not under the apex (`packages/auth/src/env.ts:288-330`).

---

## 6. UX behaviours

**Page composition** (`system/page.tsx:189-392`), top to bottom:

1. `PageHeading` — eyebrow `"Console / System"`, title `"System management"`, description
   `"How this deployment is configured, whether its services are answering, and who holds
   access to this console. Read-only except for access management."` (`:191-195`)
2. **Headline banner.** Amber (`border-warning/40 bg-warning/10`) with a `TriangleAlert` when
   tone is `attention`; otherwise neutral (`border-border bg-secondary/40`) with a
   `ShieldAlert`. (`:199-218`)
3. `CheckListCard "System health"` — description: *"Probed while this page rendered — not read
   back off the configuration. A variable being set and the service answering are different
   claims."* (`:220-224`)
4. `CheckListCard "Security controls"` — description: *"What the auth stack is actually
   enforcing right now. Every value is derived from the same resolvers the running
   configuration uses, so this cannot report a rule the stack is not applying."* (`:226-230`)
5. **Org access** card — roster table, or one of three degraded texts (`:242-253`), plus the
   sole-System-manager warning (`:261-273`), plus a pointer to `/accounts` (`:294-303`).
6. **Roles and departments** card with counts and a `secondary` button whose label switches on
   `canManage`: `"Manage roles and departments"` vs `"Read the roles model"` (`:350-357`).
7. **Audit trail** card with `"Open the audit log"` → `/audit` (`:383-387`).

**Row layout** (`check-list.tsx:52-77`): flex column on mobile, `sm:flex-row sm:gap-6` above;
`<dt>` fixed at `sm:w-56` with the label then a badge; `<dd>` flex-1 with the sentence and the
mono env-name strip at `text-[11px] uppercase tracking-wide text-muted-foreground/70`.
Border between rows via `border-b border-border py-4 last:border-b-0 last:pb-0 first:pt-0`.

**Badge variants** (`check-list.tsx:32-40`): `ok → "success"`, `degraded → "secondary"`,
`attention → "warning"`, `info → "outline"`.

**Voice.** Every `detail` is a full sentence that names the consequence. Examples verbatim:

- database not configured: *"DATABASE_URL is unset, so every data-backed page renders its
  preview shell. That is the intended env-less boot, not a fault…"* (`:195-198`)
- email not configured: *"Every message is written to the server log instead of being sent, and
  the send reports delivered: false rather than failing. Three consequences follow, and they
  are the usual cause of a 'broken' report…"* (`:337-341`)
- blob not configured: *"Every uploader degrades to pasting a link, and the token endpoint
  answers 501 with that advice. Nothing is lost — a file lives somewhere else and the record
  points at it."* (`:363-366`)
- auth secret unset: *"The auth stack is constructed with a known placeholder so the app still
  boots, and any cookie it signs is deliberately worthless. Nobody can sign in until a real
  secret exists."* (`:389-391`)
- reference data missing: *"Nothing has seeded this database, so every edition-scoped page
  falls through to the preview shell and reads like a missing env var when the environment is
  correct."* (`:300-305`)
- session: names the revocation caveat — *"a signed cookie cache answers reads for up to 5
  minutes, so a revoked session can still be honoured for that long"* (`:576-578`)
- password policy: *"Length is the only rule — no character-class requirements, no forced
  rotation. Composition rules push people towards predictable manglings…"* (`:688-690`)

**Headline strings**, verbatim (`system-status.ts:738-743`):
- attention: `` `Needs attention: ${needing.map(c => c.label.toLowerCase()).join(", ")}.` ``
- degraded: `` `Running with ${degraded.map(...).join(", ")} unconfigured — each degrades honestly rather than failing.` ``
- ok: `"Everything this page can check is configured and reachable."`

**Not-configured banner copy** (`apps/web/components/not-configured-banner.tsx:20-26`):
title `"Preview mode — not yet connected"`, body
`"Waiting on: {missing.join(", ")}. Sign-in and saved data are disabled until these are
configured. Everything you see is a working shell."` Org substitutes *"Sign-in and reviewer
tools stay disabled"*; suppliers *"Sign-in and your onboarding tools stay disabled"*.

---

## 7. Validation + edge-case rules (digit-exact)

| Rule | Value / behaviour | Citation |
|---|---|---|
| Probe timeout | **5,000 ms** per operation (`select 1` and the editions read are timed separately) | `system-probe.ts:28`, `:65`, `:70` |
| Latency clock | Started before `getDb()`, stopped after `select 1` only — the edition read is **not** counted | `system-probe.ts:62-70` |
| `redactSecrets` pass 1 | Regex `/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`,)]+/gi` → `"[connection string redacted]"` | `system-status.ts:149-152` |
| `redactSecrets` pass 2 | Per-name `split/join` → `` `[${name} redacted]` ``, **only when `value.length >= 8`** | `system-status.ts:153-158` |
| Short-secret skip rationale | *"replacing a two-letter secret would corrupt ordinary prose without protecting anything real"* | `system-status.ts:145-147`; test with `{ PGCRYPTO_KEY: "ab" }` at `system-status.test.ts:153-158` |
| `humanDuration` units | `[86_400,"day"], [3_600,"hour"], [60,"minute"]`, largest **whole** unit only (`seconds % size === 0`), else seconds; pluralises on `n === 1` | `system-status.ts:163-176`; asserted for 7d/1d/2h/5m/1m/45s/**90s** at `:358-367` |
| `PGCRYPTO_KEY` minimum | **16** characters; `< 16` renders `"Set but too short"` naming the actual length | `system-status.ts:415-423` |
| Advisory lock key | **`42_97_2027`** — must be identical across all three apps and every deploy | `migrate.ts:82` |
| Lock wait bound | **`120_000` ms**, set as *both* `lock_timeout` and `statement_timeout`; `statement_timeout` set to `0` after acquisition | `migrate.ts:98`, `:156-157`, `:169` |
| Pooler detection | `/-pooler\./i` on hostname **OR** `/pgbouncer/i` on hostname **OR** `?pgbouncer=true` | `migration-plan.ts:35-38` |
| `connectionHost` failure | Returns `null` on an unparseable string, never throws | `migration-plan.ts:19-25` |
| `isPoolerConnection` failure | Returns `false` on an unparseable string | `migration-plan.ts:39-41` |
| Deploy detection | `isVercelDeploy = Boolean(env.VERCEL || env.VERCEL_ENV)` — **preview counts** | `migration-plan.ts:69`, `:109` |
| Production detection | `env.VERCEL_ENV === "production"` exactly | `migration-plan.ts:67` |
| Neon-local exemption | `env.NEON_LOCAL_PROXY === "1"` skips **both** guards | `migration-plan.ts:70`, `:89` |
| Seed sentinel | `SELECT 1 FROM editions LIMIT 1` → `rowCount === 0` | `migrate.ts:195-196` |
| Rate-limit resolve | Numbers must be `Number.isFinite && > 0`; `{}` returned when neither is set; window defaults to **60** in `customRules` when only `max` is set | `packages/auth/src/env.ts:146-170` |
| Rate-limit custom rules | Exactly four paths: `/sign-up/email`, `/sign-in/email`, `/forget-password`, `/reset-password` | `packages/auth/src/env.ts:163-168` |
| Rate-limit panel display | `` `${resolved.max ?? "default"} per ${humanDuration(window)}` ``, tone **`attention`** because an override RAISES the ceiling | `system-status.ts:554-564` |
| Session constants | `expiresInSeconds` 604800 (7 days), `updateAgeSeconds` 86400, `cookieCacheMaxAgeSeconds` **300** | `packages/auth/src/env.ts:56-60` |
| Email verification derivation | no provider ⇒ `false`; provider ⇒ `true`; provider + `parseBoolEnv(...) === false` ⇒ `false`. **Can never force ON without a provider.** | `packages/auth/src/env.ts:223-227` |
| `parseBoolEnv` truthy set | `["true","1","on","yes"]`; falsey `["false","0","off","no"]`; anything else `undefined` | `packages/auth/src/env.ts:205-212` |
| `parseGodEmails` | split on `,`, `trim().toLowerCase()`, drop empties | `packages/core/src/god-emails.ts:8-14` |
| God bootstrap | Requires `emailVerified === true` **and** membership of the parsed list | `packages/core/src/god-emails.ts:34-41` |
| Secure-cookie derivation | `undefined` (keep default → secure) when no base URL; `false` only for an explicit `http://` base URL | `packages/auth/src/env.ts:123-127` |
| HSTS | `max-age=63072000; includeSubDomains` (= 2 years) | `security-headers.mjs:33` |
| Client-error buffer caps | `REPORT_LOGS_MAX = 20`, `REPORT_LOG_MESSAGE_MAX = 2_000`, `REPORT_LOG_STACK_MAX = 4_000`, `REPORT_ENV_FIELDS_MAX = 25`, `REPORT_ENV_VALUE_MAX = 500`, `REPORT_DESCRIPTION_MAX = 5_000`; source clamped to 40, label to 60, route to 300 | `packages/core/src/report.ts:52,54,55,63,64,65`; `client-errors.ts:47,54,192-193` |
| Reporter rate limits | 5 reports / hour and 30 transcriptions / hour, per account, enforced in the DB | `docs/deploy.md:150-152` |
| Forgot-password limiter | `FORGOT_PASSWORD_MAX_PER_WINDOW = 3`, `FORGOT_PASSWORD_WINDOW_SECONDS = 15 * 60` | `packages/db/src/rate-limit.ts:46-47` |
| Sweep cron schedule | `0 3 * * *` (03:00 UTC daily), production deployments only | `apps/web/vercel.json:5-7`; `docs/deploy.md:200-204` |
| Sweep grace period | 14 days | `deletion-sweep/route.ts:8` |
| Sweep failure status | HTTP **500** when `failed.length > 0`, else 200 | `deletion-sweep/route.ts:98` |
| Sweep no-DB status | HTTP **503** `{status:"no_database"}` | `deletion-sweep/route.ts:63-67` |
| Sweep disabled status | HTTP **503** on POST; 200 with `enabled:false` on GET | `deletion-sweep/route.ts:112`, `:131-137` |
| E2E readiness | 60 attempts × 2 s = **120 s** per port, then hard fail with 30 log lines | `e2e-local.sh:195-209` |
| E2E port reclaim | 3 attempts: SIGTERM, SIGKILL, then exit 1 | `e2e-local.sh:125-141` |
| Compose healthcheck | `interval: 3s`, `timeout: 3s`, `retries: 20` | `docker-compose.local.yml:34-36` |
| Local proxy ports | ws `5433` → container `80`; http `4444` → `4444`; Postgres `5432` | `docker-compose.local.yml:31,52,64` |
| Local HTTP-proxy penalty | measured **152 ms/statement** vs 2 ms over WebSocket — the reason `NEON_LOCAL_PROXY=1` reroutes even the "HTTP" driver | `packages/db/src/index.ts` (createHttpDb doc block) |
| `.next/dev` growth | **5.7 GB** web, **4.6 GB** org after ONE dev-mode e2e run; ~**550 GB** across a dozen build cycles | `turbo.json:30-38`; `e2e-local.sh:170-186` |

**Edge cases explicitly handled:**

- A DB that is configured but *slow*: `withTimeout` converts a hang into `unreachable` rather
  than letting the render block until the platform kills it — *"a status page that goes down
  with the thing it monitors is worth nothing"* (`system-probe.ts:22-25`, `:31-33`).
- A driver error that **quotes the connection string**: redacted twice, in the probe
  (`system-probe.ts:82-85`) and again in the deriver (`system-status.ts:210`). Tested with the
  literal `` `connect ECONNREFUSED for ${env.DATABASE_URL}` `` at `system-status.test.ts:80-84`.
- `planMigration` **throwing** during a page render: caught and rendered as the check's detail
  (`system-status.ts:237-250`); tested against three throwing env bags at
  `system-status.test.ts:93-110`.
- `probe.kind !== "ok"` for reference data ⇒ tone `info`, value `"Unknown"`, *"Can't be read
  without a working database connection."* — not a false alarm (`system-status.ts:287-293`).
- The roster read failing while the rest of the page works: `.catch(() => null)` and a
  sentence pointing at the database check above (`system/page.tsx:242-246`).
- `roleCounts === null`: no placeholder number — *"Real numbers or none: a placeholder count on
  the page people open when things are already wrong would be worse than the missing card."*
  (`system/page.tsx:173-182`, `:324-328`).

---

## 8. Test coverage

### `apps/org/lib/__tests__/system-status.test.ts` (368 lines)

Structure — six `describe` blocks. The comment at `:12-19` states the philosophy: *"the first
describe block is the one that matters most: NO SECRET IS EVER PRINTED … proved by
construction — seed every secret env var with a marker, render the whole page's worth of
strings, assert no marker survives — rather than by reading the source and believing it."*

1. **`"no secret is ever printed"`** — 5 cases.
   - Marker constant `const SECRET = "zzQUAGGA-SECRET-MARKERzz"` (`:22`).
   - `secretiveEnv()` (`:25-41`) puts the marker in **all nine** secret vars, including inside
     two full Postgres URLs.
   - `renderedStrings()` (`:44-51`) flattens `headline.summary` + every check's `label`,
     `value`, `detail` and `env[]` — i.e. every string the page can render.
   - Cases: fully-populated env; **every probe outcome** including a driver error quoting the
     URL; **every `planMigration`-throwing configuration**; `GOD_EMAILS` as a count
     (`expect(bootstrap.value).toBe("2 addresses configured")`, and `.not.toContain("@")`);
     and the **positive** assertion that the DB host *is* shown while `dbuser` and the marker
     are not (`:119-126` — "asserted so that removing it is a decision rather than an accident").
2. **`"redactSecrets"`** — 4 cases: whole connection string; bare secret with no URL around it;
   ordinary prose untouched; short secret does not mangle prose.
3. **`"health checks read the real configuration"`** — 5 cases: absent vs unreachable DB;
   migrated-but-unseeded ⇒ `attention`; the migration refusal renders the build's sentence
   (`toMatch(/advisory locks/i)`); unpooled ⇒ `ok` / fallback ⇒ `degraded`; short key ⇒
   `"Set but too short"`.
4. **`"security checks explain WHY, not just what"`** — 6 cases including the important
   `off.detail` assertion `toMatch(/derived from provider presence/i)` (*"the whole point:
   someone reading this must not go looking for a switch"*, `:236-237`), the "no provider" vs
   "provider but overridden" fork, the raised rate-limit ceiling (`"500 per 1 minute"`,
   `attention`), the session lifetime read from `AUTH_SESSION` (`"7 days"` — the comment at
   `:273-274` says this "asserts the two cannot drift, not that 7 is 7"), the passkey scope,
   the Secure-flag flag, and empty `GOD_EMAILS`.
5. **`"the headline"`** — 3 cases: names rather than counts; a "degraded on purpose" env; a
   fully-clean env.
6. **`"humanDuration"`** — 1 case, 7 assertions.

### `packages/db/src/__tests__/migrate.test.ts` (150 lines)

Imports from `"../migrate"` (proving the re-export path works). Two fixture strings `DIRECT`
and `POOLED` differing only in the `-pooler` host segment. 15 cases across three describes.
The stand-out is `:94-115`, a named regression with the full incident written into the test:

> *The fallback refusal used to be scoped to `VERCEL_ENV === "production"` … Two builders each
> took a lock that protected nothing, both saw an empty `editions`, and both seeded: **40
> suppliers instead of 20**. The hazard was never specific to production. Only the guard was.*

It loops three env bags (`preview`, `development`, bare `VERCEL: "1"`).

### `e2e/specs/org-staff/system-panel.spec.ts` (227 lines)

Five browser tests. Its header (`:26-34`) carries an **honest scope note** worth stealing
wholesale: it states that this file proves the surface is *reachable/refused* (tier A) and
explicitly does **not** prove the *content* of the checks, naming the unit test that does and
noting both run in the same `turbo run test` gate.

- engineer reaches `/system`; nav entry present; both cards render; email-verification check
  visible; audit link; roles link.
- engineer reads `/system/roles` and is offered **no** mutating control (asserts
  `toHaveCount(0)` for `/add department/i`, `/new role/i`, `/edit rights/i`, `/^rename/i`) and
  **is told why**.
- org_staff refused: absent from nav **and** refused server-side on direct URL; refusal text
  matches `/IT work rather than org work/i`; *"None of the panel's content leaked past the
  refusal"* asserted as `toHaveCount(0)` on both card titles.
- **the engineer's org-access roster carries no email addresses** — scoped to the visible
  layout to dodge the ResponsiveDataTable double-render strict-mode trap (`:181-185`), and
  scoped away from the header which legitimately shows the signed-in user their own address.
- a System manager gets the same page **with** the controls.

### Other

- `packages/ui/src/components/__tests__/skeleton.test.tsx:52` — *"exposes data-loading so a
  browser test can prove a boundary appeared"*.
- CI gate is `pnpm turbo run lint typecheck test build` (`.github/workflows/ci.yml:101-102`) —
  **which starts no browser**; e2e is a separate matrix job per persona, and coverage is a
  third matrix job with **per-workspace floors** and a `git diff`-based in-scope check
  (`ci.yml:373-460`).

---

## 9. Dependency footprint

**`system-status.ts` imports** (`:38-59`):
- `@quagga/auth/env` — `AUTH_SESSION`, `isAuthConfigured`, `isEmailProviderConfigured`,
  `isGoogleConfigured`, `isUnderApex`, `parseBoolEnv`, `resolveBaseURL`, `resolveCookieDomain`,
  `resolvePasskeyRpID`, `resolveRateLimit`, `resolveRequireEmailVerification`,
  `resolveUseSecureCookies`, `AUTH_APEX_DOMAIN` (13 symbols)
- `@quagga/db` — `connectionHost`, `planMigration` (2 symbols, both **pure**)
- `@quagga/core` — `AUTH_CAPABILITIES`, `PASSWORD_MAX_LENGTH`, `PASSWORD_MIN_LENGTH`,
  `parseGodEmails` (4 symbols)

No `server-only`, no React, no `process.env`, no DB client. **Zero npm dependencies.**

**`system-probe.ts` imports:** `server-only`, `drizzle-orm` (`sql`), `@/lib/db` (`getDb`),
`@/lib/queries` (`getActiveEdition`), and the deriver.

**`check-list.tsx` imports:** `react` (`ReactNode` type), `@quagga/ui/components/badge`,
`@quagga/ui/components/card`. That is all. No client JS ships (`check-list.tsx:20-21`).

**`system/page.tsx` imports:** `next/link`, six `lucide-react` icons (`ArrowRight`, `IdCard`,
`Lock`, `ScrollText`, `ShieldAlert`, `TriangleAlert`), six `@quagga/core` org-permission
symbols, `Button` + `Card*`, plus five app-local modules.

**`migration-plan.ts`:** zero imports. Uses only the global `URL`.

**`migrate.ts`:** `@neondatabase/serverless` (`Pool`), `drizzle-orm/neon-serverless`
(`drizzle`, `migrate`), `node:url` (`fileURLToPath`, `pathToFileURL`), `./local-proxy`,
`./schema`, `./migration-plan`, dynamic `./seed`.

**`security-headers.mjs`:** zero imports; plain ESM data + one async function.

**`skeleton.tsx`:** `react` + `../lib/utils` (`cn`). Nothing else.

**`client-errors.ts`:** six type/constant imports from `@quagga/core` only.

**Camp 404 availability check:** every runtime dependency this unit needs already exists in
Camp 404 — `drizzle-orm ^0.45.2` (identical), `@neondatabase/serverless ^1.1.0` (identical),
`lucide-react` (icons `ArrowRight`, `Lock`, `ScrollText`, `TriangleAlert`, `RotateCw`,
`KeyRound`, `ShieldAlert`, `ShieldCheck`, `IdCard` — verified present in the earlier
mechanical-delta pass for the 49 donor icon names). `@quagga/ui/components/{badge,card}` map
1:1 onto `@camp404/ui/components/{badge,card}`; **the donor's `badge.tsx` and `card.tsx` are
near-identical to Camp 404's** (donor `bg-success/20` vs target `/15`; donor `CardTitle` is
`text-lg` vs target `text-2xl`). The donor's `Badge` `variant="success"|"warning"|"outline"|
"secondary"` — confirm those four variants exist in `camp-404/packages/ui/src/components/badge.tsx`
before lifting `check-list.tsx` unchanged. **New npm deps required: none.**

---

## 10. AfrikaBurn / multi-tenant / org-split coupling

This is the **cleanest-porting unit harvested so far**. The coupling is shallow and named.

### Not coupled at all (lift as-is, rename the scope)

- `packages/db/src/migration-plan.ts` — zero domain knowledge. Pure env → decision.
- `config/security-headers.mjs` — zero domain knowledge.
- `packages/ui/src/components/skeleton.tsx` — zero domain knowledge, zero workspace imports
  beyond `cn`.
- `packages/ui/src/lib/client-errors.ts` + `client-error-capture.tsx` — six constant imports
  from core; no tenancy.
- `apps/*/lib/config.ts` + the three `not-configured-banner.tsx` — the only donor-specific
  content is the two service names in `missingConfig()`.
- `apps/org/components/system/check-list.tsx` — the only donor coupling is the *type* import
  `CheckTone`/`SystemCheck`; the component knows nothing about orgs, camps or editions.
- `apps/*/app/**/{error,global-error,not-found}.tsx` — brand strings only.
- `deletion-sweep/route.ts` — the auth/refusal/failure-status pattern is domain-free; only the
  sanitiser it calls is domain-specific.

### Lightly coupled (mechanical edits)

| Coupling | Where | Fix for Camp 404 |
|---|---|---|
| `getActiveEdition()` — **the `editions` dimension** | `system-probe.ts:70`; `system-status.ts:285-317` | Camp 404 has no editions. The equivalent "has this deployment ever been bootstrapped?" read is `camp_settings.bootstrappedAt` via `isCampBootstrapped()` (`camp-404/apps/web/lib/bootstrap.ts:22`). Swap the probe's second read; the `edition: {name, year} \| null` field becomes `bootstrapped: boolean` or `camp: {name} \| null`. **This is the only edition coupling in the whole unit.** |
| Advisory-lock rationale mentions "three concurrent app builds" | `migrate.ts:6-9`, `:181`; `system-status.ts:269-270` | Camp 404 has **one** app, so the lock protects nothing today — but it costs nothing and the *unpooled* refusal is still correct (Neon points `DATABASE_URL` at PgBouncer regardless of app count, and Camp 404's `vercel-build` runs `drizzle-kit migrate` with **no** unpooled enforcement at all). Keep the planner; the lock is optional. |
| Apex/cross-app-SSO checks: `sso`, `passkeys`-scope, `deployment` under-apex | `system-status.ts:600-637`, `:434-448` | These exist because sessions must span three subdomains. Camp 404 is one app on one domain: **drop `ssoCheck` entirely**, and simplify `passkeyCheck` to availability only. |
| `AUTH_APEX_DOMAIN = "quagga.ryanjnoble.dev"`, `PRODUCTION_ORIGINS` (3 AfrikaBurn URLs), `AUTH_RP_NAME = "AfrikaBurn Contributors"` | `packages/auth/src/env.ts:38,63,80-86` | Brand strings. Replace or delete. |
| Auth-provider resolvers (`resolveRequireEmailVerification`, `resolveRateLimit`, `resolveUseSecureCookies`, …) | `packages/auth/src/env.ts` | **Out of scope by instruction** — Camp 404 uses Neon Auth. But the *rule* (`DERIVE, DO NOT DUPLICATE`) ports: Camp 404's equivalents are `apps/web/lib/env.ts:assertServerEnv`, `apps/web/lib/bootstrap.ts:FOUNDER_CODE`, `apps/web/lib/test-mode.ts:isE2ETestMode`, and the `hasCampAccess`/`isApproved` predicates in `@camp404/core/access`. Derive the security section from *those*, not from a second copy. |
| Prose about Resend / blob / Google / three apps | throughout `system-status.ts` details | Rewrite the sentences; the check *shapes* are what you are lifting. |

### Genuinely org/tenant-coupled (do **not** port)

- The **entire access gate** on the page: `guardConsole()`, `runsDeployment(session.actor)`,
  `isSystemManager(session.actor)`, `canReadPersonalInformationIn(session.actor, "accounts")`,
  `runsDeploymentRefusal()`, `systemManagerRefusal(...)`, `ORG_RANK_LABELS` — all of this
  exists *only* because the donor has a `god | org_staff | lead | admin | member | engineer`
  membership-role enum and a second data-driven `org_roles` permission system
  (`packages/core/src/org-permissions.ts:190-230`, `:438-441`, `:664-690`).
  **Camp 404's collapse:** `runsDeployment` → `hasClearance(viewerRank, "captain")` from
  `@camp404/core/access`. There is no engineer tier and no reason to invent one; the panel is
  captain-only.
- The **Org access roster card** (`system/page.tsx:232-305`) and the **Roles and departments
  card** (`:311-360`) plus the whole `/system/roles` sub-page (151 lines) — these are the
  org-roles CRUD surface. Camp 404's nearest equivalent is `/captains/camp-management` (roster)
  and `/captains/camp-settings` (teams), both of which already exist. **Leave behind.**
- `parseGodEmails` / `godBootstrapCheck` — Camp 404 *does* have `GOD_EMAILS`
  (`docs/first-time-setup.md:86-87`, still not deprecated) so this check is directly
  reusable; but the "System manager rank granted at sign-in" prose is org-model prose.
- The **sole-System-manager warning** (`:255-273`) is org-tier in wording — but it is exactly
  Camp 404's **WP1 (#125) sole-captain deletion guard**, restated at the deployment level. The
  *idea* is directly reusable: surface "there is exactly one captain, and `/setup` has latched
  shut" on a health page so the org can act on it before it matters.
- `apps/suppliers/*` twins of `config.ts` and `not-configured-banner.tsx` — leave the whole app.

### The known-duplication warning applies here

`docs/simplification-audit.md:58-60` states *"apps/org and apps/suppliers are close to being
the same application twice"* and that copies have already drifted. **Verified for this unit:**
`apps/org/components/not-configured-banner.tsx` and
`apps/suppliers/components/not-configured-banner.tsx` differ by exactly 2 hunks (a word in a
doc comment and two prose sentences); `apps/web`'s copy differs by a third phrasing. All three
`lib/config.ts` files are the same four/five functions with different comments. **When porting,
port ONE and be aware you are looking at one of three near-twins.**

---

## 11. Verbatim excerpts — the five most valuable pieces

### 11.1 `redactSecrets` — the never-print-a-secret backstop
`apps/org/lib/system-status.ts:115-160`

```ts
/**
 * Env vars whose VALUE is a credential. Used only to redact — this module never
 * reads a value from here to display it.
 *
 * `GOD_EMAILS` is on the list although it is not a secret: it is a list of
 * people's email addresses, which is personal information, and an ENGINEER may
 * open this page. The count is reported; the addresses never are.
 */
const SECRET_ENV_VARS = [
  "BETTER_AUTH_SECRET",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "RESEND_API_KEY",
  "BLOB_READ_WRITE_TOKEN",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "PGCRYPTO_KEY",
  "GOD_EMAILS",
] as const;

/**
 * Scrub anything that could carry a credential out of text we did not write.
 *
 * Two passes, because either alone is insufficient. First every connection-string
 * URL is replaced wholesale (a Postgres URL embeds its password, and a driver
 * error quotes the URL it failed on). Then every known secret env VALUE is
 * replaced by name, which catches a key echoed back by an HTTP error, a value
 * that appears without a URL around it, and anything a future env var brings
 * along — provided it is added to `SECRET_ENV_VARS`.
 *
 * Short values are skipped in the second pass on purpose: replacing a two-letter
 * secret would corrupt ordinary prose without protecting anything real.
 */
export function redactSecrets(text: string, env: SystemEnv): string {
  let out = text.replace(
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`,)]+/gi,
    "[connection string redacted]",
  );
  for (const name of SECRET_ENV_VARS) {
    const value = env[name];
    if (value && value.length >= 8) {
      out = out.split(value).join(`[${name} redacted]`);
    }
  }
  return out;
}
```

### 11.2 The probe: timeout wrapper + never-throws contract
`apps/org/lib/system-probe.ts:14-94` (contiguous, comments intact)

```ts
// The server half of `/system`: read the real environment, make one real query,
// hand both to the pure deriver.
//
// It probes rather than infers. "DATABASE_URL is set" and "the database answers"
// are different claims, and the second is the one someone is asking about when
// they say the app is broken — a status page that only re-read its own config
// would report a green database while every page 500s.
//
// Never throws. This is the page an engineer opens when something is already
// wrong, so a failure to probe has to become a rendered "unreachable", never an
// error boundary. A status page that goes down with the thing it monitors is
// worth nothing.

/** How long a probe may hang before we call it unreachable, in milliseconds. */
const PROBE_TIMEOUT_MS = 5_000;

async function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
  // A dead database does not refuse a connection, it stops answering — and an
  // unbounded await would hang this render until the platform killed it, which
  // reads as "the console is broken too".
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${label} did not answer within ${PROBE_TIMEOUT_MS}ms.`,
              ),
            ),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * One round trip, timed, plus the active edition — which is the honest answer to
 * "has this database ever been seeded?" and costs one more indexed read.
 */
export async function probeDatabase(): Promise<DatabaseProbe> {
  if (!process.env.DATABASE_URL) return { kind: "not_configured" };

  const startedAt = Date.now();
  try {
    const db = getDb();
    await withTimeout(db.execute(sql`select 1`), "The database");
    const latencyMs = Date.now() - startedAt;
    // The edition read is separate on purpose: a connection that works but has
    // no reference data is a real, distinct state (a migrated-but-unseeded
    // deployment), and collapsing it into "connected" hides the actual fault.
    const edition = await withTimeout(getActiveEdition(), "The editions table");
    return {
      kind: "ok",
      latencyMs,
      edition: edition ? { name: edition.name, year: edition.year } : null,
    };
  } catch (err) {
    return {
      kind: "unreachable",
      // Redacted here as well as in the deriver. A driver error quotes the
      // connection string it failed on, and belt-and-braces on a credential is
      // cheap.
      message: redactSecrets(
        err instanceof Error ? err.message : String(err),
        process.env,
      ),
    };
  }
}

/** The whole System panel report: real env, real probe, pure derivation. */
export async function getSystemStatus(): Promise<SystemStatus> {
  const probe = await probeDatabase();
  return deriveSystemStatus(process.env, probe);
}
```

### 11.3 `planMigration` — the pure deploy verdict the console and the build share
`packages/db/src/migration-plan.ts:44-124`

```ts
/**
 * Decision of what to migrate against, resolved purely from env. Throws a hard
 * error for any configuration that would let the advisory lock silently fail to
 * serialise (a pooled endpoint, or a production deploy without the unpooled URL /
 * without any DB). Kept pure and exported so it can be unit-tested without a DB —
 * and so a console can render the same verdict the build would reach.
 */
export type MigrationPlan =
  | { kind: "skip"; reason: string }
  | { kind: "run"; connectionString: string; usingUnpooled: boolean };

export type MigrationEnv = Readonly<Record<string, string | undefined>>;

export function planMigration(env: MigrationEnv = process.env): MigrationPlan {
  const unpooled = env.DATABASE_URL_UNPOOLED;
  const pooled = env.DATABASE_URL;
  const connectionString = unpooled ?? pooled;
  const isProductionDeploy = env.VERCEL_ENV === "production";
  // Preview and production alike: a pooled fallback breaks the lock in both.
  const isVercelDeploy = Boolean(env.VERCEL || env.VERCEL_ENV);
  const neonLocal = env.NEON_LOCAL_PROXY === "1";

  if (!connectionString) {
    if (isProductionDeploy) {
      throw new Error(
        "[migrate] PRODUCTION DEPLOY with no database configured (DATABASE_URL_UNPOOLED and " +
          "DATABASE_URL both unset). Refusing to complete a production build that would silently " +
          "apply no migrations. Set DATABASE_URL_UNPOOLED to Neon's direct/unpooled endpoint.",
      );
    }
    return {
      kind: "skip",
      reason:
        "[migrate] no database configured (DATABASE_URL_UNPOOLED and DATABASE_URL both unset) — skipping migrations.",
    };
  }

  // Neon Local reroutes to a single local backend; the pooler/production guards
  // (which exist to catch PgBouncer transaction-pooling) do not apply there.
  if (!neonLocal) {
    if (isPoolerConnection(connectionString)) {
      throw new Error(
        "[migrate] refusing to run advisory-locked migrations against a POOLED (PgBouncer) endpoint " +
          `(host ${connectionHost(connectionString) ?? "unknown"}). Session-scoped advisory locks do NOT ` +
          "hold on a transaction-pooling endpoint, so the concurrent Vercel builders would not serialise. " +
          "Set DATABASE_URL_UNPOOLED to Neon's direct/unpooled endpoint.",
      );
    }
    // ANY Vercel deploy, not just production. This guard used to read
    // `isProductionDeploy`, and that gap is not hypothetical — it double-seeded
    // the real database. A preview build with DATABASE_URL_UNPOOLED unset fell
    // through to DATABASE_URL, which Neon's integration points at the POOLED
    // endpoint; `isPoolerConnection` cannot always tell (the host string does
    // not reliably say "pooler"), so the advisory lock was taken on a
    // transaction-pooling connection where it does not hold. Two builders then
    // each held a lock that protected nothing, both saw an empty `editions`,
    // and both seeded — 40 suppliers where there should have been 20.
    //
    // The hazard was never specific to production; only the guard was.
    if (!unpooled && isVercelDeploy) {
      throw new Error(
        "[migrate] DEPLOY without DATABASE_URL_UNPOOLED. Refusing to fall back to DATABASE_URL: " +
          "Neon's Vercel integration sets DATABASE_URL to the POOLED endpoint by default, where session " +
          "advisory locks do not hold — concurrent builders would not serialise and could both migrate " +
          "and seed. Add DATABASE_URL_UNPOOLED (Neon's direct/unpooled endpoint) to THIS environment.",
      );
    }
  }

  return {
    kind: "run",
    connectionString,
    usingUnpooled: Boolean(unpooled),
  };
}
```

### 11.4 `CheckRow` / `CheckListCard` — the whole render layer
`apps/org/components/system/check-list.tsx:23-107`

```tsx
/**
 * Tone → badge. Only `attention` is amber, deliberately.
 *
 * A deployment with no email provider and no blob token is working exactly as
 * designed, with honest fallbacks in place. Painting that amber would put this
 * page permanently in a warning state, and a page that always warns is a page
 * nobody reads — so "deliberately unconfigured" is muted and only a genuine
 * misconfiguration is loud.
 */
const TONE_VARIANT: Record<
  CheckTone,
  "success" | "secondary" | "warning" | "outline"
> = {
  ok: "success",
  degraded: "secondary",
  attention: "warning",
  info: "outline",
};

/** Screen-reader prefix, so the badge is not a colour-only signal. */
const TONE_LABEL: Record<CheckTone, string> = {
  ok: "Healthy:",
  degraded: "Not configured:",
  attention: "Needs attention:",
  info: "For information:",
};

export function CheckRow({ check }: { check: SystemCheck }) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border py-4 last:border-b-0 last:pb-0 first:pt-0 sm:flex-row sm:gap-6">
      <dt className="flex w-full shrink-0 flex-col gap-1.5 sm:w-56">
        <span className="text-sm font-medium text-foreground">
          {check.label}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant={TONE_VARIANT[check.tone]}>
            <span className="sr-only">{TONE_LABEL[check.tone]} </span>
            {check.value}
          </Badge>
        </span>
      </dt>
      <dd className="flex flex-1 flex-col gap-1.5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {check.detail}
        </p>
        {check.env && check.env.length > 0 && (
          /* NAMES only. Which variable decides this is the actionable half —
             its value is never printed here or anywhere else on the page. */
          <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground/70">
            {check.env.join(" · ")}
          </p>
        )}
      </dd>
    </div>
  );
}

export function CheckListCard({
  title,
  description,
  checks,
  footer,
}: {
  title: string;
  description: string;
  checks: SystemCheck[];
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="flex flex-col">
          {checks.map((check) => (
            <CheckRow key={check.id} check={check} />
          ))}
        </dl>
        {footer}
      </CardContent>
    </Card>
  );
}
```

### 11.5 The assembler + headline, and the "no secret" test harness
`apps/org/lib/system-status.ts:694-746`

```ts
/** The worst tone present, in the order a reader should care about it. */
function worstTone(checks: SystemCheck[]): CheckTone {
  if (checks.some((c) => c.tone === "attention")) return "attention";
  if (checks.some((c) => c.tone === "degraded")) return "degraded";
  return "ok";
}

/**
 * Assemble the whole report. Pure: same env + same probe → same page.
 */
export function deriveSystemStatus(
  env: SystemEnv,
  probe: DatabaseProbe,
): SystemStatus {
  const health: SystemCheck[] = [
    databaseCheck(env, probe),
    migrationCheck(env),
    referenceDataCheck(probe),
    authSecretCheck(env),
    emailCheck(env),
    blobCheck(env),
    encryptionCheck(env),
    deploymentCheck(env),
  ];
  const security: SystemCheck[] = [
    emailVerificationCheck(env),
    godBootstrapCheck(env),
    rateLimitCheck(env),
    sessionCheck(),
    secondFactorCheck(),
    passkeyCheck(env),
    ssoCheck(env),
    cookieSecurityCheck(env),
    googleCheck(env),
    passwordPolicyCheck(),
  ];

  const all = [...health, ...security];
  const tone = worstTone(all);
  const needing = all.filter((c) => c.tone === "attention");
  const degraded = all.filter((c) => c.tone === "degraded");

  // Name the things, don't just count them. "2 items need attention" makes a
  // reader hunt; naming them means the summary is sometimes the whole answer.
  const summary =
    tone === "attention"
      ? `Needs attention: ${needing.map((c) => c.label.toLowerCase()).join(", ")}.`
      : tone === "degraded"
        ? `Running with ${degraded.map((c) => c.label.toLowerCase()).join(", ")} unconfigured — each degrades honestly rather than failing.`
        : "Everything this page can check is configured and reachable.";

  return { health, security, headline: { tone, summary } };
}
```

`apps/org/lib/__tests__/system-status.test.ts:21-71` — the harness that makes rule 1 provable:

```ts
/** A marker that cannot occur naturally in any of this module's prose. */
const SECRET = "zzQUAGGA-SECRET-MARKERzz";

/** An env bag where EVERY credential is the marker, one way or another. */
function secretiveEnv(): SystemEnv {
  return {
    DATABASE_URL: `postgres://dbuser:${SECRET}@db.example.com:5432/quagga?sslmode=require`,
    DATABASE_URL_UNPOOLED: `postgres://dbuser:${SECRET}@db.example.com:5432/quagga?sslmode=require`,
    BETTER_AUTH_SECRET: `auth-${SECRET}`,
    BETTER_AUTH_URL: "https://org.quagga.ryanjnoble.dev",
    RESEND_API_KEY: `re_${SECRET}`,
    BLOB_READ_WRITE_TOKEN: `blob_${SECRET}`,
    GOOGLE_CLIENT_ID: `gid-${SECRET}`,
    GOOGLE_CLIENT_SECRET: `gsec-${SECRET}`,
    PGCRYPTO_KEY: `pg-${SECRET}`,
    GOD_EMAILS: `${SECRET}@example.com, second-${SECRET}@example.com`,
    AUTH_RATE_LIMIT_MAX: "500",
    AUTH_RATE_LIMIT_WINDOW_SECONDS: "60",
    VERCEL_ENV: "production",
  };
}

/** Every string this page would put on screen, flattened. */
function renderedStrings(env: SystemEnv, probe: DatabaseProbe): string[] {
  const status = deriveSystemStatus(env, probe);
  const checks = [...status.health, ...status.security];
  return [
    status.headline.summary,
    ...checks.flatMap((c) => [c.label, c.value, c.detail, ...(c.env ?? [])]),
  ];
}

describe("no secret is ever printed", () => {
  it("survives a fully-populated environment of credentials", () => {
    for (const text of renderedStrings(secretiveEnv(), OK_PROBE)) {
      expect(text).not.toContain(SECRET);
    }
  });
```

---

## 12. Gotchas, and things that are true but easy to get wrong

1. **`planMigration` throws — it does not return an error.** Any caller that renders its
   verdict must wrap it in try/catch (`system-status.ts:237-250`). Three of its four failure
   modes are throws; only "no database, non-production" returns `{kind:"skip"}`.
2. **The panel's DB check and the migration check read different variables.**
   `databaseCheck` reads `DATABASE_URL ?? DATABASE_URL_UNPOOLED` (`:186`); `planMigration`
   reads `DATABASE_URL_UNPOOLED ?? DATABASE_URL` (`:66`). Opposite precedence, on purpose.
3. **`probeDatabase` early-returns `not_configured` on `!process.env.DATABASE_URL` only**
   (`system-probe.ts:60`) — a deployment with *only* `DATABASE_URL_UNPOOLED` set reports the
   database as unconfigured while the migration check reports it as fine. Latent inconsistency;
   low impact, but note it if you port both checks.
4. **`redactSecrets` skips values shorter than 8 characters** (`:155`). A short `PGCRYPTO_KEY`
   is not redacted — but the panel never prints it, and the too-short check prints only the
   *length*. The gap is real only for third-party error text.
5. **The `unreachable` message is redacted twice** and that is deliberate belt-and-braces
   (`system-probe.ts:79-81`). Do not "tidy" one away.
6. **`deriveSystemStatus` takes `SystemEnv`, deliberately not `NodeJS.ProcessEnv`**, because
   Next's types augment that interface to make `NODE_ENV` required and every test case would
   have to supply it (`system-status.ts:72-80`). Same trick in `MigrationEnv`
   (`migration-plan.ts:55-61`). Copy this, or the test table gets ugly.
7. **`migrate.ts` re-exports the planners** for backwards compatibility, and its own doc
   comment at `:100-111` explains why. `packages/db/src/index.ts:27-32` re-exports them *again*
   so the console can import from the package barrel without pulling the migrator. Donor
   `docs/simplification-audit.md` flags a *different* migrate.ts re-export whose comment
   contradicts the code — read the code, not the comment.
8. **`runDeployMigrations` is exported only to be testable** and nothing imports it; the build
   runs the module as a script via the `invokedDirectly` check at `:271-273`
   (`import.meta.url === pathToFileURL(process.argv[1]).href`). Do not "wire it up".
9. **The advisory lock and the migration must share ONE connection.** `migrate.ts:151-152`
   checks out a dedicated `client` and runs `drizzle(client)` against it. *"A lock taken on a
   different connection than the migration protects nothing"* (`:42`).
10. **`statement_timeout` is set twice** — to `LOCK_TIMEOUT_MS` before acquisition and to `0`
    after — so a legitimately long migration is never aborted (`:157`, `:169`). Dropping the
    second line silently caps every migration at 2 minutes.
11. **The seed is wrapped in an explicit `BEGIN`/`COMMIT`/`ROLLBACK`** because the sentinel is
    "does an edition exist" and the seed's own first write creates one — an unwrapped half-seed
    latches the sentinel permanently with no in-product way out (`migrate.ts:198-225`).
12. **`ensureSeededOrgRoles` / `ensureSeededOrgDepartments` are insert-if-missing on a stable
    key, never an update** (`:236-238`) — a repair, not a sync. The distinction matters: a
    re-assert would revert an operator's edit.
13. **`connectionHost` returns `null` on garbage; `isPoolerConnection` returns `false`.**
    Neither throws, so a malformed `DATABASE_URL` renders "the configured host" rather than
    crashing the page (`system-status.ts:268`, `:278`).
14. **`humanDuration` only uses a unit when it divides evenly.** `humanDuration(90)` is
    `"90 seconds"`, not `"1.5 minutes"` — explicitly asserted (`system-status.test.ts:366`).
15. **`AUTH_SESSION` lives in the pure env module, not as literals in the auth builder**,
    precisely so the panel and the running stack cannot disagree — *"Two copies of a number
    like that drift, and the copy that drifts is always the one being read"*
    (`packages/auth/src/env.ts:44-53`).
16. **The rate-limit override raises the ceiling and is therefore `attention`, not `ok`**
    (`system-status.ts:558`). Both `docs/deploy.md:116-119` and `e2e-local.sh:36-42` say never
    set it in production. Camp 404 has no equivalent env-tunable limiter; if one is added, copy
    this tone choice.
17. **`console.error` monkey-patching in `client-errors.ts` passes through FIRST** (`:106-107`)
    and records inside a try/catch (`:108-123`) — otherwise capturing an error inside the
    console.error handler turns a logged error into an uncaught one.
18. **`data-loading="true"` is a testing contract**, not decoration (`skeleton.tsx:41-46`).
    Camp 404's WP7 skeleton work should adopt it or the "we added a skeleton" claim is
    unverifiable.
19. **The e2e spec's own honest-scope note** (`system-panel.spec.ts:26-34`) is worth copying as
    a practice: state in the spec header what it proves and what it does not, and name the test
    that covers the rest.
20. **`turbo run test` starts no browser.** `.github/workflows/ci.yml:101` is
    `pnpm turbo run lint typecheck test build`; the e2e suite is a separate matrix job. Do not
    infer browser coverage from a green `test` task — the donor's `AGENTS.md:59-69` says the
    same thing.
21. **`docs/architecture.md:33` and `:131` both say "45 tables"; the real count is 44.** An
    internal-doc digit disagreement — do not propagate a donor doc's numbers without a grep.
22. **`.env.example` is stale in three ways** and `README.md:89` tells newcomers to copy it.
    Confirmed independently here: `turbo.json` declares 15 `globalEnv` entries and
    `ACCOUNT_SWEEP_SECRET` / `CRON_SECRET` / `NEXT_PUBLIC_APP_URL` /
    `NEXT_PUBLIC_PARTICIPANT_APP_URL` appear in none of them despite being read by live code
    (`deletion-sweep/route.ts:56-57`, `apps/org/lib/config.ts:23`).
23. **The donor has NO attack monitoring** — `docs/technical-spec.md:436-437` states
    *"nothing is watching for attacks — there is no alerting on failed-login spikes"*. This
    panel is a **status page, not observability**. Do not port it expecting alerting.
24. **`AGENTS.md:176-180` forbids adding volume thresholds / profiling / alerting** on top of
    the audit log; an enumeration detector *was built and removed* for that reason. The
    `/system` page's audit-trail card restates this at `system/page.tsx:374-381`. If Camp 404
    ports the audit link, port the constraint with it.
25. **`GateScreen` in `packages/ui` is dead** — `docs/simplification-audit.md:931` says both
    apps it was built for wrote their own. The org gate-screen at
    `apps/org/components/gate-screen.tsx` explains why in its own header (`:14-18`: the shared
    primitive would double the QuiltBand). Do not go looking for the ui one.
26. **Only ONE cron exists** in the whole donor repo (`apps/web/vercel.json`, 9 lines).
    Camp 404 has five. The donor's *pattern* for a scheduled destructive job — refuse without a
    secret, accept either bearer, log each failure, return 500 on partial failure — is directly
    applicable to Camp 404's `assertCron` routes, which currently return `{ok:true}` shapes.

---

## 13. Recommended port order for Camp 404 (not a gap analysis — sequencing only)

1. `config/security-headers.mjs` → `camp-404/config/security-headers.mjs`, wired into
   `apps/web/next.config.ts`. Zero-dependency, zero-coupling, closes a real hole
   (Camp 404 sets **no** response headers today).
2. `packages/ui/src/components/skeleton.tsx` → `@camp404/ui`. Unblocks WP7 (#131) across
   24 `force-dynamic` pages. Keep `data-loading` and `SkeletonRegion`'s single live region.
3. The three-tier error boundary shape (`(group)/error.tsx` + `error.tsx` + `global-error.tsx`)
   — Camp 404 has exactly one `app/error.tsx`.
4. `migration-plan.ts` (`connectionHost` / `isPoolerConnection` / `planMigration`) into
   `@camp404/db`. Camp 404's `vercel-build` runs `drizzle-kit migrate` with no unpooled
   enforcement; this is a live correctness gap, and the module is 124 pure lines with 15 tests.
5. `system-status.ts` + `system-probe.ts` + `check-list.tsx` as a captain-only
   `/captains/system` (or `/captains/camp-settings` tab). Swap `getActiveEdition()` for
   `isCampBootstrapped()`; drop `ssoCheck`; rewrite the security checks against Camp 404's own
   derivations (`assertServerEnv`, push/Firebase presence, Telegram dormancy, `INVITE_CODES`,
   `E2E_TEST_MODE`, cron secret, Anthropic/Groq presence, `PGCRYPTO_KEY` length — the last is
   already a boot assertion, so the panel would *report* it rather than re-derive it).
6. The `system-status.test.ts` "no secret is ever printed" harness, verbatim in shape. It is
   the single highest-value 60 lines in the unit.
7. `client-errors.ts` + `client-error-capture.tsx` — Camp 404's shake-to-report dialog
   (`apps/web/components/feedback/report-bug-dialog.tsx`) currently attaches no recent errors
   and no device facts. This is a drop-in upgrade for it.
8. The `deletion-sweep` route's auth + failure-status pattern applied to Camp 404's six cron
   routes (three of which are `{ok:true, sent:0}` stubs that would look identically healthy in
   a Vercel dashboard whether they worked or not — exactly the failure mode
   `deletion-sweep/route.ts:74-78` was written to fix).
9. `docker-compose.local.yml` + `local-proxy.ts` — only if Camp 404 wants a local Postgres.
   Camp 404 already has PGlite for integration tests, which covers a different need.
