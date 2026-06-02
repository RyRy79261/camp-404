# Checkbox — atom plan

- **mapsTo:** REUSE `packages/ui/src/components/checkbox.tsx`
- **Target file:** `packages/ui/src/components/checkbox.tsx`

---

## Current state — does it exist? where? gap vs spec

The component exists at `packages/ui/src/components/checkbox.tsx` and its story
at `packages/ui/src/components/checkbox.stories.tsx`. It is already used by
three app-layer consumers, all importing from `@camp404/ui/components/checkbox`:

- `apps/web/components/questionnaire/question.tsx` — `multi_select` kind
- `apps/web/components/feedback/report-bug-dialog.tsx` — "Improve with AI" toggle
- `apps/web/app/tools/invite/invite-form.tsx` — "Pre-approve" toggle

**Confirmed current implementation** (`checkbox.tsx`):

```text
Radix CheckboxPrimitive.Root + Indicator
Box: h-4 w-4 (16×16px), rounded-sm, border-primary (unchecked border)
Checked: bg-primary / text-primary-foreground
Focus: ring-2 ring-ring ring-offset-background
Disabled: opacity-50 cursor-not-allowed
Indicator icon: Lucide <Check className="h-4 w-4" />
```

**Gaps vs spec (cite files):**

1. **Size: 16px vs 20–22px drawn.**
   - `design/spec/surfaces/11-invite-tool.md:54` draws `w:20 h:20`.
   - `design/spec/surfaces/20-field-renderer.md:33` calls for a "22×22 Checkbox".
   - `design/.spec-extract/boards/33-s24-primitive-kit.txt:72` draws the kit
     checkbox as `w:20 h:20` (`cb` frame).
   - Current `h-4 w-4` = 16px. Default size must move to 20px; the field-renderer
     may request 22px via `size="lg"` (see API section).

2. **Radius: `rounded-sm` (6px) vs spec token.**
   - Boards draw `r:6` on the checkbox box. `design/spec/design-tokens.md §3`
     maps `r:5/6/7 → --radius-sm` (0.375 rem ≈ 6px). Current `rounded-sm` is the
     right *class* but it is a hardcoded Tailwind step, not a token-driven utility.
     After the P1-6 radius-token work wires `--radius-sm`, this class resolves
     correctly. No functional change needed now — flag as a follow-up token pass.

3. **Unchecked fill: border-only vs `$muted` fill.**
   - `design/spec/surfaces/20-field-renderer.md:33`: "unchecked = `$muted` fill +
     `$border`".
   - `design/spec/surfaces/04-onboarding-wizard.md:67` confirms: "unchecked
     `stroke:$border` empty box".
   - `design/spec/surfaces/24-questionnaire-runner.md:44`: "unchecked =
     `fill:$muted stroke:$border`".
   - Current implementation uses only `border border-primary` with no fill on the
     unchecked root. The unchecked root needs `bg-muted` added.

4. **Unchecked border: `border-primary` vs `border` / `$border`.**
   - The spec consistently says unchecked stroke is `$border` (the neutral border
     token), not `$primary`. Primary border should apply only in checked state.
   - Current class `border border-primary` is always `$primary`, even unchecked.
     Fix: unchecked → `border-border`; checked → `border-primary`.

5. **Missing `name` prop forwarding.**
   - `apps/web/app/tools/invite/invite-form.tsx:277` passes `name="preApprove"`.
     The current component spreads `...props` onto `CheckboxPrimitive.Root` which
     passes through `name` correctly (Radix forwards it to the hidden input).
     No code change needed — document as confirmed pass-through.

6. **Story coverage is thin.**
   - `checkbox.stories.tsx` has Default (checked) + Unchecked only; no Disabled
     story, no `with Label` controlled story, no indeterminate example. See Stories
     section.

7. **`data-[state=indeterminate]` not styled.**
   - Radix supports three states: `unchecked | checked | indeterminate`. The spec
     notes indeterminate falls to the "remove branch" on multi-select
     (`design/spec/surfaces/20-field-renderer.md:103`), so consumers treat it as
     falsy, but the visual state should still be distinguishable (a minus glyph is
     the standard pattern). Add a `Minus` indicator icon inside a conditional
     `data-[state=indeterminate]` wrapper, or render the `Minus` icon conditionally
     from `Indicator` props (see API below).

---

## API — props, variants, sizes, states

### Prop interface sketch

```ts
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  /** Box size. "sm" = 16px (legacy), "md" = 20px (default, kit spec),
   *  "lg" = 22px (field-renderer multi_select rows).            */
  size?: "sm" | "md" | "lg"
}
```

