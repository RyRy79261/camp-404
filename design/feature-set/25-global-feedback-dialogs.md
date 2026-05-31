# 25 — Global dialogs & feedback (ack-gate, shake-to-report, error)

**Files covered:**
- `apps/web/app/acknowledgement-gate.tsx` — full-screen takeover overlay that polls for and clears the signed-in member's unacknowledged `presentation='acknowledge'` notification deliveries.
- `apps/web/app/feedback-gate.tsx` — invisible mount that wires shake detection (live-session gated) to open the bug/feature dialog; requests iOS motion permission.
- `apps/web/components/feedback/report-bug-dialog.tsx` — the bug/feature report modal (kind toggle, description, voice dictation, optional AI restructure, submit/success/error states).
- `apps/web/components/feedback/use-shake-gesture.ts` — pure shake-detection state machine + React hook + iOS motion-permission helpers.
- `apps/web/app/feedback/actions.ts` — `submitFeedbackAction` server action: auth gate, rate limits, validation, sanitization, optional AI, GitHub issue POST, typed result.
- `apps/web/lib/feedback-ai.ts` — `structureWithAi` optional Claude pass that restructures a raw report into a structured issue (fail-safe → null).
- `apps/web/lib/github-feedback.ts` — pure helpers: PII redaction, sanitization, Markdown-safe escaping, label selection, issue title/body assembly.
- `apps/web/app/error.tsx` — Next.js route-segment error boundary with retry + "back to camp" escape.

Supporting imports read for accuracy: `apps/web/app/layout.tsx` (mount point + `aiAvailable` prop), `apps/web/app/api/notifications/pending/route.ts`, `apps/web/app/api/notifications/acknowledge/route.ts`, `apps/web/lib/rate-limit.ts`, `apps/web/lib/anthropic.ts`, `apps/web/components/voice/recorder-panel.tsx`, `apps/web/lib/notifications.ts`, `packages/db/src/broadcasts.ts`, `packages/db/src/schema.ts`.

**Purpose:** Three globally-mounted overlays/surfaces that sit above the whole app shell. (1) The **AcknowledgementGate** is a full-screen modal takeover that forces the signed-in member to read and explicitly acknowledge each `presentation='acknowledge'` announcement before it dismisses, polling continuously so newly-published announcements interrupt promptly. (2) The **FeedbackGate / ReportBugDialog** is a shake-triggered bug/feature reporter that, after optional AI restructuring and mandatory PII redaction, files a GitHub issue on a public tracker (no DB write). (3) The **route error boundary** catches uncaught render/server-action errors and keeps the user inside the shell with a retry or a home escape. All three are mounted once in the root layout (the first two as siblings in `app/layout.tsx:52-55`) and self-gate on auth/session so they do nothing for logged-out visitors.

## Features

