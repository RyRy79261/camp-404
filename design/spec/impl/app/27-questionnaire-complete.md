# 27-questionnaire-complete — app integration plan

- Route(s): `/onboarding/questionnaire/complete` · routed page

> Scope: the **completion-acknowledgement and sequential-unlock queue surface** rendered
> immediately after a user successfully submits a captain-activated questionnaire (Safety,
> Dietary, Agreements). Plan docs only; no code in this pass. Classification: this surface
> is **entirely NEW** at the app layer — the route does not exist, no server component exists,
> no completion screen of any kind exists for subsequent questionnaires. The two composed
> molecules (`CompletionHero`, `QueueCard`) are also both NEW. The underlying data access
> (`listQuestionnaireQueue`) requires a NEW db function and a NEW app-lib wrapper.
>
> Preview-but-locked / CaptainLock is **explicitly N/A** here — this surface is per-user
> self-service onboarding; no rank-gated content (surface brief §States "Captain-locked
> (preview-but-locked, decision #3) — N/A"). The surface is read-only; it has no write path.

---

## Current state — the existing route/files today

Verified against the live tree (every path below confirmed by direct file-system search):

- **`/onboarding/questionnaire/complete` does not exist as a route.** The directory
  `apps/web/app/onboarding/questionnaire/complete/` does not exist. There is no
  `page.tsx`, no `completion-hero.tsx`, no `queue-card.tsx` anywhere under
  `apps/web/app/onboarding/` for this surface.

- **`apps/web/app/onboarding/questionnaire/page.tsx`** (the existing burner-profile
  wizard, 60 lines) — the only onboarding questionnaire route today. On `final=true` its
  server action (`actions.ts:97`) calls `redirect("/")` directly; there is no redirect to a
  completion/queue screen. S27 is not the continuation of this flow — it is the completion
  screen for subsequent captain-activated questionnaires (Safety, Dietary, Agreements),
  which do not yet have built routes.

- **`apps/web/app/onboarding/questionnaire/actions.ts`** (99 lines, `"use server"`) —
  `saveBurnerProfile(rawResponses, final)` which on `final=true` calls
  `satisfyBurnerProfileAction(campUser.id)` then `redirect("/")` (`:79`, `:97`). This
  action is the burner-profile domain; it does NOT redirect to S27 and does not need to
  (the burner-profile flow is a distinct surface, per surface brief §Divergences).

- **No `getQuestionnaireQueue` or `listQuestionnaireQueue` function exists** anywhere.
  `getPendingRequiredActions` in `apps/web/lib/users.ts` (`:212`) and
  `packages/db/src/activations.ts` (`:203`) returns only `pending + blocking` rows and
  excludes completed/waived/expired rows — insufficient for the S27 queue display which
  requires all statuses.

- **`apps/web/lib/required-actions.ts`** (30 lines) — `ACTION_ROUTES` registry maps
  `burner_profile → /onboarding/questionnaire`; the comment at line 9 explicitly notes
  `dietary_requirements / driver_profile` have no route yet. The `nextGate` function
  returns `null` for any pending action with no mapped route.

**What the redesign adds:** a NEW route, NEW server component (data fetch + derivation),
two NEW app-local molecules (`CompletionHero`, `QueueCard`), a NEW db read
(`listQuestionnaireQueue`), a NEW app-lib wrapper (`getQuestionnaireQueue`), and a NEW
type (`QuestionnaireQueueItem` in `packages/types`). No existing file is modified by this
surface alone (the `ACTION_ROUTES` registry gains new questionnaire-key entries when the
captain-activated questionnaire runner routes are built, but that is the runner's plan, not
this surface's).

---

## File structure — target files in apps/web

| File | Status | Notes |
|---|---|---|
| `apps/web/app/onboarding/questionnaire/complete/page.tsx` | **CREATE** | Next.js Server Component. Auth gate → data fetch → derive variant/queue → render. `export const dynamic = "force-dynamic"`. |
| `apps/web/app/onboarding/questionnaire/complete/completion-hero.tsx` | **CREATE** | App-local `"use client"` molecule. Stateless; receives `variant`, `pendingCount`, `ctaHref` as props. No server data access. See `components/molecule-completionhero.md`. |
| `apps/web/app/onboarding/questionnaire/complete/queue-card.tsx` | **CREATE** | App-local `"use client"` molecule. Renders one required-action queue row in one of four status states (`complete`, `next-up`, `locked`, `expired`). See `components/molecule-queuecard.md`. |
| `apps/web/app/onboarding/questionnaire/complete/completion-hero.stories.tsx` | **CREATE** | Co-located Storybook stories for `CompletionHero` (4 stories). |
| `apps/web/app/onboarding/questionnaire/complete/queue-card.stories.tsx` | **CREATE** | Co-located Storybook stories for `QueueCard` (8 stories). |
| `apps/web/app/onboarding/questionnaire/complete/__tests__/completion-hero.test.tsx` | **CREATE** | Vitest/RTL unit tests for `CompletionHero` (11 test cases). |
| `apps/web/app/onboarding/questionnaire/complete/__tests__/queue-card.test.tsx` | **CREATE** | Vitest/RTL unit tests for `QueueCard` (all cases in `molecule-queuecard.md §Stories & tests`). |
| `apps/web/lib/users.ts` | **MODIFY** | Add `getQuestionnaireQueue(userId)` — thin E2E-aware wrapper over db `listQuestionnaireQueue`. Returns `[]` under `isE2ETestMode()`, matching the `getPendingRequiredActions` pattern (`:215`). |
| `packages/db/src/activations.ts` | **MODIFY** | Add `listQuestionnaireQueue(userId): Promise<QuestionnaireQueueItem[]>` — NEW db read (plan `03-questionnaire-forms.md §Target API §Step 4`). |
| `packages/types/src/questionnaire.ts` | **MODIFY** | Add `QuestionnaireQueueItem` interface/type (plan `03-questionnaire-forms.md §Schema & types`; architecture `§packages/types`). |

No `/api` route handlers — this surface has no write path and no streaming. No
`error.tsx` or `not-found.tsx` needed at the route segment level (the global
`apps/web/app/error.tsx` + `not-found.tsx` cover it; no segment-specific states
beyond the global boundary).

No `layout.tsx` for this route segment — the surface sits inside the existing
`apps/web/app/onboarding/` directory structure. Confirm whether a shared
`apps/web/app/onboarding/layout.tsx` exists or needs creating; the existing wizard
at `apps/web/app/onboarding/questionnaire/page.tsx` does not rely on one, so none is
assumed here.

---

## Components composed

| Component | Plan | Role | Render context | Status |
|---|---|---|---|---|
| `CompletionHero` | `components/molecule-completionhero.md` | Section A success hero — check badge, heading, sub-heading, variant CTA slot (`all-done` or `more-required`). Receives `variant`, `pendingCount`, `ctaHref` as pre-computed props from the server component. | Client island (stateless; could be server-rendered, but `Link` deps make client simpler; no hydration cost) | NEW (app-local) |
| `QueueCard` | `components/molecule-queuecard.md` | One card per `required_actions` queue row in Section B. Receives `title`, `status`, `completedAt`, `dueAt`, `href` from the server component. | Client island (each card; `next-up` variant wraps a `<Link>`) | NEW (app-local) |
| `Divider` | `components/atom-divider.md` (step 9: "Wire `Divider` into completion-queue") | 1px `$border` horizontal rule between Section A and Section B. Plain variant, no label. | Server-rendered (static, no JS needed) | NEW (`@camp404/ui`) |
| `IconBadge` | `components/atom-iconbadge.md` | Used internally by `CompletionHero` (88px circle check badge) and by `QueueCard` (sm status icon per row). The page itself does not mount `IconBadge` directly — it is composed inside the two molecules. | Inside client islands | PROMOTE target (`@camp404/ui`) |
| `Button` | `packages/ui/src/components/button.tsx` | Used internally by `CompletionHero` as the primary CTA (wraps a `Link`, `asChild`). The page does not mount it directly. | Inside `CompletionHero` client island | REUSE |
| `Card` / `CardContent` | `packages/ui/src/components/card.tsx` | Used internally by `QueueCard` as the row container. Not mounted directly by the page. | Inside `QueueCard` client islands | REUSE |

Section A (`CompletionHero`) and Section B (`QueueCard` list) are both rendered inside a
single server component page. The server component passes pre-computed props; no client
state is needed on this surface. The island boundary sits at the two molecule components —
the page's outer layout (padding, gap, divider) can be server-rendered markup.

The queue list renders inside a `<ul>` (list semantics), with each `QueueCard` inside a
`<li>`, as specified in `molecule-queuecard.md §Accessibility notes`. The page is
responsible for the `<ul>/<li>` wrapper; `QueueCard` renders the card content inside an
`<li>`.

---

## Services & data

### New db function — `listQuestionnaireQueue`

Location: `packages/db/src/activations.ts` (alongside `getPendingRequiredActions`).

**Signature:**
```ts
export async function listQuestionnaireQueue(
  userId: string,
): Promise<QuestionnaireQueueItem[]>
```

**Query:** `SELECT actionKey, title, status, blocking, completedAt, dueAt, createdAt FROM required_actions WHERE userId = $userId AND type = 'questionnaire' AND actionKey <> 'burner_profile' ORDER BY createdAt ASC` (all statuses; Drizzle: remove the `status = 'pending'` filter of `getPendingRequiredActions`).

**Type** (`packages/types/src/questionnaire.ts`):
```ts
export interface QuestionnaireQueueItem {
  actionKey: string;
  title: string;
  status: "pending" | "completed" | "waived" | "expired";
  blocking: boolean;
  completedAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
}
```

### New app-lib wrapper — `getQuestionnaireQueue`

Location: `apps/web/lib/users.ts` (alongside `getPendingRequiredActions` at `:212`).

```ts
/** All questionnaire required-action rows for the user, ordered oldest-first.
 *  Excludes burner_profile. Returns [] under E2E test mode (real DB unavailable). */
export async function getQuestionnaireQueue(
  userId: string,
): Promise<QuestionnaireQueueItem[]> {
  if (isE2ETestMode()) return [];
  return dbListQuestionnaireQueue(userId);
}
```

Pattern: identical to `getPendingRequiredActions` (`:212–217`) — E2E short-circuit returns
empty, otherwise delegates to the db function.

### Data fetched server-side in `page.tsx`

All data is fetched server-side before first paint; no client-side fetching on this surface.

| Data | Source | Used for |
|---|---|---|
| Auth user (`AuthenticatedUser`) | `getAuthenticatedUserOrRedirect()` (`apps/web/lib/auth.ts:127`) | Auth gate; redirects to `/auth/sign-in` if no session |
| Camp user (`CampUser`) | `ensureCampUser(authUser)` (`apps/web/lib/users.ts`) | Obtain `campUser.id` for the queue fetch; enforce invite gate |
| `hasCampAccess(campUser, email)` | `apps/web/lib/users.ts:219` | Defence-in-depth: redirect to `/signup/required` if invite gate not met |
| `QuestionnaireQueueItem[]` | `getQuestionnaireQueue(campUser.id)` (NEW, `apps/web/lib/users.ts`) | All questionnaire required-action rows for this user |

### Derived computations in `page.tsx` (pure, no further I/O)

| Derived value | Logic | Passed to |
|---|---|---|
| `allDone: boolean` | `items.every(item => item.status === "completed" \|\| item.status === "waived")` — treats empty array as `true` (edge case: zero rows → all-done variant) | `CompletionHero` as `variant` |
| `pendingCount: number` | `items.filter(item => item.blocking && item.status === "pending").length` — only `blocking=true` rows count toward the hero's "N more required" | `CompletionHero` as `pendingCount` |
| `nextPendingHref: string` | First `pending` row in order → look up `ACTION_ROUTES[item.actionKey]` from `apps/web/lib/required-actions.ts`; fall back to `/` if unmapped (defensive, should not occur once runner routes are built) | `CompletionHero` as `ctaHref` when `more-required` variant |
| `QueueCardStatus` per row | `completed \| waived` → `"complete"`; first `pending` item in order → `"next-up"`; subsequent `pending` items → `"locked"`; `expired` → `"expired"` | Each `QueueCard` as `status` |
| `href` per next-up row | `ACTION_ROUTES[item.actionKey]` (same registry lookup as `nextPendingHref`) | `QueueCard` as `href` for next-up cards only |
| Formatted `completedAt`/`dueAt` | ISO string coercion; `QueueCard` uses `formatShortDate` internally (app-local helper or `@camp404/core` once available) | `QueueCard` as `completedAt`/`dueAt` props |

No `@camp404/core` clearance helpers are called (no rank gate). The only `@camp404/core`
usage is the eventual migration of `getQuestionnaireQueue` → `@camp404/core` for the
`formatShortDate` helper (plan `03-questionnaire-forms.md §Target API`); at build time
this can start as a local one-liner.

---

## Gating

This surface is **not rank-gated**. `CaptainLock`, preview-but-locked rendering, and the
D3 mechanism (architecture §"preview-but-locked") are explicitly **N/A** (surface brief
§States "Captain-locked — N/A"; this is per-user self-service onboarding with no
captain-exclusive data).

The applicable gate is the **invite/access gate** (G1 in the gating spine):

| Gate | Check | On fail |
|---|---|---|
| Auth | `getAuthenticatedUserOrRedirect()` | `redirect("/auth/sign-in")` — same pattern as `apps/web/app/onboarding/questionnaire/page.tsx:19` |
| Camp access (invite gate) | `hasCampAccess(campUser, authUser.primaryEmail)` | `redirect("/signup/required")` — same pattern as `page.tsx:21-23` |
| Approval gate | Not enforced here — this surface sits inside the G2 gating loop (questionnaire completion); `isApproved` is checked by the gating spine at `/` after all questionnaires are done, not on the completion screen itself. The "All done" CTA routes to `/` which re-enters the spine. | N/A |

The burner-profile gate (G2b — `profile?.completedAt` redirect) is **not re-enforced
here**. S27 is entered only after the burner-profile gate is already satisfied; its
predecessor in the flow (the questionnaire runner) handles the prerequisite state. If a
user arrives here without a completed burner profile (unexpected path), the gating spine
at `/` would have caught them earlier.

---

## States

| State | Trigger | Behaviour |
|---|---|---|
| **Loading** | Server component rendering | All data is fetched server-side before first paint. No client spinner; no loading skeleton. The page renders with resolved `required_actions` data (`dynamic = "force-dynamic"` ensures fresh data on every request). |
| **All done** | `allDone = true` (all items `completed \| waived`, or zero rows) | Hero shows `variant="all-done"`: "Questionnaire complete" heading, "Thanks — that's logged with the captains." sub-heading, "Back to camp" button (→ `/`), "You're all caught up." caption. All `QueueCard` rows render with `status="complete"`. |
| **More required** | `allDone = false` (at least one blocking `pending` row) | Hero shows `variant="more-required"`: same heading/sub-heading, count line "N more required before you're unlocked" (N = `pendingCount`), "Start next questionnaire" button (→ `nextPendingHref`). Queue renders: completed rows as `complete`, first pending as `next-up`, subsequent pending as `locked`, expired as `expired`. |
| **Empty queue (zero rows)** | `getQuestionnaireQueue` returns `[]` (god account, all waived, or no activations yet seeded) | Treated as all-done: hero shows `all-done` variant, empty `<ul>` queue. Do not crash or show an empty-state placeholder for the queue section. Footer copy and sign-out link remain visible. |
| **Expired rows present** | A row has `status = "expired"` | `QueueCard` renders `status="expired"` with `clock` icon and "Expired — contact a captain" label. Expired rows are excluded from `pendingCount` and never rendered as `next-up`. |
| **Non-blocking rows** | `blocking = false` items present | Shown in the queue (for visibility) but excluded from `pendingCount` and from the `allDone` computation. A non-blocking pending row never contributes to the hero's "More required" count (per surface brief §Validation & edge cases). |
| **Re-entry after full completion** | User navigates directly to this route when all actions are already satisfied | Shows all-done variant (same as "All done" state above). The gating spine should redirect completed users to `/` rather than this route, but the route handles re-entry gracefully. |
| **Auth lost** | Session expires before page loads | `getAuthenticatedUserOrRedirect()` redirects to `/auth/sign-in` (server-side, before any render). |
| **E2E test mode** | `isE2ETestMode() = true` | `getQuestionnaireQueue` returns `[]` → all-done variant renders. This is the same seam used by `getPendingRequiredActions` (`:215`). The E2E_TEST_MODE seam means the surface always renders the "All done" variant in test runs without real DB data. |

### Queue card states (per row)

| Status | Visual | Interactive |
|---|---|---|
| `complete` | Full opacity; `check` icon (`tone="info"`, accent); "Done D MMM" meta line | Inert — no pointer events, no link |
| `next-up` | Full opacity; `play/arrow-right` icon (`tone="primary"`); "Due D MMM" if present; full card is a `<Link href={href}>` | Tappable — navigates to S25 gate for this questionnaire key |
| `locked` | `opacity-55 pointer-events-none`; `lock` icon (muted, no tone); no affordance | Inert — `tabIndex={-1}` on focusable children |
| `expired` | Full opacity; `clock` icon (`tone="warning"`); "Expired — contact a captain" label; no affordance | Inert |

---

## Build steps

The S27 surface depends on foundational work from multiple domains. Prerequisites must
land before this surface; each step below is independently CI-green.

### Prerequisites (not this plan's work — must land first)

- [ ] **`foundations-tokens.md`** — `--color-warning` / `--color-warning-foreground` /
  `--color-info` in `packages/ui/src/styles/globals.css`. Required by `QueueCard`
  `expired` state (`tone="warning"`) and `complete` state (`tone="info"`). Hard blocker.

- [ ] **`atom-iconbadge.md`** — `packages/ui/src/components/icon-badge.tsx` must exist
  with `size="lg"` (88px, `CompletionHero`), `size="sm"`, `tone="accent"`, `tone="info"`,
  `tone="primary"`, `tone="muted"`, `tone="warning"`. Hard blocker for both molecules.

- [ ] **`atom-divider.md`** — `packages/ui/src/components/divider.tsx` must export
  `Divider` (plain variant). Specifically: `atom-divider.md §Build steps step 9` notes
  wiring the Divider into the completion-queue S27. Blocker for the page layout.

- [ ] **`molecule-card.md` normalisation** — `Card` must have corrected `--radius` and
  stripped `shadow-sm` (per `molecule-card.md §Build steps step 2`). Required by `QueueCard`.

- [ ] **Phase 2b db EXTENDs** (`architecture.md §Phase 2b`) — `listQuestionnaireQueue`
  added to `packages/db/src/activations.ts`; `QuestionnaireQueueItem` added to
  `packages/types/src/questionnaire.ts`. These can be done in the same change as this
  surface or land immediately before it; they are the surface's only db dependency.

- [ ] **Phase 1 types delta** (`architecture.md §Phase 1`) — `QuestionnaireQueueItem` in
  `packages/types`. Prerequisite for the db step above.

### Step 1 — Add `QuestionnaireQueueItem` type and `listQuestionnaireQueue` db function

1a. Add `QuestionnaireQueueItem` to `packages/types/src/questionnaire.ts`.
1b. Add `listQuestionnaireQueue(userId)` to `packages/db/src/activations.ts` — mirrors
    `getPendingRequiredActions` structure but removes the `status = "pending"` and
    `blocking = true` filters; adds `actionKey <> 'burner_profile'` filter.
1c. Add `getQuestionnaireQueue(userId)` to `apps/web/lib/users.ts` — E2E-aware wrapper,
    same pattern as `getPendingRequiredActions` (`:212–217`).

**Acceptance:**
- `tsc` / `pnpm build` green in `packages/types` and `packages/db`.
- `getQuestionnaireQueue(userId)` returns all questionnaire rows (all statuses, excl.
  `burner_profile`) ordered by `createdAt ASC` against a seeded DB.
- Under `E2E_TEST_MODE=1` it returns `[]`.
- Add a unit test (Vitest) mirroring `apps/web/lib/__tests__/required-actions.test.ts`
  shape: asserts filter + ordering + `burner_profile` exclusion against the in-memory test
  backend (or a seeded db fixture).

### Step 2 — Create route shell (`apps/web/app/onboarding/questionnaire/complete/page.tsx`)

Create the directory and a minimal server component that:
- Runs the auth gate (`getAuthenticatedUserOrRedirect()` → redirect `/auth/sign-in`).
- Runs the invite gate (`hasCampAccess` → redirect `/signup/required`).
- Calls `getQuestionnaireQueue(campUser.id)`.
- Renders a static placeholder (e.g. `<pre>{JSON.stringify(items)}</pre>`) to confirm
  data arrives correctly. No molecules wired yet.
- Exports `dynamic = "force-dynamic"`.

**Acceptance:**
- `GET /onboarding/questionnaire/complete` with a valid authed session returns 200.
- Unauthenticated request redirects to `/auth/sign-in`.
- No invite-code request redirects to `/signup/required`.
- TypeScript clean; `pnpm build` green.

### Step 3 — Build `CompletionHero` molecule

Create `apps/web/app/onboarding/questionnaire/complete/completion-hero.tsx` per
`molecule-completionhero.md §Build steps Step 2`.

**Acceptance:** all criteria in `molecule-completionhero.md §Build steps Step 2` — both
variants render correctly, all token classes (no raw hex), `IconBadge` `aria-hidden` on
icon, heading is `<h1>`.

### Step 4 — Build `QueueCard` molecule

Create `apps/web/app/onboarding/questionnaire/complete/queue-card.tsx` per
`molecule-queuecard.md §Build steps Step 2`.

**Acceptance:** all criteria in `molecule-queuecard.md §Build steps Step 2` — four status
variants render; `locked` applies `opacity-55 pointer-events-none`; `next-up` wraps in
`<Link>`; no raw hex.

Steps 3 and 4 are independent — they can land in parallel.

### Step 5 — Wire molecules and layout into `page.tsx`

Update `apps/web/app/onboarding/questionnaire/complete/page.tsx` to:
- Derive `allDone`, `pendingCount`, `nextPendingHref`, and per-row `QueueCardStatus`
  (derivation logic in §Services & data above).
- Render the full page layout:
  - Section A: `<CompletionHero variant={...} pendingCount={...} ctaHref={...} />`
  - `<Divider />` (plain horizontal)
  - Section B header (queue title/sub-heading copy from surface brief §Layout §Section B)
  - `<ul>` with one `<li><QueueCard ... /></li>` per queue item
  - Queue footer: warning copy + "Sign out" link (`/auth/sign-out`)
- Page container: `width: 430px / fill`, `gap: 24px`, `padding: 24px` per surface brief
  §Layout; `max-w-[430px]` or the global container constraint.

**Acceptance:**
- All-done path: `CompletionHero` shows `variant="all-done"`; all `QueueCard` rows render
  `status="complete"`; "Back to camp" navigates to `/`.
- More-required path: hero shows count line + "Start next questionnaire" linking to the
  correct `nextPendingHref`; first pending card is `next-up` (tappable), subsequent
  pending cards are `locked` (opacity-55, inert).
- Empty queue (zero rows): all-done variant; empty `<ul>`.
- "Sign out" link present in all states; navigates to `/auth/sign-out`.
- Layout matches surface brief §Layout at 430px: single-column stack, two sections
  separated by `Divider`.

### Step 6 — Tests and stories

6a. Write `completion-hero.test.tsx` per `molecule-completionhero.md §Stories & tests §Vitest`.
6b. Write `queue-card.test.tsx` per `molecule-queuecard.md §Stories & tests §Vitest`.
6c. Write `completion-hero.stories.tsx` (4 stories) per `molecule-completionhero.md §Stories & tests`.
6d. Write `queue-card.stories.tsx` (8 stories) per `molecule-queuecard.md §Stories & tests`.

Steps 6a–6d are independent and can land together.

**Acceptance:**
- `pnpm test` green in `apps/web`; no snapshot failures.
- All Storybook stories render at 430px without Next.js router errors.
- Locked `QueueCard` is not Tab-reachable in the a11y panel.
- `next-up` card link has accessible text from its visible title + CTA label.
- Icon badges in all four status states carry `aria-label` describing the status.

### Step 7 — Visual QA against board

Compare rendered output to `design/.spec-extract/boards/36-s27-questionnaire-complete-queue.txt`
at 430px.

**Acceptance:**
- Section A: `IconBadge` circle ~88px, `accent/15` fill, `check` icon in accent; heading
  22px bold centred; sub-heading 14px normal centred.
- All-done variant: full-width "Back to camp" button + "You're all caught up." caption.
- More-required variant: count line (13px/600) above full-width "Start next questionnaire".
- Queue rows: Safety/Dietary (complete) at full opacity; Agreements (locked) at `opacity-55`.
- Divider: 1px `$border` full-width rule between sections.
- No raw-hex class names in DevTools.
- "Sign out" link visible in footer.

### Step 8 — Questionnaire runner redirect (dependency on the runner's plan)

When the captain-activated questionnaire runner (S26 equivalent for Safety/Dietary/
Agreements) is built, its server action (`satisfyRequiredAction` + final redirect) must
redirect to `/onboarding/questionnaire/complete` rather than `/`. This step is owned by
the runner's app integration plan, not this one. Document the expected redirect target
here so the runner plan can reference it.

**Note on E2E_TEST_MODE seam:** in test runs, `getQuestionnaireQueue` returns `[]` (step
1c), so the completion page always renders the all-done / empty variant without hitting the
DB. The runner's E2E test for the full questionnaire flow should confirm that after
`satisfyRequiredAction` the redirect lands at `/onboarding/questionnaire/complete` and
that the page renders without error in test mode.

---

## Open items

References to `design/spec/surfaces/27-questionnaire-complete.md §Open questions`.

1. **Route confirmation (OQ#1):** `/onboarding/questionnaire/complete` is the proposed
   shared route (one route, all questionnaires). Confirm the exact path and whether it is
   shared vs per-questionnaire (`/onboarding/questionnaire/safety/complete`). This plan
   assumes the shared single route. If per-questionnaire routes are chosen, the `page.tsx`
   receives a `[key]` segment and filters the queue accordingly.

2. **Questionnaire trio seeding (OQ#2):** Safety, Dietary, Agreements must each be seeded
   as `questionnaire_activations` with `blocking = true`, `scope = 'everyone'` (or
   captain-scoped). Until they are seeded, `getQuestionnaireQueue` returns `[]` and the
   surface always shows "All done". The `ACTION_ROUTES` registry in
   `apps/web/lib/required-actions.ts` must also be extended with the three new
   `actionKey → route` mappings when their runner routes are built (that extension is
   owned by the runner plans, not this surface).

3. **Sequential vs parallel unlock (OQ#4):** this plan derives `next-up` / `locked` by
   order of `createdAt ASC` (first pending = next-up; all subsequent = locked). This
   implements strict sequential unlock. If parallel-with-one-highlighted is chosen instead,
   the derivation logic in step 5 changes: all pending rows become `next-up` (no `locked`
   rows). Confirm before step 5.

4. **Expired row treatment (OQ#5):** this plan renders `expired` rows with a distinct
   `QueueCard status="expired"` state and excludes them from `pendingCount` and `allDone`.
   Product decision needed on whether expired rows should appear in the queue or be filtered
   out at the data layer. If filtered: add a `.filter(item => item.status !== "expired")`
   in `page.tsx` derivation; keep the `QueueCard expired` variant as defensive rendering
   for unexpected data.

5. **Burner-profile flow gap (OQ#6):** the existing `saveBurnerProfile` action
   (`apps/web/app/onboarding/questionnaire/actions.ts:97`) redirects to `/` on `final=true`.
   If Safety/Dietary/Agreements are also blocking required-actions, the gating spine at `/`
   immediately routes the user to S25/S26. There is no "you just finished your burner
   profile — here's what's next" moment. OQ#6 asks whether the burner-profile wizard final
   submit should also redirect to S27. This plan does NOT change `saveBurnerProfile`;
   the existing redirect-to-`/` is preserved. Raise with product if a continuous onboarding
   flow (burner-profile → S27 queue) is desired.

6. **"N more required" copy (OQ#7):** this plan renders the count line as
   "N more required before you're unlocked" using `pendingCount`. Singular
   ("1 more required…") vs plural ("2 more required…") grammar must be confirmed.
   The surface brief shows `1 more required before you're unlocked`; the plural form
   is not specified. Confirm copy for N = 2 and N = 3.

7. **Non-blocking questionnaire display (OQ#8):** this plan shows ALL rows returned by
   `listQuestionnaireQueue` (which excludes `burner_profile` but includes
   `blocking = false` rows). Surface brief §Validation recommends showing only
   `blocking` rows on this surface; non-blocking can appear in "My forms" (S15).
   If non-blocking rows should be suppressed here, add `.filter(item => item.blocking)`
   in `page.tsx` before deriving card statuses. Confirm before step 5.

8. **`ACTION_ROUTES` extension timing:** the `nextPendingHref` derivation in step 5
   depends on `ACTION_ROUTES` in `apps/web/lib/required-actions.ts` having entries for
   `safety`, `dietary_requirements`, and `agreements` (or whatever the actual
   `actionKey` values are). Until those route entries are added (which the runner plans
   own), `nextPendingHref` falls back to `/` for unmapped keys. This is safe but means
   the "Start next questionnaire" button navigates home rather than to the gate. Flag to
   the runner plans to update `ACTION_ROUTES` before or alongside their routes shipping.
