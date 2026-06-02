# FilterChip — molecule plan

- **mapsTo:** NEW (app-local roster) · Target file: `apps/web/app/captains/camp-management/filter-chip.tsx`

---

## Current state — does it exist? where? gap vs spec

**No `FilterChip` component exists** in `packages/ui/src/components/` — the folder contains only
the 13 reusable primitives (avatar, button, card, checkbox, combobox, command, dialog, input,
label, popover, select, slider, textarea) plus the dead `control-panel`, `control-grid`, and
`quadrant-nav`.

**No extracted `FilterChip` exists in `apps/web/`** either. The roster filter row is entirely
inlined in
`apps/web/app/captains/camp-management/camp-management-roster.tsx` (lines 113–145). That
implementation is a hand-rolled segmented-toggle `<div>` with two `<button>` elements:

| What the live code does | Gap vs spec (boards 37 + 38) |
|---|---|
| Two-button `inline-flex rounded-lg border p-0.5` toggle for `All (N)` and `Awaiting approval` | Boards draw **five** independent chips (`All`, `Pending`, `Captains`, `Team:`, `Outstanding`) in a horizontal `gap:8` row — a categorically different UI pattern (not a unified segmented control). |
| Active chip = `bg-muted text-foreground`; inactive = `text-muted-foreground hover:text-foreground` | Active chip on boards = accent tinted fill + accent stroke. Boards draw `fill:#00dcff1f stroke:$accent` for active (map to `accent/12%` + `stroke-accent`). |
| "Awaiting approval" label; single count badge uses `bg-sky-500/20 text-sky-400` | Boards label it "Pending N"; count is embedded in chip text, not a separate badge. Off-token `sky-500/20` → `warning/12%` for the Pending chip in its inactive state; active → accent fill/stroke. |
| No Captains / Team / Outstanding chips | Three missing chips; `Outstanding` has a distinct warning anatomy (triangle-alert icon, `warning` fill+stroke). |
| No dropdown variant | `Team: All` chip opens a team picker; no equivalent exists. |
| Locked state: entire toolbar is `hidden` (`!locked` guard in JSX) | Boards require inert chips in locked state (per decision #3 preview-but-locked). Controls should render but be `disabled`/`pointer-events-none`, not absent. |
| Font face: inherited Inter (no explicit declaration) | Boards: `JetBrains Mono/13px/600` for all chip labels (data-console face, decision #2). |

**Classification confirmed: NEW (app-local).** The component does not exist in any extractable form.
It is roster-specific (one surface consumer: `RosterToolbar`), so it ships app-local per the
`component-library.md` entry. It does NOT go into `packages/ui/`.

---

## API — props, variants, sizes, states

### TS prop interface

```ts
/** Shared base for both FilterChip variants. */
interface FilterChipBase {
  /** Visible chip label. For `toggle` chips this is the filter name (e.g. "Pending").
   *  For `dropdown` chips this is the prefix shown before the selected value
   *  (e.g. "Team:"). */
  label: string;
  /** Optional numeric count appended to the label string (e.g. "All 42", "Pending 3").
   *  undefined = no count shown. */
  count?: number;
  /** Whether this chip is in its active / selected state. */
  active: boolean;
  /**
   * accent  — standard filter chip; active = accent fill + stroke.
   * warning — Outstanding chip; active AND inactive carry warning fill + stroke + icon.
   * neutral — future extension; currently unused.
   * @default "accent"
   */
  tone?: "accent" | "warning" | "neutral";
  /** Renders chip as visually inert (locked roster — preview-but-locked, decision #3).
   *  Does NOT hide the chip; applies opacity-50 + pointer-events-none. */
  disabled?: boolean;
  className?: string;
}

/** A toggle chip — clicking flips the active state. */
export interface FilterChipToggleProps extends FilterChipBase {
  variant: "toggle";
  /** Called when the chip button is clicked (not fired when disabled). */
  onToggle: () => void;
}

/** A dropdown chip — clicking opens a popover/picker rather than toggling inline. */
export interface FilterChipDropdownProps extends FilterChipBase {
  variant: "dropdown";
  /** The currently selected value displayed after the label prefix (e.g. "All", "Build Week"). */
  selectedValue: string;
  /** Called when the chip trigger is clicked; parent is responsible for opening the picker. */
  onOpen: () => void;
}

export type FilterChipProps = FilterChipToggleProps | FilterChipDropdownProps;
```

### Variants

| Variant | Board source | Anatomy |
|---|---|---|
| `toggle` | `All 42`, `Pending 3`, `Captains 4` chips on both boards 37+38 | dot + "Label N" text · clicking flips active |
| `dropdown` | `Team: All` / `Team: All` chips on both boards 37+38 | "Label: Value" text + `chevron-down` icon · clicking fires `onOpen`, no internal toggle |
| `warning` (tone override) | `Outstanding 7` chip on both boards 37+38 | `triangle-alert` icon + label+count · always has warning fill+stroke regardless of active state |

### Sizes

FilterChip has a single size. Board values: `pad:[8,14]` (8px vertical / 14px horizontal),
`r:$radius` (10px, `--radius`). This resolves to `px-[14px] py-2 rounded-[--radius]` — a
single fixed size; no `size` prop needed.

### States

| State | Description | Visual |
|---|---|---|
| `inactive` | Default unselected state | `bg-muted` fill, `border-border` stroke, `text-muted-foreground`; dot `fill-muted-foreground` |
| `active` (accent tone) | The `All` or a status chip is selected | `bg-accent/12` fill, `border-accent` stroke, `text-accent`; dot `fill-accent` |
| `active` (warning tone) | Not applicable — warning chips always carry warning styling regardless of `active` | n/a |
| `warning-always` | `Outstanding` chip (tone="warning") | `bg-warning/12` fill, `border-warning` stroke, `text-warning`, `triangle-alert` icon — both active and inactive look identical (board draws no inactive variant for Outstanding) |
| `disabled` | Locked roster (non-captain, preview-but-locked) | `opacity-50 pointer-events-none cursor-default`; chip renders but is inert |
| `dropdown-open` (hint) | The parent controls open state; chip itself has no open/closed styling | parent may add `active=true` when a non-default team is selected |

---

## Tokens & type — exact design tokens + type-scale roles used

All short Tailwind form (P1-5 normalisation; no `[color:var(--color-*)]` verbose form).

### Inactive chip (all toggle + dropdown variants)

| Element | Token / utility | Board source |
|---|---|---|
| Fill | `bg-muted` | boards 37+38: `fill:$muted` |
| Stroke / border | `border border-border` | boards 37+38: `stroke:$border` |
| Radius | `rounded-[--radius]` | boards 37+38: `r:$radius` |
| Padding | `px-3.5 py-2` (14px / 8px) | boards 37+38: `pad:[8,14]` |
| Label text | `text-muted-foreground font-semibold` | boards 37+38: `$muted-foreground/600` |
| Dot (toggle) | `fill-muted-foreground` (7×7 circle, `w-1.5 h-1.5 rounded-full`) | boards 37+38: `◯ dot {w:7 h:7 fill:$muted-foreground}` |
| Chevron (dropdown) | `text-muted-foreground` `ChevronDown` 14px | boards 37+38: `⊙ chevron-down ($muted-foreground)` |
| Type role | `--text-mono` (JetBrains Mono / 13px / 600) | boards 37+38: `JetBrains Mono/13px/600` → data-console face, decision #2 |

### Active chip (accent tone — toggle only)

| Element | Token / utility | Board source |
|---|---|---|
| Fill | `bg-accent/12` | boards 37+38: `fill:#00dcff1f` → `accent/12%` (design-tokens.md §2.3: `1f` ≈ 12% snap) |
| Stroke / border | `border border-accent` | boards 37+38: `stroke:$accent` |
| Label text | `text-accent font-semibold` | boards 37+38: `$accent/600` |
| Dot | `bg-accent` (filled circle) | boards 37+38: `◯ dot {w:7 h:7 fill:$accent}` |

### Warning chip (tone="warning" — Outstanding)

| Element | Token / utility | Board source |
|---|---|---|
| Fill | `bg-warning/12` | boards 37+38: `fill:#e0a8001a` → `warning/12%` (design-tokens.md §2.3: `1a` ≈ 12% snap) |
| Stroke / border | `border border-warning` | boards 37+38: `stroke:#e0a800` → `$warning` (design-tokens.md §4 reconciliation #14) |
| Label text | `text-warning font-semibold` | boards 37+38: `#e0a800` → `$warning` |
| Icon | `TriangleAlert` (`w-[14px] h-[14px]`) `text-warning` | boards 37+38: `⊙ triangle-alert (#e0a800)` |
| Type role | `--text-mono` (JetBrains Mono / 13px / 600) | same as all chips |

### Gap between chips in row

| Element | Token / utility | Board source |
|---|---|---|
| Row gap | `gap-2` (8px) | boards 37+38: `gap:8 ai:center` on the `Chips` container |

### Disabled overlay

| Element | Token / utility | Board source |
|---|---|---|
| Disabled | `opacity-50 pointer-events-none cursor-default` | design-tokens.md decision #3 preview-but-locked; not explicit on boards |

**Prerequisite token:** `--color-warning` / `--color-warning-foreground` must land in
`packages/ui/src/styles/globals.css` before the `Outstanding` chip can ship — these are NEW
status tokens defined in `design-tokens.md §2.2`. The `bg-accent/12`, `border-accent`,
`text-accent` utilities are available today.

---

## Composition & deps — atoms/primitives + @camp404/core helpers

| Dep | Package | Role |
|---|---|---|
| `cn` | `@camp404/ui/lib/utils` | Tailwind class merging |
| `ChevronDown` | `lucide-react` | Dropdown variant trailing icon |
| `TriangleAlert` | `lucide-react` | Warning tone icon (Outstanding chip) |
| No Radix primitive | — | `FilterChip` is a plain `<button>` (toggle) or `<button>` trigger (dropdown); no `@radix-ui` dependency required inside the chip itself. The parent `RosterToolbar` mounts a Popover/Select over `teamEnum` when the dropdown chip fires `onOpen`. |
| No `@camp404/core` helpers | — | Pure presentational; no rank logic, no validation |

**App-local only.** The component must not import anything from `packages/ui` beyond `cn`/utils, nor from `@camp404/db` or `next/*` server APIs. It is a `"use client"` leaf button. The `packages/ui` rule (never import `db` or `next`) does not apply because this ships in `apps/web`, but the component is kept pure of server imports to keep it testable in isolation.

---

## Absorbs — candidates replaced (from merge map)

`FilterChip` is not listed as an absorbing entry in the `component-library.md` merge map — it
is a **NEW** component. However, it replaces the following inlined code so no duplicate ships:

| Absorbed inline implementation | File | Lines | Action |
|---|---|---|---|
| Two-button `All` / `Awaiting approval` segmented toggle | `camp-management-roster.tsx` | 115–145 | Delete; replace with `<FilterChip variant="toggle">` instances inside `RosterToolbar`. |

No other file contains a `FilterChip`-equivalent pattern (confirmed by grep — zero results for
`filterchip`, `filter-chip`, `filter_chip`, `FilterChip` in `apps/web`).

---

## Stories & tests

### Storybook stories (`filter-chip.stories.tsx`)

| Story | Props | Purpose |
|---|---|---|
| `ToggleInactive` | `variant="toggle"`, `label="Pending"`, `count={3}`, `active={false}`, `tone="accent"` | Default inactive state — muted fill/border |
| `ToggleActive` | `variant="toggle"`, `label="All"`, `count={42}`, `active={true}`, `tone="accent"` | Active accent fill + stroke + lit dot |
| `ToggleNoCount` | `variant="toggle"`, `label="Captains"`, `count={4}`, `active={false}` | Standard inactive with count |
| `DropdownInactive` | `variant="dropdown"`, `label="Team"`, `selectedValue="All"`, `active={false}` | "Team: All" with chevron, inactive |
| `DropdownActive` | `variant="dropdown"`, `label="Team"`, `selectedValue="Build Week"`, `active={true}` | A team is selected → accent styling |
| `WarningTone` | `variant="toggle"`, `label="Outstanding"`, `count={7}`, `active={false}`, `tone="warning"` | triangle-alert + warning fill regardless of active |
| `DisabledToggle` | `variant="toggle"`, `label="Pending"`, `count={3}`, `active={false}`, `disabled={true}` | Opacity-50, pointer-events-none, inert |
| `DisabledWarning` | `variant="toggle"`, `label="Outstanding"`, `count={7}`, `tone="warning"`, `disabled={true}` | Warning chip + disabled overlay |
| `ChipRow` | Full row of 5 chips as rendered in `RosterToolbar` | Integration snapshot of the complete filter row |

### Vitest / RTL test cases (`filter-chip.test.tsx`)

| Test | Assertion |
|---|---|
| Renders a `<button>` element | `getByRole("button")` present |
| Label rendered (no count) | `getByText("Captains")` visible when `count` undefined |
| Label + count rendered | `getByText("Pending 3")` visible when `label="Pending"` `count={3}` |
| Inactive accent chip has `bg-muted` class | Container classlist includes `bg-muted` |
| Active accent chip has `bg-accent/12` class | Container classlist includes `bg-accent/12` |
| Dot element present for toggle variant | `querySelector(".rounded-full")` exists for toggle; not present for dropdown |
| Chevron present for dropdown variant | `getByTestId` or `TriangleAlert` aria query finds icon |
| `onToggle` fires on click (toggle variant) | Mock `onToggle` called once after `userEvent.click` |
| `onToggle` NOT fired when `disabled` | Mock `onToggle` not called when `disabled={true}` |
| `onOpen` fires on click (dropdown variant) | Mock `onOpen` called once |
| `onOpen` NOT fired when `disabled` | Not called when `disabled={true}` |
| Warning chip has `bg-warning/12` class | classlist includes `bg-warning/12` |
| Warning chip shows `TriangleAlert` icon | Icon rendered by role or test-id |
| `disabled` adds `pointer-events-none` | Container has `pointer-events-none` class |
| `disabled` button has `disabled` attribute | `button` element has `disabled` attribute set |
| Accessible name: `aria-label` on button | `getByRole("button", { name: /Pending 3/ })` resolves |

### Accessibility notes

- Each `FilterChip` is a `<button type="button">`. Native `<button>` provides keyboard
  activation (`Enter`/`Space`), pointer events, and focus management for free.
- The `toggle` variant should carry `aria-pressed={active}` so screen readers announce
  "pressed" / "not pressed" state. This is preferable to `aria-checked` because these are
  not radio-group members — each chip is independently toggleable (except `All`, which could
  be modelled as "reset all filters").
- The `dropdown` variant should carry `aria-haspopup="listbox"` (or `"true"`) and
  `aria-expanded` managed by the parent `RosterToolbar` (passed down as a prop if needed, or
  the parent wraps the chip in a Radix `Trigger`).
- `disabled` chips: set both `disabled` attribute (removes from tab order) and
  `aria-disabled="true"` on the `<button>` for assistive technology that reads the attribute
  but not the property.
- Dot (circle) and chevron icons: `aria-hidden="true"` — purely decorative.
- `TriangleAlert` icon: `aria-hidden="true"` for the warning chip; the semantic warning meaning
  is carried by the button label text ("Outstanding 7") which is already sufficient for AT.
- Touch targets: `py-2 px-3.5` on 13px mono type yields ~33px height. If this falls below
  WCAG 2.5.8 (24px minimum), add `min-h-[36px]` — boards do not specify exact height for chips
  (unlike segmented cells), so snap to the accessible minimum.
- The `ChipRow` container (`RosterToolbar`) should be `role="group"` with
  `aria-label="Filter roster"` so AT groups the independent filter controls.

---

## Build steps — ordered + acceptance criteria

**Prerequisite:** `design/spec/impl/foundations-tokens.md` Phase 0 must land first. The
`bg-warning/12`, `border-warning`, `text-warning` utilities require `--color-warning` in
`packages/ui/src/styles/globals.css`. The `bg-accent/12`, `border-accent`, `text-accent`
utilities are available today.

The font wiring (`--font-mono` → JetBrains Mono, design-tokens.md §1.3) must land before chip
labels render in JetBrains Mono by token rather than a system fallback.

### Step 1 — Create `apps/web/app/captains/camp-management/filter-chip.tsx`

Build the component with a discriminated union on `variant`:

- `"use client"` directive.
- Toggle variant: `<button type="button" aria-pressed={active} disabled={disabled}>` wrapping
  a `dot` + label string (`label + (count !== undefined ? ` ${count}` : '')`).
- Dropdown variant: `<button type="button" aria-haspopup="listbox" disabled={disabled}>` wrapping
  label + selected value string + `ChevronDown` icon.
- Warning tone: `TriangleAlert` icon replaces the dot regardless of variant; warning
  fill/border/text classes applied unconditionally (no active/inactive colour switch).
- Class composition via `cn()`:
  - Base: `inline-flex items-center gap-[7px] px-3.5 py-2 rounded-[--radius] border font-mono
    text-[13px] font-semibold transition-colors select-none`
  - Inactive accent: `bg-muted border-border text-muted-foreground`
  - Active accent: `bg-accent/12 border-accent text-accent`
  - Warning (always): `bg-warning/12 border-warning text-warning`
  - Disabled overlay: `opacity-50 pointer-events-none cursor-default`
- All token classes in short Tailwind form; zero off-token hex; no `[color:var(--color-*)]`
  verbose form.
- No `next/*` import; no `@camp404/db` import.

**Acceptance:** component renders in isolation; no prop-type errors; no off-token class names;
`aria-pressed` toggles with `active` prop; `disabled` attribute present when prop set.

### Step 2 — Replace the inline filter toggle in `camp-management-roster.tsx`

The `RosterToolbar` does not yet exist as a separate file — the filter+search block is inline in
`CampManagementRoster` (lines 113–145). This step extracts it:

1. Create `apps/web/app/captains/camp-management/roster-toolbar.tsx` with:
   - Search `Input` (console-styled per board: `> ` prompt + blinking cursor rect + `stroke:$accent`).
   - `FilterChip` row: `All N`, `Pending N`, `Captains N`, `Team: {selectedTeam}` (dropdown),
     `Outstanding N` (warning tone).
   - `locked` prop: when true, renders all chips with `disabled` (not hidden — decision #3).
2. Delete lines 113–145 from `camp-management-roster.tsx`; replace with `<RosterToolbar>`.
3. Update filter state in `CampManagementRoster` to support the multi-chip model:
   - Expand `Filter` union from `"all" | "awaiting"` to
     `"all" | "pending" | "captains" | "outstanding"` with a separate `teamFilter: string | null`.
   - Recalculate counts: `pendingCount`, `captainsCount`, `outstandingCount` from `rows`.
   - Extend `filtered` memo to apply multi-chip logic (any active non-All chip narrows the set;
     `All` deactivates others).

**Acceptance:** existing functional behaviour (All / Pending filtering) is preserved; three new
chips render inert but visible; `Outstanding` chip shows warning tone; `locked=true` renders all
chips with `disabled` rather than hiding the toolbar.

### Step 3 — Team dropdown wiring

Wire the `Team:` dropdown chip to a `Popover` + `Command` picker over `teamEnum` (8 values from
`@camp404/types` `teamEnum`):

- `onOpen` callback from `FilterChipDropdown` opens a `Popover` anchored to the chip.
- `Command` inside the popover lists all team options + "All".
- Selecting a team sets `teamFilter` state; selecting "All" clears it.
- The dropdown chip's `active` prop becomes `teamFilter !== null`.
- `selectedValue` prop reflects the current team label or `"All"`.

**Acceptance:** clicking `Team: All` opens the picker; selecting a team updates the chip label
and filters rows; selecting "All" clears the team filter; `Esc` closes the popover.

### Step 4 — RTL tests

Write `apps/web/app/captains/camp-management/filter-chip.test.tsx` covering the full test matrix
above.

**Acceptance:** all tests pass via `pnpm --filter @camp404/web test` (or the project's test
invocation).

### Step 5 — Storybook stories

Write `apps/web/app/captains/camp-management/filter-chip.stories.tsx` covering the stories above.

**Acceptance:** all stories render without console errors in Storybook; warning chip shows
`TriangleAlert`; active accent chip shows accent fill+stroke; disabled chip is visually muted
but not absent.

---

## Consumers — which molecules/organisms/surfaces use it

| Consumer | File | How used |
|---|---|---|
| `RosterToolbar` | `apps/web/app/captains/camp-management/roster-toolbar.tsx` (NEW — Step 2 above) | Direct consumer: renders the 5-chip filter row (`All`, `Pending`, `Captains`, `Team:`, `Outstanding`). Passes `locked` down as `disabled` to each chip. |
| `CampManagementRoster` | `apps/web/app/captains/camp-management/camp-management-roster.tsx` | Mounts `RosterToolbar`; owns filter state; passes counts computed from `rows`. |

`FilterChip` has exactly one direct consumer (`RosterToolbar`) and one indirect consumer
(`CampManagementRoster`). No other surface in the spec uses a filter-chip pattern — roster is
the only filterable list. The component ships app-local accordingly.
