# 25-global-overlays — app integration plan

- **Route(s):** **n/a — mounted app-wide** in the root layout (`apps/web/app/layout.tsx`). **MOUNTED / EMBEDDED (no own route).**
  - **AcknowledgementGate**, **FeedbackGate** (→ ReportBugDialog), **QuestionnaireBlock** (NEW), and **ToastProvider** (NEW) are explicit children of the root layout JSX (inside `<Providers>`, after `{children}`). They float over whatever route is active.
  - **error.tsx / global-error.tsx / not-found.tsx** are Next **file-convention boundaries** — *not* mounted anywhere; Next discovers them by filename. `error.tsx` wraps every route segment under `apps/web/app/`; `global-error.tsx` is the last-resort boundary for the root layout itself; `not-found.tsx` renders for any unmatched route / `notFound()` call.
  - **Consumed by:** every surface (transitively). The four success-path overlays self-gate on auth/session, so they are inert (`null`) on public pages and for logged-out visitors. The error/not-found boundaries are universal (render even for logged-out visitors). The `toast()` emitter is callable from any client component / server-action result handler across all surfaces (S08 profile edit, S11 invite tool, captain announcements, etc.).
  - This surface owns **no `apps/web/app/<route>/page.tsx`** of its own.

---

## Current state — the existing route/files today

Verified against the live tree (`grep`/`ls`/`cat`). The redesign for this surface is mostly **EXTEND (presentation)** on already-shipping overlays, plus **two NEW additions** (QuestionnaireBlock overlay + its endpoint; Toast provider + emitter).

### What is mounted in `apps/web/app/layout.tsx` today (verified)
- Lines 3–4 import `AcknowledgementGate` + `FeedbackGate`.
- Lines 50–56: `<Providers>{children}<AcknowledgementGate /><FeedbackGate aiAvailable={!!process.env.ANTHROPIC_API_KEY} /></Providers>`.
- `aiAvailable` is the **only** server→client input on this surface — a server env read (`process.env.ANTHROPIC_API_KEY`) computed in the (server) root layout and threaded to the client `FeedbackGate`.
- **NOT mounted:** the error boundaries (Next file-convention) and — because they don't exist yet — `QuestionnaireBlock` and `ToastProvider`.

### Existing overlay files (all verified present)

| File | What it is today | Redesign |
|---|---|---|
| `apps/web/app/acknowledgement-gate.tsx` | `"use client"` AckTakeover. Polls `GET /api/notifications/pending` (`POLL_INTERVAL_MS=45_000`), monotonic `requestIdRef` de-race, `visibilitychange`/`focus` refetch, body-scroll-lock (restores *previous* overflow), `current=queue[0]`, `if(!current) return null`, POST `/api/notifications/acknowledge` → filter + `router.refresh()`. | **EXTEND (presentation only)** — drop nothing. |
| `apps/web/app/feedback-gate.tsx` | `"use client"` `FeedbackGate({aiAvailable})`. `authClient.useSession()`; `useShakeGesture({enabled: signedIn && !open})`; iOS motion permission once on first pointer gesture after sign-in; renders `null` until signed in, else `<ReportBugDialog open onOpenChange aiAvailable>`. | **REUSE** (unchanged). |
| `apps/web/components/feedback/report-bug-dialog.tsx` | `"use client"` `ReportBugDialog` (kind toggle, Textarea, "Dictate instead" → RecorderPanel, "Improve with AI" checkbox when `aiAvailable`, error `<p role="alert">`, success branch). | **EXTEND** (leaf swaps + token codemod; drop nothing). |
| `apps/web/components/feedback/use-shake-gesture.ts` | `"use client"` `createShakeDetector` (pure) + `useShakeGesture`/`motionPermissionNeeded`/`requestMotionPermission`. | **REUSE** (detector extracts to `core` — plan 09; behaviour unchanged). |
| `apps/web/app/feedback/actions.ts` | `"use server"` `submitFeedbackAction`. auth → burst `{limit:3}` + daily `{limit:20, windowMs:86_400_000}` → Zod → single `sanitizeReportText` → opaque `reporterRef` → E2E short-circuit `{ok:true,number:0,url:".../issues"}` → optional `structureWithAi` → `buildFeedbackIssue` → GitHub POST (`AbortSignal.timeout(8000)`). | **EXTEND** (re-import pure parts from `core`; orchestration unchanged). |
| `apps/web/app/error.tsx` | `"use client"` `{error, reset}`; `console.error` + focus-to-heading; "Something went sideways." card (`max-w-lg`); Try again (`reset`) + Back to camp (`Link href="/"`). Imports `Button` from `@camp404/ui`. | **EXTEND** (mono `error.digest` trace chip + `triangle-alert` IconBadge + token normalise). |
| `apps/web/app/global-error.tsx` | `"use client"` `{error, reset}`; renders own `<html>/<body>` with **inline** dark styles (app CSS unavailable); "Camp 404 hit a snag." + inline `<button>` Try again. | **REUSE** (keep inline palette; optional inline-styled mono digest line). |
| `apps/web/app/not-found.tsx` | **Server component**; `metadata={title:"Page not found"}`; big "404", "You're properly lost.", Back to camp `Button asChild` Link. | **EXTEND** (token normalisation only; **keep server component**). |

