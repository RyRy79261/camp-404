# 18 — system-health-ops

**Headline:** Build the donor's `/system` panel — a pure `(env, probe) → named checks` deriver, a never-throws DB probe, and a "no secret is ever printed" marker test — because Camp 404 has ~20 optionally-configured integrations and zero surface that answers "what is actually live on this deployment?".

**Camp 404 today:** `apps/web/app/api/health/route.ts` is 7 lines, `runtime = "edge"`, returns `{ok:true, service:"camp-404-web"}` and never touches the database — spot-checked, exact. `rg -il "system-status|SystemCheck|CheckTone|probeDatabase"` over `apps/` + `packages/` returns zero files; boot-time config is fail-hard on one var (`apps/web/lib/env.ts` REQUIRED = `[PGCRYPTO_KEY, minLength 16]`, throws) with no warn tier for anything optional.

## Take these

| # | Item | Verdict | Rec | Value | Effort | Donor path | Camp 404 destination | Why |
|---|---|---|---|---|---|---|---|---|
| 1 | `deriveSystemStatus` — pure health deriver | MISSING | ADAPT | high | M | `apps/org/lib/system-status.ts:704` | `apps/web/lib/system-status.ts` (new) | The one page that says which of ~20 integrations are live |
| 2 | `probeDatabase` — timed, never-throws probe | MISSING | ADAPT | high | S | `apps/org/lib/system-probe.ts:59` | `apps/web/lib/system-probe.ts` (new) | PROBE-DON'T-INFER; kills the `/api/health` lie |
| 3 | "No secret is ever printed" marker test | MISSING | ADAPT | high | S | `apps/org/lib/__tests__/system-status.test.ts:22-51` | `apps/web/lib/__tests__/system-status.test.ts` | Makes #1 shippable rather than merely written |
| 4 | `redactSecrets(text, env)` two-pass scrubber | PARTIAL | ADAPT | high | S | `system-status.ts:148-160` | `packages/core/src/text-redaction.ts` | Value-based, not pattern-based; `redactPii` can't do it |
| 5 | `CheckRow` + `CheckListCard` render layer | MISSING | COPY | high | S | `apps/org/components/system/check-list.tsx` | `apps/web/components/system/check-list.tsx` | Drop-in **after** #1 exists — it imports `CheckTone`/`SystemCheck` |
| 6 | A failed job is not a successful run | PARTIAL | ADAPT | high | S/M | `apps/web/app/api/account/deletion-sweep/route.ts:74-99` | `app/api/cron/notifications/dispatch/route.ts`, `packages/db/src/broadcasts.ts` | Today an all-failed run and an all-succeeded run are the same dashboard entry |
| 7 | Self-declaring stub cron shape | MISSING | COPY | medium | S | `apps/web/app/api/notifications/digest/route.ts:27-35` | 4 Camp 404 cron routes | 3 stubs are scheduled in prod and look healthy |
| 8 | `/captains/system` panel page (top half only) | MISSING | ADAPT | high | M | `apps/org/app/(console)/system/page.tsx` | `apps/web/app/captains/system/page.tsx` | Needs a product decision first — no impl spec exists |
| 9 | `planMigration`/`isPoolerConnection` | MISSING | ADAPT | medium | S | `packages/db/src/migration-plan.ts` | `packages/db/src/migration-plan.ts` (new) | `vercel-build` runs bare `drizzle-kit migrate`, DDL over a pooler unguarded |
| 10 | `X-Frame-Options` + HSTS, headers in app not host | PARTIAL | ADAPT | medium | S | `config/security-headers.mjs` | `apps/web/vercel.json`, `apps/web/next.config.ts` | 4 of 6 already ship; the two missing are one line each |
| 11 | `optionalConfigWarnings(env)` boot tier | MISSING | INSPIRE | medium | S | `packages/auth/src/env.ts:288-330` | `apps/web/lib/env.ts` | Everything optional fails late, at its own call site, in a Vercel log |
| 12 | `neon-pr-cleanup.yml` hardening | PARTIAL | ADAPT | medium | S | `.github/workflows/neon-pr-cleanup.yml:15` | same path here (87 lines vs donor's 142) | Camp 404 has the older fork: `pull_request` trigger + unpaginated list |
| 13 | `humanDuration(seconds)` (verifier MISSED) | MISSING | COPY | low | S | `system-status.ts:163-176` | `packages/core/src/` | 15 dep-free lines; cron schedules, rate-limit windows, invite expiry |

### 1 — the deriver

Pure module: no `server-only`, no React, no `process.env`, no DB client, zero npm deps. Signature `deriveSystemStatus(env: SystemEnv, probe: DatabaseProbe): SystemStatus`. Keep verbatim:

```ts
export type CheckTone = "ok" | "degraded" | "attention" | "info";
export type SystemEnv = Readonly<Record<string, string | undefined>>;   // NOT NodeJS.ProcessEnv — Next augments it
export interface SystemCheck { id; label; value; tone: CheckTone; detail: string; env?: readonly string[] }
export type DatabaseProbe =
  | { kind: "not_configured" }
  | { kind: "ok"; latencyMs: number; /* donor: edition */ bootstrapped: boolean }
  | { kind: "unreachable"; message: string };
```

`worstTone` reduces `attention > degraded > ok`; the headline **names** the offenders, never counts them (`Needs attention: encryption key, file uploads.`). `degraded` ("working as designed") is deliberately not `attention` — badge map is `ok→success, degraded→secondary, attention→warning, info→outline`.

The check SET is a rewrite, not a transcription, and this is where the M goes. Of the donor's 18: keep `database`, `migrations`, `blob`, `encryption-key`, `deployment`, `god-emails`; drop the whole Better-Auth cluster (`email-verification`, `session`, `rate-limit`, `two-factor`, `passkeys`, `sso`, `secure-cookies`, `google`, `password-policy`, `email`) — Camp 404 has none of those surfaces. **That leaves the donor's second card with exactly one survivor.** Re-invent it from Camp 404 primitives (`apps/web/lib/rate-limit.ts` in-memory limiter, `apps/web/lib/cron-auth.ts`, `packages/db/src/crypto.ts`) rather than adapting. Add Camp-404-native checks: `bootstrap` (from `isCampBootstrapped()`), `push` (six Firebase vars + VAPID), `telegram` (built-but-dormant = `degraded`, not `attention`), `ai` (Anthropic/Groq), `crons` (three of five are stubs), `invite-codes`.

### 2 — the probe

94 lines. `PROBE_TIMEOUT_MS = 5_000`; `withTimeout` per operation so a slow DB becomes a rendered `unreachable` rather than a hung render — *"a status page that goes down with the thing it monitors is worth nothing"*. Latency clock covers `select 1` only, not the second read. Three porting traps, all verified:
- **`requireDatabaseUrl()` substitutes `BUILD_PLACEHOLDER_URL`** (`packages/db/src/index.ts:20-24`, `postgres://build:build@localhost:5432/build?sslmode=disable`) when `DATABASE_URL` is unset. Guard on `process.env.DATABASE_URL` directly or the probe reports `unreachable` where the honest answer is `not_configured`.
- **`isCampBootstrapped()` returns `true` under E2E test mode** (`apps/web/lib/bootstrap.ts:23`, `if (isE2ETestMode()) return true;` — confirmed). Bypass or label it, or the panel lies in test mode. Same short-circuit sits in `assertServerEnv` (`apps/web/lib/env.ts:36`, `if (env.E2E_TEST_MODE === "1") return;` — confirmed), so anything derived from REQUIRED inherits it.
- Use `createHttpDb()` (`packages/db/src/index.ts:44`), and note the probe file will carry `import "server-only"` while `apps/web/vitest.config.ts` aliases only `@`. Keep the deriver pure and this never matters.

### 3 — the proof harness

The highest leverage-per-line item in the unit. `const SECRET = "zzCAMP404-SECRET-MARKERzz"`; seed it into every credential var **including inside two full `postgres://` URLs**; `renderedStrings()` flattens `headline.summary` + every check's `label`, `value`, `detail`, `env[]`; assert no marker survives across every probe outcome and every throwing config. Then the **positive** assertion that the DB hostname *is* shown while the user and the marker are not — "so that removing it is a decision rather than an accident". Camp 404's deriver is pure, so this needs no `vi.mock("server-only")` stub and runs in the existing `turbo run test` gate.

### 4 — redactSecrets

Two passes: (1) `/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`,)]+/gi` → `"[connection string redacted]"`; (2) per-name `split/join` → `` `[${name} redacted]` ``, **only when `value.length >= 8`** (a two-letter secret would corrupt prose without protecting anything). Camp 404's 14-name list, all verifiable via `rg -o 'process.env.[A-Z0-9_]+'`: `DATABASE_URL, PGCRYPTO_KEY, CRON_SECRET, ANTHROPIC_API_KEY, GROQ_API_KEY, BLOB_READ_WRITE_TOKEN, GITHUB_FEEDBACK_TOKEN, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, NEON_AUTH_COOKIE_SECRET, GOD_EMAILS, INVITE_CODES`. Add it **beside** `redactPii`, not instead of: `redactSecrets(text, env)` for env/driver-derived text, `redactPii(text)` for prose a human typed.

### 6/7 — the cron honesty pair

`apps/web/app/api/cron/notifications/dispatch/route.ts` (read in full) is `const result = await dispatchDueBroadcasts(); return NextResponse.json({ ok: true, ...result });` — no failure channel at all. `dispatchDueBroadcasts` returns `DispatchResult {dispatched, deliveries}` (`packages/db/src/broadcasts.ts:292`), so surfacing per-target failures is a `packages/db` signature change plus its PGlite tests, not a route edit. Call it S/M. The stub shape is pure S: `{ok:true, job:"notifications.reminders", status:"stub", scheduled:true, message:"…"}` across `recipes/analyse`, `manuals/generate`, `notifications/reminders` and — the item every agent missed — `telegram/dispatch`, whose `catch { return NextResponse.json({ok:true, skipped:"telegram_bot_not_configured"}) }` makes "the bot was never configured" and "the queue drained" the same entry. That route already computes the `telegram: dormant` state the panel wants and throws it away.

## Already covered in Camp 404 — do not re-port

- **Security headers, mostly.** `apps/web/vercel.json` ships `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`, `Content-Security-Policy: frame-ancestors 'none'` under `"source": "/(.*)"` — verified. **Do not copy the donor's `Permissions-Policy` verbatim**: its `camera=(), microphone=()` would break avatar capture and the voice pipeline.
- **Cron auth, and it is stronger than the donor's.** `apps/web/lib/cron-auth.ts` uses `timingSafeEqual` with a length pre-check and **fails closed** on an unset secret; its doc comment records the `Bearer undefined` bug. The donor's route deliberately stays reachable-but-declining.
- **All three error-boundary tiers.** `app/error.tsx` (66 lines, `useRef`/`tabIndex={-1}` focus move, `CodeDisplay` digest), `app/global-error.tsx` (87 lines, own `<html>`/`<body>`, inline `#0d061e`/`#ef1ec1` so a CSS load failure can't take it down), `app/not-found.tsx`. Ahead of the donor in places.
- **`BUILD_PLACEHOLDER_URL`** — byte-identical string and comment (`packages/db/src/index.ts:20-22`).
- **`.next/dev` turbo exclusion** — the single most valuable line in the donor's e2e script already landed as commit `c270377` (`turbo.json:31`).
- **The preview-but-locked gate (D3)** beats the donor's REFUSE-DON'T-404: `requireClearance` (`packages/core/src/access.ts:43`) + `CaptainLock`, contract written at `apps/web/app/captains/tools/page.tsx:14-18`, and `apps/web/tests/e2e/captain-preview-locked.spec.ts` (137 lines) already proves it end-to-end. `/captains/system` inherits a working e2e pattern.
- **Sentinel-and-first-write-share-a-transaction**: `packages/db/src/bootstrap.ts` `bootstrapFirstCaptain` already does the promotion + root invite mint + `bootstrappedAt` stamp inside one `db.transaction()` behind `SELECT … FOR UPDATE`.
- **Badge/Card primitives.** `packages/ui/src/components/badge.tsx:13-19` defines `default | secondary | outline | destructive | success | warning` — verified. The `TONE_VARIANT` map compiles unchanged.

