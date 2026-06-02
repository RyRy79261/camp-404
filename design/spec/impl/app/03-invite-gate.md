# 03-invite-gate — app integration plan

- **Route(s):** `/signup/required` · routed page
- **Spec source:** `design/spec/surfaces/03-invite-gate.md`
- **Gating level:** open to any authenticated user with no camp access — no rank check, no `CaptainLock`.

---

## Current state — the existing route/files today

All three files already exist and are functionally complete. The surface is shipped and working; the redesign is a **presentation recomposition**, not a rebuild.

### `apps/web/app/signup/required/page.tsx` (34 lines, server component)

`force-dynamic`. Calls `getAuthenticatedUserOrRedirect()` → `ensureCampUser()` → `hasCampAccess()` → `redirect("/")` on access. Renders `<AuthShell hideBack footer="Camp 404 is invite-only."><InviteGateForm email={authUser.primaryEmail} /></AuthShell>`. All three redirect/render branches exactly match the spec. No functional gap.

### `apps/web/app/signup/required/invite-gate-form.tsx` (70 lines, `"use client"`)

Uses `useActionState(submitInviteCode, null)`. Renders: header (`text-2xl font-bold` heading + conditional `email` copy); a `grid gap-2` `Label`+`Input` pattern; a `<p className="text-sm text-[color:var(--color-destructive)]" role="alert">` error block; submit `Button`; sign-out `Button variant="link"` wrapping `<a href="/auth/sign-out">`.