### Existing server routes/services it calls (all verified present, REUSE)
- `apps/web/app/api/notifications/pending/route.ts` (GET) — anon → `{pending:[]}` (200, not 401); no-camp-access → `{pending:[]}`; else `getPendingAcknowledgements(campUser.id)`.
- `apps/web/app/api/notifications/acknowledge/route.ts` (POST) — `z.object({deliveryId: z.string().uuid()})`; anon → 401; bad body → 400; no-camp-access → `{ok:false}`; else `acknowledgeDelivery({deliveryId, userId})`.
- `apps/web/lib/notifications.ts` facade → `@camp404/db/broadcasts` (`getPendingAcknowledgements`, `acknowledgeDelivery`); test-mode-aware.
- `apps/web/lib/required-actions.ts` — `ACTION_ROUTES` registry (verified: only `burner_profile → /onboarding/questionnaire` mapped today) + `nextGate`.
- `apps/web/lib/users.ts:212` `getPendingRequiredActions(userId)` → `@camp404/db/activations.ts`; **returns `[]` under E2E test mode** (verified — relevant to QuestionnaireBlock E2E seeding, see States).

### What does NOT exist today (confirmed by grep — zero source matches)
- `apps/web/app/questionnaire-block.tsx` — **NEW.**
- `apps/web/app/api/required-actions/pending/route.ts` — **NEW** (`apps/web/app/api/required-actions/` dir absent).
- Any toast/sonner primitive, `ToastProvider`, `useToast`, `toast()` — **NEW** (zero matches in `apps/web` and `packages`).

### What the redesign changes (net)
1. **Mount two new siblings** in `layout.tsx`: `<QuestionnaireBlock />` and `<ToastProvider>` (wrapping the shell).
2. **Add one new route handler:** `GET /api/required-actions/pending`.
3. **EXTEND** the four existing overlays (presentation/leaf swaps), per their component plans. Drops nothing.
4. The board's **"Attach a screenshot" checkbox stays DROPPED** (no code backing; intake-tracker diagnostics capture intentionally not ported — S25 §Divergence 3).

---

## File structure — target files in apps/web

