# Onboarding wizard — functional brief

- **Route(s):** `/onboarding/questionnaire`
- **Canonical board(s):** `OB Step 01 Profile photo` … `OB Step 11 Dietary` (boards 39–49). These 11 per-step boards are the canonical visual source.
- **Superseded-or-dropped:** `S04 Onboarding wizard` (board 13) is **SUPERSEDED** — it is a single scrollable spec sheet showing all pages stacked plus an isolated "Footer & states" matrix. Read it ONLY to port (a) its footer-state matrix (page-0 / middle / last / submitting / inline-error / error-banner / save-failed) onto the per-step pages, and (b) its mono "Step N of M · NN%" progress label treatment. Do NOT carry over its card-stacked layout or its 12th page being missing from the OB set (see hardware gap below).
- **Breakpoints:** mobile-first, 430px. Boards are drawn at 600px (S04 at 620px) but use `w:fill_container` throughout, so they collapse to the 430px column. Per build-reconciliation, the live page wraps in `max-w-2xl` (wider than the global `max-w-lg`) — keep that single responsive column; there is no separate desktop layout.

---

## Purpose

The mandatory **burner-profile questionnaire** shown immediately after sign-up. It is the `burner_profile` blocking required-action: the global gating spine routes any signed-in, invite-bearing user with an incomplete profile here, and completing it satisfies the gate and releases the app.

It is a **page-at-a-time wizard**: one client step machine (`QuestionnaireWizard`) drives a catalogue-defined sequence of pages (one `intro` interstitial + 11 question pages in the live catalogue), validating each page locally before advancing, **persisting progress on every Next** (onboarding mode), and on final submit running full server-side validation, splitting the government ID number into encrypted `users` columns, mirroring the profile photo onto `users.profile_image_url`, marking the profile complete, satisfying the gate, and redirecting home.

The same `QuestionnaireWizard` is reused by the replay/edit flow (a separate surface) with different props; this brief specs the **onboarding configuration** (`persistProgress=true`, `firstStepSignOut=true`, `submitLabel="Finish"`, no `onComplete`).

---

## Layout & modules (decomposition)

Every step board shares the same skeleton, so the wizard is one shell with a swappable page body. Decomposition:

### 1. Wizard shell (`page.tsx` + `QuestionnaireWizard`)
Vertical container, dark, 430px column. Fixed regions top-to-bottom: **Header → Progress → page body (scrolls) → Footer**. Padding per board `[22,18,30,18]`; `gap:22`. Background `$background`.

### 2. Header (constant on every step)
- H1: "Build your burner profile" `[Inter/24px/700/$foreground]` (S04 draws 26px — use the OB 24px).
- Subtitle: "A few questions so the camp knows who's arriving in the dust. Takes about two minutes." `[Inter/14px/$muted-foreground]`.
- This copy is rendered by the **server page** above the wizard (per the reference), so it is part of the surface chrome, constant across steps.

### 3. Progress (constant; reflects current step)
- Label "Step N of 11" `[Inter/12px/600/$muted-foreground]` (some OB boards drift to 13px/normal — normalise to 12px/600).
- Track `{w:fill h:6 r:999 fill:$muted}` with `Fill {r:999 fill:$primary}` whose width = `(current/total)·trackWidth`.
- **Port from S04:** a right-aligned mono percentage in the label row — `Step N of M` (left, `JetBrains Mono/12px/$muted-foreground`) and `NN%` (right, `JetBrains Mono/12px/$accent`). The OB boards omit the percent; adopt S04's `ProgressLabelRow` two-up treatment. NOTE the **total mismatch** (S04 shows "Step 2 of 12"; OB boards show "of 11") — see hardware gap; total must derive from `questionnaire.pages.length`, never a literal.

### 4. Page body (the only region that changes per step)
Centred or top-aligned `QuestionBlock`. Each live page maps to exactly one board:

| Step (board) | Page id (`questionnaire.ts`) | kind | Body sub-component(s) |
|---|---|---|---|
| 01 Profile photo | `profile_photo` | questions | **AvatarUpload** (camera circle + "Upload a photo") — 1 image question, optional |
| 02 About you | `about_you` | questions | **DateControl** (birthday), **InputField** (phone), **Combobox** (country + search popover), **Segmented toggle** (ID type), **InputField** (ID number) + "Encrypted — stored securely." helper |
| 03 A bit about you | `bio` | questions | **LongTextField** + **DictatePill** (required bio) |
| 04 Burn ideas | `burn_ideas` | questions | TitleWrap "Optional" + **LongTextField** + **DictatePill** (optional) |
| 05 Team interests intro | `team_interests_intro` | intro | **IntroInterstitial** (sparkles IconBadge + heading + body), no inputs |
| 06 Team interests | `team_interests` | questions | 8 × **ScaleRow** (team name + 0–N segmented control + "Not for me"/"Sign me up" labels) |
| 07 Cooking competency | `cooking_competency` (+`hardware_competency`) | questions | 2 × **RadioCardGroup** (cooking; hardware — see gap) |
| 08 Leadership & logistics | `leadership_logistics` | questions | **CheckboxCardGroup** (lead teams) + 3 × **RadioCardGroup** (driving / onsite-before / staying-after) |
| 09 Burn history | `burn_history` | questions | **CheckboxCardGroup** (years) + **RadioCardGroup** (AB count) + **Textarea** (other burns) |
| 10 Burn intent | `burn_intent` | questions | **RadioCardGroup** (6 likelihood options) |
| 11 Dietary | `dietary` | questions | 2 × **CheckboxChipGrid** (dislikes / allergies, 2-col) + **Textarea** (notes) |

### 5. Footer (constant slot, state-driven contents)
`{w:fill jc:space_between ai:center}`. Left slot = Back OR Sign-out; right slot = Skip / Next / Finish (+ Saving…). Full state matrix in **States** below. **Port the S04 footer matrix verbatim** onto each per-step page.

#### Page-body sub-components (detailed)