## Deliberately skip

- **`migrate.ts` advisory-lock runner.** The lock exists for three concurrent Vercel builders. Camp 404 has one app, one project, one builder. Take only REPAIR-NOT-SYNC (insert-if-missing on a stable key) as a rule for `camp_settings.config`.
- **`config.ts` + `NotConfiguredBanner`.** Camp 404 deliberately chose fail-hard for a POPIA reason written into `apps/web/lib/env.ts`; a "preview mode" banner over it is a regression. Steal only `missingConfig()`'s human strings and feed them to the panel.
- **The donor's gate machinery** (`runsDeployment`, `isSystemManager`, `runsDeploymentRefusal`, `ORG_RANK_LABELS`) — collapses to `requireClearance(rank, "captain")`. Camp 404's `rankEnum` is `["captain","member"]`; there is no rank inversion to protect.
- **The `/system` bottom cards** (org-access roster, roles-and-departments) — `/captains/camp-management` and `/captains/camp-settings` cover it.
- **`system-panel.spec.ts`** — its entire subject is the engineer-vs-org_staff inversion. Keep only the honest scope note and the `toHaveCount(0)` scoping discipline.
- **`scripts/e2e-local.sh`** — three-app orchestration with no analogue. Its one great line already landed.
- **Any alerting on top of the panel.** `AGENTS.md:176-180` forbids volume thresholds/profiling/alerting; an enumeration detector was built and removed for that reason.
- **The donor's CI coverage matrix at full size.** 8-entry matrix for 2,733 tests across three apps. Proportionate version only: `@vitest/coverage-v8` installed (currently in no workspace — verified) and hard floors on `packages/core/src/access.ts`, `text-redaction.ts`, and the new deriver.