| File | CREATE/MODIFY/DELETE | Server / client | Notes |
|---|---|---|---|
| `apps/web/app/layout.tsx` | **MODIFY** | server (RSC) | Add `import { QuestionnaireBlock }` + `import { ToastProvider } from "@camp404/ui"`; mount `<QuestionnaireBlock />` (3rd sibling after `<AcknowledgementGate />`) and wrap the shell in `<ToastProvider>`. Keep `aiAvailable={!!process.env.ANTHROPIC_API_KEY}`. |
| `apps/web/app/acknowledgement-gate.tsx` | **MODIFY** | `"use client"` island | EXTEND presentation: `Loader2`→`Spinner` atom, header `Megaphone` chip→`IconBadge` disc, add scan overlay + reassurance line, `bg-[color:var(--color-background)]`→`bg-background`. Keep `max-w-2xl`. No logic change. |
| `apps/web/app/questionnaire-block.tsx` | **CREATE** | `"use client"` island | NEW overlay; poll machine by analogy to ack gate; renders IconBadge + eyebrow + heading + body + `<QCard size="sm">` + Start Button + lock/sign-out row. |
| `apps/web/app/api/required-actions/pending/route.ts` | **CREATE** | server (route handler, `runtime="nodejs"`, `dynamic="force-dynamic"`) | NEW polled source for QuestionnaireBlock. Clones notifications/pending gating; filters `type==="questionnaire" && blocking`, **excludes `burner_profile`**, derives `questionCount`/`estimatedMinutes`. |
| `apps/web/app/feedback-gate.tsx` | **no change** | `"use client"` island | REUSE. |
| `apps/web/components/feedback/report-bug-dialog.tsx` | **MODIFY** | `"use client"` island | EXTEND: re-point pure imports to `@camp404/core`; token codemod; kind toggle→`SegmentedControl`, "Dictate instead"→`DictatePill`, error `<p>`→`Alert`. Screenshot checkbox stays absent. |
| `apps/web/app/feedback/actions.ts` | **MODIFY** | server action (`"use server"`) | EXTEND: import pure parts (`sanitizeReportText`/`buildFeedbackIssue`/`redactPii`/`labelsFor`/`DESCRIPTION_MAX`) from `@camp404/core`; orchestration (auth/limits/AI/GitHub/E2E) unchanged. |
| `apps/web/app/error.tsx` | **MODIFY** | `"use client"` boundary | EXTEND: conditional `<CodeDisplay readonly>` trace chip on `error.digest`, `<IconBadge tone="destructive" icon={TriangleAlert}>`, token normalise. Keep `reset`+Back-to-camp + focus-to-heading. |
| `apps/web/app/global-error.tsx` | **no change (optional inline digest)** | `"use client"` boundary | REUSE inline palette; optionally add inline-styled monospace `error.digest` line. **Never** import `@camp404/ui` here. |
| `apps/web/app/not-found.tsx` | **MODIFY** | **server component** | EXTEND token normalisation only (`text-[color:var(--color-primary)]`→`text-primary`, `--text-*` steps). Keep `metadata` + server-component status. |
| `apps/web/lib/avatar-blob.ts` | (out of scope here — plan 09) | server-only | NEW orphan cleanup; not a global-overlay file. Listed for completeness; owned by platform plan. |

> No `page.tsx` is created — this surface has no route. No DELETE files (the screenshot checkbox is *already absent*, nothing to remove — S25 §Divergence 3 / plan 09 §DELETE: none).

---

## Components composed

| Component | Plan | Renders in | Server/client | Status |
|---|---|---|---|---|
| **AcknowledgementGate** | `components/organism-acknowledgementgate.md` | `layout.tsx` mount | client island | REUSE/EXTEND (app-local; never promoted — imports `next/navigation` + `/api/**`). |
| **FeedbackGate** | (sibling in `organism-reportbugdialog.md`) | `layout.tsx` mount | client island | REUSE. |
| **ReportBugDialog** | `components/organism-reportbugdialog.md` | inside FeedbackGate | client | REUSE/EXTEND. |
| **QuestionnaireBlock** | `components/organism-questionnaireblock.md` | `layout.tsx` mount (NEW 3rd sibling) | client island | NEW. |
| **Error / GlobalError / NotFound** | `components/organism-errorboundary.md` | Next file-convention (no mount) | error/global-error = client; not-found = **server** | REUSE/EXTEND. |
| **Toast / ToastProvider / `toast()` / `useToast()`** | `components/molecule-toast.md` | `ToastProvider` in `layout.tsx`; strips in a body portal | client (provider + portal) | NEW (`@camp404/ui`). |

