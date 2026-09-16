# Unit 03 — Questionnaire runner / fill / response-viewer UI (DONOR HARVEST)

DONOR: `/tmp/claude-1000/-home-ryan-repos-Personal-camp-404/845134f9-90e2-4e43-94d4-18d487ff8c56/scratchpad/ab-app` (quagga-portal / AfrikaBurn Contributors App)
TARGET: `/home/ryan/repos/Personal/camp-404` (Camp 404)
All paths below are DONOR-relative unless prefixed `camp-404/`.

---

## 1. Purpose

This subsystem is the **respondent-facing half** of the donor's questionnaire engine, plus the **author-facing read-back half**. It covers:

- the **runner** — the multi-step, branch-aware wizard a respondent walks;
- the **field renderers** — one control per question kind, 15 kinds;
- the **content-block renderers** — info/image blocks that take no answer;
- the **fill wrapper + route** — `/questionnaires/[activationId]`, which is BOTH the hard blocking gate and the ordinary navigable fill page;
- the **blocking-vs-optional treatment** — one badge component reused on every surface, plus the server-side gate spine;
- the **pending-questionnaire nudge** — the non-blocking dashboard card;
- the **save/resume machinery** — local-draft autosave, server prefill from the last stored answer, idempotent upsert on re-submit;
- the **response viewer** — per-respondent answer dialog (two forks: web + org);
- the **results view** — per-question aggregation charts + CSV export (org only).

The donor states outright that this spine was **"ported 1:1 from Camp 404's pattern"** (`docs/build-spec.md:115`) and then grew Builder-v2 features on top. So this unit is a **re-import candidate**: Camp 404 already owns the tables and the two-class (code vs builder) questionnaire model; the donor has grown branching, shuffle, grids, "Other…", content blocks, local draft autosave, off-page error recovery, snapshot-at-send, per-question aggregation, and CSV export on top of it.

Direct relevance to Camp 404's open backlog:

| Camp 404 gap | Donor asset that closes it |
|---|---|
| **Builder Phase E** (metrics + responses table + per-respondent view + CSV) — "zero code exists" | `packages/core/src/questionnaire-results.ts` (419 L) + `apps/org/components/questionnaires/results-view.tsx` (609 L) |
| **WP4 #128** — non-blocking sends reach nobody; no listing/notification path | `apps/web/components/questionnaire/pending-questionnaires.tsx` + `listPendingQuestionnaires()` + `questionnaireReleasedNotification()` |
| **WP4 #128** — `activation.blocking` not threaded into `BuilderRunner` | `apps/web/app/(app)/questionnaires/[activationId]/page.tsx:102` forks the whole page on `activation.blocking` |
| **WP4 #128** — no S27 completion screen | `page.tsx:66-89` "Already submitted" card (the closest donor equivalent — it is a *re-entry* state, not a post-submit celebration; see §10) |
| **WP1 #125** — breaking edits to published fields not rejected | `resolveActivationDefinition` snapshot-at-send makes the question moot (§4) |
| **WP10 #134** — no captain read-back surface for responses | `ResponseViewer` (two forks) + `ResultsView` |
| **WP7 #131** — zero `loading.tsx` | `apps/web/app/(app)/questionnaires/loading.tsx` + `packages/ui/src/components/skeleton.tsx` (9 exports) |
| **`opt_in` activation scope** hard-errored in Camp 404 | Donor does not solve this either — its `questionnaire_scope` enum is `everyone \| individual \| opt_in` (`schema.ts:254-258`) and nothing reads `opt_in`. Not harvestable. |

---

## 2. File inventory (line counts verified by `wc -l`)

### 2.1 Participant app — `apps/web`

| Path | L | Role |
|---|---:|---|
| `apps/web/components/questionnaire/runner.tsx` | 592 | **Runner v2** — trail-based wizard, branching, shuffle, progress rail, local draft autosave, off-page error recovery |
| `apps/web/components/questionnaire/field.tsx` | 945 | **15-kind field renderer** + ARIA labelable/composite split, grids, image options, "Other…" rows |
| `apps/web/components/questionnaire/fill.tsx` | 62 | Binds activation id → runner; derives the shuffle/draft seed |
| `apps/web/components/questionnaire/content-block.tsx` | 44 | `info_block` / `image_block` renderers |
| `apps/web/components/questionnaire/response-viewer.tsx` | 184 | Completion table + per-respondent answer dialog (camp/author side) |
| `apps/web/components/questionnaire/pending-questionnaires.tsx` | 88 | Non-blocking "Pending questionnaires (N)" card |
| `apps/web/components/questionnaire/blocking-badge.tsx` | 30 | `Required · blocks until done` / `Optional` |
| `apps/web/components/questionnaire/close-questionnaire-button.tsx` | 100 | Two-step recall control with an honest `refusal` prop |
| `apps/web/components/questionnaire/burns-step.tsx` | 403 | Bespoke AfrikaBurn bio step (camp-history typeahead, volunteering, rangers) |
| `apps/web/components/questionnaire/extras-state.ts` | 21 | `BioExtras` (nullable) → `BioExtrasState` (never null) |
| `apps/web/components/questionnaire/builder.tsx` | 584 | Camp-side builder (used by `/camps/[slug]/questionnaires/new`) — **out of scope for this unit** |
| `apps/web/lib/questionnaire-store.ts` | 784 | The whole persistence + activation service |
| `apps/web/lib/required-actions.ts` | 167 | Action-key → route registry, `listRequiredActions` gate query |
| `apps/web/lib/client-navigation.ts` | 55 | `navigateOnwards` — the deferred push/refresh fix |
| `apps/web/app/(app)/questionnaires/[activationId]/page.tsx` | 190 | Fill route: gate fork vs navigable fork vs already-submitted |
| `apps/web/app/(app)/questionnaires/[activationId]/actions.ts` | 29 | `submitQuestionnaireAction` |
| `apps/web/app/(app)/questionnaires/loading.tsx` | 23 | Skeleton |
| `apps/web/app/(app)/camps/[slug]/questionnaires/page.tsx` | 357 | Author list: per-activation completion bar, per-member rows, close control |
| `apps/web/app/(app)/camps/[slug]/questionnaires/actions.ts` | 236 | `createQuestionnaireAction`, `closeQuestionnaireAction` |
| `apps/web/app/(app)/camps/[slug]/questionnaires/[activationId]/page.tsx` | 142 | Camp results page |
| `apps/web/app/(app)/camps/[slug]/questionnaires/loading.tsx` | 31 | Skeleton |

### 2.2 Console app — `apps/org` (a partial FORK of the above; see §9)

| Path | L | Role |
|---|---:|---|
| `apps/org/components/questionnaire/runner.tsx` | 296 | Console runner — same core delegation, **no** privacy/burns/draft/rail; adds a last-resort off-page-error banner the web runner lacks |
| `apps/org/components/questionnaire/field.tsx` | 401 | Trimmed field fork — **no** `presentationOptions`, no PhoneInput, no Select dropdown, no ToggleGroup; `years` degrades to a comma-separated `<Input>` |
| `apps/org/components/questionnaire/content-block.tsx` | 49 | Byte-equivalent to the web one except comments |
| `apps/org/components/questionnaire/response-viewer.tsx` | 97 | Dialog-only fork (no table); flat `optionLabels` map instead of per-question lookup |
| `apps/org/components/questionnaire/blocking-badge.tsx` | 26 | Same idea, **different copy** ("Required — blocks the app until done") |
| `apps/org/components/questionnaire/console-gate.tsx` | 72 | Full-screen console takeover: brand + badge + runner + sign-out |
| `apps/org/components/questionnaire/activation-form.tsx` | 398 | Send screen: audience mode cards, live debounced resolved-count preview, blocking switch, due date |
| `apps/org/components/questionnaire/close-activation-button.tsx` | 37 | One-step close (no confirm) — weaker than the web fork |
| `apps/org/components/questionnaires/results-view.tsx` | 609 | Summary/Individual tabs, 7 chart shapes, orphan disclosure, CSV export |
| `apps/org/components/questionnaires/questionnaire-preview.tsx` | 201 | Author preview dialog reusing `nextPageId` + `QuestionField` |
| `apps/org/app/(console)/questionnaires/[key]/[activationId]/page.tsx` | 194 | Results page wiring |
| `apps/org/app/(console)/questionnaires/loading.tsx` | 26 | Skeleton |

### 2.3 Shared packages

| Path | L | Role |
|---|---:|---|
| `packages/types/src/questionnaire.ts` | 764 | 15 question kinds, 2 content blocks, 2 page kinds, `validateOne`, `validateResponses`, `flattenQuestions`, `pageQuestions`, `pageBlocks`, `isAnswerableBlock`, `OTHER_PREFIX` helpers, attended-year rules |
| `packages/core/src/questionnaire-runtime.ts` | 304 | `nextPageId`, `resolvePath`, `visibleQuestions`, `hasAnswer`, `deriveProgress`, `validateSubmission`, `allQuestions`, `presentationBlocks`, `presentationOptions` |
| `packages/core/src/questionnaire-results.ts` | 419 | `aggregateResponses`, `aggregateQuestion`, 7 chart-shaped aggregates, orphan answers |
| `packages/core/src/questionnaire-activation.ts` | 142 | `resolveActivationDefinition`, `activationRequiredActionKey`, `parseActivationActionKey`, `buildActivationRequiredActions`, `tallyActivationCompletion`, `isActivationResponseComplete` |
| `packages/core/src/questionnaire-engine.ts` | 52 | `BURNER_BIO_ACTION_KEY`, `firstBlockingAction`, `isParticipantFacingActivation` |
| `packages/core/src/questionnaire-definition.ts` | 350 | Author-side structural validation (11 issue codes) — belongs to the builder unit but the runner relies on its guarantees |
| `packages/core/src/questionnaire-authz.ts` | 143 | `canAuthorAudience`, `canViewActivationResults`, `canAuthorProjectQuestionnaire` — **heavily org/group-coupled** |
| `packages/types/src/audience.ts` | 313 | `AudienceSpec` 5-way union — **heavily org/group-coupled** |

### 2.4 Tests (all Vitest unless noted)

| Path | L | Notes |
|---|---:|---|
| `packages/core/src/__tests__/questionnaire-runtime.test.ts` | 607 | 35 `it()` — the branching/progress/submit contract |
| `packages/core/src/__tests__/questionnaire-results.test.ts` | 341 | 15 `it()` |
| `packages/core/src/__tests__/questionnaire-definition.test.ts` | 558 | |
| `packages/core/src/__tests__/questionnaire-authz.test.ts` | 194 | |
| `packages/core/src/__tests__/questionnaire-grid.test.ts` | 171 | |
| `packages/core/src/__tests__/questionnaire-snapshot.test.ts` | 171 | Snapshot-at-send |
| `packages/core/src/__tests__/questionnaire-activation.test.ts` | 111 | |
| `packages/core/src/__tests__/questionnaire-engine.test.ts` | 94 | |
| `packages/core/src/__fixtures__/questionnaire-v1.ts` | 163 | Pre-v2 definition, used to prove backward compatibility |
| `packages/types/src/__tests__/questionnaire-validate-one.test.ts` | 438 | 40 `it()` — the per-kind validation contract |
| `packages/types/src/__tests__/questionnaire-responses.test.ts` | 175 | |
| `packages/types/src/__tests__/questionnaire-text-format.test.ts` | 157 | |
| `packages/types/src/__tests__/questionnaire-grid.test.ts` | 100 | |
| `packages/types/src/__tests__/questionnaire-helpers.test.ts` | 83 | |
| `packages/types/src/__tests__/question-fixtures.ts` | 182 | Shared question fixtures |
| `apps/web/lib/__tests__/questionnaire-store.test.ts` | 778 | 38 `it()` — the store contract, fake-db driven |
| `apps/web/lib/__tests__/client-navigation.test.ts` | 51 | |
| `apps/org/lib/__tests__/questionnaire-actions.test.ts` | 570 | |
| `apps/org/lib/__tests__/questionnaire-queries.test.ts` | 498 | |
| `e2e/specs/camp-member/camp-member-blocking-questionnaire.spec.ts` | 93 | Playwright — gate traps, releases on submit |
| `e2e/specs/camp-member/camp-member-gate-released-by-close.spec.ts` | 118 | Playwright — gate releases on close |
| `e2e/specs/camp-member/camp-member-lifecycle.spec.ts` | 164 | |
| `e2e/specs/camp-member/camp-member-cross-camp-isolation.spec.ts` | 174 | |
| `e2e/specs/camp-member/camp-member-forbidden.spec.ts` | 155 | |
| `e2e/specs/camp-member/support.ts` | 80+ | UI-driving helpers, with a "Selector provenance (verified against source on 2026-07-26)" header |
| `e2e/specs/org-staff/questionnaire-build-activate-results.spec.ts` | 201 | |
| `e2e/specs/new-burner/onboarding-gate.spec.ts` | 73 | |

