# 03 — Invite gate & code redemption

**Files covered:**
- `apps/web/app/signup/required/page.tsx` — the post-auth invite-gate page (RSC); resolves the camp user, forwards anyone who already has access, otherwise renders the code-entry form.
- `apps/web/app/signup/required/invite-gate-form.tsx` — `"use client"` form (`InviteGateForm`) that takes an invite code, posts to the server action, and renders inline error / pending / sign-out affordances.
- `apps/web/app/signup/required/actions.ts` — `submitInviteCode` server action: per-user rate-limit, then `redeemInviteForUser`, then `redirect("/")` on success.
- `packages/db/src/invite-codes.ts` — DB layer for the `invite_codes` table: `findUsableInviteCode`, `consumeInviteCode` (atomic use-count increment), `createInviteCode`, `findInviteCodeByCode`; the `InviteCodeRow` interface and `AssignedRank` type.
- `apps/web/lib/access-control.ts` — `claimInviteCode` (env-code vs DB-code branch), `isGodEmail`, env-CSV parsing; bridges to the test store under E2E_TEST_MODE.
- (followed) `apps/web/lib/users.ts` — `ensureCampUser`, `redeemInviteForUser`, `hasCampAccess`, `isApproved`; the real/test backends and `toCampUser` mapping.
- (followed) `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect`, `AuthenticatedUser` shape.
- (followed) `apps/web/lib/rate-limit.ts` — in-memory token-bucket `rateLimit`.
- (followed) `apps/web/lib/test-mode.ts`, `apps/web/lib/test-store.ts` — E2E in-memory backend (invite codes + users).
- (followed) `apps/web/components/auth-shell.tsx` — `AuthShell` chrome wrapper the page renders into.
- (followed) `packages/db/src/schema.ts` — `inviteCodes`, `users`, `rankEnum`, `approvalStatusEnum`.
- (followed) `packages/db/src/burner-profile.ts` — `createCampUser`, `setUserInviteCode`, `setUserRank`, `setUserApprovalStatus`, `findUserByAuthId`.

**Purpose:** The post-auth invite gate. Neon Auth (Better Auth) cannot be stopped from minting an identity when someone signs in (Google especially), so the invite check happens *after* authentication rather than before sign-up. A signed-in user with no invite code on file lands on `/signup/required`, enters a code, and cannot progress to the questionnaire/approval gates until a valid code is claimed and stamped onto their camp row. The screen is the single redemption surface that turns "authenticated stranger" into "camp member": it validates the code (env bootstrap codes vs DB codes), atomically consumes a DB code's use-count, optionally stamps an `assignedRank`, and optionally drops the redeemer into the captain approval queue (`requiresApproval`). God-email accounts and anyone who already redeemed a code are short-circuited straight home.

## Features

### Invite-gate page (`signup/required/page.tsx`)
- `export const dynamic = "force-dynamic"` — reads the Neon Auth session via cookies, cannot be statically prerendered (page.tsx:8).
- `export const metadata = { title: "Invite required — Camp 404" }` (page.tsx:10-12).
- Flow (page.tsx:22-34): `getAuthenticatedUserOrRedirect()` → if unauthenticated, redirect to `/auth/sign-in` (auth.ts:42). Then `ensureCampUser(authUser)` resolves/creates the camp row (or a synthetic one). Then `hasCampAccess(campUser, authUser.primaryEmail)` — if **true**, `redirect("/")` (already past the gate; bounce home). Otherwise render `<AuthShell hideBack footer="Camp 404 is invite-only.">` wrapping `<InviteGateForm email={authUser.primaryEmail} />`.
- The page itself NEVER writes a row for a code-less user — `ensureCampUser` returns a synthetic non-persisted row for a non-god, no-invite user (users.ts:84-95), so visiting the gate leaves no orphan "signed in, no invite" record.

