# QuestionnaireWizard — organism plan

- **mapsTo + home:** **REUSE / keep app-local.** Per `component-library.md:432` the
  wizard stays in `apps/web` — it is the paging/validation/persistence **engine**, not a
  presentational primitive, and it imports app-resident server-action types
  (`SaveResult` from `apps/web/app/onboarding/questionnaire/actions.ts`) and the
  app-local sibling organism `QuestionField`. It may NOT move to `@camp404/ui` (which is
  presentation-only and must never import `next/` or app server-action types). Shared
  1:1 across all three callers via props/chrome, not via a parallel implementation.
- **Target file:** `apps/web/components/questionnaire/wizard.tsx` (stays; light EXTEND
  for runner chrome injection + the board-reconciled progress/alert presentation).

---

## Current state — what exists today (the old design's component/route markup)

**`apps/web/components/questionnaire/wizard.tsx`** (verified, read in full) — a single
`"use client"` default-named `QuestionnaireWizard` component (`wizard.tsx:49–261`) plus
a private `ProgressBar` fn (`wizard.tsx:263–278`). It is the live, working engine; the
redesign is a re-skin + chrome injection, not a rewrite. What it does today:

- **State (`wizard.tsx:58–62`):** `pageIndex`, `responses` (seeded from
  `initialResponses`), `errors` (`Record<string,string>`), `isPending` (React
  `useTransition`). `page = questionnaire.pages[pageIndex]`; `isLast` derived; out-of-range
  page → `return null` (`:67`).
- **Mutation (`setResponse`, `:69–77`):** merges the value and **clears that field's
  inline error** on change.
- **Local validation (`validatePageLocally`, `:79–101`):** intro pages always pass;
  required-and-missing (`undefined|null|""`) → `"This question is required"`; cross-field
  `id.number` runs `validateIdNumber(responses["id.type"], v)` (`:90–97`).
- **Next (`handleNext`, `:103–124`):** validate → if `!persistProgress` advance locally;
  else `startTransition(action(responses,false))` → `{ok:false}` sets server errors,
  `{ok:true}` advances, **thrown** sets `_form = SAVE_FAILED` (`:121`).
- **Back (`handleBack`, `:126–128`):** `setPageIndex(max(0, i-1))`, no save.
- **Submit (`handleSubmit`, `:130–147`):** validate → `action(responses,true)` →
  `{ok:false}` sets errors, success calls `onComplete?.()` (onboarding redirects
  server-side so the callback never runs there); thrown → `_form`.
- **fullScreen (`:149–155`):** `intro`, or a lone-`scale`/`long_text`/`image` page.
- **Skip (`:160–172`):** a lone unanswered optional question flips the primary label to
  "Skip" (same handler as Next).
- **Render (`:178–260`):** `<form>` → `ProgressBar` → `_form`/`_root` banner
  (`errors[_form] ?? errors[_root]`, `:176`, rendered as a `role="alert"` `<p>` with raw
  `var(--color-destructive)/10`, `:189–196`) → intro `<section>` OR title/subtitle +
  mapped `QuestionField`s → footer (`:238–258`): left = Sign-out link (`firstStepSignOut`
  on page 0) OR Back (disabled on page 0 / pending); right = `<Button type="submit">`
  labelled `submitLabel`/`nextLabel`.
- **`ProgressBar` (`:263–278`):** `Math.round((current/total)*100)` fill + **"Step
  {current} of {total}"** text, raw `var(--color-muted)`/`var(--color-primary)` tokens.

**Sibling organism it composes today — `QuestionField`**
(`apps/web/components/questionnaire/question.tsx`, read in full): the per-kind renderer
(`QuestionField` + `FieldInput` switch over the 10 kinds + `ToggleField`/`ScaleField`/
`LongTextField` sub-renderers). Today `single_select` → shadcn `Select` dropdown
(`question.tsx:128–145`), `scale` → vertical/horizontal `Slider` (`:297–403`), `toggle` →
segmented `role=radio` buttons (`:249–288`), `long_text` → `Textarea` + `RecorderPanel`
dictation (`:418–477`). Errors render **under** the field (`:78–82`). This is its own
organism (`component-library.md:413`, kept app-local, its own redesign plan); the wizard
treats it as a black box and is unaffected by its re-skin.

