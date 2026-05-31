# 04 — Onboarding questionnaire wizard (step machine)

**Files covered:**
- `apps/web/app/onboarding/questionnaire/page.tsx` — server component: auth + invite gate, redirect-if-complete, pre-fills responses (merges decrypted ID number), renders the wizard.
- `apps/web/app/onboarding/questionnaire/actions.ts` — `saveBurnerProfile` server action: validates (on final), splits/encrypts ID number, upserts the profile, mirrors photo, satisfies the gating required-action, redirects home.
- `apps/web/components/questionnaire/wizard.tsx` — `QuestionnaireWizard` client step machine: page nav, progress, per-page local validation, error banner, Skip/Next/Finish, sign-out escape, `ProgressBar`.
- `packages/types/src/questionnaire.ts` — Zod schemas for `Questionnaire`/`QuestionnairePage`/`Question` (10 kinds), `validateResponses` (final-submit validator), `validateOne`, `flattenQuestions`, `displayResponseValue`, `diffResponses` (last two used by unit 12, not here).
- `apps/web/lib/questionnaire.ts` — the live `QUESTIONNAIRE` constant: `version` + the 12 pages and their questions/options.
- `apps/web/lib/id-validation.ts` — `validateIdNumber`: cross-field SA-ID/passport format check used in local validation.
- `packages/db/src/id-documents.ts` — pure `splitIdNumber` / `mergeIdNumber` / `idColumnsFor` mapping for moving the ID number in/out of `responses`.
- `apps/web/lib/users.ts` — backend dispatch (`upsertBurnerProfile`, `setIdDocuments`, `setProfileImage`, `getBurnerProfile`, `getIdDocuments`, `satisfyBurnerProfileAction`, `hasCampAccess`, `ensureCampUser`); real Drizzle backend vs in-memory E2E test backend.
- `packages/db/src/burner-profile.ts` — `upsertBurnerProfile` (UPSERT on `user_id`), `getBurnerProfileByUserId`, encrypted ID-column read/write.
- `packages/db/src/schema.ts` — `burner_profiles` table + `users.passport_encrypted` / `sa_id_encrypted` / `profile_image_url` columns.
- `packages/db/src/activations.ts` — `satisfyRequiredAction` (version-gated completion of the `burner_profile` blocking action).

**Purpose:** The mandatory burner-profile questionnaire shown right after signup, gating entry to the app (the `burner_profile` blocking required-action). It is a page-at-a-time wizard: a single client component (`QuestionnaireWizard`) drives a catalogue-defined sequence of pages (intro interstitials + question pages), validating each page locally before advancing, persisting progress on every Next (in onboarding mode), and on final submit running full server-side validation, splitting the government ID number into encrypted `users` columns, mirroring the profile photo, marking the profile complete, satisfying the gate, and redirecting home. The same `QuestionnaireWizard` is reused by the replay/edit flow (unit 12) with different props; this unit documents the onboarding configuration.

## Features

