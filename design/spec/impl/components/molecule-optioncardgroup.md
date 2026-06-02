# OptionCardGroup — molecule plan

- **mapsTo:** PROMOTE (pattern is hand-rolled inside `apps/web/components/questionnaire/question.tsx` as inline JSX; no dedicated file exists)
- **Target file:** `packages/ui/src/components/option-card-group.tsx`

---

## Current state — does it exist? where? gap vs spec

**Confirmed absent from `packages/ui/src/components/`** — the directory contains no
`option-card-group.tsx`, `radio-card.tsx`, `checkbox-card.tsx`, or any equivalent
(verified by `ls packages/ui/src/components/`).

**Hand-rolled patterns confirmed in `apps/web/components/questionnaire/question.tsx`:**

The `FieldInput` function at `question.tsx:87–241` contains three inline option-card
renderings, none extracted as a named component:

| Pattern | Boards sourced from | Where in `question.tsx` |
|---|---|---|
| `single_select` rendered as a shadcn `<Select>` dropdown | — | Lines 128–145 |
| `multi_select` as stacked Checkbox + Label rows (NOT cards) | S05 field kinds (board 14) | Lines 146–174 |
| _(no_ `RadioCardGroup` _or chip-grid variant exists at all)_ | — | — |

**Gap vs spec (cite):**

1. **No radio cards anywhere.** `question.tsx` renders `single_select` as a
   dropdown `<Select>`, but OB Step 07 (board 45), OB Step 08 (board 46), OB Step
   09 (board 47), OB Step 10 (board 48), and S26 (board 35 `Radio-*` rows) all draw
   stacked radio-card rows. `04-onboarding-wizard.md` §Divergences item 4 explicitly
   flags this: "Live `question.tsx` renders `single_select` as a shadcn `<Select>`
   dropdown, but boards 08/09/10 draw stacked radio cards. Resolution (locked): render
   `single_select` (and the already-card `scale`) as RadioCardGroup."

2. **Checkbox card rows not implemented.** `question.tsx` renders `multi_select` as
   plain `Checkbox + Label` pairs (gap-2 flex rows, no card border). OB Step 08
   (board 46) and OB Step 09 (board 47) draw full-width card rows with `r:$radius
   fill:$card stroke:$primary` when checked. S26 MULTI-SELECT block (board 35
   lines 63–85) draws the same full-card checked treatment.

3. **Chip-grid (dietary) not implemented at all.** OB Step 11 (board 49) draws a
   2-column grid of compact chips `{pad:[10,12] r:$radius fill:$muted stroke:$border}`
   with an 18px checkbox box `{r:5}`. No such variant exists anywhere in the
   codebase. `04-onboarding-wizard.md` §Divergences item 6 confirms this is absent
   and required.

4. **Token drift in the live Checkbox rows.** `question.tsx:162` uses
   `className="text-sm font-normal"` and inline styling; no card container, no
   `bg-card`, no selected tint. Tokens are expressed in verbose `[color:var(--color-*)]`
   form (P1-5 codemod target per `design-tokens.md` §4 item 22).

**Classification: PROMOTE** — the pattern must be extracted from `apps/web` inline
JSX and built to spec as a single `@camp404/ui` component that covers all three
absorbed candidates.

---

## API — props, variants, sizes, states

### TS prop interface

```ts
export interface OptionCardOption {
  /** The value stored/emitted for this option. */
  value: string;
  /** The label rendered inside the card. */
  label: string;
  /** Optional description line below the label (future extensibility; not drawn on current boards). */
  description?: string;
}

export interface OptionCardGroupProps {
  /** The available choices. */
  options: OptionCardOption[];

  /**
   * "single" — one selection; renders a radio indicator per row.
   * "multi"  — multiple selections; renders a checkbox per row.
   */
  mode: "single" | "multi";

  /**
   * "stack"     — full-width stacked rows (default; used for RadioCardGroup,
   *               CheckboxCardGroup, single/multi-as-cards).
   * "chip-grid" — 2-column compact chip grid (used for CheckboxChipGrid /
   *               dietary step 11). Only meaningful with mode="multi".
   */
  layout?: "stack" | "chip-grid";

  /**
   * Controlled selected value(s).
   * - mode="single"  → string | undefined
   * - mode="multi"   → string[]
   */
  value: string | string[] | undefined;

  /** Called with the new value when the user selects / deselects an option. */
  onChange: (value: string | string[]) => void;

  /** Disables all interactions when true. */
  disabled?: boolean;

  /**
   * When true, the group is in an error state. The first unselected required
   * group renders a destructive ring. (Error copy is rendered by the host
   * QuestionField / InputField shell, not by OptionCardGroup itself.)
   */
  error?: boolean;

  /** aria-labelledby pointing to the parent label id (set by host QuestionField). */
  "aria-labelledby"?: string;

  /** aria-label when no labelledby is available. */
  "aria-label"?: string;

  className?: string;
}
```

