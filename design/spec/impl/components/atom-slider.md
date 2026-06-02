# Slider — atom plan

- **mapsTo:** REUSE `packages/ui/src/components/slider.tsx`
- **Target file:** `packages/ui/src/components/slider.tsx`

---

## Current state — does it exist? where? gap vs spec

**Exists at:** `packages/ui/src/components/slider.tsx` (63 lines, shadcn/ui new-york
base, Radix `@radix-ui/react-slider`).

**Live code confirmed:**
- Radix `SliderPrimitive.Root` wraps `Track → Range + Thumb(s)`.
- Already accepts `orientation` (horizontal / vertical) via Radix passthrough.
- `data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44` on
  Root; `data-[orientation=horizontal]:h-1.5 / data-[orientation=vertical]:w-1.5`
  on Track — vertical axis is plumbed.
- Thumb: `size-4` (16px), `rounded-full`, `border border-primary`,
  `bg-background`, `ring-ring/50`, hover/focus-visible `ring-4`.
- Range: `bg-primary`.
- Track: `bg-muted`, `rounded-full`.
- Multi-thumb: uses `_values.length` to render N thumbs from `value` or
  `defaultValue` (no camp consumer uses multi-thumb; single-thumb only in scope).

**Already consumed in `apps/web`** (`apps/web/components/questionnaire/question.tsx`
lines 24, 107–114, 339–347, 392–399):
- `slider` kind: horizontal, `value={[current]}`, `onValueChange={(v) =>
  onChange(v[0] ?? current)}`, passes `min`/`max`/`step` from the question config.
- `scale` kind (mobile): `orientation="vertical"`, `h-[70dvh]` container, axis
  inverted (top = highest step), `min={0}` `max={steps.length - 1}` index-based.
- `scale` kind (desktop): horizontal, same index-based axis, no `orientation` prop.

**Gaps vs spec (`component-library.md` §Slider + `20-field-renderer.md` §B1):**

1. **Value-badge typography.** S04 board (`13-s04-onboarding-wizard.txt` lines
   66/76/86/96/106/116/126/135) draws the live numeric value in `JetBrains Mono /
   13px / normal / $accent` in a `SliderHead` row to the right of the team label.
   Current `question.tsx` (lines 115–123) renders `min · current · max` as three
   `text-xs text-muted-foreground` spans with the centre value in
   `font-medium text-foreground` — plain Inter, not mono, not `$accent`. **The
   value badge must use `font-mono text-accent` per S04.**

2. **Track geometry.** S05 (`14-s05-field-kinds.txt` line 13): `h:6 r:3 fill:$muted`.
   Radix Track already `h-1.5` (= 6px) `rounded-full` but the spec calls `r:3`
   (not `r:999`). The existing `rounded-full` snaps to `--radius-full` per
   `design-tokens.md §3`; `r:3` is the bespoke progress-track geometry exception
   ("r:3 … keep inline, not a token" — `design-tokens.md §3 Rules`). The track
   should explicitly use `rounded-[3px]`, NOT `rounded-full`. Gap in current code.

3. **Knob/thumb size.** S05 (line 15): `Knob {w:18 h:18 fill:$primary-foreground
   stroke:$primary}`. S04 (lines 69/79): `SKnob {w:16 h:16 r:999
   fill:$primary-foreground stroke:$primary}`. Current thumb is `size-4` (16px),
   `border-primary`, `bg-background`. Gap: fill should be `$primary-foreground`,
   not `$background`. S05 uses 18px; S04 uses 16px — boards diverge; OB board (S04)
   is canonical for the team-interest slider (it supersedes S04 for presentation per
   `04-onboarding-wizard.md §Divergences #1`). Use 16px / `bg-primary-foreground`.

4. **Vertical `min-h` default.** Current code sets `data-[orientation=vertical]:
   min-h-44` (176px) as a fallback on the Root. The only vertical consumer
   (`ScaleField`) wraps Slider in a `h-[70dvh]` container; the `min-h-44` is never
   the governing dimension in practice. This is harmless but should be documented
   in a comment so future verticals know to constrain the parent, not the slider.