### Server page — gate, pre-fill, redirect-if-done (`page.tsx`)
- `export const dynamic = "force-dynamic"` — reads the Neon Auth session on every request (`page.tsx:16`).
- Auth gate: `getAuthenticatedUserOrRedirect()` redirects to `/auth/sign-in` if no session (`page.tsx:19`, `auth.ts:40-42`).
- Camp-user resolution: `ensureCampUser(authUser)` (creates/loads the camp_user row, redeems invite cookie) (`page.tsx:20`).
- Invite gate: `if (!hasCampAccess(campUser, authUser.primaryEmail)) redirect("/signup/required")` (`page.tsx:21-23`). `hasCampAccess = isGodEmail(email) || !!user.inviteCode` (`users.ts:219-224`).
- Completion gate: `const profile = await getBurnerProfile(campUser.id); if (profile?.completedAt) redirect("/")` — a completed profile cannot re-enter onboarding; it bounces home (`page.tsx:24-28`).
- Pre-fill assembly: loads `getIdDocuments(campUser.id)` (decrypted owner ID), defaults to `{ idType: null, idNumber: null }` when no row; then `mergeIdNumber(profile.responses ?? {}, id)` rehydrates `id.number` (and `id.type`) into the response map, because the ID number lives encrypted on `users`, NOT in `responses` (`page.tsx:30-40`).
- Renders header copy: H1 "Build your burner profile"; subtitle "A few questions so the camp knows who's arriving in the dust. Takes about two minutes." (`page.tsx:45-49`).
- Mounts `<QuestionnaireWizard questionnaire={QUESTIONNAIRE} initialResponses={initialResponses} action={saveBurnerProfile} firstStepSignOut />` (`page.tsx:51-56`). Note: onboarding does NOT pass `persistProgress`, `onComplete`, or `submitLabel` — so `persistProgress` defaults `true`, `submitLabel` defaults `"Finish"`, `firstStepSignOut` is `true`.
- Layout wrapper: `<main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 py-8">` (note `max-w-2xl`, wider than the global `max-w-lg`) (`page.tsx:43`).

### Save action — validate, split-encrypt, upsert, satisfy gate (`actions.ts`)
- `"use server"`; signature `saveBurnerProfile(rawResponses: unknown, final: boolean): Promise<SaveResult>` where `SaveResult = { ok: true } | { ok: false; errors: Record<string, string> }` (`actions.ts:1,17-29`).
- Re-runs the SAME auth + invite gate as the page on every call (defence in depth): `getAuthenticatedUserOrRedirect` → `ensureCampUser` → `hasCampAccess` else `redirect("/signup/required")` (`actions.ts:30-34`).
- Final-only full validation: `if (final) { const result = validateResponses(QUESTIONNAIRE, rawResponses); if (!result.ok) return { ok: false, errors: result.errors } }`. Non-final saves tolerate missing required answers (user still working through pages) (`actions.ts:36-41`).
- Coerces non-object payloads to `{}` (`actions.ts:43-46`).
- Splits the ID number: `const { cleaned, idType, idNumber } = splitIdNumber(responses)` — removes `id.number` from the JSONB; `id.type` stays in `cleaned` (`actions.ts:48-52`).
- Upsert: `upsertBurnerProfile({ userId, version: QUESTIONNAIRE.version, responses: cleaned, markComplete: final })` (`actions.ts:54-59`).
- ID encryption write: `if (idNumber) await setIdDocuments(campUser.id, { idType, idNumber })` — runs on progress AND final saves (any time an ID number is present). Real backend AES-256-GCM-encrypts via `PGCRYPTO_KEY`; throwing here (missing/short key) is caught (`actions.ts:61-65`).
- Profile-photo mirror: reads `cleaned["profile.image"]`; if it's a string, `setProfileImage(campUser.id, image.length > 0 ? image : null)` — mirrors the URL onto `users.profile_image_url` so header/profile reads need not parse JSON. Runs on progress + final saves (`actions.ts:67-73`).
- Final-only gate satisfaction: `if (final) await satisfyBurnerProfileAction(campUser.id)` — completes the `burner_profile` blocking required-action (no-op under E2E test mode; the legacy `completedAt` fallback gate covers it) (`actions.ts:75-80`, `users.ts:204-209`).
- Error handling: all persistence wrapped in try/catch; on throw logs `"saveBurnerProfile persistence failed"` server-side and returns `{ ok: false, errors: { _form: "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know." } }` (`actions.ts:81-93`).
- Final redirect lives OUTSIDE the try/catch: `if (final) redirect("/")` (the redirect throws a control-flow signal that must escape the catch), then `return { ok: true }` for the non-final path (`actions.ts:95-98`).