**Leaf components consumed by the overlays** (from the organism plans; all client-rendered):
- **IconBadge** (`atom-iconbadge.md`, PROMOTE) — Ack header disc (`Megaphone`, `primary/18%`), QuestionnaireBlock disc (`clipboard-list`, `primary/18%`), error `triangle-alert` disc (`destructive/12%`).
- **Spinner** (`atom-spinner.md`, PROMOTE) — Ack acknowledge button inline spinner (replaces `Loader2`).
- **Button** (`atom-button.md`, REUSE) — Acknowledge, Start questionnaire, Send/Cancel/Done, Try again, Back to camp, kind-toggle (until SegmentedControl lands).
- **QCard** (`molecule-qcard.md`, NEW, `size="sm"`) — QuestionnaireBlock summary card (title + count + estimate).
- **CodeDisplay** (`molecule-codedisplay.md`, PROMOTE, `readonly`) — error.tsx mono trace chip.
- **SegmentedControl** (`molecule-segmentedcontrol.md`, PROMOTE) — ReportBugDialog kind toggle.
- **DictatePill** (`molecule-dictatepill.md`, PROMOTE) — ReportBugDialog "Dictate instead".
- **Alert** (`molecule-alert.md`, PROMOTE) — ReportBugDialog inline error banner.
- **RecorderPanel** (`molecule-recorderpanel.md`, app-local, invoked **without** `promptKey`) — ReportBugDialog dictation.
- **Card** (`molecule-card.md`, REUSE, optional) — error.tsx framing.
- **Dialog/Textarea/Checkbox/Label** (`@camp404/ui`, REUSE) — ReportBugDialog shell + fields.
- **CaptainLock** — **NOT used** by any of these overlays (member-level surfaces). QuestionnaireBlock's lock is a lucide `Lock` icon + inert copy + an actionable Sign out, *not* `CaptainLock`.

---

## Services & data

All server work is in route handlers / a server action — the overlays are client islands that reach servers via `fetch()` (poll) or a server-action call.

### AckTakeover
- **`getPendingAcknowledgements(userId)`** (`lib/notifications.ts` → `@camp404/db/broadcasts`) — called by `GET /api/notifications/pending`; client reaches it via `fetch(..., {cache:"no-store"})`. Returns `PendingAcknowledgement[]` (reads `notification_deliveries` filtered `presentation='acknowledge' AND acknowledgedAt IS NULL`, `orderBy createdAt`, joined to `broadcasts → users.displayName` for `senderName`).
- **`acknowledgeDelivery({deliveryId, userId})`** — called by `POST /api/notifications/acknowledge`; owner- AND presentation-scoped UPDATE `{acknowledgedAt:now, readAt:now}`.
- Route auth/access: `getAuthenticatedUser` (`lib/auth`), `ensureCampUser` + `hasCampAccess` (`lib/users`).
- **Fetched client-side (poll), not passed as props** — gate mounts on public pages, so there is no per-route server fetch.

### Feedback (ShakeReporter → ReportBugDialog)
- **`submitFeedbackAction(input)`** (`app/feedback/actions.ts`, `"use server"`) — the only server call. Returns `FeedbackResult = {ok:true;number;url} | {ok:false;error}`. Writes to **no Camp 404 table** (GitHub Issues is the store); reads the camp user row for the opaque `reporterRef` (falls back to `"unlinked"`).
- **`structureWithAi`** (`lib/feedback-ai.ts`, `server-only`) — invoked *by the action*, fail-safe → `null`.
- **Pure helpers (from `@camp404/core` after Phase 3):** `sanitizeReportText`, `buildFeedbackIssue`, `redactPii`, `labelsFor`, `DESCRIPTION_MAX`, `FeedbackKind` (`core/feedback`). `createShakeDetector` (`core/shake`).
- **Passed as props:** `aiAvailable` (server env read) → FeedbackGate → ReportBugDialog. `route: window.location.pathname` is read client-side and threaded into the action payload.

