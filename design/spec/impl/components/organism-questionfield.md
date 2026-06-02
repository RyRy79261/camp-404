# QuestionField — organism plan

- **mapsTo + home:** **REUSE** (extend in place — the shell + 10-kind switch already exist and are correct in shape). Lives **app-local in `apps/web`** per `component-library.md` ("keep `apps/web/components/questionnaire/question.tsx`"). It is NOT promoted to `@camp404/ui`: it composes app-resident sub-renderers (`LongTextField` → `RecorderPanel` + `useVoiceRecorder` browser hook, `AvatarUpload` upload pipeline) and is bound to `@camp404/types` `Question`/`QuestionnaireResponseValue` shapes — a polymorphic field host, not a reusable primitive. The reusable controls it switches into (Slider, SegmentedControl, OptionCardGroup, Combobox, Select, DateControl, Input, Textarea, AvatarUpload, DictatePill, RecorderPanel) are the PROMOTE/NEW/REUSE units; QuestionField is the app-side glue that selects + wraps them.
- **Target file:** `apps/web/components/questionnaire/question.tsx` (extend in place; same file also houses the `FieldInput` switch and the `LongTextField` / `ScaleField` / `ToggleField` sub-renderers being decomposed out into PROMOTE'd components).

> **Sibling units this plan depends on / hands work to (read together):**
> `molecule-optioncardgroup.md`, `molecule-segmentedcontrol.md`, `molecule-datecontrol.md`,
> `molecule-avatarupload.md`, `molecule-combobox.md`, `molecule-select.md`, `atom-slider.md`,
> `atom-input.md`, `atom-textarea.md`, `molecule-dictatepill.md`, `molecule-recorderpanel.md`,
> and the **LongTextField** organism (component-library `## LongTextField`, "keep app-local
> sub-renderer" — its detailed contract lives in `20-field-renderer.md §B5` + the DictatePill/
> RecorderPanel plans; it has no standalone leaf file and is built inside `question.tsx`).
> Surface contract: `20-field-renderer.md` (the canonical 10-kind decomposition).

---

## Current state — what exists today (the old design's component/route markup)

**The component exists and works.** `apps/web/components/questionnaire/question.tsx` (verified, read in full) is a `"use client"` module exporting `QuestionField` plus an internal `FieldInput` switch and three internal sub-renderers (`ToggleField`, `ScaleField`, `LongTextField`).

- **`QuestionField` shell** (`question.tsx:43–85`): vertical stack (`flex flex-col gap-2`, or `flex flex-1 flex-col gap-2` when `fullScreen`). Renders:
  - `Label htmlFor="q-{question.id}"` carrying `question.prompt`, plus a required `*` span (`"required" in question && question.required`) coloured `text-[color:var(--color-primary)]` (`:60–65`).
  - Optional helper `<p class="text-xs …muted-foreground">` when `question.helper` is set (`:66–70`).
  - `<FieldInput …>` control slot (`:71–77`).
  - Error line `<p class="text-xs text-destructive" role="alert">` when `error` is set (`:78–82`).
- **`FieldInput` switch** (`question.tsx:87–242`): exhaustive `switch (question.kind)` over all **10 kinds** (`slider`, `single_select`, `multi_select`, `short_text`, `long_text`, `date`, `scale`, `toggle`, `combobox`, `image`), no `default` arm. Current per-kind renders:
  - `slider` → `@camp404/ui` `Slider` + a 3-up min/value/max label row, value defaults to `question.min`, commits via `onChange(v[0] ?? current)` (`:101–127`).
  - `single_select` → shadcn `Select` dropdown, placeholder "Choose one…" (`:128–145`). **Diverges from boards** — must become OptionCardGroup radio cards.
  - `multi_select` → inline `Checkbox + Label` rows (no card border), `Set`-based toggle, emits `string[]` (`:146–174`). **Diverges from boards** — must become OptionCardGroup checkbox cards / chip-grid.
  - `short_text` → `Input` with native `maxLength` (`:175–183`).
  - `long_text` → `LongTextField` sub-renderer (`:184–193`).
  - `date` → bare `<Input type="date">` (`:194–202`). **Gap** — no DateControl wrapper / calendar icon / ISO contract.
  - `scale` → `ScaleField` (dual-layout Radix Slider) (`:203–211`). **Diverges from boards** — must become SegmentedControl `scale` variant.
  - `toggle` → `ToggleField` (segmented radiogroup) (`:212–220`). **Promote** to SegmentedControl.
  - `combobox` → `@camp404/ui` `Combobox` (`:221–231`).
  - `image` → circular `AvatarUpload` (`:232–240`).
- **`ToggleField`** (`:249–288`): `role="radiogroup"` of `<button role="radio">` cells; emits the string option `value` (never boolean). Verbose `[color:var(--color-*)]` tokens.
- **`ScaleField`** (`:297–403`): renders a **Radix Slider** over step indices — vertical `70dvh` on mobile (`md:hidden`), horizontal on `md:` up; axis index-inverted so top label = highest value; untouched highlights middle step uncommitted. Value = the chosen step's string `value`.
- **`LongTextField`** (`:418–477`): `Textarea` (rows=6, or `min-h-[40dvh] flex-1` when `fullScreen`) + an inline `Button variant="outline"` "Dictate instead" with a `Mic` icon that toggles `dictating`; when true it mounts `RecorderPanel` (`promptKey="questionnaire"`) and appends each transcript (`appendTranscript`: trim, `\n`-join only when text doesn't already end in whitespace, slice to `maxLength`).

**Host / route markup that mounts it:** `apps/web/components/questionnaire/wizard.tsx` (`QuestionnaireWizard`) maps `page.questions` to `<QuestionField key value onChange error fullScreen />` (`wizard.tsx:224–233`), passing `responses[q.id]`, `setResponse`, `errors[q.id]`, and `isFullScreen` (`wizard.tsx:149–155`). The wizard is reached from `apps/web/app/onboarding/questionnaire/page.tsx` (onboarding + blocking-runner) and the my-forms replay shell (`/tools/forms/[key]`).

**Types it binds to:** `@camp404/types/questionnaire` — `Question` (10-member discriminated union), `QuestionnaireResponseValue` (`number | string | string[] | boolean | null`; the `boolean` member is vestigial), and the per-kind question types (`LongTextQuestion`, `ScaleQuestion`, `ToggleQuestion`, etc.).

**Classification rationale:** the shell, the exhaustive switch, the value plumbing, and the kind set are all correct and stay (REUSE). The redesign work is (a) swapping three switch arms onto the PROMOTE'd board-canonical controls (single_select/multi_select → OptionCardGroup; scale/toggle → SegmentedControl), (b) wrapping `date` in the NEW DateControl, (c) swapping the inline "Dictate instead" button for DictatePill and the circular AvatarUpload for the dropzone variant on the generic `image` field, and (d) the P1-5 token codemod. No functionality is dropped; every kind survives.

---

## Composition — leaf components, core helpers, services

### Leaf components it consumes (one switch arm each)

| Kind | Control (post-redesign) | Plan | Home | Action |
|---|---|---|---|---|
| `slider` | `Slider` + min/value/max label row | `atom-slider.md` | `@camp404/ui` | REUSE |
| `single_select` | `OptionCardGroup mode="single" layout="stack"` | `molecule-optioncardgroup.md` | `@camp404/ui` | **swap** from `Select` dropdown (boards win) |
| `multi_select` | `OptionCardGroup mode="multi"` (`layout="stack"` default; `"chip-grid"` for dietary) | `molecule-optioncardgroup.md` | `@camp404/ui` | **swap** from inline Checkbox rows |
| `short_text` | `Input` (`maxLength`) | `atom-input.md` | `@camp404/ui` | REUSE |
| `long_text` | `LongTextField` (Textarea + DictatePill→RecorderPanel) | `20-field-renderer.md §B5` + `molecule-dictatepill.md` + `molecule-recorderpanel.md` | **app-local** in `question.tsx` | REUSE/EXTEND |
| `date` | `DateControl` (`<Input type="date">` + calendar icon, ISO contract) | `molecule-datecontrol.md` | `@camp404/ui` | **wrap** (NEW component) |
| `scale` | `SegmentedControl variant="scale"` (full-viewport vertical layout retained for `fullScreen`) | `molecule-segmentedcontrol.md` | `@camp404/ui` | **swap** from `ScaleField` slider (boards win) |
| `toggle` | `SegmentedControl variant="equal"` | `molecule-segmentedcontrol.md` | `@camp404/ui` | PROMOTE from `ToggleField` |
| `combobox` | `Combobox` (Popover + cmdk) | `molecule-combobox.md` | `@camp404/ui` | REUSE |
| `image` | `AvatarUpload` (`variant="dropzone"` generic; `"circle"` for `profile.image`) | `molecule-avatarupload.md` | `@camp404/ui` | REUSE/EXTEND |
| (label) | `Label` | `atom-label.md` | `@camp404/ui` | REUSE — shell `htmlFor` + required `*` |

`Select` (`molecule-select.md`) stays in `@camp404/ui` for other consumers (announcements presentation selector) but is **removed from the `single_select` arm**. The `boolean` `QuestionnaireResponseValue` member stays vestigial — toggle and scale persist a **string** option `value`, never a boolean.

### `@camp404/core` helpers

**None.** QuestionField (and its sub-renderers) hold zero domain/business logic. Per `architecture.md` the questionnaire **validation engine stays in `@camp404/types`** (`validateOne`/`validateResponses`/`flattenQuestions`/`displayResponseValue`), and the `QUESTIONNAIRE` catalogue + `validateIdNumber` move to `@camp404/core` (plan 03) — but the **wizard**, not QuestionField, calls those. QuestionField is presentation-only: it receives a single `Question`, the current value, and an `onChange`, and emits a typed value. It never imports `@camp404/db`, `@camp404/core`, or `next/*`.

### Services / server-actions it calls

**None directly.** QuestionField is a controlled, stateless-per-render field; it has **no data fetch and no server action**. All persistence/validation is owned by the host `QuestionnaireWizard`, which calls the page `action` (`saveBurnerProfile` for onboarding/runner, `saveFormReplay` for my-forms — service-layer plan 03) on Next/Submit. The two indirect server touches sit **inside leaf components**, not QuestionField:

- `LongTextField → RecorderPanel → useVoiceRecorder` POSTs to `/api/voice/transcribe` (voice domain, plan 07) — entirely encapsulated in the recorder hook.
- `image → AvatarUpload` POSTs to the avatar upload endpoint and emits the returned public URL string (plan 09 `avatar-blob.ts`; the upload pipeline lives in the AvatarUpload molecule).

### Server-component vs `"use client"` split

QuestionField is **`"use client"`** (it carries `onChange` handlers and interactive controls; line 1 of `question.tsx`). It is mounted only inside the `"use client"` `QuestionnaireWizard`. The **server** boundary is upstream: the route server component (`apps/web/app/onboarding/questionnaire/page.tsx` / the replay loader) resolves session → camp-user → profile → decrypted ID pre-fill, then hands a hydrated `initialResponses` + `questionnaire` to the client wizard. QuestionField never runs on the server and never reads env/session.

---

## API & data flow

### Props (unchanged shape — `QuestionFieldProps`)

```ts
interface QuestionFieldProps {
  question: Question;                                  // one member of the 10-kind union
  value: QuestionnaireResponseValue | undefined;       // current responses[question.id]
  onChange: (value: QuestionnaireResponseValue) => void; // bubbles to wizard setResponse
  error?: string;                                       // per-field message from validatePageLocally / validateOne
  fullScreen?: boolean;                                 // page owns the viewport (single scale/long_text/image)
}
```

`FieldInput` (internal) takes the same minus `error`, plus the derived `id = "q-{question.id}"`.

### What it fetches vs receives

- **Receives (all props):** `question`, the current `value`, the `error`, and the `fullScreen` flag — all owned and supplied by `QuestionnaireWizard`.
- **Fetches:** nothing. (Voice transcription and image upload are leaf-internal, above.)

### How state flows

1. Wizard holds `responses: QuestionnaireResponses` and `errors: Record<string,string>` (`wizard.tsx:59–62`).
2. For each question on the page it renders `<QuestionField value={responses[q.id]} error={errors[q.id]} onChange={(v) => setResponse(q.id, v)} fullScreen={isFullScreen} />` (`wizard.tsx:224–233`).
3. User interacts → the control's `onChange` → QuestionField forwards the typed value → wizard `setResponse(id, value)` writes `responses[id]` **and clears any existing error for that field** (`wizard.tsx:69–77`).
4. Per kind the emitted type is: `slider`→`number`; `multi_select`→`string[]`; `image`→`string | null`; all others→`string`. `long_text` emits the (possibly transcript-appended) string. QuestionField itself is stateless except `LongTextField`'s local `dictating: boolean`.

### Forms: actions + validation (owned by the wizard, surfaced through QuestionField)

QuestionField has no form/action of its own; it is one field inside the wizard's `<form>`. Validation surfaces back into it via the `error` prop:
- **Local pre-check:** `validatePageLocally` (`wizard.tsx:79–101`) — required-and-missing → "This question is required"; plus the single cross-field rule for `id.number` → `validateIdNumber(responses["id.type"], value)` (SA-ID Luhn / passport).
- **Server-authoritative:** `validateResponses`/`validateOne` (`@camp404/types/questionnaire`) at the save boundary; returned per-field errors (keyed by `q.id`) flow into `errors` and back into the matching QuestionField's `error` prop; `_form`/`_root` page-level errors render in the wizard banner, **not** in any QuestionField.
- **Editing clears error:** any change to a field clears its own error (`setResponse`).

---

## States — every state incl. the global matrix + gating

Per-field render states (each kind expresses the empty/populated pair; the field-renderer brief `20-field-renderer.md §States` is the canonical per-kind table):

| State | What QuestionField shows | Source |
|---|---|---|
| **Empty / unfilled** | shell + control in its zero state: `slider`→`min`; `single_select`→no card selected; `multi_select`→none checked; `short_text`/`long_text`→empty/placeholder; `date`→empty native field; `scale`→middle step highlighted **but uncommitted**; `toggle`→no segment `aria-checked`; `combobox`→placeholder; `image`→dropzone "Add photo" | `20-field-renderer.md §States` |
| **Populated** | controls reflect `value`; selects/toggle/combobox resolve labels; multi shows checked; scale highlights chosen step; image shows photo + remove X | `question.tsx` per-arm |
| **Loading** | **N/A for QuestionField.** The wizard mounts already hydrated (server pre-resolves data → "no client spinner", `04-onboarding-wizard.md §Loading`). The field never has its own loading state | `04-onboarding-wizard.md` |
| **Error (validation)** | `error` prop set → destructive `<p role="alert">` under the control; the control border may switch to `$destructive` (board draws it on `date`; DateControl/SegmentedControl/OptionCardGroup expose an `error` flag for the control ring) | `question.tsx:78–82`; leaf plans |
| **Submitting** | the wizard's `isPending` (`useTransition`) disables Back/Next; **individual fields are NOT disabled mid-submit** (matches live). Two field-local sub-states exist: `image` upload (`AvatarUpload` spinner overlay + disabled buttons + "Uploading…") and `long_text` dictation (`RecorderPanel` requesting/recording/processing/error) | `20-field-renderer.md §Submitting`; `24-questionnaire-runner.md` |
| **Success** | **not expressed by QuestionField** — the wizard advances / fires `onComplete` / persists the diff. `image` "success" = the uploaded photo renders | `20-field-renderer.md §States` |
| **Disabled** | no general per-field disabled in the normal flow; `Combobox`/`OptionCardGroup`/`SegmentedControl`/`DateControl` accept `disabled` but the renderer does not pass it; `AvatarUpload` self-disables while uploading | `20-field-renderer.md §States` |
| **fullScreen** | shell becomes `flex flex-1`; flips `scale` to its `70dvh` vertical layout, lets `long_text` grow (`min-h-[40dvh] flex-1`), centres `image`. Owned by the wizard (`isFullScreen`), consumed via the `fullScreen` prop | `wizard.tsx:149–155`; `question.tsx:52–59` |

### Global matrix + gating — **preview-but-locked does NOT apply**

QuestionField is **rank-agnostic and identity-only**. Per the locked decisions it never renders a `CaptainLock`, never withholds/zeroes data, and has no locked variant. Gating decides whether the **wizard mounts at all** (the app/page gating spine, locked decision 3) — not what the field renders:

- **Invite-gated / onboarding-incomplete / pending-or-rejected approval / preview-but-locked (D3):** **N/A to this organism.** Explicit in `20-field-renderer.md §Gating states` ("It is rank-agnostic and has no locked variant … never renders a `CaptainLock` and never gates data") and `24-questionnaire-runner.md` line 105 ("Preview-but-locked (decision #3): does NOT apply — this is not a captain/rank surface; there is no `CaptainLock` variant. The runner returns real data for its own user only").
- The runner *surface* is itself a gate (it is mounted only because of a pending blocking `required_action`), and `my-forms` has **no rank gate** (`12-my-forms.md` line 118) — but in all three hosts QuestionField renders the same, for the current user only.

This is the one place a captain/rank organism plan would add a preview-but-locked column; here it is deliberately absent.

---

## Build steps — ordered, with prerequisites + acceptance + tests

> **Hard prerequisites (must land first):** Phase 0 foundations-tokens (status tokens, radius scale, `--text-*` steps, short-form Tailwind utilities). Each leaf control below must ship before its arm is rewired.

### Step 1 — P1-5 token codemod in `question.tsx` (REUSE-safe, no behaviour change)
Replace every verbose `[color:var(--color-*)]` in `QuestionField`, `FieldInput`, `ToggleField`, `ScaleField`, `LongTextField` with short-form Tailwind utilities (`text-muted-foreground`, `text-foreground`, `text-primary`, `border-border`, `bg-primary`, etc.). Resolve the required-`*` colour: keep `$primary` (live) unless the token spec decides `$destructive` (open question — `20-field-renderer.md §Divergence 5`).
- **Prereq:** Phase 0 tokens.
- **Acceptance:** zero `[color:var(--color-` strings in `question.tsx`; pixel-identical render; existing questionnaire tests green.
- **Tests:** snapshot/class assertion that no verbose token strings remain.

### Step 2 — `single_select` → `OptionCardGroup mode="single"`
Replace the `Select` arm (`:128–145`) with `<OptionCardGroup mode="single" layout="stack" options value onChange aria-labelledby={id} />`. Keep `Select` exported in `@camp404/ui` for other consumers.
- **Prereq:** `molecule-optioncardgroup.md` shipped + exported.
- **Acceptance:** single_select questions render as radio cards (OB steps 08/09 driving/onsite/AB-count, step 10 burn intent = 6 cards); selecting a card emits the option `value`; old dropdown gone.
- **Tests:** RTL — clicking a card calls `onChange(value)`; only one selected at a time; required-missing surfaces the error line.

### Step 3 — `multi_select` → `OptionCardGroup mode="multi"` (+ chip-grid)
Replace the inline Checkbox rows (`:146–174`) with `<OptionCardGroup mode="multi" layout={chipGrid ? "chip-grid" : "stack"} … />`. Drive chip-grid from a **NEW optional `chipGrid?: boolean` on `MultiSelectQuestion`** in `@camp404/types/questionnaire.ts` set on the dietary questions (recommended in `molecule-optioncardgroup.md` Step 4; non-breaking types EXTEND) — so QuestionField stays presentation-driven, not id-aware.
- **Prereq:** OptionCardGroup shipped; `@camp404/types` `chipGrid` field added.
- **Acceptance:** lead-teams (8) + years (6) render as checkbox cards; dietary dislikes/allergies render as 2-col chip-grids; toggling emits `string[]`; zero-selection allowed; indeterminate→remove branch preserved.
- **Tests:** RTL — add/remove updates the array; chip-grid renders `grid-cols-2`; dietary question carries `chipGrid:true`.

### Step 4 — `scale` + `toggle` → `SegmentedControl`
- `toggle` arm: replace `ToggleField` with `<SegmentedControl variant="equal" options value onChange aria-label={prompt} />`; persisted value stays the string option `value`.
- `scale` arm: replace `ScaleField` with `<SegmentedControl variant="scale" … />` for inline scale; **retain the `70dvh` vertical layout for `fullScreen` single-question scale pages** (confirm per `20-field-renderer.md` open question — full-screen scale may keep the vertical slider while inline uses segments). Value stays the chosen step's string `value`; untouched = middle step uncommitted.
- Delete the now-dead `ToggleField`/`ScaleField` inline sub-renderers from `question.tsx`.
- **Prereq:** `molecule-segmentedcontrol.md` shipped + exported.
- **Acceptance:** toggle renders a segmented row emitting a string (never boolean); scale renders segmented cells inline and the vertical full-viewport layout on lone fullScreen scale pages; OB step 06 team-interest + S26 runner scale parity.
- **Tests:** RTL — toggle/scale emit string option values; `validateOne` "scale"/"toggle" paths still pass; fullScreen scale keeps the vertical layout.

### Step 5 — `date` → `DateControl`
Replace the bare `<Input type="date">` (`:194–202`) with `<DateControl value onChange error={!!error} id={id} />`; DateControl enforces the ISO `yyyy-mm-dd` emit contract, adds the calendar icon + `h-11` + `bg-muted`, and exposes the `error` ring.
- **Prereq:** `molecule-datecontrol.md` shipped + exported.
- **Acceptance:** date kind shows the calendar affordance, emits `yyyy-mm-dd`; error state switches the control border to `$destructive`.
- **Tests:** RTL — emits ISO string; error prop drives `border-destructive`. (Carry the documented `2026-02-31` `Date.parse` overflow + server-side `id.number` gaps as flags — do not silently patch, per house policy.)

### Step 6 — `long_text` → DictatePill + RecorderPanel host refactor
In `LongTextField`, replace the inline `Button variant="outline"` "Dictate instead" with `<DictatePill onActivate={() => setDictating(true)} />`, and move it into a right-aligned `PillRow {jc:end}` **above** the Textarea (board placement, `04-onboarding-wizard.md` line 63). Keep `dictating` toggle, `RecorderPanel promptKey="questionnaire"`, and `appendTranscript` (trim → `\n`-join when not already trailing-whitespace → slice to `maxLength`). RecorderPanel's NEW `transcript-review` step is owned by that molecule.
- **Prereq:** `molecule-dictatepill.md` + `molecule-recorderpanel.md` shipped; `DictatePill` exported from `@camp404/ui`; dead `apps/web/components/voice/dictate-button.tsx` deleted.
- **Acceptance:** the pill (`r:999`) sits above the Textarea, opens RecorderPanel, transcript appends and clamps to `maxLength`; mixing typed + dictated text works; fullScreen Textarea still grows.
- **Tests:** RTL — pill activates → RecorderPanel mounts; "Use this text" appends + clamps; dismiss returns to the pill.

### Step 7 — `image` → AvatarUpload dropzone variant on the generic field
Pass `variant="dropzone"` for the generic `image` field-renderer (board's rectangular dropzone + 10 MB / JPG-PNG helper + Uploading + Thumb-with-remove); keep `variant="circle"` for the `profile.image` instance (resolve which question id routes to which per `20-field-renderer.md` open question on affordance unification). Value stays the public URL string (`null` on remove); upload errors stay inside AvatarUpload, not the field `error` prop.
- **Prereq:** `molecule-avatarupload.md` shipped with the `dropzone` variant.
- **Acceptance:** generic image fields show the dropzone; profile photo keeps the circular crop; upload→URL→remove round-trips; the field `error` prop is not used for upload failures.
- **Tests:** RTL — upload emits the URL; remove emits `null`; variant prop selects the shape.

### Step 8 — Regression sweep + e2e
Verify the exhaustive 10-arm switch still has no `default`, all kinds render, and the shared engine works across all three hosts.
- **Prereq:** Steps 1–7.
- **Acceptance:** `apps/web/components/__tests__/questionnaire.test.ts` + `apps/web/tests/e2e/onboarding-questionnaire.spec.ts` green; OB wizard, blocking runner, and my-forms replay all render every kind; no functionality dropped.
- **Tests:** the existing unit + e2e suites, extended for the swapped controls.

---

## Consumers — which surfaces mount it

QuestionField is mounted **only** through the shared `QuestionnaireWizard` (never directly by a surface page); the wizard is reused 1:1 across all three hosts:

| Surface | Route | How QuestionField is reached | Mode notes |
|---|---|---|---|
| **04 Onboarding wizard** | `/onboarding/questionnaire` | `QuestionnaireWizard` maps `page.questions` → `QuestionField` | `persistProgress=true`, `firstStepSignOut`, per-step OB pages; `04-onboarding-wizard.md` lines 87, 136 |
| **24 Questionnaire runner (blocking)** | `/onboarding/questionnaire` (blocking variant; future `ACTION_ROUTES`) | same wizard inside `BlockingTopBar` + `BlockingNotice`, one `CurrentQuestionCard` per step | rank-agnostic, no CaptainLock; `24-questionnaire-runner.md` lines 37, 70, 105 |
| **12 My forms (replay)** | `/tools/forms/[key]` | `FormReplay` → `QuestionnaireWizard` (`persistProgress=false`, `submitLabel="Save changes"`, `action=saveFormReplay`) pre-seeded with stored answers | no rank gate; `12-my-forms.md` lines 64, 118 |

Indirectly named as the field machine for **20 Field-kind renderer** (the canonical decomposition sheet, no route of its own). The sub-renderer **LongTextField** (built inside `question.tsx`) is additionally the named `long_text` host for OB steps 03/04 and the announcements message body — but those reach it through this organism's `long_text` arm or the standalone LongTextField unit, not a second QuestionField mount.

WROTE design/spec/impl/components/organism-questionfield.md
