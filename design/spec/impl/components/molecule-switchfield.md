# SwitchField — molecule plan

- **mapsTo:** NEW · Target file: `packages/ui/src/components/switch.tsx`

---

## Current state — does it exist? where? gap vs spec

**No Switch primitive exists anywhere in `@camp404/ui`.** Confirmed by `ls packages/ui/src/components/` — the package contains avatar, button, card, checkbox, combobox, command, dialog, input, label, popover, select, slider, textarea (reusable atoms), plus the dead control-panel/control-grid/quadrant-nav. No `switch.tsx`.

**No hand-rolled SwitchField exists in `apps/web`.** The `toggle` question kind is currently rendered by `ToggleField` in `apps/web/components/questionnaire/question.tsx` (lines 249–288). That implementation is a **segmented radiogroup** — `role="radiogroup"` container with one `<button role="radio" aria-checked>` per option — not an iOS-style switch. It does not match the board affordance for the 2-option on/off case.

**Board authority:**

- `design/.spec-extract/boards/33-s24-primitive-kit.txt` lines 68–72 — draws the switch directly in the "Toggles" section:
  `▸ "sw" {w:44 h:26 pad:3 jc:end ai:center r:999 fill:$primary}` / `◯ "knob" {w:20 h:20 fill:#ffffff}` (on state). The off state is implied by absence but confirmed on S05.
- `design/.spec-extract/boards/14-s05-field-kinds.txt` lines 84–96 — draws the `Kind/toggle` section as a "ToggleList" of label+switch rows: on-row has `{w:48 h:28 pad:[0,3] jc:end ai:center r:14 fill:$primary}` knob `fill:$primary-foreground`; off-row has `{w:48 h:28 pad:[0,3] ai:center r:14 fill:$muted stroke:$border}` knob `fill:$foreground`.

**Gaps vs spec:**

| Aspect | Live (`ToggleField`) | Board spec | Gap |
|---|---|---|---|
| Visual affordance | Segmented radiogroup (horizontal button bar) | iOS-style Switch (pill track + circle knob) | Wrong control shape for 2-option on/off case |
| Track shape | `rounded-md border p-1` | `r:999` (fully rounded pill, 44–48×26–28) | `rounded-full` required |
| On state | `bg-primary text-primary-foreground` segment | `fill:$primary`, knob `fill:$primary-foreground` (`#ffffff` on S24) | Close — colour is correct, shape is wrong |
| Off state | `text-muted-foreground` unselected segment | `fill:$muted stroke:$border`, knob `fill:$foreground` | Muted track + border needed |
| Value type | `string` option value (correct) | String option value (correct) | No gap — both persist a string, not a boolean |
| Label association | None — label is the `<Label>` above in `QuestionField` | Inline beside the switch (S05 `ToggleList` rows have label left, switch right) | `SwitchField` wraps label+switch together in one row |
| ARIA | `role="radiogroup"` / `role="radio"` | `role="switch"` `aria-checked` | Role must change for the switch affordance |

The component-library spec (component-library.md line 220) and the build-time reconciliation note (line 611) both confirm: `toggle→SwitchField` is a locked decision. The `SegmentedControl` molecule handles 2–4 option single-select sets; `SwitchField` handles the **2-option on/off** case (Open Question D21 recommends deriving from `options.length === 2`). Both emit a string option value — the `boolean` member of the response union stays vestigial (surface spec 20-field-renderer.md lines 116, 162).

---

## API — props, variants, sizes, states

### Props

```ts
interface SwitchFieldProps {
  /**
   * The two option values from `ToggleQuestion.options`.
   * Index 0 = off option, index 1 = on option (the switch is "on"
   * when `value === options[1].value`).
   */
  options: [{ value: string; label: string }, { value: string; label: string }];

  /**
   * Current selected option value. One of the two `options[].value`
   * strings, or `undefined` when the field is unpopulated (no option
   * selected yet).
   */
  value: string | undefined;

  /** Callback fired with the newly selected option value (never a boolean). */
  onChange: (value: string) => void;

  /**
   * Field prompt / label text. Rendered inline to the left of the switch
   * track in the SwitchField row (S05 ToggleList anatomy). If used inside
   * `QuestionField` the host still provides the top-level `<Label>` — the
   * inline label here is for the single-row SwitchField standalone use
   * (S24 kit, direct placement).
   */
  label?: string;

  /** Disables interaction and dims the control. */
  disabled?: boolean;

  /**
   * Accessible label when no visible `label` text is provided.
   * Required if `label` is omitted.
   */
  "aria-label"?: string;

  /** Optional className forwarded to the root row wrapper. */
  className?: string;
}
```