### QuestionnaireBlock (NEW)
- **`getPendingRequiredActions(userId)`** (`lib/users.ts:212` → `@camp404/db/activations.ts`) — REUSE; wrapped by the NEW endpoint, filtered to `type==="questionnaire" && blocking`, `burner_profile` excluded. **Returns `[]` under E2E test mode** (verified).
- **`GET /api/required-actions/pending`** (NEW) — clones notifications/pending gating (`getAuthenticatedUser` → `ensureCampUser` → `!hasCampAccess` → `{pending:[]}`). Maps to `BlockingQuestionnaireAction {actionKey, title, questionCount, estimatedMinutes}`. **Recommendation: derive `questionCount` server-side** via `flattenQuestions(catalogueFor(actionKey)).length` (`@camp404/types` `flattenQuestions` + `QUESTIONNAIRE` catalogue from `@camp404/core`) so the client never bundles the catalogue. Build choice flagged.
- **Start CTA** resolves `ACTION_ROUTES[current.actionKey]` (app registry, `lib/required-actions.ts`) → `router.push`. **No write here** — completion is the runner's (S26) job, which flips `required_action.status='completed'`; next poll clears the overlay.
- **Sign out** → the Better-Auth sign-out flow (verified handler at `apps/web/app/api/auth/[...path]/route.ts`; use the auth-client sign-out, not a hand-rolled URL — confirm exact target at build).

### Error / not-found boundaries
- **No services.** No fetch, no action, no `@camp404/core` helper. `console.error(error)` only; the trace value is `error.digest` straight off the Next-supplied `error` prop. Recovery is `reset()` / `Link href="/"`.

### Toast (NEW)
- **No services / no `@camp404/core`** — pure presentation + React event wiring (`@camp404/ui`). The `toast()` emitter must carry **no `next/*` coupling** (plan 09 / molecule-toast.md). Status tones map to the NEW status tokens (success/info/warning/error).

---

## Gating

- **Gate level:** **member-level / auth-self-gated** for the four success-path overlays; **universal** for error/not-found.
  - AckTakeover, QuestionnaireBlock: self-gate via their poll endpoints — anon and no-camp-access both yield `{pending:[]}` → overlay never appears.
  - FeedbackGate: renders `null` until `authClient.useSession()` resolves a signed-in session (`isPending` treated as not-signed-in); the action also auth-gates (defence in depth).
  - error/global-error/not-found: render for **every visitor including logged-out** (errors and missing routes are universal).
- **Preview-but-locked / CaptainLock:** **N/A — explicitly.** All five overlays are member-level; there is **no captain-only data, no rank read, no `requireClearance`, no `CaptainLock`** on this surface (S25 §Gating; every organism plan confirms). The CaptainLock "VIEW ONLY · no data for your rank" treatment lives on captain surfaces only. QuestionnaireBlock's "lock" affordance is a plain lucide `Lock` icon + inert "Can't be skipped" copy + an actionable Sign out — **not** the CaptainLock organism.
- **QuestionnaireBlock vs routed S25 gate (CRITICAL invariant):** never render both. The incomplete burner profile is handled by the **routed** gate (`apps/web/app/onboarding/questionnaire/page.tsx`, server redirect on `/`). The overlay is reserved for *additional* post-onboarding blocking questionnaires. Enforced by the endpoint **excluding `burner_profile`**.

---

## States

Per the S25 global state matrix (and each organism plan):

