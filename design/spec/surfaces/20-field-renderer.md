# Field-kind renderer — functional brief

- **Route(s):** n/a — shared component sheet. Mounted inside the onboarding wizard (unit 04 / OB Step 01–11) and the form-replay/edit flow (unit 12). No route of its own.
- **Canonical board(s):** `design/.spec-extract/boards/14-s05-field-kinds.txt` (S05 — all 10 kinds, drawn affordances), `design/.spec-extract/boards/33-s24-primitive-kit.txt` (S24 — primitive kit: the underlying Switch / Checkbox / Segmented / Input / Combobox primitives this renderer composes).
- **Reference contract (NOT binding):** `design/feature-set/20-question-field-kinds.md`.
- **Superseded-or-dropped:** none dropped from this surface — all 10 question **kinds** survive. Board affordances *re-skin* two kinds (scale → segmented row; toggle → switch list) without removing the kind. The S24 board's `Segmented` "Day/Week/Month" is a primitive showcase, not a question kind. See Divergences.
- **Breakpoints:** mobile-first 430px is the canonical board width. The renderer is responsive at the kind level: `scale` and `long_text` have a distinct full-viewport (`fullScreen`) presentation when they are the only question on a page; `scale` additionally swaps a **vertical** slider (mobile, `md:hidden`, `h-[70dvh]`) for a **horizontal** slider (`md:` and up). All other kinds are single-column `w:fill_container`.

## Purpose

Render any one questionnaire `Question` as the correct input control for its `kind`; surface the prompt, optional helper line, required marker (`*`), and per-field validation error; emit a typed `QuestionnaireResponseValue` on change; and define the per-kind data shape, options, ranges, and validation. This is the single polymorphic field unit shared by the onboarding wizard and the form-replay flow. Exactly **10 question kinds** exist and must all be supported: `slider`, `single_select`, `multi_select`, `short_text`, `long_text`, `date`, `scale`, `toggle`, `combobox`, `image`.

## Layout & modules (decomposition)

Every kind is wrapped by a common **`QuestionField`** shell, then delegates the control body to **`FieldInput`** which switches on `question.kind`. Three of the bodies are non-trivial enough to be their own sub-renderers (`ScaleField`, `ToggleField`, `LongTextField`); the rest compose a single primitive.

### A. `QuestionField` shell (wrapper — all kinds)
Vertical stack `gap:8` (`flex flex-col gap-2`, or `flex flex-1 flex-col gap-2` when `fullScreen`). Drawn on S05 as the `LabelRow` + helper + control + error column repeated per kind.
- **LabelRow:** `<Label htmlFor="q-{question.id}">` carrying `question.prompt` (Inter 14px / 700 / `$foreground`). If the kind is required (`"required" in question && question.required`) append a `*` span coloured `$primary` (board draws the `*` as `$destructive`; reconcile to `$primary` per live code — see Open questions). `long_text`, `multi_select`, `image` default `required:false`, so they show no `*` unless explicitly required.
- **Helper line (optional):** when `question.helper` is set, a muted `<p class="text-xs">` (Inter 12px / `$muted-foreground`). Examples on S05: "Drag to set how confident you feel.", "Select all that apply.", "1 = easy, 5 = expert."
- **Control slot:** delegates to `FieldInput` (id `q-{id}`, question, value, onChange, fullScreen).
- **Error line:** when the `error` prop is set, `<p class="text-xs text-destructive" role="alert">{error}</p>` (S05 draws it as "This question is required" / "Use yyyy-mm-dd" under the `date` field, with the control border switched to `$destructive`).

### B. Kind sub-renderers (one per `FieldInput` switch arm)

#### B1. `slider` — Radix `Slider` (horizontal)
Track (`h:6 r:3 fill:$muted`) + filled range (`$primary`) + circular knob (`$primary-foreground` fill, `$primary` stroke). Below the track a 3-up row: `minLabel ?? min` (left), the **live current value** centred (bold `$foreground`, `aria-live="polite"`), `maxLabel ?? max` (right). Default position when untouched = `min` (the honest "no preference"); value only commits on interaction. Integer in `[min,max]` by `step`. S05 example: "Confidence level" 0…**42**…100.

