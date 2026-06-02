# RecorderPanel — molecule plan

- **mapsTo:** PROMOTE/EXTEND `apps/web/components/voice/recorder-panel.tsx`
- **Target file:** `apps/web/components/voice/recorder-panel.tsx` (stays app-local — see Composition note)

---

## Current state — does it exist? where? gap vs spec

### What exists

**`apps/web/components/voice/recorder-panel.tsx`** — confirmed present (verified via filesystem + read).

The live component implements a bordered card (`rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4`) with:

- Header row: Inter/14/500 status label + ghost X button (`aria-label="Close dictation"`).
- Centred 64×64 `rounded-full` primary/destructive Button for record/stop.
- `<Waveform>` canvas beneath the button.
- Elapsed `mm:ss` mono timer shown while recording.
- `role="alert"` error `<p>` below the waveform.

The hook (`apps/web/components/voice/use-voice-recorder.ts`) exports `RecorderState = "idle" | "requesting" | "recording" | "processing" | "error"` and drives the component's five rendered states.

A sibling `apps/web/components/voice/waveform.tsx` draws a canvas time-domain waveform from an `AnalyserNode`; idle state draws a flat centre line at 25% opacity.

A sibling `apps/web/components/voice/dictate-button.tsx` is a **dead orphan** — confirmed no live consumer in `apps/web` (per `grep -r "DictateButton" apps/web`). The component-library.md DROPPED list names it explicitly. It is deleted as part of the DictatePill build (see `molecule-dictatepill.md` Step 6).

### Current consumers

- `apps/web/components/questionnaire/question.tsx` — `LongTextField`, mounted when `dictating === true`, `promptKey="questionnaire"` (confirmed, line 458).
- `apps/web/components/feedback/report-bug-dialog.tsx` — mounted when `dictating === true`, no `promptKey` (confirmed, line 217).

### Gap vs spec

| Gap | Source | Impact |
|---|---|---|
| **`transcript-review` state is absent** — `onTranscript` fires immediately on success; there is no review/edit step | Board S21 `TranscriptResult` frame; `21-voice.md` §Open questions #1 | NEW state + `TranscriptResult` sub-section must be built |
| Ring is a 64×64 `Button rounded-full`; board draws a 96×96 `w:96 h:96 r:999` ring with separate content/icon, not a Button | Board S21 states IDLE / REQUESTING / RECORDING / PROCESSING / ERROR | Ring geometry needs adjustment; board ring is a non-interactive container during non-idle states |
| Board RECORDING state: full-width `Stop & transcribe` button below the waveform (`gap:8 pad:[12,0] jc:center r:$radius fill:$primary`); live code uses a centred 64×64 circular button | Board S21 RECORDING frame | Stop button layout must change |
| Board IDLE: ring fill `$muted`, stroke `$border`, icon `mic $foreground` | Live code: `variant="default"` (primary fill on idle) | Idle ring colours to update |
| Board ERROR: ring fill `#f83e5a1f` (`destructive/12%`), stroke `$destructive`, icon `mic-off $destructive` | Board S21 ERROR frame; design-tokens.md §4 reconciliation #12 | Raw hex tint → `bg-destructive/12` |
| Board RECORDING: ring fill `#ff008c26` (`primary/15%`), stroke `$primary` | Board S21 RECORDING frame; design-tokens.md §4 reconciliation #4 | Raw hex tint → `bg-primary/15` |
| Board REQUESTING: ring stroke `$accent`, icon `mic $accent` | Board S21 REQUESTING ACCESS frame | Ring accent stroke, accent icon |
| Board PROCESSING: ring stroke `$accent`, icon `loader $accent` | Board S21 PROCESSING frame | Ring accent stroke |
| Live verbose token syntax `[color:var(--color-border)]` throughout | design-tokens.md §4.22 (P1-5) | Replace all with short-form `border-border`, `bg-card`, `text-muted-foreground` |
| Waveform is a bar-chart of 11 bars (board) vs canvas time-domain wave (live) | Board `S21 RECORDING "wave"` — 11 bars `w:3 r:2 fill:$primary` at varying heights | Both are acceptable affordances; canvas wave is richer. Flag as open question #7 |
| `Waveform` canvas uses `getComputedStyle(canvas).color` to read `$primary`; wired via `text-[color:var(--color-primary)]` | Waveform.tsx line 91 | Snap to `text-primary` short form |
| `TranscriptResult` editable box — board draws `fill:$muted stroke:$border r:8` box; edit affordance unspecified | Board S21 `box` frame; `21-voice.md` §Open questions #7 | Use `<Textarea>` for inline editing (preferred per the brief) |
| `maxDurationMs` prop accepted by `useVoiceRecorder` but not threaded through the live `RecorderPanelProps` | `use-voice-recorder.ts:22`, `recorder-panel.tsx:9-16` | Add `maxDurationMs?` to `RecorderPanelProps` |

