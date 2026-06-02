# 05 — Pending / rejected approval gate

**Files covered:**
- `apps/web/app/pending-approval/page.tsx` — the blocking server page itself: resolves the camp user, re-checks every upstream gate, branches pending-vs-rejected copy, renders the icon/heading/body + the single "Sign out" escape.
- `apps/web/lib/users.ts` — server-only data layer the page reads through: `ensureCampUser`, `getBurnerProfile`, `hasCampAccess`, `isApproved`, `decideUserApproval` (the captain's exit), `CampUser` shape, real/test backend split.
- `apps/web/components/auth-shell.tsx` — the centred card chrome the page renders inside (`hideBack` mode).
- `apps/web/lib/auth.ts` — `getAuthenticatedUserOrRedirect` (the page's first line; bounces to `/auth/sign-in` when unauthenticated) + `AuthenticatedUser` shape.
- `apps/web/lib/access-control.ts` — `isGodEmail` (god accounts never reach this gate) and the `claimInviteCode` / `requiresApproval` source that drops a redeemer into `pending`.
- `apps/web/app/page.tsx` — the gating spine that routes a non-approved user TO `/pending-approval` (the entry side; full chain is unit 23).
- `apps/web/app/captains/camp-management/actions.ts` — `decideApprovalAction`: the captain's approve/reject that is the only non-sign-out exit.
- `packages/db/src/schema.ts` — `users` table + `approvalStatusEnum`, `inviteCodes.requiresApproval`, audit columns.
- `packages/db/src/burner-profile.ts` — real-DB `setUserApproval` / `setUserApprovalStatus` (audit-stamp vs queue-drop) + `getBurnerProfileByUserId`.
- `apps/web/lib/test-store.ts` — in-memory `setUserApproval` / `setUserApprovalStatus` / `createUser` that back E2E_TEST_MODE.
- `apps/web/app/api/test/set-approval/route.ts` — E2E-only seam to force a user's `approvalStatus` (drives the rejected/approved branches in tests).
- `apps/web/app/auth/[path]/page.tsx` — where the "Sign out" link (`/auth/sign-out`) lands (Neon Auth hosted UI fallback).

**Purpose:** `/pending-approval` is the terminal blocking screen a member sees after they have (a) authenticated, (b) redeemed an invite code whose `requiresApproval` is true, and (c) completed their burner-profile onboarding — but before a captain has vetted them. It is a hard dead-end: it renders ZERO app navigation. There are exactly two ways out — a captain flips `approval_status` to `approved` (the app unlocks on the next page load) or to `rejected` (the screen swaps to a terminal "not approved" message), or the user signs out. The page expresses two distinct terminal states (pending vs rejected) and re-validates every upstream gate on each request so it can never be the wrong screen to show.

## Features

### `/pending-approval` page (apps/web/app/pending-approval/page.tsx)

- **Server component, force-dynamic.** `export const dynamic = "force-dynamic"` (page.tsx:14) — reads the Neon Auth session on every request; never statically prerendered.
- **Page metadata.** `metadata.title = "Application pending — Camp 404"` (page.tsx:16-18). Note: the title is always "pending" even on the rejected branch.
- **Auth gate (entry).** `getAuthenticatedUserOrRedirect()` (page.tsx:28) — unauthenticated visitors are bounced to `/auth/sign-in` before any of this screen renders (auth.ts:40-44).
- **Camp-user resolution.** `ensureCampUser(authUser)` (page.tsx:29) — returns the persisted Drizzle/test row, or a synthetic non-persisted row (`id: ""`, `inviteCode: null`, `approvalStatus: "approved"`) for a signed-in user who has never redeemed a code (users.ts:86-94).
- **Re-validation of every upstream gate** (so this page is never shown out of order):
  1. **No invite → /signup/required** (page.tsx:32-34): `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")`. `hasCampAccess` is true iff god email or a non-null `inviteCode` (users.ts:219-224).
  2. **Already approved → / (home)** (page.tsx:36-38): `if (isApproved(campUser, authUser.primaryEmail)) redirect("/")`. `isApproved` is true iff god email or `approvalStatus === "approved"` (users.ts:231-236). This is what makes the gate auto-clear on the next load once a captain approves.
  3. **Onboarding not finished → /onboarding/questionnaire** (page.tsx:41-44): loads `getBurnerProfile(campUser.id)`; if `profile?.completedAt` is falsy, redirect to the questionnaire. Rationale comment: "a captain reviews a completed profile" (page.tsx:39-40).
- **Pending-vs-rejected branch.** `const rejected = campUser.approvalStatus === "rejected"` (page.tsx:46). Everything that survives the three redirects is therefore either `pending` or `rejected` (a `member`/`captain` with an invite, completed onboarding, and not-approved status).
- **Rendered inside `AuthShell` with `hideBack`** (page.tsx:49) — no Back button (this is a flow dead-end), centred card, no footer.
- **Status icon badge** (page.tsx:51-63): a 14×14 rounded-full circle holding a 7×7 lucide icon.
  - Rejected: `ShieldX` icon, classes `bg-destructive/10 text-destructive`.
  - Pending: `Clock` icon, classes `bg-amber-500/15 text-amber-400`. (This amber pair is the one place the surface uses a literal Tailwind colour rather than a `--color-*` token — see "ugly truths".)
  - Both icons carry `aria-hidden`.
- **Heading + body copy** (page.tsx:65-84):
  - **Rejected:** heading `Application not approved`; body `A captain has reviewed your application and it wasn't approved for camp access this time. If you think this is a mistake, reach out to whoever invited you.`
  - **Pending:** heading `Application submitted`; body `Thanks{displayName ? ", {displayName}" : ""} — your profile is in. A captain needs to approve your access before you can use the rest of the app. We'll let you in as soon as they do; just check back here.` The name interpolation is `campUser.displayName ? \`, ${campUser.displayName}\` : ""` (page.tsx:78) — greeting personalises only when a display name exists.
  - Body text styled `text-balance text-sm text-[color:var(--color-muted-foreground)]`; heading `text-2xl font-bold`.
- **Sign-out escape** (page.tsx:86-88): an `outline`-variant `Button asChild w-full` wrapping `<a href="/auth/sign-out">Sign out</a>`. This is the ONLY interactive control on the page. `/auth/sign-out` is handled by the Neon Auth hosted-UI catch-all (`apps/web/app/auth/[path]/page.tsx:43-47` — `<AuthView path={path} />`), not a bespoke screen.

### Entry into the gate (apps/web/app/page.tsx)

- The home page is the canonical router that SENDS a user here. After the auth/invite/required-actions gates, `if (!isApproved(campUser, user.primaryEmail)) redirect("/pending-approval")` (page.tsx:61-63). Other protected pages do the same (e.g. `captains/camp-management/page.tsx:26`, `captains/tools/page.tsx:47`, `captains/announcements/page.tsx:26` all `redirect("/pending-approval")`), so a pending user is held on EVERY protected route, not just home (asserted in e2e: tests/e2e/authenticated.spec.ts:90-92). Full gating-chain ordering is unit 23.

### How a user lands in `pending` (apps/web/lib/users.ts + access-control.ts)

- A redeemed invite code carries `requiresApproval` (boolean). Env-var bootstrap codes are always `requiresApproval: false` (access-control.ts:48-49). DB codes carry the column value (schema.ts:336; comment: codes minted by non-captains are ALWAYS true).
- `redeemInviteForUser` (users.ts:111-153):
  - First-time redeemer: row created with `approvalStatus: claimed.requiresApproval ? "pending" : "approved"` (users.ts:149).
  - Existing row: `if (claimed.requiresApproval && existing.approvalStatus !== "pending") setUserApprovalStatus(existing.id, "pending")` (users.ts:135-137) — a vetting code "only ever tightens access into the queue" (it never down-grades an already-`rejected` or up-grades back to `approved`).
  - God accounts / users who already hold a code short-circuit `{ ok: true }` without spending a use (users.ts:122-124).

### The only non-sign-out exit: captain decision (apps/web/app/captains/camp-management/actions.ts → users.ts:decideUserApproval)

- `decideApprovalAction(userId, decision)` (actions.ts:75-96): captain-gated (`requireCaptain` requires signed-in + camp-active + `rank === "captain"`, actions.ts:30-43); validates `decision` is `"approved" | "rejected"` (actions.ts:82-84); blocks self-decision `if (userId === gate.captainId)` (actions.ts:85-87); then `decideUserApproval({ userId, status, decidedByUserId: captainId })` and `revalidatePath("/captains/camp-management")`.
- `decideUserApproval` (users.ts:253-260) → backend `setUserApproval`. Real DB (`burner-profile.ts:69-84`) stamps `approvalStatus`, `approvalDecidedByUserId`, `approvalDecidedAt`, `updatedAt`. Approving → next page load passes `isApproved` and the gate redirects to `/`. Rejecting → the same screen re-renders with `rejected` copy.
- E2E seam: `POST /api/test/set-approval` (api/test/set-approval/route.ts) forces `approvalStatus` via `testStore.setUserApprovalStatus` (no decider stamped) — used because the real captain UI reads the live DB and isn't drivable under E2E_TEST_MODE (route.ts:5-9).

## User actions & interactions

- **Sign out** — the single control: tap "Sign out" → navigates to `/auth/sign-out` (Neon Auth hosted sign-out flow). No client JS on this page; it is a plain anchor.
- **Passive re-check (no user action)** — the user "checks back" by reloading the page (copy: "just check back here"). There is NO polling, no realtime, no auto-refresh on this screen. The state transition happens entirely server-side on the next request once a captain has decided. (Contrast the global AcknowledgementGate which polls 45s — that is a different surface and does not apply here.)
- **No retry / appeal / resubmit affordance.** Rejected users get text-only guidance ("reach out to whoever invited you") — there is no in-app button to appeal or re-apply.
- **Implicit redirects on load** (not user-initiated): to `/auth/sign-in`, `/signup/required`, `/onboarding/questionnaire`, or `/` depending on which upstream gate is unsatisfied/cleared (see Features → re-validation).

## States & presentations

Global-states rows, mapped to THIS surface:

- **Empty** — n/a. There is no list/collection here; the screen has a single fixed message per branch.
- **Loading** — implicit RSC await of `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `getBurnerProfile`. No skeleton/spinner is rendered; the page is server-rendered and arrives complete. No client loading state.
- **Populated** — the two terminal content states:
  - **Pending** (`approvalStatus === "pending"`): Clock icon (amber), "Application submitted", personalised thanks copy.
  - **Rejected** (`approvalStatus === "rejected"`): ShieldX icon (destructive), "Application not approved", terminal copy.
- **Validation-error** — n/a on the page (no form/input). Validation lives in the captain action (`decideApprovalAction` returns `{ ok:false, error }` for unknown decision / self-decision) and the test route (400 for bad body) — neither renders on this screen.
- **Submitting/pending** — the camp-level "pending" IS this whole screen (it represents `approvalStatus === "pending"`). No submit button exists here; the prior submission (the questionnaire) already happened upstream.
- **Success** — represented by ABSENCE: once `isApproved` is true the page redirects to `/` (page.tsx:36-38). There is no on-screen success banner; success = you never see this page again.
- **Disabled** — n/a (no toggleable/disabled controls; the lone Sign-out link is always active).
- **Invite-gated** — actively handled: `!hasCampAccess` → redirect `/signup/required` (page.tsx:32-34). A user with no invite never lingers here.
- **Onboarding-incomplete** — actively handled: `!profile?.completedAt` → redirect `/onboarding/questionnaire` (page.tsx:41-44). The gate refuses to show until the profile a captain reviews is complete.
- **Pending-approval** — the primary populated state (see above).
- **Rejected** — the terminal populated state (see above); no further transition is offered to the user (only a captain re-deciding, or sign-out).
- **Captain-only-locked** — n/a as a render here; but note the captain who would decide reaches camp-management via a separate surface, and a not-yet-approved captain-ranked user would themselves be bounced here (the gate keys on `approvalStatus`, not rank).

## Enums, options & configurable values

- **`approvalStatusEnum` (`approval_status`)** = `["pending", "approved", "rejected"]` (schema.ts:41-45). `notNull().default("approved")` (schema.ts:267-269) — so god accounts and every pre-gate account are `approved` by default; only a `requiresApproval` redeemer is created `pending`.
- **TS mirror of approval status** — `type ApprovalStatus = "pending" | "approved" | "rejected"` (users.ts:33); test mirror `TestApprovalStatus` identical (test-store.ts:10).
- **Captain decision domain** — `decideUserApproval` / `decideApprovalAction` accept only `"approved" | "rejected"` (users.ts:255-257, actions.ts:77) — a captain can never set `pending` (that is a signup-time state only).
- **`rankEnum` (`rank`)** = `["captain", "member"]` (schema.ts:31). Relevant because the gate keys on approval, not rank — a `member` or `captain` can both be `pending`/`rejected`. team-lead/driver are derived, not stored.
- **`inviteCodes.requiresApproval`** — boolean, `notNull().default(false)` (schema.ts:336); the upstream switch that decides whether a redeemer lands `pending`.
- **`isGodEmail`** — driven by `process.env.GOD_EMAILS` (CSV, lowercased, case-insensitive match — access-control.ts:28-32). God emails are always `isApproved` regardless of stored status, so they can never see this page.
- **Test seam approval values** — `POST /api/test/set-approval` body `status` ∈ `"pending" | "approved" | "rejected"` (route.ts:15, validated route.ts:24-27).
- **No tunable thresholds/timeouts on this surface** — no polling interval, no expiry, no auto-reject timer. The gate is purely state-driven.
- **Literal copy strings** (load-bearing for restyle — preserve meaning, not styling): page title `"Application pending — Camp 404"`; headings `"Application submitted"` / `"Application not approved"`; body strings as quoted in Features; button label `"Sign out"`.

## Data model touched

`users` table (packages/db/src/schema.ts:220-303) — fields this surface reads/depends on (must agree with unit 29):

- `id` uuid PK — used as `campUser.id` for `getBurnerProfile` and as the target of a captain decision.
- `authUserId` text notNull unique (`auth_user_id`) — join to Neon Auth identity; how `ensureCampUser` finds the row.
- `displayName` text nullable (`display_name`) — interpolated into the pending greeting.
- `inviteCode` text nullable (`invite_code`) — read by `hasCampAccess`; null (and non-god) → bounce to `/signup/required`.
- `rank` rankEnum notNull default `member` — not gated on here, but present on `CampUser`.
- **`approvalStatus`** approvalStatusEnum (`approval_status`) notNull default `approved` — THE field this surface exists for.
- **`approvalDecidedByUserId`** uuid nullable (`approval_decided_by_user_id`), self-FK to `users.id` onDelete `set null` — stamped by a captain's decision (audit).
- **`approvalDecidedAt`** timestamp nullable (`approval_decided_at`) — stamped by a captain's decision (audit).
- `updatedAt` timestamp — bumped on every approval write.

`burner_profiles` table (schema.ts:352-364) — read-only here:
- `userId` uuid PK (`user_id`) FK→users onDelete cascade.
- `completedAt` timestamp nullable (`completed_at`) — the ONLY field the page logic consults (`!profile?.completedAt` → redirect to questionnaire).
- (`getBurnerProfile` summary also returns `responses`, `updatedAt`, `version`, but this surface uses only `completedAt`.)

`invite_codes` table (schema.ts:312-342) — indirect (set upstream at redemption, not touched on this page):
- `requiresApproval` boolean notNull default false (`requires_approval`) — the switch that put the user into `pending`.
- `assignedRank` rankEnum nullable.

**Interfaces produced/consumed:**
- `CampUser { id, authUserId, displayName: string|null, profileImageUrl: string|null, inviteCode: string|null, rank: "captain"|"member", approvalStatus: "pending"|"approved"|"rejected" }` (users.ts:39-47). `toCampUser` defaults a null/absent `approvalStatus` to `"approved"` (users.ts:478).
- `AuthenticatedUser { id, primaryEmail: string|null, displayName: string|null }` (auth.ts:13-17).
- `BurnerProfileSummary { responses, completedAt: Date|null, updatedAt: Date|null, version: string|null }` (users.ts:155-160).
- Test row `TestUser` carries `approvalDecidedByUserId`/`approvalDecidedAt` too (test-store.ts:20-21), kept parallel to the real schema.

## Validation, edge cases & business rules

- **Re-entrancy / wrong-screen guard:** the page re-runs the entire upstream gate chain on each request (auth → invite → onboarding → approval), so it can never be shown to someone who belongs on a different gate. Order matters: invite-gate before approved-check before onboarding-check (page.tsx:32-44).
- **Auto-clear on approval:** because `isApproved` short-circuits to `/` (page.tsx:36-38), no client refresh logic is needed — a captain approving simply makes the next load redirect home. Likewise a god email always `isApproved` and is redirected away.
- **Synthetic-row safety:** a signed-in user with no row/no invite gets a synthetic `CampUser` with `id: ""` and `inviteCode: null` (users.ts:86-94); `hasCampAccess` reads false → they redirect to `/signup/required` before the empty id is ever used (users.ts:84-85). No orphan row is written.
- **God accounts never reach this screen:** they are auto-created `approved` with `inviteCode: null` (users.ts:70-80) and `isApproved`/`hasCampAccess` both short-circuit on god email.
- **Vetting only tightens:** `redeemInviteForUser` moves an existing user to `pending` only when `requiresApproval && status !== "pending"` (users.ts:135-137); it never overrides `rejected`→`pending` re-opening except via this exact path (a `rejected` user IS `!== "pending"`, so re-redeeming a vetting code WOULD set them back to `pending` — note this as a re-entry path).
- **Captain decision business rules:** captain-only (`rank === "captain"`, actions.ts:39-41); cannot decide own account (actions.ts:85-87); decision must be exactly `approved`/`rejected` (actions.ts:82-84); decision is audit-stamped (decider + timestamp) only on the real backend's `setUserApproval` (burner-profile.ts:69-84); the queue-drop `setUserApprovalStatus` (signup path / test seam) does NOT stamp a decider (burner-profile.ts:54-63).
- **Rejected is terminal for the user:** no in-app re-apply; the only state change is a captain re-deciding (e.g. `rejected → approved` via the same `decideApprovalAction`, which is permitted — there is no guard against deciding on an already-rejected user) or sign-out.
- **No offline/sync/budget states** apply (per product contract).
- **E2E_TEST_MODE divergence:** under `E2E_TEST_MODE=1` all reads/writes route through the in-memory `testStore` (users.ts:64, 165, etc.); `seedBurnerProfileAction`/`satisfyBurnerProfileAction`/`getPendingRequiredActions` are no-ops/empty (users.ts:192-217), so the page's `completedAt` legacy check is what actually gates onboarding completeness in tests. The real captain UI is not drivable in test mode (set-approval seam exists for this reason).
- **Edge: pending heading even when rejected metadata** — `metadata.title` is hardcoded `"Application pending"` and does not change on the rejected branch (page.tsx:17). Minor stale-truth.

## Sub-components / variants

- **`AuthShell` (apps/web/components/auth-shell.tsx)** — `"use client"` card chrome. Props `{ children, className?, footer?, hideBack? }`. The page uses `hideBack` (no Back button — page.tsx:49) and no `footer`. Renders a `min-h-svh` centred container on `bg-[color:var(--color-muted)]`, a `max-w-sm` wrapper, a `Card` with `CardContent`. When `!hideBack` it renders a ghost-variant Back button that calls `router.back()` — NOT used by this page.
- **`Button` (`@camp404/ui/components/button`)** — used as `variant="outline"`, `asChild`, `className="w-full"` wrapping the sign-out anchor. (Variants available: default/outline/ghost/destructive/secondary; sizes default/sm/lg/icon — only outline is used here.)
- **lucide icons** — `Clock` (pending) and `ShieldX` (rejected) from page.tsx:2; sized `h-7 w-7`, `aria-hidden`. These are the only icons on the surface (no entity icon set; this is an auth/lifecycle screen, not an entity surface).
- **Server-only data backends (users.ts)** — `realBackend` (Drizzle via `@camp404/db/burner-profile`) and `testBackend` (in-memory `testStore`), selected by `isE2ETestMode()`. Both implement the `UserBackend` interface (users.ts:264-298). The approval-relevant methods: `findUserByAuthId`, `createUser`, `setUserApprovalStatus`, `setUserApproval`, `getBurnerProfile`.
- **Captain decision action (apps/web/app/captains/camp-management/actions.ts)** — `decideApprovalAction` (server action, the exit) and its gate `requireCaptain`. Returns `ApprovalDecisionResult = { ok:true } | { ok:false; error:string }`. Lives on the captain surface (unit covering camp-management) but is the load-bearing counterpart to this gate.
- **Test-only route handler (apps/web/app/api/test/set-approval/route.ts)** — `runtime = "nodejs"`; 404s unless `isE2ETestMode()`; validates `{ authUserId, status }`; forces status via `testStore.setUserApprovalStatus`. Not user-facing; an E2E seam.
- **`/auth/[path]/page.tsx` sign-out fallback** — `/auth/sign-out` renders Neon Auth's `<AuthView path="sign-out" />` (no bespoke screen). The page's "Sign out" link depends on this fallback existing.
- **No dead/orphaned variants found** on this surface — both branches (pending/rejected) are live and tested (e2e: "Application submitted" tests/e2e/authenticated.spec.ts:88; "Application not approved" :134).