5. **Token-spelling.** Current thumb uses `border-primary`, `ring-ring/50` (short
   form — fine). Range uses `bg-primary` (fine). Track uses `bg-muted` (fine).
   No raw-hex or verbose `text-[color:var(…)]` — already compliant.

6. **`disabled` opacity.** Current: `data-[disabled]:opacity-50` on Root (fine).
   Thumb also has `disabled:opacity-50 disabled:pointer-events-none` (fine).

**Classification:** REUSE — the primitive is correct and already wired; the gaps are
styling fixes applied at consumption sites (`question.tsx`) and two CSS tweaks
(`rounded-[3px]` on track, `bg-primary-foreground` on thumb) inside the component
itself. No new prop surface is required.

---

## API — props, variants, sizes, states

### TS prop interface (sketch)

```ts
// packages/ui/src/components/slider.tsx
// Re-exports Radix SliderPrimitive.Root props verbatim — no wrapper type added.
// Camp 404 callers only use the subset below.

interface SliderProps
  extends React.ComponentProps<typeof SliderPrimitive.Root> {
  // All from Radix:
  value?: number[];           // single-thumb: [n]; multi-thumb not used in camp
  defaultValue?: number[];
  min?: number;               // default 0
  max?: number;               // default 100
  step?: number;              // default 1
  orientation?: "horizontal" | "vertical";  // default "horizontal"
  onValueChange?: (value: number[]) => void;
  disabled?: boolean;
  className?: string;
  // id forwarded to Root for aria-labelledby from QuestionField
}
```

### Variants

| Variant | How invoked | Where |
|---|---|---|
| **horizontal** (default) | no `orientation` prop or `"horizontal"` | `slider` kind in `QuestionField`; desktop `scale` layout |
| **vertical** | `orientation="vertical"` | mobile `scale` layout, `h-[70dvh]` parent |

### Sizes

The component carries no explicit size prop. Size is governed by the **parent
container**:
- Horizontal: `w-full` (fill container), track `h-1.5` (6px).
- Vertical: inherits parent height (`h-[70dvh]` from `ScaleField`); track `w-1.5`.

### States

| State | Visual |
|---|---|
| **untouched** | value reads `min`; range fill = 0 width; thumb at left/bottom edge |
| **populated** | range fill proportional; thumb at current value position |
| **hover (thumb)** | `ring-4 ring-ring/50` |
| **focus-visible (thumb)** | `ring-4 ring-ring/50 outline-hidden` |
| **disabled** | `opacity-50` on Root; `pointer-events-none` on thumb |

---

## Tokens & type — exact design tokens + type-scale roles

| Element | Token(s) | Note |
|---|---|---|
| Track fill | `bg-muted` | `--color-muted` |
| Range fill | `bg-primary` | `--color-primary` (hot-magenta) |
| Thumb fill | `bg-primary-foreground` | `--color-primary-foreground` (fix: currently `bg-background`) |
| Thumb border | `border-primary` | `--color-primary` |
| Focus / hover ring | `ring-ring/50` | `--color-ring` = primary |
| Root disabled | `opacity-50` | `data-[disabled]:opacity-50` |
| Track radius | `rounded-[3px]` | bespoke `r:3` geometry per spec (`design-tokens.md §3 Rules`); NOT `--radius-full` |
| Thumb shape | `rounded-full` | `--radius-full` (`r:999`) |
| **Value-badge (at caller)** | `font-mono text-accent` | `--font-mono` (JetBrains Mono 13px/normal); `--color-accent` (electric-blue); belongs in `question.tsx` SliderHead row, not in the component itself |
| **Min/max labels (at caller)** | `text-xs text-muted-foreground` | Inter 11px; `--color-muted-foreground`; belongs in `question.tsx` |

**Typography in the component itself:** none — the Slider atom renders no text.
The value-badge and label row are caller-side composition (`question.tsx`).

---

## Composition & deps — atoms/primitives + @camp404/core helpers

