# Unit 02 — Questionnaire Builder UI (the Forms-like editor)

**Donor:** `quagga-portal` / AfrikaBurn Contributors App, at
`/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app`
(all paths below are relative to that root unless prefixed `camp-404/`).

**Target:** Camp 404 at `/home/ryan/repos/Personal/camp-404`.

---

## 0. Purpose and one-paragraph verdict

This is the donor's **Builder v2** — an explicit attempt at Google-Forms parity, spelled out
in `docs/questionnaire-spec.md:247-311` ("Builder v2 — Google Forms parity") and delivered.
It is a three-column authoring surface (palette rail · section canvas · audience/send rail)
over a **15-kind question union + 2 content blocks**, with per-option **forward-only
branching**, a closed-enum **text-format validation** layer, **seeded deterministic shuffle**,
an **author preview that reuses the real runner engine**, a **per-question results
aggregator with seven chart shapes**, and **CSV export**.

The single most important structural fact: **almost none of the value is in the React**.
The engine lives in four pure, DB-free, zero-I/O modules in `packages/core`
(`questionnaire-definition.ts`, `questionnaire-runtime.ts`, `questionnaire-results.ts`,
`questionnaire-activation.ts`, 1,315 lines total) plus the Zod schema authority in
`packages/types/src/questionnaire.ts` (764 lines). Those five files carry **2,247 lines of
test** across eight core test files, five types test files and two org lib test files. They
are `groupId`/`editionId`-free (verified: zero `groupId`/`editionId`/`orgGroupId` references
in `questionnaire-definition.ts`, `questionnaire-runtime.ts`, `questionnaire-results.ts`,
`questionnaire.ts`). Multi-tenancy enters only at the **audience** and **authz** layer, both
of which are separate files Camp 404 replaces wholesale.

**Camp 404 already has the shipped counterpart** (`packages/types/src/questionnaire-builder.ts`,
`apps/web/app/captains/questionnaires/**`, `packages/db/src/questionnaire-lifecycle.ts`).
So this unit is *not* a greenfield port — it is a **feature-superset comparison**. The donor
is materially ahead on: question kinds (15 vs 14, with grids/rating/time/file_link/years the
donor has and Camp 404 lacks), per-option branching, "Other…" free text, option/question
shuffle, min/max selections, text-format presets, definition **structural validation with
dotted paths**, **results aggregation + charts + CSV** (Camp 404's builder Phase E, which the
roadmap records as having **zero code**), and the **activation definition snapshot**.

---

## 1. File inventory (line counts verified with `wc -l`)

### 1a. The engine — pure, portable, the real prize

| Path | Lines | What |
| --- | ---: | --- |
| `packages/types/src/questionnaire.ts` | 764 | Zod schema authority: 15 question kinds, 2 content blocks, 2 page kinds, response value union, `validateOne`, `validateResponses`, `flattenQuestions`, `pageQuestions`, `pageBlocks`, `isAnswerableBlock`, Other-answer codec, attended-years helpers |
| `packages/core/src/questionnaire-definition.ts` | 350 | `validateQuestionnaireDefinition` — structural integrity (id uniqueness, option-value uniqueness, forward-only branch targets, reachability, range consistency) returning dotted-path issues |
| `packages/core/src/questionnaire-runtime.ts` | 304 | Branch resolution (`nextPageId`, `resolvePath`, `visibleQuestions`), progress derivation (`deriveProgress`), branch-aware submit validation (`validateSubmission`), seeded xorshift32 shuffle (`presentationBlocks`, `presentationOptions`) |
| `packages/core/src/questionnaire-results.ts` | 419 | `aggregateResponses` / `aggregateQuestion` — 7 chart shapes + orphan-answer disclosure |
| `packages/core/src/questionnaire-activation.ts` | 142 | Activation lifecycle builders: `resolveActivationDefinition` (snapshot), `activationRequiredActionKey`, `buildActivationRequiredActions`, `tallyActivationCompletion` |
| `packages/core/src/questionnaire-engine.ts` | 52 | `firstBlockingAction`, `isParticipantFacingActivation`, `BURNER_BIO_ACTION_KEY` |
| `packages/core/src/questionnaire-authz.ts` | 143 | **Tenant-coupled.** `isOrgAuthor`, `isProjectAdmin`, `canAuthorAudience`, `canViewActivationResults`, `canAuthorProjectQuestionnaire` |
| `packages/types/src/audience.ts` | 191 | **Tenant-coupled.** `AudienceSpec` union, outbound selectors, `QuestionnaireBuilderInput`, `QuestionnaireActivationInput` |

### 1b. The builder UI (org console)

| Path | Lines | What |
| --- | ---: | --- |
| `apps/org/components/questionnaires/builder-v2.tsx` | 963 | `QuestionnaireBuilderV2` — the three-column shell, draft state, live validation, `PaletteRail`, `SectionEditor`, `SendRail` |
| `apps/org/components/questionnaires/block-editor.tsx` | 1098 | `BlockEditor` + `BlockBody` + `ShortTextBody` / `ImageBlockBody` / `ChoiceBody` / `GridBody`; `BlobConfigProvider`; `withCurrentTarget` |
| `apps/org/components/questionnaires/block-kinds.ts` | 462 | The 20-entry `PALETTE`, `blockPaletteKind`, `takenIds`, `allocateId`, `createBlock`, `convertBlock`, `createSection`, `duplicateBlock` |
| `apps/org/components/questionnaires/definition-issues.tsx` | 161 | Dotted-path issue router: `issueLocation`, `sectionIssues`, `blockIssues`, `optionIssues`, `issueBreadcrumb`, `IssueNote`, `DefinitionIssuePanel` |
| `apps/org/components/questionnaires/questionnaire-preview.tsx` | 201 | `QuestionnairePreview` dialog + `PreviewRunner` — a throwaway, branch-aware author walk |
| `apps/org/components/questionnaires/results-view.tsx` | 609 | `ResultsView` (Summary/Individual tabs), `AggregateChart`, `BarRow`, `Histogram`, `TextAnswers`, `OrphanDisclosure`, `CsvExportButton` |

### 1c. Routes and server actions (org console)

| Path | Lines | What |
| --- | ---: | --- |
| `apps/org/app/(console)/questionnaires/page.tsx` | 292 | List grouped Outbound / Org-internal / Not sent yet; per-activation completion bar |
| `apps/org/app/(console)/questionnaires/new/page.tsx` | 28 | New-builder route |
| `apps/org/app/(console)/questionnaires/[key]/edit/page.tsx` | 52 | Edit-builder route (hands the stored definition over untouched) |
| `apps/org/app/(console)/questionnaires/[key]/activate/page.tsx` | 100 | Send screen; parses builder rail choices out of the query string |
| `apps/org/app/(console)/questionnaires/[key]/[activationId]/page.tsx` | 194 | Results page: scope gate + PII gate + aggregate + completion header |
| `apps/org/app/(console)/questionnaires/builder-actions.ts` | 111 | `saveDefinitionV2` — the server-side validation GATE |
| `apps/org/app/(console)/questionnaires/loading.tsx` | 26 | Skeleton |
| `apps/org/lib/questionnaires/actions.ts` | 691 | `saveQuestionnaireDefinition`, `previewAudienceCount`, `activateQuestionnaire`, `closeActivation`, `submitConsoleQuestionnaire` |
| `apps/org/lib/questionnaires/queries.ts` | 603 | `listOrgQuestionnaires`, `getOrgDefinition`, `getOrgActivation`, `getActivationResults`, `buildAudienceContext`, `getConsoleBlockingQuestionnaire`, `canReadActivationResults`, `audienceLabel` |

### 1d. Shared runner/field components (both apps)

| Path | Lines | What |
| --- | ---: | --- |
| `apps/web/components/questionnaire/field.tsx` | 945 | The FULL respondent field renderer — dropdown/image-grid variants, "Other…" rows, file uploads, grids, years |
| `apps/web/components/questionnaire/runner.tsx` | 592 | Runner v2: branch trail, step rail, localStorage draft autosave, off-page error jump |
| `apps/org/components/questionnaire/field.tsx` | 401 | Console-trimmed field renderer (no image_grid, no allowOther, no dropdown) — the one the **preview** uses |
| `apps/org/components/questionnaire/runner.tsx` | 296 | Console runner (branch- and content-block-aware) |
| `apps/org/components/questionnaire/content-block.tsx` | 49 | `ContentBlockView` — info panel + image figure |
| `apps/web/components/questionnaire/content-block.tsx` | 44 | Twin |
| `apps/org/components/questionnaire/activation-form.tsx` | 398 | Send screen: audience mode cards, selector chips, live resolved count, blocking switch, due date |
| `apps/org/components/questionnaire/response-viewer.tsx` | 97 | Per-respondent answer dialog (org) |
| `apps/web/components/questionnaire/response-viewer.tsx` | 184 | Twin (richer) |
| `apps/org/components/questionnaire/blocking-badge.tsx` | 26 | The mandatory Required/Optional badge |
| `apps/web/components/questionnaire/blocking-badge.tsx` | 30 | Twin |
| `apps/org/components/questionnaire/close-activation-button.tsx` | 37 | Close control |
| `apps/org/components/questionnaire/console-gate.tsx` | 72 | Org-internal blocking gate (full console takeover) |
| `apps/web/components/questionnaire/fill.tsx` | 62 | Member fill wrapper |
| `apps/web/components/questionnaire/pending-questionnaires.tsx` | 88 | Non-blocking "Pending questionnaires" card |

### 1e. The second, simpler builder (camp-lead side, apps/web)

| Path | Lines | What |
| --- | ---: | --- |
| `apps/web/components/questionnaire/builder.tsx` | 584 | `QuestionnaireBuilder` — flat single-page builder, 5 kinds, audience = camp roles, scope-aware disabled controls |
| `apps/web/app/(app)/camps/[slug]/questionnaires/actions.ts` | ~180 | `createQuestionnaireAction`, `closeQuestionnaireAction` |
| `apps/web/lib/questionnaire-store.ts` | 784 | Participant/camp read+write layer: `createAndActivateProjectQuestionnaire`, `listProjectQuestionnaires`, `getActivation`, `getActivationResults`, `getFillView`, `listPendingQuestionnaires`, `submitResponse` |

> **The donor's own audit already killed a third builder.** `docs/simplification-audit.md:297-309`:
> `apps/org/components/questionnaire/builder.tsx` (542 lines) was "entirely dead — superseded by
> builder-v2 and imported by nothing". It has since been deleted (verified: the directory now
> contains only activation-form, blocking-badge, close-activation-button, console-gate,
> content-block, field, response-viewer, runner). Note the **two sibling directories** in
> `apps/org/components/`: `questionnaire/` (runner-side) and `questionnaires/` (builder-side),
> which cross-import in both directions — the audit calls the split "a directory split that has
> no rule" (`simplification-audit.md:295`). Do not replicate that.

