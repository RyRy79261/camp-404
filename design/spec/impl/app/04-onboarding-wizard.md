# 04-onboarding-wizard — app integration plan
- Route(s): `/onboarding/questionnaire` · routed page (single App-Router segment)

> Scope: the **onboarding configuration** of the shared `QuestionnaireWizard` engine —
> the mandatory burner-profile questionnaire shown immediately after sign-up. Plan docs
> only; no code in this pass. Classification: this surface is **~95% REUSE** — the route,
> server action, gate, pre-fill, and the wizard engine all already exist and work. The
> redesign is presentation (board affordances inside `QuestionField`) + chrome polish
> (`ProgressBar`/`Alert` PROMOTE) + the `@camp404/core` import re-point. **No schema
> change, no new route, no new server action for this surface.** The wizard organism
> plan (`components/organism-questionnairewizard.md`) and field-renderer plan
> (`components/organism-questionfield.md`) own the component-side work; this plan is the
> **app-layer wiring** of the onboarding host around them.
>
> Preview-but-locked / CaptainLock is **explicitly N/A** here — onboarding is
> identity-only, per-user, rank-agnostic (surface brief §"Preview-but-locked — N/A";
> wizard plan §"preview-but-locked … does NOT apply").

---

## Current state — the existing route/files today

Verified against the live tree (every path below read in full):

- **`apps/web/app/onboarding/questionnaire/page.tsx`** (60 lines) — the host **server
  component**, `export const dynamic = "force-dynamic"` (`:16`). Runs the gating spine
  inline: `getAuthenticatedUserOrRedirect()` (`:19`) → `ensureCampUser(authUser)` (`:20`)
  → `hasCampAccess(campUser, authUser.primaryEmail)` else `redirect("/signup/required")`
  (`:21–23`) → `getBurnerProfile(campUser.id)` → `profile?.completedAt` set →
  `redirect("/")` (`:24–28`) → owner-only ID pre-fill: `getIdDocuments(campUser.id)` +
  `mergeIdNumber(profile.responses, id)` (`:33–40`). Renders app-chrome header
  ("Build your burner profile" + subtitle, `:44–50`) inside
  `<main class="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8">` (`:43`)
  then mounts `<QuestionnaireWizard questionnaire={QUESTIONNAIRE} initialResponses
  action={saveBurnerProfile} firstStepSignOut />` (`:51–56`). Note: `submitLabel` is NOT
  passed here, so the wizard's default `"Finish"` applies; `persistProgress` defaults to
  `true`; no `onComplete` (server-side redirect). The brief's "onboarding configuration"
  is satisfied today by these props.

- **`apps/web/app/onboarding/questionnaire/actions.ts`** (99 lines) — `"use server"`
  `saveBurnerProfile(rawResponses, final)` (`:26`) returning the exported `SaveResult`
  union (`:17–19`, also imported by `wizard.tsx`). Re-runs the auth + invite gate
  (defence-in-depth, `:30–34`); on `final` runs `validateResponses(QUESTIONNAIRE, raw)`
  (`:38–41`); `splitIdNumber` (`:52`); `upsertBurnerProfile({ markComplete: final })`
  (`:54–59`); `setIdDocuments` encrypt when `idNumber` (`:65`); `setProfileImage` mirror
  from `responses["profile.image"]` on **every** save (`:70–73`); on `final`
  `satisfyBurnerProfileAction(campUser.id)` (`:79`) then `redirect("/")` (`:97`). Thrown
  persistence → `{ ok:false, errors:{ _form: "We couldn't save…" } }` (`:81–93`).

- **`apps/web/components/questionnaire/wizard.tsx`** (278 lines) — the `"use client"`
  engine (own plan: `organism-questionnairewizard.md`). State machine + two-tier
  validation + per-Next progress save + `_form`/`_root` banner + footer + private
  `ProgressBar` fn (`:263–278`). Imports `validateIdNumber` from `@/lib/id-validation`
  (`:12`) and `SaveResult` from this surface's `actions.ts` (`:13`).

