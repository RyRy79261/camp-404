# 23 — Auth, session & access-control gating chain

**Files covered:**
- `apps/web/lib/auth.ts` — the `AuthenticatedUser` shape + `getAuthenticatedUser` / `getAuthenticatedUserOrRedirect`; reads Neon Auth session or (in E2E) the test-user cookie.
- `apps/web/lib/auth-client.ts` — client-side Neon Auth (Better Auth) instance (`authClient`) for `useSession()` / `signIn.social()`.
- `apps/web/lib/neon-auth.ts` — server-side Neon Auth instance (`auth`); configures baseUrl + cookie secret + `sameSite: "lax"`.
- `apps/web/lib/users.ts` — `ensureCampUser`, `redeemInviteForUser`, `hasCampAccess`, `isApproved`, `isTeamLead`, `decideUserApproval`, required-action seed/satisfy/read helpers, the real/test backend abstraction.
- `apps/web/lib/access-control.ts` — `isGodEmail` (GOD_EMAILS), `claimInviteCode` (env-code vs DB-code atomic claim), `ClaimedInvite`.
- `apps/web/lib/required-actions.ts` — `nextGate(actions)` + `ACTION_ROUTES` registry; maps a pending blocking required action to its gate route.
- `packages/db/src/activations.ts` — `openActivation`, `ensureRequiredAction`, `satisfyRequiredAction`, `getPendingRequiredActions`, `PendingRequiredAction` (the `required_actions` producer + satisfaction).
- `apps/web/app/api/auth/[...path]/route.ts` — catch-all Better Auth API handler (`auth.handler()` → `GET`/`POST`).

Adjacent files read to map the full spine (not the primary unit but load-bearing):
- `apps/web/lib/test-mode.ts` — `isE2ETestMode()` + `TEST_USER_COOKIE` constant.
- `apps/web/lib/test-store.ts` — in-memory `globalThis` test store backing E2E mode.
- `apps/web/proxy.ts` — `auth.middleware` running the OAuth verifier→cookie exchange on `/auth/*` and `/mcp/*`.
- `apps/web/app/page.tsx` — the canonical gating-spine consumer (home redirect chain).
- `apps/web/app/signup/required/page.tsx` + `actions.ts` + `invite-gate-form.tsx` — the invite gate.
- `apps/web/app/pending-approval/page.tsx` — the captain-approval gate.
- `apps/web/app/auth/page.tsx` + `app/auth/[path]/page.tsx` — sign-in/up routing + OAuth landing.
- `apps/web/app/onboarding/questionnaire/actions.ts` — `saveBurnerProfile` (satisfies the burner-profile gate).
- `apps/web/app/api/test/{login,reset,set-approval,set-rank,complete-onboarding,seed-invite,inspect}/route.ts` — E2E test harness routes that drive gating states.
- `packages/db/src/{invite-codes.ts,roster.ts,burner-profile.ts,versions.ts,crypto.ts}` + `packages/db/src/schema.ts` — DB layer the helpers call.

**Purpose:** This unit is the redirect SPINE every authenticated screen depends on. It answers, in a fixed order, four questions about the current request's user: (1) Are you authenticated? (2) Do you have camp access — a god email or a redeemed invite code? (3) Do you have any pending blocking obligations (the generic `required_actions` gate, today the burner profile)? (4) Has a captain approved you? Each "no" routes to a dedicated gate page that has a built exit. The unit also owns the lazy creation of the `users` (camp-user) row, the atomic invite-code claim, the god-email bypass, the derived `team_lead` rank, and a full E2E test-mode bypass (cookie auth + in-memory store) gated behind `E2E_TEST_MODE=1`.

---

## Features

### Authentication read (`apps/web/lib/auth.ts`)
- `AuthenticatedUser` interface: `{ id: string; primaryEmail: string | null; displayName: string | null }` (auth.ts:13-17). This is the minimal shape both Neon Auth's session and the test harness produce.
- `getAuthenticatedUser(): Promise<AuthenticatedUser | null>` (auth.ts:25-37):
  - If `isE2ETestMode()` is true, first tries the `camp404_test_user` cookie via `readTestUserCookie()`; if present it WINS and Neon Auth is bypassed entirely (auth.ts:26-29).
  - Otherwise `await auth.getSession()`; returns null if `session?.user` is falsy (auth.ts:30-31).
  - Maps the Neon Auth session to `{ id: session.user.id, primaryEmail: session.user.email ?? null, displayName: session.user.name ?? null }` (auth.ts:32-36).