### Wizard step machine (`wizard.tsx`)
- Local state: `pageIndex` (number, init 0), `responses` (init = `initialResponses`), `errors` (`Record<string,string>`, init `{}`), `isPending` via `useTransition` (`wizard.tsx:58-62`).
- Derived: `page = questionnaire.pages[pageIndex]`; `isLast = pageIndex === pages.length - 1`; `if (!page) return null` (out-of-range guard) (`wizard.tsx:64-67`).
- `setResponse(id, value)`: merges value into `responses` AND clears that field's error if present (`wizard.tsx:69-77`).
- Progress: `<ProgressBar current={pageIndex + 1} total={pages.length} />` — percentage bar (`Math.round((current/total)*100)`) plus literal text `Step {current} of {total}` (`wizard.tsx:187, 263-277`).
- Page rendering: intro pages render a centered full-screen `heading` + `body` section; question pages render `title`, optional `subtitle`, then map each question through `<QuestionField>` (unit 20) passing `value`, `onChange`, `error`, `fullScreen` (`wizard.tsx:198-236`).
- Error banner: `formError = errors["_form"] ?? errors["_root"]`; rendered as `<p role="alert">` with destructive styling when set (`wizard.tsx:176, 189-196`).
- Footer controls: left slot = "Sign out" link (page 0 + `firstStepSignOut`) OR a "Back" button (disabled on page 0 or while pending); right slot = submit button labelled `submitLabel` when `isLast` else `nextLabel` (`Skip`/`Next`), disabled while `isPending` (`wizard.tsx:238-258`).
- Form submit: `onSubmit` preventDefaults and routes to `handleSubmit()` if `isLast` else `handleNext()` (so Enter advances) (`wizard.tsx:179-184`).

## User actions & interactions
- **Answer a question** → `QuestionField.onChange` → `setResponse(id, value)`; clears that field's inline error immediately (`wizard.tsx:69-77, 224-233`).
- **Next** (`handleNext`): runs `validatePageLocally(page)`; if invalid, stops and shows inline errors. If valid and `persistProgress === false`, advances locally only. If valid and `persistProgress === true` (onboarding), calls `action(responses, false)` inside a transition: on `{ ok: false }` sets `errors` to the returned map and stays; on `{ ok: true }` advances to `Math.min(i + 1, lastIndex)`; on a thrown action sets `errors._form = SAVE_FAILED` (`wizard.tsx:103-124`).
- **Skip** — same control as Next; label flips to "Skip" when the page is a lone optional question with no current answer (still calls `handleNext`, so an unanswered optional saves progress and advances) (`wizard.tsx:160-172`).
- **Back** (`handleBack`): `setPageIndex(Math.max(0, i - 1))`. No save, no validation. Disabled on page 0 (replaced by Sign out when `firstStepSignOut`) or while pending (`wizard.tsx:126-128, 246-254`).
- **Sign out** — only on page 0 when `firstStepSignOut` (onboarding): plain `<a href="/auth/sign-out">` escape hatch for someone signed in with the wrong account before creating anything (`wizard.tsx:239-244`).
- **Finish / final submit** (`handleSubmit`): runs `validatePageLocally`; on pass calls `action(responses, true)` in a transition. `{ ok: false }` → set errors, stay. `{ ok: true }` → `onComplete?.()` (onboarding omits `onComplete`; its action redirects server-side so code after `await` never runs). Thrown → `errors._form = SAVE_FAILED` (`wizard.tsx:130-147`).
- **Dictate (mic)** — long-text/idea fields expose a mic per the field renderer (unit 20); transcript appends to the host field. Out of scope here (referenced in catalogue helper copy: "Tap the mic to dictate.").

