# 20 — Questionnaire field renderer — all question kinds

**Files covered:**
- `apps/web/components/questionnaire/question.tsx` — the field renderer: `QuestionField` (label/helper/error wrapper) + `FieldInput` (per-kind `switch`) + three local sub-renderers `ToggleField`, `ScaleField`, `LongTextField`.
- `packages/types/src/questionnaire.ts` — the Zod schema + TypeScript types for every question kind (the discriminated union), the response value/map types, and the pure helpers `flattenQuestions`, `displayResponseValue`, `diffResponses`, `validateResponses`, `validateOne`.
- `apps/web/lib/questionnaire.ts` — the concrete burner-profile catalogue (`QUESTIONNAIRE`, `version: "2026.05.29-v8"`): the real instances of every kind, with literal options/steps/ranges. Defines `COUNTRY_OPTIONS`, `TEAMS`, `DIETARY_INGREDIENTS`.
- `apps/web/lib/id-validation.ts` — cross-field validator for the `id.number` `short_text` field (SA-ID Luhn / passport regex), invoked by the wizard, not by the renderer itself.
- `packages/ui/src/components/combobox.tsx` — the `Combobox` primitive used by the `combobox` kind (Popover + cmdk filterable list).
- `packages/ui/src/components/slider.tsx` — the Radix `Slider` primitive used by `slider` and `scale` kinds (horizontal + vertical orientation).
- `apps/web/components/profile/avatar-upload.tsx` — the `AvatarUpload` control used by the `image` kind (circular uploader → `/api/uploads/avatar`).
- `apps/web/components/voice/recorder-panel.tsx` — the dictation panel embedded in `long_text` (full voice pipeline is unit 21; covered here only as the host-field touchpoint).
- `apps/web/components/questionnaire/wizard.tsx` — the consumer; decides `fullScreen`, runs local per-page validation, drives `onChange`/`error` props (full wizard is unit 04; covered here only where it shapes renderer behaviour).

**Purpose:** Render any one questionnaire `Question` as the correct input control given its `kind`, surface its prompt/helper/required marker/error, emit a typed `QuestionnaireResponseValue` on change, and define the per-kind data shape, options, ranges, and validation. This is the polymorphic field unit shared by the onboarding wizard (04) and the form-replay flow (12). Exactly **10 question kinds** exist: `slider`, `single_select`, `multi_select`, `short_text`, `long_text`, `date`, `scale`, `toggle`, `combobox`, `image`.

## Features

### `QuestionField` wrapper (question.tsx:43-85)
- Computes a stable field id `fieldId = \`q-${question.id}\`` (question.tsx:50).
- Renders a `<Label htmlFor={fieldId}>` containing `question.prompt` (question.tsx:60-61).
- Required marker: when `"required" in question && question.required`, appends a primary-coloured ` *` span (`ml-1 text-[color:var(--color-primary)]`) (question.tsx:62-64). Note `long_text`, `multi_select`, `image` default to `required: false`, so they only show `*` if explicitly required.
- Optional helper line: if `question.helper` is set, renders a muted `<p class="text-xs">` (question.tsx:66-70).
- Delegates the actual control to `FieldInput` (question.tsx:71-77), passing `id`, `question`, `value`, `onChange`, `fullScreen`.
- Error line: if `error` prop is set, renders `<p class="text-xs text-destructive" role="alert">{error}</p>` (question.tsx:78-82).
- `fullScreen` prop: a page-level hint that this question owns the viewport (single `scale`, single `long_text`, single `image`). When true the wrapper uses `flex flex-1 flex-col gap-2` instead of `flex flex-col gap-2` (question.tsx:53-58, 35-41).

### `FieldInput` per-kind switch (question.tsx:87-242)
A `switch (question.kind)` with one arm per kind. All arms read `value` defensively (type-guard against the union) and call `onChange` with the kind-appropriate value:

