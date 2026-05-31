# 12 — My forms + form replay

**Files covered:**
- `apps/web/app/tools/forms/page.tsx` — server component: lists the forms this user has completed and can replay.
- `apps/web/app/tools/forms/[key]/page.tsx` — server component: replay/edit one completed form + render its change log (`ChangeLog` sub-component lives here).
- `apps/web/app/tools/forms/[key]/form-replay.tsx` — client shell wrapping the questionnaire wizard for the replay flow.
- `apps/web/app/tools/forms/[key]/actions.ts` — `"use server"` action `saveFormReplay`: validate → diff → save → record change-log row.
- `apps/web/lib/forms.ts` — `ReplayableForm` registry, `listCompletedForms`, `getReplayableForm`, change-log read/write (`recordFormEdit` / `listFormEdits`), test-mode routing.
- `packages/db/src/questionnaire-edits.ts` — Drizzle read/write for the `questionnaire_edits` change-log table.
- `packages/db/src/id-documents.ts` — pure ID-number split/merge helpers used by `BURNER_PROFILE.load`/`.save` and the change-log filter.
- (supporting, read for contracts) `packages/types/src/questionnaire.ts` (`diffResponses`, `validateResponses`, `displayResponseValue`, `QuestionnaireFieldChange`), `packages/db/src/schema.ts` (`questionnaireEdits` table), `apps/web/components/questionnaire/wizard.tsx` (the shared wizard, unit 04), `apps/web/lib/users.ts` + `packages/db/src/burner-profile.ts` (load/save backends), `apps/web/lib/test-store.ts` (in-memory change-log).

**Purpose:** A read-and-revisit surface for questionnaires the member has already completed. The list page (`/tools/forms`) shows every completed form with its last-edited timestamp; the detail page (`/tools/forms/[key]`) re-opens the form in the questionnaire wizard pre-filled with the saved answers so the member can step back through it and update anything that changed. On final submit it diffs the new answers against the stored ones, re-saves the form (a full idempotent re-submit that also re-satisfies the onboarding gate), and appends a per-field change-log row recording exactly what changed and when. No full version history is kept — only a running log of `field: from → to` entries.

## Features

### Forms list (`tools/forms/page.tsx`)
- Lists every form the current user has **completed** (`listCompletedForms`) — a form appears only once it has a `completedAt` on record (`page.tsx:41`, `lib/forms.ts:107-123`).
- Header copy: title "My forms"; subtitle "Questionnaires you've completed this year. Open one to review and update your answers — we'll keep a log of what you change." (`page.tsx:53-57`).
- Back link to `/tools` labelled "Tools" with a `ChevronLeft` icon (`page.tsx:45-51`).
- Each form rendered as a clickable `Card` linking to `/tools/forms/${form.key}` with `ChevronRight` affordance (`page.tsx:69-86`). Card shows `form.title`, `form.description`, and a "Last edited {date}" line (`page.tsx:77-81`).
- "Last edited" = `form.updatedAt ?? form.completedAt` (falls back to completion time when never edited) (`page.tsx:67`).
- Empty state when `forms.length === 0`: dashed-border panel "You haven't completed any forms yet." (`page.tsx:60-63`).
- Gating chain before render: authed (`getAuthenticatedUserOrRedirect`) → `ensureCampUser` → `hasCampAccess` else `redirect("/signup/required")` → burner profile `completedAt` else `redirect("/onboarding/questionnaire")` → `isApproved` else `redirect("/pending-approval")` (`page.tsx:28-39`).
- `export const dynamic = "force-dynamic"` — reads the Neon Auth session every request (`page.tsx:20`).