**Total in-scope source: ~7,500 lines of implementation + ~5,900 lines of test.**

---

## 3. Capability list (exhaustive, each cited)

### 3.1 Runner (`apps/web/components/questionnaire/runner.tsx`)

1. **Trail-based navigation, not index-based.** `const [trail, setTrail] = React.useState<Step[]>(…)` (`:114-122`); Back is `setTrail(prev => prev.slice(0, -1))` (`:477`). Because branching means "the page after this one depends on the answers", an index would rewind onto a page the respondent never walked (`:112-113`).
2. **Three step kinds:** `type Step = { kind: "page"; pageId: string } | { kind: "burns" } | { kind: "privacy" }` (`:89-90`).
3. **All navigation and completeness delegated to `@quagga/core`** — `nextPageId` (branching), `deriveProgress` (progress + branch-resolved path), `presentationBlocks` / `presentationOptions` (seeded shuffle), "so the client walks exactly the path the server re-derives at submit time" (`:33-39`).
4. **Local draft autosave.** Key `quagga:questionnaire-draft:${draftKey}` (`DRAFT_PREFIX = "quagga:questionnaire-draft:"`, `:44`), debounce `AUTOSAVE_DEBOUNCE_MS = 700` (`:45`). Hydrate-once guard `hydrated.current` (`:143-162`). **The draft is LOCAL only — nothing is sent to the server until submit, so no half-answers land in the response store** (`:139-141`). A corrupt/unavailable draft is swallowed and the form starts clean (`:159-161`). Cleared on final submit only (`:280` → `clearDraft()` at `:178-185`).
5. **Four save states:** `type SaveState = "idle" | "saving" | "saved" | "unsaved"` (`:92`). Rendered by `AutosaveIndicator` (`:510-529`): `idle` → nothing; `saving`/`unsaved` → spinner + "Saving…"; `saved` → check + **"Saved on this device"** with `title="Your answers are kept on this device until you submit."` — the "never claim something untrue" house rule in action.
6. **Two progress modes.** `answeredProgress` → `"${progress.answered} of ${progress.total} answered"` and `percent = round(answered/total*100)`; otherwise `"Step ${stepNumber} of ${totalSteps}"` and `percent = round(stepNumber/totalSteps*100)` (`:204-209`, `:381-388`). Empty questionnaire → `100` (`:209`).
7. **A step rail** with done/current/upcoming states, rendered only when `rail.length > 1` (`:333`). Labels come from `progress.path` so **a branch change reshapes the rail** (`buildRail`, `:556-574`). Tail entries are keyed `__burns__` / `__privacy__` (`:571-572`). Done steps show a `Check` icon; others the 1-based index (`:356-360`). Labels hidden below `sm` (`:364`).
8. **Client-side validation is the same `validateOne` the server runs.** `validatePage` (`:253-261`) — "same `validateOne` the server runs inside `validateSubmission`, so what passes here passes there" (`:250-252`).
9. **Setting a response clears that field's error** (`:242-247`) and flips `saveState` to `"unsaved"` (`:241`).
10. **Off-page server-error recovery.** On `!result.ok` the runner sets the errors, then `pageOwningError()` finds the first page owning a rejected question id and `jumpTo()`s it — "A server error on a question the respondent can't see is a dead end" (`:272-279`, `:578-592`). `jumpTo` rewinds the trail if the page was already walked, otherwise starts a fresh trail at it (`:293-300`).
11. **Two reserved error keys:** `FORM_ERROR_KEY = "_form"` (`:41`) and `_root` (the types-layer malformed-payload key). Both render as a `role="alert"` paragraph (`:462-466`) and both are excluded from `pageOwningError`'s id set (`:583`).
12. **Catch-all save failure copy:** `SAVE_FAILED = "We couldn't save your answers just now. Please try again in a moment."` (`:42-43`).
13. **`persistProgress`** (default `false`) — persist on every Next vs only on final submit (`:70-71`, `:311`).
14. **`fullWidthSubmit` / `soloSubmit`** — `soloSubmit = fullWidthSubmit && isLast && trail.length === 1` hides Back entirely and makes Submit full-width, stacking `flex-col-reverse sm:flex-row` on mobile (`:223`, `:473`, `:486`).
15. **Redirect or refresh after submit:** `redirectTo` → `navigateOnwards(router, redirectTo)`; else `router.refresh()` (`:321-324`).
16. **Content blocks render inline but are never answerable and never counted** (`:38-39`), enforced by `isAnswerableBlock(block)` at the render fork (`:444`).
17. **`intro` pages** render heading + body with no controls and no validation (`:420-426`).
18. **Section eyebrow** `Section {stepNumber} of {totalSteps}` above a questions page, only when `rail.length > 1` (`:430-434`).

### 3.2 Field renderer (`apps/web/components/questionnaire/field.tsx`)

19. **15 answerable kinds handled** in one `switch` with no `default:` (exhaustiveness is compile-checked): `short_text`, `email`, `phone`, `long_text`, `date`, `time`, `file_link`, `boolean`, `linear_scale`, `rating`, `single_select`, `multi_select`, `multi_choice_grid`, `checkbox_grid`, `years`.
20. **The labelable/composite ARIA split** (`isLabelableControl`, `:57-73`). Labelable: `short_text`, `email`, `phone`, `long_text`, `date`, `time`, and `single_select` **only when `display === "dropdown"`**. Everything else is a composite of buttons, so it gets `role="group"`/`role="radiogroup"` + `aria-labelledby` pointing at the prompt span. The comment records the defect this fixed: *"the prompt was on screen but was announced by nothing, clicking it focused nothing, and a screen-reader user heard 'Yes button / No button' with no idea what was being asked"* (`:48-56`).
21. **`aria-describedby` carries BOTH hint and error, in reading order** — `[helpId, errorId].filter(Boolean).join(" ")` (`:93`). The comment: *"Previously the error REPLACED the hint, so the one moment a respondent most needs 'dd/mm/yyyy' is the moment it stopped being announced"* (`:88-90`).
22. **Required marker is decorative + spoken.** `*` is `aria-hidden`; a labelable control gets `aria-required`, a composite gets a `<span className="sr-only"> (required)</span>` because *"`aria-required` is not valid on `role="group"`"* (`:104-111`).
23. **Errors are `role="alert"`** — *"nothing else tells a non-sighted respondent that Next didn't advance"* (`:143-145`).
24. **`inputTypeFor`** maps `short_text.format` → the HTML input type: `email`→`email`, `url`→`url`, `phone`→`tel`, `number`/`integer`→`number`, else `text`; `kind === "email"` → `email` (`:774-790`).
25. **`boolean`** is a Yes/No button pair with `aria-pressed`, `flex-1` each (`:230-256`) — **not** a switch, despite the type comment saying "rendered as a switch" (`questionnaire.ts:145`). Comment-vs-code drift.
26. **`linear_scale`** renders one circular radio per integer from `min` to `max` inclusive, with the number above and optional `minLabel`/`maxLabel` on a justified row below (`:258-317`).
27. **`rating`** — three glyphs (`star` | `heart` | `number`). Star/heart fill cumulatively (`on = current >= n`) with `aria-label={`${n} out of ${question.steps}`}`; `number` renders discrete boxes. Helper line: `"${current} out of ${steps}"` or `"Tap to rate — up to ${steps}"` (`:319-424`).
28. **`single_select` has three display variants** — `dropdown` (Radix Select), `image_grid` (2-col / `sm:`3-col grid of `ImageOption` with `role="radio"`), and the default radio rows with optional 48px option thumbnails (`:426-543`).
29. **`multi_select` has two variants** — `image_grid` and the default pill/chip row (`rounded-full border px-3 py-1.5`) with `aria-pressed` (`:545-643`).
30. **"Other…" encoding is uniform.** `OTHER_SENTINEL = "__other__"` is a **dropdown-only UI sentinel, never a stored value**; the stored value is always `other:<text>` (`:44-46`). `OtherChoiceRow` (`:876-916`) renders a selectable row plus, when selected, an `OtherInput` (`:918-937`) with `aria-label="Your other answer"` and placeholder `"Tell us more…"`. Multi-select `setOther` replaces any existing other-answer; `clearOther` removes it (`:562-570`).
31. **Selection-count hint** — `selectionHint(min, max)` → `"Pick {min}–{max} options."` / `"Pick at least {min}."` / `"Pick at most {max}."` / `null` (`:792-800`).
32. **Grid control** (`GridControl`, `:700-772`) — a real `<table>` with `<th scope="col">` / `<th scope="row">`, wrapped in `overflow-x-auto`. Cells are buttons with `role={single ? "radio" : "checkbox"}`, `aria-label={`${row.label}: ${column.label}`}`, round for single, square for multi. **Clicking the chosen column again clears the row** (`:731-733`); an empty row is `delete`d from the answer map rather than stored as `[]` (`:739-740`).
33. **`years`** uses Radix `ToggleGroup type="multiple"`; disabled years carry `aria-label={`${year} — no burn was held`}` + `title="No burn was held this year"` + a `no burn` caption (`:645-682`).
34. **`file_link`** wires `FileUpload` with `maxFiles={1}`, `maxSizeBytes={25 * 1024 * 1024}` (25 MB), `handleUploadUrl="/api/blob/upload"`, `kind="questionnaire-files"`, `variant="file"`, `hint="PDF, image, or document — up to 25 MB"`, `ariaLabel="Upload your file"` (`:211-228`). Degrades to a URL-paste field when `blobConfigured` is false.
35. **Option thumbnails use a raw `<img loading="lazy">`, deliberately**: *"Author-supplied remote URL — next/image would need host allowlisting we deliberately don't configure"* (`:802-815`, and the same at `content-block.tsx:29-30`).
36. **`ImageOption`** renders an `aspect-video` thumbnail or a `"No image"` placeholder, with a truncated label row (`:817-874`).

### 3.3 Fill wrapper + route

37. **The shuffle/draft seed is `${activationId}:${respondentSeed}`**, falling back to `activationId` alone (`fill.tsx:44-46`). Passed as BOTH `shuffleSeed` and `draftKey` (`:57-58`) — so the draft is per-person-per-activation and the order is stable across reloads.
38. **The fill route forks three ways** (`app/(app)/questionnaires/[activationId]/page.tsx`):
    - `actionStatus === "completed"` → "Already submitted" card (`:66-89`);
    - `activation.blocking` → gate layout: `BlockingBadge blocking`, `"{asker} asks:"`, the runner in `gate` mode, and a lock line *"You can't use the portal until this is done — it only takes a couple of minutes."* (`:102-158`);
    - otherwise → normal navigable page with full chrome (`:162-189`).
39. **Hard-gate ordering.** Before rendering, the page asks `pendingBlockingRoute(user.id)`; if an EARLIER blocking action is pending it redirects there instead — `if (gate && gate !== `/questionnaires/${activationId}`) redirect(gate)` (`:55-59`). This is what makes a queue of blocking questionnaires walk in creation order.
40. **The stripped gate chrome is the LAYOUT's job, not the page's.** `(app)/layout.tsx:46` calls `viewerIsGated()` and passes `gatedNav` to `AppShell`. The comment records the regression: the gate page used to draw its own header, and once `AppShell` was hoisted into the layout it rendered *"the FULL participant nav — Directory, Create camp, Profile, Account — above its own minimal header. Two headers, and precisely the nav the comment promised was absent"* (`page.tsx:94-101`).
41. **Post-gate destination depends on a pending invite** — `INVITE_RESUME_PATH` when one is waiting, else `/directory` (`:106-108`).
42. **`authorName()`** — `authoredScope === "org" || !groupId` → `"AfrikaBurn"`, else the group's name, else `"Your camp"` (`:27-37`).
43. **`blobConfigured={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}`** threaded server→client (`:145`, `:185`) — honest degradation, an AGENTS.md hard rule.

### 3.4 Blocking vs non-blocking

