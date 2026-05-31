# 24 — App shell, layout & global chrome

**Files covered:**
- `apps/web/app/layout.tsx` — Root layout: `<html>`/`<body>` shell, site metadata + viewport/theme-color, mounts `Providers`, `AcknowledgementGate`, `FeedbackGate`.
- `apps/web/app/providers.tsx` — Client provider wrapper: `NeonAuthUIProvider` wiring router navigation + session-change refresh + theme.
- `apps/web/app/manifest.ts` — PWA / Android web-app manifest (`/manifest.webmanifest`).
- `apps/web/lib/og-image.tsx` — Shared `next/og` (Satori) renderer for the social share card + square app icons (glitched "404" mark).
- `apps/web/app/opengraph-image.tsx` — File-based OG image route delegating to `renderShareImage()`.
- `apps/web/app/twitter-image.tsx` — File-based Twitter (`summary_large_image`) route delegating to `renderShareImage()`.
- `apps/web/app/apple-icon.tsx` — File-based 180×180 Apple touch icon route delegating to `renderSquareIcon(180)`.
- `apps/web/app/icon.svg` — Static browser-tab favicon (inline glitched-404 SVG).
- `apps/web/app/not-found.tsx` — 404 page rendered inside the shell for unmatched routes / `notFound()`.
- `apps/web/app/error.tsx` — Route-segment error boundary (retry / home), inside the shell.
- `apps/web/app/global-error.tsx` — Last-resort error boundary that REPLACES the root layout (own `<html>`/`<body>`, inline-styled).
- `apps/web/app/acknowledgement-gate.tsx` — Full-screen takeover gate for `presentation='acknowledge'` notifications; polls + acknowledges.
- `apps/web/app/feedback-gate.tsx` — Shake-to-report gate; mounts `ReportBugDialog` while signed in.
- `apps/web/app/firebase-messaging-sw.js/route.ts` — Route handler that serves the FCM background service worker at `/firebase-messaging-sw.js`, env-interpolated.
- `apps/web/instrumentation.ts` — Boot-time server hook calling `assertServerEnv()` (fail-fast on missing secrets).
- `apps/web/lib/env.ts` — `assertServerEnv()`: validates required server env vars at boot.
- Supporting (followed imports, cited where load-bearing): `apps/web/components/feedback/use-shake-gesture.ts`, `apps/web/components/feedback/report-bug-dialog.tsx`, `apps/web/app/feedback/actions.ts`, `apps/web/lib/github-feedback.ts`, `apps/web/app/api/notifications/pending/route.ts`, `apps/web/app/api/notifications/acknowledge/route.ts`, `apps/web/lib/notifications.ts`, `packages/db/src/broadcasts.ts`, `packages/db/src/schema.ts`, `apps/web/lib/auth-client.ts`, `apps/web/lib/rate-limit.ts`, `packages/ui/src/styles/globals.css`.

**Purpose:** This unit is the always-present skeleton every Camp 404 page renders inside: the root HTML/body shell with its dark-only theme contract, site-wide metadata (title/description/OG/Twitter/icons/PWA manifest), the OKLCH-matched brand artwork (glitched "404" share card + app icons), the auth/theme provider wiring, the two app-wide gate layers mounted as siblings of `{children}` (the `AcknowledgementGate` full-screen announcement takeover and the `FeedbackGate` shake-to-report bug/feature reporter), the error boundaries (segment-level and root-level), the friendly in-shell 404 page, the FCM background service-worker handler, and the boot-time env assertion that fails a misconfigured deploy loudly. It establishes the chrome and global behaviors; the home header (unit 06), tokens (unit 28), and dialog primitives (unit 25) live elsewhere.

## Features

### Root layout & document shell (`app/layout.tsx`)
- Renders `<html lang="en" suppressHydrationWarning>` → `<body>` → `<Providers>{children}<AcknowledgementGate /><FeedbackGate aiAvailable={…} /></Providers>` (layout.tsx:48-58). The two gates are siblings of `{children}`, always mounted app-wide.
- `suppressHydrationWarning` on `<html>` because next-themes (via `NeonAuthUIProvider`) sets `class="dark"` on `<html>` client-side, causing an attribute mismatch (layout.tsx:45-48).
- Imports `@camp404/ui/styles.css` once (layout.tsx:5) — the single global stylesheet / OKLCH `@theme`.
- `<body>` base styles come from `packages/ui/src/styles/globals.css` `@layer base`: `bg-[color:var(--color-background)] text-[color:var(--color-foreground)]`, `font-feature-settings: "rlig" 1, "calt" 1`; universal `*` border defaults to `var(--color-border)`; native date/time picker indicator forced `filter: invert(0.85)` for dark theme (globals.css:42-55).
- `aiAvailable` is computed server-side as `!!process.env.ANTHROPIC_API_KEY` and passed into `FeedbackGate` (layout.tsx:55) — gates the "Improve with AI" toggle in the report dialog.