### 1f. Tests

| Path | Lines |
| --- | ---: |
| `packages/core/src/__tests__/questionnaire-runtime.test.ts` | 607 |
| `packages/core/src/__tests__/questionnaire-definition.test.ts` | 558 |
| `packages/core/src/__tests__/questionnaire-results.test.ts` | 341 |
| `packages/core/src/__tests__/questionnaire-authz.test.ts` | 194 |
| `packages/core/src/__tests__/questionnaire-grid.test.ts` | 171 |
| `packages/core/src/__tests__/questionnaire-snapshot.test.ts` | 171 |
| `packages/core/src/__tests__/questionnaire-activation.test.ts` | 111 |
| `packages/core/src/__tests__/questionnaire-engine.test.ts` | 94 |
| `packages/core/src/__fixtures__/questionnaire-v1.ts` | 163 |
| `packages/types/src/__tests__/questionnaire-validate-one.test.ts` | 438 |
| `packages/types/src/__tests__/questionnaire-responses.test.ts` | 175 |
| `packages/types/src/__tests__/questionnaire-text-format.test.ts` | 157 |
| `packages/types/src/__tests__/questionnaire-grid.test.ts` | 100 |
| `packages/types/src/__tests__/questionnaire-helpers.test.ts` | 83 |
| `packages/types/src/__tests__/question-fixtures.ts` | 182 |
| `apps/org/lib/__tests__/questionnaire-actions.test.ts` | 570 |
| `apps/org/lib/__tests__/questionnaire-queries.test.ts` | 498 |
| `apps/web/lib/__tests__/questionnaire-store.test.ts` | — |
| `e2e/specs/org-staff/questionnaire-build-activate-results.spec.ts` | 201 |
| `e2e/specs/camp-member/camp-member-blocking-questionnaire.spec.ts` | 93 |

---

## 2. Capability list (exhaustive, each cited)

### 2.1 Block palette — 20 authoring kinds over 17 engine kinds

`apps/org/components/questionnaires/block-kinds.ts:44-64` declares `PaletteKind` verbatim:

```
"info_block" | "image_block" | "short_text" | "long_text" | "number"
| "single_select" | "dropdown" | "image_choice" | "multi_select"
| "multi_choice_grid" | "checkbox_grid" | "linear_scale" | "rating"
| "boolean" | "date" | "time" | "email" | "phone" | "file_link" | "years"
```

`PALETTE` (`block-kinds.ts:75-216`) is 20 entries, each `{kind, label, group, icon, short}`
where `group` is `"content" | "question"` (`:69`). Labels verbatim:
Info text · Image · Short answer · Paragraph · Multiple choice · Checkboxes ·
Multiple-choice grid · Checkbox grid · Dropdown · Image choices · Linear scale · Rating ·
Yes / No · Number · Date · Time · Email · Phone · File link · Years attended.

Icons are lucide: `Type, ImageIcon, TextCursorInput, AlignLeft, CircleDot, CheckSquare,
Grid3x3, LayoutGrid, ChevronDown, Images, SlidersHorizontal, Star, ToggleLeft, Hash,
Calendar, Clock, Mail, Phone, Paperclip, CalendarRange` (`block-kinds.ts:1-23`).

**Three palette kinds are render variants, not engine kinds** (`block-kinds.ts:33-42`,
verbatim comment): `number → short_text with format "number"`, `dropdown → single_select
with display "dropdown"`, `image choice → single_select with display "image_grid"`. The
inverse mapping is `blockPaletteKind` (`block-kinds.ts:223-236`).

### 2.2 Engine question union — 15 kinds

`packages/types/src/questionnaire.ts:325-341`, `z.discriminatedUnion("kind", [...])`:
`single_select, multi_select, short_text, long_text, date, boolean, email, phone, years,
linear_scale, rating, time, file_link, multi_choice_grid, checkbox_grid`.

Content blocks (`:368-372`): `info_block`, `image_block`. `PageBlock = Question | ContentBlock`
(`:377`). Page kinds (`:435-439`): `questions`, `intro`. `Questionnaire = {version: string,
pages: QuestionnairePage[] (min 1)}` (`:441-445`).

### 2.3 Section / page mechanics

- A section IS a page (`questionnaire.ts:408-413`): `QuestionsPage {id, kind:"questions",
  title, subtitle?, questions: PageBlock[] (min 1), next?, shuffleQuestions?}`.
- `IntroPage {id, kind:"intro", heading, body, next?}` (`:426-433`) — full-screen interstitial,
  no questions, no validation.
- Add / move up / move down / delete section: `builder-v2.tsx:268-301` (`addSection`,
  `moveSection`, `removeSection`). **A section cannot be deleted when it is the last one**
  (`:294-299` `prev.pages.length <= 1 ? prev : …`, and the button is `disabled={totalSections <= 1}`
  at `:675`).
- **First section's title/description are LOCKED** and mirror the questionnaire's own
  title/description (`builder-v2.tsx:442` `titleLocked={pageIndex === 0}`, inputs disabled at
  `:692` and `:711`, explanation copy at `:698-703`). The stored definition is normalised the
  same way server-side (`apps/org/lib/questionnaires/actions.ts:90-105` `normalizeDefinition`)
  and the builder shows that truth up front (`builder-v2.tsx:178-195`).
- `createSection(id, index)` titles a new section `Section ${index + 1}` (`block-kinds.ts:450-457`).

### 2.4 Block operations

All in `builder-v2.tsx` / `block-editor.tsx`:

| Operation | Where | Note |
| --- | --- | --- |
| Add block to active section | `builder-v2.tsx:249-266` | id prefix `block` for content, `q` for questions (`:252-255`) |
| Move up / down | `builder-v2.tsx:737-748`, buttons `block-editor.tsx:234-251` | "Reorder moves the OBJECT — ids ride along untouched" (`builder-v2.tsx:744`) |
| Duplicate | `builder-v2.tsx:749-768` → `duplicateBlock` (`block-kinds.ts:460-462`) | fresh id; "the copy is a NEW question" |
| Remove | `builder-v2.tsx:769-771` | **no confirmation dialog at all** |
| Convert type | `builder-v2.tsx:734-736` → `convertBlock` (`block-kinds.ts:413-447`) | id PRESERVED; prompt/helper/required carried; options carried between single↔multi when `length >= 2`; **`goTo` branch targets are dropped** (`:429-431`) |

`convertBlock` question→`info_block` maps `prompt → heading`, `helper → body`
(`block-kinds.ts:443-445`).

### 2.5 Id allocation — the invariant the whole thing rests on

`block-editor.tsx:49-53` states it verbatim:

> 1. Block ids are NEVER recomputed here — not on reorder, not on retype, not on relabel. A
>    question id is the key its answers are stored under.
> 2. Option VALUES are allocated once and shown read-only. Editing a label is a display change;
>    editing a value would silently orphan collected data.

- `takenIds(draft)` (`block-kinds.ts:243-250`) — **page ids and block ids share ONE namespace**.
- `allocateId(prefix, taken)` (`block-kinds.ts:253-259`) — `${prefix}_${n}`, n from 1.
- `allocateOptionValue` → `option_${n}` starting at `options.length + 1` (`block-editor.tsx:158-163`).
- `allocateRowId` → `row_${n}` (`:166-171`); `allocateColumnValue` → `col_${n}` (`:174-179`).
- The option value is rendered **read-only** beside each option: `value: {option.value}`
  (`block-editor.tsx:905-907`).

### 2.6 Branching (per-option, forward-only)

- Stored on `QuestionOption.goTo` (`questionnaire.ts:75`), single-choice only.
- Reserved target `SUBMIT_TARGET = "__submit__"` (`questionnaire.ts:23`). Page ids may never
  equal it (`questionnaire-definition.ts:151-159`).
- **Branch semantics (Google Forms), verbatim** (`questionnaire-runtime.ts:7-10`): "a section's
  target is chosen by the LAST answered single-choice question on that section whose selected
  option carries a `goTo`. Failing that, the section's own `next`. Failing that, the following
  section in document order — and past the last section, submit."
- The picker only ever offers forward targets: `builder-v2.tsx:623-629` builds
  `branchTargets` from `allPages.slice(pageIndex + 1)` plus `{value: SUBMIT_TARGET, label:
  "Submit the questionnaire"}`.
- A stale stored target is still shown, flagged: `withCurrentTarget` appends
  `{value: current, label: "${current} — invalid target"}` (`block-editor.tsx:93-99`).
- Section-level `next` picker at `builder-v2.tsx:826-857`; per-option picker at
  `block-editor.tsx:828-857`. Both use sentinel `CONTINUE = "__continue__"` because "Radix
  Select forbids an empty item value" (`block-editor.tsx:55-56`, `builder-v2.tsx:90`).
- Live inline branch indicator: `goes to submit` / `goes to ${option.goTo}` with a
  `CornerDownRight` icon (`block-editor.tsx:908-915`).
- Author-facing copy: "Branches only ever move forward — a respondent can never be sent back
  into a section they already answered." (`block-editor.tsx:937-940`).

### 2.7 "Other…" free-text answers

- Codec in `questionnaire.ts:30-45`: `OTHER_PREFIX = "other:"`, `isOtherAnswer`,
  `otherAnswerText`, `toOtherAnswer`. The stored value is `other:<typed text>` **in the same
  flat response map** — no companion key, no schema change (`:25-29`).
- Option values may not start with the prefix; enforced at definition time
  (`questionnaire-definition.ts:231-237`, code `reserved_option_value`).
- Editor controls: `allowOther` toggle + `otherLabel` input (`block-editor.tsx:944-963`).
- Renderer sentinel for the dropdown variant: `OTHER_SENTINEL = "__other__"`
  (`apps/web/components/questionnaire/field.tsx:46`), never stored.

### 2.8 Deterministic seeded shuffle

- `page.shuffleQuestions` (`questionnaire.ts:421`), `question.shuffleOptions` (`:90`, `:105`).
- Implementation: FNV-1a-style `hash` (offset `2166136261`, prime `16777619`,
  `questionnaire-runtime.ts:252-259`) seeding an **xorshift32** Fisher–Yates
  (`state ^= state << 13; state ^= state >>> 17; state ^= state << 5;`, `:264-268`).
- Seeds: blocks `${seed}:${page.id}` (`:289`), options `${seed}:${question.id}` (`:303`).
- Callers pass a stable seed: participant `${activationId}:${userId}`
  (`apps/web/components/questionnaire/fill.tsx:44-46`); the org console gate passes the bare
  `activationId` with an explicit note that this makes it "the same order for everyone rather
  than per person" (`apps/org/components/questionnaire/console-gate.tsx:58-62`).