- `getAuthenticatedUserOrRedirect(): Promise<AuthenticatedUser>` (auth.ts:40-44): same as above but `redirect("/auth/sign-in")` when unauthenticated.
- `readTestUserCookie()` (auth.ts:46-61): reads `TEST_USER_COOKIE`, `JSON.parse(decodeURIComponent(raw))`, requires a non-empty string `id` or returns null; defaults `primaryEmail`/`displayName` to null; any parse error → null.

### Neon Auth instances (`neon-auth.ts`, `auth-client.ts`)
- Server (`neon-auth.ts:25-35`): `createNeonAuth({ baseUrl, cookies: { secret, sameSite: "lax" } })`.
  - `baseUrl = process.env.NEON_AUTH_BASE_URL ?? PLACEHOLDER_BASE_URL` where `PLACEHOLDER_BASE_URL = "https://build-placeholder.neon-auth.invalid"` (neon-auth.ts:21,26).
  - `secret = process.env.NEON_AUTH_COOKIE_SECRET ?? PLACEHOLDER_COOKIE_SECRET` where the placeholder is the 50-char `"build-placeholder-secret-build-placeholder-secret"` — secret MUST be ≥32 chars or `createNeonAuth` throws on import (neon-auth.ts:18-23,28).
  - `sameSite: "lax"` chosen deliberately (NOT strict) so cross-site top-level navigations (claude.ai → `/api/mcp/oauth/authorize` → `/mcp/connect`) carry the session cookie (neon-auth.ts:29-33).
- Client (`auth-client.ts:14`): `export const authClient = createAuthClient();` — same-origin fetches to `/api/auth/*`, no base URL. Exposes `authClient.useSession()`, `authClient.signIn.social({ provider: "google" })`.

### Better Auth API handler (`app/api/auth/[...path]/route.ts`)
- `export const { GET, POST } = auth.handler();` (route.ts:8). Proxies Better Auth's whole API surface: sign-in, sign-up, session, OAuth callbacks, etc.
- NOTE (route.ts:4-7): the OAuth verifier-to-cookie exchange does NOT run here — it runs in `proxy.ts` (`auth.middleware`). Without that middleware, social sign-in returns the user with a `session_verifier` in the URL but no session cookie is ever set.

### OAuth verifier exchange (`proxy.ts`)
- `export default auth.middleware({ loginUrl: "/auth/sign-in" });` (proxy.ts).
- `config.matcher = ["/auth", "/auth/:path*", "/mcp/:path*"]` — scoped to the OAuth return trip (`/auth/*`) and the MCP OAuth landing (`/mcp/connect`). Protected routes do their OWN session check in their server components via `getAuthenticatedUser()` (proxy.ts comment).

### Camp-user resolution & lazy creation (`users.ts`)
- `CampUser` interface (users.ts:39-47): `{ id, authUserId, displayName: string|null, profileImageUrl: string|null, inviteCode: string|null, rank: Rank, approvalStatus: ApprovalStatus }`. `Rank = "captain" | "member"`; `ApprovalStatus = "pending" | "approved" | "rejected"` (users.ts:32-33).
- `ensureCampUser(authUser): Promise<CampUser>` (users.ts:60-95):
  - Picks `testBackend` if `isE2ETestMode()` else `realBackend` (users.ts:64).
  - Returns an existing row if found (users.ts:65-66).
  - GOD ACCOUNTS (`isGodEmail(primaryEmail)`): on first sign-in, creates a real persisted row `{ displayName: displayName ?? primaryEmail, inviteCode: null, rank: "member", approvalStatus: "approved" }` and seeds the burner-profile required action (users.ts:70-80).
  - NON-GOD with no row and no invite: returns a SYNTHETIC, NON-PERSISTED row `{ id: "", authUserId, displayName: displayName ?? primaryEmail, profileImageUrl: null, inviteCode: null, rank: "member", approvalStatus: "approved" }` (users.ts:86-94). The empty `id` is never used because every caller checks `hasCampAccess` and redirects first; this avoids writing an orphan "signed in, no invite" row.
- `findCampUserByAuthId(authUserId): Promise<CampUser | null>` (users.ts:174-179): read-only lookup, no cookie/invite writes — for hot paths (e.g. gating the avatar proxy on every image load).
- `toCampUser(row)` (users.ts:462-480): normalizer; defaults `profileImageUrl ?? null`, `approvalStatus ?? "approved"`.

