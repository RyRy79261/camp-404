# Combobox — molecule plan

- **mapsTo:** REUSE `packages/ui/src/components/combobox.tsx`
- **Target file:** `packages/ui/src/components/combobox.tsx` (file already exists — extend in place)

---

## Current state — does it exist? where? gap vs spec

**Exists in `@camp404/ui`.** Confirmed at `packages/ui/src/components/combobox.tsx` (114 lines).

The implementation is production-wired and already used by its two spec consumers:

- `apps/web/components/questionnaire/question.tsx` line 14 — imports and renders `Combobox` for the `combobox` question kind (line 221–231). The `id` prop threads through to the trigger `<Button>`.
- There is no hand-rolled alternative in `apps/web`. One e2e spec (`apps/web/tests/e2e/onboarding-questionnaire.spec.ts` lines 39–42) drives the combobox via `getByRole("combobox")` + `getByPlaceholder` + `getByRole("option")`.

The `ComboboxOption` interface (`{ value: string; label: string }`) and `ComboboxQuestion` Zod schema (`packages/types/src/questionnaire.ts` lines 111–123) are the live data contract; both are already aligned.

**Gaps vs spec (cite files):**

| Gap | Current code | Spec target |
|---|---|---|
| Selected-row tint | `CommandItem` inherits cmdk default: `data-[selected='true']:bg-accent` (command.tsx line 104) — uses `$accent` fill, not the spec `primary/12%` tint | `design/spec/surfaces/04-onboarding-wizard.md` line 61: selected row `#ff008c22` → per `design-tokens.md §4 reconciliation #5` this normalises to **`bg-primary/12`** + `stroke:$primary` |
| Selected-row check colour | `<Check />` rendered without an explicit colour class | Spec implies `text-primary` on the check icon to match the row tint |
| `ChevronsUpDown` opacity | Hard-coded `opacity-50` (line 74) | Should resolve to `text-muted-foreground` so it participates in the token system |
| `emptyMessage` default | `"Nothing found."` (line 28) | Matches spec — no change needed |
| `disabled` | Passes through to `<Button disabled>` — correct | Matches spec |
| Popover width | `w-[var(--radix-popover-trigger-width)]` (line 78) — tracks trigger width | Correct; boards show popover = full trigger width |
| `CommandList` max-height | 300px from `command.tsx` | Adequate for 198-country list; no board spec contradicts |
| `flag` prefix in labels | `COUNTRY_OPTIONS` builds labels as `"${countryFlag(c.value)} ${c.label}"` in `apps/web/lib/questionnaire.ts` line 6 — flag is part of the *option label string*, not a separate rendered slot | Board (`04-onboarding-wizard.md` line 61) says "flag emoji + name". This is correct by delegation — the label already carries the flag. No change needed in `Combobox` itself. |

**Classification: REUSE with a targeted EXTEND** — the only code change required is the selected-row tint and check-icon colour to satisfy the token reconciliation. No structural changes.

---

## API — props (name: type, default), variants, sizes, states; the TS prop interface sketch

### Props

```ts
export interface ComboboxOption {
  /** Stored value (e.g. ISO alpha-2 country code). */
  value: string;
  /** Display label (may include flag emoji prefix — the consumer owns this). */
  label: string;
}

interface ComboboxProps {
  /** Full list of options; ReadonlyArray so callers can pass `as const` arrays. */
  options: ReadonlyArray<ComboboxOption>;

  /** Currently selected value, or undefined when nothing is selected. */
  value: string | undefined;

  /** Called with the newly selected value when the user picks an option. */
  onChange: (value: string) => void;

  /** Placeholder shown on the trigger button when nothing is selected.
   *  @default "Select…" */
  placeholder?: string;

  /** Placeholder inside the CommandInput search box.
   *  @default "Search…" */
  searchPlaceholder?: string;

  /** Message rendered by CommandEmpty when the filter yields no results.
   *  @default "Nothing found." */
  emptyMessage?: string;

  /** Forwarded to the trigger Button as the <button> id, enabling htmlFor
   *  linkage from a Label atom. */
  id?: string;

  /** Extra Tailwind classes applied to the trigger Button. */
  className?: string;

  /** When true the trigger is disabled and the popover cannot open. */
  disabled?: boolean;
}
```

