# Questionnaire builder — v1 functional spec

Authoritative spec for the in-app, captain-facing questionnaire builder. Owner
ask (2026-06-18): questionnaires should be **editable inside the app, like Google
Forms**, not hand-coded each time. Authorized scope = **v1 phases A–F (incl.
conditional branching)**.

> **Revision note.** Hardened 2026-06-18 against an adversarial gap-hunt (6
> blockers, 18 majors, 11 minors). Resolved owner decisions: response history =
> **latest-answer only**; **no opt-in scope** (captains dictate audience); the
> bespoke code questionnaires — **burner profile especially — are kept entirely
> separate from the builder** (not listed, not editable); **Duplicate is in v1**;
> response erasure is an explicit non-goal (§8).

- Design source of truth: the 10 `FB · …` boards in `design/app.pen` (boards
  49–58), realizing/evolving `design/questionnaire-builder.mockup.md`. **Where
  the boards and §3 disagree on catalog membership, §3 wins** — boards 51/56
  predate the email/phone/number tiles.
- Builder **P1 already shipped** on `main` (PRs #112/#113): `questionnaire_definitions`
  table, a DB module + web loader facade with tests, the `number` field kind, and
  the burner-profile definition seeded behaviour-preservingly. This spec builds on
  that.

---

## 1. Architecture: two questionnaire classes

The builder is a **deliberately scoped** dynamic content engine — see the amended
"Bespoke over generic" stance in `AGENTS.md`.

- **Code questionnaires** (`burner_profiles`, `dietary_requirements`,
  `driver_profiles`): bespoke tables, structured columns read relationally,
  special handling (ID encryption, team-config injection). **Untouched in v1, and
  NOT surfaced in the builder.** The burner-profile onboarding is a system form
  tied into app signup — it is **never listed or editable** in the builder hub.
  (Board 49's "Burner profile" row is illustrative sample data, not a
  requirement.) The builder hub query **excludes the reserved keys**
  `burner_profile`, `dietary_requirements`, `driver_profiles`.
- **Builder questionnaires**: generic `definition` (data, not code) + generic
  `questionnaire_responses` (JSONB keyed by field id) + the data-driven runner.

Both classes share the existing dispatch/gate spine (`questionnaire_activations`
→ `required_actions` → `satisfyRequiredAction`/version-reopen) with **no rework**;
they share nothing else. Coexistence is permanent.

### 1.1 Identifier map (one set of keys threads every hop)

| Concept | Where | Value |
|---|---|---|
| Definition family key | `questionnaire_definitions.key` (PK) | server-minted `slugify(title)+suffix`, immutable on rename; reserved code keys excluded |
| Published snapshot | `questionnaire_versions(key, version)` (PK) | immutable copy of the definition at publish |
| Dispatch | `questionnaire_activations` | `questionnaireKey = key`, `version = currently-published version`, `id = activationId` |
| Obligation | `required_actions` | `actionKey = key`, `version`, `activationId`; `unique(userId, actionKey)` |
| Answer | `questionnaire_responses` | `(userId, definitionKey, definitionVersion)` |
| Runner route | — | `/questionnaires/[activationId]` → activation → (key, version) → snapshot |

---

## 2. Canonical model: paged + blocks

`BuilderQuestionnaire` is a **separate parallel top-level type** from the legacy
`Questionnaire` (the two never unify — §1). New questionnaires **default to 1
page**; the flat board-50 view is the single-page rendering, not a second schema.

```
BuilderQuestionnaire = { version, title, pages: Page[] }
Page  = { id, type: 'question' | 'content', title, intro?, requiredToContinue, blocks: Block[], visibleIf? }
Block = QuestionBlock { block: 'question', question: Question }      // discriminant `block`, NOT `kind`
      | ContentBlock  { kind: 'header_break' | 'explainer' | 'image_block' | 'divider', ... }
```

- **Discriminant:** `QuestionBlock` carries `block:'question'` so its wrapped
  `Question.kind` never collides with `ContentBlock.kind`.
- **Loader discrimination (read time):** inspect `pages[0]` — `'blocks' in
  pages[0]` ⇒ builder (parse with `BuilderQuestionnaire`); `'questions'`/`'kind'`
  ⇒ legacy (`Questionnaire`). `getQuestionnaireDefinition` returns `Questionnaire
  | BuilderQuestionnaire`; the column is `$type<Questionnaire |
  BuilderQuestionnaire>()`. The seeded burner definition stays legacy and still
  validates.
- **Page defaults** (on create / page-add): `{ uuid, type:'question', title:'',
  intro:undefined, requiredToContinue:false, blocks:[] }`. `type` is set from the
  creating tile (Question/Content page).
- **Page `type` is a declarative label** (drives respondent chrome/progress
  copy), not a structural constraint — content blocks may appear on any page. But
  **input fields may not appear on a `content` page** (the UI exposes only "Add
  block" there; publish is the backstop — §6).
- **Page boundaries = array entries** (one Page = one screen). The catalog "Page
  break" is an **authoring convenience**: inserting it immediately creates a new
  `Page` after the current one (persisted by structural-autosave); blocks after
  the marker move into the new page; the marker itself is never stored; deleting a
  page header re-merges its blocks into the preceding page.
- **Single-page ⇄ paged promotion:** a 1-page questionnaire hides page chrome in
  the canvas; adding a 2nd page or first content block promotes it to the paged
  board-54 layout (the first page becomes renamable).

### 2.1 `visibleIf` operator grammar (conditional branching)

`visibleIf = { fieldId, op, value? }` — **single condition** in v1 (no AND/OR,
no arrays of conditions). May reference **only an earlier field** (the builder
rejects forward references). Operators by referenced kind:

| Referenced kind | Operators | `value` |
|---|---|---|
| single_select, combobox | `eq`, `ne` | option value (string) |
| boolean | `eq`, `ne` | `true`/`false` |
| multi_select | `includes`, `not_includes` | option value (string) |
| number, slider | `eq`, `ne`, `gt`, `gte`, `lt`, `lte` | number |
| any kind | `is_answered`, `is_empty` | omitted |

`value` must match the referenced field's response type. An **unanswered**
referenced field makes the condition evaluate **false (hide)**, except
`is_empty`/`is_answered`. Runtime + authoring semantics: §5.1.

### 2.2 Author-content render & size policy

- Content-block and field text renders as **plain text** (no markdown/HTML) in
  v1 — an injection guard. `visibleIf` is data only ("no scripting").
- **Server-enforced caps** (reject at save with a clear message): max pages,
  max blocks/page, max options/field, max heading/explainer/caption length, max
  total definition size. Image URLs validated to the Blob domain.

---

## 3. Field & block catalog

**§3 is authoritative for catalog membership.** Each input field carries common
`{ label, helper?, required }` plus kind-specific params.

### Input fields (`Question` discriminated union in `@camp404/types`)

| Palette | Stored kind | State | Params / notes |
|---|---|---|---|
| Short text | `short_text` | extend | `placeholder?` (**add**), `maxLength` stepper |
| Long text | `long_text` | extend | `enableDictation` bool (**add**, default false) → guards the DictatePill; existing Groq `/api/voice/transcribe` |
| Email | `email` | **new** | format-validated (RFC-lite regex, no new deps); reuse onboarding email input |
| Phone | `phone` | **new** | format-validated; reuse onboarding phone input; no new deps |
| Number | `number` | exists (#113) | min / `max`(default 6) — integer +1, **no `step`** |
| Scale | `slider` + `display:'segmented'` | extend | **row of number buttons** to pick from; min/max positive integers, mobile cap ≤9 cells; low/high labels optional |
| Slider | `slider` + `display:'continuous'` | extend | continuous; min/max/step + low/high labels |
| Single select | `single_select` | exists | `options[]` (≥2); "Allow multiple" morph → `multi_select`, **authoring-time only** |
| Multi select | `multi_select` | exists | `options[]` (≥2) |
| Dropdown | `combobox` | exists | searchable single-select |
| Date | `date` | exists | no min/max in v1 (platform-`Date` rule) |
| Toggle | `boolean` | **new** | on/off; fixed `Yes`/`No` labels in v1 (not author-editable); `displayResponseValue` returns Yes/No; an **untouched required boolean = missing** (store only after explicit toggle) |
| Image upload | `image` | exists | respondent uploads; reuse square-avatar Blob pipeline |

- **Add `display:'segmented'|'continuous'`** (default `continuous`) to
  `SliderQuestion`; the Scale card pre-sets `segmented`, the Slider card
  `continuous`; the editor previews only the active variant. Segmented-slider
  value semantics = integer in [min,max] (distinct from `number`, which is a
  free numeric entry).
- **Options editor** (single/multi/dropdown): ≥2 options; per-row delete
  disabled at 2; inline Alert while <2; values **auto-slugged** and immutable
  once saved (stable join key); removing an option that has responses is a
  **soft-delete** (retained for validation/display).
- Collisions: the legacy categorical `scale` and segmented-string `toggle` kinds
  stay for code questionnaires; the builder palette's "Scale" → `slider`
  (segmented), "Toggle" → new `boolean`. Distinct discriminators, no collision.
- Email/phone/number/long-text-dictation editors are **undrawn — build
  functionally** with existing components.

### Content blocks (`ContentBlock` union — display-only, never captured)

| Block | kind | Params |
|---|---|---|
| Header break | `header_break` | headingText, eyebrow?, subtext?, alignment(`left`/`center`, default `left`) |
| Explainer | `explainer` | bodyText, style(`plain`/`note`/`callout`/`warning`) |
| Image | `image_block` | imageUrl, caption?, **altText (required)**, sizeFit(`fit`/`fill`/`full-width`) |
| Divider | `divider` | — |

> `image_block` (display-only, author-uploaded) ≠ the `image` **input** field
> (respondent-uploaded, captures a URL). Board 58's "Edit field" title is a mock
> label error for "Edit block".

### 3.1 Content-block rendering (respondent side)

| Block / style | Treatment |
|---|---|
| `header_break` | eyebrow = uppercase `$accent` small-caps; heading bold; subtext muted; `alignment` left/center |
| explainer `plain` | muted body, no bg/icon |
| explainer `note` | `$accent`-tint bg |
| explainer `callout` | `$primary`-tint bg + megaphone icon |
| explainer `warning` | `$destructive`-tint bg + alert-triangle icon |
| `image_block` `fit` | constrain to column, preserve aspect |
| `image_block` `fill` | fill column width, preserve aspect |
| `image_block` `full-width` | edge-to-edge, ignore page padding |

`altText` is **required** (publish-time check). `image_block` uploads via a
non-square pipeline (preserve aspect; a dedicated `/api/uploads/image` or the
avatar route **without** square-crop) — JPG/PNG, 10 MB, Remove/Replace per board
58. The square-crop avatar pipeline applies **only to the respondent `image`
input field**.

---

## 4. Builder surfaces (captain/lead authoring) → routes

Under `/captains/questionnaires/*`. Server-gated, **preview-but-locked**
(`requireClearance` + `CaptainLock`; mirror `captains/camp-settings`). Client
islands persist via server action + `router.refresh()` (mirror
`team-settings-manager`/`announcements-manager`). Reorder via `@dnd-kit` (with a
**keyboard sensor / ArrowUp-Down fallback** for a11y).

| Board | Screen | Route |
|---|---|---|
| 49 | Hub: list (status badge, question count, edited date), New, empty state | `/captains/questionnaires` |
| 50 / 54 | Build canvas; footer Preview + Publish; Settings gear → settings sheet | `/captains/questionnaires/[key]` |
| 51 / 56 | Add field / Add block bottom-sheet catalog (grouped, real client-side search on name+description) | sheet |
| 52 / 53 | Field editor (per-kind params, options editor, live preview) | sheet |
| 55 | Pages & page settings (title/intro/type/requiredToContinue; reorder; delete) | sheet |
| 57 / 58 | Content-block editors (header/explainer/image) | sheet |
| — | Preview = **real runner** vs draft, no persistence, no side-effects | `/captains/questionnaires/[key]/preview` |
| — | Send/Activate (functional, undrawn — §6) | `/captains/questionnaires/[key]/send` |
| — | **Metrics** (captain-only, published-only) | `/captains/questionnaires/[key]/metrics` |
| — | **Responses** (captain-only, published-only) | `/captains/questionnaires/[key]/responses` |

### 4.1 Permissions (enforced server-side at the data layer)

| Surface / action | Clearance |
|---|---|
| Hub + canvas + editors + Preview | ≥ `team_lead` |
| Edit-a-draft | team-lead **only their own** drafts (`createdBy`); captain any |
| Hub rows shown | team-lead: published + own drafts; captain: all |
| Publish / Unpublish / Send / Push-reminder | `captain` |
| Metrics / Responses (PII) | `captain` (data withheld server-side otherwise) |
| Respondent runner | viewer must have a matching `required_actions` row (else "not invited"); see §5 |

Definitions are **global** (no team column); audience scoping happens at the
activation, not the definition.

### 4.2 Authoring lifecycle & save semantics

- **New questionnaire:** creates a draft immediately (`status=draft`,
  `version=NULL`, `createdBy=current user`) with one default page, routes to the
  empty editor; appears in the hub on create. **Publish (not create)** requires a
  non-empty title.
- **Save model:** structural ops (reorder on drag-end, add/delete field/block/page)
  **autosave** via server action + `router.refresh()`; sheet editors
  (52/53/55/57/58) buffer locally and persist only on footer **Save** — dismiss
  discards, with a "Discard changes?" confirm if dirty. The canvas has no global
  Save; Preview uses the autosaved state. **Autosave never bumps version** (only
  Publish snapshots).
- **Concurrency:** last-write-wins, no optimistic locking in v1 (inherits the
  team-settings pattern).
- **Hub-row overflow menu:** Draft → Rename, Duplicate, Delete (confirm);
  Published → Rename, Duplicate, Unpublish (§6 close-confirm), View metrics /
  responses.
- **Duplicate** (v1): clones a questionnaire's definition into a new draft
  (`status=draft`, fresh key, fresh block UUIDs).
- **Edit a published questionnaire:** edits mutate the working head; the live
  published version (snapshot) is unchanged and keeps serving open activations
  until the captain Publishes again. The hub flags "published · draft changes"
  when head ≠ latest version; the canvas shows a banner "Editing changes to a live
  questionnaire; members keep the current version until you re-publish."
- **Settings gear** (boards 50/54) opens a questionnaire-settings sheet: title,
  description, and the lifecycle actions (Publish / Unpublish / Send).

---

## 5. Respondent runner

Route `/questionnaires/[activationId]`. **Access predicate:** load the activation;
require a matching `required_actions` row for the viewer (else 404 / "You're not
invited"); **recompute `nextGate` before render** and redirect if an earlier
blocking gate is still pending (closes the deep-link bypass). The runner renders
the **version snapshot** the activation pins (so in-flight responses match what
was answered).

- Pages → blocks; content blocks display-only; **"Page N of M" (left) and "X%"
  (right)** as two nodes (board 58). `M` = count of currently-visible pages
  (content pages included); `N` = 1-based ordinal in the visible list; `X% =
  round(N/M·100)`, **clamped non-decreasing**. Single-page forms suppress the
  progress row; a **blocking** runner still shows the Required chip + sign-out bar.
- **Save cadence:** upsert the `(userId, definitionKey, version)` response row on
  **each page advance** (`completedAt=null`); on final submit set `completedAt` +
  call `satisfyRequiredAction(userId, key, version)`. **Resume** at the first
  incomplete page on re-entry while `completedAt` is null.
- Reuses the member `FieldInput` leaves; reuses `validateResponses()` **once it is
  made block-aware (Phase A)** — see §9 (resolves the prior "unchanged"
  contradiction). Replay/edit-after-submit reuses the existing replay flow;
  builder-form change-logs go to `questionnaire_edits` (key-driven).
- **Edge states** (replace the wizard's silent `null`): closed / no-open
  activation → "This form is closed"; malformed definition (loader fallback) →
  "This form is unavailable"; not-in-audience → "You're not invited";
  zero-input published form → prevented at publish (§6).

### 5.1 `visibleIf` runtime semantics

`evalVisibleIf(cond, responses, fieldMap)`: empty `visibleIf` ⇒ visible;
per-operator per §2.1; referenced unanswered ⇒ false (hide) except
`is_empty`/`is_answered`; **dangling fieldId ⇒ visible at runtime (defensive) but
a hard publish error** so it can't ship.

- A hidden field's stored value is **retained** (never pruned), but **excluded
  from validation and diff while hidden**; re-showing it (by changing the gating
  answer) restores the previously-entered value (no blanking).
- `validateResponses` is **visibility-aware**: it skips required checks for hidden
  fields.
- If the visible-page set is empty, show an empty/error state and **do not
  submit**; publish-time validation rejects questionnaires uncompletable under
  empty responses.

---

## 6. Lifecycle: publish / unpublish / version / dispatch

Status enum `questionnaire_status` = **`draft` / `published` / `unpublished`**
(no separate "archived" — `unpublished` is the terminal, responses-preserving
state).

### 6.1 Publish & the structural-diff taxonomy

Publish (captain) runs `classifyChange(latestPublished, head)` — a TS
exhaustiveness switch over every change op so an unmapped op is a **compile
error**. Cosmetic ⇒ update the live snapshot **in place, no version bump, no
re-open**. Breaking ⇒ mint a **new version** (`<base>-vN+1`, matching
`versions.ts` `meetsRequiredVersion`); the gate re-opens only when the captain
**Sends** the new version.

| Change | Class |
|---|---|
| Edit prompt/helper/label/eyebrow/subtext/caption | cosmetic |
| Add/remove/edit a **content** block; reorder fields/pages | cosmetic |
| Edit page title/intro/alignment; enable a display variant (segmented/dictation) | cosmetic |
| Widen a constraint (raise maxLength, widen min/max, **add** an option) | cosmetic |
| **Add** or **remove** an input field | breaking |
| `required` off→on **or** on→off | breaking |
| Change field `kind`; single↔multi morph | breaking |
| **Remove or rename** an option value | breaking |
| **Narrow** a constraint (lower maxLength, narrow min/max) | breaking |
| Page `type` question→content with surviving input fields | breaking |
| Add/remove/change a `visibleIf` | breaking |

### 6.2 Publish-time validity (hard blockers, member-visible messages)

≥1 page; ≥1 block per page; ≥1 input field overall; **no input field on a
`content` page** ("Content pages can't contain input fields…"); every
`visibleIf.fieldId` resolves to an existing **earlier** field; single/multi/
dropdown have ≥2 options; every `image_block` has non-empty `altText`; ≥1 page is
visible under empty responses (completable). Warnings (allow-with-confirm):
`requiredToContinue` on a page with no required fields.

### 6.3 Dispatch (Send), re-send, unpublish

- **Send** (captain, separate from Publish) opens an activation pinned to the
  **currently-published version** (immutable on the activation) and fans out
  `required_actions` via `openActivation()`. Scope (§6.4), blocking, dueAt.
- **Invariant:** at most **one OPEN activation per key** (enforced by a partial
  unique index on `questionnaire_activations(questionnaire_key) WHERE status =
  'open'`), which transitively gives each targeted user at most one open
  obligation per key. Activations are immutable once opened; to change
  scope/blocking/dueAt the captain **closes** the current activation and opens a
  fresh one (a second overlapping open is forbidden).
- **`closeActivation(activationId)`** (captain, new): one transaction — set
  activation `status='closed'`, `closedAt=now`, and UPDATE its **still-linked**
  pending `required_actions` (where `activationId` still equals this activation)
  to a **non-gating terminal `expired`** (not delete — preserves §7 metrics).
  Responses + `questionnaire_edits` untouched.
- **Unpublish** = `status='unpublished'` + `closeActivation` on all its open
  activations (clears pending gates, preserves responses). Re-publish allowed.
- **Structural-edit safety (defence in depth):** single↔multi morph and
  constraint-narrowing on a **published field with responses** are disabled in the
  editor **and** rejected server-side (force a new version).

### 6.4 Send/Activate screen (functional, undrawn)

- Scope: **everyone / team / team-leads / individual** (no opt-in — §8).
  `individual` renders a **member multi-select** (filter by name/email) writing
  `questionnaire_activation_targets`.
- `blocking` defaults **off**; a confirm dialog is required for
  **everyone + blocking**.
- `dueAt` optional (`null` = no deadline); past-due is **flagged, not
  hard-rejected** in v1; `satisfyRequiredAction` ignores `dueAt`. The runner /
  blocking-chrome surfaces it; reminders fire a fixed window before it; metrics
  highlight overdue.

---

## 7. Metrics, responses & reminders

Captain-only, published-only, **builder questionnaires only** (code-questionnaire
metrics are out of scope — they store in bespoke tables). Routes under §4.

### 7.1 Derivations (single source of truth)

- **completed** = `required_actions.status='completed'` (set together with
  `responses.completedAt` on submit). **pending** = `status='pending'`. **sent** =
  rows for `actionKey` pointing at the **active** activation (prior reach is not
  reconstructable — state this).
- **completion %** = completed / (pending + completed), excluding waived/expired.
- **non-responders** = the `status='pending'` rows (no anti-join).
- Deleted users cascade out of both sides (acknowledge the count drift).

### 7.2 Per-kind aggregation

| Kinds | Surface |
|---|---|
| single_select, multi_select, combobox, boolean, slider-segmented, number | histogram (value counts) |
| slider-continuous | numeric summary (min/max/avg/median) |
| short_text, long_text, email, phone, image, date | **response count only** (no value breakdown — PII) |

### 7.3 Responses surface (the "collect" payoff — was missing)

- Per-questionnaire **responses table**: one row per completed respondent (name,
  completedAt, then a column per field rendered via `displayResponseValue`).
- Per-respondent **detail view**.
- **CSV export** (one row per response; columns = fields).
- Retention: latest answer per (user, key); historical "what changed" lives in
  `questionnaire_edits`. Response **erasure** is a §8 non-goal.

### 7.4 Reminders

A captain action on the metrics surface broadcasts to the **pending** users for
the active activation: reuse `broadcasts` → `notification_deliveries` →
`push_tokens`. Auto-fill `title = questionnaire.title`, default body "Reminder:
<title> is due <dueAt>. Tap to complete.", `refType='questionnaire_activation'`,
`refId=activationId`. **Dedup** ≤1 per (user, activation) per 24h; skip users
with no push token; no custom-message UI in v1.

---

## 8. Non-goals (v1)

Native/Capacitor (builder is **web-only**); **opt-in / pull-model** audience
(captains dictate audience); editing the bespoke code questionnaires
(burner/dietary/driver) in the builder — **burner profile stays fully separate**;
government-ID-grade encrypted fields and the **mirror-to-profile-column PII** half
(mockup frame 11); arbitrary image aspect on the respondent `image` **input**
field (square-crop only — `image_block` is exempt and supports landscape/full-
width); date min/max constraints; multi-condition / AND-OR / forward-reference
branching; markdown/HTML in author content; **response erasure / member-departure
handling**; i18n. Undrawn surfaces (Send/Activate, metrics, responses, logic
editor, email/phone/number/dictation editors) are **built functionally with
existing `@camp404/ui` components** — good-enough polish.

---

## 9. Phase plan (v1 = A–F)

Each phase ends green on `pnpm turbo run lint typecheck test build`.

**Phase A — Types & schema contract.**
- `@camp404/types`: add `BuilderQuestionnaire` parallel type + `Block` /
  `ContentBlock` unions (per §2 discriminants); add kinds `email`, `phone`,
  `boolean`; add `slider.display`, `short_text.placeholder`,
  `long_text.enableDictation`; add `page.type` / `requiredToContinue` /
  `visibleIf`. Keep legacy `Questionnaire`/`QuestionsPage`/`IntroPage` intact.
- Make `validateResponses` / `displayResponseValue` / `diffResponses`
  **block-aware** via `getQuestionBlocks(page)` (returns wrapped questions for
  builder pages, `page.questions` for legacy) and **visibility-aware** (§5.1);
  content blocks never become response keys; add `displayResponseValue` cases for
  `boolean`(Yes/No)/`email`/`phone`. Add `validateBuilderQuestionnaire`
  (publish-time §6.2) and `classifyChange` (§6.1). Tests, incl. a
  `[header_break, question, explainer]` page asserting no content-block keys leak.
- Loader: widen `definition` to `$type<Questionnaire | BuilderQuestionnaire>()`;
  `getQuestionnaireDefinition(key, version?)`; read-time discrimination (§2);
  assert in-JSONB version == row version.
- **DB (migration 0017):** ALTER `questionnaire_definitions` → add
  `status` (pgEnum, NOT NULL DEFAULT `draft`), `version` (text NULL until
  publish), `createdBy` (uuid FK users ON DELETE SET NULL). Backfill the seeded
  `burner_profile` row → `status='published'`, `version`=seeded version. Add
  `questionnaire_versions` (PK `(definitionKey, version)`; `definition` jsonb NOT
  NULL; `publishedAt`; `publishedByUserId` FK SET NULL). Add
  `questionnaire_responses` (`id` PK; `userId` FK ON DELETE CASCADE;
  `definitionKey` text — **not a FK**, survives delete; `definitionVersion` text
  NOT NULL; `responses` jsonb; `completedAt` NULL; `updatedAt`; `activationId` FK
  NULL; **`unique(userId, definitionKey)`** [latest-answer]; index `(definitionKey)`).
- AGENTS.md amendment (already landed on this branch).

**Phase B — Generic runner + renderers + gate routing.** Content-block renderers
(§3.1); new input renderers (boolean switch, email/phone, slider segmented
variant); page→block runner with the §5 access predicate, progress, save/resume,
and edge states; extend `nextGate`/`PendingAction` so `type='questionnaire'` keys
not in the static map route to `/questionnaires/[activationId]` (carry
`activationId`); preview mode. e2e: receive activation → open → submit →
required_action completed; direct-nav-while-blocked redirect.

**Phase C — Builder surfaces.** Hub (excludes reserved code keys) + canvas + sheet
editors; `@dnd-kit` reorder + keyboard fallback; save semantics (§4.2);
add-field/add-block catalog + search; field/content-block/page-settings editors;
new-questionnaire creation + key gen; hub-row overflow ops (rename/duplicate/
delete/unpublish); edit-published banner; settings gear; clearance split (§4.1).
Tests incl. team-lead-cannot-publish and team-lead-edits-only-own-draft.

**Phase D — Publish / Send / lifecycle.** `classifyChange` + publish (cosmetic
in-place vs version bump); `validateBuilderQuestionnaire` gate; version snapshot to
`questionnaire_versions`; `closeActivation`; unpublish cascade; one-open-activation
invariant + activation-version capture; Send/Activate screen (§6.4) incl. member
multi-select + everyone+blocking confirm.

**Phase E — Metrics + responses + reminders.** Metrics derivations (§7.1–7.2);
Responses table + per-respondent view + CSV (§7.3); membership-page per-member
completion status (states from the `questionnaire-queue` types:
complete/next-up/locked/expired); push reminders (§7.4).

**Phase F — Conditional branching.** Runtime `evalVisibleIf` (§5.1); visibility-aware
validator; progress recompute over visible pages; back-nav re-show retains
answers; publish satisfiability check (≥1 visible page under empty responses);
functional logic editor ("show this when [earlier field] [op] [value]", undrawn).

---

## 10. Reuse map

| Need | Existing precedent |
|---|---|
| Definition load (validate-or-fall-back) | `apps/web/lib/questionnaire-definitions.ts`, `packages/db/src/questionnaire-definitions.ts` |
| Member field rendering / preview | `apps/web/components/questionnaire/question.tsx` (`FieldInput`) |
| Runner / wizard / blocking chrome | `apps/web/components/questionnaire/{wizard,blocking-chrome}.tsx` |
| Validation / diff / display | `packages/types/src/questionnaire.ts` |
| Gate + preview-but-locked | `apps/web/app/captains/camp-settings/page.tsx` + `CaptainLock`; `packages/core/src/access.ts` |
| List reorder / rename | `captains/camp-settings/team-settings-manager.tsx`; home Customize `@dnd-kit` |
| Compose → draft → publish, per-record edit/delete | `captains/announcements/announcements-manager.tsx` |
| Dispatch / gate spine | `packages/db/src/activations.ts` (open/satisfy/**closeActivation new**), `apps/web/lib/required-actions.ts` (`nextGate`/`ACTION_ROUTES`), `packages/db/src/versions.ts` |
| Change-log | `packages/db/src/questionnaire-edits.ts` (key-driven; records who/when/from-version) |
| Image / voice | `/api/uploads/avatar` (square, input field); new non-square path for `image_block`; `/api/voice/transcribe` (Groq) |
| Push fan-out | `broadcasts` → `notification_deliveries` → `push_tokens` |
| Queue states (membership page) | `packages/types/src/questionnaire-queue.ts` |