### Variants

| Variant name | Trigger | Visual |
|---|---|---|
| `single-radio / stack` | `mode="single" layout="stack"` (default layout) | Full-width stacked rows; `circle` radio indicator; selected row: `bg-card stroke-primary`; unselected: `bg-transparent stroke-border` |
| `multi-checkbox / stack` | `mode="multi" layout="stack"` | Full-width stacked rows; `rounded-sm` checkbox indicator `r:6` (sm); checked row: `bg-card stroke-primary`; unchecked: `bg-card stroke-border` |
| `multi-checkbox / chip-grid` | `mode="multi" layout="chip-grid"` | 2-column grid of compact chips; 18px checkbox box `r:5` (smaller than stack); checked chip: `bg-primary/8 stroke-primary`; unchecked: `bg-muted stroke-border` |

### Sizes

No explicit `size` prop. The component has two fixed anatomical sizes driven by
layout:

- **`stack`:** row `pad:[14,16]` (`py-3.5 px-4`), indicator 20×20, label
  `Inter/15px/600` (OB steps 07/08/09/10 boards; 14px/normal in S26 runner context —
  see note below), gap between indicator and label = 12px.
- **`chip-grid`:** chip `pad:[10,12]` (`py-2.5 px-3`), indicator 18×18, label
  `Inter/13px/500`, gap = 9px. Two columns with `gap-8` between chips.

**Text-size note (boards win):** OB step boards (07, 08, 09, 10) use 15px/600 for
option labels in the full-page context; S26 runner card uses 14px/normal for
unselected and 14px/600 for selected. The divergence is context-driven (full-page
vs in-card). `OptionCardGroup` adopts `Inter/14px/600` selected and `Inter/14px/
normal` unselected as the canonical stack-layout label role — this snaps the runner
board exactly and is one step below S05's 15px label (which the OB boards use only
in the larger card page context). Host wrappers (the OB `QuestionBlock` context) may
pass `className` to enlarge labels where needed.

### States

| State | Description |
|---|---|
| None selected | All rows unselected; radio indicators empty circles / checkboxes empty |
| Single selected (radio) | One row: `bg-card stroke-primary`; radio dot filled `$primary`; all others `bg-transparent stroke-border`; empty radio |
| One or more checked (checkbox, stack) | Checked row: `bg-card stroke-primary`; filled checkbox `bg-primary`; check icon `$primary-foreground`; unchecked row: `bg-card stroke-border` |
| Chip checked (chip-grid) | Checked chip: `bg-primary/8 stroke-primary`; filled box `bg-primary`; check icon `$primary-foreground`; unchecked: `bg-muted stroke-border` |
| Selected tint (burn-intent, step 10) | Some radio contexts add a `bg-primary/8` fill to the selected row (OB board 48 `fill:#ff008c14`). Controlled by a `selectedTint` internal class; always applied in chip-grid; in stack, only when the board explicitly draws the tint (step 10 and S26). Resolution: **always apply `bg-primary/8`** on the selected card for consistency — S07/S08/S09 use `$card` (no extra tint) while S26 and S10 use the tint. Adopt the tinted version universally (it is more obviously interactive; S07/S08/S09 use `fill:$card` which is already elevated, so `bg-card` vs `bg-primary/8 over bg-card` is a minor visual delta) |
| Disabled | All rows: `opacity-50 pointer-events-none`; indicators have `stroke-muted-foreground` |
| Error | Group receives `aria-invalid="true"`; an error ring on the group container or individual rows is handled by the host `QuestionField` error line beneath, not by the group itself |

---

## Tokens & type — exact design tokens + type-scale roles