**Gaps vs spec (all presentational):**
- `Label`+`Input` inline pattern must become `<InputField>` (`molecule-inputfield.md` §Absorbs lists `invite-gate-form.tsx` as a confirmed migration target).
- Bare `<p … text-[color:var(--color-destructive)] role="alert">` must become `<Alert tone="destructive">` (`molecule-alert.md` §Absorbs lists `invite-gate-form.tsx` explicitly).
- Submit button has no `opacity:0.6` while pending (spec: `op:0.6` at `isPending`); needs `disabled:opacity-60` via Tailwind or an explicit `className` augment.
- Sign-out button uses `text-[color:var(--color-muted-foreground)]`; spec specifies `$accent` colour for the "Sign out" link text (`Inter 13px/500/$accent`). Currently off-spec — `variant="link"` default resolves to primary colour; the current className explicitly overrides to muted-foreground. Must snap to `text-accent` (or confirm `variant="link"` renders in `$accent` after foundations token pass).
- Heading uses `text-2xl font-bold` (Inter 24px/700); spec: `Inter 18px/700/$card-foreground`. Must be snapped to `text-lg font-bold` (18px step) or a `--text-title` token once foundations land.
- Card body `gap-6`: spec layout is `16px gap` between card regions; current `flex flex-col gap-6` (24px). Snap to `gap-4` (16px).
- Placeholder: currently no `placeholder` attribute on the `Input`; spec requires `placeholder="CAMP-XXXX-XXXX"` (pending open-question #1 on format). Add it.

### `apps/web/app/signup/required/actions.ts` (43 lines, `"use server"`)

`submitInviteCode(_prev, formData)`: calls `getAuthenticatedUserOrRedirect()`, `rateLimit("invite-redeem:<id>", {limit:10, windowMs:600_000})`, `redeemInviteForUser(authUser, code)`, then `redirect("/")` on success. Returns `{ ok: false; error: string }` on failure. Exactly matches the spec's action contract. No gap.

---

## File structure — target files in `apps/web`

| File | Status | Action | Notes |
|---|---|---|---|
| `apps/web/app/signup/required/page.tsx` | EXISTS | **MODIFY** (minor token/type reconciliation) | Snap heading size + gap; otherwise REUSE. |
| `apps/web/app/signup/required/invite-gate-form.tsx` | EXISTS | **MODIFY** (recompose leaf components) | Replace `Label`+`Input` → `InputField`; replace error `<p>` → `Alert`; fix button opacity + sign-out colour + card gap. |
| `apps/web/app/signup/required/actions.ts` | EXISTS | **REUSE** (no change) | Logic, rate-limit, and error strings are already spec-correct. |
| `apps/web/components/auth-shell.tsx` | EXISTS | **MODIFY** (token reconciliation per its own plan) | Owned by `organism-authshell.md`; invite-gate inherits the footer mono/11px fix automatically. No invite-gate–specific change needed here. |

No new files. No deletions. No `/api` route handlers or `error.tsx`/`not-found.tsx` needed on this surface.

---

## Components composed

| Component | Plan | Verdict | Renders in | Role on this surface |
|---|---|---|---|---|
| `AuthShell` | [`organism-authshell.md`](../components/organism-authshell.md) | PROMOTE/REUSE (keep app-local) | Client (is `"use client"` itself) | Full-screen centred chrome; provides `Card`/`CardContent` shell + optional footer text. Mount: `<AuthShell hideBack footer="Camp 404 is invite-only.">`. |
| `InviteGateForm` | this plan | EXTEND | Client (`"use client"`) | The form organism. Only interactive element on this surface. Mounts inside `AuthShell` as its `children`. |
| `InputField` | [`molecule-inputfield.md`](../components/molecule-inputfield.md) | PROMOTE → `@camp404/ui` | Client (inside `InviteGateForm`) | Replaces the hand-rolled `Label`+`Input` pair. Props: `label="Invite code"` `id="invite-code"` `name="code"` `placeholder="CAMP-XXXX-XXXX"` `autoComplete="off"` `spellCheck={false}` `autoCapitalize="off"` `autoCorrect="off"` `required` `className="font-mono"` (slug face). |
| `Alert` | [`molecule-alert.md`](../components/molecule-alert.md) | PROMOTE → `@camp404/ui` | Client (inside `InviteGateForm`) | Replaces the bare error `<p>`. Mounts only when `state && !state.ok`. Props: `tone="destructive"`. |
| `Button` (primary) | [`atom-button.md`](../components/atom-button.md) | REUSE | Client (inside `InviteGateForm`) | Submit: `type="submit"` `className="w-full disabled:opacity-60"` `disabled={isPending}`. Label toggles `"Enter camp"` ↔ `"Checking…"`. |
| `Button` (link variant) | [`atom-button.md`](../components/atom-button.md) | REUSE | Client (inside `InviteGateForm`) | Sign-out escape: `variant="link"` `asChild` wrapping `<a href="/auth/sign-out">`. Class: `text-accent` (snap from current `text-[color:var(--color-muted-foreground)]`). |
| `Label` | [`atom-label.md`](../components/atom-label.md) | REUSE (absorbed into `InputField`) | — | No longer directly used in `InviteGateForm` after `InputField` migration. |
| `Input` | [`atom-input.md`](../components/atom-input.md) | REUSE (absorbed into `InputField`) | — | Same — rendered through `InputField`. |

**No `CaptainLock`** — this surface has no rank check. The spec states explicitly: "No `CaptainLock`. No `TopChrome`. No `EmptyState`."

---

## Services & data

### Server-side (in `page.tsx` — before form renders)

| Call | Module | What it does |
|---|---|---|
| `getAuthenticatedUserOrRedirect()` | `apps/web/lib/auth.ts` | Asserts a valid Neon Auth session; redirects to `/auth/sign-in` if none. Returns `AuthenticatedUser` (`{ id, primaryEmail, displayName, … }`). |
| `ensureCampUser(authUser)` | `apps/web/lib/users.ts` | Resolves or creates (for god emails) a `CampUser`. For non-god, no-invite users returns a synthetic row (`id: ""`; never written to DB). No DB write for the invite-gate surface itself. |
| `hasCampAccess(campUser, authUser.primaryEmail)` | `apps/web/lib/users.ts` (→ `@camp404/core` post-extraction) | Pure: `isGodEmail(email) || !!user.inviteCode`. If true → `redirect("/")` before the form renders. |

All three calls are server-side only. `authUser.primaryEmail` is the only value passed down to the client as a prop (`InviteGateForm email={authUser.primaryEmail}`).

### Client-to-server (in `actions.ts` — on form submit)

| Call | Module | What it does |
|---|---|---|
| `getAuthenticatedUserOrRedirect()` | `apps/web/lib/auth.ts` | Re-asserts session in the action. Defensive: if session expired between page load and submit, redirects to sign-in. |
| `rateLimit("invite-redeem:<authUser.id>", {limit:10, windowMs:600_000})` | `apps/web/lib/rate-limit.ts` (→ `@camp404/core` post-extraction) | Per-user in-memory token bucket. Returns `{ ok: false }` if exceeded → `"Too many attempts…"` error returned (no redirect, user waits and retries). |
| `redeemInviteForUser(authUser, rawCode)` | `apps/web/lib/users.ts` | The redemption orchestrator. Trims code, checks idempotent re-entry, calls `claimInviteCode` (env-precedence + atomic `consumeInviteCode`), then creates or updates the `users` row. Returns `{ ok: true }` on success or `{ ok: false; error: string }` on failure. |
| `redirect("/")` | `next/navigation` | On `result.ok === true`. Success state is the redirect — no in-form success UI. |

### Data flow summary

```
page.tsx (server)
  ├── getAuthenticatedUserOrRedirect() → AuthenticatedUser
  ├── ensureCampUser(authUser) → CampUser (synthetic if no invite)
  ├── hasCampAccess(campUser, email) → true → redirect("/")
  └── false → render <AuthShell><InviteGateForm email={authUser.primaryEmail} /></AuthShell>

InviteGateForm (client)
  └── useActionState(submitInviteCode, null) → [state, formAction, isPending]

actions.ts (server action, on submit)
  ├── getAuthenticatedUserOrRedirect() → re-asserts session
  ├── rateLimit("invite-redeem:<id>") → ok | rate-limited error
  ├── redeemInviteForUser(authUser, code)
  │     ├── claimInviteCode(code)
  │     │     ├── isEnvCode → env match → ClaimedInvite (no DB write)
  │     │     └── consumeInviteCode (atomic UPDATE) → InviteCodeRow | null
  │     ├── createUser (first-time) or setUserInviteCode/setUserRank/setUserApprovalStatus
  │     └── seedBurnerProfileAction(created.id) [first-time only; no-op in E2E]
  └── redirect("/") on ok
```

### Tables touched

- **`invite_codes`** (read + update via `consumeInviteCode`): `code`, `revoked_at`, `expires_at`, `max_uses`, `use_count` (incremented), `assigned_rank`, `requires_approval`.
- **`users`** (write via `createUser` or `setUserInviteCode`/`setUserRank`/`setUserApprovalStatus`): `invite_code`, `rank`, `approval_status`, `display_name`, `auth_user_id`.
- **No schema change.** Confirmed: `design/spec/surfaces/03-invite-gate.md §Enums`: "No new schema changes on this surface." All touched tables and enums are existing.

---

## Gating

This surface is the **G1 invite gate** in the access spine — it is itself a gate, not behind one.

| Gate type | Treatment |
|---|---|
| **Unauthenticated** | `getAuthenticatedUserOrRedirect()` in `page.tsx` → `redirect("/auth/sign-in")`. User never reaches the form. |
| **Already has access** (`hasCampAccess = true`) | Page-level `redirect("/")` before form renders. Covers both god-email accounts and users who already have a code on file. |
| **No access (intended audience)** | Page renders the form. |
| **Rank / captain gate** | N/A. This surface is explicitly open to any authenticated user without a code, regardless of rank. No `requireClearance`, no `CaptainLock`. |
| **Preview-but-locked** | N/A. Not a captain/rank surface. The spec states: "No `CaptainLock`." |

The three redirect paths (`→ /auth/sign-in`, `→ /`) are all server-side before any client code runs.

---

## States

| State | Trigger | Visible change |
|---|---|---|
| **Empty** | First render, `state === null` | Input blank, placeholder `CAMP-XXXX-XXXX` shown, button "Enter camp" enabled, no alert. |
| **Populated** | User has typed | Input shows typed value; button still "Enter camp". |
| **Submitting** | `isPending === true` | Button disabled (`disabled:opacity-60`), label "Checking…"; input not disabled (typed code remains visible per board). |
| **Error — empty code** | Submit with blank/whitespace (`redeemInviteForUser` trims first; HTML `required` blocks client-side before action) | Alert `tone="destructive"`: "Please enter an invite code." Input retains blank value. |
| **Error — invalid code** | Code not found or fails usability predicate (revoked, expired, exhausted, race-loser) | Alert: "That invite code isn't valid." Input retains submitted value. |
| **Error — rate limited** | 10+ attempts in 10 min for `authUser.id` | Alert: "Too many attempts — wait a few minutes and try again." Input retains value; button remains enabled (user waits and retries). |
| **Success** | `result.ok === true` | `redirect("/")` from the action — no in-form success UI. Home spine then routes to questionnaire / pending-approval / home. |
| **Already-past-gate** (pre-render) | `hasCampAccess = true` on page load | Page-level `redirect("/")` — form never rendered. |
| **Unauthenticated** (pre-render) | No valid session | `getAuthenticatedUserOrRedirect()` → `redirect("/auth/sign-in")` — page never rendered. |

**Gating states not shown on this surface** (per spec §States): onboarding-incomplete, pending-approval, rejected — these are all downstream of a successful redemption and are handled by `app/page.tsx`'s gating spine after the `redirect("/")`.

---

## Build steps

Prerequisites and ordering are derived from the architecture phase plan (`architecture.md §Service-layer build order`). This surface's recompose rides **Phase 0 (foundations) + Phase 5 (NEW reusables)**; the action layer is already correct and needs no build work.

### Prerequisites (must land before invite-gate recompose)

| Prerequisite | Plan | Phase | Blocks |
|---|---|---|---|
| Phase 0 foundations: status tokens (`--color-success`/`-warning`), `--color-accent` short token, `--text-*` scale, `bg-muted`/`text-muted-foreground` aliases | `foundations-tokens.md` | Phase 0 | `Alert` (destructive tone), `InputField` token resolution, `AuthShell` footer mono reconciliation, sign-out `text-accent` fix. |
| `InputField` built + exported from `@camp404/ui` | `molecule-inputfield.md` | Phase 5 | Replaces inline `Label`+`Input`. |
| `Alert` built + exported from `@camp404/ui` (needs Phase 0 tokens) | `molecule-alert.md` | Phase 5 | Replaces inline error `<p>`. |
| `AuthShell` token reconciliation | `organism-authshell.md` | Phase 0 / Step 1 | Footer renders in JetBrains Mono 11px as spec requires. |
| `@camp404/core` scaffold + `hasCampAccess` extraction (thin shim in `users.ts`) | `service-layer/01-identity-access-gating.md` Phase 3a | Phase 3 | No blocker for invite-gate specifically — the existing `hasCampAccess` call in `page.tsx` continues working unchanged through the shim. |

### Step 1 — Migrate `InviteGateForm` to `InputField`

**Prerequisite:** `molecule-inputfield.md` shipped.

Replace the inline `<div className="grid gap-2"><Label htmlFor="invite-code">Invite code</Label><Input id="invite-code" name="code" … /></div>` block in `invite-gate-form.tsx` with:

```tsx
<InputField
  label="Invite code"
  id="invite-code"
  name="code"
  placeholder="CAMP-XXXX-XXXX"
  autoComplete="off"
  spellCheck={false}
  autoCapitalize="off"
  autoCorrect="off"
  required
  className="font-mono"
/>
```

Remove the now-unused `Label` and `Input` imports.

**Acceptance:** `getByLabelText("Invite code")` resolves the `<input>`; placeholder "CAMP-XXXX-XXXX" is present; `font-mono` class is on the input; no remaining `<div className="grid gap-2"><Label` pattern in the file. CI green.

### Step 2 — Replace error `<p>` with `Alert`

**Prerequisite:** `molecule-alert.md` shipped (needs Phase 0 tokens for visual correctness, but can land structurally before tokens for CI).

Replace:
```tsx
{state && !state.ok && (
  <p className="text-sm text-[color:var(--color-destructive)]" role="alert">
    {state.error}
  </p>
)}
```
with:
```tsx
{state && !state.ok && (
  <Alert tone="destructive">{state.error}</Alert>
)}
```

The spec's inline alert anatomy (`fill:#f83e5a1f`, `stroke:$destructive`, `triangle-alert` icon) is satisfied by `Alert tone="destructive"` — that component owns the tint, border, and icon.

**Acceptance:** `getByRole("alert")` returns the `Alert` element; error message text is inside it; no remaining `text-[color:var(--color-destructive)]` in the file. Destructive fill/border visible. CI green.

### Step 3 — Token and copy reconciliations in `InviteGateForm`

Apply all remaining visual gaps identified in §Current state:

1. **Heading size:** `text-2xl font-bold` → `text-lg font-bold` (18px, spec `Inter 18px/700/$card-foreground`). Or snap to `--text-title` token once it lands (from foundations).
2. **Card body gap:** `flex flex-col gap-6` → `flex flex-col gap-4` (16px, spec `16px gap`).
3. **Submit button opacity:** add `disabled:opacity-60` to the submit `Button`'s `className` so the pending state shows `opacity:0.6`.
4. **Sign-out button colour:** replace `className="text-[color:var(--color-muted-foreground)]"` with `className="text-accent"` (spec `$accent`).

**Acceptance:** heading renders at 18px; gap between card regions is 16px; pending submit button shows at 60% opacity; sign-out link text resolves to `$accent` colour; no `text-[color:var(...)]` escape-hatch classes remain in `invite-gate-form.tsx`. CI green.

### Step 4 — `page.tsx` heading/copy cross-check

Verify `page.tsx` needs no changes beyond what `AuthShell` and `InviteGateForm` provide. Confirm:
- `dynamic = "force-dynamic"` still present.
- `metadata.title` is `"Invite required — Camp 404"` (already correct).
- `AuthShell` receives `hideBack` and `footer="Camp 404 is invite-only."` (already correct).
- `InviteGateForm email={authUser.primaryEmail}` prop still wired.

**Acceptance:** `page.tsx` compiles unchanged (or with zero diff); all three redirect branches (`unauthenticated`, `hasCampAccess=true`, render) remain exactly as today.

### Step 5 — E2E regression + new test coverage

**Prerequisite:** E2E_TEST_MODE seam (`isE2ETestMode()` + `testStore`) already in place.

Existing E2E coverage to keep green:
- `apps/web/tests/e2e/invite-tracking.spec.ts`: `redeemInviteAtGate(page, "TEST-INVITE")` navigates to `/signup/required`, fills `getByLabel("Invite code")`, clicks `getByRole("button", { name: "Enter camp" })`. The label name change from bare `<Label>` to `InputField`-rendered `<Label>` must not break the `getByLabel` selector (it won't — `InputField` uses the same `htmlFor`/`id` association).
- Existing cases: env-code redemption, DB-code provenance, approval-required → pending, one-shot race-loser, already-redeemed idempotency.

New test notes (not yet covered, add as part of this surface's build):
- **Unit (RTL, `invite-gate-form.test.tsx`, app-local):**
  - Empty state: `getByLabel("Invite code")` present; `getByRole("button", { name: "Enter camp" })` enabled; no alert.
  - Pending state: set `isPending=true` via mock action → button disabled + label "Checking…" + `opacity-60` class present.
  - Error state: action returns `{ ok: false, error: "That invite code isn't valid." }` → `getByRole("alert")` contains that string.
  - Email present: prop `email="foo@example.com"` → "You're signed in as foo@example.com." visible.
  - Email absent: prop `email={null}` → second sentence only rendered; no "You're signed in as" in DOM.
  - Sign-out link: `getByRole("link", { name: "Sign out" })` has `href="/auth/sign-out"`.
- **E2E (extend `invite-tracking.spec.ts`):**
  - Rate-limit path: submit 10 invalid codes → 11th attempt renders "Too many attempts" alert (requires E2E_TEST_MODE seam to avoid waiting 10 min; the in-memory limiter resets between test runs via `resetTestState`).
  - Empty-submit path: submit blank code → "Please enter an invite code." alert (blocked client-side by `required`, but verify the HTML `required` attribute is present and the error is surfaced).

**Acceptance:** `pnpm test` (unit) + `pnpm playwright` (e2e) both green; `redeemInviteAtGate` helper still resolves `getByLabel("Invite code")` and `getByRole("button", { name: "Enter camp" })` after the `InputField` migration.

---

## Open items

These are surface-specific additions to / cross-references of the open questions documented in `design/spec/surfaces/03-invite-gate.md §Open questions`:

1. **Invite code placeholder format** (S03 OQ #1 / `service-layer/02-invites.md` divergence #3): build Step 1 uses `placeholder="CAMP-XXXX-XXXX"` as specified; the spec itself flags this as stale copy pending a product/copy-owner decision on whether to reflect the real random-slug format (e.g. `CAMP-7F3A-K92B`). Confirm before or during Step 1 — it is a single-attribute change if updated.

2. **Rejected user re-applying a requires-approval code** (S03 OQ #2): `redeemInviteForUser` (unchanged by this surface plan) allows a `rejected` user to move back to `pending` via the `!== "pending"` guard. This surface plan makes no recommendation; flag for a product decision before the invite service build step (`service-layer/02-invites.md` Step 6 test closeout is the logical place to capture the decision as a test case).

3. **Rate-limit reset in E2E tests**: the rate-limit state is in-memory and keyed per `authUser.id`. The new rate-limit E2E test note in Step 5 above depends on `resetTestState` clearing the rate-limit bucket between runs. Confirm `apps/web/app/api/test/reset/route.ts` (or equivalent test-seam reset endpoint) clears `rateLimit` state; if not, the limiter's in-memory `Map` must be exported and cleared via the reset API.

4. **Sign-out button colour: `$accent` vs `$muted-foreground`** (Step 3 item 4): the spec says `$accent`; the current live code uses `text-[color:var(--color-muted-foreground)]`. Confirm that `variant="link"` on `Button` resolves to `$accent` by default after the foundations token pass, or that `className="text-accent"` override is correct and approved. Either is trivially one class change.

5. **`hasCampAccess` / `isApproved` extraction to `@camp404/core`** (architecture plan Phase 3a, service-layer/01): when the extraction lands, `page.tsx` should import the shim from `@/lib/users` without change (the shim's call signature stays `(user, email)`). No page.tsx edit is needed for this surface as part of the extraction change; note for the extraction PR author to confirm CI stays green on the invite-gate route.

6. **`rateLimit` extraction to `@camp404/core`** (architecture plan Phase 3, service-layer/09): when `rateLimit` moves to `@camp404/core`, `actions.ts` will update its import path. The action file is dead-simple (43 lines); the import change is the full delta. No behaviour change.