### Variants

`Combobox` has a single visual variant. The only behavioural dimension is **selected vs unselected** (controls placeholder colour and check icon visibility). No `size` or `tone` variant is needed by any current consumer.

### States

| State | Trigger behaviour | Popover behaviour |
|---|---|---|
| `closed / placeholder` | Full-width outline button, `text-muted-foreground`, placeholder text, `ChevronsUpDown` icon | Not mounted |
| `closed / selected` | Full-width outline button, `text-foreground`, selected option label (truncated), `ChevronsUpDown` icon | Not mounted |
| `open / unfiltered` | Button `aria-expanded="true"` | All options listed; `CommandInput` focused; no `CommandEmpty` |
| `open / filtering` | — | Options filtered by `cmdk` keyboard-aware substring match against `o.label` |
| `open / empty-results` | — | `CommandEmpty` renders `emptyMessage` |
| `open / row hover or keyboard focus` | — | `data-[selected='true']` row highlighted |
| `selecting` | `setOpen(false)`, `onChange(o.value)` fires, trigger reflects new label | Popover closes |
| `disabled` | Trigger `disabled`, pointer-events none, `opacity-50` (Button atom) | Cannot open |

---

## Tokens & type — exact design tokens + type-scale roles used

### Colour tokens

| Element | Token | Note |
|---|---|---|
| Trigger border | `border-input` | Outline button variant |
| Trigger background | transparent (`variant="outline"`) | — |
| Trigger text (selected) | `text-foreground` | — |
| Trigger text (placeholder) | `text-muted-foreground` | Conditional cn class |
| Trigger focus ring | `ring-ring` | Button atom handles |
| `ChevronsUpDown` icon | `text-muted-foreground` (replace hard-coded `opacity-50`) | Token-at-opacity convention |
| Popover surface | `bg-popover` / `text-popover-foreground` | `= $card` elevation — from `command.tsx` |
| Popover border | `border` | Radix `PopoverContent` default |
| `CommandInput` search icon | `opacity-50` (cmdk convention — acceptable, not a colour token) | — |
| `CommandItem` row (hover / keyboard focus) | `data-[selected='true']:bg-accent data-[selected=true]:text-accent-foreground` | **Existing cmdk default — EXTEND** to **`data-[selected='true']:bg-primary/12 data-[selected=true]:text-primary`** for the selected-row tint per `design-tokens.md §4 reconciliation #5` (`#ff008c22` → `primary/12%`) |
| Selected row check icon | (none today) | Add `text-primary` to the `<Check />` wrapper span |
| `CommandEmpty` text | `text-sm` (no token — inherits popover foreground) | Acceptable |

Note: the `CommandItem` selected-row tint change must target the **app-local `className` override** on `CommandItem` inside `combobox.tsx`, not editing `command.tsx` globally — the cmdk `data-[selected]` defaults serve other potential consumers of `Command` outside the combobox.

### Typography roles

| Element | Role | Token |
|---|---|---|
| Trigger label / option rows | body (`--text-body`) | Inter 14px / 400–500 |
| `CommandInput` placeholder | body (`--text-body`) | Inter 14px, `text-muted-foreground` |
| `CommandEmpty` | body (`--text-body`) | Inter 14px |
| Selected label (truncated) | body-emphasis (`--text-body-strong`) — *no change needed, inherits `font-normal` override on trigger* | Inter 14px / 400 (trigger has `font-normal`) |

No JetBrains Mono usage — combobox is a UI control, not a data-console surface.

### Radius

| Element | Token | Value |
|---|---|---|
| Trigger button | `--radius` (md) | 0.625rem — Button atom default |
| Popover content | `--radius` (md) | 0.625rem — `PopoverContent` default |
| `CommandItem` row | `rounded-sm` (`--radius-sm`) | Existing cmdk class (acceptable) |

---

## Composition & deps — atoms/primitives + @camp404/core helpers