- Builder copy: "Randomised per respondent, seeded so a reload is stable."
  (`builder-v2.tsx:811-813`); "Branches follow the option, not its position."
  (`block-editor.tsx:966`).

### 2.9 Live definition validation, inline, dotted-path addressed

- The builder runs the **same** validator the server runs, on every keystroke, memoised:
  `builder-v2.tsx:197-201`.
- Issues are only *displayed* after a failed save attempt (`showIssues` gate at `:170`, `:201`,
  set at `:315` and `:334`, cleared at `:338`) — so a half-typed new question does not shout.
- `DefinitionIssuePanel` at the top (`builder-v2.tsx:379`) lists every issue with a breadcrumb
  `"Section 2 · Block 1 · Option 3"` (`definition-issues.tsx:84-96`).
- `IssueNote` renders inline against the offending section (`builder-v2.tsx:878`), block
  (`block-editor.tsx:346`) and individual option (`block-editor.tsx:917-919`).
- Path parsing handles **two dialects** (`definition-issues.tsx:15-17`): structural
  `pages[2].questions[0].options[1]` and Zod shape `pages.2.questions.0.prompt`. Regex:
  `new RegExp(\`${key}(?:\\[(\\d+)\\]|\\.(\\d+))\`)` (`:26`).
- Block cards get a red left border when they carry issues:
  `border-l-4 … border-l-destructive` (`block-editor.tsx:215-218`); sections get
  `border-destructive/60` (`builder-v2.tsx:644`).
- Options-level issues are excluded from the block's own note so they are not doubled:
  `ownIssues = mine.filter((i) => !/options(\[|\.)\d/.test(i.path))` (`block-editor.tsx:211`).

### 2.10 Author preview

`questionnaire-preview.tsx` — a dialog (`max-h-[85svh] max-w-2xl`, `:222`) that remounts on
every open so the walk starts fresh (`:230-231`). It **delegates branching to the engine**
(`nextPageId`, `:284`) and reuses the console's own `QuestionField` + `ContentBlockView`
(`:183-184`), so "what the author sees here is what a recipient actually gets" (`:194-195`).
End state is a `Badge variant="success"` "End of questionnaire" plus a Start-over button
(`:259-271`). It carries a documented layout fix: only the section body scrolls
(`max-h-[60svh] overflow-y-auto`, `:309`) so Back/Next never run off the viewport (`:217-221`).

### 2.11 Results view

`results-view.tsx`. Two tabs — **Summary** and **Individual** (`:87-90`) — plus a CSV export
button in the tab row (`:91-95`).

Seven chart shapes, `CHART_LABEL` verbatim (`:61-69`):
`choice: "Choice"`, `scale: "Linear scale"`, `rating: "Rating"`, `boolean: "Yes / No"`,
`timeline: "Dates & times"`, `text: "Text answers"`, `grid: "Grid"`.

- **choice** → `BarRow` per option + a boxed "Other…" answers list sorted by count
  (`:253-282`).
- **boolean** → two BarRows, No's percent computed as
  `Math.round((100 - aggregate.percentYes) * 10) / 10` (`:295`).
- **scale** → `Histogram` (fixed `height: 160`, bar height `Math.max(2, (count/peak) * 110)px`,
  `:455`, `:469`) with min/max end labels and an average line.
- **rating** → BarRows **reversed** (5★ first) with a filled `Star` glyph, plus
  "Average X out of N" (`:327-350`).
- **timeline** → BarRows per distinct value + "Earliest … · latest …" (`:354-372`).
- **text** → `TextAnswers`: first 5 shown, "View all N answers" toggle (`:479-503`).
- **grid** → per-row block with its own respondent count and per-column BarRows; renders
  "Nobody answered this row." when `row.responded === 0` (`:377-408`).
- `BarRow` is responsive with a documented mobile fix: fixed 160+112px gutters at `md+`, but
  full-width label above the bar below `md` because on a 360px phone the track collapsed to
  ~24px (`:421-424`).
- Empty summary: "No one has submitted answers yet — there is nothing to summarise." (`:102`).

**Individual tab**: table of Recipient / Status / Completed / Response, status badges from
`STATUS_STYLE` (`:51-59`) — `completed→success "Completed"`, `pending→warning "Pending"`,
`waived→secondary "Waived"`, `expired→outline "Expired"` — with a `ResponseViewer` dialog per
completed row.

**Orphan disclosure** (`:186-222`): answers whose question was deleted after collection are
surfaced in a warning panel listing `questionId × N answers`, never silently dropped.

### 2.12 CSV export

`results-view.tsx:505-609`. Header row is `["Recipient","Status","Completed", ...questions.map(q => q.prompt)]`
(`:566-571`). Cells:

- boolean → `"Yes"` / `"No"` (`:528`)
- `other:` answers → `Other: <text>` (`:531`)
- arrays → labels joined with `"; "` (`:533`)
- grid maps → `"Row: Col A, Col B | Row2: …"` (`:536-546`)
- otherwise value→label via `optionLabelMap` keyed `${q.id}:${o.value}`,
  `${q.id}:row:${row.id}`, `${q.id}:col:${col.value}` (`:507-520`)
- quoting: `csvCell` wraps in `"` and doubles inner quotes (`:551-553`)
- line ending `\r\n`, and a **UTF-8 BOM** prefix `﻿` "so Excel opens UTF-8 answers
  correctly" (`:584-587`)
- filename `${exportName}.csv` where `exportName = ${questionnaireKey}-${activationId.slice(0,8)}`
  (`[activationId]/page.tsx:211`)
- download via `Blob` + `URL.createObjectURL` + a synthetic `<a download>` click, revoked
  after (`:588-595`). **NOTE for Camp 404 artifacts:** this technique is inert inside a
  published Artifact sandbox; it is fine in the real app.
- The button is `disabled={rows.length === 0}` (`:603`).

### 2.13 Send / activation rail (builder side)

`builder-v2.tsx:883-963` `SendRail`: audience `AudienceSelect` with a live debounced (300ms)
resolved-count preview (`:210-227`), a **Blocking** switch, a `BlockingBadge`, and an optional
due date. These are **carried but never written here** (`:172`, `:955-958`) — on Publish they
are appended to the redirect query string (`:341-348`):
`/questionnaires/${key}/activate?audience=…&blocking=1&due=YYYY-MM-DD`, and re-parsed
defensively server-side (`[key]/activate/page.tsx:21-37`, `:61-65`, with the due date
regex-guarded `^\d{4}-\d{2}-\d{2}$`).

### 2.14 The "fewer forms" conscience banner

`builder-v2.tsx:364-377`, a warning-toned panel with a `Tent` icon, verbatim:

> **Every question you add is a question someone in the desert has to answer.**
> Ask for the least you need. Mark a question required only if a missing answer genuinely
> blocks the burn.

Repeated as the `Required` toggle's hint: "Only if a missing answer genuinely blocks the burn."
(`block-editor.tsx:339`), and in the simpler camp builder (`apps/web/components/questionnaire/builder.tsx:236-242`).
`docs/questionnaire-spec.md:230-232` records it as a product law: "the builder itself must warn
authors … small copy touch, real principle."

### 2.15 Blocking-status badge — mandatory on every surface

`apps/org/components/questionnaire/blocking-badge.tsx:12-24`: blocking →
`Badge variant="destructive"` + `AlertTriangle` + text **"Required — blocks the app until done"**;
non-blocking → `Badge variant="outline"` + `Circle` + **"Optional"**. Doc comment: "Never render
a questionnaire without one of these." Backed by `docs/questionnaire-spec.md:202-209`.

### 2.16 Image handling

- `ImageBlock {id, kind:"image_block", url, alt, caption?}` — **`alt` is required**
  (`questionnaire.ts:359-365`, `.min(1)`), rationale "so the runner is never inaccessible".
  Editor label: "Required — never ship a blind image." (`block-editor.tsx:702`).
- Per-option images: `QuestionOption.imageUrl` / `imageAlt` (`questionnaire.ts:73-74`), editor
  at `block-editor.tsx:870-903`, only shown when `display === "image_grid"` (`:729`).
- Uploads go through `FileUpload` with `handleUploadUrl="/api/blob/upload"`,
  `kind="questionnaire-images"`, `variant="image"`, `maxFiles={1}`,
  hint `"PNG, JPEG, WebP or GIF, up to 8 MB"` (`block-editor.tsx:690-700`).
- `BlobConfigProvider` / `useBlobConfigured` (`block-editor.tsx:62-80`) threads a single
  `blobConfigured` boolean from the builder root so nested image controls need no prop drilling;
  set from `Boolean(process.env.BLOB_READ_WRITE_TOKEN)` at the route
  (`new/page.tsx:135`, `edit/page.tsx:186`).
- Server policy (`apps/org/app/api/blob/upload/route.ts:45-56`): `questionnaire-images` →
  `["image/png","image/jpeg","image/webp","image/gif"]`, `maximumSizeInBytes: 8 * MB`,
  `domain: "questionnaires"`. Type + size are enforced on the issued **token**, i.e. server-side
  (`:114-119`). **No permissive fallback** — an unknown `kind` is refused (`:58-78`).

---

## 3. Data model (verbatim)

### 3.1 Enums (`packages/db/src/schema.ts`)

```ts
requiredActionTypeEnum   = pgEnum("required_action_type",   ["questionnaire","acknowledgement","payment","profile_update"]);   // :240
requiredActionStatusEnum = pgEnum("required_action_status", ["pending","completed","waived","expired"]);                      // :247
questionnaireScopeEnum   = pgEnum("questionnaire_scope",    ["everyone","individual","opt_in"]);                              // :254
activationStatusEnum     = pgEnum("activation_status",      ["draft","open","closed"]);                                       // :260
questionnaireStatusEnum  = pgEnum("questionnaire_status",   ["draft","published","unpublished"]);                             // :266
questionnaireAuthoredScopeEnum = pgEnum("questionnaire_authored_scope", ["org","group"]);                                     // :274
```

> Camp 404 has identical `required_action_type`, `required_action_status`, `activation_status`
> and `questionnaire_status` enums. Camp 404's `questionnaire_scope` is
> `[everyone, team, team_leads, individual, opt_in]` — a superset on the team axis. The donor's
> `questionnaire_authored_scope` (`org`/`group`) is **pure multi-tenancy and must be dropped**.

### 3.2 `questionnaire_definitions` (`schema.ts:1284-1295`)

```
key                 text PRIMARY KEY
title               text NOT NULL
definition          jsonb $type<Questionnaire> NOT NULL
status              questionnaire_status NOT NULL DEFAULT 'draft'
version             text                       -- nullable, a stringified integer
created_by_user_id  uuid → users.id ON DELETE SET NULL
created_at          timestamp NOT NULL DEFAULT now()
updated_at          timestamp NOT NULL DEFAULT now()
```