## States & presentations
Global-states rows that apply to this surface:
- **Empty** — first visit with no saved profile: `initialResponses = {}` (after merge); every field renders unanswered, page 0 = the optional profile-photo page.
- **Loading** — server component awaits session/user/profile/ID before first paint (`page.tsx:19-40`); no client loading spinner — the wizard mounts already hydrated with `initialResponses`.
- **Populated** — returning incomplete user: `profile.responses` pre-fills fields; decrypted `id.number`/`id.type` merged back in (`page.tsx:33-40`). Onboarding persists progress on every Next so a partially filled signup survives reload.
- **Validation-error** — per-field inline errors from `validatePageLocally` (`errors[q.id]`, passed to `QuestionField`); page-level banner for `_form`/`_root`. Final submit can return server-side per-field errors keyed by question id (`actions.ts:39-40`, `wizard.tsx:135-137`).
- **Submitting/pending** — `isPending` (from `useTransition`) disables Back and the submit button during any save action; covers Next-progress saves and final submit (`wizard.tsx:250, 255`).
- **Success** — onboarding: server action `redirect("/")` after `markComplete` + gate satisfaction (no client success UI); the completion gate then bounces any re-entry home (`actions.ts:97`, `page.tsx:26-28`). Replay flow uses `onComplete` for in-place confirmation (unit 12).
- **Disabled** — Back disabled on page 0 and while pending; submit disabled while pending (`wizard.tsx:250, 255`).
- **Invite-gated** — `hasCampAccess` false → `redirect("/signup/required")`, enforced in BOTH page and action (`page.tsx:21-23`, `actions.ts:32-34`).
- **Onboarding-incomplete** — this surface IS the onboarding gate. Completing it satisfies the `burner_profile` blocking required-action via `satisfyBurnerProfileAction` (`actions.ts:79`). The global gating spine routes incomplete users here.
- **Pending-approval / Rejected** — not enforced inside this unit; the post-completion redirect to `/` re-enters the gating spine (app/page.tsx) which then routes pending→`/pending-approval`, rejected→terminal. <!-- low-confidence: this surface does not itself check approval_status; downstream gating is unit 29/gating-spine territory. -->
- **Captain-only-locked** — N/A: onboarding is per-user (the signed-in member); no rank-gated content here.

There are NO offline/sync states and NO budget/over-target states.

## Enums, options & configurable values

### Questionnaire identity
- `QUESTIONNAIRE.version = "2026.05.29-v8"` (`questionnaire.ts:60`). Stored on `burner_profiles.version`; passed to `satisfyRequiredAction` as the completed version (version-gated, see Validation).

### Question kinds (10, discriminated union on `kind`)
`slider`, `single_select`, `multi_select`, `short_text`, `long_text`, `date`, `scale`, `toggle`, `combobox`, `image` (`questionnaire.ts:137-148`).

Per-kind schema defaults (Zod):
- `slider`: `step` default `1` (positive); `required` default `true`; requires `min`, `max` (numbers).
- `single_select`: `options` min 2; `required` default `true`.
- `multi_select`: `options` min 2; `required` default `false`.
- `short_text`: `maxLength` default `120` (int positive); `required` default `true`.
- `long_text`: `maxLength` default `1000` (int positive); `required` default `false`.
- `date`: `required` default `true`; ISO `yyyy-mm-dd` backed by `<input type="date">`.
- `scale`: `steps` min 2; `required` default `true`.
- `toggle`: `options` min 2; `required` default `true`.
- `combobox`: `options` min 2; optional `placeholder` / `searchPlaceholder`; `required` default `true`.
- `image`: `required` default `false`; stored value = public URL (Vercel Blob in prod).

### Page kinds (2)
- `questions` — `id`, `title`, optional `subtitle`, `questions` (min 1).
- `intro` — `id`, `heading`, `body`. No questions, no validation (`questionnaire.ts:153-177`).

### Response value union
`number | string | string[] | boolean | null`; responses are `Record<string, QuestionnaireResponseValue>` (`questionnaire.ts:187-202`).

### The live 12 pages (in order) — `apps/web/lib/questionnaire.ts`
1. `profile_photo` (questions) — "Add a profile photo". Q: `profile.image` (image, optional).
2. `about_you` (questions) — "About you". Qs:
   - `birthday` (date, required)
   - `phone` (short_text, maxLength 40, required)
   - `country` (combobox, required; options = `COUNTRY_OPTIONS`, see below; placeholder "Pick your country…", searchPlaceholder "Search countries…")
   - `id.type` (toggle, required; options `passport`="Passport", `sa_id`="South African ID")
   - `id.number` (short_text, maxLength 40, required)