Radix `CheckboxPrimitive.Root` already carries:
- `checked?: boolean | "indeterminate"` — controlled checked state
- `defaultChecked?: boolean` — uncontrolled default
- `onCheckedChange?: (checked: CheckedState) => void` — change handler
- `disabled?: boolean` — disables the control
- `required?: boolean` — native form required
- `name?: string` — native form name (hidden input)
- `value?: string` — native form value (default `"on"`)
- `id?: string` — for `<Label htmlFor>`
- `className?: string` — style override

All of these continue to be forwarded via `...props` on `CheckboxPrimitive.Root`.

### Variants

Default only — `design/spec/component-library.md:91` ("Variants: default").
No `tone` or `variant` prop; the checkbox itself is always `$primary` when
checked. Consumers that need a differently coloured outer row (e.g. OptionCardGroup
card tint) own that styling themselves.

### Sizes

| `size` | Box | Usage |
|--------|-----|-------|
| `"sm"` | 16×16px (`h-4 w-4`) | Legacy / tight-density rows |
| `"md"` | 20×20px (`h-5 w-5`) — **default** | Primitive kit, invite-tool PreApprove, bug-dialog AI toggle |
| `"lg"` | 22×22px (`h-[1.375rem] w-[1.375rem]`) | `multi_select` field-renderer rows (`design/spec/surfaces/20-field-renderer.md:33`) |

### States (confirmed from boards + spec)

| State | Visual |
|-------|--------|
| `unchecked` | `bg-muted border-border` — neutral tinted fill, neutral border |
| `checked` | `bg-primary border-primary` + `check` icon in `$primary-foreground` |
| `indeterminate` | `bg-primary/50 border-primary` + `minus` icon in `$primary-foreground` |
| `disabled` | `opacity-50 cursor-not-allowed` on root; all states above still render |
| `focus-visible` | `ring-2 ring-ring ring-offset-2 ring-offset-background` |

---

## Tokens & type — exact design tokens + type-scale roles used

All sourced from `design/spec/design-tokens.md` and `packages/ui/src/styles/globals.css`.

**Colour tokens:**

| Usage | Token |
|-------|-------|
| Unchecked fill | `bg-muted` → `--color-muted` (`oklch(0.22 0.06 295)`) |
| Unchecked border | `border-border` → `--color-border` (`oklch(0.35 0.1 305)`) |
| Checked fill | `bg-primary` → `--color-primary` (`oklch(0.65 0.27 340)`) hot-magenta |
| Checked border | `border-primary` → `--color-primary` |
| Check icon colour | `text-primary-foreground` → `--color-primary-foreground` (`oklch(0.99 0.005 340)`) |
| Indeterminate fill | `bg-primary/50` (50% alpha `$primary`) |
| Focus ring | `ring-ring` → `--color-ring` (`oklch(0.65 0.27 340)`, = `$primary`) |
| Focus ring offset | `ring-offset-background` → `--color-background` |

**No raw hex.** The `#ff008c14` checked-chip tint referenced in
`design/spec/surfaces/04-onboarding-wizard.md:68` belongs to the wrapping
OptionCardGroup chip shell, not to this atom — it becomes `bg-primary/8` on
that molecule.

**Radius:**
`rounded-sm` → `--radius-sm` (0.375rem / 6px). `design/spec/design-tokens.md §3`
maps board `r:5/6/7` to `--radius-sm`. After the P1-6 token pass, replace
`rounded-sm` with `rounded-[var(--radius-sm)]` (or the Tailwind `rounded-sm`
alias once it resolves to the token). Flagged not blocked.

**Type scale:**
The Checkbox atom renders no text itself. When composed with a `<Label>` (always
by the consumer, never inlined), the label uses `--text-body` (Inter 14px / 400
/ `lh 1.45`) per `design/spec/surfaces/20-field-renderer.md:33` — that is a
Label atom concern, not a Checkbox concern.

---

## Composition & deps — atoms/primitives + @camp404/core helpers

```text
@radix-ui/react-checkbox   — Radix Root + Indicator primitives
lucide-react               — <Check> (checked state) + <Minus> (indeterminate state)
../lib/utils               — cn() for className merging
```

No `@camp404/core` helpers needed. Checkbox is a purely presentational primitive
with no business logic. `rankLevel`, validators, and data helpers live in the
service layer and are consumer concerns.

**Dependency direction (architecture.md layering):**

```text
@camp404/ui/checkbox  ←  Radix primitive  (UI only, no db, no next)
```