Note: `version` is **a text column on the head row incremented in place**
(`String((Number(current.version) || 0) + 1)`, `actions.ts:159`) — the donor has **no
immutable-versions table**. Camp 404 is strictly ahead here: it has `questionnaire_versions`
snapshots. The donor's equivalent protection is the per-activation snapshot (§3.3).

### 3.3 `questionnaire_activations` (`schema.ts:1297-1346`)

```
id                    uuid PK default random
questionnaire_key     text NOT NULL
version               text NOT NULL
title                 text NOT NULL
description           text
scope                 questionnaire_scope NOT NULL DEFAULT 'everyone'
blocking              boolean NOT NULL DEFAULT true
status                activation_status NOT NULL DEFAULT 'draft'
due_at                timestamp
authored_scope        questionnaire_authored_scope NOT NULL DEFAULT 'org'   -- TENANCY
group_id              uuid → groups.id ON DELETE CASCADE                    -- TENANCY
edition_id            uuid → editions.id ON DELETE CASCADE                  -- EDITION AXIS
audience              jsonb $type<AudienceSpec>                             -- TENANCY
definition            jsonb $type<Questionnaire>          -- THE SNAPSHOT, nullable
activated_by_user_id  uuid → users.id ON DELETE SET NULL
opened_at, closed_at, created_at, updated_at  timestamps
indexes: questionnaire_activations_{key,status,group,edition}_idx
```

**The snapshot column is the most portable idea here.** Its comment (`schema.ts:1326-1333`):
"An activation must render/validate/aggregate against exactly what its respondents were shown —
editing (or re-versioning) the live `questionnaire_definitions` row must never mutate an
in-flight or already-answered activation. Nullable so pre-snapshot rows … fall back to the live
join at read time; no backfill required."

### 3.4 `questionnaire_responses` (`schema.ts:1348-1424`)

```
id                  uuid PK
user_id             uuid NOT NULL → users.id ON DELETE CASCADE
definition_key      text NOT NULL
edition_id          uuid NOT NULL → editions.id ON DELETE CASCADE     -- EDITION AXIS
definition_version  text NOT NULL
responses           jsonb $type<QuestionnaireResponses> NOT NULL DEFAULT {}
activation_id       uuid → questionnaire_activations.id ON DELETE SET NULL
group_id            uuid → groups.id ON DELETE CASCADE                -- TENANCY (camp-scoped answers)
completed_at        timestamp
updated_at          timestamp NOT NULL DEFAULT now()
```

**Two PARTIAL unique indexes, not one** (`schema.ts:1401-1414`), and the reason is stated:

```ts
userDefIdx: uniqueIndex("questionnaire_responses_user_def_idx")
  .on(r.userId, r.definitionKey, r.editionId)
  .where(sql`${r.groupId} is null`),
userDefGroupIdx: uniqueIndex("questionnaire_responses_user_def_group_idx")
  .on(r.userId, r.definitionKey, r.editionId, r.groupId)
  .where(sql`${r.groupId} is not null`),
```

> "TWO PARTIAL INDEXES rather than one widened index, because Postgres treats NULLs as DISTINCT
> in a unique index: adding `group_id` to the existing one would have quietly allowed unlimited
> duplicate Burner Bio rows per person."

And the consequence, recorded as a production bug (`actions.ts:652-660`): Postgres will not use
a PARTIAL index for `ON CONFLICT` unless the statement **repeats the predicate**, so every
questionnaire write needs `targetWhere: isNull(schema.questionnaireResponses.groupId)` — its
absence failed every write "until an e2e run caught it".

### 3.5 `required_actions` (`schema.ts:1443-1487`)

```
id, user_id (NOT NULL → users), edition_id (NOT NULL → editions),
type required_action_type NOT NULL, action_key text NOT NULL, version text,
activation_id uuid → questionnaire_activations ON DELETE SET NULL,
title text NOT NULL, blocking boolean NOT NULL DEFAULT true,
status required_action_status NOT NULL DEFAULT 'pending', due_at, created_at, completed_at
uniqueIndex required_actions_user_edition_action_idx ON (user_id, edition_id, action_key)
index       required_actions_user_status_idx        ON (user_id, status)
```

Key convention: `activationRequiredActionKey(id) = \`questionnaire:${id}\``
(`questionnaire-activation.ts:83-85`), parsed back by `parseActivationActionKey` (`:89-94`).

**Migration 0024's lesson is worth stealing** (`schema.ts:1426-1442`, dated "Ryan, 28 Jul 2026"):
the uniqueness key was `(user, action_key)` forever, so a per-edition gate like `burner_bio`
"fired once in a burner's lifetime and then never again, and nothing anywhere reported that".
Camp 404 is single-camp with no edition axis, but the same trap exists for any repeated annual
required action — the fix shape is "put the recurrence dimension in the uniqueness key".

---

## 4. Public API surface (verbatim signatures)

### `packages/types/src/questionnaire.ts`

```ts
export const SUBMIT_TARGET = "__submit__";
export const OTHER_PREFIX  = "other:";
export function isOtherAnswer(value: string): boolean
export function otherAnswerText(value: string): string
export function toOtherAnswer(text: string): string

export const TextFormat = z.enum(["text","email","url","phone","number","integer","alphanumeric"]);
export const ChoiceDisplay      = z.enum(["radio","dropdown","image_grid"]);
export const MultiChoiceDisplay = z.enum(["checkbox","image_grid"]);

export const ATTENDED_YEAR_MIN = 2007;
export const ATTENDED_YEAR_MAX = 2026;
export const NO_BURN_YEARS: readonly number[] = [2020, 2021];
export function isValidAttendedYear(year: number): boolean
export function attendedYearOptions(): { year: number; disabled: boolean }[]

export type SaveResult = { ok: true } | { ok: false; errors: Record<string, string> };

export function isAnswerableBlock(block: PageBlock): block is Question
export function flattenQuestions(questionnaire: Questionnaire): Question[]
export function pageQuestions(page: QuestionnairePage): Question[]
export function pageBlocks(page: QuestionnairePage): PageBlock[]
export function validateResponses(questionnaire: Questionnaire, raw: unknown):
  | { ok: true;  responses: QuestionnaireResponses }
  | { ok: false; errors: Record<string, string> }
export function validateOne(q: Question, raw: unknown):
  | { ok: true;  value: QuestionnaireResponseValue | undefined }
  | { ok: false; error: string }
```

### `packages/core/src/questionnaire-definition.ts`

```ts
export type DefinitionIssueCode =
  | "shape" | "duplicate_id" | "reserved_id" | "duplicate_option_value"
  | "reserved_option_value" | "unknown_branch_target" | "backward_branch"
  | "self_branch" | "branch_not_allowed" | "unreachable_page" | "invalid_range";

export interface DefinitionIssue { path: string; code: DefinitionIssueCode; message: string }
export type DefinitionValidation =
  | { ok: true;  definition: Questionnaire; issues: readonly [] }
  | { ok: false; issues: DefinitionIssue[] };

export function validateQuestionnaireDefinition(raw: unknown): DefinitionValidation
export function isValidQuestionnaireDefinition(raw: unknown): boolean
```

### `packages/core/src/questionnaire-runtime.ts`

```ts
export function pageById(questionnaire: Questionnaire, pageId: string): QuestionnairePage | null
export function nextPageId(questionnaire: Questionnaire, pageId: string,
                           responses: QuestionnaireResponses): string | null
export function resolvePath(questionnaire: Questionnaire,
                            responses: QuestionnaireResponses): string[]
export function visibleQuestions(questionnaire: Questionnaire,
                                 responses: QuestionnaireResponses): Question[]
export function hasAnswer(question: Question, value: unknown): boolean
export interface QuestionnaireProgress {
  path: string[]; pageIndex: number; pageCount: number;
  answered: number; total: number;
  requiredAnswered: number; requiredTotal: number;
  percent: number; complete: boolean;
}
export function deriveProgress(questionnaire: Questionnaire,
                               responses: QuestionnaireResponses,
                               currentPageId?: string): QuestionnaireProgress
export function validateSubmission(questionnaire: Questionnaire, raw: unknown):
  | { ok: true; responses: QuestionnaireResponses; progress: QuestionnaireProgress }
  | { ok: false; errors: Record<string, string> }
export function allQuestions(questionnaire: Questionnaire): Question[]
export function presentationBlocks(page: QuestionnairePage, seed: string): PageBlock[]
export function presentationOptions(question: Question, seed: string): QuestionOption[]
```

### `packages/core/src/questionnaire-results.ts`

```ts
export interface OptionTally { value: string; label: string; count: number; percent: number }
export interface OtherTally  { text: string; count: number }
export interface ScaleBucket { value: number; count: number; percent: number }
export type QuestionAggregate = /* discriminated on `chart`:
   "choice" | "scale" | "rating" | "boolean" | "text" | "timeline" | "grid" */
export interface OrphanAnswers { questionId: string; count: number }
export interface QuestionnaireResults {
  totalResponses: number; questions: QuestionAggregate[]; orphans: OrphanAnswers[];
}
export function aggregateResponses(questionnaire: Questionnaire,
                                   responses: readonly QuestionnaireResponses[]): QuestionnaireResults
export function aggregateQuestion(question: Question,
                                  responses: readonly QuestionnaireResponses[]): QuestionAggregate
```

### `packages/core/src/questionnaire-activation.ts`

```ts
export function resolveActivationDefinition<T>(snapshot: T | null | undefined, liveFallback: T): T
export function activationRequiredActionKey(activationId: string): string
export function parseActivationActionKey(actionKey: string): string | null
export interface ActivationLike { id: string; title: string; blocking: boolean; dueAt: Date | null }
export interface RequiredActionInsert {
  userId: string; type: "questionnaire"; actionKey: string; activationId: string;
  title: string; blocking: boolean; status: "pending"; dueAt: Date | null;
}
export function buildActivationRequiredActions(activation: ActivationLike,
                                               userIds: readonly string[]): RequiredActionInsert[]
export function completeRequiredAction(now?: Date): { status: "completed"; completedAt: Date }
export function isActivationResponseComplete(activationId: string,
                                             response: ResponseLike | null | undefined): boolean
export interface ActivationCompletion { sent: number; completed: number; pending: number }
export function tallyActivationCompletion(actions: readonly { status: string }[]): ActivationCompletion
```

### `apps/org/components/questionnaires/block-kinds.ts`