- **AvatarUpload (step 01):** `AvatarCircle {120×120 r:999 fill:#1d133380 stroke:$border}` containing a `camera` lucide icon; below it "Upload a photo" `[Inter/14px/600/$accent]` as the tap target. Title "Add a profile photo" + "Optional" subtitle, centred. (S04 adds helper "A clear photo of your face works best." — keep as the question helper.) Maps to `profile.image` (kind `image`). Tapping opens the device file picker / avatar-upload flow; selected image stored as a URL.
- **DateControl (step 02):** `{h:46 r:$radius fill:$muted stroke:$border}` showing placeholder "dd / mm / yyyy" + `calendar` icon; backed by `<input type="date">` (kind `date`, ISO `yyyy-mm-dd`). Populated example "1994-07-12".
- **Combobox + popover (step 02):** trigger row "Pick your country…" + `chevron-down`; popover with sticky `SearchRow` ("Search countries…" + search icon) and option rows (flag emoji + name, `check` on the selected). Selected row tinted `#ff008c22`. Built from `COUNTRY_OPTIONS` (label = flag + name; **stored value = ISO alpha-2 code**).
- **Segmented toggle (step 02 ID type):** `Segmented {h:46 r:$radius fill:$muted}` with two equal segments; selected segment `fill:$primary` + `$primary-foreground` text. Values `passport`="Passport", `sa_id`="South African ID" (kind `toggle`).
- **LongTextField + DictatePill (steps 03, 04):** `PillRow {jc:end}` containing **DictatePill** (`mic` icon + "Dictate instead", `r:999 fill:$muted stroke:$border`), above a `Textarea {h:210 r:$radius fill:$muted stroke:$border}`. Per locked decision 5, the pill opens the **RecorderPanel** (S21); transcript appends to the field. Step 03 bio required; step 04 ideas optional.
- **IntroInterstitial (step 05):** centred `IconBadge {72×72 r:999 fill:#ff008c14}` + `sparkles` ($primary); heading `[Inter/24px/700]`; body `[Inter/15px/$muted-foreground]`. No inputs; footer Back/Next. (Board heading/body copy differs slightly from catalogue body — boards win on visible copy; reconcile, see Divergences.)
- **ScaleRow (step 06):** team label `[Inter/14px/600]`; a horizontal **Scale** of equal-width segments `{h:40 r:$radius}` each labelled with its number; selected segment `fill:$primary` + `$primary-foreground`, rest `fill:$muted`; below, a labels row "Not for me" / "Sign me up". **Boards draw segments 0–6 (7 segments); catalogue slider is 0–5** — see Divergences. Underlying kind is `slider` (S04 confirms a real slider rendering with a mono value badge); the board's segmented control is a presentation variant of the same kind.
- **RadioCardGroup (steps 07,08,10 + AB-count on 09):** stacked option cards `{pad:[14,16] r:$radius}`; selected card `fill:$card stroke:$primary` with a filled `Radio {r:999 stroke:$primary}` + 8px dot; unselected `fill:transparent stroke:$border`, empty radio. One selection per group. Maps to kinds `scale` (cooking/hardware/intent) and `single_select` (driving/onsite/AB-count). Step 10 selected card additionally tints `fill:#ff008c14`.
- **CheckboxCardGroup (steps 08 lead-teams, 09 years):** stacked rows `{pad:14 r:$radius}`; checked row `stroke:$primary` + filled `Checkbox {r:6 fill:$primary}` with `check` icon; unchecked `stroke:$border` empty box. Multi-select; kind `multi_select`.
- **CheckboxChipGrid (step 11):** 2-column grid of compact chips `{pad:[10,12] r:$radius fill:$muted stroke:$border}` each with an 18px `box {r:5}` + label `[Inter/13px/500]`; checked chip `fill:#ff008c14 stroke:$primary` + filled box with `check`. Two grids (Dislikes, Allergies) over the same 12-ingredient list (`DIETARY_INGREDIENTS`); kind `multi_select`.
- **Textarea (steps 09 other-burns, 11 notes):** plain `{h:120 r:$radius fill:$muted stroke:$border}`, `long_text`, no DictatePill drawn on these (only steps 03/04 show it).

---

## Components used (reusable + new) — name · role · key props/variants

**Reusable / shared (existing):**
- **Button-Primary** — right-slot footer action · variants by label: `Next` / `Skip` / `Finish` / `Saving…` (disabled, op~0.6). (`packages/ui` `button.tsx`.)
- **Button-Outline** — left-slot footer action · labels `Back` / `Sign out`; disabled state op~0.5. (`button.tsx`.)
- **InputField** — labelled text input · used for Phone and ID number (overrides: label + placeholder). (Wraps `input.tsx` + `label.tsx`.)
- **Combobox** — searchable country select with popover. (`combobox.tsx` + `command.tsx` + `popover.tsx`.)
- **Slider** — underlying control for `team_interest.*`. (`slider.tsx`.)
- **Checkbox** — multi-select rows/chips. (`checkbox.tsx`.)
- **Textarea** — long-text fields. (`textarea.tsx`.)
- **Select** — current live renderer for `single_select` (boards draw radio cards instead — see Divergences). (`select.tsx`.)
- **Avatar** — display of an uploaded photo. (`avatar.tsx`.)
- **DictatePill / RecorderPanel** — field-level voice dictation on `long_text` (S21). (`apps/web/components/voice/`: `dictate-button.tsx`, `recorder-panel.tsx`, `waveform.tsx`, `use-voice-recorder.ts`.)
- **QuestionnaireWizard** — the shared step machine (default export, `apps/web/components/questionnaire/wizard.tsx`). Props: `questionnaire`, `initialResponses`, `action`, `persistProgress` (default true), `firstStepSignOut`, `submitLabel` (default "Finish"), `nextLabel`, `onComplete`.
- **QuestionField** — per-kind field renderer (`apps/web/components/questionnaire/question.tsx`); contains `ScaleField`, `ToggleField`, `LongTextField`, slider/select/date/image branches; receives `value`, `onChange`, `error`, `fullScreen`.
- **ProgressBar** — bar + "Step N of M" text (private fn in `wizard.tsx`).

