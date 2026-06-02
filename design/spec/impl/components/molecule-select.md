# Select — molecule plan

- **mapsTo:** REUSE `packages/ui/src/components/select.tsx`
- **Target file:** `packages/ui/src/components/select.tsx` (extend in place — no new file)

---

## Current state — does it exist? where? gap vs spec

**Exists in `@camp404/ui`** at `packages/ui/src/components/select.tsx` (confirmed). It is a thin Radix UI
`@radix-ui/react-select` wrapper: `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`,
`SelectScrollUpButton`, `SelectScrollDownButton`, `SelectContent`, `SelectLabel`, `SelectItem`,
`SelectSeparator` are all exported. A minimal Storybook story exists at
`packages/ui/src/components/select.stories.tsx` (one `Default` story with plain text items only).

**Active consumers in `apps/web`:**

| File | Usage |
|---|---|
| `apps/web/app/captains/announcements/announcements-manager.tsx` | "How it lands" presentation selector — items render icon + label inline via `<span className="flex items-center gap-2">` inside `SelectItem` children |
| `apps/web/components/questionnaire/question.tsx` | `single_select` field-renderer arm — plain text `SelectItem`s mapped from `question.options`; placeholder "Choose one…" |

Neither consumer has a hand-rolled Select variant; both import directly from `@camp404/ui/components/select`.

**Gaps vs spec (`component-library.md` + S05 + S18 boards):**

| Gap | Current state | Spec target |
|---|---|---|
| Trigger geometry | `h-10` (40px), `rounded-md`, `border border-input bg-background px-3 py-2 text-sm` | Board S05 `h:46 pad:[0,14] r:$radius fill:$muted stroke:$border` — 46px tall, muted fill, not background |
| Trigger type scale | `text-sm` (14px via Tailwind default) — no explicit token | Board: placeholder `Inter/14px/normal/$muted-foreground`; selected `Inter/14px/500/$foreground` |
| Selected item highlight | `focus:bg-accent focus:text-accent-foreground` | Board S18 open-popover items: `fill:$popover stroke:$border`, items on `$muted-foreground`; selected/active item resolves to `$primary/12%` tint consistent with the primary-tint selection convention |
| Item indicator check mark | `Check h-4 w-4` — size likely fine; no token colour set | Should follow `$foreground` / `$primary` consistent with other selectors |
| Content border radius | `rounded-md` | Should use `--radius` (md) via token |
| Popover fill | `bg-popover` (already correct) | `fill:$popover` (confirmed, no change) |
| Icon-row item variant | Items accept `children` freely; the announcements consumer wraps icon + label in an inline `<span>` — no dedicated slot or alignment guarantee | Spec calls out "icon + label + hint" as a named variant; needs a structured `SelectItemWithIcon` export or documented slot convention |
| Hint line | Not a first-class prop on `SelectTrigger` or `SelectItem` | Board S18 draws a muted hint line **below** the closed trigger (not inside it); this is rendered by the consumer (`AnnouncementsManager`) as a `<p className="text-xs text-muted-foreground">` — not a component responsibility |
| Disabled state | `disabled:cursor-not-allowed disabled:opacity-50` on trigger — present | Confirmed present; no gap |
| Token spelling | Uses `ring-offset-background` / `focus:ring-ring` — present but relies on implicit Tailwind var resolution | Consistent with rest of `@camp404/ui`; no change needed |

The trigger height (40px vs spec 46px) and fill (`bg-background` vs `bg-muted`) are the two substantive gaps.
The icon-row item pattern is a documentation/convention gap, not a structural one — `SelectItem` already
accepts arbitrary `children`.

---

## API — props, variants, sizes, states

The component is a **multi-part export** (Radix composition pattern). The public surface is the set of
named exports, not a single `<Select>` props interface.

### Core props (unchanged from Radix pass-through)

```ts
// Root — @radix-ui/react-select Root
interface SelectRootProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  // + Radix Root props (open, onOpenChange, dir, name, required)
}

// SelectTrigger — extend with className forwarding
interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> {
  /** Optional className forwarded to the trigger element. */
  className?: string;
}

// SelectItem — extend with icon slot hint
interface SelectItemProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> {
  className?: string;
  children: React.ReactNode; // plain text OR icon-row <span> — no constraint change
}
```