### Invite-code form (`invite-gate-form.tsx`)
- Wires `useActionState<SubmitInviteResult | null, FormData>(submitInviteCode, null)` → exposes `[state, formAction, isPending]` (form:15-18).
- Renders heading "One more thing"; body copy that, when `email` is non-null, reads `You're signed in as <email>.` (with a literal trailing space) followed by `Camp 404 is invite-only — drop your code below to come aboard.` When `email` is null, only the second sentence renders (form:22-36).
- Single text `<Input>` for the code: `id="invite-code"`, `name="code"`, `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="off"`, `autoCorrect="off"`, `required` (form:38-49), with a `<Label htmlFor="invite-code">Invite code</Label>`.
- Inline error: when `state && !state.ok`, renders `<p role="alert">` styled `var(--color-destructive)` showing `state.error` (form:51-55).
- Submit `<Button type="submit" className="w-full" disabled={isPending}>` — label `"Checking…"` while pending, `"Enter camp"` otherwise (form:57-59).
- Sign-out escape: a `variant="link"` `<Button asChild>` wrapping `<a href="/auth/sign-out">Sign out</a>` (form:61-67) — satisfies the "every gate has an exit" rule.

### `submitInviteCode` server action (`actions.ts`)
- `"use server"`. Signature `(_prev: SubmitInviteResult | null, formData: FormData) => Promise<SubmitInviteResult>` — note: only ever *returns* on failure; on success it `redirect`s (so the resolved type is effectively never, but is typed `SubmitInviteResult`) (actions.ts:17-43).
- `getAuthenticatedUserOrRedirect()` re-asserts auth server-side (actions.ts:21).
- **Rate limit** (actions.ts:25-34): ``rateLimit(`invite-redeem:${authUser.id}`, { limit: 10, windowMs: 10 * 60_000 })``. On exhaustion returns `{ ok: false, error: "Too many attempts — wait a few minutes and try again." }`. Per-user (not per-IP) because sign-up is open and an IP limit alone is evadable.
- Reads `formData.get("code")`; coerces non-string to `""` (actions.ts:36-37).
- Calls `redeemInviteForUser(authUser, code)`; on `!result.ok` returns `{ ok: false, error: result.error }`; on success `redirect("/")` (actions.ts:39-42). The home gate (`app/page.tsx`) then routes onward to questionnaire / pending-approval.

### `redeemInviteForUser` (`lib/users.ts`)
- Trims `rawCode`; empty → `{ ok: false, error: "Please enter an invite code." }` (users.ts:115-116).
- Picks backend by `isE2ETestMode()` (`testBackend` vs `realBackend`) (users.ts:118).
- Short-circuit (users.ts:122-124): if `isGodEmail(authUser.primaryEmail)` OR `existing?.inviteCode` is truthy → returns `{ ok: true }` **without** burning another use or re-stamping.
- `claimInviteCode(code)` → `null` becomes `{ ok: false, error: "That invite code isn't valid." }` (users.ts:126-127).
- **Existing row path** (users.ts:129-139): `setUserInviteCode(existing.id, claimed.code)`; if `claimed.assignedRank && claimed.assignedRank !== existing.rank` → `setUserRank`; if `claimed.requiresApproval && existing.approvalStatus !== "pending"` → `setUserApprovalStatus(existing.id, "pending")` ("only ever tightens access into the queue"). Returns `{ ok: true }`.
- **First-time path** (users.ts:144-152): `createUser({ authUserId, displayName: authUser.displayName ?? authUser.primaryEmail, inviteCode: claimed.code, rank: claimed.assignedRank ?? "member", approvalStatus: claimed.requiresApproval ? "pending" : "approved" })`, then `seedBurnerProfileAction(created.id)`, then `{ ok: true }`.