**New / to add or extend:**
- **ProgressLabelRow (extend ProgressBar)** — add the right-aligned mono `NN%` (`$accent`) next to "Step N of M" per S04.
- **ScaleRow segmented variant (extend ScaleField/slider renderer)** — render the `team_interest` sliders as the board's 0–N segmented control (NEW presentation; keep kind `slider`). Resolve the 0–6 vs 0–5 range first.
- **RadioCardGroup (NEW renderer for `single_select` / `scale`)** — the board's stacked radio-card affordance; replaces the live `<Select>` dropdown for `single_select` on these pages. The `scale` kind already renders as option cards (`ScaleField`) — confirm parity.
- **CheckboxChipGrid (NEW renderer variant for `multi_select`)** — the 2-col chip grid used only on the dietary page (other multi-selects use stacked checkbox cards).
- **page-level ErrorBanner / SaveFailedBanner / InlineFieldError** — ported from S04's footer-state matrix (see States).

---

## States — every state/variant

**Global state matrix (applies to this surface):**
- **Empty** — first visit, no saved profile: `initialResponses = {}`; every field unanswered; page 0 = optional profile photo.
- **Loading** — the server component awaits session → camp-user → profile → decrypted ID before first paint; **no client spinner** — the wizard mounts already hydrated. (Treat any pre-paint gap as server render time.)
- **Populated** — returning incomplete user: `profile.responses` pre-fills fields; decrypted `id.number` / `id.type` merged back in (the ID number lives encrypted on `users`, not in `responses`). Progress is saved on every Next, so a partially filled signup survives reload.
- **Validation-error** — two presentations, both ported from S04:
  - **Inline field error** — `circle-alert` ($destructive) + "This question is required" `[Inter/13px/$destructive]` beneath the offending field. Sourced from `validatePageLocally` (per-field) and from server per-field errors on final submit.
  - **Page-level error banner** — `role="alert"`, `{r:$radius fill:#f83e5a2e stroke:$destructive}`, `triangle-alert` icon + "Some answers need a look before you continue." Shown for `_form` / `_root` keys.
- **Submitting / pending** — `isPending` (from `useTransition`) disables Back AND the right action; Back op~0.5, primary shows "Saving…" op~0.6. Covers both Next-progress saves and final submit.
- **Success** — onboarding has **no client success UI**: the server action `redirect("/")` after `markComplete` + gate satisfaction; the completion gate then bounces any re-entry home.
- **Disabled** — Back disabled on page 0 and while pending; right action disabled while pending.
- **Save-failed banner** — `{r:$radius fill:#f83e5a2e stroke:$destructive}`, `cloud-off` icon + "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know." Shown when the save action throws or returns `_form`; user stays on the page and can retry.

**Footer state matrix (ported from S04 `FooterAndStates`):**
| Variant | Left slot | Right slot |
|---|---|---|
| **page 0** | Sign out (Button-Outline) | Next (Button-Primary) — or **Skip** if the lone optional photo is unanswered |
| **middle page** | Back (Button-Outline) | Next (Button-Primary) — **Skip** label when the page is a lone unanswered optional |
| **last page (step 11)** | Back (Button-Outline) | Finish (Button-Primary) |
| **submitting** | Back disabled (op 0.5) | Saving… disabled (op 0.6) |

S04 also draws a "Skip" text link beside Next on its middle-page variant. The live behaviour folds Skip INTO the same right-slot button (label flips to "Skip" for a lone unanswered optional and still calls Next). Use the single-button behaviour; the separate text link is an S04 artefact.