```text
Slider
  └── @radix-ui/react-slider   (SliderPrimitive.Root/Track/Range/Thumb)
  └── cn (packages/ui/src/lib/utils)
```

No `@camp404/core` helpers needed — Slider is a pure presentational primitive.
No `@camp404/types` import. No `next/*` dependency.

The `ScaleField` vertical-axis index inversion (`steps.length - 1 - idx`) is
**caller logic inside `question.tsx`**, not a slider concern. Slider knows nothing
about question kinds, step labels, or axis direction semantics.

---

## Absorbs — candidates replaced by this component

From the merge map in `component-library.md`: **no merge candidates**. The merge
map has no row for Slider — it was never duplicated as a per-surface hand-roll.
There is no bespoke inline slider in `apps/web` outside `question.tsx` consuming
`@camp404/ui/slider.tsx`. The `scale` kind's segmented affordance
(`SegmentedControl`, a separate molecule) is distinct and does NOT absorb Slider.

---

## Stories & tests

### Storybook stories

```text
Slider.stories.tsx
├── Horizontal            value=[42] min=0 max=100 step=1
├── HorizontalAtMin       value=[0]  min=0 max=100 — untouched default
├── HorizontalAtMax       value=[100]
├── HorizontalDisabled    disabled value=[50]
├── HorizontalStepped     value=[3] min=0 max=5 step=1 — team-interest range
├── Vertical              orientation="vertical" value=[3] min=0 max=5
│                         wrapped in <div className="h-[70dvh]">
└── VerticalDisabled      orientation="vertical" disabled
```

### Vitest / RTL test cases

```text
slider.test.tsx
├── renders track and thumb
├── thumb has aria role="slider"
├── aria-valuemin/valuemax/valuenow reflect min/max/value
├── keyboard: ArrowRight increments value by step; calls onValueChange
├── keyboard: ArrowLeft decrements; clamps at min
├── keyboard: Home → min; End → max
├── disabled: thumb has aria-disabled="true"; keyboard moves do not fire onValueChange
├── orientation="vertical": thumb has aria-orientation="vertical"
└── className override applied to Root element
```

### Accessibility notes

- Radix provides `role="slider"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow`,
  `aria-orientation` on the Thumb automatically.
- The **caller** (`QuestionField`) provides `id` on the Root so the host
  `<Label htmlFor="q-{id}">` labels the slider. Verify `aria-labelledby` is
  resolved by Radix (it is — Root forwards `id` to the underlying element).
- `aria-live="polite"` on the value-badge span in `question.tsx` announces the
  live value to screen readers without flooding them; this is a caller
  responsibility, already present in the live code (line 118).
- Focus ring meets 3:1 contrast threshold using `ring-ring/50` (`$primary` at 50%).
- `data-[disabled]:opacity-50` alone is insufficient for AT — `disabled` on the
  Radix Root also sets `aria-disabled` on each thumb.
- Reduced-motion: Radix `transition-[color,box-shadow]` on the thumb should be
  wrapped in `@media (prefers-reduced-motion: no-preference)` — or replace with
  Tailwind `motion-safe:transition-[color,box-shadow]` to respect user preference.

---

## Build steps — ordered + acceptance criteria

### Step 1 — Fix thumb fill token

**File:** `packages/ui/src/components/slider.tsx`

Change thumb class from `bg-background` to `bg-primary-foreground`.

**Acceptance:** thumb renders white/light fill (the `$primary-foreground`
value) matching S04/S05 board drawings. Visual regression snapshot passes.

---

### Step 2 — Fix track radius

**File:** `packages/ui/src/components/slider.tsx`

Change Track `className` from `rounded-full` to `rounded-[3px]` (both horizontal
and vertical data-orientation variants share the same Track element; the single
`rounded-[3px]` applies to both axes).

**Acceptance:** track corners are 3px not pill-shaped. Matches `r:3` spec. Does
not affect thumb (stays `rounded-full`).

---

### Step 3 — Add reduced-motion guard on thumb transition

**File:** `packages/ui/src/components/slider.tsx`