### Form replay / edit (`tools/forms/[key]/page.tsx`)
- Resolves the dynamic `[key]` param against the registry via `getReplayableForm(key)`; unknown key → `notFound()` (404) (`[key]/page.tsx:44-45`).
- Loads the user's saved answers + completion state via `form.load(campUser.id)`; if not completed (`!state?.completedAt`) → `redirect("/tools/forms")` (only completed forms are replayable) (`[key]/page.tsx:47-51`).
- Header: `form.title` and subtitle "Step back through the form and update anything that's changed. Last edited {date}." where date = `state.updatedAt ?? state.completedAt` (`[key]/page.tsx:54,65-71`).
- Back link to `/tools/forms` labelled "My forms" (`[key]/page.tsx:58-64`).
- Renders `<FormReplay>` (the wizard) then `<ChangeLog edits={edits}>` (`[key]/page.tsx:73-79`).
- Loads the edit log via `listFormEdits(campUser.id, form.key)` (default limit 20) (`[key]/page.tsx:53`).
- Same gating chain as the list page (`[key]/page.tsx:30-42`), with a comment noting "Gate parity with the rest of the app — onboarding must be done first."
- `export const dynamic = "force-dynamic"` (`[key]/page.tsx:16`).

### Change log (`ChangeLog`, inside `[key]/page.tsx:84-126`)
- Section heading "Change log"; intro copy "Every time you update this form we record what changed. We don't keep old versions — just this running history." (`[key]/page.tsx:87-91`).
- Empty state when `edits.length === 0`: "No edits yet. Changes you make here will show up in this list." (`[key]/page.tsx:92-95`).
- Ordered list (`<ol>`) of edit sessions, each a bordered card showing the edit timestamp (`dateFmt.format(edit.createdAt)`) (`[key]/page.tsx:97-105`).
- Within each session, a list of per-field changes: bold `change.label`, then `change.from` (rendered struck-through, `line-through`) → `change.to` (rendered in foreground colour), separated by an `aria-hidden` arrow "→" (`[key]/page.tsx:106-118`).
- Edits keyed by `edit.id`; changes keyed by `change.fieldId` (`[key]/page.tsx:100,108`).

### Replay client shell (`form-replay.tsx`)
- Wraps `QuestionnaireWizard` (shared wizard, unit 04) seeded with `initialResponses` from the loaded state (`form-replay.tsx:43-53`).
- Wizard configured for the replay flow: `persistProgress={false}` (no per-page saves; only the final submit commits), `submitLabel="Save changes"`, `action={(responses, final) => saveFormReplay(formKey, responses, final)}` (`form-replay.tsx:44-47`).
- On successful completion (`onComplete`): sets local `saved` flag and calls `router.refresh()` to re-render the server component so the change log updates in place (`form-replay.tsx:49-52`).
- Success banner (when `saved`): `role="status"`, `CheckCircle2` icon, "Saved. Your answers — and the change log below — are up to date." (`form-replay.tsx:32-42`).

### `saveFormReplay` server action (`[key]/actions.ts`)
- Re-runs auth + camp-access gate (`getAuthenticatedUserOrRedirect` → `ensureCampUser` → `hasCampAccess` else `redirect("/signup/required")`) (`actions.ts:28-32`). (Note: does NOT re-check onboarding/approval here — only invite gate.)
- Resolves `getReplayableForm(key)`; unknown → `{ ok: false, errors: { _root: "Unknown form." } }` (`actions.ts:34-35`).
- If `final === false` (intermediate "Next" — only reachable if `persistProgress` were true), returns `{ ok: true }` without persisting (`actions.ts:37-38`). In the replay flow `persistProgress=false`, so intermediate Next never calls this at all.
- Validates via `validateResponses(form.questionnaire, rawResponses)`; on failure returns `{ ok: false, errors }` (per-field + `_root` keys) (`actions.ts:40-41`).
- Re-loads stored state; if `!state?.completedAt` returns `{ ok: false, errors: { _root: "This form hasn't been completed yet." } }` (`actions.ts:43-49`).
- Diffs stored vs. new answers (`diffResponses`), filtering out the field whose id === `ID_NUMBER_KEY` ("id.number") so the plaintext ID number never lands in the change-log table (`actions.ts:51-58`).
- Saves the edited answers via `form.save` (full re-submit) (`actions.ts:60`).
- If `changes.length > 0`, appends one change-log row via `recordFormEdit` ({userId, questionnaireKey, version, editedByUserId=campUser.id, changes}) — a no-op replay records no row (`actions.ts:62-70`).
- Revalidates `/tools/forms/${key}` and `/tools/forms` (`actions.ts:72-73`), returns `{ ok: true }`.

