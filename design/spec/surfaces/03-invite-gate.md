# Invite gate (redeem code) — functional brief

- **Route(s):** `/signup/required`
- **Canonical board(s):** `S03 Invite gate` (board #12, 430×- px, `design/.spec-extract/boards/12-s03-invite-gate.txt`)
- **Superseded / dropped:** none — single board, no iterations
- **Breakpoints:** mobile-first 430px (board canonical size); surface is a single centred card, no responsive variant needed (card constrains itself via `AuthShell` chrome)

---

## Purpose

The post-authentication invite wall. Neon Auth (Better Auth) mints an identity the moment someone signs in via Google or email/password; the invite check therefore happens *after* authentication rather than at sign-up. A signed-in user who has not yet redeemed a code lands here; they cannot progress to onboarding or any app surface until a valid code is stamped onto their camp row.

This surface is the single redemption point that converts "authenticated stranger" → "camp member". It validates the submitted code against env bootstrap codes or DB codes, atomically consumes a DB code's use-count, optionally stamps an `assignedRank`, and optionally places the redeemer into the captain approval queue. Users who already pass `hasCampAccess`, and god-email accounts, are short-circuited to `/` before the form renders.

---

## Layout & modules

Single vertical column at 430px, vertically centred via `AuthShell`. No decoration overlays (unlike Landing). No scrolling expected — card fits within the viewport.

### AuthShell chrome

`AuthShell` is the shared auth-screen wrapper. Props for this surface:

- `hideBack` — suppresses the Back button (there is no prior step to return to in this flow; the gate IS the entry point)
- `footer="Camp 404 is invite-only."` — renders a footer line at `JetBrains Mono/11px/normal/$muted-foreground`

### Card (`$card` fill, `$border` stroke, `$radius` corner radius, `24px` pad, `16px` gap)

One card, one column. Three regions:

| Region | Content |
|---|---|
| Header | Heading `"One more thing"` (Inter 18px/700/$card-foreground) + body copy (Inter 13px/normal/$muted-foreground) |
| Form body | `InputField` instance (label "Invite code", placeholder "CAMP-XXXX-XXXX") + optional inline `Alert` + `Button-Primary` ("Enter camp") |
| Signout row | "Sign out" link text (Inter 13px/500/$accent), centred |

**Body copy:** When `email` is provided: `"You're signed in as <email>. Camp 404 is invite-only — drop your code below to come aboard."` (two sentences — note the literal space before the second). When `email` is null (edge case: no primary email on the auth record): second sentence only.

**Alert block** (shown only on error): `fill:#f83e5a1f`, `stroke:$destructive`, `radius:$radius`, `pad:[10,12]`, `gap:8`, items aligned centre. Contains `triangle-alert` Lucide icon ($destructive colour) + error message text (Inter 13px/500/$destructive).

---

## Components used

| Component | Source | Role | Key props / variants |
|---|---|---|---|
| `AuthShell` | `apps/web/components/auth-shell.tsx` | Full-screen centred chrome, footer | `hideBack`, `footer` |
| `InputField` | canvas reusable (→ `@camp404/ui` `Input` + `Label`) | Invite code entry | label="Invite code", placeholder="CAMP-XXXX-XXXX", `autoComplete="off"`, `spellCheck={false}`, `autoCapitalize="off"`, `autoCorrect="off"`, `required`, `id="invite-code"`, `name="code"` |
| `Button-Primary` | canvas reusable (→ `@camp404/ui` `Button` variant="default") | Submit | `type="submit"`, `className="w-full"`, `disabled={isPending}`; label flips "Enter camp" ↔ "Checking…"; `op:0.6` while submitting |
| `Button` (link variant) | `@camp404/ui` `Button` | Sign-out escape | `variant="link"`, `asChild`, wraps `<a href="/auth/sign-out">` |
| `Label` | `@camp404/ui` | Associates label with input | `htmlFor="invite-code"` |
| Alert block | new (inline, no separate component) | Inline error display | `role="alert"` paragraph; destructive-tinted pill; Lucide `triangle-alert` icon |

No `CaptainLock`. No `TopChrome`. No `EmptyState`.

---

## States

| State | Trigger | Visible change |
|---|---|---|
| **Empty** | First render, no prior action state (`null`) | Input blank, placeholder "CAMP-XXXX-XXXX" shown, button "Enter camp" enabled |
| **Populated** | User has typed into the input | Input shows typed value; button still "Enter camp" |
| **Submitting / pending** | `isPending === true` after form submit | Button disabled, label "Checking…", `opacity:0.6`; input not disabled (board shows the typed code still visible) |
| **Validation error — empty** | Submit with blank/whitespace code (caught server-side by `redeemInviteForUser`; also HTML `required` blocks client-side) | Alert appears: `"Please enter an invite code."` Input retains blank value |
| **Validation error — invalid** | Code fails usability predicate (revoked, expired, exhausted, race-loser) or is not found in env/DB | Alert appears: `"That invite code isn't valid."` Input retains submitted value (board shows "CAMP-0000-0000") |
| **Validation error — rate limited** | 10+ attempts in 10 minutes for this `authUser.id` | Alert appears: `"Too many attempts — wait a few minutes and try again."` Input retains submitted value; button still visible and enabled (not disabled by rate limit itself — user waits and tries again) |
| **Success** | `redeemInviteForUser` returns `{ ok: true }` | Server `redirect("/")`. No in-form success UI — the redirect is the success state. Home (`app/page.tsx`) then routes onward to questionnaire/pending-approval/home proper |
| **Already-past-gate** | Page renders for a user where `hasCampAccess` returns true | Page-level `redirect("/")` before the form ever renders — user never sees the gate |
| **God-email bypass** | `isGodEmail(primaryEmail)` true | `hasCampAccess` returns true → same page-level `redirect("/")` short-circuit |
| **Unauthenticated** | No valid session | `getAuthenticatedUserOrRedirect()` → `redirect("/auth/sign-in")` — never reaches this page |

**Gating states not shown on this surface:**

- Onboarding-incomplete, pending-approval, rejected — these are *downstream* of a successful redemption; the gate screen never displays them. A `requiresApproval` code sets `approvalStatus: "pending"` on the user row, which the home spine (`app/page.tsx`) then routes to `/pending-approval` after the redirect; invisible to this screen.
- Captain/rank gating — N/A; this surface is open to any authenticated user who lacks a code.

---

## User actions

| Action | Result |
|---|---|
| Type into the invite code input | Input value updates; no intermediate validation |
| Submit form ("Enter camp") | Calls `submitInviteCode` server action: auth re-asserted, rate-limit checked, `redeemInviteForUser` called. On failure: returns to gate with inline error. On success: `redirect("/")` |
| Click "Sign out" | Navigates to `/auth/sign-out` (Neon Auth catch-all); session destroyed; lands at Landing or sign-in |

---

## Data & enums

### Tables read / written

**`invite_codes`** (read atomically via `consumeInviteCode`):

| Column | Type | Usage |
|---|---|---|
| `code` | `text` PK | Matched against submitted value |
| `revoked_at` | `timestamp` nullable | Usability predicate: must be NULL |
| `expires_at` | `timestamp` nullable | Usability predicate: NULL or > now |
| `max_uses` | `integer` nullable | Usability predicate: NULL or > `use_count` |
| `use_count` | `integer` NOT NULL default 0 | Atomically incremented on successful consume |
| `assigned_rank` | `rank` enum nullable | Optionally stamped onto user row on redemption |
| `requires_approval` | `boolean` NOT NULL default false | If true, sets redeemer's `approval_status` to `pending` |
| `invited_email` | `text` nullable | Not consumed by this gate (stored on code; read elsewhere) |

**`users`** (written via `redeemInviteForUser` → `createCampUser` or `setUserInviteCode` / `setUserRank` / `setUserApprovalStatus`):

| Column | Type | Usage |
|---|---|---|
| `invite_code` | `text` nullable | Written on successful redemption; durable gate evidence; `hasCampAccess` checks for non-null |
| `rank` | `rank` enum | Set to `assigned_rank` from code (or default `member` on first-time path); updated on existing-row path only if differs |
| `approval_status` | `approval_status` enum NOT NULL | Set `pending` if `requires_approval` (first-time: via `createCampUser`; existing: via `setUserApprovalStatus`, only if not already `pending`) |
| `display_name` | `text` | Seeded from `authUser.displayName ?? authUser.primaryEmail` on first-time create |
| `auth_user_id` | `text` | Lookup key for `findUserByAuthId`; not written here |

**`burner_profiles`** (indirectly): a first-time redemption calls `seedBurnerProfileAction(created.id)` which runs `ensureRequiredAction({ type: "questionnaire", actionKey: "burner_profile", ... })`. No-op under E2E mode.

### Enums (existing, no new schema)

| Enum | Values | Used here |
|---|---|---|
| `rank` | `captain \| member` | `assigned_rank` on invite code; stamped to `users.rank` |
| `approval_status` | `pending \| approved \| rejected` | `pending` set on requires-approval redemption; `approved` default (set on first-time non-requires-approval redemption); `rejected` never set here |

**No new schema changes on this surface.** All touched tables and enums are existing.

### Env config (not schema)

| Var | Usage |
|---|---|
| `GOD_EMAILS` | CSV; matching emails bypass gate entirely (`hasCampAccess` via `isGodEmail`) |
| `INVITE_CODES` | Bootstrap CSV of env codes; matched first, unlimited use, no rank, no approval, never consumed in DB |

### Rate-limit config (in-memory, not schema)

Key: `invite-redeem:<authUser.id>`. Limit: 10 attempts. Window: 10 minutes (600 000 ms). Per-user (not per-IP).

---

## Validation & edge cases

- **Auth precondition**: page AND action both call `getAuthenticatedUserOrRedirect()` — no unauthenticated access possible.
- **Code trimming**: trimmed in both `redeemInviteForUser` (before the empty check) and `claimInviteCode` (before env/DB lookup). Whitespace-only strings report "Please enter an invite code."
- **Env-code takes precedence**: `isEnvCode(trimmed)` is checked before DB; a code matching `INVITE_CODES` env var never touches the DB and never consumes. If a code exists in both env and DB, the env branch wins (no rank assignment, no approval flag, no use-count increment).
- **Atomic consume / race protection**: `consumeInviteCode` increments `use_count` inside a single guarded `UPDATE … WHERE` that includes all usability predicates. Two concurrent redeemers competing for the last use of a `maxUses=1` code: at most one gets a returned row; the race-loser receives `null` → "That invite code isn't valid."
- **Idempotent re-entry**: a user who already has `inviteCode` set (or is a god email) returns `{ ok: true }` immediately without burning another use or re-stamping rank/approval. The page also redirects such users to `/` before the form renders — they should never reach the action, but the server action is defensive regardless.
- **Approval edge on existing user**: `setUserApprovalStatus` is called only when `existing.approvalStatus !== "pending"` — so a `pending` user who somehow submits another requires-approval code is not double-queued. Note: a `rejected` user re-submitting a requires-approval code will be moved back to `pending` (the guard only skips the already-`pending` case). Whether this is intentional re-application semantics is flagged as an open question.
- **Rank stamping** (existing-row path only): applied only when `assignedRank` is non-null AND differs from the user's current rank. First-time path uses `assignedRank ?? "member"` unconditionally.
- **No orphan rows**: visiting `/signup/required` without successfully redeeming never persists a `users` row. `ensureCampUser` returns a synthetic in-memory row (`id: ""`) for non-god, no-invite users; that row is never written to DB.
- **Synthetic-row quirk**: synthetic row reports `approvalStatus: "approved"` and `rank: "member"` with empty `id` — irrelevant since `hasCampAccess` is false and the form is shown, not redirected.
- **E2E mode** (`E2E_TEST_MODE=1`): `consumeDbCode`, `findUserByAuthId`, `createUser`, etc. route to `testStore`; `seedBurnerProfileAction` is a no-op; env codes still work (env branch is backend-agnostic). Test-store expiry boundary differs from SQL: SQL uses `expiresAt > now` (strict greater), test store rejects `expiresAt <= new Date()` — i.e. a code expiring at exactly `now` is alive in SQL but dead in the test store.
- **Rate limit is per-process / in-memory**: no Redis; not distributed. Comment in `rate-limit.ts` notes it should swap to Upstash if the app fans out across regions.

---

## Flows

```
[Unauthenticated] ──→ /auth/sign-in  (getAuthenticatedUserOrRedirect redirect)

[Authenticated, hasCampAccess = true] ──→ / (page-level redirect before form renders)

[Authenticated, hasCampAccess = false]
  └──→ /signup/required renders with InviteGateForm

       User types code → submits
         ├── rate-limited ──→ stays on gate, alert "Too many attempts…"
         ├── empty/blank  ──→ stays on gate, alert "Please enter an invite code."
         ├── invalid code ──→ stays on gate, alert "That invite code isn't valid."
         └── valid code   ──→ consume code, stamp user row, redirect("/")
                                └──→ app/page.tsx gating spine:
                                       ├── requiresApproval → /pending-approval
                                       ├── onboarding incomplete → questionnaire gate
                                       └── all clear → home dashboard

       User clicks "Sign out"
         └──→ /auth/sign-out → session destroyed → Landing / sign-in
```

---

## Divergences from feature-set reference

| # | Feature-set says | Board / live code | Resolution |
|---|---|---|---|
| 1 | Feature-set describes `AuthShell` as "the auth card chrome wrapper" with `hideBack` and `footer` props, consistent with the board's footer `"Camp 404 is invite-only."` | Board has the footer text in a `▸ "Footer"` frame below the card, same copy | No divergence in content; `AuthShell` renders it identically. No action. |
| 2 | Feature-set notes three error messages exactly matching the board's three alert states (empty, invalid, rate-limit) | Board shows exactly those three states | Fully consistent. |
| 3 | Feature-set references `CAMP-XXXX-XXXX` as the placeholder format | Decisions log notes: "Fix the S03 gate `CAMP-XXXX-XXXX` placeholder to the slug format" | **Build reconciliation**: placeholder should be updated to match whatever slug format invite codes actually use (e.g. `CAMP-7F3A-K92B`). The board uses `CAMP-XXXX-XXXX` as a generic mask; submitting copy should describe the real format. Flag to copy owner — not a schema change. |
| 4 | Feature-set references `InputField` reusable component | Live code uses `@camp404/ui` `Input` + `Label` directly inside `InviteGateForm` (not a wrapper component named `InputField`) | `InputField` from the canvas is the Pencil design token for the `Input` + `Label` pairing from `@camp404/ui`. Spec references both names with the mapping made explicit. No functional divergence. |
| 5 | Feature-set mentions `AuthShell` has a `className` prop | Not used on this surface | Noted as unused; no action needed. |

---

## Open questions / build reconciliations

1. **Invite code placeholder format**: the board shows `CAMP-XXXX-XXXX`; real codes follow a random-slug pattern (e.g. `CAMP-7F3A-K92B`). Should the placeholder reflect the real format exactly (segment count, character class)? Decisions log flags this as stale copy — confirm with product owner before build.

2. **Rejected user re-applying a requires-approval code**: a user in `approvalStatus: "rejected"` who obtains and submits a new requires-approval code will be moved back to `approved_status: "pending"` (the `!== "pending"` guard allows it). Is this intentional second-chance semantics, or should `rejected` be a terminal state that blocks re-redemption? Needs a product decision; current code permits it.

3. **Rate limit persistence**: the in-memory token-bucket rate limiter resets on server restart and is not shared across process replicas. For the current single-process deployment this is acceptable; if the app is deployed across multiple regions/replicas, `rateLimit` should swap to Upstash Redis as noted in the source comment. Flag for infrastructure review before multi-region deploy.

4. **E2E expiry boundary asymmetry**: SQL `consumeInviteCode` uses `expiresAt > now` (alive if equal); the test store uses `expiresAt <= new Date()` to flag dead codes (dead if equal). A code expiring at exactly the current millisecond behaves differently in test vs production. Low-priority, but worth aligning during test harness maintenance.

5. **`invitedEmail` on invite code**: the column is stored (lowercased on insert) but never validated against the redeeming user's email on this gate — any authenticated user can redeem a code even if `invited_email` names someone else. Intentional (codes are shareable by design) or should targeted codes validate the redeemer's email? Confirm with product owner.