Change thumb class `transition-[color,box-shadow]` to
`motion-safe:transition-[color,box-shadow]`.

**Acceptance:** no layout change. `prefers-reduced-motion: reduce` users see no
animation. Vitest a11y audit passes.

---

### Step 4 — Fix value-badge typography at the call site

**File:** `apps/web/components/questionnaire/question.tsx` (slider kind arm,
lines 115–123)

Update the centre value `<span>` from `font-medium text-[color:var(--color-foreground)]`
to `font-mono text-accent` (Inter → JetBrains Mono 13px, foreground → `$accent`).
Also update the outer wrapper `text-xs text-[color:var(--color-muted-foreground)]`
spans to short-form `text-xs text-muted-foreground`.

**Acceptance:** live numeric value renders in JetBrains Mono / accent colour
matching S04 boards. Short-form tokens used — no verbose `text-[color:var(…)]`.

---

### Step 5 — Add vertical `min-h` comment

**File:** `packages/ui/src/components/slider.tsx`

Add a JSDoc comment above the `data-[orientation=vertical]:min-h-44` class
explaining that this is a safety floor and that the governing dimension is always
the parent container (e.g. `h-[70dvh]` in `ScaleField`).

**Acceptance:** no runtime change. Future consumers know the pattern.

---

### Step 6 — Write stories + tests

**Files:** `packages/ui/src/components/slider.stories.tsx`,
`packages/ui/src/components/__tests__/slider.test.tsx`

Implement the stories and test cases listed above.

**Acceptance:** all Storybook stories render without console errors. All vitest
cases pass. RTL `getByRole("slider")` finds the element. A11y plugin reports no
violations on the Horizontal and Vertical stories.

---

### Step 7 — Verify existing consumers pass

After steps 1–4, run the existing questionnaire tests.

**File:** `apps/web/components/__tests__/questionnaire.test.ts`

**Acceptance:** all existing tests pass green. No regressions in `question.tsx`
slider/scale rendering paths.

---

## Consumers — molecules/organisms/surfaces using Slider

| Consumer | File | Variant | Props passed |
|---|---|---|---|
| `QuestionField` → `slider` kind | `apps/web/components/questionnaire/question.tsx` L107–114 | horizontal | `value=[current]`, `min`, `max`, `step`, `onValueChange` |
| `ScaleField` mobile arm | `apps/web/components/questionnaire/question.tsx` L339–347 | vertical | `orientation="vertical"`, `value=[sliderValue]`, `min=0`, `max=steps.length-1`, `step=1`, `aria-labelledby` |
| `ScaleField` desktop arm | `apps/web/components/questionnaire/question.tsx` L392–399 | horizontal | `value=[sliderValue]`, `min=0`, `max=steps.length-1`, `step=1` |

**Surfaces that mount these consumers:**
- `04-onboarding-wizard` (step 06 team interests — 8 × slider kind; any scale step
  with a full-viewport page).
- `24-questionnaire-runner` (any questionnaire with `slider` or `scale` questions).
- `12-my-forms` replay (same `QuestionField` via `QuestionnaireWizard`).

**No other hand-rolled sliders exist in `apps/web`** (confirmed by grep: only
`question.tsx` imports `Slider` from `@camp404/ui`; `lib/member-detail.ts` and
`__tests__/questionnaire.test.ts` reference the slider kind by string but import
no Slider component).

---

## Open flags (carry; do not silently fix)

- **team_interest range 0–5 vs 0–6:** `04-onboarding-wizard.md §Divergences #3`
  and `04-onboarding-wizard.md §Open #2`. OB Step 06 board draws 7 segments (0–6);
  catalogue `questionnaire.ts` defines `min:0, max:5`. This plan assumes the
  catalogue 0–5 wins (recommendation). Resolve with data owner before build step 4.
- **slider untouched commits at `min`:** `20-field-renderer.md §Known edge cases`
  notes "slider untouched reads min but commits only on interaction
  (`onChange(v[0] ?? current)` guards empty thumb array)." Carry as-is — do not
  auto-commit on mount.