### Access predicates (`users.ts`, `access-control.ts`)
- `hasCampAccess(user: { inviteCode }, email): boolean` (users.ts:219-224): `isGodEmail(email) || !!user.inviteCode`. THIS IS THE INVITE GATE ONLY — a user can pass it but still be `pending`.
- `isApproved(user: { approvalStatus }, email): boolean` (users.ts:231-236): `isGodEmail(email) || user.approvalStatus === "approved"`. God accounts are always approved.
- `isTeamLead(userId): Promise<boolean>` (users.ts:244-247): delegates to backend. Real backend → `dbIsTeamLead` (any `team_memberships` row with `is_lead = true`, roster.ts:204-217). Test backend → always `false` (no membership concept; users.ts:448-450).
- `isGodEmail(email): boolean` (access-control.ts:28-32): case-insensitive membership test against CSV `process.env.GOD_EMAILS`; `null`/`undefined`/empty → false.

### Invite-code claim (`access-control.ts`, `users.ts`)
- `ClaimedInvite` (access-control.ts:10-15): `{ code: string; assignedRank: AssignedRank | null; requiresApproval: boolean }`. `AssignedRank = "captain" | "member"`.
- `claimInviteCode(code): Promise<ClaimedInvite | null>` (access-control.ts:43-57):
  - Trims; empty → null.
  - ENV CODE (`isEnvCode`: `csv(process.env.INVITE_CODES).includes(code)`, access-control.ts:59-61): pure validity check, returns `{ code, assignedRank: null, requiresApproval: false }` — unlimited bootstrap, never assigns rank, never requires approval (access-control.ts:48-49).
  - DB CODE: `consumeDbCode` → in test mode `testStore.consumeInviteCode`, else `dbConsumeInviteCode` (access-control.ts:63-68). Returns `null` on invalid/expired/revoked/exhausted/race-loser.
  - Carries `assignedRank` and `requiresApproval` from the consumed row.
- `consumeInviteCode` (invite-codes.ts:60-83): single atomic `UPDATE ... SET use_count = use_count + 1` with `revokedAt IS NULL`, not-expired, and `max_uses IS NULL OR max_uses > use_count` guards in the WHERE clause; `.returning()` — so two concurrent redeemers can't both win the last use.
- `redeemInviteForUser(authUser, rawCode): Promise<RedeemInviteResult>` (users.ts:111-153) — `RedeemInviteResult = { ok: true } | { ok: false; error: string }`:
  - Trims code; empty → `{ ok: false, error: "Please enter an invite code." }` (users.ts:115-116).
  - Short-circuit: god account OR existing `inviteCode` on file → `{ ok: true }` WITHOUT burning a use (users.ts:122-124).
  - `claimInviteCode` failure → `{ ok: false, error: "That invite code isn't valid." }` (users.ts:126-127).
  - EXISTING row: stamps `inviteCode`; if `assignedRank` differs from current rank, sets rank; if `requiresApproval` and status not already `pending`, tightens to `pending` (users.ts:129-138). Comment: "A vetting-required code only ever tightens access into the queue."
  - FIRST TIME: creates a row stamped with the code, `rank: assignedRank ?? "member"`, `approvalStatus: requiresApproval ? "pending" : "approved"`, and seeds the burner-profile required action (users.ts:144-151).