### `claimInviteCode` (`lib/access-control.ts`)
- Trims; empty → `null` (access-control.ts:46-47).
- **Env-code branch**: `isEnvCode(trimmed)` (membership in CSV `process.env.INVITE_CODES`) → returns `{ code: trimmed, assignedRank: null, requiresApproval: false }`. Pure validity check; never assigns a rank, never requires approval, never consumes (env codes are unlimited bootstrap codes) (access-control.ts:48-49, 59-61).
- **DB-code branch**: `consumeDbCode(trimmed)` (which routes to `testStore.consumeInviteCode` under E2E mode, else `dbConsumeInviteCode`); `null` → `null`. Otherwise returns `{ code: trimmed, assignedRank: consumed.assignedRank, requiresApproval: consumed.requiresApproval }` (access-control.ts:50-56, 63-68).
- `ClaimedInvite` interface: `{ code: string; assignedRank: AssignedRank | null; requiresApproval: boolean }` (access-control.ts:10-15).

### DB invite-code layer (`packages/db/src/invite-codes.ts`)
- `findUsableInviteCode(code)` — SELECT where `code` matches AND `revokedAt IS NULL` AND (`expiresAt IS NULL` OR `expiresAt > now`) AND (`maxUses IS NULL` OR `maxUses > useCount`); returns the row or `null` (invite-codes.ts:26-50). **Not called by the redemption path** — redemption uses `consumeInviteCode`; this read-only validity check is for other surfaces.
- `consumeInviteCode(code)` — atomic `UPDATE ... SET use_count = use_count + 1` guarded by the *same* usable predicate (revoked/expiry/max-uses) in the WHERE clause, `.returning()` the updated row, or `null` if the code became unusable in between (race-loser) (invite-codes.ts:57-81). This is the single redemption mutation.
- `createInviteCode(input)` — INSERT; defaults `note/maxUses/expiresAt/assignedRank/invitedEmail` to `null`, `requiresApproval` to `false`; **lowercases `invitedEmail`** on insert (`input.invitedEmail?.toLowerCase() ?? null`); throws `"Failed to insert invite code"` if no row returned (invite-codes.ts:83-109). (Minting is unit 11; this is the function that backs it.)
- `findInviteCodeByCode(code)` — existence check regardless of revoked/expired/exhausted state; for the "is this code name taken?" availability hint on `/tools/invite` (invite-codes.ts:111-129). Not used by this gate.

## User actions & interactions
- **Type an invite code** into the single `name="code"` text input (autocomplete/spellcheck/autocapitalize/autocorrect all off; `required`).
- **Submit** ("Enter camp") → posts the form to `submitInviteCode`. Button disabled while `isPending`; label flips to "Checking…".
- **Read inline error** (`role="alert"`) on any failure; the user stays on the gate (`useActionState` preserves the page).
- **Sign out** via the "Sign out" link → `GET /auth/sign-out` (the Neon Auth catch-all route; out of scope for this unit). This is the gate's exit.
- (Server-implicit) Re-auth check on submit; per-user rate-limit reservation; atomic DB use-count consume; row create/update; redirect home.

## States & presentations
Applying the global-states rows that are in scope for this surface:
- **Empty** — code input blank on first render; no prior `state` (`null`). No "empty list" concept here (single field).
- **Loading** — no async fetch in the form; the page is server-rendered. (`useActionState` has no separate loading state beyond submitting.)
- **Populated** — user has typed a code into the input.
- **Validation-error** — `state.ok === false` renders the inline `role="alert"` error. Specific messages: `"Please enter an invite code."` (empty after trim, from `redeemInviteForUser`), `"That invite code isn't valid."` (invalid/expired/revoked/exhausted/race-loser, from `claimInviteCode` → null), `"Too many attempts — wait a few minutes and try again."` (rate-limited). The HTML `required` attribute also blocks an empty submit client-side.
- **Submitting/pending** — `isPending` true → submit button disabled, label "Checking…".
- **Success** — server `redirect("/")`; no in-form success UI (the redirect *is* the success state). Home then re-runs the gating spine.
- **Disabled** — submit button is the only disabled element, gated on `isPending`.
- **Invite-gated** — this *is* the invite-gated destination. `hasCampAccess(campUser, email)` false on `app/page.tsx` (page.tsx:40-42) → `redirect("/signup/required")`. This page only renders for users WITHOUT access; if they already have access, the page itself bounces them to `/` (page.tsx:25-27).
- **Onboarding-incomplete / Pending-approval / Rejected** — NOT expressed on this screen; they are downstream gates reached after a successful redemption sends the user home. A `requiresApproval` redemption seeds the `pending` status that *later* routes to `/pending-approval` (app/page.tsx:61-62), but the gate screen never shows it.
- **Captain-only-locked** — N/A; the gate is open to any authenticated user without a code.

