# 21-voice — app integration plan

- **Route(s):** n/a — embedded `RecorderPanel` + `POST /api/voice/transcribe`
- **MOUNTED/EMBEDDED (no own route)** — mounted inside two host surfaces:
  - `LongTextField` sub-renderer in `apps/web/components/questionnaire/question.tsx` (line 458) — bound to any `long_text` questionnaire field; currently mounted on all `long_text` kinds, with bio/ideas (`promptKey="questionnaire"`) being the board-canonical dictation-enabled fields; used on routes `/onboarding/questionnaire` and `/forms/[key]`
  - `ReportBugDialog` in `apps/web/components/feedback/report-bug-dialog.tsx` (line 217) — the global overlay accessible from any authenticated surface; no `promptKey`

---

## Current state — the existing route/files today

Verified by reading all source files in full. Every path below was confirmed present.

### Client components

**`apps/web/components/voice/recorder-panel.tsx`** (125 lines, `"use client"`)
The live panel. A bordered card (`rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4`) with:
- Header row: `text-sm font-medium` status label (derived from `state`) + ghost `X` Button (`aria-label="Close dictation"`, disabled while `isRecording || isBusy`).
- Centred 64×64 `Button rounded-full variant={isRecording ? "destructive" : "default"}` for record/stop — circle not a ring container. Displays `Loader2`/`Square`/`Mic` icons.
- `<Waveform analyser={analyser} active={isRecording} />` canvas.
- `mm:ss` mono timer shown while `isRecording`.
- `role="alert"` error `<p>` when `error` is set.

**Gap vs spec:** `onTranscript` fires immediately on non-empty `data.text.trim()` (in `handleStop`, `use-voice-recorder.ts:207`). There is **no transcript-review step** (`TranscriptResult` card). This is the primary divergence from board S21. Ring is 64×64, not the board-specified 96×96. Verbose `[color:var(--color-*)]` token syntax throughout. `maxDurationMs` is not threaded through `RecorderPanelProps`. No per-state sub-labels or "Try again" button in error state. No `motion-safe:` guards on spinner/waveform.

**`apps/web/components/voice/use-voice-recorder.ts`** (224 lines, `"use client"`)
Hook exports `RecorderState = "idle" | "requesting" | "recording" | "processing" | "error"` — no `"transcript-review"` member. Returns `{ state, error, start, stop, reset, analyser }` — no `transcript`, `accept`, or `discard` surface.

**`apps/web/components/voice/waveform.tsx`** (97 lines, `"use client"`)
Canvas time-domain waveform. `aria-hidden`. Verbose token `text-[color:var(--color-primary)]` in className.

**`apps/web/components/voice/dictate-button.tsx`** (90 lines, `"use client"`)
Dead orphan. Confirmed no live consumer: `grep -r "DictateButton" apps/web` returns only its own definition. Explicitly marked DROPPED in `component-library.md`.

### API route

**`apps/web/app/api/voice/transcribe/route.ts`** (78 lines, `runtime = "nodejs"`)
Fully functional `POST` handler. Auth via `getAuthenticatedUser()` (truthiness only — no rank/approval check); dual rate-limit (`voice-transcribe:{userId}` 30 req/60s, `voice-transcribe-ip:{ip}` 60 req/60s); validates `audio` File, `audio/*` MIME, `<= 10 MB`; maps `promptKey` against `ACCEPTED_PROMPT_KEYS = Set(["questionnaire"])` → `QUESTIONNAIRE_PROMPT`; calls `transcribeAudio(file, { prompt })`; masks Groq internals on 502. Returns `{ text }` on 200 or `{ error, retryAfterSeconds? }` on error statuses.

### App-lib dependencies (all REUSE, no change)

| File | Role |
|---|---|
| `apps/web/lib/groq.ts` | `transcribeAudio(file, opts?)` — lazy Groq singleton, `whisper-large-v3-turbo`, `temp: 0` |
| `apps/web/lib/voice-prompts.ts` | `QUESTIONNAIRE_PROMPT` — Whisper Afrikaburn bias string |
| `apps/web/lib/rate-limit.ts` | `rateLimit(key, { limit })` + `getClientIp(headers)` |

### Host consumers (current wiring)

**`apps/web/components/questionnaire/question.tsx`** (line 458):
```text
dictating === true  → <RecorderPanel onTranscript={appendTranscript} onDismiss={() => setDictating(false)} promptKey="questionnaire" />
dictating === false → <Button variant="outline" size="lg" …> Dictate instead </Button>
```
`appendTranscript` (lines 433–439): trims; no-ops on empty; `\n` joiner when `value` doesn't end in `\n\s*`; `.slice(0, question.maxLength)`.

**`apps/web/components/feedback/report-bug-dialog.tsx`** (line 217):
```text
dictating === true  → <RecorderPanel onTranscript={appendTranscript} onDismiss={() => setDictating(false)} />
dictating === false → <Button variant="outline" size="sm" …> Dictate instead </Button>
```
`appendTranscript` (lines 75–82): same semantics; `.slice(0, DESCRIPTION_MAX)` where `DESCRIPTION_MAX = 5000` (`apps/web/lib/github-feedback.ts:21`).

### No existing tests

Confirmed: no `__tests__/*voice*`, `*recorder*`, or `*transcrib*` files in `apps/web`. The only voice-adjacent test is `packages/ai-prompts/src/__tests__/prompts.test.ts` (the unrelated voice-intent prompt).