- **`slider`** (question.tsx:101-127): `current = typeof value === "number" ? value : question.min` — defaults to `min` when untouched ("most honest 'no preference' position"). Renders `<Slider>` with `value={[current]}`, `min/max/step` from the question; `onValueChange={(v) => onChange(v[0] ?? current)}`. Below it a 3-up row shows `minLabel ?? min`, the live `current` value (`aria-live="polite"`, bold foreground), and `maxLabel ?? max`.
- **`single_select`** (question.tsx:128-145): shadcn `Select`. `value={typeof value === "string" ? value : undefined}`, `onValueChange={onChange}`. Trigger placeholder `"Choose one…"`. Maps `question.options` → `<SelectItem value={o.value}>{o.label}</SelectItem>`.
- **`multi_select`** (question.tsx:146-174): builds `selected = new Set(value as string[])` when `value` is an array, else empty set. Renders one `Checkbox` + `Label` per option (`checkboxId = \`${id}-${o.value}\``). On check toggle it copies the set, adds/deletes `o.value`, and `onChange(Array.from(next))`. Add only on `checked === true`; otherwise delete (the `"indeterminate"` checkbox state falls into the delete branch).
- **`short_text`** (question.tsx:175-183): `<Input maxLength={question.maxLength} value={typeof value==="string"?value:""} onChange=… />`.
- **`long_text`** (question.tsx:184-193): delegates to `LongTextField` (textarea + dictation; see Sub-components).
- **`date`** (question.tsx:194-202): `<Input type="date" value={…} onChange=… />` — native date picker; emits ISO `yyyy-mm-dd`.
- **`scale`** (question.tsx:203-211): delegates to `ScaleField`. `value={typeof value === "string" ? value : undefined}`.
- **`toggle`** (question.tsx:212-220): delegates to `ToggleField` (segmented control).
- **`combobox`** (question.tsx:221-231): `<Combobox options={question.options} value=… onChange={onChange} placeholder={question.placeholder ?? "Select…"} searchPlaceholder={question.searchPlaceholder ?? "Search…"} />`.
- **`image`** (question.tsx:232-240): centred container `flex flex-1 flex-col items-center justify-center py-4` wrapping `AvatarUpload`. `value={typeof value === "string" ? value : null}`, `onChange={(url) => onChange(url)}` (url can be `null` on remove).

The `switch` has no `default` arm — exhaustive over the 10 kinds (TS discriminated union guarantees coverage). If an unknown kind ever appeared, `FieldInput` returns `undefined` (renders nothing).

### Pure response helpers (packages/types/src/questionnaire.ts)
- **`flattenQuestions(questionnaire)`** (packages/types/src/questionnaire.ts:224-230): concatenates all `questions` from `kind:"questions"` pages, skipping `intro` pages. Used for diffing / resolving a field id → question.
- **`displayResponseValue(question, value)`** (packages/types/src/questionnaire.ts:239-266): renders a stored value as the human-readable string. `undefined | null | ""` → `EMPTY_DISPLAY = "—"`. For `single_select | toggle | combobox` resolves the option `label` (falls back to `String(value)` for unknown). For `scale` resolves the step `label`. For `multi_select`: empty/non-array → `"—"`, else maps each value to its option label (fallback raw) and joins with `", "`. Default arm: arrays join with `", "`, else `String(value)`.
- **`diffResponses(questionnaire, before, after)`** (packages/types/src/questionnaire.ts:298-316): per question (in catalogue order) compares via `sameValue`; emits `QuestionnaireFieldChange { fieldId, label: q.prompt, from: display(before), to: display(after) }`. Stale keys not in the catalogue are ignored.
- **`sameValue`** (packages/types/src/questionnaire.ts:277-289): empty↔empty equal (via `isEmptyValue`); arrays compared as **sorted sets** (re-ordering is not a change); else strict `===`.
- **`isEmptyValue`** (packages/types/src/questionnaire.ts:268-275): `undefined | null | "" | []` are all empty.

### Server/wizard-side validation
- **`validateResponses`** (packages/types/src/questionnaire.ts:324-352) and **`validateOne`** (packages/types/src/questionnaire.ts:354-436): the authoritative per-kind validators (see Validation section). The wizard runs a lighter local pre-check (`validatePageLocally`, wizard.tsx:79-101) before advancing.

## User actions & interactions