## DB changes this unit implies

**None. This unit owns no tables** — that is its most portable property; the whole panel derives from `process.env` plus two reads (`select 1`, and the bootstrap sentinel). The only schema-adjacent changes are env vars, not columns:

- New deploy var: `DATABASE_URL_UNPOOLED` (Vercel + `turbo.json` globalEnv) if item 9 lands. Absent from the whole repo today — verified.
- `turbo.json` globalEnv has 22 entries and is missing 8 that live code reads — each confirmed present in source: `GOD_EMAILS`, `INVITE_CODES` (`apps/web/lib/access-control.ts`), `GITHUB_FEEDBACK_TOKEN`, `GITHUB_FEEDBACK_REPO` (`app/feedback/actions.ts`), `MCP_PUBLIC_URL`, `VERCEL_URL` (`lib/mcp/origin.ts`), `NEON_LOCAL_PROXY` (`packages/db/src/index.ts`), `E2E_TEST_MODE` (`lib/test-mode.ts`).
- Optional new `packages/db` export entry `"./migration-plan": "./src/migration-plan.ts"` (25 entries today; a barrel re-export would be off-idiom here).

## Quick wins (effort S)

1. **Stub crons tell the truth.** Edit `apps/web/app/api/cron/{recipes/analyse,manuals/generate,notifications/reminders,telegram/dispatch}/route.ts` to the donor's `{ok, job, status:"stub", scheduled, message}` shape (`apps/web/app/api/notifications/digest/route.ts:27-35`). Also fix `recipes/analyse`'s JSDoc, which claims "every 15 minutes during the planning window" against the real `"0 8 * * *"`. Test: one route test per file asserting `status === "stub"`.
2. **Two missing headers.** Add `X-Frame-Options: DENY` and `Strict-Transport-Security: max-age=63072000; includeSubDomains` to `apps/web/vercel.json`. If you also move the set into `apps/web/next.config.ts`, it **must** be `...(isMobileBuild ? {} : { async headers() {…} })` — `output: "export"` ignores `headers()` and warns. Test: `curl -I` on a preview.
3. **`turbo.json` globalEnv.** Add the 8 vars listed above. Test: `pnpm turbo run build` cache still keys correctly.
4. **`humanDuration`.** Copy `apps/org/lib/system-status.ts:163-176` → `packages/core/src/duration.ts`. Units `[86400 day, 3600 hour, 60 minute]`, largest **whole** unit only (`seconds % size === 0`) so it never rounds a policy into a lie. Test: `humanDuration(90) === "90 seconds"`, not "1.5 minutes".
5. **`redactSecrets`.** Copy `system-status.ts:148-160` → `packages/core/src/text-redaction.ts`, swap the 9-name list for Camp 404's 14. Test: a `postgres://` URL with a `localhost` host is redacted (see Corrections — `redactPii` leaves that one completely intact).
6. **`neon-pr-cleanup.yml`.** Change `pull_request` → `pull_request_target` (a Dependabot-actor close gets the empty Dependabot secret store, `NEON_API_KEY` resolves to nothing, and the job leaks the branch it exists to delete — Camp 404 does receive Dependabot PRs) and page the branches list via `pagination.next`. Test: close a Dependabot PR, confirm the branch is gone.
7. **`system-probe.ts`.** Item 2 is genuinely half a day once item 1's types exist. Test: unit-test the `not_configured` / `ok` / `unreachable` fork with a mocked `execute`.

