# Questionnaire builder — v1 functional spec

Authoritative spec for the in-app, captain-facing questionnaire builder. Owner
ask (2026-06-18): questionnaires should be **editable inside the app, like Google
Forms**, not hand-coded each time. Authorized scope = **v1 phases A–F (incl.
conditional branching)**.

- Design source of truth: the 10 `FB · …` boards in `design/app.pen` (boards
  49–58), which realize and evolve `design/questionnaire-builder.mockup.md`.
- Builder **P1 already shipped** on `main` (PRs #112/#113): the
  `questionnaire_definitions` table, a DB module + web loader facade with tests,
  the `number` field kind, and the burner-profile definition seeded
  behaviour-preservingly. This spec builds on that — it does not redo it.

## 1. Architecture: two questionnaire classes

The builder is a **deliberately scoped** dynamic content engine — see the
amended "Bespoke over generic" stance in `AGENTS.md`.

- **Code questionnaires** (`burner_profiles`, `dietary_requirements`,
  `driver_profiles`): bespoke tables, structured columns read relationally by
  other features (kitchen reads allergies, logistics reads seats), special
  handling (ID encryption, team-config injection). **Untouched in v1.** The
  burner-profile onboarding **stays bespoke for v1.**
- **Builder questionnaires**: generic `definition` (data, not code) + generic
  `questionnaire_responses` (JSONB keyed by field id) + the data-driven runner.

Both classes share the existing dispatch/gate spine
(`questionnaire_activations` → `required_actions` →
`satisfyRequiredAction`/version-reopen) with **no rework**. They share nothing
else; this coexistence is permanent, not transitional.

## 2. Canonical model: paged + blocks

One stored shape. The flat board-50 view is a **single-page special case** (one
auto-created Questions page, page chrome hidden until a 2nd page or content block
is added), **not** a second schema. New questionnaires **default to 1 page**.

```
BuilderQuestionnaire = { version, title, pages: Page[] }
Page  = { id, type: 'question' | 'content', title, intro?, requiredToContinue, blocks: Block[], visibleIf? }
Block = QuestionBlock(wraps existing Question)  |  ContentBlock
ContentBlock = header_break | explainer | image_block | divider     // display-only
```

- Content blocks **never enter the response map**; skipped by
  `validateResponses`/`diffResponses`.
- Page `type` is a **declarative label** (affects respondent chrome/progress
  copy), not a hard constraint. Content blocks may appear on any page; input
  fields only on Question pages (a Content page with an input is an authoring
  error flagged at publish).
- **Page boundaries = array entries** (one Page = one screen). The catalog
  "Page break" is an **authoring convenience** that splits into a new Page on
  save — not a stored block.
- `visibleIf` (optional, on pages and blocks) drives **conditional branching**
  (phase F): `{ fieldId, op, value }`. Strictly declarative; no scripting.

## 3. Field & block catalog

### Input fields (`Question` discriminated union in `@camp404/types`)

| Builder palette | Stored kind | State | Notes |
|---|---|---|---|
| Short text | `short_text` | exists | `placeholder?`, `maxLength` stepper |
| Long text | `long_text` | exists | optional **Enable dictation** toggle (default off) → existing Groq `/api/voice/transcribe` |
| Email | `email` | **new** | format-validated; reuse onboarding email input if present |
| Phone | `phone` | **new** | format-validated; reuse onboarding phone input; no new deps |
| Number | `number` | exists (#113) | min/`max`(default 6)/step |
| Scale | `slider` + `display:'segmented'` | extend | a **row of number buttons** to pick from (not a slider visual) |
| Slider | `slider` + `display:'continuous'` | exists | numeric min/max/step + low/high labels |
| Single select | `single_select` | exists | `options[]`; "Allow multiple" morph → `multi_select` at **authoring time only** |
| Multi select | `multi_select` | exists | `options[]` |
| Dropdown | `combobox` | exists | searchable single-select (palette label "Dropdown") |
| Date | `date` | exists | no min/max in v1 (platform-`Date` rule) |
| Toggle | `boolean` | **new** | on/off; response union already allows `boolean` |
| Image upload | `image` | exists | reuse avatar Blob pipeline (`/api/uploads/avatar`) |

**Name/shape collisions — resolved:** the legacy `scale` kind (categorical
`steps[]`) and legacy `toggle` kind (2–4 option segmented, used by `id.type`)
stay as-is for code questionnaires. The builder palette's "Scale" maps to
`slider` (segmented variant) and "Toggle" maps to the **new** `boolean` kind —
distinct discriminator literals, no collision.

### Content blocks (new `ContentBlock` union — display-only)

| Block | kind | Params |
|---|---|---|
| Header break | `header_break` | headingText, eyebrow?, subtext?, alignment(left/center) |
| Explainer | `explainer` | bodyText, style(plain/note/callout/warning) |
| Image | `image_block` | imageUrl, caption?, altText (a11y), sizeFit(fit/fill/full-width) |
| Divider | `divider` | — |

> `image_block` (display-only, camp-owner uploads) is distinct from the `image`
> **input** field (respondent uploads, captures a URL). Board 58's "Edit field"
> title is a mock label error for "Edit block".

## 4. Builder surfaces (captain authoring) → routes

Under `/captains/questionnaires/*`. Server-gated, **preview-but-locked** via
`requireClearance` + `CaptainLock` (mirror `captains/camp-settings`). Client
islands manage edit state via server actions + `router.refresh()` (mirror
`team-settings-manager` / `announcements-manager`). Reorder via `@dnd-kit`.

| Board | Screen | Route |
|---|---|---|
| 49 | Hub: list (status badge, question count, edited date), New, empty state | `/captains/questionnaires` |
| 50 / 54 | Build canvas: paged block list, add/reorder/delete, footer Preview + Publish | `/captains/questionnaires/[key]` |
| 51 / 56 | Add field / Add block bottom-sheet catalog (grouped, **real** search filter) | sheet in canvas |
| 52 / 53 | Field editor (per-kind params, options editor, live respondent preview) | sheet in canvas |
| 55 | Pages & page settings (title/intro/type/requiredToContinue; reorder; delete) | sheet in canvas |
| 57 / 58 | Content-block editors (header/explainer/image) with previews | sheet in canvas |
| — | Preview = **real runner** against the draft, no persistence, no side-effects | `/captains/questionnaires/[key]/preview` |
| — | Send/Activate (functional, undrawn — §6) | `/captains/questionnaires/[key]/send` |

**Permissions:** **team-leads can DRAFT** (create/edit drafts); **only captains
can PUBLISH or SEND.** Clearance: draft access ≥ `team_lead`; publish/send =
`captain`.

## 5. Respondent runner

A data-driven runner renders builder definitions: pages → blocks; content blocks
display-only; **"Page N of M · X%"** progress (board 58); Continue/Back. Reuses
`validateResponses()` unchanged (already generic) once content blocks are
filtered; reuses the member `FieldInput` leaves. Loads/saves via
`questionnaire_responses`; on submit calls `satisfyRequiredAction(userId, key,
version)`.

**Routing:** add a dynamic `ACTION_ROUTES` resolver — builder `actionKey`s route
to a single generic runner (key on **activationId** so it carries scope +
version snapshot). Static map stays for the 3 code keys.

**Three orthogonal gates:** (a) field `required` (blocks page advance); (b) page
`requiredToContinue` — on a Content page = "must press Continue"
(acknowledgement); on a Question page = redundant with field-required; (c)
activation `blocking` (whole-app gate) — lives **only** on the activation.

## 6. Lifecycle: publish / unpublish / version

Status = **`draft` / `published` / `unpublished`**.

- **Publish** (captain): runs a **structural diff** (mockup frame 9): cosmetic
  change (relabel/reorder) → "no re-submit needed"; shape change (field
  added/removed, required flipped, kind changed) → **version bump** + "N members
  must re-submit". Publishing snapshots an **immutable version**; the
  publish-confirm flow then collects **audience scope** (everyone / team /
  team_leads / individual / opt_in) + **blocking** + **due date** →
  `openActivation()`. Default: never silently blast everyone-blocking.
- **Edit a published questionnaire** → forks a new **draft version**; old version
  stays renderable for historical responses. Drafts edit freely in place.
- **Unpublish** → take offline; closes open activations (clears pending
  `required_actions`). Preserves responses + change-log.
- **Delete:** drafts hard-delete; published-with-responses → archive/unpublish,
  never destroy responses. Block IDs are **stable UUIDs** so responses + the
  change-log survive relabels.
- **"Allow multiple" morph** (single↔multi changes response type string↔string[])
  is authoring-time only; **locked** once a published field has responses (else
  forks a version).

## 7. Metrics + reminders

- **Captain per-questionnaire metrics:** sent / completed / pending counts,
  completion %, per-question distributions (choice/scale/boolean), **non-responder
  list**. Aggregated from `questionnaire_responses` + `required_actions`.
- **Per-member completion status on the membership page** (which questionnaires a
  member has completed / has pending).
- **Push reminder to non-responders:** from the metrics surface, reuse
  `broadcasts` → `notification_deliveries` → `push_tokens`; target only members
  with a pending `required_action` for that questionnaire.

## 8. Non-goals (v1)

Native/Capacitor (builder is **web-only**); government-ID-grade encrypted fields
(no generalizing the burner ID-encryption); arbitrary image aspect/crop (reuse
square avatar pipeline); date min/max constraints; migrating the burner-profile
onboarding to the composable model (stays bespoke). Undrawn screens
(Send/Activate, metrics) are **built functionally with existing `@camp404/ui`
components** — good-enough polish, not Pencil-first.

## 9. Phase plan (v1 = A–F)

Each phase ends green on `pnpm turbo run lint typecheck test build`.

**Phase A — Types & schema contract.** Build on shipped P1.
- ALTER `questionnaire_definitions`: add `status` (draft/published/unpublished),
  `version`, `createdBy` → migration 0017 (drizzle-generated).
- New `questionnaire_responses` table (userId, definitionKey/version, responses
  jsonb, completedAt?, updatedAt; unique(userId, definitionKey)).
- `@camp404/types`: add kinds `email`, `phone`, `boolean`; `slider.display`;
  `ContentBlock`/`Block` union; page `type`/`requiredToContinue`/`visibleIf`
  (schema only). Keep existing `Questionnaire`/`QuestionsPage`/`IntroPage` intact.
- Extend `validateOne`/`displayResponseValue`/`diffResponses`; block-aware
  flatten; content blocks excluded. Tests.
- Land the `AGENTS.md` amendment (done in this branch's first commits).

**Phase B — Generic runner + renderers + gate routing.** Content-block
renderers; new input renderers (boolean switch, number/email/phone, slider
segmented variant); page→block runner with "Page N of M · %" + the three gates;
dynamic `ACTION_ROUTES` resolver; member runner route + save/submit; preview
mode (no side-effects). Reuse the shipped loader facade + member `FieldInput`.

**Phase C — Builder surfaces.** Hub + canvas + sheet editors; `@dnd-kit` reorder;
autosave structural ops vs explicit-Save editors; add-field/add-block catalog
sheet w/ search; field + content-block + page-settings editors; default 1 page;
**team-lead draft / captain publish** clearance. Tests incl. the permission split.

**Phase D — Publish / Send / lifecycle.** Status model + immutable
snapshot-on-publish + structural-diff confirm; edit-published forks a version;
unpublish closes activations. Send/Activate screen (scope + blocking + dueAt →
`openActivation()`), captain-only.

**Phase E — Metrics + reminders.** Captain per-questionnaire metrics;
membership-page per-member status; push reminders to non-responders.

**Phase F — Conditional branching.** Runtime `visibleIf` (show/skip pages+blocks;
hidden required fields don't block; progress recomputed); validator skips hidden
requireds; a functional logic editor in the builder.

## 10. Reuse map

| Need | Existing precedent |
|---|---|
| Definition load (validate-or-fall-back) | `apps/web/lib/questionnaire-definitions.ts`, `packages/db/src/questionnaire-definitions.ts` |
| Member field rendering / preview | `apps/web/components/questionnaire/question.tsx` (`FieldInput`) |
| Runner / wizard | `apps/web/components/questionnaire/wizard.tsx` |
| Validation / diff / display | `packages/types/src/questionnaire.ts` |
| Gate + preview-but-locked | `apps/web/app/captains/camp-settings/page.tsx` + `CaptainLock` |
| List reorder / rename | `captains/camp-settings/team-settings-manager.tsx`; home Customize `@dnd-kit` |
| Compose → draft → publish | `captains/announcements/announcements-manager.tsx` |
| Dispatch / gate spine | `packages/db/src/activations.ts`, `apps/web/lib/required-actions.ts` |
| Image upload | `/api/uploads/avatar` (Vercel Blob); voice → `/api/voice/transcribe` |
| Push fan-out | `broadcasts` → `notification_deliveries` → `push_tokens` |