## Enums, options & configurable values
- `AssignedRank = "captain" | "member"` (invite-codes.ts:5) — the rank an invite code may stamp.
- `rankEnum = pgEnum("rank", ["captain", "member"])` (schema.ts:31). `assigned_rank` column is nullable; `NULL` = redeemer keeps default `member` (schema.ts:324-327).
- `approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected"])` (schema.ts:41-45). Redemption can set `pending` (requires-approval) or `approved` (pre-approved); `rejected` is a downstream captain decision, never set here.
- Rate-limit config (actions.ts:26-27): `limit: 10`, `windowMs: 10 * 60_000` (= 600000 ms = 10 minutes), key `invite-redeem:<authUser.id>`. `rateLimit` default `windowMs` (unused here) = `60_000` (rate-limit.ts:44).
- `rateLimit` internals: `SWEEP_EVERY = 200` (bucket-sweep cadence), token-bucket refill `limit / windowMs` per ms (rate-limit.ts:15, 46).
- **Env config** (CSV, trimmed, empty-filtered via `csv()` — access-control.ts:17-22):
  - `GOD_EMAILS` — case-insensitive list; matching emails bypass the invite gate entirely (access-control.ts:28-32).
  - `INVITE_CODES` — bootstrap env codes; exact-match (case-sensitive) membership = valid, unlimited, no rank, no approval (access-control.ts:59-61).
- `E2E_TEST_MODE === "1"` toggles the in-memory `testStore` backend (test-mode.ts:11-13).
- Literal UI strings: heading `"One more thing"`; button `"Enter camp"` / `"Checking…"`; label `"Invite code"`; footer `"Camp 404 is invite-only."`; sign-out `"Sign out"`; body copy as above.

## Data model touched
**`invite_codes` table** (`packages/db/src/schema.ts:312-342`), exposed via `InviteCodeRow` (invite-codes.ts:7-19) / `TestInviteCode` (test-store.ts:45-57):
- `code` — `text` PRIMARY KEY (codes are forever-unique by PK).
- `createdByUserId` — `uuid` `created_by_user_id`, FK → `users.id` `ON DELETE set null`, nullable (CLI/env minting leaves null).
- `note` — `text`, nullable.
- `maxUses` — `integer` `max_uses`, nullable (NULL = unlimited).
- `useCount` — `integer` `use_count` NOT NULL default `0`.
- `expiresAt` — `timestamp` `expires_at`, nullable (NULL = never expires).
- `revokedAt` — `timestamp` `revoked_at`, nullable (non-null = revoked).
- `assignedRank` — `rank` enum `assigned_rank`, nullable (NULL = default `member`).
- `invitedEmail` — `text` `invited_email`, nullable, lowercased on insert.
- `requiresApproval` — `boolean` `requires_approval` NOT NULL default `false`.
- `createdAt` — `timestamp` `created_at` NOT NULL default now.
- Index `invite_codes_created_by_idx` on `created_by_user_id`.