- **`apps/web/components/questionnaire/question.tsx`** — the `"use client"` per-kind
  field renderer (own plan: `organism-questionfield.md`). Today renders `single_select`
  as `Select` dropdown, `scale`/`toggle` as inline `ScaleField`/`ToggleField`, `date` as
  bare `<Input type="date">`, dietary `multi_select` as stacked checkbox rows — all of
  which the redesign re-skins to board affordances. The host page does not touch this; it
  is reached transitively through the wizard.

- **`apps/web/lib/questionnaire.ts`** — `QUESTIONNAIRE` v8 catalogue (`version
  "2026.05.29-v8"`) + `TEAMS`/`DIETARY_INGREDIENTS`/`COUNTRY_OPTIONS`. Imported by both
  `page.tsx` (`:10`) and `actions.ts` (`:15`).

- **`apps/web/lib/users.ts`** — the test-mode-routed I/O the host + action call:
  `ensureCampUser` (`:60`), `getBurnerProfile` (`:162`), `satisfyBurnerProfileAction`
  (`:204`), `hasCampAccess` (`:219`), `upsertBurnerProfile` (`:300`), `setProfileImage`
  (`:311`), `setIdDocuments` (`:333`), `getIdDocuments` (`:343`).

- **`apps/web/lib/required-actions.ts`** — `ACTION_ROUTES` maps **only** `burner_profile`
  → `/onboarding/questionnaire` (`:7–11`); `nextGate` (`:23`) is what the gating spine
  uses to route an incomplete user here. This surface IS the `burner_profile` gate.

- **Tests today (all green; must stay green):**
  `apps/web/app/onboarding/questionnaire/actions.test.ts` (`saveBurnerProfile` typed-error
  path); `apps/web/components/__tests__/questionnaire.test.ts` (field renderer +
  cross-field `validateIdNumber`); `apps/web/tests/e2e/onboarding-questionnaire.spec.ts`
  (green-path advance past the ID-document page — documents the historical "stage 2→3"
  bug). The e2e relies on `E2E_TEST_MODE=1` + `INVITE_CODES=TEST-INVITE`.

**What the redesign changes (app layer):** the host page is essentially **MODIFY-only**
and small — (1) re-point the `QUESTIONNAIRE` import `@/lib/questionnaire` → `@camp404/core`
(catalogue extraction, plan 03 Step 1); (2) the chrome header copy/tokens follow the
foundations codemod (no structural change); (3) optionally pass an explicit
`submitLabel="Finish"` / `variant="onboarding"` if the wizard EXTEND adds the `variant`
prop (surface 24) — but the onboarding variant is the default, so this is cosmetic. The
visible redesign (board affordances, progress percent, alert molecule, mono progress
label) all land **inside the wizard/QuestionField components**, not in the host. The
action is REUSE (only its `QUESTIONNAIRE`/`validateIdNumber`-adjacent imports shift to
`@camp404/core`). **There is no DELETE.** No `/api` handler, no `error.tsx`/`not-found.tsx`
exists for this segment today, and none is required (errors surface as in-wizard
`_form`/`_root` banners; the gate redirects cover the not-found-ish cases).

---

## File structure — target files in apps/web

