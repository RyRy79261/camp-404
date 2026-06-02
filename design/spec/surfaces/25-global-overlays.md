# Global overlays (system-level) — functional brief

- **Route(s):** none — mounted app-wide in the root layout (`apps/web/app/layout.tsx`). The error/not-found boundaries are file-convention routes (`error.tsx`, `global-error.tsx`, `not-found.tsx`) that Next mounts implicitly, not navigable paths.
- **Canonical board(s):** `design/.spec-extract/boards/31-s22-global-overlays.txt` (S22 — the board renders every overlay as a labelled static state on one mobile column; in production each is a floating surface over whatever screen is active).
- **Superseded-or-dropped:** none dropped here. **Ownership split (locked):** the `QuestionnaireBlock` overlay specced here is the **app-blocking overlay variant** (a captain-activated *blocking* `required_action` of type `questionnaire` that interrupts a member already inside the app). The **routed S25 gate** (`design/spec/surfaces/…s25…`, code `apps/web/app/onboarding/questionnaire/page.tsx`) owns the onboarding burner-profile gate that redirects an incomplete user to a full page. S25 = routed gate; this = blocking overlay. They share the same visual card and copy.
- **Breakpoints:** mobile-first 430px shell. Overlays inherit it, with two deliberate exceptions: the **AckTakeover uses `max-w-2xl`** (wider than the app's `max-w-lg` shell — long-read announcement column) and the **error/not-found pages use `max-w-lg`**. All other overlays sit inside the active screen's column.

## Purpose

Five system-level surfaces that render above the whole app shell, independent of route. They handle the cross-cutting interrupts and feedback that no single screen owns:

1. **AckTakeover** (`AcknowledgementGate`) — full-screen, scroll-to-end modal forcing a member to read and explicitly acknowledge each `presentation='acknowledge'` announcement before it dismisses. Polls continuously so a freshly-published announcement interrupts promptly.
2. **QuestionnaireBlock** — full-screen "you can't use Camp 404 until this is done" gate for a *blocking* questionnaire obligation that surfaces while the member is already in the app.
3. **ShakeReporter → ReportBugDialog** — shake-triggered bug/feature reporter that files a GitHub issue (kind toggle, voice dictation, optional AI restructure, success view). **Nothing is written to our DB.**
4. **ErrorBoundary** — route-segment error boundary that keeps the user inside the shell with retry / home escape (plus the root-layout `global-error` and `not-found` siblings).
5. **Toast** — transient confirmation/undo strip for in-app actions.

All self-gate on auth/session so they do nothing for logged-out visitors (except the error/not-found boundaries, which are universal).

## Layout & modules (decomposition)

### 1. AckTakeover (`AcknowledgementGate`)
Full-screen fixed overlay (`fixed inset-0 z-[100]`, `role="dialog" aria-modal="true" aria-labelledby="ack-title"`, opaque `$background`). A single centred scroll column (`max-w-2xl`, `overflow-y-auto`):
- **Header chip:** `Megaphone` icon ($primary) + uppercase mono label "CAMP ANNOUNCEMENT" [JetBrains Mono/11px/700/$accent].
- **Title:** `current.title` [Inter/26px/700/$foreground] (board: "Burn-night briefing").
- **Meta line:** `From {senderName} · {createdAt}` [Inter/12px/$muted-foreground]. The "From …" prefix is omitted when `senderName` is null; `createdAt` localised via `toLocaleString()`.
- **Body:** `current.body` rendered `whitespace-pre-wrap` (preserves the announcement's line breaks) [Inter/15px/$muted-foreground].
- **Footer (at the END of the scroll, NOT pinned):** the member must scroll the whole message to reach it. Above the button, when `queue.length > 1`, a "{queue.length − 1} more after this." line. Then the full-width **Acknowledge** Button-Primary; below it the board's reassurance line "You can't dismiss this until you acknowledge." [Inter/11px/$muted-foreground].
- **Scan overlay:** decorative `#00dcff08` scanline rect (board styling motif).
- **Body scroll lock** while a current item exists; scroll position reset to top whenever a new item surfaces.

### 2. QuestionnaireBlock (app-blocking overlay variant)
Full-screen centred card (`jc:center ai:center`, opaque `$background`, scan overlay):
- **Icon disc:** `clipboard-list` ($primary) on `#ff008c2e` disc.
- **Eyebrow:** "REQUIRED QUESTIONNAIRE" [JetBrains Mono/11px/700/$accent].
- **Title:** "Before you go any further" [Inter/22px/700/$foreground].
- **Body:** "A captain needs this from you. You can't use Camp 404 until it's done." [Inter/14px/$muted-foreground].
- **QCard** (`$card`/`$border`): questionnaire name (board: "Safety & logistics") + a meta row — `list-checks` "N questions" and `timer` "about M minutes" (counts/estimate derived from the questionnaire catalogue, not hard-coded).
- **Start questionnaire** Button-Primary (full width) → routes into the questionnaire runner (S26).
- **Lock affordance:** `lock` icon + "Can't be skipped · Sign out" [Inter/12px/500/$muted-foreground]. (Board S25 splits this into a "This can't be skipped." line + a separate "Sign out" link; this overlay collapses it into one row — keep both affordances: an inert "can't skip" note and an actionable Sign out.)

### 3. ShakeReporter → ReportBugDialog
The board shows a compact inline `ShakeReporter` card (icon + "Something feel off?" + "You shook your phone — want to report it?" + a textarea preview + a "Attach a screenshot" checkbox + Not now / Send report). **Enrich to the coded `ReportBugDialog`** (a `Dialog`, `max-w-lg`, `max-h-[90vh]` scroll), which is the production surface. The board card is the design stub; the dialog is canonical. Two render branches:

**Form view:**
- **Header:** title is kind-dependent — "Report a bug" / "Request a feature"; description "This opens a GitHub issue on our public tracker — please don't include personal details."
- **Kind toggle:** `role="group" aria-label="Report type"`; two buttons — **Bug** (`Bug` icon) / **Feature** (`Lightbulb` icon). Selected = `variant="default"`, other = `variant="outline"`; `aria-pressed` reflects selection. Default kind = `bug`.
- **Description:** `Label` is kind-dependent ("What went wrong?" / "What would you like to see?"); `Textarea` `rows={6}`, `maxLength=DESCRIPTION_MAX (5000)`; placeholder kind-dependent.
- **Voice dictation:** a "Dictate instead" Button-Outline (`Mic`) swaps in the shared **`RecorderPanel`** (no `promptKey` → generic transcription). Transcripts are **appended** to the description (trim, ignore empty, set `dictated=true`, newline-join unless the text already ends in whitespace, re-clamp to 5000). Panel stays open for another recording until dismissed.
- **"Improve with AI" checkbox:** rendered ONLY when `aiAvailable`; default-checked. Helper: "Restructures your report into a clear title and steps before filing."
- **Error banner:** `role="alert"`, destructive-tinted, shows the typed `{ok:false}` error.
- **Footer:** **Cancel** (Button-Outline, disabled while pending) + **Send report** (Button-Primary; disabled until non-empty trimmed description; spinner + "Sending…" while pending).

**Success view (replaces the form):**
- `CheckCircle2` + "Report filed"; description `Issue #{number} was created on GitHub. Thanks!` when `number > 0`, else "Thanks — your report was sent."
- A link (`ExternalLink`) opening `result.url` in a new tab — `View issue #{number}` (or "Open the tracker" when `number ≤ 0`).
- **Done** button closes.

Drives:
- **`FeedbackGate`** — headless wrapper mounted in layout; attaches the shake listener only while `signedIn && !open`, renders `<ReportBugDialog>` or `null`. Receives `aiAvailable`. Requests iOS 13+ motion permission once on first pointer gesture after sign-in.
- **`useShakeGesture` / `createShakeDetector`** — pure rotation-invariant shake state machine: magnitude `√(x²+y²+z²)`, jolt when `|Δmag| > threshold`, fire on `requiredJolts` within `windowMs` past a `cooldownMs`. Tuned so a single bump or a phone settling doesn't trigger.
- **`submitFeedbackAction`** (`"use server"`) — auth gate → rate limits → Zod validation → single sanitize (PII+HTML strip; reject empty-after-sanitize) → opaque `reporterRef` → optional AI → `buildFeedbackIssue` → GitHub POST → typed `FeedbackResult`.
- **`structureWithAi`** — optional Haiku pass, fail-safe → `null`.
- **`github-feedback.ts`** — pure issue assembly + PII redaction + Markdown-injection defence.

### 4. ErrorBoundary (+ siblings)
- **`error.tsx`** — route-segment boundary (`{ error, reset }`). Centred card (`max-w-lg`): heading "Something went sideways." (focus moved to it on mount, `tabIndex={-1}`), body "An unexpected error tripped us up. Try again — if it keeps happening, let a camp captain know.", actions **Try again** (`reset()`) + **Back to camp** (Button-Outline → `/`). Logs `error` (digest correlates with server logs). Board variant labels it "404 — that wasn't supposed to happen" with a `triangle-alert` ($destructive) icon and a mono `ERR_RENDER · trace 8f3a2` code chip + Report / Reload actions — **reconcile copy below.**
- **`global-error.tsx`** — last-resort boundary for errors in the root layout itself; supplies its own `<html>/<body>` with inline dark-theme styles (app CSS unavailable). Heading "Camp 404 hit a snag.", single **Try again** button.
- **`not-found.tsx`** — unmatched-route / `notFound()` page inside the shell: big "404", "You're properly lost.", **Back to camp** link.

### 5. Toast
Transient strip (board: `$popover`/`$border`, full-width row): leading status icon (board: `check` $accent), message [Inter/14px/500/$foreground] (board: "Saved."), and an optional inline action affordance [Inter/13px/600/$accent] (board: "Undo"). **NEW component — no toast/sonner primitive exists in `@camp404/ui` yet.** Auto-dismiss after a timeout; the action (Undo) cancels the underlying mutation.

## Components used (reusable + new) — name · role · key props/variants

**Reusable (existing):**
- **Button-Primary** — Acknowledge, Start questionnaire, Send report, Done, Try again. Variants: default / `lg` / `sm`; `disabled`, spinner slot.
- **Button-Outline** — Cancel, Dictate instead, Back to camp, kind-toggle unselected state, Not now (board stub).
- **`Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter`** (`@camp404/ui`) — the ReportBugDialog shell.
- **`Checkbox`, `Textarea`, `Label`** (`@camp404/ui`) — AI toggle, description field, field labels.
- **`RecorderPanel`** (`apps/web/components/voice/recorder-panel.tsx`) — shared voice primitive embedded for dictation; states `requesting`/`recording`/`processing`/`error`/idle; invoked **without** `promptKey`. Detailed in the voice unit; here a consumer.
- **CaptainLock** — not used by these overlays (member-level surfaces); noted only to disambiguate from the QuestionnaireBlock lock affordance.

**New components introduced here:**
- **Toast** — transient confirmation strip (status icon + message + optional action). NEW; not among the 10 canvas reusables nor in `@camp404/ui`. Variants implied by status: success / info / warning / error (drives the icon + accent); with-action vs message-only.
- **AcknowledgementGate** — app-wide ack overlay (no props; self-fetches). Exists in code.
- **QuestionnaireBlock** — app-blocking questionnaire gate overlay. NEW as a distinct overlay (the routed S25 gate exists in code; the *overlay* variant is new). Props: the blocking `required_action` (key, title, question count, estimate).
- **FeedbackGate** — headless shake→dialog wrapper. Prop `aiAvailable: boolean`. Exists in code.
- **ReportBugDialog** — bug/feature modal. Props `open`, `onOpenChange`, `defaultKind?='bug'`, `aiAvailable?=false`. Exists in code.
- **Error / GlobalError / NotFound** — Next file-convention boundaries. Exist in code.

## States — every state/variant incl. the global matrix

- **Empty** — AckTakeover renders `null` when the pending queue is empty (the common case, incl. every unauthenticated page). QuestionnaireBlock renders `null` when no blocking `required_action` of type `questionnaire` is pending. ReportBugDialog: description starts empty; Send disabled.
- **Loading** — AckTakeover has **no spinner** on initial poll (shows nothing until data arrives). FeedbackGate treats `authClient.useSession()` `isPending` as not-signed-in (renders nothing). RecorderPanel `requesting` ("Allow microphone…") / `processing` ("Transcribing…").
- **Populated** — AckTakeover shows `queue[0]` (title/sender/body) + "{n} more after this." when queue length > 1. QuestionnaireBlock shows the QCard with derived counts. ReportBugDialog shows the full form.
- **Validation-error** — `submitFeedbackAction` returns the first Zod message ("Please describe the issue." when empty/empty-after-sanitize); textarea enforces `maxLength`; Send disabled until non-empty trimmed. Acknowledge POST validates `deliveryId` as UUID → 400 on failure.
- **Submitting** — Acknowledge button: `Loader2` spinner + `disabled` while `acking`. ReportBugDialog: Send → spinner + "Sending…"; Cancel disabled; **dialog cannot be dismissed by Escape / outside-click / X mid-send**.
- **Success** — ReportBugDialog swaps to "Report filed" (number + link + Done). Acknowledge success removes the item, advances the queue, calls `router.refresh()`. Toast is itself a success surface.
- **Disabled** — Send disabled when empty or pending; Cancel disabled while pending; RecorderPanel close/record disabled while recording/busy; AI checkbox absent (not just disabled) when `!aiAvailable`.
- **Error** — error/global-error/not-found boundaries; ReportBugDialog inline error banner; config-error variants (missing GitHub token / misconfigured repo) surface as inline `{ok:false}` banners.

**Gating states:**
- **Invite-gated / pre-invite** — `submitFeedbackAction` still works for a signed-in user with **no camp row**, using the `"unlinked"` reporter sentinel. The pending-acknowledgements route returns an empty list for a signed-in user without camp access (`hasCampAccess` false → no deliveries) → AckTakeover stays empty.
- **Onboarding-incomplete** — the **routed S25 gate** (not this overlay) handles the incomplete burner profile via redirect. A member mid-onboarding can still receive ack takeovers and file feedback (subject to camp-access for the ack queue). The QuestionnaireBlock **overlay** fires for a *post-onboarding* blocking questionnaire (e.g. a captain activates a new Safety questionnaire for everyone).
- **Pending / rejected approval** — not specifically gated here; gates self-gate only on auth/session.
- **Preview-but-locked** — not applicable; all five overlays are member-level (no captain-only data). The CaptainLock "VIEW ONLY · no data for your rank" treatment lives on captain surfaces, not here.
- **AI-unavailable** — `aiAvailable=false` ⇒ checkbox not rendered; `useAi` forced false in the submit call.
- **E2E-test mode** — `submitFeedbackAction` returns `{ok:true, number:0, url:".../issues"}` without calling AI/GitHub (exercises auth+validation).

## User actions — each action → result

- **Acknowledge an announcement** — scroll to the end, press Acknowledge → POST `/api/notifications/acknowledge {deliveryId}`; on ok, drops the item, reveals the next, `router.refresh()`. On non-ok, silently no-ops (item stays).
- **Shake the device** — opens ReportBugDialog (only trigger; only while signed in and dialog not already open).
- **Grant motion permission** — (iOS 13+) first `pointerdown` after sign-in silently triggers the OS motion prompt, once.
- **Toggle report kind** — tap Bug / Feature → swaps title/label/placeholder/labels.
- **Type description** — into the textarea (≤ 5000).
- **Dictate** — "Dictate instead" → record via RecorderPanel; transcript appends; panel stays open.
- **Toggle "Improve with AI"** — checkbox (only when server has a Claude key; default on).
- **Send report** — files the GitHub issue; spinner + "Sending…" while pending → success view or inline error.
- **Cancel / dismiss** — closes the dialog (blocked while sending).
- **View filed issue / Done** — open the GitHub issue in a new tab / close.
- **Start questionnaire** — QuestionnaireBlock → routes to the runner (S26).
- **Sign out** — from QuestionnaireBlock's lock row (the only non-completing escape from a blocking gate).
- **Retry / go home** — error boundary "Try again" (`reset()`) / "Back to camp" (→ `/`); not-found "Back to camp".
- **Toast action (Undo)** — cancels/reverses the just-completed mutation; toast auto-dismisses otherwise.

## Data & enums — mapped to schema.ts

**AckTakeover reads/writes `notification_deliveries`** (`schema.ts:830-877`):
- `id` → exposed as `deliveryId`; `userId` (scopes every query); `title`, `body` (shown); `presentation` (filtered to `"acknowledge"`); `createdAt` (order key + meta); `acknowledgedAt` (surfaces rows where NULL; set to `now` on acknowledge); `readAt` (set to `now` on acknowledge). `broadcastId` joined to `broadcasts` → `users.displayName` as `senderName` (nullable). Channel/push/ref fields untouched.
- Indexes: `notification_deliveries_user_ack_idx` on `(userId, acknowledgedAt)` (exact gate predicate).
- DB shape `PendingAcknowledgement = { deliveryId; title; body; senderName: string|null; createdAt: Date }`; client mirror `PendingItem` types `createdAt` as `string` (JSON).

**QuestionnaireBlock reads `required_actions`** (`schema.ts:570-609`):
- `type` = `"questionnaire"` (`required_action_type` enum: questionnaire | acknowledgement | payment | profile_update); `status` = `"pending"` (`required_action_status`: pending | completed | waived | expired); `blocking=true`; `actionKey` (questionnaire registry key, e.g. `burner_profile` / `dietary_requirements`); `version`; `title`; `dueAt`. Question count / time estimate derive from the catalogue keyed by `actionKey` (`apps/web/lib/questionnaire.ts`). **No write here** — completion is recorded by the questionnaire runner (S26) writing its domain table, which flips `status` to `completed`.

**`broadcast_presentation` pgEnum** (`schema.ts:166-170`): `acknowledge | popup | feed` — only `acknowledge` surfaces in AckTakeover. (`popup` / `feed` handled by the notifications inbox unit, not here.)

**Feedback path touches NO Camp 404 table for writes** — GitHub Issues is the store. It READS the camp user row (`findCampUserByAuthId(user.id)?.id`) for the opaque `reporterRef` (falls back to `"unlinked"`), and the Better Auth user for the auth gate. No issue text persists locally.

**Acknowledge action input:** `{ deliveryId: uuid; userId }` → owner-scoped + presentation-scoped UPDATE sets `{ acknowledgedAt: now, readAt: now }` WHERE `id = deliveryId AND userId = userId AND presentation='acknowledge' AND acknowledgedAt IS NULL`.

**Feedback enums / constants:**
- `FeedbackKind = "bug" | "feature"` (default `"bug"`).
- `FeedbackResult = { ok:true; number; url } | { ok:false; error }`.
- `StructuredReport.severity = "critical" | "high" | "medium" | "low"`.
- `MotionPermissionResult = "granted" | "denied" | "unsupported"`.
- `DESCRIPTION_MAX=5000`, `TITLE_MAX=100`, `ISSUE_BODY_MAX=60_000`, `POLL_INTERVAL_MS=45_000`.
- Shake defaults: `threshold=8`, `requiredJolts=5`, `windowMs=800`, `cooldownMs=3000`, `SAMPLE_THROTTLE_MS=60`.
- Rate limits: burst `{limit:3}` (60s), daily `{limit:20, windowMs:86_400_000}`.
- Labels: bug→`["bug","from-app"]`, feature→`["enhancement","from-app"]`.
- AI: `MODELS.haiku ("claude-haiku-4-5-20251001")`, `max_tokens:1024`, `temperature:0`, `timeout:30_000`. GitHub `AbortSignal.timeout(8000)`.
- Env: `GITHUB_FEEDBACK_TOKEN` (required to file), `GITHUB_FEEDBACK_REPO` (override; default `RyRy79261/camp-404`), `ANTHROPIC_API_KEY` (gates AI + `aiAvailable`), `E2E_TEST_MODE`.

**NEW schema:** none. (The only redesign schema change — `captain_promotion_requests` + `promotion_request_status` — belongs to the make-captain flow, not here.)

## Validation & edge cases

- **Acknowledge POST:** `deliveryId` validated as UUID → 400; unauthenticated → 401; no-camp-access → `{ok:false}` (never queries with a synthetic empty id). Acknowledge is owner- AND presentation-scoped — a member can't dismiss others' deliveries, and a `popup`/`feed` row is never stamped even if its id is passed.
- **Pending GET:** unauthenticated → `{pending:[]}` (NOT 401 — gate mounts app-wide, incl. the public landing page); no-camp-access → `{pending:[]}`.
- **Poll de-race:** monotonic `requestIdRef` drops superseded poll responses; acknowledge bumps the ref so an in-flight poll can't re-add a just-dismissed item.
- **Body scroll lock** restores the *previous* overflow value (not hard-coded "") so a nested gate can't clobber it.
- **Submit description:** required (`.min(1)`), trimmed, `.max(5000)`; client disables Send until non-empty trimmed.
- **PII redaction (ordered, secrets-first):** Bearer tokens, JWTs, sk-/pk-/gh*/AKIA/Slack keys, token-bearing URL params, long base64 runs, t.me/wa.me links, @handles, emails, international + local phones (consuming all trailing digit groups), SA-ID/SSN, credit cards.
- **Empty-after-sanitize guard:** HTML-only / all-PII input → "" → "Please describe the issue."; no blank issue filed.
- **AI input is the sanitized text** (no PII to the model); AI output re-sanitized when the body is assembled.
- **Markdown-injection defence:** user text fenced; AI prose `mdInline`'d (defuse fences, collapse newlines); footer reporter/route `inlineCode`'d. `route` is client-supplied → treated as untrusted.
- **Title derivation:** plain = first line sliced to 100 (fallback "Bug report"/"Feature request"); AI = sanitized `s.title` to 100 (same fallback). Body capped to 60_000.
- **Rate limits in-memory + per-instance** — best-effort against a determined member (public tracker).
- **GitHub status handling:** 201→validate+return; 401→token-refresh msg; 403/404→unreachable; 410→issues off; other→generic retry; thrown (timeout/network)→retry msg.
- **Footer always present:** "Filed via the in-app reporter" (+ " (voice-dictated)" when `dictated`), `reporter: <id>`, `from: <route>` when present.
- **Shake robustness:** 5 jolts / 800ms window / 3000ms cooldown; magnitude rotation-invariant so reorientation doesn't register.
- **iOS motion permission** requested once, only after sign-in, on first pointer gesture.
- **Error boundary** correlates `error.digest` with server logs; focuses the heading for AT/keyboard users.
- **AckTakeover queue ordering** is oldest-first (server `orderBy createdAt`); always shows `queue[0]`.
- **QuestionnaireBlock vs S25:** never render both at once — if the routed S25 redirect would fire (incomplete burner profile), the overlay must not also mount. The overlay is reserved for *additional* blocking questionnaires raised after onboarding.

## Flows

- **Ack flow:** [authenticated, ack-delivery pending] → poll surfaces it → body scroll locks, takeover renders `queue[0]` → member scrolls to end → Acknowledge → POST → drop item → next item or empty → unlock + `router.refresh()`.
- **Feedback flow:** [signed in] shake → motion permission (iOS, once) → dialog opens (reset) → choose kind → type/dictate → (toggle AI) → Send → action (auth→limits→validate→sanitize→AI?→assemble→GitHub) → success view (issue link / Done) OR inline error (retry). Mid-send dismissal blocked.
- **QuestionnaireBlock flow:** [blocking questionnaire pending] overlay renders → Start → runner (S26) → on completion `required_action.status='completed'` → overlay clears. Escape only via Sign out.
- **Error flow:** uncaught render/action error → `error.tsx` swaps the segment → Try again (`reset`) re-renders / Back to camp → `/`. Root-layout failure → `global-error.tsx`. Unmatched route → `not-found.tsx`.
- **Toast flow:** a mutation succeeds → toast appears → auto-dismiss after timeout, OR Undo → reverse mutation + dismiss.

## Divergences from feature-set reference — and resolution per locked decisions

1. **QuestionnaireBlock ownership (board adds it; reference 25 omits it).** The reference unit covers only the three coded overlays (Ack, Feedback, Error). The board adds QuestionnaireBlock and Toast. **Resolution:** spec both. Per surface-guidance, assign QuestionnaireBlock here as the **app-blocking overlay variant**; the routed S25 gate keeps the onboarding-redirect ownership. Same card/copy, different trigger. Backed by `required_actions` (no schema change — decision 4/§reconciliations: the questionnaire engine already exists).
2. **Toast (board adds it; reference omits it; no `@camp404/ui` primitive).** **Resolution:** spec Toast as a NEW reusable; flag the missing primitive as a build item (likely sonner-based). Status variants map to the **new status tokens** (success/warning/info) called for in the token reconciliation (decisions §tokens) — board's `$accent` check is the success case.
3. **ShakeReporter board stub vs coded ReportBugDialog.** The board draws a compact inline card with an "Attach a screenshot of this screen" checkbox and Not now / Send report. **Resolution:** the coded `ReportBugDialog` is canonical (richer: kind toggle, voice, AI, success view) — enrich per surface-guidance. **The screenshot-attach checkbox is NOT in the code** (the reference notes the screenshot/diagnostics capture was intentionally dropped from the intake-tracker port). Treat the board's checkbox as **dropped** — see open questions.
4. **Error boundary copy/styling (board: mono "404 — that wasn't supposed to happen", `ERR_RENDER · trace 8f3a2` code chip, `triangle-alert`, Report + Reload; code: "Something went sideways.", Try again + Back to camp, no code chip).** **Resolution:** keep the code's recovery actions (`reset` + home) and accessibility (focus-to-heading). **Adopt the board's mono trace-code chip** (surface `error.digest` as the trace — useful for "shake to report") and consider the board's "Report" action wiring straight into ReportBugDialog. JetBrains Mono for the trace code is consistent with the data-console motif (decision 2). Reconcile final copy with the brand voice already in code.
5. **Voice in the dialog.** Board ShakeReporter has no voice; code has "Dictate instead" → RecorderPanel. **Resolution:** keep voice — matches decision 5 (field-level dictation on the bug dialog via DictatePill → RecorderPanel). The dialog uses the RecorderPanel directly (its own button), consistent with the decision.
6. **AckTakeover width.** Board column is 430px; code uses `max-w-2xl`. **Resolution:** keep `max-w-2xl` — a deliberate exception for a long-read announcement (documented), not a drift.

## Open questions / build reconciliations

- **Screenshot attachment:** the board's "Attach a screenshot of this screen" checkbox has no code backing and was intentionally dropped from the intake-tracker port (no diagnostics capture). Confirm: drop it (current resolution) or add screen-capture to the feedback payload (would change the GitHub POST + add an upload path). Defaulting to **dropped**.
- **Error-boundary "Report" action:** the board offers a Report button on the error card. Wire it to open `ReportBugDialog` pre-filled with the trace digest? (Requires the boundary to reach the app-wide FeedbackGate, which only mounts on success paths — the error boundary may need its own lightweight reporter entry.) Flag for build.
- **Toast infrastructure:** no toast/sonner primitive exists in `@camp404/ui`. Confirm sonner vs a bespoke component, the status-token set (success/warning/info/error), default timeout, and which mutations emit toasts (the board only shows a "Saved./Undo" example). Flag as new build.
- **QuestionnaireBlock trigger source:** confirm the overlay should mount client-side off a pending blocking `required_action` (analogous to AckTakeover polling) vs a server-rendered gate. If polled, it needs a pending-actions endpoint mirroring `/api/notifications/pending`. Flag for build (decisions §questionnaire-trio: sequential unlock is app logic, no schema change).
- **`popup` presentation:** the third `broadcast_presentation` value (`popup`) is a transient pop-up — is that the same surface as Toast, or a distinct notification toast owned by the notifications unit? It is referenced in `lib/notifications.ts` / the announcements manager but has no overlay here. Flag ownership.
- **Toast token:** board uses `$popover`/`$accent`; reconcile to the new status tokens per decisions §tokens rather than hard-coding the success-green/`$accent`.