The spec locks: `@camp404/ui` may import `@camp404/types` for type shapes but
**never** `@camp404/db` or `next/*`. Checkbox has no types import either; it is
a pure HTML/Radix wrapper.

---

## Absorbs — candidates replaced (from merge map)

`design/spec/component-library.md` merge map (lines 33–48) lists no dedicated
merge row for Checkbox. The Checkbox atom is **not** a merge target itself — it
is a building-block absorbed *into* higher-level organisms:

| Higher-level canonical | What it absorbs that uses Checkbox internally |
|------------------------|-----------------------------------------------|
| **OptionCardGroup** | `CheckboxCardGroup` (onboarding steps 08/09) and `CheckboxChipGrid` (step 11) both embed `<Checkbox>` inside their card/chip shells. Those organisms are merged into `OptionCardGroup`; the Checkbox atom is their sub-primitive. |

No standalone duplicate of the Checkbox atom exists in `apps/web` — all three
app consumers import directly from `@camp404/ui`. No hand-rolled version to
delete.

The one bespoke appearance is in `apps/web/components/questionnaire/question.tsx`
where the `multi_select` renderer renders `<Checkbox>` inline with a `flex items-center gap-2` row. That row layout is the job of the future `FieldCheckboxRow`
molecule (owned by the field-renderer organism) — the atom itself ships no row
wrapper.

---

## Stories & tests — Storybook stories + test cases

### Storybook stories (`checkbox.stories.tsx` — ADD)

The existing file has `Default` (checked) and `Unchecked`. Extend:

```text
Default          — size="md", defaultChecked, with Label "Vegan brunch"  (exists)
Unchecked        — size="md", with Label "Fire performer"                 (exists)
Disabled         — disabled, unchecked + Label                           (ADD)
DisabledChecked  — disabled, defaultChecked + Label                      (ADD)
Indeterminate    — checked="indeterminate" + Label                       (ADD)
SizeSm           — size="sm", checked                                    (ADD)
SizeLg           — size="lg", checked — field-renderer use case          (ADD)
WithLabel        — fully controlled (useState): checked/onCheckedChange  (ADD)
```

All stories use `parameters: { layout: "centered" }` (existing pattern).

### Vitest + RTL test cases

File: `packages/ui/src/components/checkbox.test.tsx` (does not exist — NEW).

| Test | Assertion |
|------|-----------|
| renders unchecked by default | `aria-checked="false"` on the button |
| renders checked when `defaultChecked` | `aria-checked="true"` |
| calls `onCheckedChange(true)` on click | handler called once, arg = `true` |
| calls `onCheckedChange(false)` on second click | toggled back |
| is disabled when `disabled` prop is set | `aria-disabled` / cursor class |
| does not fire `onCheckedChange` when disabled | handler not called |
| renders with `name` forwarded to hidden input | `input[name="preApprove"]` present |
| indeterminate state shows `aria-checked="mixed"` | Radix output |
| `size="lg"` applies the 22px dimension class | rendered class includes `h-[1.375rem]` |
| `size="sm"` applies 16px dimension class | rendered class includes `h-4 w-4` |
| focus-visible ring is present | class check or user-event Tab |

### Accessibility notes

- **Role:** Radix renders `<button role="checkbox" aria-checked>`. No additional
  `role` attribute needed.
- **`aria-checked="mixed"`** maps to Radix's `"indeterminate"` state — verify
  Radix sets this automatically (it does as of v1.x).
- **Label association:** always pair with `<Label htmlFor={id}>`. The Checkbox
  atom itself is **never** self-labelling — it has no `aria-label`. Consumers
  must supply `id` and a matching `<Label>`.
- **Keyboard:** Space toggles. Tab reaches the control. Enter does not toggle
  (native checkbox behaviour; Radix matches it).
- **Focus ring:** `focus-visible:ring-2` ensures the ring appears only on
  keyboard focus, not pointer focus — correct.
- **`disabled`:** Radix sets `aria-disabled` and prevents pointer/keyboard
  events — no extra code needed.
- **Colour contrast:** `$primary-foreground` check icon on `$primary` fill.
  Confirmed OKLCH: `oklch(0.99 0.005 340)` on `oklch(0.65 0.27 340)` —
  meets WCAG AA (light near-white on saturated mid-magenta). Verify in CI with
  axe-core.

---

## Build steps — ordered + acceptance criteria

### Step 1 — Patch `checkbox.tsx` (EXTEND the existing REUSE)

