### 5. Questionnaire field kinds (every input type)
**Purpose:** Render any one questionnaire question with the correct input control for its `kind`, surface prompt/helper/required-marker/error, and emit a typed response value.
**Layout & elements:** Mobile single column. Top→bottom: `<Label>` with the question `prompt` plus a primary `" *"` marker when required; optional muted helper line; the per-kind control; an error line `role="alert"` when present. Placeholders: single_select `"Choose one…"`, combobox `"Select…"` / search `"Search…"` / `"Nothing found."`, long_text dictation button `"Dictate instead"`. Slider shows a 3-up row: minLabel (e.g. `"Not for me"`), live value, maxLabel (e.g. `"Sign me up"`). `fullScreen` variant for a lone `scale`/`long_text`/`image`.
**Every action (preserve all):**
- slider: drag/arrow → integer in `[min,max]` by `step`; untouched reads `min`.
- single_select/toggle/combobox: pick one; combobox filters by typing.
- multi_select: tap each checkbox to add/remove (zero+ allowed).
- short_text/long_text: type (capped at `maxLength`); long_text "Dictate instead" appends transcript joined with `\n`.
- date: native picker → `yyyy-mm-dd`.
- image: tap dropzone → file picker (`accept="image/*"`), crop-to-square upload; red X removes (value `null`).
- Editing clears that field's error; Next/Skip/Finish triggers validation.
**States to design:**
- Empty: each control unfilled (slider→min, scale→middle step highlighted-not-committed, image→"Add photo" dropzone).
- Populated: controls reflect value; selects show resolved labels; image shows photo + remove X.
- Validation-error: destructive line under field.
- Submitting/pending: wizard disables nav; image shows `"Uploading…"` spinner; dictation has requesting/recording/processing/error.
- Success: wizard advances / photo renders.
- Disabled: only AvatarUpload while uploading.
- Gating (invite/pending/rejected/locked): NOT in renderer — gate wizard mount; renderer is rank-agnostic.
**Options & exact values:** 10 kinds: `slider, single_select, multi_select, short_text, long_text, date, scale, toggle, combobox, image`. Defaults: slider `step=1` required=true; short_text maxLength `120`; long_text `1000` required=false; multi_select/image required=false. Catalogue `version "2026.05.29-v8"`. team sliders `min:0 max:5 step:1`. TEAMS(8): Kitchen, Structures, "Power & Lighting", "Sanitation & Water", "Health & Safety", "Art & Activities", "Ministry of Memes", "Ministry of Vibes". id.type toggle: Passport / "South African ID". history.afrikaburn_count: "None — first one", "1–2", "3–5", "6 or more". camp404_years: 2019,2022,2023,2024,2025,2026. EMPTY_DISPLAY `"—"`.
**Validation & rules:**
- Missing+required → `"This question is required"`; missing+optional dropped.
- slider `"Must be between {min} and {max}"`; selects `"Not a valid option"`; multi_select required-empty `"Pick at least one option"`; text `"Max {maxLength} characters"`; date regex `^\d{4}-\d{2}-\d{2}$` → `"Use yyyy-mm-dd"` then `"Not a real date"`; scale `"Not a valid level"`; image any string (no URL check).
- Cross-field id.number (client/wizard-only): passport `[A-Z0-9]{6,12}`; sa_id 13 digits + YYMMDD + SA Luhn. Server only length-checks it.
- Unknown response keys dropped; `id.number` split out and stored encrypted, not in `responses`.
**Do-not-drop:** Polymorphic per-`kind` renderer + matching per-kind validation for all 10 kinds, the typed response value union, and the encrypted-PII split-out of `id.number`. Only dead/vestigial bits: the unused `boolean` member of the response union and the reserved empty left gutter in ScaleField's mobile grid — both safe to drop.