All tokens use short Tailwind form (P1-5; no `[color:var(--color-*)]` verbose form).

### Stack layout — row-level tokens

| Element | Token / utility | Board source |
|---|---|---|
| Row background — unselected (radio) | `bg-transparent` | OB board 45 `fill:#00000000` |
| Row background — unselected (checkbox) | `bg-card` | OB boards 46, 47, 49 `fill:$card` |
| Row background — selected / checked | `bg-card bg-primary/8` | OB board 48 `fill:#ff008c14`; S26 `fill:#ff008c1a`; applied uniformly — see state note above. `#ff008c14` → `primary/8%` per design-tokens.md §4 item 5 |
| Row stroke — unselected | `ring-1 ring-border` | OB boards `stroke:$border` |
| Row stroke — selected / checked | `ring-1 ring-primary` | OB boards `stroke:$primary` |
| Row border radius | `rounded-[--radius]` (10px, `$radius`) | OB boards `r:$radius` |
| Row padding (stack) | `py-3.5 px-4` (14px/16px) | OB board 45 `pad:[14,16]`; board 46 `pad:14` |
| Row gap (indicator → label) | `gap-3` (12px) | OB boards `gap:12` |
| Row gap between rows | `gap-2.5` (10px) | OB boards `gap:10` |

### Radio indicator tokens (stack)

| Element | Token / utility | Board source |
|---|---|---|
| Circle size | `h-5 w-5` (20px) | OB boards `w:20 h:20` |
| Circle shape | `rounded-full` (`--radius-full`) | OB boards `r:999` |
| Stroke — unselected | `ring-1 ring-border` (inline CSS ring) or `border border-border` | OB boards `stroke:$border` |
| Stroke — selected | `border-2 border-primary` | OB boards `stroke:$primary` |
| Inner dot — selected | `h-2 w-2 rounded-full bg-primary` (8px; OB boards); `h-2.5 w-2.5` (10px; OB board 48 step 10) | OB board 45 `◯ Dot w:8 h:8 fill:$primary`; board 48 `◯ dot w:10 h:10 fill:$primary` — use 8px as canonical; 10px is a minor board drift |
| S26 runner variant | `circle-dot` (Lucide) for selected; `circle` for unselected | S26 board 35 lines 28–35 `⊙ circle-dot ($primary)` / `⊙ circle ($muted-foreground)` — equivalent; the OptionCardGroup may render the manual dot or the Lucide icon; prefer the manual dot approach (no Lucide icon gap on small hit targets) |

### Checkbox indicator tokens (stack)

| Element | Token / utility | Board source |
|---|---|---|
| Box size | `h-5 w-5` (20px) | OB boards `w:20 h:20` |
| Box radius | `rounded-sm` (6px, `--radius-sm`) | OB boards `r:6` |
| Stroke — unchecked | `border border-border` | OB boards `stroke:$border` |
| Fill + stroke — checked | `bg-primary border-primary` | OB boards `fill:$primary stroke:$primary` |
| Check icon — checked | `check` (Lucide) in `text-primary-foreground`, `h-3 w-3` | OB boards `⊙ check ($primary-foreground)` |
| S26 box size | `h-5 w-5` (20px) | S26 board 35 line 70 `w:20 h:20` |

### Chip-grid layout — chip-level tokens

| Element | Token / utility | Board source |
|---|---|---|
| Chip padding | `py-2.5 px-3` (10px/12px) | OB board 49 `pad:[10,12]` |
| Chip radius | `rounded-[--radius]` (10px, `$radius`) | OB board 49 `r:$radius` |
| Chip background — unchecked | `bg-muted` | OB board 49 `fill:$muted` |
| Chip stroke — unchecked | `ring-1 ring-border` | OB board 49 `stroke:$border` |
| Chip background — checked | `bg-primary/8` | OB board 49 `fill:#ff008c14` → `primary/8%` per design-tokens.md §4 item 5 |
| Chip stroke — checked | `ring-1 ring-primary` | OB board 49 `stroke:$primary` |
| Chip gap (box → label) | `gap-[9px]` | OB board 49 `gap:9` |
| Grid columns | `grid grid-cols-2 gap-2` (8px) | OB board 49 `gap:8` between chips in a row |
| Grid row gap | `gap-2` (8px) | OB board 49 `gap:8` between rows |
| Checkbox box size | `h-[18px] w-[18px]` | OB board 49 `w:18 h:18` |
| Checkbox box radius | `rounded-[5px]` (snaps to `--radius-sm` at 6px; board says `r:5` — snap per design-tokens.md §3 `r:5/6/7 → sm`) | OB board 49 `r:5` |
| Checkbox stroke — unchecked | `border border-muted-foreground` | OB board 49 `stroke:$muted-foreground` |
| Checkbox fill + stroke — checked | `bg-primary border-primary` | OB board 49 `fill:$primary stroke:$primary` |
| Check icon — checked | `check` (Lucide) in `text-primary-foreground`, `h-3 w-3` | OB board 49 `⊙ check ($primary-foreground)` |