- **slider**: drag thumb or keyboard-arrow to set an integer in `[min,max]` by `step`; live value echoed in centre label. Untouched → reads as `min`.
- **single_select**: open dropdown, pick one option (closes on select). Placeholder `"Choose one…"` until chosen.
- **multi_select**: tap each checkbox independently to add/remove; any number including zero. Re-tapping removes.
- **short_text**: type free text up to `maxLength` (native `maxLength` cap on the input).
- **long_text**: type in the textarea (up to `maxLength`), OR tap **"Dictate instead"** (Mic icon) to reveal the `RecorderPanel`; each completed transcript **appends** to existing text (joined with `\n` if needed), capped to `maxLength`; can mix typing + dictation; close dictation via its X (disabled while recording/busy).
- **date**: use the native date picker to select a calendar date → `yyyy-mm-dd`.
- **scale**: drag the vertical slider (mobile) or horizontal slider (desktop) across discrete labelled steps; the value is the selected step's `value`. Default position when untouched is the middle step (`Math.floor(steps.length/2)`).
- **toggle**: tap one segment of the segmented control (`role="radio"` within `role="radiogroup"`). Single selection; tapping another switches.
- **combobox**: open popover, type to filter (cmdk fuzzy filter on the option `label`), tap a row to select (closes); `Check` icon marks the current selection; `"Nothing found."` when filter matches nothing.
- **image**: tap the circular dropzone or the text button to open the OS file picker (`accept="image/*"`); the image is cropped/resized to a square in-browser and uploaded; tap the red X to remove (sets value `null`).
- The wizard's "Next"/"Skip"/"Finish" buttons (not in this unit) trigger validation; on a returned per-field error, the renderer surfaces it under the field (`error` prop). Editing a field clears its error in the wizard's `setResponse` (wizard.tsx:69-77).

## States & presentations

Renderer-local and inherited global-states that apply to this surface:

- **Empty**: every kind renders an unfilled control. `slider`→`min`; `single_select`→`"Choose one…"`; `multi_select`→all unchecked; text→`""`; `date`→empty native field; `scale`→middle step highlighted (not committed); `toggle`→no segment `aria-checked`; `combobox`→placeholder; `image`→dashed-border "Add photo" dropzone.
- **Populated**: controls reflect `value`; `single_select/toggle/combobox` show resolved labels; `multi_select` shows checked boxes; `image` shows the photo with a remove X.
- **Validation-error**: `error` prop renders `text-xs text-destructive role="alert"` under the field (question.tsx:78-82). Per-kind error strings come from `validateOne`/`validatePageLocally`/`validateIdNumber` (see Validation). Page-level `_form`/`_root` errors render in the wizard banner, not here.
- **Submitting / pending**: the wizard's `isPending` (React `useTransition`) disables Back/Next; the renderer fields themselves are NOT disabled mid-submit. `image` has its own `uploading` state (spinner overlay, button disabled, text `"Uploading…"`) (avatar-upload.tsx:100-104, 129). `long_text` dictation has `requesting`/`recording`/`processing`/`error` states (recorder-panel.tsx:59-68).
- **Success**: not expressed in the renderer; the wizard advances or `onComplete` fires. `image` success = the uploaded photo renders in the circle.
- **Disabled**: the `Combobox` primitive accepts `disabled` but the renderer never passes it. `AvatarUpload` buttons disable while `uploading`. The renderer does not otherwise expose a per-field disabled state.
- **fullScreen presentation** (wizard.tsx:149-155): a page is `fullScreen` when `kind==="intro"`, OR a single-question `questions` page whose only question is `scale`, `long_text`, or `image`. This flips `scale` to its `70dvh` vertical layout, lets `long_text` grow (`min-h-[40dvh] flex-1`, no fixed rows), and centres `image` (already centred regardless).
- **Skip vs Next** (wizard.tsx:160-172): a lone optional question with no current answer shows the button label `"Skip"` instead of `"Next"`. This is wizard behaviour, not renderer, but governs how optional single-question pages (profile photo, ideas, bio is required so not skippable) read.
- **Gating states** (invite-gated, onboarding-incomplete, pending-approval, rejected, captain-only-locked): NOT expressed by this renderer — they gate whether the wizard mounts at all (app/page.tsx gating spine). The renderer is rank-agnostic and has no locked variant.