3. `bio` (questions) — "A bit about you". Q: `bio.statement` (long_text, maxLength 2000, required).
4. `burn_ideas` (questions) — "Your ideas for this year's burn". Q: `ideas.this_year` (long_text, maxLength 2000, optional).
5. `team_interests_intro` (intro) — heading "Indicate your interest in whichever teams you want." + body.
6. `team_interests` (questions) — one slider per team (8): `team_interest.<team>` (slider, min 0, max 5, step 1, minLabel "Not for me", maxLabel "Sign me up", optional). Team values: `kitchen`, `structures`, `power_and_lighting`, `sanitation_and_water`, `health_and_safety`, `art_and_activities`, `ministry_of_memes`, `ministry_of_vibes` (`questionnaire.ts:30-39, 179-189`).
7. `cooking_competency` (questions) — Q `competency.cooking` (scale, required). Steps (value→label): `create`="Good cook — I can create recipes", `teach`="Adequate — I can teach recipes", `follow`="I can follow recipes", `burn`="I might burn recipes".
8. `hardware_competency` (questions) — Q `competency.hardware` (scale, required). Steps: `design`="I design and build rigs from scratch", `build`="I can build to a plan", `assist`="I can hold the torch and pass tools", `novice`="I'd rather not be near the power tools".
9. `leadership_logistics` (questions) — Qs:
   - `team_lead.interests` (multi_select, optional; options = the 8 TEAMS)
   - `logistics.driving` (single_select, required): `yes`="Yes", `no`="No", `maybe`="Maybe — still working it out"
   - `logistics.onsite_before` (single_select, required): `yes_full`="Yes — the whole build week", `yes_partial`="Some of build week", `no`="No — I'll arrive on opening day"
   - `logistics.onsite_after` (single_select, required): `yes_full`="Yes — through to MOOP sweep", `yes_partial`="A day or two", `no`="No — I'm out the morning after"
10. `burn_history` (questions) — Qs:
    - `history.camp404_years` (multi_select, optional): `2019`,`2022`,`2023`,`2024`,`2025`,`2026` (label = same year)
    - `history.afrikaburn_count` (single_select, required): `0`="None — first one", `1_2`="1–2", `3_5`="3–5", `6_plus`="6 or more"
    - `history.other_burns` (long_text, maxLength 1000, optional)
11. `burn_intent` (questions) — Q `intent.this_year` (scale, required). Steps: `definite`="100% coming", `want`="Definitely want to", `try`="Will try", `unsure`="Unsure", `unlikely`="Not likely", `not_coming`="Definitely not".
12. `dietary` (questions) — Qs:
    - `dietary.dislikes` (multi_select, optional; options = DIETARY_INGREDIENTS)
    - `dietary.allergies` (multi_select, optional; options = DIETARY_INGREDIENTS)
    - `dietary.notes` (long_text, maxLength 1000, optional)

So the wizard renders **12 pages** total ("Step N of 12") — `ProgressBar total={questionnaire.pages.length}` renders "Step N of 12" (`questionnaire.ts:62-386`; `wizard.tsx:187, 274`). <!-- 11 kind:"questions" pages + 1 kind:"intro" page (`team_interests_intro`, page 5) = 12 top-level pages. The stale "13-page" claim originates from a source comment at `complete-onboarding/route.ts:6-8`. -->

### DIETARY_INGREDIENTS (value→label) — used by both dislike + allergy multi-selects (`questionnaire.ts:44-57`)
`dairy`="Dairy / lactose", `gluten`="Gluten / wheat", `eggs`="Eggs", `soy`="Soy", `peanuts`="Peanuts", `tree_nuts`="Tree nuts", `shellfish`="Shellfish", `fish`="Fish", `sesame`="Sesame", `alliums`="Onion / garlic", `nightshades`="Nightshades (tomato, pepper, aubergine)", `spicy`="Chilli / heat".