### Label type roles

| Context | Token / utility | Board source |
|---|---|---|
| Stack label — unselected | `text-[14px] font-normal text-foreground` (`--text-body` role) | S26 runner board 35; OB board 46 `Inter/14px/normal/$foreground` |
| Stack label — selected | `text-[14px] font-semibold text-foreground` (`--text-body-strong` role) | S26 runner board 35 selected option `Inter/14px/600/$foreground` |
| Chip-grid label | `text-[13px] font-medium text-foreground` (`--text-label` role) | OB board 49 `Inter/13px/500/$foreground` |

---

## Composition & deps — atoms, primitives, helpers

### Direct atom/primitive dependencies

| Dep | Package | Role |
|---|---|---|
| `Checkbox` | `@camp404/ui/components/checkbox` (REUSE — `packages/ui/src/components/checkbox.tsx` exists) | The board's `r:6` box + `$primary` fill + check icon; used as the underlying checked state primitive for the stack layout. In chip-grid mode, the indicator is rendered manually (18px box at `r:5`) as it deviates from the Checkbox atom's default size — the Checkbox atom does not accept a custom size prop. |
| `cn` | `@camp404/ui/lib/utils` | Tailwind class merging for conditional row classes |

### Accessibility primitives

The component renders a native `role="radiogroup"` (single mode) or a `<fieldset>`
with implicit group role (multi mode). Individual options are:

- **single mode:** `<button role="radio" aria-checked>` or a hidden `<input
  type="radio">` with a styled label wrapper. Prefer the hidden-input approach so
  native form submission is supported and arrow-key navigation is browser-native.
- **multi mode:** `<input type="checkbox">` hidden, wrapped in a styled `<label>`.

### `@camp404/core` helpers

None required. The value selection logic is pure array manipulation that lives
inside the component; it does not touch `rankLevel`, domain models, or any
`@camp404/core` export. The consumer (`QuestionField`) manages the full
`QuestionnaireResponseValue` type; `OptionCardGroup` only sees `string | string[]`.

---

## Absorbs — candidates replaced from the merge map

From `component-library.md` merge map row:

> **OptionCardGroup** | radio-option-row, RadioCardGroup, CheckboxCardGroup,
> single/multi select-as-cards, CheckboxChipGrid | One stacked option-card list;
> `mode=single|multi` swaps radio/checkbox; chip-grid is a layout variant.

| Absorbed candidate | Where it would have lived | Action |
|---|---|---|
| `radio-option-row` | Inline in `question.tsx` `single_select` case | **DELETE** the `<Select>` branch; replaced by `<OptionCardGroup mode="single">` |
| `RadioCardGroup` | Would be `apps/web` component; never extracted | Not built; `OptionCardGroup mode="single"` is the canonical form |
| `CheckboxCardGroup` | Inline in `question.tsx` `multi_select` case (currently renders plain `Checkbox+Label` rows, not cards) | **DELETE** the existing inline checkbox rows; replaced by `<OptionCardGroup mode="multi">` |
| `single/multi select-as-cards` | Inline in `question.tsx` | Same as above |
| `CheckboxChipGrid` | Would be a dietary-page-only inline; never extracted | Not built; `<OptionCardGroup mode="multi" layout="chip-grid">` is the canonical form |

The existing `question.tsx` `multi_select` case (lines 146–174) must be replaced
with `<OptionCardGroup mode="multi" layout="stack">` once the component ships. The
`single_select` `<Select>` case (lines 128–145) is also replaced; `Select` remains
in `@camp404/ui` for other consumers (announcements presentation selector).

