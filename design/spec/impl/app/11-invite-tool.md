# 11-invite-tool — app integration plan
- Route(s): /tools/invite · routed page

> **Classification headline:** the surface **exists and works today** and is **REUSE/EXTEND, app-layer only**. No schema change (`invite_codes` already models every feature — `service-layer/02-invites.md` §"Redesign delta", db-impact `invite_codes`: "NO schema change"). No new route, no new server action, no new API route. The redesign (a) decomposes the 369-line `invite-form.tsx` monolith into its canonical leaves, (b) snaps off-token colours to status tokens, (c) single-sources two pure helpers + the rules-hint into `@camp404/core`, (d) builds the −/+ stepper the board draws, and (e) fixes the stale Tools-hub copy. **No functionality is dropped.** This is the **only** safe rank boundary on the surface (`assigned_rank` always `NULL`), recomputed server-side.

---

## Current state — the existing route/files today

Confirmed by reading source on this branch.

| File | Lines | What it is | Disposition |
|---|---|---|---|
| `apps/web/app/tools/invite/page.tsx` | 32 | Server component (`export const dynamic = "force-dynamic"`, `metadata.title = "Invite — Camp 404"`). Auth → `ensureCampUser` → `hasCampAccess` gate (`redirect("/signup/required")`) → `isApproved` gate (`redirect("/pending-approval")`) → renders a ghost-back `Button asChild variant="ghost" size="sm"` linking `/tools` (Lucide `ChevronLeft`) + `<InviteForm isCaptain={campUser.rank === "captain"} />`. Wrapper `<main className="mx-auto max-w-xl px-6 py-10">`. | **MODIFY** (small: ghost-back via `GhostBack` molecule, container reconcile, no logic change) |
| `apps/web/app/tools/invite/invite-form.tsx` | 369 | `"use client"` **monolith**: `InviteForm({ isCaptain })`, the `Availability` union type (L23–28), and three private unexported sub-components — `AvailabilityHint` (L212–255, off-token `text-emerald-400` L229, `Check`/`X` icons, no `aria-live`), `CaptainOptions` (L258–315, **bare `<Input type="number" min={1} max={100} className="w-28">`** L297–306, no −/+ stepper), `SuccessPanel` (L317–368, `font-mono text-lg` CodeBox + bare `setTimeout(…,1500)` Copy flip with no unmount cleanup L353–359). Whole form wrapped in `Card`/`CardHeader`/`CardContent` with a rank-branched `CardDescription` (L108–112). Email field with `multiUse` label/required flip (L116–128); note `Textarea rows={3}` (L130–138); `MemberNote` as a plain `<p className="rounded-md border bg-muted/40 …">` (L148–151, NOT an `Alert`); code `Input className="font-mono"` + separate Shuffle `Button` (L154–177); server-error as hand-rolled `<p role="alert" className="… border-destructive/40 bg-destructive/10 …">` (L179–186); Create `Button` disabled on `isPending \|\| checking \|\| taken \|\| invalid` (L188–205). | **MODIFY** (the EXTEND — decompose into leaves; per `organism-inviteform.md`, file kept + refactored, NOT relocated) |
| `apps/web/app/tools/invite/actions.ts` | 156 | `"use server"`. `createInviteAction(_prev, formData) → CreateInviteResult` — auth (`getAuthenticatedUser`) → `ensureCampUser` → `hasCampAccess` gate → `isCaptain = campUser.rank === "captain"` recompute → field parse/validate (`EMAIL_PATTERN` L24, `MAX_USES_LIMIT = 100` L28) → `findInviteCodeByCode` uniqueness pre-check → `createInviteCode` with `assignedRank: null` (L133). Private `generateUnusedCode()` (L146–155): 8-retry loop, timestamp-suffix fallback. | **MODIFY** (EXTEND: re-point `generateInviteCode`/`isSyntacticallyValidCode` imports `@/lib/invite-words` → `@camp404/core`; single-source the rules string; logic unchanged — `service-layer/02-invites.md` §Server actions) |
| `apps/web/app/api/tools/invite/check/route.ts` | 65 | `runtime = "nodejs"`. `GET` — auth → `rateLimit("invite-check:<id>", {limit:30, windowMs:60_000})` → 429 w/ `retry-after` → parse `?code` → `isSyntacticallyValidCode` → existence read: **`testStore.findUsableInviteCode` in E2E vs `findInviteCodeByCode` in prod** (the prod/test divergence — S14 OQ #4). Returns `{available, reason?, hint?}`. Already imports `CODE_RULES_HINT` from `@/lib/invite-words`. | **MODIFY** (EXTEND: re-point imports to `@camp404/core`; reconcile prod/test existence semantics — service-layer step 4) |
| `apps/web/app/tools/page.tsx` (Tools hub, S13) | — | The entry. `TOOLS[0]` "Invite a member" description = **"Mint a single-use code to bring someone onto Camp 404."** (stale — captains can mint multi-use; uses Lucide `Mail`). | **MODIFY** (copy only — drop "single-use", S14 OQ #7) |

**Not part of this surface but the host data path (REUSE, no change here):** `apps/web/lib/invite-words.ts` (`generateInviteCode`, `isSyntacticallyValidCode`, `CODE_RULES_HINT` — moving to `@camp404/core`, owned by service-layer step 1), `apps/web/lib/users.ts` (`ensureCampUser`, `hasCampAccess`, `isApproved`), `apps/web/lib/auth.ts` (`getAuthenticatedUserOrRedirect`, `getAuthenticatedUser`), `packages/db/src/invite-codes.ts` (`createInviteCode`, `findInviteCodeByCode`), `apps/web/lib/test-store.ts` (invite methods), `apps/web/lib/rate-limit.ts`.

**What the redesign changes (net):**
1. Split the monolith: `Availability` type → `types.ts`; `AvailabilityHint` → `availability-hint.tsx`; `Stepper` → `stepper.tsx`; the code row + success CodeBox → the promoted `@camp404/ui` `CodeDisplay`; email/note label pairs → `InputField`; `MemberNote` + server-error → `Alert`.
2. Build the −/+ stepper affordance (board #23 §4) over a real number input + the existing `[1,100]` server validation.
3. Render `MemberNote` as an `Alert variant="info"` row (a code branch that does NOT exist live yet — today it's a plain `<p>`).
4. Token-clean: `text-emerald-400` → `text-success`; correct icons (`circle-check`/`circle-x`); `aria-live` on the hint.
5. Single-source `CODE_RULES_HINT` (client hint currently hardcodes a divergent string at L56) and re-point pure helpers to `@camp404/core`.
6. Reconcile card treatment + container (OQ #1, OQ #5); fix stale hub copy (OQ #7).

No behaviour is removed: the rank-branched form, the `idle|checking|available|taken|invalid` state machine, the captain knobs, the success swap, and the two-pass validation all survive.

---

## File structure — target files in apps/web (CREATE/MODIFY/DELETE vs current)

```text
apps/web/app/tools/invite/
├── page.tsx                  MODIFY  server component (gating spine; mounts InviteForm)
├── invite-form.tsx           MODIFY  "use client" island (the organism shell; decomposed)
├── types.ts                  CREATE  the `Availability` union (shared by form + hint + tests)
├── availability-hint.tsx     CREATE  "use client" leaf — extracted from invite-form.tsx
├── stepper.tsx               CREATE  "use client" leaf — −/+ over a number input
├── actions.ts                MODIFY  "use server" — re-point imports to @camp404/core
├── availability-hint.test.tsx  CREATE  RTL (owned by molecule-availabilityhint.md)
├── availability-hint.stories.tsx CREATE Storybook (owned by leaf plan)
├── stepper.test.tsx          CREATE  RTL (owned by molecule-stepper.md)
└── stepper.stories.tsx       CREATE  Storybook (owned by leaf plan)

apps/web/app/api/tools/invite/
└── check/route.ts            MODIFY  route handler — re-point imports; prod/test reconcile

apps/web/app/tools/
└── page.tsx                  MODIFY  Tools-hub copy only (drop "single-use")
```

- **No new route** (`/tools/invite` already routes). **No new server action** (`createInviteAction` exists). **No new `/api` route handler** (the check route exists). `SuccessPanel` and `CaptainOptions` stay **private composition shells inside `invite-form.tsx`** — they are not promoted to standalone files (`organism-inviteform.md` §Composition: "remain private composition shells … not standalone library components").
- **error.tsx / not-found.tsx / loading.tsx:** none for this route, and none needed. The app already has `apps/web/app/error.tsx`, `global-error.tsx`, `not-found.tsx` (global boundaries). This page is `force-dynamic` and gates synchronously (redirect, not suspense). No route-segment `loading.tsx` (the only async work is the page-level auth/gate, which redirects rather than streams). **DELETE: none.**
- **`max-w-xl` decision (OQ #5):** the page wrapper uses `mx-auto max-w-xl` — wider than the app default (`/tools` hub uses `max-w-2xl`; other surfaces vary). Keep `max-w-xl` OR normalise to the global container; record the decision in the page diff. No functional impact either way.

---

## Components composed

All render **inside the `"use client"` `InviteForm` island** (the rank decision is made server-side in `page.tsx` and passed as the sole `isCaptain` prop). The page server component renders only `GhostBack` + the island.

| Component | Plan | Package / file | Server vs client | Where it renders |
|---|---|---|---|---|
| `GhostBack` | `design/spec/impl/components/molecule-ghostback.md` | (per leaf plan) | **server** (in `page.tsx`) | Ghost back-link "Tools" (Lucide `chevron-left`) → `/tools`. Replaces today's inline `Button asChild variant="ghost"`. Keep the ghost treatment (NOT the round-pill `DetailHeader BackBtn`). |
| `InviteForm` | `design/spec/impl/components/organism-inviteform.md` | app-local `apps/web/app/tools/invite/invite-form.tsx` (REUSE/EXTEND) | **client** (`"use client"`) | The whole tool. Single prop `isCaptain`. |
| `InputField` | `design/spec/impl/components/molecule-inputfield.md` | `@camp404/ui/components/input-field` (PROMOTE) | client | Email field (label/required flip on `multiUse`); the code field's label. Replaces inline `<div className="space-y-2"><Label><Input>` pairs. |
| `Textarea` | `design/spec/impl/components/atom-textarea.md` | `@camp404/ui/components/textarea` (REUSE) | client | Note body (`name="note"`, `rows={3}`, always optional). No voice/dictation (note is not a questionnaire field; voice is field-level only). |
| `CaptainOptions` | (no separate leaf; private shell) | inline in `invite-form.tsx` | client | Captain-only block (`isCaptain` render-gate): pre-approve `Checkbox` + `Stepper` + helper copy. |
| `Checkbox` | `design/spec/impl/components/atom-checkbox.md` | `@camp404/ui/components/checkbox` (REUSE) | client | Pre-approve toggle (`name="preApprove"`, controlled, submits `"on"`). |
| `Stepper` | `design/spec/impl/components/molecule-stepper.md` | app-local `apps/web/app/tools/invite/stepper.tsx` (NEW) | client | Multi-use cap `[1,100]` — −/+ `Button`s over a real `Input type="number"`. Replaces the bare number input. |
| `Alert` (MemberNote) | `design/spec/impl/components/molecule-alert.md` | `@camp404/ui/components/alert` (PROMOTE) | client | `variant="info"` (Lucide `info`, muted) — member variant ONLY; replaces the plain `<p>`. |
| `Alert` (server error) | same | same | client | `variant="destructive" role="alert"` — shows `result.error` only when `result && !result.ok`. |
| `CodeDisplay` (code row) | `design/spec/impl/components/molecule-codedisplay.md` | `@camp404/ui/components/code-display` (PROMOTE) | client | `editable-shuffle` variant: `value={code}`, `onChange={setCode}` (lowercases), `onShuffle={() => setCode(generateInviteCode())}`, `aria-label="Invite code"`. Owns the Shuffle `Button` internally. |
| `AvailabilityHint` | `design/spec/impl/components/molecule-availabilityhint.md` | app-local `apps/web/app/tools/invite/availability-hint.tsx` (NEW) | client | The live availability line beneath the code row; consumes `Availability`. `role="status" aria-live="polite"`. |
| `Button` (Create) | `design/spec/impl/components/atom-button.md` | `@camp404/ui/components/button` (REUSE) | client | `type="submit"`, `className="w-full"`, label "Create invite" ↔ "Creating…" + `Loader2`, `opacity-70` pending. |
| `Card` family | `design/spec/impl/components/molecule-card.md` | `@camp404/ui/components/card` (REUSE) | client | Form wrapper + SuccessPanel wrapper (reconcile to card-both — OQ #1). |
| `SuccessPanel` | (no separate leaf; private shell) | inline in `invite-form.tsx` | client | Post-mint card: head + composed copy + meta rows + `CodeDisplay readonly-copy` CodeBox + Copy/Send-another `Button`s. |
| `CodeDisplay` (success CodeBox) | `design/spec/impl/components/molecule-codedisplay.md` | `@camp404/ui/components/code-display` | client | `readonly-copy` variant: `value={code}`, `onCopy={async () => navigator.clipboard.writeText(code)}`, "Copied" flip 1500 ms (timer cleanup moves INTO the component — fixes the live unmount-leak). |

**Not used (confirm in build):** `TopChrome`, `DetailHeader`, `EmptyState`, `CaptainLock` (S14 §"Components used → Not used"). No preview-but-locked gating applies (see §Gating).

---

## Services & data

### Server-side (in `page.tsx`, before the island renders)

- `getAuthenticatedUserOrRedirect()` (`apps/web/lib/auth.ts`) — session → auth user (REUSE).
- `ensureCampUser(authUser)` (`apps/web/lib/users.ts`) — session → `users` row; reads `rank`, `inviteCode`, `approvalStatus` (REUSE).
- `hasCampAccess(campUser, authUser.primaryEmail)` (`apps/web/lib/users.ts`) — invite gate (REUSE; body extracts to `@camp404/core` per architecture, app keeps a thin shim — owned by service-layer plan 01, call-site unchanged here).
- `isApproved(campUser, authUser.primaryEmail)` (`apps/web/lib/users.ts`) — approval gate (REUSE).
- **Passed as the sole prop:** `isCaptain={campUser.rank === "captain"}`. The client never reads rank from the session. No captain-only **data** is fetched (the whole surface serves both ranks), so there is no withheld-data prop and no `CaptainLock`.

### Client-side (inside `InviteForm`)

- **Mint (server action):** `createInviteAction(_prev, formData)` (`apps/web/app/tools/invite/actions.ts`, `"use server"`), bound via `useActionState`. Consumes `FormData` (`email`, `note`, `code`, captain-only `preApprove`/`maxUses`). Returns `CreateInviteResult` = `{ok:true, code, invitedEmail, maxUses, requiresApproval}` | `{ok:false, error}`. **The security boundary:** re-validates everything, **recomputes `isCaptain` from the DB row** (a crafted POST with `preApprove=on`/`maxUses=50` from a member is ignored — the `maxUses` branch only runs for captains; `preApprove = isCaptain && …`), and **always inserts `assigned_rank = NULL`** (captain-tier codes CLI-only). → `packages/db/src/invite-codes.ts` `createInviteCode` (REUSE) + `findInviteCodeByCode` (uniqueness pre-check, REUSE).
- **Availability oracle (route handler, NOT a server action):** `GET /api/tools/invite/check?code=<slug>` — fetched in a debounced (350 ms) `useEffect`, `AbortController`-cancelled on next keystroke/unmount. Returns `{available, reason?: "empty"|"invalid"|"taken", hint?}`. Rate-limited 30 req/60 s per user id → 429; client treats any non-OK/thrown/aborted response as `idle` (hint disappears, no explicit "rate limited" UI). Drives `availability` only.
- **`@camp404/core` pure helpers** (imported into the client bundle — no DB, no `next/*`): `generateInviteCode()` (seed slug + re-roll), `isSyntacticallyValidCode(raw)` (instant client syntax check), `CODE_RULES_HINT` (the `invalid`-state hint — **single source**, fixes the L56 hardcode divergence), `CODE_PATTERN`/`INVITE_CODE_MIN`/`INVITE_CODE_MAX` (NEW shared constants). Today these come from `@/lib/invite-words`; the move is owned by `service-layer/02-invites.md` step 1.

### Fetched server-side vs passed as props

- **Server-rendered / props:** `isCaptain` only. Page-level gating already passed (an unauthenticated / non-camp-active / unapproved user was redirected in `page.tsx` and never reaches the island).
- **Fetched client-side:** the debounced check GET (drives `availability`).
- **Posted (server action):** the `<form action={formAction}>` FormData → `createInviteAction`; result flows back via `useActionState`.
- The client makes **no `@camp404/db` import** (must not — it is `"use client"`); all writes go through the server action.

### Data written by the mint (no schema change — `invite_codes`, `packages/db/src/schema.ts:312-342`)

`code` (PK, trimmed+lowercased), `created_by_user_id` (= `campUser.id`, family-tree provenance), `note` (trimmed or `null`), `max_uses` (member `1`; captain `[1,100]`; never `NULL` here), `invited_email` (lowercased or `null`), `requires_approval` (member always `true`; captain `!preApprove`), **`assigned_rank` ALWAYS `null`**. Never set here: `use_count` (redemption-time, unit 03), `expires_at` (always `null` unless the optional 7-day-expiry product decision lands — service-layer step 5, deferred), `revoked_at`, `created_at` (DB default).

---

## Gating

- **Gate level:** **camp-active + approved** (any signed-in, camp-active, approved member of either rank). Enforced in `page.tsx` by **redirect**, not preview-but-locked:
  - `!hasCampAccess(campUser, primaryEmail)` → `redirect("/signup/required")` (invite gate). Server-action backstop: `{ok:false,"Your account isn't camp-active yet."}`.
  - `!isApproved(campUser, primaryEmail)` → `redirect("/pending-approval")` (covers both `pending` and `rejected`, since neither is `approved`).
- **Rank gating is resolved IN-FORM, not by `CaptainLock`:** `isCaptain` branches the UI (`CaptainOptions` vs `MemberNote`, email-required flip) and the server re-derives every invariant. There is **no captain-only data** on this surface and **nothing is hidden** from members — both ranks see a full, functional tool.
- **Preview-but-locked (`CaptainLock`) — NOT applicable.** Per CLAUDE.md (preview-but-locked rank gating: render structure + no data + inert; NOT redirect) and Decision #3, that treatment is for **captain-only data surfaces**. This surface serves both ranks with no withheld data, so: no `CaptainLock`, no inert render shell, no overlay, no captain-only redirect. Explicitly confirmed in S14 §"Gating states → Preview-but-locked NOT applicable" and `organism-inviteform.md` §"Preview-but-locked — NOT applicable".
- **Onboarding gate — NOT enforced here (build reconciliation, OQ #2):** unlike most app surfaces, this page runs **no `nextGate`/required-actions check** — only the invite + approval gates. An approved-but-onboarding-incomplete user can currently reach `/tools/invite` and mint. Flag for product: confirm intended, or add the `nextGate` check to `page.tsx`. (This plan does **not** add the gate without that confirmation.)

---

## States

All states already exist in the live component (except the `Alert info` MemberNote branch, which is NEW); the redesign re-skins them onto leaves + status tokens.

| State | Trigger | UI |
|---|---|---|
| **empty / seeded (initial)** | mount with a fresh `generateInviteCode()` slug; email + note blank; captain knobs default (pre-approve OFF, `maxUses="1"`) | Seeded code triggers an immediate availability check; no hint until it resolves. CreateBtn enabled. |
| **loading (availability checking)** | debounced fetch in flight | `AvailabilityHint`: `Loader2` spinner + "Checking availability…" (`text-muted-foreground`). CreateBtn **disabled**. |
| **available** | check → `{available:true}` | `circle-check` (`text-success`, was off-token `emerald-400`) + "`<code>` is available." (mono slug). CreateBtn **enabled**. |
| **taken** | check → `{reason:"taken"}` | `circle-x` (`text-destructive`) + "`<code>` is already taken — pick another." CreateBtn **disabled**. |
| **invalid** | client `!isSyntacticallyValidCode` OR check → `{reason:"invalid"}` | `circle-x` (`text-destructive`) + `CODE_RULES_HINT` (single source). CreateBtn **disabled**. |
| **idle (no hint)** | empty code, or any fetch error / abort / 429 | `AvailabilityHint` renders nothing. CreateBtn **enabled** (submit NOT blocked on idle — server `findInviteCodeByCode` is the backstop). |
| **submitting / pending** | `isPending` (`useActionState`) | CreateBtn → `Loader2` + "Creating…", **disabled**, `opacity-70`. |
| **error (server)** | `result && !result.ok` | `Alert variant="destructive" role="alert"` with `result.error`; **client state preserved** (typed code stays); form stays editable. Strings: "Not signed in." · "Your account isn't camp-active yet." · "Max uses must be a whole number between 1 and 100." · "Enter a valid email address." · "Invite code must be 3–48 chars, lowercase letters/digits/hyphens." · "'`<code>`' is already taken." · "Couldn't save invite. Try a different code." |
| **success** | `result?.ok` | Whole form region swaps to the `SuccessPanel` card: `circle-check` (`text-success`) + "Invite ready"; composed share/uses/approval copy; meta rows (`users` + uses line, `shield-check` + approval line); `CodeDisplay readonly-copy` CodeBox; Copy (flips "Copied" 1500 ms) + Send-another (`<a href="/tools/invite">` → full reload resets form). |
| **disabled (CreateBtn)** | `isPending \|\| availability ∈ {checking, taken, invalid}` | Disabled (NOT on `idle` or `available`). Within `Stepper`: − disables at min (1), + at max (100). |

**Rank / variant states:**

| Variant | `CaptainOptions` | `MemberNote` | Email | Server-enforced |
|---|---|---|---|---|
| **member** (`!isCaptain`) | hidden | shown (`Alert info`) | always required | `requiresApproval=true`, `maxUses=1` |
| **captain** (`isCaptain`) | shown (pre-approve + Stepper) | hidden | required only when single-use (`maxUses===1`) | `requiresApproval=!preApprove`, `maxUses∈[1,100]` |

Exactly one of `{CaptainOptions, MemberNote}` renders, branched on `isCaptain`. Derived (not stored): `multiUse = isCaptain && Number(maxUses) > 1` → drives email label/required flip.

**Gating states (entry, owned by `page.tsx`):** invite-gated → `/signup/required`; pending/rejected → `/pending-approval`; rate-limited check → treated as `idle`. **Not applicable:** offline/sync, budget/over-target, empty-list, `CaptainLock` preview-but-locked.

---

## Build steps

> Plan-doc only; the implementing pass executes. Respect existing tests: `apps/web/tests/e2e/invite-tracking.spec.ts`, `apps/web/lib/test-store.ts` (invite methods). Honour MEMORY green-CI-is-done: each step is an independently CI-green change; do not strand post-green follow-ups.

**Prerequisites that MUST land first (cross-plan):**
1. **Foundations tokens** (`foundations-tokens.md`, architecture Phase 0): `--color-success` (+ `--color-success-foreground`) and `--font-mono` in `packages/ui/src/styles/globals.css`. Blocks token-clean `AvailabilityHint` (`text-success`) and `CodeDisplay` (mono) shipping. **Hard prerequisite.**
2. **`@camp404/core` stood up** (architecture Phase 1) with `generateInviteCode`, `isSyntacticallyValidCode`, `CODE_RULES_HINT`, `CODE_PATTERN`, `INVITE_CODE_MIN/MAX` moved/added (`service-layer/02-invites.md` step 1). Blocks the import re-point.
3. **Leaf components shipped** (components plans, architecture Phase 5): `InputField`, `Alert`, `CodeDisplay` (all PROMOTE to `@camp404/ui`); `Stepper` + `AvailabilityHint` + `types.ts` (app-local NEW); `Textarea`/`Checkbox`/`Button`/`Card` (REUSE atoms).
4. **Service layer** (`service-layer/02-invites.md` steps 2 & 4): `createInviteAction` re-pointed to core imports + single-sourced hint; check route's prod/test existence semantics reconciled (OQ #4).

**Ordered steps (app-layer integration; mostly mirror `organism-inviteform.md` §Build steps, since this surface IS that single consumer):**

1. **Extract `Availability` + `AvailabilityHint`** into `types.ts` + `availability-hint.tsx`; update the call-site import.
   - *Prereq:* tokens (success), `AvailabilityHint` leaf plan.
   - *AC:* `invite-form.tsx` no longer defines `Availability` or the private hint; `available` renders `text-success` (no `emerald-400`); icons are `circle-check`/`circle-x`; hint has `role="status" aria-live="polite"`; typecheck + lint pass.
   - *Tests:* the `availability-hint.test.tsx` cases (owned by the leaf plan).

2. **Re-point pure-logic imports to `@camp404/core`** (`generateInviteCode`, `isSyntacticallyValidCode`) in `invite-form.tsx` AND `actions.ts` AND `check/route.ts`; replace the hardcoded L56 `"3–48 chars, lowercase letters / digits / hyphens."` with the imported `CODE_RULES_HINT` (single source — OQ #3).
   - *Prereq:* `@camp404/core` (step 2 above).
   - *AC:* grep shows exactly one literal definition of the rule text; client hint === server/API hint; no `@/lib/invite-words` import remains in any of the three files.

3. **Replace email + note + code-label pairs with `InputField`** (email gets the `multiUse` label/required flip; note stays a labelled `Textarea`).
   - *Prereq:* `InputField` (PROMOTE).
   - *AC:* no inline `<div className="space-y-2"><Label><Input>` shells remain; `getByLabelText` resolves email/code; required flip works on `multiUse`.

4. **Replace code row + success CodeBox with `CodeDisplay`** — `editable-shuffle` for the row (`onChange` lowercases, `onShuffle` re-rolls), `readonly-copy` for the SuccessPanel (clipboard + "Copied" flip with unmount-safe timer).
   - *Prereq:* `CodeDisplay` (PROMOTE).
   - *AC:* no `font-mono text-lg` CodeBox or separate Shuffle `Button` remains; copy "Copied" flip works; the 1500 ms timer is cancelled on unmount (no act-warning) — fixes the live L353–359 leak.

5. **Replace the bare number input with `Stepper`** inside `CaptainOptions` (real number value, `[1,100]` clamp, −/+ buttons; keep keyboard entry). Per `molecule-stepper.md`: the Stepper's underlying `<input>` carries `name="maxUses"` directly (or attach a hidden `<input name="maxUses" value={maxUses}>` beside it) — **confirm the value still submits through `useActionState`/`FormData`**.
   - *Prereq:* `Stepper` (app-local NEW).
   - *AC:* −/+ mutate `maxUses` and clamp at bounds; `multiUse` still flips the email label/required + helper copy; the posted `maxUses` FormData field is still a valid integer string.

6. **Render `MemberNote` + server-error as `Alert`** — `MemberNote` = `variant="info"` (Lucide `info`, muted, **member-only — NEW branch**, replaces today's plain `<p>`); server error = `variant="destructive" role="alert"`.
   - *Prereq:* `Alert` (PROMOTE).
   - *AC:* member variant shows the info-icon row; server error renders via `Alert` (no hand-rolled `<p>`); banner appears only when `result && !result.ok`.

7. **Replace the page's inline ghost-back with `GhostBack`; reconcile card treatment + container.** Card both form and success (OQ #1); confirm `max-w-xl` vs the global container (OQ #5).
   - *Prereq:* `GhostBack` leaf.
   - *AC:* `page.tsx` uses `GhostBack` linking `/tools` (Lucide `chevron-left`, "Tools"); both form and success states carded consistently; container decision recorded in the diff.

8. **Fix the stale Tools-hub copy** (`apps/web/app/tools/page.tsx`, `TOOLS[0].description`): drop "single-use" (captains can mint multi-use) — OQ #7. (S03 `CAMP-XXXX-XXXX` placeholder is a separate surface; flag only.)
   - *AC:* hub card no longer says "single-use"; no behaviour change.

9. **Verify the whole surface end-to-end.**
   - *AC:* member happy path (seeded slug → available → required email → note → Create → SuccessCard single-use/requires-approval → Copy/Send-another); captain happy path (pre-approve + Stepper → SuccessCard reflects chosen uses + approval); re-roll/edit availability gates the button; server error preserves the typed code; all S14 §States rows render; **existing `invite-tracking.spec.ts` stays green**.
   - *Tests:*
     - **Component RTL** on `invite-form.tsx`: member vs captain rendering; availability → CreateBtn disabled matrix; success swap; server-error banner; crafted-state can't change client behaviour.
     - **Service-layer action invariant tests** (owned by `service-layer/02-invites.md` step 6): member invariants (`requiresApproval=true`, `maxUses=1`, email required, crafted `preApprove`/`maxUses` POST ignored), captain knobs (`requiresApproval=!preApprove`, `maxUses∈[1,100]`, email required only single-use), uniqueness pre-check + race fallback, **`assigned_rank=NULL`** always.
     - **E2E_TEST_MODE seam:** the check route branches on `isE2ETestMode()` (`apps/web/lib/test-mode.ts`) — `testStore.findUsableInviteCode` in E2E vs `findInviteCodeByCode` in prod. The prod/test existence reconciliation (OQ #4 / service-layer step 4) must add a `findInviteCodeByCode`-equivalent to `apps/web/lib/test-store.ts` so a seeded revoked/expired/exhausted code reads "taken" in **both** modes; assert via an extended `invite-tracking.spec.ts` (seed a maxed-out code, hit `/api/tools/invite/check?code=<it>`, expect `{available:false, reason:"taken"}`). The mint action / `redeemInviteForUser` already no-op `seedBurnerProfileAction` under E2E.

---

## Open items

Cross-ref `design/spec/impl/open-questions.md` (and S14 §"Open questions / build reconciliations").

1. **Card treatment consistency (OQ #1)** — board cards only the success state; live code cards the whole form. **Recommend card-both** (matches live + the `Card` reusable). Decide and apply.
2. **Onboarding gate (OQ #2)** — this page skips the `nextGate`/required-actions check most surfaces run; an approved-but-onboarding-incomplete user can currently mint. **Product decision:** confirm intended, or add the gate to `page.tsx`. (Not added here without confirmation.)
3. **Hint-string single source (OQ #3)** — collapse the divergent client hardcode (L56) and `CODE_RULES_HINT` into one `@camp404/core` constant (covered by build step 2).
4. **Check-route prod/test existence semantics (OQ #4)** — settle whether availability treats revoked/expired/exhausted codes as "taken" consistently across prod and E2E. **Recommend:** a code name is reserved by its PK forever → use `findInviteCodeByCode` semantics in **both** modes (needs a test-store equivalent — service-layer step 4).
5. **`max-w-xl` vs global container (OQ #5)** — the page uses a wider container than `/tools` (`max-w-2xl`) and most surfaces. Confirm intentional or normalise (build step 7).
6. **Status / accent-tint tokens (OQ #6)** — `--color-success` (availability green) and the `CaptainOptions` accent tint (board `#00dcff26`) must exist in `globals.css` before token-clean shipping (foundations Phase 0 prerequisite).
7. **Stale Tools-hub + S03 copy (OQ #7)** — hub "single-use" fixed here (build step 8); the S03 `CAMP-XXXX-XXXX` placeholder → slug format is the **S03 surface's** job (flag only).
8. **Optional 7-day expiry on mint** — `expires_at` column exists but is never set; adopting it is a one-line `createInviteCode` change gated on a **product decision** (service-layer step 5). Not assumed; `assigned_rank` stays `NULL` regardless.
