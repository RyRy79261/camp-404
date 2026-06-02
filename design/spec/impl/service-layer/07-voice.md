# Voice dictation / transcription — service-layer plan

> Scope: the dictate-into-a-`long_text`-field pipeline. Browser `MediaRecorder` →
> `POST /api/voice/transcribe` → Groq Whisper Large v3 Turbo → transcript → host field.
> Audio is never persisted; the transcript is the only output and is **appended** (never
> overwrites) to the host field. **No schema change** in this domain (the redesign's only
> schema change is roster's `captain_promotion_requests`, per `_analysis/db-impact.json`).
> The redesign delta is almost entirely presentation: a NEW transcript-review step
> (`Re-record` / `Use this text`). Everything in the service layer is REUSE.

## Consumers — which surfaces/organisms depend on this domain

`RecorderPanel` (`apps/web/components/voice/recorder-panel.tsx`) is the only live consumer
surface. It is an embedded panel with no route of its own, mounted by two hosts:

| Host surface | File | `promptKey` | Append target | maxLength |
|---|---|---|---|---|
| Questionnaire `long_text` field (`/onboarding`, `/forms/[key]`) | `apps/web/components/questionnaire/question.tsx` → `LongTextField` | `"questionnaire"` (biased) | `burner_profiles.responses` (jsonb), via host form submit | `question.maxLength` (default 1000) |
| Bug-report dialog (`ReportBugDialog`, global overlay) | `apps/web/components/feedback/report-bug-dialog.tsx` | _(absent → unbiased)_ | GitHub issue body | `DESCRIPTION_MAX = 5000` (`apps/web/lib/github-feedback.ts:21`) |

Both hosts wire the same contract: pass `onTranscript={appendTranscript}` + `onDismiss`,
and own the append-and-clamp logic locally (see Hybrid extraction).

Spec mapping: `design/spec/surfaces/21-voice.md` (board S21, board #30). Also referenced
from `S05 Field kinds` (the `long_text` "Dictate instead" entry point).

`DictateButton` (`apps/web/components/voice/dictate-button.tsx`) has **zero consumers**
(verified by grep) — a dead orphan variant. The spec confirms it is dropped (21-voice.md
"Superseded / dropped").

## Current state — modules + key exports today

Transcribe pipeline (all live, all working):

- `apps/web/lib/groq.ts`
  - `transcribeAudio(file: File, options?: TranscribeOptions): Promise<string>` — Groq
    `whisper-large-v3-turbo`, `temperature: 0`, optional `prompt` bias. Lazy singleton
    `groqClient()` reads `GROQ_API_KEY`.
  - `TranscribeOptions { prompt?: string }`.
- `apps/web/lib/voice-prompts.ts`
  - `QUESTIONNAIRE_PROMPT` — the single Whisper domain-bias string (camp/Afrikaburn
    vocabulary), kept short per Whisper's ~224-token prompt budget.
- `apps/web/app/api/voice/transcribe/route.ts` — `POST` handler (`runtime = "nodejs"`):
  auth via `getAuthenticatedUser()`; `rateLimit` per-user (`limit: 30`) and per-IP
  (`limit: 60`); validates `audio` is `File`, `audio/*`, `<= MAX_BYTES (10 MB)`; maps
  `promptKey` against `ACCEPTED_PROMPT_KEYS = Set(["questionnaire"])` → `QUESTIONNAIRE_PROMPT`
  or `undefined`; calls `transcribeAudio`; masks Groq internals (502 → "Voice not configured"
  if `GROQ_API_KEY` missing, else "Transcription failed").
- `apps/web/lib/rate-limit.ts`
  - `rateLimit(key, { limit, windowMs? }): { ok, retryAfterSeconds }` — in-memory token
    bucket. `getClientIp(headers): string`.
- `apps/web/components/voice/use-voice-recorder.ts`
  - `useVoiceRecorder({ onTranscript, promptKey?, maxDurationMs = 120_000 })` → `{ state, error, start, stop, reset, analyser }`.
  - `RecorderState = "idle" | "requesting" | "recording" | "processing" | "error"`.
  - Internal pure-ish helpers: `pickMimeType()` (MIME priority list
    `audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` → `audio/ogg;codecs=opus`),
    `handleStop(mimeType)` (builds `FormData`, POSTs, fires `onTranscript` on non-empty
    `data.text.trim()`). `TODO(capacitor)` at `start()` for native recording (unimplemented).
- `apps/web/components/voice/recorder-panel.tsx` — `RecorderPanel({ onTranscript, onDismiss, promptKey? })`. Renders the bordered card, ring button, `Waveform`, `mm:ss` timer, error line. **Fires `onTranscript` immediately on success and returns to `idle` — no review step.**
- `apps/web/components/voice/waveform.tsx` — `Waveform({ analyser, active })` live amplitude bars.

Adjacent, NOT in the transcribe pipeline (scaffold for a future voice-intent classifier;
**no live runtime consumer** — verified by grep, only re-exported and unit-tested):

- `packages/types/src/voice-intent.ts` — `VoiceIntentName` enum, `VoiceIntent` discriminated
  union (`add_recipe | mark_shift_done | log_expense | note_to_team | unknown`), re-exported
  from `packages/types/src/index.ts`.
- `packages/ai-prompts/src/voice-intent.ts` — `voiceIntentPrompt { system, user(transcript) }`;
  versioned in `PROMPT_VERSIONS.voiceIntent` (`packages/ai-prompts/src/index.ts`). Tested in
  `packages/ai-prompts/src/__tests__/prompts.test.ts`. `@camp404/ai-prompts` is only wired
  into `apps/web/next.config.ts` transpile list — no feature imports it yet.
- `apps/web/lib/anthropic.ts` — `anthropic()` client + `MODELS { opus, haiku }`. Used by
  `apps/web/lib/feedback-ai.ts` (bug-report AI structuring), **not** by voice transcription.

## Redesign delta — NEW / EXTEND vs REUSE

Almost everything is **REUSE**. The single substantive delta is presentation-layer and
sits in the component, not the service layer.

- **NEW (presentation only):** the transcript-review step — `TranscriptResult` inside
  `RecorderPanel` (21-voice.md §3 + States row `transcript-review`). On transcription
  success the panel must enter a `transcript-review` state showing an **editable** preview
  (`Textarea`), with `Re-record` (outline → discard, back to `idle`) and `Use this text`
  (primary → `onTranscript(editedText)`, back to `idle`). This is the primary live-vs-spec
  divergence; today `onTranscript` fires immediately.
- **EXTEND (presentation only):** `RecorderState` gains a `"transcript-review"` member;
  `useVoiceRecorder` must surface the raw transcript (instead of firing `onTranscript`
  directly) so the panel can hold/edit it before commit. See Target API.
- **REUSE (no change):** `transcribeAudio`, `QUESTIONNAIRE_PROMPT`, the route handler,
  `rateLimit`/`retryAfterSeconds`, the append-not-overwrite logic in both hosts,
  `pickMimeType`, the MIME priority list, `MAX_BYTES`, `ACCEPTED_PROMPT_KEYS`, the auth
  gate, `Waveform`. The spec's data/API/validation sections all describe the **existing**
  behaviour.
- **DELETE:** `apps/web/components/voice/dictate-button.tsx` (dead orphan; spec confirms
  dropped). Optional — low priority; it imports nothing route-coupled.
- **DROPPED (no work):** home-screen mic / re-homed TALK centre. Spec Decision 5: voice is
  field-level only. Nothing to build or remove (it was never built).
- **DEFERRED (out of scope, flagged):** Capacitor native recording — `TODO(capacitor)` in
  `use-voice-recorder.ts:105`. Not a current build item; prerequisite before any native
  distribution. The voice-intent classifier (types + prompt scaffold) is likewise not part
  of this redesign delta.

## Schema & types

- **No schema change.** Confirmed against `_analysis/db-impact.json` (no voice/transcribe/
  Whisper/Groq/mic references) and 21-voice.md ("No database tables touched", "Nothing new
  in schema.ts"). No Drizzle migration.
- **`packages/types` additions:** none required. `RecorderState` and the recorder option/
  return types are client-only React types that belong with the component, not in shared
  `@camp404/types` (they reference DOM `AnalyserNode`/`MediaRecorder`). The existing
  `voice-intent.ts` types stay as-is (untouched, not consumed by this pipeline).

## Target API — function/module surface after this work

The transcribe pipeline's service surface is **unchanged**. The only edits are inside the
client component layer to support the review step.

| Symbol | Signature (params → return) | Location | Tier | Status |
|---|---|---|---|---|
| `transcribeAudio` | `(file: File, options?: { prompt?: string }) → Promise<string>` | `apps/web/lib/groq.ts` | apps/web/lib (Next-adjacent; SDK + env) | **REUSE** |
| `QUESTIONNAIRE_PROMPT` | `const string` | `apps/web/lib/voice-prompts.ts` | apps/web/lib (pure string) | **REUSE** (see Hybrid for optional move) |
| `POST /api/voice/transcribe` | `(Request) → NextResponse` | `apps/web/app/api/voice/transcribe/route.ts` | apps/web (route handler) | **REUSE** |
| `rateLimit` / `getClientIp` | `(key, opts) → { ok, retryAfterSeconds }` / `(Headers) → string` | `apps/web/lib/rate-limit.ts` | apps/web/lib | **REUSE** (shared infra) |
| `useVoiceRecorder` | `({ onTranscript, promptKey?, maxDurationMs? }) → { state, error, start, stop, reset, analyser, transcript?, accept?(text), discard? }` | `apps/web/components/voice/use-voice-recorder.ts` | apps/web (client hook) | **EXTEND** |
| `RecorderState` | union incl. new `"transcript-review"` | `apps/web/components/voice/use-voice-recorder.ts` | apps/web (client) | **EXTEND** |
| `RecorderPanel` | `({ onTranscript, onDismiss, promptKey? }) → JSX` | `apps/web/components/voice/recorder-panel.tsx` | apps/web (client) | **EXTEND** (props unchanged; add review UI) |
| `TranscriptResult` | `({ value, onChange, onAccept, onRediscard }) → JSX` (sub-component or inline section) | inside `recorder-panel.tsx` | apps/web (client) | **NEW** |
| `pickMimeType` (+ MIME list) | `() → string \| undefined` | `use-voice-recorder.ts` | apps/web (client; touches `MediaRecorder`) | **REUSE** |
| `appendTranscript` (per host) | `(text: string) → void` | host files (question.tsx, report-bug-dialog.tsx) | apps/web (client) | **REUSE** (candidate to dedupe; see Hybrid) |
| `DictateButton` | — | `apps/web/components/voice/dictate-button.tsx` | apps/web (client) | **DELETE** (optional) |
| `voiceIntentPrompt`, `VoiceIntent` | (existing) | `packages/ai-prompts`, `packages/types` | shared | **REUSE / untouched** (not in pipeline) |

`RecorderPanel`'s prop contract (`onTranscript`/`onDismiss`/`promptKey`) stays identical so
both hosts keep working without changes — the review step is internal to the panel. The
recommended hook shape exposes `transcript` (raw text held during review) plus `accept(text)`
(fire `onTranscript`, return to `idle`) and `discard()` (drop, return to `idle`), instead of
calling `onTranscript` inside `handleStop`. This keeps the commit decision in the hook and
the editable copy in the panel.

## Hybrid extraction — what is pure vs Next-coupled

Per the locked HYBRID decision: extract framework-agnostic logic to packages; leave
Next-coupled bits in `apps/web`.

**Pure / framework-agnostic — eligible to move (low value; recommend leave for now):**

- `appendTranscript` semantics — the append-not-overwrite + newline-joiner + clamp logic is
  duplicated identically in `question.tsx:433` and `report-bug-dialog.tsx:75` (only the
  `maxLength` constant differs). It is pure string manipulation with no React/Next imports.
  *Target if extracted:* a tiny pure helper `appendTranscript(existing, addition, maxLength): string`
  in `packages/types/src` (it has no DB/SDK dependency, and `packages/core` does not exist —
  creating a package for one 4-line function is not justified). **Recommendation: extract
  only if a third host appears; otherwise document the duplication.** It is the one genuinely
  shareable, testable nugget here.
- `QUESTIONNAIRE_PROMPT` — a pure constant string. Could live next to other prompt templates
  in `@camp404/ai-prompts` for consistency with `voiceIntentPrompt`/`PROMPT_VERSIONS`.
  *Target if moved:* `packages/ai-prompts/src/voice-prompts.ts`, re-exported from its index.
  **Recommendation: leave in `apps/web/lib/voice-prompts.ts`** — its sole consumer is the
  route handler in the same app; moving it adds an import hop for zero reuse benefit, and
  it is not a model prompt (it is a Whisper bias hint, a different concept from the Claude
  templates in `ai-prompts`). Revisit only if a second non-web consumer needs it.
- `pickMimeType` / `SUPPORTED_MIME_TYPES` — references the DOM `MediaRecorder` global, so it
  is **not** truly framework-agnostic (browser-only). Keep in the client hook.

**Must STAY in `apps/web` (Next-coupled / server-only / auth / DOM):**

- `apps/web/app/api/voice/transcribe/route.ts` — imports `next/server`, calls
  `getAuthenticatedUser()` (session), `rateLimit`/`getClientIp`. Route handler — stays.
- `apps/web/lib/groq.ts` — wraps the Groq SDK and reads `process.env.GROQ_API_KEY`. It is
  not Next-specific but it IS a server-side I/O adapter holding a secret; per the hybrid
  rule (leave anything that is an external-service/secret adapter near the app, like other
  `apps/web/lib` data-access shims) it stays in `apps/web/lib`. No reuse outside web today.
- `apps/web/lib/rate-limit.ts` — shared request-infra used by many routes; stays in app.
- `use-voice-recorder.ts`, `recorder-panel.tsx`, `waveform.tsx`, `TranscriptResult` — all
  `"use client"`, depend on `MediaRecorder`/`AudioContext`/`getUserMedia` and React. Stay.

Net: **no extraction is required to satisfy the spec.** The transcribe service is already
correctly factored (route = Next-coupled orchestration; `groq.ts`/`voice-prompts.ts`/
`rate-limit.ts` = app-lib adapters; component = client). The one optional dedupe
(`appendTranscript`) is deferred until a third host justifies it.

## Build steps — ordered, with acceptance criteria + test approach

There are **no existing tests** for the transcribe pipeline (verified: no
`__tests__/*voice*`, `*transcrib*`, or `*groq*`; the only voice test is
`packages/ai-prompts/src/__tests__/prompts.test.ts`, which covers the unrelated
voice-intent prompt). New tests below are net-new.

1. **EXTEND `useVoiceRecorder` to hold the transcript instead of auto-firing.**
   - In `handleStop`, on non-empty `data.text.trim()`: set internal `transcript` state and
     `state = "transcript-review"` (do NOT call `onTranscript` here). Empty/silent → `idle`
     unchanged. Errors → `error` unchanged.
   - Add `accept(text: string)` → `onTranscript(text)` then `reset()` to `idle`; `discard()`
     → clear `transcript`, `reset()` to `idle`.
   - Add `"transcript-review"` to `RecorderState`; expose `transcript`.
   - *Acceptance:* a successful transcription leaves the hook in `transcript-review` with the
     raw text available; `onTranscript` is NOT called until `accept` runs. Empty clip still
     returns silently to `idle`. Unmount-safety (`mountedRef`, handler clearing, stream
     teardown, `AudioContext.close`, timeout clear) preserved.
   - *Test:* unit-test the hook with a mocked `fetch` + `MediaRecorder`/`getUserMedia`
     (jsdom + manual mocks) under `apps/web/components/voice/__tests__/use-voice-recorder.test.ts`:
     success → `transcript-review` + transcript set + `onTranscript` not yet called;
     `accept` → `onTranscript(edited)` once + `idle`; `discard` → `idle`, no call; empty
     blob → silent `idle`; 429 body → `error` with server message.

2. **NEW `TranscriptResult` review UI in `RecorderPanel`.**
   - On `state === "transcript-review"`, hide the ring/state region and render the review
     card (21-voice.md §3): `check` header "Transcript ready — review & edit"; an **editable**
     `Textarea` seeded from `transcript`; action row `Re-record` (outline → `discard()`) and
     `Use this text` (primary → `accept(editedValue)`). Match Open-question resolutions in
     the spec: editable in place (#7), state ring hidden during review (#1).
   - Keep `RecorderPanel` props identical so both hosts are untouched.
   - *Acceptance:* after a recording, the panel shows the editable transcript; editing then
     `Use this text` appends the **edited** text to the host field (verified via host's
     `appendTranscript`); `Re-record` returns to `idle` with the host field unchanged; panel
     stays open for another recording.
   - *Test:* RTL render test of `RecorderPanel` with a fake hook return: review state shows
     `Textarea` + both buttons; `Use this text` calls `onTranscript` with edited value;
     `Re-record` does not call `onTranscript`. X-close disabled while `isRecording || isBusy`.

3. **REUSE-verify the route + service contract (regression guard, no code change).**
   - Add a route test `apps/web/app/api/voice/transcribe/__tests__/route.test.ts` mocking
     `getAuthenticatedUser`, `rateLimit`, and `transcribeAudio`: 401 unauthenticated; 429 with
     `retryAfterSeconds` + `Retry-After` header when limiter returns `!ok`; 400 missing/invalid
     `audio`; 415 non-`audio/*`; 413 over `MAX_BYTES`; `promptKey="questionnaire"` →
     `transcribeAudio` called with `QUESTIONNAIRE_PROMPT`; unknown/absent key → `prompt:
     undefined`; 502 masks Groq errors ("Voice not configured" vs "Transcription failed").
   - *Acceptance:* all branches asserted; documents the contract the redesign relies on.

4. **(Optional, low priority) DELETE `dictate-button.tsx`.**
   - *Acceptance:* grep confirms no consumers (already true); removing it breaks no build.
     Keep `waveform.tsx` and `use-voice-recorder.ts` (both still used by `RecorderPanel`).

5. **(Optional, deferred) Document Capacitor native path + rate-limit retry UX.**
   - No build. Leave `TODO(capacitor)` as the single native entry point; if surfacing
     `retryAfterSeconds` countdown in the `error` state is desired (spec Open-question #3),
     it is a presentation-only follow-up reading the already-returned `retryAfterSeconds`.

## Cross-domain dependencies

- **Auth / session** — `getAuthenticatedUser()` (`apps/web/lib/auth.ts`) gates the route.
  Truthiness check only: no rank/approval check (spec Open-question #5 — likely intentional,
  gating is upstream at the host surface; confirm as an explicit security decision).
- **Rate-limit infra** — shared `apps/web/lib/rate-limit.ts` (`rateLimit`, `getClientIp`),
  in-memory token bucket; would need an Upstash/Redis swap if the deploy fans out across
  regions (noted in that file).
- **Questionnaire domain** — `LongTextField` writes the appended transcript into the host
  form's `responses` value, persisted to `burner_profiles.responses` (jsonb) only on form
  submit. Clamped to `question.maxLength`. No direct DB write from this domain.
- **Feedback domain** — `ReportBugDialog` appends into the GitHub-issue description, clamped
  to `DESCRIPTION_MAX` (`apps/web/lib/github-feedback.ts`). Separately, `feedback-ai.ts` uses
  `anthropic()` + `MODELS` to structure the report — adjacent but independent of transcription.
- **External services** — Groq Whisper (`whisper-large-v3-turbo`, `GROQ_API_KEY`). No DB,
  no Drizzle, no `packages/db` involvement; audio is never persisted.
- **No dependency** on the captain-promotion schema change or any other redesign migration.
