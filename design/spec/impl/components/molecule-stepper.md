# Stepper — molecule plan

- **mapsTo:** NEW (app-local, no existing Stepper anywhere in the codebase)
- **Target file:** `apps/web/app/tools/invite/stepper.tsx`

---

## Current state — does it exist? where? gap vs spec

No `Stepper` component exists in `packages/ui/src/components/` (confirmed: avatar, button, card, checkbox, combobox, command, control-grid, control-panel, dialog, input, label, popover, quadrant-nav, select, slider, textarea only).

The invite-tool currently renders a plain `<Input type="number" min={1} max={100} className="w-28" />` inside an inline `CaptainOptions` function in `apps/web/app/tools/invite/invite-form.tsx` (lines 296–308). No −/+ buttons exist; there is no clamping outside of the HTML `min`/`max` attributes; keyboard spin is the only affordance.

**Gap vs spec (board `23-s14-invite-tool.txt`, line 27–29):**

```text
▸ "NumberInput" {w:fill_container h:46 pad:[0,14] jc:space_between ai:center r:$radius fill:$muted stroke:$border}
  T "1"  [Inter/14px/normal/$foreground]
  ▸ "Stepper" {gap:10 ai:center}
    ⊙ minus ($muted-foreground) [lucide]
    ⊙ plus ($muted-foreground) [lucide]
```

The board draws an explicit −/+ stepper right-docked inside the `NumberInput` row. `design/spec/surfaces/11-invite-tool.md` §4 confirms: "Boards win on affordance → build the stepper (−/+ buttons mutating the value), but keep the field a real `number` input under the hood for keyboard entry and the existing server validation." The live bare `type="number"` input is the gap.

`design/spec/impl/architecture.md` lists `Stepper` in the NEW-build shortlist (app-local). `design/spec/impl/service-layer/02-invites.md` identifies it as a presentation component covered by the surface plan, not the service plan.

**Merge map:** no merge-map entry — Stepper absorbed no inventory candidates (it is a NEW atom-like control, not a collapse of several bespoke patterns).

---

## API — props, variants, sizes, states

### TS prop interface

```ts
interface StepperProps {
  /** Controlled integer value. */
  value: number;
  /** Called with the clamped next value when − or + is tapped, or on
   *  keyboard entry after blur (see Composition). */
  onChange: (value: number) => void;
  /** Inclusive lower bound. Default: 1 */
  min?: number;
  /** Inclusive upper bound. Default: 100 */
  max?: number;
  /** Disables both buttons and the underlying input. */
  disabled?: boolean;
  /** Accessible label for the numeric field (forwarded to <input>). */
  'aria-label'?: string;
  className?: string;
}
```

### Variants

`default` only — the board draws one variant. No size variants (board fixes `h:46`, `w:fill_container`).

### States

| State | Trigger | Visual |
|---|---|---|
| `default` | `value` between `min` and `max` exclusive | Both − and + icons `$muted-foreground`; both buttons interactive |
| `at-min` | `value === min` | − button `disabled`; icon dims to `opacity-40` or `text-muted-foreground/40` |
| `at-max` | `value === max` | + button `disabled`; icon dims to `opacity-40` or `text-muted-foreground/40` |
| `disabled` | `disabled` prop | Both buttons + input disabled; whole row `opacity-50` |

---

## Tokens & type — exact design tokens + type scale roles

### Layout / colour (from board `23-s14-invite-tool.txt` `NumberInput` row)

| Property | Token |
|---|---|
| Row height | `h-[46px]` (board `h:46` — not a token; bespoke geometry) |
| Row padding | `px-[14px]` (board `pad:[0,14]`) |
| Row justify | `justify-between` |
| Row radius | `rounded-[var(--radius)]` (board `r:$radius`) |
| Row fill | `bg-muted` (board `fill:$muted`) |
| Row stroke | `border border-input` (board `stroke:$border`) |
| Value text colour | `text-foreground` |
| Icon colour (active) | `text-muted-foreground` (board `$muted-foreground`) |
| Icon colour (disabled) | `text-muted-foreground/40` |