---

## Stories & tests

### Storybook stories (`option-card-group.stories.tsx`)

| Story | Props | Purpose |
|---|---|---|
| `SingleStack_None` | `mode="single"`, 4 options, `value=undefined` | All unselected radio rows |
| `SingleStack_Selected` | `mode="single"`, `value="option-1"` | First card selected; primary stroke + dot |
| `SingleStack_BurnIntent` | `mode="single"`, 6 options, one selected | Mirrors OB Step 10 (6 options); selected card also gets `bg-primary/8` tint |
| `MultiStack_None` | `mode="multi"`, 8 options, `value=[]` | All unchecked checkbox card rows |
| `MultiStack_SomeChecked` | `mode="multi"`, `value=["opt-a","opt-c"]` | Two rows show filled checkbox + primary stroke; rest empty |
| `ChipGrid_None` | `mode="multi" layout="chip-grid"`, 12 dietary options, `value=[]` | 2-col grid, all unchecked |
| `ChipGrid_SomeChecked` | `mode="multi" layout="chip-grid"`, `value=["dairy","peanuts"]` | Two chips show primary tint + filled box |
| `Disabled_Single` | `mode="single"`, `disabled=true` | All rows at `opacity-50`; no pointer events |
| `Disabled_Multi` | `mode="multi"`, `disabled=true` | Same treatment; checked items still visually checked but inert |
| `LongLabel` | `mode="single"`, one option with a very long label | Row wraps gracefully; indicator stays top-aligned |
| `RunnerRadioRows` | `mode="single"`, 3 options (mirrors S26 radio block) | Validates S26 `pad:[13,14]` variant in the runner card context |
| `RunnerCheckboxRows` | `mode="multi"`, 4 options (mirrors S26 multi-select block) | Validates S26 checkbox treatment |

### Vitest / RTL test cases (`option-card-group.test.tsx`)

| Test | Assertion |
|---|---|
| Renders a `radiogroup` role in single mode | `getByRole("radiogroup")` present |
| All options initially unselected (single) | All `[aria-checked="false"]` |
| Clicking an option selects it (single) | `onChange` called with `value`; aria-checked flips |
| Clicking a selected option in single mode does nothing | `onChange` not called (radio semantics) |
| Selecting a second option in single mode deselects the first | `onChange` emits the new value; first becomes unchecked |
| Multi mode: clicking unchecked option adds to array | `onChange` called with `[...prev, newValue]` |
| Multi mode: clicking checked option removes from array | `onChange` called with prev minus that value |
| Chip-grid renders 2-column grid | Container has `grid-cols-2` class |
| Chip-grid checked chip has `bg-primary/8` tint | Chip element has the tint class |
| `disabled` blocks click events | `onChange` not called on any click; rows have `pointer-events-none` |
| `aria-labelledby` is passed to the group | Root element `aria-labelledby` matches supplied id |
| Single-mode keyboard: Arrow keys move between options | Focus moves to next/prev option on ArrowDown/ArrowUp |
| Multi-mode keyboard: Space toggles a focused option | Checkbox state toggles on Space |
| `error` prop: group receives `aria-invalid="true"` | `aria-invalid="true"` on the root element |

### A11y notes

- **Single mode** must render as a proper `role="radiogroup"` with individual
  `role="radio"` options. Use hidden `<input type="radio">` elements with `name`
  from the group id so arrow-key navigation is native. The styled label wrapper
  becomes the visual affordance; the input is `sr-only`.
- **Multi mode** must render each option as a `<label>` wrapping a hidden `<input
  type="checkbox">`. The `<fieldset>`/`<legend>` is the host `QuestionField`'s
  responsibility (the field label already wraps the group).
- Each option label must be associated with its input via `htmlFor` / `id` or by
  wrapping.
- Unselected radio indicators must have `aria-checked="false"` (for the button
  pattern) or rely on the native `<input checked={false}>`.
- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring` on the hidden input
  surfacing to the styled row — use Tailwind `peer` utilities so the row receives
  focus styling when the hidden input is focused.
- The `disabled` state must set `disabled` on all underlying inputs, not just add
  `opacity-50` to the wrapper.
- Touch target: the full card row is the hit target (`min-h-[48px]` at minimum —
  boards draw `pad:[13,14]` on 14px text giving ~48px total height, which exceeds
  the WCAG 2.5.8 24×24 minimum).
- `aria-invalid="true"` on the group root when `error=true`; the error message is
  rendered by the host and associated via `aria-describedby` at the `QuestionField`
  level (not this component's concern).

---

## Build steps — ordered + acceptance criteria

**Prerequisite:** `foundations-tokens.md` Phase 0 must have shipped — status tokens
(`--color-success`, `--color-warning`, `--color-info`) in `globals.css`, radius
token scale (`--radius-sm` at 6px, `--radius` at 10px, `--radius-full`), and the
short-form Tailwind token utilities active. `OptionCardGroup` does not directly use
status tokens, but the foundations pass must precede all molecule builds so token
utilities resolve correctly.

### Step 1 — Create `packages/ui/src/components/option-card-group.tsx`

Build the component to the consolidated board spec:

- Export `OptionCardGroup` and `OptionCardGroupProps`.
- Render `role="radiogroup"` (single) or a `<div role="group">` (multi).
- **Single/stack:** map options to full-width rows; hidden `<input type="radio">`
  + styled label; selected row gets `bg-card bg-primary/8 ring-1 ring-primary`; radio
  dot 8px `bg-primary`; unselected `bg-transparent ring-1 ring-border`.
- **Multi/stack:** map options to full-width rows; hidden `<input type="checkbox">`
  + styled label; checked row gets `bg-card bg-primary/8 ring-1 ring-primary` + filled
  `Checkbox` atom at `h-5 w-5 rounded-sm`; unchecked `bg-card ring-1 ring-border`.
- **Chip-grid:** 2-column grid of compact chips; hidden `<input type="checkbox">`
  + styled chip label; checked chip `bg-primary/8 ring-1 ring-primary`; 18×18px box
  at `rounded-[--radius-sm]`.
- All tokens in short Tailwind form — zero `[color:var(--color-*)]` verbose form.
- `"use client"` directive (interactive; manages checked state from controlled props).
- Pass `cn` from `@camp404/ui/lib/utils` for conditional classes.
- The component is **controlled only** — no internal state; all state managed by the
  caller. This keeps it compatible with React Server Component wrappers.

**Acceptance:** component renders in isolation; no verbose token strings; keyboard
navigation functional in all three mode/layout combinations.

### Step 2 — Export from `@camp404/ui`

Add to `packages/ui/src/index.ts` (or the per-component barrel pattern used by the
package — check `packages/ui/package.json` exports map):

```ts
export { OptionCardGroup } from "./components/option-card-group";
export type { OptionCardGroupProps, OptionCardOption } from "./components/option-card-group";
```

**Acceptance:** `import { OptionCardGroup } from "@camp404/ui/components/option-card-group"`
resolves cleanly from `apps/web`.

### Step 3 — Replace `single_select` in `question.tsx`

In `apps/web/components/questionnaire/question.tsx` `FieldInput`, replace the
`single_select` case (lines 128–145):

```tsx
// BEFORE: <Select> dropdown
case "single_select":
  return <Select … />;

// AFTER: radio cards per board affordance
case "single_select":
  return (
    <OptionCardGroup
      mode="single"
      options={question.options}
      value={typeof value === "string" ? value : undefined}
      onChange={onChange}
      aria-labelledby={id}
    />
  );
```

The `Select` import is kept (still used by the announcements presentation selector
in `apps/web/app/captain/announcements/page.tsx` or equivalent); only this one case
switches.

**Acceptance:** single_select questionnaire questions render as card rows, not a
dropdown; OB Step 10 "Are you coming this year?" renders 6 radio cards; OB Step 08
logistics questions render 3-option radio cards.

### Step 4 — Replace `multi_select` in `question.tsx`

Replace the `multi_select` case (lines 146–174):

```tsx
// BEFORE: inline Checkbox+Label rows (no card borders)
case "multi_select":
  return <div className="flex flex-col gap-2"> … </div>;

// AFTER: checkbox card rows
case "multi_select":
  return (
    <OptionCardGroup
      mode="multi"
      layout={question.chipGrid ? "chip-grid" : "stack"}
      options={question.options}
      value={Array.isArray(value) ? (value as string[]) : []}
      onChange={onChange}
      aria-labelledby={id}
    />
  );