---

## File structure — target files in apps/web

| File | Status | Change |
|---|---|---|
| `apps/web/app/api/voice/transcribe/route.ts` | REUSE | No change to the route contract; add regression test only (see Build step 6) |
| `apps/web/components/voice/recorder-panel.tsx` | EXTEND | Add `TranscriptResult` review step; rebuild 96×96 ring; per-state sub-labels; "Try again" button; thread `maxDurationMs`; short-form tokens; `motion-safe:` guards |
| `apps/web/components/voice/use-voice-recorder.ts` | EXTEND | Add `"transcript-review"` to `RecorderState`; hold transcript internally in `handleStop` instead of auto-firing; expose `transcript`, `accept(text)`, `discard()` on return value |
| `apps/web/components/voice/waveform.tsx` | EXTEND | Token: `text-[color:var(--color-primary)]` → `text-primary`; add `motion-safe:` guard on RAF loop |
| `apps/web/components/voice/dictate-button.tsx` | DELETE | Dead orphan; zero consumers confirmed. Delete after verifying grep. `DictatePill` in `@camp404/ui` is the replacement trigger |
| `apps/web/components/questionnaire/question.tsx` | EXTEND | Replace inline `Button` "Dictate instead" with `<DictatePill onActivate={() => setDictating(true)} />` (wired in `molecule-dictatepill.md` Step 3); move trigger above Textarea in `<div className="flex justify-end">`; adopt `Textarea variant` prop; optionally extract `appendTranscript` to `@camp404/core` |
| `apps/web/components/feedback/report-bug-dialog.tsx` | EXTEND | Replace inline `Button` "Dictate instead" with `<DictatePill onActivate={() => setDictating(true)} />` (wired in `molecule-dictatepill.md` Step 4); optionally wire shared `appendTranscript` from `@camp404/core` |
| `apps/web/components/voice/__tests__/use-voice-recorder.test.ts` | CREATE | New unit tests (see Build step 4) |
| `apps/web/components/voice/__tests__/recorder-panel.test.tsx` | CREATE | New RTL tests (see Build step 5) |
| `apps/web/app/api/voice/transcribe/__tests__/route.test.ts` | CREATE | New route regression tests (see Build step 6) |
| `apps/web/components/voice/recorder-panel.stories.tsx` | CREATE | Storybook stories (see Build step 7) |
| `packages/ui/src/components/dictate-pill.tsx` | CREATE | New component — trigger pill; owned by `molecule-dictatepill.md` |

**No new pages, layouts, server actions, or loading/error/not-found boundaries.** This surface has no route of its own. The two host files (`question.tsx`, `report-bug-dialog.tsx`) already carry the necessary client-component and state machinery; only the dictation-trigger swap and token fixes apply to them in this plan.

---

## Components composed

All components in this surface are client-only. There is no server-component portion.

| Component | Plan | Package / location | Renders in | Role |
|---|---|---|---|---|
| `RecorderPanel` | [`molecule-recorderpanel.md`](../components/molecule-recorderpanel.md) | `apps/web/components/voice/recorder-panel.tsx` (app-local) | client (host mount) | The bordered state-card: ring, waveform, timer, TranscriptResult, error |
| `useVoiceRecorder` (hook) | [`molecule-recorderpanel.md`](../components/molecule-recorderpanel.md) §Composition | `apps/web/components/voice/use-voice-recorder.ts` | client | State machine: permission → record → stop → upload → transcript-review → idle/error |
| `Waveform` | [`molecule-recorderpanel.md`](../components/molecule-recorderpanel.md) §Composition | `apps/web/components/voice/waveform.tsx` | client | Canvas time-domain live waveform; `aria-hidden` |
| `TranscriptResult` (sub-section) | [`molecule-recorderpanel.md`](../components/molecule-recorderpanel.md) Step 6 | inline inside `recorder-panel.tsx` | client | Editable review card shown when `pendingTranscript !== null` |
| `DictatePill` | [`molecule-dictatepill.md`](../components/molecule-dictatepill.md) | `packages/ui/src/components/dictate-pill.tsx` (PROMOTE target) | client | `r:999` pill trigger; fires `onActivate` → host sets `dictating = true` |
| `LongTextField` (host body) | [`organism-longtextfield.md`](../components/organism-longtextfield.md) | `apps/web/components/questionnaire/question.tsx` (internal sub-renderer) | client | Owns `dictating` state; sibling-swaps `DictatePill` ↔ `RecorderPanel` |
| `ReportBugDialog` (host) | (no separate plan; lives in `apps/web/components/feedback/`) | `apps/web/components/feedback/report-bug-dialog.tsx` | client | Owns `dictating` state for the global bug-report overlay; no `promptKey` |
| `Button` | [`atom-button.md`](../components/atom-button.md) | `@camp404/ui/components/button` | client | Stop/Try-again/Re-record/Use-this-text/Close buttons inside panel |
| `Textarea` | [`atom-textarea.md`](../components/atom-textarea.md) | `@camp404/ui/components/textarea` | client | Editable review box in `TranscriptResult` + host field |
| `Mic`, `MicOff`, `Square`, `Loader2`, `RotateCcw`, `X`, `Check` | — | `lucide-react` | client | State icons |