| File | Type | vs current | Notes |
|---|---|---|---|
| `apps/web/app/onboarding/questionnaire/page.tsx` | server component (`force-dynamic`) | **MODIFY** | Re-point `QUESTIONNAIRE` import to `@camp404/core`; token codemod on the chrome header (`text-[color:var(--color-muted-foreground)]` → `text-muted-foreground`, foundations P0); keep `max-w-2xl` single column (brief §Breakpoints — wider than global `max-w-lg`); optionally add `submitLabel="Finish"` / `variant="onboarding"` once the wizard prop lands. Auth/invite/completion gate + ID pre-fill unchanged. |
| `apps/web/app/onboarding/questionnaire/actions.ts` | server action (`"use server"`) | **MODIFY (imports only)** | Re-point `QUESTIONNAIRE` import to `@camp404/core`; `validateResponses` stays `@camp404/types`; `splitIdNumber` stays `@camp404/db/id-documents`; all `@/lib/users` orchestration unchanged. Behaviour identical. `SaveResult` export stays here (wizard imports it). |
| `apps/web/components/questionnaire/wizard.tsx` | `"use client"` island | **MODIFY (own plan)** | `organism-questionnairewizard.md`: import re-point (`validateIdNumber` → `@camp404/core`), swap private `ProgressBar` for promoted `@camp404/ui` atom (+ mono `NN%` label), swap hand-rolled banner for `Alert` molecule, optional `variant` prop. |
| `apps/web/components/questionnaire/question.tsx` | `"use client"` island | **MODIFY (own plan)** | `organism-questionfield.md`: board affordance swaps for the 5 diverging kinds. |
| `apps/web/app/onboarding/questionnaire/page.test.ts` (or extend e2e) | test | **CREATE (optional)** | The host's gate logic (invite/completion redirects, ID merge) has no dedicated unit test today; an app-lib/e2e assertion can cover the redirect branches. Optional, not blocking. |
| `error.tsx` / `not-found.tsx` for this segment | boundary | **NONE** | Not present today; not required — failures surface in-wizard, gate redirects handle the rest. A shared `ErrorBoundary` (`organism-errorboundary.md`) is a global concern, not this segment's. |
| `/api/**` route handler | route handler | **NONE** | This surface owns no API route. (Voice transcription `/api/voice/transcribe` and avatar upload endpoints are reached only via leaf components inside `QuestionField`; they belong to the voice (plan 07) and image/blob (plan 09) domains, not this surface.) |