## Corrections applied

- **The "password survives `redactPii`" example is FALSE, and I re-ran it to be sure.** Executing the real `packages/core/src/text-redaction.ts` `redactPii`: `postgres://user:hunter2@ep-x.neon.tech/db` → `postgres://user:[email]/db`, and a real Neon string → `postgres://neondb_owner:[email]/neondb?sslmode=require`. The email rule swallows `password@host.tld` whole because `_` and `-` are in its local-part class. The genuine surviving case is a **host with no TLD dot**: `postgres://postgres:postgres@localhost:5432/camp404` and `connect ECONNREFUSED for postgres://build:build@localhost:5432/build?sslmode=disable` both pass through **completely unchanged** — which is exactly the `BUILD_PLACEHOLDER_URL` shape a driver error quotes. PARTIAL/ADAPT still holds; the gap is fragile-and-incidental (and the current behaviour mangles the hostname it ought to be showing), not "the password leaks".
- **`check-list.tsx` is not independently landable.** Its first non-UI import is `import type { CheckTone, SystemCheck } from "@/lib/system-status"`. COPY holds only after item 1 exists and keeps both type names verbatim.
- **Route-group `error.tsx` files are a design reversal, not S effort.** `design/spec/impl/app/16-captain-tools.md:42` marks `captains/tools/error.tsx` "**no change needed**"; `10-tools-hub.md:58` marks `app/tools/error.tsx` "**DO NOT CREATE**". What survives is the donor's *criterion* (`apps/org/app/(console)/error.tsx:8-11`): a segment earns a boundary when it has a fetch that can fail under a persistent layout. Under `app/captains/**` a roster/approvals query genuinely can — that one is worth it; a blanket rule in either direction is not.
- **Client-error diagnostics is a closed decision, not a confessed gap.** `docs/superpowers/specs/2026-05-31-shake-to-report-design.md:77` has a "Deliberately out of scope" bullet reading "Diagnostics / environment / error-log capture…", attributed to the maintainer. Propose reopening it with what changed; don't frame it as filling an oversight. The technical content (ring buffer, path-only-never-query, capture-must-never-throw, `redactSecrets` + `sanitizeReportText` before GitHub) is sound if reopened.
- **`bootstrapFirstCaptain` already satisfies "sentinel and first write share a transaction."** The digest listed it as an inspection item; it is ALREADY_HAVE, in a stronger form (single `db.transaction()` behind `.for("update")` on the singleton settings row).
- **`nextGate` is duplicated, not under-called.** Verified: `packages/core/src/access.ts:94` (takes a `routes` registry, no questionnaire branch) and `apps/web/lib/required-actions.ts:30` (hardcodes `ACTION_ROUTES`, adds the questionnaire branch), each with its own test file, and **no app code imports the core one** — the three call sites all use the app-local fork. Collapse the two before wrapping either in a `guardPage()`.
- **The sqlLogger rationale doesn't transfer.** The donor's own `packages/db/src/index.ts:59-63` says the 152 ms/statement penalty "exists ONLY in the environments that don't ship" — it is the local dev shim, not Neon's real HTTP endpoint. Camp 404 has no local proxy stack and no DB-backed e2e run. Statement counting is a cheap nicety; value is low, not medium.
- **`configureLocalProxy` is ADAPT, not COPY.** The donor calls it from `createHttpDb` and then immediately branches away into a WebSocket read pool (`index.ts:86-119`) because the `fetchEndpoint` path it just configured is the slow one. Lifting the 36 lines verbatim wires Camp 404 onto the path the donor abandoned. Port the read-pool swap with it or don't bother.
- **`telegram/dispatch` does carry an explanatory comment** ("NOT yet registered in vercel.json…") — the verifier implied nothing in the repo says so. The *response shape* is still dishonest, which is the actual finding.
- Smaller: `badge.tsx` variants are at lines 13-19 (11-12 are the cva options object); `packages/ui` holds 41 non-story components, not 40; `packages/db/package.json` declares 25 export entries; the repo has 11 pnpm workspaces, 8 with a `vitest.config.ts`; `apps/web/vercel.json` registers **five** crons against **six** route files.