**`users` table** (read/written via `redeemInviteForUser`; `packages/db/src/schema.ts`):
- `inviteCode` — `text` `invite_code`, nullable (schema.ts:256-260). NULL = god account. Written by `setUserInviteCode` / set on `createCampUser`. This is the durable "past the invite gate" evidence read by `hasCampAccess`.
- `rank` — `rank` enum, default `member` (schema.ts:31; set via `createCampUser`/`setUserRank` when `assignedRank` present).
- `approvalStatus` — `approval_status` enum NOT NULL default `approved` (schema.ts:267-269). Set to `pending` on a requires-approval redemption (via `createCampUser` or `setUserApprovalStatus`).
- `authUserId` — `auth_user_id`, the Neon/Better Auth user id key for `findUserByAuthId`.
- `displayName` — `display_name`; seeded from `authUser.displayName ?? authUser.primaryEmail` on first create.
- `approvalDecidedByUserId` / `approvalDecidedAt` — stamped only by captain decisions (`setUserApproval`), NOT by self-service redemption (`setUserApprovalStatus` leaves them untouched).
- (Not touched here but on the same row: `profileImageUrl`, `emergencyContacts`, terms/POPIA fields, telegram fields, `aiDataConsent*`, ID-document columns.)

**`CampUser` interface** (users.ts:39-47), produced by `toCampUser` (users.ts:462-480): `{ id, authUserId, displayName, profileImageUrl, inviteCode, rank, approvalStatus }`; `approvalStatus` defaults to `"approved"` when the source row's value is null/missing (users.ts:478).

**`burner_profiles`** — indirectly: a first-time redemption calls `seedBurnerProfileAction(created.id)`, which (real DB only) `ensureRequiredAction({ type: "questionnaire", actionKey: "burner_profile", version: QUESTIONNAIRE.version, ... })`. No-op under E2E mode (users.ts:192-201).

**`AuthenticatedUser`** (auth.ts:13-17): `{ id, primaryEmail, displayName }` — only `id` and `primaryEmail` are load-bearing here (id for rate-limit/lookup; primaryEmail for `isGodEmail`).

## Validation, edge cases & business rules
- **Auth precondition**: both page and action call `getAuthenticatedUserOrRedirect()` → unauthenticated users are sent to `/auth/sign-in`, never reach redemption.
- **Idempotent re-entry**: a user who already has `inviteCode` set, or a god email, returns `{ ok: true }` immediately — never burns a second use, never re-stamps rank/approval (users.ts:122-124). The page also redirects such users to `/` before the form renders (page.tsx:25-27).
- **God bypass**: `GOD_EMAILS` match → `ensureCampUser` auto-creates an `approved`, `member`-rank, `inviteCode: null` row + seeds burner profile on first sign-in (users.ts:63-80); they never see the gate (`hasCampAccess` returns true via `isGodEmail`, users.ts:219-224).
- **Trimming**: code is trimmed in both `redeemInviteForUser` (users.ts:115) and `claimInviteCode` (access-control.ts:46); empty-after-trim is rejected with distinct messages depending on which layer catches it.
- **Env vs DB precedence**: `isEnvCode` is checked FIRST; an env-code match never touches the DB and never consumes (access-control.ts:48-50). A code that is both an env code and a DB row would resolve via the env branch (no rank/approval, no consume).
- **Atomic consume / race protection**: `consumeInviteCode` increments `use_count` inside one guarded UPDATE; two concurrent redeemers competing for the last use → at most one gets a returned row, the loser gets `null` → `"That invite code isn't valid."` (invite-codes.ts:57-81; comment access-control.ts:36-41).
- **Usability predicate** (must satisfy ALL): not revoked (`revoked_at IS NULL`), not expired (`expires_at IS NULL` OR `> now`), uses remaining (`max_uses IS NULL` OR `max_uses > use_count`) — identical in `findUsableInviteCode`, `consumeInviteCode`, and the test store (invite-codes.ts:34-46, 65-77; test-store.ts:339-352). Note expiry comparison: SQL uses `> now`; test store uses `expiresAt <= new Date()` as the dead check (i.e. `expiresAt === now` is dead in test, alive in SQL — boundary asymmetry).
- **Approval only tightens**: a requires-approval code applied to an existing non-pending user sets `pending`; it never moves an already-`approved` user back unless the guard `existing.approvalStatus !== "pending"` passes — and crucially it will overwrite `approved`→`pending` (it only skips if already `pending`). It does NOT un-reject (`rejected` → `pending` would occur since `!== "pending"`). <!-- low-confidence: whether overwriting a 'rejected' redeemer back to 'pending' via a new requires-approval code is intended; the guard only excludes already-'pending', so rejected→pending is reachable on re-redemption. -->
- **Rank stamping**: only applied when `assignedRank` is present AND differs from the user's current rank (existing-row path); first-time path uses `assignedRank ?? "member"`.
- **Rate limit** is per-`authUser.id`, in-memory/per-process (no Redis), 10 attempts / 10 minutes; the comment notes it should swap to Upstash if the app fans out across regions (rate-limit.ts:1-4).
- **No orphan rows**: merely visiting the gate (no successful redemption) never persists a user row — `ensureCampUser` hands back a synthetic `{ id: "", ... }` row for non-god, no-invite users (users.ts:84-95).
- **Synthetic-row quirk**: the synthetic row reports `approvalStatus: "approved"` and `rank: "member"` with empty `id` — never used because callers check `hasCampAccess` and redirect first.
- **E2E mode**: `consumeDbCode`, `findUserByAuthId`, `createUser`, etc. route to `testStore`; `seedBurnerProfileAction` and the required-actions helpers are no-ops; `isTeamLead` always false (users.ts:447-450). Env codes (`INVITE_CODES`) still work in test mode (env branch is backend-agnostic).