### Registry + load/save (`lib/forms.ts`)
- `REGISTRY: ReplayableForm[]` currently contains **only** `BURNER_PROFILE` (`lib/forms.ts:89`). Comment states dietary / driver / future questionnaires slot in later "with no change to the tool, the change-log table, or the replay screen" (`lib/forms.ts:23-32`).
- `BURNER_PROFILE` entry: `key="burner_profile"`, `title="Burner profile"`, `description="The onboarding questionnaire — who you are in the dust, your teams, skills and logistics."`, `questionnaire=QUESTIONNAIRE` (`lib/forms.ts:49-54`).
- `BURNER_PROFILE.load(userId)`: reads `getBurnerProfile`; null → null. Merges decrypted ID number back into responses via `mergeIdNumber` so the owner's replay pre-fills the ID field. Returns `{ responses, completedAt, updatedAt }` (`lib/forms.ts:55-71`).
- `BURNER_PROFILE.save(userId, responses)`: `splitIdNumber` to pull `id.number` out of the JSONB, `upsertBurnerProfile({ userId, version: QUESTIONNAIRE.version, responses: cleaned, markComplete: true })`, then if `idNumber` present `setIdDocuments(userId, { idType, idNumber })`, then `satisfyBurnerProfileAction(userId)` to re-satisfy the onboarding gate (e.g. after a captain re-activated the questionnaire at a new version) (`lib/forms.ts:72-86`).
- `getReplayableForm(key)` = `REGISTRY.find((f) => f.key === key)` (`lib/forms.ts:91-93`).
- `listCompletedForms(userId)`: loops the registry, calls `form.load`, skips any without `completedAt`, returns `CompletedFormSummary[]` (`lib/forms.ts:107-123`).

### Change-log persistence (`lib/forms.ts` + `packages/db/src/questionnaire-edits.ts`)
- `recordFormEdit(input)`: under `isE2ETestMode()` writes to `testStore.recordQuestionnaireEdit`; otherwise `recordQuestionnaireEdit` (DB) (`lib/forms.ts:137-149`).
- `listFormEdits(userId, questionnaireKey, limit = 20)`: under test mode reads `testStore.listQuestionnaireEdits`; otherwise `listQuestionnaireEdits` (DB). Both map rows to `FormEdit` (`lib/forms.ts:151-175`).
- DB `recordQuestionnaireEdit`: inserts one row into `questionnaire_edits`. Caller is responsible for skipping the insert when `changes` is empty (`questionnaire-edits.ts:20-35`).
- DB `listQuestionnaireEdits`: selects rows for `(userId, questionnaireKey)`, ordered `desc(createdAt)` (most-recent-first), `.limit(limit)`; null `changes` coerced to `[]` (`questionnaire-edits.ts:40-68`).
- Test-store `recordQuestionnaireEdit`: pushes `{ id: \`test-edit-${nextSerial++}\`, …, createdAt: new Date() }` (`test-store.ts:281-297`).
- Test-store `listQuestionnaireEdits`: filters by `userId` + `questionnaireKey`, sorts by `createdAt` descending, slices to `limit` (default 20) (`test-store.ts:298-309`).