**Client/server boundary (confirmed against the tree):** `page.tsx` is the only server
component; it does all auth/gate/pre-fill and renders the single `"use client"` island
(`QuestionnaireWizard`), which in turn mounts `QuestionField`s. There is exactly one
client island for this surface — the wizard. The header chrome ("Build your burner
profile") stays server-rendered above the island (brief §Header: "rendered by the server
page … constant across steps").

---

## Components composed

The host page composes **one** component directly; everything else is transitive through
the wizard. Where each renders:

| Component | Plan | Rendered by | Server/client |
|---|---|---|---|
| **QuestionnaireWizard** | `components/organism-questionnairewizard.md` | `page.tsx` (direct mount) | `"use client"` island |
| ProgressBar (+ mono `NN%`) | `components/atom-progressbar.md` | wizard | client (inside island) |
| Alert (`_form`/`_root` banner) | `components/molecule-alert.md` | wizard | client |
| Button (footer Back/Sign-out/Next/Skip/Finish) | `components/atom-button.md` | wizard footer | client |
| **QuestionField** (per-kind host) | `components/organism-questionfield.md` | wizard (`page.questions.map`) | client |
| AvatarUpload (step 01 `image`, `circle` variant) | `components/molecule-avatarupload.md` | QuestionField `image` arm | client |
| DateControl (step 02 `date`) | `components/molecule-datecontrol.md` | QuestionField `date` arm | client |
| InputField / Input (step 02 phone, ID number) | `components/molecule-inputfield.md` / `atom-input.md` | QuestionField `short_text` arm | client |
| Combobox (step 02 country) | `components/molecule-combobox.md` | QuestionField `combobox` arm | client |
| SegmentedControl (step 02 ID type `toggle`; step 06 team-interest `slider`; cooking/intent `scale`) | `components/molecule-segmentedcontrol.md` | QuestionField `toggle`/`scale`/`slider` arms | client |
| OptionCardGroup (steps 08/09/10 `single_select` radio cards; lead-teams/years `multi_select` checkbox cards; dietary `chip-grid`) | `components/molecule-optioncardgroup.md` | QuestionField `single_select`/`multi_select` arms | client |
| LongTextField + DictatePill → RecorderPanel (steps 03/04 bio/ideas `long_text`; steps 09/11 notes `long_text` without pill) | `components/molecule-dictatepill.md` + `components/molecule-recorderpanel.md` (LongTextField is app-local in `question.tsx`) | QuestionField `long_text` arm | client |
| IntroInterstitial (step 05) | rendered inline by the wizard's `intro`-page branch (`wizard.tsx:198–206`) — no separate leaf plan | wizard | client |
| Slider | `components/atom-slider.md` | QuestionField (`slider` underlying kind; presented as SegmentedControl on step 06) | client |
| Checkbox | `components/atom-checkbox.md` | OptionCardGroup internals | client |
| Textarea | `components/atom-textarea.md` | LongTextField / `long_text` arm | client |
| Label | `components/atom-label.md` | QuestionField shell (`htmlFor` + required `*`) | client |

The per-step → component mapping is the brief's table (§Layout & modules); it is realised
**entirely inside `QuestionField`'s kind switch** — the host page is agnostic to it. The
wizard's `intro` branch handles step 05's interstitial without a `QuestionField`.

---

## Services & data

All data is resolved **server-side in `page.tsx`** and passed to the client wizard as
props; the wizard fetches nothing (wizard plan §"What it fetches vs receives").

**Fetched server-side (in `page.tsx`, before first paint):**
- `getAuthenticatedUserOrRedirect()` — `@/lib/auth` (session).
- `ensureCampUser(authUser)` — `@/lib/users` (session→row resolution, test-mode-routed).
- `hasCampAccess(campUser, authUser.primaryEmail)` — `@/lib/users` (`isGodEmail(email) ||
  !!user.inviteCode`); becomes a thin shim over `core.hasCampAccess` post-extraction
  (architecture §Hybrid, plan 01) — call-site unchanged.
- `getBurnerProfile(campUser.id)` — `@/lib/users`; `completedAt` drives the already-complete
  redirect; `responses` seed the pre-fill.
- `getIdDocuments(campUser.id)` — `@/lib/users` (decrypts owner ID); merged via
  `mergeIdNumber(responses, id)` from `@camp404/db/id-documents` (the ID number lives
  encrypted on `users`, not in `responses`).
- `QUESTIONNAIRE` catalogue — `@/lib/questionnaire` today → `@camp404/core` after plan 03
  Step 1 (the catalogue extraction is the one cross-cutting import change touching this
  surface).

**Passed as props to `<QuestionnaireWizard>`:** `questionnaire` (static catalogue),
`initialResponses` (pre-filled + merged decrypted ID), `action={saveBurnerProfile}`,
`firstStepSignOut` (page-0 escape), and the default `persistProgress=true` /
`submitLabel="Finish"` / no `onComplete`.

**Server action it calls (the wizard `action` prop):** `saveBurnerProfile(raw, final)`
(`actions.ts`, REUSE). It composes, in order:
- `validateResponses(QUESTIONNAIRE, raw)` — `@camp404/types` (final-submit only).
- `splitIdNumber(responses)` — `@camp404/db/id-documents` (PII split).
- `upsertBurnerProfile({ userId, version, responses: cleaned, markComplete: final })` —
  `@/lib/users` → `@camp404/db/burner-profile`. **EXTEND (plan 03 Step 3, cross-surface):**
  COALESCE `completedAt` so a re-write never overwrites the first completion timestamp —
  data-integrity, no DDL; not a blocker for onboarding's green path (relevant to replay),
  but lands in the same domain.
- `setIdDocuments(campUser.id, { idType, idNumber })` — encrypt onto
  `passport_encrypted` / `sa_id_encrypted` via `idColumnsFor` (NULLs the other).
- `setProfileImage(campUser.id, image|null)` — mirror `responses["profile.image"]` →
  `users.profile_image_url` (runs on progress + final).
- `satisfyBurnerProfileAction(campUser.id)` — `@/lib/users` → `satisfyRequiredAction`
  (final-only); satisfies the `burner_profile` required-action gate.
- `redirect("/")` — final-only, re-enters the gating spine.

**@camp404/core helpers (post-extraction, architecture §Hybrid):** `validateIdNumber`
(client cross-field, via the wizard), `QUESTIONNAIRE` catalogue + option arrays (host +
action). The validation **engine** (`validateResponses`/`validateOne`/`flattenQuestions`)
stays in `@camp404/types`. No `@camp404/core` import is added to `page.tsx`/`actions.ts`
beyond re-pointing the existing `QUESTIONNAIRE` import path.

**Data written/read (no new table — brief §Data & enums):** `burner_profiles`
(`responses` jsonb minus `id.number`; `version`; `completed_at` on final); `users`
(`profile_image_url`, `passport_encrypted`/`sa_id_encrypted`); `required_actions`
(`burner_profile` satisfaction). The one redesign schema change
(`captain_promotion_requests`, migration 0012) is a **different surface** and does not
touch this one.

---

## Gating

- **Gate level:** this surface IS a gate — the `burner_profile` blocking required-action.
  The gating spine routes any signed-in, invite-bearing user with an incomplete profile
  here (via `ACTION_ROUTES.burner_profile` + `nextGate`, `required-actions.ts:7,23`);
  completing it satisfies the gate and releases the app.
- **Invite gate (defence-in-depth):** `!hasCampAccess` → `redirect("/signup/required")`
  in BOTH `page.tsx:21–23` and `actions.ts:32–34`.
- **Completion gate:** `profile.completedAt` set → `redirect("/")` in `page.tsx:26–28`;
  onboarding cannot be reopened (replay/edit is a separate surface).
- **Pending/rejected approval:** NOT handled here; the post-completion `redirect("/")`
  re-enters the spine, which routes pending → `/pending-approval`, rejected → terminal.
  `users.approval_status` is checked downstream.
- **Preview-but-locked (CaptainLock / rank gating):** **N/A.** Onboarding is per-user,
  identity-only, rank-agnostic — there is no rank-gated content, so locked decision 3's
  CaptainLock treatment (render structure + no data + inert) does **not** apply. Record
  this explicitly so the engine is never retro-fitted with rank gating (brief
  §"Preview-but-locked — N/A"; wizard plan §"preview-but-locked … does NOT apply"). No
  CaptainLock import, no inert/zero-data render, no redirect-as-lock anywhere on this
  surface.

---

## States

Driven by the wizard (own plan §States); the host contributes only the server-render
loading window and the gate redirects.

- **Empty** — first visit, no saved profile: `initialResponses = {}` (after merge); every
  field unanswered; page 0 = optional profile photo → footer right slot label flips to
  **"Skip"** (`wizard.tsx:160–172`).
- **Loading** — `page.tsx` (`force-dynamic`) awaits session → camp-user → profile →
  decrypted ID before first paint. **No client spinner** — the wizard mounts already
  hydrated; treat any pre-paint gap as server render time.
- **Populated** — returning incomplete user: `profile.responses` pre-fill;
  `id.number`/`id.type` merged back via `mergeIdNumber`. Progress saved on every Next, so
  a partial signup survives reload.
- **Validation-error (field)** — inline `circle-alert` + "This question is required"
  under the offending field (from `validatePageLocally`, `wizard.tsx:79–101`; or server
  per-field errors on final submit). Cross-field `id.number` runs `validateIdNumber`.
- **Validation-error (page/form)** — `Alert tone="destructive" role="alert"` near the top
  for `_form`/`_root` keys (`wizard.tsx:189–196`, re-skinned to the `Alert` molecule).
- **Submitting / pending** — `isPending` (`useTransition`) disables Back + the right
  action; Back op~0.5, primary shows "Saving…" op~0.6. Covers Next-progress saves and
  final submit.
- **Success** — **no client success UI.** The action `redirect("/")` after `markComplete`
  + gate satisfaction; the completion gate bounces any re-entry home.
- **Disabled** — Back disabled on page 0 and while pending; right action disabled while
  pending.
- **Save-failed** — thrown action → `_form = SAVE_FAILED` banner ("We couldn't save your
  answers just now…") + retry; user stays on the page; nothing silently swallowed
  (`wizard.tsx:117–122,143–145`; `actions.ts:81–93`).
- **Gating states** — invite-revoke mid-flow: next save redirects to `/signup/required`;
  already-complete: host redirects to `/`. No offline/sync, no budget/over-target states.
  No preview-but-locked state (N/A above).

---

## Build steps — ordered, with prerequisites + acceptance + tests

> Each step is independently green-CI-clean (MEMORY: don't strand post-green follow-ups).
> The host page itself is tiny; most prerequisites are the component + service phases that
> land elsewhere — this surface is **assembled last**, after the engine pieces exist.

**Prerequisites (must land first, from architecture + plan 03):**
- **P0 Foundations** (`foundations-tokens.md`): status tokens + font/`--text-*` tokens (so
  the mono progress label + Alert tints stop using raw `var(--color-*)`/hex).
- **P1/P3 core extraction** (plan 03 Steps 0–1): `@camp404/core` hosts `QUESTIONNAIRE` +
  `validateIdNumber`; ⛔ owner content reconciliations locked first (hardware-competency
  page count, team-interest 0–5 vs 0–6, copy edits — these change the catalogue the
  wizard renders, not the host).
- **P5 UI promotes** (components plan): `ProgressBar`, `Alert`, and the QuestionField-side
  re-skin leaves (OptionCardGroup, SegmentedControl, DateControl, AvatarUpload `circle`).
- **Component plans complete:** `organism-questionnairewizard.md` Steps 1–4 +
  `organism-questionfield.md` Steps 1–8 (the engine + every kind re-skin).

**Step 1 — Re-point the catalogue import in the host + action (no behaviour change).**
- `page.tsx:10` and `actions.ts:15`: `@/lib/questionnaire` → `@camp404/core`.
- Prereq: plan 03 Step 1 (catalogue moved). Acceptance: `tsc`/build green; existing
  `actions.test.ts` + e2e pass unchanged. Test: re-run existing suites.

**Step 2 — Token codemod on the host chrome (P0).**
- Replace `text-[color:var(--color-muted-foreground)]` (`page.tsx:46`) with the
  short-form utility; keep H1 at 24px (brief §Header: OB 24px, not S04's 26px); keep the
  `max-w-2xl` single column.
- Prereq: P0 foundations. Acceptance: pixel-identical render; zero verbose token strings
  in `page.tsx`. Test: class assertion.

**Step 3 — (Optional) thread the wizard `variant`/explicit labels.**
- If the wizard EXTEND adds `variant?: "onboarding"|"runner"|"replay"` (surface 24), pass
  `variant="onboarding"` and explicit `submitLabel="Finish"` for clarity. Onboarding is
  the default behaviour, so this is cosmetic — only land it once the prop exists.
- Prereq: `organism-questionnairewizard.md` Step 4. Acceptance: onboarding render
  unchanged (Finish label, no blocking chrome, page-0 Sign-out). Test: render-variant
  assertion (no BlockingTopBar/Notice for `onboarding`).

**Step 4 — Verify the full onboarding flow end-to-end (assembly gate).**
- With the engine + field re-skins landed, confirm the host wires them correctly: gate
  redirects, ID pre-fill, every board step renders its board affordance, progress label
  shows mono "Step N of 11" + `NN%`, Finish satisfies the gate and redirects.
- Prereq: Steps 1–3 + all component/service prereqs. Acceptance: no functionality
  dropped — paging, two-tier validation, per-Next progress persistence, Skip-on-lone-
  optional (photo), fullScreen single-question pages (bio/ideas/intro/scale), page-0
  Sign-out, save-failed retry, cross-field `id.number`, all 11 live steps. Data shapes
  unchanged; no schema change.

**Test notes (E2E_TEST_MODE seam):**
- The existing **`apps/web/tests/e2e/onboarding-questionnaire.spec.ts`** (green-path
  advance past the ID-document page) is the canonical regression for this surface and
  **must stay green**. It runs under `E2E_TEST_MODE=1` + `INVITE_CODES=TEST-INVITE`
  (`playwright.config.ts`); the in-memory backend stores the ID **raw** (encryption
  bypassed), so a save cannot throw there — the throw→error-banner recovery is covered by
  the **wizard unit test**, not e2e. When the board affordances land, **update the e2e
  selectors** for the swapped controls (e.g. ID type "Passport" becomes a SegmentedControl
  segment, country stays a `combobox`, radio-card single_selects); keep the heading-exact
  assertions ("About you", "A bit about you") that disambiguate steps.
- `actions.test.ts` (typed-error path) is REUSE — its imports shift only if the catalogue
  import moves (it imports `QUESTIONNAIRE` indirectly via the action).
- The `satisfyBurnerProfileAction` is a **no-op under E2E test mode** (the fallback gate
  covers it, `actions.ts:77–78`) — assert completion via the post-Finish redirect to `/`,
  not via the required-action row, in e2e.

---

## Open items — surface-specific decisions (cross-ref `design/spec/open-questions.md`)

The blocking/content reconciliations are **catalogue/component decisions** that gate this
surface's final render but are not host-page work (they live in plan 03 Step 0 +
architecture OQ#5). Cross-referenced from the brief §Open questions:

1. **⛔ Hardware-competency page count** (brief Divergence #2 / OQ#1) — keep
   `hardware_competency` as its own page (12 pages, progress "of 12") or merge cooking +
   hardware onto one page to match board 07 (11 pages, "of 11"). Boards lean to merge.
   The question must survive either way. Drives the "Step N of M" total — which **must**
   derive from `questionnaire.pages.length`, never a literal (already true in `ProgressBar`).
   Owner: product. Blocks the catalogue edit, not the host wiring.
2. **Team-interest range** (Divergence #3 / OQ#2) — lock 0–5 (catalogue + S04, drives
   downstream team-questionnaire activation) vs 0–6 (OB board). Recommend 0–5; correct the
   board. Owner: product.
3. **Skip semantics** (OQ#3) — confirm the single-button Skip/Next label-flip (matches
   live `wizard.tsx:160–172`) over S04's separate "Skip" text link. Recommend the single
   button. No host change.
4. **Server-side `id.number` validation** (Divergence/OQ#4) — the SA-ID Luhn / passport
   check is **client-only**; the server validates `id.number` as plain `short_text ≤ 40`
   (`actions.ts` → `validateResponses`). House policy: **flag, do not silently patch**
   (MEMORY: source findings documented). If hardened (plan 03 Step 5, owner-gated),
   `saveBurnerProfile` would call the shared `validateIdNumber` (from `@camp404/core`) on
   the split-out `idNumber` before encrypt and return `{ ok:false, errors:{ "id.number" }}`.
   Default: skip. Owner: data owner.
5. **Profile-photo upload mechanism** (OQ#5) — step 01 "Upload a photo": confirm whether
   it reuses the dedicated avatar-upload surface (S11) or an inline picker; both feed
   `profile.image` as a URL and mirror to `users.profile_image_url`. The upload pipeline
   is the AvatarUpload molecule + the blob endpoint (plan 09 `avatar-blob.ts`), not host
   work. Owner: product + design.
6. **Copy reconciliation** (Divergences #8/#9 / OQ#6) — board-vs-catalogue visible copy
   (subtitles, intro body, dietary prompts, the step-11 duplicate-title board artefact):
   boards win on rendered copy; catalogue prompts stay the data identity. Confirm the
   catalogue string edits with the owner before editing `questionnaire.ts`. Owner: product.
7. **Progress-percent rounding** (OQ#7) — confirm `Math.round((current/total)*100)` for
   the `NN%` label (matches existing `ProgressBar`, `wizard.tsx:264`). No analytics depend
   on the old "Step N of M" string — confirm before changing the label (surface 24 OQ#3).
   Owner: design/product.
8. **`upsertBurnerProfile` COALESCE `completedAt`** (plan 03 Step 3 / architecture) — a
   cross-surface data-integrity fix (matters for replay, neutral for onboarding's first
   completion). Lands in the questionnaire-forms domain, mirrored in the in-memory backend
   so test + real agree. Not a host change. Owner: lead architect.