### Typography (value display)

| Role | Token | Spec |
|---|---|---|
| Current value | `--text-body` | Inter 14px / normal / `$foreground` (board `Inter/14px/normal/$foreground`) |

No mono face — the value is a plain integer, not a slug or data-console string. `--text-mono` is reserved for invite slugs, record counts, and terminal chrome (design-tokens.md §1).

### No status tokens needed

The Stepper itself carries no status tone. The `at-min`/`at-max` boundary is communicated by button `disabled` + icon opacity only, not a colour shift.

---

## Composition & deps — atoms, primitives, helpers

| Dep | Source | Role |
|---|---|---|
| `Button` | `@camp404/ui/button.tsx` (reuse, `variant="ghost"`, `size="icon"`) | − and + icon buttons. Ghost avoids a visible bounding box inside the already-bordered `NumberInput` row. `atom-button.md` notes: "Stepper (NEW, app-local) — uses `ghost` or `outline` for −/+ actions." |
| `Input` | `@camp404/ui/input.tsx` (reuse, `type="number"`) | Underlying numeric field for keyboard entry; `min`, `max`, `value`, `onChange`. Visually unstyled within the Stepper row (border/bg removed via `className`; the row container carries the border). |
| `cn` | `@camp404/ui/lib/utils.ts` | Conditional class merging. |
| Lucide `Minus` / `Plus` | `lucide-react` | Button icons. Sizes match the board's icon-only button pattern (16×16 / `h-4 w-4`). |

**No `@camp404/core` or `@camp404/db` dependencies** — Stepper is purely presentational and owns no domain logic. The `[1,100]` clamp is simple arithmetic executed inside the component; it does not warrant extraction to `core`.

---

## Absorbs — candidates replaced (merge map)

None. The merge map has no entry for Stepper; it is a new pattern with a single consumer. No inventory candidate collapses into it.

---

## Stories & tests

### Storybook stories (`stepper.stories.tsx`, co-located in `apps/web/app/tools/invite/`)

| Story | Props |
|---|---|
| `Default` | `value={5}`, `min={1}`, `max={100}` |
| `AtMin` | `value={1}`, `min={1}`, `max={100}` — − button disabled |
| `AtMax` | `value={100}`, `min={1}`, `max={100}` — + button disabled |
| `Disabled` | `value={3}`, `disabled={true}` — both buttons + input inert, whole row dimmed |
| `NarrowRange` | `value={1}`, `min={1}`, `max={3}` — shows fast boundary hits |

### Vitest / RTL test cases (`stepper.test.tsx`, co-located)

1. **Renders value** — renders `"5"` in the input when `value={5}`.
2. **Increment** — clicking + fires `onChange(6)` when `value={5}`, `max={100}`.
3. **Decrement** — clicking − fires `onChange(4)` when `value={5}`, `min={1}`.
4. **At-min boundary** — clicking − when `value={1}`, `min={1}`: button is `disabled`; `onChange` is NOT called.
5. **At-max boundary** — clicking + when `value={100}`, `max={100}`: button is `disabled`; `onChange` is NOT called.
6. **Clamp on keyboard entry** — blurring the input with `"0"` calls `onChange(1)` (clamps to `min`); `"200"` calls `onChange(100)` (clamps to `max`).
7. **Disabled state** — both buttons and input have `disabled` attribute when `disabled={true}`; `onChange` not called on click.
8. **Controlled** — changing `value` prop updates the displayed number (controlled component pattern).

### A11y notes

- The `NumberInput` row acts as a composite widget. The `<input type="number">` carries its own native semantics; label association is the consumer's responsibility (see Consumers — `CaptainOptions` must provide `<Label htmlFor={id}>` wired to the input).
- Both icon buttons must have `aria-label`: `"Decrease count"` / `"Increase count"` (no visible text).
- Both buttons carry `disabled` attribute (not just `pointer-events-none`) when at boundary or `disabled` prop is set, so they are skipped by assistive technology in the tab order.
- `aria-label` on the `<input>` defaults to `"Number of uses"` but is overridable via the prop for other potential callers.
- No `role="spinbutton"` override needed — `type="number"` already implies `spinbutton`; do not duplicate.

