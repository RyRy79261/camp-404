# QuestionnaireBlock — organism plan

- **mapsTo:** **NEW** (app overlay variant — `component-library.md §QuestionnaireBlock`: "NEW (app overlay variant)"). It is *not* a `@camp404/ui` reusable: it is a client overlay that self-gates on the live session and reads pending `required_actions`, so it belongs with the other app-wide overlays.
- **Home:** `apps/web` — mounted app-wide in the root layout, sibling to `AcknowledgementGate` / `FeedbackGate`. The S25 routed gate is a *different* file (`apps/web/app/onboarding/questionnaire/page.tsx`); this organism is its **overlay twin** (same card + copy, different trigger — `component-library.md §QuestionnaireBlock` "routed twin = S25 gate"; surface 25 §"Ownership split (locked)").
- **Target file:** `apps/web/app/questionnaire-block.tsx` (new `"use client"` file, sibling of `acknowledgement-gate.tsx` / `feedback-gate.tsx`).
- **Supporting (NEW) data endpoint:** `apps/web/app/api/required-actions/pending/route.ts` (mirrors `/api/notifications/pending`) — the polled source the overlay self-gates on. See §Composition and §Build steps.

---

## Current state — what exists today (the old design's component/route markup)

**The overlay does not exist.** `grep -rn "QuestionnaireBlock\|questionnaire-block" apps/web packages` returns zero source matches (only `.next` build artefacts). The redesign introduces it as a NEW distinct overlay; the *routed* gate exists in primitive form and the overlay's engine target (the runner) is shared with onboarding.

What exists today, that this organism re-skins / composes / mirrors:

| Concern | File today | Relevance |
|---|---|---|
| **The routed gate (overlay's twin)** | `apps/web/app/onboarding/questionnaire/page.tsx` | A `force-dynamic` server component. Today it renders a plain `<h1>Build your burner profile</h1>` + subtitle + `<QuestionnaireWizard …>` directly — there is **no** S25 interstitial card (icon disc / eyebrow / QCard / Start / lock-row). The gate redesign (surface 23) adds that interstitial; this overlay reuses the same card composition. Gate guards: `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `hasCampAccess` (→ `/signup/required`) → `getBurnerProfile().completedAt` (→ `/`). (`page.tsx:18-58`) |
| **The app-wide overlay pattern to mirror** | `apps/web/app/acknowledgement-gate.tsx` | The exact pattern QuestionnaireBlock follows: `"use client"`, mounted once in `layout.tsx`, polls `/api/notifications/pending` (`POLL_INTERVAL_MS = 45_000`) with a monotonic `requestIdRef` to drop superseded polls, refetch on `visibilitychange`/`focus`, `if (!current) return null` empty-render, body-scroll-lock on a live item, `fixed inset-0 z-[100] bg-[color:var(--color-background)]` shell, `router.refresh()` after the gate clears. QuestionnaireBlock is a structural sibling. (`acknowledgement-gate.tsx:1-157`) |
| **Where overlays mount** | `apps/web/app/layout.tsx:48-56` | `<Providers>{children}<AcknowledgementGate /><FeedbackGate aiAvailable=… /></Providers>`. QuestionnaireBlock mounts here as a third sibling. |
| **The polled-pending endpoint to clone** | `apps/web/app/api/notifications/pending/route.ts` | Pattern for the NEW `/api/required-actions/pending`: unauth → `{ pending: [] }` (200, **not** 401 — the gate mounts on public pages too); `ensureCampUser`; `!hasCampAccess` → `{ pending: [] }`; else return the scoped list. (`route.ts:17-27`) |
| **The pending-actions read** | `apps/web/lib/users.ts:212` `getPendingRequiredActions` → `packages/db/src/activations.ts:203`; shape `PendingRequiredAction { actionKey; type; title; version; blocking; dueAt; createdAt }` (`activations.ts:16-24`) | Already exists and is test-mode-aware. The NEW endpoint wraps it and filters to `type==="questionnaire" && blocking`. |
| **The gating spine (server, redirect)** | `apps/web/app/page.tsx:44-62` | `nextGate(await getPendingRequiredActions(campUser.id))` → `redirect(gate)`. The blocking required-action that reaches the *runner* by redirect is the same row class this overlay catches *client-side when the member is already inside a non-`/` page*. Critical invariant (surface 25 §Validation): **never render both** — if the routed redirect would fire, the overlay must not also mount (see §States). |
| **The route the Start CTA targets** | `apps/web/lib/required-actions.ts` `ACTION_ROUTES` (`burner_profile → /onboarding/questionnaire`); `nextGate` | The overlay's "Start questionnaire" navigates to the runner route for the pending `actionKey` (S26). |
| **The questionnaire catalogue (count/estimate source)** | `apps/web/lib/questionnaire.ts` `QUESTIONNAIRE` — moving to `@camp404/core` (architecture §`core`; service plan 03 Step 1) | Source of the QCard `questionCount` (derived: `flattenQuestions(QUESTIONNAIRE).length`) per surface 25 §"counts/estimate derived from the questionnaire catalogue, not hard-coded" — the **deliberate divergence from S25's static strings**. |
| **The shared engine the runner reuses** | `apps/web/components/questionnaire/wizard.tsx` + `question.tsx` | Not mounted by the overlay; reached *after* "Start". The overlay only hands off to the runner route. |

There is **no functionality to drop** — this organism is purely additive (a new overlay + its polling endpoint).

---

## Composition — leaves, core helpers, services, server/client split

### Server vs client split

QuestionnaireBlock is a **`"use client"` overlay** (like `AcknowledgementGate`). It self-fetches its trigger via polling; it is *not* server-rendered. There is **no server component for the overlay** — the only server code it needs is the NEW route handler that backs the poll. The Start CTA and Sign-out are plain navigations (no server action invoked by the overlay itself; completion is recorded by the **runner**, which flips the `required_action` to `completed`).

> Contrast with the **routed S25 gate** (its twin, separate plan/surface 23): that *is* a server component (`page.tsx`, `force-dynamic`) with redirect guards and no polling.

### Leaf components it consumes

| Leaf | Plan | Role in QuestionnaireBlock | Notes |
|---|---|---|---|
| **IconBadge** | `design/spec/impl/components/atom-iconbadge.md` | The 56px `clipboard-list` disc, `tone="primary"` (`#ff008c2e` → `primary/18%`), `shape="circle"`, `size="lg"` (board 56→60 snap, `atom-iconbadge.md:31`). | PROMOTE → `@camp404/ui`. Prerequisite leaf. |
| **QCard** | `design/spec/impl/components/molecule-qcard.md` | The questionnaire-summary card: `title`, `questionCount`, `estimatedMinutes`. Use **`size="sm"`** (S22 overlay density: pad 14 / gap 8 / title 15px — `molecule-qcard.md:79,342`). | NEW → `@camp404/ui/components/qcard.tsx`. Prerequisite leaf. |
| **Button** | `design/spec/impl/components/atom-button.md` | "Start questionnaire" CTA, full-width, `variant="default"` (primary). | REUSE `@camp404/ui/components/button.tsx`. |
| **CaptainLock** | `design/spec/impl/components/molecule-captainlock.md` | **NOT used.** Listed only to disambiguate — QuestionnaireBlock is a member-level surface with no rank-gated data. Its "lock" is a `lucide` `Lock` icon + "Can't be skipped" copy, *not* `CaptainLock`. (surface 25 §Components "CaptainLock — not used by these overlays"; component-library notes). | See §States: preview-but-locked N/A. |

Eyebrow (`"REQUIRED QUESTIONNAIRE"`, JetBrains Mono/11/700/`$accent`), heading (`"Before you go any further"`, Inter/22/700 — overlay uses the 22px system-overlay title step, `design-tokens.md:50,67`), body, and the lock/sign-out row are **rendered directly by this organism** (not separate leaves), matching how `AcknowledgementGate` inlines its header chip.

### `@camp404/core` helpers

- **`nextGate` / `ACTION_ROUTES`** (route resolution for the Start CTA). Per architecture §Hybrid (`architecture.md:346`), `nextGate` moves to `core` parameterised; `ACTION_ROUTES` (the registry) **stays app-side** in `apps/web/lib/required-actions.ts`. The overlay resolves the target route by looking up `ACTION_ROUTES[current.actionKey]` (app helper) — it does not need `core` directly for navigation.
- **`flattenQuestions(QUESTIONNAIRE)`** (`packages/types`, REUSE — service plan 03) + **`QUESTIONNAIRE`** (`@camp404/core` after the move) to derive `questionCount`. The overlay imports the catalogue from `@camp404/core` (NOT `@/lib/questionnaire`). The QCard itself takes no core helper (`molecule-qcard.md:144`); derivation happens in the overlay before passing props.
- No `requireClearance` — not a clearance surface.

### Services / server-actions / endpoints (named from the service-layer plans)

| Symbol | Where | Status | Used for |
|---|---|---|---|
| `getPendingRequiredActions(userId)` | `apps/web/lib/users.ts:212` → `packages/db/src/activations.ts:203` | **REUSE** | Underlying read the NEW endpoint wraps. Returns `PendingRequiredAction[]`; filter to `type==="questionnaire" && blocking` (service plan 03 §Consumers; surface 25 §Data: `type='questionnaire'`, `blocking=true`, `status='pending'`). |
| `hasCampAccess(campUser, email)` / `ensureCampUser(authUser)` | `apps/web/lib/users.ts` | **REUSE** | Endpoint auth/access gate (mirrors `/api/notifications/pending`). |
| **`GET /api/required-actions/pending`** | `apps/web/app/api/required-actions/pending/route.ts` | **NEW** | The overlay's polled trigger source. Returns `{ pending: BlockingQuestionnaireAction[] }`; `[]` for unauth / no-camp-access. |
| `satisfyRequiredAction` / `satisfyBurnerProfileAction` | `activations.ts:167` / `users.ts:204` | **REUSE (not called here)** | Completion is the **runner's** job (surface 25 §Data: "No write here — completion is recorded by the questionnaire runner (S26)…which flips status to completed"). The overlay only triggers a `router.refresh()`/re-poll so the cleared row drops the overlay. |

> Why a **NEW poll endpoint** and not reuse the gating spine: the spine (`app/page.tsx`) only fires on a **navigation to `/`**. A blocking questionnaire activated by a captain while the member sits on `/tools` or `/camp/[id]` must interrupt *without* a navigation — hence the AckTakeover-style poll (surface 25 §Open questions "QuestionnaireBlock trigger source: confirm…client-side off a pending blocking required_action (analogous to AckTakeover polling)…If polled, it needs a pending-actions endpoint mirroring /api/notifications/pending"). This is the recommended resolution; flagged for owner confirm.

---

## API & data flow — props/inputs, fetch vs receive, state flow

### Props

Per `component-library.md §QuestionnaireBlock`: "Props: blocking `required_action` (key, title, count, estimate)." Following the `AcknowledgementGate` precedent, the overlay is **self-fetching and prop-less at the mount site** (`<QuestionnaireBlock />` in `layout.tsx`); the `required_action` fields arrive via the poll, not as props. The "props" in the component-library entry describe the **per-item data shape** the overlay renders, not a mount-time prop contract.

```ts
// Polled item shape (returned by /api/required-actions/pending; mirrors PendingItem)
interface BlockingQuestionnaireAction {
  actionKey: string;     // e.g. "burner_profile" / "dietary_requirements" — drives ACTION_ROUTES lookup
  title: string;         // required_actions.title → QCard title (board: "Safety & logistics")
  questionCount: number; // derived server-side OR client-side via flattenQuestions(catalogue[actionKey])
  estimatedMinutes: number; // per-questionnaire static estimate (board: ~3)
  // (createdAt JSON string if ordering is needed; oldest-first like the ack queue)
}
```

### Fetch vs receive

- **Fetches (client):** `GET /api/required-actions/pending` on mount, every `POLL_INTERVAL_MS` (45_000, reuse the ack constant), and on `visibilitychange`/`focus`. Monotonic `requestIdRef` drops superseded responses (copy `acknowledgement-gate.tsx:34-50`).
- **Receives:** nothing as props from the layout.
- **Derives:** if `questionCount`/`estimatedMinutes` are not computed server-side, derive `questionCount = flattenQuestions(catalogueFor(current.actionKey)).length` client-side from `@camp404/core`. **Recommendation:** compute counts **server-side in the endpoint** (keeps the client free of the catalogue bundle and matches surface 25's "derived from the catalogue") and return them ready-to-render. Flag the derive-site as a build choice.

### State flow

`queue: BlockingQuestionnaireAction[]` state ← poll. `current = queue[0]`. `if (!current) return null`. On "Start" → resolve `ACTION_ROUTES[current.actionKey]` and `router.push(route)` (the runner). The overlay does NOT optimistically clear; the runner's completion → `required_action.status='completed'` → next poll returns an empty queue → overlay unmounts (and a `router.refresh()` on return keeps server components honest).

### Forms / actions / validation

**None in the overlay.** It carries no form input and performs no write (surface 23 §States: "the gate carries no form input and performs no write operations itself"; surface 25 §Data: "No write here"). Validation/actions live entirely in the **runner** (S26) it hands off to.

---

## States — full matrix incl. global gating

| State | Presentation / behaviour | Source |
|---|---|---|
| **Empty / null (the common case)** | No pending blocking `type='questionnaire'` action → `if (!current) return null`. Renders nothing — incl. every unauthenticated page (endpoint returns `{ pending: [] }`). | surface 25 §States "renders null when no blocking required_action of type questionnaire is pending" |
| **Loading (initial poll)** | **No spinner** — like AckTakeover, renders nothing until data arrives (`acknowledgement-gate.tsx` has no loading UI). Avoids a flash on every page load. | surface 25 §States "Loading — …no spinner on initial poll" |
| **Shown / populated** | `fixed inset-0 z-[100]` opaque `$background` shell + scan overlay (`#00dcff08` → token, aria-hidden, pointer-events-none); centred column: IconBadge(clipboard-list) → eyebrow → heading → body → QCard(size="sm", derived counts) → Start Button (full-width) → lock/sign-out row. Body scroll locked while shown (restore previous overflow value, not `""`). | surface 25 §Layout §2; surface 23 §Layout |
| **Submitting** | N/A in the overlay — no write here. (The runner owns "Submitting…".) The overlay's only post-action transient is the brief navigation to the runner. | surface 25 §Data |
| **Success** | The overlay *clears* (becomes null) when the backing action flips to `completed` and the next poll returns empty; `router.refresh()` on return. No in-overlay success card (that is S27). | surface 25 §States/§Flows |
| **Error (poll fails)** | Silent — next poll/focus retries (copy ack's `catch {}`). A persistent failure leaves the overlay un-mounted, which is the safe default (no false block). Document as a known soft-fail. | `acknowledgement-gate.tsx:47-49` |
| **Disabled** | The Start CTA is **never disabled** (no async write, no pending transition — surface 23 §User actions). |  |
| **Queue (>1 pending)** | Sequential: show `queue[0]`; on completion the runner clears it and the next poll surfaces `queue[1]`. The S27 "{n} more"/"MORE REQUIRED" bridge is the runner-side queue surface, not this overlay. Ordering oldest-first (mirror ack `orderBy createdAt`). | surface 24/27; service plan 03 §queue read |
| **Gating — preview-but-locked** | **N/A.** All five overlays are member-level; "VIEW ONLY · no data for your rank" / `CaptainLock` is a captain-surface treatment and is explicitly *not* used here. The overlay's "lock" is a `Lock` icon + inert "Can't be skipped" note + an actionable **Sign out** — keep **both** affordances (S22 collapses S25's two lines into one row "Can't be skipped · Sign out"). | surface 25 §States "Preview-but-locked — not applicable"; component-library §QuestionnaireBlock |
| **Gating — onboarding-incomplete (CRITICAL invariant)** | The overlay fires for a **post-onboarding** blocking questionnaire only. The incomplete burner profile is handled by the **routed S25 redirect** (server `page.tsx` redirects on `/`). **Never render both at once:** if the routed S25 redirect would fire (incomplete `burner_profile`), the overlay must not also mount. Practically: the poll endpoint should **exclude the `burner_profile` action while it is the onboarding gate** (the spine already redirects those to the routed runner), OR the overlay self-suppresses when the current route is already the runner route. Recommend the endpoint exclude `burner_profile` (consistent with service plan 03's queue read which excludes `burner_profile`), reserving the overlay for *additional* activations (e.g. a captain activates a new Safety questionnaire for everyone). | surface 25 §Validation "QuestionnaireBlock vs S25: never render both"; §States "Onboarding-incomplete" |
| **Gating — invite-gated / pre-camp** | Endpoint returns `{ pending: [] }` for a signed-in user with no camp access (mirrors ack) → overlay stays empty. | surface 25 §States; pending route pattern |
| **Gating — pending/rejected approval** | Not specifically gated here; the overlay self-gates only on auth/session + a pending blocking questionnaire. | surface 25 §States |
| **E2E-test mode** | The wrapped read (`getPendingRequiredActions`) is already test-mode-aware (returns `[]` under E2E, like `getQuestionnaireQueue` in service plan 03). Endpoint inherits that → overlay stays empty in E2E unless explicitly seeded. | service plan 03 §Target API (E2E-aware wrapper) |

---

## Build steps — ordered, with prerequisites + acceptance + tests

### Prerequisites (leaves/services that must land first)

1. **IconBadge** built + exported from `@camp404/ui` (`atom-iconbadge.md` steps 1–2). *(QuestionnaireBlock can stub the disc per `molecule-captainlock.md` Step 0 if IconBadge slips.)*
2. **QCard** built + exported from `@camp404/ui` (`molecule-qcard.md` steps 2–3) — the overlay is one of its two named consumers (`molecule-qcard.md:342`).
3. **Button** (`@camp404/ui`) — REUSE, already exists.
4. **`@camp404/core` scaffolded + `QUESTIONNAIRE`/`flattenQuestions` reachable** (architecture Phase 1; service plan 03 Step 1) — needed only for catalogue-derived counts. If counts are computed in the endpoint, only the endpoint needs the import.
5. **Status/overlay tokens** — `--overlay`, scan tint (`#00dcff08` → token), and the new `success/warning/info` tokens landed in `globals.css` (architecture Phase 0; design-tokens §2.3/§2.4). The overlay needs `--color-background`, `--color-card`, `--color-border`, `--color-primary`, `--color-accent`, `--color-muted-foreground` (all exist) + the scan tint reconciliation.

### Step 1 — NEW endpoint `GET /api/required-actions/pending`

- Clone `apps/web/app/api/notifications/pending/route.ts`: unauth → `{ pending: [] }`; `ensureCampUser`; `!hasCampAccess` → `{ pending: [] }`; else `getPendingRequiredActions(campUser.id)` → filter `type==="questionnaire" && blocking` → **exclude `burner_profile`** (reserved for the routed gate) → map to `BlockingQuestionnaireAction` (resolve `title`; derive `questionCount` via `flattenQuestions(catalogueFor(actionKey))`; attach a per-questionnaire `estimatedMinutes`).
- **Acceptance:** unauth + no-camp-access return `{ pending: [] }` with 200; a seeded non-`burner_profile` blocking questionnaire row returns one item with derived `questionCount`; `burner_profile` is never returned; E2E mode returns `[]`.
- **Tests:** route unit (mirror the notifications-pending test shape) — auth/access gating, `burner_profile` exclusion, `type/blocking` filter, count derivation.

### Step 2 — `apps/web/app/questionnaire-block.tsx` (`"use client"`)

- Implement the poll machine by analogy to `acknowledgement-gate.tsx`: `queue` state, `requestIdRef` monotonic guard, `POLL_INTERVAL_MS`, `visibilitychange`/`focus` refetch, `current = queue[0]`, `if (!current) return null`, body-scroll-lock effect (restore previous overflow).
- Render the S22 card composition with `IconBadge` + eyebrow + heading + body + `<QCard size="sm" title=… questionCount=… estimatedMinutes=… />` + full-width `<Button variant="default">Start questionnaire</Button>` + lock row (`Lock` icon + "Can't be skipped" + `<a href="/auth/sign-out">Sign out</a>`).
- "Start" → `router.push(ACTION_ROUTES[current.actionKey])` (app registry). On window regain after completion, `router.refresh()` + re-poll clears it.
- a11y: `role="dialog" aria-modal="true" aria-labelledby` (mirror ack); heading is the labelled title; icons `aria-hidden`; the Start CTA is a real `<button>`; Sign-out is a real `<a>`.
- **Acceptance:** with one pending non-`burner_profile` blocking questionnaire, the overlay takes over the screen, locks scroll, shows the derived count; null otherwise; "Start" navigates to the runner; "Sign out" → `/auth/sign-out`; both S25 (incomplete burner) and the overlay never co-render.
- **Tests:** RTL — null when queue empty; renders QCard + Start + lock row when populated; Start navigates to the mapped route; scroll lock applied/restored; superseded poll dropped; a11y (dialog role, labelled title, aria-hidden icons).

### Step 3 — Mount in `layout.tsx`

- Add `<QuestionnaireBlock />` as a third sibling after `<AcknowledgementGate />` (inside `<Providers>`).
- **Acceptance:** renders nothing on public/landing and for completed users; appears only on a live blocking questionnaire; does not double-render with the routed gate.
- **Tests:** layout smoke — overlay present in tree, inert (null) by default.

### Step 4 — Counts/copy reconciliation (owner-gated, no behaviour change)

- Decide derive-site (endpoint vs client) for `questionCount`; lock `estimatedMinutes` per questionnaire. **Deliberate divergence from S25's static "8 questions / 3 minutes":** the *overlay* derives from the catalogue (surface 25 §Layout). The routed S25 gate may keep static strings until the questionnaire-trio scope is confirmed (surface 23 open q5).
- **Acceptance:** derived count matches `flattenQuestions(catalogue).length` for the active questionnaire; QCard singular/plural correct ("1 question" / "about 1 minute").

> Each step is independently shippable behind green CI. Steps 1–2 are the substantive work; Step 1 (endpoint) gates Step 2 (overlay) since the overlay can't render without its trigger source.

---

## Consumers — which surfaces mount it

| Surface | Mount | Role |
|---|---|---|
| **S22 Global overlays** (`design/spec/surfaces/25-global-overlays.md`) | `apps/web/app/layout.tsx` (app-wide, root layout) | The canonical home. App-blocking overlay variant for a post-onboarding blocking `required_action` of `type='questionnaire'`. Mounted once; self-gates via poll. |
| **S25 Questionnaire gate** (`design/spec/surfaces/23-questionnaire-gate.md`) | *Twin, not a consumer.* `apps/web/app/onboarding/questionnaire/page.tsx` (routed server component) | Same card/copy composition (IconBadge + eyebrow + heading + body + QCard + Start + lock/sign-out), different trigger (routed redirect for the onboarding burner-profile gate). It does **not** mount this organism — it renders the same leaves inline as a server-rendered page. The two share `QCard` and the visual contract, not the implementation. |

WROTE design/spec/impl/components/organism-questionnaireblock.md