**Routes/markup that mount the engine today:**
- **Onboarding host** — `apps/web/app/onboarding/questionnaire/page.tsx` (`force-dynamic`
  server component): auth → `ensureCampUser` → `hasCampAccess` else `/signup/required`
  → `completedAt` set → `/` → `mergeIdNumber` pre-fill → renders an app-chrome header
  ("Build your burner profile") + `<QuestionnaireWizard questionnaire action=saveBurnerProfile
  firstStepSignOut />` inside `max-w-2xl min-h-[100dvh]`.
- **Onboarding action** — `apps/web/app/onboarding/questionnaire/actions.ts`
  (`saveBurnerProfile`, `"use server"`): final → `validateResponses`; `splitIdNumber`;
  `upsertBurnerProfile`; `setIdDocuments` (encrypt); `setProfileImage` mirror; final →
  `satisfyBurnerProfileAction` + `redirect("/")`; thrown → `{ok:false, errors:{_form}}`
  (`actions.ts:81–93`).
- **Replay host** — `apps/web/app/tools/forms/[key]/form-replay.tsx` mounts the **same**
  wizard with `persistProgress={false} submitLabel="Save changes" action={saveFormReplay}
  onComplete={…}` (`form-replay.tsx:47–49`); page `[key]/page.tsx` redirects if the loaded
  form has no `completedAt` (12-my-forms.md:113).
- **Blocking runner** — **does not exist yet as distinct chrome.** Today the same physical
  route `apps/web/app/onboarding/questionnaire/page.tsx` IS the blocking runner when
  reached via a pending blocking `required_action`; there is no `BlockingTopBar` /
  `BlockingNotice` / `RequiredChip` markup in the tree (confirmed by surface 24 brief and
  by grep — those are NEW). `apps/web/lib/required-actions.ts` maps only `burner_profile`
  → this route (`required-actions.ts:7–11`).

**Tests today:** `apps/web/components/__tests__/questionnaire.test.ts` (field renderer +
cross-field `validateIdNumber`); `apps/web/app/onboarding/questionnaire/actions.test.ts`
(`saveBurnerProfile` typed-error path); `apps/web/tests/e2e/onboarding-questionnaire.spec.ts`
(end-to-end). All green; must stay green.

---

## Composition

### Leaf components it consumes (link plan files)

The wizard is thin; almost all visible UI is the footer buttons + progress + (NEW)
runner chrome + delegated field rendering. Direct dependencies:

- **Button** — footer Back/Sign-out (ghost/outline) + primary Next/Skip/Finish/Submit.
  REUSE `@camp404/ui/components/button`. Plan: `atom-button.md`. (Current code already
  imports `@camp404/ui/components/button`, `wizard.tsx:10`.)
- **ProgressBar** — the step/question progress track. PROMOTE out of this very file's
  private fn into `@camp404/ui` (`packages/ui/src/components/progress-bar.tsx`). Plan:
  `atom-progressbar.md`. Wizard EXTEND: stop rendering the inline `ProgressBar` fn,
  import the promoted atom; pass a **board-reconciled label** ("Question N of N" for the
  blocking-runner variant vs "Step N of M" for onboarding/replay — see API).
- **Alert** — the page-level (`_form`/`_root`) banner + the runner's in-card validation
  `InlineAlert`. PROMOTE; the wizard replaces its hand-rolled `role="alert"` `<p>`
  (`wizard.tsx:189–196`) with the `Alert` molecule (`tone="destructive"`). Plan:
  `molecule-alert.md`.

### Sibling organism it delegates to (no leaf plan — its own organism plan)