### AcknowledgementGate (acknowledgement-gate.tsx)
- Mounted once in the root layout (`layout.tsx:52`); renders `null` on every page until a pending item exists (`acknowledgement-gate.tsx:83`).
- Polls `GET /api/notifications/pending` (`cache: "no-store"`) for the signed-in member's unacknowledged `acknowledge` deliveries (`:40-42`). Loads on mount, on a `POLL_INTERVAL_MS = 45_000` interval (`:26`, `:56`), AND on tab `visibilitychange`→visible and window `focus` (`:57-61`) so a freshly-published announcement surfaces promptly.
- **Monotonic request token** (`requestIdRef`, `:35`): overlapping polls (interval vs. focus) are de-raced — only the latest request applies its result; a superseded older response is dropped (`:38`, `:45`).
- Renders a queue (`PendingItem[]`); always shows `queue[0]` = `current` (`:69`). Oldest-first ordering comes from the server query (`broadcasts.ts:428`, `orderBy createdAt`).
- **Body scroll lock**: while `current` exists, sets `document.body.style.overflow = "hidden"` and restores the previous value on unmount/change (`:73-81`); also resets the modal scroll position to top whenever a new notification surfaces (`:77`).
- Header shows a `Megaphone` icon + uppercase label "Camp announcement" (`:117-120`), the title (`current.title`, `:124`), and a meta line: `From {senderName} · {localized createdAt}` — the "From …" prefix is omitted when `senderName` is null (`:126-129`). `createdAt` is formatted with `new Date(...).toLocaleString()` (`:128`).
- Body rendered with `whitespace-pre-wrap` (preserves the announcement's line breaks) (`:131-133`).
- **Acknowledge button sits at the END of the scroll, not pinned** — the member must scroll the whole message to reach it (`:135-153`). When `queue.length > 1`, a "{queue.length - 1} more after this." line is shown above the button (`:138-142`).
- On acknowledge: `POST /api/notifications/acknowledge` with `{ deliveryId }` (`:88-92`); on `res.ok`, bumps `requestIdRef.current++` so any in-flight poll can't re-add the just-dismissed item (`:95`), removes the item from the queue revealing the next (`:97`), and calls `router.refresh()` so server components (e.g. unread badge / inbox) reflect it (`:99`). On a non-ok response it silently returns (no item removed) (`:93`).

### FeedbackGate (feedback-gate.tsx)
- Mounted once in the root layout, sibling to AcknowledgementGate (`layout.tsx:55`), receiving `aiAvailable={!!process.env.ANTHROPIC_API_KEY}` — a server-only env check passed down to gate the "Improve with AI" toggle (`layout.tsx:55`, `feedback-gate.tsx:22`).
- **Live-session gate**: reads `authClient.useSession()`; `signedIn = !isPending && !!session` (`:23-24`). Shake listener is attached only while `signedIn && !open`; it detaches immediately on sign-out (`:27`). Renders `null` (no dialog at all) when not signed in (`:41`). The server action enforces auth too as defence in depth (`:18-21` comment).
- **Shake is the only trigger** (no floating button) — matches RyRy79261/intake-tracker's ShakeToReport (`:14-15` comment).
- Shake detection pauses while the dialog is open (`!open` in the `enabled` predicate, `:27`).
- **iOS 13+ motion permission**: when `signedIn && motionPermissionNeeded()`, registers a one-time `pointerdown` listener that calls `requestMotionPermission()` on the first user gesture (`:32-39`).
- Renders `<ReportBugDialog open onOpenChange aiAvailable />` (`:43-49`).

### ReportBugDialog (report-bug-dialog.tsx)
- Bug/feature report modal. **Files a GitHub issue via the server action — nothing is stored in our DB** (`:40-41` comment).
- **Kind toggle**: two buttons, Bug (`Bug` icon) and Feature (`Lightbulb` icon); selected kind uses `variant="default"`, the other `variant="outline"`; `aria-pressed` reflects selection; `role="group" aria-label="Report type"` (`:162-189`).
- **Title/description copy is kind-dependent**: title "Report a bug" / "Request a feature" (`:151-153`); label "What went wrong?" / "What would you like to see?" (`:194-196`); placeholder "What you did, what you expected, and what happened instead." / "Describe the capability or improvement you have in mind." (`:204-208`).
- **Description textarea**: `rows={6}`, `maxLength={DESCRIPTION_MAX}` (= 5000) (`:198-209`).
- **Voice dictation**: a "Dictate instead" button (`Mic` icon) swaps in a `RecorderPanel` (the shared voice pipeline) (`:213-232`). Transcripts are APPENDED to the description via `appendTranscript` (`:75-83`): trims, ignores empty, sets `dictated=true`, joins with a newline only if the existing text doesn't already end in whitespace/newline, and re-clamps the combined text to `DESCRIPTION_MAX` (`:79-82`). No `promptKey` is passed — dictation runs with the generic, unbiased transcription (`:215-217` comment).
- **"Improve with AI" checkbox**: rendered ONLY when `aiAvailable` (`:235`). Default-checked (`useAi` initialises `true`, `:56`). Helper copy: "Improve with AI" / "Restructures your report into a clear title and steps before filing." (`:246-250`).
- **Submit** (`Send report`): calls `submitFeedbackAction({ kind, description, dictated, useAi: aiAvailable && useAi, route: window.location.pathname })` inside a transition (`:85-106`). The effective `useAi` is forced false when AI is unavailable (`:93`).
- **Success view**: replaces the form. Shows `CheckCircle2` + "Report filed"; description is `Issue #{number} was created on GitHub. Thanks!` when `number > 0`, else "Thanks — your report was sent." (`:122-133`). A link (`ExternalLink` icon) opens `result.url` in a new tab labelled `View issue #{number}` (or "Open the tracker" when `number ≤ 0`) (`:135-143`). A "Done" button closes (`:144-146`).
- **Form reset** on every closed→open transition (`:64-73`): resets kind→defaultKind, description→"", dictating→false, dictated→false, useAi→true, error→null, result→null.
- **Mid-send dismissal guard**: Escape / outside-click / X cannot close the dialog while `isPending` (the `onOpenChange` wrapper returns early) (`:111-119`); Cancel is also `disabled` while pending (`:269`).

### use-shake-gesture.ts (use-shake-gesture.ts)
- `motionPermissionNeeded()`: true only on browsers (iOS 13+) where `DeviceMotionEvent.requestPermission` is a function (`:21-32`).
- `requestMotionPermission()`: returns `"granted" | "denied" | "unsupported"`; on non-iOS (`requestPermission` absent) returns `"granted"`; catches a rejected prompt as `"denied"` (`:34-52`).
- `createShakeDetector(config)`: pure, DOM-free state machine (`:87-115`). For each sample it computes the **acceleration magnitude** `√(x²+y²+z²)` (`:76-80`), which is rotation-invariant so tilting (redistributing gravity, magnitude ≈ 9.8) does not register — only real movement does (`:62-66` comment). When `|mag − lastMag| > threshold` it records a jolt timestamp (`:96-97`). Jolts older than `windowMs` are pruned (`:101`). A shake fires when `jolts.length >= requiredJolts` AND `now − lastShakeAt >= cooldownMs` (`>=` is inclusive, matching the `<=` window boundary) (`:102-111`); on fire it stamps `lastShakeAt`, clears jolts, returns true.
- `useShakeGesture({ enabled, onShake, … })`: attaches a `devicemotion` listener while `enabled` (`:144-171`). Reads `event.accelerationIncludingGravity`; bails if any axis is null (`:157-158`). Throttles samples to one per `SAMPLE_THROTTLE_MS = 60` (`:153`, `:161-162`). Uses an `onShakeRef` so a changing callback doesn't re-bind the listener (`:141-142`).

### submitFeedbackAction (feedback/actions.ts)
- `"use server"` action; sole entry for filing feedback. Returns `FeedbackResult` (a discriminated union, see Enums).
- **Auth gate**: `getAuthenticatedUser()`; if absent → `{ ok:false, error:"Please sign in to send feedback." }` (`:50-51`).
- **Rate limits** (in-memory, per-process; best-effort) (`:54-72`): burst `feedback:{user.id}` at `{ limit: 3 }` (default 60s window) → "You're sending these quickly — give it a minute and try again."; daily `feedback-day:{user.id}` at `{ limit: 20, windowMs: 86_400_000 }` → "You've filed a lot of reports today — please try again tomorrow."
- **Input validation** via `InputSchema.safeParse`; on failure returns the first Zod issue message or "Invalid input." (`:74-80`).
- **Sanitize once** (`sanitizeReportText(description, DESCRIPTION_MAX)`): if empty after PII/HTML stripping → "Please describe the issue." (so a blank/HTML-only issue is never filed); the clean text is reused as the AI input so no PII reaches the model (`:83-89`).
- **Opaque reporter reference**: `findCampUserByAuthId(user.id)?.id`; for a signed-in user with no camp row yet (pre-invite) uses the sentinel string `"unlinked"` rather than the raw, more-linkable auth id (`:91-95`).
- **E2E bypass**: under `isE2ETestMode()` returns `{ ok:true, number:0, url:"https://github.com/RyRy79261/camp-404/issues" }` without calling AI or GitHub — exercises auth + validation only (`:97-100`).
- **Optional AI restructure**: `useAi ? structureWithAi(kind, sanitized) : null`; null on any failure → plain body (`:102-103`).
- **Issue assembly**: `buildFeedbackIssue({ kind, description: sanitized, dictated ?? false, reporterRef, route, structured })` (`:105-112`).
- **Config gates**: missing `GITHUB_FEEDBACK_TOKEN` → "Feedback isn't set up yet. Let a camp captain know." (`:114-121`). `GITHUB_FEEDBACK_REPO` (default `RyRy79261/camp-404`) must split on `/` into exactly 2 non-empty segments else "Feedback isn't configured correctly. Let a camp captain know." (`:123-132`).
- **GitHub POST**: `POST https://api.github.com/repos/{owner}/{name}/issues` with `Authorization: Bearer {token}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: camp-404-feedback`; body `{ title, body, labels }`; bounded by `AbortSignal.timeout(8000)` (`:134-155`).
- **Response handling** (`:157-188`): `201` → validate against `GithubIssueSchema` ({ number, html_url url }); on validate failure → "Your report was filed, but we couldn't read GitHub's reply."; on success → `{ ok:true, number, url:html_url }`. Status-specific errors: `401` → "GitHub rejected the token — a captain needs to refresh it."; `403`/`404` → "The feedback tracker is unreachable right now."; `410` → "Issues are turned off on the tracker repo."; any other → "Couldn't file your report just now. Please try again."; a thrown error (timeout/network) → "Couldn't reach the feedback tracker. Please try again."

### structureWithAi (lib/feedback-ai.ts)
- Optional "Improve with AI" pass; restructures a (already-sanitized) raw report into a structured issue. **Additive and fail-safe — any problem returns `null` and the caller files the plain template** (`:7-12` comment).
- Calls `anthropic().messages.create` with `model: MODELS.haiku` (`"claude-haiku-4-5-20251001"`), `max_tokens: 1024`, `temperature: 0`, the `SYSTEM_PROMPT`, a single `format_report` tool, forced `tool_choice: { type:"tool", name:"format_report" }`, request `{ timeout: 30_000 }` (`:76-92`).
- Extracts the `tool_use` block named `format_report`; if absent → null (`:94-97`). Validates the tool input against `StructuredSchema`; returns the parsed data or null (`:99-100`). Any thrown error is logged and returns null (`:101-104`).
- `SYSTEM_PROMPT` rules (verbatim, `:56-65`): faithful to the user's report (never invent steps/symptoms/facts); concise specific title (not "App is broken"); for a bug extract steps/expected/actual only if provided (leave empty otherwise, don't guess); for a feature put the request in summary and leave steps/expected/actual empty; severity is a rough triage hint (crash/data-loss = critical or high); leave PII placeholders like `[email]`/`[redacted]` as-is; always call the `format_report` tool, never reply with prose only.