`DictatePill` and `RecorderPanel` are **siblings** in the host render tree — they are never nested. The host owns `dictating: boolean` and swaps one for the other.

No shared canvas reusables (`TopChrome`, `SectionHeader`, `GridTile`, `EmptyState`, `CaptainLock`) are used by this surface.

---

## Services & data

### Service-layer classification

Per [`service-layer/07-voice.md`](../service-layer/07-voice.md): almost everything in the service layer is **REUSE**. The single substantive delta is the `transcript-review` presentation step, which is wholly inside the client component and hook — no service-layer change.

| Symbol | Location | Status | Tier | Called from |
|---|---|---|---|---|
| `transcribeAudio(file, opts?)` | `apps/web/lib/groq.ts` | REUSE | apps/web/lib (server-side SDK + env) | Route handler only |
| `QUESTIONNAIRE_PROMPT` | `apps/web/lib/voice-prompts.ts` | REUSE | apps/web/lib (pure string constant) | Route handler only |
| `POST /api/voice/transcribe` | `apps/web/app/api/voice/transcribe/route.ts` | REUSE | apps/web route handler | `fetch` inside `useVoiceRecorder.handleStop` |
| `rateLimit` / `getClientIp` | `apps/web/lib/rate-limit.ts` | REUSE | apps/web/lib (request infra) | Route handler only |
| `getAuthenticatedUser()` | `apps/web/lib/auth.ts` | REUSE | apps/web/lib (session) | Route handler only |
| `useVoiceRecorder` | `apps/web/components/voice/use-voice-recorder.ts` | EXTEND | apps/web client hook | `RecorderPanel` only |

### What is fetched server-side vs client

This surface has **no server-side data fetch**. The pipeline is entirely client-initiated:

1. Browser `MediaRecorder` captures audio (client).
2. `useVoiceRecorder.handleStop` builds a `FormData` and `fetch`-POSTs to `/api/voice/transcribe` (client → API route).
3. The route handler calls `transcribeAudio` (server, Groq SDK).
4. On 200 the hook receives `{ text: string }` and (after EXTEND) sets internal `transcript` state, entering `"transcript-review"`.
5. After the member taps "Use this text", `props.onTranscript(editedText)` fires into the host's `appendTranscript` closure, which updates local React state in `LongTextField` or `ReportBugDialog`.
6. The transcript reaches the database **only when the host form is submitted** — via `saveBurnerProfile` (onboarding, `apps/web/app/onboarding/questionnaire/actions.ts`) or the questionnaire runner's server action. `ReportBugDialog` sends it as part of `submitFeedbackAction` (`apps/web/app/feedback/actions.ts`). Neither action is touched by this surface's build.

### No new schema, no new db calls

Audio is never persisted. No `packages/db` involvement. The redesign's one schema change (`captain_promotion_requests`, migration 0012) is unrelated to voice.

### `appendTranscript` dedupe opportunity

The append-not-overwrite + newline-joiner + clamp logic is duplicated identically in `question.tsx:433–439` and `report-bug-dialog.tsx:75–82`. `service-layer/07-voice.md §Hybrid` flags this as the one genuinely shareable nugget: a pure 4-line function `appendTranscript(existing, addition, maxLength): string`. Per `architecture.md`, the target is `@camp404/core`. Extract when `@camp404/core` exists and a third host appears; until then leave inline (as documented in both the service-layer and organism plans). This plan does not gate on the extraction — both hosts continue to work with local closures.

---

## Gating

**Gate level: none — no rank/clearance check inside the pipeline.**

`RecorderPanel` and `useVoiceRecorder` have no rank awareness. They are embedded inside host surfaces that handle their own access gating upstream. The API route (`/api/voice/transcribe`) checks `getAuthenticatedUser()` truthiness only — no `approval_status`, `required_actions`, or `rank` check (confirmed: `route.ts:15–18`). Any authenticated user who reaches the endpoint can transcribe; gating is upstream at the host surface.

**CaptainLock: NOT applicable.** Voice dictation is not a captain/rank surface. The `preview-but-locked` grammar (locked decision 3, `architecture.md §Hybrid §requireClearance`) does not bind here. `CaptainLock` is never rendered. `RecorderPanel` has no inert/preview state related to rank.

The global state matrix from `21-voice.md §Global state matrix` confirms:
- Invite-gated / onboarding-incomplete / pending approval / captain-locked states are **not expressed** inside the pipeline.
- These are handled upstream by the host surface's gating spine before `RecorderPanel` is ever mounted.

---

## States

### RecorderPanel internal states

| State | `RecorderState` | Status label | Ring | Waveform | Timer | Extra |
|---|---|---|---|---|---|---|
| **idle** | `"idle"` | "Tap to record" | `bg-muted border-border`, `Mic text-foreground` | flat idle line, `opacity-40` | hidden | Record button enabled |
| **requesting** | `"requesting"` | "Allow microphone…" | `border-2 border-accent`, `Mic text-accent` | flat idle | hidden | Record button disabled; sub-label: "Your browser is asking permission to use the mic." |
| **recording** | `"recording"` | "Recording" | `bg-primary/15 border-2 border-primary`, `Mic text-primary` | animating, `text-primary` | shown `mm:ss` | Full-width "Stop & transcribe" `Button variant="default"` below ring |
| **processing** | `"processing"` | "Transcribing…" | `border-2 border-accent`, `Loader2 text-accent motion-safe:animate-spin` | flat idle | hidden | Sub-label: "Turning your audio into text." Record button disabled |
| **error** | `"error"` | "Tap to retry" | `bg-destructive/12 border-2 border-destructive`, `MicOff text-destructive` | flat idle | hidden | `role="alert"` error message; outline "Try again" button with `RotateCcw` icon |
| **transcript-review** | derived (`pendingTranscript !== null`) | — (header row hidden during review) | Ring area replaced by `TranscriptResult` | hidden | hidden | Editable `Textarea` seeded from transcript; "Re-record" (outline) + "Use this text" (primary) action row |