### Required-actions gate (`required-actions.ts`, `activations.ts`, `users.ts`)
- `ACTION_ROUTES` registry (required-actions.ts:7-11): `{ burner_profile: "/onboarding/questionnaire" }`. Comment: `dietary_requirements` / `driver_profile` slot in here once their bespoke pages exist; until then their activations stay pending but DON'T gate (no mapped route).
- `PendingAction` (required-actions.ts:13-16): `{ actionKey: string; blocking: boolean }`.
- `nextGate(actions): string | null` (required-actions.ts:23-30): iterates in given order (oldest first); SKIPS non-blocking actions; returns the route of the first blocking action that maps to a built gate; null if none. This guarantees a user is never stranded behind a gate with no page.
- `seedBurnerProfileAction(userId)` (users.ts:192-201): no-op under E2E; else `ensureRequiredAction({ userId, type: "questionnaire", actionKey: "burner_profile", title: "Complete your burner profile", version: QUESTIONNAIRE.version })`.
- `satisfyBurnerProfileAction(userId)` (users.ts:204-209): no-op under E2E; else `dbSatisfyRequiredAction(userId, "burner_profile", QUESTIONNAIRE.version)`.
- `getPendingRequiredActions(userId)` (users.ts:212-217): returns `[]` under E2E; else `dbGetPendingRequiredActions(userId)`.
- DB producer `openActivation(activationId)` (activations.ts:36-131): marks a questionnaire activation `open`, fans out one `required_actions` row per matched member via `computeAudience`, idempotent via the `(user_id, action_key)` unique index (`onConflictDoUpdate` re-points version/activation/title/blocking, resets `status: "pending"`, `completedAt: null`). `scope === "opt_in"` returns `{ ok: false, error: "opt_in activations are not yet supported." }`. Unknown scope → `{ ok: false, error: "Unsupported activation scope: <scope>." }`. `PUSH_SCOPES = Set(["everyone","team","team_leads","individual"])` (activations.ts:14).
- `ensureRequiredAction(input)` (activations.ts:138-160): idempotent single-row seed (`onConflictDoNothing` on `(userId, actionKey)`); defaults `version ?? null`, `blocking ?? true`.
- `satisfyRequiredAction(userId, actionKey, completedVersion?)` (activations.ts:167-200): only acts if a row exists AND `status === "pending"`; VERSION-AWARE — if the row's required `version` and `completedVersion` are both set and `!meetsRequiredVersion(version, completedVersion)`, returns `false` and leaves the gate OPEN (a completion against an older version doesn't satisfy). Otherwise sets `status: "completed"`, `completedAt: new Date()`; returns whether a row changed.
- `getPendingRequiredActions(userId)` (activations.ts:203-226): selects rows where `userId` matches, `status = "pending"`, `blocking = true`, ordered `createdAt` ASC (gate order, oldest first).