## Enums, options & configurable values

### Question-kind discriminant (packages/types/src/questionnaire.ts:137-149)
`"slider" | "single_select" | "multi_select" | "short_text" | "long_text" | "date" | "scale" | "toggle" | "combobox" | "image"` — exactly 10, via `z.discriminatedUnion("kind", […])`.

### Per-kind schema fields & defaults (packages/types/src/questionnaire.ts)
Every kind has `id: string.min(1)`, `kind` literal, `prompt: string.min(1)`, `helper?: string`.
- **SliderQuestion** (7-19): `min: number`, `max: number`, `step: number.positive().default(1)`, `minLabel?`, `maxLabel?`, `required: boolean.default(true)`.
- **SingleSelectQuestion** (21-31): `options: array({value:string.min(1), label:string.min(1)}).min(2)`, `required.default(true)`.
- **MultiSelectQuestion** (33-43): same `options.min(2)`, `required.default(false)`.
- **ShortTextQuestion** (45-53): `maxLength: number.int().positive().default(120)`, `required.default(true)`.
- **LongTextQuestion** (55-63): `maxLength: number.int().positive().default(1000)`, `required.default(false)`.
- **DateQuestion** (66-73): no extra config; `required.default(true)`. ISO `yyyy-mm-dd`, backed by `<input type="date">`.
- **ScaleQuestion** (78-90): `steps: array({value, label}).min(2)` (ordered top→bottom for mobile), `required.default(true)`.
- **ToggleQuestion** (96-106): `options.min(2)`, `required.default(true)`. Same data shape as single_select; segmented-control render. Comment: intended for small sets (2–4).
- **ComboboxQuestion** (111-123): `options.min(2)`, `placeholder?`, `searchPlaceholder?`, `required.default(true)`.
- **ImageQuestion** (128-135): no extra config; `required.default(false)`. Stored value = public image URL (Vercel Blob in prod).

### Page kinds (packages/types/src/questionnaire.ts:153-177)
- `QuestionsPage` (153-160): `id`, `kind:"questions"`, `title`, `subtitle?`, `questions: array(Question).min(1)`.
- `IntroPage` (165-171): `id`, `kind:"intro"`, `heading`, `body`. No questions, no validation. (Rendered by the wizard, not this unit.)
- `Questionnaire` (179-183): `version: string.min(1)`, `pages: array(QuestionnairePage).min(1)`.

### Response value union (packages/types/src/questionnaire.ts:187-202)
`QuestionnaireResponseValue = number | string | string[] | boolean | null`. `QuestionnaireResponses = Record<string, QuestionnaireResponseValue>`. NOTE: `boolean` is in the union but **no current kind emits a boolean** — slider→`number`, multi_select→`string[]`, image→`string|null`, all others→`string`. (Likely vestigial / future-proofing.)

