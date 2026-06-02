# 21 — Voice dictation pipeline

**Files covered:**
- `apps/web/components/voice/recorder-panel.tsx` — the in-use UI surface: bordered dictation panel with a big circular record button, live waveform, mm:ss timer, status label, dismiss/close, error line. The ONLY voice component actually mounted anywhere.
- `apps/web/components/voice/dictate-button.tsx` — an alternative compact "vertical dictation column" variant (small Button + waveform). **Orphaned / dead — no consumers** (`grep` of `apps/web` finds zero imports outside its own file).
- `apps/web/components/voice/waveform.tsx` — canvas-based time-domain waveform painter; reads an `AnalyserNode` per animation frame. Pure affordance ("the mic is hearing you"); bytes never leave the canvas.
- `apps/web/components/voice/use-voice-recorder.ts` — the cross-browser `MediaRecorder` state machine hook: permission → record → stop → POST → transcript callback; owns the `RecorderState` enum, MIME selection, timeout cap, analyser wiring, cleanup.
- `apps/web/app/api/voice/transcribe/route.ts` — Node-runtime POST route: auth gate, dual rate-limit (user + IP), multipart parse, file-type/size validation, promptKey allow-listing, calls Groq, sanitises error leakage.
- `apps/web/lib/groq.ts` — lazy Groq SDK client + `transcribeAudio(file, {prompt})` wrapper around Whisper Large v3 Turbo.
- `apps/web/lib/voice-prompts.ts` — exports `QUESTIONNAIRE_PROMPT`, the single Whisper domain-biasing string (camp jargon / names / numerals).
- (Supporting, read for completeness) `apps/web/lib/rate-limit.ts` — in-memory token-bucket `rateLimit()` + `getClientIp()`; `apps/web/components/questionnaire/question.tsx` (`LongTextField`, lines 414–477) and `apps/web/components/feedback/report-bug-dialog.tsx` (lines 75–83, 213–220) — the two **consumers** of `RecorderPanel`; `packages/types/src/questionnaire.ts` (`LongTextQuestion`, line 55) — host-field schema.

**Purpose:** Let a member dictate free-form prose into a long-text host field instead of typing on a phone in the desert. The user opts into dictation, holds/taps to record audio in the browser via `MediaRecorder`, sees a live waveform + elapsed timer, then on stop the clip is uploaded to `/api/voice/transcribe`, transcribed by Groq's Whisper Large v3 Turbo (optionally biased by a server-known prompt keyed by `promptKey`), and the returned text is **appended** (never replacing) to the host field, trimmed and clamped to that field's max length. The pipeline is purely browser-Web-Audio + a thin server transcription endpoint; there is no client data layer, no persistence of audio, and no offline support.

## Features

### RecorderPanel (recorder-panel.tsx) — the live dictation surface
- Bordered card panel (`rounded-md border ... bg-[color:var(--color-card)] p-4`) that appears **below** a text input once the user opts into dictation (recorder-panel.tsx:75–76).
- Header row: a **status label** (left) + a **ghost "Close dictation" X button** (right) (recorder-panel.tsx:77–89). The X is `disabled` while `isRecording || isBusy` so you can't dismiss mid-capture (recorder-panel.tsx:85).
- Big **circular primary record button** (`h-16 w-16 rounded-full`), centred (recorder-panel.tsx:90–108):
  - Variant flips to `destructive` while recording, else `default` (recorder-panel.tsx:94).
  - Icon: `Loader2` spinner when busy → `Square` (filled) when recording → `Mic` when idle (recorder-panel.tsx:100–106).
  - `disabled` while `isBusy` (processing/requesting) (recorder-panel.tsx:96).
  - `aria-label` "Stop recording" / "Start recording" (recorder-panel.tsx:98).