### The gating SPINE as consumed by the home page (`app/page.tsx:29-63`)
Fixed order, each step its own redirect:
1. `getAuthenticatedUser()` → if null, render `<LandingHero />` (NOT a redirect; page.tsx:30-34).
2. `ensureCampUser(user)` → `if (!hasCampAccess(...)) redirect("/signup/required")` (page.tsx:39-42). **Invite gate.**
3. `nextGate(await getPendingRequiredActions(campUser.id))` → `if (gate) redirect(gate)` (page.tsx:47-48). **Required-actions gate.**
4. Belt-and-braces legacy fallback (page.tsx:50-56): `getBurnerProfile(campUser.id)` → `if (!profile?.completedAt) redirect("/onboarding/questionnaire")`. Comment marks this as a one-release transitional check until `required_actions` seeding is confirmed in prod — DROP once confirmed. This is also what enforces onboarding under E2E (where steps 3's helpers are no-ops).
5. `if (!isApproved(...)) redirect("/pending-approval")` (page.tsx:61-63). **Captain-approval gate.**
6. Past all gates: derives `viewerRank` (`campUser.rank === "captain" ? "captain" : isTeamLead(...) ? "team_lead" : "camp_member"`, page.tsx:73-78) and renders the ControlPanel.

## User actions & interactions
- **Sign in / sign up** (`app/auth/[path]/page.tsx`): `sign-up` path renders bespoke `<SignUpForm />` (sign-up is OPEN — invite check is deferred to the post-auth gate); `sign-in` path renders bespoke `<SignInForm />`; any other path (forgot/reset password, callback, sign-out, magic-link) falls through to Neon Auth's hosted `<AuthView path={path} />` (auth/[path]/page.tsx:19-47).
- **OAuth landing** (`app/auth/page.tsx`): after Google OAuth the proxy exchanges `?neon_auth_session_verifier=…` for a session cookie, then this page forwards authed users to `/` and unauthed to `/auth/sign-in` (auth/page.tsx:20-24).
- **Redeem invite code** (`signup/required/invite-gate-form.tsx` + `actions.ts`): a signed-in user enters a code in the `name="code"` input (autoComplete/spellCheck/autoCapitalize/autoCorrect off, `required`) and submits. `submitInviteCode` server action rate-limits, claims the code, and `redirect("/")` on success; on failure returns `{ ok: false, error }` rendered inline via `useActionState` (form stays on gate). Submit button: "Enter camp" → "Checking…" while `isPending`. Has a "Sign out" link (`/auth/sign-out`).
- **Sign out** is the escape hatch on every terminal gate: `/auth/sign-out` link on the invite gate (`invite-gate-form.tsx:66`) and on the pending/rejected screen (`pending-approval/page.tsx:87`).
- **Captain vetting decision** (`decideUserApproval`, users.ts:253-260): `{ userId, status: "approved" | "rejected", decidedByUserId }`. Caller (camp-management UI, out of this unit's scope) must gate on captain rank; this just persists the decision and stamps the deciding captain + timestamp for the audit trail.
- **Complete onboarding** (`onboarding/questionnaire/actions.ts` `saveBurnerProfile`): on `final` submit it re-checks `hasCampAccess` (redirect to `/signup/required` if lost), validates, persists, calls `satisfyBurnerProfileAction`, then `redirect("/")`. This is what closes gate-step 3/4.
- **E2E harness actions** (test-only, `app/api/test/*`): `POST /api/test/login` (set `camp404_test_user` cookie), `DELETE /api/test/login` (clear it), `POST /api/test/set-approval`, `POST /api/test/set-rank`, `POST /api/test/complete-onboarding`, `POST /api/test/seed-invite`, `/api/test/reset`, `/api/test/inspect`. All return `404 { error: "Not found" }` when `E2E_TEST_MODE !== "1"`.

## States & presentations
Global-states rows expressed BY this unit (it is the producer of all four gating states):

- **Invite-gated** — `hasCampAccess` false → `redirect("/signup/required")`. The gate page (`signup/required/page.tsx`) itself forwards back to `/` if access is (re)gained. Wrapped in `<AuthShell hideBack footer="Camp 404 is invite-only.">`.
- **Onboarding-incomplete** — `nextGate(pending blocking required_actions)` returns `/onboarding/questionnaire` (the only mapped route today), OR the legacy fallback `!profile?.completedAt`. Routes to the questionnaire.
- **Pending-approval** — `approvalStatus === "pending"` (and not god) → `redirect("/pending-approval")`. Page shows amber `Clock` icon, heading "Application submitted", body greeting by display name, "Sign out" button. The only exits: a captain approving (app unlocks on next load) or sign-out (pending-approval/page.tsx:46,74-84).
- **Rejected** — `approvalStatus === "rejected"` (TERMINAL). Same `/pending-approval` page but `destructive` `ShieldX` icon, heading "Application not approved", body "...wasn't approved for camp access this time. If you think this is a mistake, reach out to whoever invited you." (pending-approval/page.tsx:46,65-73). Only exit is sign-out.
- **Captain-only-locked** — surfaced via the derived `viewerRank` the spine computes (page.tsx:73-78); layers above the viewer's rank render visible-but-locked in the ControlPanel (that behaviour lives in unit 02/the ControlPanel itself).

Other applicable global-states:
- **Loading / Submitting** — invite form shows "Checking…" with `disabled` submit while `isPending` (invite-gate-form.tsx:57-59).
- **Validation-error** — invite redeem failures render inline (`role="alert"`, destructive colour) for: "Please enter an invite code.", "That invite code isn't valid.", "Too many attempts — wait a few minutes and try again." (rate-limit). `saveBurnerProfile` returns field errors / `_form` error.
- **Success** — successful redeem/onboarding → `redirect("/")`.
- **Unauthenticated (not a gate redirect)** — home renders `<LandingHero />`; `getAuthenticatedUserOrRedirect` and the gate pages instead `redirect("/auth/sign-in")`.
- **No sync / no budget states** apply here (confirmed: server-only, no client data layer).

Page-level `dynamic = "force-dynamic"` on every gate page + home + `/auth` because they read the session cookie per request and cannot be statically prerendered.

## Enums, options & configurable values
- `rankEnum` = `["captain", "member"]` (schema.ts:31). Default on `users.rank`: `"member"`. team-lead/driver are DERIVED, never stored (schema.ts:27-30).
- `approvalStatusEnum` = `["pending", "approved", "rejected"]` (schema.ts:41-45). Default `"approved"`. `rejected` is terminal.
- `requiredActionTypeEnum` = `["questionnaire", "acknowledgement", "payment", "profile_update"]` (schema.ts:99-104).
- `requiredActionStatusEnum` = `["pending", "completed", "waived", "expired"]` (schema.ts:106-111). Default `"pending"`.
- `questionnaireScopeEnum` = `["everyone", "team", "team_leads", "individual", "opt_in"]` (schema.ts:114-120). `PUSH_SCOPES` supported by the fan-out = `everyone|team|team_leads|individual`; `opt_in` unsupported (deferred pull model); `drivers` is broadcast-only (activations.ts:12-14).
- `activationStatusEnum` = `["draft", "open", "closed"]` (schema.ts:122-126). Default `"draft"`.
- `teamEnum` = `["kitchen", "structures", "power_and_lighting", "sanitation_and_water", "health_and_safety", "art_and_activities", "ministry_of_memes", "ministry_of_vibes"]` (schema.ts:51-60) — referenced via team-lead derivation/audience.
- `AssignedRank` = `"captain" | "member"` (invite-codes.ts).
- `QUESTIONNAIRE.version` = `"2026.05.29-v8"` (questionnaire.ts:60) — used to seed/satisfy the burner-profile action and stamped on `burner_profiles.version`.
- Version comparison: `meetsRequiredVersion(required, completed)` (versions.ts:14-24) parses `^(.*)-v(\d+)$`; if both share a base, compares the `-vN` suffix as an INTEGER (so `-v10 >= -v9`); else lexicographic.
- `ACTION_ROUTES` = `{ burner_profile: "/onboarding/questionnaire" }` (required-actions.ts:7-11) — the only built gate route.
- Required-action defaults: `blocking` default `true` (schema.ts:593, activations.ts:155); `version` default null; seed title `"Complete your burner profile"` (users.ts:199).
- Env-driven config: `GOD_EMAILS` (CSV, case-insensitive, bypasses invite + approval gates), `INVITE_CODES` (CSV bootstrap env codes — unlimited, never assign rank, never require approval), `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (≥32 chars), `E2E_TEST_MODE` (=`"1"` enables test bypass), `PGCRYPTO_KEY` (≥16 chars, AES-256-GCM for ID docs).
- Cookie: `TEST_USER_COOKIE = "camp404_test_user"` (test-mode.ts:9); test-login cookie opts: `httpOnly: true`, `secure` only in production, `sameSite: "lax"`, `path: "/"`, `maxAge: 60*60` (1 hour) (test/login/route.ts:29-35).
- Invite-redeem rate limit: key `invite-redeem:${authUser.id}`, `limit: 10`, `windowMs: 10 * 60_000` (10 minutes) — per-user, because sign-up is open (signup/required/actions.ts:25-28).

## Data model touched
(Must agree with unit 29.)

**`users` table** (schema.ts:220-303) — the camp-user identity row. Fields touched by this unit:
- `id` (uuid, pk), `authUserId` (`auth_user_id`, text, NOT NULL, UNIQUE — the Neon Auth user id), `displayName` (`display_name`, nullable), `profileImageUrl` (`profile_image_url`, nullable).
- `rank` (`rank` enum, NOT NULL, default `"member"`).
- `isSystem` (`is_system`, bool, default false — the AI/voice agent row; excluded from audiences).
- `inviteCode` (`invite_code`, text, nullable — NULL = god account; durable evidence of access past the invite gate).
- `approvalStatus` (`approval_status` enum, NOT NULL, default `"approved"`).
- `approvalDecidedByUserId` (`approval_decided_by_user_id`, uuid → users.id, on delete set null) and `approvalDecidedAt` (`approval_decided_at`, timestamp) — captain audit stamp set by `setUserApproval`.
- `sanitised` (`sanitised`, bool, default false) — read by audience/roster filters.
- (Also on the row, written by adjacent units: `passportEncrypted`, `saIdEncrypted`, `eftDetailsEncrypted`, `membershipTier`, `duesPaid`, `aiDataConsent`, etc.)

**`invite_codes` table** (schema.ts:312-342):
- `code` (text, pk), `createdByUserId` (`created_by_user_id`, uuid → users.id, set null), `note` (text), `maxUses` (`max_uses`, int, nullable = unlimited), `useCount` (`use_count`, int, NOT NULL, default 0), `expiresAt` (`expires_at`, ts, nullable), `revokedAt` (`revoked_at`, ts, nullable), `assignedRank` (`assigned_rank` rank enum, nullable = redeemer keeps `member`), `invitedEmail` (`invited_email`, text, lowercased on insert), `requiresApproval` (`requires_approval`, bool, NOT NULL, default false — codes minted by non-captains are ALWAYS true), `createdAt`.

**`required_actions` table** (schema.ts:570-609):
- `id` (uuid, pk), `userId` (`user_id`, uuid → users.id, cascade), `type` (`required_action_type` enum, NOT NULL), `actionKey` (`action_key`, text, NOT NULL — e.g. `"burner_profile"`), `version` (text, nullable), `activationId` (`activation_id`, uuid → questionnaire_activations.id, set null), `title` (text, NOT NULL), `blocking` (bool, NOT NULL, default true), `status` (`required_action_status` enum, NOT NULL, default `"pending"`), `dueAt` (`due_at`, ts), `createdAt`, `completedAt` (`completed_at`, ts).
- Indexes: UNIQUE `required_actions_user_action_idx` on `(user_id, action_key)` (drives idempotent upsert/re-activation); `required_actions_user_status_idx` on `(user_id, status)`.

**`team_memberships` table** (schema.ts:446-462) — read for `isTeamLead`:
- `userId` (uuid → users.id, cascade), `team` (team enum, NOT NULL), `isLead` (`is_lead`, bool, NOT NULL, default false), `createdAt`. PK `(userId, team)`. The derived `team_lead` rank = exists any row with `is_lead = true`.

**`questionnaire_activations`** (schema.ts:472-502) and **`questionnaire_activation_targets`** (schema.ts:505-518) — read/written by `openActivation`: activation has `questionnaireKey`, `version`, `title`, `description`, `scope`, `team`, `blocking` (default true), `status` (default `"draft"`), `dueAt`, `activatedByUserId`, `openedAt`, `closedAt`. Targets table is `(activation_id, user_id)` PK for `scope = 'individual'`.

**`burner_profiles`** (schema.ts:352+) — read via `getBurnerProfile` for the legacy onboarding fallback (`completedAt`, `version`, `responses`, `updatedAt`).

**E2E test store (in-memory, `globalThis.__camp404TestStore__`)** mirrors the above with `TestUser` (incl. `approvalDecidedByUserId`, `approvalDecidedAt`), `TestBurnerProfile`, `TestInviteCode`, `TestQuestionnaireEdit`, `TestBroadcast`, `TestDelivery`. Hung off `globalThis` because RSC renders and route handlers get SEPARATE module graphs in the same process (test-store.ts:97-126). Reset via `/api/test/reset`.

## Validation, edge cases & business rules
- **God-email bypass is total:** `isGodEmail` short-circuits BOTH `hasCampAccess` and `isApproved` (and `redeemInviteForUser` doesn't burn a use for them). A god user is auto-created on first sign-in with `inviteCode: null` and `approvalStatus: "approved"` (users.ts:70-80). Match is case-insensitive on the CSV.
- **Synthetic non-persisted row:** a signed-in non-god with no row + no invite never gets a DB row (no orphan); the synthetic row has `id: ""` and is only safe because every caller checks `hasCampAccess` and redirects to `/signup/required` first (users.ts:82-95).
- **Atomic invite claim / race-safety:** the DB `consumeInviteCode` increments `use_count` inside one guarded UPDATE so two racing redeemers cannot both win the last remaining use (invite-codes.ts:60-83); the loser gets `null` → "That invite code isn't valid."
- **Invite code usability** requires ALL: not revoked, `expires_at` null or in the future, `max_uses` null or `> use_count` (invite-codes.ts findUsable/consume; test-store mirror at test-store.ts:339-352, where `expiresAt <= now` is unusable).
- **Approval only ever tightens via redemption:** redeeming a `requiresApproval` code on an existing row moves them to `pending` only if not already `pending`; it never relaxes status (users.ts:135-137 comment: "only ever tightens access into the queue").
- **Pre-approved vs vetting-required first-time creation:** `approvalStatus = requiresApproval ? "pending" : "approved"`; `rank = assignedRank ?? "member"` (users.ts:148-149).
- **Required-action satisfaction is version-aware:** a completion recorded against a version older than the required one leaves the gate OPEN (activations.ts:188-194). Re-opening an activation re-points the row and resets it to `pending` with `completedAt: null` (onConflictDoUpdate).
- **nextGate never strands:** a pending blocking action whose `actionKey` has no entry in `ACTION_ROUTES` (e.g. `dietary_requirements`, `driver_profile` today) is SKIPPED — never redirected to (required-actions.ts:23-30 + comment).
- **Gate ordering is fixed** in `app/page.tsx`: authed → invite → required-actions → legacy onboarding fallback → pending/rejected → app. Each gate page is also self-guarding (e.g. `/signup/required` and `/pending-approval` redirect back out if their precondition is no longer met), so direct navigation can't sit on a stale gate.
- **Pending-approval ordering rule:** the pending screen first requires onboarding done (`!profile?.completedAt → /onboarding/questionnaire`) so a captain only ever reviews a completed profile (pending-approval/page.tsx:39-44).
- **OAuth cookie requires the proxy:** social sign-in returns a `session_verifier` in the URL; only the `/auth/*` + `/mcp/*` middleware exchanges it for a cookie. `sameSite: "lax"` is mandatory for the cross-site MCP OAuth round-trip — `strict` would drop the cookie on cross-site GETs (neon-auth.ts:29-33).
- **Build-time placeholders:** `next build` succeeds without env vars via the placeholder baseUrl/secret; any real request without proper env will fail loudly at the Neon Auth API. Secret < 32 chars throws at import.
- **E2E mode is production-poisonous-if-set:** `E2E_TEST_MODE=1` registers the `/api/test/*` routes and routes auth through the cookie + in-memory store; production must never set it (test-mode.ts:3-13). Under E2E, `seedBurnerProfileAction`/`satisfyBurnerProfileAction`/`getPendingRequiredActions` are no-ops and `isTeamLead` is always false — the legacy `completedAt` fallback in `app/page.tsx` is what preserves the onboarding gate.
- **Rate limit** on invite redemption is per-user (`invite-redeem:<id>`), 10 attempts / 10 min, because sign-up is open and an IP limit is evadable (signup/required/actions.ts:24-34).
- **ID-document encryption side-channel:** during onboarding `saveBurnerProfile` splits the government ID out of the JSONB responses and encrypts it (AES-256-GCM via `PGCRYPTO_KEY`); a missing/short key throws and surfaces as a typed `_form` retry error rather than silently failing (onboarding/questionnaire/actions.ts:48-93; crypto.ts).
- **Test-login cookie validation:** `readTestUserCookie` requires a non-empty string `id`, defaults email/displayName to null, swallows JSON parse errors → null (auth.ts:50-60).

## Sub-components / variants
This is a server-only unit — the "sub-components" are the handlers/validators/backends:

- **Real vs test backend** (`UserBackend` interface, users.ts:264-298): `realBackend` (users.ts:350-408) calls the Drizzle `@camp404/db/*` modules; `testBackend` (users.ts:410-460) calls the in-memory `testStore`. Selected per call by `isE2ETestMode()`. Notable test-backend divergences: `isTeamLead` always returns `false`; ID docs stored RAW (no crypto, so tests need no `PGCRYPTO_KEY`).
- **`auth.handler()`** (`api/auth/[...path]/route.ts`) — the only production auth API entry; the `[...path]` catch-all proxies the whole Better Auth surface.
- **`auth.middleware`** (`proxy.ts`) — the OAuth verifier→cookie exchange; matcher-scoped to `/auth`, `/auth/:path*`, `/mcp/:path*`.
- **Gate pages (consumers, exits of this spine):** `/signup/required` (invite gate, `AuthShell hideBack footer="Camp 404 is invite-only."`), `/pending-approval` (approval gate, two variants: pending=amber `Clock`/"Application submitted", rejected=destructive `ShieldX`/"Application not approved"), `/onboarding/questionnaire` (required-actions gate target). `/auth` (OAuth landing) and `/auth/[path]` (sign-in/up + Neon Auth hosted fallback).
- **`AuthenticatedUser` vs `CampUser`:** two distinct shapes — `AuthenticatedUser` is the auth-layer identity (id/email/name), `CampUser` is the camp-domain row (rank/approval/invite). `ensureCampUser` is the bridge.
- **DEAD / TRANSITIONAL branches flagged in source:**
  - The legacy `completedAt` onboarding fallback in `app/page.tsx:50-56` is explicitly marked "Belt-and-braces fallback (one release) ... Drop once required_actions seeding is confirmed in prod."
  - `ACTION_ROUTES` comment notes `dietary_requirements` / `driver_profile` are NOT yet mapped (their activations stay pending but don't gate) — required-actions.ts:9-10.
  - `opt_in` activation scope is a documented TODO pull model, currently returns an error (activations.ts:46-49).
  - `findUsableInviteCode` (invite-codes.ts) and `findInviteCodeByCode` exist for the invite-creation/availability UI, not consumed by this gating spine directly (claim uses `consumeInviteCode`).
- **E2E harness routes** (`/api/test/*`) are dead in production (404 unless `E2E_TEST_MODE=1`): `login` (cookie set/delete), `reset`, `set-approval`, `set-rank`, `complete-onboarding` (writes `version: "e2e-test"`, `responses: {}`, `markComplete: true`), `seed-invite`, `inspect`.