- **Empty / null (common case):** AckTakeover & QuestionnaireBlock → `if(!current) return null` (incl. every unauthenticated page). ReportBugDialog: description empty, Send disabled. Toast: no items → portal empty.
- **Loading:** AckTakeover & QuestionnaireBlock have **no spinner** on initial poll — render nothing until data arrives (avoids a flash on every page load). FeedbackGate treats session `isPending` as not-signed-in (renders nothing). RecorderPanel has its own `requesting`/`processing` states.
- **Populated:** AckTakeover shows `queue[0]` + "{n} more after this." when `queue.length>1`. QuestionnaireBlock shows the QCard with derived counts. ReportBugDialog shows the full form. Toast shows the strip(s).
- **Submitting:** Acknowledge button → Spinner + disabled, body still scroll-locked, no dismiss affordance. ReportBugDialog → Send shows "Sending…", Cancel disabled, **dialog cannot be dismissed by Escape/outside-click/X mid-send**. QuestionnaireBlock has **no submitting state** (no write; only the navigation to the runner).
- **Success:** Acknowledge removes the item → next item or empty → `router.refresh()`. ReportBugDialog swaps to "Report filed" (issue number/link + Done; E2E `number:0` → the `≤0` copy). QuestionnaireBlock *clears* when the backing action flips to `completed` and the next poll returns empty. Toast is itself a success surface (auto-dismiss after timeout; Undo reverses + dismisses).
- **Error:** AckTakeover acknowledge non-ok → **silent no-op** (item stays, retry next press/poll); poll non-ok → silently ignored, next poll retries. ReportBugDialog → inline `Alert variant="destructive"` (`role="alert"`) with the typed error (validation / rate-limit / auth / GitHub config / GitHub status / timeout / transport reject); form stays editable. QuestionnaireBlock poll fail → silent (next poll retries; un-mounted is the safe default — no false block). error/global-error/not-found render the recovery cards.
- **Disabled:** Acknowledge disabled while `acking`. Send disabled when empty-trimmed or pending; Cancel disabled while pending; AI checkbox **absent** (not disabled) when `!aiAvailable`. QuestionnaireBlock Start CTA **never disabled**. Recovery buttons always enabled.
- **Gating states:**
  - **Invite-gated / pre-camp:** feedback works for a signed-in user with no camp row (`"unlinked"` reporterRef); both poll endpoints return `{pending:[]}` for no-camp-access → Ack & QuestionnaireBlock stay empty.
  - **Onboarding-incomplete:** routed gate (not this overlay) handles the incomplete burner profile via redirect; a mid-onboarding member can still receive ack takeovers and file feedback.
  - **Pending/rejected approval:** not specifically gated; overlays self-gate only on auth/session.
  - **Preview-but-locked:** N/A (see Gating).
  - **AI-unavailable:** `aiAvailable=false` ⇒ checkbox not rendered; `useAi` forced false (`aiAvailable && useAi`).
  - **E2E-test mode:** `submitFeedbackAction` short-circuits to `{ok:true,number:0,url:".../issues"}` (no AI/GitHub). Ack uses the test-store backend. **QuestionnaireBlock: `getPendingRequiredActions` returns `[]` under E2E** (verified) → the overlay stays empty unless the read is made E2E-seedable (build note — the NEW endpoint inherits this; seeding the overlay in E2E requires extending the test-store path, see Build steps / Open items).

---

## Build steps — ordered, with prerequisites + acceptance + tests

> Plan docs only. Each step is independently green-CI-clean (MEMORY: green-CI-is-done). Service layer + notifications routes are REUSE (no change). E2E_TEST_MODE seam noted per overlay.

**Phase prerequisites (must land first — from architecture.md):**
- **Phase 0 — foundations tokens/fonts:** status tokens (`success`/`warning`/`info`), `--overlay` scrim, scan tint reconciliation (`#00dcff08`/`#f83e5a1f` → tokens), `--font-*`/`--text-*`, `next/font` wiring. Gates Toast, IconBadge tints, token codemods.
- **Phase 3 — `@camp404/core` feedback extraction (plan 09):** `github-feedback.ts` (incl. `DESCRIPTION_MAX`, `FeedbackKind`, `sanitizeReportText`, `buildFeedbackIssue`) → `core/feedback`; `createShakeDetector` → `core/shake`; `submitFeedbackAction`/`report-bug-dialog.tsx` imports re-pointed (optional re-export shim).
- **Phase 5 — `@camp404/ui` PROMOTE/NEW:** `IconBadge`, `Spinner`, `CodeDisplay`, `SegmentedControl`, `DictatePill`, `Alert`, `QCard` (NEW), `Toast`+`ToastProvider`+emitter (NEW).