## Confidence notes

- Items 1-5, 9, 10 spot-checked directly against both trees this session: the 7-line edge health route, the 4-header `vercel.json`, `"vercel-build": "pnpm --filter @camp404/db db:migrate && next build"` + bare `drizzle-kit migrate`, the Badge variant list, the E2E short-circuits in `bootstrap.ts:23` and `env.ts:36`, the zero-hit `system-status` grep, the three cron route bodies, the `nextGate` fork, the 22-entry globalEnv and all 8 missing vars, `find apps -name loading.tsx` = zero with 26 `force-dynamic` pages, and `redactPii` executed on four real connection strings. All hold.
- **Item 8 (`/captains/system`) is gated on a product decision, not on engineering.** Every other Camp 404 surface has a numbered impl spec under `design/spec/impl/app/`; this route has none and no feature-set entry. The user's standing rule is that the design is finished and code is built to it. Get the spec before building the page — items 1-5 are all useful without it (the deriver + test are shippable as a library, the probe can back a real `/api/health`).
- **The skeleton kit (not in the table above, medium/M) is blocked by an unresolved contradiction.** WP7 (#131) asks for `loading.tsx` across 24 force-dynamic pages; `design/spec/impl/app/16-captain-tools.md:43`, `11-invite-tool.md:57`, `09-notifications.md:153`, `05-approval-gate.md:54`, `01-landing.md:27`, `17-mcp-connect.md:125` each say "do not create". `design/spec/flows.md:440` is the narrower, defensible position: server pages arrive complete, skeletons are for *client* fetches. Port the kit, scope its use to client-fetch surfaces only. Keep `data-loading="true"` (a Playwright test can prove a boundary appeared) and one live region per boundary — that half serves WP8 (#132) regardless.
- **Item 12's Dependabot leak is inferred, not observed.** The mechanism is documented in the donor; that Camp 404 has actually leaked a branch this way is not verified.
- The local Postgres compose stack, `configureLocalProxy` read-pool port, and the CI coverage matrix are all real but low-priority for a one-camp tool; they are listed under skip/corrections rather than in the take-these table on purpose.
- Not individually verified this session: the donor's `security-headers.mjs` line numbers, `skeleton.tsx` internals, and `client-errors.ts` caps — all came through the verifier's upheld column and I did not re-open them.