**No new props are required** for the spec's two use cases. The icon + label row in the announcements
consumer is assembled by the consumer via `children`; the hint line lives below the trigger in the
consumer — both are outside `Select`'s responsibility boundary.

### Variants

| Variant | How expressed | Board source |
|---|---|---|
| `default` | Plain text items, no icon | `single_select` on S05 field-kinds |
| `icon + label` | Items contain `<span className="flex items-center gap-2">icon + label</span>` | `HowItLands` selector on S18 announcements |

Both variants use the same `SelectItem` — the distinction is purely in `children` composition.
No `variant` prop is needed.

### Sizes

Single size only. Trigger height `h-[46px]` (46px per S05 board spec). No `size` prop.

### States

| State | Trigger appearance | Notes |
|---|---|---|
| `closed/placeholder` | `h-[46px] bg-muted border-input`, placeholder `text-muted-foreground` | Default render |
| `closed/selected` | Same geometry; `text-foreground font-medium` (500) | Value resolved |
| `open` | Trigger border gains `ring-2 ring-ring` (Radix `data-[state=open]`) | Popover `bg-popover border` mounted |
| `disabled` | `opacity-50 cursor-not-allowed pointer-events-none` | Trigger already has this |
| `error` | Consumer sets `aria-invalid`; border switches to `border-destructive` (host `InputField` shell responsibility — not on `SelectTrigger` itself) | Consistent with `Input` atom pattern |

---

## Tokens & type — design tokens and type-scale roles

All from `design-tokens.md`. No raw hex. No `dark:` utilities.