44. **One badge, every surface.** *"Blocking status must be explicit EVERYWHERE a questionnaire is shown … a required one is a hard gate; an optional one never impedes navigation. This one badge is reused on pending cards, list rows, the fill page, and the author's views so the treatment is identical across every surface"* (`blocking-badge.tsx:4-8`). Copy: `Required · blocks until done` (destructive + `AlertTriangle`) / `Optional` (outline + `Circle`).
45. **The gate spine.** `firstBlockingAction()` returns the first `blocking && status === "pending"` action in input order (`questionnaire-engine.ts:30-37`); `listRequiredActions` orders by `createdAt asc` (`required-actions.ts:154`); `pendingBlockingRoute` maps its key through `actionRoute()` with a `"/onboarding"` fallback for an unroutable key (`session.ts:210-216`).
46. **A closed activation MUST release its gate.** `listRequiredActions` LEFT JOINs the activation and computes `blocking: blocking && (activationStatus === null || activationStatus === "open")` (`required-actions.ts:163-165`). The 11-line comment above it (`:128-137`) explains the bug: *"a closed questionnaire went on hard-gating every recipient out of the whole app with no way back. 'Close' is the ONLY undo for a mis-sent blocking send; it has to mean it."* Read at query time rather than by expiring rows *"so it is also right for rows written before the fix, and so reopening an activation restores the gate rather than needing a second migration of state."* A `null` activationStatus (the code-side Burner Bio) keeps blocking.
47. **Close ALSO expires pending rows.** `closeQuestionnaireAction` does both in one transaction — activation → `closed` + `closedAt`, and every still-`pending` `required_actions` row for it → `expired` (`camps/[slug]/questionnaires/actions.ts:214-232`). Completed rows are left alone: *"answers already given stay, and the results view keeps showing them"* (`:152-153`). Idempotent: closing an already-closed one is a no-op, *"so a double-click or a stale page can't produce a scary message"* (`:212-213`).
48. **Both belts.** So the gate is released by TWO independent mechanisms — the query-time join (46) and the row expiry (47) — and there is a dedicated e2e spec whose header says deleting the join filter *"would leave every other questionnaire spec green while every recipient of a closed blocking send stayed locked out of the app permanently"* (`e2e/specs/camp-member/camp-member-gate-released-by-close.spec.ts:9-18`).
49. **Recall is two-step and states the consequence.** `CloseQuestionnaireButton` (`close-questionnaire-button.tsx`) needs a confirm click, and the confirm copy forks on blocking: `"Close it? Recipients stop being blocked and can no longer answer."` vs `"Close it? Nobody will be able to answer after this."` (`:78-80`). Success toast: `"Questionnaire closed"` / `"Nobody still has to answer it. Answers already given are kept."` (`:53-56`).
50. **`refusal` prop — restricted, not hidden.** *"`refusal` is the honest reason the viewer may not close this one (see the owner's rule: restricted, not hidden). Passing it disables the button and prints the reason beside it rather than making the control disappear"* (`:15-18`, rendered `:37-47`). The camp page computes it per row through the SAME predicate the send ran (`camps/[slug]/questionnaires/page.tsx:132-158`).
51. **The console gate is the same pattern applied to `apps/org`** — `getConsoleBlockingQuestionnaire` filters `blocking = true`, `status = 'pending'`, `authoredScope = 'org'`, **`questionnaireActivations.status = 'open'`** (`apps/org/lib/questionnaires/queries.ts:541-555`, with a comment pointing at the web twin), then picks the first row whose `audience.kind === "org_internal"` (`:558-561`). `ConsoleGate` renders a `min-h-svh` full-screen takeover with only the runner and sign-out reachable.
52. **Org-internal never leaks into the participant app.** `isParticipantFacingActivation(audience)` returns `audience?.kind !== "org_internal"` (`questionnaire-engine.ts:48-52`), enforced in FOUR places: `listRequiredActions` (`required-actions.ts:156`), `getFillView` (`questionnaire-store.ts:570`), `listPendingQuestionnaires` (`:667`), and defensively in `submitResponse` (`:686-692`). A row with no audience (the code-side Burner Bio) is participant-facing.

### 3.5 Pending-questionnaire nudge

53. **`PendingQuestionnaires`** renders nothing when `items.length === 0` (`:38`); header `"Pending questionnaires ({items.length})"`; description *"Questions waiting for your answer, from your camps and AfrikaBurn."* (`:42-48`).
54. **Per-row: title, `BlockingBadge`, optional due date, and a CTA whose label and variant fork on blocking** — `default`/`"Complete now"` vs `secondary`/`"Answer"` (`:72-80`).
55. **Due date formatting is defensive** — `formatDue` wraps `toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })` in try/catch, returning `null` on throw (`:14-25`).
56. **It still shows the Required badge even though blocking ones normally never reach it** — *"Blocking ones normally gate the app before this renders, but any that reach here still carry the explicit Required badge"* (`:29-31`).
57. **`listPendingQuestionnaires`** (`questionnaire-store.ts:626-673`) selects `required_actions` where `type = 'questionnaire' AND status = 'pending'`, ordered `createdAt desc`, LEFT JOINs the activation for its audience, drops org-internal, and drops any key `parseActivationActionKey` can't parse — *"skips the code-side Burner Bio action"* (`:668`).
58. **An in-app notification is written on send, INDEPENDENT of email.** `notifyTargets` (`questionnaire-store.ts:224-311`) writes `insertNotifications` FIRST, with the comment: *"Activation used to write `required_actions` plus an email and nothing else — so with no Resend key … a targeted member got no signal at all beyond a gate that silently appeared in front of them. The inbox row is the delivery that always works."* (`:253-260`). The notification write is try/caught so it *"never fail[s] an activation that already committed"* (`:288-290`).
59. **Notification copy forks on blocking** — `questionnaireReleasedNotification` (`packages/core/src/notifications.ts:91-106`) yields `"New questionnaire from {from}: {title} — REQUIRED, blocks registration"` vs `"New questionnaire from {from}: {title}"`, `link = /questionnaires/{activationId}`, `from` defaults to `"AfrikaBurn"`.
60. **Email copy forks too** — `"It's required — it blocks the app until you complete it."` vs `"It's optional, but the camp would appreciate your answer."`; subject `"Please complete: {title}"` (`questionnaire-store.ts:298-311`).
61. **The camp send is attributed as `origin: "camp"`** — *"A CAMP sent this, not AfrikaBurn — that distinction is the whole point of `origin`"* (`:274-281`).

### 3.6 Save / resume / prefill

62. **Three independent save layers.** (a) `localStorage` draft, per respondent per activation, never sent to the server (see 4); (b) server **prefill** from the last stored answer; (c) the **upsert** so a re-submit revises the same living answer.
63. **Prefill is scoped to the activation's edition but NOT to the activation id.** *"Deliberately NOT filtered by activation id: within one edition a re-send is the same living answer, so the person sees what they said last time rather than a blank form. Across editions the answer is a different row entirely … without it, a 2028 send would prefill with the 2027 answer."* (`questionnaire-store.ts:585-592`). Falls back to the active edition for a pre-feature activation (`:594`), and returns `{}` rather than failing when no edition exists at all (`:611`).
64. **Results reads have the same rule.** `getActivationResults` filters answers on the **activation's own edition, not the caller's active one** — *"otherwise viewing a past edition's activation from a page that passes the current edition would blank every answer"* (`:499-508`) — and deliberately has **NO activation-id filter**: *"filtering on it made the earlier send's results render blank the moment anyone answered the later one. Answers belong to (person, questionnaire, edition)"* (`:511-516`).
65. **Idempotent submit via a partial-index upsert.** See §5 for the exact digits — this is the single most transferable bug-avoidance lesson in the unit.

### 3.7 Response viewer + results