```
Combobox
├── Button (@camp404/ui/button.tsx)           — trigger, variant="outline", role="combobox"
├── Popover / PopoverTrigger / PopoverContent  — Radix popover, width-tracking CSS var
├── Command / CommandInput / CommandList /
│   CommandEmpty / CommandGroup / CommandItem  — cmdk filterable list
├── Check (lucide-react)                       — selected-row indicator icon
├── ChevronsUpDown (lucide-react)             — trigger chevron
└── cn (@camp404/ui/lib/utils)                — class merging
```

**`@camp404/core` helpers used:** none directly. `COUNTRY_OPTIONS` (the data feeding the country combobox) will move from `apps/web/lib/questionnaire.ts` to `@camp404/core` in architecture Phase 3 (plan 03), but `Combobox` itself is option-agnostic — it accepts any `ReadonlyArray<ComboboxOption>` and has no dependency on that data.

**`@camp404/types` used:** `ComboboxQuestion` (in `packages/types/src/questionnaire.ts`) defines the question schema that produces the `options`/`placeholder`/`searchPlaceholder` props passed by `QuestionField`. The `Combobox` component itself imports nothing from `@camp404/types` — the prop contract is the `ComboboxOption` interface defined locally in `combobox.tsx`.

---

## Absorbs — candidates replaced by this component

Per the merge map in `design/spec/component-library.md`: **no merge-map entry for Combobox**. The merge map only lists collapsed candidates; `Combobox` is not absorbed by any other component, and it does not absorb any candidates — it is already the single searchable-select primitive. There are no duplicate or bespoke combobox patterns anywhere in `apps/web` (confirmed by grep: only `question.tsx` imports it).

---

## Stories & tests — Storybook stories + test cases (vitest/RTL); a11y notes

### Storybook stories

No `.stories.tsx` file exists for `Combobox` today (`ls packages/ui/src/components/` confirms). The following stories are needed:

| Story name | Setup | What to show |
|---|---|---|
| `Default` | 5-option list (e.g. short country subset), no value selected | Trigger in placeholder state, `ChevronsUpDown` icon |
| `Selected` | Same list, `value` = one option's value | Trigger shows option label; popover open shows `Check` on that row |
| `WithFlagLabels` | `COUNTRY_OPTIONS` slice (10 entries, SA first), no value | Demonstrates flag-emoji prefix in labels rendering correctly |
| `Filtering` | 198-entry `COUNTRY_OPTIONS`, popover forced open via `play()`, `"south"` typed | Filtered list + matching rows |
| `EmptyResults` | 5-option list, popover open, filter text `"zzz"` | `CommandEmpty` "Nothing found." renders |
| `Disabled` | Any options, `disabled={true}` | Trigger disabled appearance, cannot open |
| `LongLabels` | Options with 60-char labels | Truncation in trigger (`truncate` class) and rows |

### Vitest / RTL unit tests

These are the required test cases (new `packages/ui/src/components/combobox.test.tsx`):

```
describe("Combobox")
  ✓ renders trigger with placeholder when no value selected
  ✓ renders trigger with selected label when value matches an option
  ✓ opens popover on trigger click
  ✓ filters options as the user types in CommandInput
  ✓ selects an option and calls onChange with the option value (not the label)
  ✓ closes the popover after selection
  ✓ shows emptyMessage when filter yields no results
  ✓ does not open when disabled=true
  ✓ trigger is disabled (aria) when disabled=true
  ✓ selected row renders Check icon; unselected rows do not
  ✓ trigger id prop forwards to the <button> element (Label htmlFor linkage)
```

The existing e2e spec (`apps/web/tests/e2e/onboarding-questionnaire.spec.ts` lines 39–42) already covers the integration path: `getByRole("combobox")` click → type "South Africa" → `getByRole("option")` pick. That spec is the acceptance bar for the real country-picker; the RTL tests above cover the unit isolation.

### A11y notes

