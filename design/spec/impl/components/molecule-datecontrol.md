# DateControl — molecule plan

- **mapsTo:** NEW · no standalone component exists in `@camp404/ui` or `apps/web`; the `date` kind is currently rendered inline as a bare `<Input type="date">` inside `apps/web/components/questionnaire/question.tsx` (lines 194–202). A NEW named wrapper is required to meet the spec.
- **Target file:** `packages/ui/src/components/date-control.tsx`

---

## Current state — does it exist? where? gap vs spec

**No `DateControl` in `@camp404/ui`.** Confirmed by `ls packages/ui/src/components/` — no `date-control.tsx` present.

**The `date` field kind is live in `apps/web/components/questionnaire/question.tsx`**, in the `FieldInput` switch arm (lines 194–202):

```tsx
case "date":
  return (
    <Input
      id={id}
      type="date"
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
```

This is a bare `Input` atom with no calendar icon, no explicit `h:46` geometry, no muted-fill override, and no ISO-output contract enforced at the component boundary. It relies entirely on the native browser date picker and browser-locale display.

**Gaps vs spec (`component-library.md`, `04-onboarding-wizard.md §4`, `20-field-renderer.md §B6`):**

| Gap | Current inline | Spec |
|---|---|---|
| Component identity | Anonymous `<Input type="date">` in a `switch` arm | Named `DateControl` exported from `@camp404/ui` |
| Height | Inherits Input atom's `h-10` (40px) | Board draws `h:46`; snap to `h-11` (44px) via className — the closest token step |
| Background | `bg-background` (Input default) | `fill:$muted` (board draw, consistent with combobox/select triggers) |
| Calendar icon | None | `calendar` lucide icon, trailing |
| Placeholder | Browser-native locale format | "dd / mm / yyyy" (OB Step 02 board; OB wizard brief §4 DateControl spec) |
| ISO contract | Implicit — `e.currentTarget.value` from a `type="date"` input is already `yyyy-mm-dd`, but contract is undocumented | Explicit: emits ISO `yyyy-mm-dd` string; `value` prop accepts ISO string or `""` |
| Error state | Border switch to `$destructive` expressed by host (S05 draws it) | Explicit `error` prop triggers `border-destructive` on the control itself |
| Disabled state | Not wired | `disabled` prop passes through to the underlying `<input>` |

The spec classification in `component-library.md` reads:
> `@camp404/ui/input.tsx` `type="date"` (reuse) + calendar affordance. Emits ISO `yyyy-mm-dd`.

The "reuse" refers to `Input` as the **underlying primitive** (the component composes it), not to `Input` being the deliverable. The new `DateControl` wraps `Input type="date"` and adds the icon, geometry, and muted-fill layer. Classification: **NEW**.

---

## API — props, variants, sizes, states

### Props

```ts
interface DateControlProps {
  /** ISO yyyy-mm-dd string, or "" when empty. */
  value: string;
  /** Called with an ISO yyyy-mm-dd string on each change. */
  onChange: (value: string) => void;
  /** Field id forwarded to the underlying <input> for htmlFor wiring. */
  id?: string;
  /** Disables the control. */
  disabled?: boolean;
  /**
   * When true, applies destructive border + ring to signal validation
   * failure. Host (QuestionField / InputField shell) sets this from
   * its own error prop.
   */
  error?: boolean;
  /** Optional className forwarded to the root wrapper (layout overrides). */
  className?: string;
}
```

### Variants

The board and spec draw a single default variant. No `size` or `tone` variants are specified for this molecule.

| Variant | Description |
|---|---|
| `default` | `h:46` muted-fill input + trailing `calendar` icon, ISO in/out |

### Sizes

