# 30 — E2E test-mode seam (/api/test/*)

**Files covered:**
- `apps/web/lib/test-mode.ts` — the single env gate (`isE2ETestMode()`) + the test-auth cookie name constant (`TEST_USER_COOKIE`); `server-only`.
- `apps/web/lib/test-store.ts` — the process-wide in-memory `testStore` singleton hung off `globalThis`; mirrors the Neon tables for users, burner profiles, ID docs, questionnaire edits, invite codes, broadcasts, and deliveries. `server-only`.
- `apps/web/app/api/test/login/route.ts` — POST sets / DELETE clears the synthetic auth cookie that `getAuthenticatedUser()` reads in place of Neon Auth.
- `apps/web/app/api/test/reset/route.ts` — POST wipes the in-memory store and the auth cookie (used in `beforeEach`).
- `apps/web/app/api/test/seed-invite/route.ts` — POST inserts a row into the in-memory `invite_codes` store.
- `apps/web/app/api/test/complete-onboarding/route.ts` — POST marks a test user's burner profile complete (skips the 12-page wizard walk).
- `apps/web/app/api/test/set-rank/route.ts` — POST forces a test user's rank (`captain`/`member`).
- `apps/web/app/api/test/set-approval/route.ts` — POST forces a test user's `approvalStatus` (`pending`/`approved`/`rejected`).
- `apps/web/app/api/test/inspect/route.ts` — GET read-only view into the store (by `authUserId` or `code`).
- `apps/web/tests/e2e/_helpers.ts` — Playwright client wrappers (`login`, `resetTestState`, `completeOnboarding`, `redeemInviteAtGate`, `setRank`, `logoutAll`) that drive the seam.

