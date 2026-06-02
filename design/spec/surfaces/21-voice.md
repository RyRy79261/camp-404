# Voice dictation (RecorderPanel) — functional brief

- **Route(s):** n/a — embedded panel, no own route. Mounted by two host surfaces:
  - `LongTextField` inside the questionnaire runner (`/onboarding`, `/forms/[key]`) — `promptKey="questionnaire"`
  - Bug-report dialog (`ReportBugDialog`, global overlay) — no `promptKey` (unbiased)
- **Canonical board(s):** `S21 Voice dictation` (board #30, 430px, `design/.spec-extract/boards/30-s21-voice-dictation.txt`)
- **Also visible in:** `S05 Field kinds` (board #14) — shows the `DictateWrap / Dictate instead` button, the collapsed entry point on `long_text` fields
- **Superseded / dropped:** `DictateButton` (`apps/web/components/voice/dictate-button.tsx`) is a dead orphan variant — no consumers; board does not reference it; treat as dropped unless a designer explicitly revives it
- **Breakpoints:** mobile-first 430px (board canonical); expands to fill host column at any width — no breakpoint-specific layout changes inside the panel itself

---

## Purpose

Let a member dictate free-form prose into a `long_text` host field instead of typing on a phone in the desert. The user opts into dictation per-field, records audio in the browser via `MediaRecorder`, sees live waveform + elapsed timer while speaking, then reviews (and optionally edits) the returned transcript before committing it to the host field. Audio is never persisted; the transcript is the only output and is appended to (never replaces) whatever is already in the field.

The pipeline is: browser `MediaRecorder` → `POST /api/voice/transcribe` → Groq Whisper Large v3 Turbo → transcript text → host field.

---

## Layout & modules

RecorderPanel is an **inline panel** that replaces the "Dictate instead" button in place, below the host `Textarea`. It is not a modal or sheet. The full sequence of states are rendered inside a single bordered card (`rounded-md border bg-$card p-4`).

### 1. Entry point — DictatePill (collapsed state)

Lives on the `long_text` field, below the `Textarea`. Not part of RecorderPanel itself; rendered by the host.

- **Board:** `S05 / Kind/long_text / DictateWrap` — an outline button `gap:8 pad:[10,16] r:$radius fill:transparent stroke:$border` with `⊙ mic` + text "Dictate instead" (Inter/14/600/$foreground).
- **Live:** `Button variant="outline" size="lg"` with `<Mic>` icon + "Dictate instead" label.
- Tapping it sets local `dictating` state → unmounts the button → mounts `RecorderPanel` in its place.

### 2. RecorderPanel — state-driven content area

Header row (always present while panel is open):
- Left: status label (Inter/14/500) — content changes per state (see States)
- Right: ghost X button (`aria-label="Close dictation"`) — disabled while `isRecording || isBusy`

Primary region — one of four state views (per board outline):

**IDLE / ERROR (shared primary button slot):**
- 96×96 circular ring: fill `$muted` (idle) or `#f83e5a1f` (error); stroke `$border` (idle) or `$destructive` (error)
- Icon: `mic` ($foreground, idle) or `mic-off` ($destructive, error)
- Sub-label: "Tap to start" / "Mic ready" (idle) or "Couldn't reach the mic" / error description (error)
- Error state adds outline "Try again" button (`⊙ rotate-ccw + "Try again"`)

**REQUESTING ACCESS:**
- Ring stroke → `$accent`; icon `mic` in `$accent`
- Sub-label: "Allow microphone access" / "Your browser is asking permission to use the mic."

**RECORDING:**
- Ring fill `#ff008c26`; stroke `$primary`; icon `mic` in `$primary`
- Animated waveform bar row beneath ring (11 bars, varying heights, fill `$primary`)
- Elapsed timer: `mm:ss`, mono font, `$primary` colour
- Full-width "Stop & transcribe" button (`⊙ square` + label, fill `$primary`, text `$primary-foreground`)

**PROCESSING:**
- Ring stroke `$accent`; icon `loader` (spinning) in `$accent`
- Sub-label: "Transcribing…" / "Turning your audio into text."

### 3. TranscriptResult — review step (board-specified, NOT in live code)

Appears below the state card after a successful transcription, before the transcript is committed. This is a NEW step relative to the live implementation.

Structure (from board `TranscriptResult` frame):
- Header row: `⊙ check ($accent)` + "Transcript ready — review & edit" (Inter/13/600/$foreground)
- Editable text box: a readable/editable preview of the transcript (Inter/14/$foreground), in a `fill:$muted stroke:$border r:8` box
- Action row (two equal-width buttons, side by side):
  - "Re-record" — Button-Outline: dismisses the transcript, returns panel to `idle` for another attempt
  - "Use this text" — Button-Primary: fires `onTranscript(text)` with the (possibly edited) transcript, returns panel to `idle`

> **Decision required (see Open questions #1):** the board presents TranscriptResult as a separate card below the state card. The live code fires `onTranscript` immediately on transcription success and skips this review step entirely. The board is canonical; TranscriptResult must be built.

---

## Components used

| Component | Role | Key props / variants |
|---|---|---|
| `Button` (`@camp404/ui`) | DictatePill trigger, "Stop & transcribe", "Re-record", "Use this text", X close, "Try again" | `variant="outline"` (Dictate/Re-record/Try again/Close); `variant="default"` (Use this text / record btn idle); `variant="destructive"` (record btn while recording) |
| `Textarea` (`@camp404/ui` or native) | TranscriptResult editable preview | uncontrolled edit of the pending transcript string |
| `Waveform` (local, `apps/web/components/voice/waveform.tsx`) | Live audio amplitude visualisation during recording | `analyser: AnalyserNode\|null`, `active: boolean` |
| `useVoiceRecorder` (local hook, `apps/web/components/voice/use-voice-recorder.ts`) | State machine: permission → record → stop → upload → transcript | `onTranscript`, `promptKey?`, `maxDurationMs?` |
| `Mic`, `MicOff`, `Square`, `Loader2`, `RotateCcw`, `X`, `Check` (lucide-react) | State icons | — |

**New components introduced:**

- `RecorderPanel` (`apps/web/components/voice/recorder-panel.tsx`) — already exists; needs TranscriptResult step added
- `TranscriptResult` — a sub-component (or inline section) of `RecorderPanel` rendering the review / confirm step; does not yet exist in live code
- `DictatePill` — the "Dictate instead" entry-point button is currently inline in `LongTextField`; whether to extract it as a named component is a build decision (see Open questions #2)

No shared canvas reusables (`TopChrome`, `SectionHeader`, `DetailHeader`, `GridTile`, `Card`, `EmptyState`, `CaptainLock`) are used by this surface.

---

## States

### RecorderState enum (from `use-voice-recorder.ts`)

`idle | requesting | recording | processing | error`

Derived flags: `isRecording = state === "recording"` · `isBusy = state === "processing" || state === "requesting"`

### Panel state matrix

| State | Status label | Ring / Icon | Primary button | Waveform | Timer | Extra |
|---|---|---|---|---|---|---|
| **idle** | "Tap to record" | `$muted` ring / `mic $foreground` | `variant="default"` · `Mic` icon · enabled | flat idle line | hidden | — |
| **requesting** | "Allow microphone…" | `$accent` stroke / `mic $accent` | `variant="default"` · `Loader2` spinning · **disabled** | flat idle | hidden | Sub-label: "Your browser is asking permission to use the mic." |
| **recording** | "Recording" | `#ff008c26` fill / `$primary` stroke / `mic $primary` | `variant="destructive"` · `Square` (filled) · enabled | animating bars, `$primary` | shown `mm:ss` | "Stop & transcribe" full-width below ring |
| **processing** | "Transcribing…" | `$accent` stroke / `loader $accent` | `variant="default"` · `Loader2` · **disabled** | flat idle | hidden | Sub-label: "Turning your audio into text." |
| **error** | "Tap to retry" | `#f83e5a1f` fill / `$destructive` stroke / `mic-off $destructive` | `variant="default"` · `Mic` · enabled (resets to idle) | flat idle | hidden | Error message line `role="alert"`; outline "Try again" button |
| **transcript-review** (NEW) | — | TranscriptResult card replaces state ring | "Re-record" (outline) · "Use this text" (primary) | hidden | hidden | Editable transcript preview; panel returns to idle after either action |

### Global state matrix

| Global state | Applies here? | Treatment |
|---|---|---|
| **Empty (no prior text)** | Yes | Blob `size === 0` after stop → silent return to `idle`, no transcript fired |
| **Loading / Submitting** | Yes | `requesting` and `processing` states — spinner, button disabled |
| **Populated** | Yes | `onTranscript` fires; transcript appended to host field; panel returns to `idle` |
| **Validation error** | Partial | Transcript clamped to host field `maxLength` on append (no inline error banner inside the pipeline; host field's `Textarea maxLength` enforces typed input separately) |
| **Success** | Yes | `onTranscript` fires with non-empty `data.text.trim()`; state → `idle` |
| **Disabled** | Yes | Record button disabled while `isBusy`; X close disabled while `isRecording \|\| isBusy` |
| **Error** | Yes | See error state above; includes permission-denied, no-hardware, recording-failed, transcription-failed |
| **Invite-gated** | No | Not expressed inside the pipeline; host surface handles invite gating upstream |
| **Onboarding-incomplete** | No | Not expressed inside the pipeline |
| **Pending / Rejected approval** | No | Not expressed inside the pipeline |
| **Captain-locked (preview-but-locked)** | No | Not expressed inside the pipeline; RecorderPanel has no rank awareness |
| **Auth gate asymmetry** | Implicit | `/api/voice/transcribe` checks `getAuthenticatedUser()` truthiness only — no rank/approval check on the route; any authenticated user who reaches the endpoint can transcribe. Gating is upstream at the host surface, not in RecorderPanel. |

---

## User actions

| Action | Result |
|---|---|
| Tap "Dictate instead" | `dictating` state → `true`; DictatePill unmounts; `RecorderPanel` mounts in its place |
| Tap record button (idle) | `start()` called → mic permission prompt → state `requesting` → on grant: `recording` |
| Tap X / "Close dictation" | `onDismiss()` → panel unmounts; "Dictate instead" button returns. Disabled while `isRecording \|\| isBusy` |
| Permission granted | State → `recording`; waveform activates; timer starts |
| Permission denied | State → `error`; label "Microphone permission denied" shown |
| Tap "Stop & transcribe" (recording) | `stop()` → state `processing` → audio `POST /api/voice/transcribe` |
| Silent/empty clip (blob size 0) | No upload; state silently returns to `idle` |
| Transcription succeeds | State → `transcript-review`; `TranscriptResult` card shown with editable text |
| Edit transcript text | In-place edit of the pending transcript string; does not affect host field yet |
| Tap "Use this text" | `onTranscript(editedText)` fires; host field appended; panel → `idle` |
| Tap "Re-record" | Transcript discarded; panel → `idle`; ready for another recording |
| Tap record button (error) | `reset()` → state `idle`; error cleared |
| Auto-stop (2 min cap) | `setTimeout` fires `stop()` after `maxDurationMs = 120_000 ms`; normal transcription path |
| Record again (after success) | Panel stays open at `idle`; next recording appends another clip to the same host field |
| Rate limit hit (429) | State → `error`; error message from server `{error: "Rate limit exceeded"}` |

---

## Data & enums

### No database tables touched

Audio is never persisted. The transcript is the only output; it is held in host component local React state and written to the host domain table only when the host form submits.

### API contract

**Request:** `POST /api/voice/transcribe` (multipart/form-data)

| Field | Type | Notes |
|---|---|---|
| `audio` | `File` (`audio/*`) | Named `clip.webm` or `clip.m4a` depending on MIME selection |
| `promptKey` | `string` (optional) | Server-validated against `ACCEPTED_PROMPT_KEYS = Set(["questionnaire"])`; unknown keys → unbiased transcription |

**Response (success):** `{ text: string }` — 200

**Response (error):** `{ error: string, retryAfterSeconds?: number }` — 400 / 401 / 413 / 415 / 429 / 502

### Configurable values

| Constant | Value | Location |
|---|---|---|
| `maxDurationMs` | `120_000` ms (2 min) | `use-voice-recorder.ts:21–22` |
| `MAX_BYTES` | `10 MB` | `route.ts:9` |
| `ACCEPTED_PROMPT_KEYS` | `Set(["questionnaire"])` | `route.ts:10` |
| Rate limit (per user) | 30 req / 60s | `route.ts:20` |
| Rate limit (per IP) | 60 req / 60s | `route.ts:31` |
| Groq model | `whisper-large-v3-turbo` | `groq.ts:33` |
| `fftSize` | `1024` | `use-voice-recorder.ts:128` |
| `getUserMedia` constraints | `echoCancellation`, `noiseSuppression`, `autoGainControl` all `true` | `use-voice-recorder.ts:109–114` |

### MIME priority list

`audio/webm;codecs=opus` → `audio/webm` → `audio/mp4` (iOS Safari 14.3+) → `audio/ogg;codecs=opus` → browser default (fallback)

### Prompt keys

| Key | Used by | Behaviour |
|---|---|---|
| `"questionnaire"` | `LongTextField` in questionnaire runner | Whisper biased by `QUESTIONNAIRE_PROMPT` (camp jargon, Afrikaburn terms) |
| _(absent)_ | `ReportBugDialog` | Unbiased transcription |

### Host field constraints (where transcript lands)

| Host | Field type | `maxLength` | Clamping |
|---|---|---|---|
| Questionnaire `long_text` question | `burner_profiles.responses` (jsonb) | `question.maxLength` (default `1000`) | `.slice(0, question.maxLength)` |
| Bug-report dialog description | GitHub issue body | `DESCRIPTION_MAX = 5000` | `.slice(0, 5000)` |

### Nothing new in schema.ts

This surface introduces no new tables, columns, or enums.

---

## Validation & edge cases

- **Auth required:** `/api/voice/transcribe` returns 401 for unauthenticated callers. No rank or approval check on the route — gating is upstream at the host surface.
- **Empty/silent clip:** blob `size === 0` after recording stop → no upload, silent return to `idle`. `onTranscript` is never called.
- **Empty transcript:** `onTranscript` only fires when `data.text.trim()` is non-empty; consumers' `appendTranscript` also guards on empty.
- **Transcript append semantics:** newline joiner inserted only when existing value is non-empty AND does not already end in `\n\s*`; result sliced to host `maxLength`. Transcript is APPENDED, never replaces.
- **Auto-stop:** `setTimeout(stop, 120_000)` prevents runaway recordings; triggers the normal stop → transcription path.
- **Permission errors:** `NotAllowedError` → "Microphone permission denied"; `NotFoundError` → "No microphone found"; other → "Couldn't access microphone". Recorder `onerror` → "Recording failed".
- **Server error masking:** Groq internals never reach the client; 502 body is either "Voice not configured" (missing `GROQ_API_KEY`) or "Transcription failed".
- **Cross-browser MIME:** hardcoding `audio/webm` silently fails on iOS Safari — the MIME priority list is mandatory.
- **Dismiss disabled mid-capture:** X button is disabled while `isRecording || isBusy` to prevent orphaned audio.
- **Record button idempotent:** `start()` no-ops if already `recording` or `requesting`; `stop()` no-ops if recorder missing/inactive.
- **Unmount safety:** `useVoiceRecorder` clears event handlers before calling `stop()`, guards every `setState` behind `mountedRef`, stops stream tracks, closes `AudioContext`, clears the auto-stop timeout on unmount.
- **`webkitAudioContext` fallback:** used when `AudioContext` is absent (Safari < 14.1).
- **Native (Capacitor) path:** `TODO(capacitor)` exists in `use-voice-recorder.ts` for swapping `MediaRecorder` with `@capgo/capacitor-voice-recorder` on native builds; NOT implemented. Current pipeline is web-only.
- **Rate limit UX:** 429 response surfaces `retryAfterSeconds` in the body. The panel enters `error` state. No countdown timer is shown in the current live code; whether to surface retry timing is an open question.
- **TranscriptResult edit:** the editable preview box allows the member to correct transcription errors before committing. The edited text (not the raw Whisper output) is what gets appended to the host field.

---

## Flows

```
[long_text field rendered on OB Step 03 / OB Step 04 / questionnaire runner / S05]
  → user taps "Dictate instead"
      → RecorderPanel mounts (idle)

[RecorderPanel: idle]
  → user taps record button
      → state: requesting  (mic permission prompt)
          → permission denied → state: error
              → user taps "Try again" → reset() → state: idle
          → permission granted → state: recording
              → user taps "Stop & transcribe" OR auto-stop (2 min)
                  → state: processing  (upload to /api/voice/transcribe)
                      → success (non-empty text) → state: transcript-review
                          → user edits transcript (optional)
                          → "Use this text" → onTranscript(editedText) → host field appended → state: idle
                          → "Re-record" → transcript discarded → state: idle
                      → success (empty text) → state: idle  (silent, no append)
                      → error → state: error  (message shown)
                          → user taps record button → reset() → state: idle

[RecorderPanel: idle, after one or more recordings]
  → user taps record button → another recording appends to same host field
  → user taps X → onDismiss() → RecorderPanel unmounts → "Dictate instead" button returns

[Bug-report dialog]
  → same RecorderPanel flow, no promptKey, DESCRIPTION_MAX = 5000
```

---

## Divergences from feature-set reference

| Feature-set signal (21-voice-entry.md) | Board S21 / locked decisions | Resolution |
|---|---|---|
| Reference describes `RecorderPanel` as the in-use surface — correct | Board confirms: one bordered card, five state panels (IDLE / REQUESTING / RECORDING / PROCESSING / ERROR) + TranscriptResult | No conflict; boards are the primary source |
| Reference contract: `onTranscript` fires immediately on transcription success; panel returns to `idle` — **no review step** | Board shows a `TranscriptResult` frame with "Transcript ready — review & edit", editable text box, "Re-record" / "Use this text" — an explicit two-step confirm flow | **Board wins.** TranscriptResult review step must be built. This is the primary divergence between live code and spec. |
| Reference describes `DictateButton` as an orphaned dead variant | Board has no `DictateButton` frame | Confirmed dropped. Ship unmounted or delete. |
| Reference: `RecorderPanel` status label is a left-aligned text, X close is right-aligned | Board: state panels are centred cards with a label at the top (design label like "IDLE" in caps) + the ring + sub-labels | Board shows the design anatomy for each state; live code header row (label + X) is the interactive layer; these are complementary not conflicting. Board labels ("IDLE", "RECORDING", etc.) are design annotations, not UI copy. UI copy is from live code. |
| Reference: mic permission UX covers `NotAllowedError`, `NotFoundError`, fallback | Board ERROR panel shows "Couldn't reach the mic" / "Check that Camp 404 has microphone permission, then try again" — maps to the `NotAllowedError` case | Both captured in spec. Board represents the primary permission-denied error; full error taxonomy from live code is retained. |
| Decision 5: "field-level dictation only — no home-screen mic / no re-homed TALK centre" | Board S21 is entirely embedded-panel; no home-screen frame | Confirmed. Home mic is dropped. This brief is the complete voice spec. |
| Reference: rate limit hit surfaces a 429 with optional `retryAfterSeconds` | Board has no explicit 429 / rate-limit state frame | Board shows only ERROR with generic copy. 429 lands in the `error` state with server's message string. No special rate-limit frame needed; flag retry-timing UX as open question. |
| Reference notes `TODO(capacitor)` native path | Board has no native-specific frame | Web-only scope confirmed for now; native path documented as a future TODO, not a current build item. |

---

## Open questions / build reconciliations

1. **TranscriptResult: inline vs separate card.** The board shows `TranscriptResult` as a distinct frame below the state card, suggesting it coexists with the (now idle) state ring. Clarify whether the state ring disappears once transcript-review is entered, or whether both cards are simultaneously visible. Recommended: transition the state region into the TranscriptResult card (state ring hidden during review); only show state card OR TranscriptResult at a time.

2. **DictatePill extraction.** The "Dictate instead" entry button is currently inline in `LongTextField`. For reuse across host surfaces (questionnaire vs bug dialog vs future hosts), extract as a named `DictatePill` component. Currently the bug-report dialog also inlines the button. Unify — or document as a known duplication.

3. **Rate limit retry UX.** The API returns `retryAfterSeconds` in 429 bodies (for user-limit hits). The current error state shows a plain error string. Consider showing a countdown or "try again in X seconds" message, especially on mobile in low-connectivity environments (Tankwa Karoo). Not blocking, but a UX gap.

4. **Capacitor / native recording.** The `TODO(capacitor)` block in `use-voice-recorder.ts` is unimplemented. If the app ships as a native PWA or Capacitor shell, `MediaRecorder` is unavailable on some platforms and `@capgo/capacitor-voice-recorder` must be wired up. Flag as a prerequisite before any native distribution.

5. **Auth asymmetry at the route.** `/api/voice/transcribe` checks `getAuthenticatedUser()` truthiness only — it does not check `approval_status`, `required_actions`, or rank. Any authenticated user (including one mid-onboarding or pending approval) who can POST to the route can transcribe. This is likely intentional (the route is only reachable from already-gated host surfaces), but should be confirmed as an explicit security decision rather than an oversight.

6. **`prefers-reduced-motion`.** The animated waveform bars and the `Loader2` spinner have no motion-reduction fallback. On mobile in harsh environments (sun, dust) motion sensitivity is real. Low-effort fix: `@media (prefers-reduced-motion: reduce)` hides bars and substitutes a static amplitude number or simple pulse.

7. **Transcript edit affordance.** The board shows the TranscriptResult text in a `$muted / $border` box. Whether that box is a plain `<div>` (read-only, edit-implies-dismiss) or a `<Textarea>` (directly editable in place) needs a decision. Given that members often dictate in noisy environments, inline editing is the higher-value path and should be the default.