**Steps (this surface):**

1. **AckTakeover EXTEND (presentation).** `Loader2`→`Spinner`; `Megaphone` chip→`IconBadge` disc + mono eyebrow; add scan overlay + reassurance line; `bg-[color:var(--color-background)]`→`bg-background`; keep `max-w-2xl`. *Prereq:* Spinner + IconBadge (Phase 5), Phase 0 tokens. *Acceptance:* behavioural diff shows no change to fetch URLs / poll cadence / de-race / scroll-lock / POST; `grep Loader2` returns nothing; a11y attrs intact. *E2E:* test-store-seeded `acknowledge` delivery surfaces ≤45s / on focus; acknowledge advances queue + `router.refresh()`; anon/no-camp-access never shows it; non-ok = silent no-op.

2. **ReportBugDialog EXTEND.** Re-point pure imports to `@camp404/core`; token codemod; kind toggle→`SegmentedControl`; "Dictate instead"→`DictatePill`; error `<p>`→`Alert`. Keep screenshot checkbox **DROPPED**; keep voice; preserve mid-send dismissal guard + reset-on-open. *Prereq:* Phase 3 + Phase 5 leaves. *Acceptance:* the four existing dialog tests pass unchanged; AI checkbox hidden when `!aiAvailable`. *E2E seam:* `E2E_TEST_MODE` → action returns `{number:0}` → `≤0` success copy renders.

3. **error.tsx / not-found.tsx EXTEND.** error.tsx: conditional `<CodeDisplay readonly aria-label="Error trace">` on `error.digest`, `<IconBadge tone="destructive" icon={TriangleAlert}>`, token normalise; keep `reset`/Back-to-camp/focus-to-heading. not-found.tsx: token normalise only, **keep server component**. global-error.tsx: leave inline palette (optional inline mono digest). *Prereq:* IconBadge + CodeDisplay (Phase 5), `--font-mono`/`--text-mono` (Phase 0). *Acceptance/test:* extend `apps/web/components/__tests__/error-pages.test.tsx` — trace chip renders when `digest` set, absent otherwise; both Back-to-camp links → `/`; `reset()` fires; focus-to-heading preserved; icon `aria-hidden`. `global-error.tsx` stays out of jsdom (manual/e2e).

4. **NEW endpoint `GET /api/required-actions/pending`.** Clone notifications/pending gating; filter `type==="questionnaire" && blocking`; **exclude `burner_profile`**; map to `BlockingQuestionnaireAction` with server-derived `questionCount` + per-questionnaire `estimatedMinutes`. *Prereq:* `getPendingRequiredActions` (REUSE), `flattenQuestions`/`QUESTIONNAIRE` reachable (Phase 1/3). *Acceptance:* anon + no-camp-access → `{pending:[]}` (200); a seeded non-`burner_profile` blocking questionnaire returns one item with derived count; `burner_profile` never returned; E2E → `[]` (unless test-store seeded). *Test:* route unit mirroring notifications-pending shape.

5. **NEW `apps/web/app/questionnaire-block.tsx`.** Poll machine by analogy to ack gate (`queue`, `requestIdRef`, `POLL_INTERVAL_MS`, visibility/focus refetch, `current=queue[0]`, `if(!current) return null`, body-scroll-lock restoring previous overflow). Render IconBadge(`clipboard-list`) + eyebrow + heading + body + `<QCard size="sm">` + full-width Start Button + lock/sign-out row. Start → `router.push(ACTION_ROUTES[current.actionKey])`; on return `router.refresh()` + re-poll clears. a11y `role="dialog" aria-modal aria-labelledby`. *Prereq:* Step 4 endpoint, IconBadge + QCard + Button. *Acceptance:* one pending non-`burner_profile` blocking questionnaire takes over + locks scroll + shows derived count; null otherwise; Start navigates to runner; Sign out signs out; never co-renders with the routed gate. *Test:* RTL (null/populated/navigate/scroll-lock/superseded-poll/a11y). *E2E seam:* requires the test-store path for `getPendingRequiredActions` to be seedable (open item).