## User actions & interactions
- **Open the forms list**: navigate to `/tools/forms` (linked from the Tools surface; see unit 11). Back link returns to `/tools`.
- **Open a form to replay**: tap a form card → `/tools/forms/{key}` (`page.tsx:69-72`).
- **Step through the wizard**: "Next"/"Back" page navigation; in replay mode Next advances **locally only** (no save) because `persistProgress=false` (`wizard.tsx:103-108`, `form-replay.tsx:44`).
- **Skip a lone optional unanswered question**: the wizard's final button text becomes "Skip" instead of "Next" when the page has a single optional question with no value (`wizard.tsx:160-172`). (Wizard mechanics belong to unit 04.)
- **Save changes**: final-page submit button labelled "Save changes" → `saveFormReplay(formKey, responses, true)` (`form-replay.tsx:46`, `wizard.tsx:255-257`).
- **See confirmation**: on success a status banner appears and the change log refreshes in place via `router.refresh()` (`form-replay.tsx:32-52`).
- **Back to list**: back link "My forms" → `/tools/forms` (`[key]/page.tsx:58-64`).
- **Read the change log**: scroll to the "Change log" section under the wizard; entries are read-only (no edit/delete actions on the log).

## States & presentations
Applies the global-states rows as follows:
- **Empty (list)**: no completed forms → "You haven't completed any forms yet." (`page.tsx:60-63`).
- **Empty (change log)**: no edits → "No edits yet. Changes you make here will show up in this list." (`[key]/page.tsx:92-95`).
- **Loading**: both pages are `force-dynamic` server components — no in-page spinner; data is awaited server-side before first paint. (Wizard transitions use `isPending` to disable buttons — unit 04.)
- **Populated**: list shows form cards; detail shows the pre-filled wizard + change-log entries.
- **Validation-error**: `saveFormReplay` returns `{ ok: false, errors }` from `validateResponses`; per-field errors render against question fields, `_root`/`_form` render in the wizard banner (`actions.ts:40-41`, `wizard.tsx:176,189-196`). Local page validation (`required`, ID cross-field) blocks Next/Submit before the action runs (`wizard.tsx:79-101`).
- **Submitting/pending**: wizard `isPending` disables Back/Submit during the action transition (`wizard.tsx:62,250,255`).
- **Success**: "Saved. Your answers — and the change log below — are up to date." banner + log refresh (`form-replay.tsx:32-42`).
- **Disabled**: Back disabled on first page / while pending (`wizard.tsx:250`); submit disabled while pending (`wizard.tsx:255`).
- **Invite-gated**: `!hasCampAccess` → `redirect("/signup/required")` on both pages and inside the save action (`page.tsx:30-32`, `[key]/page.tsx:32-34`, `actions.ts:30-32`).
- **Onboarding-incomplete**: burner profile `!completedAt` → `redirect("/onboarding/questionnaire")` (both pages; **not** re-checked in the save action) (`page.tsx:34-36`, `[key]/page.tsx:36-39`).
- **Pending-approval**: `!isApproved` → `redirect("/pending-approval")` (both pages; not in save action) (`page.tsx:37-39`, `[key]/page.tsx:40-42`).
- **Rejected**: covered by `isApproved` returning false for non-approved status → same `/pending-approval` redirect (terminal-rejected handled by that surface). (`isApproved` only treats `approvalStatus === "approved"` (or god email) as approved — `users.ts:231-236`.)
- **Captain-only-locked**: N/A — this surface is open to any approved member; there is no rank gate here. The form being replayable depends on completion, not rank.
- **Not-found**: unknown `[key]` → `notFound()` (404) (`[key]/page.tsx:45`).
- **Not-yet-completed redirect**: replaying a form with no completion → `redirect("/tools/forms")` (`[key]/page.tsx:49-51`).