**Purpose:** Provide a server-only, env-gated bypass of Neon Auth and Neon Postgres so Playwright E2E specs can drive authenticated, gated flows deterministically without a real session or database. The entire seam is dormant unless `process.env.E2E_TEST_MODE === "1"` (set only by `playwright.config.ts`'s `webServer.env`); production never sets it, so the `/api/test/*` routes all 404 and the auth/DB helpers always fall through to the real backends. When active, a `globalThis`-scoped in-memory `testStore` stands in for the user / burner-profile / ID-doc / invite-code / broadcast / delivery tables, and a `camp404_test_user` cookie stands in for a Neon Auth session. The `/api/test/*` routes are thin HTTP shells that mutate or read that store; the store is also consumed in-process by the real app code (auth, users, access-control, notifications, forms, invite-check, feedback, avatar/uploads, push) which branch to a test backend whenever `isE2ETestMode()`.

## Features

### isE2ETestMode + TEST_USER_COOKIE (lib/test-mode.ts)
- `isE2ETestMode(): boolean` returns `process.env.E2E_TEST_MODE === "1"` (test-mode.ts:11-13). The single source of truth for whether any of the seam is live.
- `TEST_USER_COOKIE = "camp404_test_user"` (test-mode.ts:9) — the cookie name read by `getAuthenticatedUser()` (auth.ts:48) and written/deleted by the login + reset routes.
- File is `import "server-only"` (test-mode.ts:1).

### testStore singleton (lib/test-store.ts)
- State lives at `globalThis["__camp404TestStore__"]` (test-store.ts:106), lazily created by `globalState()` (test-store.ts:108-126). Rationale (verbatim comment): Next.js gives RSC renders and route handlers separate module graphs in the same process, so a plain module-level singleton would be duplicated and the two halves of a spec wouldn't see each other's writes; hanging state off `globalThis` keeps every module-graph copy pointed at the same store (test-store.ts:97-105).
- Map/array bindings (`usersByAuthId`, `profilesByUserId`, `idDocsByUserId`, `inviteCodes`, `questionnaireEdits`, `broadcasts`, `deliveries`) are captured once as stable references; `nextSerial` is a primitive so it is read/written through `S` (test-store.ts:128-137).
- IDs: `nextId()` returns `` `test-user-${S.nextSerial++}` `` (test-store.ts:146-148); questionnaire edits get `` `test-edit-${S.nextSerial++}` `` (test-store.ts:289); broadcasts and deliveries get `crypto.randomUUID()` (test-store.ts:363, 426).
- Exposes a fat object of methods grouped: users, burner profile, ID documents, questionnaire edit log, invite codes, announcements & notifications, and `reset()`. (Full method list below under Sub-components.)
- File is `import "server-only"` (test-store.ts:1).

### POST /api/test/login (app/api/test/login/route.ts)
- `runtime = "nodejs"` (line 9). 404s if not in test mode (lines 18-20).
- Parses JSON body `LoginBody { id?, email?, displayName? }`; on parse failure defaults to `{}` (line 21).
- Builds the synthetic user: `id = body.id ?? `test-stack-${Date.now()}``; `primaryEmail = body.email ?? null`; `displayName = body.displayName ?? body.email ?? null` (lines 22-26).
- Sets the `camp404_test_user` cookie to `encodeURIComponent(JSON.stringify(user))` with `httpOnly: true`, `secure: process.env.NODE_ENV === "production"`, `sameSite: "lax"`, `path: "/"`, `maxAge: 60 * 60` (1 hour) (lines 28-35).
- Returns `{ ok: true, user }` (line 36). Note: only sets the auth cookie — does NOT create a `testStore` user row; the row is created lazily on first authenticated gated page load via `ensureCampUser` (users.ts:60-95).

### DELETE /api/test/login (app/api/test/login/route.ts)
- 404s if not in test mode (lines 40-42). Deletes the `camp404_test_user` cookie and returns `{ ok: true }` (lines 43-45). (No store mutation.)

### POST /api/test/reset (app/api/test/reset/route.ts)
- `runtime = "nodejs"` (line 8). 404s if not in test mode (lines 11-13).
- Calls `testStore.reset()` (clears all maps/arrays, resets `nextSerial = 1`) then deletes the `camp404_test_user` cookie; returns `{ ok: true }` (lines 14-17). Intended for `beforeEach` (line 6 comment).

### POST /api/test/seed-invite (app/api/test/seed-invite/route.ts)
- `runtime = "nodejs"` (line 8). 404s if not in test mode (lines 21-23).
- Body `SeedBody { code, createdByUserId?, note?, maxUses?, expiresAt?, assignedRank?, requiresApproval? }` (lines 10-18); parse failure → `{}` (line 24).
- Validation: `code` must be a non-empty string, else 400 `{ error: "code is required" }` (lines 25-30).
- Calls `testStore.seedInviteCode(...)` mapping `createdByUserId ?? null`, `note ?? null`, `maxUses ?? null`, `expiresAt ? new Date(body.expiresAt) : null`, `assignedRank ?? null`, `requiresApproval ?? false` (lines 31-39).
- Does NOT forward `invitedEmail` even though `testStore.seedInviteCode` supports it (see Validation/edge cases).
- Returns `{ ok: true, inviteCode: row }` (the full seeded row) (line 40).

### POST /api/test/complete-onboarding (app/api/test/complete-onboarding/route.ts)
- `runtime = "nodejs"` (line 11). 404s if not in test mode (lines 18-20).
- Body `Body { authUserId? }` (lines 13-15); parse failure → `{}` (line 21).
- Validation: missing `authUserId` → 400 `{ error: "authUserId is required" }` (lines 22-27).
- Looks up the user via `testStore.findUserByAuthId`; missing → 404 ``{ error: `No user for authUserId ${body.authUserId}` }`` (lines 28-34).
- Calls `testStore.upsertProfile({ userId: user.id, version: "e2e-test", responses: {}, markComplete: true })` (lines 35-40). Returns `{ ok: true }` (line 41).
- Shortcuts the 12-page burner-profile wizard (whose page-by-page nav/validation/submission is covered at the component layer `components/__tests__/wizard.test.tsx`) so specs reach the post-onboarding gates (home, `/pending-approval`).

### POST /api/test/set-rank (app/api/test/set-rank/route.ts)
- `runtime = "nodejs"` (line 10). 404s if not in test mode (lines 18-20).
- Body `Body { authUserId?, rank?: "captain" | "member" }` (lines 12-15); parse failure → `{}` (line 21).
- Validation: missing `authUserId` OR `rank` not exactly `"captain"`/`"member"` → 400 `{ error: "authUserId and rank (captain|member) required" }` (lines 22-27).
- User-not-found → 404 ``{ error: `No user for authUserId ${body.authUserId}` }`` (lines 28-34).
- Calls `testStore.setUserRank(user.id, body.rank)` then returns `{ ok: true }` (lines 35-36). Promotes a user to captain to reach captain-only surfaces without minting a captain invite.

### POST /api/test/set-approval (app/api/test/set-approval/route.ts)
- `runtime = "nodejs"` (line 11). 404s if not in test mode (lines 18-20).
- Body `Body { authUserId?, status?: "pending" | "approved" | "rejected" }` (lines 13-16); parse failure → `{}` (line 22).
- Validation: missing `authUserId` OR `status` not exactly `"pending"`/`"approved"`/`"rejected"` → 400 `{ error: "authUserId and status (pending|approved|rejected) required" }` (lines 23-33).
- User-not-found → 404 ``{ error: `No user for authUserId ${body.authUserId}` }`` (lines 34-40).
- Calls `testStore.setUserApprovalStatus(user.id, body.status)` then `{ ok: true }` (lines 41-42). NOTE: uses the bare `setUserApprovalStatus` (no decider stamp), NOT `setUserApproval` — so `approvalDecidedByUserId` / `approvalDecidedAt` stay null. Used to exercise the gate's rejected/approved branches without driving the captain camp-management UI (which reads the real Neon DB and so isn't reachable under E2E_TEST_MODE).

