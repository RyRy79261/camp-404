# GridTile — molecule plan

- **mapsTo:** PROMOTE (board 03 `03-gridtile.txt`; no existing package primitive, no app hand-roll)
- **Target file:** `packages/ui/src/components/grid-tile.tsx`

---

## Current state — does it exist? where? gap vs spec

### What exists today

There is **no `grid-tile.tsx`** in `packages/ui/src/components/` (confirmed: 25 files listed, none named `grid-tile`).

There **is** a `GridTile` function in `packages/ui/src/components/control-grid.tsx` (line 122–181), but it is a **private, unexported** inner function within the dead `ControlGrid` component. It is not the spec's GridTile:

| Board 03 spec element | Live `control-grid.tsx` `GridTile` | Gap |
|---|---|---|
| 46×46 `IconBox` (`r:12`, `fill:#ff008c2e`) holding a Lucide icon | `<span>` with raw `text-[color:var(--color-muted-foreground)]` wrapping an icon ReactNode — **no tinted rounded box** | Missing tinted IconBox entirely |
| Count `Badge` (`pad:[3,9] r:999 fill:#ff008c2e`, `Inter/12px/600/$primary`) positioned at top-right of head row | `<span>` absolutely positioned at a corner per `BADGE_CORNER` map; uses `bg-[color:var(--color-primary)]` solid fill (not a tint) and `$primary-foreground` text — **wrong fill treatment** (solid vs tinted) and **no board-conforming positioning in S08** | Badge fill wrong; geometry off-spec |
| Title: `Inter/16px/600/$foreground` | `text-base font-semibold leading-tight` (Inter, correct) | Acceptable approximation |
| Hint: `Inter/12px/normal/$muted-foreground` | `text-xs text-[color:var(--color-muted-foreground)]` (correct size, verbose token) | Off-token spelling only |
| Whole tile is `w:200 gap:14 pad:16 r:$radius fill:$card stroke:$border` | `min-h-[8rem] flex-col gap-1.5 rounded-[var(--radius)] p-5` — gap/padding differ; `$background` fill not `$card`; no `stroke:$border` | Fill wrong (`$background` vs `$card`); gap/pad differ; no border |
| Renders as `<a>` (href) or `<button>` (callback) | Renders as `<a>` (href), `<button>` (callback), or inert `<div>` (locked) | Structure matches but locked state uses `dashed` border — spec shows `CaptainLock` treatment at the group level, not per tile |
| `dragHandle?` prop (Customize mode DraggableTileRow) | Not present | Missing drag handle slot |
| `icon` prop is a `LucideIcon` component (to be passed to `IconBadge`) | `icon?: React.ReactNode` — no icon-badge wrapping, plain inline node | Wrong abstraction; no IconBadge |
| `iconTone` prop | Not present | Missing; tone must be configurable per group type |

The `control-grid.tsx` and `control-panel.tsx` files are **dead components slated for DELETE** per `component-library.md` ("DEAD to DELETE: control-panel, control-grid, quadrant-nav"). The inner `GridTile` function dies with them.

There is also no GridTile anywhere in `apps/web` — no hand-rolled version exists in the app tree. The current home route (`apps/web/app/page.tsx`) uses the live `ControlPanel` quadrant model, not the spec's rank-group card + GridTile layout.

**Classification: PROMOTE** — the pattern exists only on board 03 (canonical reusable) and as a dead private function in `control-grid.tsx`. Build it fresh in `packages/ui` per the board spec; delete the dead inner function when `control-grid.tsx` is removed.

---

## API — props, variants, sizes, states

### Board 03 anatomy (canonical)

```
GridTile {vertical w:200 gap:14 pad:16 r:$radius fill:$card stroke:$border}
  Head {w:fill_container jc:space_between}
    IconBox {w:46 h:46 jc:center ai:center r:12 fill:#ff008c2e}
      users ($primary) [lucide]
    Badge {pad:[3,9] r:999 fill:#ff008c2e}
      T "42"  [Inter/12px/600/$primary]
  TextCol {vertical w:fill_container gap:4}
    T "My Teams"   [Inter/16px/600/$foreground]
    T "Your crews" [Inter/12px/normal/$muted-foreground]
```