X close: disabled while `state === "recording" || state === "requesting" || state === "processing"`.

### TranscriptResult states

| Sub-state | Trigger | Render |
|---|---|---|
| **reviewing** | non-empty `pendingTranscript` set | `Check text-accent` header + "Transcript ready — review & edit"; `Textarea value={editedTranscript}`; action row |
| **edited** | user types in the Textarea | `editedTranscript` updates; host field unaffected until "Use this text" |
| **accepted** | "Use this text" | `props.onTranscript(editedTranscript)` fires; `pendingTranscript = null`; panel → `idle` |
| **discarded** | "Re-record" | `pendingTranscript = null`; `reset()`; panel → `idle`; `props.onTranscript` NOT called |

### Empty/loading/error/submitting/success matrix

| State | How it manifests |
|---|---|
| **Empty (silent clip, blob size === 0)** | `handleStop` detects `blob.size === 0` before upload; returns silently to `idle`; `onTranscript` never called. Current `use-voice-recorder.ts:184–186` — preserved by EXTEND. |
| **Loading/submitting** | `requesting` (mic prompt) and `processing` (upload in-flight) — spinner, buttons disabled |
| **Populated (transcript ready)** | `pendingTranscript` non-null → `transcript-review` state; panel stays open for further recordings after commit |
| **Validation error** | Transcript clamped to `maxLength` on append in the host's `appendTranscript`; no inline error banner inside the panel itself |
| **Transcription success** | Non-empty `data.text.trim()` → `transcript-review` state; `onTranscript` deferred to user confirm |
| **Disabled** | Record button: disabled while `isBusy`. X close: disabled while `isRecording \|\| isBusy`. "Stop & transcribe": enabled only during `recording` |
| **Error** | Permission denied / hardware error / API error / 429 → `error` state; `role="alert"` message + "Try again" outline button |
| **Rate-limited (429)** | `handleStop` throws with server's `error` string; panel enters `error` state. `retryAfterSeconds` available in body but not currently surfaced as a countdown (open question #3) |
| **Auth (401)** | `handleStop` throws "Unauthorized"; panel enters `error` state. Route is auth-gated; 401 only reachable if session expired mid-recording |

---

## Build steps

Dependencies must land in order. Within each step, accept criteria define what "done" means. Each step must be independently CI-green before the next begins (MEMORY: green-CI-is-done).

### Prerequisites (must exist before any voice step)

1. **`foundations-tokens` Phase 0** — `bg-primary/15`, `bg-destructive/12`, `border-accent`, `border-destructive`, `border-primary`, `text-primary`, short-form token utilities resolving via `globals.css`. Required by the ring token changes.
2. **`molecule-dictatepill.md` Steps 1–2** — `DictatePill` built in `packages/ui/src/components/dictate-pill.tsx` and exported. Required before host wiring steps.

### Step 1 — EXTEND `useVoiceRecorder` to hold transcript instead of auto-firing

**Files:** `apps/web/components/voice/use-voice-recorder.ts`

In `handleStop` (`line 177`), on non-empty `data.text.trim()` (currently line 207: `if (data.text.trim()) onTranscript(data.text)`): **do NOT call `onTranscript` here**. Instead set internal `transcript` state and `state = "transcript-review"`. Add to `RecorderState` union: `| "transcript-review"`. Add internal state `const [transcript, setTranscript] = React.useState<string | null>(null)`. On success: `setTranscript(data.text); safeSet(setState, "transcript-review")`. Empty/silent clip → `idle` unchanged. Errors → `error` unchanged.

Add to return value:
- `transcript: string | null` — the raw Whisper text held during review.
- `accept(text: string): void` — calls `onTranscript(text)` then `reset()` to `idle`; clears `transcript`.
- `discard(): void` — clears `transcript`; calls `reset()` to `idle`. Does NOT call `onTranscript`.

Unmount safety: ensure `accept`/`discard` guard on `mountedRef.current` before calling `setState`. `transcript` is cleared in `reset()`. Unmount cleanup (`useEffect` return, line 73) is unchanged — it does not need to flush `transcript` because audio is never persisted and the transcript is local React state.

**Acceptance:**
- Successful transcription leaves hook in `state = "transcript-review"` with non-null `transcript`.
- `onTranscript` is NOT called until `accept(text)` runs.
- `accept(editedText)` calls `onTranscript(editedText)` once and returns to `idle` with `transcript = null`.
- `discard()` returns to `idle` with `transcript = null`; `onTranscript` is never called.
- Empty blob still returns silently to `idle`; `transcript` stays null.
- 429 body error surfaces as `error` state with server's message string.
- All existing unmount-safety guards preserved.

### Step 2 — Fix verbose token syntax in `recorder-panel.tsx` and `waveform.tsx`

