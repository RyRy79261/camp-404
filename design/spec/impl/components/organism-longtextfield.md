# LongTextField — organism plan

- **mapsTo + home:** REUSE/EXTEND — **keep app-local** (component-library.md: "keep app-local sub-renderer"). It is **not** promoted to `@camp404/ui` because it composes two app-resident, browser-coupled siblings (`RecorderPanel` → `useVoiceRecorder`/`Waveform`, all `apps/web`-only) and is invoked from the `apps/web`-resident `FieldInput` switch. `@camp404/ui` must stay browser-global-free, so this organism stays where it is.
- **Target file:** `apps/web/components/questionnaire/question.tsx` (the `LongTextField` function, lines 418–477 today; remains an internal sub-renderer in this file, not a separate module — consistent with its siblings `ScaleField`/`ToggleField`).

> Classification rationale: the component **exists and works** today. The redesign EXTENDs it — swap the hand-rolled "Dictate instead" outline `Button` for the promoted `DictatePill`, move the trigger **above** the Textarea in a right-aligned `PillRow`, adopt the `Textarea` `variant` prop instead of ad-hoc `className`, replace verbose tokens, and (optionally) replace the local `appendTranscript` with the `@camp404/core` helper. **No functionality is dropped.**

---

## Current state — what exists today

The component is live and fully functional. Confirmed by reading the source.

- **`apps/web/components/questionnaire/question.tsx` lines 418–477** — `LongTextField({ id, question, value, onChange, fullScreen })`. A `"use client"` file (directive line 1). Internal sub-renderer reached from the `FieldInput` switch arm `case "long_text"` (lines 184–193).
- **Markup today (lines 441–476):**
  - Wrapper `<div>` — `flex flex-1 flex-col gap-3` when `fullScreen`, else `flex flex-col gap-3`.
  - `<Textarea>` (line 447) — `maxLength={question.maxLength}`, controlled `value`, `onChange` writing the raw value, `rows={fullScreen ? undefined : 6}`, and **ad-hoc** `className={fullScreen ? "min-h-[40dvh] flex-1 resize-none" : undefined}`.
  - Dictation toggle gated on local `dictating` state (`React.useState(false)`, line 431):
    - `dictating === true` → `<RecorderPanel onTranscript={appendTranscript} onDismiss={() => setDictating(false)} promptKey="questionnaire" />` (lines 458–462).
    - `dictating === false` → a **hand-rolled** `Button variant="outline" size="lg"` with a `Mic` icon + "Dictate instead", `className="h-auto gap-3 self-end px-8 py-4"` (lines 464–473) — sits **below** the Textarea, self-end.
  - `appendTranscript(text)` (lines 433–439) — trims; no-ops on empty; joins with `\n` only when `value` doesn't already end in whitespace (`/\n\s*$/`); slices the result to `question.maxLength`; calls `onChange(next)`.
- **Imports it uses today:** `Button` (line 12), `Textarea` (line 25), `Mic` from `lucide-react` (line 26), `RecorderPanel` from `../voice/recorder-panel` (line 27), `cn`, and the `LongTextQuestion` type from `@camp404/types` (line 5–10).
- **Host shell:** `QuestionField` (lines 43–85) renders the `Label` + `*` + helper + error column and delegates the control body to `FieldInput`; `LongTextField` only owns the textarea + dictation body.

Cited surfaces that drive its current behaviour: `design/spec/surfaces/20-field-renderer.md` §B5 (line 38–39, 105, 146 — append/clamp semantics), `design/spec/surfaces/04-onboarding-wizard.md` lines 44–45, 63, 69, `design/spec/surfaces/24-questionnaire-runner.md` lines 45, 72, 115.

### Gap vs spec