**Gating states:**
- **Invite-gated** — `hasCampAccess` false → `redirect("/signup/required")`, enforced in BOTH the page and the save action (defence in depth). `hasCampAccess = isGodEmail(email) || !!user.inviteCode`.
- **Onboarding-incomplete** — this surface IS the gate; the gating spine routes incomplete users here; completing satisfies the `burner_profile` required-action.
- **Already-complete** — `page.tsx` redirects to `/` if `profile.completedAt` is set; you cannot reopen onboarding (replay/edit is a different surface).
- **Pending / rejected approval** — NOT enforced inside this surface. The post-completion redirect to `/` re-enters the gating spine, which then routes pending → `/pending-approval`, rejected → terminal. `users.approval_status` is checked downstream, not here.
- **Preview-but-locked (rank gating)** — **N/A.** Onboarding is per-user (the signed-in member); there is no rank-gated content, so locked decision 3's CaptainLock treatment does not apply to this surface.

There are NO offline/sync states and NO budget/over-target states.

---

## User actions — each action → result

- **Answer a question** → `QuestionField.onChange` → `setResponse(id, value)`; immediately clears that field's inline error.
- **Upload / skip photo (step 01)** → tap "Upload a photo" opens the file picker; selected image stored as a URL in `profile.image`; mirrored to `users.profile_image_url` on the next save. Optional — Next label is "Skip" when empty.
- **Pick country (step 02)** → open popover, type to filter, select → stores ISO alpha-2 code; popover closes; trigger shows flag + name.
- **Toggle ID type (step 02)** → flips `id.type` between `passport` / `sa_id`; switching later **moves** any encrypted ID value to the matching column (the other is NULLed).
- **Dictate (steps 03/04)** → tap DictatePill → RecorderPanel (mic + waveform + timer); on stop, transcript appends to the host long-text field.
- **Adjust team interest (step 06)** → set each team's level; default = min (0) when untouched ("no preference").
- **Next** → `validatePageLocally`; if invalid, show inline errors and stop. If valid + `persistProgress` (onboarding): call `action(responses, false)` in a transition — `{ok:false}` sets errors and stays; `{ok:true}` advances; thrown sets `_form = SAVE_FAILED`. Enter key also triggers Next on non-last pages.
- **Skip** → same control as Next (label flip for a lone unanswered optional); still saves progress and advances.
- **Back** → `setPageIndex(max(0, i-1))`; no save, no validation; disabled on page 0 and while pending.
- **Sign out (page 0 only)** → plain `<a href="/auth/sign-out">` escape hatch for someone signed in with the wrong account before anything is created.
- **Finish (step 11)** → `validatePageLocally`; on pass call `action(responses, true)`: full server validation, split+encrypt ID, upsert with `markComplete`, mirror photo, satisfy gate, `redirect("/")`. `{ok:false}` sets errors and stays; thrown sets `_form = SAVE_FAILED`.

---

## Data & enums — mapped to schema.ts (NEW marked)

**Tables written/read (NO new table for this surface):**
- **`burner_profiles`** (`schema.ts:352-364`): `user_id` (PK, FK→`users.id` CASCADE), `version` (= `QUESTIONNAIRE.version`), `responses` (jsonb, flat `questionId → value` map **minus** `id.number`; `id.type`, `birthday`, `profile.image` all stay here), `started_at`, `completed_at` (set only when `markComplete`; preserved once set), `updated_at`.
- **`users`** columns this surface writes/reads (`schema.ts:229,241-242`): `profile_image_url` (mirrored from `responses["profile.image"]`), `passport_encrypted` (ciphertext of `id.number` when `id.type==="passport"`), `sa_id_encrypted` (when `id.type==="sa_id"`). `idColumnsFor` sets the matching column and NULLs the other.
- **`required_actions`** (via `satisfyBurnerProfileAction`): action key `burner_profile`, type `questionnaire`, version-gated completion on final submit.

**Questionnaire identity:** `QUESTIONNAIRE.version = "2026.05.29-v8"` (`questionnaire.ts:60`), stored on `burner_profiles.version`.