The badge in the Head row is the optional count badge. The board draws it at the top-right of the Head row (`jc:space_between`), meaning badge appears only when a count is provided; otherwise the head row is just the IconBox alone.

The S08 board confirms `dragHandle` usage in Customize mode (board 17, line 68–76): a `grip-vertical` icon prepended to the tile in `DraggableTileRow`, `$accent` when being dragged and `$muted-foreground` when at rest. The drag handle is **not** part of the static GridTile anatomy — it is overlaid by `CustomizeMode`'s `DraggableTileRow` organism. GridTile exposes a `dragHandle?` slot so the DraggableTileRow can inject the grip handle without forking the component.

### TS prop interface

```ts
import type { LucideIcon } from "lucide-react";
import type { IconBadgeTone } from "./icon-badge";

export interface GridTileProps {
  /** Lucide icon component rendered inside the 46×46 IconBadge. */
  icon: LucideIcon;
  /**
   * Semantic tone for the IconBadge fill + icon colour.
   * Maps to the group's identity: primary (Captain), accent (Team Lead),
   * secondary (Team Member).
   * @default "primary"
   */
  iconTone?: IconBadgeTone;
  /** Tile label — "My Teams", "Camp Management", etc. */
  title: string;
  /** Sub-label beneath the title — "Your crews", "Roster & statuses". */
  hint?: string;
  /**
   * Count badge value shown at top-right of the head row.
   * Falsy (0, undefined, null, "") → badge hidden.
   * String values ("12") rendered as-is; numbers converted to string.
   */
  badge?: number | string | null;
  /**
   * Navigation href. When provided, renders as `<a>`. When absent,
   * renders as `<button>` (onPress callback pattern) or inert `<div>` (locked).
   */
  href?: string;
  /**
   * When true, the tile is inert (pointer-events-none, reduced opacity).
   * Used by CaptainLock treatment at the group level; rarely applied
   * per-tile directly — prefer locking at the RankGroupCard level.
   * @default false
   */
  disabled?: boolean;
  /**
   * Slot for the drag-handle node injected by CustomizeMode's DraggableTileRow.
   * When provided, rendered before the Head row (or prepended inline in the
   * DraggableTileRow layout). GridTile itself does not manage drag state.
   */
  dragHandle?: React.ReactNode;
  /** Click/press callback for button-mode tiles (no href). */
  onPress?: () => void;
  className?: string;
}
```

### Variants

| Variant | Condition | Rendered form |
|---|---|---|
| `default` | `href` absent, not disabled | `<button>` element; interactive hover/focus styles |
| `link` | `href` present, not disabled | `<a>` element; interactive hover/focus styles |
| `with-badge` | `badge` is truthy | Count Badge shown at top-right of Head row |
| `locked` / `inert` | `disabled=true` | `<div aria-disabled="true">`, `pointer-events-none opacity-50`, no hover state |
| `dragging` | `dragHandle` provided (DraggableTileRow controls styling) | Host applies `stroke:$accent` via className; GridTile does not self-manage dragging |
| `coming-soon` | future — no destination yet (board spec notes tiles like "Camp Tasks", "Finances" are unbuilt destinations) | Treated as `disabled` until destination ships |

### Sizes

GridTile has one canonical size: `w:200` on the board. In the S08 2-column grid it is `w:fill_container` (each tile is `flex-1` within its row). No size prop — tile width is governed by the grid layout in `RankGroupCard`.

Internal fixed dimensions:
- IconBadge: 46×46 (`size="md"` per atom-iconbadge.md)
- Badge: `pad:[3,9] r:999` (`py-[3px] px-[9px] rounded-full`)
- Card body: `gap:14 pad:16` (`gap-3.5 p-4`)
- TextCol: `gap:4` (`gap-1`)

### States

