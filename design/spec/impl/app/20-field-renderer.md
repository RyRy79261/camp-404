# 20-field-renderer — app integration plan

- **Route(s):** n/a — **shared field machine**, no route of its own · **MOUNTED/EMBEDDED**.
  - **Lives at:** `apps/web/components/questionnaire/question.tsx` (the `QuestionField` shell + the internal `FieldInput` switch + the app-local sub-renderers `ToggleField`/`ScaleField`/`LongTextField`). It is **app-local** (`apps/web`), deliberately NOT promoted to `@camp404/ui` (it composes browser-coupled siblings `RecorderPanel`/`AvatarUpload` and binds to `@camp404/types` `Question` shapes — see `organism-questionfield.md`).
  - **Mounted only through** the shared host `apps/web/components/questionnaire/wizard.tsx` (`QuestionnaireWizard`), which maps `page.questions` → `<QuestionField …>` (`wizard.tsx:224–233`). No surface page mounts `QuestionField` directly.
  - **Surfaces that consume it** (all via the same `QuestionnaireWizard`):
    - **04 Onboarding wizard** — `/onboarding/questionnaire` (`apps/web/app/onboarding/questionnaire/page.tsx:51–56`, `firstStepSignOut`, `persistProgress=true`).
    - **24 Questionnaire runner (blocking)** — same `/onboarding/questionnaire` engine inside the blocking chrome (future `ACTION_ROUTES`); rank-agnostic.
    - **12 My forms (replay/edit)** — `/tools/forms/[key]` via `FormReplay` (`apps/web/app/tools/forms/[key]/form-replay.tsx:43–53`, `persistProgress=false`, `submitLabel="Save changes"`, `action=saveFormReplay`).

This plan covers the **app-integration** of the field machine: how the renderer is wired into the three host routes, which leaf controls each switch arm composes, what the surrounding server boundary fetches/passes, and the build order. The per-component contracts live in the linked component plans; the canonical 10-kind decomposition is `design/spec/surfaces/20-field-renderer.md`; the organism-level plan is `design/spec/impl/components/organism-questionfield.md` (this app plan does not duplicate it — it sits above it, at the host-wiring layer).

---

## Current state — the existing route/files today

**The field machine exists and works.** Verified by reading source.

### The renderer (the unit this plan is about)
`apps/web/components/questionnaire/question.tsx` (`"use client"`, line 1, 478 lines):
- **`QuestionField` shell** (`:43–85`): `flex flex-col gap-2` (or `flex flex-1 flex-col gap-2` when `fullScreen`); `Label htmlFor="q-{id}"` + required `*` (`:60–65`, coloured `text-[color:var(--color-primary)]`), optional helper `<p>` (`:66–70`), `<FieldInput>` slot (`:71–77`), error `<p role="alert" class="text-xs text-destructive">` (`:78–82`).
- **`FieldInput` switch** (`:87–242`): exhaustive `switch (question.kind)` over all 10 kinds, **no `default` arm**. Current per-arm renders (the redesign targets):
  - `slider` → `@camp404/ui` `Slider` + 3-up min/value/max label row, defaults to `question.min`, commits `onChange(v[0] ?? current)` (`:101–127`). **REUSE.**
  - `single_select` → shadcn `Select` dropdown, placeholder "Choose one…" (`:128–145`). **Diverges from boards** → must become `OptionCardGroup mode="single"`.
  - `multi_select` → inline `Checkbox + Label` rows, `Set`-toggle, emits `string[]` (`:146–174`). **Diverges** → `OptionCardGroup mode="multi"` (+ chip-grid for dietary).
  - `short_text` → `Input` with native `maxLength` (`:175–183`). **REUSE.**
  - `long_text` → `LongTextField` sub-renderer (`:184–193`). **REUSE/EXTEND.**
  - `date` → bare `<Input type="date">` (`:194–202`). **Gap** → wrap in NEW `DateControl`.
  - `scale` → `ScaleField` dual-layout Radix Slider (`:203–211`, `:297–403`). **Diverges** → `SegmentedControl variant="scale"` (keep vertical layout for fullScreen).
  - `toggle` → `ToggleField` segmented radiogroup (`:212–220`, `:249–288`). **PROMOTE** → `SegmentedControl`.
  - `combobox` → `@camp404/ui` `Combobox` (`:221–231`). **REUSE.**
  - `image` → circular `AvatarUpload` (`:232–240`). **REUSE/EXTEND** (dropzone variant for generic image).