```

**Note on `chipGrid`:** the `Question` type in `@camp404/types` does not currently
carry a `chipGrid` flag — the dietary questions are the only chip-grid consumers
and they are identified by question id at the questionnaire level
(`dietary.dislikes`, `dietary.allergies`). Two options:
  - (a) Add an optional `chipGrid?: boolean` field to `MultiSelectQuestion` in
    `@camp404/types/questionnaire.ts` and set it on the dietary questions.
  - (b) Have `QuestionField` / `FieldInput` pass `layout="chip-grid"` only for
    those specific question ids (caller knowledge).

**Recommended: option (a)** — keeps `OptionCardGroup` purely presentation-driven;
the data contract carries the layout intent. Flag as a `@camp404/types` EXTEND
(small addition, non-breaking).

**Acceptance:** multi_select questions render as stacked card rows; OB Step 08
lead-teams renders 8 checkbox card rows; OB Step 11 dietary renders 2-col chip
grids for dislikes and allergies.

### Step 5 — RTL tests

Write `packages/ui/src/components/option-card-group.test.tsx` covering the full
test matrix above.

**Acceptance:** all tests pass via `pnpm --filter @camp404/ui test`.

### Step 6 — Storybook stories

Write `packages/ui/src/components/option-card-group.stories.tsx` covering all
stories listed above.

**Acceptance:** all stories render without console errors in Storybook; visual
review confirms card borders, selected tints, chip-grid layout, and disabled state.

### Step 7 — Clean up absorbed inline patterns in `question.tsx`

Remove the now-dead inline Checkbox+Label row logic that was replaced in Steps 3–4.
Verify no other call site in `apps/web` hand-rolls a radio-card or checkbox-card
pattern:

```bash
grep -r "radio.*card\|checkbox.*card\|CheckboxCardGroup\|RadioCardGroup\|chip.*grid" \
  apps/web --include="*.tsx" --include="*.ts"
```

**Acceptance:** grep returns no remaining hand-rolled patterns; CI green.

---

## Consumers — which surfaces use OptionCardGroup

| Consumer | File | Mode / layout | Questionnaire question(s) |
|---|---|---|---|
| Onboarding wizard step 07 (cooking + hardware competency) | `apps/web/components/questionnaire/question.tsx` via `QuestionField` | `mode="single" layout="stack"` | `competency.cooking`, `competency.hardware` (scale kind, 4 options each) |
| Onboarding wizard step 08 — lead teams | same | `mode="multi" layout="stack"` | `team_lead.interests` (multi_select, 8 options) |
| Onboarding wizard step 08 — driving, onsite, staying-after | same | `mode="single" layout="stack"` | `logistics.driving`, `logistics.onsite_before`, `logistics.onsite_after` (single_select, 3 options each) |
| Onboarding wizard step 09 — Camp 404 years | same | `mode="multi" layout="stack"` | `history.camp404_years` (multi_select, 6 options) |
| Onboarding wizard step 09 — AB count | same | `mode="single" layout="stack"` | `history.afrikaburn_count` (single_select, 4 options) |
| Onboarding wizard step 10 — burn intent | same | `mode="single" layout="stack"` | `intent.this_year` (scale, 6 options) |
| Onboarding wizard step 11 — dietary dislikes + allergies | same | `mode="multi" layout="chip-grid"` | `dietary.dislikes`, `dietary.allergies` (multi_select, 12 dietary ingredients each) |
| Questionnaire runner (S26) — single_select as radio rows | same | `mode="single" layout="stack"` | Any `single_select` question in a blocking questionnaire |
| Questionnaire runner (S26) — multi_select as checkbox rows | same | `mode="multi" layout="stack"` | Any `multi_select` question in a blocking questionnaire |
| My-forms replay (field-renderer) | `apps/web/components/questionnaire/question.tsx` | Both modes, both layouts | Any `single_select` / `multi_select` / `scale` question in a submitted form review |

`OptionCardGroup` is consumed exclusively through the shared `QuestionField` /
`FieldInput` renderer — it is not called directly from surface page components.
The `QuestionField` organism (`apps/web/components/questionnaire/question.tsx`)
is the single call site, which surfaces it to all three questionnaire hosts:
the onboarding wizard, the blocking runner, and the my-forms replay.