---

## Build steps — ordered + acceptance criteria

### Step 1 — Scaffold file

Create `apps/web/app/tools/invite/stepper.tsx` as a `"use client"` module exporting `Stepper` (named export, no default). Import `Button` from `@camp404/ui/components/button`, `Input` from `@camp404/ui/components/input`, `cn` from `@camp404/ui/lib/utils`, and `Minus` / `Plus` from `lucide-react`.

**AC:** File compiles with no TS errors; tree-shakes cleanly.

### Step 2 — Implement controlled value logic

- `onClick` of + button: `onChange(Math.min(value + 1, max ?? 100))`.
- `onClick` of − button: `onChange(Math.max(value - 1, min ?? 1))`.
- `<input>` `onChange`: update display value string in local state.
- `<input>` `onBlur`: parse to integer, clamp to `[min, max]`, call `onChange` with clamped value.
- `<input>` controlled via `value` prop (as string `String(value)`).

**AC:** All 8 Vitest test cases pass.

### Step 3 — Apply board geometry and tokens

Apply the `NumberInput` row layout from board `23-s14-invite-tool.txt`: `flex h-[46px] w-full items-center justify-between px-[14px] rounded-[var(--radius)] border border-input bg-muted`. Value input: strip default input border/background (`border-none bg-transparent outline-none`) so the row container is the sole visual frame. Stepper group: `flex items-center gap-[10px]`. Icon buttons: `ghost` + `size="icon"`, icons `h-4 w-4 text-muted-foreground`.

**AC:** Storybook `Default` story visually matches the board spec within 2px; `at-min` and `at-max` stories show one dimmed button.

### Step 4 — Disabled + boundary states

- `at-min`: − button `disabled`; icon opacity reduced (`opacity-40` via `text-muted-foreground/40`).
- `at-max`: + button `disabled`; icon opacity reduced.
- `disabled` prop: both buttons and input carry `disabled`; row `opacity-50`.

**AC:** `AtMin`, `AtMax`, `Disabled` Storybook stories render correctly; RTL test cases 4, 5, 7 pass.

### Step 5 — Wire into CaptainOptions

In `apps/web/app/tools/invite/invite-form.tsx`, replace the bare `<Input type="number" ... className="w-28" />` block (lines 296–308) with `<Stepper value={Number(maxUses)} onChange={(v) => onMaxUsesChange(String(v))} min={1} max={100} />`. Keep the `name="maxUses"` hidden input or attach a hidden `<input name="maxUses" value={maxUses} />` beside the Stepper so the FormData submission still carries the value (the underlying Stepper `<input>` carries `name="maxUses"` directly — confirm it still submits correctly through `useActionState`).

**AC:** Invite form works end-to-end (captain variant): − / + buttons mutate the helper copy; the value submits correctly; `createInviteAction` validation ("Max uses must be a whole number between 1 and 100.") still fires on an out-of-range crafted POST.

### Step 6 — Storybook + tests

Write `stepper.stories.tsx` (5 stories from §Stories) and `stepper.test.tsx` (8 test cases from §Tests).

**AC:** All tests pass; Storybook renders without console errors; axe scan on `Default` story clean.

---

## Consumers

| Consumer | File | How it uses Stepper |
|---|---|---|
| `CaptainOptions` (inline fn in `InviteForm`) | `apps/web/app/tools/invite/invite-form.tsx` | `value={Number(maxUses)}` / `onChange={(v) => onMaxUsesChange(String(v))}` / `min={1}` / `max={100}`; controls the multi-use cap for captain invite creation |
| `InviteForm` (organism) | same | Indirectly via `CaptainOptions`; captain variant only |

No other consumers currently exist. Stepper is scoped app-local (not promoted to `@camp404/ui`) because it has one real consumer and the board draws it only on this surface. If a second consumer emerges (e.g. a quantity picker on a future surface), promote it to `@camp404/ui/stepper.tsx` at that point.