- **App-local sub-renderers in the same file:** `ToggleField` (`:249–288`), `ScaleField` (`:297–403`), `LongTextField` (`:418–477`, Textarea + inline outline "Dictate instead" `Button` → `RecorderPanel`, with `appendTranscript` at `:433–439`).

### Host + server boundary (what mounts it today)
- **Host:** `apps/web/components/questionnaire/wizard.tsx` (`QuestionnaireWizard`, `"use client"`): holds `responses`/`errors`/`pageIndex`/`isPending`; renders one `QuestionField` per question (`:224–233`); owns `validatePageLocally` (`:79–101`, incl. the `id.number` cross-field rule via `validateIdNumber` from `@/lib/id-validation`, `wizard.tsx:12`), `setResponse` (writes value + clears that field's error, `:69–77`), `handleNext`/`handleSubmit` (call the page `action`, `:103–147`), `isFullScreen` (`:149–155`), Skip-vs-Next (`:160–172`), `ProgressBar` (`:263–278`).
- **Onboarding server boundary:** `apps/web/app/onboarding/questionnaire/page.tsx` (`force-dynamic`, server component): resolves session → camp-user → `getBurnerProfile`; redirects if completed; `mergeIdNumber` decrypts the owner's ID back into the pre-fill (`:30–40`); passes `questionnaire={QUESTIONNAIRE}` + `initialResponses` + `action={saveBurnerProfile}` to the client wizard (`:51–56`).
- **Replay boundary:** `apps/web/app/tools/forms/[key]/form-replay.tsx` (`"use client"`) wraps the wizard with `persistProgress={false}` + `saveFormReplay` + a saved-confirmation status.
- **Voice/upload leaves it touches:** `apps/web/components/voice/recorder-panel.tsx` (props `onTranscript`/`onDismiss`/`promptKey`), `apps/web/components/voice/use-voice-recorder.ts` (POSTs `/api/voice/transcribe`), `apps/web/components/profile/avatar-upload.tsx` (POSTs `/api/uploads/avatar`, returns `{ url }`). `apps/web/components/voice/dictate-button.tsx` is a **dead orphan** (no consumers — to DELETE per `molecule-dictatepill.md`).

### Types it binds to
`@camp404/types/questionnaire` — `Question` (10-member `z.discriminatedUnion("kind")`), `QuestionnaireResponseValue` (`number | string | string[] | boolean | null`; the `boolean` member is **vestigial** — no kind emits it), per-kind types (`LongTextQuestion`/`ScaleQuestion`/`ToggleQuestion`/…).

### What the redesign changes
Presentation only — **no kind added or removed, no response-shape change, no schema change** (see `service-layer/03-questionnaire-forms.md`: "~95% REUSE"). The redesign (a) swaps `single_select`/`multi_select` onto `OptionCardGroup`; (b) swaps `scale`/`toggle` onto `SegmentedControl` (boards win on affordance — locked divergences 1 & 2); (c) wraps `date` in NEW `DateControl`; (d) swaps the inline "Dictate instead" button for `DictatePill` and adds the `AvatarUpload` dropzone variant for generic `image`; (e) P1-5 token codemod (`[color:var(--color-*)]` → short-form). The shell, the exhaustive switch, value plumbing, and the `fullScreen` contract stay.

---

## File structure — target files in apps/web

| File | Kind | Action | Notes |
|---|---|---|---|
| `apps/web/components/questionnaire/question.tsx` | `"use client"` island (the field machine) | **MODIFY** | Rewire 5 switch arms onto PROMOTE/NEW controls; delete the now-dead `ToggleField`/`ScaleField` inline sub-renderers; keep `LongTextField` app-local but swap its trigger for `DictatePill`; P1-5 token sweep. Switch stays exhaustive, no `default`. |
| `apps/web/components/questionnaire/wizard.tsx` | `"use client"` host | **MODIFY (light)** | Re-point `validateIdNumber` import `@/lib/id-validation` → `@camp404/core` (service plan 03 Step 1); P1-5 token sweep (ProgressBar/banner/intro). No behaviour change to the field-machine contract (props passed to `QuestionField` unchanged). |
| `apps/web/components/voice/dictate-button.tsx` | dead component | **DELETE** | Dead orphan (zero consumers); replaced by promoted `DictatePill` (`molecule-dictatepill.md`). |
| `apps/web/components/profile/avatar-upload.tsx` | `"use client"` molecule | **DELETE (after PROMOTE)** | Moves to `packages/ui/src/components/avatar-upload.tsx` (`molecule-avatarupload.md`); `question.tsx` (and `profile/edit/edit-form.tsx`) re-import from `@camp404/ui`. |
| `apps/web/components/voice/recorder-panel.tsx` | `"use client"` molecule | **MODIFY (own plan)** | RecorderPanel EXTEND (transcript-review) — `molecule-recorderpanel.md`; the `onTranscript`/`onDismiss`/`promptKey` contract LongTextField calls is unchanged. |
| `apps/web/app/onboarding/questionnaire/page.tsx` | `page.tsx` server | **MODIFY (light)** | Re-point `QUESTIONNAIRE` import `@/lib/questionnaire` → `@camp404/core` (service plan 03 Step 1); P1-5 token sweep on the header copy. No structural change. |
| `apps/web/app/onboarding/questionnaire/actions.ts` | `"use server"` action | **REUSE (import shift only)** | `saveBurnerProfile` — catalogue/`validateIdNumber` imports shift to `@camp404/core`; validation/PII-split/persist path unchanged. |
| `apps/web/app/tools/forms/[key]/form-replay.tsx` | `"use client"` island | **MODIFY (light)** | P1-5 token sweep on the saved-status banner; wizard wiring unchanged. |
| `apps/web/app/tools/forms/[key]/actions.ts` | `"use server"` action | **REUSE (import shift only)** | `saveFormReplay` — import shift; diff/save path unchanged. |
| `/api/voice/transcribe`, `/api/uploads/avatar` | route handlers | **REUSE (no change)** | NOT owned by this surface. Reached only via the leaf components (voice plan 07 / image-blob plan 09). The field machine owns no API route. |
| error/not-found | — | **NONE** | This unit has no own route, so no `error.tsx`/`not-found.tsx`. Boundaries live on the host routes (onboarding/tools), out of scope here. |

**Net app-layer file delta for this unit:** 1 island MODIFIED (`question.tsx`, the renderer), 4 hosts/boundaries lightly MODIFIED (import shifts + token sweep), 1 component DELETED (`dictate-button.tsx`), 1 PROMOTE-then-DELETE (`avatar-upload.tsx`). No new app routes, no new server actions, no new API handlers.

---

## Components composed — the list and where each renders

All render **client-side** — `QuestionField` is `"use client"` and is mounted only inside the `"use client"` wizard. The **server** boundary is upstream (the route server component pre-resolves data; see Services & data). One switch arm per kind:

| Kind | Control (post-redesign) | Component plan | Home | Action |
|---|---|---|---|---|
| `slider` | `Slider` + min/value/max row | `components/atom-slider.md` | `@camp404/ui` | REUSE |
| `single_select` | `OptionCardGroup mode="single" layout="stack"` | `components/molecule-optioncardgroup.md` | `@camp404/ui` | **swap** from `Select` dropdown |
| `multi_select` | `OptionCardGroup mode="multi"` (`stack` default; `chip-grid` for dietary) | `components/molecule-optioncardgroup.md` | `@camp404/ui` | **swap** from inline Checkbox rows |
| `short_text` | `Input` (`maxLength`) | `components/atom-input.md` | `@camp404/ui` | REUSE |
| `long_text` | `LongTextField` (Textarea + `DictatePill` → `RecorderPanel`) | `components/organism-longtextfield.md` + `molecule-dictatepill.md` + `molecule-recorderpanel.md` | **app-local** in `question.tsx` | REUSE/EXTEND |
| `date` | `DateControl` (`<Input type="date">` + calendar icon, ISO contract, `error` ring) | `components/molecule-datecontrol.md` | `@camp404/ui` | **wrap (NEW)** |
| `scale` | `SegmentedControl variant="scale"` (vertical `70dvh` retained on fullScreen) | `components/molecule-segmentedcontrol.md` | `@camp404/ui` | **swap** from `ScaleField` slider |
| `toggle` | `SegmentedControl variant="equal"` | `components/molecule-segmentedcontrol.md` | `@camp404/ui` | PROMOTE from `ToggleField` |
| `combobox` | `Combobox` (Popover + cmdk) | `components/molecule-combobox.md` | `@camp404/ui` | REUSE |
| `image` | `AvatarUpload` (`variant="dropzone"` generic; `variant="circle"` for `profile.image`) | `components/molecule-avatarupload.md` | `@camp404/ui` | REUSE/EXTEND |
| (shell label) | `Label` (`htmlFor="q-{id}"` + required `*`) | `components/atom-label.md` | `@camp404/ui` | REUSE |

**Host-only (wizard, not this renderer):** `Button` (Back/Next/Finish/Sign-out), `ProgressBar` (`components/atom-progressbar.md`). `Select` (`components/molecule-select.md`) stays in `@camp404/ui` for other consumers but is **removed from the `single_select` arm**.

---

## Services & data — what it calls, fetched server-side vs passed as props

**The renderer (`QuestionField`) calls no service and no server action directly.** It is a controlled, stateless-per-render field: it receives a single `Question`, the current value, and `onChange`, and emits a typed `QuestionnaireResponseValue`. All persistence/validation is owned by the **host wizard**, not the field. Two indirect server touches sit **inside leaf components** (not in `QuestionField`):
- `long_text` → `LongTextField` → `RecorderPanel` → `useVoiceRecorder` POSTs `/api/voice/transcribe` (voice plan 07) — encapsulated in the recorder hook.
- `image` → `AvatarUpload` POSTs `/api/uploads/avatar` (image-blob plan 09 `avatar-blob.ts`), emits the returned public URL string.

### Fetched server-side (the route server component, upstream — not by the field)
`apps/web/app/onboarding/questionnaire/page.tsx` resolves: session (`getAuthenticatedUserOrRedirect`), `ensureCampUser`, `hasCampAccess` gate, `getBurnerProfile(campUser.id)`, `getIdDocuments(campUser.id)` (decrypt), and merges via `mergeIdNumber` (`@camp404/db/id-documents`) → a hydrated `initialResponses`. The replay route's server component (`tools/forms/[key]/page.tsx`) resolves the registry's `load` (stored answers) similarly. **The field never reads env/session and never runs on the server.**

### Passed as props (host → `QuestionField`, per question, `wizard.tsx:224–233`)
`question` (one member of the union), `value={responses[q.id]}`, `onChange={(v) => setResponse(q.id, v)}`, `error={errors[q.id]}`, `fullScreen={isFullScreen}`. The field forwards a typed value back: `slider`→`number`; `multi_select`→`string[]`; `image`→`string|null`; all others→`string`.

### Service-layer functions / server-actions / core helpers in the wiring (named, by owner)
| Symbol | Where it runs | Plan | Role for this unit |
|---|---|---|---|
| `saveBurnerProfile(raw, final)` | `apps/web/app/onboarding/questionnaire/actions.ts` (`"use server"`) | service 03 | The page `action` the wizard calls on Next/Finish; validates (`validateResponses`), splits PII (`splitIdNumber`), upserts (`upsertBurnerProfile`), encrypts (`setIdDocuments`), satisfies the gate, `redirect("/")`. **REUSE** (imports shift to `@camp404/core`). |
| `saveFormReplay(key, raw, final)` | `apps/web/app/tools/forms/[key]/actions.ts` (`"use server"`) | service 03 | The replay `action`; validates, `diffResponses`, saves via registry, `recordFormEdit`. **REUSE**. |
| `validateResponses` / `validateOne` / `displayResponseValue` / `diffResponses` / `flattenQuestions` | `@camp404/types/questionnaire` | service 03 / arch | The validation **engine** — called by the actions (server-authoritative) and (mirrored) the wizard. **Stays in `@camp404/types`** (NOT moved to core). The field never calls these. **REUSE.** |
| `validateIdNumber(type, raw)` | `@camp404/core` (moved from `@/lib/id-validation`) | service 03 / arch | The single cross-field rule; called by the **wizard** `validatePageLocally`, surfaced into the `id.number` field's `error` prop. **EXTEND (move, logic unchanged).** |
| `QUESTIONNAIRE` + `TEAMS`/`DIETARY_INGREDIENTS`/`COUNTRY_OPTIONS` | `@camp404/core` (moved from `@/lib/questionnaire`) | service 03 / arch | The catalogue the route passes as `questionnaire`. Not called by the field; it consumes one `Question` from it. **EXTEND (move; content edits per reconciliations).** |
| `validateResponses` `chipGrid` (NEW optional on `MultiSelectQuestion`) | `@camp404/types/questionnaire` | `organism-questionfield.md` Step 3 / `molecule-optioncardgroup.md` | NEW optional field to drive the dietary chip-grid layout from the catalogue, keeping `QuestionField` presentation-driven (not id-aware). Non-breaking types EXTEND. |

**`@camp404/core` helpers the field itself uses: none for domain logic.** One optional pure helper — `appendTranscript(existing, addition, maxLength)` (currently inline at `question.tsx:433–439`) — may move to `@camp404/core` and be shared with `report-bug-dialog.tsx` (`organism-longtextfield.md` Step 4 / voice plan 07). If `core` slips, leave the 4-line fn inline — no behaviour change. The field never imports `@camp404/db` or `next/*`.

---

## Gating — NOT a gated surface

**Preview-but-locked does NOT apply.** The field renderer is **rank-agnostic and identity-only**. Per locked decision 3 and `20-field-renderer.md §Gating states`: it never renders a `CaptainLock`, never withholds/zeroes data, has no locked variant, and never gates data. Gating decides whether the **wizard mounts at all** (the app/page gating spine — the onboarding `page.tsx` runs `hasCampAccess` and redirects; the runner mounts only because of a pending blocking `required_action`), not what the field renders. In all three hosts `QuestionField` renders identically, for the current user only. This is the one place a captain/rank organism plan would add a preview-but-locked column; here it is deliberately absent.

---

## States — empty/loading/error/submitting/success/disabled + fullScreen

Per-field render states (each kind expresses the empty/populated pair; the canonical per-kind table is `surfaces/20-field-renderer.md §States`):

| State | What the renderer shows | Source |
|---|---|---|
| **Empty / unfilled** | shell + control zero state: `slider`→`min`; `single_select`→no card selected; `multi_select`→none checked; `short_text`/`long_text`→empty/placeholder; `date`→empty native field; `scale`→middle step highlighted **but uncommitted**; `toggle`→no segment `aria-checked`; `combobox`→placeholder "Select…"; `image`→dropzone "Add photo" | `surfaces/20-field-renderer.md §States` |
| **Populated** | controls reflect `value`; select/toggle/combobox resolve labels; multi shows checked; scale highlights chosen step; image shows photo + remove X | `question.tsx` per-arm |
| **Loading** | **N/A.** The wizard mounts already hydrated (server pre-resolves `initialResponses`); the field has no own fetch and no spinner | `organism-questionfield.md §States` |
| **Error (validation)** | `error` prop set → destructive `<p role="alert">` under the control (`question.tsx:78–82`); control border may switch `$destructive` (board draws it on `date`; `DateControl`/`SegmentedControl`/`OptionCardGroup` expose an `error` flag). Strings from `validateOne` / wizard `validatePageLocally` / `validateIdNumber` | `question.tsx`; leaf plans |
| **Submitting** | the wizard's `isPending` (`useTransition`) disables Back/Next; **individual fields are NOT disabled mid-submit** (matches live). Two field-local sub-states: `image` upload (`AvatarUpload` spinner overlay + disabled buttons + "Uploading…") and `long_text` dictation (`RecorderPanel` requesting/recording/processing/error) | `surfaces/20-field-renderer.md §Submitting` |
| **Success** | **not expressed by the renderer** — the wizard advances / fires `onComplete` / persists the diff. `image` "success" = the uploaded photo renders | `surfaces/20-field-renderer.md §States` |
| **Disabled** | no general per-field disabled in the normal flow; `Combobox`/`OptionCardGroup`/`SegmentedControl`/`DateControl` accept `disabled` but the renderer does not pass it; `AvatarUpload` self-disables while uploading | `surfaces/20-field-renderer.md §States` |
| **fullScreen** | shell becomes `flex flex-1`; flips `scale` to its `70dvh` vertical layout, lets `long_text` grow (`min-h-[40dvh] flex-1`), centres `image`. Owned by the wizard (`isFullScreen`, `wizard.tsx:149–155`), consumed via the `fullScreen` prop | `wizard.tsx`; `question.tsx:52–59` |
| **Skip vs Next** | host-level: a lone optional question with no answer makes the footer read "Skip" (`wizard.tsx:160–172`) — affects optional single-question pages (profile photo, ideas). Not a field state | `wizard.tsx` |

**Gating states:** N/A (see Gating). The full matrix for completeness: empty / loading (n/a) / error (shell) / submitting (footer-only) / success (wizard) / disabled (n/a) / locked (n/a — not a captain/rank surface).

---

## Build steps — ordered, with prerequisites + acceptance + test notes

> **Hard prerequisites (must land first):** Phase 0 **foundations-tokens** (status tokens, `--overlay` scrim, radius scale, `--text-*` steps, short-form Tailwind utilities — `foundations-tokens.md`). Each leaf control below must ship + export from `@camp404/ui` before its switch arm is rewired. The catalogue/ID-validation move to `@camp404/core` (service plan 03 Step 1, Phase 1/3) is the import-shift prerequisite for the host wiring. **Sequencing rule (MEMORY: green-CI-is-done):** each step is an independently CI-green change; the catalogue move (~6 import sites) lands alone.**

### Step 0 — Import shifts (host wiring, no behaviour change)
After service plan 03 Step 1 lands `@camp404/core`: re-point `QUESTIONNAIRE` (`onboarding/questionnaire/page.tsx:10`, `actions.ts`) and `validateIdNumber` (`wizard.tsx:12`) from `@/lib/*` → `@camp404/core`.
- **Prereq:** `@camp404/core` exists with catalogue + `id-validation` (service 03 Step 1).
- **AC:** `tsc`/build green; no `@/lib/{questionnaire,id-validation}` imports remain in the wizard/page/actions; existing `questionnaire.test.ts` / `wizard.test.tsx` / `actions.test.ts` green.

### Step 1 — P1-5 token codemod in `question.tsx` + host (REUSE-safe)
Replace every verbose `[color:var(--color-*)]` in `QuestionField`/`FieldInput`/`ToggleField`/`ScaleField`/`LongTextField` and the wizard chrome with short-form utilities (`text-muted-foreground`/`text-foreground`/`text-primary`/`border-border`/`bg-primary`). Resolve the required-`*` colour: keep `$primary` (live) unless the token spec decides `$destructive` (open item — divergence 5).
- **Prereq:** Phase 0 tokens.
- **AC:** zero `[color:var(--color-` strings in `question.tsx`/`wizard.tsx`; pixel-identical render; tests green.

### Step 2 — `single_select` → `OptionCardGroup mode="single"`
Replace the `Select` arm (`:128–145`) with `<OptionCardGroup mode="single" layout="stack" options value onChange aria-labelledby={id} />`. Keep `Select` exported in `@camp404/ui` for other consumers.
- **Prereq:** `molecule-optioncardgroup.md` shipped + exported.
- **AC:** single_select renders radio cards (OB steps 08/09 driving/onsite/AB-count, step 10 burn intent = 6 cards); selecting emits the option `value`; old dropdown gone.
- **Tests:** RTL — click a card → `onChange(value)`; one selected at a time; required-missing surfaces the error line.

### Step 3 — `multi_select` → `OptionCardGroup mode="multi"` (+ chip-grid)
Replace the inline Checkbox rows (`:146–174`) with `<OptionCardGroup mode="multi" layout={q.chipGrid ? "chip-grid" : "stack"} … />`. Add the NEW optional `chipGrid?: boolean` on `MultiSelectQuestion` (`@camp404/types/questionnaire.ts`), set on the dietary questions — keeps the renderer presentation-driven, not id-aware.
- **Prereq:** OptionCardGroup shipped; `@camp404/types` `chipGrid` field added.
- **AC:** lead-teams (8) + years (6) render as checkbox cards; dietary dislikes/allergies render as 2-col chip-grids; toggling emits `string[]`; zero-selection allowed; the non-`true` checkbox state still maps to the remove branch.
- **Tests:** RTL — add/remove updates the array; chip-grid renders `grid-cols-2`; dietary carries `chipGrid:true`.

### Step 4 — `scale` + `toggle` → `SegmentedControl`; delete dead sub-renderers
`toggle` arm: replace `ToggleField` with `<SegmentedControl variant="equal" options value onChange aria-label={prompt} />` (persists the string option `value`, never boolean). `scale` arm: replace `ScaleField` with `<SegmentedControl variant="scale" … />` for inline scale; **retain the `70dvh` vertical layout for `fullScreen` single-question scale pages** (open item — confirm full-screen scale keeps the vertical slider while inline uses segments). Delete the now-dead inline `ToggleField` (`:249–288`) + `ScaleField` (`:297–403`).
- **Prereq:** `molecule-segmentedcontrol.md` shipped + exported.
- **AC:** toggle renders a segmented row emitting a string; scale renders segmented cells inline + vertical full-viewport on lone fullScreen scale pages; `validateOne` "scale"/"toggle" paths still pass; OB step 06 team-interest + S26 runner parity.
- **Tests:** RTL — toggle/scale emit string option values; fullScreen scale keeps the vertical layout.

### Step 5 — `date` → `DateControl`
Replace the bare `<Input type="date">` (`:194–202`) with `<DateControl value onChange error={!!error} id={id} />`; DateControl enforces ISO `yyyy-mm-dd`, adds the calendar icon + `h-11` + `bg-muted`, and exposes the `error` ring.
- **Prereq:** `molecule-datecontrol.md` shipped + exported.
- **AC:** date shows the calendar affordance, emits `yyyy-mm-dd`; error prop drives `border-destructive`.
- **Tests:** RTL — emits ISO string; error ring on `error`. **Carry as build flags (do not silently patch — house policy):** the `2026-02-31` `Date.parse` overflow bug; the server-side `id.number` validation gap (`validateIdNumber` is client/wizard-only; server validates `id.number` only as `short_text ≤ 40`).

### Step 6 — `long_text` → `DictatePill` + RecorderPanel host refactor
In `LongTextField`, replace the inline `Button variant="outline"` "Dictate instead" with `<DictatePill onActivate={() => setDictating(true)} />`, moved into a right-aligned `PillRow` **above** the Textarea (board placement). Keep `dictating` toggle, `RecorderPanel promptKey="questionnaire"`, and `appendTranscript` (trim → `\n`-join when not already trailing-whitespace → slice to `maxLength`). Adopt the `Textarea variant="fullScreen"` prop in place of the ad-hoc `min-h-[40dvh]` className. Optionally extract `appendTranscript` to `@camp404/core` (shared with `report-bug-dialog.tsx`).
- **Prereq:** `molecule-dictatepill.md` + `molecule-recorderpanel.md` + `atom-textarea.md` (`variant` prop) shipped; `DictatePill` exported; dead `apps/web/components/voice/dictate-button.tsx` deleted.
- **AC:** the pill (`r:999`) sits above the Textarea, opens RecorderPanel, transcript appends + clamps to `maxLength`; mixing typed + dictated text works; fullScreen Textarea still grows. (Confirm per-field pill visibility — bio/ideas show it; other-burns/notes plain — `organism-longtextfield.md` Step 5; until the flag lands, keep current behaviour.)
- **Tests:** RTL — pill activates → RecorderPanel mounts; "Use this text" appends + clamps; dismiss returns to the pill.

### Step 7 — `image` → AvatarUpload (PROMOTE) + dropzone variant
PROMOTE `avatar-upload.tsx` → `@camp404/ui` (`molecule-avatarupload.md`); re-import in `question.tsx` (and `profile/edit/edit-form.tsx`). Pass `variant="dropzone"` for the generic `image` field (board's rectangular dropzone + JPG/PNG + size helper + Uploading + Thumb-with-remove); keep `variant="circle"` for `profile.image` (resolve which id routes to which — open item). Value stays the URL string (`null` on remove); upload errors stay inside AvatarUpload, not the field `error` prop. **Note:** the API route cap is **5 MB** (not the board's 10 MB) — helper copy must match the server (`molecule-avatarupload.md`).
- **Prereq:** `molecule-avatarupload.md` shipped with the `dropzone` variant; old app-local file deleted after re-import.
- **AC:** generic image fields show the dropzone; profile photo keeps the circular crop; upload→URL→remove round-trips; the field `error` prop is not used for upload failures.
- **Tests:** RTL — upload emits the URL; remove emits `null`; variant prop selects the shape.

### Step 8 — Regression sweep + e2e
Verify the exhaustive 10-arm switch still has no `default`, all kinds render, and the shared engine works across all three hosts.
- **Prereq:** Steps 0–7.
- **AC:** `apps/web/components/__tests__/questionnaire.test.ts` + `apps/web/components/__tests__/wizard.test.tsx` + `apps/web/tests/e2e/onboarding-questionnaire.spec.ts` green; OB wizard, blocking runner, and my-forms replay all render every kind; no functionality dropped.
- **Tests / E2E_TEST_MODE seam:** the e2e (`apps/web/tests/e2e/onboarding-questionnaire.spec.ts`) runs under **`E2E_TEST_MODE=1` + `INVITE_CODES=TEST-INVITE`** (`apps/web/lib/test-mode.ts`, `env.ts`), driving the in-memory backend (`apps/web/lib/test-store.ts`) so `saveBurnerProfile`/`satisfyBurnerProfileAction` are no-ops/in-memory and no real DB/Neon-Auth is required. The swapped Radix/cmdk-portal controls (`OptionCardGroup`, `SegmentedControl`, `Combobox`, `DateControl`) need pointer-event-aware selectors in the spec — extend, don't rewrite, the existing e2e. Unit tests (`vitest`) cover the synthetic-questionnaire wizard orchestration (`wizard.test.tsx` uses text-only kinds to avoid portals) and the catalogue/validation engine (`questionnaire.test.ts`).

---

## Open items — surface-specific decisions

Cross-ref `design/spec/open-questions.md` and `surfaces/20-field-renderer.md §Open questions`:

- **toggle Switch-vs-segmented selector:** what drives Switch vs segmented radiogroup for a `toggle` question — option count (`==2` → Switch, 3–4 → segmented) or a per-question presentational flag? No schema field expresses this; recommend deriving from `options.length` to avoid a schema change. Confirm. (`molecule-segmentedcontrol.md` / `molecule-switchfield.md`.)
- **scale segmented presentation on fullScreen:** confirm the segmented row is acceptable on `70dvh` single-question scale pages, OR full-screen scale keeps the vertical slider while inline scale uses segments (Step 4 retains the vertical layout pending this).
- **image affordance unification + size cap:** ship the dropzone for generic `image` while `profile.image` keeps the circular crop — confirm which question ids route to which variant; and whether to add client-side size/type validation (the board implies 10 MB but the route enforces **5 MB** — code currently lacks client validation; helper copy must match the server).
- **required-marker colour:** `$primary` (live) vs `$destructive` (board) — resolve in the token spec (divergence 5).
- **DictatePill extraction + per-field visibility:** codify the pill as the shared dictation trigger; confirm one pill shape replaces the live outline button, and confirm which `long_text` fields show it (bio/ideas yes; other-burns/notes no — `organism-longtextfield.md` Step 5).
- **`chipGrid` on `MultiSelectQuestion`** (NEW optional type field, Step 3): confirm the dietary questions carry it; keeps the renderer presentation-driven.
- **date overflow + server-side `id.number` validation gaps:** documented source bugs — confirm whether to patch in this redesign or carry forward (per MEMORY: source findings documented, not silently patched).
- **Catalogue content reconciliations (gate the catalogue move, service 03 Step 0):** `team_interest` range 0–5 vs 0–6 (the `slider` kind's `max` — catalogue is `max: 5`); hardware-competency `scale` page keep-vs-merge (12 vs 11 pages); copy edits. Owner: product. Non-schema; gates Step 0's import-shifted catalogue.
