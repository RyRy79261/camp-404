# Shake-to-Report — As Built

> Files an in-app bug/feature report as a **GitHub issue**. Nothing is stored in our
> database — GitHub Issues is the store and the triage board. Modelled on
> RyRy79261/intake-tracker's report-bug dialog, simplified.
> Built 2026-05-31. (Supersedes the earlier draft that proposed an in-app `feedback_reports`
> table + MCP triage tooling — that approach was dropped as over-built.)

## Flow

Shake the device **or** tap the always-present report button → a modal (Bug/Feature toggle,
description, optional voice dictation) → a server action `POST`s to the GitHub Issues API →
the modal shows the created issue link.

## Components

- **`apps/web/components/feedback/use-shake-gesture.ts`** — pure `createShakeDetector` state
  machine (magnitude-delta jolts within a rolling window, with cooldown; rotation-invariant so
  a tilt never fires) + `useShakeGesture` hook + iOS `requestPermission` helpers. Web
  DeviceMotion only — no native Capacitor plugin (deferred). Ported from the reference.
  **Default: five jolts** within the window are required to open the dialog (a deliberate
  shake, not a bump).
- **`apps/web/app/feedback-gate.tsx`** — mounted once in the root layout (sibling of
  `AcknowledgementGate`), gated on `signedIn`. **Shake is the only trigger** (matching the
  reference's `ShakeToReport` — no button); it requests iOS motion permission on first pointer
  interaction and pauses while the dialog is open.
- **`apps/web/components/feedback/report-bug-dialog.tsx`** — the modal. Reuses our `Dialog`
  primitive and the voice `RecorderPanel` (no prompt key — free-form dictation). Has the
  **"Improve with AI"** toggle (shown only when the server has a Claude key). Inline
  `role="alert"` errors; success state links to the created issue. **Dropped from the
  reference:** the "read the manual" section and the diagnostics/error-log capture.
- **`apps/web/lib/github-feedback.ts`** — pure, unit-tested: `redactPii`, `sanitizeReportText`,
  `labelsFor`, `buildFeedbackIssue` (plain: title = first line + fenced description; structured:
  AI title/summary/steps/expected/actual — all re-sanitized; PII-free footer with opaque
  reporter id + route).
- **`apps/web/lib/feedback-ai.ts`** — `structureWithAi`: optional Claude (Haiku) restructuring
  via a forced `format_report` tool call. Fail-safe — returns `null` on no key / API error /
  bad shape, and the action files the plain template instead.
- **`apps/web/app/feedback/actions.ts`** — `submitFeedbackAction`: require sign-in →
  per-user burst + daily rate-limit → zod-validate → (if `useAi`) restructure → build issue →
  `POST /repos/{owner}/{name}/issues` with `Bearer ${GITHUB_FEEDBACK_TOKEN}`. Strict repo-slug
  parse; maps GitHub 401/403/404/410 to friendly errors; logs server-side. Under
  `E2E_TEST_MODE` it skips the AI + GitHub calls and returns success.

## Public-repo PII discipline

`RyRy79261/camp-404` is **public**, so issue bodies are world-readable:
- Every free-text field is PII-redacted (emails / phones / ID & card numbers) and HTML-stripped.
- The only reporter reference is the **opaque camp user id** — never a name or email.
- The modal warns: *"This opens a GitHub issue on our public tracker — please don't include
  personal details."*

## Configuration

- **`GITHUB_FEEDBACK_TOKEN`** — fine-grained PAT, repo access limited to `camp-404`, permission
  **Issues: Read and write** (+ Metadata: Read, auto-included). Set in Vercel (prod) and
  `apps/web/.env.local` (local dev). Not boot-required — the modal degrades to a "not set up"
  message if absent.
- **`GITHUB_FEEDBACK_REPO`** — optional; defaults to `RyRy79261/camp-404` in code.
- **`ANTHROPIC_API_KEY`** — optional; when set, the "Improve with AI" toggle appears and the
  report is restructured before filing. Absent → the toggle is hidden and reports file plain.
- Labels applied: `["bug","from-app"]` / `["enhancement","from-app"]` (missing labels are
  auto-created by the issues API).

## Tests

- Unit: the shake detector contract; redaction / sanitize / issue-builder (plain + structured);
  `structureWithAi` (parse / no-key / no-tool / bad-shape); the server action
  (auth / rate-limit / validation / config / GitHub status branches / AI path); the dialog
  (transport-reject, `ok:false`, success, AI-toggle visibility).
- No e2e: shake can't be dispatched in CI and there's no button to click, so the modal flow is
  covered by the dialog RTL test and the action unit test instead.

## Deliberately out of scope

- The reference's **manual section** (per the maintainer).
- Diagnostics / environment / error-log capture, in-app storage, and any MCP triage tooling.

## Possible follow-ups (not built)

- A dedicated `bug_report` transcription prompt (currently dictation runs prompt-less, which is
  fine for free-form text).
- Native shake via `@capacitor/motion` once the mobile build is revived.
- A shared (Upstash-backed) rate limiter — today's per-instance in-memory limiter is the
  app-wide pattern and is best-effort once the app fans out across regions.