- The trigger `<Button>` carries `role="combobox"` and `aria-expanded={open}` — correct ARIA pattern.
- `PopoverContent` is Radix-managed: focus moves into `CommandInput` on open; Escape closes (Radix default).
- `CommandInput` provides the search affordance; it does NOT need a separate `aria-label` because the `searchPlaceholder` text ("Search countries…") serves as the accessible name via `placeholder`.
- `CommandItem` rows receive `role="option"` from cmdk (`aria-selected` on the highlighted item) — confirmed by Playwright's `getByRole("option")` in the e2e spec.
- The `<span className="inline-flex h-4 w-4 …">` check icon slot uses conditional render (not opacity toggle) to avoid the Tailwind v4 class-scanner quirk (documented inline in the existing code).
- Dark-only: no `dark:` variants required.
- Reduced-motion: no animations to guard.

---

## Build steps — ordered + acceptance criteria

### Step 0 — Prerequisite: token foundations land (Phase 0)
`--color-primary`, `bg-primary/12` utility must be resolvable in `globals.css`. This is gated on `design/spec/impl/foundations-tokens.md` Phase 0. No combobox code ships before tokens.

**Acceptance:** `bg-primary/12` resolves in the built CSS without a raw hex fallback.

---

### Step 1 — Extend: selected-row tint + check icon colour

In `packages/ui/src/components/combobox.tsx`:

1. Pass `className` to the `<CommandItem>` to override the cmdk `data-[selected]` defaults:
   ```tsx
   <CommandItem
     key={o.value}
     value={o.label}
     onSelect={() => { onChange(o.value); setOpen(false); }}
     className={cn(
       "data-[selected='true']:bg-primary/12 data-[selected='true']:text-primary"
     )}
   >
   ```
2. Add `text-primary` to the check icon span when `isSelected`:
   ```tsx
   <span className={cn(
     "inline-flex h-4 w-4 shrink-0 items-center justify-center",
     isSelected && "text-primary"
   )}>
     {isSelected && <Check />}
   </span>
   ```
3. Replace `opacity-50` on `ChevronsUpDown` with `text-muted-foreground`:
   ```tsx
   <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
   ```

**Acceptance criteria:**
- Selecting "South Africa" in the country combobox renders the row with `bg-primary/12` fill and a `text-primary` check icon.
- Unselected rows are unaffected.
- No raw hex values in the component.
- `ChevronsUpDown` colour traces back to `--color-muted-foreground`.

---

### Step 2 — Add Storybook stories

Create `packages/ui/src/components/combobox.stories.tsx` with the 7 stories listed above.

**Acceptance:** All stories render in Storybook without errors; "Filtering" story's `play()` function shows the filtered list.

---

### Step 3 — Add vitest / RTL unit tests

Create `packages/ui/src/components/combobox.test.tsx` covering the 11 cases listed above.

**Acceptance:** `pnpm --filter @camp404/ui test` green; all 11 cases pass.

---

### Step 4 — Validate e2e path (no new spec needed)

Run the existing e2e spec:
```
pnpm --filter @camp404/web e2e onboarding-questionnaire
```

**Acceptance:** the combobox interaction (`click → type → pick`) in `onboarding-questionnaire.spec.ts` passes unchanged. No changes to the spec file itself.

---

## Consumers — which molecules/organisms/surfaces use it

| Consumer | File | How it uses Combobox |
|---|---|---|
| `QuestionField` (`question.tsx`) | `apps/web/components/questionnaire/question.tsx` | `case "combobox"` branch (line 221); passes `options`, `value`, `onChange`, `placeholder`, `searchPlaceholder`, `id` from the `ComboboxQuestion` shape |
| `QuestionnaireWizard` (organism) | `apps/web/components/questionnaire/wizard.tsx` | Hosts `QuestionField`, which in turn renders `Combobox` for the `country` question on onboarding step 02 |
| `QuestionnaireRunner` (organism, S24/S26) | Questionnaire runner surfaces | Same `QuestionField` path; any future questionnaire with a `combobox` kind question |
| `my-forms` replay | `apps/web/app/my-forms/[id]/page.tsx` | Same `QuestionField` path — form replay renders all 10 kinds |

No other combobox consumers exist in the codebase (confirmed by grep across `apps/web`). The component has no molecule-level composition dependency on other molecules — it is a self-contained molecule composed from atoms and Radix/cmdk primitives only.