| Gap | Source | Action |
|---|---|---|
| Hand-rolled outline `Button` "Dictate instead" instead of the canonical pill | `molecule-dictatepill.md` Shape 2 + Step 3; `20-field-renderer.md` line 79, 174; OB boards 41/42 | Replace inline `Button` with `<DictatePill onActivate={() => setDictating(true)} />` |
| Trigger sits **below** Textarea, `self-end`; boards draw a `PillRow {jc:end}` **above** the Textarea | `04-onboarding-wizard.md` line 63; `molecule-dictatepill.md` Step 3 note | Move trigger into a right-aligned row above the Textarea (host-layout responsibility) |
| `fullScreen` height applied via ad-hoc `className` (`min-h-[40dvh] flex-1 resize-none`) | `atom-textarea.md` Step 4/7; line 453–455 | Use `<Textarea variant={fullScreen ? "fullScreen" : "default"} />` |
| `appendTranscript` duplicated identically in `report-bug-dialog.tsx:75` (only `maxLength` differs) | `service-layer/07-voice.md` §Hybrid; `20-field-renderer.md` line 146 | Replace local fn with the pure `@camp404/core` helper (see Composition) |
| Verbose `[color:var(--color-*)]` tokens in this file (the host `QuestionField`/`FieldInput`, lines 63, 67, 115, 119) | design-tokens.md §4.22 (P1-5) | Snap to short-form (`text-primary`, `text-muted-foreground`, `text-foreground`) during this pass |
| No dictation on the plain-textarea `long_text` fields (steps 09 other-burns, 11 notes) — and there must NOT be | `04-onboarding-wizard.md` line 69 | Confirm: DictatePill is shown on **bio/ideas** only. See States/Consumers |

This is **EXTEND**, not a rewrite — the state machine, append logic, and fullScreen behaviour all survive; only the trigger component, its placement, and token/helper plumbing change.

---

## Composition

### Leaf components it consumes

| Leaf | Plan file | Package | Role |
|---|---|---|---|
| `Textarea` | `design/spec/impl/components/atom-textarea.md` | `@camp404/ui/components/textarea` | Primary input body; gets the new `variant="fullScreen"` prop instead of ad-hoc className |
| `DictatePill` | `design/spec/impl/components/molecule-dictatepill.md` | `@camp404/ui/components/dictate-pill` (PROMOTE target) | The `r:999` voice-entry trigger; fires `onActivate` → `setDictating(true)`. Replaces the inline outline `Button` |
| `RecorderPanel` | `design/spec/impl/components/molecule-recorderpanel.md` | `apps/web/components/voice/recorder-panel.tsx` (app-local) | Mounted when `dictating === true`; `promptKey="questionnaire"`; its `onTranscript` is the append target, `onDismiss` returns to the pill |