- **Live waveform** rendered between button and timer (recorder-panel.tsx:109).
- **mm:ss elapsed timer** shown **only while recording**, mono font, muted colour (recorder-panel.tsx:110–114).
- **Error line** (`role="alert"`, destructive colour) when an error string is present (recorder-panel.tsx:115–122).
- **Panel stays open after each completed recording** so the user can record again without re-tapping "Dictate instead" (documented behaviour, recorder-panel.tsx:18–25).
- Props: `onTranscript(text)`, `onDismiss()`, optional `promptKey` (recorder-panel.tsx:9–16).

### DictateButton (dictate-button.tsx) — ORPHANED VARIANT
- A `w-24` vertical column: a small `size="sm"` shadcn Button (outline / destructive when recording) with a waveform beneath and a `10px` error line (dictate-button.tsx:59–88).
- Same `useVoiceRecorder` wiring, same tap-to-start/tap-to-stop/tap-to-reset behaviour (dictate-button.tsx:39–46).
- Button text label states: "Allow mic" / "Transcribing" / "Stop" / "Try again" / "Dictate" (dictate-button.tsx:48–57).
- `aria-pressed={isRecording}` (dictate-button.tsx:69). Props: `onTranscript`, optional `promptKey`, optional `className`.
- **DEAD: not imported by any file in `apps/web`.** Behaviour duplicates RecorderPanel in compact form. Restyle/keep at designer's discretion, but it ships unmounted today.

### Waveform (waveform.tsx)
- `<canvas>` (`h-6 w-full`, `aria-hidden`), `opacity-40` when not active (waveform.tsx:86–96).
- On effect: sets canvas pixel dims to `clientWidth/Height * devicePixelRatio`, scales ctx by dpr (waveform.tsx:29–33).
- Allocates a `Uint8Array(analyser.fftSize)` byte buffer (waveform.tsx:36).
- **Idle paint** (`drawIdle`): a single flat centre line at `clientHeight/2`, stroke = canvas `color` mixed 25% into transparent, lineWidth 1 (waveform.tsx:38–48).
- **Active paint** (`draw`): per `requestAnimationFrame`, reads `getByteTimeDomainData`, clears, strokes a wave; lineWidth 1.5; stroke = computed `color` (the element carries `text-[color:var(--color-primary)]`, so the wave is hot-magenta primary) (waveform.tsx:50–75, 91).
- Sample mapping: `v = (buffer[i] ?? 128) / 128.0` → 0..2 centred on 1; `y = v*clientHeight/2`; x advances by `clientWidth / buffer.length` (waveform.tsx:64–72).
- Animates only when `active && analyser`; otherwise paints one idle frame (waveform.tsx:77–81). Cleans up via `cancelAnimationFrame` (waveform.tsx:83).

### useVoiceRecorder (use-voice-recorder.ts) — recorder state machine
- `start()` (use-voice-recorder.ts:100–165):
  - Guard: no-op if already `recording` or `requesting` (use-voice-recorder.ts:101).
  - Clears error, sets `requesting` (use-voice-recorder.ts:102–103).
  - `getUserMedia({audio: {echoCancellation:true, noiseSuppression:true, autoGainControl:true}})` (use-voice-recorder.ts:109–115).
  - Builds Web Audio graph: `AudioContext` (with `webkitAudioContext` fallback) → `createMediaStreamSource` → `createAnalyser` with `fftSize = 1024` → exposes the node as `analyser` (use-voice-recorder.ts:118–131).
  - Picks MIME via `pickMimeType()`, constructs `MediaRecorder`, wires `ondataavailable` (push non-empty chunks), `onerror` (→ "Recording failed", error state, teardown), `onstop` (→ `handleStop`) (use-voice-recorder.ts:133–148).
  - `rec.start()`, set `recording`, arm a `setTimeout(stop, maxDurationMs)` auto-stop (use-voice-recorder.ts:150–152).
  - **`TODO(capacitor)`**: on native builds, swap `MediaRecorder` for `@capgo/capacitor-voice-recorder` (returns base64 m4a), gated on `Capacitor.isNativePlatform()` (use-voice-recorder.ts:105–107, 46–52). Not implemented.
