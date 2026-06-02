# 24-questionnaire-runner — app integration plan
- Route(s): `/onboarding/questionnaire` (required / blocking variant) · routed page (single App-Router segment, shared physically with surface 04)

> Scope: the **blocking required-action configuration** of the shared
> `QuestionnaireWizard` engine — the same paged field-machine as the onboarding wizard
> (surface 04), wrapped in *required-action chrome* (`BlockingTopBar` + `BlockingNotice` +
> `RequiredChip`) that makes the obligation unmistakable. Plan docs only; no code this
> pass. Classification: the **engine, route, server action, gate, pre-fill, and field
> machine are 100% REUSE** (shared 1:1 with surface 04 — see `04-onboarding-wizard.md`,
> `organism-questionnairewizard.md`, `organism-questionfield.md`). The redesign work for
> *this* surface is the **NEW app-local blocking chrome** (3 components) + a thin
> **NEW runner shell** that lifts `pageIndex` so the sticky progress lives above the
> scrolling body + the `variant="runner"` selection on the host page. **No schema change,
> no new route, no new server action.** The chrome is the surface's whole reason to exist
> (surface brief §Purpose; Divergence #1: "Board wins … the blocking chrome is the
> surface's whole reason to exist. The engine is reused unchanged").
>
> Preview-but-locked / CaptainLock is **explicitly N/A** — the runner is identity-only,
> per-user, rank-agnostic; it never renders captain/rank previews and has no `CaptainLock`
> variant (surface brief §States line 105; wizard plan §"Preview-but-locked … does NOT
> apply"; QuestionField plan §"preview-but-locked does NOT apply"). It returns real data
> for the signed-in user's own profile only.

---

## Current state — the existing route/files today

Verified against the live tree (every path below read in full):

- **`apps/web/app/onboarding/questionnaire/page.tsx`** (59 lines) — the host **server
  component**, `export const dynamic = "force-dynamic"` (`:16`). Runs the gating spine
  inline: `getAuthenticatedUserOrRedirect()` (`:19`) → `ensureCampUser(authUser)` (`:20`)
  → `hasCampAccess(campUser, authUser.primaryEmail)` else `redirect("/signup/required")`
  (`:21–23`) → `getBurnerProfile(campUser.id)`; `profile?.completedAt` set → `redirect("/")`
  (`:24–28`) → owner-only ID pre-fill `getIdDocuments(campUser.id)` +
  `mergeIdNumber(profile.responses, id)` (`:33–40`). Renders a **static onboarding header**
  — `<header><h1>Build your burner profile</h1>` + a "Takes about two minutes" subtitle
  (`:44–50`) — inside `<main class="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col
  px-4 py-8">` (`:43`), then mounts `<QuestionnaireWizard questionnaire={QUESTIONNAIRE}
  initialResponses={…} action={saveBurnerProfile} firstStepSignOut />` (`:51–56`).
  **This static header is what the blocking chrome (`BlockingTopBar` + `BlockingNotice`)
  replaces when the route is reached as a pending blocking `required_action`.** Today there
  is **no branch** for the blocking variant — the page renders the same onboarding chrome
  regardless of *why* the user arrived.

- **`apps/web/app/onboarding/questionnaire/actions.ts`** (99 lines) — `"use server"`
  `saveBurnerProfile(rawResponses, final)` (`:26`) returning the exported `SaveResult`
  union (`:17–19`, also imported by `wizard.tsx:13`). Re-runs the auth + invite gate
  (defence-in-depth, `:30–34`); on `final` runs `validateResponses(QUESTIONNAIRE, raw)`
  (`:38–41`); `splitIdNumber` (`:52`); `upsertBurnerProfile({ markComplete: final })`
  (`:54–59`); `setIdDocuments` encrypt when `idNumber` (`:65`); `setProfileImage` mirror
  from `responses["profile.image"]` on **every** save (`:70–73`); on `final`
  `satisfyBurnerProfileAction(campUser.id)` (`:79`) then `redirect("/")` (`:97`). Thrown
  persistence → `{ ok:false, errors:{ _form: "We couldn't save…" } }` (`:81–93`). This is
  the runner's submit/satisfy path — **REUSE, unchanged**.

- **`apps/web/components/questionnaire/wizard.tsx`** (278 lines) — the `"use client"`
  engine (own plan: `organism-questionnairewizard.md`). State machine (`pageIndex`,
  `responses`, `errors`, `isPending`); two-tier validation (`validatePageLocally`
  `:79–101` incl. cross-field `validateIdNumber` `:90–97`); per-Next progress save when
  `persistProgress` (`:103–124`); `_form`/`_root` hand-rolled banner (`:189–196`, raw
  `var(--color-destructive)/10`); footer (`:238–258`) with the page-0 Sign-out escape
  (`firstStepSignOut`, `:239–244`) and a single submit/next button; and a **private
  `ProgressBar` fn** (`:263–278`) rendering **"Step N of M"** (Inter, page-indexed, raw
  tokens). It imports `validateIdNumber` from `@/lib/id-validation` (`:12`) and `SaveResult`
  from this surface's `actions.ts` (`:13`).

- **`apps/web/components/questionnaire/question.tsx`** — the `"use client"` per-kind field
  renderer (`QuestionField` + `FieldInput` switch over all 10 kinds + `ToggleField`/
  `ScaleField`/`LongTextField` sub-renderers; own plan: `organism-questionfield.md`). Today
  `single_select` → shadcn `Select` dropdown, `scale` → `ScaleField` slider, `toggle` →
  segmented `role=radio` buttons (the e2e's `getByRole("radio", { name: "Passport" })`
  targets this), `long_text` → `Textarea` + inline "Dictate instead" → `RecorderPanel`.
  The runner reaches this transitively via the wizard; its board re-skins are owned by
  `organism-questionfield.md`, not this surface.

- **`apps/web/lib/required-actions.ts`** (30 lines) — the **registry that makes this a
  blocking gate.** `ACTION_ROUTES` maps **only** `burner_profile → /onboarding/questionnaire`
  (`:7–11`); `nextGate(actions)` (`:23`) returns the route of the first *pending blocking*
  required-action that maps to a built page. Dietary / driver / agreements activations stay
  `pending` but cannot gate until their bespoke routes are added here (open item #2).

- **`apps/web/app/page.tsx`** — the **gating spine** that mounts this surface
  (`force-dynamic`, `:27`). Order: unauth → `<LandingHero/>` (`:32–34`); `!hasCampAccess`
  → `/signup/required` (`:40–42`); **`nextGate(await getPendingRequiredActions(campUser.id))`
  → redirect to the runner route** (`:47–48`); legacy fallback `!profile?.completedAt` →
  `/onboarding/questionnaire` (`:53–56`); `!isApproved` → `/pending-approval` (`:61–63`).
  So the runner sits *between* the invite gate and the approval gate. (Note: the home
  control panel's "My Profile" tile also links to `/onboarding/questionnaire`, `:121` — a
  non-blocking re-entry that the `completedAt` gate bounces back to `/`.)

- **`apps/web/lib/questionnaire.ts`** — `QUESTIONNAIRE` v8 catalogue (`version
  "2026.05.29-v8"`) + `TEAMS`/`DIETARY_INGREDIENTS`/`COUNTRY_OPTIONS`. Imported by both
  `page.tsx:10` and `actions.ts:15`.

- **`apps/web/lib/users.ts`** — the test-mode-routed I/O the host + action call:
  `ensureCampUser`, `getBurnerProfile`, `getIdDocuments`, `hasCampAccess`,
  `getPendingRequiredActions`, `upsertBurnerProfile`, `setProfileImage`, `setIdDocuments`,
  `satisfyBurnerProfileAction`.

- **Tests today (all green; must stay green):**
  `apps/web/app/onboarding/questionnaire/actions.test.ts` (`saveBurnerProfile` typed `_form`
  error path + ok-on-non-final-save; mocks auth/users/`next/navigation`);
  `apps/web/components/__tests__/questionnaire.test.ts` (field renderer + cross-field
  `validateIdNumber`); `apps/web/tests/e2e/onboarding-questionnaire.spec.ts` (green-path
  advance past the ID-document page). The e2e relies on `E2E_TEST_MODE=1` +
  `INVITE_CODES=TEST-INVITE` (`playwright.config.ts`) and uses `redeemInviteAtGate` to land
  on `/onboarding/questionnaire`.

- **Blocking chrome — does NOT exist.** `grep -rn "BlockingTopBar\|BlockingNotice\|
  RequiredChip\|QuestionnaireRunner" apps packages` → zero matches (confirmed). There is
  no `blocking-top-bar.tsx`, no `blocking-notice.tsx`, no `required-chip.tsx`, no runner
  shell. The `apps/web/components/questionnaire/` dir holds only `question.tsx` + `wizard.tsx`.

**What the redesign changes (app layer):**
1. **NEW chrome** — three app-local components (`BlockingTopBar`, `BlockingNotice`,
   `RequiredChip`) built from PROMOTE'd `@camp404/ui` leaves (`ProgressBar`, `Alert`,
   `Badge`) + `Button` (REUSE). Reusable across all future blocking runners.
2. **NEW runner shell** — lifts the wizard's `pageIndex` so the sticky `BlockingTopBar`
   progress + persistent `BlockingNotice` sit *above* the scrolling wizard body, and the
   wizard's private `ProgressBar` is removed so progress isn't drawn twice.
3. **MODIFY host `page.tsx`** — select the blocking variant when reached via a pending
   blocking `required_action`; source the title from `required_actions.title` /
   `questionnaire_activations.title`; re-point the `QUESTIONNAIRE` import to `@camp404/core`
   (catalogue extraction, service plan 03 Step 1); token codemod.
4. **REUSE** the action, the engine, the field machine, the gate, the pre-fill — unchanged
   in behaviour (the wizard/QuestionField re-skins are their own plans).
No DELETE on this surface (the wizard's private `ProgressBar` is deleted by the
`atom-progressbar.md` PROMOTE, not here). No `/api` handler, no `error.tsx`/`not-found.tsx`
for this segment today, and none required (failures surface as the in-wizard `_form`/`_root`
Alert; gate redirects cover not-found-ish cases).

---

## File structure — target files in apps/web

| File | Type | vs current | Notes |
|---|---|---|---|
| `apps/web/app/onboarding/questionnaire/page.tsx` | server component (`force-dynamic`) | **MODIFY** | Branch on *why* the route was reached: resolve the pending blocking `burner_profile` required-action and its `title`; when present render the **runner shell** (variant="runner") instead of the static onboarding `<header>`. Re-point `QUESTIONNAIRE` import → `@camp404/core`; token codemod (`text-[color:var(--color-muted-foreground)]` → `text-muted-foreground`). Keep `max-w-2xl` single column + `min-h-[100dvh]` (brief §Breakpoints). Auth/invite/completion gate + ID pre-fill **unchanged**. The onboarding (surface 04) and runner (this) selection share one page — see Open items #1/#2 for how the variant is chosen. |
| `apps/web/app/onboarding/questionnaire/actions.ts` | server action (`"use server"`) | **MODIFY (imports only)** | Re-point `QUESTIONNAIRE` import → `@camp404/core`; `validateResponses` stays `@camp404/types`; `splitIdNumber` stays `@camp404/db/id-documents`; `@/lib/users` orchestration unchanged. Behaviour identical. `SaveResult` export stays here (the wizard imports it). The runner reuses this action verbatim for `burner_profile`. |
| `apps/web/components/questionnaire/blocking-top-bar.tsx` | `"use client"` island | **CREATE** | The NEW sticky `$card` header: TitleRow (`title` + `<RequiredChip>` + Sign-out `<Button variant="link" asChild><a href={signOutHref}>`) over a ProgressRow (`<ProgressBar labelMode="question" showPercent={false}>`). Props `{ title, current, total, signOutHref?, className? }`. Pure presentation, fetches nothing. Own plan: `organism-blockingtopbar.md`. |
| `apps/web/components/questionnaire/blocking-notice.tsx` | `"use client"` island (or thin wrapper) | **CREATE** | The persistent destructive banner: `<Alert tone="destructive" persistent>You can't use the app until this is finished.</Alert>`. Never dismisses. Realised via the PROMOTE'd `Alert` molecule (`molecule-alert.md` §Build step 7 + Absorbs "BlockingNotice"); this file is the sticky-band wrapper the runner shell mounts beneath the top bar. May be inlined into the shell rather than its own file (build reconciliation). |
| `apps/web/components/questionnaire/required-chip.tsx` | `"use client"` (or inline) | **CREATE** | The lock-icon "Required" pill: `<Badge tone="destructive" variant="soft-tint" icon={Lock}>Required</Badge>` (`atom-badge.md` Absorbs "RequiredChip"). Reusable on S27 queue rows too. May be inlined into `BlockingTopBar` since it is a single Badge invocation (build reconciliation; the board drew a neutral `$muted` chip — tone reconciliation, see Open items #4). |
| `apps/web/components/questionnaire/runner.tsx` (runner shell) | `"use client"` island | **CREATE** | Thin wrapper that owns/observes the wizard's `pageIndex` (controlled prop or `onStepChange` callback — reconciliation), derives **question-paced** `current`/`total`, and renders `<BlockingTopBar sticky>` + `<BlockingNotice sticky>` + `<QuestionnaireWizard variant="runner" …>`. Keeps the chrome dumb. **Alternative:** instead of a separate shell, extend the wizard with `variant="runner"` + a `chrome` slot and let it render the chrome internally — see `organism-questionnairewizard.md` Step 4 (the two approaches are architecture-neutral; pick at build). |
| `apps/web/components/questionnaire/wizard.tsx` | `"use client"` island | **MODIFY (own plan)** | `organism-questionnairewizard.md`: swap private `ProgressBar` for the promoted atom; swap hand-rolled banner for `Alert`; add `variant`/`chrome` for the runner; surface the in-card `InlineAlert` for the runner variant; flip the primary label to "Submit"/"Submitting…". Import re-point (`validateIdNumber` → `@camp404/core`). |
| `apps/web/components/questionnaire/question.tsx` | `"use client"` island | **MODIFY (own plan)** | `organism-questionfield.md`: board affordance swaps for the 5 diverging kinds (single_select→OptionCardGroup, scale/toggle→SegmentedControl, multi_select→chip grid, date→DateControl). The runner is agnostic to these — reached transitively. |
| `apps/web/app/onboarding/questionnaire/blocking-top-bar.test.tsx` | test | **CREATE** | RTL unit for the chrome (own plan `organism-blockingtopbar.md` Step 4). Co-located with the component (`apps/web/components/questionnaire/`). |
| `error.tsx` / `not-found.tsx` for this segment | boundary | **NONE** | Not present today; not required — failures surface in-wizard (`_form`/`_root` Alert + persistent BlockingNotice); gate redirects handle the rest. A shared `ErrorBoundary` (`organism-errorboundary.md`) is a global concern, not this segment's. |
| `/api/**` route handler | route handler | **NONE** | This surface owns no API route. Voice transcription (`/api/voice/transcribe`, plan 07) and avatar upload (plan 09 `avatar-blob.ts`) are reached only via leaf components inside `QuestionField`; they belong to those domains. |

**Client/server boundary (confirmed against the tree):** `page.tsx` is the only server
component; it does all auth/gate/pre-fill, resolves the `title` server-side, and renders
the client subtree. The blocking chrome **must sit inside the client island** because
`BlockingTopBar`'s sticky `ProgressBar` reflects the wizard's client `pageIndex` (the bar
re-renders as the user pages) and `BlockingNotice` must mount into stable DOM so its
`role="alert"` announces (`organism-blockingtopbar.md` §server/client split;
`molecule-alert.md` a11y notes). `BlockingTopBar`/`BlockingNotice`/`RequiredChip` are
presentational but live in the client tree via the runner shell.

---

## Components composed

The runner host composes **the runner shell** directly; the shell composes the chrome +
the wizard; everything else is transitive through the wizard. Where each renders:

| Component | Plan | Rendered by | Server/client |
|---|---|---|---|
| **Runner shell** (`runner.tsx`, app-local NEW) | `organism-questionnairewizard.md` §Composition / Step 4 | `page.tsx` (direct mount, runner variant) | `"use client"` island |
| **BlockingTopBar** (NEW, app-local) | `components/organism-blockingtopbar.md` | runner shell (sticky top) | `"use client"` (in island) |
| **RequiredChip** = Badge (NEW → `@camp404/ui`) | `components/atom-badge.md` (Absorbs "RequiredChip") | BlockingTopBar TitleRow | client |
| **ProgressBar** (PROMOTE → `@camp404/ui`) | `components/atom-progressbar.md` | BlockingTopBar ProgressRow (`labelMode="question"`, `showPercent={false}`) | client |
| **Button** (Sign out, link variant) | `components/atom-button.md` | BlockingTopBar TitleRow | client |
| **BlockingNotice** = Alert (PROMOTE → `@camp404/ui`) | `components/molecule-alert.md` (`tone="destructive" persistent`) | runner shell (sticky, below the bar) | client |
| **QuestionnaireWizard** (REUSE, app-local) | `components/organism-questionnairewizard.md` | runner shell (`variant="runner"`) | `"use client"` island |
| **Alert** (`_form`/`_root` banner) | `components/molecule-alert.md` | wizard (in-body) | client |
| **InlineAlert** = Alert (in-card validation) | `components/molecule-alert.md` (`tone="destructive"`) | wizard / CurrentQuestionCard, runner variant only | client |
| **Button** (footer Back + Submit/Submitting) | `components/atom-button.md` | wizard footer | client |
| **QuestionField** (per-kind host = CurrentQuestionCard body) | `components/organism-questionfield.md` | wizard (`page.questions.map`) | client |
| OptionCardGroup (single_select radio / multi_select checkbox + chip-grid) | `components/molecule-optioncardgroup.md` | QuestionField arms | client |
| SegmentedControl (scale segmented; toggle; slider as segments) | `components/molecule-segmentedcontrol.md` | QuestionField arms | client |
| DateControl (`date`) | `components/molecule-datecontrol.md` | QuestionField `date` arm | client |
| Combobox (`combobox`, e.g. country) | `components/molecule-combobox.md` | QuestionField `combobox` arm | client |
| Slider (`slider`; `scale` underlying) | `components/atom-slider.md` | QuestionField | client |
| Input / Textarea / Label / Checkbox | `components/atom-input.md` / `atom-textarea.md` / `atom-label.md` / `atom-checkbox.md` | QuestionField / OptionCardGroup internals | client |
| AvatarUpload (`image`) | `components/molecule-avatarupload.md` | QuestionField `image` arm | client |
| LongTextField + DictatePill → RecorderPanel (`long_text` dictation) | `components/molecule-dictatepill.md` + `components/molecule-recorderpanel.md` (LongTextField app-local in `question.tsx`) | QuestionField `long_text` arm | client |

The brief's S26 draws only 4 of the 10 kinds (single_select-as-radio, multi_select,
long_text, scale); the other 6 (`slider`, `short_text`, `date`, `toggle`, `combobox`,
`image`) are **not dropped** — they are hosted identically to S05 whenever the current
question is of that kind (brief §Components used / Divergence "S26 draws only 4 of 10
kinds"). The per-kind → control mapping is realised **entirely inside `QuestionField`** —
the runner host and shell are agnostic to it.

No canvas reusables (`TopChrome`, `SectionHeader`, `DetailHeader`, `GridTile`, `EmptyState`,
`CaptainLock`) are used — the runner deliberately replaces normal app chrome with the
blocking chrome (you are *behind* the app, not in it; brief §Components used).

---

## Services & data

All data is resolved **server-side in `page.tsx`** and passed to the client subtree as
props; the wizard, the runner shell, and the chrome fetch nothing (wizard plan §"What it
fetches vs receives"; BlockingTopBar plan §"fetches nothing and receives everything").

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
- **The blocking `required_action` title** — sourced from `required_actions.title` /
  `questionnaire_activations.title` (brief §Data; BlockingTopBar plan API). To distinguish
  the runner variant from plain onboarding and to title the bar, the host resolves the
  pending blocking action. `getPendingRequiredActions(campUser.id)` (`@/lib/users` →
  `@camp404/db/activations`, REUSE — the same read the gating spine uses) returns the
  pending blocking rows incl. `title`; the host finds the `burner_profile` row and passes
  its `title` to `BlockingTopBar` (fall back to the questionnaire display name if the row
  carries no title). This is the read the host adds for this surface — **see Open item #1**
  on whether the variant is keyed off the presence of the pending row or off an explicit
  `?required` param.
- `QUESTIONNAIRE` catalogue — `@/lib/questionnaire` today → `@camp404/core` after plan 03
  Step 1 (the one cross-cutting import change touching this surface).

**Passed as props to the runner shell → wizard:** `questionnaire` (static catalogue),
`initialResponses` (pre-filled + merged decrypted ID), `action={saveBurnerProfile}`,
`variant="runner"`, `blockingTitle`/`title` (from the resolved required-action),
`persistProgress=true` (burner_profile), `submitLabel="Submit"` (runner — vs onboarding's
"Finish"), `firstStepSignOut` semantics (the bar's Sign out is the escape).

**Server action it calls (the wizard `action` prop):** `saveBurnerProfile(raw, final)`
(`actions.ts`, **REUSE** — identical to surface 04). It composes, in order:
- `validateResponses(QUESTIONNAIRE, raw)` — `@camp404/types` (final-submit only).
- `splitIdNumber(responses)` — `@camp404/db/id-documents` (PII split; `id.number` →
  encrypted `users.passport_encrypted`/`sa_id_encrypted`, `id.type` + `birthday` stay in
  `responses`).
- `upsertBurnerProfile({ userId, version, responses: cleaned, markComplete: final })` —
  `@/lib/users` → `@camp404/db/burner-profile`. **EXTEND (plan 03 Step 3, cross-surface):**
  COALESCE `completedAt` so a re-submit (e.g. a re-activated newer version) never overwrites
  the first completion timestamp — data-integrity, no DDL; not a blocker for the runner's
  green path.
- `setIdDocuments(campUser.id, { idType, idNumber })` — encrypt onto the ID columns.
- `setProfileImage(campUser.id, image|null)` — mirror `responses["profile.image"]` →
  `users.profile_image_url` (runs on progress + final).
- `satisfyBurnerProfileAction(campUser.id)` — `@/lib/users` → `satisfyRequiredAction`
  (final-only); **satisfies the blocking `burner_profile` required-action**, which is what
  releases the gate so the post-redirect spine routes on.
- `redirect("/")` — final-only, re-enters the gating spine.

**@camp404/core helpers (post-extraction, architecture §Hybrid):** `validateIdNumber`
(client cross-field, via the wizard), `QUESTIONNAIRE` catalogue + option arrays (host +
action). The validation **engine** (`validateResponses`/`validateOne`/`flattenQuestions`)
stays in `@camp404/types`. The blocking chrome uses **no `@camp404/core` helper** — it is
pure presentation (BlockingTopBar plan §"@camp404/core helpers: none"). No `@camp404/core`
import is added to `page.tsx`/`actions.ts` beyond re-pointing the existing `QUESTIONNAIRE`
import.

**Data written/read (no new table — brief §Data & enums):** `burner_profiles` (`responses`
jsonb minus `id.number`; `version`; `completed_at` on final); `users`
(`profile_image_url`, `passport_encrypted`/`sa_id_encrypted`); `required_actions`
(`burner_profile` satisfaction + the `title`/status read). **NEW schema: none.** The
runner is fully expressible on existing tables — `required_actions` +
`questionnaire_activations` already model the obligation (brief §Data "NEW schema: none").
The redesign's one schema change (`captain_promotion_requests`, migration 0012) is the
**roster** domain and does not touch this surface (architecture §The one schema change;
service plan 03 §Schema "Schema change: NONE in this domain"). The future
multi-questionnaire sequential queue (Safety / Dietary / Agreements, S27) is **app logic
over existing `required_actions`** — no schema change.

> Future blocking runners (dietary / driver / agreements) reuse this exact chrome + engine
> with a generic satisfy-on-complete action against their own domain table
> (`dietary_requirements`, `driver_profiles`) + `satisfyRequiredAction` — deferred until
> `ACTION_ROUTES` maps their routes (open item #2; service plan 03 §Consumers line 22).

---

## Gating

- **Gate level:** this surface **IS a gate.** It is reached only because the user has a
  pending **blocking** `required_action` (`type='questionnaire'`, `blocking=true`,
  `actionKey='burner_profile'`). The gating spine (`app/page.tsx:47–48`) redirects here via
  `nextGate(getPendingRequiredActions(...))` + `ACTION_ROUTES.burner_profile`; a legacy
  fallback (`:53–56`) also routes incomplete profiles here. Completing it satisfies the
  required-action and releases the app.
- **Position in the spine:** *between* the invite gate (`/signup/required`) and the
  approval gate (`/pending-approval`). Order (`app/page.tsx`): unauth → Landing; no invite
  → `/signup/required`; **pending blocking required-action → this runner**; profile-incomplete
  legacy fallback → this runner; not approved → `/pending-approval` (brief §States "Gating
  context").
- **Invite gate (defence-in-depth):** `!hasCampAccess` → `redirect("/signup/required")` in
  BOTH `page.tsx:21–23` and `actions.ts:32–34`.
- **Completion gate:** `profile.completedAt` set → `redirect("/")` in `page.tsx:26–28`; the
  runner cannot be re-entered once satisfied. A **re-activated newer `required_actions.version`**
  re-opens the gate (brief §Validation "Already-complete"; `meetsRequiredVersion` decides).
- **Pending/rejected approval:** NOT handled here; the post-completion `redirect("/")`
  re-enters the spine, which routes pending → `/pending-approval` (a different surface
  reached *after* this one).
- **Empty queue / nothing required:** if no pending blocking action maps to a route, the
  user is never routed here — the spine falls through to home. There is **no "no
  questionnaires" state inside the runner** (brief §States "Empty queue").
- **Preview-but-locked (CaptainLock / rank gating): N/A — explicitly does NOT apply.**
  The runner is identity-only, per-user, rank-agnostic — there is no rank-gated content, so
  locked decision 3's CaptainLock treatment (render structure + no data + inert; NOT a
  redirect) does **not** apply here. Record this explicitly so the engine is never
  retro-fitted with rank gating (brief §States line 105; BlockingTopBar plan §"Preview-but-
  locked … N/A"; QuestionField plan §"preview-but-locked does NOT apply"). **No `CaptainLock`
  import, no inert/zero-data render, no requireClearance, no redirect-as-lock anywhere on
  this surface.** The runner returns real data for *its own* user only.

---

## States

Driven by the wizard + chrome (own plans §States); the host contributes only the
server-render loading window and the gate redirects. The S26 `DocsSection` blocks
(VALIDATION ERROR / MULTI-SELECT / LONG-TEXT / SCALE / LAST QUESTION / SUBMITTING) are a
designer gallery, **not** screen regions — each is a state of the one `CurrentQuestionCard`
(brief §5).

- **Empty (unanswered current question)** — `CurrentQuestionCard` renders the unfilled
  control for its kind (no radio selected / all unchecked / placeholder textarea / middle
  scale step pre-highlighted but uncommitted). Primary = "Next" and **enabled** (validation
  runs on press, not on entry).
- **Populated** — control reflects `responses[question.id]`; selected radio/check/segment
  styled `$primary`; textarea filled. For burner_profile the decrypted `id.number`/`id.type`
  are merged into the pre-fill; progress-saved partial fills survive reload.
- **Loading (route mount)** — `page.tsx` (`force-dynamic`) awaits session → camp-user →
  profile → decrypted ID (+ the pending required-action title) before first paint. **No
  client skeleton** — the wizard mounts already hydrated; treat any pre-paint gap as server
  render time. `BlockingTopBar` is not rendered until `title`/`current`/`total` are
  available, so it has no independent loading state.
- **Validation-error (field)** — `validatePageLocally` (or server per-field error) →
  message under the offending field via `QuestionField`'s `error` prop (`question.tsx:78–82`).
  Cross-field `id.number` runs `validateIdNumber`.
- **Validation-error (in-card, runner-specific)** — S26 `Block-VALIDATION ERROR`: the
  runner variant **additionally** surfaces an in-card `InlineAlert` ("Please answer to
  continue.") above the field, AND keeps the per-field message (brief Divergence #3 — adopt
  both: card-level alert + field-level message). The offending field is reset to its
  un-selected styling.
- **Validation-error (page/form)** — `_form` (client catch) / `_root` (server non-field)
  → `Alert tone="destructive" role="alert"` banner near the top of the body
  (`wizard.tsx:189–196`, re-skinned to the `Alert` molecule). The persistent `BlockingNotice`
  is a *separate* sticky band that is always present regardless.
- **Submitting** — on the **last** question, Submit enters `isPending` (`useTransition`):
  primary label flips to **"Submitting…"** at `op:0.6` and is disabled; Back disabled.
  Fields are NOT independently disabled mid-submit (matches live). `BlockingTopBar` is
  **inert during submit** — same progress/title, Sign out stays available. Sub-states:
  `image` "Uploading…" (AvatarUpload), `long_text` dictation requesting/recording/processing
  (RecorderPanel) — owned by QuestionField.
- **Success** — **no in-runner success card.** On final submit the action `redirect("/")`
  after `markComplete` + gate satisfaction; the completion gate bounces any re-entry. The
  post-submit success + queue UI is the *separate* **S27** surface (the "MORE REQUIRED" /
  "ALL DONE" bridge); if more blocking actions remain the spine routes to the next runner.
- **Disabled** — Back disabled on the first question and while `isPending`; primary disabled
  while `isPending`. Individual fields never independently disabled. The Sign-out link is
  never disabled (escape hatch).
- **page-0 / first question** — left footer slot = **no Back** (the runner uses the
  `BlockingTopBar` Sign out as its first-step escape, mirroring `firstStepSignOut`; Back is
  simply disabled on Q1 — brief §1, §Open questions #9). The bar's Sign out → `/auth/sign-out`.
- **Last question** — S26 `Block-LAST QUESTION`: card may carry a "final question — review
  your answers, then submit" helper; primary label = "Submit".
- **Save-failed** — thrown action → `_form` banner ("We couldn't save your answers just
  now… let a camp captain know.") + retry; user stays on the page; nothing silently
  swallowed (`wizard.tsx:117–122, 143–145`; `actions.ts:81–93`).
- **Gating states relevant here** — invite-revoke mid-flow: the next save redirects to
  `/signup/required` (defence-in-depth in the action). Already-complete: host redirects to
  `/`. Re-activated newer version: gate re-opens. **No preview-but-locked state (N/A
  above); no offline/sync; no budget/over-target states.**

---

## Build steps — ordered, with prerequisites + acceptance + tests

> Each step is independently green-CI-clean (MEMORY: don't strand post-green follow-ups).
> Most prerequisites are the component + service phases that land elsewhere — this surface
> is **assembled last**, after the engine + chrome pieces exist. The runner shares its
> engine, action, and field machine 1:1 with surface 04 (`04-onboarding-wizard.md`); this
> plan's net-new work is the chrome + the variant selection.

**Prerequisites (must land first, from architecture + component/service plans):**
- **P0 Foundations** (`foundations-tokens.md`): status tokens (`success`/`warning`) +
  `$destructive`/`$primary` alpha utilities (so the BlockingNotice/InlineAlert tints stop
  using raw `#f83e5a1a`/`var(--color-destructive)/10`) + `--font-mono` (JetBrains Mono via
  `next/font`) + radius scale. Gates the chrome.
- **P1/P3 core extraction** (service plan 03 Step 1): `@camp404/core` hosts `QUESTIONNAIRE`
  + `validateIdNumber`; the host + action + wizard import re-points. ⛔ owner content
  reconciliations (hardware-competency page count, team-interest 0–5 vs 0–6, copy edits —
  brief §Open questions #7/#8) lock first; they change the catalogue the wizard renders,
  not the runner host.
- **P5 UI promotes** (component plans): `ProgressBar` (`atom-progressbar.md`, with
  `labelMode="question"` + `showPercent={false}`), `Alert` (`molecule-alert.md`, with
  `persistent`), `Badge` (`atom-badge.md`, RequiredChip mapping), `Button` (REUSE) — all
  published to `@camp404/ui` before the chrome can import them.
- **Component plans complete:** `organism-questionnairewizard.md` Steps 1–4 (engine +
  `variant`/chrome injection) + `organism-blockingtopbar.md` Steps 1–2 (chrome + shell) +
  `organism-questionfield.md` Steps 1–8 (the 10-kind re-skin).

**Step 1 — Build the NEW app-local blocking chrome (depends on P0 + P5 promotes).**
- Create `apps/web/components/questionnaire/blocking-top-bar.tsx`, `blocking-notice.tsx`
  (or inline the Alert), `required-chip.tsx` (or inline the Badge) per
  `organism-blockingtopbar.md` Step 1: sticky `$card` TitleRow (title + RequiredChip +
  Sign-out link) over a `<ProgressBar labelMode="question" showPercent={false}>` ProgressRow;
  a persistent `<Alert tone="destructive" persistent>` banner beneath.
- Prereq: ProgressBar/Alert/Badge published; P0 tokens. Acceptance: the chrome renders in
  isolation given `{title, current, total}`; sticky positioning; RequiredChip + Sign-out
  (`href="/auth/sign-out"`) + question-paced progress present; persistent notice never
  dismisses; only short-form token classes (no raw hex). Test: `blocking-top-bar.test.tsx`
  (renders title; RequiredChip Badge + lock `aria-hidden`; Sign-out `href` + `signOutHref`
  override; ProgressBar "Question {current} of {total}" + correct fill width; sticky class;
  no percent label; `className` forwarded).

**Step 2 — Build the runner shell + wizard `variant="runner"` (depends on Step 1 + wizard
plan Step 4).**
- Add the runner shell (`runner.tsx`) — or extend the wizard with `variant`/`chrome` — that
  lifts `pageIndex`, derives **question-paced** `current`/`total`, and mounts
  `<BlockingTopBar sticky>` + `<BlockingNotice sticky>` + `<QuestionnaireWizard
  variant="runner" submitLabel="Submit">`. Remove/relocate the wizard's private `ProgressBar`
  so progress isn't drawn twice (owned by `atom-progressbar.md` Step 5). For the runner
  variant: flip the primary label to "Submit"/"Submitting…"; surface validation as the
  in-card `InlineAlert` in addition to the field-level error.
- Prereq: Step 1 + `organism-questionnairewizard.md` Steps 2–4. Acceptance: advancing the
  wizard updates the sticky `ProgressBar`; the BlockingNotice stays pinned and never
  dismisses; `image`/`scale`/`long_text` lone pages still go `fullScreen`; the onboarding
  variant renders unchanged (no chrome). Test: render-variant unit (chrome present for
  `runner`, absent for `onboarding`/`replay`); first-page shows Sign-out not Back; submit
  shows "Submitting…".

**Step 3 — Re-point the catalogue import in the host + action (no behaviour change).**
- `page.tsx:10` and `actions.ts:15`: `@/lib/questionnaire` → `@camp404/core`.
- Prereq: service plan 03 Step 1 (catalogue moved). Acceptance: `tsc`/build green; existing
  `actions.test.ts` + e2e pass unchanged. Test: re-run existing suites.

**Step 4 — Wire the blocking variant into the host page (the assembly gate).**
- In `page.tsx`, resolve the pending blocking `burner_profile` required-action (via
  `getPendingRequiredActions`, REUSE) and its `title`; when reached as a blocking
  required-action, render the **runner shell** (variant="runner") passing the resolved
  `title`, replacing the static `<header>Build your burner profile</header>` (`:44–50`).
  Keep `firstStepSignOut` semantics, the auth/invite/completion gate, and the ID pre-fill
  unchanged. Apply the P0 token codemod on any remaining chrome. Reconcile **how the variant
  is chosen** (presence of the pending row vs an explicit param) — see Open item #1; default
  to keying off the pending blocking row so the runner chrome appears exactly when the gate
  routed the user here, and the plain onboarding chrome (surface 04) shows otherwise.
- Prereq: Steps 1–3 + the service-layer reads. Acceptance: a user with a pending blocking
  `burner_profile` action renders the S26 blocking chrome (sticky title + Required + Sign
  out + question-paced progress + persistent red notice) over the same field machine; all
  10 field kinds still render; final Submit satisfies the action and redirects to `/`; the
  completion gate bounces re-entry; no functionality dropped (paging, two-tier validation,
  per-Next progress persistence, fullScreen single-question pages, save-failed retry,
  cross-field `id.number`). Data shapes unchanged; no schema change.

**Test notes (E2E_TEST_MODE seam):**
- The existing **`apps/web/tests/e2e/onboarding-questionnaire.spec.ts`** is the canonical
  regression for the shared engine and **must stay green** in both onboarding and
  runner-chrome modes. It runs under `E2E_TEST_MODE=1` + `INVITE_CODES=TEST-INVITE`
  (`playwright.config.ts`); the in-memory backend stores the ID **raw** (encryption
  bypassed), so a save cannot throw there — the throw→`_form` recovery is covered by the
  **wizard/action unit tests**, not e2e. When the chrome lands, **extend the e2e** to assert
  the runner presentation: the persistent BlockingNotice copy ("You can't use the app until
  this is finished."), the "Required" chip, the question-paced "Question N of N" progress,
  the top-bar Sign out, and that final Submit redirects to `/`. When the board affordances
  land (QuestionField re-skin), update selectors for the swapped controls (the current
  `getByRole("radio", { name: "Passport" })` targets today's `ToggleField`; ID type becomes
  a SegmentedControl segment, single_selects become radio cards) — keep the heading-exact
  assertions ("About you", "A bit about you").
- `satisfyBurnerProfileAction` is a **no-op under E2E test mode** (the fallback gate covers
  it, `actions.ts:77–78`) — assert completion via the post-Submit redirect to `/`, not via
  the required-action row, in e2e.
- `actions.test.ts` (typed `_form` error path + ok-on-non-final-save) is **REUSE** — its
  imports shift only if the catalogue import moves (it imports `QUESTIONNAIRE` indirectly via
  the action). The runner reuses this action verbatim, so this test already covers the
  runner's save/error behaviour.

---

## Open items — surface-specific decisions (cross-ref `design/spec/open-questions.md`)

1. **How the runner variant is selected on the shared route** (architecture/host wiring).
   Surfaces 04 (onboarding) and 24 (runner) share `/onboarding/questionnaire` and the same
   engine. The host must pick the chrome: **(a)** key off the presence of a *pending blocking*
   `burner_profile` required-action (recommended — the runner chrome appears exactly when the
   gate routed the user here; falls back to plain onboarding chrome otherwise), or **(b)** an
   explicit `?required` query param set by the gating redirect. Confirm before Step 4. The
   `title` is resolved from `required_actions.title` / `questionnaire_activations.title`
   either way. Owner: lead architect.
2. **`ACTION_ROUTES` only maps `burner_profile` today** (`apps/web/lib/required-actions.ts:7–11`).
   Dietary / driver / agreements activations stay `pending` but cannot gate until their
   bespoke runner routes exist; they reuse this exact chrome. Confirm whether those routes
   ship in this redesign or remain deferred (brief §Open questions #2). Owner: product.
3. **Sequential required-queue scope** (S27, Safety → Dietary → Agreements). Expressible via
   the existing `required_actions` engine with **no schema change** (decisions.md confirms;
   architecture OQ#7). The runner template is queue-agnostic — it satisfies its own row and
   lets the spine route on. Confirm whether the chained queue ships now or only the single
   `burner_profile` gate exists day-one. Owner: product.
4. **RequiredChip tone + Sign-out link tone** (board vs token system). Board draws the chip
   neutral (`fill:$muted stroke:$border` + lock); the Badge plan maps RequiredChip to
   `tone="destructive" variant="soft-tint"` (reads as "blocking"). Board draws Sign out as
   Inter/13/500/`$accent`; Button `variant="link"` resolves `text-primary`. Pick one each —
   recommend the Badge plan's destructive chip + a `variant="link"` with an accent override
   (brief §Divergences; BlockingTopBar plan §Build reconciliations). Owner: design.
5. **In-card `InlineAlert` vs under-field error** (brief §Open questions #4). Adopt both
   (card-level alert + field-level message) per the board, or just one? Recommend both.
   Owner: design.
6. **Token reconciliation** — `#f83e5a1a` (destructive/10%) / `#ff008c1a` (primary/10%) raw
   hex → semantic-token alpha utilities (+ the `success`/`warning`/`info` status tokens
   foundations calls for). Cosmetic, batchable across surfaces (brief §Open questions #5;
   foundations-tokens.md). Owner: design.
7. **Progress copy** — "Question N of N" (board) vs "Step N of M" (live). Adopt board
   wording for the runner via `labelMode="question"`; confirm no analytics depends on the
   live "Step" string (brief §Open questions #3; ProgressBar plan). Owner: design/product.
8. **Source bugs to carry as known issues (flag, do not patch — house policy / MEMORY):**
   (a) the SA-ID/passport `id.number` rule is **client/wizard-only** — the server validates
   `id.number` merely as `short_text ≤ 40`, so an invalid-but-short document number passes
   server validation and persists (brief §Validation; service plan 03 Step 5 is owner-gated,
   default skip). (b) `date` `validateOne` accepts impossible calendar dates (`2026-02-31`)
   via `Date.parse` rollover. Document; do not silently fix. Owner: data owner.
9. **First-question Back vs Sign out** (brief §Open questions #9). The runner uses the
   top-bar Sign out as its escape hatch; confirm Back is simply disabled on Q1 (matching
   `firstStepSignOut`) rather than offering a second sign-out in the footer. Owner: design.
10. **Content reconciliations gating the catalogue render** (cross-ref onboarding plan +
    architecture OQ#5): hardware-competency page count (12 vs 11), team-interest range 0–5
    vs 0–6 (brief §Open questions #7/#8). These change the catalogue/field machine the runner
    renders, not the runner host wiring. Owner: product. (Non-schema.)