```ts
export type PaletteKind = /* 20 members, §2.1 */
export interface PaletteEntry { kind: PaletteKind; label: string;
                                group: "content" | "question"; icon: LucideIcon; short: string }
export const PALETTE: readonly PaletteEntry[]
export const PALETTE_BY_KIND: Record<PaletteKind, PaletteEntry>
export function blockPaletteKind(block: PageBlock): PaletteKind
export function takenIds(draft: Questionnaire): Set<string>
export function allocateId(prefix: string, taken: Set<string>): string
export function createBlock(kind: PaletteKind, id: string): PageBlock
export function convertBlock(block: PageBlock, kind: PaletteKind): PageBlock
export function createSection(id: string, index: number): QuestionnairePage
export function duplicateBlock(block: PageBlock, id: string): PageBlock
```

### `apps/org/components/questionnaires/definition-issues.tsx`

```ts
export interface IssueLocation { pageIndex: number | null; blockIndex: number | null; optionIndex: number | null }
export function issueLocation(issue: DefinitionIssue): IssueLocation
export function sectionIssues(issues: readonly DefinitionIssue[], pageIndex: number): DefinitionIssue[]
export function blockIssues(issues: readonly DefinitionIssue[], pageIndex: number, blockIndex: number): DefinitionIssue[]
export function optionIssues(issues: readonly DefinitionIssue[], pageIndex: number, blockIndex: number, optionIndex: number): DefinitionIssue[]
export function issueBreadcrumb(issue: DefinitionIssue, sectionTitles: readonly string[]): string
export function IssueNote({ issues, className }): JSX.Element | null
export function DefinitionIssuePanel({ issues, sectionTitles }): JSX.Element | null
```

### `apps/org/components/questionnaires/block-editor.tsx`

```ts
export function BlobConfigProvider({ value, children }): JSX.Element
export interface BranchTarget { value: string; label: string }
export function withCurrentTarget(targets: readonly BranchTarget[], current: string | undefined): BranchTarget[]
export function BlockEditor({ block, pageIndex, blockIndex, total, issues, branchTargets,
                              onChange, onConvert, onMove, onDuplicate, onRemove }): JSX.Element
```

### `apps/org/components/questionnaires/builder-v2.tsx`

```ts
export interface BuilderV2Initial {
  key: string; title: string; description: string;
  definition: Questionnaire; status: "draft" | "published" | "unpublished";
}
export function QuestionnaireBuilderV2({ initial, editionId, blobConfigured = false }): JSX.Element
```

### `apps/org/components/questionnaires/results-view.tsx`

```ts
export interface ResultRowView {
  userId: string; email: string | null;
  status: "pending" | "completed" | "waived" | "expired";
  completedLabel: string; responses: QuestionnaireResponses | null;
}
export function ResultsView({ summary, rows, questions, questionnaire, exportName }): JSX.Element
```

### `apps/org/app/(console)/questionnaires/builder-actions.ts`

```ts
export type SaveDefinitionV2Result =
  | { ok: true;  key: string; issues: readonly [] }
  | { ok: false; error: string; issues: DefinitionIssue[] };
export async function saveDefinitionV2(raw): Promise<SaveDefinitionV2Result>
```

### `apps/org/lib/questionnaires/actions.ts`

```ts
export type SaveDefinitionResult = { ok: true; key: string } | { ok: false; error: string };
export async function saveQuestionnaireDefinition(raw): Promise<SaveDefinitionResult>
export type PreviewResult = { ok: true; count: number } | { ok: false; error: string };
export async function previewAudienceCount(raw): Promise<PreviewResult>
export async function activateQuestionnaire(raw): Promise<ActionResult>
export async function closeActivation(raw): Promise<ActionResult>
export async function submitConsoleQuestionnaire(activationId: string, rawResponses: unknown): Promise<SaveResult>
```

### `apps/org/lib/questionnaires/queries.ts`

```ts
export function audienceLabel(spec: AudienceSpec | null): string
export async function listOrgQuestionnaires(): Promise<OrgQuestionnaireSummary[]>
export async function getOrgDefinition(key: string): Promise<OrgDefinition | null>
export async function getOrgActivation(activationId: string): Promise<ActivationDetail | null>
export function canReadActivationResults(actor: OrgActor): boolean
export async function getActivationResults(activationId: string, definitionKey: string, actor: OrgActor): Promise<ResultRow[]>
export async function buildAudienceContext(editionId: string, orgGroupId: string): Promise<AudienceContext>
export async function getConsoleBlockingQuestionnaire(dbUserId: string): Promise<ConsoleGateQuestionnaire | null>
```

---

## 5. UX behaviours

### Layout

`builder-v2.tsx:381` — `grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)_20rem]`.
Palette rail `lg:sticky lg:top-6` (`:526`); send rail `xl:sticky xl:top-6` (`:903`). At `lg`
the send rail wraps below; below `lg` it is a single column. The e2e spec is desktop-only for
exactly this reason ("the builder is a three-column authoring grid",
`e2e/specs/org-staff/questionnaire-build-activate-results.spec.ts:30`).

### Active-section targeting

The palette adds to whichever section is "active". Active is set by `onFocusCapture` **and**
`onClick` on the section wrapper (`builder-v2.tsx:639-640`), and the rail prints where the next
block will land: "Add a block / to {activeLabel}" (`:529-536`). `addBlock` clamps with
`Math.min(activeSection, prev.pages.length - 1)` (`:256`). Each section also carries its own
"Add a block…" `Select` and a "Quick question" shortcut that adds a `short_text`
(`builder-v2.tsx:775-802`).

### Save flow

Two buttons (`builder-v2.tsx:497-507`): **"Save draft"** (`variant="outline"`,
`save(false)`) and **"Publish & choose audience"** (`save(true)`, `Send` icon, label flips to
"Saving…" while pending). Plus **Cancel** (`ghost` → `/questionnaires`) and the
**Preview** dialog trigger. A live readiness line sits to the left:
`"${n} problems to fix before this can be saved."` / `"Ready to save."` (`:485-489`).
Status badge shows the definition's stored status when editing (`:478-484`).

`save()` (`:305-354`): title-required check first (`toast.error("Check the questionnaire", …)`),
then a client-side run of the same validator (`toast.error("Not saved", { description: "1
problem is blocking this save." | "N problems are blocking this save." })`), then the server
action. On publish → redirect to `/questionnaires/${key}/activate` with the rail's choices;
on draft → `/questionnaires/${key}/edit`. Both followed by `router.refresh()`.

### Counters

`"{n} sections · {m} questions"` under the Details card (`:424-429`), where the question count
counts only blocks with a `prompt` (`:356-359`) — i.e. content blocks do not inflate it. The
server-side list count uses `flattenQuestions().length` for the same reason
(`queries.ts:86-88`, tested at `questionnaire-queries.test.ts:224`).

### Runner UX (what the author is designing against)

- Multi-page with a Back/Next trail; **Back pops the trail** rather than decrementing, because
  branching makes "the previous page" answer-dependent (`apps/org/components/questionnaire/runner.tsx:76-79`).
- Per-page validation on Next, mirroring the server's `validateOne`
  (`runner.tsx:122-132`) — "so what passes here passes there".
- **Progress is computed along the branch-resolved path**, so the total shrinks/grows as answers
  change (`runner.tsx:104-106`).
- On a server rejection naming an off-page question, the runner **jumps to the owning page**
  (`pageOwningError`, `runner.tsx:280-296`) and, if no reachable page owns it, shows a
  last-resort banner (`:245-255`) — "A refusal must always be visible."
- Participant runner adds **localStorage draft autosave**, key
  `quagga:questionnaire-draft:${draftKey}`, 700 ms debounce
  (`apps/web/components/questionnaire/runner.tsx:44-45`, `:138-184`). Local only — "nothing is
  sent to the server until submit, so no half-answers land in the response store." A corrupt
  draft is never fatal.
- Participant runner also builds a **step rail** from the branch-resolved path
  (`buildRail`, `apps/web/components/questionnaire/runner.tsx:556-572`).

---

## 6. Validation and edge-case rules — digit-exact

### 6.1 Structural (definition-time) — `validateQuestionnaireDefinition`

| Code | Rule | Line |
| --- | --- | --- |
| `shape` | Zod parse failure; path joined with `.`, or `"definition"` when empty | `:133-137` |
| `reserved_id` | any id equal to `"__submit__"` | `:151-159` |
| `duplicate_id` | page ids and block ids share ONE namespace; message names the first claim's path | `:160-169` |
| `duplicate_id` (rows) | duplicate grid row id | `:192-202` |
| `reserved_option_value` | option value or grid column value starting `"other:"` | `:206-212`, `:231-237` |
| `duplicate_option_value` | duplicate option value / grid column value | `:213-219`, `:238-245` |
| `branch_not_allowed` | a `goTo` on a `multi_select` option | `:247-254` |
| `unknown_branch_target` | target is neither `__submit__` nor a page id | `:266-274` |
| `self_branch` | target index === source index | `:275-282` |
| `backward_branch` | target index < source index | `:283-290` |
| `unreachable_page` | left-to-right sweep from page 0; **only run when `issues.length === 0`** | `:322-341` |
| `invalid_range` | see below | `:78-119` |

`invalid_range` rules verbatim (`:83-117`):
- `short_text`/`long_text`: `minLength > maxLength` → "minLength X exceeds maxLength Y"
- `short_text`: `min > max` → "min X exceeds max Y"
- `short_text`: `min`/`max` set while `format` is not `number`/`integer` →
  "min/max only apply when format is number or integer"
- `multi_select`: `ceiling = options.length + (allowOther ? 1 : 0)`;
  `minSelections > maxSelections`, `minSelections > ceiling`, `maxSelections > ceiling`
- `linear_scale`: `max <= min` → "max X must be greater than min Y"

Reachability needs no cycle detection because "a cycle cannot be expressed" once branches are
forward-only (`:320-321`). The fall-through edge is always live; an explicit `next` **replaces**
the linear edge, and a branching question only diverts the options that carry a `goTo`
(`:300-309`).

### 6.2 Per-answer (`validateOne`, `questionnaire.ts:578-764`)

Missing gate first (`:584-590`): `undefined`, `null` and `""` are all "missing";
required → `"This question is required"`, optional → `{ok: true, value: undefined}`.

