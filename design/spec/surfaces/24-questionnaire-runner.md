# Questionnaire runner (blocking required form) — functional brief

- **Route(s):** `/onboarding/questionnaire` (the required-action / blocking variant). Same physical route as the onboarding wizard host (`apps/web/app/onboarding/questionnaire/page.tsx`); the *blocking chrome* in S26 is the presentation that applies when this route is reached as a **pending blocking `required_action`** (the gating spine in `app/page.tsx` redirects here). Future non-`burner_profile` questionnaires (dietary, agreements) resolve to their own bespoke routes via the `ACTION_ROUTES` registry (`apps/web/lib/required-actions.ts`); the runner *chrome* is the shared template for all of them.
- **Canonical board(s):** `S26 Questionnaire runner` (board #35, 430×-, `design/.spec-extract/boards/35-s26-questionnaire-runner.txt`) for the blocking-gate chrome + footer state matrix; `S05 Field kinds` (board #14, 430×1696, `design/.spec-extract/boards/14-s05-field-kinds.txt`) for the full 10-kind field machine the runner hosts.
- **Brackets (own surfaces, referenced not specced here):** `S25 Questionnaire gate` (board #34 — the pre-runner "Required questionnaire / Start" splash), `S27 Questionnaire complete & queue` (board #36 — the post-submit success + sequential required-queue). The runner is the middle of the trio S25 → **S26** → S27.
- **Superseded / dropped:** The runner board's `DocsSection` ("Other question kinds & states", lines 39–131) is a **documentation gallery, not a screen region** — it is a single static board enumerating the per-state and per-kind card variants for the designer. It is NOT rendered as a scrollable appendix in the app; each block (VALIDATION ERROR / MULTI-SELECT / LONG-TEXT / SCALE / LAST QUESTION / SUBMITTING) maps to a **state of the one `CurrentQuestionCard`**, decomposed below. S26 also draws only 4 of the 10 kinds (single_select-as-radio, multi_select, long_text, scale); the missing 6 (`slider`, `short_text`, `date`, `toggle`, `combobox`, `image`) are NOT dropped — they are owned by the S05 field machine and survive (see Decomposition §2 and Divergences).
- **Breakpoints:** mobile-first 430px (board canonical). The live host constrains content to `max-w-2xl` and grows full-height (`min-h-[100dvh]`). `scale`, `long_text`, and `image` single-question pages flip to a `fullScreen` layout (vertical slider at `70dvh`; textarea `min-h-[40dvh] flex-1`; centred uploader) per `wizard.tsx:149–155`. No separate desktop board exists for the runner; responsiveness is per the field machine (S05 / unit 20).

---

## Purpose

A **blocking, must-finish-before-you-can-use-the-app** questionnaire runner. It is the same paged field-machine as the onboarding wizard, wrapped in *required-action chrome* that makes the obligation unmistakable: a `BlockingTopBar` (title + Required chip + Sign out + progress), a `BlockingNotice` red banner ("You can't use the app until this is finished."), one question card at a time, and a Back/Next→Submit footer. It renders one questionnaire `Question` per step via the shared per-kind field renderer, validates locally before advancing, persists progress (for `burner_profile`) so a reload doesn't lose work, and on final submit satisfies the backing `required_action` and exits.

What makes this surface *distinct from the plain onboarding wizard* is purely the blocking chrome and copy — it is driven by a pending `required_actions` row (`type='questionnaire'`, `blocking=true`) that a captain produced by opening a `questionnaire_activation`. It is the rendered face of one such row. The underlying paging, field rendering, validation, and persistence engine is shared 1:1 with onboarding (no parallel implementation).

---

## Layout & modules (decomposition)

Top-to-bottom the surface is a fixed chrome stack (BlockingTopBar + BlockingNotice) over a scrolling `Body` that holds the single current question card and the footer.

### 1. `BlockingTopBar` (sticky chrome) — NEW component

`vertical w:fill_container gap:14 pad:[16,20] fill:$card stroke:$border`. Two rows:

- **`TitleRow`** — the questionnaire title (`Safety & logistics`, Inter/17/600/`$foreground`, sourced from `questionnaire_activations.title` / `required_actions.title`) + a **`RequiredChip`** + a right-aligned **`Sign out`** link (Inter/13/500/`$accent`, → `/auth/sign-out`).
  - **`RequiredChip`** (NEW): pill `gap:5 pad:[4,9] r:999 fill:$muted stroke:$border` = `⊙ lock ($muted-foreground)` + `T "Required"` (Inter/11/600/`$muted-foreground`). Static label; signals the action cannot be skipped.
- **`ProgressRow`** — `T "Question 3 of 8"` (Inter/12/500/`$muted-foreground`) over a `ProgressTrack` (`h:6 r:3 fill:$muted`) with a `ProgressFill` (`fill:$primary`) sized to `current/total`. The board says "Question N of M" (question-indexed); the live `ProgressBar` (`wizard.tsx:263–278`) renders "Step N of M" with a percentage fill. **Reconcile copy to the board's "Question N of N"** for the blocking runner (it is question-paced, one question per card); fill computation is identical. Position is sticky so the progress and the blocking notice remain visible while the body scrolls.

### 2. `BlockingNotice` (persistent gate banner) — NEW component

`w:fill_container gap:10 pad:[12,20] fill:#f83e5a1a stroke:$destructive` = `⊙ lock ($destructive)` + `T "You can't use the app until this is finished."` (Inter/13/500/`$foreground`). Always present (does not dismiss). This is the affordance that distinguishes the blocking runner from the optional onboarding wizard. `#f83e5a1a` is a destructive tint → reconcile to a `$destructive`-at-10%-alpha token (see Divergences / Open questions).

### 3. `Body` → `CurrentQuestionCard` (the field machine) — hosts shared renderer

`Body` = `vertical gap:24 pad:20`. It contains exactly **one** `CurrentQuestionCard` (`vertical gap:14 pad:18 r:$radius fill:$card stroke:$border`) plus the `Footer`. The card is the runner's host for the shared field renderer (`QuestionField` + `FieldInput`, unit 20 / S05). Per the current question's `kind`, the card body is one of the 10 field controls:

- **Prompt** — `question.prompt` (Inter/16/600/`$foreground`). Note S26 uses 16px in the card vs S05's 14/700 label; the runner card prompt is the larger one-per-screen treatment.
- **Helper** (optional) — `question.helper` (Inter/13/normal/`$muted-foreground`).
- **Required marker** — primary `*` appended to the prompt when `"required" in question && question.required` (`question.tsx:62–64`).
- **Field control** — delegated to `FieldInput`, switch over the 10 kinds (full per-kind spec = unit 20 / S05 brief). The runner board draws four of them directly:
  - **`single_select` rendered as radio rows** (S26 `Options`/`Radio-*`, lines 26–35): one row per option, `gap:12 pad:[13,14] r:$radius`; selected = `fill:#ff008c1a stroke:$primary` + `⊙ circle-dot ($primary)` + label 600 weight; unselected = `fill:$muted stroke:$border` + `⊙ circle ($muted-foreground)` + label normal. (Live code renders `single_select` as a shadcn `Select` dropdown — board wins on the *radio affordance* for this surface; the **kind stays `single_select`**, see Divergences.)
  - **`multi_select`** (S26 `Block-MULTI-SELECT`, lines 63–85): checkbox rows; checked = `fill:#ff008c1a stroke:$primary` + filled box `r:5 fill:$primary` `⊙ check ($primary-foreground)` + label 600; unchecked = `fill:$muted stroke:$border` + empty box `stroke:$muted-foreground`.
  - **`long_text`** (S26 `Block-LONG-TEXT`, lines 86–94): `Textarea h:96 pad:[12,14] r:$radius fill:$muted stroke:$border` with placeholder. Hosts the **DictatePill → RecorderPanel** field-level dictation (S05 line 57–60 `Dictate instead`; decision #5 — field-level voice only). Voice pipeline = S21 / unit 21.
  - **`scale` (1–5)** (S26 `Block-SCALE`, lines 95–115): horizontal `Segments` row, 5 equal segments `h:48`; selected segment = `fill:$primary` + `$primary-foreground`; others `fill:$muted stroke:$border`. `ScaleLabels` row shows the min/max labels (`Not at all` / `Very`). (Live `ScaleField` is a slider with discrete steps; board draws a segmented control — board wins on affordance, kind stays `scale`.)
- The remaining six kinds (`slider`, `short_text`, `date`, `toggle`, `combobox`, `image`) are NOT drawn on S26 but ARE in the catalogue and the field machine; the runner card hosts them identically to S05 when a question of that kind is the current step.

### 4. `Footer` (navigation) — reusable buttons

`w:fill_container gap:12` holding two full-width buttons:

- **`BackBtn`** ⟶ `<Button-Outline>` "Back" — disabled on the first question; on the very first step of the *gate* there is no Back (see Sign out escape hatch in BlockingTopBar — the runner uses the top-bar Sign out as its first-step escape, mirroring `firstStepSignOut`).
- **Primary button** ⟶ `<Button-Primary>` — label is state-driven (the board's footer matrix):
  - mid-form: **"Next"**
  - last question: **"Submit"** (S26 `Block-LAST QUESTION`, line 123)
  - submitting: **"Submitting…"** at `op:0.6`, disabled (S26 `Block-SUBMITTING`, lines 124–131)

### 5. (Not a region) `DocsSection` — designer documentation gallery

Lines 39–131 of S26 are a per-state/per-kind gallery for the designer, NOT an app region. Each labelled block is a state of `CurrentQuestionCard` (decomposed in States). Do not build it as on-screen content.

---

## Components used (reusable + new)

| Component | Role | Key props / variants |
|---|---|---|
| `Button` (`@camp404/ui/button`) | Back (outline/ghost) + primary Next/Submit | `variant="default"` (primary), `variant="outline"`/`"ghost"` (back); `disabled` while pending |
| `QuestionField` (`apps/web/components/questionnaire/question.tsx`) | Label + helper + required `*` + error wrapper around the control | `question`, `value`, `onChange`, `error`, `fullScreen` |
| `FieldInput` (same file) | Per-kind control switch (10 kinds) | discriminated on `question.kind` |
| `ToggleField` / `ScaleField` / `LongTextField` (same file) | Sub-renderers for `toggle` / `scale` / `long_text` | local to renderer |
| `Combobox` (`@camp404/ui/combobox`) | `combobox` kind | `options`, `value`, `onChange`, `placeholder`, `searchPlaceholder` |
| `Slider` (`@camp404/ui/slider`) | `slider` + `scale` kinds | `orientation`, `min`/`max`/`step` |
| `Select` (`@camp404/ui/select`) | live `single_select` (board overrides to radio rows) | placeholder "Choose one…" |
| `Checkbox` / `Label` / `Input` / `Textarea` | multi_select / labels / short_text + date / long_text | shadcn primitives |
| `AvatarUpload` (`apps/web/components/profile/avatar-upload.tsx`) | `image` kind | `value`, `onChange`, `uploading` |
| `RecorderPanel` (`apps/web/components/voice/recorder-panel.tsx`) | field-level dictation inside `long_text` | `promptKey="questionnaire"` |
| `QuestionnaireWizard` (`apps/web/components/questionnaire/wizard.tsx`) | the paging/validation/persistence engine that drives the runner | `questionnaire`, `initialResponses`, `action`, `persistProgress`, `firstStepSignOut`, `submitLabel` |

**New components introduced by this surface (the blocking chrome, not yet in `@camp404/ui` and not among the 10 canvas reusables):**

- **`BlockingTopBar`** — sticky `$card` header: title + `RequiredChip` + Sign out + `ProgressRow`. Reusable across all blocking questionnaire runners (burner / dietary / agreements).
- **`BlockingNotice`** — persistent destructive-tint banner: "You can't use the app until this is finished."
- **`RequiredChip`** — lock-icon "Required" pill (reusable wherever a required/blocking obligation is labelled, e.g. the S27 queue rows).
- **`InlineAlert`** (validation) — in-card destructive-tint alert (`⊙ circle-alert` + "Please answer to continue."), the per-card validation presentation (today the renderer puts errors *under* the field via `error` prop; the runner card surfaces the page/field validation as this in-card alert — reconcile, see Divergences).

No other canvas reusables (`TopChrome`, `SectionHeader`, `DetailHeader`, `GridTile`, `EmptyState`, `CaptainLock`) are used — the runner deliberately replaces normal app chrome with the blocking chrome (you are *behind* the app, not in it).

---

## States — full matrix

| State | Presentation |
|---|---|
| **Empty (unanswered current question)** | Card renders the unfilled control for its kind (`single_select`→no radio selected / "Choose one…"; `multi_select`→all unchecked; `long_text`→placeholder textarea; `scale`→middle step pre-highlighted but uncommitted; per S05 for the other 6 kinds). Primary button = "Next" and is **enabled** (validation runs on press, not on entry). |
| **Populated** | Control reflects the stored `responses[question.id]`; selected radio/check/segment styled `$primary`; textarea filled; etc. |
| **Validation-error** | S26 `Block-VALIDATION ERROR` (lines 43–62): an `InlineAlert` appears inside the card above the options (`⊙ circle-alert ($destructive)` + "Please answer to continue.", or the kind-specific message from `validateOne`/`validatePageLocally`), and the offending field is reset to its un-selected styling. Per-field message comes from the renderer's `error` prop (`question.tsx:78–82`); page/save-level (`_form`/`_root`) errors render in a banner near the top, not in the card. |
| **Loading (route mount)** | Server component (`force-dynamic`) resolves auth + invite access + `getBurnerProfile` + `getIdDocuments` before render; no client skeleton. (For non-burner questionnaires the activation/required-action + any prior responses load server-side similarly.) |
| **Submitting** | S26 `Block-SUBMITTING` (lines 124–131): on the **last** question, pressing Submit enters `isPending` (React `useTransition`) — primary button label flips to "Submitting…" at `op:0.6` and is disabled; Back is disabled. Fields are NOT disabled mid-submit (matches live wizard). Sub-state: `image` upload has its own "Uploading…" spinner (AvatarUpload), `long_text` dictation has requesting/recording/processing states (RecorderPanel). |
| **Success** | No in-runner success card — on final submit the backing action **redirects** (`burner_profile` → `/`); the post-submit success + queue UI is the *separate* `S27` surface. (If the redirect resolves the last blocking action, `/` renders the home control panel; if more blocking required-actions remain, the gating spine routes to the next — S27's "MORE REQUIRED" variant is the visible bridge.) |
| **Disabled** | Back disabled on first question and while `isPending`; primary disabled while `isPending`. Individual fields are not independently disabled. |
| **Last question** | S26 `Block-LAST QUESTION` (lines 116–123): card may carry a "final question — review your answers, then submit" helper; primary label = "Submit". |
| **Gating context (why this surface is even mounted)** | This surface IS a gate. It is reached only because the user has a pending blocking `required_action`. The surrounding gating order (`app/page.tsx`): unauth → Landing; no invite → `/signup/required`; **pending blocking required-action → this runner**; profile incomplete (legacy fallback) → this runner; not approved → `/pending-approval`. So the runner sits *between* invite-gate and approval-gate. |
| **Not-applicable gating states** | **Invite-gated / onboarding-incomplete:** the runner is rank-agnostic and identity-only; it never shows captain/rank previews. **Pending/rejected approval:** handled by `/pending-approval`, a different surface reached *after* this one. **Preview-but-locked (decision #3):** does NOT apply — this is not a captain/rank surface; there is no `CaptainLock` variant. The runner returns real data for *its own* user only. |
| **Empty queue / nothing required** | If no pending blocking required-action maps to a route, the user is never routed here (the gating spine falls through to home). There is no "no questionnaires" state inside the runner. |

---

## User actions — each action → result

| Action | Result |
|---|---|
| Answer the current field (tap radio / toggle checkbox / type / drag slider / pick scale segment / pick date / select combobox / upload image) | `onChange` updates `responses[question.id]`; any existing error for that field is cleared (`setResponse`, `wizard.tsx:69–77). |
| Tap **Dictate instead** (long_text) | Reveals `RecorderPanel`; each completed transcript **appends** to the textarea (joined with `\n`, capped to `maxLength`); can mix typing + dictation (decision #5). |
| Tap **Next** | Runs `validatePageLocally` on the current question; on failure shows `InlineAlert` + field error and stays. On pass: if `persistProgress` (burner_profile) calls the save action with `final=false` (persists progress, splits PII, returns), then advances; else advances locally. |
| Tap **Back** | Decrements the question index (no save); disabled on the first question. |
| Tap **Submit** (last question) | Validates the page, then calls the save action with `final=true`. Server runs full `validateResponses`; on field errors returns them (re-shows in card); on success marks the domain table complete, **satisfies the `required_action`** (`satisfyBurnerProfileAction` / generic equivalent), and **redirects** out of the runner. |
| Tap **Sign out** (top bar) | Navigates to `/auth/sign-out` — the escape hatch for someone signed in with the wrong account before anything is created (mirrors `firstStepSignOut`). |
| Save action throws (DB outage / encryption misconfig) | A page-level `_form` error banner appears ("We couldn't save your answers just now… let a camp captain know."); the user stays on the page and can retry; nothing is silently swallowed (`wizard.tsx:117–122, 143–145`). |

---

## Data & enums — mapped to `schema.ts`

The runner is the rendered face of a `required_actions` row; submitting writes a **domain table** and flips the row to `completed`.

- **`required_actions`** (schema.ts:570–609) — the row that mounts this surface. `type: required_action_type` enum (`questionnaire` | acknowledgement | payment | profile_update); `actionKey` (e.g. `"burner_profile"`, future `"dietary_requirements"`, `"driver_profile"`); `version` (the catalogue version the user must satisfy — an older completion re-opens the gate); `activationId` → the activation that produced it; `title` (drives the BlockingTopBar title); `blocking`; `status: required_action_status` (`pending` | `completed` | `waived` | `expired`); `dueAt`. Unique `(user_id, action_key)` so re-activation upserts in place.
- **`questionnaire_activations`** (schema.ts:472–502) — the captain's act of requiring the questionnaire. `questionnaireKey`, `version`, `title`, `description`, `scope: questionnaire_scope` (`everyone` | `team` | `team_leads` | `individual` | `opt_in`), `team`, `blocking`, `status: activation_status` (`draft` | `open` | `closed`), `dueAt`, `activatedByUserId`, `openedAt`/`closedAt`. `openActivation` (activations.ts) fans out one `required_actions` row per matched member.
- **`questionnaire_activation_targets`** (schema.ts:505–518) — explicit recipients for `scope='individual'`.
- **`burner_profiles`** (schema.ts:352–364) — the domain table the *burner_profile* runner writes: `userId` (PK), `version`, **`responses: jsonb<Record<string,unknown>>`** keyed by catalogue question `id`, `startedAt`, `completedAt` (set on final submit), `updatedAt`. One row per user; persists across the yearly reset.
- **Other domain tables the runner template will write for future activations:** `dietary_requirements` (schema.ts:372–386), `driver_profiles` (schema.ts:393–420) — same satisfy-on-complete pattern, different table.
- **PII split-out** (`apps/web/lib/users.ts` / `@camp404/db/id-documents`): `id.number` is stripped from `responses` at every write boundary (`splitIdNumber`) and stored encrypted on `users.passport_encrypted` / `users.sa_id_encrypted` (schema.ts:241–242), keyed by `id.type`. `id.type` and `birthday` stay in `responses`. Decryptable only by owner + captains.
- **Profile image mirror:** `responses["profile.image"]` is mirrored to `users.profileImageUrl` on every save (progress + final) so headers/profile read it cheaply.
- **Question kinds enum** (`packages/types/src/questionnaire.ts:137–149) — 10: `slider | single_select | multi_select | short_text | long_text | date | scale | toggle | combobox | image`. Response value union = `number | string | string[] | boolean | null` (`boolean` is vestigial — no kind emits it).
- **Catalogue version** = `"2026.05.29-v8"` (`apps/web/lib/questionnaire.ts:60`); pages, options, ranges, TEAMS (8), DIETARY_INGREDIENTS (12), COUNTRY_OPTIONS all live in code and are versioned.

**NEW schema:** **none.** The blocking runner is fully expressible on existing tables (`required_actions` + `questionnaire_activations` already model the obligation; per decision #4 the only schema change in the whole redesign is `captain_promotion_requests`, which is unrelated to this surface). The multi-questionnaire sequential queue (Safety / Dietary / Agreements, S27) is **app logic over existing `required_actions`** — no schema change (decisions.md "Questionnaire trio").

---

## Validation & edge cases

- **Two-tier validation:** wizard-local pre-check before advancing (`validatePageLocally`, wizard.tsx:79–101) — required-and-missing → "This question is required"; server-authoritative `validateResponses`/`validateOne` (`packages/types/src/questionnaire.ts:324–436) on final submit (and on progress saves). Server drops unknown response keys and drops optional-empty fields.
- **Cross-field `id.number`:** if present and non-empty, `validateIdNumber(responses["id.type"], value)` runs (SA-ID 13-digit + YYMMDD + SA-Luhn variant, or passport `[A-Z0-9]{6,12}`). **EDGE / source bug:** this rule is client/wizard-only — server validates `id.number` merely as `short_text ≤ 40 chars`, so an invalid-but-short document number passes server validation and persists. Flag, don't patch (per house policy).
- **EDGE / source bug — `date`:** `validateOne` enforces `/^\d{4}-\d{2}-\d{2}$/` + `Date.parse`, but `Date.parse` rolls day-overflow (e.g. `2026-02-31`) into the next month rather than rejecting it. Document.
- **Progress persistence:** `burner_profile` uses `persistProgress=true` — each Next saves so a reload mid-questionnaire keeps answers. (Replay flow uses `false`; not this surface.)
- **Save failure:** thrown action → `_form` banner + retry, never a stuck silent page.
- **`multi_select` indeterminate:** any checkbox state other than literal `true` falls to the delete branch (question.tsx:159–162).
- **`slider` / `scale` untouched:** read as `min` / middle step but only commit on interaction.
- **`fullScreen` pages:** single `scale`/`long_text`/`image` question fills the viewport (vertical slider, growable textarea, centred uploader).
- **Reload / resume:** route re-resolves server-side; pre-fill merges decrypted `id.number` back in (owner-only path, page.tsx).
- **Already-complete:** if `burner_profiles.completedAt` is set, the route redirects to `/` (you can't re-enter the gate). For a *re-activated* version (newer `required_actions.version`), the gate re-opens.
- **Accessibility:** error line `role="alert"`; required marker via `*`; field labels via `<Label htmlFor>`; live value echo on slider `aria-live="polite"`; segmented toggle `role="radiogroup"`/`role="radio"`. Preserve these.

---

## Flows

```
[gating spine: app/page.tsx]
  pending blocking required_action (type=questionnaire) → redirect to runner route
    → (burner_profile) /onboarding/questionnaire   ← THIS surface (blocking chrome)

[S25 gate] "Start questionnaire" ──▶ [S26 runner]
   ▸ render BlockingTopBar (title · Required · Sign out · progress)
   ▸ render BlockingNotice ("can't use the app until finished")
   ▸ render CurrentQuestionCard for question[i] via shared field machine
        ├─ Next → validate → (persistProgress) save(final=false) → i+1
        ├─ Back → i-1 (disabled at i=0)
        └─ Submit (last) → validate → save(final=true)
                              ├─ field errors → re-show in card
                              ├─ throw → _form banner + retry
                              └─ ok → satisfy required_action → REDIRECT out
   ▸ Sign out (top bar) → /auth/sign-out  (escape hatch)

[after redirect]
  more pending blocking required_actions? ──▶ next runner (or S27 "MORE REQUIRED")
  none remaining ──▶ / (home control panel)   [or S27 "ALL DONE" → "Back to camp"]
```

Full multi-questionnaire queue ordering and the S27 success/queue UI are specced on the S27 surface; the runner's only queue responsibility is to satisfy its own action and let the spine route on.

---

## Divergences from feature-set reference (resolution per locked decisions)

| Signal | Board / live | Resolution |
|---|---|---|
| Reference unit 20 describes the renderer as **optional-tolerant**, mounted by both onboarding and replay; no blocking chrome | Board S26 adds `BlockingTopBar` + `BlockingNotice` + `RequiredChip` (the blocking-action chrome) | **Board wins.** The blocking chrome is the surface's whole reason to exist. The *engine* (QuestionnaireWizard + field machine) is reused unchanged; only the chrome + copy differ. New components: BlockingTopBar / BlockingNotice / RequiredChip. |
| Live `single_select` = shadcn `Select` dropdown (question.tsx:128–145); `scale` = `Slider` (question.tsx:297–403) | Board S26 draws `single_select` as **radio rows** and `scale` as a **segmented control** | **Board wins on drawn affordance** (decisions.md: "boards win on drawn affordance — segmented scale, switch toggle — but the underlying kind must survive"). Keep kinds `single_select` / `scale`; re-skin their controls to radio / segmented. Do NOT change the data shape. |
| Live renderer surfaces validation **under the field** via `error` prop (question.tsx:78–82) | Board draws an in-card **`InlineAlert`** above the options ("Please answer to continue.") | Adopt the board's in-card `InlineAlert` as the runner's validation presentation; keep the per-field `error` text as the message source. Both can coexist (alert = card-level, error = field-level). |
| Live progress reads **"Step N of M"** (page-indexed) with % fill | Board reads **"Question N of N"** (question-paced) | Board wins for the blocking runner (one question per card → question-paced). Reconcile copy; fill math unchanged. |
| Reference: voice via `RecorderPanel` embedded in `long_text` | Board S05 draws "Dictate instead" on `long_text` only | Matches decision #5 (field-level dictation only; no home mic). No divergence. |
| S26 draws only 4 of 10 kinds | S05 + catalogue define all 10 | The other 6 kinds are NOT dropped — S26 is a representative gallery; the runner hosts whichever kind the current question is. Spec all 10 via the shared field machine. |
| Board tints use raw hex `#f83e5a1a` (destructive 10%) and `#ff008c1a` (primary 10%) | Live uses `var(--color-destructive)/10`, `--color-primary` | Reconcile raw tints to semantic-token alphas (decisions.md "Tokens": add status tokens, no raw hex). Document; not a behaviour change. |
| Reference: server `force-dynamic`, PII split, profile-image mirror, progress save | Board shows none of this (visual only) | Functional behaviour from live code; carried into spec. No conflict. |
| decisions.md: "Onboarding OB Step 01–11 supersedes S04" | This is the *blocking required-action* variant, not the OB step pages | The runner and OB steps share the same engine + catalogue. The runner is the chrome applied when reached as a blocking required-action; OB pages are the friendlier per-step onboarding presentation. Both 1:1 to v8 catalogue → no schema change. Flag the OB hardware-competency gap as a content question (below), inherited from decisions.md. |

No functionality implied by the boards or the reference contract is dropped.

---

## Open questions / build reconciliations

1. **Sequential required-queue (scope expansion).** S27 implies a *sequential* unlock across multiple required questionnaires (Safety → Dietary → Agreements). decisions.md confirms this is expressible via the existing `required_actions` engine with **no schema change** and flags it as a **scope expansion to confirm**. Confirm with product whether the queue ships now (multiple blocking activations chained) or only the single burner_profile gate exists day-one. The runner template is queue-agnostic either way (it satisfies its own row and lets the spine route on).
2. **`ACTION_ROUTES` only maps `burner_profile` today** (`apps/web/lib/required-actions.ts:7–11`). Dietary / driver / agreements activations stay `pending` but cannot gate until their bespoke runner routes exist. Confirm whether those routes are in scope for this redesign or remain deferred (they reuse this exact runner chrome).
3. **Progress copy** — "Question N of N" (board) vs "Step N of M" (live). Adopt board wording; confirm no analytics depends on the live string.
4. **In-card `InlineAlert` vs under-field error** — adopt both (card-level alert + field-level message) or just one? Recommend both per the board; confirm.
5. **Token reconciliation** — `#f83e5a1a` / `#ff008c1a` raw hex → introduce `--color-destructive`/`--color-primary` alpha utilities (and the `success/warning/info` status tokens decisions.md calls for). Cosmetic, batchable across surfaces.
6. **Source bugs to carry as known issues (not patch here):** (a) `id.number` SA-ID/passport rule is client-only — server accepts any ≤40-char string; (b) `date` `Date.parse` accepts impossible calendar dates (e.g. `2026-02-31`). Flag to the data owner; document, don't silently fix.
7. **OB hardware-competency gap (inherited)** — catalogue has `competency.hardware` but no OB board for it; decisions.md treats it as a content question ("does onboarding still capture hardware/building competency?"). The blocking runner would still render it if it's in the active catalogue version; confirm whether the question stays.
8. **`team_interest` range drift (inherited)** — OB Step 06 draws sliders 0–6, catalogue is 0–5; reconcile one constant (does not change this surface's behaviour, but the same field machine renders it).
9. **First-question Back vs Sign out.** The runner uses the top-bar Sign out as its escape hatch; confirm Back is simply disabled on question 1 (matching `firstStepSignOut`) rather than offering a second sign-out in the footer.
