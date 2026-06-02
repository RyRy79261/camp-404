### 21. Voice dictation pipeline
**Purpose:** Let a member dictate free-form prose into a long-text host field instead of typing, transcribing the clip server-side and appending (never replacing) the result.
**Layout & elements:** Host field (questionnaire long_text Textarea, or bug-report description) with an outline "Dictate instead" button (Mic icon). Opting in mounts the RecorderPanel below the field (mobile single column): header row with a status label (left) and a ghost "Close dictation" X button (right); a centred big circular record button (Mic → Square → Loader2 spinner); a live waveform between button and timer; an mm:ss elapsed timer (only while recording); an error line (role="alert").
**Every action (preserve all):**
- Tap "Dictate instead" → mount RecorderPanel.
- Tap record button (idle) → mic permission prompt → record. Disabled while busy (requesting/processing).
- Tap button (recording, red Square) → stop + upload + transcribe.
- Tap button (error) → reset to idle.
- Auto-stop after 2 min; panel stays open after success to record again; transcripts append.
- Tap X "Close dictation" → dismiss/collapse; disabled while recording or busy.
**States to design:**
- idle: "Tap to record", Mic, enabled. requesting: "Allow microphone…", spinner, disabled. recording: "Recording", Square, destructive, waveform animating, timer. processing: "Transcribing…", spinner, disabled. error: "Tap to retry" + error line. empty/silent clip → silent return to idle. populated: transcript appended, panel reusable. success: onTranscript fired (non-empty trimmed text). disabled: record while busy, X while recording/busy. Gating (invite/onboarding/pending/rejected/captain-lock) NOT in this UI — route enforces auth only (401).
**Options & exact values:** RecorderState: idle|requesting|recording|processing|error. MIME priority: audio/webm;codecs=opus, audio/webm, audio/mp4, audio/ogg;codecs=opus. maxDurationMs 120_000 (2 min); MAX_BYTES 10MB; fftSize 1024; rate limits user 30/min, IP 60/min; promptKey "questionnaire" only (else unbiased); model whisper-large-v3-turbo. Clamps: questionnaire 1000, bug-report 5000. Errors: "Microphone permission denied"/"No microphone found"/"Couldn't access microphone"/"Recording failed"; server 401/429/400/415/413/502 ("Voice not configured"/"Transcription failed").
**Validation & rules:**
- Auth required (401). File must be audio/* (415); size ≤10MB (413).
- promptKey allow-listed server-side; unknown keys fall back to unbiased.
- Empty/silent clip and empty transcript suppressed (no append).
- Transcript appended with "\n" joiner unless value ends in trailing whitespace, then clamped to field max.
- Cross-browser MIME selection mandatory (iOS Safari falls to audio/mp4).
**Do-not-drop:** The opt-in → record → live-feedback → transcribe → append-and-clamp loop, with reusable panel and friendly permission/error states. DictateButton is dead/orphaned (no consumers); Capacitor native path is a TODO. A redesign must not lose append-never-replace or the auth/rate-limit/file-validation server contract.