### COUNTRY_OPTIONS (`questionnaire.ts:6-9` + `apps/web/lib/countries.ts`)
Built from `COUNTRIES` (ISO alpha-2 `value`, country `label`), each label prefixed with the flag emoji via `countryFlag(value)`, e.g. "🇿🇦 South Africa". Stored value = the ISO alpha-2 code. 198 entries in the countries list. <!-- a raw `grep -c "value:"` returns 199; the 199th match is the `Country` interface's `value:` field declaration, not a country row, so the real count is 198. -->

### ID document toggle values
`passport`, `sa_id` (`questionnaire.ts:114-117`). `id.type` stays in `responses`; `id.number` is the encrypted-out field.

### Wizard tunables / literals
- `submitLabel` default `"Finish"`; `nextLabel` = `"Skip"` (lone unanswered optional) else `"Next"` (`wizard.tsx:55, 172`).
- `persistProgress` default `true`; `firstStepSignOut` default `false` (onboarding sets `true`).
- Reserved error keys: `FORM_ERROR_KEY = "_form"`, `ROOT_ERROR_KEY = "_root"` (`wizard.tsx:21-22`).
- `SAVE_FAILED` message (client) = "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know." — same string the action returns for `_form` (`wizard.tsx:23-24`, `actions.ts:89-91`).
- `isFullScreen` triggered by: page kind `intro`, OR a single-question page whose sole question kind is `scale` | `long_text` | `image` (`wizard.tsx:149-155`).

## Data model touched
Must agree with unit 29.

### `burner_profiles` (`schema.ts:352-364`)
- `user_id` (uuid, PK, FK→`users.id` ON DELETE CASCADE) — one profile per user.
- `version` (text, NOT NULL) — set to `QUESTIONNAIRE.version` on every upsert.
- `responses` (jsonb `Record<string, unknown>`, NOT NULL, default `{}`) — the flat question-id→value map MINUS `id.number` (which is split out and encrypted). `id.type`, `birthday`, and `profile.image` all stay here.
- `started_at` (timestamp, NOT NULL, default now).
- `completed_at` (timestamp, nullable) — set to `now` only when `markComplete` true; on conflict, preserved (`sql\`completed_at\``) when not completing (`burner-profile.ts:148, 156-158`).
- `updated_at` (timestamp, NOT NULL, default now) — bumped to `now` on every conflict update.

### `users` columns this unit writes/reads (`schema.ts:229, 241-242`)
- `profile_image_url` (text, nullable) — mirrored from `responses["profile.image"]` via `setProfileImage` (string→url, empty string→null).
- `passport_encrypted` (text, nullable) — ciphertext of `id.number` when `id.type === "passport"`.
- `sa_id_encrypted` (text, nullable) — ciphertext of `id.number` when `id.type === "sa_id"`.
- `idColumnsFor(idType, value)` sets the matching column and NULLs the other, so switching document type MOVES the value rather than orphaning ciphertext; default/unknown type → treated as passport (`id-documents.ts:43-50`).

### `required_actions` (touched via `satisfyBurnerProfileAction`)
- Action keyed `actionKey = "burner_profile"`, `type = "questionnaire"`, `title = "Complete your burner profile"`, `version = QUESTIONNAIRE.version` (seeded by `seedBurnerProfileAction`, `users.ts:192-200`). On final submit, `satisfyRequiredAction(userId, "burner_profile", QUESTIONNAIRE.version)` flips a pending row to `status="completed"` with `completedAt=now` (`activations.ts:167-200`).

### `BurnerProfileSummary` interface (read shape, `users.ts:155-160`)
`{ responses: Record<string, unknown>; completedAt: Date | null; updatedAt: Date | null; version: string | null }`.