**Classification: PROMOTE/EXTEND** — the component exists in `apps/web` with full state machine but is missing the board-canonical `transcript-review` state and has geometry/token divergences. It stays app-local (not promoted to `packages/ui`) because it imports `useVoiceRecorder` (browser API hook) and `Waveform` (canvas), both of which are `apps/web`-resident and depend on browser globals; `@camp404/ui` must remain framework/browser agnostic per the architecture constraint. The PROMOTE label in `component-library.md` means "lift once, kill per-screen reinvention" — in this case the component already exists in one canonical location; the task is to EXTEND it to the board spec.

---

## API — props, variants, sizes, states

### TS prop interface

```ts
export interface RecorderPanelProps {
  /**
   * Called with the (possibly edited) transcript once the member taps
   * "Use this text" in the transcript-review step. The caller appends
   * the text to the host field and is responsible for clamping to maxLength.
   */
  onTranscript: (text: string) => void;
  /** Collapse the panel back to the DictatePill. Disabled while recording/busy. */
  onDismiss: () => void;
  /**
   * Server-validated prompt domain key echoed to /api/voice/transcribe.
   * "questionnaire" → Whisper bias for camp jargon. Absent = unbiased.
   */
  promptKey?: string;
  /**
   * Hard cap on a single clip in milliseconds. Threaded through to
   * useVoiceRecorder. @default 120_000 (2 min)
   */
  maxDurationMs?: number;
}
```

### Variants

`RecorderPanel` has one layout shape (inline bordered card). Behavioural variants are driven by `promptKey`:

| Variant | `promptKey` | Behaviour |
|---|---|---|
| `questionnaire` | `"questionnaire"` | Whisper bias prompt applied server-side for Afrikaburn/camp jargon |
| `generic` | absent | Unbiased transcription; used by bug dialog |

No `variant` prop is needed; the difference is entirely in `promptKey`.

### Sizes

One layout; fills host column width. No size prop. The state ring is 96×96 (`w-24 h-24`, consistent with board `w:96 h:96`).

### States

Six states (five from `RecorderState` + one derived `transcript-review`):

| State | `RecorderState` | Trigger | Key visuals |
|---|---|---|---|
| **idle** | `"idle"` | Initial mount; after Use this text / Re-record / empty clip | Ring: `bg-muted border-border`, `mic $foreground`. Status: "Tap to record" |
| **requesting** | `"requesting"` | `start()` called; mic permission prompt pending | Ring: `border-accent`, `mic text-accent`. Status: "Allow microphone…". Record button disabled |
| **recording** | `"recording"` | Permission granted; `MediaRecorder` running | Ring: `bg-primary/15 border-primary`, `mic text-primary`. Waveform animating. Timer shown. Full-width "Stop & transcribe" button |
| **processing** | `"processing"` | `stop()` called; upload to `/api/voice/transcribe` in-flight | Ring: `border-accent`, `loader text-accent` spinning. Status: "Transcribing…". Record button disabled |
| **error** | `"error"` | Permission denied / hardware error / transcription failed | Ring: `bg-destructive/12 border-destructive`, `mic-off text-destructive`. Outline "Try again" button. `role="alert"` error message |
| **transcript-review** | derived (pending transcript string) | Non-empty transcript returned from API | TranscriptResult section replaces ring area. Editable `<Textarea>`. "Re-record" (outline) + "Use this text" (primary) buttons |

X close disabled while `state === "recording" || state === "requesting" || state === "processing"`.