**Question kinds (10, discriminated union):** `slider`, `single_select`, `multi_select`, `short_text`, `long_text`, `date`, `scale`, `toggle`, `combobox`, `image`. Page kinds (2): `questions`, `intro`. Response value union: `number | string | string[] | boolean | null`.

**Per-step → questionnaire.ts field/enum map:**
- `profile.image` (image, optional) → mirrored to `users.profile_image_url`.
- `birthday` (date, required) — stays in `responses`, NOT encrypted-PII class.
- `phone` (short_text, max 40, required).
- `country` (combobox, required) — options `COUNTRY_OPTIONS` (198 countries; stored = ISO alpha-2).
- `id.type` (toggle, required) — `passport` | `sa_id`; stays in `responses`.
- `id.number` (short_text, max 40, required) — **split out at every write and encrypted** onto `users` (`passport_encrypted` / `sa_id_encrypted`).
- `bio.statement` (long_text, max 2000, required).
- `ideas.this_year` (long_text, max 2000, optional).
- `team_interest.<team>` × 8 (slider, min 0, max **5**, step 1) — teams: `kitchen`, `structures`, `power_and_lighting`, `sanitation_and_water`, `health_and_safety`, `art_and_activities`, `ministry_of_memes`, `ministry_of_vibes`. **Above-zero drives later team-specific questionnaire activation.**
- `competency.cooking` (scale, required): `create` / `teach` / `follow` / `burn`.
- `competency.hardware` (scale, required): `design` / `build` / `assist` / `novice` — **catalogue page 8; no OB board** (see gap).
- `team_lead.interests` (multi_select, optional; the 8 teams).
- `logistics.driving` (single_select, required): `yes` / `no` / `maybe`.
- `logistics.onsite_before` (single_select, required): `yes_full` / `yes_partial` / `no`.
- `logistics.onsite_after` (single_select, required): `yes_full` / `yes_partial` / `no`.
- `history.camp404_years` (multi_select, optional): `2019`,`2022`,`2023`,`2024`,`2025`,`2026`.
- `history.afrikaburn_count` (single_select, required): `0` / `1_2` / `3_5` / `6_plus`.
- `history.other_burns` (long_text, max 1000, optional).
- `intent.this_year` (scale, required): `definite` / `want` / `try` / `unsure` / `unlikely` / `not_coming`.
- `dietary.dislikes` (multi_select, optional; `DIETARY_INGREDIENTS`).
- `dietary.allergies` (multi_select, optional; same list).
- `dietary.notes` (long_text, max 1000, optional).

`DIETARY_INGREDIENTS` (value→label): `dairy`="Dairy / lactose", `gluten`="Gluten / wheat", `eggs`="Eggs", `soy`="Soy", `peanuts`="Peanuts", `tree_nuts`="Tree nuts", `shellfish`="Shellfish", `fish`="Fish", `sesame`="Sesame", `alliums`="Onion / garlic", `nightshades`="Nightshades (tomato, pepper, aubergine)", `spicy`="Chilli / heat".

**NEW data:** none. Per locked carried-reconciliation, OB steps map 1:1 to the existing v8 catalogue → **no schema change; presentation only.** (The single redesign schema change — `captain_promotion_requests` — belongs to a different surface.)

---

## Validation & edge cases