## Enums, options & configurable values
- **Registry keys**: only `"burner_profile"` is wired today (`lib/forms.ts:50,89`). The key is the stable registry key shared with `required_actions` / `questionnaire_activations`.
- **Questionnaire version**: `QUESTIONNAIRE.version = "2026.05.29-v8"` (`lib/questionnaire.ts:60`) — stamped onto every change-log row and onto the burner-profile re-save.
- **Reserved error-map keys** (wizard banner): `_form` (`FORM_ERROR_KEY`), `_root` (`ROOT_ERROR_KEY`) (`wizard.tsx:21-22`). Action emits `_root` for non-field failures.
- **ID keys**: `ID_NUMBER_KEY = "id.number"`, `ID_TYPE_KEY = "id.type"` (`id-documents.ts:7-8`). `id.number` is excluded from the change log; `id.type` stays in responses.
- **ID type values** (in `splitIdNumber`/`idColumnsFor`): `"passport"` (default) | `"sa_id"` | `null` (`id-documents.ts:15,43-49`).
- **listFormEdits / listQuestionnaireEdits limit**: default `20` (`lib/forms.ts:153`, `questionnaire-edits.ts:42`, `test-store.ts:301`).
- **Empty-display sentinel** in change-log values: `EMPTY_DISPLAY = "—"` (em dash) for unanswered fields (`questionnaire.ts:232,243-245`).
- **Multi-select join**: changed multi-select values rendered as labels joined with `", "` (`questionnaire.ts:259-262,264`).
- **Date format** (both pages): `Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" })` (`page.tsx:22-25`, `[key]/page.tsx:18-21`).
- **Save labels**: `submitLabel="Save changes"` (replay) vs wizard default "Finish" (`form-replay.tsx:45`, `wizard.tsx:55`).
- **SaveResult type**: `{ ok: true } | { ok: false; errors: Record<string, string> }` (`actions.ts:11-13`).
- **`persistProgress=false`** and **`firstStepSignOut` unset** for the replay flow (the latter defaults false; replay users are established members) (`form-replay.tsx:44`, `wizard.tsx:46,56`).

## Data model touched
(Field names verbatim; must agree with unit 29.)