- `stop()`: clears the auto-stop timeout, no-ops if recorder missing/inactive, else `rec.stop()` (use-voice-recorder.ts:167–175).
- `handleStop(mimeType)` (use-voice-recorder.ts:177–216): sets `processing`; builds a `Blob` from chunks; tears down audio; if blob `size === 0` → silently return to `idle` (no upload); else builds `FormData` with the file named `clip.m4a` (when mime includes "mp4") or `clip.webm`, appends `promptKey` if present; `POST /api/voice/transcribe`; on non-ok parses `{error}` and throws (`Transcription failed (status)` fallback); on success calls `onTranscript(data.text)` **only if `data.text.trim()` is non-empty**; returns to `idle`. On any throw → sets the error message and `error` state.
- `reset()`: clears error, sets `idle` (use-voice-recorder.ts:218–221) — the path the UI uses to recover from `error`.
- Returns `{ state, error, start, stop, reset, analyser }` (use-voice-recorder.ts:223).
- **Unmount cleanup** (use-voice-recorder.ts:69–86): clears `ondataavailable/onstop/onerror` BEFORE calling `stop()` (so a queued `onstop` can't `setState` on an unmounted component), stops all stream tracks, closes the AudioContext, clears the timeout.
- `safeSet` wrapper guards every `setState` behind a `mountedRef` (use-voice-recorder.ts:88–90).

### POST /api/voice/transcribe (route.ts) — transcription endpoint
- `runtime = "nodejs"` (route.ts:12).
- **Auth gate**: `getAuthenticatedUser()`; null → 401 `{error:"Unauthorized"}` (route.ts:14–18).
- **Per-user rate limit**: key `voice-transcribe:${user.id}`, `limit: 30` (default 60s window); on fail → 429 `{error:"Rate limit exceeded", retryAfterSeconds}` + `Retry-After` header (route.ts:20–26).
- **Per-IP rate limit** (defence in depth, comment: "user.id can be cheap to mint via repeated signups"): key `voice-transcribe-ip:${getClientIp(req.headers)}`, `limit: 60`; on fail → 429 `{error:"Rate limit exceeded"}` + `Retry-After` (route.ts:28–38).
- **Form parse**: `req.formData()`; on throw → 400 `{error:"Invalid form data"}` (route.ts:40–45).
- **File validation**: `form.get("audio")` must be a `File` → else 400 ``{error:"Missing `audio` file"}``; `file.type` must start with `audio/` → else **415** `{error:"File must be audio/*"}`; `file.size > MAX_BYTES` → **413** `{error:"Audio too large"}` (route.ts:47–59).
- **Prompt resolution**: `promptKey` from form; if in `ACCEPTED_PROMPT_KEYS` → use `QUESTIONNAIRE_PROMPT`, else `undefined` (unbiased) (route.ts:61–64).
- **Transcribe**: `transcribeAudio(file, {prompt})` → 200 `{text}` (route.ts:66–68).
- **Error handling**: logs server-side; returns **502**; message scrubbed to `"Voice not configured"` if the error mentions `GROQ_API_KEY`, otherwise generic `"Transcription failed"` — Groq internals are never leaked (route.ts:69–77, 71 comment).

### transcribeAudio / Groq client (groq.ts)
- Lazy singleton `Groq` client; throws `"GROQ_API_KEY is not set"` if env var missing (groq.ts:3–12).
- `transcribeAudio(file, {prompt?})` calls `audio.transcriptions.create` with: `model:"whisper-large-v3-turbo"`, `response_format:"json"`, `temperature:0`, and `prompt` **only when provided** (groq.ts:27–38). Returns `res.text`.
- Header comment: "~216x real-time speed, $0.04/audio-hour" (groq.ts:24–25).

### voice-prompts.ts
- Single exported constant `QUESTIONNAIRE_PROMPT` — see verbatim text in **Enums** below. Comment notes Whisper truncates prompts at ~224 tokens, so keep them short and dense with rare terms (voice-prompts.ts:1–6).

### Consumers (how the transcript lands)
- **Questionnaire long_text field** (`LongTextField`, question.tsx:414–477): renders a `Textarea` (`maxLength={question.maxLength}`) + a "Dictate instead" outline button (`Mic` icon) that toggles local `dictating` state → mounts `RecorderPanel` with `promptKey="questionnaire"` (question.tsx:457–462). `appendTranscript(text)`: trims; ignores empty; joins to existing value with `"\n"` unless the value already ends in trailing whitespace (`/\n\s*$/`), then `.slice(0, question.maxLength)` and `onChange` (question.tsx:433–439). In `fullScreen` mode the textarea grows to `min-h-[40dvh] flex-1` (question.tsx:452–455).
- **Bug-report dialog** (report-bug-dialog.tsx:213–220): mounts `RecorderPanel` **without** a `promptKey` (comment: the route has no bug-report prompt; free-form feedback runs unbiased, route.ts comment confirms) (report-bug-dialog.tsx:214–216). `appendTranscript`: trims; ignores empty; sets a `dictated` flag; appends with the same `"\n"`/`/\n\s*$/` joiner; `.slice(0, DESCRIPTION_MAX)` (report-bug-dialog.tsx:75–83).

## User actions & interactions
- **Opt into dictation**: tap "Dictate instead" (Mic icon) on the host field → mounts RecorderPanel (question.tsx:464–473; report-bug-dialog.tsx:221–231).
- **Start recording**: tap the circular record button while idle/after error-reset → triggers mic permission prompt → recording (recorder-panel.tsx:50–57; dictate-button.tsx:39–46).
- **Stop recording**: tap the (now red, Square) button while recording → stops + uploads + transcribes (recorder-panel.tsx:55).
- **Retry after error**: tap the button while in `error` state → `reset()` back to idle (recorder-panel.tsx:51–53; dictate-button.tsx:40–43).
- **Auto-stop**: recording is force-stopped after `maxDurationMs` (default 120_000 ms = 2 min) (use-voice-recorder.ts:152, 56).
- **Record again**: after a successful transcript the panel returns to idle and stays open; tap to record another clip — transcripts accumulate by appending (recorder-panel.tsx:18–25).
- **Dismiss / close panel**: tap the X ("Close dictation") → `onDismiss()` collapses back to the "Dictate instead" button; disabled while recording or busy (recorder-panel.tsx:79–89).
- Multiple sequential recordings append to the same host field; each non-empty transcript is concatenated with a newline joiner and clamped to the field max.

## States & presentations
RecorderState enum: `idle | requesting | recording | processing | error` (use-voice-recorder.ts:5–10).

Derived UI buckets: `isRecording = state==="recording"`; `isBusy = state==="processing" || state==="requesting"` (recorder-panel.tsx:47–48).

| State | RecorderPanel status label | DictateButton label | Visuals |
|---|---|---|---|
| `idle` | "Tap to record" | "Dictate" | Mic icon, `default`/`outline` variant, enabled |
| `requesting` | "Allow microphone…" | "Allow mic" | Loader2 spinner, button disabled (isBusy) |
| `recording` | "Recording" | "Stop" | filled Square, `destructive` variant, waveform animating, mm:ss timer shown |
| `processing` | "Transcribing…" | "Transcribing" | Loader2 spinner, disabled (isBusy) |
| `error` | "Tap to retry" | "Try again" | Mic icon (after reset path), error line shown (`role="alert"`) |

(recorder-panel.tsx:59–68; dictate-button.tsx:48–57.)

Global-states rows that apply here:
- **Empty**: host field empty + panel collapsed (no recording yet). Blob `size === 0` after stop silently returns to `idle` with no transcript appended (use-voice-recorder.ts:184–187).
- **Loading / Submitting / pending**: `requesting` (waiting on mic permission) and `processing` (uploading + awaiting Whisper) — spinner, button disabled.
- **Populated**: transcript appended to host field; panel idle and reusable.
- **Validation-error**: transcript is clamped to `question.maxLength` / `DESCRIPTION_MAX` on append (no separate validation banner inside the pipeline; host field's textarea `maxLength` also enforces typed input — question.tsx:179, 449).
- **Success**: `onTranscript` fired with non-empty `data.text.trim()`; state → `idle`.
- **Disabled**: record button disabled while `isBusy`; X/close disabled while recording or busy.
- **Error**: see error matrix in **Validation** below.
- **Gating states** (invite-gated / onboarding-incomplete / pending / rejected / captain-only-locked): NOT expressed inside the pipeline UI. The server route only enforces **authentication** (401 if unauthenticated, route.ts:15–18) — there is no rank/approval/onboarding check on `/api/voice/transcribe`. Gating happens upstream at the host surface (the questionnaire/onboarding flow and the feedback layer), not in the voice components. **Edge case / gating asymmetry:** the route checks `getAuthenticatedUser()` truthiness ONLY — it does not read `approval_status`/`nextGate`, so any *authenticated* user (including an unapproved or mid-onboarding member) who reaches the endpoint directly can transcribe. This is asymmetric with the page-gating spine and may be intentional (the route is only reachable from already-gated host surfaces) or a gap (source bug — see verification report §6).

## Enums, options & configurable values
- **RecorderState**: `"idle" | "requesting" | "recording" | "processing" | "error"` (use-voice-recorder.ts:5–10).
- **SUPPORTED_MIME_TYPES** (in priority order; first supported wins) (use-voice-recorder.ts:25–30):
  1. `"audio/webm;codecs=opus"`
  2. `"audio/webm"`
  3. `"audio/mp4"` (comment: "iOS Safari 14.3+")
  4. `"audio/ogg;codecs=opus"`
  - If none supported, `MediaRecorder` is constructed with no `mimeType` option (use-voice-recorder.ts:38–42, 133–134).
- **maxDurationMs** default `120_000` (2 minutes) per clip (use-voice-recorder.ts:21–22, 56).
- **fftSize** = `1024` on the AnalyserNode (use-voice-recorder.ts:128, 118–120 comment).
- **getUserMedia audio constraints**: `echoCancellation:true, noiseSuppression:true, autoGainControl:true` (use-voice-recorder.ts:110–114).
- **Uploaded filename**: `clip.m4a` (mime includes "mp4") else `clip.webm` (use-voice-recorder.ts:192).
- **MAX_BYTES** = `10 * 1024 * 1024` (10 MB; comment "~10 minutes of speech") (route.ts:9).
- **ACCEPTED_PROMPT_KEYS** = `new Set(["questionnaire"])` — the ONLY accepted prompt key (route.ts:10).
- **promptKey values in use**: `"questionnaire"` (long_text questionnaire field); **none** for the bug-report dialog (unbiased) (question.tsx:461; report-bug-dialog.tsx:213–216).
- **Rate limits**: per-user `limit: 30`; per-IP `limit: 60`; both with the default `windowMs = 60_000` (route.ts:20, 31; rate-limit.ts:29, 44).
- **Groq transcription params**: `model:"whisper-large-v3-turbo"`, `response_format:"json"`, `temperature:0`, optional `prompt` (groq.ts:33–37).
- **QUESTIONNAIRE_PROMPT** (verbatim, voice-prompts.ts:8–13):
  > "Camp 404 burner profile. Afrikaburn, Burning Man, Tankwa Karoo, theme camp, Dance of 1000 Flames, Now Now Meow Meow, mutant vehicle, DDT ticket, virgin burner. Skills: cooking, recipes, vegan, kitchen, build, welding, sewing, fire safety, fire spinning, poi, staff, fans, art, decor, lighting, generators, wiring, inverters, LEDs. Roles: team lead, camp lead, treasurer, medic. Ministry of Vibes, Ministry of Memes."
- **Error messages** (client, from `getUserMedia` catch, use-voice-recorder.ts:154–160): `NotAllowedError` → "Microphone permission denied"; `NotFoundError` → "No microphone found"; otherwise → "Couldn't access microphone". Recorder `onerror` → "Recording failed" (use-voice-recorder.ts:142). Transcription failures surface the server `error` string or "Transcription failed".
- **Server error responses**: 401 "Unauthorized"; 429 "Rate limit exceeded" (+`retryAfterSeconds` for the user-limit variant, +`Retry-After` header both); 400 "Invalid form data" / "Missing \`audio\` file"; 415 "File must be audio/*"; 413 "Audio too large"; 502 "Voice not configured" (GROQ_API_KEY) / "Transcription failed" (route.ts:17–76).
- **Host-field length clamps**: questionnaire long_text `maxLength` default `1000` (packages/types/src/questionnaire.ts:60); bug-report `DESCRIPTION_MAX = 5000` (lib/github-feedback.ts:21).

## Data model touched
- **No database tables.** Audio is never persisted; the transcript is the only output, handed to the host field via `onTranscript` and held in the host component's local React state.
- **Request payload** (`FormData` to `/api/voice/transcribe`): field `audio` (a `File`, type `audio/*`, named `clip.webm`/`clip.m4a`), optional field `promptKey` (string) (use-voice-recorder.ts:189–196).
- **Response payload**: `{ text: string }` on success; `{ error: string, retryAfterSeconds?: number }` on failure (route.ts:23, 68, others).
- **Interfaces**:
  - `UseVoiceRecorderOptions { onTranscript:(text:string)=>void; promptKey?:string; maxDurationMs?:number }` (use-voice-recorder.ts:12–23).
  - `RecorderPanelProps { onTranscript:(text:string)=>void; onDismiss:()=>void; promptKey?:string }` (recorder-panel.tsx:9–16).
  - `DictateButtonProps { onTranscript:(text:string)=>void; promptKey?:string; className?:string }` (dictate-button.tsx:10–16).
  - `WaveformProps { analyser:AnalyserNode|null; active:boolean; className?:string }` (waveform.tsx:6–12).
  - `TranscribeOptions { prompt?:string }` (groq.ts:14–21).
- **Host field schema** (where transcript lands): `LongTextQuestion` `{ ...base, kind:"long_text", maxLength:number(default 1000) }` (packages/types/src/questionnaire.ts:55–63); long_text validation: `raw.length > q.maxLength` → `{ ok:false, error:\`Max ${q.maxLength} characters\` }` (packages/types/src/questionnaire.ts:393–396). Bug-report description clamps to `DESCRIPTION_MAX = 5000`.
- **Rate-limit store**: in-memory `Map<string, {tokens, updatedAt}>` keyed `voice-transcribe:<userId>` / `voice-transcribe-ip:<ip>` — per-process, non-persistent, swept every 200 calls (rate-limit.ts:6–24).
- Agrees with unit 29: this pipeline introduces no schema; it consumes `questionnaire_responses` long_text values and the bug-report description (GitHub issue body) via its consumers, not directly.

## Validation, edge cases & business rules
- **Auth required**: route returns 401 if no authenticated user (route.ts:15–18). No rank/approval gating at the route.
- **Dual rate limiting**: per-user (30/min) then per-IP (60/min); IP limit is "defence in depth" against cheap-minted accounts (route.ts:28–29).
- **File type must be `audio/*`** → 415 otherwise (route.ts:51–55). Size cap **10 MB** → 413 (route.ts:57–59).
- **promptKey is server-validated against an allow-list** so clients cannot inject arbitrary Whisper prompts; unknown/empty keys silently fall back to unbiased transcription (route.ts:10, 61–64; use-voice-recorder.ts:16–20 comment).
- **Empty/silent clip**: blob `size === 0` after stop → no upload, silent return to `idle` (use-voice-recorder.ts:184–187).
- **Empty transcript**: `onTranscript` only fires when `data.text.trim()` is non-empty (use-voice-recorder.ts:207); consumers' `appendTranscript` also early-return on empty (question.tsx:434–435; report-bug-dialog.tsx:76–77).
- **Transcript is APPENDED, never replaced**: newline joiner inserted only when the existing value is non-empty and does not already end in trailing whitespace (`/\n\s*$/`); result `.slice(0, max)` clamps to the host field's max length (question.tsx:436–437; report-bug-dialog.tsx:80–81).
- **Auto-stop after 2 min** prevents runaway recordings (use-voice-recorder.ts:152).
- **Cross-browser MIME selection** is mandatory: hardcoding `audio/webm` "makes iOS Safari silently fail — the single biggest cross-browser gotcha" (use-voice-recorder.ts:32–43); falls through to `audio/mp4` for iOS Safari 14.3+.
- **Permission/hardware errors** mapped to friendly messages (`NotAllowedError` / `NotFoundError` / fallback) (use-voice-recorder.ts:153–164).
- **Unmount safety**: handlers detached before `stop()`; all `setState` guarded by `mountedRef`; tracks stopped, AudioContext closed, timeout cleared (use-voice-recorder.ts:69–90).
- **Dismiss disabled mid-capture**: X button disabled while recording/busy so audio isn't orphaned (recorder-panel.tsx:85).
- **Record button disabled while busy** (requesting/processing) to prevent double-trigger (recorder-panel.tsx:96; dictate-button.tsx:68).
- **`start()` is idempotent** for already-`recording`/`requesting` states (use-voice-recorder.ts:101).
- **`stop()` no-ops** if no recorder or recorder already inactive (use-voice-recorder.ts:173).
- **Error masking**: server scrubs Groq internals; only `"Voice not configured"` (missing key) or generic `"Transcription failed"` reach the client (route.ts:71–75). Missing `GROQ_API_KEY` throws on first use of the lazy client (groq.ts:7–8).
- **Webkit fallback**: AudioContext uses `webkitAudioContext` when `AudioContext` is absent (use-voice-recorder.ts:121–124).
- **Native (Capacitor) path is a TODO**, not implemented — current pipeline is web-only `MediaRecorder` (use-voice-recorder.ts:105–107).

## Sub-components / variants
- **RecorderPanel** — the live, in-use surface (mounted by the questionnaire long_text field and the bug-report dialog). Two call sites differ only by `promptKey` (`"questionnaire"` vs none).
- **DictateButton** — **ORPHANED / DEAD variant.** Functionally equivalent compact "vertical column" form (small button + waveform), wired to the same hook, but imported by no file in `apps/web`. Carries identical action/state semantics (tap-start / tap-stop / tap-reset, same labels rephrased). A restyle can resurrect or delete it; it currently ships unused.
- **Waveform** — shared sub-component used by both panels; pure visual affordance, no functional contribution to the transcript (audio bytes never leave the canvas, waveform.tsx:14–19).
- **useVoiceRecorder** — the shared state-machine hook backing both panels; the single source of recorder behaviour, MIME selection, timeout, analyser, cleanup, and upload.
- **Server validators/handlers**: `POST /api/voice/transcribe` (route.ts) is the only handler; `transcribeAudio` (groq.ts) is the Groq adapter; `QUESTIONNAIRE_PROMPT` (voice-prompts.ts) is the only prompt; `rateLimit`/`getClientIp` (rate-limit.ts) supply the limiter; `getAuthenticatedUser` (lib/auth.ts) the auth gate.
- **Stale/ugly truths**: `TODO(capacitor)` native recording branch is unimplemented (use-voice-recorder.ts:105–107); the route comment claims 10 MB "~10 minutes" while the client caps clips at 2 minutes, so the server cap is generous slack, never hit by the in-app flow; `DictateButton` is dead code.