### Catalogue literal values (apps/web/lib/questionnaire.ts) — the real instances
- **`version: "2026.05.29-v8"`** (apps/web/lib/questionnaire.ts:60).
- **TEAMS** (8 values, 30-39): `kitchen`/Kitchen, `structures`/Structures, `power_and_lighting`/"Power & Lighting", `sanitation_and_water`/"Sanitation & Water", `health_and_safety`/"Health & Safety", `art_and_activities`/"Art & Activities", `ministry_of_memes`/"Ministry of Memes", `ministry_of_vibes`/"Ministry of Vibes". Reused for the 8 team-interest sliders (id `team_interest.<value>`) and the `team_lead.interests` multi_select.
- **DIETARY_INGREDIENTS** (12 values, 44-57): `dairy`/"Dairy / lactose", `gluten`/"Gluten / wheat", `eggs`/Eggs, `soy`/Soy, `peanuts`/Peanuts, `tree_nuts`/"Tree nuts", `shellfish`/Shellfish, `fish`/Fish, `sesame`/Sesame, `alliums`/"Onion / garlic", `nightshades`/"Nightshades (tomato, pepper, aubergine)", `spicy`/"Chilli / heat". Reused for `dietary.dislikes` and `dietary.allergies`.
- **COUNTRY_OPTIONS** (6-9): each ISO 3166-1 alpha-2 country (199 entries in `apps/web/lib/countries.ts`) mapped to `{ value: c.value, label: \`${countryFlag(c.value)} ${c.label}\` }` — flag emoji prefixed; stored value is the alpha-2 code. ZA pinned top.
- **slider ranges** (team interests, 179-189): `min:0, max:5, step:1, minLabel:"Not for me", maxLabel:"Sign me up", required:false`.
- **scale steps — cooking** (201-206): `create`/"Good cook — I can create recipes", `teach`/"Adequate — I can teach recipes", `follow`/"I can follow recipes", `burn`/"I might burn recipes".
- **scale steps — hardware** (222-227): `design`, `build`, `assist`, `novice` (labels per file).
- **scale steps — intent.this_year** (338-345): `definite`/"100% coming", `want`, `try`, `unsure`, `unlikely`, `not_coming` (6 steps).
- **toggle id.type** (113-118): `passport`/Passport, `sa_id`/"South African ID".
- **single_select logistics.driving** (251-255): `yes`/Yes, `no`/No, `maybe`/"Maybe — still working it out".
- **single_select logistics.onsite_before** (262-266): `yes_full`, `yes_partial`, `no`.
- **single_select logistics.onsite_after** (273-277): `yes_full`, `yes_partial`, `no`.
- **multi_select history.camp404_years** (294-301): `2019,2022,2023,2024,2025,2026`.
- **single_select history.afrikaburn_count** (308-313): `0`/"None — first one", `1_2`/"1–2", `3_5`/"3–5", `6_plus`/"6 or more".
- **short_text maxLengths**: `phone`=40 (97), `id.number`=40 (126).
- **long_text maxLengths**: `bio.statement`=2000 (145), `ideas.this_year`=2000 (163), `history.other_burns`=1000 (323), `dietary.notes`=1000 (381).
- **image required:false** (`profile.image`, 70-75).
- **`EMPTY_DISPLAY = "—"`** (packages/types/src/questionnaire.ts:232).

### Recorder / dictation constants (voice; adjacency)
- `RecorderPanel promptKey="questionnaire"` passed from `LongTextField` (question.tsx:460).
- Recorder states `idle | requesting | recording | processing | error` (use-voice-recorder.ts:5-10); `maxDurationMs` default `120_000`; status labels "Allow microphone…", "Transcribing…", "Recording", "Tap to retry", "Tap to record"; mm:ss timer; posts to `/api/voice/transcribe`.

### Slider primitive defaults (slider.tsx:8-15)
`min=0`, `max=100` defaults; vertical orientation `min-h-44`; thumb `size-4`.

## Data model touched

- **`burner_profiles` table** (schema.ts:352-364): `userId` (PK, FK→users, cascade), `version: text notNull`, **`responses: jsonb<Record<string,unknown>> notNull default({})`** — the flat map keyed by `question.id`; `startedAt`, `completedAt?`, `updatedAt`. One row per user; persists across the yearly reset. The catalogue lives in code and is versioned so historical responses stay renderable (`burner_profiles.version`).
- **Response keys are exactly the catalogue question `id`s**, e.g. `profile.image`, `birthday`, `phone`, `country`, `id.type`, `id.number`, `bio.statement`, `ideas.this_year`, `team_interest.<team>` (×8), `competency.cooking`, `competency.hardware`, `team_lead.interests`, `logistics.driving`, `logistics.onsite_before`, `logistics.onsite_after`, `history.camp404_years`, `history.afrikaburn_count`, `history.other_burns`, `intent.this_year`, `dietary.dislikes`, `dietary.allergies`, `dietary.notes`. (Question ids are always dotted/namespaced so they never collide with the reserved `_form`/`_root` error keys — wizard.tsx:16-20.)
- **PII split-out** (apps/web/lib/questionnaire.ts:16-23): `id.number` is removed from `responses` at every write boundary and stored encrypted on `users` as `passport_encrypted` / `sa_id_encrypted` (schema.ts:241-242), keyed off `id.type`. `id.type` is NOT sensitive and stays in `responses`. `birthday` deliberately stays in `responses` (not in the encrypted-PII class). This is enforced at the write boundary (server action), not in the renderer.
- **`image` value** is the public URL string returned by `/api/uploads/avatar` (avatar-upload.tsx:60-61); stored as a plain string in `responses`.
- **Change log** (`QuestionnaireFieldChange`, packages/types/src/questionnaire.ts:211-219): `{ fieldId, label (prompt at edit time), from, to }` — `from`/`to` are human-readable display values. Persisted by the replay flow (form-edit log table, unit 12); produced by `diffResponses`.