`DictatePill` and `RecorderPanel` are **siblings** in this render tree (never nested) — `LongTextField` owns the `dictating: boolean` that swaps one for the other (per both leaf plans' "Relationship" sections).

### @camp404/core helpers

- **`appendTranscript(existing: string, addition: string, maxLength: number): string`** — the pure append-not-overwrite + newline-joiner + clamp logic currently inline at `question.tsx:433–439`. Per `architecture.md`, `@camp404/core` is the new pure-logic package (no `next/*`, no React, no I/O); this is exactly the "genuinely shareable, testable nugget" flagged in `service-layer/07-voice.md` §Hybrid. With the bug dialog as a second identical consumer (`report-bug-dialog.tsx:75`), extraction is justified now — **target: `@camp404/core` (e.g. `voice.ts` or `text.ts`)**, with both hosts importing it. (The voice plan's note that "packages/core does not exist" predates `architecture.md`, which is authoritative and creates the package; if `@camp404/core` slips, fall back to leaving the 4-line fn inline — no behaviour change either way.)

No other domain logic lives here. Validation (`validateOne`/`validateResponses`) stays in `@camp404/types` and is run by the wizard/server, **not** by this field.

### Services / server-actions it calls

`LongTextField` calls **no server action directly**. The voice transcription round-trip is owned entirely by `RecorderPanel` → `useVoiceRecorder` → `POST /api/voice/transcribe` (`service-layer/07-voice.md`; route REUSE, no change). `LongTextField` only receives the finished transcript string via `RecorderPanel`'s `onTranscript` callback and folds it into `value` via `appendTranscript`. The eventual persistence (`burner_profiles.responses` jsonb, `upsertBurnerProfile`) happens **on form submit, in the wizard/replay host** (`service-layer/03-questionnaire-forms.md`), not in this field — confirmed `service-layer/07-voice.md` §Consumers: "No direct DB write from this domain."

### Server-component vs "use client" split

Entirely **client**. The whole `question.tsx` file is `"use client"` (line 1) — it holds `useState` (`dictating`), event handlers, and composes browser-coupled `RecorderPanel`. There is no server-component portion of this organism.

---

## API & data flow

### Props (internal sub-renderer signature, unchanged)

```ts
function LongTextField({
  id,           // `q-${question.id}` from QuestionField
  question,     // LongTextQuestion (from @camp404/types) — carries maxLength (default 1000; bio/ideas = 2000 per catalogue)
  value,        // string — the controlled current text
  onChange,     // (value: string) => void — bubbles to the wizard's setResponse
  fullScreen,   // boolean? — page-level hint: single long_text owns the viewport
}): JSX.Element
```

### Inputs received vs fetched

- **Received (props):** `value`, `onChange`, `question` (incl. `maxLength`), `fullScreen`. The field is fully controlled — it owns no copy of the text, only the transient `dictating` flag.
- **Fetched:** nothing. The transcript is *delivered* to it by `RecorderPanel`'s callback; the field never fetches.

### State flow

```text
user types  → Textarea onChange → onChange(e.currentTarget.value) → wizard setResponse → responses[id]
                                                                                      ↑ (re-render) value
tap pill    → DictatePill onActivate → setDictating(true) → RecorderPanel mounts (pill unmounts)
record/stop → RecorderPanel (own state machine) → review → "Use this text" → onTranscript(text)
            → appendTranscript(value, text, question.maxLength) → onChange(next) → responses[id]
dismiss     → RecorderPanel onDismiss → setDictating(false) → DictatePill remounts
```

Editing the field in the wizard clears that field's error (wizard `setResponse` behaviour — `20-field-renderer.md` line 154). Append clamps to `question.maxLength`; native `maxLength` on the Textarea caps direct typing.

### Forms: actions + validation

- **No form action on this field.** It contributes a `QuestionnaireResponseValue` (a `string` for `long_text`) to the wizard's `responses` map keyed by `question.id`.
- **Validation** runs in the host on Next/Skip/Finish: `validateOne` "long_text" path → string check ("Expected text") and `length > maxLength` → "Max {maxLength} characters" (`questionnaire.ts:395–396`; `20-field-renderer.md` line 131). The error string flows back as the `error` prop on `QuestionField` (the shell), rendered as the destructive `role="alert"` line — **not** inside `LongTextField` itself.
- `long_text` defaults `required: false` (`questionnaire.ts:60`); bio (`bio.statement`) is explicitly `required`, ideas/other-burns/notes are optional (`04-onboarding-wizard.md` lines 168–169, 179, 183).

---

## States

This organism's own state surface is the `dictating` flag (pill ↔ panel swap) plus the Textarea's intrinsic states; the recorder sub-machine and the field error live in siblings.

| State | Trigger | Render |
|---|---|---|
| **empty** | `value === ""` | Textarea shows placeholder (`text-muted-foreground`); DictatePill visible above; no error |
| **populated** | `value !== ""` | Textarea shows text (`text-foreground`); DictatePill visible |
| **typing** | user typing | Native input; clamped at `maxLength` |
| **dictating** | `dictating === true` (pill tapped) | DictatePill unmounts; `RecorderPanel` mounts in its place (which runs idle → requesting → recording → processing → transcript-review → error internally — see `molecule-recorderpanel.md`) |
| **dictation-disabled (pill)** | host can pass `disabled` to DictatePill while panel busy | Pill `opacity-50`, inert (per `molecule-dictatepill.md`). Not strictly required here since the pill is *unmounted* while the panel is open; documented for completeness |
| **error (field validation)** | wizard sets `error` prop on `QuestionField` | Destructive `role="alert"` line under the field, rendered by the **shell**, not this body. Control border may shift `border-destructive` via `aria-invalid` (`atom-textarea.md`) |
| **submitting** | wizard `isPending` (useTransition) on Next/Finish | Field is **NOT** disabled mid-submit (`20-field-renderer.md` line 89; `24-questionnaire-runner.md` line 100); only the wizard footer nav disables |
| **success** | n/a | Not expressed by this field — the wizard advances or `onComplete` fires |
| **disabled** | n/a | No general per-field disabled in the normal flow (`20-field-renderer.md` line 91) |
| **fullScreen** | `fullScreen === true` (single `long_text` page) | Wrapper `flex flex-1 flex-col`; Textarea `variant="fullScreen"` (`min-h-[40dvh] flex-1 resize-none`); grows to fill viewport |
| **no-dictation variant** | plain `long_text` (other-burns step 09, notes step 11) | **No DictatePill** — these steps render a plain Textarea only (`04-onboarding-wizard.md` line 69). See note below |

### Global gating matrix / preview-but-locked

**Not applicable to this organism.** The field renderer is **rank-agnostic** and has **no locked variant** — it never renders `CaptainLock` and never gates data (`20-field-renderer.md` line 97: "Gating states … NOT expressed by this renderer … gating decides whether the wizard mounts at all"). The invite-gated / onboarding-incomplete / pending-approval / preview-but-locked states are handled by the page/gating spine upstream (locked decision 3), so the preview-but-locked clause does not bind here. Documented explicitly so the matrix is complete: **empty / loading (n/a — no fetch) / error (shell) / submitting (footer-only) / success (wizard) / disabled (n/a) / locked (n/a — not a captain/rank surface).**

### Note — which long_text fields show the pill

DictatePill appears **only** on `bio.statement` (step 03, required) and `ideas.this_year` (step 04, optional) per the boards (`04-onboarding-wizard.md` lines 44–45, 63). The other `long_text` fields (`history.other_burns` step 09, `dietary.notes` step 11, max 1000) render a **plain Textarea with no pill** (line 69). Since `LongTextField` is the single sub-renderer for *all* `long_text` kinds, it must support both. **Recommendation:** drive pill visibility from a question-level flag (e.g. `question.dictation !== false`, or a catalogue list of dictation-enabled ids) rather than hard-coding — confirm in build (Open question). Until that flag exists, the safe default mirrors current behaviour: the pill is shown on all `long_text` fields, with bio/ideas being the only ones the boards draw it on. Carry as a build flag; do not silently diverge.

---

## Build steps

**Dependency prerequisites (must land first):**
1. `foundations-tokens` Phase 0 (radius scale, short-form token utilities) — gates `Textarea` and `DictatePill` token alignment.
2. **`atom-textarea.md`** — the `variant` prop (`"default" | "fullScreen"`) must ship so this organism can drop the ad-hoc className (Textarea Step 4/7).
3. **`molecule-dictatepill.md`** — `DictatePill` must be built in `@camp404/ui` and exported (DictatePill Steps 1–2). DictatePill Step 3 already specifies the swap *inside* `question.tsx`; coordinate so this organism plan and that leaf plan land the same edit once.
4. **`molecule-recorderpanel.md`** — RecorderPanel EXTEND (transcript-review state) should land; LongTextField's contract with it (`onTranscript`/`onDismiss`/`promptKey`) is unchanged, so this is a soft prerequisite (current RecorderPanel already satisfies the call).
5. (Optional) `@camp404/core` package exists with `appendTranscript` exported — for Step 4.

### Step 1 — Replace the inline trigger with `DictatePill`, repositioned above the Textarea
Remove the hand-rolled `Button variant="outline" size="lg"` block (lines 464–473) and the `Mic` import if no longer used in the file. Render `<DictatePill onActivate={() => setDictating(true)} />` inside a right-aligned `PillRow` **above** the Textarea: wrap in `<div className="flex justify-end">` per board `PillRow {jc:end}`.
- **AC:** the dictation trigger is the `r:999` pill (not a rectangular button); it renders above the Textarea, right-aligned; tapping it sets `dictating = true` and mounts `RecorderPanel`; the voice flow is otherwise unchanged.

### Step 2 — Adopt the `Textarea` `variant` prop
Replace `className={fullScreen ? "min-h-[40dvh] flex-1 resize-none" : undefined}` (lines 453–455) with `variant={fullScreen ? "fullScreen" : "default"}`. Keep `rows={fullScreen ? undefined : 6}` (the fullScreen variant supplies grow behaviour).
- **AC:** no `min-h-[40dvh]` / `resize-none` literal in this file's className; fullScreen pages still grow the textarea to fill the viewport; default pages stay at the 6-row height.

### Step 3 — Snap verbose tokens to short-form
In the host shell `QuestionField`/`FieldInput` (lines 63, 67, 115, 119, and any `[color:var(--color-*)]` in this file), replace with short-form utilities (`text-primary`, `text-muted-foreground`, `text-foreground`). (Scoped to the lines this organism touches; the broader `question.tsx` token sweep belongs to the field-renderer pass.)
- **AC:** zero `[color:var(--color-` strings in the `LongTextField` + its shell rows; visual output unchanged.

### Step 4 — Extract `appendTranscript` to `@camp404/core` (optional, gated on Step-5 prereq)
Move the pure append/clamp logic to `@camp404/core` (`appendTranscript(existing, addition, maxLength): string`); import it here and in `report-bug-dialog.tsx`. Preserve exact semantics: trim, no-op on empty, `\n` joiner only when existing doesn't end in whitespace (`/\n\s*$/`), slice to `maxLength`.
- **AC:** both hosts import the shared helper; the in-component closure passed to `RecorderPanel` is `(text) => onChange(appendTranscript(value, text, question.maxLength))`; behaviour byte-identical to today. If `@camp404/core` is unavailable, skip this step (leave the 4-line fn inline) — no behaviour change.

### Step 5 — Confirm the per-field dictation toggle (other-burns / notes)
Decide and wire pill visibility: drive from a question-level flag/catalogue so steps 09/11 render a plain Textarea (no pill) per `04-onboarding-wizard.md` line 69, while bio/ideas show the pill. Until the flag is confirmed, keep current behaviour (pill on all `long_text`) and flag it.
- **AC:** bio (03) + ideas (04) show the pill; other-burns (09) + notes (11) render plain Textarea iff the flag lands; decision documented, no silent divergence.

### Step 6 — Tests
Co-locate with the renderer (`apps/web/components/questionnaire/__tests__/question.test.tsx`, extending the existing `apps/web/components/__tests__/questionnaire.test.ts` coverage). Mock `RecorderPanel`/`useVoiceRecorder`.

| Test | Assertion |
|---|---|
| Renders Textarea with `value` and `maxLength` | controlled value present; native `maxLength` = `question.maxLength` |
| Typing calls `onChange` with raw value | `userEvent.type` → `onChange` spy gets typed text |
| DictatePill visible by default; tapping mounts RecorderPanel | pill present; click → `RecorderPanel` rendered, pill gone |
| `onTranscript` appends, joined with `\n`, when text doesn't end in whitespace | transcript fired → `onChange` gets `value + "\n" + transcript` |
| Append no-ops on empty/whitespace transcript | empty transcript → `onChange` not called |
| Append clamps to `maxLength` | long transcript → result `.length <= question.maxLength` |
| `onDismiss` returns to pill | dismiss → `RecorderPanel` gone, pill back |
| `fullScreen` applies the Textarea fullScreen variant | `fullScreen` → grow classes present (via variant) |
| No verbose tokens | no `[color:var(--color-` in rendered className |
| (Step 5) no pill on other-burns/notes | plain Textarea, no DictatePill, when dictation flag false |

- **AC:** all pass via `pnpm --filter @camp404/web test`.

---

## Consumers — which surfaces mount it

| Surface | File / mount | Usage |
|---|---|---|
| Onboarding wizard — step 03 *A bit about you* | `04-onboarding-wizard.md` lines 44, 63; `apps/web/components/questionnaire/wizard.tsx` → `QuestionField` → `FieldInput` `long_text` | `bio.statement` (required, max 2000), `fullScreen`, **DictatePill** shown |
| Onboarding wizard — step 04 *Burn ideas* | `04-onboarding-wizard.md` lines 45, 63 | `ideas.this_year` (optional, max 2000), `fullScreen`, **DictatePill** shown |
| Onboarding wizard — step 09 *Other burns* | `04-onboarding-wizard.md` line 69 (179) | `history.other_burns` (optional, max 1000), plain Textarea, **no pill** |
| Onboarding wizard — step 11 *Dietary notes* | `04-onboarding-wizard.md` line 69 (183) | `dietary.notes` (optional, max 1000), plain Textarea, **no pill** |
| Questionnaire runner (blocking) | `24-questionnaire-runner.md` lines 45, 72, 115 | `long_text` questions inside `CurrentQuestionCard`; DictatePill → RecorderPanel append; `promptKey="questionnaire"` |
| My-forms replay/edit (unit 12) | `20-field-renderer.md` line 3; `atom-textarea.md` Consumers | Same `long_text` rendering in the form-replay/edit flow; change-log diff persisted by the replay host |
| Field-kind renderer sheet (unit 20) | `20-field-renderer.md` §B5 | The canonical `long_text` arm of `FieldInput` — the contract this organism implements |

It is mounted **only** via the `FieldInput` `case "long_text"` arm (`question.tsx:184–193`). It is **not** used on any home surface (no home mic, decision #5), and is never consumed by any `@camp404/ui` component. The sibling `AnnouncementsManager` message body (`15-announcements.md` line 31) and `ReportBugDialog` use `Textarea` + `DictatePill` + `RecorderPanel` **directly** (their own hosts), not via this `LongTextField` sub-renderer.