| Kind | Rules / exact messages |
| --- | --- |
| `boolean` | must be a real boolean; `"Expected yes or no"` |
| `email` | `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`; `"Enter a valid email address"` |
| `phone` | `PHONE_RE = /^\+?[\d\s().-]{7,20}$/` **and** digit count 7–15 (E.164); `"Enter a valid phone number"` |
| `single_select` | `other:` accepted only when `allowOther`; empty free text → `"Tell us what your 'other' answer is"`; unlisted → `"Not a valid option"` |
| `multi_select` | **unknown values are DROPPED, not errors**; disallowed `other:` dropped; `required && filtered.length === 0` → `"Pick at least one option"`; `minSelections` binds only once something is picked → `"Pick at least N options"`; `maxSelections` → `"Pick at most N options"` |
| `linear_scale` | booleans rejected before `Number()` coercion; non-integer → `"Pick a value on the scale"`; out of range → `` `Pick a value between ${min} and ${max}` `` |
| `rating` | 1..steps; `"Pick a rating"` / `` `Pick a rating between 1 and ${steps}` `` |
| `time` | `TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/`; `"Use 24-hour hh:mm"` |
| `file_link` | `URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*$/i` on the trimmed value; **stores the TRIMMED value**; `"Enter a link starting with http:// or https://"` |
| grids | iterate the **definition's** rows so unknown rows/columns are dropped; picks deduped; `multi_choice_grid` with >1 pick → `` `Pick one column for "${row.label}"` ``; required with a blank row → `` `Answer every row — "${label}" is missing` ``; an all-blank optional grid returns `{ok:true, value: undefined}` |
| `years` | `/^\d{4}$/` + `isValidAttendedYear`; dedupes preserving first-seen order; `` `${s} isn't a valid AfrikaBurn year` ``; required-empty → `"Pick at least one year"` |
| `short_text`/`long_text` | length checked FIRST (`Max N characters`, `At least N characters`), then `checkTextFormat` for `short_text` |
| `date` | `/^\d{4}-\d{2}-\d{2}$/` then `Date.parse`; `"Use yyyy-mm-dd"` / `"Not a real date"` |

`checkTextFormat` (`:545-576`) — the closed enum, deliberately: "author-supplied regex would be
a ReDoS surface on a server-side validator" (`:542-543`). Messages: `"Enter a valid email
address"`, `"Enter a link starting with http:// or https://"`, `"Enter a valid phone number"`,
`"Letters and numbers only"` (`ALNUM_RE = /^[a-z0-9 ]+$/i`), `"Enter a number"`, `"Enter a whole
number"`, `` `Must be at least ${min}` ``, `` `Must be at most ${max}` ``. Trimming happens
before the format check but the answer is **stored as posted**
(`questionnaire-text-format.test.ts:147`).

### 6.3 Submit-time (branch-aware) — `validateSubmission`

`questionnaire-runtime.ts:185-238`. Two-pass, and the reason is the whole point (`:188-193`):

1. Build a `driving` map by running `validateOne` over **every** question (so branch-driving
   answers count even if other answers are broken).
2. Resolve the path against `driving`, then validate **only** `visibleQuestions`.

Consequence, both directions: "a skipped required question can't block a legitimate submission,
and answers to skipped questions can't be smuggled into the stored response."
Non-object payloads → `{ ok: false, errors: { _root: "Malformed response payload" } }`.

### 6.4 Progress derivation

`deriveProgress` (`:138-179`): denominator is `requiredTotal` when > 0 else `total`;
`percent = denominator === 0 ? 100 : Math.round((numerator/denominator) * 100)`;
`complete = requiredAnswered === requiredTotal`. `hasAnswer` (`:110-115`) treats an empty array
as unanswered and re-runs `validateOne`, so **an invalid answer counts as unanswered**
(tested: `questionnaire-runtime.test.ts:284`).

### 6.5 Aggregation edge cases

- `pct(count, denominator)` rounds to one decimal: `Math.round((count/denominator) * 1000) / 10`
  (`questionnaire-results.ts:130-133`).
- Denominator is **respondents who answered this question**, not everyone sent it — "Google
  Forms' denominator" (`:27-28`).
- `isBlank` treats `[]` as blank and a grid map with no non-empty row as blank (`:135-143`).
- Options deleted after collection still get a row, labelled by their raw value (`:210-219`).
- Scale narrowed after collection: out-of-range answers keep their own appended bucket
  (`:371-377`).
- Average is `Math.round((sum/n) * 100) / 100`, `null` when nobody answered (`:380`).
- Orphans sorted by `questionId.localeCompare` (`:407-409`).
- `resolvePath` carries a visited-set guard even though loops are impossible by construction,
  "so a legacy or hand-edited definition degrades into a truncated path instead of hanging the
  server" (`questionnaire-runtime.ts:74-78`) — tested at `questionnaire-runtime.test.ts:186`.

### 6.6 Server-side save gate

`builder-actions.ts:70-81` — "THE GATE. Never save a definition that fails structural
validation." Returns the typed issues with dotted paths intact. The **parsed** definition (Zod
defaults applied) is what gets written, never the raw input (`:87-88`). Status flip
(draft/published) is a separate best-effort update whose failure is swallowed because "the
definition is saved either way; the status flag is not worth failing the whole save over"
(`:94-106`).

### 6.7 A draft is not sendable

`actions.ts:328-341`, the longest comment in the file, and the refusal names the state:

> draft → "That questionnaire is still a draft. Finish it and publish it from the builder before
> sending — a draft would reach its audience half-written."
> unpublished → "That questionnaire has been unpublished, so it cannot be sent. Publish it again
> from the builder first."

### 6.8 Create vs edit are different rights

`actions.ts:118-131`: `isEdit = typeof raw?.key === "string"` chosen **before** the Zod parse,
because "the capability has to be chosen before the parse"; create asks `create`, edit asks
`update`. Rationale verbatim: "a role given 'may amend our questionnaires, may not write new
ones' could author one from scratch."

---

## 7. Test coverage (the contract, documented)