Single size — `h-11` (44px, nearest token step to the board's `h:46`). No `size` prop.

### States

| State | Visual | Notes |
|---|---|---|
| `empty` | Placeholder "dd / mm / yyyy" in `$muted-foreground`; `calendar` icon `$muted-foreground` | Default when `value=""` |
| `populated` | Date text in `$foreground`; `calendar` icon `$muted-foreground` | When `value` is a valid ISO string |
| `focus` | `focus-visible:ring-2 focus-visible:ring-ring` on the inner `<input>` | Keyboard / pointer focus |
| `error` | `border-destructive` + `focus-visible:ring-destructive` on the control; host renders the error line below | `error={true}` prop; S05 draws `$destructive` border on the `date` error state |
| `disabled` | `opacity-50 cursor-not-allowed`; interaction blocked | `disabled={true}` prop |

---

## Tokens & type — design tokens and type-scale roles

All tokens from `design-tokens.md` and `design/spec/component-library.md`. No raw hex.

| Element | Token(s) | Type role |
|---|---|---|
| Root wrapper | `relative flex items-center` | — |
| Input background | `bg-muted` | — |
| Input border | `border-input` (default) · `border-destructive` (error) | — |
| Input border-radius | `rounded-[--radius]` (`--radius` = 10px, the default `$radius` token) | — |
| Input height | `h-11` (44px — nearest step to board `h:46`) | — |
| Input text colour | `text-foreground` | `--text-body` (Inter 14px/400) |
| Placeholder colour | `placeholder:text-muted-foreground` | `--text-body` |
| Focus ring colour | `focus-visible:ring-ring` (default) · `focus-visible:ring-destructive` (error) | — |
| Calendar icon colour | `text-muted-foreground` | — |
| Calendar icon size | `h-4 w-4` | — |
| Calendar icon position | `absolute right-3 pointer-events-none` | — |
| Disabled opacity | `disabled:opacity-50 disabled:cursor-not-allowed` | — |

**No mono face** — date input text is UI/Inter (body role). The field is a data entry control, not a data-console display. `--font-mono` (JetBrains Mono) is not used here; only invite slugs, roster terminal, and trace codes carry the mono face.

**Dark-only app** — no `dark:` utilities.

**Required-field marker `*`** — the marker is owned by the host shell (`QuestionField` / `InputField`), not by `DateControl` itself. `DateControl` has no `required` prop; required/optional is a field-level concern expressed upstream.

---

## Composition & deps — atoms, primitives, helpers

| Dependency | Source | Role |
|---|---|---|
| `Input` atom | `@camp404/ui/components/input` | Underlying native `<input type="date">` primitive |
| `cn` utility | `@camp404/ui/lib/utils` | Class merging for `className` prop overrides |
| `Calendar` icon | `lucide-react` | Trailing calendar affordance (decorative, `aria-hidden`) |

**`@camp404/core` helpers** — none required. `DateControl` is pure presentation; it does not call `rankLevel`, format helpers, or any domain logic. ISO formatting is native to `<input type="date">` — the browser always writes `yyyy-mm-dd` to `e.target.value` regardless of display locale.

**Why not use `Popover` + a calendar widget?** The spec explicitly states `@camp404/ui/input.tsx type="date"` as the backing primitive — the calendar affordance is a trailing icon (decorative guide to intent), not a custom picker popover. The native date picker is intentional: it handles locale display, keyboard navigation, accessibility, and mobile OS integration without custom code. No Radix `Calendar` or date-picker library is introduced.

**Layout pattern** — root `<div className="relative">` with `Input` full-width and a `Calendar` icon absolutely positioned `right-3`, `pointer-events-none`, `aria-hidden`. The same trailing-icon pattern used by the `combobox` trigger's `chevron-down`.

---

## Absorbs — candidates replaced

From `component-library.md` merge map: `DateControl` is not listed in the merge map (it has no multi-candidate merge). It absorbs one thing:

1. **The anonymous `<Input type="date">` inline arm** in `apps/web/components/questionnaire/question.tsx` lines 194–202. That arm becomes `<DateControl id={id} value={…} onChange={…} error={!!error} />` once the molecule ships.

No other bespoke date control exists in `apps/web` (confirmed by grep — no other `type="date"` usages in component files). The `birthday` field in `questionnaire.ts` line 86 is the only `date` kind in the live catalogue.

---

## Stories & tests

### Storybook stories

File: `packages/ui/src/components/date-control.stories.tsx`

| Story | Props | Purpose |
|---|---|---|
| `Empty` | `value=""`, `onChange` no-op | Default empty state; shows placeholder and calendar icon |
| `Populated` | `value="1994-07-12"`, `onChange` no-op | Populated state; ISO date visible in browser's locale format |
| `Error` | `value=""`, `error={true}`, `onChange` no-op | Destructive border; simulates failed "birthday" required validation |
| `Disabled` | `value="1990-01-01"`, `disabled={true}`, `onChange` no-op | Disabled affordance; opacity-50 + cursor-not-allowed |
| `Controlled` | Storybook `useState` hook wrapper; full interactive | Shows onChange firing with ISO string; user can type and verify output |

### Vitest / RTL test cases

File: `packages/ui/src/components/__tests__/date-control.test.tsx`

| Test | Description |
|---|---|
| Renders without crash | Mounts `<DateControl value="" onChange={jest.fn()} />`; no throw |
| Renders underlying `<input type="date">` | DOM contains an `input` with `type="date"` |
| Forwards `id` to the input | `id="q-birthday"` prop appears on the `<input>` |
| Calendar icon is aria-hidden | `Calendar` icon rendered with `aria-hidden="true"` |
| onChange fires with ISO string | Simulate `change` event with `target.value="1990-04-12"`; spy called with `"1990-04-12"` |
| Empty string value | `value=""` → input value attribute is `""` |
| Populated value | `value="2000-05-20"` → `input.value === "2000-05-20"` |
| Error state applies destructive border | `error={true}` → root/input has `border-destructive` class |
| Disabled state | `disabled={true}` → `input` has `disabled` attribute; `opacity-50` applied |
| className override | Additional `className` is forwarded to the root wrapper |

### Accessibility notes

- The underlying `<input type="date">` carries native accessible semantics (role `textbox` / date-specific in some UAs); no additional `role` is needed.
- `id` prop must be wired so the host `<Label htmlFor="q-birthday">` connects to the control — confirmed: the `FieldInput` branch passes `id={id}` and the `QuestionField` shell sets `htmlFor={fieldId}`.
- The `Calendar` icon is decorative; apply `aria-hidden="true"` to prevent screen readers announcing it.
- Focus ring uses `focus-visible:ring-ring` — keyboard-only, never on mouse click.
- In error state, the host `QuestionField` renders `<p role="alert">{error}</p>` beneath the field. `DateControl` does not own the error message; the `error` boolean prop only controls the visual border change on the control itself. This matches the pattern in `20-field-renderer.md §A` ("the control border may switch to `$destructive`") and `S05` which draws the destructive border on the `date` kind.
- No reduced-motion concern — no animation on this component.
- The native date picker is WCAG-compliant across modern browsers and mobile OS; no custom overlay accessibility work required.

---

## Build steps — ordered with acceptance criteria

**Prerequisite:** `foundations-tokens.md` token step must land first — `bg-muted`, `border-input`, `border-destructive`, `text-foreground`, `text-muted-foreground`, `ring-ring`, and `--radius` are all confirmed present in `packages/ui/src/styles/globals.css`.

1. **Create `packages/ui/src/components/date-control.tsx`**
   - Implement the component per the API above.
   - Root: `<div className={cn("relative", className)}>`.
   - Inner `<Input>`: `type="date"`, `id={id}`, `value={value}`, `onChange={(e) => onChange(e.currentTarget.value)}`, `disabled={disabled}`, `className={cn("h-11 bg-muted pr-9", error && "border-destructive focus-visible:ring-destructive")}`.
   - `Calendar` icon: `<Calendar className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" aria-hidden="true" />`.
   - **Acceptance:** component renders with correct shape; no TS errors; no Tailwind `dark:` utilities; no raw hex; `h-11 bg-muted` visible in DOM; `border-destructive` applied when `error={true}`; `Calendar` icon present and `aria-hidden`.

2. **Export from the `@camp404/ui` package barrel**
   - Add `export { DateControl } from "./components/date-control"` and `export type { DateControlProps }` to the package index.
   - **Acceptance:** `import { DateControl } from "@camp404/ui"` resolves in `apps/web` with no TS error.

3. **Write Storybook stories** (`date-control.stories.tsx`)
   - Cover all five stories listed above.
   - **Acceptance:** all stories render; `Empty` story shows the calendar icon and placeholder; `Error` story renders destructive border.

4. **Write Vitest / RTL tests** (`__tests__/date-control.test.tsx`)
   - Cover all ten test cases listed above.
   - **Acceptance:** `pnpm --filter @camp404/ui test` green; no snapshot drift.

5. **Replace the inline `date` arm in `question.tsx`**
   - In `apps/web/components/questionnaire/question.tsx`, `FieldInput` switch `case "date"` (lines 194–202):
     - Import `DateControl` from `@camp404/ui`.
     - Replace the bare `<Input type="date" …>` with `<DateControl id={id} value={typeof value === "string" ? value : ""} onChange={(v) => onChange(v)} error={false} />`.
     - Note: `error` is `false` here — the `QuestionField` shell already renders the error line below the field; the `error` prop on `DateControl` should be wired once `QuestionField` passes an `error` boolean down to `FieldInput` (currently it only passes a string to the shell). A follow-up: thread `!!error` from `QuestionField` into `FieldInput` and finally into `DateControl` so the destructive border fires on validation failure. Flag as a two-line wiring change.
   - **Acceptance:** onboarding step 02 (`birthday` question) and any field-renderer `date` kind render `DateControl`; no bare `<Input type="date">` remains in `question.tsx`; the `#q-birthday` locator used by `apps/web/tests/e2e/onboarding-questionnaire.spec.ts` (line 36: `await page.locator("#q-birthday").fill("1990-04-12")`) continues to resolve (the `id` prop is forwarded to the underlying `<input>`).

6. **Wire `error` border through `FieldInput`**
   - In `question.tsx`, add an `error?: string` prop to `FieldInput` and pass `error={!!error}` into the `DateControl` call.
   - **Acceptance:** entering an invalid date string and triggering Next on the wizard renders both the red error line (host) and the destructive border (DateControl); matches the S05 drawn state.

7. **Remove the now-unused bare `Input type="date"` import guard**
   - Confirm `Input` is still used by other arms in `FieldInput` (`short_text`); if so, no import change needed. If `date` was the only consumer of a particular `Input` import path — no change required, `short_text` keeps it.
   - **Acceptance:** no unused-import warnings; `pnpm build` green on `apps/web`.

---

## Consumers — molecules, organisms, and surfaces that use DateControl

| Consumer | File | Usage |
|---|---|---|
| `QuestionField` / `FieldInput` | `apps/web/components/questionnaire/question.tsx` | `date` kind arm — birthday (onboarding step 02) and any future `date` question |
| `QuestionnaireWizard` (via `QuestionField`) | `apps/web/components/questionnaire/wizard.tsx` | Onboarding step 02 "About you" page; questionnaire-runner if a `date` kind appears in any required-action form |
| `QuestionField` organism (spec) | `apps/web` (keep app-local) | The `QuestionField` organism owns the 10-kind switch and is the sole direct consumer of `DateControl`; no other organism or molecule calls `DateControl` directly |

`DateControl` has **no other confirmed consumers** beyond the `date` question kind in the field renderer. All surfaces that render a `date` question go through `QuestionField` → `FieldInput` → `DateControl`. Direct use outside the field renderer is not anticipated in the current spec.