## Validation, edge cases & business rules

### `validateOne` per kind (packages/types/src/questionnaire.ts:354-436)
Missing = `raw === undefined || null || ""` (354-360). If missing & `required` → `"This question is required"`; if missing & optional → `{ ok:true, value: undefined }` (dropped from `responses`).
- **slider**: must be a `number` & not NaN (`"Expected a number"`); must be `>= min && <= max` else `"Must be between ${min} and ${max}"`.
- **single_select**: must be `string` (`"Expected a choice"`); must be a known option value else `"Not a valid option"`.
- **multi_select**: must be `string[]` (`"Expected a list of choices"`); filters to allowed values (drops unknowns silently); if `required && filtered.length===0` → `"Pick at least one option"`. Returns the filtered array.
- **short_text / long_text**: must be `string` (`"Expected text"`); `length > maxLength` → `"Max ${maxLength} characters"`.
- **date**: must be `string` (`"Expected a date"`); strict regex `/^\d{4}-\d{2}-\d{2}$/` else `"Use yyyy-mm-dd"`; `Date.parse` must succeed else `"Not a real date"`. (NOTE: `Date.parse` is lenient on day-of-month overflow, e.g. `2026-02-31` parses; the regex only enforces shape.)
- **scale**: must be `string` (`"Pick a level"`); must be a known step value else `"Not a valid level"`.
- **toggle**: same as single_select (`"Expected a choice"` / `"Not a valid option"`).
- **combobox**: same as single_select (`"Expected a choice"` / `"Not a valid option"`).
- **image**: must be a `string` (`"Expected an image URL"`) — NO URL/format validation; any string is accepted.

### `validateResponses` (packages/types/src/questionnaire.ts:324-352)
- First `QuestionnaireResponses.safeParse(raw)`; on failure → `{ ok:false, errors: { _root: "Malformed response payload" } }`.
- Iterates pages (skips `intro`), validates each question, collects per-question errors keyed by `q.id`; only sets `responses[q.id]` when value is not `undefined`. Returns all errors if any. **Unknown response keys are dropped** (a question may have been removed in a later catalogue version).

### Wizard local pre-validation (`validatePageLocally`, wizard.tsx:79-101)
- Intro pages always pass.
- Per question on the page: required-and-missing → `"This question is required"`.
- **Cross-field rule (id.number)**: if `q.id === "id.number"` and a non-empty string, runs `validateIdNumber(responses["id.type"], value)`; on failure sets the field error. This is the only cross-field validation in the flow.

### `validateIdNumber` (id-validation.ts:25-102)
- Trims; empty → `"Document number is required"`.
- `type === "passport"`: regex `/^[A-Z0-9]{6,12}$/i` (alphanumeric 6–12); fail → `"Letters and digits only — typically 6–12 characters."`.
- `type === "sa_id"`: must match `/^\d{13}$/` (`"Must be exactly 13 digits."`); first 6 digits must be a plausible YYMMDD (month 1–12, day 1–31) else `"First six digits aren't a valid YYMMDD date."`; SA-specific Luhn variant (odd 1-based positions summed directly; even positions concatenated, ×2, digit-summed; check digit `(10 - total%10)%10`) else `"Check digit doesn't match — double-check the number."`.
- Neither type chosen → `"Pick the ID document type first"`.
- NOTE: `validateIdNumber` is NOT called by `validateOne` (server-side `id.number` is just length-checked as a `short_text`, max 40) — the SA-ID/passport rule is **client/wizard-only**.