### `SplitId` interface (`id-documents.ts:10-17`)
`{ cleaned: Record<string, unknown>; idType: string | null; idNumber: string | null }`.

## Validation, edge cases & business rules

### Local (client) per-page validation — `validatePageLocally` (`wizard.tsx:79-101`)
- Intro pages always pass (`p.kind === "intro" → true`).
- For each question: value is "missing" if `undefined | null | "" ` (empty string). Missing + `required` → inline error `"This question is required"`.
- Cross-field ID check: when `q.id === "id.number"` and value is a non-empty string, calls `validateIdNumber(responses["id.type"], v)`; on failure sets that question's error to the returned message. Note: only runs when an ID number is typed; an empty `id.number` falls through to the generic required check.
- Multi-select / arrays: NOT treated as missing here (arrays aren't `=== ""`); a `required` multi-select with `[]` would pass local validation but be caught by the server `validateOne` ("Pick at least one option").
- Returns true only when the error map is empty; populates `errors` with whatever it found.

### ID number format — `validateIdNumber(type, raw)` (`id-validation.ts`)
- Trims; empty → `"Document number is required"`.
- `type === "passport"` → `/^[A-Z0-9]{6,12}$/i`; fail → "Letters and digits only — typically 6–12 characters."
- `type === "sa_id"` → must match `/^\d{13}$/` ("Must be exactly 13 digits."), THEN a valid `YYMMDD` date prefix (month 1–12, day 1–31; "First six digits aren't a valid YYMMDD date."), THEN the SA Home Affairs Luhn-variant check digit ("Check digit doesn't match — double-check the number.").
  - SA Luhn variant: 1-based positions 1–12 (drop position 13 = check digit). Odd positions (i%2===0 0-based) summed directly; even positions concatenated into one number, multiplied by 2, the digits of that product summed; `computed = (10 - (total % 10)) % 10`; compare to digit 13 (`id-validation.ts:82-102`).
- Any other `type` (null/empty) → "Pick the ID document type first" (forces choosing `id.type` first).

### Server full validation — `validateResponses(QUESTIONNAIRE, raw)` (final submit only) (`questionnaire.ts:324-436`)
- Payload not parseable as `Record<string, ResponseValue>` → single `_root: "Malformed response payload"` (renders in the banner).
- Iterates catalogue pages (skips intro), validates each question via `validateOne`; collects per-question errors keyed by question id. Unknown response keys are DROPPED (stale keys from older versions ignored); only catalogue questions persisted.
- `validateOne` rules per kind:
  - Missing (`undefined|null|""`): required → `"This question is required"`; optional → accepted as `undefined` (not stored).
  - `slider`: must be number, not NaN, within `[min,max]` else `"Must be between {min} and {max}"`.
  - `single_select`/`toggle`/`combobox`: string and a known option value else `"Not a valid option"`.
  - `multi_select`: array of strings; filtered to allowed option values; `required && filtered.length === 0 → "Pick at least one option"`. Unknown members silently dropped.
  - `short_text`/`long_text`: string, `length <= maxLength` else `"Max {maxLength} characters"`.
  - `date`: strict `^\d{4}-\d{2}-\d{2}$` ("Use yyyy-mm-dd") and `Date.parse` not NaN ("Not a real date").
  - `scale`: string matching a known step value else `"Not a valid level"`.
  - `image`: string (any) accepted as URL; non-string → `"Expected an image URL"`. No URL-shape check, no `id.number`/ID Luhn check server-side (the SA-ID Luhn lives only in client `validateIdNumber`).
- NOTE: the server validator does NOT re-run `validateIdNumber`; SA-ID Luhn / passport-format enforcement is client-only. A crafted payload could bypass it. <!-- ugly truth: id.number is validated only locally; server treats it as plain short_text (maxLength 40). -->

### Persistence rules
- Onboarding persists progress on every Next (`persistProgress` true): a partially filled signup survives reload (`wizard.tsx` docstring 33-35).
- Non-final saves tolerate missing required answers (`actions.ts:36-37`).
- ID encryption write happens whenever `idNumber` is truthy (progress or final), so the encrypted column updates incrementally as soon as the user types a valid number and advances (`actions.ts:65`).
- Profile-photo mirror runs on every save (progress + final), keeping `users.profile_image_url` in sync (`actions.ts:67-73`).
- Final submit: `markComplete=true` stamps `completed_at`; once set, any conflict update preserves it (the field can't be un-completed via subsequent upserts) (`burner-profile.ts:156-158`).
- Gate version-matching: `satisfyRequiredAction` only flips the gate if the action is still `pending` and the completed version `meetsRequiredVersion(row.version, completedVersion)`; completion against an OLDER catalogue version leaves the gate open (`activations.ts:187-194`). Under E2E test mode this is a no-op and the legacy `completedAt` fallback gate covers it (`users.ts:204-208`).

### Edge cases
- Re-entry after completion: `page.tsx` redirects to `/` if `profile.completedAt` is set — you can't reopen onboarding once done (replay/edit is a different route/flow, unit 12).
- Out-of-range `pageIndex`: `if (!page) return null` renders nothing rather than crashing.
- Thrown save action (DB outage, missing/short `PGCRYPTO_KEY`, encryption failure): server returns typed `_form` error OR throws → client catch sets `_form = SAVE_FAILED`; user stays on the page and can retry — never silently stuck.
- Wrong-account escape: page-0 "Sign out" link (onboarding only) for someone who signed in with the wrong account before creating anything.
- ID type switch: `idColumnsFor` nulls the previously-used encrypted column so switching passport↔sa_id moves the ciphertext, never orphans it.
- `mergeIdNumber` only re-injects `id.number` when an ID number exists; otherwise returns responses unchanged (no phantom keys).

## Sub-components / variants
- **`QuestionnaireWizard`** (default export, `wizard.tsx`) — the shared step machine. Configured two ways:
  - *Onboarding* (this unit): `persistProgress=true` (default), `firstStepSignOut=true`, `submitLabel="Finish"` (default), no `onComplete` (server-side redirect handles success).
  - *Replay/edit* (unit 12): `persistProgress=false` (advance locally, persist only on final so the diff compares stored vs final), `firstStepSignOut=false`, custom `submitLabel`, uses `onComplete` for in-place confirmation + change-log refresh. The change-log machinery (`diffResponses`, `displayResponseValue`, `flattenQuestions`, `QuestionnaireFieldChange`) lives in `questionnaire.ts` but is used by unit 12, NOT here.
- **`ProgressBar`** (private fn, `wizard.tsx:263-278`) — bar + "Step N of M" text.
- **`QuestionField`** (`./question`, unit 20) — the per-kind field renderer; out of scope here.
- **Server-only handlers/validators/schemas this unit owns:**
  - `saveBurnerProfile` (server action) — the single write path.
  - `validateResponses` / `validateOne` (final-submit validator, `packages/types`).
  - `validateIdNumber` + helpers (`hasValidDatePrefix`, `hasValidLuhnCheck`) — client-side cross-field ID validation.
  - `splitIdNumber` / `mergeIdNumber` / `idColumnsFor` (pure PII-mapping, `packages/db`).
  - Backend dispatch `upsertBurnerProfile` / `setIdDocuments` / `setProfileImage` / `getBurnerProfile` / `getIdDocuments` / `satisfyBurnerProfileAction` (`users.ts`) — each routes to real Drizzle backend or in-memory E2E `testStore`.
- **Dead/orphaned flags:** none observed in the wizard itself. Notable ugly truths: (1) the SA-ID Luhn/passport check is client-only — the server validator treats `id.number` as a plain `short_text` (maxLength 40), so it is bypassable; (2) intro pages declared as a Zod kind but the live catalogue uses only one (`team_interests_intro`); (3) `displayResponseValue`/`diffResponses` exported from the same module but unused by this unit.