### Site metadata (`app/layout.tsx`)
- `metadataBase = new URL("https://camp-404.com")` (SITE_URL const, layout.tsx:7,14) — absolute base that the file-based `opengraph-image` / `twitter-image` / icon routes and canonical URLs resolve against.
- `title: "Camp 404"`; `description: "A calm command centre for a chaotic desert."` (SITE_DESCRIPTION const); `applicationName: "Camp 404"` (layout.tsx:15-17).
- `openGraph`: `type: "website"`, `siteName: "Camp 404"`, `title: "Camp 404"`, `description` (same), `url: "/"`, `locale: "en_GB"` (layout.tsx:18-25).
- `twitter`: `card: "summary_large_image"`, `title: "Camp 404"`, `description` (same) (layout.tsx:26-30).
- The page-not-found route supplies `metadata = { title: "Page not found" }` composed with the root layout template (not-found.tsx:7).

### Viewport / theme color (`app/layout.tsx`)
- `viewport`: `width: "device-width"`, `initialScale: 1`, `maximumScale: 1`, `themeColor: "#0d061e"` (layout.tsx:33-38). `maximumScale: 1` disables pinch-zoom (mobile-first chrome). `#0d061e` = hex of `--color-background` (midnight-violet).

### Providers wrapper (`app/providers.tsx`)
- `"use client"` component wrapping all children in `NeonAuthUIProvider` (Neon/Better Auth UI) (providers.tsx:1,14).
- Props wired: `authClient={authClient}`, `navigate={router.push}`, `replace={router.replace}`, `onSessionChange={() => router.refresh()}`, `redirectTo="/"`, `Link={Link}` (providers.tsx:14-21). `onSessionChange` refreshes server components on every sign-in/out so gated content re-evaluates.
- This provider is what flips `<html class="dark">` (next-themes under the hood) — the app is dark-only.
- `authClient = createAuthClient()` (auth-client.ts:14) — same-origin fetches to `/api/auth/*`, no base URL.

### PWA manifest (`app/manifest.ts`)
- Auto-served at `/manifest.webmanifest`. `name: "Camp 404"`, `short_name: "Camp 404"`, `description: "A calm command centre for a chaotic desert."`, `start_url: "/"`, `display: "standalone"`, `background_color: "#0d061e"`, `theme_color: "#0d061e"` (manifest.ts:6-13).
- Icons: (1) `src: "/icon.svg"`, `sizes: "any"`, `type: "image/svg+xml"`, `purpose: "any"`; (2) `src: "/apple-icon"`, `sizes: "180x180"`, `type: "image/png"`, `purpose: "maskable"` (manifest.ts:14-27).

### Brand artwork renderer (`lib/og-image.tsx`)
- Single shared `next/og` (Satori) renderer; artwork generated at build time, no committed binary assets (og-image.tsx:3-10).
- Hardcoded hex equivalents of OKLCH tokens: `BACKGROUND = "#0d061e"`, `FOREGROUND = "#f7ecf3"`, `MUTED = "#b29ab0"`, `MAGENTA = "rgba(255, 0, 140, 0.92)"`, `CYAN = "rgba(0, 220, 255, 0.92)"` (og-image.tsx:13-17).
- Exports `SHARE_SIZE = { width: 1200, height: 630 }`, `SHARE_CONTENT_TYPE = "image/png"`, `SHARE_ALT = "Camp 404 — a glitched 404 logo on a midnight-violet field. A calm command centre for a chaotic desert."` (og-image.tsx:19-22).
- `renderShareImage()` — 1200×630 OG/Twitter card: kicker "Camp 404", error line "Error 404 — Camp not found", a giant `Glitch404` (fontSize 320, split 14, glow 80), tagline "A calm command centre for a chaotic desert.", with a radial magenta bloom (og-image.tsx:25-108).
- `renderSquareIcon(size)` — square icon for Apple/maskable, fills background edge-to-edge, `Glitch404` sized at `Math.round(size*0.46)` with split `Math.max(2, Math.round(size*0.035))` (og-image.tsx:111-132).
- `Glitch404({fontSize, split, glow=0})` — three stacked "404"s: magenta translated `-split`px, cyan translated `+split`px, foreground on top (RGB-split chromatic aberration). Only sets `textShadow` when `glow` truthy because "Satori chokes on `textShadow: undefined`" (og-image.tsx:135-180).