**Local per-page (`validatePageLocally`):**
- Intro pages always pass.
- A value is "missing" if `undefined | null | ""`. Missing + `required` → inline "This question is required".
- **Cross-field ID check:** when `q.id === "id.number"` and value is a non-empty string, run `validateIdNumber(responses["id.type"], v)`; set the field error on failure. Only runs when an ID number is typed (empty falls to the generic required check).
- `multi_select` `[]` is NOT "missing" locally (arrays aren't `=== ""`) — a required empty multi-select passes local but is caught server-side ("Pick at least one option"). (On this surface every multi-select is optional, so this is mostly theoretical here.)

**`validateIdNumber(type, raw)`:**
- Empty → "Document number is required".
- `passport` → `/^[A-Z0-9]{6,12}$/i`; fail → "Letters and digits only — typically 6–12 characters."
- `sa_id` → exactly 13 digits → valid `YYMMDD` prefix → SA Home Affairs Luhn-variant check digit (three distinct messages).
- Other/null type → "Pick the ID document type first."

**Server full validation (final submit only, `validateResponses`):** unparseable payload → `_root: "Malformed response payload"`. Per-kind rules: slider in `[min,max]`; select/toggle/combobox a known option; multi_select array of allowed values (`required && empty → "Pick at least one option"`); text within `maxLength`; date strict `yyyy-mm-dd` + real date; scale a known step; image any string. **Unknown response keys are dropped.**

**Edge cases:**
- **ID Luhn/passport check is client-only** — the server validator treats `id.number` as plain `short_text` (max 40); a crafted payload bypasses format checks. Flag as an existing ugly truth (security hardening candidate, not a blocker for this brief).
- ID type switch moves ciphertext (`idColumnsFor` NULLs the other column) — never orphans.
- `mergeIdNumber` only re-injects `id.number` when one exists — no phantom keys on pre-fill.
- Out-of-range `pageIndex` → wizard renders nothing (`if (!page) return null`) rather than crashing.
- Thrown save (DB outage, missing/short `PGCRYPTO_KEY`) → typed `_form` error or client catch → SaveFailedBanner; user retries, never silently stuck.
- ID encryption + photo mirror run on **progress AND final** saves, so encrypted columns and `profile_image_url` update incrementally.
- Re-entry after completion bounces to `/`.

---

## Flows — entry → transitions → exits

**Entry:** gating spine routes an incomplete, invite-bearing signed-in user to `/onboarding/questionnaire`. Page runs auth gate → `ensureCampUser` → invite gate (`hasCampAccess` else `/signup/required`) → completion gate (`completedAt` set → `/`) → pre-fill (merge decrypted ID) → mount wizard at page 0.

**Transitions:** page 0 (photo, Sign out + Skip/Next) → step 02 about-you → … → step 05 intro interstitial → step 06 team interests → … → step 11 dietary (Finish). Each Next validates locally then persists progress server-side; Back navigates without saving. Inline errors block advance; banner/save-failed surface form-level problems; submitting disables the footer.

**Exits:**
- **Finish** → server validates → split-encrypt ID → upsert `markComplete` → mirror photo → satisfy `burner_profile` gate → `redirect("/")` (re-enters the spine: pending → `/pending-approval`, rejected → terminal, else home).
- **Sign out** (page 0) → `/auth/sign-out`.
- **Invite revoked** mid-flow → next save redirects to `/signup/required`.

---

## Divergences from feature-set reference — and resolution per locked decisions

1. **S04 superseded by the 11 OB Step boards.** Resolution (carried reconciliation): OB Step 01–11 are canonical; port only S04's footer-state matrix and mono progress-percent label. Done above.

2. **`hardware_competency` content gap.** The catalogue has **12 pages** (page 8 = `hardware_competency`, scale, **required**), but there are only **11 OB boards** — board 07 ("Cooking competency") draws BOTH a "Cooking competency" group AND a "Hardware & build competency" group on one page, while the catalogue makes them **two separate pages**. Resolution (locked OPEN content question): **do NOT silently drop hardware.** Two viable reconciliations to confirm with the data owner:
   - (a) Keep hardware as its own catalogue page (12 pages total; progress reads "of 12"; needs a 12th board), OR
   - (b) Merge cooking + hardware onto one page to match board 07 (11 pages; progress "of 11"; the catalogue must be edited so both scales live on one `questions` page).
   The boards (per locked decision 1, boards win) lean toward **(b) one page**. **Flag for confirmation; do not delete the hardware question either way.** The "Step N of M" total MUST derive from `questionnaire.pages.length` (S04 literal "of 12" vs OB "of 11" is exactly this unresolved count).

3. **Team-interest range 0–6 (boards) vs 0–5 (catalogue).** OB Step 06 draws a 7-segment 0–6 control; `questionnaire.ts` defines `min:0, max:5`; S04 draws a continuous slider 0–5 (value badge "4", etc.). Resolution (locked reconciliation): **reconcile to one constant.** Recommend keeping the **catalogue 0–5** (it drives downstream team-questionnaire activation and matches S04) and correcting the OB board to 6 segments (0–5); confirm with the data owner. Underlying kind stays `slider`.

4. **Field affordance: `single_select` dropdown vs radio cards.** Live `question.tsx` renders `single_select` as a shadcn `<Select>` dropdown, but boards 08/09/10 draw **stacked radio cards**. Resolution (locked field-renderer rule: boards win on drawn affordance, kind must survive): render `single_select` (and the already-card `scale`) as **RadioCardGroup**; keep the kind. New renderer required.

5. **Team interest affordance: slider vs segmented.** S04 = continuous slider; OB Step 06 = segmented 0–N buttons. Resolution: render the `slider` kind as the board's **segmented control** on this page (presentation variant); kind stays `slider`. (Resolve the range first, item 3.)

6. **Dietary multi-select affordance: stacked checkboxes vs 2-col chip grid.** Live renders all `multi_select` as stacked checkbox rows; board 11 draws a **2-column chip grid**. Resolution: add a **CheckboxChipGrid** variant for the dietary page; keep kind `multi_select`. (Other multi-selects — lead-teams, years — stay stacked per their boards 08/09.)

7. **Progress label.** OB boards omit the percent and drift between 12px/600 and 13px/normal; S04 adds a mono `NN%` in `$accent`. Resolution: adopt S04's `ProgressLabelRow` (mono "Step N of M" + mono `NN%`); normalise type.

8. **Step-11 duplicate title artefact.** Board 49 renders BOTH a "Step 11 of 11" progress label AND a stray `[Inter/20px/700]` "Step 11 of 11" heading where the page title ("Dietary requirements") should be. Resolution: board bug — render the page **title** ("Dietary requirements" / catalogue "Dietary requirements"), not a duplicated progress string.

9. **Subtitle / copy drift.** Several board step copies differ from catalogue `subtitle`/`helper`/intro `body` strings (e.g. step 01 board "Optional" vs catalogue subtitle; step 05 board body vs catalogue body; step 11 board "Anything you'd rather not eat?" vs catalogue "Ingredients I dislike"). Resolution (locked decision 1, boards primary for visible copy): treat **board copy as canonical for what renders**, but keep catalogue question prompts as the data-layer identity; reconcile the user-visible strings toward the boards and confirm any catalogue copy edits with the owner.

---

## Open questions / build reconciliations

1. **Hardware competency (must confirm):** keep `hardware_competency` as its own page (12 pages) or merge cooking+hardware onto one page to match board 07 (11 pages)? Either way the question must survive. Drives the "Step N of M" total.
2. **Team-interest range:** lock 0–5 (catalogue + S04) or 0–6 (OB Step 06)? Recommend 0–5; correct the board.
3. **Skip semantics:** confirm the single-button Skip/Next behaviour (label flip) over S04's separate "Skip" text link — recommend the single button (matches live code).
4. **Server-side ID validation:** the SA-ID Luhn / passport-format check is client-only; server treats `id.number` as plain text. Confirm whether to harden server-side (out of scope for presentation spec, but flag for the build).
5. **Profile-photo upload mechanism:** the OB board shows "Upload a photo"; confirm whether step 01 reuses the dedicated avatar-upload surface (S11) or an inline picker — both feed `profile.image` as a URL.
6. **Copy reconciliation:** confirm the set of board-vs-catalogue copy edits (subtitles, intro body, dietary prompts) with the data owner before editing `questionnaire.ts` strings.
7. **Progress-percent rounding:** confirm `Math.round((current/total)*100)` for the `NN%` label (matches existing `ProgressBar`).