## Sub-components / variants
- **`AuthShell`** (`components/auth-shell.tsx`) — shared centred auth card chrome. Props used here: `hideBack` (suppresses the Back button — the gate is a flow's first screen) and `footer="Camp 404 is invite-only."`. Built from `@camp404/ui` `Card`/`CardContent`/`Button`; back button is `variant="ghost" size="sm"` calling `router.back()`. (`className` prop unused here.)
- **`InviteGateForm`** — the only consumer of `submitInviteCode`; client component.
- **`SubmitInviteResult`** type = `{ ok: false; error: string }` only (actions.ts:8) — there is no `{ ok: true }` member because success always `redirect`s. The form's `useActionState` initial value is `null`.
- **Server-only handlers/validators in scope:**
  - `submitInviteCode` (action) — rate-limit + redeem + redirect.
  - `redeemInviteForUser` / `RedeemInviteResult` (`{ ok: true } | { ok: false; error }`) — orchestration + row create/update.
  - `claimInviteCode` / `ClaimedInvite` — env-vs-DB resolution.
  - `isGodEmail` — god-email CSV check.
  - `consumeInviteCode` (DB) and `testStore.consumeInviteCode` (E2E) — the atomic consume.
  - `hasCampAccess(user, email)` = `isGodEmail(email) || !!user.inviteCode` (users.ts:219-224) — the predicate this gate exists to satisfy.
- **Dead / orphaned within this unit:**
  - `findUsableInviteCode` (invite-codes.ts:26-50) — read-only usability check; **not** called by the redemption path (redemption uses `consumeInviteCode`). Used elsewhere.
  - `findInviteCodeByCode` (invite-codes.ts:111-129) — existence/availability hint for the minting UI (`/tools/invite`, unit 11); not used by this gate.
  - `createInviteCode` (invite-codes.ts:83-109) — minting (unit 11), not redemption.
  - `testStore.seedInviteCode` (test-store.ts:313-338) — test fixture helper for E2E specs; not part of the runtime gate.
- **Adjacent (explicitly out of scope):** the `/auth/sign-out` link resolves to the Neon Auth `[path]` catch-all (`apps/web/app/auth/[path]/page.tsx`), not handled here. The downstream gating spine (`app/page.tsx:29-63`) and `nextGate`/required-actions routing are unit 23.