### File-based image routes
- `app/opengraph-image.tsx` — re-exports `alt`/`size`/`contentType` from og-image and returns `renderShareImage()` (opengraph-image.tsx:14-16).
- `app/twitter-image.tsx` — identical artwork for X/Twitter `summary_large_image` (twitter-image.tsx:13-15).
- `app/apple-icon.tsx` — `size = { width: 180, height: 180 }`, `contentType = "image/png"`, returns `renderSquareIcon(180)`; Apple requires PNG and ignores transparency so background fills edge-to-edge (apple-icon.tsx:5-10).
- `app/icon.svg` — static favicon: 64×64 rounded-rect (`rx="12"`) `#0d061e` base, three monospace "404" texts offset (`#ff008c` magenta at x=30.5, `#00dcff` cyan at x=33.5, `#f7ecf3` foreground at x=32), `font-size="27"`, `font-weight="900"`, `letter-spacing="-1.5"`, `aria-label="Camp 404"` (icon.svg).

### Not-found page (`app/not-found.tsx`)
- Rendered for unmatched routes and `notFound()` calls; sits inside the root layout so the user stays within the shell (not-found.tsx:11-12).
- Layout: `main.mx-auto … max-w-lg …`; big `404` in `--color-primary`; heading "You're properly lost."; copy "This page wandered off into the dust. There's nothing here — but the camp's still standing."; a `<Button asChild>` linking `/` labeled "Back to camp" (not-found.tsx:13-29).

### Segment error boundary (`app/error.tsx`)
- `"use client"`; catches uncaught render/server-action errors in the app tree, keeps user in shell (error.tsx:7-10).
- On error: `console.error(error)` (digest correlates server log) and moves focus to the heading (`headingRef.current?.focus()`) for AT/keyboard users (error.tsx:19-26).
- UI: heading "Something went sideways."; copy "An unexpected error tripped us up. Try again — if it keeps happening, let a camp captain know."; two buttons — "Try again" (`onClick={reset}`) and outline "Back to camp" linking `/` (error.tsx:36-47).

### Root error boundary (`app/global-error.tsx`)
- `"use client"`; last-resort boundary for errors in the root layout itself — it REPLACES the layout, so it ships its own `<html lang="en">`/`<body>` and cannot use app CSS vars; all styling is inline (global-error.tsx:7-23).
- Inline-styled to match dark theme: `background: "#0d061e"`, `color: "#f6eef7"`, system-ui font stack; button `background: "#ef1ec1"` (hardcoded hex of `--color-primary` oklch(0.65 0.27 340)) (global-error.tsx:25-69).
- On error: `console.error(error)` and `headingRef.current?.focus()` (global-error.tsx:17-21).
- UI: heading "Camp 404 hit a snag."; copy "Something failed before the page could load. Try again — if it persists, let a camp captain know."; `<button onClick={reset}>Try again</button>` (global-error.tsx:42-69).

