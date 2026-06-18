# Questionnaire builder — mockup frame spec

> The frame-by-frame brief for `design/questionnaire-builder.pen`. The captain
> questionnaire builder is the **first surface with no Pencil board** (the rest
> of the app was designed in `app.pen` first — see `docs/design-system.md` and
> the "design is done, build to it" rule). Pencil can't run in the headless
> agent sandbox, so this doc is the spec to draft the `.pen` **locally** (`pencil
> login` → draft → export to `design/exports/`). Mock against `@camp404/ui`
> tokens + existing leaves; keep the warm orange/red `--color-primary` as the
> only accent.

## What this surface is

A captain-facing builder that turns questionnaires from hand-coded constants
into in-app, Google-Forms-style editable forms (owner ask, 2026-06-18). It
authors the existing `@camp404/types` `Questionnaire` shape — so the member-side
renderer (`apps/web/components/questionnaire/question.tsx`), validator, gate, and
replay tool are **reused unchanged**; the builder only adds the authoring half.

**Scope:** full parity (branching, per-field PII metadata, generic image) — but
mock the core authoring loop first; the parity extras are a clearly-separated
later frame set.

## Reuse map (don't redesign these)

| Need | Existing precedent to mirror |
|---|---|
| Gate ladder + preview-but-locked | `apps/web/app/captains/camp-settings/page.tsx` (requireClearance "captain" → editor; else shell + `CaptainLock`, data withheld server-side) |
| List rows: reorder / rename / archive | `camp-settings/team-settings-manager.tsx` (ArrowUp/Down, inline pencil→`InputField`→Check/X, archive `Switch`, server-action-then-`router.refresh`, no optimistic UI) |
| Drag reorder (alternative) | home Customize `@dnd-kit` (`#90/#93`) |
| Compose → draft → publish, per-record edit/delete | `captains/announcements/announcements-manager.tsx` |
| Hub tile + route gate | `captains/tools/page.tsx` (`TOOLS[]` `NavCard`/ToolEntry) |
| Live field preview | the member renderer `question.tsx FieldInput` rendered with the in-progress descriptor |

## Field-type palette (the authoring-side inverse of `FieldInput`)

Each kind the builder can add, with its editable params and the `@camp404/ui`
leaf the **member** side renders it with (the preview reuses these):

| Kind | Author params | Member leaf |
|---|---|---|
| `number` | prompt, helper, min, **max (default 6)**, step, required | `input` (`type="number"`, min/max) |
| `slider` | prompt, helper, min, max, step, min/max labels, required | `slider` |
| `single_select` | prompt, helper, options[], required | `option-card-group` |
| `multi_select` | prompt, helper, options[] (≥2), required | `checkbox` rows |
| `scale` | prompt, helper, steps[], required | `option-card-group` |
| `toggle` | prompt, helper, options[] (2–4), required | `segmented-control` |
| `combobox` | prompt, helper, options[], placeholders, required | `combobox` |
| `short_text` / `long_text` | prompt, helper, maxLength, required | `input` / `textarea` |
| `date` | prompt, helper, required | `date-control` |
| `image` | prompt, helper, required | `avatar-upload` |

> `number` is the burner-profile team-interest input per the Pencil board (a 0–6
> number input, range configurable, default max 6) — it replaces the slider that
> was built by mistake. It is also a generic palette kind a captain can add to
> any questionnaire.

## Frames (one per screen / state)

1. **`hub`** — `/captains/questionnaires`. List of questionnaires (title ·
   `Badge` status published/draft · question count · updatedAt), a "New
   questionnaire" `Button`. Non-captain: rendered shell + `CaptainLock`.
   Leaves: `nav-card`/`card`, `badge`, `icon-badge`, `button`, `ghost-back`,
   `captain-lock`.

2. **`editor-empty`** — new/blank questionnaire: `input` title, `textarea`
   description, an `empty-state` with an "Add question" CTA opening the palette.

3. **`editor-populated`** — ordered list of question cards grouped by page.
   Each card: kind `icon-badge`, prompt, a `required` `switch`, edit + delete,
   and reorder (ArrowUp/Down or `@dnd-kit` drag handle). A "+ Add question" and
   "+ Add page" footer. Leaves: `card`, `icon-badge`, `switch`, `button`,
   `divider`, `section-header`.

4. **`palette-sheet`** — picking a kind: a `dialog` (or sheet) with the kind grid
   from the palette table, each an `option-card-group`-style card with the kind's
   icon + name + one-line hint.

5. **`field-editor-select`** — editing a `single_select`/`multi_select`/`toggle`/
   `combobox`/`scale`: prompt + helper `input`s, `required` `switch`, and an
   **options editor** — reorderable rows (label `input` → value auto-slugged,
   immutable once saved), add/remove, `Alert` if < 2 options. Encodes the
   stable-`value` + soft-delete invariant (archived options retained so stored
   answers still validate).

6. **`field-editor-number-slider`** — editing `number`/`slider`: prompt, helper,
   min, max (**default 6**), step, optional min/max labels (slider only).

7. **`field-editor-text-date-image`** — editing `short_text`/`long_text`
   (maxLength), `date`, `image`.

8. **`live-preview`** — a pane/tab rendering the in-progress question via the real
   member `FieldInput`, so the captain sees exactly what members see.

9. **`publish-confirm`** — draft→publish. A structural diff drives an `Alert`:
   - cosmetic (relabel/reorder/required unchanged value-domain): "No re-submit
     needed."
   - shape change (question added/removed, required flipped): "This re-opens the
     questionnaire — **N members** will need to re-submit." + version bump.
   Then a scope picker (everyone / team / team-leads / individual) → opens an
   activation. Leaves: `alert`, `select`/`segmented-control`, `button`.

### Parity extras (separate later frame set)

10. **`branching`** — per-question show-if rule editor (depends-on question +
    operator + value).
11. **`field-pii`** — per-field toggle: store encrypted / mirror to a profile
    column (the `id.number` / `profile.image` carve-outs become declarative).
12. **`image-config`** — generic image (decouple the avatar square-crop).

## Open design questions for the mock

- Reorder affordance: ArrowUp/Down (team-settings parity, simplest) vs `@dnd-kit`
  drag (home Customize parity, nicer on touch). Pick one in the mock.
- Editor layout: inline-expand each question card vs a right-hand/overlay editor
  panel + live preview. The preview pane (frame 8) argues for a two-pane layout
  at wider viewports, single-column stack at 430px.
- Page model: surface pages explicitly (add/name/reorder pages) or keep it a flat
  question list and auto-paginate. The runtime supports `intro` pages too.