### Variants

| Variant | When | Description |
|---|---|---|
| `on` | `value === options[1].value` | Track = `bg-primary`, knob pushed to end (`justify-end`). Knob = `bg-primary-foreground` (white). |
| `off` | `value === options[0].value` or `value === undefined` | Track = `bg-muted border border-border`, knob at start (`justify-start`). Knob = `bg-foreground`. |

No `size` or `tone` variants — the boards draw one size and one palette pair.

### Sizes

Single size, derived directly from the boards:

| Measurement | S05 board | S24 board | Canonical |
|---|---|---|---|
| Track width | 48px | 44px | **44px** (S24 kit is the reference primitive) |
| Track height | 28px | 26px | **26px** |
| Track radius | `r:14` (≈ half height) | `r:999` | `rounded-full` (`--radius-full`) |
| Track padding | `pad:[0,3]` | `pad:3` | `p-[3px]` inset |
| Knob diameter | 22px | 20px | **20px** (matches S24 `w:20 h:20`) |

S24 is the primitive-kit reference (per spec conventions: "S24 Primitive kit is the type/colour reference board"). S05 values are illustrative — snap to S24.

### States

| State | Description |
|---|---|
| `off` (unpopulated) | Track muted + border; knob at start. No `aria-checked`. Treat as the initial/empty state — off option is not yet committed. |
| `off` (committed) | `value === options[0].value`; visually identical to unpopulated off. `aria-checked="false"`. |
| `on` | `value === options[1].value`; track primary; knob at end. `aria-checked="true"`. |
| `disabled` | `opacity-50 pointer-events-none cursor-not-allowed`. Track and knob retain their on/off appearance. |
| `focus-visible` | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` on the track element. |

---

## Tokens & type — design tokens and type-scale roles

All tokens from `design/spec/design-tokens.md`. No raw hex, no inline px beyond the single `p-[3px]` inset that has no token equivalent.

| Element | Token(s) | Notes |
|---|---|---|
| Track (on) fill | `bg-primary` | `oklch(0.65 0.27 340)` — hot-magenta brand |
| Track (off) fill | `bg-muted` | `oklch(0.22 0.06 295)` |
| Track (off) border | `border border-border` | `oklch(0.35 0.1 305)` |
| Track shape | `rounded-full` | `--radius-full: 9999px` |
| Track size | `w-11 h-[26px]` | 44×26px — nearest Tailwind step for 44px is `w-11` (44px); height uses bracket for the 26px spec value |
| Track padding | `p-[3px]` | Board `pad:3` / `pad:[0,3]` — no token; literal pixel inset |
| Track transition | `transition-colors duration-200` | Knob and track colour animate on state change |
| Knob (on) fill | `bg-primary-foreground` | `oklch(0.99 0.005 340)` — near-white on primary |
| Knob (off) fill | `bg-foreground` | `oklch(0.97 0.02 330)` — primary text colour |
| Knob shape | `rounded-full` | `--radius-full` |
| Knob size | `w-5 h-5` | 20×20px |
| Knob position (on) | `ml-auto` | Knob pushed to the end of the flex track |
| Knob position (off) | `mr-auto` | Knob at the start of the flex track |
| Knob transition | `transition-transform duration-200` | Smooth slide; use `translate-x` if motion is acceptable (see a11y note) |
| Label text colour | `text-foreground` | Inter 14px/normal — `--text-body` |
| Label type role | `--text-body` | Inter 14px/400 (S05 row label: `Inter/14px/normal/$foreground`) |
| Disabled opacity | `opacity-50` | Shared disabled convention across the system |
| Focus ring | `ring-ring ring-offset-background` | `--color-ring` = primary |
| Row layout gap | `gap-3` | 12px between label and track — approximate board `gap:14` snapped to Tailwind scale |
| Root wrapper | `flex items-center justify-between` | Label left, switch right (S05 `jc:space_between ai:center`) |

**No `dark:` variants.** Dark-only app.

**Reduced-motion:** the knob slide animation (`transition-transform`) must be conditioned on `motion-safe:`. Use `motion-safe:transition-transform` so the knob snaps instantly for users with `prefers-reduced-motion: reduce`.

---

## Composition & deps — atoms/primitives and `@camp404/core` helpers

| Dependency | Source | Role |
|---|---|---|
| `cn` | `@camp404/ui/lib/utils` | Class merging for `className` prop override and conditional on/off classes |
| No Radix primitive | — | The Switch is implemented with a plain `<button role="switch" aria-checked>` — no Radix `@radix-ui/react-switch` dependency. The board draws a custom-shaped toggle (not a Radix primitive); adding the Radix dep for a single bespoke control adds weight with no benefit. |
| No other `@camp404/ui` atoms | — | The knob is a plain `<span>` styled with utilities; no `Avatar`, `Badge`, or other atom is composed. |
| `@camp404/core` | — | No domain logic helpers needed. `SwitchField` is pure presentation. |

**Why no Radix Switch?** `@radix-ui/react-switch` is not currently installed in `@camp404/ui` (checked against the package list — the existing atoms use Radix for Checkbox, Select, Slider, Popover, Dialog, but not Switch). The component-library spec classifies this as NEW with a bespoke shape (`r:999`, custom knob geometry). Installing Radix Switch would add a dependency for a control that is fully achievable with a `<button role="switch">` + 3 utility classes for the knob position. Keep the dependency footprint minimal. If Radix Switch is installed for another reason later, migrate then.

---

## Absorbs — candidates replaced

From the component-library merge map: `SwitchField` has **no multi-candidate merge** in the table — it is listed as a direct NEW with no inventory collapse entry. It absorbs one implicit pattern:

1. **`ToggleField` in `apps/web/components/questionnaire/question.tsx` (lines 249–288)** — the current segmented-radiogroup renderer for `question.kind === "toggle"`. This is not a named component in the inventory; it is an inline private function. When `SwitchField` ships, `ToggleField` is replaced for the 2-option case. The `options.length === 2` branch delegates to `SwitchField`; `options.length > 2` delegates to `SegmentedControl`.

The segmented radiogroup in `ToggleField` does not ship as a standalone component — it is subsumed into `SegmentedControl` for the general case (per component-library.md lines 43, 211–215). `SwitchField` covers only the on/off 2-option presentational variant.

**No other named candidate is absorbed.** The S05 "ToggleList" pattern (label-rows each with a switch) is the host layout drawn by `ToggleField`'s caller, not a separate component.

---

## Stories & tests

### Storybook stories

File: `packages/ui/src/components/switch.stories.tsx`

| Story | Props | Purpose |
|---|---|---|
| `Off` | `options=[{value:"off",label:"Off"},{value:"on",label:"On"}]`, `value="off"`, `label="Email updates"` | Off state — muted track, knob left |
| `On` | same options, `value="on"`, `label="Email updates"` | On state — primary track, knob right |
| `Unpopulated` | same options, `value={undefined}`, `label="SMS alerts"` | No value yet — visually same as off, `aria-checked` absent |
| `Disabled_Off` | `value="off"`, `disabled`, `label="Push notifications"` | Disabled off (opacity-50, inert) |
| `Disabled_On` | `value="on"`, `disabled`, `label="Push notifications"` | Disabled on (opacity-50, inert) |
| `NoLabel_AriaLabel` | `options=...`, `value="on"`, no `label`, `aria-label="Email updates"` | Headless use — no visible label, aria-label covers accessibility |
| `FocusVisible` | `value="off"`, `label="Focus test"` | Use `play()` to `.focus()` the button — ring visible |
| `S24Kit` | Mirrors the S24 primitive-kit Toggles section — switch on (primary) beside "Switch — on" text | Board-match regression |
| `S05ToggleList` | Two `SwitchField` rows stacked (Email updates=on, SMS alerts=off) | Matches S05 `Kind/toggle` ToggleList anatomy |

### Vitest / RTL test cases

File: `packages/ui/src/components/__tests__/switch.test.tsx`

| Test | Description |
|---|---|
| Renders label | `label` text is visible in the DOM |
| Renders without label (aria-label) | No `label` prop; `aria-label` is applied to the `<button>` |
| Off state: aria-checked false | When `value === options[0].value`, `button` has `aria-checked="false"` |
| On state: aria-checked true | When `value === options[1].value`, `button` has `aria-checked="true"` |
| Unpopulated: no aria-checked | When `value === undefined`, `aria-checked` is absent or `"false"` (document the policy: treat undefined as off → `"false"`) |
| Click fires onChange with on value | Click when off → `onChange` called with `options[1].value` |
| Click fires onChange with off value | Click when on → `onChange` called with `options[0].value` |
| Disabled: click does not fire onChange | `disabled=true`; click → `onChange` not called |
| Disabled: has pointer-events-none | Root wrapper or button has `opacity-50` class (or similar disabled indicator) |
| className prop forwarded | Extra className appears on the root wrapper |
| Exactly two options enforced | TypeScript-only (tuple type); no runtime test needed |
| Keyboard Enter/Space fires onChange | `fireEvent.keyDown` with Enter and Space each trigger the toggle |

### Accessibility notes

- The track element is `<button type="button" role="switch" aria-checked={isOn}>`. `role="switch"` is the correct ARIA role for an iOS-style toggle (distinguishes from `role="checkbox` in screen reader announcement).
- `aria-checked` takes a boolean value (`true` | `false`). When `value` is `undefined` (unpopulated), render as `false` — the user has not turned it on.
- The visible label (when provided) should be associated via `aria-labelledby` pointing to a sibling `<span id>` rather than wrapping the button in a `<label>` (which is valid but can cause double-announcement in some reader + role combinations).
- Alternatively: render `<label>` wrapping the text `<span>` plus the `<button>` — simpler and valid. Document the choice in the implementation.
- Knob slide animation: `motion-safe:transition-transform duration-200` — suppressed for `prefers-reduced-motion: reduce` so the knob snaps instantly. No `animate-*` class.
- Colour contrast: `$primary` track with `$primary-foreground` knob — confirmed legible on the dark palette. `$muted` track with `$foreground` knob — `oklch(0.97)` on `oklch(0.22)`, high contrast.
- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background` — only visible on keyboard navigation.
- Do not add `aria-label` to the knob `<span>` — it is decorative (`aria-hidden`).

---

## Build steps — ordered with acceptance criteria

**Prerequisite:** `foundations-tokens.md` token step must land first — `--radius-full`, `bg-primary`, `bg-muted`, `border-border`, `bg-primary-foreground`, `bg-foreground`, `text-foreground`, `ring-ring`, and `opacity-50` are all confirmed present in `packages/ui/src/styles/globals.css`. Also confirm `--color-background` (for `ring-offset-background`). No new tokens are needed by `SwitchField` — it uses only the confirmed palette.

1. **Create `packages/ui/src/components/switch.tsx`**
   - Implement `SwitchFieldProps` interface and `SwitchField` component.
   - Derive `isOn = value === options[1].value`.
   - Root: `<div className={cn("flex items-center justify-between gap-3", className)}>`.
   - Label: `<span id={labelId} className="text-sm text-foreground">{label}</span>` (Inter 14px = `text-sm`).
   - Track: `<button type="button" role="switch" aria-checked={isOn} aria-labelledby={label ? labelId : undefined} aria-label={!label ? ariaLabel : undefined} disabled={disabled} onClick={handleToggle} className={cn("relative inline-flex w-11 h-[26px] shrink-0 items-center rounded-full p-[3px] transition-colors motion-safe:transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50", isOn ? "bg-primary" : "bg-muted border border-border")}>`.
   - Knob: `<span aria-hidden className={cn("inline-block w-5 h-5 rounded-full motion-safe:transition-transform duration-200", isOn ? "translate-x-[18px] bg-primary-foreground" : "translate-x-0 bg-foreground")} />`.
   - `handleToggle`: when on → `onChange(options[0].value)`; when off or undefined → `onChange(options[1].value)`.
   - **Acceptance:** component renders; on/off states visually match S24 primitive-kit board; no TS errors; no `dark:` utilities; no raw hex.

2. **Export from `packages/ui/src/index.ts`** (or the package barrel)
   - Add `export { SwitchField } from "./components/switch"` and `export type { SwitchFieldProps }`.
   - **Acceptance:** `import { SwitchField } from "@camp404/ui"` resolves without error in `apps/web`.

3. **Write Storybook stories** (`switch.stories.tsx`)
   - Cover all stories listed above, including `S24Kit` and `S05ToggleList`.
   - **Acceptance:** all stories render in Storybook; `S24Kit` story matches the primitive-kit board pixel spec (44×26 track, 20×20 knob, primary fill on, muted+border off).

4. **Write Vitest / RTL tests** (`__tests__/switch.test.tsx`)
   - Cover all test cases listed above.
   - **Acceptance:** `pnpm --filter @camp404/ui test` green; no snapshot drift.

5. **Update `ToggleField` in `apps/web/components/questionnaire/question.tsx`**
   - Import `SwitchField` from `@camp404/ui`.
   - In the `case "toggle":` arm of `FieldInput`, replace the existing `<ToggleField …>` render with:
     - If `question.options.length === 2` → `<SwitchField options={[question.options[0], question.options[1]]} value={typeof value === "string" ? value : undefined} onChange={onChange} aria-label={question.prompt} />`.
     - If `question.options.length > 2` → defer to `SegmentedControl` (this branch is the future `SegmentedControl` integration; stub with a `TODO` comment for now, or keep the existing `ToggleField` inline for the 3–4 option case until `SegmentedControl` ships).
   - Remove the `ToggleField` private function once the 2-option path is covered by `SwitchField` and the >2 path is handled.
   - **Acceptance:** `question.kind === "toggle"` with 2 options renders a Switch, not a segmented bar; value persists as the option string (`"on"` / `"off"` or whatever the real option values are), never a boolean; `pnpm --filter apps/web build` green.

6. **Verify open question D21 is documented**
   - The selector rule (`options.length === 2 → SwitchField`, `> 2 → SegmentedControl`) is applied in step 5. This resolves Open Question D21 (open-questions.md line 123) as the recommended option (derive from `options.length`, no schema change). Add a comment to `question.tsx` referencing OQ D21 so future readers understand the selector.
   - **Acceptance:** comment present; no new schema field introduced.

---

## Consumers — molecules/organisms/surfaces that use SwitchField

| Consumer | File | Usage |
|---|---|---|
| `QuestionField` / `ToggleField` | `apps/web/components/questionnaire/question.tsx` | `case "toggle"` arm of `FieldInput`; renders `SwitchField` when `options.length === 2`. Value emitted as string option value (never boolean). |
| S24 primitive-kit showcase | Board `33-s24-primitive-kit.txt` (Toggles section) | The primitive-kit board draws the switch as a design-system reference. In the app the S24 board is not a rendered screen; the kit showcase is rendered via Storybook stories only. |
| `QuestionnaireWizard` (indirect) | `apps/web/components/questionnaire/wizard.tsx` | Reaches `SwitchField` via `QuestionField` → `FieldInput` → `case "toggle"`. No direct import. |
| Questionnaire runner (`CurrentQuestionCard`) | `apps/web/components/questionnaire/question.tsx` (same file) | The runner composes `QuestionField`; any `toggle` question in a blocking runner uses `SwitchField`. |
| `my-forms` replay | `apps/web/app/my-forms/…` (indirect via `QuestionField`) | Form-replay flow also passes through `QuestionField` for all 10 kinds including toggle. |

**Not a consumer:** the onboarding wizard step 02 ID-type segmented control (`passport` / `sa_id`) — that is a `toggle` kind but with clear two-segment semantics (not on/off), so whether it routes to `SwitchField` or `SegmentedControl` depends on the D21 selector. `options.length === 2` would technically route it to `SwitchField`; if that is wrong for ID-type (a segmented selector, not an on/off), the selector rule may need a per-question `presentation` hint. Document as a known edge case against OQ D21 — do not unilaterally add a schema field during this build step.