### Acknowledgement gate (`app/acknowledgement-gate.tsx`)
- App-wide full-screen takeover for the `presentation='acknowledge'` notification variant; mounted once in root layout (ack-gate.tsx:8-16).
- Polls `GET /api/notifications/pending` (`cache: "no-store"`) on initial load, on a `setInterval` of `POLL_INTERVAL_MS = 45_000` (45s), and on tab `visibilitychange→visible` + window `focus` (ack-gate.tsx:26,40-67).
- Concurrency guard: monotonic `requestIdRef` token so overlapping polls (interval vs focus) can't let a slower older response clobber a newer one — only the latest request wins (`if (requestId !== requestIdRef.current) return`) (ack-gate.tsx:34-46).
- Shows the OLDEST pending item (`current = queue[0]`) as a `role="dialog" aria-modal="true" aria-labelledby="ack-title"` overlay with `z-[100]`, opaque `bg-[color:var(--color-background)]`, full-screen `fixed inset-0` (ack-gate.tsx:69,105-111).
- While a notification is shown, locks background scroll (`document.body.style.overflow = "hidden"`, restored on cleanup) and resets scroll to top (`scrollRef.current?.scrollTo({ top: 0 })`) (ack-gate.tsx:73-81).
- Renders: Megaphone icon + "Camp announcement" kicker; the item `title` (h1 `#ack-title`); a subline `From {senderName} · {new Date(createdAt).toLocaleString()}` (the "From …" prefix omitted when `senderName` null); the `body` in `whitespace-pre-wrap`; then the Acknowledge block (ack-gate.tsx:105-153).
- Acknowledge button lives at the END of the scroll (not a pinned footer) — member scrolls the whole message to reach it (ack-gate.tsx:135-153).
- If more than one queued, shows "{queue.length - 1} more after this." above the button (ack-gate.tsx:138-142).
- `acknowledge()` POSTs `/api/notifications/acknowledge` `{ deliveryId }`; on success bumps `requestIdRef` (so an in-flight poll can't re-add it), removes the item from `queue`, and calls `router.refresh()` to update unread badge / inbox server components (ack-gate.tsx:85-103).
- Renders nothing (`return null`) when `current` is undefined (empty queue) — unauthenticated visitors get an empty queue from the API, so it's invisible on public pages (ack-gate.tsx:83, 16).

### Feedback gate (shake-to-report) (`app/feedback-gate.tsx`)
- Mounted once in root layout as sibling of `AcknowledgementGate`; shaking the device opens `ReportBugDialog`; shake detection pauses while the dialog is open (feedback-gate.tsx:12-27).
- Gated on the LIVE client session: `signedIn = !isPending && !!session` from `authClient.useSession()`; listener attaches only while signed in and detaches on sign-out (feedback-gate.tsx:23-27). `if (!signedIn) return null` (feedback-gate.tsx:41).
- `useShakeGesture({ enabled: signedIn && !open, onShake: () => setOpen(true) })` (feedback-gate.tsx:27).
- iOS 13+ devicemotion permission: when `signedIn && motionPermissionNeeded()`, requests motion permission once on the first `pointerdown` (`{ once: true }`) (feedback-gate.tsx:32-39).
- Shake is the ONLY trigger (no floating button) — matches RyRy79261/intake-tracker's ShakeToReport (feedback-gate.tsx:14-16).
- Server action enforces auth too as defence in depth (feedback-gate.tsx:18-20).

### Shake detection (`components/feedback/use-shake-gesture.ts`)
- Listens to `devicemotion`, reading `accelerationIncludingGravity` (x/y/z); ignores samples with any null axis (shake.ts:156-167).
- Pure `createShakeDetector` state machine: counts "jolts" where the change in total acceleration magnitude between samples exceeds `threshold`; magnitude is rotation-invariant so tilting (which keeps magnitude ≈9.8) doesn't register, only real movement (shake.ts:60-115).
- Fires when `jolts.length >= requiredJolts` within the rolling `windowMs` AND `now - lastShakeAt >= cooldownMs` (`>=` is inclusive — exact cooldown gap counts) (shake.ts:101-111).
- Default config: `threshold = 8`, `requiredJolts = 5` ("a deliberate, vigorous shake, not an accidental bump"), `windowMs = 800`, `cooldownMs = 3000` (shake.ts:135-139).
- Samples throttled to one per `SAMPLE_THROTTLE_MS = 60` ms (shake.ts:153-162).
- `motionPermissionNeeded()` — true only on browsers exposing `DeviceMotionEvent.requestPermission` (iOS 13+) (shake.ts:21-32). `requestMotionPermission()` returns `"granted" | "denied" | "unsupported"`; non-iOS returns `"granted"` without a prompt (shake.ts:34-52).

### Bug/feature report dialog (`components/feedback/report-bug-dialog.tsx`)
- Files a GitHub issue via `submitFeedbackAction`; nothing stored in our DB (dialog.tsx:39-45).
- Form fields/controls: kind toggle (Bug / Feature, `role="group" aria-label="Report type"`, `aria-pressed`), description Textarea (`rows={6}`, `maxLength={DESCRIPTION_MAX}=5000`, kind-specific label + placeholder), a "Dictate instead" Mic button that swaps in the voice `RecorderPanel` (transcript APPENDED to description via `appendTranscript`, no `promptKey`), and — only when `aiAvailable` — an "Improve with AI" Checkbox (default checked) (dialog.tsx:160-253).
- `appendTranscript` joins with a newline if needed and re-caps to `DESCRIPTION_MAX`; sets `dictated=true` (dialog.tsx:75-83).
- Submit (`handleSubmit`) runs in a `useTransition`; calls `submitFeedbackAction({ kind, description, dictated, useAi: aiAvailable && useAi, route: window.location.pathname })`; success → success view, typed `{ok:false}` → inline error, transport rejection → "Couldn't send your report just now. Please try again." (dialog.tsx:85-106).
- `canSubmit = description.trim().length > 0 && !isPending` (dialog.tsx:108).
- Mid-send dismiss guard: Escape / outside-click / X cannot close while `isPending` (dialog.tsx:113-119).
- Success view: CheckCircle2 + "Report filed"; "Issue #{number} was created on GitHub. Thanks!" when `number > 0`, else "Thanks — your report was sent."; external link "View issue #{number}" / "Open the tracker"; "Done" button (dialog.tsx:122-147).
- State reset on each closed→open transition (dialog.tsx:64-73).

### Feedback server action (`app/feedback/actions.ts` + `lib/github-feedback.ts`)
- `submitFeedbackAction(input)` returns `{ ok: true; number; url } | { ok: false; error }` (actions.ts:15-17,47).
- Auth: returns `{ ok:false, error:"Please sign in to send feedback." }` if no authenticated user (actions.ts:50-51).
- Rate limits (in-memory, per user, per instance): burst `feedback:{user.id}` limit 3 (default 60_000ms window) → "You're sending these quickly — give it a minute and try again."; daily `feedback-day:{user.id}` limit 20 / `windowMs: 86_400_000` → "You've filed a lot of reports today — please try again tomorrow." (actions.ts:56-72; rate-limit.ts:44 default window 60_000).
- Validation `InputSchema`: `kind` ∈ `["bug","feature"]`; `description` trimmed `.min(1,"Please describe the issue.").max(5000)`; `dictated?` boolean; `route?` string `.max(300)`; `useAi?` boolean (actions.ts:19-30).
- PII sanitization `sanitizeReportText`: `redactPii` (bearer/JWT/api-key/AWS/Slack/token-URL/long-blob/messenger-link/@handle/email/intl+local phone/SA-ID-SSN/credit-card) → strip HTML tags → trim → cap (github-feedback.ts:39-85). If empty after sanitizing → "Please describe the issue." (actions.ts:86-89).
- Reporter reference: `findCampUserByAuthId(user.id)?.id || "unlinked"` — opaque camp id, never name/email; sentinel `"unlinked"` pre-invite (actions.ts:91-95).
- E2E test mode short-circuits: returns `{ ok:true, number:0, url:"https://github.com/RyRy79261/camp-404/issues" }` without calling AI/GitHub (actions.ts:97-100).
- Optional AI restructuring: `useAi ? await structureWithAi(kind, sanitized) : null`; any failure → null → plain body (actions.ts:102-103; feedback-ai.ts:71-103 returns `StructuredReport | null`).
- GitHub: requires `GITHUB_FEEDBACK_TOKEN` (missing → "Feedback isn't set up yet. Let a camp captain know."); repo from `GITHUB_FEEDBACK_REPO` or `DEFAULT_REPO = "RyRy79261/camp-404"`, must split into exactly 2 `owner/name` segments else "Feedback isn't configured correctly…" (actions.ts:114-132).
- POSTs `https://api.github.com/repos/{owner}/{name}/issues` with `AbortSignal.timeout(8000)`, headers incl. `X-GitHub-Api-Version: 2022-11-28`, `User-Agent: camp-404-feedback`; body `{ title, body, labels }` (actions.ts:135-155).
- Status mapping: 201 → validate `{number, html_url}` (malformed → "…couldn't read GitHub's reply."), 401 → "GitHub rejected the token…", 403/404 → "…unreachable right now.", 410 → "Issues are turned off…", other → "Couldn't file your report just now…"; network/timeout catch → "Couldn't reach the feedback tracker…" (actions.ts:157-188).
- Issue assembly (`buildFeedbackIssue`): labels `["bug","from-app"]` / `["enhancement","from-app"]`; title from first line capped at `TITLE_MAX = 100` (fallback "Bug report"/"Feature request"); body fenced description or AI structured sections + a `---` + PII-free footer (provenance, voice-dictated marker, opaque reporter id, sanitized route); body capped at `ISSUE_BODY_MAX = 60_000` (github-feedback.ts:28-32,178-199).

### Notification API routes (consumed by AcknowledgementGate)
- `GET /api/notifications/pending` (`runtime="nodejs"`, `dynamic="force-dynamic"`): unauthenticated → `{ pending: [] }` (not 401, gate is app-wide); no camp access (synthetic `id:""`) → `{ pending: [] }`; else `getPendingAcknowledgements(campUser.id)` (pending/route.ts:14-28).
- `POST /api/notifications/acknowledge` (`runtime="nodejs"`): body `z.object({ deliveryId: z.string().uuid() })`; no user → 401 `{error:"unauthorized"}`; bad body → 400 `{error:"invalid"}`; no camp access → `{ok:false}`; else `acknowledgeDelivery({ deliveryId, userId: campUser.id })` returning `{ ok }` (acknowledge/route.ts:13-36).

### FCM background service worker (`app/firebase-messaging-sw.js/route.ts`)
- Route handler serving the FCM compat background SW at root path `/firebase-messaging-sw.js` (`runtime="nodejs"`, `dynamic="force-dynamic"`). Generated (not committed) so config has a single source of truth (sw-route.ts:1-10).
- Interpolates `NEXT_PUBLIC_FIREBASE_*` env (apiKey, authDomain, projectId, messagingSenderId, appId, each `?? ""`) into the SW body (sw-route.ts:12-18).
- SW imports Firebase 12.14.0 compat scripts, initializes the app, and `onBackgroundMessage` shows a notification titled `payload.notification.title || "Camp 404"`, body `n.body || ""`, `icon: "/icon.svg"`, `data: payload.data || {}` (sw-route.ts body string).
- Response headers: `Content-Type: text/javascript; charset=utf-8`, `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: "/"` (sw-route.ts).

### Boot-time env assertion (`instrumentation.ts` + `lib/env.ts`)
- `register()` runs once on server boot; calls `assertServerEnv()` only when `process.env.NEXT_RUNTIME === "nodejs"` AND `process.env.NEXT_PHASE !== "phase-production-build"` (skips Edge runtime and the build-data-collection phase) (instrumentation.ts:15-22).
- `assertServerEnv(env=process.env)`: no-op when `env.E2E_TEST_MODE === "1"`; iterates `REQUIRED` and throws a multi-line actionable error listing every missing/too-short var (env.ts:32-56).
- `REQUIRED`: a single var `PGCRYPTO_KEY`, `minLength: 16`, hint "16+ required, 32+ recommended (e.g. `openssl rand -base64 32`). Encrypts member ID-document PII at rest." — without it, questionnaire saves with a government ID number throw mid-flow (env.ts:20-26, 1-12).

## User actions & interactions
- **Acknowledge an announcement**: scroll the full-screen takeover to the bottom, press "Acknowledge" → POST acknowledge → item dismissed, next surfaces, server components refresh.
- **Shake to report**: physically shake the device (5 jolts / 800ms window / 3s cooldown / threshold 8) while signed in → opens the bug/feature dialog. (First signed-in `pointerdown` triggers the iOS motion-permission prompt where applicable.)
- **File a bug/feature report**: choose Bug or Feature, type a description (or tap "Dictate instead" to record voice that appends to the description), optionally toggle "Improve with AI", press "Send report"; on success follow the issue link or press "Done"; "Cancel" closes (disabled while sending).
- **Recover from an error**: press "Try again" (`reset()`) or "Back to camp" (`/`) on the segment error boundary; "Try again" on the root error boundary.
- **Escape a 404**: press "Back to camp" → `/`.
- **Install as PWA / receive push**: add to home screen via the manifest; FCM background notifications shown by the service worker.
- Implicit: every page-internal navigation refreshes server components on session change (`onSessionChange → router.refresh()`); pinch-zoom is disabled (`maximumScale: 1`).

## States & presentations
Global-states rows as they apply to this shell unit:
- **Empty**: AcknowledgementGate renders nothing when the pending queue is empty (`return null`); FeedbackGate renders nothing when signed out (`return null`).
- **Loading**: FeedbackGate treats `authClient.useSession().isPending` as not-signed-in (no listener). Report dialog Send button shows `Loader2` spinner + "Sending…" while `isPending`. Acknowledge button shows `Loader2` while `acking`.
- **Populated**: AcknowledgementGate shows the oldest pending item; "{N} more after this." when the queue length > 1.
- **Validation-error**: report dialog Send is disabled until `description.trim().length > 0`; server action returns inline typed errors (rendered in a `role="alert"` banner); acknowledge route returns 400 on a non-uuid `deliveryId`.
- **Submitting/pending**: report dialog blocks dismiss while sending; rate-limit caps (burst 3, daily 20) return "slow down"/"too many" errors.
- **Success**: report dialog success view ("Report filed", optional issue # link); acknowledge dismisses + refreshes.
- **Disabled**: report Cancel disabled while pending; Send disabled when description empty or pending; pinch-zoom disabled globally.
- **Error**: `error.tsx` (segment) and `global-error.tsx` (root layout) boundaries; in-shell `not-found.tsx`.
- **Invite-gated / Onboarding-incomplete / Pending-approval / Rejected / Captain-only-locked**: NOT enforced by this shell — those gates live in `app/page.tsx` (the gating spine, adjacency unit) and individual surfaces. The shell-level notification routes only short-circuit to an empty list / `{ok:false}` when the signed-in user has no camp access (`!hasCampAccess`), avoiding a 500 on a synthetic empty id; this is a no-data degradation, not a routed gate.
- **Unauthenticated**: `/api/notifications/pending` returns `{ pending: [] }` (no 401) so the app-wide gate is silent on public pages; FeedbackGate shows nothing.
- **Theme**: dark-only — `<html class="dark">` set client-side by the provider; `global-error.tsx` hardcodes the dark palette inline since CSS vars are unavailable when the layout never rendered.

## Enums, options & configurable values
- Site constants: `SITE_URL = "https://camp-404.com"`, `SITE_DESCRIPTION = "A calm command centre for a chaotic desert."` (layout.tsx:7-8).
- Theme color / background hex: `#0d061e` (viewport themeColor, manifest background_color + theme_color, og `BACKGROUND`, icon.svg). Root-error button magenta `#ef1ec1`; root-error text `#f6eef7`.
- OG/icon palette: `FOREGROUND="#f7ecf3"`, `MUTED="#b29ab0"`, `MAGENTA="rgba(255,0,140,0.92)"`, `CYAN="rgba(0,220,255,0.92)"`; icon.svg fills `#ff008c`/`#00dcff`/`#f7ecf3`.
- Share image: `SHARE_SIZE = { width: 1200, height: 630 }`, `SHARE_CONTENT_TYPE = "image/png"`, `SHARE_ALT` (full string above). Apple icon `{ width:180, height:180 }`, `image/png`.
- Manifest: `display: "standalone"`, `start_url: "/"`, icon purposes `"any"` + `"maskable"`.
- AcknowledgementGate: `POLL_INTERVAL_MS = 45_000`; overlay `z-[100]`; content `max-w-2xl`.
- Shake config defaults: `threshold=8`, `requiredJolts=5`, `windowMs=800`, `cooldownMs=3000`, `SAMPLE_THROTTLE_MS=60`.
- `motionPermissionResult` ∈ `"granted" | "denied" | "unsupported"`.
- FeedbackKind ∈ `"bug" | "feature"` (github-feedback.ts:9). Issue labels: bug→`["bug","from-app"]`, feature→`["enhancement","from-app"]`.
- StructuredReport.severity ∈ `"critical" | "high" | "medium" | "low"` (github-feedback.ts:18).
- Feedback caps: `DESCRIPTION_MAX = 5000`, `TITLE_MAX = 100`, `ISSUE_BODY_MAX = 60_000`; `route` max 300; burst limit 3 / 60_000ms, daily limit 20 / 86_400_000ms; GitHub `AbortSignal.timeout(8000)`; `DEFAULT_REPO = "RyRy79261/camp-404"`.
- Notification `presentation` enum (`broadcast_presentation`): `"acknowledge" | "popup" | "feed"` (schema.ts:166-169); the gate surfaces only `"acknowledge"`. `notification_deliveries.presentation` defaults `"feed"` (schema.ts:846-848).
- Env vars referenced: `ANTHROPIC_API_KEY` (aiAvailable), `PGCRYPTO_KEY` (required, minLength 16), `E2E_TEST_MODE` ("1" skips assert + AI/GitHub), `NEXT_RUNTIME` ("nodejs"), `NEXT_PHASE` ("phase-production-build"), `GITHUB_FEEDBACK_TOKEN`, `GITHUB_FEEDBACK_REPO`, `NEXT_PUBLIC_FIREBASE_{API_KEY,AUTH_DOMAIN,PROJECT_ID,MESSAGING_SENDER_ID,APP_ID}`.
- FCM SW: Firebase compat version `12.14.0`; SW notification fallback title "Camp 404"; SW `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: "/"`.

## Data model touched
This unit reads/writes via `lib/notifications.ts` facade → `@camp404/db/broadcasts` (or the in-memory test store under E2E mode). It does NOT write any user/team/profile tables itself.
- **`notification_deliveries`** (schema.ts:830-863) — the only table the AcknowledgementGate touches.
  - Read by `getPendingAcknowledgements(userId)` (broadcasts.ts:403-430): selects `id` (→`deliveryId`), `title`, `body`, joined `users.displayName` (→`senderName`, nullable), `createdAt`; filtered `userId = …` AND `presentation = 'acknowledge'` AND `acknowledgedAt IS NULL`; ordered by `createdAt` ascending (oldest first).
  - Written by `acknowledgeDelivery({deliveryId,userId})` (broadcasts.ts:437-454+): sets `acknowledgedAt = now`, `readAt = now`; predicate `id = deliveryId` AND `userId = userId` AND `presentation = 'acknowledge'` AND `acknowledgedAt IS NULL`; returns whether a row was affected (boolean).
  - Relevant columns: `id` uuid PK, `broadcastId` uuid (FK→broadcasts, cascade, nullable), `userId` uuid (FK→users, cascade, notNull), `title` text notNull, `body` text notNull, `channel` enum notNull, `presentation` enum notNull default `"feed"`, `pushStatus` enum default `"queued"`, `refType` text, `refId` uuid, `readAt` ts, `acknowledgedAt` ts, `deliveredAt` ts, `createdAt` ts notNull defaultNow.
- **`broadcasts`** + **`users`** — read-only join targets in `getPendingAcknowledgements` (`broadcasts.senderId → users.displayName` for `senderName`).
- DTO shapes consumed client-side: `PendingItem` (ack-gate.tsx:18-24) = `{ deliveryId: string; title: string; body: string; senderName: string | null; createdAt: string }` — mirrors `PendingAcknowledgement` (broadcasts.ts:390-396) `{ deliveryId, title, body, senderName: string|null, createdAt: Date }` (Date serialized to string over the API).
- **Feedback path stores nothing in our DB** — GitHub Issues is the store; only an opaque camp user id (`reporterRef`) is exposed.
- **GitHub issue payload**: `{ title, body, labels }` (see assembly above).

## Validation, edge cases & business rules
- **Auth depth-in-defence (feedback)**: FeedbackGate gates the shake listener on the live client session AND the server action re-checks auth (`getAuthenticatedUser`).
- **No-camp-access guard (notifications)**: both notification routes call `hasCampAccess(campUser, user.primaryEmail)`; a signed-in but non-camp user yields a synthetic `id:""` row from `ensureCampUser`, and querying with the empty id "500s on a real DB", so the routes return empty/`{ok:false}` instead.
- **Acknowledge ownership/idempotency**: the DB update is scoped to `userId` and `acknowledgedAt IS NULL` and `presentation='acknowledge'`, so a member can only dismiss their own outstanding full-screen deliveries, and never stamps an acknowledge on a popup/feed delivery (schema/broadcasts comments).
- **Poll race**: `requestIdRef` monotonic token drops superseded responses; `acknowledge()` bumps the token so an in-flight poll can't re-add a just-dismissed item.
- **Scroll lock cleanup**: body `overflow` is captured before forcing `"hidden"` and restored exactly on unmount, so nested overlays don't strand a locked scroll.
- **Dialog dismiss-while-sending**: blocked so the GitHub response/error is never lost; Cancel disabled while pending.
- **Feedback empty-after-sanitize**: HTML-only or PII-only input that sanitizes to empty is rejected with "Please describe the issue." (never files a blank issue).
- **PII redaction order**: secrets matched before generic patterns "before generic patterns split them apart"; international phone regex deliberately consumes all trailing digit groups so the last group can't leak.
- **Markdown-injection hardening**: user/AI free text is fenced (`fenced`, backticks defused to `''' `), inline-coded (`inlineCode` strips backticks + newlines for reporter id/route), or `mdInline`'d (AI prose) so it can't inject headings/fences/blockquotes/lists; AI fields are re-sanitized because "the model can echo PII".
- **GitHub 201-shape validation**: response validated with `GithubIssueSchema` (`number` + `html_url` URL) rather than cast; malformed 201 → "filed, but we couldn't read GitHub's reply."
- **Rate limiter caveat**: in-memory + per-instance, so "best-effort against a determined member"; the daily ceiling exists because the destination is a public tracker.
- **Repo is PUBLIC**: issue bodies are world-readable — never put reporter name/email in the body, only the opaque camp id; the dialog also warns "please don't include personal details."
- **E2E test mode**: `assertServerEnv` no-ops; the feedback action returns a synthetic success without AI/GitHub; notifications route through the in-memory test store.
- **Env fail-fast**: a missing/short `PGCRYPTO_KEY` throws at boot (loud) rather than failing a member's questionnaire save mid-flow (silent); skipped during `next build` and on the Edge runtime.
- **Error-boundary a11y**: both boundaries move focus to the heading (`tabIndex={-1}`) so AT/keyboard users are told the segment was swapped to an error state.
- **`global-error.tsx` self-containment**: must ship its own `<html>`/`<body>` and inline styles because the root layout never rendered and app CSS vars are unavailable.
- **Mobile-first chrome**: `maximumScale: 1` disables pinch-zoom; 404/error pages use `max-w-lg`; ack overlay uses `max-w-2xl` (wider than the app's `max-w-lg`, since it's a full-screen reading takeover, not an in-app surface).
- **Satori quirk**: `Glitch404` only sets `textShadow` when `glow` is truthy because Satori chokes on `textShadow: undefined`.

## Sub-components / variants
- **`Providers`** — client wrapper; the only thing flipping the dark class and refreshing on session change. No variants.
- **`AcknowledgementGate`** — singleton; surfaces ONLY `presentation='acknowledge'` deliveries (popup/feed never appear here — popup handling is a different surface, not in this unit).
- **`FeedbackGate`** — singleton; shake-only trigger. Note (load-bearing): commit history (`655c5e1`, `141c676`) shows a floating feedback button was REMOVED in favor of shake-only; there is no longer a tappable launcher in this shell.
- **`ReportBugDialog`** — props `{ open, onOpenChange, defaultKind="bug", aiAvailable=false }`. Two presentations: form view and success view. The "Improve with AI" block is conditional on `aiAvailable`. The `RecorderPanel` integration intentionally passes NO `promptKey` (generic transcription) — comment notes the transcribe route has no bug-report prompt.
- **`Glitch404`** — shared private sub-component of og-image; two call sites (share card with glow, square icon without). `icon.svg` is a hand-authored static equivalent (monospace, not Satori), used for the favicon + manifest `"any"` icon + FCM SW notification icon.
- **`renderShareImage` / `renderSquareIcon`** — shared renderers behind 3 file-based routes (`opengraph-image`, `twitter-image`, `apple-icon`).
- **`error.tsx` vs `global-error.tsx`** — segment boundary (inside shell, retry + home) vs root boundary (replaces shell, inline-styled, retry only).
- **Server handlers/validators in this unit**: `GET /api/notifications/pending`, `POST /api/notifications/acknowledge` (Zod `{deliveryId: uuid}`), `submitFeedbackAction` (Zod `InputSchema`), `GET /firebase-messaging-sw.js`, `register()` / `assertServerEnv()`.
- **Dead/orphaned**: none confirmed in this unit. The `firebase-messaging-sw.js` route notes a static-export (MOBILE_BUILD) build has no route handlers, so the SW is web-only — a documented degradation, not dead code.
