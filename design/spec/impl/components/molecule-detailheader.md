# DetailHeader — molecule plan

- **mapsTo:** PROMOTE (no existing `@camp404/ui` file; hand-rolled inline in both consumer surfaces)
- **Target file:** `packages/ui/src/components/detail-header.tsx`

---

## Current state — does it exist? where? gap vs spec

**Does not exist in `@camp404/ui`.** Confirmed by `ls packages/ui/src/components/` — no `detail-header.tsx` present.

**Both consumers currently hand-roll their own divergent back affordances:**

- `apps/web/app/notifications/page.tsx` (lines 41–45): renders a `<Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5">` wrapping an `<a href="/">` with an inline `<ChevronLeft className="h-4 w-4" />` and the text "Home". This is a ghost button, not the spec's 40×40 round pill. No title label sits alongside it.
- `apps/web/app/tools/page.tsx`: renders no back affordance at all — the `<header>` block (lines 60–66) contains only an `<h1>` and subtitle paragraph with no back navigation.

**Gaps vs board `02-detailheader.txt`:**

| Gap | Notifications live | Tools live | Board spec |
|---|---|---|---|
| Back button shape | Ghost button (rectangle) | Missing | 40×40 `r:999 fill:$muted` round pill |
| Back button icon | `ChevronLeft h-4 w-4` inline | — | `chevron-left ($foreground)` lucide, centred |
| Title label | Missing (separate `<h1>` below) | Missing | `Inter/18px/700/$foreground` inline with back btn |
| Layout | Back btn + separate header block | Header block only | `gap:6 pad:[14,12] ai:center` horizontal row |
| Token usage | `mb-4 gap-1.5` ad-hoc | none | `$muted` fill, `$foreground` text |

The board (`02-detailheader.txt`) is the single authority. The live code in both surfaces is classified **divergent inline stub** and will be removed when `DetailHeader` ships.

---

## API — props, variants, sizes, states

### Props

```ts
interface DetailHeaderProps {
  /** Surface label rendered as the page title inline with the back button. */
  title: string;

  /**
   * Destination for the back navigation.
   * Provide `backHref` for a Next.js Link (server / RSC safe) or `onBack` for
   * a client-side handler. Exactly one must be supplied.
   */
  backHref?: string;
  onBack?: () => void;

  /** Optional className forwarded to the root wrapper (layout overrides). */
  className?: string;
}
```

### Variants

The board draws a single default variant — no size or tone variants are specified. The component has one shape.

| Variant | Description |
|---|---|
| `default` | 40×40 round `$muted` pill + `chevron-left` icon + title text, horizontal row |

### Sizes

Single size only — `w:40 h:40` back-button, `Inter/18px/700` title. No `size` prop.

### States

| State | Description |
|---|---|
| `static` | The component is purely presentational / navigational. No loading, no error, no disabled state. |
| `focus-visible` | The back-button link receives `focus-visible:ring-2 focus-visible:ring-ring` (system ring token) for keyboard access. |

---

## Tokens & type — design tokens and type-scale roles

All from `design-tokens.md` and `design/spec/component-library.md`. **No raw hex, no inline px.**

| Element | Token(s) | Type role |
|---|---|---|
| Root wrapper fill | `bg-background` | — |
| Root wrapper layout | `gap-1.5` (6px ≈ board `gap:6`), `px-3 py-3.5` (board `pad:[14,12]`) | — |
| Back button background | `bg-muted` | — |
| Back button shape | `rounded-full` (`--radius-full`) | — |
| Back button size | `w-10 h-10` (40×40px) | — |
| Chevron icon colour | `text-foreground` | — |
| Chevron icon size | `h-5 w-5` (20×20; centred inside 40×40 container) | — |
| Title text colour | `text-foreground` | `--text-subtitle` (Inter 18px/700 — board draws 18px; matches the "hero card header" subtitle step from `design-tokens.md §1.2`) |
| Title font weight | `font-bold` (700) | `--text-subtitle` |
| Title font size | `text-lg` (18px) | `--text-subtitle` |
| Focus ring | `ring-ring` (`focus-visible:ring-2 focus-visible:ring-ring`) | — |

