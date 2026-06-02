# SegmentedControl — molecule plan

- **mapsTo:** PROMOTE `apps/web/components/questionnaire/question.tsx` (inline `ToggleField` + `ScaleField` sub-renderers)
- **Target file:** `packages/ui/src/components/segmented-control.tsx`

---

## Current state — does it exist? where? gap vs spec

**No file named `segmented-control.tsx` exists anywhere in `packages/ui/src/components/`.** The
folder contains only the 13 reusable primitives confirmed in `component-library.md`
(avatar, button, card, checkbox, combobox, command, dialog, input, label, popover, select, slider,
textarea) plus the dead `control-panel` and `control-grid` and `quadrant-nav`.

Two inline sub-renderers in `apps/web/components/questionnaire/question.tsx` carry the pattern
today, but are not exported or reusable:

| Sub-renderer | Lines (question.tsx) | Covers | Gap vs spec |
|---|---|---|---|
| `ToggleField` | 249–288 | `toggle` kind — row of `<button role="radio">` per option. | Uses verbose `[color:var(--color-*)]` tokens (P1-5 codemod target). No `size` prop; no `disabled` state; no `error` state; no outer container fill/radius matching board S24 (`fill:$muted pad:4 r:$radius`). The board's S24 segmented draws a `$muted` track with `r:7` inner cells; code uses `rounded-md border border-[color:var(--color-border)] p-1` — close but not tokenised. |
| `ScaleField` | 297–403 | `scale` kind — renders a **Radix Slider** (dual layout: vertical `70dvh` on mobile, horizontal on desktop). The board (S05, S26) wins on drawn affordance: a **segmented-button row**, not a slider. | Entire ScaleField implementation is the wrong affordance per boards S05/S26 (20-field-renderer.md divergence #1, locked: boards win). The segmented row must replace this for the `scale` kind; the full-viewport vertical layout is kept for fullScreen single-question scale pages where the horizontal segmented row is impractical. |

The S24 primitive kit board (`33-s24-primitive-kit.txt` lines 61–67) draws the canonical
segmented primitive: a `$muted` outer track (`pad:4 r:$radius`) with equal-width inner cells
(`pad:[8,0] jc:center r:7`), selected cell `fill:$primary`, unselected `fill:#00000000`
(transparent within the track). Text is `Inter/13px/600` in `$primary-foreground` or
`$muted-foreground`.

OB Step 02 (`40-ob-step-02-about-you.txt` lines 53–57) draws the ID-type toggle as:
`{h:46 gap:4 pad:4 r:$radius fill:$muted}`, inner cells `r:6` (snaps to `--radius-sm`),
selected `fill:$primary` label `Inter/14px/600/$primary-foreground`, unselected transparent label
`Inter/14px/600/$muted-foreground`.

S05 field-kinds (`14-s05-field-kinds.txt`) draws the `scale` variant:
`Segmented {w:fill r:$radius stroke:$border}`, cells `{h:44 jc:center ai:center fill:$muted
stroke:$border}` (unselected), selected cell `fill:$primary stroke:$border`, label
`Inter/15px/700`. S26 questionnaire runner (`35-s26-questionnaire-runner.txt` lines 99–110)
draws it at `h:48` with `gap:8` between cells, no `stroke:$border` on unselected.

OB Step 06 team-interests (`44-ob-step-06-team-interests.txt`) draws the `slider` kind rendered
as segments: `{h:40 r:$radius fill:$muted}` cells, selected `fill:$primary`, label is the
numeric index value.

**Classification confirmed: PROMOTE.** The pattern is hand-rolled in `apps/web` as
two inline sub-renderers inside `question.tsx`. Promote to
`packages/ui/src/components/segmented-control.tsx`.

---

## API — props, variants, sizes, states

### TS prop interface

```ts
export interface SegmentedOption {
  /** The string value emitted by onChange when this option is chosen. */
  value: string;
  /** Visible label inside the cell. */
  label: string;
}

export interface SegmentedControlProps {
  /**
   * The ordered list of options. 2–N items.
   * Canonical use-cases: 2 (ID-type toggle, S24 day/week/month pair),
   * 3–4 (toggle kind small sets), 5–7 (scale/interest rows).
   */
  options: SegmentedOption[];
  /** Currently selected value. undefined = nothing selected (uncontrolled initial). */
  value?: string;
  /** Fires with the newly selected option's value. Always a string — never a boolean. */
  onChange: (value: string) => void;
  /**
   * sm  — h-10 (40px), text-sm/600  — OB step 06 team-interest rows.
   * md  — h-[46px], text-sm/600    — OB step 02 ID-type, S24 primitive kit.
   * lg  — h-12 (48px), text-base/600 — S26 runner scale (1–5).
   * @default "md"
   */
  size?: "sm" | "md" | "lg";
  /**
   * scale — each cell shows its numeric label, selected at $primary.
   *         Outer track uses $radius + $border stroke (S05 style).
   * equal — equal-width labelled cells (ID-type, day/week/month, toggle 2–4).
   *         Outer track $muted filled, inner cells transparent or $primary.
   * @default "equal"
   */
  variant?: "equal" | "scale";
  /**
   * Shown below the track for scale variant: first = left, last = right.
   * E.g. ["Not at all", "Very"] from S26 ScaleLabels.
   */
  minLabel?: string;
  maxLabel?: string;
  /** Inerts all buttons and dims opacity. */
  disabled?: boolean;
  /** Renders outer track with $destructive stroke. */
  error?: boolean;
  /** Accessible group label. Required — set to the question prompt or a brief description. */
  "aria-label": string;
  className?: string;
}
```

### Variants

| Variant | Board source | Outer track | Cell style |
|---|---|---|---|
| `equal` | S24 `Segmented` (day/week/month); OB Step 02 (ID-type) | `bg-muted pad-1 rounded-[--radius]` | selected `bg-primary text-primary-foreground rounded-[--radius-sm]`; unselected transparent `text-muted-foreground` |
| `scale` | S05 `Kind/scale`; S26 `Block-SCALE` | `rounded-[--radius] border border-border` — no fill | selected `bg-primary stroke-primary text-primary-foreground rounded-[--radius]`; unselected `bg-muted rounded-[--radius] border border-border text-foreground` |

### Sizes

| Size | Height | Label type role | Board source |
|---|---|---|---|
| `sm` | `h-10` (40px) | `text-sm font-semibold` (Inter 14/600) | OB Step 06 `h:40` team-interest cells |
| `md` | `h-[46px]` | `text-sm font-semibold` (Inter 13–14/600) | S24 `h:46`; OB Step 02 `h:46` |
| `lg` | `h-12` (48px) | `text-base font-semibold` (Inter 15–16/600) | S26 `h:48`; S05 `h:44` snapped up to `h-12` |

S05 draws `15px/700` for scale cell labels; S26 draws `16px/600`. Normalise both to
`text-base font-semibold` (Inter 16/600) per `--text-body-strong` at the lg size — the
one-pixel label drift is within the reconciliation rules (design-tokens.md §1.2).

### States

| State | Description |
|---|---|
| `unselected` | No cell has `aria-checked=true`; all cells at muted colour. |
| `selected` | One cell carries `bg-primary text-primary-foreground`; `aria-checked=true`. |
| `disabled` | All `<button>` elements have `disabled`; track `opacity-50 pointer-events-none`. |
| `error` | Outer track gains `ring-1 ring-destructive` (equivalent to `border-destructive`). |

---

## Tokens & type — exact design tokens + type-scale roles

All short Tailwind form (P1-5 normalisation — no `[color:var(--color-*)]` verbose form).

### `equal` variant track

| Element | Token / utility | Board source |
|---|---|---|
| Outer track fill | `bg-muted` | S24 `fill:$muted`; OB Step 02 `fill:$muted` |
| Outer track radius | `rounded-[--radius]` (`--radius` = 10px) | S24 `r:$radius`; OB Step 02 `r:$radius` |
| Outer track padding | `p-1` (4px) | S24 `pad:4`; OB Step 02 `pad:4` |
| Inner cell gap | `gap-1` (4px) | OB Step 02 `gap:4` |
| Inner cell radius | `rounded-[--radius-sm]` (`--radius-sm` = 6px) | OB Step 02 `r:6`; S24 `r:7` — both snap to `--radius-sm` per design-tokens.md §3 (`r:5/6/7 → sm`) |
| Inner cell selected fill | `bg-primary` | S24 `fill:$primary`; OB Step 02 `fill:$primary` |
| Inner cell selected text | `text-primary-foreground` | S24 `$primary-foreground` |
| Inner cell unselected fill | transparent (no class) | S24 `fill:#00000000`; OB Step 02 `fill:#00000000` |
| Inner cell unselected text | `text-muted-foreground` | S24 `$muted-foreground` |
| Hover (unselected) | `hover:text-foreground` | Not on board; standard interactive affordance |

### `scale` variant track

| Element | Token / utility | Board source |
|---|---|---|
| Outer track fill | none (transparent) | S05 no fill on `Segmented` container |
| Outer track stroke | `border border-border` | S05 `stroke:$border` |
| Outer track radius | `rounded-[--radius]` | S05 `r:$radius` |
| Cell gap | `gap-0` (cells are contiguous, borders touch) | S05 cells share stroke |
| Cell radius | `rounded-[--radius]` | S05 cells `r:$radius`; S26 cells `r:$radius` |
| Cell selected fill | `bg-primary` | S05 `fill:$primary`; S26 `fill:$primary` |
| Cell selected stroke | `ring-1 ring-primary` (inner) | S26 `stroke:$primary` on selected |
| Cell selected text | `text-primary-foreground` | S05/S26 `$primary-foreground` |
| Cell unselected fill | `bg-muted` | S05 `fill:$muted`; S26 `fill:$muted` |
| Cell unselected stroke | `ring-1 ring-border` | S05/S26 `stroke:$border` |
| Cell unselected text | `text-foreground` | S05 `$foreground`/700; normalised to `text-foreground font-semibold` |
| Hover (unselected) | `hover:bg-muted/80` | Not on board; standard interactive affordance |

Note: S26 draws an `gap:8` between cells which S05 does not. Use `gap-2` (8px) for the `lg`
size `scale` variant to match the runner; `gap-0` / contiguous for `md`/`sm`.

### Scale-labels (optional, `scale` variant only)

| Element | Token / utility | Board source |
|---|---|---|
| Label text | `text-xs text-muted-foreground` (Inter 12/normal) | S26 `ScaleLabels` `Inter/12px/normal/$muted-foreground` |
| Layout | `flex justify-between mt-1` | S26 `jc:space_between` below Segments |

### Type scale summary

| Role | Token ref | Board |
|---|---|---|
| Cell label `sm`/`md` | `--text-label` (Inter 13px/600–700) / `--text-body-strong` (Inter 14px/500–600) | S24 `13/600`, OB Step 02 `14/600` |
| Cell label `lg` | `--text-body-strong` (Inter 14–15px/600) | S05 `15/700` → `text-base font-semibold` |
| Scale min/max labels | `--text-caption` (Inter 12px/400–500) | S26 `12/normal/$muted-foreground` |

---

## Composition & deps — atoms, primitives, @camp404/core helpers

| Dep | Package | Role |
|---|---|---|
| `cn` | `@camp404/ui/lib/utils` | Tailwind class merging |
| No Radix primitive | — | SegmentedControl is a plain `role="radiogroup"` div with `<button role="radio" aria-checked>` per option; no Radix dependency required |
| No `@camp404/core` helpers | — | Pure presentational; emits string values, never boolean; no rank logic |

**No Radix Tabs.** `component-library.md` notes under Tabs: "NO surviving consumer — do NOT
build Tabs." The SegmentedControl is a roving `radiogroup`, not a Tabs widget. It never
mounts/unmounts panel content; it only emits the selected value string.

**`@camp404/ui` only.** The component must not import anything from `apps/web`, `next/*`
server APIs, or `@camp404/db`. `next/link` is not needed (no navigation). Pure
presentation + `"use client"` for event handlers.

---

## Absorbs — candidates replaced (from merge map)

The merge map entry for **SegmentedControl** (`component-library.md` merge map, row 5):

| Absorbed inventory candidate | Where it lives today | Action |
|---|---|---|
| `segmented-control` | Inline `ToggleField` in `apps/web/components/questionnaire/question.tsx` (lines 249–288) | Replace with `<SegmentedControl>` import from `@camp404/ui`; delete the local function |
| `scale-as-segments` | Inline `ScaleField` in `apps/web/components/questionnaire/question.tsx` (lines 297–403) — currently renders Radix Slider, NOT segments | Replace ScaleField with `<SegmentedControl variant="scale">` for the non-fullScreen path; keep the `70dvh` Slider layout for fullScreen single-question scale pages (open question — see below) |
| `interest segmented-scale` | OB Step 06 ScaleRow inline in `apps/web/components/questionnaire/question.tsx` via the `slider` kind | The `slider` kind driven as a segmented control on OB Step 06 is a *presentation variant*; the underlying kind stays `slider`. When the team-interest range reconciliation confirms 0–5, expose this as a `variant="equal"` SegmentedControl with N+1 numeric-labelled options. The data contract (integer from the Slider) must be adapted at the QuestionField level, not inside SegmentedControl. |
| `ID-type toggle` | OB Step 02 inline in `apps/web/components/questionnaire/question.tsx` `toggle` kind arm | `toggle` kind renders as `<SegmentedControl variant="equal" size="md">` — replaces the existing ToggleField for the 2-option case; QuestionField decides variant based on option count and context |

After promotion, **no duplicate segmented-control pattern should remain** in
`apps/web/components/questionnaire/question.tsx`. Both `ToggleField` and the horizontal path of
`ScaleField` collapse into `<SegmentedControl>` calls. The vertical `70dvh` Slider within
`ScaleField` is kept only for `fullScreen` single-question scale pages (see Open question in
20-field-renderer.md §divergences #1).

---

## Stories & tests

### Storybook stories (`segmented-control.stories.tsx`)

| Story | Props | Purpose |
|---|---|---|
| `EqualTwoOptions` | `variant="equal"`, options=[Passport, South African ID], value="passport" | ID-type toggle; canonical OB Step 02 two-up equal |
| `EqualThreeOptions` | `variant="equal"`, options=[Day, Week, Month], no value | S24 primitive kit three-option; nothing selected |
| `ScaleFiveSelected` | `variant="scale" size="lg"`, options=[1..5], value="3", minLabel="Not at all", maxLabel="Very" | S26 runner scale 1–5, option "3" selected |
| `ScaleSevenInterest` | `variant="equal" size="sm"`, options=[0..6], value="5" | OB Step 06 team-interest row (0–6, 7 cells, "5" lit) |
| `DisabledEqual` | `variant="equal"`, value="sa_id"`, `disabled` | Inert field; all buttons disabled, opacity-50 |
| `ErrorState` | `variant="equal"`, no value, `error` | Track ring destructive; no selection |
| `NothingSelected` | `variant="equal"`, options=[Passport, SA-ID], no value | Uncontrolled initial; both cells muted |
| `SmSize` | `variant="equal" size="sm"`, options=[0,1,2,3,4] | 40px height |
| `LgScale` | `variant="scale" size="lg"`, options=[1,2,3,4,5] | 48px height, gap-2 between cells |

### Vitest / RTL test cases (`segmented-control.test.tsx`)

| Test | Assertion |
|---|---|
| Renders `role="radiogroup"` container | `getByRole("radiogroup")` present |
| Each option renders `role="radio"` | N `role="radio"` buttons for N options |
| Selected option has `aria-checked="true"` | Correct cell `aria-checked` |
| Unselected options have `aria-checked="false"` | All other cells `aria-checked="false"` |
| `onChange` fires with string value on click | `onChange` called with `"passport"` on Passport cell click |
| `onChange` never fires with boolean | Emit type is `string`; jest type check |
| `disabled` prop sets all buttons `disabled` | All `role="radio"` buttons have `disabled` attribute |
| `disabled` adds `opacity-50` to track | Container has `opacity-50` class |
| `error` prop adds destructive ring | Container has `ring-destructive` class |
| `minLabel`/`maxLabel` render | Two caption strings present below the track |
| `minLabel`/`maxLabel` absent when not passed | No caption text rendered for `equal` default |
| `aria-label` applied to radiogroup | `getByRole("radiogroup", { name: "Rate difficulty" })` resolves |
| Roving tab index — Tab moves focus to selected | `aria-checked=true` button receives focus on Tab |
| Arrow key roving — ArrowRight selects next | Next option becomes `aria-checked=true` after ArrowRight |
| Arrow key wraps at end — ArrowRight on last | Wraps to first option |
| Arrow key roving — ArrowLeft selects previous | Previous option becomes `aria-checked=true` |
| Keyboard Enter/Space selects focused cell | `onChange` fires on Enter or Space on focused button |

### Accessibility notes

- Container must be `role="radiogroup"` with `aria-label` from the prop. The label is the
  question prompt, set by the caller.
- Each cell is a `<button type="button" role="radio" aria-checked={selected}>`. Using native
  `<button>` (not `<div>`) gives free focus, `Enter`/`Space`, and pointer events.
- Roving tabindex: only the selected (or first-if-none) cell has `tabIndex={0}`; all others
  `tabIndex={-1}`. `onKeyDown` on the container implements ArrowLeft/ArrowRight roving
  and updates both the internal focused index and calls `onChange`.
- `disabled` buttons: `aria-disabled="true"` and `disabled` attribute both set; the container
  also carries `aria-disabled` for AT compatibility.
- `error` state is communicated to AT via `aria-invalid="true"` on the `radiogroup`; the error
  message string (if any) is rendered outside this component by the `QuestionField` shell.
- Min/max labels (`ScaleLabels`) are `aria-hidden="true"` — they are visual aids only; the
  accessible label for each cell (the numeric value) is sufficient for AT.
- Touch targets: minimum 40px height (`sm` size) meets WCAG 2.5.8 (24px minimum).

---

## Build steps — ordered + acceptance criteria

**Prerequisite:** `design/spec/impl/foundations-tokens.md` Phase 0 must ship first:
`--radius-sm` token (6px) in `globals.css`, and the status token additions. The
`bg-muted`, `bg-primary`, `text-primary-foreground`, `text-muted-foreground`, `border-border`,
`ring-destructive` utilities are all present today; `--radius-sm` is the only missing token.
The font wiring (`--font-sans`) is needed before cell labels render in Inter by token.

### Step 1 — Create `packages/ui/src/components/segmented-control.tsx`

Build the component:
- `"use client"` directive.
- `role="radiogroup"` outer div, `aria-label` from prop, `aria-disabled` when disabled.
- Inner layout: `flex w-full` row.
- `equal` variant: outer `bg-muted p-1 rounded-[--radius] flex gap-1`; cells
  `flex-1 rounded-[--radius-sm] px-3 flex items-center justify-center` at the size height;
  selected `bg-primary text-primary-foreground`; unselected `text-muted-foreground`.
- `scale` variant: outer `rounded-[--radius] border border-border flex`; `gap-2` for `lg`,
  `gap-0` otherwise; cells `flex-1 rounded-[--radius] bg-muted flex items-center justify-center`;
  selected `bg-primary ring-1 ring-primary text-primary-foreground`;
  unselected `ring-1 ring-border text-foreground`.
- Size heights: `sm` → `h-10`; `md` → `h-[46px]`; `lg` → `h-12`.
- Label type: `sm`/`md` → `text-sm font-semibold`; `lg` → `text-base font-semibold`.
- `disabled`: `opacity-50 pointer-events-none`; all buttons `disabled`.
- `error`: `ring-1 ring-destructive` on outer track (overrides `border-border` for `scale`).
- `minLabel`/`maxLabel`: `flex justify-between mt-1` row of `text-xs text-muted-foreground`,
  rendered only when at least one label prop is provided.
- Roving tabindex + ArrowLeft/Right/Home/End keyboard handling on `onKeyDown` of the group.
- No Radix dependency; no `next/*` import.
- All tokens in short Tailwind form; no `[color:var(--color-*)]` verbose form.

**Acceptance:** component renders in isolation; no prop-type errors; no off-token class names;
`--radius-sm` round-trips correctly; `aria-label` is required (TS will error if omitted).

### Step 2 — Export from `@camp404/ui`

Add to `packages/ui/src/index.ts` (or the barrel per current export convention):

```ts
export { SegmentedControl } from "./components/segmented-control";
export type { SegmentedControlProps, SegmentedOption } from "./components/segmented-control";
```

**Acceptance:** `import { SegmentedControl } from "@camp404/ui/components/segmented-control"`
resolves cleanly from `apps/web`.

### Step 3 — Replace `ToggleField` in `apps/web/components/questionnaire/question.tsx`

Replace the inline `ToggleField` function (lines 249–288) with a call to `<SegmentedControl>`:

```tsx
// toggle kind arm in FieldInput switch:
case "toggle":
  return (
    <SegmentedControl
      options={question.options}
      value={typeof value === "string" ? value : undefined}
      onChange={onChange}
      variant="equal"
      size="md"
      aria-label={question.prompt}
      error={!!error}
      disabled={false}
    />
  );
```

Delete the now-unused local `ToggleField` function.

**Acceptance:** toggle kind fields render identically to before; no `[color:var(--color-*)]`
verbose tokens remain for this case; RTL tests for toggle kind still pass.

### Step 4 — Replace horizontal path of `ScaleField` in `question.tsx`

The `ScaleField` function currently renders Radix Slider for both mobile and desktop. Per
locked decision (boards win on drawn affordance — 20-field-renderer.md divergence #1):

- When `!fullScreen` (inline scale in a multi-question card): replace the entire `ScaleField`
  with `<SegmentedControl variant="scale" size="lg" options={question.steps} ...>`.
- When `fullScreen` (single-question scale page): the existing `70dvh` vertical Slider layout
  is kept via the `Slider` atom. Confirm with the open question in 20-field-renderer.md whether
  the full-screen scale page should also switch to segments or retain the slider.

The value contract is unchanged: SegmentedControl emits `string` (the step's `value`); the
`onChange` calls `QuestionnaireResponseValue` which accepts `string`.

For `minLabel`/`maxLabel` on the runner scale (S26), pass the first and last step labels:

```tsx
minLabel={question.steps.at(-1)?.label}   // lowest = last in steps (top→bottom order)
maxLabel={question.steps[0]?.label}        // highest = first
```

Delete the `ScaleField` horizontal-layout path; keep the vertical Slider portion if fullScreen
is retained.

**Acceptance:** scale kind fields render as segmented button rows inline; step labels visible;
selected step highlights `$primary`; min/max labels shown; `validateOne("scale")` path
unaffected (value is still the step's string `value`).

### Step 5 — RTL tests

Write `packages/ui/src/components/segmented-control.test.tsx` covering the full test matrix
above.

**Acceptance:** all tests pass via `pnpm --filter @camp404/ui test`.

### Step 6 — Storybook stories

Write `packages/ui/src/components/segmented-control.stories.tsx` covering the stories above.

**Acceptance:** all stories render without console errors in Storybook; `scale` variant shows
gap between cells at `lg` size; `equal` variant shows flush `$muted` track with inner cells.

---

## Consumers — which molecules/organisms/surfaces use it

| Consumer | File | How used |
|---|---|---|
| `QuestionField` / `FieldInput` (`toggle` arm) | `apps/web/components/questionnaire/question.tsx` | Replaces inline `ToggleField` — `toggle` kind (2–4 options), `variant="equal" size="md"` |
| `QuestionField` / `FieldInput` (`scale` arm) | `apps/web/components/questionnaire/question.tsx` | Replaces inline `ScaleField` horizontal path — `scale` kind, `variant="scale" size="lg"`, min/max labels from first/last step |
| `QuestionField` / `FieldInput` (`slider` arm — OB Step 06) | `apps/web/components/questionnaire/question.tsx` | `slider` kind rendered as `variant="equal" size="sm"` with numeric labels for team-interest rows; the `slider` kind and its integer value persist — the host wraps the SegmentedControl for this presentation. Depends on range reconciliation (0–5 confirmed vs 0–6 board draft) |
| `ReportBugDialog` | `apps/web/components/feedback/report-bug-dialog.tsx` | "Kind toggle (SegmentedControl-style)" per 25-global-overlays.md — bug / feature / accessibility toggle; `variant="equal" size="md"` |
| **Onboarding OB Step 02 (ID-type)** | Rendered via `QuestionField` toggle arm above; questionnaire `id.type` question (`toggle`, options=[passport, sa_id]) | `variant="equal" size="md"`, 2 options, currently selected = `passport` or `sa_id` |
| **Onboarding OB Step 06 (team interests)** | Rendered via slider arm wrapper above; questionnaire `team_interest.*` (8×) | `variant="equal" size="sm"`, 6 or 7 cells per range confirmation |
| **Questionnaire runner scale fields** | S26 runner rendered via QuestionField `scale` arm above | `variant="scale" size="lg"` with `minLabel`/`maxLabel` |

`SegmentedControl` is consumed only through `QuestionField` (the organism layer) and
`ReportBugDialog`. It has no direct surface-level consumers — the field-renderer organism
is the integration boundary.