### GET /api/test/inspect (app/api/test/inspect/route.ts)
- `runtime = "nodejs"` (line 9). 404s if not in test mode (lines 12-14).
- Reads query params `authUserId` and `code` (lines 15-17).
- If `authUserId`: looks up the user. Missing → `{ user: null }` (line 21). Found → resolves the invite as `user.inviteCode ? (findUsableInviteCode(user.inviteCode) ?? { code: user.inviteCode, createdByUserId: null }) : null` and returns `{ user, inviteCode: invite }` (lines 19-30).
- Else if `code`: returns `{ inviteCode: testStore.findUsableInviteCode(code) }` (which may be null) (lines 32-36).
- Else: 400 `{ error: "Pass ?authUserId=... or ?code=..." }` (lines 38-41).
- Read-only: lets specs assert on internal state (e.g. did a user's row record the invite code another user issued) without a real DB.

### Playwright client helpers (tests/e2e/_helpers.ts)
- `login(page, user: LoginUser = {})` POSTs `/api/test/login` via `page.request` (shares the browser context cookie jar); throws `` `login failed: ${res.status()}` `` if not ok (lines 32-35). Cookie-jar caveat: must use `page.request`, not the standalone `request` fixture, or navigations won't be authenticated (lines 11-17, 25-31).
- `resetTestState(request)` POSTs `/api/test/reset` (lines 38-42).
- `completeOnboarding(request, authUserId)` POSTs `/api/test/complete-onboarding` with `{ authUserId }`; throws `` `completeOnboarding failed: ${res.status()}` `` (lines 55-65). Requires the user row to already exist (hit a gated page once after login so `ensureCampUser` creates it).
- `redeemInviteAtGate(page, code)` navigates to `/signup/required`, waits for the `Invite code` label, fills the code, clicks the `Enter camp` button (lines 73-81). Drives the real redeem flow (not the seam).
- `setRank(request, authUserId, rank)` POSTs `/api/test/set-rank` with `{ authUserId, rank }`; throws `` `setRank failed: ${res.status()}` `` (lines 89-98).
- `logoutAll(context)` clears all cookies on a browser context (lines 101-103). (No `/api/test/login` DELETE call — clears cookies directly.)
- `LoginUser { id?, email?, displayName? }` interface (lines 19-23).

### In-process consumers that branch on isE2ETestMode (not /api/test/* but part of the contract)
These are the real app code paths the seam relies on; each picks the test backend / store when `isE2ETestMode()`:
- `lib/auth.ts` — `getAuthenticatedUser()` reads `camp404_test_user` first in test mode, bypassing Neon Auth (auth.ts:25-37); `readTestUserCookie()` JSON-decodes the cookie, requires a non-empty string `id`, else null (auth.ts:46-61).
- `lib/users.ts` — `ensureCampUser`, `redeemInviteForUser`, `getBurnerProfile`, `findCampUserByAuthId`, etc. all switch `store = isE2ETestMode() ? testBackend : realBackend` (users.ts:64, 118, 165, 177, ...). `testBackend.isTeamLead()` always returns `false` ("the in-memory store models no team memberships, so nobody is a lead", users.ts:447-450). `seedBurnerProfileAction`/`satisfyBurnerProfileAction`/`getPendingRequiredActions` are no-ops/`[]` under test mode (users.ts:192-217).
- `lib/access-control.ts` — `consumeDbCode` calls `testStore.consumeInviteCode(code)` in test mode (access-control.ts:63-68); env codes (e.g. `TEST-INVITE`) short-circuit before the store.
- `lib/notifications.ts` — full `testBackend` mapping all announcement/inbox methods to `testStore` (notifications.ts:84-119).
- `lib/forms.ts` — `recordQuestionnaireEdit` / `listQuestionnaireEdits` route to `testStore` in test mode (forms.ts:144-158).
- `app/api/tools/invite/check/route.ts` — availability check uses `testStore.findUsableInviteCode(raw)` in test mode (route.ts:57-59).
- `app/feedback/actions.ts` — short-circuits before AI/GitHub, returning `{ ok: true, number: 0, url: `https://github.com/${DEFAULT_REPO}/issues` }` in test mode (actions.ts:97-100).
- `lib/account.ts` — `isE2ETestMode()` returns `{ lostCatNumber: 0 }` (account.ts:11).
- `lib/push.ts` — push subscribe/notify are no-ops in test mode (push.ts:23, 32).
- `app/api/avatar/route.ts` & `app/api/uploads/avatar/route.ts` — bypass the token/blob path in test mode (avatar route.ts:46; uploads route.ts:72).

## User actions & interactions
This is a server/test-harness seam; "users" are E2E specs (via Playwright `request`/`page.request`) and, transitively, the app code. There is no human-facing UI in this unit.
- Sign in synthetically: `POST /api/test/login` (or `login(page, user)`), optionally specifying `id`/`email`/`displayName`.
- Sign out / clear session: `DELETE /api/test/login` (cookie delete) or `logoutAll(context)` (clear all cookies).
- Reset the world between specs: `POST /api/test/reset` (or `resetTestState(request)`).
- Seed an invite code: `POST /api/test/seed-invite` with at least `{ code }`.
- Fast-forward onboarding: `POST /api/test/complete-onboarding` with `{ authUserId }` (or `completeOnboarding(request, authUserId)`).
- Force a rank: `POST /api/test/set-rank` with `{ authUserId, rank }` (or `setRank(request, authUserId, rank)`).
- Force an approval status: `POST /api/test/set-approval` with `{ authUserId, status }`.
- Inspect store state: `GET /api/test/inspect?authUserId=...` or `?code=...`.
- Redeem an invite through the real gate (not the seam): `redeemInviteAtGate(page, code)` → navigates `/signup/required`, fills `Invite code`, clicks `Enter camp`.
- Implicit/required precondition: after login, hit a gated page (e.g. `/`) once so `ensureCampUser` lazily creates the test-store user row before calling complete-onboarding / set-rank / set-approval (which all 404 on a missing row).

## States & presentations
The seam exposes/forces the GLOBAL-STATES gating rows so specs can reach each downstream screen state; the routes themselves have only request/response states.

Route-level states:
- **Disabled / not-found:** any `/api/test/*` route returns HTTP 404 `{ error: "Not found" }` when `!isE2ETestMode()` (every route). This is the production-safety "off" state.
- **Validation-error:** 400 with a specific message — seed-invite (`code is required`), complete-onboarding (`authUserId is required`), set-rank (`authUserId and rank (captain|member) required`), set-approval (`authUserId and status (pending|approved|rejected) required`), inspect (`Pass ?authUserId=... or ?code=...`).
- **Not-found (entity):** complete-onboarding / set-rank / set-approval return 404 ``No user for authUserId ${...}`` when the row doesn't exist yet.
- **Success:** `{ ok: true }` (+ payload for login/seed-invite/inspect).
- **Empty:** inspect returns `{ user: null }` (unknown authUserId) or `{ inviteCode: null }` (unknown/unusable code). Fresh store after reset is empty.

Gating states this seam SETS UP for downstream screens:
- **Invite-gated** (`hasCampAccess` → `/signup/required`): a logged-in test user with no row / no `inviteCode` is synthetic-only (`id: ""`, users.ts:86-94); seeding+redeeming a code clears the gate.
- **Onboarding-incomplete** (nextGate → `/onboarding/questionnaire`): under test mode `getPendingRequiredActions` returns `[]`, so the gate is driven instead by the legacy `completedAt` fallback — complete-onboarding sets `completedAt` to satisfy it.
- **Pending-approval** (`approval_status='pending'` → `/pending-approval`): `set-approval status=pending`.
- **Rejected** (`approval_status='rejected'`, terminal): `set-approval status=rejected`.
- **Captain-only-locked** (rank below surface → visible-but-locked): `set-rank rank=member`; `set-rank rank=captain` unlocks captain surfaces.

Notes: this unit has NO offline/sync states and NO budget/over-target states (consistent with product scope).

## Enums, options & configurable values
- `TestRank = "captain" | "member"` (test-store.ts:9) — mirrors `rankEnum`/schema.ts:31. set-rank and seed-invite accept exactly these two literals.
- `TestApprovalStatus = "pending" | "approved" | "rejected"` (test-store.ts:10) — mirrors `approval_status` enum (schema.ts:41). set-approval accepts exactly these three literals.
- `TestPresentation = "acknowledge" | "popup" | "feed"` (test-store.ts:59) — mirrors `broadcast_presentation` enum (schema.ts:166-170).
- `TEST_USER_COOKIE = "camp404_test_user"` (test-mode.ts:9).
- `GLOBAL_KEY = "__camp404TestStore__"` (test-store.ts:106).
- Cookie options: `httpOnly: true`, `secure` iff `NODE_ENV === "production"`, `sameSite: "lax"`, `path: "/"`, `maxAge: 60 * 60` seconds (login route.ts:30-34).
- Synthetic auth-user id fallback: `` `test-stack-${Date.now()}` `` (login route.ts:23).
- Generated ids: users `` `test-user-${n}` ``; edits `` `test-edit-${n}` ``; broadcasts/deliveries `crypto.randomUUID()`.
- `nextSerial` starts at `1`, reset to `1` (test-store.ts:122, 566).
- complete-onboarding stamps profile `version: "e2e-test"`, `responses: {}` (route.ts:38-39).
- `listQuestionnaireEdits` default `limit = 20` (test-store.ts:301).
- Defaults applied in `createUser`: `rank ?? "member"`, `approvalStatus ?? "approved"`, `profileImageUrl: null`, decider fields null (test-store.ts:166-174).
- Defaults applied in `seedInviteCode`: `createdByUserId/note/maxUses/expiresAt/assignedRank/invitedEmail ?? null`, `useCount: 0`, `revokedAt: null`, `requiresApproval ?? false` (test-store.ts:323-335).
- Playwright env fixtures (config-level, not this module): `E2E_TEST_MODE: "1"`, `INVITE_CODES: "TEST-INVITE"`, `GOD_EMAILS: "god@example.com"` (playwright.config.ts:52-54). Runner: serial, `workers: 1`, `fullyParallel: false`, `retries` 2 in CI else 0, per-test `timeout: 60_000`, `expect.timeout: 10_000` (playwright.config.ts:16-25).

## Data model touched
In-memory mirrors of the Neon/Drizzle tables (must agree with unit 29). Field names below are the in-store TS field names; the schema column is noted where it differs.

- **TestUser** (mirrors `users`, schema.ts:223-274): `id`, `authUserId`, `displayName` (col `display_name`), `profileImageUrl` (col `profile_image_url`), `inviteCode` (col `invite_code`), `rank` (`rankEnum`), `approvalStatus` (col `approval_status`), `approvalDecidedByUserId` (col `approval_decided_by_user_id`), `approvalDecidedAt` (col `approval_decided_at`), `createdAt`, `updatedAt` (test-store.ts:12-24). Keyed by `authUserId` in `usersByAuthId`.
- **TestBurnerProfile** (mirrors `burner_profiles`): `userId`, `version`, `responses: Record<string, unknown>`, `startedAt`, `completedAt: Date | null`, `updatedAt` (test-store.ts:26-33). Keyed by `userId` in `profilesByUserId`.
- **ID documents** (mirrors `users`' encrypted ID columns; raw here, "no crypto" per test-store.ts:265): `{ idType: string | null; idNumber: string | null }` keyed by `userId` in `idDocsByUserId` (test-store.ts:89, 267-277).
- **TestQuestionnaireEdit** (mirrors questionnaire edit log): `id`, `userId`, `questionnaireKey`, `version`, `editedByUserId: string | null`, `changes: QuestionnaireFieldChange[]` (from `@camp404/types`), `createdAt` (test-store.ts:35-43). Stored in `questionnaireEdits[]`.
- **TestInviteCode** (mirrors `invite_codes`, schema.ts:313-336): `code`, `createdByUserId` (col `created_by_user_id`), `note`, `maxUses` (col `max_uses`), `useCount` (col `use_count`, default 0), `expiresAt` (col `expires_at`), `revokedAt` (col `revoked_at`), `assignedRank` (col `assigned_rank`, `rankEnum`), `invitedEmail` (col `invited_email`, schema.ts:331), `requiresApproval` (col `requires_approval`, default false), `createdAt` (test-store.ts:45-57). Keyed by `code` in `inviteCodes`. (`invited_email` IS a real schema column; the in-store `invitedEmail` is never forwarded by the seed-invite route's `SeedBody`, so it is an orphan through the HTTP seam — see edge cases.)
- **TestBroadcast** (mirrors `broadcasts`, schema.ts:783-795): `id`, `senderId: string | null`, `title`, `body`, `presentation` (`broadcast_presentation`), `publishedAt: Date | null` (col `published_at`; null while draft), `createdAt` (test-store.ts:64-72). Stored in `broadcasts[]`.
- **TestDelivery** (mirrors `notification_deliveries`, schema.ts:844-860): `id`, `broadcastId: string | null`, `userId`, `title`, `body`, `presentation` (self-contained copy), `readAt: Date | null`, `acknowledgedAt: Date | null` (col `acknowledged_at`), `createdAt` (test-store.ts:74-84). Stored in `deliveries[]`.
- **AuthenticatedUser** (auth shape the cookie produces): `{ id, primaryEmail: string | null, displayName: string | null }` (auth.ts:13-17).
- Derivations the test backend hard-codes: team-lead always `false` (`is_lead`, schema.ts:455, never modeled in-store); driver/`intends_to_drive` not modeled at all.

## Validation, edge cases & business rules
- **Production safety:** every `/api/test/*` route's first statement is the `isE2ETestMode()` guard → 404 otherwise; the modules are `server-only`; the comment in test-mode.ts:3-7 explicitly warns never to set the flag in deployed environments.
- **JSON parse tolerance:** all POST bodies use `.catch(() => ({}))`, so malformed/empty bodies fall through to the validation checks rather than throwing.
- **Lazy user creation ordering:** complete-onboarding, set-rank, set-approval all 404 if no test-store row exists yet. The row is only created by `ensureCampUser` (god account → real row; otherwise a synthetic non-persisted `id:""` row) or by `redeemInviteForUser`. So specs must hit a gated page after login before forcing rank/approval/onboarding. `login` alone does NOT create a row.
- **Cookie-jar pitfall:** `login` must use `page.request` (shares the browser context jar); other helpers only mutate the process-wide store (keyed by `authUserId`) so they're fine on the standalone `request` fixture (_helpers.ts:11-17).
- **Cookie validity:** `readTestUserCookie` requires a parseable JSON object with a non-empty string `id`; otherwise returns null (treated as unauthenticated). Defaults `primaryEmail`/`displayName` to null (auth.ts:50-60).
- **set-approval uses the non-stamping setter:** it calls `setUserApprovalStatus` (no decider), unlike `setUserApproval` which records `approvalDecidedByUserId`/`approvalDecidedAt` — so test-forced approvals leave the decider fields null.
- **Invite usability rules** (`findUsableInviteCode`, test-store.ts:339-346): null if not found, if `revokedAt` set, if `expiresAt <= now`, or if `maxUses !== null && useCount >= maxUses`. `consumeInviteCode` re-checks usability then increments `useCount` (test-store.ts:347-352) — atomic at the single-method level (and the runner is single-worker, so no real concurrency).
- **inspect invite fallback:** when a user's `inviteCode` is no longer usable (revoked/expired/used-up), inspect still returns a minimal `{ code, createdByUserId: null }` rather than null, so specs can see the recorded code (route.ts:22-24).
- **`invitedEmail` orphan field:** `TestInviteCode.invitedEmail` and the `seedInviteCode` `invitedEmail` param exist (test-store.ts:54, 320, 332) but the seed-invite route's `SeedBody` does NOT expose `invitedEmail` and never forwards it, so it is always null via the route. Effectively dead through the HTTP seam.
- **reset semantics:** clears all maps, truncates arrays via `.length = 0`, and resets `S.nextSerial = 1` — restoring deterministic ids for the next spec (test-store.ts:558-567). reset route also deletes the auth cookie (but `logoutAll` does not call reset).
- **publishBroadcast recipient rule:** fans out one delivery per user whose `u.id !== senderId` (sender excluded), returns `{ ok: true, recipientCount }`; returns `{ ok: false, error: "Draft not found, already published, or not yours." }` if the draft isn't found / already published / not owned by sender (test-store.ts:404-438). Draft update/delete also require `publishedAt === null` and matching `senderId` (test-store.ts:374-403).
- **Acknowledge rule:** `getPendingAcknowledgements`/`acknowledgeDelivery` only consider deliveries with `presentation === "acknowledge"` and `acknowledgedAt === null`; acknowledging stamps both `acknowledgedAt` and `readAt` (test-store.ts:472-513).
- **upsertProfile:** updates existing row in place (preserving `startedAt`), only sets `completedAt` when `markComplete` (test-store.ts:241-264). complete-onboarding always passes `markComplete: true`.
- **No real side effects in test mode:** AI/GitHub feedback, push notifications, blob/avatar token paths, and `account.lostCatNumber` are all stubbed (see consumers list) — specs exercise auth + validation only.
- **Stale comment / debt:** users.ts:187-191 notes required_actions helpers are real-DB only and that "the legacy `completedAt` fallback still present in the home gate preserves test behaviour until a test-store implementation lands" — confirms the onboarding gate under test mode is `completedAt`-driven, not required_actions-driven.

## Sub-components / variants
Server-only unit — the handlers/validators/store methods:

**Route handlers (all gated on `isE2ETestMode()`, `runtime = "nodejs"`):** `POST/DELETE /api/test/login`, `POST /api/test/reset`, `POST /api/test/seed-invite`, `POST /api/test/complete-onboarding`, `POST /api/test/set-rank`, `POST /api/test/set-approval`, `GET /api/test/inspect`.

**testStore methods (lib/test-store.ts):**
- Users: `findUserByAuthId`, `createUser`, `setUserInviteCode`, `setUserRank`, `setUserApprovalStatus`, `setUserApproval` (stamps decider), `setProfileImage`, `setDisplayName`.
- Burner profile: `getProfile`, `upsertProfile`.
- ID documents (raw, no crypto): `setIdDocuments`, `getIdDocuments`.
- Questionnaire edit log: `recordQuestionnaireEdit`, `listQuestionnaireEdits` (default limit 20, sorted desc by `createdAt`).
- Invite codes: `seedInviteCode`, `findUsableInviteCode`, `consumeInviteCode`.
- Announcements & notifications: `createBroadcastDraft`, `updateBroadcastDraft`, `deleteBroadcastDraft`, `publishBroadcast`, `listBroadcasts` (with `recipientCount`/`acknowledgedCount` rollups), `getPendingAcknowledgements`, `acknowledgeDelivery`, `listInbox`, `countUnread`, `markRead`.
- Lifecycle: `reset`.
- Internal (module-private, not on `testStore`): `globalState`, `findUserById`, `nextId`.

**Playwright helper functions (tests/e2e/_helpers.ts):** `login`, `resetTestState`, `completeOnboarding`, `redeemInviteAtGate`, `setRank`, `logoutAll` (+ `LoginUser` interface).

**Dead / orphaned / unused-through-seam:**
- `testStore.setUserApproval` (decider-stamping) is NOT used by set-approval (which uses the bare `setUserApprovalStatus`); it is reachable via the in-process `redeemInviteForUser`/captain flows' `testBackend.setUserApproval` mapping (users.ts:428-430) but not via any `/api/test/*` route.
- `TestInviteCode.invitedEmail` / `seedInviteCode` `invitedEmail` param: present in the store but never settable through the seed-invite route (always null in practice).
- Many `testStore` methods (broadcasts, deliveries, ID docs, questionnaire edits, `setProfileImage`, `setDisplayName`, `getProfile`, `findUsableInviteCode`) have NO dedicated `/api/test/*` route — they are exercised only through the in-process `testBackend` wrappers (users.ts, notifications.ts, forms.ts, access-control.ts) and read back via `/api/test/inspect` (users/invites only) or in the rendered UI.
- `_helpers.ts` `logoutAll` clears cookies directly and never calls `DELETE /api/test/login`; the DELETE handler is thus only reachable by specs that call it explicitly.