#### B2. `single_select` — shadcn `Select` (dropdown)
Trigger row (`h:46 pad:[0,14] r:$radius fill:$muted stroke:$border`) with placeholder **"Choose one…"** and a `chevron-down` lucide icon. Opens a `SelectContent` of `SelectItem`s mapped from `question.options`. Single value; closes on pick.

#### B3. `multi_select` — `Checkbox` list
Vertical list (`gap:12`) of rows; each row = a 22×22 `Checkbox` (checked = `$primary` box + `check` icon in `$primary-foreground`; unchecked = `$muted` fill + `$border`) + a `<Label>` (Inter 14px / normal). Tapping toggles `o.value` in a `Set`; emits `string[]`. Any count incl. zero. S05 example: "Supplies you can bring" → Tent ✓, Cooler ☐, Firewood ✓, First-aid kit ☐.

#### B4. `short_text` — `Input` (the S24 `InputField` instance)
Single-line text `Input` with native `maxLength={question.maxLength}` cap. S05 instances it via `⟶ <InputField>` with override "Trailblazer Sam"; placeholder example "Display name *".

#### B5. `long_text` — `LongTextField` (Textarea + on-demand dictation)
Textarea (`h:96` default, `rows={6}`; grows to `min-h-[40dvh] flex-1 resize-none` when `fullScreen`), placeholder e.g. "Tell us a little about yourself…", with native `maxLength`. Beneath it a **dictation toggle**: an outline button (`mic` lucide + "Dictate instead", `r:$radius`, transparent fill, `$border` stroke). Tapping it swaps the button for the **`RecorderPanel`** (S21 / unit 21). Each completed transcript **appends** to existing text (joined with `\n` only when the existing text doesn't already end in whitespace, then sliced to `maxLength`); typing and dictation can be mixed. Dismiss the panel returns to the button. `promptKey="questionnaire"`. This is the **only** voice entry on this surface (locked decision 5: field-level dictation only).

#### B6. `date` — native date `Input`
`<Input type="date">` (`h:46 pad:[0,14] r:$radius fill:$muted stroke:$border`) with a `calendar` lucide icon and placeholder "yyyy-mm-dd"; emits ISO `yyyy-mm-dd`. S05 draws this kind in its **error** state (border `$destructive`, "This question is required" beneath).

#### B7. `scale` — `ScaleField` (discrete labelled steps)
**Underlying kind is `scale` (a discrete-step value), NOT a free slider.** The board (S05) draws it as a **horizontal segmented row** of equal-width cells (`Seg 1…Seg 5`, `h:44 r:$radius stroke:$border`), with the selected segment filled `$primary` and its label `$primary-foreground` (S05 shows "3" selected). The live code renders the same kind as a **Radix `Slider` over the step indices**, dual-layout:
- **Mobile** (`md:hidden`, `h-[70dvh]`): 3-col grid `[1fr_auto_1fr]` — empty left gutter (reserved for a future secondary label set), centred **vertical** slider, right `<ol>` of step labels top→bottom (`aria-hidden`). Slider axis is index-inverted so the top label = highest value.
- **Desktop** (`md:` up): horizontal slider with step labels above each tick (`repeat(N,minmax(0,1fr))` grid, rendered reversed).

Value = the chosen step's `value`. Untouched → middle step `Math.floor(steps.length/2)` highlighted but **not committed**. **Reconciliation (locked decision):** boards win on drawn affordance — implement the **segmented-button presentation** (each step a tappable cell, selected = `$primary`) as the canonical render, but the data contract stays `scale` (string step value, `validateOne` "scale" path). Keep the full-viewport mobile layout for single-question scale pages. See Divergences.

#### B8. `toggle` — `ToggleField` (segmented radiogroup) vs board switch list
**Underlying kind is `toggle` (single-select over a small option set, 2–4), NOT a boolean.** Live code renders a **segmented radiogroup**: container `role="radiogroup"` (`w-full rounded-md border p-1`), one `<button role="radio" aria-checked>` per option (`flex-1`); selected = `$primary` bg + `$primary-foreground`, others = muted. The board (S05) instead draws a **`ToggleList`** of label-rows each with an iOS-style **Switch** (`w:48 h:28 r:14`; on = `$primary` fill, knob right; off = `$muted` + `$border`, knob left) — "Email updates" on, "SMS alerts" off. **Reconciliation (locked decision):** boards win on drawn affordance for the *single-question toggle/yes-no* case → render a Switch where the option set is exactly 2 and semantically on/off; but for a 2–4 single-select set the segmented radiogroup remains correct. In BOTH cases the persisted value is a **string option `value`** (one of `question.options`), never a boolean — the `boolean` member of the response union stays vestigial. Treat the Switch as a presentational variant of the toggle kind, not a new kind. See Open questions for the per-question switch-vs-segmented selector.

#### B9. `combobox` — `Combobox` (Popover + cmdk)
Trigger (`h:46 r:$radius fill:$muted stroke:$border`, `chevron-down`, placeholder "Select…"); opens a `Popover` (`fill:$popover stroke:$border`) with a `Search…` `CommandInput` (`search` icon), a filterable `CommandList` of `CommandItem`s (filtered on `o.label`; selected row shows a `Check`), and a `CommandEmpty` "Nothing found." S05 draws the open popover with the empty state. Single string value; closes on select.

#### B10. `image` — `AvatarUpload` dropzone (board) / circular uploader (code)
Board (S05) draws a **rectangular dropzone** (`h:120 r:$radius`, accent-tinted fill `#00dcff26`, `$border`, `camera` icon in `$accent`, "Add photo") with helper "JPG or PNG, up to 10 MB." plus two explicit follow-on states: **Uploading** (`loader-circle` spinner, "Uploading…") and **Thumb** (96×96 thumbnail with a red circular `Remove` X badge). Live code renders the same kind as the **circular `AvatarUpload`** (`h-40 w-40` dashed circle, `Camera` + "Add photo"; uploading = black/40 overlay + `Loader2` spinner + "Uploading…"; populated = cropped square image + red remove X; below: "Upload a photo" / "Change photo" link). Value = the public image URL string returned by the upload endpoint (`null` on remove). **Reconciliation:** keep the `image` kind and the upload→URL→remove behaviour; the dropzone-vs-circle shape is a visual reconciliation (see Divergences) — board's rectangular dropzone + thumbnail + 10 MB helper is the drawn affordance for the generic field renderer; the circular crop is the profile-photo-specific instance.

## Components used (reusable + new)

| Component | Role | Key props / variants |
|---|---|---|
| `QuestionField` | Per-question shell: label, `*`, helper, control slot, error line | `question`, `value`, `onChange`, `error?`, `fullScreen?` |
| `FieldInput` | Internal switch over the 10 kinds (exhaustive, no default arm) | `id`, `question`, `value`, `onChange`, `fullScreen?` |
| `Label` | Prompt + required `*` (`htmlFor="q-{id}"`) | from `packages/ui` |
| `Slider` | Radix slider; horizontal (slider kind, desktop scale) + vertical (mobile scale); multi-thumb capable | `value`, `min`, `max`, `step`, `orientation` |
| `Select` (+ `SelectTrigger/Content/Item/Value`) | `single_select` dropdown | placeholder "Choose one…" |
| `Checkbox` | `multi_select` option toggle | `checked`, `onCheckedChange` |
| `Input` | `short_text` (the S24 `InputField`) and `date` (`type="date"`) | `maxLength`, `type` |
| `Textarea` | `long_text` body | `maxLength`, `rows`, fullScreen grow |
| `Combobox` (+ `Command*`, `Popover*`) | `combobox` searchable single-select | `options`, `value`, `onChange`, `placeholder`, `searchPlaceholder`, `emptyMessage`, `disabled` (renderer never sets) |
| `ToggleField` | `toggle` segmented radiogroup (+ Switch variant per board) | `question`, `value`, `onChange` |
| `ScaleField` | `scale` discrete-step control (segmented per board / dual-layout slider in code) | `question`, `value`, `onChange` |
| `LongTextField` | `long_text` textarea + dictation toggle | `question`, `value`, `onChange`, `fullScreen?` |
| `RecorderPanel` | Field-level dictation panel (S21 / unit 21) reached from `LongTextField` | `onTranscript`, `onDismiss`, `promptKey="questionnaire"` |
| `AvatarUpload` | `image` uploader (circular crop in code; rectangular dropzone per board) | `value: string\|null`, `onChange`, own `uploading`/`error`/`preview` |
| `Button` (outline) | "Dictate instead" toggle | `variant="outline"`, `Mic` icon |
| `DictatePill` (NEW, reconcile) | Pill-shaped voice-entry trigger drawn on OB Step 03/04 (`r:999 fill:$muted stroke:$border`, mic + "Dictate instead"). The board's pill variant of the `long_text` dictation toggle. Reconcile with the live outline "Dictate instead" button — same role, different shape. | mic icon + label; launches `RecorderPanel` |

From S24 primitive kit (composed, not new): Switch, Checkbox, Segmented, `InputField`, `Button-Primary`, `Button-Outline`, `Card`, `EmptyState`, badges/pills, alerts.

## States — every state/variant

**Per-field render states (apply to each kind):**
- **Empty / unfilled:** `slider`→`min`; `single_select`→"Choose one…"; `multi_select`→all unchecked; `short_text`/`long_text`→`""` placeholder; `date`→empty native field; `scale`→middle step highlighted but uncommitted; `toggle`→no segment `aria-checked` (no Switch on); `combobox`→placeholder "Select…"; `image`→dashed/dropzone "Add photo".
- **Populated:** controls reflect `value`; `single_select`/`toggle`/`combobox` resolve option labels; `multi_select` shows checked boxes; `scale` highlights the chosen step; `image` shows the photo + remove X.
- **Validation-error:** `error` prop → destructive line under the field (`role="alert"`); the control border may switch to `$destructive` (S05 `date`). Strings come from `validateOne` / wizard `validatePageLocally` / `validateIdNumber`.
- **Submitting:** the wizard's `isPending` (useTransition) disables Back/Next; individual fields are **not** disabled mid-submit. `image` has its own `uploading` state (spinner overlay, buttons disabled, "Uploading…"). `long_text` dictation has its own `requesting/recording/processing/error` states inside `RecorderPanel`.
- **Success:** not expressed by the renderer — the wizard advances or `onComplete` fires. `image` success = uploaded photo renders.
- **Disabled:** `Combobox` accepts `disabled` but the renderer never passes it; `AvatarUpload` buttons disable while uploading. No general per-field disabled in normal flow.

**`fullScreen` presentation:** a page is `fullScreen` when it is `intro`, OR a single-question `questions` page whose only question is `scale`, `long_text`, or `image`. Flips `scale` to its `70dvh` vertical layout, lets `long_text` grow (`min-h-[40dvh] flex-1`), and centres `image`. (Owned by the wizard; the renderer consumes the `fullScreen` prop.)

**Skip vs Next:** a lone optional question with no current answer makes the wizard footer read "Skip" instead of "Next" (wizard behaviour; affects optional single-question pages — profile photo, ideas).

**Gating states (invite-gated, onboarding-incomplete, pending/rejected-approval, preview-but-locked):** NOT expressed by this renderer. It is **rank-agnostic** and has no locked variant — gating decides whether the wizard mounts at all (the app/page gating spine, locked decision 3). The renderer never renders a `CaptainLock` and never gates data.

## User actions — each action → result

- **slider:** drag thumb / arrow keys → integer in `[min,max]` by `step`; centre label echoes live; untouched reads `min`.
- **single_select:** open dropdown → pick one (closes); placeholder until chosen.
- **multi_select:** tap a checkbox → add/remove that value; re-tap removes; any count incl. zero. (Indeterminate state falls into the remove branch.)
- **short_text:** type up to `maxLength` (native cap).
- **long_text:** type up to `maxLength`; OR tap "Dictate instead" → `RecorderPanel`; each transcript appends; dismiss returns to the button.
- **date:** native picker → `yyyy-mm-dd`.
- **scale:** tap a segment (board) / drag the discrete slider (code) → selects that step's `value`; untouched defaults to middle (uncommitted).
- **toggle:** tap a segment / flip the Switch → selects that option `value` (single selection; persisted as string, not boolean).
- **combobox:** open popover, type to filter, tap a row → select (closes); "Nothing found." when filter is empty.
- **image:** tap the dropzone/circle or the text button → OS file picker (`accept="image/*"`) → crop/resize → upload → URL value; tap red X → remove (`null`). Upload errors render inside `AvatarUpload`, not via the field `error` prop.
- **wizard Next/Skip/Finish** (not this unit) → triggers validation; a returned per-field error surfaces under the field. Editing a field clears its error in the wizard's `setResponse`.

## Data & enums — mapped to schema.ts

- **Storage:** `burner_profiles` table (schema.ts:352-364) — `responses: jsonb<Record<string,unknown>> notNull default({})`, a flat map keyed by `question.id`; plus `version`, `startedAt`, `completedAt?`, `updatedAt`. One row per user; persists across the yearly reset.
- **Response value union** (`packages/types/src/questionnaire.ts:187-202`): `number | string | string[] | boolean | null`. Per kind: `slider`→`number`; `multi_select`→`string[]`; `image`→`string|null`; all others→`string`. The `boolean` member is **vestigial** — no kind emits it (NOT NEW; do not introduce a boolean from the board's Switch — toggle stays a string option value).
- **Question-kind discriminant** (questionnaire.ts:137-149): `slider | single_select | multi_select | short_text | long_text | date | scale | toggle | combobox | image` — exactly 10, `z.discriminatedUnion("kind", …)`.
- **Per-kind config** (questionnaire.ts): slider `min/max/step(=1)/minLabel?/maxLabel?/required(=true)`; single_select/multi_select/toggle/combobox `options.min(2)` (combobox adds `placeholder?/searchPlaceholder?`); short_text `maxLength(=120)`; long_text `maxLength(=1000) required(=false)`; date (no extra config, required=true); scale `steps.min(2)` (ordered top→bottom); image (no config, required=false). Defaults: `multi_select`/`long_text`/`image` `required:false`, all others `required:true`.
- **Response keys = catalogue question ids** (dotted/namespaced so they never collide with reserved `_form`/`_root` error keys): `profile.image`, `birthday`, `phone`, `country`, `id.type`, `id.number`, `bio.statement`, `ideas.this_year`, `team_interest.<team>` (×8), `competency.cooking`, `competency.hardware`, `team_lead.interests`, `logistics.driving`, `logistics.onsite_before`, `logistics.onsite_after`, `history.camp404_years`, `history.afrikaburn_count`, `history.other_burns`, `intent.this_year`, `dietary.dislikes`, `dietary.allergies`, `dietary.notes`.
- **PII split-out** (NOT done in the renderer): `id.number` is stripped from `responses` at the server write boundary and stored encrypted on `users.passport_encrypted` / `users.sa_id_encrypted` (schema.ts:241-242), keyed by `id.type`. `id.type` stays in `responses`; `birthday` deliberately stays in `responses` (not encrypted-PII class).
- **Change log** (`QuestionnaireFieldChange`, questionnaire.ts:211-219): `{ fieldId, label (prompt at edit), from, to }` — human-readable display values via `displayResponseValue`; produced by `diffResponses`, persisted by the replay flow (unit 12).
- **Pure helpers** (questionnaire.ts): `flattenQuestions`, `displayResponseValue` (`EMPTY_DISPLAY = "—"`), `diffResponses`, `sameValue` (arrays as sorted sets), `isEmptyValue`, `validateResponses`, `validateOne`.
- **NEW for the redesign:** nothing in this surface. (The only schema change in the whole redesign is `captain_promotion_requests` + `promotion_request_status`, locked decision 4 — unrelated to this renderer. The `DictatePill` is a NEW presentational component, not a data change.)

## Validation & edge cases

**`validateOne` per kind** (questionnaire.ts:354-436): missing = `undefined|null|""`; missing+required → "This question is required"; missing+optional → dropped from `responses`.
- slider: must be number & not NaN ("Expected a number"); `>=min && <=max` ("Must be between {min} and {max}").
- single_select / toggle / combobox: string ("Expected a choice"); known option ("Not a valid option").
- multi_select: `string[]` ("Expected a list of choices"); filters to allowed (drops unknowns silently); required & empty → "Pick at least one option".
- short_text / long_text: string ("Expected text"); `length>maxLength` → "Max {maxLength} characters".
- date: string ("Expected a date"); strict `/^\d{4}-\d{2}-\d{2}$/` ("Use yyyy-mm-dd"); `Date.parse` must succeed ("Not a real date").
- scale: string ("Pick a level"); known step ("Not a valid level").
- image: must be string ("Expected an image URL") — **no URL/format validation; any string accepted.**

**`validateResponses`** (questionnaire.ts:324-352): `safeParse` first ("Malformed response payload" → `_root`); iterates pages (skips intro); collects per-question errors keyed by `q.id`; only writes a response when value ≠ undefined; **unknown response keys are dropped**.

**Wizard local pre-check** (`validatePageLocally`): required-and-missing → "This question is required"; **cross-field rule** for `id.number` runs `validateIdNumber(responses["id.type"], value)` (SA-ID Luhn / passport regex). This is the only cross-field validation.

**Known source edge cases (carry as build flags, do not silently fix):**
- **date overflow bug:** `Date.parse` is lenient on day overflow, so an impossible date like `2026-02-31` passes `validateOne` (regex only checks shape). Flag.
- **id.number server gap:** `validateIdNumber` (Luhn/passport) is **client/wizard-only**; server validates `id.number` only as `short_text` (string ≤ 40 chars), so a malformed but short document number persists. Flag.
- **slider untouched** reads `min` but commits only on interaction (`onChange(v[0] ?? current)` guards empty thumb array).
- **scale untouched** highlights middle step, commits only on move; mobile axis inverted (top label = highest).
- **multi_select** non-`true` checkbox state → remove branch.
- **long_text appendTranscript** trims, no-ops if empty, joins with `\n` only when text doesn't already end in whitespace, slices to `maxLength`.
- **image remove** → `onChange(null)`; upload errors stay inside `AvatarUpload`.
- **date** native picker → browser-locale display, always stored/validated as `yyyy-mm-dd`.

## Flows — entry → key transitions → exits

1. **Entry:** wizard (or replay) mounts a page, passes each `Question` + its current `responses[id]` value + `fullScreen` to a `QuestionField`.
2. **Render:** shell paints label/`*`/helper; `FieldInput` switches on `kind` → the matching sub-renderer paints the control in its empty or populated state.
3. **Edit:** user interacts → `onChange(value)` bubbles to the wizard's `setResponse`, which writes `responses[id]` and **clears any existing error** for that field.
4. **Validate:** on Next/Skip/Finish the wizard runs `validatePageLocally` (and the `id.number` cross-field rule); per-field errors flow back into the renderer via the `error` prop → destructive line.
5. **Submit:** valid page → wizard advances (`isPending` disables nav, fields stay live) → server `validateResponses` runs at the write boundary, splits PII, persists to `burner_profiles.responses`.
6. **Exit:** last page → `onComplete` (onboarding) or change-log diff persisted (replay). The renderer itself has no terminal state.

## Divergences from feature-set reference — and resolution

1. **scale: segmented row (S05) vs Radix slider (code/contract).** Resolution (locked decision — "boards win on drawn affordance; the underlying kind must survive"): render the **segmented-step affordance** (tappable equal-width cells, selected = `$primary`) as canonical; keep the `scale` data kind, its string step value, `validateOne` "scale" path, and the full-viewport vertical layout for single-question scale pages. Do NOT turn it into a `slider`/number.
2. **toggle: Switch list (S05) vs segmented radiogroup (code).** Resolution: boards win on affordance for on/off (2-option) toggles → render an iOS Switch; keep the segmented radiogroup for 2–4 single-select sets. **In both cases the persisted value is a string option `value`, never a boolean.** Toggle stays a single-select kind; the `boolean` union member stays vestigial.
3. **long_text dictation: persistent pill/`DictatePill` (S05 `DictateWrap` + OB Step 03/04 pill) vs toggle-to-`RecorderPanel` (contract `dictating` boolean).** Resolution: keep the **toggle** behaviour (button/pill → swaps to `RecorderPanel` → swaps back), per locked decision 5 (field-level dictation only). Reconcile the drawn pill (`r:999`) and the live outline button into one `DictatePill` affordance. The board's chevron-left back nav on S21 should be reconciled with the contract's ghost X dismiss (out of scope here — flag to unit 21).
4. **image: rectangular accent dropzone + 96px thumbnail + 10 MB helper (S05) vs circular `h-40 w-40` crop uploader (code).** Resolution: keep the `image` kind and upload→URL→remove behaviour; treat the rectangular dropzone (with explicit Uploading + Thumb-with-remove states and the "JPG or PNG, up to 10 MB." helper) as the generic field-renderer affordance, and the circular crop as the profile-photo instance. Surface the 10 MB / JPG-PNG constraint in helper copy (currently no client size/type validation — flag).
5. **required `*` colour: `$destructive` (S05) vs `$primary` (code).** Resolution: follow live code (`$primary`) unless the type/token reconciliation (locked decision: tokens) decides otherwise — flag as a one-line token choice.
6. **S24 `Segmented` "Day/Week/Month".** Not a question kind — it is a primitive-kit showcase of the segmented control (same primitive used for `toggle`/`scale`). No field-renderer kind maps to it; do not introduce a new kind.

## Open questions / build reconciliations

- **toggle Switch-vs-segmented selector:** what drives the choice between a Switch and a segmented radiogroup for a `toggle` question — option count (==2 → Switch, 3–4 → segmented), or a per-question presentational flag? No current schema field expresses this. Recommend deriving from `options.length` to avoid a schema change; confirm.
- **scale segmented presentation** needs to keep the discrete-step value and the mobile full-viewport layout; confirm the segmented row is acceptable on the `70dvh` single-question scale pages, or whether full-screen scale keeps the vertical slider while inline scale uses segments.
- **image affordance unification:** ship the board's rectangular dropzone (+ 10 MB/JPG-PNG helper, Uploading state, Thumb-with-remove) for generic `image` fields, reusing `AvatarUpload`'s upload pipeline, while `profile.image` keeps the circular crop? Confirm whether to add client-side size/type validation (10 MB cap) the boards imply but code lacks.
- **required-marker colour** ($primary vs $destructive) — resolve in the token spec.
- **DictatePill** extraction: codify the pill as the shared dictation trigger across `long_text` fields (S05, OB Step 03/04) and the bug dialog; wire to `RecorderPanel` (S21). Confirm one shape (pill) replaces the live outline button.
- **date overflow** and **server-side id.number** validation gaps are documented source bugs — confirm whether to patch in this redesign or carry forward (per MEMORY: source findings are documented, not silently patched).
- **OB hardware competency** (catalogue `competency.hardware` `scale`) has no OB board step — content question flagged in decisions; confirm whether the hardware scale survives onboarding.
- **team_interest** drawn 0–6 on OB Step 06 vs catalogue slider 0–5 — reconcile one constant (affects the `slider` kind's `max`).
