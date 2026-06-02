# Questionnaire, burner profile, forms & field validation — service-layer plan

> Scope: the question catalogue (v8), the 10 field kinds + page kinds, response
> validation, the change-log diff, the burner-profile domain table, the
> required-action satisfaction tied to it, and ID-number-at-rest encryption.
> Redesign on a live codebase: nearly everything here is **REUSE**. The only
> structural moves proposed are a HYBRID extraction of already-pure code from
> `apps/web/lib` into packages, plus two flagged data-integrity reconciliations.
> **No schema change in this domain** (the redesign's one schema change —
> `captain_promotion_requests` — belongs to the roster domain).

---

## Consumers — which surfaces/organisms depend on this domain

| Surface (spec) | Route | Depends on |
|---|---|---|
| **04 Onboarding wizard** | `/onboarding/questionnaire` | `QUESTIONNAIRE` catalogue, `validateResponses`, `validateIdNumber`, `splitIdNumber`, `upsertBurnerProfile`, `setIdDocuments`, `setProfileImage`, `satisfyBurnerProfileAction` (via `saveBurnerProfile` action) |
| **20 Field-kind renderer** | n/a (shared component) | `Question`/`QuestionnaireResponseValue` types + per-kind config; `validateOne` semantics (mirrored client-side in the wizard); `validateIdNumber` (cross-field) |
| **12 My forms (list + replay)** | `/tools/forms`, `/tools/forms/[key]` | `getReplayableForm`, `listCompletedForms`, `listFormEdits`, `recordFormEdit`, `diffResponses`, `displayResponseValue`, `getBurnerProfile`/`getIdDocuments` (via the registry's `load`/`save`) |
| **23 Questionnaire gate (interstitial)** | `/onboarding/questionnaire` (pre-wizard) | read-only: `getBurnerProfile().completedAt`, `getPendingRequiredActions`; **static** QCard copy (NOT derived from the catalogue today) |
| **24 Questionnaire runner (blocking)** | `/onboarding/questionnaire` + future `ACTION_ROUTES` | same engine as 04 (shared `QuestionnaireWizard` + field machine); `required_actions` row drives chrome; `satisfyRequiredAction` |
| **27 Questionnaire complete & queue** | `/onboarding/questionnaire/complete` (TBD) | read-only over `required_actions` (`getPendingRequiredActions` + a NEW completed/queue read) — see Target API |
| Member detail (cross-domain, roster) | `/camp/[id]` | `QUESTIONNAIRE` + `flattenQuestions`/`displayResponseValue` to render a member's answers (`apps/web/lib/member-detail.ts:3,154`); ID decrypt for captains (`getIdDocuments`) |

The single shared engine is `apps/web/components/questionnaire/wizard.tsx` (+ `question.tsx`); surfaces 04 and 24 are the *same* React engine with different props/chrome, and 12 reuses it in replay mode. This domain owns the **data + validation + persistence** behind that engine; the components themselves are presentation-layer (other plan).

---

## Current state — modules + key exports today (file:symbol cites)

### packages/types — pure types + validation engine (framework-agnostic already)
`packages/types/src/questionnaire.ts`:
- Per-kind Zod schemas + inferred types: `SliderQuestion`, `SingleSelectQuestion`, `MultiSelectQuestion`, `ShortTextQuestion`, `LongTextQuestion`, `DateQuestion`, `ScaleQuestion`, `ToggleQuestion`, `ComboboxQuestion`, `ImageQuestion` (`:7-135`).
- `Question` discriminated union over `kind` (10 members, `:137-149`).
- Page schemas: `QuestionsPage`, `IntroPage`, `QuestionnairePage`, `Questionnaire` (`:153-183`).
- Response types: `QuestionnaireResponseValue` (`number | string | string[] | boolean | null`, `:187-196`), `QuestionnaireResponses` (`z.record`, `:198-202`).
- Change-log type: `QuestionnaireFieldChange` (`{ fieldId, label, from, to }`, `:211-219`).
- Pure helpers: `flattenQuestions` (`:224`), `displayResponseValue` (`:239`), `diffResponses` (`:298`), `validateResponses` (`:324`), `validateOne` (private, `:354`); internal `isEmptyValue`/`sameValue` (`:268-289`).

### packages/db — schema + per-domain data access (Drizzle, HTTP/pooled)
- `packages/db/src/burner-profile.ts`: `getBurnerProfileByUserId` (`:124`), `upsertBurnerProfile` (`:134` — the `completedAt` overwrite lives here, `:156-159`), `getIdDocumentColumns` (`:164`, raw ciphertext read), `setIdDocumentColumns` (`:178`, raw ciphertext write). Also hosts the user-row helpers (`findUserByAuthId`, `createCampUser`, `setUserProfileImage`, …) — those belong to the auth/users domain, not this one.
- `packages/db/src/id-documents.ts`: **pure** PII mapping helpers — `splitIdNumber` (`:19`), `mergeIdNumber` (`:28`), `idColumnsFor` (`:43`), constants `ID_NUMBER_KEY`/`ID_TYPE_KEY` (`:7-8`), `SplitId` interface. No crypto, no DB — already framework-agnostic.
- `packages/db/src/crypto.ts`: `encrypt`/`decrypt`/`decryptOrNull` (`:45,56,72`) — AES-256-GCM keyed off `PGCRYPTO_KEY`. Node `node:crypto` only (no `next/`).
- `packages/db/src/questionnaire-edits.ts`: `recordQuestionnaireEdit` (`:20`), `listQuestionnaireEdits` (`:40`), `QuestionnaireEditRow` interface (`:6`).
- `packages/db/src/activations.ts`: `openActivation` (`:36`, fan-out), `ensureRequiredAction` (`:138`), `satisfyRequiredAction` (`:167`, version-gated), `getPendingRequiredActions` (`:203`), `PendingRequiredAction` interface (`:16`).
- `packages/db/src/versions.ts`: `meetsRequiredVersion(required, completed)` (`:14`) — pure `-vN` numeric-suffix comparator used by `satisfyRequiredAction`.

### apps/web/lib — orchestration (Next-coupled or app-config)
- `apps/web/lib/questionnaire.ts`: the **`QUESTIONNAIRE` catalogue constant** (v8, `:59-387`) + `TEAMS`, `DIETARY_INGREDIENTS`, `COUNTRY_OPTIONS`. **Pure** — imports only `@camp404/types` (type-only) and `./countries`. No `next/`, no `server-only`.
- `apps/web/lib/id-validation.ts`: `validateIdNumber(type, raw)` (`:25`) + SA-ID Luhn/date-prefix + passport regex. **Pure** — zero imports.
- `apps/web/lib/forms.ts`: `server-only` (`:1`). Replay registry: `ReplayableForm` interface (`:34`), `BURNER_PROFILE` entry (`:49`), `REGISTRY` (`:89`), `getReplayableForm` (`:91`), `listCompletedForms` (`:107`), `CompletedFormSummary`/`FormEdit` shapes, `recordFormEdit`/`listFormEdits` (`:137,151`, E2E-test-store aware). Imports `splitIdNumber`/`mergeIdNumber` from db, the catalogue, and the users orchestration.
- `apps/web/lib/users.ts` (auth/users domain, cited as this domain's I/O boundary): `getBurnerProfile` (`:162`), `upsertBurnerProfile` (`:300`), `setIdDocuments` (`:333`, encrypts), `getIdDocuments` (`:343`, decrypts), `setProfileImage` (`:311`), `seedBurnerProfileAction` (`:192`), `satisfyBurnerProfileAction` (`:204`), `getPendingRequiredActions` (`:212`). All test-mode-aware (real vs in-memory backend).
- `apps/web/app/onboarding/questionnaire/actions.ts`: `saveBurnerProfile(rawResponses, final)` (`:26`) — `"use server"`; validates, splits PII, upserts, encrypts, mirrors photo, satisfies gate, `redirect("/")`.
- `apps/web/app/tools/forms/[key]/actions.ts`: `saveFormReplay` — validates, diffs, saves via registry, records edit.
- `apps/web/lib/required-actions.ts`: `ACTION_ROUTES` (`:7`, maps `burner_profile` → route), `nextGate` (`:23`).

---

## Redesign delta — NEW / EXTEND vs REUSE

**Headline: this is ~95% REUSE.** The redesign is presentation-layer (board affordances re-skin existing kinds; the data contract is untouched). Specifically:

- **REUSE (no change):** all 10 question kinds + 2 page kinds, `QuestionnaireResponseValue` union, `validateResponses`/`validateOne`, `diffResponses`/`displayResponseValue`/`flattenQuestions`, `QuestionnaireFieldChange`, the whole `id-documents.ts` PII mapping, `crypto.ts`, `questionnaire-edits.ts`, `activations.ts` satisfaction path, `versions.ts`, the `QUESTIONNAIRE` v8 catalogue *content* (subject to copy reconciliation), `validateIdNumber`. Board re-skins (`single_select`→radio cards, `scale`→segmented, `toggle`→switch, `slider`→segmented, dietary `multi_select`→chip grid) are **renderer-only**; **no kind is added or removed**, the response shapes are identical.
- **EXTEND — catalogue content (`questionnaire.ts`), pending owner confirmation only:**
  - **`team_interest.*` `max`** — boards draw 0–6, catalogue is `max: 5` (`questionnaire.ts:184`). Spec recommends keeping **0–5**; one-line constant change *only if* the owner chooses 0–6. Drives downstream team-questionnaire activation, so it is data, not presentation.
  - **`hardware_competency` page** — catalogue page 8 (`competency.hardware`, scale, required, `:212-231`) has no OB board; reconciliation (a) keep as own page, or (b) merge cooking+hardware onto one `questions` page. Either way the *question must survive*. If (b), the catalogue page array is edited (12→11 pages); the response key `competency.hardware` is unchanged.
  - **Visible-copy edits** (subtitles, intro body, dietary prompts) — board copy wins for rendering; catalogue prompts remain the data identity. Edits are to string literals in `questionnaire.ts`, owner-confirmed.
- **EXTEND — `completedAt` data-integrity fix (`upsertBurnerProfile`, `burner-profile.ts:156-159`):** the upsert sets `completed_at = now()` on **every** `markComplete` write, so a replay overwrites the original completion timestamp. The `lib/forms.ts:78-80` comment claims idempotency; the SQL contradicts it. **⛔ Resolve before build** (flagged in spec 12 + 24). Recommended fix: in `onConflictDoUpdate.set.completedAt`, only set `now()` when the existing value is null (`COALESCE(burner_profiles.completed_at, now())` when `markComplete`), preserving the first completion. This is a behaviour change to one data-access function — see Build steps.
- **NEW — required-queue read for surface 27:** a read that returns the user's `type='questionnaire'` blocking required-actions with status (`completed`/`pending`/`waived`/`expired`), `title`, `completedAt`, `dueAt`, ordered `created_at ASC`, **excluding** `burner_profile`. Today only `getPendingRequiredActions` (pending+blocking only) exists; surface 27 needs completed + locked rows too. This is the only genuinely new data-access function in the domain. It is unblocked by — but does not require — the multi-questionnaire trio scope decision (it degrades to "all done" with zero rows).
- **NEW — server-side `id.number` validation (flagged, likely deferred):** `validateIdNumber` is client/wizard-only; the server validates `id.number` only as `short_text ≤ 40`. Per house policy (MEMORY: source findings documented, not silently patched) this is **flagged**, not patched, unless the owner asks to harden it. If hardened, the natural home is the (extracted) pure validation package so server + client share one check — see Hybrid.
- **NEW — none in schema/types beyond the queue read's return type.** No new tables, columns, enums, or Zod schemas.

---

## Schema & types

**Schema change: NONE in this domain.** The redesign's single schema change (`captain_promotion_requests` + `promotion_request_status`) is the roster domain's, not this one. `burner_profiles`, `questionnaire_edits`, `required_actions`, `questionnaire_activations`, and the `users` encrypted columns are all unchanged structurally. **No Drizzle migration for this domain.**

The one data-access *behaviour* change (`completedAt` COALESCE) is not a schema migration — it edits the `onConflictDoUpdate` SET clause in `upsertBurnerProfile`, no DDL.

**packages/types additions:**
- `QuestionnaireQueueItem` (NEW type) — return shape for the surface-27 queue read:
  `{ actionKey: string; title: string; status: "pending" | "completed" | "waived" | "expired"; blocking: boolean; completedAt: Date | null; dueAt: Date | null; createdAt: Date }`.
  Lives in `packages/types` (or co-located with `PendingRequiredAction` if that interface is moved to types — see Cross-domain). Pure data shape, no Zod runtime needed unless it crosses a request boundary (it doesn't — server read → server render).
- No changes to `Question`, `Questionnaire*`, `QuestionnaireResponses`, `QuestionnaireFieldChange`. The `boolean` member of `QuestionnaireResponseValue` stays vestigial (the board's Switch persists a string option `value`, not a boolean — do **not** introduce a boolean).

---

## Target API — function/module surface after this work

Legend: **REUSE** = exists, keep as-is · **EXTEND** = modify · **NEW** = build · **DELETE** = remove. `core[NEW]` = a new pure package (see Hybrid).

### Catalogue + field config — `packages/core` [NEW, pure] (moved from apps/web/lib)
| Symbol | Signature | Status |
|---|---|---|
| `QUESTIONNAIRE` | `Questionnaire` (v8 catalogue constant) | **EXTEND** (move from `apps/web/lib/questionnaire.ts`; content edits per reconciliations) |
| `TEAMS` / `DIETARY_INGREDIENTS` / `COUNTRY_OPTIONS` | option arrays | **EXTEND** (move alongside the catalogue) |
| `COUNTRIES` / `countryFlag` | `(code) => string` | **REUSE** (move from `apps/web/lib/countries.ts` if it has no app-only deps — verify) |

### Validation — `packages/types` (engine) + `packages/core` [NEW, pure] (ID rules)
| Symbol | Signature | Where | Status |
|---|---|---|---|
| `validateResponses` | `(q: Questionnaire, raw: unknown) => { ok:true; responses } \| { ok:false; errors }` | `packages/types` | **REUSE** |
| `validateOne` | per-kind validator (private) | `packages/types` | **REUSE** |
| `validateIdNumber` | `(type: string\|null, raw: string) => { ok:true } \| { ok:false; error }` | `packages/core` [NEW] | **EXTEND** (move from `apps/web/lib/id-validation.ts`; unchanged logic) |
| `flattenQuestions` | `(q: Questionnaire) => Question[]` | `packages/types` | **REUSE** |
| `displayResponseValue` | `(q: Question, v) => string` | `packages/types` | **REUSE** |
| `diffResponses` | `(q, before, after) => QuestionnaireFieldChange[]` | `packages/types` | **REUSE** |

### PII mapping + crypto — `packages/db`
| Symbol | Signature | Status |
|---|---|---|
| `splitIdNumber` | `(responses) => { cleaned, idType, idNumber }` | **REUSE** |
| `mergeIdNumber` | `(responses, { idType, idNumber }) => responses` | **REUSE** |
| `idColumnsFor` | `(idType, value) => { passportEncrypted, saIdEncrypted }` | **REUSE** |
| `encrypt` / `decrypt` / `decryptOrNull` | string ↔ string (AES-256-GCM) | **REUSE** |

> Note: `id-documents.ts` is pure (no DB), so it *could* live in `packages/core`. Recommend **leaving it in `packages/db`** — it is the documented PII boundary co-located with the encrypted columns it maps to, its only consumers are db/app I/O paths, and moving it churns import paths for zero functional gain. `crypto.ts` must stay in `packages/db` (Node-crypto + tied to the columns/key). See Hybrid.

### Burner-profile data access — `packages/db`
| Symbol | Signature | Status |
|---|---|---|
| `getBurnerProfileByUserId` | `(userId) => Promise<row \| null>` | **REUSE** |
| `upsertBurnerProfile` | `({ userId, version, responses, markComplete }) => Promise<void>` | **EXTEND** (COALESCE `completedAt`) |
| `getIdDocumentColumns` / `setIdDocumentColumns` | raw ciphertext I/O | **REUSE** |

### Change log — `packages/db`
| `recordQuestionnaireEdit`, `listQuestionnaireEdits` | as-is | **REUSE** |

### Required-action satisfaction — `packages/db`
| Symbol | Status |
|---|---|
| `satisfyRequiredAction(userId, actionKey, completedVersion?)` | **REUSE** |
| `ensureRequiredAction(...)`, `getPendingRequiredActions(userId)` | **REUSE** |
| `meetsRequiredVersion(required, completed)` (`versions.ts`) | **REUSE** |
| `listQuestionnaireQueue(userId)` → `QuestionnaireQueueItem[]` (excl. `burner_profile`, `type='questionnaire'`, all statuses, `created_at ASC`) | **NEW** (surface 27) |

### App orchestration — `apps/web/lib` [Next-coupled, STAYS]
| Symbol | Signature | Status |
|---|---|---|
| `getReplayableForm(key)` | `=> ReplayableForm \| undefined` | **REUSE** |
| `REGISTRY` / `BURNER_PROFILE` | replay registry | **REUSE** (registry semantics stay app-side; see Hybrid) |
| `listCompletedForms(userId)` | `=> Promise<CompletedFormSummary[]>` | **REUSE** |
| `recordFormEdit` / `listFormEdits` | E2E-aware change-log wrappers | **REUSE** |
| `getBurnerProfile` / `upsertBurnerProfile` / `setIdDocuments` / `getIdDocuments` / `setProfileImage` | test-mode-routed I/O (users.ts) | **REUSE** |
| `seedBurnerProfileAction` / `satisfyBurnerProfileAction` / `getPendingRequiredActions` | gate helpers (users.ts) | **REUSE** |
| `getQuestionnaireQueue(userId)` | E2E-aware wrapper over db `listQuestionnaireQueue` | **NEW** (thin, surface 27) |

### App route/server boundary — `apps/web/app` [Next-coupled, STAYS]
| Symbol | Status |
|---|---|
| `saveBurnerProfile(raw, final)` (`onboarding/.../actions.ts`) | **REUSE** (imports shift to `packages/core` for catalogue/`validateIdNumber`) |
| `saveFormReplay(key, raw, final)` (`tools/forms/[key]/actions.ts`) | **REUSE** (import shifts) |
| onboarding `page.tsx`, `tools/forms` pages, runner/gate/complete pages | **REUSE/EXTEND** presentation (other plan) |

**DELETE:** none. No dead code identified in this domain. (`saveFormReplay`'s `final=false` branch is dormant, not dead — kept as forward-compat per spec 12; do not remove.)

---

## Hybrid extraction — what moves to packages, what stays in app

The locked HYBRID rule: keep `packages/db` for schema+data-access; **extract framework-agnostic business logic + validation** out of `apps/web/lib` into packages; **leave Next-coupled bits** (server actions, auth/session, `server-only`, route handlers) in `apps/web`.

### MOVE to `packages/core` [NEW pure package] — verified framework-agnostic
1. **`apps/web/lib/questionnaire.ts` → `packages/core/src/questionnaire-catalogue.ts`.**
   Justification: it imports only `@camp404/types` (type-only) and `./countries` (pure data) — **no `next/`, no `server-only`**. It is the question-catalogue definition, the canonical example of "pure → candidate for packages" called out in the task. Today it sits in the app only by historical accident; consumers (`actions.ts`, `users.ts`, `forms.ts`, `member-detail.ts`, onboarding `page.tsx`) all import it as a plain value and would switch to `@camp404/core`.
2. **`apps/web/lib/countries.ts` → `packages/core/src/countries.ts`** (carried with the catalogue, since the catalogue depends on it). Pure data + a flag-emoji helper, zero imports.
3. **`apps/web/lib/id-validation.ts` → `packages/core/src/id-validation.ts`.**
   Justification: `validateIdNumber` + the SA-ID Luhn/date and passport-regex helpers have **zero imports** — purest possible. Extracting it means server and client can share one ID check (prerequisite if the owner ever asks to close the server-side `id.number` gap — Open question). Current consumer is the client `wizard.tsx`; it would import from `@camp404/core`.

> Why a NEW `packages/core` rather than folding into `packages/types`: `packages/types` is the Zod/TS type layer. The catalogue is a *data constant* and `validateIdNumber` is *business logic*, not type definitions; mixing them muddies the type package's role. `packages/core` is the locked home for "framework-agnostic business logic + validation extracted from `apps/web/lib`." (If the team prefers fewer packages, these are also acceptable in `packages/types`; flag the package-boundary choice — it does not change the code.)

### STAY in `packages/db` (data-access; some are pure but belong with their columns)
- `id-documents.ts` (pure mapping) — STAYS in db. Justification: it is the documented PII split boundary co-located with the encrypted `users` columns it targets; its consumers are db/app write paths; moving it is churn for no gain. (It is *eligible* for `core` but the cost/benefit says leave it.)
- `crypto.ts` — STAYS in db. Node `node:crypto` + bound to `PGCRYPTO_KEY` and the specific encrypted columns. Not app-framework-coupled, but it is infrastructure, not portable business logic.
- All Drizzle data-access (`burner-profile.ts`, `questionnaire-edits.ts`, `activations.ts`, `versions.ts`) — STAYS in db by definition.

### STAY in `apps/web` (Next-coupled / server-only / app-config)
- `apps/web/lib/forms.ts` — STAYS. It is `server-only` (`:1`), wires the replay registry to the **users orchestration** (test-mode backends) and the E2E **test store**, and is app-session-shaped. The *registry pattern* (key → load/save) is app glue, not portable logic. Keep here.
- `apps/web/lib/users.ts` helpers (`getBurnerProfile`, `upsertBurnerProfile`, `setIdDocuments`, gate helpers) — STAY. Test-mode routing + session context is app concern.
- `apps/web/app/onboarding/questionnaire/actions.ts`, `tools/forms/[key]/actions.ts` — STAY. `"use server"`, `redirect()`, auth gates.
- `apps/web/lib/required-actions.ts` (`ACTION_ROUTES`, `nextGate`) — STAYS. Route mapping is app routing config.

### Net effect of the extraction
Three pure files move app→`packages/core`; their ~6 import sites change from `@/lib/...` to `@camp404/core`. The validation engine already lives correctly in `packages/types`. No behaviour changes from the move itself.

---

## Build steps — ordered, with acceptance criteria + test approach

Existing tests to preserve/extend (all green today):
- `packages/types/src/__tests__/questionnaire.test.ts` — `validateResponses`, `displayResponseValue`, `diffResponses`.
- `apps/web/lib/__tests__/id-documents.test.ts` — `splitIdNumber`/`mergeIdNumber`/`idColumnsFor` (imports from `@camp404/db/id-documents`).
- `apps/web/lib/__tests__/versions.test.ts` — `meetsRequiredVersion`.
- `apps/web/components/__tests__/questionnaire.test.ts` + `wizard.test.tsx` — field renderer + wizard incl. `validateIdNumber` cross-field.
- `apps/web/app/onboarding/questionnaire/actions.test.ts` — `saveBurnerProfile` typed-error path.
- (No tests exist for `id-validation.ts` itself, the catalogue, `upsertBurnerProfile`, or `activations`.)

**Step 0 — Resolve content reconciliations (BLOCKING, owner decisions, no code):**
- Hardware-competency page: keep-as-own (12 pages) vs merge (11 pages). Lock the catalogue page shape before touching it.
- `team_interest` range 0–5 vs 0–6.
- Copy edits (subtitles/intro/dietary prompts).
Acceptance: decisions recorded; the "Step N of M" total is derived from `questionnaire.pages.length`, never a literal (already true in `ProgressBar`).

**Step 1 — Create `packages/core` and move the pure catalogue + ID validation.**
- New package `packages/core` with `questionnaire-catalogue.ts` (from `lib/questionnaire.ts`), `countries.ts`, `id-validation.ts`; export from package root + subpaths mirroring db's `package.json` style.
- Update import sites: `actions.ts`, `users.ts`, `forms.ts`, `member-detail.ts`, onboarding `page.tsx` (catalogue); `wizard.tsx` (`validateIdNumber`).
- Acceptance: `tsc`/build green; no `apps/web/lib/{questionnaire,countries,id-validation}.ts` left importing app modules; the moved files import nothing from `next/`/`server-only`/`@/`.
- Test: **add** `packages/core/src/__tests__/id-validation.test.ts` (currently untested) — SA-ID valid/invalid Luhn, YYMMDD bounds, passport 6–12 alnum, empty, null-type. Move nothing from existing tests; re-point `id-documents.test.ts` only if `idColumnsFor` relocates (it does not).

**Step 2 — Apply the catalogue content edits (after Step 0 locks them).**
- Edit `team_interest` `max` (only if owner chose 6); apply the hardware page decision; apply confirmed copy edits.
- Acceptance: `validateResponses(QUESTIONNAIRE, validFixture)` passes; `flattenQuestions(QUESTIONNAIRE)` still contains `competency.hardware`; page count matches the locked decision.
- Test: **add** a catalogue smoke test in `packages/core` — every question id is unique, every `kind` is in the union, `competency.hardware` survives, slider `max` equals the locked constant.

**Step 3 — Fix `completedAt` overwrite (data-integrity).**
- In `upsertBurnerProfile` (`packages/db/src/burner-profile.ts`), change the `onConflictDoUpdate` `completedAt` set to preserve the first non-null value: when `markComplete`, `sql\`COALESCE(${burner_profiles.completedAt}, ${now})\``; when not, keep existing (current behaviour). Mirror the same fix in the E2E in-memory backend (`apps/web/lib` test backend) so test + real agree.
- Update the stale idempotency comment in `lib/forms.ts:78-80` so SQL and comment no longer contradict.
- Acceptance: a second `markComplete` upsert leaves `completed_at` at the original timestamp while bumping `updated_at`; replay "Last edited" still derives from `updatedAt ?? completedAt`.
- Test: **add** `packages/db` (or app-lib) unit covering the in-memory backend's COALESCE behaviour: first complete sets `completedAt`; second complete preserves it, bumps `updatedAt`. (Real-DB SQL path is covered by the in-memory mirror + existing e2e completion flow.)

**Step 4 — Add the surface-27 required-queue read.**
- `listQuestionnaireQueue(userId)` in `packages/db/src/activations.ts` returning `QuestionnaireQueueItem[]` (type added to `packages/types`): `where type='questionnaire' and action_key <> 'burner_profile'`, all statuses, `order by created_at asc`.
- Thin E2E-aware wrapper `getQuestionnaireQueue(userId)` in `apps/web/lib` (returns `[]` under E2E, like `getPendingRequiredActions`).
- Acceptance: returns completed + pending + locked-derivable rows with `title`/`completedAt`/`dueAt`; excludes burner_profile; empty → surface renders "All done".
- Test: **add** an app-lib unit (mirrors `required-actions.test.ts` shape) asserting filter + ordering + burner_profile exclusion against the in-memory backend.

**Step 5 — (Conditional, owner-gated) Server-side `id.number` hardening.**
- Only if Step 0 elects to close the gap: have `saveBurnerProfile`/`saveFormReplay` call the now-shared `validateIdNumber` (from `packages/core`) on the split-out `idNumber` before encrypting; on failure return `{ ok:false, errors: { "id.number": msg } }`.
- Acceptance: a malformed-but-short SA-ID is rejected server-side with the same message the client shows.
- Test: extend `actions.test.ts` with a malformed-ID final-submit case.
- Default: **skip** (documented, not patched, per MEMORY policy) unless owner asks.

Each step is independently shippable behind green CI; Step 1 is the largest churn (import moves) and should land alone.

---

## Cross-domain dependencies

- **Auth / users domain (`apps/web/lib/users.ts`):** owns the test-mode-routed I/O this domain calls — `getBurnerProfile`, `upsertBurnerProfile`, `setIdDocuments`/`getIdDocuments` (encrypt/decrypt), `setProfileImage`, and the gate helpers `seedBurnerProfileAction`/`satisfyBurnerProfileAction`/`getPendingRequiredActions`. The `completedAt` fix touches both this domain's db function and the users-domain in-memory backend; coordinate.
- **Required-actions / activations domain (`packages/db/src/activations.ts`, `apps/web/lib/required-actions.ts`):** `satisfyRequiredAction` + `meetsRequiredVersion` are the gate-satisfaction mechanism this domain triggers on completion; `ACTION_ROUTES`/`nextGate` route the gating spine to the runner. The NEW `listQuestionnaireQueue` lives here. If `PendingRequiredAction`/`QuestionnaireQueueItem` are promoted to `packages/types`, that is a shared-types change visible to that domain.
- **Roster / member-detail domain (`apps/web/lib/member-detail.ts`):** consumes `QUESTIONNAIRE` + `flattenQuestions`/`displayResponseValue` to render a member's answers, and `getIdDocuments` to show decrypted ID to captains. Moving the catalogue to `packages/core` changes its import path (`./questionnaire` → `@camp404/core`). Roster also owns the redesign's only schema change (`captain_promotion_requests`) — unrelated to this domain but the same migration pass.
- **Image/upload domain:** `profile.image` is an `image`-kind URL persisted into `responses` and mirrored to `users.profile_image_url` (`setProfileImage`); the upload pipeline (`AvatarUpload`/blob endpoint) is its own domain — this domain only stores/mirrors the resulting URL.
- **Voice/dictation (S21):** `long_text` fields host `RecorderPanel`; that is a presentation/voice domain — this domain only owns the `long_text` kind + `maxLength`.
- **packages/types:** the shared validation engine + change-log + (new) `QuestionnaireQueueItem` type are consumed by app actions and any future runner routes; it is the cross-cutting contract this domain centres on.