**Files:** `apps/web/components/voice/recorder-panel.tsx`, `apps/web/components/voice/waveform.tsx`

Replace all `[color:var(--color-*)]` verbose token usages:

| File | Before | After |
|---|---|---|
| `recorder-panel.tsx:76` | `border-[color:var(--color-border)]` | `border-border` |
| `recorder-panel.tsx:76` | `bg-[color:var(--color-card)]` | `bg-card` |
| `recorder-panel.tsx:111` | `text-[color:var(--color-muted-foreground)]` | `text-muted-foreground` |
| `recorder-panel.tsx:119` | `text-[color:var(--color-destructive)]` | `text-destructive` |
| `waveform.tsx:91` | `text-[color:var(--color-primary)]` | `text-primary` |

**Acceptance:** zero `[color:var(--color-` strings in both files; visual output unchanged; CI green independently.

### Step 3 — Rebuild the state ring to 96×96 board spec

**File:** `apps/web/components/voice/recorder-panel.tsx`

Replace the centred 64×64 `Button rounded-full` (lines 91–108) with the board's `w-24 h-24 rounded-full flex items-center justify-center` ring container + separate interactive elements:

- **Idle / error states:** ring is an interactive `<button type="button">` (`aria-label="Start recording"` / `aria-label="Retry"`) wrapping the icon, styled with state-specific ring classes. Clicking in idle calls `start()`; in error calls `reset()`.
- **Requesting / processing states:** ring is a non-interactive `<div aria-hidden>` (inert container during async operations).
- **Recording state:** ring is a non-interactive `<div aria-hidden>` containing the `Mic text-primary` icon; the interactive stop action is the full-width `Button variant="default" className="w-full gap-2"` with `Square` icon + "Stop & transcribe" label rendered below the ring (and above the waveform).

State-specific ring classes (from `molecule-recorderpanel.md §Tokens` ring table):

| State | Classes |
|---|---|
| idle | `bg-muted border border-border` |
| requesting | `border-2 border-accent` |
| recording | `bg-primary/15 border-2 border-primary` |
| processing | `border-2 border-accent` |
| error | `bg-destructive/12 border-2 border-destructive` |

Remove the single `handlePrimary` dispatcher; replace with explicit handlers per interactive element (`start` for idle ring, `reset` for error ring, `stop` for stop button). Remove `variant={isRecording ? "destructive" : "default"}` from the circular button (it no longer exists).

**Acceptance:**
- Ring is 96×96 in all five recorder states.
- Ring is a `<button>` (idle, error) or inert `<div>` (requesting, processing, recording).
- Idle ring: `bg-muted border-border`, `Mic text-foreground`.
- Recording ring: `bg-primary/15 border-2 border-primary`, `Mic text-primary`; full-width "Stop & transcribe" button below.
- Processing ring: `border-2 border-accent`, `Loader2 text-accent`; record button absent.
- Error ring: `bg-destructive/12 border-2 border-destructive`, `MicOff text-destructive`.
- `aria-label` present on all interactive ring buttons.

### Step 4 — Add per-state sub-labels and "Try again" button

**File:** `apps/web/components/voice/recorder-panel.tsx`

Below the ring area (and below the waveform/timer in recording state), render per-state sub-labels as defined in `molecule-recorderpanel.md §Tokens §Sub-labels`:

- Idle: `<p className="text-sm font-medium text-muted-foreground">Tap to start</p>` + `<p className="text-xs text-muted-foreground">Mic ready</p>`
- Requesting: `<p className="text-sm font-semibold text-foreground">Allow microphone access</p>` + `<p className="text-xs text-muted-foreground">Your browser is asking permission to use the mic.</p>`
- Processing: `<p className="text-sm font-semibold text-accent">Transcribing…</p>` + `<p className="text-xs text-muted-foreground">Turning your audio into text.</p>`
- Error: error string `<p role="alert" className="text-sm font-semibold text-destructive">{error}</p>` + `<p className="text-xs text-muted-foreground">Check that Camp 404 has microphone permission, then try again.</p>` (for permission errors) + `<Button variant="outline" className="gap-2" onClick={reset}><RotateCcw className="h-4 w-4" /> Try again</Button>`.

Import `RotateCcw`, `MicOff`, `Check` from `lucide-react` (currently only `Loader2, Mic, Square, X` are imported — `MicOff, RotateCcw, Check` are missing).

The header row status label continues to carry the short machine-readable label for AT.

**Acceptance:**
- All five recorder states show the correct sub-label copy per `molecule-recorderpanel.md §Tokens §Sub-labels`.
- Error state shows "Try again" outline button with `RotateCcw` icon; tapping it clears the error and returns to idle.
- Error `<p>` retains `role="alert"`.

### Step 5 — Add `transcript-review` state (`TranscriptResult`) and thread `maxDurationMs`

**File:** `apps/web/components/voice/recorder-panel.tsx`

Update `RecorderPanelProps` to add `maxDurationMs?: number`. Thread it to `useVoiceRecorder`.

Introduce local state `pendingTranscript: string | null` and `editedTranscript: string`. Wire the hook's new API:

```ts
const { state, error, start, stop, reset, analyser, transcript, accept, discard } = useVoiceRecorder({
  onTranscript: /* unused — hook now exposes accept/discard */,
  promptKey,
  maxDurationMs,
});
```