### Renderer edge cases
- **slider untouched** reads as `min` but is only committed on interaction; `onChange(v[0] ?? current)` guards an empty thumb array.
- **scale untouched**: highlights the middle step `Math.floor(steps.length/2)` but does not commit a value until the slider moves; mobile slider axis is inverted (`sliderValue = steps.length-1-currentIndex`) so top label = highest value.
- **multi_select**: `"indeterminate"` checkbox state (anything other than literal `true`) falls into the delete branch (question.tsx:159-162).
- **long_text appendTranscript** (question.tsx:433-439): trims transcript; no-op if empty; joins with `"\n"` only when existing text doesn't already end in whitespace/newline (`/\n\s*$/`); result sliced to `maxLength`.
- **image**: `onChange(null)` on remove; the renderer coerces `null` value back to `null` for `AvatarUpload`. Upload errors are shown inside `AvatarUpload` (its own `error` state), not via the field `error` prop.
- **date** uses the native picker, so locale formatting is the browser's; the stored/validated form is always `yyyy-mm-dd`.

## Sub-components / variants

- **`ToggleField`** (question.tsx:249-288): segmented control. `role="radiogroup"` container; one `<button role="radio" aria-checked>` per option, equal-width (`flex-1`). Selected = primary bg + primary-foreground; others = muted text. Wraps to multiple rows if a label is long. Used by `toggle` kind.
- **`ScaleField`** (question.tsx:297-403): dual layout. **Mobile** (`md:hidden`, `h-[70dvh]`): 3-col grid `[1fr_auto_1fr]` — empty left gutter (reserved for "future secondary label set"), centred **vertical** `Slider`, right `<ol>` of step labels distributed top→bottom (`aria-hidden`). **Desktop** (`hidden md:block`): horizontal `Slider` with labels above each tick in a `repeat(N,minmax(0,1fr))` grid, rendered `[...steps].reverse()`. Value is the step `value`; slider axis is index-inverted. Used by `scale` kind.
- **`LongTextField`** (question.tsx:418-477): textarea (default `rows={6}`, or `min-h-[40dvh] flex-1 resize-none` when `fullScreen`) + on-demand dictation. Local `dictating` boolean toggles between a `"Dictate instead"` outline button (Mic icon) and the `RecorderPanel`. `appendTranscript` appends each transcript to the textarea (capped to `maxLength`). `promptKey="questionnaire"`. Used by `long_text` kind. (Voice pipeline internals = unit 21.)
- **`Combobox`** (combobox.tsx:41-114): Popover-anchored cmdk filterable single-select. Trigger is an outline `Button role="combobox"` showing selected label or placeholder + `ChevronsUpDown`; content is `CommandInput` + `CommandList` + `CommandEmpty` (`emptyMessage` default `"Nothing found."`) + `CommandGroup` of `CommandItem`s (filtered by `o.label`); selected row shows `Check`. Accepts a `disabled` prop the renderer never sets. Used by `combobox` kind.
- **`AvatarUpload`** (avatar-upload.tsx:24-147): large circular (`h-40 w-40`) dashed dropzone; opens file picker (`accept="image/*"`); crops/resizes to square in-browser (`cropResizeToSquare`); POSTs `multipart/form-data` (`image` field) to `/api/uploads/avatar`; shows local object-URL preview then stored URL; remove X sets `null`; own `uploading`/`error`/`preview` states. Used by `image` kind.
- **`Slider`** (slider.tsx:8-61): Radix slider wrapper supporting horizontal + vertical (`orientation`) and multi-thumb (renders one thumb per value). Used by both `slider` and `scale` kinds.

**No dead/orphaned variants found.** All 10 kinds in the discriminated union are rendered by `FieldInput` and validated by `validateOne`; all are instantiated in the live catalogue. The only vestigial element is the `boolean` member of `QuestionnaireResponseValue` (no kind emits it) and the empty left gutter in `ScaleField`'s mobile grid (explicitly "reserved for a future secondary label set").