### github-feedback.ts (lib/github-feedback.ts)
- Pure, I/O-free helpers (the action does the fetch) so they stay unit-testable (`:1-2` comment). Repo is PUBLIC, so issue bodies are world-readable: every free-text piece is PII-redacted and a reporter's name/email is never put in the body — only the opaque camp user id (`:3-7` comment).
- `labelsFor(kind)`: bug → `["bug","from-app"]`; feature → `["enhancement","from-app"]`. `from-app` marks provenance; missing labels auto-created by the issues API (`:25-32`).
- `redactPii(input)`: see Validation section for the full pattern list.
- `sanitizeReportText(text, maxLength)`: `redactPii` → strip HTML tags `<[^>]*>` → trim → `slice(0, maxLength)`; empty input returns "" (`:79-85`).
- `buildFeedbackIssue(input)`: assembles `{ title, body, labels }`. Footer is a PII-free provenance line; body sections come from `plainParts` or `structuredParts`; final body is `[...sections, "---", footer].join("\n\n").slice(0, ISSUE_BODY_MAX)` (`:178-200`). Markdown-escaping helpers: `fenced` (code-fence + defuse ``` ``` ``` → `''' `), `inlineCode` (strip backticks + collapse newlines, for footer reporter/route), `mdInline` (defuse fences + collapse newlines, for AI prose) (`:87-111`).

### Error boundary (app/error.tsx)
- Default-exported Next.js route-segment error boundary catching uncaught errors thrown while rendering a page or running a server action in the app tree (`:6-11` comment). Receives `{ error: Error & { digest?: string }, reset }` (`:11-17`).
- On error: `console.error(error)` for diagnostics (the digest correlates with the server log) and moves focus to the heading (`tabIndex={-1}`) so SR/keyboard users are told the segment swapped to an error state (`:19-26`).
- Renders a centered card: heading "Something went sideways.", body "An unexpected error tripped us up. Try again — if it keeps happening, let a camp captain know." (`:31-41`), and two actions: "Try again" (`onClick={reset}` re-renders the failed segment) and an outline "Back to camp" link to `/` (`:43-48`).

## User actions & interactions
- **Acknowledge an announcement** — scroll the full-screen takeover to its end, press "Acknowledge"; dismisses the current item and reveals the next (AcknowledgementGate).
- **Open the bug/feature reporter** — physically shake the device (only trigger; only while signed in and the dialog isn't already open).
- **Grant motion permission** — (iOS 13+) the first `pointerdown` after sign-in silently triggers the OS motion-permission prompt.
- **Toggle report kind** — tap Bug or Feature.
- **Type the description** — into the textarea (max 5000 chars).
- **Dictate** — tap "Dictate instead" → record via RecorderPanel; transcript appends to the description; panel stays open for another recording until dismissed.
- **Toggle "Improve with AI"** — checkbox (only when the server has a Claude key; default on).
- **Send report** — files the GitHub issue; button shows a spinner + "Sending…" while pending.
- **Cancel** — closes the dialog (disabled while sending).
- **View filed issue / Done** — from the success view, open the GitHub issue in a new tab, or press Done to close.
- **Retry after error / go home** — on the error boundary, press "Try again" (re-render) or "Back to camp" (navigate to `/`).

## States & presentations
Global-states rows that apply to this unit:
- **Empty** — AcknowledgementGate renders `null` when the pending queue is empty (the common case, including all unauthenticated pages). ReportBugDialog: the description starts empty; submit disabled.
- **Loading** — AcknowledgementGate has no spinner for the initial poll (it simply shows nothing until data arrives). FeedbackGate during `authClient.useSession()` `isPending` treats the user as not-signed-in (renders nothing). RecorderPanel has `requesting` ("Allow microphone…") and `processing` ("Transcribing…") busy states.
- **Populated** — AcknowledgementGate shows `queue[0]` with title/sender/body and "{n} more after this." when queue length > 1. ReportBugDialog shows the full form.
- **Validation-error** — server action returns the first Zod message ("Please describe the issue." for empty, etc.); textarea also enforces `maxLength`; submit button disabled until `description.trim().length > 0`. The acknowledge POST validates `deliveryId` as a UUID (400 on failure).
- **Submitting/pending** — Acknowledge button shows a `Loader2` spinner and is `disabled` while `acking`. ReportBugDialog: `Send report` → spinner + "Sending…"; Cancel disabled; dialog cannot be dismissed by Escape/outside-click/X mid-send.
- **Success** — ReportBugDialog swaps to the "Report filed" view with issue number + link. Acknowledge success removes the item and refreshes server components.
- **Disabled** — submit disabled when description is empty or pending; Cancel disabled while pending; RecorderPanel close/record buttons disabled while recording/busy.
- **Invite-gated / pre-invite** — `submitFeedbackAction` still works for a signed-in user with no camp row, using the `"unlinked"` reporter sentinel. The pending-acknowledgements route returns an empty list for a signed-in user without camp access (`hasCampAccess` false → no deliveries to query).
- **Onboarding-incomplete / pending-approval / rejected** — not specifically gated here; the gates self-gate only on auth/session, so a signed-in member at any onboarding stage can still receive acknowledge takeovers and file feedback (subject to camp-access for the ack queue).
- **Captain-only-locked** — not applicable; both surfaces are member-level.
- **AI-unavailable** — when `aiAvailable` is false the "Improve with AI" checkbox is not rendered and `useAi` is forced false in the submit call.
- **Config-error** — missing GitHub token / misconfigured repo surface as inline `{ok:false}` error banners.
- **Error boundary** — full-screen error state with retry + home escape; focus moved to heading.
- **RecorderPanel sub-states** — `requesting`, `recording` (timer mm:ss + waveform + Stop button), `processing`, `error` ("Tap to retry"), idle ("Tap to record").

## Enums, options & configurable values
- `FeedbackKind = "bug" | "feature"` (`github-feedback.ts:9`); default in dialog is `"bug"` (`report-bug-dialog.tsx:49`).
- `FeedbackResult = { ok:true; number:number; url:string } | { ok:false; error:string }` (`actions.ts:15-17`).
- `StructuredReport.severity` enum: `"critical" | "high" | "medium" | "low"` (`github-feedback.ts:18`, `feedback-ai.ts:20`).
- `AnnouncementPresentation` / `broadcast_presentation` pgEnum: `"acknowledge" | "popup" | "feed"` — only `"acknowledge"` deliveries surface in the gate (`schema.ts:166-170`).
- `DESCRIPTION_MAX = 5000` (`github-feedback.ts:21`).
- `TITLE_MAX = 100` (private, `github-feedback.ts:22`).
- `ISSUE_BODY_MAX = 60_000` (GitHub hard limit is 65536) (`github-feedback.ts:23`).
- `POLL_INTERVAL_MS = 45_000` (`acknowledgement-gate.tsx:26`).
- Shake hook defaults: `threshold = 8`, `requiredJolts = 5`, `windowMs = 800`, `cooldownMs = 3000` (`use-shake-gesture.ts:134-139`); `SAMPLE_THROTTLE_MS = 60` (`:153`).
- Rate limits: burst `{ limit: 3 }` (default 60_000ms window), daily `{ limit: 20, windowMs: 86_400_000 }` (`actions.ts:56`, `:63-66`); `rate-limit.ts` default window 60_000.
- `DEFAULT_REPO = "RyRy79261/camp-404"` (`actions.ts:32`); overridable via `GITHUB_FEEDBACK_REPO` env.
- Env vars: `GITHUB_FEEDBACK_TOKEN` (required to file), `GITHUB_FEEDBACK_REPO` (optional override), `ANTHROPIC_API_KEY` (gates AI + `aiAvailable`), `E2E_TEST_MODE` (`="1"` bypasses AI+GitHub).
- AI model: `MODELS.haiku = "claude-haiku-4-5-20251001"`, `max_tokens: 1024`, `temperature: 0`, request `timeout: 30_000` (`feedback-ai.ts`, `anthropic.ts:18-21`).
- GitHub request timeout: `AbortSignal.timeout(8000)` (`actions.ts:141`).
- StructuredSchema bounds: `title` 1–140, `summary` 1–2000, `stepsToReproduce` array of ≤500-char strings, max 20 items, `expected`/`actual` ≤1000 (`feedback-ai.ts:14-21`). (Note: body assembly re-clamps summary to 2000, steps to 500, expected/actual to 1000, title to `TITLE_MAX=100` — `github-feedback.ts:147-169`.)
- InputSchema: `route` `z.string().max(300).optional()` (`actions.ts:27`).
- MotionPermissionResult: `"granted" | "denied" | "unsupported"` (`use-shake-gesture.ts:14`).
- Issue labels: `["bug","from-app"]` / `["enhancement","from-app"]` (`github-feedback.ts:28-32`).
- GitHub headers: `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: camp-404-feedback` (`actions.ts:144-147`).

## Data model touched
**Reads / writes** `notification_deliveries` (`packages/db/src/schema.ts:830-863`) — the acknowledge gate's data source:
- `id` (uuid, PK) → exposed as `deliveryId`.
- `broadcastId` (uuid → broadcasts.id, on delete cascade) — joined to fetch sender.
- `userId` (uuid → users.id, on delete cascade) — the recipient; scopes every query.
- `title` (text, not null), `body` (text, not null) — shown in the takeover.
- `channel` (notification_channel enum, not null) — not surfaced by the gate.
- `presentation` (broadcast_presentation enum, not null, default `"feed"`) — gate filters to `"acknowledge"`.
- `pushStatus`, `refType`, `refId`, `deliveredAt` — untouched here.
- `readAt` (timestamp, nullable) — set to `now` on acknowledge.
- `acknowledgedAt` (timestamp, nullable) — gate surfaces rows where this is NULL; set to `now` on acknowledge.
- `createdAt` (timestamp, not null, default now) — order key + meta line.
- Indexes used: `notification_deliveries_user_ack_idx` on `(userId, acknowledgedAt)` (the gate's exact predicate), `notification_deliveries_user_read_idx`, `notification_deliveries_broadcast_idx` (`schema.ts:864-877`).

**Reads** `broadcasts` (left join via `broadcastId`) and `users` (left join via `broadcasts.senderId`) — only `users.displayName` is read, exposed as `senderName` (nullable) (`broadcasts.ts:412`, `:416-420`).

`PendingAcknowledgement` interface (DB layer): `{ deliveryId: string; title: string; body: string; senderName: string | null; createdAt: Date }` (`broadcasts.ts:390-396`). The client mirrors it as `PendingItem` but types `createdAt` as `string` (serialized over JSON) (`acknowledgement-gate.tsx:18-24`).

**Feedback path touches NO Camp 404 table for writes** — GitHub Issues is the store (`actions.ts:42-45` comment). It only READS the camp user row via `findCampUserByAuthId(user.id)` to obtain the opaque `id` as `reporterRef` (falls back to `"unlinked"`). The Better Auth user (`user.id`, `user.primaryEmail`) is read for the auth gate. No `StructuredReport` or issue text persists locally.

Acknowledge action input: `{ deliveryId: string (uuid); userId: string }` → `acknowledgeDelivery` UPDATE sets `{ acknowledgedAt: now, readAt: now }` WHERE `id = deliveryId AND userId = userId AND presentation = 'acknowledge' AND acknowledgedAt IS NULL`; returns whether a row was affected (`broadcasts.ts:437-458`).

## Validation, edge cases & business rules
- **Acknowledge POST**: `Body = z.object({ deliveryId: z.string().uuid() })` → 400 on invalid; unauthenticated → 401; no-camp-access → `{ ok:false }` (never queries with the synthetic empty id, which would 500 on a real DB) (`acknowledge/route.ts`).
- **Pending GET**: unauthenticated → `{ pending: [] }` (NOT 401 — the gate mounts app-wide including the public landing page); no-camp-access → `{ pending: [] }` for the same synthetic-id reason (`pending/route.ts`).
- **Acknowledge query scoping**: `acknowledgeDelivery` is owner-scoped AND presentation-scoped — a member can only dismiss their own deliveries, and a `popup`/`feed` delivery is never stamped acknowledged even if its id is passed (`broadcasts.ts:447-453`).
- **Poll de-race**: monotonic `requestIdRef` drops superseded poll responses; acknowledge bumps the same ref so an in-flight poll can't re-add a just-dismissed item (`acknowledgement-gate.tsx:38,45,95`).
- **Submit description**: required (`.min(1, "Please describe the issue.")`), trimmed, `.max(5000)`; the client also disables submit until non-empty trimmed (`actions.ts:21-26`, `report-bug-dialog.tsx:108`).
- **PII redaction (`redactPii`, ordered, github-feedback.ts:39-76)** — secrets first, then identifiers:
  - `Bearer <token>` → `Bearer [token]`; JWT `eyJ…` → `[jwt]`.
  - `sk-`/`pk-` keys (≥16) → `[secret]`; GitHub `gh[posu]_…` (≥20) → `[secret]`; AWS `AKIA…` (16) → `[secret]`; Slack `xox[baprs]-…` (≥10) → `[secret]`.
  - token-bearing URL params (`token|key|secret|sig|signature|password|access_token|code|auth`=) → `=…[redacted]`.
  - long opaque base64-ish runs (40+ chars) → `[redacted]`.
  - `t.me/`/`wa.me/` links → `[link]`; `@handle` (≥2) → `[handle]`.
  - email → `[email]`; international phone `+…` (consuming ALL trailing digit groups so the last group can't leak) → `[phone]`; local phone `123-456-7890` → `[phone]`.
  - 13-digit SA-ID run → `[id]`; SSN-like `\d{3}-\d{2}-\d{4}` → `[id]`; credit-card 16-digit group → `[card]`.
- **Empty-after-sanitize guard**: HTML-only or all-PII input becomes "" after sanitization → action returns "Please describe the issue."; no blank issue is filed (`actions.ts:86-89`).
- **AI input is the sanitized text**, not raw — no PII reaches the model; AI output is re-sanitized again when the body is assembled (the model can echo PII) (`actions.ts:85-86`, `github-feedback.ts:147,151`).
- **Markdown injection defence**: user/AI text is fenced (`fenced`), AI prose is `mdInline`'d (defuse fences + collapse newlines so it can't inject headings/blockquotes/lists), footer reporter/route are `inlineCode`'d (strip backticks so the inline-code span can't be broken out of) — `route` is client-supplied and treated as untrusted (`github-feedback.ts:87-111`, `:179-189`).
- **Title derivation (plain)**: first line of the sanitized description, sliced to 100 chars; falls back to "Bug report"/"Feature request" if empty (`github-feedback.ts:138-143`, `:133-135`).
- **Title derivation (AI)**: `sanitizeReportText(s.title, 100)` or the same fallback (`github-feedback.ts:152`).
- **Body cap**: final body sliced to `ISSUE_BODY_MAX = 60_000` (`github-feedback.ts:197`).
- **Rate limits are in-memory + per-instance** — best-effort against a determined member; the daily cap is a cheap second check because the destination is a public tracker (`actions.ts:54-55` comment).
- **GitHub timeout**: 8s `AbortSignal`; `structureWithAi` timeout 30s — a stalled GitHub or AI call can't hang the action (timeout maps to a retry message / null) (`actions.ts:141`, `feedback-ai.ts:91`).
- **Footer always present**: "Filed via the in-app reporter" (+ " (voice-dictated)" when `dictated`), `reporter: <id>`, and `from: <route>` when route present, joined with " · " (`github-feedback.ts:183-189`).
- **Shake robustness**: requires 5 jolts within an 800ms window with a 3000ms cooldown so a single bump or a phone settling into a pocket doesn't open the dialog; magnitude is rotation-invariant so reorientation doesn't register (`use-shake-gesture.ts:135-139`, `:62-66`).
- **iOS motion permission** is requested only once, only after sign-in, on the first pointer gesture (`feedback-gate.tsx:32-39`).
- **Body scroll lock** is restored to the previous value (not hard-coded to "") so a nested gate wouldn't clobber it (`acknowledgement-gate.tsx:75,79`).
- **Error boundary** correlates `error.digest` with server logs and focuses the heading for accessibility (`error.tsx:21-25`).

## Sub-components / variants
- **AcknowledgementGate** — single overlay; `role="dialog" aria-modal="true" aria-labelledby="ack-title"`, `z-[100]`, `max-w-2xl` scroll column (note: wider than the app's `max-w-lg` shell — this surface intentionally uses `max-w-2xl`).
- **FeedbackGate** — headless wrapper; renders only `ReportBugDialog` or `null`. Exposes the `aiAvailable` prop. Comment notes a previously-removed floating button — shake is now the ONLY trigger (`feedback-gate.tsx:13-15`).
- **ReportBugDialog** — two render branches by state: the **form view** and the **success view** (`result`). Accepts an unused-by-FeedbackGate `defaultKind?` prop (defaults `"bug"`; FeedbackGate never overrides it, so the dialog always opens on Bug). `aiAvailable?` defaults false.
- **RecorderPanel** (shared voice primitive, `components/voice/recorder-panel.tsx`) — embedded for dictation; states `requesting`/`recording`/`processing`/`error`/idle; big circular record button (`Mic`/`Square`/`Loader2`), `Waveform`, mm:ss timer; appends transcripts; invoked WITHOUT a `promptKey` (generic transcription). Detailed in the voice-pipeline unit; here it is a consumer.
- **use-shake-gesture.ts** exports: `motionPermissionNeeded`, `requestMotionPermission`, `createShakeDetector` (pure, unit-testable), `useShakeGesture`, and types `MotionPermissionResult`, `ShakeSample`, `ShakeDetectorConfig`, `UseShakeGestureOptions`.
- **submitFeedbackAction** — server action; validators/schemas: `InputSchema` (input), `GithubIssueSchema` (GitHub 201 response).
- **structureWithAi** — server-only; schema `StructuredSchema`, tool definition `FORMAT_TOOL` (name `"format_report"`, required `["title","summary"]`), `SYSTEM_PROMPT`.
- **github-feedback.ts** — pure functions: exported `labelsFor`, `redactPii`, `sanitizeReportText`, `buildFeedbackIssue`; private `fenced`, `inlineCode`, `mdInline`, `fallbackTitle`, `plainParts`, `structuredParts`; interfaces `StructuredReport`, `BuildIssueInput`, `BuiltIssue`; type `FeedbackKind`.
- **error.tsx** — default-exported client `Error` component (Next.js error-boundary contract: `{ error, reset }`).
- No dead/orphaned variants found in this unit. Note one minor truth: `MODELS.opus` exists in `anthropic.ts` but this unit uses only `MODELS.haiku`.
