# Unit 01 — Questionnaire definition / engine / runtime / results (donor harvest)

DONOR: `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app` (quagga-portal / AfrikaBurn Contributors App)
TARGET: `/home/ryan/repos/Personal/camp-404` (Camp 404)
All paths below are DONOR-relative unless prefixed `camp-404/`.

---

## 0. Purpose and the one-line verdict

This subsystem is a **Google-Forms-parity form engine**: a JSONB definition format (15 question
kinds + 2 content blocks + 2 page kinds), a pure structural validator, a pure branch-resolving
runtime, a pure per-question results aggregator, an activation/gating spine, and the authoring +
respondent + results UI on top of all four.

Two facts make it the single highest-value unit in the whole harvest:

1. **It is a descendant of Camp 404's own code.** `packages/types/src/questionnaire.ts:3-6`
   says verbatim: *"Ported from the Camp 404 questionnaire spine."* `docs/build-spec.md:115`
   says the four tables are *"ported 1:1 from Camp 404's pattern"*. So this is not a foreign
   port — it is **Camp 404's engine after nine more months of feature growth**. Re-importing it
   is a re-merge, not a graft.
2. **The pure core is genuinely tenant-free.** `questionnaire-definition.ts` (350 lines),
   `questionnaire-runtime.ts` (304), `questionnaire-results.ts` (419) and
   `packages/types/src/questionnaire.ts` (764) contain **zero** references to `groupId`,
   `editionId`, `orgId`, tenancy or the org/participant split (verified by grep). They are
   drop-in for Camp 404 modulo the `@quagga/` → `@camp404/` scope rename.

Coupling is concentrated in exactly three places, all of them shallow and all of them named in
§10: the `AudienceSpec` union, `questionnaire-authz.ts`, and the `editionId`/`groupId` columns on
the three DB tables.