**`questionnaire-definition.test.ts` (558 lines)** — five describes:
backward compatibility with v1 definitions (accepts unchanged, round-trips to *identical JSON*,
preserves v1 option shape), shape validation, id integrity (duplicate question ids, question id
colliding with a section id, the reserved submit id, duplicate + `other:`-prefixed option
values), branching (forward to sections and to submit, unknown target, backward, self, on
multi-choice, unreachable section, **and the subtle "keeps a section reachable when only SOME
options branch past it"**), validation-rule consistency, and a final "accepts every Builder v2
question type and content block".

**`questionnaire-runtime.test.ts` (607 lines)** — branch resolution (including "lets the LAST
branching question on a section win" and "does not hang on a hand-edited definition containing a
loop"), visible questions, progress derivation, branch-aware submit validation (accepts a
submission that skipped a branched-past required question; **drops answers to questions the
respondent branched past**), Builder-v2 response rules, shuffle stability, and "v1 responses
still validate against v1 definitions".

**`questionnaire-snapshot.test.ts` (171 lines)** — the strongest test file in the unit. It does
not merely assert correctness, it **proves the bug the snapshot prevents**:
`it("proves the bug: validating the SAME answer against the live edit would reject it and demand
the new question")` (`:119`) and `it("proves the bug: aggregating against the live edit orphans
every real answer under the deleted question")` (`:151`). Also covers re-activation snapshotting
the new version, and the pre-snapshot null fallback.

**`questionnaire-results.test.ts` (341 lines)** — aggregation shape, choice/scale/rating/boolean/
timeline/text aggregation, definition drift ("surfaces answers whose question was deleted",
"reports honest skips for a question added after collection"), and v1 backward compatibility.

**`questionnaire-grid.test.ts` × 2** (core 171 + types 100) — definition validation, answer
normalisation, one-vs-many per row, required/skip semantics, aggregation per-row denominators.

**`questionnaire-validate-one.test.ts` (438 lines)** — per-kind, and notable for the reasons
it names: "refuses the string 'yes' rather than coercing a checkbox truthy" (`:55`), "refuses a
boolean, which a bare `Number()` would have turned into 1 or 0" (`:229`), "counts DIGITS, not
characters, at both ends of the E.164 range" (`:104`), "accepts both booleans, including false
(which is an answer, not a blank)" (`:50`).

**`question-fixtures.ts` (182 lines)** — one typed literal per kind plus `KIND_SAMPLES`
(`:165-181`), a 15-entry `{question, answer}` array used for **exhaustiveness assertions**
because "`validateOne` has no default arm, so a kind added without one returns undefined at
runtime" (`:20-23`). Typed literals rather than `as Question` casts, deliberately (`:25-26`).

**`__fixtures__/questionnaire-v1.ts` (163 lines)** — a FROZEN pre-Builder-v2 definition, with an
explicit instruction: "DO NOT 'modernise' this fixture. If a change here is needed to make a test
pass, the change is a backward-compatibility break and belongs in a migration discussion
instead." `unknown`-typed on purpose so it feeds genuinely untyped stored JSON through the
parsers, exactly as a DB read does.

**`apps/org/lib/__tests__/questionnaire-actions.test.ts` (570 lines)** — capability selection
(create vs update), engineer refusal wording, key allocation + first-page title sync, version
bump, draft refusal, invalid due date, "WRITES THE ACTIVATION AND ITS REQUIRED ACTIONS TOGETHER",
org-internal link redirection, empty audience writes nothing, "commits the send even when the
notification hook fails", and — for `submitConsoleQuestionnaire` — "REQUIRES NO CAPABILITY —
every rank must be able to clear its own gate" and "saves the response AND flips the gate —
both, or neither".

**`apps/org/lib/__tests__/questionnaire-queries.test.ts` (498 lines)** — includes
`it("FAILS CLOSED — throws before issuing any query")` for `getActivationResults` (`:140`) and
`it("counts only ANSWERABLE questions, so an info block does not inflate it")` (`:224`).

**E2E `questionnaire-build-activate-results.spec.ts` (201 lines)** — the full loop: build four
question types across two sections via the palette rail, set a per-option branch to submit,
publish, activate outbound non-blocking, have a dedicated freshly-signed-up burner answer it in
the participant app, re-open to see "Already submitted", then read the org results and assert
`1 of N completed`, the question heading, `Evening`, `1 · 100%`, and the free-text answer.
Its 28-line header is a **shared-state-safety essay** worth reading before writing any e2e that
touches a blocking send.

**E2E `camp-member-blocking-questionnaire.spec.ts` (93 lines)** — the blocking gate's
trap-AND-release invariant, camp-scoped so it cannot poison shared accounts.

---

## 8. Dependency footprint

| Dependency | Where | Camp 404 status |
| --- | --- | --- |
| `zod ^4.4.3` | the whole types layer | **present, same range** |
| `lucide-react` (20 palette icons + ~15 others) | block-kinds, builder-v2, block-editor, results-view | **present** (donor lock 1.26.0 vs target 1.16.0 — icon names verified available in a prior sweep) |
| `@quagga/ui/components/{button,card,input,textarea,select,switch,badge,toast,dialog}` | throughout | Camp 404 has all of these |
| `@quagga/ui/components/table` | results-view Individual tab | **DONOR-ONLY** — must be ported (near drop-in) |
| `@quagga/ui/components/tabs` | results-view | **DONOR-ONLY** — needs `@radix-ui/react-tabs ^1.1.14` |
| `@quagga/ui/components/skeleton` | `loading.tsx` | **DONOR-ONLY** — near drop-in |
| `@quagga/ui/components/audience-select` | builder-v2 send rail | **DONOR-ONLY** — 81 lines, tenant-agnostic, drop-in after a rename |
| `@quagga/ui/components/file-upload` | image blocks + image-choice options | **DONOR-ONLY**, 417 lines, needs `@vercel/blob/client` `upload()`. Camp 404 has `@vercel/blob ^2.4.0` and its own `avatar-upload.tsx` but no generic FileUpload. Also references `ab-*` brand tokens at `file-upload.tsx:236` — retoken |
| `@quagga/ui/components/toggle-group` | the simpler camp builder only | **DONOR-ONLY** — needs `@radix-ui/react-toggle-group ^1.1.17` |
| `@vercel/blob` client uploads | FileUpload | present in Camp 404 (`^2.4.0`) but Camp 404's avatar path is a server route, not a client-upload token endpoint |
| `drizzle-orm` `and/eq/isNull/inArray/asc/desc/isNotNull` | actions + queries | **present, same version** |
| `next/navigation`, `next/cache` `revalidatePath` | actions + builder | present |
| **Zero chart library.** | results-view draws bars/histograms with divs and inline `style={{width: …%}}` | Deliberate: `questionnaire-results.ts:6-7` "Deliberately chart-library agnostic: this returns numbers + labels" |
| **Zero drag-and-drop library.** | reorder is ArrowUp/ArrowDown icon buttons | Camp 404 has `@dnd-kit` already, so a DnD upgrade is available that the donor does not have. Note `GripVertical` is rendered purely decoratively at `block-editor.tsx:222-225` and `apps/web/components/questionnaire/builder.tsx:296` — **it is not a drag handle**, which is a small honesty defect by the donor's own CONTRIBUTING rule |

**Coupling into the rest of the donor** (things that must be cut or replaced):
`@quagga/core` `resolveAudience` / `AudienceContext` / `canReadPersonalInformationIn` /
`orgCapabilityRefusal` / `ORG_RANK_LABELS` / `questionnaireReleasedNotification` /
`shouldSendImmediateEmail`; `@/lib/session` `requireOrgSession({capability, domain})`;
`@/lib/gate` `guardConsole`; `@/lib/audit` `writeAuditEvent`; `@/lib/notifications`
`insertNotifications`; `@/lib/email` `sendEmail`; `@/lib/actions/result` `runAction`;
`@/lib/db` `getDb` / `withTransaction`.

---

## 9. AfrikaBurn / multi-tenant coupling — what Camp 404 must collapse

### 9.1 CLEAN — zero tenancy, zero AfrikaBurn (verified by grep)

`packages/core/src/questionnaire-definition.ts`, `questionnaire-runtime.ts`,
`questionnaire-results.ts`, and everything in `packages/types/src/questionnaire.ts` **except**
the attended-years block. No `groupId`, `editionId`, `orgGroupId`, `tenant`, `supplier` or
`registration` reference appears in any of them. These four files are the drop-in core.

`apps/org/components/questionnaires/block-kinds.ts`, `block-editor.tsx` and
`definition-issues.tsx` are likewise clean: they import only `@quagga/types`, `@quagga/core`
(`DefinitionIssue` only) and UI primitives. **No tenancy anywhere in the block palette or the
block editor.**

### 9.2 AFRIKABURN-SPECIFIC content, easily excised

- `YearsQuestion` (`questionnaire.ts:216-223`) and its constants `ATTENDED_YEAR_MIN = 2007`,
  `ATTENDED_YEAR_MAX = 2026`, `NO_BURN_YEARS = [2020, 2021]` (`:189-191`). This is a *bespoke
  domain question kind smuggled into a generic engine* — AfrikaBurn's pandemic gap years are
  hard-coded in the validator. Camp 404 should either drop the kind or re-derive it from
  camp data; do not copy `[2020, 2021]`.
- `OFFICER_AUDIENCE_LABELS` (`audience.ts:98-107`) — "All registered LNT Leads", "Safety Barons",
  etc. Entirely AfrikaBurn.
- The console gate's brand line "AfrikaBurn Organiser Console" (`console-gate.tsx:39`).
- Copy referencing "the desert" / "the burn" throughout — arguably *keep* this for Camp 404,
  it is the same culture.

### 9.3 MULTI-TENANT — must be collapsed

| Coupling | Where | Collapse to |
| --- | --- | --- |
| `authored_scope` enum `org`/`group` on activations | `schema.ts:274-278`, `:1314-1316` | **Delete the column.** Camp 404 has one authoring level (captain). |
| `group_id` on activations and responses | `schema.ts:1318-1320`, `:1394-1396` | Delete. Camp 404 has no groups. `questionnaire_responses.groupId` also drives the two-partial-index scheme — with it gone, one plain unique index suffices. |
| `edition_id` on activations, responses and required_actions | `schema.ts:1321-1323`, `:1370-1372`, `:1449-1451` | Camp 404 has no edition axis today. **But note §3.5's lesson** if annual re-confirmation ever lands. |
| `AudienceSpec` 5-way union (`org_internal`, `org_outbound`, `org_officer`, `org_suppliers`, `project`) | `audience.ts:136-143` | Replace wholesale with Camp 404's existing `questionnaire_scope` `[everyone, team, team_leads, individual, opt_in]`. |
| `authoredScopeForAudience` / `groupIdForAudience` | `audience.ts:146-155` | Delete. |
| `questionnaire-authz.ts` in full | 143 lines | Replace with `requireClearance("captain")`. |
| `canReadActivationResults` → `canReadPersonalInformationIn(actor, "questionnaires")` | `queries.ts:323-325` | Camp 404 has no org-domain permission layer. Collapse to a captain check. **Keep the idea** (§10.4). |
| `isOrgAuthor` / `isProjectAdmin` / `ORG_AUTHOR_ROLES = ["god","org_staff"]` / `PROJECT_ADMIN = ["lead","admin"]` | `questionnaire-authz.ts:30-31` | Camp 404: `captain`. |
| `isParticipantFacingActivation` (org-internal never leaks to the participant app) | `questionnaire-engine.ts:48-52` | **Delete** — one app, no split. |
| `isOrgDefinitionKey(key) = key.startsWith("org-")` and the `org-<slug>` key namespace | `queries.ts:34-36`, `actions.ts:63-71` | Camp 404 keys need no namespace prefix. |
| The whole org-internal-vs-outbound list split | `(console)/questionnaires/page.tsx:26-37`, `:96-121` | Collapse to one list. |
| `ConsoleGate` (a second gate for a second app) | `console-gate.tsx` | Camp 404 has one gate (`blocking-chrome.tsx`). |
| `buildAudienceContext` reading 7 tables incl. `groups`, `registrations`, `suppliers`, `projectRoles` | `queries.ts:412-495` | Replace with a Camp 404 `team_memberships` read. **Note: Camp 404 has no `team_memberships` write path (WP6 #130), so a team-scoped send resolves to zero — the same failure the donor's grant-requester selectors have.** |
| `apps/web/components/questionnaire/builder.tsx` `BuilderScope {canTargetEveryone, targetableRoleIds, mayBlock}` | `:75-82` | This is a *per-member permission scope* on a builder. Camp 404 has no such tier — collapse to captain-only. **But the pattern of rendering out-of-scope choices DISABLED with the reason next to them (`:70-73`, `:482-497`, `:547-553`) is worth keeping.** |

### 9.4 Direction-of-flow note

`schema.ts:1279-1281` and `docs/build-spec.md:115` both say this spine was "ported 1:1 from
Camp 404's pattern". So Builder v2 is **Camp 404's own engine, grown**. The delta below is a
re-import list, not a foreign port.

---

## 10. Verbatim excerpts — the five most valuable pieces

### 10.1 Forward-only branching + reachability (the thing that makes loops unrepresentable)

`packages/core/src/questionnaire-definition.ts:259-341`:

```ts
  // --- branch targets: must exist and point forward ------------------------
  const checkTarget = (
    target: string,
    fromIndex: number,
    path: string,
  ): boolean => {
    if (target === SUBMIT_TARGET) return true;
    const targetIndex = pageIndexById.get(target);
    if (targetIndex === undefined) {
      issues.push({
        path,
        code: "unknown_branch_target",
        message: `"${target}" is not a section in this questionnaire`,
      });
      return false;
    }
    if (targetIndex === fromIndex) {
      issues.push({
        path,
        code: "self_branch",
        message: "a section cannot branch to itself — that is an infinite loop",
      });
      return false;
    }
    if (targetIndex < fromIndex) {
      issues.push({
        path,
        code: "backward_branch",
        message: `"${target}" comes earlier in the questionnaire — branches must move forward so a respondent can never loop`,
      });
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
      if (checkTarget(page.next, pageIndex, `${pagePath}.next`)) {
        out.push(page.next);
      }
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
        issues.push({
          path: `pages[${pageIndex}]`,
          code: "unreachable_page",
          message: `section "${page.id}" can never be reached — no branch or fall-through leads to it`,
        });
      }
    });
  }
```

### 10.2 Branch-aware submit validation (the two-pass trick)

`packages/core/src/questionnaire-runtime.ts:185-238`:

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
  | {
      ok: true;
      responses: QuestionnaireResponses;
      progress: QuestionnaireProgress;
    }
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
  return {
    ok: true,
    responses,
    progress: deriveProgress(questionnaire, responses),
  };
}
```

### 10.3 Id-preserving type conversion (`convertBlock`)

`apps/org/components/questionnaires/block-kinds.ts:408-447`:

```ts
/**
 * Change a block's type in place. The id is PRESERVED — responses already
 * collected stay attached to it — as are prompt, helper, required and (where
 * both sides have them) options.
 */
export function convertBlock(block: PageBlock, kind: PaletteKind): PageBlock {
  const next = createBlock(kind, block.id);
  const prompt = isAnswerableBlock(block) ? block.prompt : "";
  const helper =
    isAnswerableBlock(block) && "helper" in block ? block.helper : undefined;
  const required =
    isAnswerableBlock(block) && "required" in block ? block.required : false;

  if (isAnswerableBlock(next)) {
    const carried: Question = { ...next, prompt, helper, required };
    if (
      (carried.kind === "single_select" || carried.kind === "multi_select") &&
      (block.kind === "single_select" || block.kind === "multi_select") &&
      block.options.length >= 2
    ) {
      // Branch targets are dropped: they are only legal on single choice, and
      // a converted question's options may no longer mean the same thing.
      return {
        ...carried,
        options: block.options.map((o) => ({
          value: o.value,
          label: o.label,
          ...(o.imageUrl ? { imageUrl: o.imageUrl } : {}),
          ...(o.imageAlt ? { imageAlt: o.imageAlt } : {}),
        })),
      };
    }
    return carried;
  }

  if (next.kind === "info_block") {
    return { ...next, heading: prompt || undefined, body: helper ?? "" };
  }
  return next;
}
```

Paired with the deliberate "empty required strings on purpose" factory
(`block-kinds.ts:286-291`): a brand-new block is created with `prompt: ""` because "the
validator flags them as issues, which is exactly the feedback an author should get before
saving."

### 10.4 Dotted-path issue routing — the thing that makes the validator *usable*

`apps/org/components/questionnaires/definition-issues.tsx:8-96`:

```ts
// Rendering for @quagga/core's `validateQuestionnaireDefinition` output.
//
// The validator addresses every defect with a DOTTED PATH into the definition
// — `pages[2].questions[0].options[1].goTo`. This module is the only place that
// knows how to read one, so the builder can hang each issue on the exact
// section / question / option it belongs to instead of dumping a wall of text.
//
// Two path dialects arrive here and both are handled:
//   - structural issues:  pages[2].questions[0].options[1]
//   - Zod shape issues:   pages.2.questions.0.prompt

export interface IssueLocation {
  pageIndex: number | null;
  blockIndex: number | null;
  optionIndex: number | null;
}

function segmentIndex(path: string, key: string): number | null {
  const match = new RegExp(`${key}(?:\\[(\\d+)\\]|\\.(\\d+))`).exec(path);
  if (!match) return null;
  const raw = match[1] ?? match[2];
  if (raw === undefined) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** Where in the definition an issue points. Nulls mean "not that specific". */
export function issueLocation(issue: DefinitionIssue): IssueLocation {
  return {
    pageIndex: segmentIndex(issue.path, "pages"),
    blockIndex: segmentIndex(issue.path, "questions"),
    optionIndex: segmentIndex(issue.path, "options"),
  };
}
```

### 10.5 The activation snapshot — one column that fixes an entire class of bug

`packages/db/src/schema.ts:1324-1334`:

```ts
    // The definition AS SENT, snapshotted at activation time. An activation must
    // render/validate/aggregate against exactly what its respondents were shown —
    // editing (or re-versioning) the live `questionnaire_definitions` row must
    // never mutate an in-flight or already-answered activation. Nullable so
    // pre-snapshot rows (activated before this column existed) fall back to the
    // live join at read time; no backfill required. Re-activation snapshots the
    // new version, which is correct.
    definition: jsonb("definition").$type<Questionnaire>(),
```

`packages/core/src/questionnaire-activation.ts:63-79`:

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

**Bonus, 10.6 — the atomic-send comment**, `apps/org/lib/questionnaires/actions.ts:355-358`:

> The activation row, its fanned-out required_actions and the audit row are one atomic unit —
> an activation must never exist without the required actions that make it reach its audience,
> and neither without the audit trail. A partial send would either strand recipients or gate them.

---

## 11. Gotchas

1. **`ON CONFLICT` against a partial unique index needs `targetWhere`.** Without it every
   questionnaire write fails outright with "there is no unique or exclusion constraint matching
   the ON CONFLICT specification" — a real production failure the donor records at
   `apps/org/lib/questionnaires/actions.ts:652-660`, caught only by an e2e run. Camp 404 does not
   have partial indexes here today; if a scoping column is ever added, this is the trap.
2. **Two sibling component directories with no rule.** `apps/org/components/questionnaire/`
   (runner-side) and `apps/org/components/questionnaires/` (builder-side) cross-import in both
   directions. The donor's own audit flags this (`docs/simplification-audit.md:295`). Do not
   copy the split.
3. **The org preview uses the TRIMMED console field renderer, not the full one.**
   `questionnaire-preview.tsx:183` imports `@/components/questionnaire/field` (401 lines), which
   does **not** render `display: "dropdown"`, `display: "image_grid"`, or `allowOther` at all
   (`apps/org/components/questionnaire/field.tsx:138-197`). So an author who builds an
   image-choice question with an "Other…" option previews it as **plain radio buttons with no
   Other row** — the preview's own promise ("This is exactly what a recipient sees") is false for
   those three affordances. The full renderer is `apps/web/components/questionnaire/field.tsx`
   (945 lines). If Camp 404 ports the preview, port the *full* renderer with it.
4. **No confirmation on any destructive builder action.** Remove block (`builder-v2.tsx:769`),
   remove section (`:676`), remove option (`block-editor.tsx:863`), remove grid row/column
   (`:1008`, `:1060`) — none confirm, none undo. Camp 404's WP1 (#125) already flags the same
   class of gap in its own builder; do not import this one.
5. **`GripVertical` is decorative, not draggable** (`block-editor.tsx:222-225`,
   `apps/web/components/questionnaire/builder.tsx:296`). Reordering is arrow buttons only. This
   is a UI that *promises something that isn't true* — the exact thing
   `CONTRIBUTING.md:62-71` calls "the single most common reason a change gets sent back".
6. **No `DragOverlay`, no keyboard sensor, no `prefers-reduced-motion`** anywhere in this unit.
   Camp 404's WP8 (#132) covers the same territory; the donor is no better.
7. **The definition's `version` is a text column bumped in place** — no immutable version table.
   Camp 404's `questionnaire_versions` is strictly better; keep Camp 404's and take only the
   *activation snapshot* idea.
8. **`saveDefinitionV2` swallows a failed status flip** (`builder-actions.ts:103-106`). A publish
   whose status update fails silently returns `{ok: true}` while the row stays `draft` — and a
   draft is then refused at send with a message that will read as nonsense to the author.
9. **`normalizeDefinition` overwrites the first questions-page title/subtitle** on every save
   (`actions.ts:90-105`). Any per-section title an author typed into section 1 is lost. The
   builder locks those inputs to compensate (`builder-v2.tsx:442`), but a definition arriving
   from anywhere else is silently rewritten.
10. **`YearsQuestion` hard-codes AfrikaBurn's calendar** — `2007..2026` minus `[2020, 2021]`, in
    the *validator*, not in config (`questionnaire.ts:189-201`). A generic engine with a
    domain-specific question kind welded in.
11. **`multi_select` silently drops unknown values** rather than erroring
    (`questionnaire.ts:637`, tested at `questionnaire-validate-one.test.ts:160`). Intentional and
    documented, but it means a client bug that posts stale option values loses data with no
    signal.
12. **`unreachable_page` only runs when there are no other issues** (`questionnaire-definition.ts:322`).
    A definition with one duplicate id will not also report its unreachable sections; fixing the
    first issue reveals a second wave. The panel's count is a floor, not a total.
13. **Results are gated on personal-information, and the gate withholds the WHOLE surface** —
    `[activationId]/page.tsx:151-183` refuses honestly rather than 404-ing or redacting, because
    "a 'who answered what' table with the who removed is not the same screen"
    (`queries.ts:308-322`). Camp 404 has no equivalent tier, but the *shape* of the refusal
    (name the reason, do not fake a redacted view) is worth importing.
14. **`getActivationResults` deliberately does NOT filter by `activation_id`**
    (`queries.ts:385-393`). Re-sending a questionnaire repoints the single answer row at the
    newest send, so filtering by activation made the *older* activation's results render
    "completed" with no answers. The real identity is `(person, questionnaire, edition)`.
15. **CSV download uses a synthetic `<a download>` click** — inert inside a Claude Artifact
    sandbox, fine in the app.
16. **`docs/simplification-audit.md:851`** records `flattenQuestions` (@quagga/types) and
    `allQuestions` (@quagga/core) as "the same function under two names", and `:868` records
    "two questionnaire response validators with overlapping names and no rule for which to call"
    (`validateResponses` vs `validateSubmission`). Both findings are **unapplied proposals**.
    Port one name for each, with a stated rule.

---

## 12. Notable patterns worth stealing even where the code is not

- **The engine is pure and the UI is a thin skin over it.** Branch resolution, progress,
  validation and shuffle all live in `packages/core`, and *three separate surfaces* — the author
  preview, the console runner and the participant runner — each delegate to the identical
  functions. `apps/org/components/questionnaire/runner.tsx:45-63` documents what happened when
  one of them didn't: it walked pages by index, so branching was ignored and content blocks were
  invisible on the one screen that blocks the whole console.
- **Validate client-side for placement, server-side for truth.** The builder runs the exact same
  `validateQuestionnaireDefinition` in a `useMemo` to place inline issues, and
  `builder-actions.ts` re-runs it as the boundary. "The builder runs the same validator
  client-side to place issues inline, but the UI is not the boundary" (`builder-actions.ts:16-20`).
- **Address every defect with a machine-readable path.** `{path, code, message}` with a dotted
  path is what lets one renderer put every issue in the right place without the validator knowing
  anything about React.
- **Allocate identity once; never re-derive it.** Question ids, option values, grid row ids and
  grid column values are all allocated at insert and shown read-only. Reorder moves the object.
  This single rule is what makes a live-editable definition safe over collected responses.
- **Snapshot what you sent.** One nullable jsonb column, a two-line resolver, and a test file
  that *proves the bug it prevents*.
- **Backward compatibility as a frozen fixture, not a promise.** `__fixtures__/questionnaire-v1.ts`
  with "DO NOT modernise this fixture" and an `unknown` type so it exercises the real parse path.
- **Exhaustiveness via a fixture array.** `KIND_SAMPLES` (`question-fixtures.ts:165-181`) exists
  because `validateOne` has no `default` arm — adding a kind without an arm returns `undefined`
  at runtime, silently. The test array is the compiler's missing check.
- **Every failure names its reason and its remedy.** "That questionnaire is still a draft. Finish
  it and publish it from the builder before sending — a draft would reach its audience
  half-written." Not "Forbidden".
- **Choose the capability before you parse.** `isEdit` is read off the raw input because "the
  capability has to be chosen before the parse" (`actions.ts:118-125`) — create and edit are
  different rights and must be asked as different questions.
- **Show out-of-scope choices disabled, with the reason, rather than hiding them**
  (`apps/web/components/questionnaire/builder.tsx:70-73`, `:493-497`, `:547-553`).
- **Degrade honestly on missing config.** No `BLOB_READ_WRITE_TOKEN` → the uploader renders its
  URL-paste fallback with a plain statement of why, "never a dropzone that silently does nothing"
  (`file-upload.tsx:27-30`).
- **The product holds itself to its own principle.** The builder's first element is a banner
  telling the author to ask fewer questions.
- **Comments that carry the incident.** The dialog scroll cap (`questionnaire-preview.tsx:217-221`),
  the mobile bar-row gutters (`results-view.tsx:421-424`), the e2e submit race
  (`questionnaire-build-activate-results.spec.ts:165-178`) — each explains a specific failure so
  it cannot be re-introduced by a "simplification".