66. **`ResponseViewer` (web fork)** — a 3-column table (Member / Status / Response) plus a per-row dialog. Status badges: `completed` → success + `CheckCircle2` "Completed"; **`expired` → outline + `Lock` "Recalled"** (*"Closing the questionnaire expires everyone who hadn't answered. They are not 'pending' — nothing is waiting on them"*, `:107-109`); else outline + `Clock` "Pending". The View button appears only when `done && r.responses` (`:132`).
67. **Value → label mapping** handles select options, grid row/column labels (`"{row}: {colA, colB}"` joined by `" · "`), booleans → `"Yes"`/`"No"`, arrays → comma-joined, blanks → `"—"` (`:55-92`).
68. **The dialog is height-capped, with the answer list scrolling inside.** `DialogContent className="max-h-[85svh]"` + `<dl className="… max-h-[60svh] overflow-y-auto">`. The comment records the defect: *"a long response grew off BOTH ends of the viewport with nothing to scroll — Radix locks the page behind a modal, and the dialog itself had no overflow. A twenty-question response was therefore partly unreadable."* (`:155-160`, `:161`, `:170`).
69. **`ResultsView` (org)** — Summary / Individual tabs with the CSV button in the tab bar (`:83-93`). Seven chart shapes labelled by `CHART_LABEL`: `choice` "Choice", `scale` "Linear scale", `rating` "Rating", `boolean` "Yes / No", `timeline` "Dates & times", `text` "Text answers", `grid` "Grid" (`:61-69`).
70. **Every number comes from `@quagga/core`** — *"nothing is counted here. This module only decides which shape each aggregate deserves"* (`:35-42`).
71. **Per-shape rendering:** choice → `BarRow` per option + an "Other…" answers panel; boolean → two BarRows (No's percent is `round((100 - percentYes) * 10) / 10`); scale → a 160px `Histogram` + min/avg/max footer; rating → BarRows **reversed** (highest star first) + `"Average {avg} out of {steps}"`; timeline → BarRows + `"Earliest {x} · latest {y}"`; text → `TextAnswers` (first 5, then `"View all {n} answers"`); grid → per-row blocks with `"{n} responses"` and `"Nobody answered this row."`.
72. **`BarRow` is responsive by design.** Fixed 160px label + 112px count gutters at `md:`; below `md` the label goes full width above the bar. The comment: *"On a 360px phone those same widths (160 + 112 + gaps) left the track ~24px — invisible"* (`:411-414`).
73. **Empty states are honest, per aggregate** — `"Nobody answered this question."` when `responded === 0` (`:245-251`), `"No one has submitted answers yet — there is nothing to summarise."` for the whole summary (`:98-102`).
74. **Orphan disclosure.** When an author deletes a question after answers came in, `OrphanDisclosure` renders a warning panel naming each orphaned question id and its answer count, with the copy *"These answers are still stored against the response — they just have no question to chart any more."* (`:179-220`).
75. **CSV export** (`:505-608`) — header `["Recipient", "Status", "Completed", ...questions.map(q => q.prompt)]`; every cell double-quoted with `"` doubled (`csvCell`, `:551-553`); `\r\n` line endings; **a `﻿` BOM** *"so Excel opens UTF-8 answers correctly"* (`:584-587`); filename `${exportName}.csv` where `exportName = ${questionnaireKey}-${activationId.slice(0,8)}` (`org .../[activationId]/page.tsx:111`); button disabled when `rows.length === 0`.
76. **CSV value formatting** (`formatCell`, `:553-549`… precisely `:558-583`): booleans → `Yes`/`No`; arrays joined with `"; "`; grids → `"Row: ColA, ColB | Row2: …"`; an "Other…" answer → `"Other: {text}"`; option values mapped through a **namespaced** label map keyed `${q.id}:${value}` / `${q.id}:row:${rowId}` / `${q.id}:col:${colValue}` (`optionLabelMap`, `:507-521`) — note the org `ResponseViewer` uses a FLAT map instead, which can collide across questions (see §10).

### 3.8 Author preview

77. **`QuestionnairePreview`** (org) reuses `nextPageId` + the console's own `QuestionField` + `ContentBlockView`, so *"what the author sees here is what a recipient actually gets"* (`:25-34`). Nothing is persisted; the walk remounts fresh on each open (`{open ? <PreviewRunner/> : null}`, `:70`). Terminal state is a `"End of questionnaire"` badge + `"Start over"`. Same height-cap lesson as the response dialog (`:56-60`).

---

## 4. Data model (verbatim)

### 4.1 Enums — `packages/db/src/schema.ts`

```ts
export const requiredActionTypeEnum = pgEnum("required_action_type", [
  "questionnaire", "acknowledgement", "payment", "profile_update",
]);                                                             // :240-245

export const requiredActionStatusEnum = pgEnum("required_action_status", [
  "pending", "completed", "waived", "expired",
]);                                                             // :247-252

export const questionnaireScopeEnum = pgEnum("questionnaire_scope", [
  "everyone", "individual", "opt_in",
]);                                                             // :254-258

export const activationStatusEnum = pgEnum("activation_status", [
  "draft", "open", "closed",
]);                                                             // :260-264

export const questionnaireStatusEnum = pgEnum("questionnaire_status", [
  "draft", "published", "unpublished",
]);                                                             // :266-270

export const questionnaireAuthoredScopeEnum = pgEnum(
  "questionnaire_authored_scope", ["org", "group"],
);                                                              // :274-277
```

**Delta vs Camp 404:** `required_action_type` and `required_action_status` are **identical** to Camp 404 (`camp-404/packages/db/src/schema.ts:118`, `:125`). `activation_status` and `questionnaire_status` are **identical**. `questionnaire_scope` DIFFERS: donor `[everyone, individual, opt_in]` vs Camp 404 `[everyone, team, team_leads, individual, opt_in]` — Camp 404's extra members are its team model, the donor expresses the same thing through `audience` jsonb. `questionnaire_authored_scope` has **no Camp 404 counterpart and must be dropped** (it exists only for the org/participant split).

### 4.2 `questionnaire_definitions` (`:1284-1296`)

```
key                 text        PRIMARY KEY
title               text        NOT NULL
definition          jsonb       $type<Questionnaire>  NOT NULL
status              questionnaire_status  NOT NULL DEFAULT 'draft'
version             text        (nullable)
created_by_user_id  uuid        → users.id  ON DELETE SET NULL
created_at          timestamp   NOT NULL DEFAULT now()
updated_at          timestamp   NOT NULL DEFAULT now()
```

Camp 404 splits this into a head (`questionnaire_definitions`) plus immutable `questionnaire_versions` snapshots; the donor keeps ONE row and snapshots on the ACTIVATION instead (below). Both solve the same problem.

### 4.3 `questionnaire_activations` (`:1297-1346`)

```
id                    uuid PK DEFAULT random
questionnaire_key     text        NOT NULL
version               text        NOT NULL
title                 text        NOT NULL
description           text
scope                 questionnaire_scope   NOT NULL DEFAULT 'everyone'
blocking              boolean     NOT NULL DEFAULT true
status                activation_status     NOT NULL DEFAULT 'draft'
due_at                timestamp
authored_scope        questionnaire_authored_scope NOT NULL DEFAULT 'org'   ← ORG SPLIT
group_id              uuid → groups.id ON DELETE CASCADE                    ← TENANCY
edition_id            uuid → editions.id ON DELETE CASCADE                  ← EDITION DIM
audience              jsonb $type<AudienceSpec>                             ← ORG SPLIT
definition            jsonb $type<Questionnaire>   ← THE SNAPSHOT AS SENT
activated_by_user_id  uuid → users.id ON DELETE SET NULL
opened_at             timestamp
closed_at             timestamp
created_at / updated_at  timestamp NOT NULL DEFAULT now()

indexes: questionnaire_activations_key_idx(questionnaire_key)
         questionnaire_activations_status_idx(status)
         questionnaire_activations_group_idx(group_id)
         questionnaire_activations_edition_idx(edition_id)
```

The `definition` snapshot comment is the load-bearing part (`:1327-1335`):
> *"The definition AS SENT, snapshotted at activation time. An activation must render/validate/aggregate against exactly what its respondents were shown — editing (or re-versioning) the live `questionnaire_definitions` row must never mutate an in-flight or already-answered activation. Nullable so pre-snapshot rows … fall back to the live join at read time; no backfill required. Re-activation snapshots the new version, which is correct."*

### 4.4 `questionnaire_responses` (`:1348-1441`)

```
id                  uuid PK DEFAULT random
user_id             uuid NOT NULL → users.id ON DELETE CASCADE
definition_key      text NOT NULL
edition_id          uuid NOT NULL → editions.id ON DELETE CASCADE      ← EDITION DIM
definition_version  text NOT NULL
responses           jsonb $type<QuestionnaireResponses> NOT NULL DEFAULT {}
activation_id       uuid → questionnaire_activations.id ON DELETE SET NULL
group_id            uuid → groups.id ON DELETE CASCADE                 ← TENANCY (Form 2)
completed_at        timestamp
updated_at          timestamp NOT NULL DEFAULT now()

TWO PARTIAL UNIQUE INDEXES:
  questionnaire_responses_user_def_idx
    ON (user_id, definition_key, edition_id)  WHERE group_id IS NULL
  questionnaire_responses_user_def_group_idx
    ON (user_id, definition_key, edition_id, group_id)  WHERE group_id IS NOT NULL
  questionnaire_responses_def_idx      ON (definition_key)
  questionnaire_responses_group_idx    ON (group_id, definition_key)
```

The two-partial-index decision, verbatim (`:1424-1431`):
> *"TWO PARTIAL INDEXES rather than one widened index, because Postgres treats NULLs as DISTINCT in a unique index: adding `group_id` to the existing one would have quietly allowed unlimited duplicate Burner Bio rows per person. Splitting them states the rule instead of relying on a NULL subtlety."*

Camp 404's equivalent is a single `questionnaire_responses_user_def_idx` on user×definition. **If Camp 404 ever adds a second scoping column, this is the trap to avoid.**

### 4.5 `required_actions` (`:1443-1487`)

```
id            uuid PK DEFAULT random
user_id       uuid NOT NULL → users.id ON DELETE CASCADE
edition_id    uuid NOT NULL → editions.id ON DELETE CASCADE      ← EDITION DIM
type          required_action_type NOT NULL
action_key    text NOT NULL
version       text
activation_id uuid → questionnaire_activations.id ON DELETE SET NULL
title         text NOT NULL
blocking      boolean NOT NULL DEFAULT true
status        required_action_status NOT NULL DEFAULT 'pending'
due_at        timestamp
created_at    timestamp NOT NULL DEFAULT now()
completed_at  timestamp

required_actions_user_edition_action_idx  UNIQUE (user_id, edition_id, action_key)
required_actions_user_status_idx          (user_id, status)
```

The index-column-order note (`:1481-1482`): *"The edition sits in the MIDDLE so the index still serves a lookup by user alone (`listRequiredActions`) on its leading column."*

The 20-line comment above the table (`:1423-1442`) is the donor's most valuable schema lesson and applies **directly** to Camp 404, which is currently keyed `(user, action_key)`-equivalent:
> *"while the key was (user, action_key) there could only ever be ONE such row per person, FOREVER: completed for 2027, still completed in 2028, `ensureRequiredAction`'s ON CONFLICT DO NOTHING silently discarding the new edition's row. The gate fired once in a burner's lifetime and then never again, and nothing anywhere reported that."*

**Camp 404 has no `editions` table and one camp** — but it DOES have a recurring annual burn. The analogue is a `burn_year` / `season` discriminator. See §9.

### 4.6 Action-key convention

`questionnaire:<activation_uuid>` — built by `activationRequiredActionKey` (`questionnaire-activation.ts:31-33`), parsed by `parseActivationActionKey` (`:37-42`, returns `null` for a non-questionnaire key OR an empty suffix). Camp 404 already has the same idea in `required_actions.activationId` + `nextGate` — the donor's *string-key* convention is the more portable version because it survives a null FK.

---

## 5. Public API surface (verbatim signatures)

### `@quagga/types` — `packages/types/src/questionnaire.ts`

```ts
export const SUBMIT_TARGET = "__submit__";                                    // :22
export const OTHER_PREFIX = "other:";                                          // :29
export function isOtherAnswer(value: string): boolean;                         // :32
export function otherAnswerText(value: string): string;                        // :37
export function toOtherAnswer(text: string): string;                           // :42

export const TextFormat = z.enum([
  "text","email","url","phone","number","integer","alphanumeric",
]);                                                                            // :49-57
export const ChoiceDisplay      = z.enum(["radio","dropdown","image_grid"]);   // :63
export const MultiChoiceDisplay = z.enum(["checkbox","image_grid"]);           // :66

export const ATTENDED_YEAR_MIN = 2007;                                         // :180
export const ATTENDED_YEAR_MAX = 2026;                                         // :181
export const NO_BURN_YEARS: readonly number[] = [2020, 2021];                  // :182
export function isValidAttendedYear(year: number): boolean;                    // :185
export function attendedYearOptions(): { year: number; disabled: boolean }[];  // :198

export function isAnswerableBlock(block: PageBlock): block is Question;        // :400
export type SaveResult = { ok: true } | { ok: false; errors: Record<string,string> }; // :405-406

export function flattenQuestions(questionnaire: Questionnaire): Question[];    // :480
export function pageQuestions(page: QuestionnairePage): Question[];            // :490
export function pageBlocks(page: QuestionnairePage): PageBlock[];              // :496

export function validateResponses(questionnaire: Questionnaire, raw: unknown):
  | { ok: true; responses: QuestionnaireResponses }
  | { ok: false; errors: Record<string, string> };                             // :505

export function validateOne(q: Question, raw: unknown):
  | { ok: true; value: QuestionnaireResponseValue | undefined }
  | { ok: false; error: string };                                              // :568
```

Type unions:
```ts
export const Question = z.discriminatedUnion("kind", [
  SingleSelectQuestion, MultiSelectQuestion, ShortTextQuestion, LongTextQuestion,
  DateQuestion, BooleanQuestion, EmailQuestion, PhoneQuestion, YearsQuestion,
  LinearScaleQuestion, RatingQuestion, TimeQuestion, FileLinkQuestion,
  MultiChoiceGridQuestion, CheckboxGridQuestion,
]);                                                                            // :335-351
export const ContentBlock = z.discriminatedUnion("kind", [InfoBlock, ImageBlock]); // :382
export const PageBlock = z.union([Question, ContentBlock]);                    // :390
export const QuestionnairePage = z.discriminatedUnion("kind", [QuestionsPage, IntroPage]); // :435
export const Questionnaire = z.object({ version: z.string().min(1), pages: z.array(QuestionnairePage).min(1) }); // :441
export const GridAnswer = z.record(z.string(), z.array(z.string()));           // :448
export const QuestionnaireResponseValue = z.union([
  z.number(), z.string(), z.array(z.string()), z.boolean(), GridAnswer, z.null(),
]);                                                                            // :455-462
export const QuestionnaireResponses = z.record(z.string(), QuestionnaireResponseValue); // :467
export const QuestionnaireFieldChange = z.object({
  fieldId: z.string().min(1), label: z.string(), from: z.string(), to: z.string(),
});                                                                            // :472-476
```

### `@quagga/core` — `packages/core/src/questionnaire-runtime.ts`

```ts
export function pageById(questionnaire: Questionnaire, pageId: string): QuestionnairePage | null;      // :28
export function nextPageId(questionnaire: Questionnaire, pageId: string,
                           responses: QuestionnaireResponses): string | null;                          // :39
export function resolvePath(questionnaire: Questionnaire,
                            responses: QuestionnaireResponses): string[];                              // :79
export function visibleQuestions(questionnaire: Questionnaire,
                                 responses: QuestionnaireResponses): Question[];                       // :97
export function hasAnswer(question: Question, value: unknown): boolean;                                // :110

export interface QuestionnaireProgress {
  path: string[]; pageIndex: number; pageCount: number;
  answered: number; total: number;
  requiredAnswered: number; requiredTotal: number;
  percent: number; complete: boolean;
}                                                                                                      // :121-136

export function deriveProgress(questionnaire: Questionnaire,
                               responses: QuestionnaireResponses,
                               currentPageId?: string): QuestionnaireProgress;                         // :138
export function validateSubmission(questionnaire: Questionnaire, raw: unknown):
  | { ok: true; responses: QuestionnaireResponses; progress: QuestionnaireProgress }
  | { ok: false; errors: Record<string, string> };                                                     // :195
export function allQuestions(questionnaire: Questionnaire): Question[];                                // :241
export function presentationBlocks(page: QuestionnairePage, seed: string): PageBlock[];                // :283
export function presentationOptions(question: Question, seed: string): QuestionOption[];               // :295
```

### `@quagga/core` — `questionnaire-results.ts`

```ts
export interface OptionTally { value: string; label: string; count: number; percent: number; }   // :29
export interface OtherTally  { text: string; count: number; }                                    // :37
export interface ScaleBucket { value: number; count: number; percent: number; }                  // :43
export type QuestionAggregate = /* 7-arm union discriminated on `chart` */                       // :61-115
export interface OrphanAnswers { questionId: string; count: number; }                            // :119
export interface QuestionnaireResults {
  totalResponses: number; questions: QuestionAggregate[]; orphans: OrphanAnswers[];
}                                                                                                // :124-128
export function aggregateResponses(questionnaire: Questionnaire,
                                   responses: readonly QuestionnaireResponses[]): QuestionnaireResults; // :389
export function aggregateQuestion(question: Question,
                                  responses: readonly QuestionnaireResponses[]): QuestionAggregate;     // :414
```

### `@quagga/core` — `questionnaire-activation.ts` / `questionnaire-engine.ts`

```ts
export function resolveActivationDefinition<T>(snapshot: T | null | undefined, liveFallback: T): T;  // act:22
export function activationRequiredActionKey(activationId: string): string;                           // act:31
export function parseActivationActionKey(actionKey: string): string | null;                          // act:37
export function buildActivationRequiredActions(activation: ActivationLike,
                                               userIds: readonly string[]): RequiredActionInsert[];  // act:69
export function completeRequiredAction(now: Date = new Date()): RequiredActionCompletion;            // act:100
export function isActivationResponseComplete(activationId: string,
                                             response: ResponseLike | null | undefined): boolean;    // act:113
export function tallyActivationCompletion(actions: readonly { status: string }[]): ActivationCompletion; // act:136

export const BURNER_BIO_ACTION_KEY = "burner_bio";                                                   // eng:18
export interface RequiredActionLike {
  actionKey: string; blocking: boolean;
  status: "pending" | "completed" | "waived" | "expired";
}                                                                                                    // eng:21-25
export function firstBlockingAction<T extends RequiredActionLike>(actions: readonly T[]): T | null;  // eng:30
export function isParticipantFacingActivation(audience: AudienceSpec | null | undefined): boolean;   // eng:48
```

### `apps/web/lib/questionnaire-store.ts`

```ts
export function isProjectDefinitionKey(key: string, groupId: string): boolean;                       // :48
export async function createAndActivateProjectQuestionnaire(
  input: CreateProjectQuestionnaireInput): Promise<CreateProjectQuestionnaireResult>;                 // :77
export async function listProjectQuestionnaires(groupId: string): Promise<ProjectQuestionnaireListItem[]>; // :328
export async function getActivation(activationId: string): Promise<ActivationRow | null>;            // :406
export async function getActivationResults(activationId: string,
                                           _editionId: string): Promise<ActivationResults | null>;   // :471
export async function getFillView(activationId: string, userId: string): Promise<FillView | null>;   // :562
export async function listPendingQuestionnaires(userId: string): Promise<PendingQuestionnaire[]>;    // :633
export async function submitResponse(input: {
  userId: string; activationId: string; rawResponses: unknown;
}): Promise<SaveResult>;                                                                             // :680

export interface FillView {
  activation: ActivationRow;
  actionStatus: "pending" | "completed" | "waived" | "expired" | null;
  initialResponses: QuestionnaireResponses;
}                                                                                                    // :554-559
export interface PendingQuestionnaire {
  activationId: string; title: string; blocking: boolean; dueAt: Date | null;
}                                                                                                    // :620-625
```

### `apps/web/lib/required-actions.ts` / `session.ts`

```ts
export function actionRoute(actionKey: string): string | null;                                       // ra:26
export async function ensureRequiredAction(input: {
  userId: string; editionId: string; actionKey: string;
  type: "questionnaire" | "acknowledgement" | "payment" | "profile_update";
  title: string; blocking?: boolean;
}): Promise<void>;                                                                                   // ra:43
export async function completeRequiredAction(userId: string, editionId: string,
                                             actionKey: string): Promise<void>;                      // ra:79
export const listRequiredActions = cache(async function listRequiredActions(
  userId: string): Promise<RequiredActionLike[]>);                                                   // ra:109

export async function pendingBlockingRoute(userId: string): Promise<string | null>;                  // se:210
export async function viewerIsGated(): Promise<boolean>;                                             // se:235
export async function enforceGate(userId: string, currentPath?: string): Promise<void>;              // se:247
export async function requireOnboardedUser(): Promise<CampUser>;                                     // se:260
```

### Runner component props

```ts
export type RunnerAction = (
  responses: QuestionnaireResponses,
  privacyFlags: Record<string, boolean> | null,
  final: boolean,
  extras?: BioExtrasState | null,
) => Promise<SaveResult>;                                                       // runner.tsx:47-52

interface RunnerProps {
  questionnaire: Questionnaire;
  initialResponses: QuestionnaireResponses;
  action: RunnerAction;
  privacy?: { fields: readonly BioPrivacyField[]; initialFlags: Record<string, boolean> };
  burns?: { initial: BioExtrasState; searchCamps: (query: string) => Promise<CampSearchResult[]> };
  submitLabel?: string;        // default "Finish"
  persistProgress?: boolean;   // default false
  redirectTo?: string;
  answeredProgress?: boolean;  // default false
  fullWidthSubmit?: boolean;   // default false
  shuffleSeed?: string;        // default ""
  draftKey?: string;
  blobConfigured?: boolean;    // default false
}                                                                              // runner.tsx:54-87
```

---

## 6. UX behaviours worth stealing

1. **The Back button is a stack pop, never a decrement.** Under branching these differ, and the difference is a respondent landing on a page they never saw.
2. **Progress totals move as answers change.** `totalSteps = progress.pageCount + tailSteps` where `pageCount` is the *branch-resolved* path length — the console runner comment says it plainly: *"the total shrinks or grows as an answer changes which sections lie ahead"* (`apps/org/.../runner.tsx:104-105`).
3. **The autosave indicator tells the literal truth.** "Saved on this device", not "Saved". A "Saved" claim on a local draft would be the exact defect CONTRIBUTING.md:62-71 calls the most common reason a change gets sent back.
4. **A server rejection always becomes visible.** Two layers: `pageOwningError` walks to the owning page; the console runner adds a **last-resort banner** for the case where the rejected question is on no reachable page at all (a definition edited under a live activation) — *"A refusal must always be visible"* (`apps/org/.../runner.tsx:245-255`). The web runner LACKS this second layer.
5. **Shuffle is seeded, never `Math.random`.** The seed is `${activationId}:${userId}` so *"the order never moves on reload"* (`runner.tsx:78-80`). The console gate, which has no respondent id, seeds per-activation and says so: *"stable across reloads (which is what matters on a gate you may return to), but the same order for everyone rather than per person"* (`console-gate.tsx:58-62`).
6. **Branching follows the VALUE, never the position** — options carrying a `goTo` shuffle like any other (`questionnaire-runtime.ts:292-294`).
7. **Restricted, not hidden.** A control the viewer may not use is *disabled with the reason printed beside it*, not removed (`close-questionnaire-button.tsx:15-18`).
8. **Recall states its consequence before it happens**, and forks the sentence on blocking.
9. **"Recalled", not "Pending".** A person whose action expired because the sender closed the send is not someone you are waiting on (`response-viewer.tsx:107-109`, `camps/[slug]/questionnaires/page.tsx:267-270`).
10. **Every modal that can hold arbitrary-length content is height-capped with an inner scroll region**, learned twice (response dialog, preview dialog).
11. **An audience that resolved to nobody says so** — `"This questionnaire's audience resolved to nobody at send time."` (`camps/.../page.tsx:322-325`) and `"This questionnaire wasn't sent to anyone — the audience resolved to nobody at send time."` (`camps/.../[activationId]/page.tsx:127-130`). This is *exactly* Camp 404's WP6 zero-audience hazard, surfaced as UI copy.
12. **A live, debounced audience-count preview before sending** — 300 ms debounce, cancel-on-change, `"{n} people will receive this right now."` / `"Resolving audience…"` / `"Pick an audience to see how many people it reaches."` (`activation-form.tsx:110-131`, `:363-397`).
13. **The gate page owns no chrome.** The layout decides. One place can decide, and it is the one above the page.
14. **Skeletons match the shape of what loads.** `/questionnaires/[activationId]/loading.tsx` renders a title block + `SkeletonForm fields={4}` and says why: *"a blocking questionnaire is the only thing on screen, so the skeleton says so too rather than implying a page full of other content."*

---

## 7. Validation + edge-case rules, digit-exact

### 7.1 Regexes (`packages/types/src/questionnaire.ts:9-14`)

```ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s().-]{7,20}$/;
const URL_RE   = /^https?:\/\/[^\s/$.?#][^\s]*$/i;
const TIME_RE  = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALNUM_RE = /^[a-z0-9 ]+$/i;
```
Comment: *"Lenient formats — no extra deps. Email is RFC-lite; phone accepts +, spaces, dashes, parens and is digit-bounded (7–15, the E.164 range)."*

### 7.2 Zod defaults per kind

| Kind | `required` default | Other digits |
|---|---|---|
| `single_select` | `true` | `options` min 2 |
| `multi_select` | `false` | `options` min 2; `minSelections` int ≥0; `maxSelections` int >0 |
| `short_text` | `true` | `maxLength` default **120** |
| `long_text` | `false` | `maxLength` default **1000** |
| `date` | `true` | |
| `boolean` | `false` | |
| `email` | `true` | |
| `phone` | `true` | |
| `years` | `false` | |
| `linear_scale` | `true` | `min` ∈ {0,1}; `max` int 2..10 |
| `rating` | `true` | `steps` int **3..10**; `glyph` ∈ star\|heart\|number |
| `time` | `true` | |
| `file_link` | `false` | |
| `multi_choice_grid` | `true` (*"matching Google Forms"* — every row must be answered) | `rows` min 1, `columns` min 1 |
| `checkbox_grid` | `false` | `rows` min 1, `columns` min 1 |

`QuestionsPage.questions` min 1. `Questionnaire.pages` min 1. `QuestionOption.value`/`.label` min 1.

### 7.3 `validateOne` rules (`:568-763`) — every branch

- **Missing** = `undefined | null | ""`. If `required` → `{ ok:false, error:"This question is required" }`; else `{ ok:true, value: undefined }` (the key is DROPPED, not stored as null).
- `boolean`: non-boolean → `"Expected yes or no"`.
- `email`: non-string → `"Expected text"`; fails `EMAIL_RE` → `"Enter a valid email address"`.
- `phone`: digits = `raw.replace(/\D/g,"")`; fails `PHONE_RE` **or** `digits.length < 7` **or** `> 15` → `"Enter a valid phone number"`.
- `single_select`: non-string → `"Expected a choice"`. If `isOtherAnswer`: `!allowOther` → `"Not a valid option"`; empty trimmed other text → `"Tell us what your 'other' answer is"`. Otherwise value must be in `options` → else `"Not a valid option"`.
- `multi_select`: non-array or any non-string element → `"Expected a list of choices"`. Other-answers with `!allowOther` are **silently dropped** (`continue`), but an empty other text is a hard error. Unknown values are **silently filtered out**. Then: `required && filtered.length === 0` → `"Pick at least one option"`; `filtered.length > 0 && minSelections != null && filtered.length < minSelections` → `` `Pick at least ${minSelections} options` ``; `maxSelections != null && filtered.length > maxSelections` → `` `Pick at most ${maxSelections} options` ``. **The min bound only binds once something is picked** — *"an empty answer on an OPTIONAL question stays a valid skip"* (`:696-697`).
- `linear_scale`: coerces string→number; `typeof raw === "boolean" || !Number.isInteger(n)` → `"Pick a value on the scale"`; out of `[min,max]` → `` `Pick a value between ${min} and ${max}` ``.
- `rating`: same coercion; non-integer → `"Pick a rating"`; `n < 1 || n > steps` → `` `Pick a rating between 1 and ${steps}` ``.
- `time`: non-string → `"Expected a time"`; fails `TIME_RE` → `"Use 24-hour hh:mm"`.
- `file_link`: non-string → `"Expected a link"`; `!URL_RE.test(raw.trim())` → `"Enter a link starting with http:// or https://"`. **Stores the trimmed value.**
- **Grids**: non-object/null/array → `"Expected a grid of answers"`. Iterates the **DEFINITION's** rows so unknown row keys are dropped. A non-array cell or non-string element → `` `Malformed answer for "${row.label}"` ``. Unknown columns dropped; duplicates de-duped. `multi_choice_grid` with `picks.length > 1` → `` `Pick one column for "${row.label}"` ``. If `required`, the first row with no picks → `` `Answer every row — "${missing.label}" is missing` ``. **An optional grid left entirely blank returns `value: undefined`** (a valid skip), not `{}`.
- `years`: non-array/non-string element → `"Expected a list of years"`; each must match `/^\d{4}$/` AND `isValidAttendedYear` → else `` `${s} isn't a valid AfrikaBurn year` ``. De-duplicated preserving order. `required && years.length === 0` → `"Pick at least one year"`.
- `short_text` / `long_text`: non-string → `"Expected text"`; `raw.length > maxLength` → `` `Max ${maxLength} characters` ``; `minLength != null && raw.length < minLength` → `` `At least ${minLength} characters` ``; then `short_text` runs `checkTextFormat`.
- `date`: non-string → `"Expected a date"`; fails `/^\d{4}-\d{2}-\d{2}$/` → `"Use yyyy-mm-dd"`; `Number.isNaN(Date.parse(raw))` → `"Not a real date"`.

### 7.4 `checkTextFormat` (`:539-566`)

Operates on `raw.trim()`. `undefined`/`"text"` → null. `email` → `"Enter a valid email address"`. `url` → `"Enter a link starting with http:// or https://"`. `phone` → `PHONE_RE` AND digits 7..15 else `"Enter a valid phone number"`. `alphanumeric` → `ALNUM_RE` else `"Letters and numbers only"`. `number`/`integer`: empty or NaN → `"Enter a number"`; `integer` non-integer → `"Enter a whole number"`; `min` → `` `Must be at least ${min}` ``; `max` → `` `Must be at most ${max}` ``.

### 7.5 Branch semantics (`questionnaire-runtime.ts:6-10`, `:39-61`)

> *"a section's target is chosen by the LAST answered single-choice question on that section whose selected option carries a `goTo`. Failing that, the section's own `next`. Failing that, the following section in document order — and past the last section, submit."*

`target === SUBMIT_TARGET || target === null` → `null`. An unknown page id → `null` (not a crash).

**`resolvePath` carries a visited-set loop guard** even though loops are rejected at definition time: *"this still carries a visited-set guard so a legacy or hand-edited definition degrades into a truncated path instead of hanging the server"* (`:75-78`).

### 7.6 `deriveProgress` maths (`:138-179`)

`denominator = requiredTotal > 0 ? requiredTotal : total`; `numerator` matches. `percent = denominator === 0 ? 100 : Math.round(numerator/denominator*100)`. `complete = requiredAnswered === requiredTotal`. `pageIndex = currentPageId ? path.indexOf(currentPageId) : -1`.

`hasAnswer` (`:110-115`) treats an empty array as unanswered AND requires `validateOne` to pass — *"an invalid answer is treated as unanswered"* (test at `questionnaire-runtime.test.ts:284`).

### 7.7 `validateSubmission` — the two-pass branch-aware validator (`:195-238`)

Pass 1 builds a `driving` map from EVERY question in the definition, keeping only values that pass `validateOne`. Pass 2 resolves the path against `driving` and validates only `visibleQuestions`. Consequence, verbatim (`:190-193`):
> *"questions the respondent branched PAST are neither required nor kept. That makes branching safe both ways — a skipped required question can't block a legitimate submission, and answers to skipped questions can't be smuggled into the stored response."*

Malformed top-level payload → `{ ok:false, errors:{ _root: "Malformed response payload" } }`.

### 7.8 The seeded shuffle (`:252-279`)

FNV-1a hash (`h = 2166136261`, `h = Math.imul(h, 16777619)`, `h >>> 0`) seeds an **xorshift32** (`state ^= state << 13; state ^= state >>> 17; state ^= state << 5`) driving a Fisher–Yates from the end. `hash(seed) || 1` guards a zero state. Per-page seed is `` `${seed}:${page.id}` ``; per-question `` `${seed}:${question.id}` ``.

### 7.9 Results maths (`questionnaire-results.ts`)

- `pct(count, denominator)` = `Math.round(count/denominator * 1000) / 10` → **one decimal place**; returns `0` for `denominator <= 0` (`:130-133`).
- The percent denominator is **respondents who ANSWERED this question (Google Forms' denominator), not everyone sent it** (`:27-28`). Grid cells use the **per-row** denominator (`:107-108`).
- `isBlank` (`:135-143`): `undefined | null | ""`; empty array; a grid map where **no row has a non-empty pick array**.
- `average = n === 0 ? null : Math.round(sum/n * 100) / 100` → **two decimal places** (`:380`).
- Histogram buckets cover `[min, max]` inclusive, **then out-of-range answers keep their own bucket** — *"a scale narrowed after collection"* (`:371-377`).
- Choice tallies keep options that were **deleted after answers came in**, labelled by their raw value (`:209-219`).
- "Other…" answers are tallied separately, sorted `count desc` then `text` ascending (`:220-222`).
- `orphans` = response keys not in the definition and not blank, sorted by question id (`:396-402`, `:407-409`).

### 7.10 Definition-validation issue codes (`questionnaire-definition.ts:29-41`)

```
shape | duplicate_id | reserved_id | duplicate_option_value | reserved_option_value
| unknown_branch_target | backward_branch | self_branch | branch_not_allowed
| unreachable_page | invalid_range
```
`invalid_range` messages, verbatim: `` `minLength ${minLength} exceeds maxLength ${maxLength}` ``, `` `min ${min} exceeds max ${max}` ``, `"min/max only apply when format is number or integer"`, `` `minSelections ${a} exceeds maxSelections ${b}` ``, `` `minSelections ${n} exceeds the ${ceiling} options` `` where `ceiling = options.length + (allowOther ? 1 : 0)`, and `` `max ${max} must be greater than min ${min}` `` for `linear_scale`.

`DefinitionIssue.path` is a dotted path, e.g. `pages[2].questions[0].options[1]`.

### 7.11 The upsert trap (`questionnaire-store.ts:743-770`) — READ THIS ONE

```ts
.onConflictDoUpdate({
  target: [
    schema.questionnaireResponses.userId,
    schema.questionnaireResponses.definitionKey,
    schema.questionnaireResponses.editionId,
  ],
  targetWhere: isNull(schema.questionnaireResponses.groupId),
  set: { responses: validated.responses, activationId: input.activationId,
         completedAt: now, updatedAt: now },
})
```
Comment, verbatim:
> *"MANDATORY, and its absence is a runtime error rather than a subtle one. Migration 0028 split the uniqueness rule in two … **Postgres will not use a PARTIAL index to resolve ON CONFLICT unless the statement repeats its predicate**, so without this the insert fails outright with 'there is no unique or exclusion constraint matching the ON CONFLICT specification' — which is what happened to every questionnaire write, the Burner Bio included, until an e2e run caught it."*

### 7.12 Submit refusal messages (`submitResponse`, `:680-778`)

- activation gone → `"This questionnaire no longer exists."`
- org-internal → `"This questionnaire isn't available here."`
- no `required_actions` row for this user+key → `"This questionnaire wasn't sent to you."`
- no edition resolvable → `"No AfrikaBurn edition is set up yet."`
- otherwise the validator's own per-question errors.

All keyed `_form`, which the runner renders as a `role="alert"`.

### 7.13 Send-time refusals (`createQuestionnaireAction`)

- Zod fail → `"Please complete the questionnaire before sending."`
- unknown slug → `"Camp not found."`
- `mode === "roles" && roleIds.length === 0` → `"Pick at least one role, or send to everyone."`
- not a member → `"You're not a member of this camp."`
- outside scope → `"You can't send to that audience — check your questionnaire permissions."`
- no edition → `"No active edition is configured."`
- unparseable date → `"That due date isn't valid."`

`CreateInput` bounds: `title` 1..140, `description` ≤2000, `roleIds` uuid[], `definition` parsed by the shared `Questionnaire` schema *"so 'at least one page with one question' is enforced here, not just in the UI"* (`:23-25`).

---

## 8. Test coverage (the contract, precisely)

**`packages/core/src/__tests__/questionnaire-runtime.test.ts` (607 L, 35 `it()`)** — the highest-value document in the unit. Named blocks:

- *branch resolution*: falls through in document order · routes to the chosen option's target · ends on `SUBMIT_TARGET` · falls through when the branching question is unanswered · walks the full path per answer set · returns null past the last page · returns null for an unknown page id · **"lets the LAST branching question on a section win"** · **"does not hang on a hand-edited definition containing a loop"**.
- *visible questions*: excludes questions in branched-past sections · excludes content blocks.
- *progress derivation*: complete when every required question ON THE PATH is answered · counts required questions only on the resolved path · reports the current page position · falls back to overall completion when nothing is required · **treats an invalid answer as unanswered**.
- *branch-aware submit validation*: accepts a submission that skipped a branched-past required question · still enforces required questions on the path · **drops answers to questions the respondent branched past** · rejects a malformed payload · **"validates a v1 definition exactly as the pre-v2 validator did"**.
- *Builder v2 rules*: in-range scale/rating · out-of-range + non-integer rejection · 24-hour times · file links as http(s) · the format presets · minLength · Other… only when allowed · min/max selection counts · silently drops non-option choices.
- *shuffle*: stable for a seed, varies across seeds · leaves order alone when off · **shuffles options without changing their values** · returns no options for a non-choice question.
- *v1 back-compat*: round-trips a stored v1 response map (against `packages/core/src/__fixtures__/questionnaire-v1.ts`).

**`apps/web/lib/__tests__/questionnaire-store.test.ts` (778 L, 38 `it()`)** — fake-db driven. Highlights that encode contracts Camp 404 lacks:
- *"writes definition, activation and required actions in ONE transaction"*
- *"snapshots the definition AS SENT onto the activation"*
- *"keys required actions per EDITION so a later burn can raise them again"*
- *"writes no required-action row when the audience resolves to nobody"*
- *"writes the inbox row even when email cannot be delivered"* / *"still reports success when the inbox write throws"*
- *"sends the email OUTSIDE the transaction, to the targets' addresses"*
- *"prefers the snapshot definition over the live one"* / *"falls back to the live definition for a pre-snapshot row"*
- *"binds the ACTIVATION'S edition, not the caller's"* / *"does NOT filter answers by activation id"*
- *"withholds an org-internal questionnaire from the participant app"*
- *"repeats the partial index's predicate on the upsert"* ← the §7.11 regression, pinned
- *"refuses rather than writing an edition-less answer when none is set up"*
- *"redacts a sanitized respondent's name through the real core helper"*

**e2e** (`e2e/specs/camp-member/camp-member-blocking-questionnaire.spec.ts`) asserts the gate contract behaviourally: three trap surfaces (`/camps/{slug}`, `/profile`, `/directory`) all redirect to `/questionnaires/{id}`; the badge text `/required · blocks until done/i` and the lock line are visible; sign-out is present; **`getByRole("link", { name: /directory/i })` has count 0** — the nav-escape assertion. Then answering releases the gate and lands on `/directory`.

Note the donor's own AGENTS.md test-quality warning applies here (`AGENTS.md:216-259`): the `toHaveCount(0)` assertion is only sound because *something present is asserted first* — and this spec does exactly that.

`e2e/specs/camp-member/support.ts:8-14` carries a **"Selector provenance (verified against source on 2026-07-26)"** header listing which source file each selector came from. Worth copying as a practice.

---

## 9. Dependency footprint

### 9.1 npm packages the runner/field/results touch

| Package | Where | Camp 404 status |
|---|---|---|
| `react` 19, `next/navigation` | everywhere | ✅ present |
| `lucide-react` icons: `Check`, `Loader2`, `Heart`, `Star`, `Info`, `AlertTriangle`, `Circle`, `Lock`, `Eye`, `Clock`, `CheckCircle2`, `ClipboardList`, `Download`, `FileWarning`, `Plus`, `X`, `Building2`, `Send`, `ShieldCheck`, `Users`, `ArrowLeft` | all | ✅ all exist in Camp 404's lucide-react@1.16.0 (verified in the mechanical-delta pass) |
| `zod` v4 | types + actions | ✅ present |
| `drizzle-orm` | store | ✅ present |
| `@vercel/blob/client` | `FileUpload` (only if `file_link` is ported) | ✅ `@vercel/blob ^2.4.0` present |
| **`@radix-ui/react-toggle-group`** ^1.1.17 | `years` question | ❌ **must install** |
| **`@radix-ui/react-tabs`** ^1.1.14 | `ResultsView` Summary/Individual tabs | ❌ **must install** |
| `@radix-ui/react-select` | `single_select display:"dropdown"` | ✅ Camp 404 has `select.tsx` |
| `@radix-ui/react-dialog` | response viewer / preview | ✅ present |
| `react-phone-number-input` + `libphonenumber-js` | `PhoneInput` for the `phone` kind | ❌ **must install** — or swap for a plain `<Input type="tel">` (Camp 404's `phone` question kind exists at `packages/types/src/questionnaire.ts:199` with no phone-library dependency today) |

### 9.2 `@quagga/ui` components consumed

`button`, `input`, `textarea`, `badge`, `card` (+Header/Title/Description/Content), `dialog` (+Header/Title/Description/Content), `select` (+Trigger/Value/Content/Item), `toggle-group` (+Item), `table` (+Header/Body/Row/Head/Cell), `tabs` (+List/Trigger/Content), `empty-state`, `toast`, `role-badge`, `skeleton` (`Skeleton`, `SkeletonRegion`, `SkeletonForm`, and 6 more), `file-upload` (417 L), `phone-input` (124 L), `lib/utils` `cn`.

**Camp 404 already has:** button, input, textarea, badge, card, dialog, select, toast, empty-state, `cn`.
**Camp 404 lacks:** `table`, `tabs`, `toggle-group`, `skeleton`, `file-upload`, `phone-input`, `role-badge`.
`table` (118 L) and `skeleton` (204 L) are flagged **near drop-in** by the mechanical-delta pass. `tabs` + `toggle-group` need their Radix deps. `phone-input` needs two npm packages.

### 9.3 Cross-package imports

- `apps/web/components/questionnaire/*` → `@quagga/types` (10 symbols), `@quagga/core` (6 symbols), `@quagga/ui` (~12 components), `@/lib/{groups-store, client-navigation, questionnaire-store}`, `../privacy-toggles`.
- `apps/web/lib/questionnaire-store.ts` → `@quagga/core` (13 symbols: `activationRequiredActionKey`, `buildActivationRequiredActions`, `isParticipantFacingActivation`, `parseActivationActionKey`, `publicMemberName`, `questionnaireReleasedNotification`, `resolveActivationDefinition`, `resolveAudience`, `tallyActivationCompletion`, `validateSubmission`, `type AudienceContext`), `@quagga/types` (7), `./db`, `./required-actions`, `./email`, `./edition`, `./notifications`. Carries `import "server-only"` at line 1 — **Camp 404's `apps/web/vitest.config.ts` has no `server-only` alias stub**, so this file cannot be unit-tested there until that seam is added.
- `packages/core/src/questionnaire-{runtime,results,definition,activation,engine}.ts` are **pure** — no `@quagga/db`, no env, no I/O. Only `questionnaire-authz.ts` and `audience.ts` carry tenancy.

---

## 10. AfrikaBurn / multi-tenant coupling — what must be collapsed

### 10.1 CLEAN — port as-is (no tenancy, no org split, no AB domain)

| Asset | Notes |
|---|---|
| `packages/core/src/questionnaire-runtime.ts` (304 L) | Zero tenancy references. Pure. |
| `packages/core/src/questionnaire-results.ts` (419 L) | Zero tenancy references. Pure. |
| `packages/core/src/questionnaire-definition.ts` (350 L) | Pure structural validation. |
| `packages/types/src/questionnaire.ts` — **except** the attended-years block | See 10.2. |
| `apps/web/components/questionnaire/runner.tsx` | Only AB-coupled through the (dead, see 10.4) `burns` prop + `BioPrivacyField` type import. Strip both → clean. |
| `apps/web/components/questionnaire/field.tsx` | Only AB-coupled through `attendedYearOptions()` for the `years` kind. Drop `years` → fully clean. |
| `apps/web/components/questionnaire/content-block.tsx` | Clean. |
| `apps/web/components/questionnaire/blocking-badge.tsx` | Clean. |
| `apps/web/components/questionnaire/close-questionnaire-button.tsx` | Takes `slug` (a group slug) — trivially collapsible to just `activationId`. |
| `apps/web/components/questionnaire/pending-questionnaires.tsx` | Copy mentions "from your camps and AfrikaBurn" — one string. |
| `apps/web/lib/client-navigation.ts` | Only `INVITE_RESUME_PATH` couples it. |
| `apps/org/components/questionnaires/results-view.tsx` (609 L) | Contains ONE AB string: *"Grant-requester audiences stay empty until the MV/art registration flows ship."* (`:120-121`). Otherwise fully generic. |
| `apps/org/components/questionnaires/questionnaire-preview.tsx` | Clean. |
| `apps/web/components/questionnaire/response-viewer.tsx` | Clean. |

### 10.2 AFRIKABURN DOMAIN — drop or replace

- **`years` question kind + the whole attended-years block** (`questionnaire.ts:176-215`): `ATTENDED_YEAR_MIN = 2007`, `ATTENDED_YEAR_MAX = 2026`, `NO_BURN_YEARS = [2020, 2021]`, `isValidAttendedYear`, `attendedYearOptions`, the `YearsQuestion` schema, its `validateOne` arm, its `field.tsx` control, and its `results` timeline arm. This is hardcoded AfrikaBurn history. Camp 404's `burn_history` question in the burner-profile questionnaire is the analogue — **replace the constants, keep the shape**.
- **`burns-step.tsx`** (403 L) — entirely AfrikaBurn: `VOLUNTEER_PORTFOLIOS`, `rangerTraining`/`rangerCurious`/`greenDotTraining`, `RANGERS_FB_URL = "https://www.facebook.com/afrikaburn.rangers/"`, `RANGERS_MAILTO = "mailto:rangers@afrikaburn.com"`, `DEFAULT_EVENT = "AfrikaBurn"`, `ABOUT_SOFT_WORD_CAP`. **The reusable pattern inside it** is the `CampHistoryEditor` — a 250 ms debounced typeahead against a directory with a **free-text fallback** and a `Linked` badge distinguishing the two (`:203-229`, `:238-256`). That pattern is worth stealing in the abstract; the content is not.
- **`extras-state.ts`** (21 L) — AB bio-shaped; concept only.
- Copy strings: `"AfrikaBurn"` as the default asker (`page.tsx:29`), `"No AfrikaBurn edition is set up yet."`, `` `${s} isn't a valid AfrikaBurn year` ``, the console gate's `"AfrikaBurn Organiser Console"` eyebrow.

### 10.3 MULTI-TENANCY / ORG-SPLIT — must be collapsed

**Three dimensions, all baked in:**

1. **`group_id` (the camps indirection).** `questionnaire_activations.group_id`, `questionnaire_responses.group_id`, `ProjectAudience.groupId`, `isProjectDefinitionKey(key, groupId)`, the `proj:${groupId}:${rand}` key namespace (`questionnaire-store.ts:41-49`), `resolveProjectTargets(groupId, editionId, audience)` (`:171-224`), every `/camps/[slug]/questionnaires/**` route. **Camp 404 has one camp** → all of this collapses to no scoping at all.
2. **`edition_id` (the year namespace).** `questionnaire_responses.edition_id NOT NULL`, `required_actions.edition_id NOT NULL` (part of the uniqueness key), every prefill/results/submit query. **Camp 404 has no `editions` table.** BUT the underlying problem the donor solved — *"the gate fired once in a burner's lifetime and then never again"* — is REAL for Camp 404 too: `camp-404/packages/db/src/schema.ts` keys `required_actions` without any year discriminator, and `burner_profiles` has a `completedAt` that is bumped on replay. **Recommendation: harvest the LESSON, not the column.** If Camp 404 ever wants "re-confirm your details each burn", the donor's answer is a middle-position discriminator in the unique index.
3. **`authored_scope` + `AudienceSpec` (the org/participant fork).** `questionnaireAuthoredScopeEnum ["org","group"]`, `AudienceSpec` 5-way union (`org_internal`, `org_outbound`, `org_officer`, `org_suppliers`, `project`), `isParticipantFacingActivation`, `canViewActivationResults`'s org-vs-group fork, the entire `apps/org` questionnaire fork including `ConsoleGate` and `activation-form.tsx`. **In Camp 404 the reviewer and the reviewed are the same camp** → all of this collapses into the existing captain/team-lead/member ladder. `isParticipantFacingActivation` becomes a constant `true` and can be deleted.

**`ORG_OUTBOUND_SELECTORS`** (7 members: `all_current_burners`, `camp_leads`, `registered_camp_leads`, `mv_leads`, `mv_grant_requesters`, `art_leads`, `art_grant_requesters`) and **`OFFICER_AUDIENCE_LABELS`** (5 members) are pure AfrikaBurn org vocabulary — drop entirely. Camp 404's `questionnaire_scope` enum `[everyone, team, team_leads, individual, opt_in]` is its own, better-fitting version of the same idea.

**Notable:** `apps/org/components/questionnaire/activation-form.tsx`'s **live debounced audience-count preview** is the one org-app asset worth lifting despite the coupling — it is exactly what WP6's "zero-audience protection on sends" needs. The mechanism (300 ms debounce → server action → `{n} people will receive this right now.`) is 40 lines and audience-shape-agnostic.

### 10.4 DEAD CODE IN THE DONOR — do not port

Verified by symbol grep across `apps/` + `packages/`:

- **`runner.tsx`'s `privacy`, `burns`, `persistProgress` props and 3 of the 4 `RunnerAction` parameters are DEAD.** The only caller of `QuestionnaireRunner` in `apps/web` is `fill.tsx`, which passes none of them; `apps/web/components/onboarding/bio-flow.tsx` (803 L) re-implements the whole wizard independently. So `resolveNextStep`'s burns/privacy arms, the `{ kind: "burns" }` / `{ kind: "privacy" }` step kinds, the `__burns__`/`__privacy__` rail entries, the `PrivacyToggles` import and the `BurnsAndVolunteeringStep` import from the runner are all unreachable. **Strip ~90 lines when porting.** (This is exactly the donor's own simplification-audit "Redundancy" category, unapplied.)
- `docs/flows.md:34` claims blocking activations are applied via **`getBlockingActivation` in `@quagga/core`**. **That function does not exist** — a repo-wide grep finds it only in that doc line. The real mechanism is `firstBlockingAction` + `pendingBlockingRoute` + `viewerIsGated`. Do not port a doc claim.
- The org's `apps/org/components/questionnaire/builder.tsx` (the 542-line orphan named in `docs/simplification-audit.md`) **no longer exists** — the dead-code batch landed. `apps/web/components/questionnaire/builder.tsx` (584 L) IS live.

### 10.5 THE FORK HAZARD

`apps/web/components/questionnaire/` and `apps/org/components/questionnaire/` are **near-twins where one is already behind** — the donor's headline structural warning (`docs/simplification-audit.md:58-60`) applied to this exact directory. Measured drift:

| | web | org |
|---|---|---|
| `field.tsx` | 945 L, 15 kinds, `presentationOptions`, PhoneInput, Select dropdown, image_grid, ToggleGroup, FileUpload, the labelable/composite ARIA split | 401 L, **no** shuffled options, **no** PhoneInput, **no** dropdown variant, **no** image_grid, `years` degrades to a comma-separated text input |
| `runner.tsx` | 592 L, rail, draft autosave, privacy/burns tails, `answeredProgress`, `soloSubmit` | 296 L, no rail, no draft, **but has a last-resort off-page-error banner the web runner lacks** |
| `blocking-badge.tsx` | `"Required · blocks until done"` | `"Required — blocks the app until done"` — **different copy for the same state** |
| `response-viewer.tsx` | table + dialog, per-question option lookup, `max-h-[85svh]` cap | dialog only, **flat label map that can collide across questions** (two questions with an option value `"yes"` and different labels resolve to whichever was written last, `:60-69`) |
| `close-*-button.tsx` | two-step confirm + `refusal` prop + consequence copy | **one click, no confirm, no refusal** |

**Porting rule: always take the `apps/web` fork, then graft the org runner's last-resort banner onto it.** Never take the org `field.tsx` or the org `close-activation-button.tsx`.

### 10.6 One more genuine gap in the donor

There is **no post-submit completion/confirmation screen**. `redirectTo` sends the respondent to `/directory` and `router.refresh()` re-renders the shell. The "Already submitted" card (`page.tsx:66-89`) is a *re-entry* state, not a confirmation. So Camp 404's **WP4 S27 "questionnaire-complete" surface has no donor prior art** — it must be designed, not harvested.

---

## 11. Verbatim excerpts — the five most valuable pieces

### 11.1 Branch-aware server-side submit validation (`packages/core/src/questionnaire-runtime.ts:185-238`)

The single most reusable function in the unit. Camp 404's `saveBuilderResponses` has no equivalent two-pass derivation, and its `visibleIf`/`evalVisibleIf` conditional-visibility model has the identical smuggling risk.

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

### 11.2 Local draft autosave + the honest indicator (`apps/web/components/questionnaire/runner.tsx:138-185`, `:510-529`)

```ts
  // --- Local draft autosave --------------------------------------------
  // Zero-connectivity culture: a half-filled questionnaire must survive a
  // reload or a dropped signal. The draft is LOCAL only — nothing is sent to
  // the server until submit, so no half-answers land in the response store.
  const storageKey = draftKey ? `${DRAFT_PREFIX}${draftKey}` : null;
  const hydrated = React.useRef(false);

  React.useEffect(() => {
    if (!storageKey || hydrated.current) return;
    hydrated.current = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setResponses((prev) => ({
          ...prev,
          ...(parsed as QuestionnaireResponses),
        }));
        setSaveState("saved");
      }
    } catch {
      // A corrupt or unavailable draft is never fatal — start clean.
    }
  }, [storageKey]);

  React.useEffect(() => {
    if (!storageKey || !hydrated.current || saveState !== "unsaved") return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(responses));
        setSaveState("saved");
      } catch {
        setSaveState("idle");
      }
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [responses, storageKey, saveState]);
```
```tsx
function AutosaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "saving" || state === "unsaved") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Saving…
      </span>
    );
  }
  return (
    <span
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title="Your answers are kept on this device until you submit."
    >
      <Check className="h-3.5 w-3.5 text-success" aria-hidden />
      Saved on this device
    </span>
  );
}
```

### 11.3 The closed-activation gate release (`apps/web/lib/required-actions.ts:122-166`)

Directly applicable to Camp 404 — `closeActivationAction` exists there and this join does not.

```ts
  const rows = await db()
    .select({
      actionKey: schema.requiredActions.actionKey,
      blocking: schema.requiredActions.blocking,
      status: schema.requiredActions.status,
      audience: schema.questionnaireActivations.audience,
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
    .from(schema.requiredActions)
    .leftJoin(
      schema.questionnaireActivations,
      eq(
        schema.questionnaireActivations.id,
        schema.requiredActions.activationId,
      ),
    )
    .where(
      and(
        eq(schema.requiredActions.userId, userId),
        eq(schema.requiredActions.editionId, edition.id),
      ),
    )
    .orderBy(asc(schema.requiredActions.createdAt));
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

### 11.4 The ARIA labelable/composite split (`apps/web/components/questionnaire/field.tsx:48-73`, `:83-155`)

Camp 404's WP8 (#132, 40 a11y findings) has nothing like this. Every one of Camp 404's 14 question kinds that renders as buttons has the same defect the comment describes.

```tsx
/**
 * True when this question's control is a single HTML labelable element carrying
 * `id={question.id}` — i.e. when `<label for>` actually resolves to something.
 *
 * Everything else (the yes/no pair, the scale, the rating, radio rows, chips,
 * grids, the year toggles, the uploader) is a COMPOSITE of buttons with no such
 * element, so `<label for>` on those pointed at nothing: the prompt was on
 * screen but was announced by nothing, clicking it focused nothing, and a
 * screen-reader user heard "Yes button / No button" with no idea what was being
 * asked. Those get an ARIA group labelled by the prompt instead. */
function isLabelableControl(question: Question): boolean {
  switch (question.kind) {
    case "short_text":
    case "email":
    case "phone":
    case "long_text":
    case "date":
    case "time":
      return true;
    // The dropdown variant renders a real <button> trigger with the id; the
    // radio-row and image-grid variants do not.
    case "single_select":
      return question.display === "dropdown";
    default:
      return false;
  }
}
```
```tsx
  const labelId = `${question.id}-label`;
  const helpId = question.helper ? `${question.id}-help` : null;
  const errorId = error ? `${question.id}-error` : null;
  // BOTH the hint and the error, in reading order. Previously the error
  // REPLACED the hint, so the one moment a respondent most needs "dd/mm/yyyy"
  // is the moment it stopped being announced.
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;
  const required = "required" in question && question.required === true;
  const labelable = isLabelableControl(question);

  const prompt = (
    <>
      {question.prompt}
      {required && (
        <span className="ml-1 text-primary" aria-hidden>
          *
        </span>
      )}
      {/* The asterisk is decorative. A labelable control announces required-ness
          through `aria-required`; a composite has no element that may carry it
          (`aria-required` is not valid on role="group"), so say it in words. */}
      {required && !labelable && <span className="sr-only"> (required)</span>}
    </>
  );
```

### 11.5 CSV export with the label namespace and the BOM (`apps/org/components/questionnaires/results-view.tsx:505-608`)

Camp 404's Phase E CSV export has zero code; this is the whole thing, ~100 lines, chart-library-free and tenancy-free.

```ts
function optionLabelMap(questions: readonly Question[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const q of questions) {
    if (q.kind === "single_select" || q.kind === "multi_select") {
      for (const o of q.options) labels.set(`${q.id}:${o.value}`, o.label);
    }
    if (q.kind === "multi_choice_grid" || q.kind === "checkbox_grid") {
      for (const row of q.rows) labels.set(`${q.id}:row:${row.id}`, row.label);
      for (const col of q.columns)
        labels.set(`${q.id}:col:${col.value}`, col.label);
    }
  }
  return labels;
}

function formatCell(
  questionId: string,
  value: QuestionnaireResponseValue | undefined,
  labels: Map<string, string>,
): string {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const one = (v: string) =>
    isOtherAnswer(v)
      ? `Other: ${otherAnswerText(v)}`
      : (labels.get(`${questionId}:${v}`) ?? v);
  if (Array.isArray(value)) return value.map(one).join("; ");
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    // Grid answer: { rowId: columnValue[] } → "Row: Col A, Col B | Row2: …".
    const parts: string[] = [];
    for (const [rowId, picks] of Object.entries(value)) {
      if (!Array.isArray(picks) || picks.length === 0) continue;
      const rowLabel = labels.get(`${questionId}:row:${rowId}`) ?? rowId;
      const cols = picks
        .map((v) => labels.get(`${questionId}:col:${v}`) ?? v)
        .join(", ");
      parts.push(`${rowLabel}: ${cols}`);
    }
    return parts.join(" | ");
  }
  return one(value);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
```
```ts
  function download() {
    const labels = optionLabelMap(questions);
    const header = [
      "Recipient", "Status", "Completed",
      ...questions.map((q) => q.prompt),
    ];
    const lines = [header.map(csvCell).join(",")];
    for (const row of rows) {
      const cells = [
        row.email ?? "Unknown user",
        row.status,
        row.completedLabel === "—" ? "" : row.completedLabel,
        ...questions.map((q) => formatCell(q.id, row.responses?.[q.id], labels)),
      ];
      lines.push(cells.map(csvCell).join(","));
    }
    // BOM so Excel opens UTF-8 answers correctly.
    const blob = new Blob([`﻿${lines.join("\r\n")}`], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${exportName}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
```

### 11.6 Bonus — `navigateOnwards`, the deferred push/refresh (`apps/web/lib/client-navigation.ts:22-54`)

Small, but it fixes a class of bug Camp 404's `saveBuilderResponses` + `router.refresh()` pattern is exposed to.

```ts
/**
 * ## Why the push/refresh pair is DEFERRED a macrotask
 *
 * Every caller reaches this from inside `startTransition(async () => …)` — the
 * save happens in the transition and the navigation is what follows a
 * successful save. Called synchronously from in there, the transition is left
 * awaiting a navigation that the same-tick `refresh()` supersedes, so it never
 * settles and `isPending` stays true for good. What that looks like to a
 * participant: a Submit button stuck on "Saving…" on something that HAS been
 * saved, and no redirect. On the blocking questionnaire gate it meant being
 * held on a gate they had already cleared, with nothing to click.
 *
 * Deferring lets the transition resolve first, so the pending state clears and
 * the pair runs on its own tick. Proved by bisection on 28 Jul against a
 * production build: push-only fixed it, push+refresh-inside-transition hung,
 * push+refresh-deferred fixed it and KEPT the refresh …
 */
export function navigateOnwards(router: PushRouter, href: string): void {
  if (href === INVITE_RESUME_PATH) {
    window.location.assign(href);
    return;
  }
  setTimeout(() => {
    router.push(href);
    router.refresh();
  }, 0);
}
```

---

## 12. Question-kind delta: donor 15 vs Camp 404 14

| Donor kind | Camp 404 equivalent | Note |
|---|---|---|
| `short_text` | `short_text` | Donor adds `format` (7 presets), `minLength`, `min`, `max` |
| `long_text` | `long_text` | Donor adds `minLength` |
| `email` | `email` | |
| `phone` | `phone` | |
| `date` | `date` | |
| `boolean` | `boolean` / `toggle` | Camp 404 has BOTH `toggle` (:131) and `boolean` (:177) |
| `single_select` | `single_select` | Donor adds `display` (radio/dropdown/image_grid), `allowOther`, `otherLabel`, `shuffleOptions`, per-option `goTo` + `imageUrl`/`imageAlt` |
| `multi_select` | `multi_select` | Donor adds `display`, `allowOther`, `shuffleOptions`, `minSelections`, `maxSelections` |
| `linear_scale` | `slider` (:15) / `scale` (:113) | Camp 404 has two, donor one |
| `rating` | — | **Donor-only** (3–10 steps, star/heart/number) |
| `time` | — | **Donor-only** |
| `file_link` | `image` (:163) | Camp 404's is image-specific; donor's is any file via URL or Blob |
| `multi_choice_grid` | — | **Donor-only** |
| `checkbox_grid` | — | **Donor-only** |
| `years` | — | Donor-only, AfrikaBurn-specific |
| — | `number` (:38) | **Camp 404-only** (donor folds it into `short_text` `format:"number"`) |
| — | `combobox` (:146) | **Camp 404-only** |
| — | `scale` (:113) | **Camp 404-only** (separate from slider) |

**Content blocks:** donor `info_block` / `image_block`; Camp 404 `HeaderBreakBlock` / `ExplainerBlock` (styles `[plain, note, callout, warning]`) / `ImageBlock` (sizeFit `[fit, fill, full-width]`). Camp 404's are richer.

**Conditional visibility:** donor uses **option-level `goTo` branching + page-level `next` + `SUBMIT_TARGET`** (a Google-Forms section-jump model). Camp 404 uses **`VisibleIf` with 10 operators** (`[eq, ne, gt, gte, lt, lte, includes, not_includes, is_answered, is_empty]`) evaluated per-block. **These are different models solving overlapping problems.** The donor's `resolvePath` / `visibleQuestions` / `validateSubmission` shape maps onto Camp 404's `evalVisibleIf` almost directly — replace `nextPageId` with "which blocks pass `visibleIf`" and the two-pass smuggling defence, the progress derivation, and the branch-aware submit all transfer unchanged. **That is the single highest-leverage port in this unit.**

---

## 13. Gotchas / traps

1. **`import "server-only"`** at `questionnaire-store.ts:1` — Camp 404's `apps/web/vitest.config.ts` has no alias stub for it; add one before unit-testing any ported server module.
2. **The ON CONFLICT partial-index predicate** (§7.11) — if you split a unique index into partials, every `onConflictDoUpdate` MUST repeat the predicate or the write fails outright at runtime.
3. **The org fork is behind on 5 of 6 shared files** (§10.5). Always take `apps/web`.
4. **`docs/flows.md:34`'s `getBlockingActivation` does not exist.** Donor comments/docs lie (the audit found 8 such cases); read the code under them.
5. **`runner.tsx`'s privacy/burns/persistProgress path is dead** — ~90 unreachable lines.
6. **`apps/org/.../response-viewer.tsx`'s flat label map collides** across questions sharing an option value. Use the web fork's per-question lookup or the CSV's `${q.id}:${value}` namespace.
7. **`boolean` is documented as "rendered as a switch"** (`questionnaire.ts:145`) but renders as a Yes/No button pair (`field.tsx:230-256`).
8. **Camp 404's `typedRoutes: true`** will reject every donor `<Link href="/questionnaires/…">` / `/camps/…` / `/directory` string until the corresponding route exists.
9. **Camp 404's `packages/ui` components are written WITHOUT semicolons** while every donor file is semicolon'd; run `pnpm format` after any paste.
10. **`file_link` at 25 MB** exceeds Vercel's 4.5 MB serverless body cap by design — it works only because `FileUpload` uses `@vercel/blob/client` browser→Blob direct upload with a server-issued token. Don't port the 25 MB limit onto a server-proxied upload.
11. **Donor `percent` rounding differs by surface**: results use one decimal (`round(x*1000)/10`), the runner uses whole numbers (`round(x*100)`), averages use two decimals (`round(x*100)/100`). Pick one and be consistent.
12. **There is no completion screen** (§10.6). WP4's S27 has no donor prior art.
13. **`opt_in` scope is dead in the donor too** — the enum member exists, nothing reads it. Camp 404's `TODO(opt_in)` gets no help here.
14. **`getActivationResults(activationId, _editionId)`** takes an unused parameter *"Kept for call-site symmetry with the org loader"* (`questionnaire-store.ts:466-467`) — a small piece of the twin-fork tax.