Note: `onTranscript` prop on the hook is still required by the `UseVoiceRecorderOptions` interface; pass a no-op `() => {}` — `accept(text)` is what calls `props.onTranscript`. Alternatively the hook can be revised to make `onTranscript` optional in Step 1; coordinate.

When `transcript` changes to non-null: `setPendingTranscript(transcript); setEditedTranscript(transcript)` (via `useEffect` on `transcript`).

When `pendingTranscript !== null`, replace the ring area with `TranscriptResult`:

```tsx
{pendingTranscript !== null ? (
  <div className="flex flex-col gap-2.5">
    <div className="flex items-center gap-1.5" aria-live="polite">
      <Check className="h-4 w-4 text-accent" aria-hidden />
      <p className="text-sm font-semibold text-foreground">
        Transcript ready — review &amp; edit
      </p>
    </div>
    <Textarea
      aria-label="Edit transcript"
      value={editedTranscript}
      onChange={(e) => setEditedTranscript(e.currentTarget.value)}
      rows={4}
      className="bg-muted border-border rounded"
    />
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={() => { discard(); setPendingTranscript(null); }}
      >
        Re-record
      </Button>
      <Button
        type="button"
        variant="default"
        className="flex-1"
        onClick={() => { accept(editedTranscript); setPendingTranscript(null); }}
      >
        Use this text
      </Button>
    </div>
  </div>
) : (
  /* ring area per current state */
)}
```

X close button: add `state === "transcript-review"` to the disabled condition (prevent dismissal mid-review if desired) — or leave enabled so the member can abandon without committing. Per `21-voice.md §User actions` "Tap X / Close dictation" → `onDismiss()` is always available from `idle`; during transcript-review the panel is at `state === "transcript-review"` (which is not `isRecording || isBusy`) so the X is currently enabled. Leave it enabled; member can dismiss without using the transcript. Document this as a build decision.

**Acceptance:**
- After a successful transcription (non-empty), TranscriptResult section renders with the transcript text in an editable Textarea; the ring area is hidden.
- Editing the Textarea changes `editedTranscript` but does NOT affect the host field.
- "Use this text" calls `props.onTranscript` (via `accept(editedTranscript)`) with the edited text; `TranscriptResult` hides; panel returns to `idle`.
- "Re-record" calls `discard()`; `TranscriptResult` hides; panel returns to `idle`; `props.onTranscript` is NOT called.
- Empty transcripts (`data.text.trim() === ""`) → no review step; panel silently returns to `idle` (hook-level guard, preserved from Step 1).
- `maxDurationMs` prop: `RecorderPanel maxDurationMs={60_000}` stops recording after 60 s.
- Panel stays open at `idle` after either action — the member can record again and the next transcript appends again.

### Step 6 — Add `motion-safe:` guards

**Files:** `apps/web/components/voice/recorder-panel.tsx`, `apps/web/components/voice/waveform.tsx`

- In `recorder-panel.tsx`: replace bare `animate-spin` on `Loader2` with `motion-safe:animate-spin`.
- In `waveform.tsx` (`draw` function, line 77): gate the `requestAnimationFrame(draw)` call behind `window.matchMedia("(prefers-reduced-motion: no-preference)").matches`. When reduced motion is preferred, draw a single static flat line (the existing `drawIdle()` path) and do not start the RAF loop.

**Acceptance:** with OS `prefers-reduced-motion: reduce` set, the spinner is static and the waveform does not animate; both render correctly in reduced-motion environments.

### Step 7 — Wire `DictatePill` into host consumers

**Prerequisite:** `molecule-dictatepill.md` Steps 1–2 (component exists in `@camp404/ui` and is exported).

**File:** `apps/web/components/questionnaire/question.tsx` (co-ordinated with `molecule-dictatepill.md` Step 3 — perform the edit once, not twice)

Replace the inline `Button variant="outline" size="lg"` block (lines 464–473) with `<DictatePill onActivate={() => setDictating(true)} />` inside `<div className="flex justify-end">` (above the Textarea, per `organism-longtextfield.md` Step 1). Remove the `Mic` import from `lucide-react` if no longer used in this function.

**File:** `apps/web/components/feedback/report-bug-dialog.tsx` (co-ordinated with `molecule-dictatepill.md` Step 4)

Replace the inline `Button variant="outline" size="sm"` block (lines 222–231) with `<DictatePill onActivate={() => setDictating(true)} />`.

**Acceptance:**
- Both consumers render the `r:999` pill shape; voice flow is unchanged.
- Tapping the pill in each host sets `dictating = true` and mounts `RecorderPanel` with the correct `promptKey` and `onTranscript`/`onDismiss` callbacks.
- `RecorderPanel` (now with transcript-review step from Step 5) works end-to-end in both hosts.
- `appendTranscript` receives the edited transcript text (not the raw Whisper output) via `props.onTranscript`.

### Step 8 — Delete `dictate-button.tsx`

**Prerequisite:** `DictatePill` is wired into both consumers (Step 7 complete).

Verify no remaining imports: `grep -r "dictate-button\|DictateButton" apps/web --include="*.tsx" --include="*.ts"`. If the grep returns zero results (confirming the dead orphan status already established), delete `apps/web/components/voice/dictate-button.tsx`.

**Acceptance:** file deleted; CI green (`pnpm --filter @camp404/web build` + lint); no import errors anywhere.