**Title size note:** `design-tokens.md §1.2` standardises card/subtitle titles on 16px, keeping 18px only for "hero card header". The `DetailHeader` title is a page-level label, not a card title; the board explicitly draws 18px/700. This component is a deliberate 18px exception in the molecule — it sits above the page body, not inside a card. Use `text-lg font-bold` (`--text-subtitle` 18px step).

**No `dark:` variants** — dark-only app; no `dark:` utilities ever.

---

## Composition & deps — atoms/primitives and helpers

| Dependency | Source | Role |
|---|---|---|
| `cn` utility | `@camp404/ui/lib/utils` | Class merging for `className` prop override |
| `ChevronLeft` | `lucide-react` | Back button icon |
| `Link` (Next.js) | `next/link` | Navigation when `backHref` is supplied (RSC-safe) |
| No other `@camp404/ui` atoms | — | The back pill is rendered with raw Tailwind utilities, not a Button atom, because it is a round icon-only pill (`r:999`) not a standard button shape. Using `Button` would fight its internal padding / shape constraints. |

`@camp404/core` — no helpers required. `DetailHeader` is pure presentation with zero domain logic.

**Why not wrap `Button`?** The board specifies `w:40 h:40 r:999 fill:$muted` with no text, no `$primary` background, and no button affordances. The `Button` atom is Inter 14px with defined padding slots; overriding it to a 40×40 circle with `asChild` + icon adds complexity with no benefit. The pill is a direct `<a>` / `<button>` styled with utilities.

---

## Absorbs — candidates replaced

From `component-library.md` merge map: `DetailHeader` is listed as a direct PROMOTE with no multi-candidate merge. It absorbs the **two inline back affordances**:

1. The `<Button asChild variant="ghost"> <a href="/"> <ChevronLeft/> Home </a> </Button>` block in `apps/web/app/notifications/page.tsx` (lines 41–45).
2. The absence of a back affordance in `apps/web/app/tools/page.tsx`.

Neither is a named component in the inventory. `GhostBack` is a sibling molecule (lightweight ghost link) and is **not** the same component — `GhostBack` is `chevron-left + label text` with no round pill; `DetailHeader` is `round-pill-back + title`. They remain distinct. Do not merge.

---

## Stories & tests

### Storybook stories

File: `packages/ui/src/components/detail-header.stories.tsx`

| Story | Props | Purpose |
|---|---|---|
| `Default` | `title="Notifications"`, `backHref="/"` | Canonical board rendering |
| `ToolsTitle` | `title="Tools"`, `backHref="/"` | Second canonical consumer |
| `LongTitle` | `title="A Very Long Surface Title That Overflows"`, `backHref="/"` | Title truncation / wrapping behaviour |
| `WithOnBack` | `title="Back handler"`, `onBack={() => alert("back")}` | Client handler variant |
| `FocusVisible` | `title="Keyboard nav"`, `backHref="/"` | Focus ring visible (use `play` function to `.focus()` the button) |

### Vitest / RTL test cases

File: `packages/ui/src/components/__tests__/detail-header.test.tsx`

| Test | Description |
|---|---|
| Renders title | `title` text is visible in the DOM |
| Renders chevron-left icon | `ChevronLeft` aria-hidden icon is present |
| backHref: renders an anchor | When `backHref` supplied, back element is an `<a>` with correct `href` |
| onBack: renders a button | When `onBack` supplied, back element is a `<button>`; click fires handler |
| onBack fires once | Spy called exactly once on click |
| className override | Additional className is applied to root wrapper |
| No backHref + no onBack | Throws / warns (or renders without a link — confirm behaviour policy; recommend `console.error` + no-op) |

### Accessibility notes

- Back button (`<a>` or `<button>`) must have an accessible label. Add `aria-label="Go back"` (or `"Back to {title of parent}"` if context is available). The icon is `aria-hidden`.
- The title text is NOT a heading (`<h1>`) — it is a label accompanying a navigation control. The page-level `<h1>` lives in the header block below `DetailHeader` (as drawn on both consumer boards). Do not add a heading role to the `DetailHeader` title span.
- Focus ring uses `focus-visible:ring-2 focus-visible:ring-ring` — only visible on keyboard navigation, never on mouse click.
- Reduced-motion: no animation on this component; no `transition` or `animate-*` utilities needed.
- Colour contrast: `$foreground` icon on `$muted` background — confirmed passing against the OKLCH dark palette (`oklch(0.22 0.06 295)` muted, `oklch(0.97 0.02 330)` foreground).