Changes to `packages/ui/src/components/checkbox.tsx`:

1. Add `size` prop (`"sm" | "md" | "lg"`, default `"md"`) to the `CheckboxProps`
   interface.
2. Map `size` to box dimension classes via a small lookup:
   `{ sm: "h-4 w-4", md: "h-5 w-5", lg: "h-[1.375rem] w-[1.375rem]" }`.
3. Fix unchecked fill: add `bg-muted` to the root `className` string.
4. Fix unchecked border: change `border-primary` to `border-border`, then add
   `data-[state=checked]:border-primary` to restore the primary border only
   when checked.
5. Add indeterminate visual: inside `CheckboxPrimitive.Indicator`, render the
   `<Minus>` icon conditionally for the `indeterminate` state. Radix provides
   the `data-[state=indeterminate]` selector — use `cn` + Tailwind's
   `data-[state=indeterminate]:block hidden` pattern, or use the Indicator's
   children render approach to show `<Check>` vs `<Minus>` by comparing
   `checked` prop. Simplest: two icons, each displayed via
   `data-[state=checked]:block hidden` / `data-[state=indeterminate]:block hidden`.
6. Remove `peer` from the root className — it was unused in the existing file
   (no sibling selectors consume it in the UI library; callers that need `peer`
   can add it via `className`).

**Acceptance criteria — Step 1:**
- `pnpm typecheck` passes in `packages/ui`.
- Storybook renders all 8 stories without console errors.
- Unchecked box shows `$muted` fill, `$border` border.
- Checked box shows `$primary` fill, `$primary` border, white check icon.
- Disabled state shows 50% opacity, no interaction.
- Indeterminate shows minus icon.
- `size="lg"` renders a visually 22px box.

### Step 2 — Add `checkbox.test.tsx`

Create `packages/ui/src/components/checkbox.test.tsx` with the 11 test cases
listed above.

**Acceptance criteria — Step 2:**
- `pnpm test --filter @camp404/ui` passes all 11 cases.
- `axe-core` or `jest-axe` finds no violations on the Default story render.

### Step 3 — Expand `checkbox.stories.tsx`

Add the 6 missing stories (Disabled, DisabledChecked, Indeterminate, SizeSm,
SizeLg, WithLabel) to the existing file.

**Acceptance criteria — Step 3:**
- All 8 stories visible in Storybook without error.
- Visual diff review confirms token correctness (muted fill unchecked, primary fill checked).

### Step 4 — Update app consumers (size prop)

Pass `size="lg"` at the `multi_select` render site in
`apps/web/components/questionnaire/question.tsx` (the 22×22 box per
`design/spec/surfaces/20-field-renderer.md:33`).

The other two consumers (`report-bug-dialog.tsx`, `invite-form.tsx`) use the
default 20px box — no prop change needed.

**Acceptance criteria — Step 4:**
- `pnpm typecheck` passes in `apps/web`.
- No runtime regressions on `multi_select` fields in the onboarding wizard or
  questionnaire runner.

### Step 5 — Radius token follow-up (deferred, P1-6)

After `foundations-tokens.md` wires `--radius-sm` as a Tailwind utility:
replace `rounded-sm` with `rounded-[var(--radius-sm)]` (or the token alias) in
`checkbox.tsx`. This is a one-line change; blocked on the foundations pass.

---

## Consumers — which molecules/organisms/surfaces use it

**Direct atom consumers (app-layer, confirmed via grep):**

| File | Surface | Usage |
|------|---------|-------|
| `apps/web/components/questionnaire/question.tsx` | Field-renderer / Onboarding (S04) / Questionnaire runner (S24) | `multi_select` kind: one Checkbox per option |
| `apps/web/components/feedback/report-bug-dialog.tsx` | Global overlays (S25) | "Improve with AI" toggle (rendered only when `aiAvailable`) |
| `apps/web/app/tools/invite/invite-form.tsx` | Invite tool (S11) | "Pre-approve whoever signs up" toggle (captain-only) |

**Planned molecule/organism consumers (not yet built):**

| Planned component | Where specified | Role |
|-------------------|-----------------|------|
| `OptionCardGroup` (molecule) | `design/spec/component-library.md:44`, `design/spec/surfaces/04-onboarding-wizard.md:67–68` | Embeds `<Checkbox>` inside each multi-select card row and each chip cell |
| `FieldCheckboxRow` (molecule, if extracted) | `design/spec/surfaces/20-field-renderer.md:33` | Wraps `<Checkbox size="lg">` + `<Label>` in the `gap:12` list row for `multi_select` |