| State | Description |
|---|---|
| Default (no badge, button mode) | Card with IconBadge + title + hint; interactive hover tint |
| With-count | Badge shown at head-right with count value |
| Link mode | `<a href>` renders; hover/focus same as button |
| Locked / inert | `opacity-50 pointer-events-none`; no badge; consumer controls message via `CaptainLock` at group level |
| Dragging | `dragHandle` slot filled; host (`DraggableTileRow`) applies `stroke:$accent` via className |
| Coming-soon | `disabled=true`; no href; badge hidden |

---

## Tokens & type — exact design tokens + type-scale roles

All tokens in short Tailwind utility form (P1-5 normalisation — no `[color:var(--color-*)]` verbose form).

### Layout / container

| Element | Token / utility | Source |
|---|---|---|
| Tile background | `bg-card` | Board 03 `fill:$card` |
| Tile border | `border border-border` | Board 03 `stroke:$border` |
| Tile radius | `rounded-[--radius]` (or `rounded-md`) | Board 03 `r:$radius` → `--radius` (10px, design-tokens.md §3) |
| Tile padding | `p-4` (16px) | Board 03 `pad:16` |
| Tile vertical gap | `gap-3.5` (14px) | Board 03 `gap:14` |
| Head row | `flex items-start justify-between` | Board 03 `jc:space_between` |
| TextCol | `flex flex-col gap-1` | Board 03 `vertical gap:4` |

### IconBadge (delegated to atom)