---

## Tokens & type — exact design tokens + type-scale roles

All tokens use the short Tailwind form (P1-5). Dark-only: no `dark:` variants. No raw hex.

### Container

| Element | Token / utility | Source |
|---|---|---|
| Panel card | `rounded-md border border-border bg-card p-4 space-y-3` | Board S21 `r:$radius fill:$card stroke:$border pad:22`; design-tokens.md §3 `--radius` = `rounded-md` |

### Header row

| Element | Token / utility | Source |
|---|---|---|
| Status label | `text-sm font-medium text-foreground` (Inter/14/500) | Board S21 state headers (functional copy, not the board's "IDLE" annotation); `--text-body-strong` role |
| Close button | `Button variant="ghost" size="sm"` + `X` lucide | Live code; ghost = no fill, icon only |

### State ring (96×96)

| State | Ring classes | Icon + colour | Source |
|---|---|---|---|
| idle | `bg-muted border border-border` | `Mic text-foreground` | Board S21 IDLE: `fill:$muted stroke:$border`, `mic $foreground` |
| requesting | `border-2 border-accent` | `Mic text-accent` | Board S21 REQUESTING: `stroke:$accent`, `mic $accent` |
| recording | `bg-primary/15 border-2 border-primary` | `Mic text-primary` | Board S21 RECORDING: `#ff008c26 → primary/15%` (design-tokens.md §4 rec. #4), `stroke:$primary`, `mic $primary` |
| processing | `border-2 border-accent` | `Loader2 text-accent animate-spin` | Board S21 PROCESSING: `stroke:$accent`, `loader $accent` |
| error | `bg-destructive/12 border-2 border-destructive` | `MicOff text-destructive` | Board S21 ERROR: `#f83e5a1f → destructive/12%` (design-tokens.md §4 rec. #12), `stroke:$destructive`, `mic-off $destructive` |

Ring common: `w-24 h-24 rounded-full flex items-center justify-center`.

### Sub-labels (below ring, where present)

| State | Primary sub-label | Secondary sub-label | Type role |
|---|---|---|---|
| idle | "Tap to start" | "Mic ready" | `text-sm font-medium text-muted-foreground` / `text-xs text-muted-foreground` |
| requesting | "Allow microphone access" (`text-foreground font-semibold`) | "Your browser is asking permission to use the mic." (`text-muted-foreground`) | `--text-body-strong` / `--text-caption` |
| processing | "Transcribing…" (`text-accent font-semibold`) | "Turning your audio into text." (`text-muted-foreground`) | `--text-body-strong` / `--text-caption` |
| error | Error message (`text-destructive font-semibold`) | "Check that Camp 404 has microphone permission, then try again." | `--text-body-strong` / `--text-caption` |

### Recording-state extras

| Element | Token / utility | Source |
|---|---|---|
| Elapsed timer | `text-center font-mono text-xs text-primary` (JetBrains Mono/12/500) | Board S21: `"0:14 · Listening…" Inter/14/600/$primary`; live code uses `font-mono text-xs`; type role `--text-mono-caption` |
| "Stop & transcribe" button | `Button variant="default" className="w-full gap-2"` + `Square` icon | Board S21: full-width `fill:$primary`, `⊙ square $primary-foreground`, "Stop & transcribe" Inter/14/600 |

### Waveform

| Element | Token / utility | Source |
|---|---|---|
| Canvas stroke (active) | `text-primary` (read by `getComputedStyle`) | Board S21 RECORDING: `fill:$primary` bars; Waveform.tsx uses CSS `color` property |
| Canvas idle line | `text-primary opacity-40` | Waveform.tsx `!active && "opacity-40"` — flat line at 25% opacity |

### TranscriptResult sub-section

| Element | Token / utility | Source |
|---|---|---|
| Header icon | `Check text-accent h-4 w-4` | Board S21: `⊙ check ($accent)` |
| Header label | `text-sm font-semibold text-foreground` | Board S21: `Inter/13/600/$foreground` → `--text-label` role |
| Editable box | `Textarea` with `bg-muted border-border rounded` | Board S21 `box: fill:$muted stroke:$border r:8` — use `<Textarea>` per open question resolution |
| "Re-record" button | `Button variant="outline" className="flex-1"` | Board S21: `fill:transparent stroke:$border`, "Re-record" Inter/14/600 |
| "Use this text" button | `Button variant="default" className="flex-1"` | Board S21: `fill:$primary`, "Use this text" Inter/14/600/$primary-foreground |
| Actions row | `flex gap-2` | Board S21 `acts: gap:8` |

### Error "Try again" button

| Element | Token / utility | Source |
|---|---|---|
| Try again | `Button variant="outline" className="gap-2"` + `RotateCcw` | Board S21 ERROR: `⊙ rotate-ccw $foreground`, "Try again" Inter/14/600/$foreground; `stroke:$border` |

---

## Composition & deps — atoms/primitives + @camp404/core helpers

### Direct dependencies

| Dep | Package | Role |
|---|---|---|
| `Button` | `@camp404/ui/components/button` | All interactive buttons (stop, try-again, re-record, use-this-text, close X) |
| `Textarea` | `@camp404/ui/components/textarea` | TranscriptResult editable preview box |
| `Waveform` | `apps/web/components/voice/waveform.tsx` | Canvas time-domain waveform; stays app-local |
| `useVoiceRecorder` | `apps/web/components/voice/use-voice-recorder.ts` | Recording state machine; stays app-local |
| `cn` | `@camp404/ui/lib/utils` | Tailwind class merging |
| `Mic`, `MicOff`, `Square`, `Loader2`, `RotateCcw`, `X`, `Check` | `lucide-react` | State icons |

`RecorderPanel` does NOT import from `@camp404/core` — it has zero domain/business logic; it is a pure presentation + browser-API component. It does NOT import any Next.js primitives (`next/image`, `next/link`, server actions). The `POST /api/voice/transcribe` call is inside `useVoiceRecorder`, not in the component.

### Why app-local (not promoted to `packages/ui`)

`@camp404/ui` must be presentation-only with no browser-global dependencies (`MediaRecorder`, `AudioContext`, `AnalyserNode`, `navigator.mediaDevices`). All of these live inside `useVoiceRecorder` and `Waveform`. Moving RecorderPanel to the package would require either bundling the hook (breaking the package boundary) or accepting that it only works in browser contexts — neither is acceptable per the architecture constraint. App-local is the correct home.

### Relationship to `DictatePill`

Siblings in the host render tree. The host (`LongTextField`, `ReportBugDialog`, `AnnouncementsManager`) owns `dictating: boolean`:

```text
dictating === false → <DictatePill onActivate={() => setDictating(true)} />
dictating === true  → <RecorderPanel onTranscript={…} onDismiss={() => setDictating(false)} />
```

`RecorderPanel` never renders `DictatePill`. `DictatePill` never renders `RecorderPanel`.

### Internal `TranscriptResult` sub-section

`TranscriptResult` is an inline section (not a separate component file) within `RecorderPanel`. It holds `pendingTranscript: string | null` in local state. When `useVoiceRecorder` fires `onTranscript` internally, the panel intercepts it, stores the text in `pendingTranscript`, transitions visually to the review step, and only calls the external `onTranscript` prop when the member taps "Use this text". The hook's `onTranscript` callback is therefore wrapped:

```ts
const [pendingTranscript, setPendingTranscript] = React.useState<string | null>(null);

const { state, error, start, stop, reset, analyser } = useVoiceRecorder({
  onTranscript: (text) => setPendingTranscript(text),  // intercept → review step
  promptKey,
  maxDurationMs,
});
```

The derived `isReviewing = pendingTranscript !== null` replaces the ring area with the `TranscriptResult` UI. "Use this text" calls `props.onTranscript(editedText)` and resets `pendingTranscript`. "Re-record" resets `pendingTranscript` and calls `reset()`.

---

## Absorbs — candidates replaced

From the component-library.md merge map and DROPPED list:

| Candidate | Location | Action |
|---|---|---|
| `DictateButton` (dead orphan) | `apps/web/components/voice/dictate-button.tsx` | **DELETE** — explicitly named in DROPPED list; no live consumer (verified grep). Covered by DictatePill build (Step 6 of `molecule-dictatepill.md`) |

The merge map has no other candidates collapsing into `RecorderPanel`. `DictatePill` is a sibling trigger molecule, not absorbed by this component.

---

## Stories & tests

### Storybook stories (`recorder-panel.stories.tsx`)

Stories live at `apps/web/components/voice/recorder-panel.stories.tsx` (app-local because the component is app-local).

| Story | Setup | Purpose |
|---|---|---|
| `Idle` | `state="idle"` via mocked hook | Baseline panel; ring `bg-muted`, mic icon, "Tap to record" |
| `Requesting` | `state="requesting"` | Ring `border-accent`, mic accent, button disabled, permission sub-labels |
| `Recording` | `state="recording"` | Ring `bg-primary/15 border-primary`, mock `AnalyserNode`, waveform animating, timer counting, "Stop & transcribe" full-width |
| `Processing` | `state="processing"` | Ring `border-accent`, spinner, "Transcribing…", button disabled |
| `ErrorPermission` | `state="error"`, `error="Microphone permission denied"` | Ring `bg-destructive/12 border-destructive`, mic-off, error text, "Try again" outline button |
| `TranscriptReview` | `pendingTranscript` set to sample text | Review section visible; editable textarea; "Re-record" + "Use this text" buttons |
| `TranscriptReviewEdited` | Same + user edits the textarea | Confirms editable value state; "Use this text" uses the edited string |
| `GenericVariant` | No `promptKey` (bug dialog) | Visual parity with questionnaire variant; only difference is `promptKey` absent |

All stories mock `useVoiceRecorder` to avoid real browser `MediaRecorder` / mic permissions in Storybook.

### Vitest / RTL test cases (`recorder-panel.test.tsx`)

| Test | Assertion |
|---|---|
| Renders idle state | "Tap to record" present; mic icon present; ring has `bg-muted` class |
| Record button click in idle calls `start()` | `userEvent.click` on record button → `start` spy called once |
| Record button disabled in requesting state | `aria-disabled` or native `disabled` on record button |
| Record button disabled in processing state | Same |
| X close button disabled while recording | `disabled` on close button when `state="recording"` |
| X close button disabled while processing | Same for `state="processing"` |
| X close button calls `onDismiss` when idle | `userEvent.click` → `onDismiss` spy called |
| Error state renders `role="alert"` with error message | `getByRole("alert")` contains error string |
| "Try again" in error state calls `reset()` | `userEvent.click` → `reset` spy called |
| TranscriptResult renders after successful transcription | Mock transcript fires → "Transcript ready — review & edit" visible; textarea contains transcript |
| TranscriptResult textarea is editable | `userEvent.type` changes textarea value |
| "Use this text" calls `onTranscript` with edited text | Edit textarea → click "Use this text" → `onTranscript` spy called with edited value |
| "Use this text" returns panel to idle | After click → TranscriptResult hidden; ring restored |
| "Re-record" discards transcript and returns to idle | `userEvent.click` "Re-record" → `onTranscript` NOT called; TranscriptResult hidden |
| `maxDurationMs` prop threaded to hook | Verify the prop reaches `useVoiceRecorder` options |
| Short-form token classes only | No `[color:var(--color-*)]` in rendered className (snapshot or class assertion) |
| Empty blob: `onTranscript` not called | Mock `blob.size === 0` path → no transcript, state returns idle |

### Accessibility notes

- State ring is `aria-hidden` (decorative, never interactive on its own in non-recording states). The record button carries `aria-label` ("Start recording" / "Stop recording") matching current live code.
- Close button: `aria-label="Close dictation"` + `disabled` native attr while recording/processing — removes from tab order.
- Error `<p>`: `role="alert"` for live-region announcement.
- TranscriptResult: the "Transcript ready — review & edit" header is an `aria-live="polite"` region announcement to signal that review is available. The editable Textarea has `aria-label="Edit transcript"`.
- Timer `<p>` in recording: `aria-live="off"` (updating every 100ms would be noise for screen readers). The timer is visual-only elapsed feedback.
- Waveform `<canvas>`: `aria-hidden` (confirmed in `waveform.tsx`).
- `prefers-reduced-motion`: the `Loader2 animate-spin` and the canvas waveform animation have no reduced-motion guard today (open question #6 per `21-voice.md`). Add `motion-safe:animate-spin` on the spinner and a `motion-safe:` guard on the waveform RAF loop as part of this build.
- Touch targets: the 96×96 ring (where the record button is located) and the 44px-height "Stop & transcribe" / action buttons meet WCAG 2.5.8. The close X button (`size="sm"` = 32px) is borderline — use `size="icon"` or pad to 44px in the ghost variant.

---

## Build steps — ordered + acceptance criteria

**Prerequisite:** `foundations-tokens` Phase 0 must have shipped (`bg-primary/15`, `bg-destructive/12`, `border-accent`, `border-destructive`, `border-primary` Tailwind utilities resolving via OKLCH `globals.css`; the new status tokens `--color-success` / `--color-warning` are not required by RecorderPanel itself).

### Step 1 — Thread `maxDurationMs` prop into `RecorderPanelProps`

Add `maxDurationMs?: number` to the interface and pass it through to `useVoiceRecorder`.

**Acceptance:** `RecorderPanel` with `maxDurationMs={60_000}` stops recording after 60 s.

### Step 2 — Fix verbose token syntax → short form

Replace all `[color:var(--color-*)]` usages in `recorder-panel.tsx` and `waveform.tsx` with short-form Tailwind utilities:

| Before | After |
|---|---|
| `border-[color:var(--color-border)]` | `border-border` |
| `bg-[color:var(--color-card)]` | `bg-card` |
| `text-[color:var(--color-muted-foreground)]` | `text-muted-foreground` |
| `text-[color:var(--color-destructive)]` | `text-destructive` |
| `text-[color:var(--color-primary)]` (waveform) | `text-primary` |

**Acceptance:** zero `[color:var(--color-` strings in both files; visual output unchanged.

### Step 3 — Rebuild the state ring to board spec

Replace the 64×64 `Button rounded-full` record button with the board's 96×96 ring container + separate record/stop button:

- **Non-recording states (idle / requesting / processing / error):** ring is a non-interactive `<div className="w-24 h-24 rounded-full flex items-center justify-center …">` containing the state icon. Clicking the ring in idle triggers `start()` (wrap in a `<button>` for idle/error states; inert `<div>` for requesting/processing).
- **Recording state:** ring retains the same visual with primary colours; below it appears the full-width "Stop & transcribe" `Button variant="default" className="w-full gap-2"` with `Square` icon.
- Apply state-specific ring classes per the Tokens table above.

**Acceptance:**
- Ring is 96×96 in all states.
- Idle ring: `bg-muted border-border`, mic in foreground colour.
- Recording ring: `bg-primary/15 border-2 border-primary`, mic in primary.
- Processing ring: `border-2 border-accent`, spinning loader in accent.
- Error ring: `bg-destructive/12 border-2 border-destructive`, mic-off in destructive.
- "Stop & transcribe" full-width button appears only in recording state.

### Step 4 — Add per-state sub-labels

Below the ring in each state, render the board's primary + secondary sub-label lines:

- Idle: "Tap to start" (`text-sm font-medium text-muted-foreground`) + "Mic ready" (`text-xs text-muted-foreground`).
- Requesting: "Allow microphone access" (`text-sm font-semibold text-foreground`) + "Your browser is asking permission to use the mic." (`text-xs text-muted-foreground`).
- Processing: "Transcribing…" (`text-sm font-semibold text-accent`) + "Turning your audio into text." (`text-xs text-muted-foreground`).
- Error: error string from hook (`text-sm font-semibold text-destructive`, `role="alert"`) + "Check that Camp 404 has microphone permission, then try again." (`text-xs text-muted-foreground`) for permission errors.

The header row status label (left of X) continues to carry the short machine-readable label ("Tap to record" / "Allow microphone…" / "Recording" / "Transcribing…" / "Tap to retry") as the primary accessible name.

**Acceptance:** all five states show the correct sub-label copy per the board.

### Step 5 — Add "Try again" outline button in error state

Below the error sub-labels, render `Button variant="outline" className="gap-2"` with `RotateCcw` icon + "Try again" label. Clicking calls `reset()`.

**Acceptance:** error state shows "Try again" button; tapping it clears the error and returns to idle.

### Step 6 — Add `transcript-review` state (`TranscriptResult`)

Introduce local state `pendingTranscript: string | null` and `editedTranscript: string`. Intercept the hook's `onTranscript` callback to set `pendingTranscript` instead of forwarding immediately.

When `pendingTranscript !== null`, render the `TranscriptResult` section in place of the ring area:

```tsx
{pendingTranscript !== null ? (
  <div className="flex flex-col gap-2.5">
    <div className="flex items-center gap-1.5">
      <Check className="h-4 w-4 text-accent" aria-hidden />
      <p className="text-sm font-semibold text-foreground">
        Transcript ready — review & edit
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
        onClick={() => { setPendingTranscript(null); reset(); }}
      >
        Re-record
      </Button>
      <Button
        type="button"
        variant="default"
        className="flex-1"
        onClick={() => {
          props.onTranscript(editedTranscript);
          setPendingTranscript(null);
          reset();
        }}
      >
        Use this text
      </Button>
    </div>
  </div>
) : (
  /* ring area */
)}
```

Sync `editedTranscript` from `pendingTranscript` whenever `pendingTranscript` changes (a `useEffect` on `pendingTranscript`).

**Acceptance:**
- After transcription succeeds (non-empty text), TranscriptResult section renders with the text in an editable Textarea.
- Editing the Textarea changes the editable value without affecting the host field.
- "Use this text" calls `props.onTranscript` with the (edited) text, hides TranscriptResult, and returns panel to idle.
- "Re-record" discards the transcript, hides TranscriptResult, and returns panel to idle. `props.onTranscript` is NOT called.
- Empty transcripts (`data.text.trim() === ""`) → no review step; panel silently returns to idle (existing hook behaviour preserved).

### Step 7 — Add `motion-safe` guards

- Spinner: `Loader2 className="… motion-safe:animate-spin"` (replacing bare `animate-spin`).
- Waveform RAF loop: gate the `requestAnimationFrame(draw)` start on `window.matchMedia("(prefers-reduced-motion: no-preference)").matches`; fall back to drawing a static flat line or pulsing dot.

**Acceptance:** with OS reduced-motion enabled, the spinner is static and the waveform does not animate.

### Step 8 — RTL tests

Write `apps/web/components/voice/__tests__/recorder-panel.test.tsx` covering the full test matrix above. Mock `useVoiceRecorder` via `vi.mock("../use-voice-recorder")` to avoid real `MediaRecorder` in JSDOM.

**Acceptance:** all tests pass via `pnpm --filter @camp404/web test`.

### Step 9 — Storybook stories

Write `apps/web/components/voice/recorder-panel.stories.tsx` covering all stories above.

**Acceptance:** all stories render without console errors; TranscriptReview story shows editable textarea; token classes are short-form only.

---

## Consumers — which molecules/organisms/surfaces use RecorderPanel

| Consumer | File | Relationship |
|---|---|---|
| `LongTextField` (organism, app-local) | `apps/web/components/questionnaire/question.tsx` | Mounts `RecorderPanel` when `dictating === true`; `promptKey="questionnaire"`; appends transcript to Textarea value sliced to `question.maxLength`. Used by onboarding steps 03/04 (bio, burn ideas) and questionnaire runner (`long_text` questions) |
| `ReportBugDialog` (organism, app-local) | `apps/web/components/feedback/report-bug-dialog.tsx` | Mounts `RecorderPanel` when `dictating === true`; no `promptKey`; appends transcript to description, sliced to `DESCRIPTION_MAX = 5000` |
| `AnnouncementsManager` (organism, app-local, not yet built) | `apps/web/app/captains/announcements/` (target) | Will mount `RecorderPanel` via `DictatePill → dictating` toggle on the message body field; `15-announcements.md` line 31; deferred until organism is built |

`RecorderPanel` is never used on home surfaces (no home mic — decision #5). It is not consumed by any `@camp404/ui` component.

`DictatePill` (`packages/ui/src/components/dictate-pill.tsx`) is the **trigger** — it fires `onActivate` which causes the host to swap itself for `RecorderPanel`. They are siblings, never nested.