- **QuestionField** (`apps/web/components/questionnaire/question.tsx`, kept app-local,
  `component-library.md:413`) — the wizard maps `page.questions` through it
  (`wizard.tsx:224–233`), passing `question/value/onChange/error/fullScreen`. The wizard
  is **agnostic to the field re-skin**: `single_select`→OptionCardGroup,
  `scale`→SegmentedControl, `toggle`→SegmentedControl, dietary `multi_select`→chip grid,
  `slider`→segmented, `date`→DateControl all happen inside `QuestionField`, not here.
  Transitively (documented for traceability, not wired by the wizard): **OptionCardGroup**
  (`molecule-optioncardgroup.md`), **SegmentedControl** (`molecule-segmentedcontrol.md`),
  **Slider** (`atom-slider.md`), **Checkbox** (`atom-checkbox.md`), **Combobox**
  (`molecule-combobox.md`), **Select** (`molecule-select.md`), **Input/Textarea/Label**
  (`atom-input.md`/`atom-textarea.md`/`atom-label.md`), **DateControl**
  (`molecule-datecontrol.md`), **InputField** (`molecule-inputfield.md`), **AvatarUpload**
  (`molecule-avatarupload.md`), **LongTextField** (`component-library.md:421`, app-local),
  **DictatePill** (`molecule-dictatepill.md`) → **RecorderPanel**
  (`molecule-recorderpanel.md`).

### NEW runner chrome (app-local, injected around the wizard — surface 24)

These are NEW (`component-library.md:437`, surface 24 §"New components") and live
**app-local** in `apps/web/components/questionnaire/` (reusable across burner/dietary/
agreements runners). They are NOT separate leaf plans yet — spec them as part of the
runner host wiring; the wizard hosts/accepts them via slot props (see API):

- **BlockingTopBar** (NEW, `component-library.md:437`) — sticky `$card` header: title +
  **RequiredChip** + Sign-out + ProgressBar. Props `title · current · total · onSignOut`.