### Step 9 — Unit tests: `useVoiceRecorder`

**File:** `apps/web/components/voice/__tests__/use-voice-recorder.test.ts` (CREATE)

Mock `fetch`, `MediaRecorder`, and `navigator.mediaDevices.getUserMedia` (jsdom + `vi.stubGlobal`).

| Test | Assertion |
|---|---|
| Successful transcription → `transcript-review` state | `fetch` resolves `{ text: "hello" }` → `state === "transcript-review"`, `transcript === "hello"`, `onTranscript` NOT called |
| `accept(editedText)` calls `onTranscript` + returns to `idle` | `accept("edited hello")` → `onTranscript` spy called with `"edited hello"` once; `state === "idle"`; `transcript === null` |
| `discard()` returns to `idle` without calling `onTranscript` | `discard()` → `state === "idle"`; `onTranscript` spy NOT called |
| Empty blob → silent `idle` | `blob.size === 0` path → `state === "idle"`; `transcript === null`; `onTranscript` NOT called |
| 429 body → `error` state with server message | `fetch` returns 429 + `{ error: "Rate limit exceeded" }` → `state === "error"`, `error === "Rate limit exceeded"` |
| Permission denied → `error` state with "Microphone permission denied" | `getUserMedia` throws `NotAllowedError` → `state === "error"`, `error === "Microphone permission denied"` |
| `reset()` clears error and returns to `idle` | call `reset()` from `error` → `state === "idle"`, `error === null` |
| Unmount during `processing` does not throw | unmount while fetch is in-flight → no `setState` called after unmount |
| `maxDurationMs` prop reaches timeout | `setTimeout` fires after custom duration → `stop()` called |

**Acceptance:** all tests pass via `pnpm --filter @camp404/web test`.

### Step 10 — RTL tests: `RecorderPanel`

**File:** `apps/web/components/voice/__tests__/recorder-panel.test.tsx` (CREATE)

Mock `useVoiceRecorder` via `vi.mock("../use-voice-recorder")`.

| Test | Assertion |
|---|---|
| Renders idle state | "Tap to record" present; ring has `bg-muted` class; `Mic` icon present |
| Idle ring click calls `start()` | `userEvent.click` ring → `start` spy called once |
| Record button disabled in requesting state | interactive ring/button is `disabled` or `aria-disabled` |
| Record button disabled in processing state | same |
| X close button disabled while recording | `disabled` on close button when `state="recording"` |
| X close button disabled while processing | same for `state="processing"` |
| X close button calls `onDismiss` when idle | `userEvent.click` → `onDismiss` spy called |
| "Stop & transcribe" appears only in recording state | visible in recording; absent in idle/processing/error |
| Error state renders `role="alert"` with error message | `getByRole("alert")` contains error string |
| "Try again" in error state calls `reset()` | `userEvent.click "Try again"` → `reset` spy called |
| TranscriptResult renders after successful transcription | mock `transcript` non-null → "Transcript ready — review & edit" visible; Textarea contains transcript |
| TranscriptResult Textarea is editable | `userEvent.type` changes Textarea value |
| "Use this text" calls `accept` with edited text | edit Textarea → click "Use this text" → `accept` spy called with edited value |
| "Use this text" hides TranscriptResult | after click → TranscriptResult hidden; ring area restored |
| "Re-record" calls `discard` and hides TranscriptResult | `userEvent.click "Re-record"` → `discard` spy called; TranscriptResult hidden |
| `maxDurationMs` prop threaded to hook | verify prop reaches `useVoiceRecorder` options |
| Short-form token classes only | no `[color:var(--color-` in rendered className |
| Ring 96×96 (`w-24 h-24`) in all states | class `w-24` present on ring container across all mock states |

**Acceptance:** all tests pass via `pnpm --filter @camp404/web test`.

### Step 11 — Route regression tests: `/api/voice/transcribe`

**File:** `apps/web/app/api/voice/transcribe/__tests__/route.test.ts` (CREATE)

Mock `getAuthenticatedUser`, `rateLimit`, `transcribeAudio`. No real Groq calls.

| Test | Assertion |
|---|---|
| 401 unauthenticated | `getAuthenticatedUser` returns null → 401 `{ error: "Unauthorized" }` |
| 429 user rate-limit hit | `rateLimit` returns `{ ok: false, retryAfterSeconds: 30 }` → 429 + `Retry-After: 30` header |
| 400 missing audio field | form has no `audio` → 400 `{ error: "Missing 'audio' file" }` |
| 415 non-audio MIME | `audio` file with `text/plain` type → 415 |
| 413 oversized audio | `audio` file `> MAX_BYTES` → 413 |
| `promptKey="questionnaire"` → `transcribeAudio` called with `QUESTIONNAIRE_PROMPT` | spy asserts `options.prompt === QUESTIONNAIRE_PROMPT` |
| Unknown `promptKey` → `prompt: undefined` | spy asserts `options.prompt === undefined` |
| Absent `promptKey` → `prompt: undefined` | same |
| 502 masks GROQ_API_KEY message | `transcribeAudio` throws `Error("GROQ_API_KEY is not set")` → 502 `{ error: "Voice not configured" }` |
| 502 masks generic Groq error | `transcribeAudio` throws generic → 502 `{ error: "Transcription failed" }` |
| 200 success | `transcribeAudio` resolves `"hello"` → 200 `{ text: "hello" }` |