| Element | Token | Type role |
|---|---|---|
| Trigger fill | `bg-muted` | — |
| Trigger border | `border-input` | — |
| Trigger border radius | `rounded-[var(--radius)]` (= `$radius` md, 10px) | — |
| Trigger height | `h-[46px]` (board S05 `h:46`) | — |
| Trigger padding | `px-[14px]` (board S05 `pad:[0,14]`) | — |
| Placeholder text | `text-muted-foreground` | `--text-body` (Inter/14px/normal) |
| Selected value text | `text-foreground font-medium` | `--text-body-strong` (Inter/14px/500) |
| Chevron icon | `text-muted-foreground opacity-50` | — |
| Popover fill | `bg-popover` | — |
| Popover border | `border` (= `border-border`) | — |
| Popover border radius | `rounded-[var(--radius)]` | — |
| Item text | `text-foreground` | `--text-body` (Inter/14px/normal) |
| Item focus/active tint | `focus:bg-primary/12 focus:text-foreground` | Resolves primary-selection tint convention (`primary/12%` — §4 reconciliation #5/6) |
| Item check indicator | `text-foreground` | — |
| Item disabled | `opacity-50` | — |
| Separator | `bg-muted` | — |
| Focus ring on trigger | `focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background` | System ring token |

**Type note:** `SelectLabel` (group label) uses `text-sm font-semibold` — this maps to `--text-label`
(Inter/13px/600). The current `py-1.5 pl-8 pr-2` padding is retained.

**No mono face** — Select is a UI control; none of its text is data-console output.

---

## Composition & deps — atoms/primitives and helpers

| Dependency | Source | Role |
|---|---|---|
| `@radix-ui/react-select` | `packages/ui` (already installed) | Full accessibility tree, keyboard navigation, WAI-ARIA `listbox` semantics |
| `lucide-react` `Check`, `ChevronDown`, `ChevronUp` | `packages/ui` (already installed) | Existing icons — no change |
| `cn` utility | `@camp404/ui/lib/utils` | Class merging on all sub-parts |

**No `@camp404/core` helpers required.** Select has no domain logic; it is pure presentation + Radix
accessibility plumbing.

**No other `@camp404/ui` atoms composed.** The trigger and item are styled with utilities directly —
wrapping in `Button` or `Input` would fight Radix's internal ref + event handling.

---

## Absorbs — candidates replaced

The `component-library.md` merge map lists no multi-candidate merge for Select. It is a direct REUSE
entry. It absorbs:

- The announcements-manager `PRESENTATION_META`-driven inline Select — the `<span className="flex items-center gap-2">` icon-row pattern is the established convention for icon items; no separate `PresentationSelect` wrapper component ships to `@camp404/ui` (the surface brief `15-announcements.md` correctly calls `PresentationSelect` surface-local).
- The `single_select` arm of the field-renderer — plain `SelectItem` text list; already the canonical usage.

**Does not absorb** `Combobox` (`@camp404/ui/combobox.tsx`) — that is a separate searchable popover
molecule (Command + Popover); it remains distinct and is also REUSE.

**Does not absorb** `OptionCardGroup` — that handles the board's radio-card re-skin of `single_select`
for the questionnaire runner; `Select` stays for dropdown-appropriate cases (announcements
delivery-mode picker and the field-renderer `single_select` fallback).

---

## Stories & tests

### Storybook stories

File: `packages/ui/src/components/select.stories.tsx` (extend existing; replace placeholder story)

| Story | Setup | Purpose |
|---|---|---|
| `Default` | Plain text items ("Kitchen", "Build", "Fire", "Art", "Safety"); `w-[280px]` wrapper; controlled with `useState` | Canonical `single_select` field-renderer usage |
| `Placeholder` | No `defaultValue`; placeholder "Choose one…" | Closed/placeholder state (matches S05 `"Choose one…"`) |
| `Selected` | `defaultValue="build"` | Closed/selected state — value text `font-medium` |
| `IconItems` | Items each contain `<span className="flex items-center gap-2"><Megaphone/> Full-screen — must acknowledge</span>` etc. (3 announcement delivery modes) | Icon + label row (S18 "How it lands" pattern) |
| `Disabled` | `disabled` on `<Select>`; value preset | Disabled trigger — opacity + no interaction |
| `DisabledItem` | One item has `disabled` prop | Per-item disabled |
| `WithGroups` | Two `SelectGroup` + `SelectLabel` ("Quick", "Extended") | Group + label rendering |
| `ErrorState` | Wrapper adds `aria-invalid="true"` + `border-destructive` class override on trigger | Error boundary: host-applied destructive border |

### Vitest / RTL test cases

File: `packages/ui/src/components/__tests__/select.test.tsx`

| Test | Description |
|---|---|
| Renders placeholder | Closed trigger shows placeholder text |
| Shows selected value | `value` prop resolves to item text in trigger |
| Opens on click | Click trigger → listbox appears in DOM |
| Keyboard open | `Enter` / `Space` on focused trigger opens listbox |
| Selects item on click | Click item → `onValueChange` called with correct value; listbox closes |
| Keyboard select | `ArrowDown` navigates; `Enter` selects focused item |
| Disabled root | `disabled` on `Select` root → trigger `aria-disabled`; click does not open |
| Disabled item | Disabled `SelectItem` → not selectable, `aria-disabled="true"` |
| Icon-row children | Items with `<span>icon + text</span>` children render without layout breakage |
| Separator renders | `SelectSeparator` renders `role="separator"` or `aria-hidden` divider |

### Accessibility notes

- Radix provides the full `role="combobox"` trigger + `role="listbox"` popover + `role="option"` items + `aria-selected` / `aria-expanded` / `aria-controls` wiring automatically — no custom ARIA attributes needed on the wrappers.
- `SelectValue` renders inside the trigger; its `placeholder` must be meaningful ("Choose one…" is confirmed by S05; avoid generic "Select").
- When used inside `InputField` shell (field-renderer context), the consumer supplies `id` on `SelectTrigger` and `htmlFor` on `<Label>` — the trigger's `id` prop is passed through Radix.
- Check indicator (`Check` lucide) is `aria-hidden` (Radix renders it inside `ItemIndicator` which is visually-only).
- Chevron icons (`ChevronDown`, `ChevronUp`) are `aria-hidden`.
- Reduced-motion: Radix's `animate-in`/`animate-out` classes on `SelectContent` should be wrapped in a `@media (prefers-reduced-motion: reduce)` guard in `globals.css`; note this for the token/animation pass but it is not specific to this component.
- `SelectScrollUpButton` / `SelectScrollDownButton` are for long lists; no `aria-label` needed (Radix handles).

---

## Build steps — ordered with acceptance criteria

**Prerequisites:** confirm `--radius`, `bg-muted`, `bg-popover`, `border-input`, `text-muted-foreground`,
`text-foreground`, `ring-ring` are all present in `packages/ui/src/styles/globals.css` before step 1.
The `bg-primary/12` tint syntax requires Tailwind v4 opacity-modifier support — verify it resolves
correctly against the OKLCH palette.

1. **Patch `SelectTrigger` geometry in `packages/ui/src/components/select.tsx`**
   - Change trigger height from `h-10` (40px) to `h-[46px]` (46px per S05 board).
   - Change `bg-background` to `bg-muted` on the trigger (board `fill:$muted`).
   - Change `px-3 py-2` to `px-[14px]` (board `pad:[0,14]`; vertical centring is already handled by `flex items-center`).
   - Remove the hardcoded `ring-offset-background` class reference if it introduces a raw variable — confirm the token resolves via `globals.css`.
   - **Acceptance:** `SelectTrigger` renders at 46px tall with muted fill; no TS errors; no raw hex; no `dark:` utilities; existing stories render correctly.

2. **Patch `SelectItem` focus tint**
   - Change `focus:bg-accent focus:text-accent-foreground` → `focus:bg-primary/12 focus:text-foreground` to align with the primary-tint selection convention (§4 reconciliation #5/6 of `design-tokens.md`).
   - **Acceptance:** focused/hovered item shows `primary/12%` tint, not accent fill. Storybook visual check.

3. **Patch `SelectContent` border radius**
   - Confirm `rounded-md` resolves to `--radius` (md 10px). If `rounded-md` is Tailwind's default 6px and not token-driven, swap to `rounded-[var(--radius)]`.
   - **Acceptance:** popover border radius matches trigger radius visually.

4. **Update Storybook stories** (`select.stories.tsx`)
   - Replace the minimal existing `Default` story with the full story set listed above (`Default`, `Placeholder`, `Selected`, `IconItems`, `Disabled`, `DisabledItem`, `WithGroups`, `ErrorState`).
   - **Acceptance:** all 8 stories render in Storybook without console errors; `IconItems` story shows icon + label rows correctly aligned.

5. **Write Vitest / RTL tests** (`__tests__/select.test.tsx`)
   - Cover all test cases listed above.
   - **Acceptance:** `pnpm --filter @camp404/ui test` green; no snapshot drift.

6. **Verify consumer wiring — announcements-manager**
   - Open `apps/web/app/captains/announcements/announcements-manager.tsx`.
   - Confirm the `<SelectTrigger id="announcement-presentation">` receives the label association from `<Label htmlFor="announcement-presentation">` — confirmed present in live code (line 214/225).
   - Confirm the `<span className="flex items-center gap-2">` icon-row pattern inside `SelectItem` still renders correctly after the trigger geometry patch.
   - Confirm the muted hint line `<p className="text-xs text-muted-foreground">` below the trigger remains consumer-owned (not a component prop) — no change needed.
   - **Acceptance:** announcements composer renders the presentation selector at correct height with icon items; `pnpm build` green on `apps/web`.

7. **Verify consumer wiring — field-renderer**
   - Open `apps/web/components/questionnaire/question.tsx`.
   - Confirm `<SelectTrigger id={id}>` receives `id` from the `QuestionField` shell for label association.
   - Confirm placeholder "Choose one…" still renders on the patched trigger.
   - **Acceptance:** `single_select` questions in the onboarding wizard render correctly at 46px trigger height.

---

## Consumers — which molecules/organisms/surfaces use it

| Consumer | File | Usage pattern |
|---|---|---|
| **AnnouncementsManager** (organism, app-local) | `apps/web/app/captains/announcements/announcements-manager.tsx` | "How it lands" delivery-mode picker — icon + label items over `AnnouncementPresentation` enum (`acknowledge`/`popup`/`feed`) |
| **QuestionField / FieldInput** (organism, app-local) | `apps/web/components/questionnaire/question.tsx` | `single_select` kind arm — plain text items mapped from `question.options`; placeholder "Choose one…" |

These are the **only two confirmed consumers** in `apps/web`. No other board or surface brief references
`Select` directly (the `Combobox` molecule and `OptionCardGroup` handle the other selection patterns).

`SelectItem`, `SelectTrigger`, `SelectContent`, `SelectValue` are used directly at both call sites — no
higher-level wrapper component sits between `@camp404/ui/select` and its consumers.