6. **NEW Toast + mount.** Build `Toast`/`ToastProvider`/`toast()`/`useToast()` in `@camp404/ui` (molecule-toast.md). Mount `<ToastProvider>` in `layout.tsx` wrapping the shell. Wire one first consumer (e.g. announcements "Draft saved." + Undo) as the smoke test. *Prereq:* Phase 0 status tokens. *Acceptance:* four tones render; auto-dismiss after 4s; Undo reverses + dismisses; emitter has **no `next/*` import**; mounting doesn't break the layout. *Test:* `packages/ui` vitest/RTL (tones, action wiring, fake-timer auto-dismiss, queue, no-`next/*` guard).

7. **Mount QuestionnaireBlock in layout.tsx.** Add `<QuestionnaireBlock />` as the 3rd sibling after `<AcknowledgementGate />`. *Acceptance:* inert (null) by default; appears only on a live blocking questionnaire; no double-render with the routed gate. *Test:* layout smoke.

8. **(DEFERRED, open) error-boundary "Report" action.** Wire error.tsx's Report → a boundary-reachable reporter prefilled with `error.digest`. `FeedbackGate` mounts on success paths only, so this needs its own lightweight reporter entry. **Default: surface the digest in the chip and defer the Report button.** (S25 OQ; plan 09 step 8.)

**Existing tests to preserve:** `report-bug-dialog.test.tsx`, `use-shake-gesture.test.ts`, `github-feedback.test.ts` (from its new core home), `feedback/actions.test.ts`, `error-pages.test.tsx`.

---

## Open items — surface-specific decisions (cross-ref open-questions.md / S25 §Open questions)

1. **Screenshot attachment** — board's "Attach a screenshot" checkbox has no code backing; intake-tracker diagnostics capture was intentionally dropped. **Default: keep DROPPED.** Adding it would change the GitHub POST + add an upload path. (S25 §Div 3.)
2. **Error-boundary "Report" action** — wire to `ReportBugDialog` prefilled with the trace digest? Requires a boundary-reachable reporter entry (`FeedbackGate` is success-path-only). **Default: surface digest in chip, defer Report button.** (S25 OQ; plan 09 step 8.)
3. **Toast infrastructure** — sonner vs bespoke; status-token set (success/warning/info/error); default timeout (proposed 4000ms); which mutations emit toasts. **Recommendation: bespoke per molecule-toast.md** (`useReducer` + portal + module-level emitter ref). (S25 OQ.)
4. **QuestionnaireBlock trigger source** — confirm client-side poll (recommended; mirrors AckTakeover) vs server-rendered gate. If polled (this plan's assumption), the NEW `/api/required-actions/pending` endpoint is required. (S25 OQ; questionnaire plan 03.)
5. **`questionCount` derive-site** — server-side in the endpoint (recommended, keeps catalogue out of the client bundle) vs client-side via `flattenQuestions`. Lock per-questionnaire `estimatedMinutes`. (organism-questionnaireblock.md §API.)
6. **`popup` broadcast presentation** — third `broadcast_presentation` value; is it the same surface as Toast (`tone:"info"`) or a distinct notification toast owned by the notifications unit? Referenced in `lib/notifications.ts` / announcements manager; no overlay here. **Flag ownership.** (S25 OQ.)
7. **E2E seeding for QuestionnaireBlock** — `getPendingRequiredActions` returns `[]` under E2E test mode (verified). To E2E-exercise the overlay, the test-store path must be extended to seed a blocking questionnaire `required_action`. (build note; not required for the minimal landing.)
8. **Toast token reconciliation** — board's `$accent` success check → `$success` per the affirmative-write rule; info stays `$accent`. (S25 §Div 2 / decisions §tokens.)
9. **Sign-out target** — use the Better-Auth client sign-out (handler at `api/auth/[...path]`), not a hand-rolled `/auth/sign-out` URL; confirm exact call at build.