---

## Build steps — ordered with acceptance criteria

**Prerequisite:** `foundations-tokens.md` token step must land first — `--radius-full`, `bg-muted`, `text-foreground`, `ring-ring`, and `bg-background` are all confirmed present in `packages/ui/src/styles/globals.css`. Verify before step 1.

1. **Create `packages/ui/src/components/detail-header.tsx`**
   - Implement the component per the API above.
   - Conditional render: `backHref` → `<Link>` from `next/link`; `onBack` → `<button>`; neither → render a `<span>` (non-navigable, with a `console.error` in dev).
   - Apply: `flex items-center gap-1.5 px-3 py-3.5 bg-background` on the root `<div>`.
   - Back pill: `flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`.
   - `ChevronLeft` icon: `h-5 w-5 text-foreground` with `aria-hidden`.
   - Title: `<span className="text-lg font-bold text-foreground">`.
   - **Acceptance:** component renders with correct shape; no TS errors; no Tailwind `dark:` utilities; no raw hex.

2. **Export from `packages/ui/src/index.ts`** (or the package barrel)
   - Add `export { DetailHeader } from "./components/detail-header"` and `export type { DetailHeaderProps }`.
   - **Acceptance:** `import { DetailHeader } from "@camp404/ui"` resolves without error in `apps/web`.

3. **Write Storybook stories** (`detail-header.stories.tsx`)
   - Cover all stories listed above.
   - **Acceptance:** all 5 stories render in Storybook; Default story matches the board pixel spec.

4. **Write Vitest / RTL tests** (`__tests__/detail-header.test.tsx`)
   - Cover all test cases listed above.
   - **Acceptance:** `pnpm --filter @camp404/ui test` green; no snapshot drift.

5. **Replace notifications back affordance** (`apps/web/app/notifications/page.tsx`)
   - Remove lines 41–45 (the ghost Button + anchor).
   - Import `DetailHeader` from `@camp404/ui`.
   - Render `<DetailHeader title="Notifications" backHref="/" />` at the top of the `<main>` (before the existing `<header>` block that carries the `<h1>`).
   - The `<h1>` "Notifications" and subtitle paragraph remain in the `<header>` block below — they are NOT the `DetailHeader` title; the `DetailHeader` title override on this board reads "Home" (as the back-destination label), but the surface spec (`09-notifications.md §1`) says `title` override is "Home". Wire accordingly: `<DetailHeader title="Home" backHref="/" />`.
   - **Acceptance:** page renders with round back-pill labelled "Home"; clicking it navigates to `/`; no ghost Button remains.

6. **Add DetailHeader to tools hub** (`apps/web/app/tools/page.tsx`)
   - Import `DetailHeader`.
   - Render `<DetailHeader title="Tools" backHref="/" />` above the `<header>` block.
   - **Acceptance:** `/tools` renders the back-pill with "Tools" title; back navigates to `/`.

7. **Delete dead inline imports from consumers**
   - In `apps/web/app/notifications/page.tsx`: remove `ChevronLeft` from the lucide import if no longer needed.
   - In `apps/web/app/tools/page.tsx`: no change needed (no existing back code to clean up).
   - **Acceptance:** no unused import warnings; `pnpm build` green on `apps/web`.

---

## Consumers — molecules/organisms/surfaces that use DetailHeader

| Consumer | Surface file | Usage |
|---|---|---|
| Notifications inbox | `apps/web/app/notifications/page.tsx` | Title override: `"Home"`; `backHref="/"` |
| Tools hub | `apps/web/app/tools/page.tsx` | Title override: `"Tools"`; `backHref="/"` |

These are the **only two consumers** confirmed by the boards (`21-s12-notifications.txt` line 6: `⟶ <DetailHeader> "Back to Home" … overrides:["Home"]`; `22-s13-tools-hub.txt` line 6: `⟶ <DetailHeader> … overrides:["Tools"]`). No other board references this reusable component. No organism composes `DetailHeader` — it is surface-top-level chrome in both cases.

`GhostBack` (sibling molecule) is not a consumer; it is a distinct back affordance for other surfaces (invite-tool, my-forms, family-tree, captain-tools, announcements, roster).