| Element | Token / utility | Source |
|---|---|---|
| Container size | delegated to `IconBadge size="md"` (46px) | Board 03 `w:46 h:46` |
| Shape | `shape="rounded"` (`rounded-lg`) | Board 03 `r:12` → snaps to `rounded-lg` (design-tokens.md §3, `r:8–12 → rounded-lg`) |
| Fill (default / Captain group) | `bg-primary/18` (via `IconBadge tone="primary"`) | Board 03 `fill:#ff008c2e` → `primary/18%` (design-tokens.md §4 reconciliation #4) |
| Icon colour (default) | `text-primary` (via `IconBadge`) | Board 03 `$primary` |
| Fill (Team Lead group) | `bg-accent/15` (via `iconTone="accent"`) | S08 board `fill:#00dcff26` → `accent/15%` (reconciliation #7) |
| Fill (Team Member group) | `bg-secondary/25` (via `iconTone="secondary"`) | S08 board `fill:#75188840` → `secondary/25%` (reconciliation #3) |

### Count badge

| Element | Token / utility | Source |
|---|---|---|
| Badge fill | `bg-primary/18` | Board 03 `fill:#ff008c2e` → `primary/18%` (reconciliation #4); tinted fill matches IconBox — **not** solid `bg-primary` as in the dead `control-grid.tsx` |
| Badge text colour | `text-primary` | Board 03 `$primary` |
| Badge text size | `text-xs font-semibold` (Inter 12/600) | Board 03 `Inter/12px/600/$primary`; maps to `--text-caption` size (12px) with heavier weight |
| Badge radius | `rounded-full` | Board 03 `r:999` → `--radius-full` |
| Badge padding | `py-[3px] px-[9px]` | Board 03 `pad:[3,9]` |

Type note: `text-xs` (12px) with `font-semibold` (600) is the count badge role. This sits at the `--text-caption` size step (12px/400–500 per design-tokens.md §1.1) but at 600 weight — justified because the badge count is a functional numeric data point, not caption prose.

### Title

| Element | Token / utility | Source |
|---|---|---|
| Title text | `text-base font-semibold text-foreground` (Inter 16/600) | Board 03 `Inter/16px/600/$foreground`; maps to `--text-subtitle` role (16px/700 canonical — the board draws 600, close enough; use `font-semibold`/600 to match exactly) |

### Hint

| Element | Token / utility | Source |
|---|---|---|
| Hint text | `text-xs font-normal text-muted-foreground` (Inter 12/normal) | Board 03 `Inter/12px/normal/$muted-foreground`; maps to `--text-caption` role |

### Interactive states

| State | Token / utility | Source |
|---|---|---|
| Hover | `hover:bg-accent/10` | Standard interactive affordance; board does not draw hover — use `accent/10%` (subtle, consistent with NavCard pattern) |
| Focus-visible ring | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` | Design system; `$ring = $primary` |
| Disabled / locked | `opacity-50 pointer-events-none` | Spec: "preview-but-locked = inert controls + zero data" (decision 3) |
| Active / pressed | `active:scale-[0.98]` | Standard touch-feedback affordance |

---

## Composition & deps — atoms/primitives + helpers

### Direct atom dependencies

| Dep | Package | Role |
|---|---|---|
| `IconBadge` | `packages/ui/src/components/icon-badge.tsx` (PROMOTE — `atom-iconbadge.md`) | Renders the 46×46 tinted rounded icon container (`size="md" shape="rounded"`) |
| `cn` | `packages/ui/src/lib/utils` | Tailwind class merging |

### Radix / shadcn primitives

None — GridTile is a plain card-like button/link; no Radix primitive required. The `<a>` / `<button>` / `<div>` choice is handled inline based on `href` + `disabled` props.

### `@camp404/core` helpers

None. GridTile is **purely presentational** — it receives `disabled` as a boolean prop. The caller (RankGroupCard organism) is responsible for computing whether a tile is locked based on `rankLevel` from `@camp404/types`. GridTile carries no rank/clearance logic.

`rankLevel` (from `control-panel.tsx` today, moving to `@camp404/types` per `architecture.md`) is **not imported** by GridTile. The calling organism evaluates clearance and passes `disabled={true}`.

---

## Absorbs — candidates replaced (from the merge map)

The `component-library.md` merge map entry for **IconBadge** lists `GridTile IconBox` as a named absorbed candidate:

| Absorbed candidate | Description | Disposition |
|---|---|---|
| **GridTile IconBox** | Board 03 `IconBox {w:46 h:46 jc:center ai:center r:12 fill:#ff008c2e}` — the tinted rounded icon container inside GridTile | **Absorbed into `IconBadge`** (`size="md" shape="rounded" tone="primary"`); GridTile composes `IconBadge` rather than owning the icon-box shape. Delete the dead inline `IconBox` div in `control-grid.tsx`. |
| **Dead private `GridTile` in `control-grid.tsx`** | Inner unexported function at line 122–181 of `packages/ui/src/components/control-grid.tsx` | **DELETE** when `control-grid.tsx` is removed (that file is on the DELETE list per component-library.md). No migration path needed — the new canonical `grid-tile.tsx` replaces it. |

No other components collapse into GridTile itself. GridTile is a molecule that absorbs only the IconBox pattern (via IconBadge) and the dead inner function.

---

## Stories & tests

### Storybook stories (`packages/ui/src/components/grid-tile.stories.tsx`)

| Story | Key props | Purpose |
|---|---|---|
| `Default` | `icon=Users, title="My Teams", hint="Your crews", iconTone="primary"` | Baseline — no badge, button mode, primary tone |
| `WithBadge` | `icon=ClipboardList, title="Camp Tasks", hint="Camp-wide work board", badge=12, iconTone="primary"` | Count badge visible (mirrors S08 Captain group Camp Tasks tile) |
| `LinkMode` | `icon=Users, title="Camp Management", href="/captains/camp-management", iconTone="primary"` | Renders as `<a>`; inspect with keyboard nav |
| `AccentTone` | `icon=UserCog, title="Crew Roster", hint="Your crew's statuses", iconTone="accent"` | Team Lead group tone |
| `SecondaryTone` | `icon=Users, title="My Teams", hint="Your crews", iconTone="secondary"` | Team Member group tone |
| `Locked` | `icon=Shield, title="Camp Management", hint="Roster & statuses", disabled=true` | Inert tile; opacity-50; pointer-events-none; badge hidden |
| `WithDragHandle` | `icon=ClipboardList, title="Camp Tasks", dragHandle={<GripVertical .../>}` | Drag handle slot rendered (Customize mode shape) |
| `NoBadge` | `icon=Wallet, title="Finances", hint="Dues & reimbursements"` | Badge absent when badge prop omitted |
| `BadgeZero` | `icon=ListChecks, title="Camp Tasks", badge=0` | badge=0 → badge hidden (falsy guard) |
| `AllTones` | grid of one tile per tone | Visual smoke test of primary / accent / secondary |
| `ComingSoon` | `icon=ListChecks, title="Camp Tasks", disabled=true` | Coming-soon tile (disabled, no href) |

### Vitest / RTL test cases (`packages/ui/src/components/__tests__/grid-tile.test.tsx`)

| Test | Assertion |
|---|---|
| Renders title + hint | `title` text present; `hint` text present |
| Renders as `<button>` without href | DOM element is `button` |
| Renders as `<a>` with href | DOM element is `a` with matching `href` |
| Badge hidden when badge omitted | No badge element in DOM |
| Badge hidden when badge=0 | No badge element in DOM |
| Badge shown when badge=12 | Badge element present with text "12" |
| Badge shown when badge="42" | Badge element present with text "42" |
| Disabled tile renders as `<div>` | Root element is `div`; has `aria-disabled="true"` |
| Disabled tile is not interactive | No `onClick` / `href`; `pointer-events-none` class present |
| IconBadge rendered with correct size | Inner `IconBadge` has `size-[46px]` class |
| iconTone="accent" applies accent fill | Inner element has `bg-accent/15` class |
| dragHandle slot rendered | Passed ReactNode appears in DOM |
| className merges correctly | Extra `className="mt-4"` present in rendered output |
| Hover/focus ring classes present on button mode | `focus-visible:ring-ring` class present |
| onPress fires on button click | Mock callback called once on `userEvent.click` |

### a11y notes

- **Button mode:** the `<button>` carries an implicit role; ensure `title` is the accessible name when no explicit `aria-label` is provided. Since the title is visible text, this is automatic.
- **Link mode:** the `<a>` must not be `aria-hidden`. The destination is conveyed by the `title` text (e.g. "Camp Management"). Do not duplicate `title` in an `aria-label` — it is already the link's accessible text.
- **Disabled / locked tile:** renders as `<div aria-disabled="true">`. It must **not** be focusable (`tabIndex` unset or `-1`); screen readers skip it. The CaptainLock molecule at the group level provides the accessible explanation ("Captain access only"), so the inert tile needs no additional ARIA annotation.
- **Count badge:** rendered inside the tile's visible text area; it participates in the accessible name automatically. No `aria-label` needed on the badge span. If a future change makes the badge purely decorative (positioned outside the flow), mark it `aria-hidden` and convey the count via `aria-label` on the tile wrapper.
- **Icon:** passed to `IconBadge` which marks the icon `aria-hidden="true"`. The icon is decorative; the `title` text carries meaning.
- **Touch target:** the tile's `p-4` padding and `min-h` ensure the tap target meets WCAG 2.5.8 (24×24 minimum; tiles typically exceed 44px in height on mobile).
- **Drag handle:** when `dragHandle` is present, the host (`DraggableTileRow`) is responsible for the drag affordance's accessible label (`aria-label="Drag to reorder"` on the grip element). GridTile itself does not add ARIA drag attributes.

---

## Build steps — ordered + acceptance criteria

**Prerequisites:**
- **P0-blocker:** `IconBadge` (`packages/ui/src/components/icon-badge.tsx`) must exist and export `IconBadgeTone` before GridTile can be built (`atom-iconbadge.md` Step 1).
- **P0-blocker:** `--color-success` / `--color-warning` status tokens in `globals.css` must land before `success`/`warning` IconBadge tones are used (not needed for GridTile's own tones, but required before the parent `atom-iconbadge.md` gates those tones).
- **Soft prerequisite:** foundations-tokens.md Phase 0 (token spelling codemod, radius scale) should land before this, but GridTile can ship using short-form tokens independently.

### Step 1 — Create `packages/ui/src/components/grid-tile.tsx`

Build to board 03 spec:

- `"use client"` directive (contains interactive `<button>` / `<a>` elements)
- Compose `IconBadge` for the icon box (`size="md" shape="rounded" tone={iconTone}`)
- Count badge: inline `<span className="py-[3px] px-[9px] rounded-full bg-primary/18 text-primary text-xs font-semibold">` — hidden when badge is falsy
- Head row: `flex items-start justify-between`
- TextCol: `flex flex-col gap-1`; title `text-base font-semibold text-foreground`; hint `text-xs text-muted-foreground`
- Tile container: `flex flex-col gap-3.5 p-4 rounded-[--radius] bg-card border border-border`
- Interactive states: button/link → `hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] transition-colors`
- Disabled state: `<div aria-disabled="true" className="... opacity-50 pointer-events-none cursor-default">`
- `dragHandle?` slot: rendered as the first child of the tile (before Head row), only when provided
- All tokens in short Tailwind form; no `[color:var(--color-*)]` verbose form; no raw hex

**Acceptance:** component renders all prop combinations without error; no raw hex or verbose token classes; `IconBadge` composed (not inline div); toned fills are correct per board.

### Step 2 — Export from `@camp404/ui` package barrel

Add to `packages/ui/src/index.ts` (or equivalent barrel):

```ts
export { GridTile } from "./components/grid-tile";
export type { GridTileProps } from "./components/grid-tile";
```

**Acceptance:** `import { GridTile } from "@camp404/ui/components/grid-tile"` resolves in `apps/web`.

### Step 3 — Storybook stories

Create `packages/ui/src/components/grid-tile.stories.tsx` covering all stories listed above.

**Acceptance:** Storybook builds without error; all stories render without console warnings; badge hidden/shown stories visually match board 03; tones visually match S08 group chips.

### Step 4 — Vitest / RTL tests

Create `packages/ui/src/components/__tests__/grid-tile.test.tsx` covering all test cases listed above.

**Acceptance:** `pnpm test --filter @camp404/ui` passes green.

### Step 5 — Delete dead inner `GridTile` from `control-grid.tsx`

When `control-grid.tsx` is removed as part of the DELETE pass (component-library.md), the inner `GridTile` function at line 122–181 dies with it. No migration needed — the canonical `grid-tile.tsx` is the replacement.

If `control-grid.tsx` deletion is deferred to a later PR, add a JSDoc `@deprecated` comment on the inner function to signal it is dead:

```ts
/** @deprecated Use `GridTile` from `@camp404/ui/components/grid-tile` instead. */
function GridTile(…) { … }
```

**Acceptance:** no two exported `GridTile` symbols exist simultaneously; `control-grid.tsx` carries a deprecation comment if not yet deleted.

### Step 6 — Wire into `RankGroupCard` organism

When `RankGroupCard` is built (app-local organism, `apps/web/app/home`), it composes `GridTile` in a 2-column `Row` grid per the S08 spec. This step is tracked in the `RankGroupCard` plan, not here.

**Acceptance:** home control panel renders 2×4×3 = 12 tiles in their correct groups; badge counts reflect live data; locked groups show `CaptainLock` + inert tiles.

---

## Consumers — which molecules/organisms/surfaces use GridTile

| Consumer | Type | File (post-promote) | Role |
|---|---|---|---|
| **RankGroupCard** | organism (NEW, app-local) | `apps/web/app/home/rank-group-card.tsx` | Composes GridTile in a 2-column grid (2 per row × 4 tiles per group × 3 groups = 12 tiles on the home route); passes `iconTone` per group identity |
| **CustomizeMode / DraggableTileRow** | organism sub-component (NEW, app-local) | `apps/web/app/home/customize-mode.tsx` | Wraps GridTile with the `dragHandle` slot; applies `stroke:$accent` className during dragging |

`GridTile` is **home-exclusive** per `component-library.md` ("Used by: home control panel (rank-group tool tiles)"). No other surface uses it. Future surfaces (task boards, finances views) may introduce their own tile patterns; if the anatomy matches, use `GridTile`; if not, create new molecules rather than forking it.