### `questionnaire_edits` table (`packages/db/src/schema.ts:530-562`, Drizzle export `questionnaireEdits`)
- `id` — `uuid`, `defaultRandom()`, primary key.
- `userId` — `uuid("user_id")`, not null, FK → `users.id`, `onDelete: "cascade"`. The subject whose answers these are.
- `questionnaireKey` — `text("questionnaire_key")`, not null. Same registry key as `required_actions` / `questionnaire_activations` (e.g. "burner_profile").
- `version` — `text("version")`, not null. Catalogue version in force at edit time.
- `editedByUserId` — `uuid("edited_by_user_id")`, FK → `users.id`, `onDelete: "set null"`, **nullable**. Who performed the edit (usually the subject; nullable so a captain editing on someone's behalf, or a deleted account, keeps the log intact).
- `changes` — `jsonb("changes")` typed `$type<QuestionnaireFieldChange[]>()`, not null, default `[]`.
- `createdAt` — `timestamp("created_at", { mode: "date" })`, not null, `defaultNow()`.
- Index `questionnaire_edits_user_key_created_idx` on `(userId, questionnaireKey, createdAt)` (`schema.ts:556-560`).

### `QuestionnaireFieldChange` (one entry in `changes[]`) (`packages/types/src/questionnaire.ts:211-219`)
- `fieldId` — `z.string().min(1)` — the question id (dotted/namespaced, e.g. "id.number").
- `label` — `z.string()` — the question prompt captured **at edit time** (stays readable even if catalogue copy changes later).
- `from` — `z.string()` — human-readable display value before the edit.
- `to` — `z.string()` — human-readable display value after the edit.

### `FormEdit` / `QuestionnaireEditRow` (returned shapes)
- `FormEdit` (`lib/forms.ts:129-135`): `{ id, version, editedByUserId, changes: QuestionnaireFieldChange[], createdAt }` — note it drops `questionnaireKey` from the DB row.
- `QuestionnaireEditRow` (`questionnaire-edits.ts:6-13`): `{ id, questionnaireKey, version, editedByUserId, changes, createdAt }`.
- Test-store `TestQuestionnaireEdit` (`test-store.ts:35-43`): `{ id, userId, questionnaireKey, version, editedByUserId, changes, createdAt }`.

### `burner_profiles` (read by `load`, written by `save`; full table is unit 29)
Touched fields: `responses` (JSONB), `completedAt`, `updatedAt`, `version`, `userId`. `BurnerProfileSummary` returned shape: `{ responses, completedAt, updatedAt, version }` (`users.ts:155-160`). `upsertBurnerProfile` insert/`onConflictDoUpdate` on `userId`, sets `version`, `responses`, `updatedAt = now`, and `completedAt = now` when `markComplete` (else preserves existing) (`burner-profile.ts:134-161`).

### `users` ID columns (via `setIdDocuments`/`getIdDocuments`)
The government ID number is stored encrypted on `users` (AES-256-GCM via `PGCRYPTO_KEY`), in `passportEncrypted` / `saIdEncrypted` columns selected by `idColumnsFor` (`id-documents.ts:43-49`, `users.ts:328-348`). It is merged into responses on `load` and split out on `save`; it is never written to `questionnaire_edits`.

### `CompletedFormSummary` (list-page row) (`lib/forms.ts:95-101`)
`{ key, title, description, completedAt: Date, updatedAt: Date | null }`.

### `ReplayableForm` (registry interface) (`lib/forms.ts:34-47`)
`{ key, title, description, questionnaire, load(userId) → { responses, completedAt, updatedAt } | null, save(userId, responses) → void }`.

## Validation, edge cases & business rules
- **Only completed forms are listed/replayable**: `listCompletedForms` skips any registry entry without `completedAt`; the detail page redirects to the list if the loaded state isn't completed (`lib/forms.ts:113`, `[key]/page.tsx:49-51`).
- **Unknown form key**: list→detail link can only produce known keys, but a hand-typed `[key]` → `notFound()` (404) on the page, and `_root: "Unknown form."` in the save action (`[key]/page.tsx:45`, `actions.ts:35`).
- **Final-submit-only persistence**: replay wizard runs `persistProgress=false`; intermediate Next presses don't hit the server. The diff therefore compares stored answers against the *final* edit, never half-saved progress (`actions.ts:15-22`, `wizard.tsx:30-35`).
- **No-op replay records no row**: when `diffResponses` yields zero changes, the form is still re-saved (identical answers) but `recordFormEdit` is skipped (`actions.ts:62-70`; reinforced by the schema comment `schema.ts:528` and the db helper comment `questionnaire-edits.ts:15-19`).
- **ID-number redaction from the log**: `diffResponses` output is filtered to drop `c.fieldId !== ID_NUMBER_KEY` so the plaintext government ID never enters `questionnaire_edits`. Because `load` merges the decrypted number into the responses, it sits on both sides of the diff and would otherwise be logged (`actions.ts:51-58`).
- **Diff semantics** (`diffResponses`, `questionnaire.ts:298-316`): iterates `flattenQuestions` (questionnaire order), compares via `sameValue`. Multi-selects compared as **sets** (re-ordering is not a change). Empty/absent answers (`undefined`/`null`/`""`/empty array) treated as equal to each other. Only questions in the current catalogue are considered — stale keys from an older version are ignored. Each change's `from`/`to` are `displayResponseValue` (option labels resolved, lists joined, empty → "—").
- **Validation** (`validateResponses`, `questionnaire.ts:324+`): malformed payload → `{ _root: "Malformed response payload" }`; unknown response keys are dropped (question may have been removed in a later version); missing required questions return per-question errors; values normalised per kind.
- **Local pre-submit validation** (wizard): required questions blocked when empty ("This question is required"); cross-field rule validates `id.number` against the chosen `id.type` via `validateIdNumber` before advancing/submitting (`wizard.tsx:79-101`).
- **Re-submit re-satisfies the onboarding gate**: `save` calls `satisfyBurnerProfileAction`, so re-submitting after a captain re-activates the questionnaire at a new version clears the new required-action row. Under E2E test mode this is a no-op (`lib/forms.ts:85`, `users.ts:204-209`).
- **Version stamping**: the change-log row records `form.questionnaire.version` (current catalogue version, `"2026.05.29-v8"`), and the re-save writes that version onto `burner_profiles.version` — so a replay updates the stored version to the current one (`actions.ts:67`, `lib/forms.ts:75`).
- **Save action does NOT re-gate onboarding/approval** — it only re-checks auth + `hasCampAccess` (`actions.ts:28-32`). The page-level gates are the primary enforcement; a request could reach the action after the page passed.
- **`editedByUserId` is always the subject here**: `saveFormReplay` passes `campUser.id` as `editedByUserId` (`actions.ts:66`). The nullable/“captain on behalf” path in the schema exists for a future flow not wired in this surface.
- **Change-log ordering & cap**: most-recent-first, capped at 20 by default (DB `orderBy(desc(createdAt)).limit`, test-store `sort desc + slice`). Older edits beyond 20 are not shown (`questionnaire-edits.ts:62-63`, `test-store.ts:303-308`).
- **`completedAt` overwrite ugly truth**: `lib/forms.ts:78-80` comment claims "markComplete is idempotent on completedAt", but `upsertBurnerProfile`'s `onConflictDoUpdate` sets `completedAt = now` whenever `markComplete` is true (`burner-profile.ts:156-158`) — so a replay actually **bumps `completedAt` to the re-submit time** (not preserving the original completion timestamp). `updatedAt` is also set to `now`. The list/detail "Last edited" line uses `updatedAt ?? completedAt`, so this affects displayed timestamps. <!-- low-confidence: whether this completedAt overwrite is intended; the inline comment and code disagree. -->
- **`final === false` branch is effectively dead in this flow**: replay sets `persistProgress=false`, so the wizard never calls the action with `final=false` (`wizard.tsx:105-108`). The `if (!final) return { ok: true }` guard (`actions.ts:38`) only matters if a future caller reuses this action with `persistProgress=true`.

## Sub-components / variants
- **`FormsListPage`** (`tools/forms/page.tsx`) — list server component. No variants; single empty/populated branch.
- **`FormReplayPage`** (`tools/forms/[key]/page.tsx`) — detail server component; renders `FormReplay` + `ChangeLog`.
- **`ChangeLog`** (`tools/forms/[key]/page.tsx:84-126`) — presentational sub-component; empty vs. populated branch; read-only.
- **`FormReplay`** (`form-replay.tsx`) — client shell; the only consumer of `saveFormReplay`; configures the shared wizard for replay.
- **`saveFormReplay`** (`[key]/actions.ts`) — the single server action / validator pipeline (validate → load-check → diff+redact → save → record → revalidate).
- **`ReplayableForm` registry** (`lib/forms.ts`) — `BURNER_PROFILE` is the only live entry; the registry pattern is built to accept dietary/driver/future forms with no UI change. The `save`/`load` ID-merge logic is bespoke to the burner profile.
- **Change-log read/write helpers** — `recordFormEdit`/`listFormEdits` (lib, with E2E test-mode routing) delegating to `recordQuestionnaireEdit`/`listQuestionnaireEdit` (DB) or `testStore.recordQuestionnaireEdit`/`listQuestionnaireEdits` (in-memory).
- **No dead/orphaned UI variants** found in this surface. The only quasi-dead code is the `final=false` action branch (see Validation) and the contradictory `completedAt` idempotency comment.
- **Shared primitives reused** (not owned here): `QuestionnaireWizard` + field machine (unit 04 / field kinds unit 20); `Card`/`CardHeader`/`CardTitle`/`CardDescription`, `Button`; lucide `ChevronLeft`/`ChevronRight`/`CheckCircle2`.