Camp 404 relevance: this maps directly onto **builder Phase E (metrics + responses table +
per-respondent view + CSV export)**, which the target has *zero code for*, and onto WP4 (#128)
questionnaire delivery and WP10 (#134) response read-back. It also supplies eight question kinds,
branching, shuffle, "Other…", grids, and content blocks that Camp 404's
`packages/types/src/questionnaire-builder.ts` does not have.

---

## 1. File inventory (with line counts)

### 1a. Pure core — the crown jewels (zero I/O, zero tenancy)

| File | Lines | What |
|---|---|---|
| `packages/types/src/questionnaire.ts` | 764 | The whole definition + response schema: 15 question kinds, 2 content blocks, 2 page kinds, `validateOne`, `validateResponses`, `flattenQuestions`, `pageQuestions`, `pageBlocks`, `isAnswerableBlock`, the `other:` encoding, `TextFormat` presets |
| `packages/core/src/questionnaire-definition.ts` | 350 | `validateQuestionnaireDefinition` — structural integrity Zod cannot express: id uniqueness, option-value uniqueness, forward-only branch targets, reachability, range consistency. 11-member issue-code enum, dotted issue paths |
| `packages/core/src/questionnaire-runtime.ts` | 304 | Branch resolution (`nextPageId`, `resolvePath`), `visibleQuestions`, `deriveProgress`, `validateSubmission` (branch-aware server validation), `allQuestions`, deterministic seeded shuffle (`presentationBlocks`, `presentationOptions`) |
| `packages/core/src/questionnaire-results.ts` | 419 | `aggregateResponses` / `aggregateQuestion` — 7 chart shapes (choice, scale, rating, boolean, text, timeline, grid) + orphan-answer detection |
| `packages/core/src/questionnaire-activation.ts` | 142 | Action-key convention (`questionnaire:<id>`), `resolveActivationDefinition` (the snapshot rule), `buildActivationRequiredActions`, `completeRequiredAction`, `tallyActivationCompletion` |
| `packages/core/src/questionnaire-engine.ts` | 52 | `BURNER_BIO_ACTION_KEY`, `firstBlockingAction`, `isParticipantFacingActivation` |
| `packages/core/src/questionnaire-authz.ts` | 143 | Authoring / activation / results-visibility predicates. **Org-coupled** |
| `packages/core/src/audience.ts` | 313 | `resolveAudience(spec, ctx)` — audience spec → user ids. **Org-coupled** |
| `packages/core/src/form-2.ts` | 177 | `mapForm2Answers` — the "questionnaire answers mirrored into typed columns, with honest drift reporting" pattern. **AfrikaBurn-specific data, generic pattern** |
| `packages/types/src/audience.ts` | 191 | `AudienceSpec` discriminated union + `QuestionnaireBuilderInput` / `QuestionnaireActivationInput` boundary schemas. **Org-coupled** |

### 1b. Tests — the contract documentation (2,617 lines)

| File | Lines |
|---|---|
| `packages/core/src/__tests__/questionnaire-runtime.test.ts` | 607 |
| `packages/core/src/__tests__/questionnaire-definition.test.ts` | 558 |
| `packages/types/src/__tests__/questionnaire-validate-one.test.ts` | 438 |
| `packages/core/src/__tests__/questionnaire-results.test.ts` | 341 |
| `packages/core/src/__tests__/questionnaire-authz.test.ts` | 194 |
| `packages/types/src/__tests__/question-fixtures.ts` | 182 (fixture) |
| `packages/core/src/__tests__/form-2.test.ts` | 178 |
| `packages/types/src/__tests__/questionnaire-responses.test.ts` | 175 |
| `packages/core/src/__tests__/questionnaire-snapshot.test.ts` | 171 |
| `packages/core/src/__tests__/questionnaire-grid.test.ts` | 171 |
| `packages/core/src/__fixtures__/questionnaire-v1.ts` | 163 (frozen v1 fixture) |
| `packages/types/src/__tests__/questionnaire-text-format.test.ts` | 157 |
| `packages/core/src/__tests__/questionnaire-activation.test.ts` | 111 |
| `packages/types/src/__tests__/questionnaire-grid.test.ts` | 100 |
| `packages/db/src/__tests__/questionnaire-upsert-target.test.ts` | 95 |
| `packages/core/src/__tests__/questionnaire-engine.test.ts` | 94 |
| `packages/types/src/__tests__/questionnaire-helpers.test.ts` | 83 |
| `packages/db/src/__tests__/form-2-template.test.ts` | 81 |

Plus app-level: `apps/org/lib/__tests__/questionnaire-actions.test.ts` (570),
`apps/org/lib/__tests__/questionnaire-queries.test.ts` (498),
`apps/web/lib/__tests__/questionnaire-store.test.ts` (778).

E2E: `e2e/specs/org-staff/questionnaire-build-activate-results.spec.ts`,
`e2e/specs/camp-member/camp-member-blocking-questionnaire.spec.ts`,
`e2e/specs/camp-member/camp-member-gate-released-by-close.spec.ts`,
`e2e/specs/camp-member/camp-member-cross-camp-isolation.spec.ts`.

Note: `packages/core/vitest.config.ts:87-92` sets a per-file coverage ratchet on
`src/questionnaire-authz.ts` (lines 98 / statements 94 / functions 100 / branches 88). The other
questionnaire modules ride the package globals (lines 90, statements 89, functions 92, branches 82).

### 1c. Builder UI (org console)

| File | Lines |
|---|---|
| `apps/org/components/questionnaires/block-editor.tsx` | 1098 |
| `apps/org/components/questionnaires/builder-v2.tsx` | 963 |
| `apps/org/components/questionnaires/results-view.tsx` | 609 |
| `apps/org/components/questionnaires/block-kinds.ts` | 462 |
| `apps/org/components/questionnaires/questionnaire-preview.tsx` | 201 |
| `apps/org/components/questionnaires/definition-issues.tsx` | 161 |
| `apps/org/components/questionnaire/activation-form.tsx` | 398 |
| `apps/org/components/questionnaire/field.tsx` | 401 (trimmed twin of the web one) |
| `apps/org/components/questionnaire/runner.tsx` | 296 (trimmed twin) |
| `apps/org/components/questionnaire/response-viewer.tsx` | 97 |
| `apps/org/components/questionnaire/console-gate.tsx` | 72 |
| `apps/org/components/questionnaire/content-block.tsx` | 49 |
| `apps/org/components/questionnaire/close-activation-button.tsx` | 37 |
| `apps/org/components/questionnaire/blocking-badge.tsx` | 26 |
| `apps/org/app/(console)/questionnaires/builder-actions.ts` | 111 |

### 1d. Runner UI (participant app)

| File | Lines |
|---|---|
| `apps/web/components/questionnaire/field.tsx` | 945 |
| `apps/web/components/questionnaire/runner.tsx` | 592 |
| `apps/web/components/questionnaire/builder.tsx` | 584 (camp-scoped v1 builder, 5 kinds) |
| `apps/web/components/questionnaire/burns-step.tsx` | 403 (bespoke bio tail step) |
| `apps/web/components/questionnaire/response-viewer.tsx` | 184 |
| `apps/web/components/questionnaire/close-questionnaire-button.tsx` | 100 |
| `apps/web/components/questionnaire/pending-questionnaires.tsx` | 88 |
| `apps/web/components/questionnaire/fill.tsx` | 62 |
| `apps/web/components/questionnaire/content-block.tsx` | 44 |
| `apps/web/components/questionnaire/blocking-badge.tsx` | 30 |
| `apps/web/app/(app)/questionnaires/[activationId]/page.tsx` | 190 |
| `apps/web/app/(app)/questionnaires/[activationId]/actions.ts` | 29 |

### 1e. Server data layer

| File | Lines |
|---|---|
| `apps/web/lib/questionnaire-store.ts` | 784 |
| `apps/org/lib/questionnaires/actions.ts` | 691 |
| `apps/org/lib/questionnaires/queries.ts` | 603 |
| `apps/web/app/(app)/camps/[slug]/questionnaires/actions.ts` | ~235 |
| `apps/web/lib/required-actions.ts` | 167 |

### 1f. Shared UI

`packages/ui/src/components/audience-select.tsx` (81) — a deliberately *dumb* audience picker: it
renders options and a "Resolves to ~N burners" line, and does not resolve anything
(`audience-select.tsx:15-18`).

### 1g. Docs

`docs/questionnaire-spec.md` (311) — the design authority. §"Builder v2 — Google Forms parity"
(lines ~256-311) is the target feature table; §"Engine mechanics" (~186-215) is the activation
contract.

---

## 2. Capability list (exhaustive, each cited)

### Definition format
- **15 question kinds**, one Zod object each, unioned by `z.discriminatedUnion("kind", …)` at
  `packages/types/src/questionnaire.ts:325-341`: `single_select`(:79), `multi_select`(:94),
  `short_text`(:111), `long_text`(:128), `date`(:141), `boolean`(:151), `email`(:161),
  `phone`(:173), `years`(:216), `linear_scale`(:229), `rating`(:244), `time`(:256),
  `file_link`(:269), `multi_choice_grid`(:301), `checkbox_grid`(:314).
- **2 content blocks** that take no answer: `info_block`(:349, heading optional + body required),
  `image_block`(:359, url + **required** `alt` + optional caption). Unioned at :368-371.
- **`PageBlock = z.union([Question, ContentBlock])`** (:377) — content blocks live in the SAME
  `page.questions` array, which is what makes v2 backward-compatible with v1 definitions (:374-376).
- **2 page kinds**: `QuestionsPage`(:414 — id, kind, title, optional subtitle, `questions:
  z.array(PageBlock).min(1)`, optional `next`, optional `shuffleQuestions`) and `IntroPage`(:426 —
  id, heading, body, optional `next`). Union at :435-438.
- **`Questionnaire = { version: string.min(1), pages: array(QuestionnairePage).min(1) }`** (:441-444).
- **Everything lives in one JSONB column.** `questionnaire.ts:17-19`: *"Everything below lives
  INSIDE the `definition` jsonb — no schema columns. Every field added here is optional (or
  defaulted on a brand-new kind), so a definition written before Builder v2 still parses and
  renders unchanged."*

### Per-kind authoring options
- `single_select`: `display` ∈ `radio | dropdown | image_grid` (`ChoiceDisplay`, :62), `allowOther`,
  `otherLabel`, `shuffleOptions`, per-option `goTo` branch target.
- `multi_select`: `display` ∈ `checkbox | image_grid` (`MultiChoiceDisplay`, :65), `allowOther`,
  `otherLabel`, `shuffleOptions`, `minSelections` (int, nonneg), `maxSelections` (int, positive).
- `QuestionOption` (:70-76): `value`, `label`, optional `imageUrl`, `imageAlt`, `goTo`.
- `short_text`: `maxLength` default **120**, `minLength`, `format` ∈ `TextFormat`, `min`, `max`.
- `long_text`: `maxLength` default **1000**, `minLength`. **Never format-checked**
  (`questionnaire.ts:748` guards `checkTextFormat` behind `q.kind === "short_text"`).
- `linear_scale`: `min` is `z.union([z.literal(0), z.literal(1)])`, `max` is `int().min(2).max(10)`,
  optional `minLabel`/`maxLabel`.
- `rating`: `steps` is `int().min(3).max(10)`, `glyph` ∈ `star | heart | number`.
- Grids: `rows: array(GridRow{id,label}).min(1)`, `columns: array(GridColumn{value,label}).min(1)`.

### `required` defaults are NOT uniform — copy them exactly
`single_select` **true**(:85) · `multi_select` **false**(:100) · `short_text` **true**(:118) ·
`long_text` **false**(:135) · `date` **true**(:146) · `boolean` **false**(:156) ·
`email` **true**(:167) · `phone` **true**(:179) · `years` **false**(:221) ·
`linear_scale` **true**(:238) · `rating` **true**(:251) · `time` **true**(:261) ·
`file_link` **false**(:275) · `multi_choice_grid` **true**(:308, "matching Google Forms") ·
`checkbox_grid` **false**(:321).

### "Other…" free text
- Encoded IN BAND: the stored value is `other:<text>`. `OTHER_PREFIX = "other:"`
  (`questionnaire.ts:30`), helpers `isOtherAnswer`(:33), `otherAnswerText`(:38),
  `toOtherAnswer`(:43). Rationale at :25-29: *"Keeping it in the same flat response map (rather
  than a companion key) means Builder v2 needs no change to `questionnaire_responses.responses`."*
- Definition-time guard: option values and grid column values **may not** start with `other:`
  (`questionnaire-definition.ts:231-237`, `:206-212`, issue code `reserved_option_value`).

### Text-format presets (closed enum, deliberately)
`TextFormat = z.enum(["text","email","url","phone","number","integer","alphanumeric"])`
(`questionnaire.ts:49-57`). The comment at :47-48 says *"a closed enum rather than
author-supplied regex, which would be a ReDoS surface"*. Regexes at :10-14:
- `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- `PHONE_RE = /^\+?[\d\s().-]{7,20}$/`
- `URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*$/i`
- `TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/`
- `ALNUM_RE = /^[a-z0-9 ]+$/i`

### Branching (single-choice only)
- Per-option `goTo` → a page id or the reserved `SUBMIT_TARGET = "__submit__"`
  (`questionnaire.ts:23`). A page id may never equal it (`questionnaire-definition.ts:152-158`,
  code `reserved_id`).
- Page-level `next` overrides linear fall-through.
- **Google Forms semantics, stated at `questionnaire-runtime.ts:7-11`**: *"a section's target is
  chosen by the LAST answered single-choice question on that section whose selected option carries
  a `goTo`. Failing that, the section's own `next`. Failing that, the following section in document
  order — and past the last section, submit."* Implemented at `:48-60`.
- **Branching on `multi_select` is refused** at definition time
  (`questionnaire-definition.ts:247-254`, code `branch_not_allowed`).
- Branches must move **forward only** — `self_branch`(:275-282), `backward_branch`(:283-290).
  Consequence at `:320-321`: *"Forward-only edges make this a single left-to-right sweep; no cycle
  detection is needed because a cycle cannot be expressed."*

### Reachability
Every page must be arrivable from page 0 (`questionnaire-definition.ts:322-341`, code
`unreachable_page`). Only run when `issues.length === 0` so it never fires on a definition already
broken elsewhere.

### Deterministic shuffle
`presentationBlocks(page, seed)` / `presentationOptions(question, seed)`
(`questionnaire-runtime.ts:283`, `:295`). FNV-1a `hash()`(:252) + **xorshift32** Fisher-Yates
(`seededShuffle`, :261-279). Seed is `${seed}:${page.id}` / `${seed}:${question.id}`. Rationale
at :247-250: *"a respondent must see a STABLE order across page revisits and reloads, so the runner
passes a per-response seed (e.g. the user id) rather than calling Math.random."* Options carrying a
`goTo` shuffle like any other — *"the branch follows the VALUE, never the position"* (:294).
Call site: `apps/web/components/questionnaire/fill.tsx:44-46` uses
`` `${activationId}:${respondentSeed}` ``; the org console gate deliberately uses only the
activation id (`console-gate.tsx:58-62`) so a gate is *"stable across reloads … but the same order
for everyone rather than per person."*

### Progress derivation
`deriveProgress(questionnaire, responses, currentPageId?)` → `QuestionnaireProgress`
(`questionnaire-runtime.ts:121-179`): `path`, `pageIndex` (-1 when off-path), `pageCount`,
`answered`, `total`, `requiredAnswered`, `requiredTotal`, `percent`, `complete`.
- Counts only questions on the **branch-resolved path** (:117-120): *"a required question inside a
  section they branched past can never block them."*
- `percent` = `Math.round((requiredAnswered/requiredTotal)*100)`, falling back to overall
  answered/total when nothing is required, and **100 for an empty questionnaire** (:163-166).
- `hasAnswer(question, value)`(:110) counts an answer only if it is present AND *valid* — an
  invalid answer reads as unanswered.

### Branch-aware submit validation — the security property
`validateSubmission(questionnaire, raw)` (`questionnaire-runtime.ts:195-238`). Two-pass:
1. Build a `driving` map by running `validateOne` over `allQuestions` — so the answers that DRIVE
   the branch count even before the path is known (:210-219).
2. Resolve `visibleQuestions(questionnaire, driving)` and validate only those (:221-230).

Stated contract (:185-193): *"questions the respondent branched PAST are neither required nor kept.
That makes branching safe both ways — a skipped required question can't block a legitimate
submission, and answers to skipped questions can't be smuggled into the stored response."*

### Results aggregation — 7 chart shapes
`aggregateResponses(questionnaire, responses[])` → `{ totalResponses, questions[], orphans[] }`
(`questionnaire-results.ts:389-411`). `AggregateBase` = `{questionId, prompt, questionKind,
responded, skipped, total}` (:49-59). Per kind:

| Chart | Kinds | Payload |
|---|---|---|
| `choice` | single_select, multi_select | `options: OptionTally[]` + `other: OtherTally[]` (sorted by count desc then text asc, :220-222) |
| `boolean` | boolean | `yes`, `no`, `percentYes` (denominator `yes+no`, :238) |
| `scale` | linear_scale | `min`,`max`,`minLabel`,`maxLabel`,`buckets`,`average` |
| `rating` | rating | `steps`, `buckets`, `average` |
| `timeline` | date, time, years | sorted distinct `buckets` + `earliest`/`latest` |
| `text` | short_text, long_text, email, phone, file_link | `answers: string[]` |
| `grid` | multi_choice_grid, checkbox_grid | `columns[]` + `rows[]` each with own `responded` and per-column tallies |

Robustness properties, stated at `:9-15`:
1. A question added AFTER responses came in reports **honest skip counts**.
2. Answers whose question was DELETED are surfaced as `orphans: {questionId, count}[]` (:396-402,
   sorted by questionId) — *"not silently dropped."*
3. Options deleted after collection **still get a row**, labelled by their raw value (:210-219).
4. Out-of-range scale values (a scale narrowed after collection) **keep their bucket**
   (`numericHistogram`, :371-377).
- `pct(count, denominator)` = `Math.round((count/denominator)*1000)/10` — **one decimal place**
  (:130-133). `average` = `Math.round((sum/n)*100)/100` — **two decimals**, null when n=0 (:380).
- `percent` denominator is *respondents who ANSWERED this question* — explicitly "Google Forms'
  denominator" (:27-28). Grid per-column percent uses that ROW's respondents (:340).

### Activation lifecycle
- `activationRequiredActionKey(id)` → `` `questionnaire:${id}` `` (`questionnaire-activation.ts:31`).
- `parseActivationActionKey(key)` → id or null (:37-42) — returns null for `burner_bio`, which is
  how the code-questionnaire and builder-questionnaire classes are told apart at read time.
- **`resolveActivationDefinition(snapshot, liveFallback)`** (:22-27) — *the* rule. The definition
  is snapshotted onto the activation at send time; the live definition is only a fallback for rows
  written before the snapshot column existed. See §9 for the verbatim excerpt and the regression
  test that proves the bug it fixes.
- `buildActivationRequiredActions(activation, userIds)` (:69-91) — one `RequiredActionInsert` per
  DE-DUPLICATED user id, carrying `type: "questionnaire"`, `status: "pending"`, `blocking`, `dueAt`.
- `completeRequiredAction(now = new Date())` → `{status:"completed", completedAt}` (:100-104).
- `isActivationResponseComplete(activationId, response)` (:113-122) — requires
  `response.activationId === activationId && response.completedAt != null`.
- `tallyActivationCompletion(actions)` → `{sent, completed, pending}` (:136-142) — anything not
  `completed` counts as outstanding.

### Gating spine
- `firstBlockingAction(actions)` (`questionnaire-engine.ts:30-37`) — first `blocking && pending`,
  input order = priority.
- `isParticipantFacingActivation(audience)` (:48-51) — `audience?.kind !== "org_internal"`.
  Org-coupled but a one-line predicate.
- `actionRoute(actionKey)` (`apps/web/lib/required-actions.ts:26-30`) — static registry
  `{ burner_bio: "/onboarding" }` plus the dynamic `questionnaire:<id>` →
  `/questionnaires/${activationId}`. **This is exactly Camp 404's `ACTION_ROUTES` /
  `nextGate` shape** (`camp-404/apps/web/lib/required-actions.ts:9-38`).

### CLOSE releases the gate — a bug Camp 404 will hit
Two independent mechanisms, both documented as fixes for the same class of bug:
1. **Read-side** (`apps/web/lib/required-actions.ts:128-165`): the required-actions query LEFT
   JOINs `questionnaire_activations` and computes
   `blocking: blocking && (activationStatus === null || activationStatus === "open")`.
   Comment: *"CLOSING AN ACTIVATION MUST RELEASE ITS GATE … a closed questionnaire went on
   hard-gating every recipient out of the whole app with no way back. 'Close' is the ONLY undo for
   a mis-sent blocking send; it has to mean it."* Same filter in the console
   (`apps/org/lib/questionnaires/queries.ts:547-553`).
2. **Write-side recall** (`apps/web/app/(app)/camps/[slug]/questionnaires/actions.ts:154-230`):
   closing a project questionnaire, in ONE transaction, sets the activation `closed` AND flips
   every still-`pending` `required_actions` row to `expired`. Completed rows are untouched. The
   response viewer renders `expired` as the badge **"Recalled"**
   (`apps/web/components/questionnaire/response-viewer.tsx:107-123`).

### Author-side results UI
- Summary/Individual tabs, per-question chart, orphan disclosure
  (`apps/org/components/questionnaires/results-view.tsx:71-120`).
- **CSV export** (:555-609): header `["Recipient","Status","Completed", ...questions.map(q=>q.prompt)]`,
  option/row/column labels resolved through `optionLabelMap`(:507-520), `formatCell`(:522-549)
  renders booleans as `Yes`/`No`, arrays joined with `"; "`, `other:` as `Other: <text>`, grids as
  `"Row: Col A, Col B | Row2: …"`. Quoting is `csvCell`(:551-553) = `"…"` with `"` doubled. Blob
  is written with a **UTF-8 BOM** (`﻿`) *"so Excel opens UTF-8 answers correctly"* (:583).
  **This is Camp 404's builder Phase E, already written.**
- Per-respondent viewer with a capped scrolling dialog
  (`apps/web/components/questionnaire/response-viewer.tsx:151-181`).

### Author preview
`QuestionnairePreview` (`apps/org/components/questionnaires/questionnaire-preview.tsx`) opens the
CURRENT draft in a dialog, walks it branch-aware via core `nextPageId`, persists nothing. Comment
at :30-34: it *"deliberately reuses the console's own QuestionField renderer so the preview tracks
what a real fill looks like, and reuses the same @quagga/core branching the runner and the submit
validator use — so what the author sees here is what a recipient actually gets."*

### Runner UX
`apps/web/components/questionnaire/runner.tsx`:
- **Trail-based navigation** (`:110-118`): the trail is the respondent's ACTUAL walk; Back pops,
  Next pushes — so a branch change reshapes history correctly.
- **Local draft autosave** to `localStorage`, key prefix `quagga:questionnaire-draft:`
  (`:44`), debounce `AUTOSAVE_DEBOUNCE_MS = 700` (`:45`). Hydrate at :146-162, save at :164-175,
  clear on final submit at :178-185. Rationale at :139-141: *"Zero-connectivity culture: a
  half-filled questionnaire must survive a reload or a dropped signal. The draft is LOCAL only —
  nothing is sent to the server until submit."* Visible `AutosaveIndicator` (:509-528) reading
  "Saved on this device".
- **Client-side per-page validation mirrors the server** — same `validateOne`
  (`validatePage`, :249-259).
- **Off-page server error recovery**: `pageOwningError`(:573-589) finds the page holding the first
  rejected question and `jumpTo`s it — *"A server error on a question the respondent can't see is
  a dead end"* (:266-268).
- **Step rail** rebuilt from `progress.path` (`buildRail`, :551-571).
- `navigateOnwards` defers push/refresh a macrotask so the transition settles — a documented fix
  for a Submit button stuck on "Saving…" on a questionnaire that HAD saved (:281-284).

### Blocking-gate UX
- `BlockingBadge` (`apps/web/components/questionnaire/blocking-badge.tsx`): destructive
  **"Required · blocks until done"** vs outline **"Optional"**. Comment at :4-8: the badge exists
  because *"Blocking status must be explicit EVERYWHERE a questionnaire is shown"* — reused on
  pending cards, list rows, the fill page and author views.
- Fill page (`apps/web/app/(app)/questionnaires/[activationId]/page.tsx`): hard-gate ordering at
  :55-59 — if an EARLIER blocking action is pending, redirect there first; only when THIS page is
  the current blocker does it render. Blocking mode uses answered-count progress + full-width
  submit (`fill.tsx:55-56`), and the chrome-stripping is done by the layout, not the page
  (:93-101, a documented "two headers" regression).
- `ConsoleGate` (`apps/org/components/questionnaire/console-gate.tsx`) — the identical hard gate
  applied to the org console. Only the runner and sign-out are reachable.
- `PendingQuestionnaires` card (`apps/web/components/questionnaire/pending-questionnaires.tsx`) —
  the NON-blocking surface with per-item badge + due date + "Complete now"/"Answer" CTA.
  **This is precisely Camp 404 WP4 (#128)'s missing non-blocking delivery path.**

### Builder UX
- **20-entry palette** with lucide icons, grouped `content` | `question`
  (`block-kinds.ts:73-215`): `info_block`, `image_block`, `short_text`, `long_text`,
  `single_select`, `multi_select`, `multi_choice_grid`, `checkbox_grid`, `dropdown`,
  `image_choice`, `linear_scale`, `rating`, `boolean`, `number`, `date`, `time`, `email`,
  `phone`, `file_link`, `years`.
- **Palette kinds ≠ engine kinds.** `block-kinds.ts:34-41`: `number` → `short_text` with
  `format:"number"`, `dropdown` → `single_select` with `display:"dropdown"`, `image choice` →
  `single_select` with `display:"image_grid"`. Reverse mapping `blockPaletteKind`(:222-235).
  *"The engine union in @quagga/types stays the single source of truth; nothing here invents a
  kind the runtime cannot render."*
- **Id allocation happens once, at insert.** `takenIds(draft)`(:242-249) collects page ids AND
  block ids (one namespace); `allocateId(prefix, taken)`(:252-258) finds the next free
  `prefix_n`. Comment at :237-239: *"Question ids key the response map, so they are allocated
  ONCE, at insert, and never recomputed. Reordering moves the object; the id rides along."*
  Prefixes: `block` for content blocks, `q` for questions, `section` for pages
  (`builder-v2.tsx:248-252`, `:270`).
- **`convertBlock(block, kind)`**(:391-437) changes a block's type IN PLACE, **preserving the id**
  so already-collected responses stay attached, plus prompt/helper/required and (where both sides
  have them) options. Branch targets are dropped on conversion.
- **`createBlock`**(:283-388) — every factory ships deliberately EMPTY required strings *"on
  purpose: the validator flags them as issues, which is exactly the feedback an author should get
  before saving."* Defaults worth copying: short_text `maxLength: 200`, number `maxLength: 20 +
  format:"number"`, long_text `maxLength: 2000`, linear_scale `min:1 max:5`, rating `steps:5
  glyph:"star"`, options `[{value:"option_1",label:""},{value:"option_2",label:""}]`,
  grid rows `row_1..row_2`, grid columns `col_1..col_3`.
- **Live inline issue placement.** The builder runs the SAME
  `validateQuestionnaireDefinition` client-side against the live draft
  (`builder-v2.tsx:197-201`) and `definition-issues.tsx` parses the validator's dotted paths to
  hang each issue on the exact section / block / option. It handles BOTH path dialects
  (`definition-issues.tsx:15-17`): structural `pages[2].questions[0].options[1]` and Zod-shape
  `pages.2.questions.0.prompt`, via `segmentIndex`(:25-32).
- **Editor state IS the definition** (`builder-v2.tsx:79-85`): *"a `Questionnaire` mutated
  immutably. That buys two things for free — question ids never drift on reorder (we move the
  object, not a projection of it), and `validateQuestionnaireDefinition` can be run against the
  live draft."*
- **Live resolved-audience count**, debounced 300ms and keyed on the SERIALISED spec
  (`builder-v2.tsx:210-226`) — *"keying on it (rather than the object, which is rebuilt every
  render) is what stops this resolving in a loop."*
- Draft vs Publish are two buttons; the publish flag is applied after the write
  (`builder-actions.ts:92-106`).

### Form-2 mirroring pattern (generic, data AfrikaBurn-specific)
`packages/core/src/form-2.ts` — questionnaire answers mirrored into typed domain columns, with the
mapping declared as DATA (`FORM_2_FIELD_MAP`, :56-67) and drift reported rather than swallowed.
`Form2MappingResult` = `{ columns, unmapped[], unfilled[] }` (:74-89). Reasoning at :24-32:
*"somebody can rename a question id, and the mirror would quietly stop filling a column while the
form still looked fine … A mapping that fails silently is worse than no mapping."*
Guarded by a **source-reading build-time test** (`packages/db/src/__tests__/form-2-template.test.ts`)
that asserts the seeded template's question ids and the mapping agree in both directions.

---

## 3. Data model (verbatim)

### Enums — `packages/db/src/schema.ts`
```ts
// Questionnaire spine (ported 1:1 from Camp 404's pattern).
export const requiredActionTypeEnum = pgEnum("required_action_type", [
  "questionnaire", "acknowledgement", "payment", "profile_update",
]);                                                                 // :240-245
export const requiredActionStatusEnum = pgEnum("required_action_status", [
  "pending", "completed", "waived", "expired",
]);                                                                 // :247-252
export const questionnaireScopeEnum = pgEnum("questionnaire_scope", [
  "everyone", "individual", "opt_in",
]);                                                                 // :254-258
export const activationStatusEnum = pgEnum("activation_status", [
  "draft", "open", "closed",
]);                                                                 // :260-264
export const questionnaireStatusEnum = pgEnum("questionnaire_status", [
  "draft", "published", "unpublished",
]);                                                                 // :266-270
export const questionnaireAuthoredScopeEnum = pgEnum(
  "questionnaire_authored_scope", ["org", "group"],
);                                                                  // :274-278
```

**Delta vs Camp 404** (`camp-404/packages/db/src/schema.ts`): `required_action_type`,
`required_action_status`, `activation_status`, `questionnaire_status` are **identical**.
`questionnaire_scope` is `["everyone","individual","opt_in"]` here vs Camp 404's
`["everyone","team","team_leads","individual","opt_in"]` — the donor moved team targeting out of
the scope enum and into the `audience` JSONB. `questionnaire_authored_scope` is donor-only and is
pure org/participant coupling.

### `questionnaire_definitions` (`schema.ts:1284-1295`)
| Column | Type |
|---|---|
| `key` | `text` **PRIMARY KEY** |
| `title` | `text NOT NULL` |
| `definition` | `jsonb $type<Questionnaire> NOT NULL` |
| `status` | `questionnaire_status NOT NULL DEFAULT 'draft'` |
| `version` | `text` (nullable) |
| `created_by_user_id` | `uuid → users.id ON DELETE SET NULL` |
| `created_at`, `updated_at` | `timestamp NOT NULL DEFAULT now()` |

Key namespacing conventions (string prefixes, no column):
- `org-<title-slug>` — org-authored (`apps/org/lib/questionnaires/actions.ts:63-71`, dedup loop
  `base`, `base-2`, … up to 200 at `:74-86`).
- `proj:<groupId>:<rand8>` — project-authored (`apps/web/lib/questionnaire-store.ts:41-49`).
- `burner_bio` — the code questionnaire.

### `questionnaire_activations` (`schema.ts:1297-1346`)
| Column | Type / note |
|---|---|
| `id` | `uuid defaultRandom PK` |
| `questionnaire_key` | `text NOT NULL` (loose reference, not an FK) |
| `version` | `text NOT NULL` |
| `title` | `text NOT NULL` |
| `description` | `text` |
| `scope` | `questionnaire_scope NOT NULL DEFAULT 'everyone'` |
| `blocking` | `boolean NOT NULL DEFAULT true` |
| `status` | `activation_status NOT NULL DEFAULT 'draft'` |
| `due_at` | `timestamp` |
| `authored_scope` | `questionnaire_authored_scope NOT NULL DEFAULT 'org'` — **org coupling** |
| `group_id` | `uuid → groups.id ON DELETE CASCADE` — **tenancy coupling** |
| `edition_id` | `uuid → editions.id ON DELETE CASCADE` — **year-namespace coupling** |
| `audience` | `jsonb $type<AudienceSpec>` |
| `definition` | `jsonb $type<Questionnaire>` — **THE SNAPSHOT**, nullable for pre-feature rows |
| `activated_by_user_id` | `uuid → users.id ON DELETE SET NULL` |
| `opened_at`, `closed_at`, `created_at`, `updated_at` | `timestamp` |

Indexes: `questionnaire_activations_key_idx(questionnaire_key)`, `…_status_idx(status)`,
`…_group_idx(group_id)`, `…_edition_idx(edition_id)`.

### `questionnaire_responses` (`schema.ts:1348-1428`)
| Column | Type / note |
|---|---|
| `id` | `uuid defaultRandom PK` |
| `user_id` | `uuid NOT NULL → users.id ON DELETE CASCADE` |
| `definition_key` | `text NOT NULL` |
| `edition_id` | `uuid NOT NULL → editions.id ON DELETE CASCADE` — migration 0020 |
| `definition_version` | `text NOT NULL` |
| `responses` | `jsonb $type<QuestionnaireResponses> NOT NULL DEFAULT {}` |
| `activation_id` | `uuid → questionnaire_activations.id ON DELETE SET NULL` |
| `group_id` | `uuid → groups.id ON DELETE CASCADE` — migration 0028, nullable |
| `completed_at` | `timestamp` |
| `updated_at` | `timestamp NOT NULL DEFAULT now()` |

**The two partial unique indexes** — the most transferable schema idea in the unit:
```ts
userDefIdx: uniqueIndex("questionnaire_responses_user_def_idx")
  .on(r.userId, r.definitionKey, r.editionId)
  .where(sql`${r.groupId} is null`),
userDefGroupIdx: uniqueIndex("questionnaire_responses_user_def_group_idx")
  .on(r.userId, r.definitionKey, r.editionId, r.groupId)
  .where(sql`${r.groupId} is not null`),
```
Reason (`schema.ts:1401-1408`): *"TWO PARTIAL INDEXES rather than one widened index, because
Postgres treats NULLs as DISTINCT in a unique index: adding `group_id` to the existing one would
have quietly allowed unlimited duplicate Burner Bio rows per person."*
Plus `defIdx(definition_key)` and `groupIdx(group_id, definition_key)`.

### `required_actions` (`schema.ts:1443-1484`)
| Column | Type |
|---|---|
| `id` | `uuid defaultRandom PK` |
| `user_id` | `uuid NOT NULL → users.id CASCADE` |
| `edition_id` | `uuid NOT NULL → editions.id CASCADE` — migration 0024 |
| `type` | `required_action_type NOT NULL` |
| `action_key` | `text NOT NULL` |
| `version` | `text` |
| `activation_id` | `uuid → questionnaire_activations.id SET NULL` |
| `title` | `text NOT NULL` |
| `blocking` | `boolean NOT NULL DEFAULT true` |
| `status` | `required_action_status NOT NULL DEFAULT 'pending'` |
| `due_at`, `created_at`, `completed_at` | `timestamp` |

Indexes: `uniqueIndex("required_actions_user_edition_action_idx").on(userId, editionId, actionKey)`
and `index("required_actions_user_status_idx").on(userId, status)`. The comment at `:1470-1471`
notes the edition sits in the MIDDLE *"so the index still serves a lookup by user alone … on its
leading column."*

### Migrations
`0000_stormy_raider.sql` (initial spine), `0004_questionnaire_audience_and_project_roles.sql`
(authored_scope / group_id / edition_id / audience columns + project_roles),
`0009_left_blue_shield.sql`, `0012_first_kabuki.sql`,
`0020_past_morg.sql` (edition namespace, **hand-edited** to land the column nullable, backfill,
then set NOT NULL; refuses to guess with >1 edition), `0024_lively_maverick.sql` (per-edition
required_actions), `0028_questionnaire_responses_group_scope.sql` (camp-scoped answers + the two
partial indexes).

---

## 4. Public API surface (verbatim signatures)

### `@quagga/types` — `packages/types/src/questionnaire.ts`
```ts
export const SUBMIT_TARGET = "__submit__";
export const OTHER_PREFIX  = "other:";
export function isOtherAnswer(value: string): boolean;
export function otherAnswerText(value: string): string;
export function toOtherAnswer(text: string): string;

export const TextFormat: z.ZodEnum<["text","email","url","phone","number","integer","alphanumeric"]>;
export const ChoiceDisplay: z.ZodEnum<["radio","dropdown","image_grid"]>;
export const MultiChoiceDisplay: z.ZodEnum<["checkbox","image_grid"]>;

export const ATTENDED_YEAR_MIN = 2007;
export const ATTENDED_YEAR_MAX = 2026;
export const NO_BURN_YEARS: readonly number[] = [2020, 2021];
export function isValidAttendedYear(year: number): boolean;
export function attendedYearOptions(): { year: number; disabled: boolean }[];

export function isAnswerableBlock(block: PageBlock): block is Question;
export function flattenQuestions(questionnaire: Questionnaire): Question[];
export function pageQuestions(page: QuestionnairePage): Question[];
export function pageBlocks(page: QuestionnairePage): PageBlock[];

export function validateResponses(
  questionnaire: Questionnaire,
  raw: unknown,
): { ok: true; responses: QuestionnaireResponses }
 | { ok: false; errors: Record<string, string> };

export function validateOne(
  q: Question,
  raw: unknown,
): { ok: true; value: QuestionnaireResponseValue | undefined }
 | { ok: false; error: string };

export type SaveResult = { ok: true } | { ok: false; errors: Record<string, string> };
export type QuestionnaireResponseValue = number | string | string[] | boolean | GridAnswer | null;
export type GridAnswer = Record<string, string[]>;
```

### `@quagga/core` — definition validator
```ts
export type DefinitionIssueCode =
  | "shape" | "duplicate_id" | "reserved_id" | "duplicate_option_value"
  | "reserved_option_value" | "unknown_branch_target" | "backward_branch"
  | "self_branch" | "branch_not_allowed" | "unreachable_page" | "invalid_range";

export interface DefinitionIssue { path: string; code: DefinitionIssueCode; message: string }

export type DefinitionValidation =
  | { ok: true; definition: Questionnaire; issues: readonly [] }
  | { ok: false; issues: DefinitionIssue[] };

export function validateQuestionnaireDefinition(raw: unknown): DefinitionValidation;
export function isValidQuestionnaireDefinition(raw: unknown): boolean;
```

### `@quagga/core` — runtime
```ts
export function pageById(questionnaire: Questionnaire, pageId: string): QuestionnairePage | null;
export function nextPageId(q: Questionnaire, pageId: string, responses: QuestionnaireResponses): string | null;
export function resolvePath(q: Questionnaire, responses: QuestionnaireResponses): string[];
export function visibleQuestions(q: Questionnaire, responses: QuestionnaireResponses): Question[];
export function hasAnswer(question: Question, value: unknown): boolean;
export function allQuestions(questionnaire: Questionnaire): Question[];

export interface QuestionnaireProgress {
  path: string[]; pageIndex: number; pageCount: number;
  answered: number; total: number;
  requiredAnswered: number; requiredTotal: number;
  percent: number; complete: boolean;
}
export function deriveProgress(
  questionnaire: Questionnaire,
  responses: QuestionnaireResponses,
  currentPageId?: string,
): QuestionnaireProgress;

export function validateSubmission(
  questionnaire: Questionnaire,
  raw: unknown,
): { ok: true; responses: QuestionnaireResponses; progress: QuestionnaireProgress }
 | { ok: false; errors: Record<string, string> };

export function presentationBlocks(page: QuestionnairePage, seed: string): PageBlock[];
export function presentationOptions(question: Question, seed: string): QuestionOption[];
```

### `@quagga/core` — results
```ts
export interface OptionTally  { value: string; label: string; count: number; percent: number }
export interface OtherTally   { text: string; count: number }
export interface ScaleBucket  { value: number; count: number; percent: number }
export interface OrphanAnswers { questionId: string; count: number }
export interface QuestionnaireResults {
  totalResponses: number; questions: QuestionAggregate[]; orphans: OrphanAnswers[];
}
export type QuestionAggregate = /* 7-arm discriminated union on `chart` */;
export function aggregateResponses(
  questionnaire: Questionnaire,
  responses: readonly QuestionnaireResponses[],
): QuestionnaireResults;
export function aggregateQuestion(
  question: Question,
  responses: readonly QuestionnaireResponses[],
): QuestionAggregate;
```

### `@quagga/core` — activation
```ts
export function resolveActivationDefinition<T>(snapshot: T | null | undefined, liveFallback: T): T;
export function activationRequiredActionKey(activationId: string): string;
export function parseActivationActionKey(actionKey: string): string | null;

export interface ActivationLike { id: string; title: string; blocking: boolean; dueAt: Date | null }
export interface RequiredActionInsert {
  userId: string; type: "questionnaire"; actionKey: string; activationId: string;
  title: string; blocking: boolean; status: "pending"; dueAt: Date | null;
}
export function buildActivationRequiredActions(
  activation: ActivationLike, userIds: readonly string[],
): RequiredActionInsert[];

export interface RequiredActionCompletion { status: "completed"; completedAt: Date }
export function completeRequiredAction(now?: Date): RequiredActionCompletion;

export interface ResponseLike { activationId: string | null; completedAt: Date | null }
export function isActivationResponseComplete(activationId: string, response: ResponseLike | null | undefined): boolean;

export interface ActivationCompletion { sent: number; completed: number; pending: number }
export function tallyActivationCompletion(actions: readonly { status: string }[]): ActivationCompletion;
```

### `@quagga/core` — engine + authz
```ts
export const BURNER_BIO_ACTION_KEY = "burner_bio";
export interface RequiredActionLike {
  actionKey: string; blocking: boolean;
  status: "pending" | "completed" | "waived" | "expired";
}
export function firstBlockingAction<T extends RequiredActionLike>(actions: readonly T[]): T | null;
export function isParticipantFacingActivation(audience: AudienceSpec | null | undefined): boolean;

export interface AuthzMembership { groupId: string; role: MembershipRole }
export function isOrgAuthor(memberships: readonly AuthzMembership[], orgGroupId: string): boolean;
export function isProjectAdmin(memberships: readonly AuthzMembership[], groupId: string): boolean;
export function canAuthorAudience(m: readonly AuthzMembership[], spec: AudienceSpec, orgGroupId: string): boolean;
export const canActivateAudience = canAuthorAudience;
export interface AuthzActivation { authoredScope: "org" | "group"; groupId: string | null }
export function canViewActivationResults(m: readonly AuthzMembership[], activation: AuthzActivation, orgGroupId: string): boolean;
export function canManageProjectRoles(m: readonly AuthzMembership[], groupId: string): boolean;
export function projectAudienceTargetRoleIds(audience: ProjectAudience, baselineRoleId: string | null): string[];
export function canAuthorProjectQuestionnaire(
  m: PermissionMembership, audience: ProjectAudience, blocking: boolean, baselineRoleId: string | null,
): boolean;
```

### `@quagga/core` — form-2
```ts
export interface Form2Columns { /* 8 keys, see §2 */ }
export const FORM_2_FIELD_MAP: Readonly<Record<string, { column: keyof Form2Columns; kind: "number"|"text"|"urls" }>>;
export const FORM_2_COLUMNS: readonly (keyof Form2Columns)[];
export interface Form2MappingResult { columns: Partial<Form2Columns>; unmapped: string[]; unfilled: (keyof Form2Columns)[] }
export function mapForm2Answers(responses: QuestionnaireResponses): Form2MappingResult;
```

### Server data layer (shape worth copying, code needs de-tenanting)
`apps/web/lib/questionnaire-store.ts`: `createAndActivateProjectQuestionnaire`,
`listProjectQuestionnaires`, `getActivation`, `getActivationResults`, `getFillView`,
`listPendingQuestionnaires`, `submitResponse`, `isProjectDefinitionKey`.
`apps/org/lib/questionnaires/actions.ts`: `saveQuestionnaireDefinition`, `previewAudienceCount`,
`activateQuestionnaire`, `closeActivation`, `submitConsoleQuestionnaire`.
`apps/org/lib/questionnaires/queries.ts`: `audienceLabel`, `listOrgQuestionnaires`,
`getOrgDefinition`, `getOrgActivation`, `canReadActivationResults`, `getActivationResults`,
`buildAudienceContext`, `getConsoleBlockingQuestionnaire`.
`apps/web/lib/required-actions.ts`: `actionRoute`, `ensureRequiredAction`,
`completeRequiredAction`, `listRequiredActions` (React `cache`d).

---

## 5. UX behaviours worth stealing verbatim

1. **Blocking status is stated on every surface.** One `BlockingBadge` component, used on pending
   cards, list rows, the fill page, the console gate, builder and activation views.
2. **A blocking questionnaire is a genuine takeover** — only the fill page and sign-out are
   reachable, and the *shell* decides to strip itself (`viewerIsGated()`), not the page. The donor
   records a real regression where the page drew its own minimal header while the hoisted layout
   drew the full nav above it (fill page :93-101).
3. **Gate ordering** — if an EARLIER blocking action is pending, the deep-linked fill page
   redirects to it rather than rendering (fill page :55-59).
4. **Local-only draft autosave** with a visible "Saved on this device" indicator, 700 ms debounce,
   cleared on final submit. Explicitly not sent to the server: no half-answers land in the store.
5. **Server errors jump the respondent to the owning page.**
6. **Prefill is edition-scoped but NOT activation-scoped.** Within one edition a re-send prefills
   with what the person said last time (*"the person is revising a living answer"*,
   `questionnaire-store.ts:587-593`); across editions it is a clean namespace.
7. **Author preview reuses the real renderer and the real branching** — no second implementation.
8. **Live audience count** while composing, debounced, from the one resolver.
9. **The builder tells the author what is wrong, inline, before saving** — issues addressed by
   dotted path to the exact section / block / option; save is refused client-side AND server-side.
10. **"Every question you add is a question someone in the desert has to answer"** — the required
    toggle's hint is *"Only if a missing answer genuinely blocks the burn."*
    (`block-editor.tsx` required ToggleRow).
11. **A draft is not sendable, and the refusal names the state.**
    `apps/org/lib/questionnaires/actions.ts:325-336` refuses to activate a `draft` or `unpublished`
    definition with two distinct messages, because *"Sending a draft snapshots the half-written
    definition into the activation and, when it is blocking, hard-gates everyone it resolves to
    behind questions the author had not finished writing."*
12. **`expired` renders as "Recalled"**, not "Pending" — *"They are not 'pending'; nothing is
    waiting on them"* (`response-viewer.tsx:107-109`).
13. **Results dialogs are height-capped and scroll inside** — a documented fix for a 20-question
    response being partly unreadable behind a modal-locked page (`response-viewer.tsx:155-160`,
    `questionnaire-preview.tsx:52-59`).
14. **Content blocks are decorative by construction**, not by discipline
    (`content-block.tsx:4-8`): `pageQuestions()`/`visibleQuestions()` filter them upstream, so the
    component *cannot* be answerable.

---

## 6. Validation + edge-case rules, digit-exact

### `validateOne` — the missing-value gate (`questionnaire.ts:584-590`)
`undefined`, `null` and `""` are all "missing". A required question errors with
`"This question is required"`; an optional one returns `{ok:true, value:undefined}` (a SKIP, not a
stored blank). Note `false` and `0` are NOT missing.

### Per-kind rules
| Kind | Rule | Error string |
|---|---|---|
| `boolean` | must be a real boolean; `"yes"` is refused, not coerced | `"Expected yes or no"` |
| `email` | non-string → `"Expected text"`; fails `EMAIL_RE` → | `"Enter a valid email address"` |
| `phone` | `PHONE_RE` **and** stripped digit count in **[7, 15]** | `"Enter a valid phone number"` |
| `single_select` | non-string → `"Expected a choice"`; `other:` without `allowOther` → `"Not a valid option"`; empty other text → `"Tell us what your 'other' answer is"`; unlisted value → `"Not a valid option"` | |
| `multi_select` | non-array or non-string element → `"Expected a list of choices"`; **unknown values are silently DROPPED**, not errors; disallowed `other:` is dropped; required + empty after filtering → `"Pick at least one option"`; `minSelections` binds **only once something is picked** → `` `Pick at least ${n} options` ``; `maxSelections` → `` `Pick at most ${n} options` `` | |
| `linear_scale` | `typeof raw === "boolean"` refused explicitly (a bare `Number()` would make it 1/0); non-integer → `"Pick a value on the scale"`; out of `[min,max]` → `` `Pick a value between ${min} and ${max}` `` | |
| `rating` | same boolean guard; `n < 1 \|\| n > steps` → `` `Pick a rating between 1 and ${steps}` `` | |
| `time` | `TIME_RE` 24-hour | `"Use 24-hour hh:mm"` |
| `file_link` | `URL_RE` on the TRIMMED value; **stores the trimmed value** | `"Enter a link starting with http:// or https://"` |
| grids | non-object/array → `"Expected a grid of answers"`; iterates the **DEFINITION's rows** so unknown row keys and unknown column values are dropped; duplicate picks de-duplicated; `multi_choice_grid` with >1 pick in a row → `` `Pick one column for "${row.label}"` ``; required + any empty row → `` `Answer every row — "${label}" is missing` ``; **an optional grid left entirely blank returns `value: undefined`** (a valid skip) | |
| `years` | `/^\d{4}$/` AND `isValidAttendedYear`; **dedupes preserving first-seen order**; required + empty → `"Pick at least one year"` | `` `${s} isn't a valid AfrikaBurn year` `` |
| `short_text`/`long_text` | non-string → `"Expected text"`; `> maxLength` → `` `Max ${n} characters` ``; `< minLength` → `` `At least ${n} characters` ``; format check **short_text only** | |
| `date` | `/^\d{4}-\d{2}-\d{2}$/` then `Date.parse` | `"Use yyyy-mm-dd"` / `"Not a real date"` |

### `checkTextFormat` (`questionnaire.ts:545-576`) — operates on `raw.trim()`
`undefined`/`text` → pass · `email` → `"Enter a valid email address"` · `url` →
`"Enter a link starting with http:// or https://"` · `phone` → `PHONE_RE` + digits ∈ [7,15] →
`"Enter a valid phone number"` · `alphanumeric` → `"Letters and numbers only"` ·
`number`/`integer` → `""` or NaN → `"Enter a number"`; non-integer under `integer` →
`"Enter a whole number"`; then `` `Must be at least ${q.min}` `` / `` `Must be at most ${q.max}` ``.

### `validateResponses` vs `validateSubmission`
- `validateResponses` (`questionnaire.ts:509-537`) validates **every question in the definition**,
  drops unknown keys, returns `{_root: "Malformed response payload"}` on a shape failure.
- `validateSubmission` (`questionnaire-runtime.ts:195`) validates **only the branch-resolved path**.
  Both are exported and both are in use — the org console gate uses `validateResponses`
  (`apps/org/lib/questionnaires/actions.ts:612`), the participant submit uses `validateSubmission`
  (`apps/web/lib/questionnaire-store.ts:709`). *The donor's own simplification audit flags a pair
  of "two questionnaire response validators with overlapping names and no rule for which to call"
  (docs/simplification-audit.md:868) — this is that pair. Camp 404 should adopt only
  `validateSubmission` and delete the other, or document the split.*

### Definition-time range rules (`questionnaire-definition.ts:78-119`)
- `short_text`/`long_text`: `minLength > maxLength` → `` `minLength ${a} exceeds maxLength ${b}` ``.
- `short_text`: `min > max` → `` `min ${a} exceeds max ${b}` ``; `min`/`max` present while
  `format` is not `number`/`integer` → `"min/max only apply when format is number or integer"`.
- `multi_select`: `ceiling = options.length + (allowOther ? 1 : 0)`;
  `minSelections > maxSelections`, `minSelections > ceiling`, `maxSelections > ceiling` all error
  with the ceiling named.
- `linear_scale`: `max <= min` → `` `max ${a} must be greater than min ${b}` ``.

### Id namespace rule
Page ids and block ids share **one flat namespace** (`questionnaire-definition.ts:145-147`):
*"Question ids key the response map; page ids are branch targets. Sharing a namespace keeps 'go to
section X' unambiguous."* A duplicate produces
`` `id "${id}" is already used at ${previousPath} — ids must be unique so responses stay attached
to the right question` ``. `__submit__` is reserved.

### Edge cases the donor explicitly handles
- Loops are impossible by construction, **but** `resolvePath` still carries a visited-set guard
  *"so a legacy or hand-edited definition degrades into a truncated path instead of hanging the
  server"* (`questionnaire-runtime.ts:71-78`). Test: *"does not hang on a hand-edited definition
  containing a loop"* (`questionnaire-runtime.test.ts:186`).
- A section stays reachable when only SOME options branch past it — the fall-through edge is always
  live unless an explicit `next` replaces it (`questionnaire-definition.ts:300-309`).
- An empty questionnaire's `percent` is 100.
- ON CONFLICT on a PARTIAL unique index **requires `targetWhere`**, or Postgres errors
  `"there is no unique or exclusion constraint matching the ON CONFLICT specification"` — which
  broke *every* questionnaire write including the Burner Bio until an e2e run caught it
  (`apps/web/lib/questionnaire-store.ts:756-764`, same block in
  `apps/org/lib/questionnaires/actions.ts:653-661`). A dedicated source-reading test enforces it:
  `packages/db/src/__tests__/questionnaire-upsert-target.test.ts:66-88`.

---

## 7. Test coverage (the contract, by name)

### `questionnaire-definition.test.ts` (558)
Backward compat: accepts a pre-v2 camp questionnaire unchanged (:76); accepts the multi-page
intro+questions Burner-Bio shape (:90); **round-trips a stored v1 definition to identical JSON —
no rewrite needed** (:100); preserves v1 option shape without adding image/branch fields (:109).
Shape: rejects a non-questionnaire payload (:124); rejects a questions page with no blocks (:130);
rejects a choice question with <2 options (:139). Ids: duplicate question ids (:164), question id
colliding with a section id (:183), the reserved submit id (:201), duplicate/`other:`-prefixed
option values (:219). Branching: accepts forward branches to sections and submit (:248); rejects
unknown target (:261), backward branch (:270), self-branch (:279), branching on multi-choice (:288),
unreachable section (:322); keeps a section reachable when only SOME options branch past it (:358).
Ranges (:404, :428, :453). *"accepts every Builder v2 question type and content block"* (:476).

### `questionnaire-runtime.test.ts` (607)
Branch resolution: fall-through, option target, submit target, unanswered branching question, full
path per answer set, null past the last page, null for an unknown page id, **"lets the LAST
branching question on a section win"** (:134), **"does not hang on a hand-edited definition
containing a loop"** (:186). Visible questions exclude branched-past sections and content blocks.
Progress: complete when every required question on the path is answered; counts required only on
the path; reports current page position; falls back to overall completion; **"treats an invalid
answer as unanswered"** (:284). Submit validation: accepts a submission that skipped a
branched-past required question (:294); still enforces required questions ON the path (:308);
**"drops answers to questions the respondent branched past"** (:316); rejects malformed payload;
*"validates a v1 definition exactly as the pre-v2 validator did"* (:335). Builder-v2 response rules
(:351-529). Shuffle: stable for a seed and varies across seeds (:562); leaves order alone when off
(:571); shuffles options **without changing their values** (:582). Final block: *"v1 responses still
validate against v1 definitions — round-trips a stored v1 response map"* (:595).

### `questionnaire-snapshot.test.ts` (171)
Four describes, each proving the snapshot AND demonstrating the bug it fixes: prefers the snapshot;
falls back on null/undefined; re-activation snapshots the new version; validates against the
snapshot; *"proves the bug: validating the SAME answer against the live edit would reject it"*;
aggregates against the snapshot; *"proves the bug: aggregating against the live edit orphans every
real answer under the deleted question"* — asserting `orphans === [{questionId:"shift", count:2}]`.

### `questionnaire-validate-one.test.ts` (438)
Per-kind, digit-exact. Notables: *"counts DIGITS, not characters, at both ends of the E.164
range"* (:104); *"refuses a boolean, which a bare Number() would have turned into 1 or 0"* (:229);
*"binds minSelections only once something is picked"* (:202); *"dedupes while preserving first-seen
order"* (:315); *"refuses the pandemic no-burn years by name"* (:322); *"never format-checks a
long_text"* (:378). Closing block is an **exhaustiveness harness** (:416-437): a fixture per kind
in `question-fixtures.ts`, asserting a sample exists for every member of the `Question` union and
that `validateOne` returns a defined result for each — because *"validateOne has no default arm, so
a kind added without one returns undefined at runtime"*.

### `questionnaire-grid.test.ts` (core 171 + types 100)
Duplicate row ids, duplicate column values, one-column-per-row enforcement, required grid rejects a
missing row, drops unknown rows and columns, optional blank grid is a valid skip, per-row tallies
against that row's respondents, all-empty grid counts as skipped.

### `questionnaire-results.test.ts` (341), `questionnaire-activation.test.ts` (111),
### `questionnaire-engine.test.ts` (94), `questionnaire-authz.test.ts` (194), `form-2.test.ts` (178)
Engine tests pin `isParticipantFacingActivation`: EXCLUDES org-internal; INCLUDES org-outbound and
project; **treats a null/undefined audience (the Burner Bio spine) as participant-facing** (:90).

### `packages/db/src/__tests__/questionnaire-upsert-target.test.ts` (95)
Source assertion: every questionnaire-response upsert in the tree passes `targetWhere`.

### `packages/db/src/__tests__/form-2-template.test.ts` (81)
Source assertion, both directions, plus a named single-field check on the safety-relevant one.

### E2E
`org-staff/questionnaire-build-activate-results.spec.ts:45` —
*"builds a branched questionnaire, sends it outbound, a burner answers it, and the aggregate is
correct"* (one test covering the whole loop).
`camp-member-blocking-questionnaire.spec.ts:23` — *"a blocking send traps the member on the fill
page and releases only on submit"*.
`camp-member-gate-released-by-close.spec.ts:37` — *"closing a blocking questionnaire frees a member
who never answered"*.

---

## 8. Dependency footprint

### The pure core needs almost nothing
- `packages/types/src/questionnaire.ts` → **`zod` only**. Camp 404 has `zod ^4.4.3`, same range.
- `questionnaire-definition.ts`, `questionnaire-runtime.ts`, `questionnaire-results.ts`,
  `questionnaire-activation.ts` → **`@quagga/types` only** (and `./questionnaire-runtime` for
  results). `questionnaire-activation.ts` imports **nothing at all** — it is generic over `T`
  deliberately *"so both apps and tests can call it without a @quagga/types dependency here"* (:19).
- `questionnaire-engine.ts` → one `import type { AudienceSpec }`.
- `questionnaire-authz.ts` → `@quagga/types` (`AudienceSpec`, `MembershipRole`, `ProjectAudience`)
  + `./project-permissions`.

### UI dependencies
- `@quagga/ui` primitives: `button`, `input`, `textarea`, `card`, `select`, `badge`, `dialog`,
  `switch`, `table`, `tabs`, `toggle-group`, `toast`, `lib/utils`.
- **Radix packages Camp 404 lacks**: `@radix-ui/react-tabs ^1.1.14` (results view tabs),
  `@radix-ui/react-toggle-group ^1.1.17` (the `years` control + camp builder).
  `@radix-ui/react-accordion` is not used by this unit.
- `lucide-react` icons — 20 in the palette alone. All verified present in Camp 404's installed
  `lucide-react@1.16.0` per the mechanical-delta report.
- **`FileUpload` from `@quagga/ui`** for `file_link` (`apps/web/components/questionnaire/field.tsx:269-288`),
  with `handleUploadUrl="/api/blob/upload"`, `kind="questionnaire-files"`, `maxFiles={1}`,
  `maxSizeBytes={25 * 1024 * 1024}` (25 MB), hint `"PDF, image, or document — up to 25 MB"`.
  `file-upload.tsx` carries hard-coded `ab-*` brand classes at `:236` (retoken required).
- **`switch.tsx` collision**: donor's is a hand-rolled `<button role="switch">`; Camp 404's is
  Radix. Default-variant usage in `block-editor.tsx`'s `ToggleRow` is API-compatible.
- Charts: **none**. Results are drawn with plain divs and Tailwind widths — the module is
  *"deliberately chart-library agnostic"* (`questionnaire-results.ts:6-7`).

### DB / server dependencies
`drizzle-orm` (identical version to Camp 404), `next/cache` `revalidatePath`, `next/navigation`,
`react.cache`. Nothing exotic. **`import "server-only"`** appears at
`apps/web/lib/required-actions.ts:1` — Camp 404's `apps/web/vitest.config.ts` has no `server-only`
alias stub, so this line must be removed or a stub added before that file can be unit-tested.

### Env
None in the pure core. `BLOB_READ_WRITE_TOKEN` gates the `file_link` uploader
(fill page :141, `builder-v2.tsx:155-156`) — degrades to a URL-paste field, never crashes.
`RESEND_API_KEY` gates the release email (falls back to console log).

---

## 9. Verbatim excerpts — the five most valuable pieces

### 9.1 The activation snapshot rule (`packages/core/src/questionnaire-activation.ts:11-27`)
The single highest-value 16 lines in the unit. Camp 404's `questionnaire_versions` table takes
immutable snapshots at PUBLISH time; the donor snapshots at SEND time onto the activation, which is
strictly stronger (two sends of the same published version are independently frozen).

```ts
/**
 * Resolve the definition an activation must be rendered / validated / aggregated
 * against. The SNAPSHOT taken at activation time is authoritative: it is what the
 * respondents were actually shown, so editing (or re-versioning) the live
 * definition afterwards must never change it. The `liveFallback` is used ONLY for
 * pre-snapshot activation rows (activated before the snapshot column existed,
 * where `snapshot` is null) so no backfill is required.
 *
 * Generic over the definition shape so both apps and tests can call it without a
 * @quagga/types dependency here; callers pass `Questionnaire` values.
 */
export function resolveActivationDefinition<T>(
  snapshot: T | null | undefined,
  liveFallback: T,
): T {
  return snapshot ?? liveFallback;
}
```

Applied once, at the single load point, so every downstream path inherits it
(`apps/web/lib/questionnaire-store.ts:439-449`):

```ts
  const { snapshotDefinition, liveDefinition, ...rest } = row;
  // Every fill / submit / results path resolves the activation through here, so
  // snapshotting the definition once here fixes them all: render/validate/
  // aggregate against what respondents were sent, live def only as the
  // pre-snapshot fallback.
  return {
    ...rest,
    definition: resolveActivationDefinition(snapshotDefinition, liveDefinition),
  };
```

### 9.2 Branch-aware submit validation (`packages/core/src/questionnaire-runtime.ts:185-238`)
Directly answers Camp 404 WP1 (#125)'s "breaking edits to published fields with existing responses
are not rejected server-side" and the DEFERRED.md item about non-final saves.

```ts
/**
 * Server-side response validation for a SUBMIT, branch-aware.
 *
 * Differs from `@quagga/types`' `validateResponses` (which validates every
 * question in the definition) in exactly one way that matters for Builder v2:
 * questions the respondent branched PAST are neither required nor kept. That
 * makes branching safe both ways — a skipped required question can't block a
 * legitimate submission, and answers to skipped questions can't be smuggled
 * into the stored response.
 */
export function validateSubmission(
  questionnaire: Questionnaire,
  raw: unknown,
):
  | { ok: true; responses: QuestionnaireResponses; progress: QuestionnaireProgress }
  | { ok: false; errors: Record<string, string> } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: { _root: "Malformed response payload" } };
  }
  const incoming = raw as Record<string, unknown>;

  // Resolve the path against the RAW answers so branch-driving answers count,
  // then validate only what that path exposes.
  const driving: QuestionnaireResponses = {};
  for (const question of allQuestions(questionnaire)) {
    const value = incoming[question.id];
    const result = validateOne(question, value);
    if (result.ok && result.value !== undefined) {
      driving[question.id] = result.value;
    }
  }

  const responses: QuestionnaireResponses = {};
  const errors: Record<string, string> = {};
  for (const question of visibleQuestions(questionnaire, driving)) {
    const result = validateOne(question, incoming[question.id]);
    if (!result.ok) {
      errors[question.id] = result.error;
      continue;
    }
    if (result.value !== undefined) responses[question.id] = result.value;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, responses, progress: deriveProgress(questionnaire, responses) };
}
```

### 9.3 Forward-only branching + reachability (`packages/core/src/questionnaire-definition.ts:259-341`)
Camp 404's `packages/types/src/questionnaire-builder.ts` has `visibleIf` (a *conditional-display*
model with 10 operators) but **no graph model at all** — no branch targets, no reachability check,
no loop impossibility. This is the piece that has no target counterpart.

```ts
  // --- branch targets: must exist and point forward ------------------------
  const checkTarget = (target: string, fromIndex: number, path: string): boolean => {
    if (target === SUBMIT_TARGET) return true;
    const targetIndex = pageIndexById.get(target);
    if (targetIndex === undefined) {
      issues.push({ path, code: "unknown_branch_target",
        message: `"${target}" is not a section in this questionnaire` });
      return false;
    }
    if (targetIndex === fromIndex) {
      issues.push({ path, code: "self_branch",
        message: "a section cannot branch to itself — that is an infinite loop" });
      return false;
    }
    if (targetIndex < fromIndex) {
      issues.push({ path, code: "backward_branch",
        message: `"${target}" comes earlier in the questionnaire — branches must move forward so a respondent can never loop` });
      return false;
    }
    return true;
  };

  const edges: string[][] = pages.map(() => []);
  pages.forEach((page, pageIndex) => {
    const pagePath = `pages[${pageIndex}]`;
    const out = edges[pageIndex];
    if (!out) return;

    // The fall-through edge is always live: an explicit `next` replaces the
    // linear one, and a branching question only diverts the options that
    // actually carry a `goTo`.
    if (page.next) {
      if (checkTarget(page.next, pageIndex, `${pagePath}.next`)) out.push(page.next);
    } else {
      out.push(fallthroughTarget(page, pageIndex, pages));
    }

    pageBlocks(page).forEach((block, blockIndex) => {
      for (const { index, target } of optionBranchTargets(block)) {
        const path = `${pagePath}.questions[${blockIndex}].options[${index}].goTo`;
        if (checkTarget(target, pageIndex, path)) out.push(target);
      }
    });
  });

  // --- reachability: every section must be arrivable from the first --------
  // Forward-only edges make this a single left-to-right sweep; no cycle
  // detection is needed because a cycle cannot be expressed.
  if (issues.length === 0 && pages.length > 0) {
    const reachable = new Set<string>();
    const first = pages[0];
    if (first) reachable.add(first.id);
    pages.forEach((page, pageIndex) => {
      if (!reachable.has(page.id)) return;
      for (const target of edges[pageIndex] ?? []) {
        if (target !== SUBMIT_TARGET) reachable.add(target);
      }
    });
    pages.forEach((page, pageIndex) => {
      if (!reachable.has(page.id)) {
        issues.push({ path: `pages[${pageIndex}]`, code: "unreachable_page",
          message: `section "${page.id}" can never be reached — no branch or fall-through leads to it` });
      }
    });
  }
```

### 9.4 Results robustness under a live-edited definition (`packages/core/src/questionnaire-results.ts:8-15`, `:200-223`, `:396-410`)
Camp 404's builder Phase E is unwritten; this is the whole of it, minus the JSX.

```ts
// Two robustness properties matter here, because definitions are editable
// while responses already exist:
//   1. A question added AFTER some responses were collected reports honest
//      skip counts rather than pretending everyone declined.
//   2. Answers whose question was DELETED are not silently dropped —
//      `orphanAnswers` surfaces them so the author can see the data exists.
```
```ts
      const options: OptionTally[] = question.options.map((o) => {
        const count = counts.get(o.value) ?? 0;
        return { value: o.value, label: o.label, count, percent: pct(count, denominator) };
      });
      // Values not in the definition any more (option deleted after answers
      // came in) still get a row, labelled by their raw value.
      for (const [value, count] of counts) {
        if (question.options.some((o) => o.value === value)) continue;
        options.push({ value, label: value, count, percent: pct(count, denominator) });
      }
```
```ts
export function aggregateResponses(
  questionnaire: Questionnaire,
  responses: readonly QuestionnaireResponses[],
): QuestionnaireResults {
  const questions = allQuestions(questionnaire);
  const known = new Set(questions.map((q) => q.id));

  const orphanCounts = new Map<string, number>();
  for (const response of responses) {
    for (const [key, value] of Object.entries(response)) {
      if (known.has(key) || isBlank(value)) continue;
      orphanCounts.set(key, (orphanCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    totalResponses: responses.length,
    questions: questions.map((q) => aggregateOne(q, responses)),
    orphans: [...orphanCounts.entries()]
      .map(([questionId, count]) => ({ questionId, count }))
      .sort((a, b) => a.questionId.localeCompare(b.questionId)),
  };
}
```

### 9.5 Close must release the gate (`apps/web/lib/required-actions.ts:126-166`)
The exact bug Camp 404 will hit the first time a captain mis-sends a blocking builder
questionnaire — `closeActivationAction` exists in the target
(`camp-404/packages/db/src/questionnaire-lifecycle.ts`) but nothing in the target's gate reads the
activation status.

```ts
      // CLOSING AN ACTIVATION MUST RELEASE ITS GATE. `closeActivation` flips
      // `questionnaire_activations.status` to "closed" and leaves the
      // `required_actions` rows `pending` — and this query never read that
      // column, so a closed questionnaire went on hard-gating every recipient
      // out of the whole app with no way back. "Close" is the ONLY undo for a
      // mis-sent blocking send; it has to mean it.
      //
      // Read here rather than by expiring the action rows, so it is also right
      // for rows written before the fix, and so reopening an activation
      // restores the gate rather than needing a second migration of state.
      activationStatus: schema.questionnaireActivations.status,
    })
    /* … */
  return rows
    .filter((r) => isParticipantFacingActivation(r.audience))
    .map(({ actionKey, blocking, status, activationStatus }) => ({
      actionKey,
      // A row whose activation is no longer open still EXISTS (it stays in the
      // inbox and in the audit trail) but it cannot block. `activationStatus`
      // is null for non-questionnaire actions like the Burner Bio, which have
      // no activation and must keep blocking.
      blocking:
        blocking && (activationStatus === null || activationStatus === "open"),
      status,
    }));
```

### 9.6 (bonus) Ids allocated once (`apps/org/components/questionnaires/block-kinds.ts:237-258`, `:391-437`)
```ts
// --- id allocation -------------------------------------------------------
// Question ids key the response map, so they are allocated ONCE, at insert,
// and never recomputed. Reordering moves the object; the id rides along.

/** Every id already claimed in a draft (page ids + block ids share a namespace). */
export function takenIds(draft: Questionnaire): Set<string> {
  const taken = new Set<string>();
  for (const page of draft.pages) {
    taken.add(page.id);
    for (const block of pageBlocks(page)) taken.add(block.id);
  }
  return taken;
}

/** Next free `prefix_n` id. */
export function allocateId(prefix: string, taken: Set<string>): string {
  let n = 1;
  while (taken.has(`${prefix}_${n}`)) n += 1;
  const id = `${prefix}_${n}`;
  taken.add(id);
  return id;
}
```
```ts
/**
 * Change a block's type in place. The id is PRESERVED — responses already
 * collected stay attached to it — as are prompt, helper, required and (where
 * both sides have them) options.
 */
export function convertBlock(block: PageBlock, kind: PaletteKind): PageBlock { /* … */ }
```

---

## 10. AfrikaBurn / multi-tenant coupling — exactly where, and how deep

### CLEAN — zero coupling, scope-rename only
- `packages/types/src/questionnaire.ts` (764) except for the `years` kind (see below).
- `packages/core/src/questionnaire-definition.ts` (350) — grep for group/org/tenant/edition: none.
- `packages/core/src/questionnaire-runtime.ts` (304) — none.
- `packages/core/src/questionnaire-results.ts` (419) — none.
- `packages/core/src/questionnaire-activation.ts` (142) — none; it doesn't even import types.
- `apps/*/components/questionnaire/content-block.tsx`, `blocking-badge.tsx`,
  `response-viewer.tsx`, `field.tsx` (except `years`), `runner.tsx`.
- `apps/org/components/questionnaires/block-kinds.ts` (462) and `definition-issues.tsx` (161) —
  no tenancy at all.

### AFRIKABURN DOMAIN, EASILY EXCISED
- **The `years` question kind** (`questionnaire.ts:183-223`) hard-codes
  `ATTENDED_YEAR_MIN = 2007`, `ATTENDED_YEAR_MAX = 2026`, `NO_BURN_YEARS = [2020, 2021]`, and its
  error string is literally `` `${s} isn't a valid AfrikaBurn year` ``. Camp 404 wants this — its
  burner profile has a burn-history page — but the constants and the copy need re-pointing at
  AfrikaBurn's *South African* burn calendar as Camp 404 sees it. The kind itself is generic
  ("multi-select over a fixed integer range with disabled members").
- **`form-2.ts`** — the *pattern* (questionnaire → typed columns with honest drift reporting) is
  gold and generic; `FORM_2_FIELD_MAP`'s eight `s4*/s5*` registration columns are pure AfrikaBurn.
- **`BURNER_BIO_ACTION_KEY = "burner_bio"`** — Camp 404's equivalent is `burner_profile`
  (`camp-404/apps/web/lib/required-actions.ts:10`). One string.

### ORG / PARTICIPANT SPLIT — must be collapsed
- **`AudienceSpec`** (`packages/types/src/audience.ts:136-142`) — a 5-arm union
  (`org_internal`, `org_outbound`, `org_officer`, `org_suppliers`, `project`). Only `project`
  survives a collapse, and it becomes "team / team-lead / everyone" against Camp 404's
  `team_memberships`. `OrgOutboundSelector`'s 7 members (`all_current_burners`, `camp_leads`,
  `registered_camp_leads`, `mv_leads`, `mv_grant_requesters`, `art_leads`, `art_grant_requesters`)
  are entirely AfrikaBurn.
- **`questionnaireAuthoredScopeEnum ["org","group"]`** and the `authored_scope` column exist ONLY
  because reviewers are a different organisation from the reviewed. In Camp 404 there is one
  authoring level: captains. Drop the enum, the column, and every `authoredScope` branch.
- **`questionnaire-authz.ts` (143 lines) is almost entirely org-coupled.** `isOrgAuthor`,
  `canAuthorAudience`, `canViewActivationResults` all take an `orgGroupId`; `AuthzMembership` is
  `{groupId, role: MembershipRole}` where `MembershipRole` is
  `god|org_staff|lead|admin|member|engineer`. Camp 404's equivalent is
  `rankEnum ["captain","member"]` + derived `is_lead`. **The only shape worth lifting is
  `canAuthorProjectQuestionnaire(m, audience, blocking, baselineRoleId)` (:133-143)** — the idea
  that a scoped grant may target *only certain audiences* and may block *only if `may_block`* is
  exactly what Camp 404 needs when team leads gain "post to your crew" (WP12 #136).
- **`isParticipantFacingActivation`** (`questionnaire-engine.ts:48-51`) — one line, exists purely
  to keep org-internal sends out of the participant app. Camp 404 has one app; delete it and its
  four call sites (`required-actions.ts:156`, `questionnaire-store.ts:570`, `:663`, `:698`).
- **`canReadActivationResults` = `canReadPersonalInformationIn(actor, "questionnaires")`**
  (`apps/org/lib/questionnaires/queries.ts:323-325`) — depends on the whole `org_roles` domain
  layer. Its *reasoning* is worth keeping verbatim though (:308-321): results are named people's
  answers, there is no useful redaction, so the whole surface needs the personal-information grant
  and a refused caller *"is told so plainly instead of being 404'd"*, while the completion COUNT
  stays visible to every rank.

### EDITION (year namespace) — the third dimension Camp 404 does not have
`editions` is called *"the root namespace for data"* (`docs/synthesis.md:95`). It is baked into:
`questionnaire_activations.edition_id`, `questionnaire_responses.edition_id` (**NOT NULL**),
`required_actions.edition_id` (**NOT NULL**, part of the uniqueness key), every prefill query,
every results query, and `listRequiredActions`'s `getActiveEdition()` scoping.

Camp 404 has **one camp, one burn cycle at a time** and no `editions` table. Two honest options:
(a) drop `edition_id` and revert the identity to `(user, definition_key)` — which is exactly the
bug migration 0020 was written to fix, so only do this if Camp 404 genuinely never re-sends across
years; or (b) reuse `camp_settings` (the singleton) to carry a `current_burn_year` string and key
on that. **Read `packages/db/migrations/0020_past_morg.sql` before choosing** — its header records
what went wrong without it: *"answering the same questionnaire in a later edition silently
overwrote the earlier year's answer in place."* The related `required_actions` per-edition story is
in `schema.ts:1430-1442`: *"The gate fired once in a burner's lifetime and then never again, and
nothing anywhere reported that."*

### CAMP / GROUP dimension
`questionnaire_activations.group_id` and `questionnaire_responses.group_id` (migration 0028) exist
because *"a person may lead more than one approved camp"*. Camp 404 is one camp: **drop both**.
The two partial unique indexes then collapse to Camp 404's existing single
`questionnaire_responses_user_def_idx`.

### The near-twin warning applies here
`apps/org/components/questionnaire/{runner,field,content-block,response-viewer,blocking-badge}.tsx`
are trimmed forks of the `apps/web/components/questionnaire/` files (org field is 401 lines vs
web's 945; org runner 296 vs web's 592). Per `docs/simplification-audit.md:58-60`, **always lift
the `apps/web` copy** — it is the fuller one, and the org copy has already drifted (org's field
handles only the 5 kinds the old console builder produced; its own comment at :19-23 admits it).
Also note `apps/org/components/questionnaire/` and `apps/org/components/questionnaires/` are two
sibling directories that cross-import; the 542-line dead `builder.tsx` the audit flagged has since
been deleted (verified: the file does not exist).

---

## 11. Gotchas (things that will bite on a port)

1. **`import "server-only"`** at `apps/web/lib/required-actions.ts:1` — Camp 404's
   `apps/web/vitest.config.ts` has no alias stub for it (donor's does). Add the stub or strip
   the line.
2. **ON CONFLICT + partial unique index needs `targetWhere`** or Postgres errors outright. If
   Camp 404 keeps its single (non-partial) index this is moot; if it ever adds a partial one, port
   `packages/db/src/__tests__/questionnaire-upsert-target.test.ts` with it.
3. **Two response validators with overlapping names.** `validateResponses` (types, whole
   definition) and `validateSubmission` (core, branch-aware). The donor's own audit calls this out
   (`docs/simplification-audit.md:868`). Pick one for Camp 404 and delete the other.
4. **`flattenQuestions` (`@quagga/types`) and `allQuestions` (`@quagga/core`) are the same
   function under two names** (`docs/simplification-audit.md:851`). Do not port both.
5. **`required` defaults differ per kind** (§2). Copying the union but normalising the defaults
   would silently change behaviour for every stored definition.
6. **`multi_select` DROPS unknown values silently rather than erroring.** Deliberate, tested
   (`validate-one.test.ts:160`), and surprising. `single_select` does the opposite (errors).
7. **`linear_scale.min` is `z.union([z.literal(0), z.literal(1)])`** — not a general integer.
   A UI that offers min=2 will fail parse.
8. **The palette kind ≠ engine kind mapping is one-way lossy on round trip** for `number`: a
   `short_text` with `format:"integer"` reads back as palette `number`
   (`blockPaletteKind`, :232-234) — fine — but a `short_text` with `format:"email"` reads back as
   `short_text`, so the palette has no "Email-validated short answer" entry distinct from the
   `email` kind. Two ways to ask for an email address.
9. **Camp 404's `visibleIf` model and the donor's `goTo` branching are different mechanisms.**
   `visibleIf` hides a *block* based on a predicate over answers (10 operators, per-block);
   `goTo` routes a *page*. They are complementary, not substitutes — porting the donor's branching
   does not remove the need for `visibleIf`, and `deriveProgress`/`validateSubmission` here know
   nothing about per-block conditional visibility. **Merging the two is design work, not a port.**
10. **`percent` rounding differs between modules.** `deriveProgress` rounds to whole percent
    (`Math.round(x*100)`); results `pct()` rounds to one decimal (`Math.round(x*1000)/10`).
    Intentional, but do not "unify" them without checking the tests.
11. **Donor `Card`/`CardTitle` is `text-lg`; Camp 404's is `text-2xl`.** Every lifted builder card
    will read one size larger in Camp 404.
12. **`file_link` UI depends on `@quagga/ui` `FileUpload`**, which carries hard-coded `ab-*` brand
    classes at `file-upload.tsx:236`. Retoken or replace with Camp 404's `avatar-upload`-adjacent
    blob path.
13. **`@radix-ui/react-tabs` and `@radix-ui/react-toggle-group` are not installed in Camp 404.**
    The results view and the `years` control need them (or substitutes).
14. **Donor UI files are semicolon'd; several Camp 404 `packages/ui` files are not.** Run
    `pnpm format` after any paste.
15. **Do not trust a donor comment without reading the code under it** —
    `docs/simplification-audit.md:44-50` documents eight comments in the repo that state the
    opposite of their code. None of the eight are in this unit (all questionnaire comments I read
    matched their code), but the rule stands.
16. **`questionnaire_definitions.key` is a `text` PRIMARY KEY with meaning encoded in prefixes**
    (`org-`, `proj:<groupId>:`, `burner_bio`) and **no FK from activations or responses**. Camp 404
    already uses a `key` head table the same way; keep the convention but drop the `proj:` prefix
    (there are no projects) and probably the `org-` prefix too.
17. **`activateQuestionnaire` resolves the audience OUTSIDE the transaction and does notifications
    AFTER commit** (`apps/org/lib/questionnaires/actions.ts:342-345`, `:436-497`). Deliberate:
    *"an activation must never exist without the required actions that make it reach its audience …
    A partial send would either strand recipients or gate them"* — but delivery is best-effort and
    never rolls back the send. Copy that ordering.
18. The donor's own e2e suite is not run by `turbo run test` (`AGENTS.md:59-69`); the questionnaire
    e2e specs above are therefore only exercised by `pnpm e2e:local`.

---

## 12. What this unit gives Camp 404, mapped to its open backlog

| Camp 404 gap | Donor asset |
|---|---|
| Builder **Phase E** — metrics, responses table, per-respondent view, CSV export (zero code exists) | `questionnaire-results.ts` (419) + `results-view.tsx` (609) + `response-viewer.tsx` (184). Essentially complete. |
| **WP4 (#128)** non-blocking sends reach nobody | `listPendingQuestionnaires` + `PendingQuestionnaires` card + `actionRoute` dynamic routing |
| **WP4** S27 completion screen | fill page's `actionStatus === "completed"` branch (`page.tsx:66-89`) |
| **WP1 (#125)** breaking edits to published fields with responses not rejected | `validateQuestionnaireDefinition` + the **snapshot** (a breaking edit cannot reach an in-flight activation at all) |
| **WP1** builder deletes use bare `window.confirm` | not solved by the donor (its block delete is also unconfirmed) — no asset |
| Close/recall a mis-sent blocking questionnaire | `required-actions.ts:128-165` (read-side release) + `closeQuestionnaireAction` (write-side `expired` recall) |
| Server-side validation on non-final saves (DEFERRED.md:72) | `validateSubmission` — one function, branch-aware, no `if (final)` escape hatch |
| No loading/error states on questionnaire routes (**WP7 #131**) | `apps/org/app/(console)/questionnaires/loading.tsx`, `apps/web/app/(app)/questionnaires/loading.tsx`, `apps/web/app/(app)/camps/[slug]/questionnaires/loading.tsx`, `apps/web/app/(app)/camps/error.tsx` exist — small but real |
| Builder palette gaps (target has 12 of 14 kinds, no grids, no scale/rating, no content blocks in the palette) | 20-entry `PALETTE` + `createBlock` + `convertBlock` |
| No preview-before-send confidence | `QuestionnairePreview` (201) |
| No author-facing structural validation | `DefinitionIssue` + `definition-issues.tsx` path parser + `builder-actions.ts` server gate |