- **BlockingNotice** (NEW) — persistent destructive-tint banner ("You can't use the app
  until this is finished."), never dismisses.
- **RequiredChip** (NEW) — lock-icon "Required" pill (reused on S27 queue rows too).

### @camp404/core helpers it (transitively) relies on

The wizard itself stays UI-only, but its data contract is moving to `core`
(architecture.md §Hybrid, plan 03):

- **`validateIdNumber`** — moves `apps/web/lib/id-validation.ts` → `@camp404/core`
  (`id-validation.ts`). The wizard's import (`wizard.tsx:12`) re-points from `@/lib/…` to
  `@camp404/core`. Logic unchanged.
- **`QUESTIONNAIRE` catalogue + `TEAMS`/`DIETARY_INGREDIENTS`/`COUNTRY_OPTIONS`** — move
  to `@camp404/core` (consumed by the host pages, not the wizard directly).
- **Validation engine** (`validateResponses`/`validateOne`/`flattenQuestions`/
  `diffResponses`/`displayResponseValue`) — **stays in `@camp404/types`** (already correct,
  architecture.md §types). The wizard mirrors `validateOne` semantics client-side; the
  server actions call `validateResponses`.

### Services / server-actions it calls (named from the service-layer plans)

The wizard never imports a service directly — it receives one `action` prop and the host
wires the concrete server action (03-questionnaire-forms.md §Consumers):

- **`saveBurnerProfile(raw, final)`** (`apps/web/app/onboarding/questionnaire/actions.ts`,
  REUSE) — onboarding + burner_profile blocking runner. Internally:
  `validateResponses` (types) · `splitIdNumber` (db) · `upsertBurnerProfile` (db, **EXTEND**
  — COALESCE `completedAt`) · `setIdDocuments`/`setProfileImage` (users orchestration) ·
  `satisfyBurnerProfileAction` → `satisfyRequiredAction` (db) · `redirect("/")`.
- **`saveFormReplay(key, raw, final)`** (`apps/web/app/tools/forms/[key]/actions.ts`,
  REUSE) — replay. Validates · `diffResponses` · saves via the replay `REGISTRY` ·
  `recordFormEdit`.
- **Future blocking runners** (dietary/driver/agreements) reuse this exact engine with a
  generic satisfy-on-complete action against their own domain table + `satisfyRequiredAction`
  (03-questionnaire-forms.md:22; deferred until `ACTION_ROUTES` maps them — open Q below).

### server-component vs "use client" split

- **`QuestionnaireWizard` = `"use client"`** (interactive state machine; `useState` +
  `useTransition`). Unchanged.
- **NEW runner chrome** (BlockingTopBar/BlockingNotice/RequiredChip) — presentational;
  may be server-renderable, but BlockingTopBar's Sign-out is a plain `<a>`/link and the
  ProgressBar inside it must reflect the **client** `pageIndex`. Resolution: keep the
  chrome **inside the client wizard's render tree** (or pass `current/total` down), so the
  progress and the title bar update as the user pages. The **host page stays a server
  component** (`force-dynamic`) doing auth/gate/pre-fill and rendering the client wizard;
  it picks onboarding-chrome vs blocking-chrome via a prop.

---

## API & data flow

### Props / inputs (current contract — REUSE, EXTEND with chrome slot)

```text
questionnaire   : Questionnaire                       // catalogue (from @camp404/core)
initialResponses: QuestionnaireResponses              // server-prefilled (incl. merged decrypted id.number)
action          : (responses: unknown, final: boolean) => Promise<SaveResult>
persistProgress?: boolean   = true                    // false → replay (no per-Next save)
onComplete?     : () => void                          // replay confirmation; omitted in onboarding (server redirect)
submitLabel?    : string    = "Finish"               // "Finish" onboarding · "Save changes" replay · "Submit" runner
firstStepSignOut?: boolean  = false                   // page-0 escape hatch
nextLabel?      : string                              // per component-library.md:433 (currently derived, not a prop — see note)
```

EXTEND (NEW props for the blocking-runner variant, surface 24):
```text
variant?        : "onboarding" | "runner" | "replay"  // selects chrome + progress copy + alert placement
blockingTitle?  : string                              // runner: BlockingTopBar / RequiredChip title (from required_actions.title)
// OR: accept a `chrome` render slot the host fills with <BlockingTopBar/> + <BlockingNotice/>.
```
> Reconciliation note: `component-library.md:433` lists a `nextLabel` prop; the live code
> derives the next label internally (`nextLabel` local, `wizard.tsx:172`). Either expose it
> as the documented prop or keep deriving — confirm; behaviour identical. The board-vs-live
> progress copy ("Question N of N" vs "Step N of M") is driven by `variant` (runner =
> question-paced) — surface 24 Divergence #4. Fill math (`Math.round((current/total)*100)`)
> is unchanged across variants.

### What it fetches vs receives

The wizard **fetches nothing**. All data is received: `questionnaire` (static catalogue)
and `initialResponses` (server-prefilled by the host — for burner_profile the host merges
the owner's decrypted `id.number` back in via `mergeIdNumber`, owner-only path,
`page.tsx:30–40`). State (`responses`, `errors`, `pageIndex`) is held client-side; the
server is the source of truth only across reloads (progress saves rehydrate via the host).

### How state flows

```text
host (server) ── initialResponses, questionnaire, action, variant ──▶ wizard (client)
wizard: useState(responses) ⇄ QuestionField.onChange → setResponse → clears field error
Next  → validatePageLocally → (persistProgress) action(responses,false) → advance | errors | _form
Submit→ validatePageLocally → action(responses,true) → {ok:true}→onComplete()/server redirect | {ok:false}→errors | throw→_form
```

### Forms: actions + validation (two tiers)

- **Client tier (`validatePageLocally`, `wizard.tsx:79–101`):** required-and-missing →
  "This question is required"; cross-field `id.number` → `validateIdNumber` (now from
  `@camp404/core`). Runs before every Next/Submit; blocks advance on failure.
- **Server tier (in the `action`):** `validateResponses(QUESTIONNAIRE, raw)` on final
  submit (`actions.ts:38–41`). Per-kind rules; unknown keys dropped; field errors returned
  as `{ok:false, errors}` → re-shown in the card; non-field failures keyed `_root`.
- **Save failure:** thrown action → wizard sets `_form = SAVE_FAILED`; host redirect on
  invite-revoke (`hasCampAccess` in the action, defence-in-depth, `actions.ts:32–34`).
- **Known source bugs to CARRY (document, do not patch — house policy / MEMORY):**
  (a) `id.number` SA-ID/passport rule is **client-only** — server validates it as
  `short_text ≤ 40` (surface 24 §Validation; 03-questionnaire-forms.md Step 5 is
  owner-gated, default skip). (b) `date` `validateOne` accepts impossible calendar dates
  (`2026-02-31`) via `Date.parse` rollover. (c) `team_interest` range drift 0–6 (board) vs
  0–5 (catalogue) and the `hardware_competency` 12-vs-11-page question are **content
  reconciliations** (architecture.md OQ#5) that must be locked before the catalogue edit —
  they change the field machine the wizard renders, not the wizard.

---

## States — full matrix incl. global matrix + gating

| State | Presentation |
|---|---|
| **Empty (unanswered current page/question)** | Fields render unfilled per kind; primary = Next/Skip and **enabled** (validation runs on press, not entry). Onboarding page 0 = optional photo → "Skip". |
| **Loading (route mount)** | Server component (`force-dynamic`) awaits auth + invite + `getBurnerProfile` + `getIdDocuments` (+ for non-burner runners, the activation/required-action + prior responses) before render. **No client skeleton** — the wizard mounts hydrated. |
| **Populated** | Controls reflect `responses[id]`; for burner_profile the decrypted `id.number`/`id.type` are merged into the pre-fill. Progress-saved partial signups survive reload (onboarding/runner). |
| **Validation-error (field)** | `validatePageLocally` (or server per-field error) → message under the field via `QuestionField`'s `error` prop (`question.tsx:78–82`). |
| **Validation-error (page/form)** | `_form` (client catch) or `_root` (server non-field) → Alert banner near the top (`wizard.tsx:189–196`, re-skinned to the `Alert` molecule). **Runner variant additionally** surfaces an in-card **InlineAlert** ("Please answer to continue.") above the field (surface 24 Divergence #3 — adopt both: card-level alert + field-level message). |
| **Submitting / pending** | `isPending` (`useTransition`): Back disabled; primary disabled. Onboarding/replay label flips to "Saving…"/disabled; **runner** flips to "Submitting…" at `op:0.6` (surface 24 S26 SUBMITTING). Fields are NOT independently disabled mid-submit (matches live). Sub-states: `image` "Uploading…" (AvatarUpload), `long_text` dictation requesting/recording/processing (RecorderPanel) — owned by QuestionField. |
| **Success** | **No in-wizard success card.** Onboarding/runner: the action `redirect`s server-side (burner_profile → `/`), re-entering the gating spine. Replay: `onComplete()` → host shows SavedBanner + `router.refresh()` (12-my-forms.md:64). The post-submit success/queue UI is the separate **S27** surface, not this organism. |
| **Disabled** | Back disabled on page 0 and while pending; primary disabled while pending. Individual fields never independently disabled. |
| **Save-failed** | Thrown action → `_form` banner ("We couldn't save your answers just now…") + retry; user stays; nothing silently swallowed (`wizard.tsx:117–122, 143–145`). |
| **page-0 / first** | Left slot = Sign-out link (`firstStepSignOut`, onboarding/runner) instead of Back; runner uses BlockingTopBar Sign-out as the escape (surface 24 OQ#9 — Back simply disabled on Q1). |
| **middle** | Back + Next (Skip for a lone unanswered optional). |
| **last** | Back + primary = `submitLabel` ("Finish" / "Save changes" / "Submit"); runner may show a "review your answers" helper (S26 LAST QUESTION). |

### Global gating matrix + preview-but-locked

- **Invite-gated:** `!hasCampAccess` → `redirect("/signup/required")`, enforced in BOTH
  the host page and the save action (defence-in-depth). Wizard never renders for an
  inviteless user.
- **Onboarding-incomplete:** this organism (as onboarding/runner) **is** the gate;
  completing satisfies the `burner_profile` required-action.
- **Already-complete:** host redirects to `/` if `completedAt` is set (onboarding) /
  redirects to `/tools/forms` if a replay form is not yet completed (12-my-forms.md:113).
  A re-activated newer `required_actions.version` re-opens the gate.
- **Pending/rejected approval:** NOT handled here — handled by `/pending-approval`
  downstream of the post-completion redirect.
- **Preview-but-locked (decision #3 / CaptainLock):** **N/A — explicitly does NOT apply.**
  The wizard is rank-agnostic and identity-only; it returns real data for the signed-in
  user's own profile, never a captain/rank surface. There is no `CaptainLock` variant, no
  rank preview, no inert/zero-data render (surfaces 04 §"Preview-but-locked — N/A" and 24
  §"Not-applicable gating states"). Record this explicitly so the engine is never
  retro-fitted with rank gating.

---

## Build steps — ordered, with prerequisites + acceptance + tests

**Prerequisite phases (must land first, from architecture.md + 03):**
- **P0 Foundations** (`foundations-tokens.md`): status tokens + `$destructive`/`$primary`
  alpha utilities (so the banner/notice tints stop using raw `#f83e5a1a`/`#ff008c1a`/
  `var(--color-destructive)/10`) + font tokens.
- **P1/P3 core extraction** (03 Step 1): `@camp404/core` hosts `validateIdNumber` +
  `QUESTIONNAIRE` catalogue; wizard import re-points `@/lib/id-validation` → `@camp404/core`.
- **P5 UI promotes** (components plan): `ProgressBar`, `Alert`, and the QuestionField-side
  re-skin leaves (OptionCardGroup/SegmentedControl/DateControl) land in `@camp404/ui`.
- **03 Step 0** (owner content lock): hardware-competency page shape + `team_interest`
  range + copy edits — these change the catalogue/QuestionField, NOT the wizard, but gate
  the catalogue move.

**Step 1 — Re-point imports (no behaviour change).**
- `wizard.tsx:12` `validateIdNumber` → `@camp404/core`. Hosts re-point `QUESTIONNAIRE`.
- Prereq: P1/P3 core scaffold. Acceptance: `tsc`/build green; existing
  `questionnaire.test.ts` cross-field case still passes. Test: re-run existing suite.

**Step 2 — Swap private ProgressBar for the promoted `@camp404/ui` ProgressBar.**
- Delete `wizard.tsx:263–278`; import the atom; pass `current/total` (+ a label/`variant`
  so runner reads "Question N of N", onboarding/replay "Step N of M").
- Prereq: `atom-progressbar.md` PROMOTE landed. Acceptance: identical fill math; label
  matches variant; onboarding/replay e2e unchanged. Test: snapshot/unit on the label
  strings per variant; confirm no analytics depends on the old "Step N of M" string
  (surface 24 OQ#3).

**Step 3 — Swap the hand-rolled `_form`/`_root` banner for the `Alert` molecule.**
- Replace `wizard.tsx:189–196` with `<Alert tone="destructive" role="alert">`. Keep the
  `errors[_form] ?? errors[_root]` source.
- Prereq: `molecule-alert.md` PROMOTE landed + status tokens (P0). Acceptance: banner
  renders for both keys; `role="alert"` preserved. Test: unit asserting banner shows on a
  thrown action (`_form`) and a server `_root`.

**Step 4 — Add the `variant` prop + blocking-runner chrome injection (surface 24).**
- Add `variant?: "onboarding"|"runner"|"replay"` (or a `chrome` slot). For `runner`:
  render BlockingTopBar (title + RequiredChip + Sign-out + ProgressBar) + BlockingNotice
  above the body; flip primary label to "Submit"/"Submitting…"; surface validation as the
  in-card **InlineAlert** in addition to the field-level error.
- Build the NEW app-local chrome (`apps/web/components/questionnaire/blocking-top-bar.tsx`,
  `blocking-notice.tsx`, `required-chip.tsx`) — reusable across burner/dietary/agreements.
- Prereq: Steps 2–3 (ProgressBar/Alert) + P0 tokens. Acceptance: runner variant renders
  the blocking chrome over the same field machine with zero data-shape change; onboarding/
  replay variants render unchanged; `image`/`scale`/`long_text` lone pages still go
  fullScreen. Test: render-variant unit (chrome present for `runner`, absent for
  `onboarding`/`replay`); first-page shows Sign-out not Back; submit shows "Submitting…".

**Step 5 — Wire the blocking-runner host (surface 24, depends on service layer).**
- Host page selects `variant="runner"` when reached via a pending blocking
  `required_action`; pulls `required_actions.title` for BlockingTopBar/RequiredChip;
  reuses `saveBurnerProfile` (burner_profile) and the generic satisfy path for future
  keys. Depends on `upsertBurnerProfile` COALESCE fix (03 Step 3) so a re-submit preserves
  the first `completedAt`, and on `ACTION_ROUTES` mapping (open Q — burner_profile only
  today). Acceptance: pending blocking burner_profile renders the runner chrome; final
  submit satisfies the action and redirects; e2e `onboarding-questionnaire.spec.ts` passes
  in both onboarding and runner-chrome modes. Test: extend e2e to assert the
  BlockingNotice copy + Required chip; reuse `actions.test.ts` typed-error path.

> Each step is independently green-CI-clean (MEMORY: don't strand post-green follow-ups).
> Steps 1–3 are pure re-skin/import churn and can land together; Step 4 introduces the
> NEW chrome; Step 5 is the runner host wiring gated on the service-layer phases.

### Acceptance criteria (cross-cutting)
- No functionality dropped: paging, two-tier validation, progress persistence
  (`persistProgress`), Skip-on-lone-optional, fullScreen single-question pages, Sign-out
  escape, save-failed retry, cross-field `id.number`, all 10 kinds via QuestionField.
- Data shapes unchanged (response value union, catalogue keys); no schema change in this
  organism.
- a11y preserved: `role="alert"` on errors, `*` required marker, `<Label htmlFor>`,
  slider `aria-live="polite"`, segmented `role="radiogroup"/"radio"`.
- Wizard never imports `@camp404/db` or rank/clearance logic; stays `"use client"` UI.

---

## Consumers — which surfaces mount it

| Surface (spec) | Route / host | Variant / props |
|---|---|---|
| **04 Onboarding wizard** | `apps/web/app/onboarding/questionnaire/page.tsx` | `variant="onboarding"`, `persistProgress=true`, `firstStepSignOut`, `submitLabel="Finish"`, `action=saveBurnerProfile`, no `onComplete` |
| **24 Questionnaire runner (blocking)** | same route reached via pending blocking `required_action` (+ future `ACTION_ROUTES`) | `variant="runner"`, blocking chrome (BlockingTopBar/Notice/RequiredChip), `persistProgress=true` (burner_profile), `submitLabel="Submit"`, `blockingTitle` from `required_actions.title` |
| **12 My forms (replay)** | `apps/web/app/tools/forms/[key]/form-replay.tsx` | `variant="replay"`, `persistProgress={false}`, `submitLabel="Save changes"`, `action=saveFormReplay`, `onComplete` → SavedBanner + `router.refresh()` |

Adjacent (not a mount): **S25 Questionnaire gate** (pre-runner splash, surface 23) and
**S27 Questionnaire complete & queue** (post-submit, surface 27) bracket the runner but do
not mount the wizard; the runner satisfies its own `required_action` and lets the gating
spine route on.
