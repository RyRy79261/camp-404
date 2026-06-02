# StatTile — molecule plan

- **mapsTo:** NEW (app-local roster) · Target file: `apps/web/app/captains/camp-management/stat-tile.tsx`

---

## Current state — does it exist? where? gap vs spec (cite files)

**Does not exist as a component.** The entire stats strip is absent from the live
`apps/web/app/captains/camp-management/camp-management-roster.tsx`. The live
roster (`CampManagementRoster`) renders a combined "counts strip + filter +
search" `<div>` (line 114) that contains only the All/Awaiting approval toggle —
there are no count cards for MEMBERS / APPROVED / INCOMPLETE at all (confirmed
by reading the full file).

No `StatTile`, `StatsStrip`, or equivalent exists in `packages/ui/src/components/`
(directory listing: avatar, button, card, checkbox, combobox, command, control-grid,
control-panel, dialog, input, label, popover, quadrant-nav, select, slider, textarea —
nothing stat-related).

**Gaps vs spec (design/spec/component-library.md and boards):**

| Spec requirement | Live code state |
|---|---|
| Three stat cards: MEMBERS · APPROVED · INCOMPLETE | Entirely missing from live roster |
| Terminal: mono label (11/700/$muted-foreground) + large mono numeral (30px/700) + Inter sublabel (12/$muted-foreground) | Not implemented |
| Mobile: large mono numeral (24px/700) above Inter label (10.5px/600/$muted-foreground) | Not implemented |
| Tone per stat: MEMBERS `$foreground`, APPROVED `$success` (spec reconciliation of raw `#3fd07a`), INCOMPLETE `$warning` (spec reconciliation of raw `$primary` / token drift, decision #2 carry) | Not implemented |
| Token normalisation: `#3fd07a` → `$success`; mobile `$accent` numerals → `$warning` for INCOMPLETE | Not applicable (feature absent) |

The live roster does track counts indirectly: `awaitingCount` (line 86) is derived
from `rows.filter(r => r.awaitingApproval)` but is only used to badge the filter
button. No APPROVED or INCOMPLETE count is computed.

**mapsTo classification:** `NEW` — nothing to REUSE or PROMOTE. The component is
built fresh, app-local in the roster route.

---

## API — props, variants, sizes, states

### TypeScript prop interface sketch

```ts
/** Tone controls the numeral colour. */
export type StatTileTone = "neutral" | "success" | "warning";

/** Layout variant: terminal console (label-on-top + sublabel) vs mobile
 *  compact (numeral-on-top, no sublabel). */
export type StatTileVariant = "terminal" | "compact";

export interface StatTileProps {
  /** ALL-CAPS eyebrow label, e.g. "MEMBERS". */
  label: string;
  /** Derived integer count, e.g. 42. Rendered as a string (no i18n
   *  formatting needed for these magnitudes). */
  value: number;
  /** Optional descriptive line below the numeral; terminal variant only. */
  sublabel?: string;
  /** Numeral colour token. Defaults to "neutral" ($foreground). */
  tone?: StatTileTone;
  /** Layout variant. Defaults to "terminal". */
  variant?: StatTileVariant;
  /** Additional className forwarded to the root element. */
  className?: string;
}
```

### Props table

| Prop | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | — (required) | ALL-CAPS mono eyebrow. Boards: "MEMBERS" / "APPROVED" / "INCOMPLETE". |
| `value` | `number` | — (required) | Derived count rendered as a string. |
| `sublabel` | `string?` | `undefined` | Terminal-only descriptive line ("All sign-ups", "Cleared to camp", "Notices & questionnaires unfinished"). Ignored when `variant="compact"`. |
| `tone` | `StatTileTone` | `"neutral"` | Maps to: neutral → `text-foreground`; success → `text-success`; warning → `text-warning`. |
| `variant` | `StatTileVariant` | `"terminal"` | terminal = label-first, sublabel shown; compact = numeral-first, no sublabel, smaller numeral. |
| `className` | `string?` | `undefined` | Forwarded to root `<div>`. |

### Variants

- **terminal** (board 37): `label` (mono/11/700/$muted-foreground) → `value` (mono/30/700, toned) → `sublabel` (Inter/12/$muted-foreground). Card fill `$muted`, border `$border`, padding `[16,18]`, radius `$radius`.
- **compact** (board 38): `value` (mono/24/700, toned) → `label` (Inter/10.5/600/$muted-foreground). Card fill `$card`, border `$border`, padding `[12,14]`, radius `$radius`. No sublabel.

### States

- **static** — the only state; StatTile is purely presentational. It renders the
  integer passed to it; the parent (stats strip / roster page) derives the counts
  from server data and passes them as props. Zero is a valid value (e.g. "0
  INCOMPLETE").

---

## Tokens & type — exact design tokens and type-scale roles

All tokens from `design/spec/design-tokens.md`. No raw hex in built code.

### Colour tokens

| Usage | Token | Note |
|---|---|---|
| Card background (terminal) | `bg-muted` | board 37: `fill:$muted` |
| Card background (compact) | `bg-card` | board 38: `fill:$card` |
| Card border | `border-border` | both boards: `stroke:$border` |
| Label text | `text-muted-foreground` | board 37/38: `$muted-foreground` |
| Numeral — neutral (MEMBERS) | `text-foreground` | board 37: `$foreground`; board 38: `$accent` → reconciled to `text-foreground` (neutral tone, not accent) per spec §1 |
| Numeral — success (APPROVED) | `text-success` | board 37: raw `#3fd07a`; design-tokens.md §4 item 13: normalise to `$success` |
| Numeral — warning (INCOMPLETE) | `text-warning` | board 37: `$primary`; board 38: `$accent`; design-tokens.md §4 item 15: "normalise both breakpoints to `$warning`" |
| Sublabel text | `text-muted-foreground` | board 37: `$muted-foreground` |

> **Token-drift note (decision #2 carry):** The mobile board (38) draws ALL three
> numerals in `$accent` (including APPROVED and INCOMPLETE). The terminal board
> (37) draws APPROVED as `#3fd07a` and INCOMPLETE as `$primary`. The spec
> (design-tokens.md §4 item 15) explicitly resolves this: "normalise both
> breakpoints to `$warning`" for INCOMPLETE. APPROVED follows item 13 → `$success`.
> MEMBERS is `$foreground` (neutral). The `tone` prop encodes the resolved intent;
> the variant (`terminal` / `compact`) controls layout only, not colour.

### Type-scale roles (design/spec/design-tokens.md §1.1)

| Element | Role | Spec values | Tailwind class |
|---|---|---|---|
| Label (terminal) | `--text-mono-caption` | JetBrains Mono / 11px / 700 / UPPERCASE | `font-mono text-[11px] font-bold uppercase tracking-[2px]` |
| Label (compact) | `--text-micro` (Inter) | Inter / 10.5px / 600 | `font-sans text-[10.5px] font-semibold` — snap to `text-[11px]` (nearest scale step, per §1.2 no 10.5 in scale) |
| Numeral (terminal) | `--text-mono` | JetBrains Mono / 30px / 700 | `font-mono text-[30px] font-bold` |
| Numeral (compact) | `--text-mono` | JetBrains Mono / 24px / 700 | `font-mono text-2xl font-bold` |
| Sublabel (terminal) | `--text-caption` | Inter / 12px / 400 | `font-sans text-xs` |

> The `font-mono` Tailwind utility resolves to `--font-mono` (JetBrains Mono) once
> `foundations-tokens.md` wiring is in place (§1.3 of design-tokens.md). Until
> then it falls back to the system monospace stack, which is acceptable for dev.
> The 10.5px compact label has no exact scale step — snap to 11px (`text-[11px]`)
> per the normalisation rule in §1.2 (no ad-hoc px outside the canonical scale).

### Radius

Card uses `rounded-[var(--radius)]` (= `--radius` md = 10px). Board 37/38 both
draw `r:$radius`.

---

## Composition & deps — atoms/primitives and helpers used

StatTile has no child atom dependencies. It is a plain presentational card
composed of three text elements and a container `<div>`.

| Dependency | Source | Role |
|---|---|---|
| `cn` | `@camp404/ui/lib/utils` | Conditional className merging (tone + variant classes) |
| `font-mono` / `font-sans` | Tailwind → `--font-mono` / `--font-sans` via `foundations-tokens.md` | Type faces |
| `text-success` / `text-warning` / `text-foreground` | `globals.css` NEW status tokens (§2.2) | Numeral tint — **these tokens must land before StatTile ships** |
| `bg-muted` / `bg-card` / `border-border` | `globals.css` existing palette | Card chrome |

**No `@camp404/core` helpers needed.** Count derivation (`membersCount`,
`approvedCount`, `incompleteCount`) lives in the parent roster server component
or the `RosterToolbar` organism that composes the strip; `StatTile` only renders
what it is given.

**No Radix/shadcn primitives needed.** StatTile is a styled `<div>` — no
interactive affordance, no ARIA role beyond `presentation`.

---

## Absorbs — candidates replaced by this component

From the merge map in `design/spec/component-library.md`:

StatTile is **not listed in the merge map** — it has no absorbed candidates. It is
a wholly new concept introduced by the Iteration B roster boards (37/38). No
existing bespoke pattern in `apps/web` or `packages/ui` duplicates it (confirmed
by search: no file contains "MEMBERS" / "APPROVED" / "INCOMPLETE" count-card
markup). The live roster's "counts strip" is a filter toggle, not stat cards.

**StatsStrip** (the containing three-tile row) is also new and is intentionally
not extracted as a separate component — three `<StatTile>`s in a flex row is
sufficient and the strip has no reuse outside the roster surface.

---

## Stories & tests

### Storybook stories

```text
StatTile.stories.tsx
```

| Story | Props |
|---|---|
| `Members` | `label="MEMBERS"` `value={42}` `tone="neutral"` `variant="terminal"` `sublabel="All sign-ups"` |
| `Approved` | `label="APPROVED"` `value={39}` `tone="success"` `variant="terminal"` `sublabel="Cleared to camp"` |
| `Incomplete` | `label="INCOMPLETE"` `value={7}` `tone="warning"` `variant="terminal"` `sublabel="Notices & questionnaires unfinished"` |
| `MembersCompact` | `label="MEMBERS"` `value={42}` `tone="neutral"` `variant="compact"` |
| `ApprovedCompact` | `label="APPROVED"` `value={39}` `tone="success"` `variant="compact"` |
| `IncompleteCompact` | `label="INCOMPLETE"` `value={7}` `tone="warning"` `variant="compact"` |
| `ZeroValue` | `label="INCOMPLETE"` `value={0}` `tone="warning"` `variant="terminal"` `sublabel="All clear"` |
| `StripTerminal` | Three tiles in a flex row (terminal variant) — mirrors the board 37 Stats section |
| `StripCompact` | Three tiles in a flex row (compact variant) — mirrors board 38 Strip |

### Vitest / RTL tests

```text
stat-tile.test.tsx
```

| Test | Assertion |
|---|---|
| Renders label, value, sublabel | All three strings appear in the document |
| Zero value renders as "0" | `getByText("0")` |
| Omits sublabel in compact variant | `sublabel` text not in DOM when `variant="compact"` |
| Applies `text-success` class for `tone="success"` | numeral element has class matching success |
| Applies `text-warning` class for `tone="warning"` | numeral element has class matching warning |
| Applies `text-foreground` class for `tone="neutral"` | numeral element has class matching foreground |
| Applies `bg-muted` for terminal variant | root div has muted background |
| Applies `bg-card` for compact variant | root div has card background |
| Forwards `className` | extra class appears on root element |
| `label` is UPPERCASE in DOM | `getByText(/^MEMBERS$/i)` — label is rendered as-is; board convention is ALL-CAPS; no CSS `text-transform` dependency in test |

### Accessibility notes

- StatTile is purely presentational; the containing strip has no interactive
  affordance. No `role` override needed — the default `<div>` is appropriate.
- `aria-hidden` is NOT applied: the count values are meaningful to screen readers
  browsing the roster page.
- The `label` string is the accessible label for the tile; no additional
  `aria-label` is needed provided the stat group is wrapped in a `<section>` or
  has a visually-hidden heading at the strip level (responsibility of the parent
  organism, not StatTile).
- Colour contrast: `text-success` over `bg-muted` and `text-warning` over
  `bg-muted` must meet WCAG AA (4.5:1) against the midnight-violet base. Confirm
  OKLCH values in `globals.css` against `--color-muted` = `oklch(0.22 0.06 295)`:
  - `--color-success` = `oklch(0.78 0.17 155)` against `oklch(0.22 0.06 295)` —
    approximate contrast ≥ 4.5:1 (green on dark violet); verify with a contrast
    checker before ship.
  - `--color-warning` = `oklch(0.80 0.16 80)` against same — similar lightness
    delta; verify.
- Reduced motion: StatTile has no animation; no `prefers-reduced-motion` guard
  needed.

---

## Build steps

### Prerequisites (must land first)

1. **NEW status tokens** (`--color-success`, `--color-success-foreground`,
   `--color-warning`, `--color-warning-foreground`) added to
   `packages/ui/src/styles/globals.css` per `design/spec/impl/foundations-tokens.md`.
   StatTile's `tone="success"` and `tone="warning"` classes resolve to these tokens;
   without them the numeral colours are invisible.
   - Acceptance: `text-success` and `text-warning` utilities resolve correctly in
     Tailwind; contrast verified against `--color-muted` and `--color-card`.

### Step 1 — Create `stat-tile.tsx`

File: `apps/web/app/captains/camp-management/stat-tile.tsx`

Implement the component using the prop interface above. No external dependencies
beyond `cn` from `@camp404/ui/lib/utils`.

Layout (terminal variant):
```text
<div class="flex flex-col gap-[7px] rounded-[var(--radius)] border border-border
            bg-muted px-[18px] py-[16px]">
  <span class="font-mono text-[11px] font-bold uppercase tracking-[2px]
               text-muted-foreground">{label}</span>
  <span class="font-mono text-[30px] font-bold leading-none {toneClass}">{value}</span>
  {sublabel && <span class="font-sans text-xs text-muted-foreground">{sublabel}</span>}
</div>
```

Layout (compact variant):
```text
<div class="flex flex-col gap-[3px] rounded-[var(--radius)] border border-border
            bg-card px-[14px] py-[12px]">
  <span class="font-mono text-2xl font-bold leading-none {toneClass}">{value}</span>
  <span class="font-sans text-[11px] font-semibold text-muted-foreground">{label}</span>
</div>
```

Tone class map:
- `neutral` → `text-foreground`
- `success` → `text-success`
- `warning` → `text-warning`

- Acceptance criteria: component file created; renders all three board examples
  with correct token classes; no raw hex or `emerald/amber/sky/rose` utilities.

### Step 2 — Wire into the roster page stats strip

In `apps/web/app/captains/camp-management/page.tsx` (server component), derive
the three counts from the roster query:

```ts
const membersCount = rows.length;
const approvedCount = rows.filter(r => r.approvalStatus === "approved").length;
const incompleteCount = rows.filter(r => r.pendingRequiredActions > 0).length;
```

Render the strip above the toolbar:

```tsx
<div className="grid grid-cols-3 gap-[10px] sm:gap-[16px]">
  <StatTile label="MEMBERS"    value={membersCount}   tone="neutral"
            variant="compact" /* mobile default */
            sublabel="All sign-ups"                    /* hidden in compact */
            className="hidden sm:flex" />
  {/* terminal variant for ≥sm, compact for <sm — or use responsive props */}
</div>
```

> Implementation note: the cleanest approach is a single `StatTile` that receives
> both `variant` and a responsive override via className, or a wrapper that renders
> two tiles conditionally. The exact responsive wiring is up to the implementer;
> the spec requires both layouts to exist.

- Acceptance criteria: stats strip appears above the filter chips at
  `/captains/camp-management`; counts match the live roster data; MEMBERS shows
  `$foreground` numeral, APPROVED shows `$success`, INCOMPLETE shows `$warning`.

### Step 3 — Storybook stories

Create `packages/ui/src/components/stat-tile.stories.tsx` (or co-located in the
app route if UI package placement is not desired for an app-local component).
Add the nine stories listed in the Stories section above.

- Acceptance criteria: all nine stories render in Storybook without console errors;
  visual diff against boards 37/38 Stats sections passes review.

### Step 4 — Tests

Create `apps/web/app/captains/camp-management/__tests__/stat-tile.test.tsx`.
Implement the ten test cases listed in the Tests section above.

- Acceptance criteria: all tests pass (`pnpm test`); zero snapshot brittle-ness
  (use class assertions, not snapshots).

### Step 5 — Token drift codemod (deferred, not a StatTile blocker)

The existing `camp-management-roster.tsx` carries raw `emerald-400/500`,
`sky-400/500`, `rose-400/500`, `amber-400/500` utilities in `STATUS_STYLE` (lines
44–48) and the `Approve` button (line 480). These are separate from StatTile but
sit in the same file. Normalise to status tokens as part of the broader codemod
pass (design-tokens.md §4), not as a prerequisite for StatTile itself.

- Acceptance: file uses only semantic tokens (`text-success`, `text-destructive`,
  `text-warning`, `bg-success/15` etc.); no `emerald/amber/sky/rose` utilities
  remain in the roster route.

---

## Consumers

StatTile has exactly one consumer in the current spec:

| Consumer | Surface | Location | Role |
|---|---|---|---|
| Stats strip (MEMBERS / APPROVED / INCOMPLETE) | Roster (`/captains/camp-management`) | `apps/web/app/captains/camp-management/page.tsx` | Three tiles in a horizontal flex row above the `RosterToolbar` organism |

The `RosterToolbar` organism is a sibling, not a consumer. No other surface in
the 25-surface spec (`design/spec/surfaces/*.md`) uses a stat-tile pattern. The
component is therefore intentionally app-local and is **not** promoted to
`@camp404/ui` — its single consumer does not justify a package export (confirmed
by checking all 25 surface briefs; no other surface draws a stats strip of this
shape).