**E2E_TEST_MODE seam:** the route uses `getAuthenticatedUser()` from `apps/web/lib/auth.ts`. In test mode (`TEST_MODE=true` env var), `apps/web/lib/test-mode.ts` swaps the auth backend for `test-store` (confirmed pattern from existing surface tests). The route regression test should use this seam: set `TEST_MODE=true` + inject a test user via `test-store` for the authenticated-path tests, rather than mocking `getAuthenticatedUser` directly. This keeps the test closer to the real request path.

**Acceptance:** all branches asserted; route contract documented; tests pass via `pnpm --filter @camp404/web test`.

### Step 12 — Storybook stories

**File:** `apps/web/components/voice/recorder-panel.stories.tsx` (CREATE)

Stories app-local because `RecorderPanel` is app-local (browser globals, hook). Mock `useVoiceRecorder`.

| Story | Setup |
|---|---|
| `Idle` | `state="idle"` via mocked hook |
| `Requesting` | `state="requesting"` — ring `border-accent`, button disabled |
| `Recording` | `state="recording"`, mock `AnalyserNode` — ring `bg-primary/15`, full-width stop button, timer |
| `Processing` | `state="processing"` — ring `border-accent`, spinner |
| `ErrorPermission` | `state="error"`, `error="Microphone permission denied"` — ring `bg-destructive/12`, "Try again" |
| `TranscriptReview` | `transcript` set to sample text — review card visible, editable Textarea |
| `TranscriptReviewEdited` | Same + user edits — confirms editable value |
| `GenericVariant` | No `promptKey` — visual parity with questionnaire variant |

**Acceptance:** all stories render without console errors; token classes short-form only; TranscriptReview story shows editable Textarea.

---

## Open items

Surface-specific decisions; cross-ref `21-voice.md §Open questions`.

1. **TranscriptResult: state ring visibility during review.** The board shows `TranscriptResult` as a distinct frame below the state card, which could imply both are simultaneously visible. `molecule-recorderpanel.md Step 6` and this plan resolve as: **state ring hidden during review** (either the ring area OR TranscriptResult is rendered at one time). Confirm with design if both should coexist. If the ring should remain visible in an `idle` state while review is showing, the `pendingTranscript !== null` guard must be layered rather than exclusive.

2. **DictatePill extraction and placement.** The trigger swap (pill above Textarea in `LongTextField`) is co-ordinated with `molecule-dictatepill.md` Steps 3–4 and `organism-longtextfield.md` Step 1. Do not duplicate the edit. The host-layout move (pill above vs below Textarea) is a `LongTextField` concern, not a `RecorderPanel` concern.

3. **Rate-limit retry UX (`retryAfterSeconds`).** The 429 body returns `retryAfterSeconds`. Currently the error state shows a plain error string. Surface a countdown timer or "try again in X seconds" message in the error state? This is a presentation-only follow-up; the data is already in the error path. Flag as low-priority enhancement. `21-voice.md §Open questions #3`.

4. **Capacitor native path.** `TODO(capacitor)` at `use-voice-recorder.ts:105` — swap `MediaRecorder` for `@capgo/capacitor-voice-recorder` on native builds. Not in scope for this pass. Prerequisite before any native distribution. `21-voice.md §Open questions #4`.

5. **Auth asymmetry at the route.** `/api/voice/transcribe` checks `getAuthenticatedUser()` truthiness only — no `approval_status`, `required_actions`, or rank check. This is likely intentional (the route is only reachable from already-gated host surfaces), but should be confirmed as an explicit security decision rather than an oversight. `21-voice.md §Open questions #5`. Gate for ship: get a recorded decision from the lead architect before the route goes to production.

6. **`prefers-reduced-motion`.** Addressed in Step 6 of this plan (`motion-safe:animate-spin` on spinner; RAF loop gated in `waveform.tsx`). The static fallback for the waveform (flat line) is already implemented in `drawIdle()`. No new work after Step 6.

7. **Transcript edit affordance.** Resolved: use `<Textarea>` for inline editing (open question resolution in `molecule-recorderpanel.md §Gaps` and `21-voice.md §Open questions #7`). The editable `Textarea` is the default; no read-only div variant is needed.

8. **Per-field dictation toggle (other-burns, notes).** `organism-longtextfield.md §Step 5` and `§States §Note` document that steps 09 (other-burns) and 11 (dietary notes) should render plain Textarea without DictatePill. Until a question-level `dictation` flag is confirmed in the catalogue, keep current behaviour (pill on all `long_text`) and flag it. This is a `LongTextField` / questionnaire-catalogue concern, not a `RecorderPanel` concern.

9. **`onTranscript` hook option with `accept`/`discard`.** Step 1 revises `useVoiceRecorder` to hold transcript internally and expose `accept`/`discard`. The `onTranscript` option in `UseVoiceRecorderOptions` becomes the *final commit* path called inside `accept`. Coordinate: if `onTranscript` is made optional (since `RecorderPanel` only calls it via `accept`), verify that no other consumer passes it directly (confirm grep — currently both consumers pass `onTranscript` to `RecorderPanel`, which wires it to the hook; after Step 5 the panel wraps it, so the option can be kept non-optional with the panel passing its prop through `accept`). No behaviour change either way; document the wiring clearly.
