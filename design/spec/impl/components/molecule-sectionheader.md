# SectionHeader — molecule plan

- **mapsTo:** PROMOTE (no existing `@camp404/ui` file; hand-rolled inline in `apps/web/app/captains/announcements/announcements-manager.tsx`)
- **Target file:** `packages/ui/src/components/section-header.tsx`

---

## Current state — does it exist? where? gap vs spec

**Does not exist in `@camp404/ui`.** Confirmed by `ls packages/ui/src/components/` — no `section-header.tsx` present.

**One hand-rolled inline implementation exists in `apps/web`:**

- `apps/web/app/captains/announcements/announcements-manager.tsx` lines 277–279 and 329–331:
  ```tsx
  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
    Drafts {drafts.length > 0 && `(${drafts.length})`}
  </h2>
  ```
  Same pattern at the Published section. No trailing "See all" action. Count is appended inline with a ternary, not as a distinct prop.

**Board 01 (`01-sectionheader.txt`) is the canonical authority.** The board renders:
```
▸ "SectionHeader" {w:398 pad:[0,2] jc:space_between ai:center}
  T "SECTION"  [Inter/12px/600/$muted-foreground]
  T "See all"  [Inter/12px/500/$accent]
```

**Superseded board S07 (`16-s07-home-dashboard.txt`) also uses `SectionHeader`** (3 instances with overrides `"YOUR TOOLS"`, `"TEAM LEAD · VIEW ONLY"`, `"CAPTAIN · VIEW ONLY"`) — this board is superseded by S08 (decision #1, surface spec 06-home.md). The S07 label overrides establish that `SectionHeader` also carries mono-caps eyebrow text without a trailing action. This is the `plain` variant.

**Gaps vs board spec (`01-sectionheader.txt`):**

| Gap | Live code (announcements-manager) | Board 01 spec |
|---|---|---|
| Container layout | Block `<h2>` with `mb-3` | `jc:space_between ai:center` flex row |
| Label typography | `text-sm` (14px), `font-semibold` (600), `uppercase`, `tracking-wide` | Inter 12px/600/`$muted-foreground` |
| Label element | `<h2>` | spec-neutral; the board draws a text node (`T`) — implement as `<h2>` for heading semantics |
| Count rendering | Inline ternary in `{label} (count)` | Count as a separate `count?` prop; board draws no count inline — the live code pattern extends the board spec |
| Trailing action | Absent | `T "See all" [Inter/12px/500/$accent]` |
| Token spelling | `text-muted-foreground` (correct) | `$muted-foreground` |
| Padding | `mb-3` (margin, not pad) | `pad:[0,2]` horizontal pad |

The `plain` variant (label only, no action, no count) matches the superseded-board use case. The `with-count` variant extends the board with the live-code count pattern. The `with-action` variant matches board 01's "See all" trailing link.

---

## API — props, variants, sizes, states

### Props

```ts
interface SectionHeaderProps {
  /**
   * The section label. Rendered UPPERCASE via CSS (text-transform).
   * Example values: "Drafts", "Published", "YOUR TOOLS", "TEAM LEAD · VIEW ONLY".
   */
  label: string;

  /**
   * Optional trailing action label (e.g. "See all").
   * When provided, renders as a styled link/button on the right.
   * Requires exactly one of `actionHref` or `onAction`.
   */
  action?: string;

  /** Destination for the action if it is a navigation link. */
  actionHref?: string;

  /** Click handler for the action if it is a client-side trigger. */
  onAction?: () => void;

  /**
   * Optional count appended after the label (e.g. "Drafts (2)").
   * Rendered as `{label} ({count})` inline in the label span.
   * Omit or pass `undefined` when the count is zero or unknown.
   */
  count?: number;

  /** Optional heading level override for the label element. Default: "h2". */
  as?: "h2" | "h3" | "p";

  /** Optional className forwarded to the root wrapper. */
  className?: string;
}
```

### Variants

| Variant name | Condition | Description |
|---|---|---|
| `plain` | `label` only, no `action`, no `count` | Section divider label only. Board S07 overrides ("YOUR TOOLS", rank labels). |
| `with-count` | `label` + `count` | Label + inline `(count)` parenthetical. Live announcements pattern ("Drafts (2)"). |
| `with-action` | `label` + `action` | Label left, action link right. Board 01 canonical ("SECTION" + "See all"). |
| `with-count-and-action` | `label` + `count` + `action` | Both count and trailing action simultaneously. |

Variants are prop-driven, not a `variant` enum prop — the combination of supplied optional props determines the rendered output.

### Sizes

Single size only. Board specifies `Inter/12px/600` for the label and `Inter/12px/500` for the action. No `size` prop.

### States

| State | Description |
|---|---|
| `static` | Purely presentational. No loading, no disabled, no error state. |
| `focus-visible` | The `action` link/button receives `focus-visible:ring-2 focus-visible:ring-ring` for keyboard access. |

---

## Tokens & type — exact design tokens and type-scale roles

From `design/spec/design-tokens.md` and `design/spec/component-library.md`. **No raw hex. No `dark:` variants.**

| Element | Tailwind utility / token | Type-scale role (`design-tokens.md §1.1`) |
|---|---|---|
| Root wrapper layout | `flex items-center justify-between px-0.5` (board `pad:[0,2]`) | — |
| Label text colour | `text-muted-foreground` (`$muted-foreground`) | `--text-label` (Inter 12px/600; label role maps to 13px/600–700 — board draws 12px/600; use `text-xs font-semibold` to match the board's exact 12px) |
| Label text transform | `uppercase` | `--text-eyebrow` is JetBrains Mono / `$accent`; board 01's label is **Inter** `$muted-foreground` UPPERCASE — this is the **label-caps** sub-role, NOT the mono eyebrow. Do not use `font-mono`. |
| Label font size | `text-xs` (12px) | Board-exact `12px/600` — sits within the `--text-label` / `--text-caption` band; use `text-xs font-semibold`. |
| Label tracking | `tracking-wide` | Matches board `uppercase` + the live code pattern; consistent with `--text-label` caps usage. |
| Action text colour | `text-accent` (`$accent`) | `--text-label` (12px/500) — use `text-xs font-medium text-accent`. |
| Action font weight | `font-medium` (500) | — |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-ring` | `--color-ring` (= primary) |
| Count parenthetical | Inline `text-muted-foreground` (same as label) | Same `--text-label` role as the label |

**Typography note:** `design-tokens.md §1.1` places `--text-label` at Inter 13px/600–700. The board explicitly draws 12px/600 for both elements. Apply `text-xs font-semibold` (12px) for the label and `text-xs font-medium` (12px) for the action — a deliberate one-step-down from the canonical `--text-label` 13px, matching the board exactly. This mirrors the `--text-caption` (12px/400–500) and `--text-micro` (10–11px/600–700) band; the board's SectionHeader label sits between them at 12/600.

**No mono face.** The board draws `[Inter/12px/600/$muted-foreground]` — this is Inter, not JetBrains Mono. Eyebrows (`--text-eyebrow`) are JetBrains Mono 11px/700/`$accent`/UPPERCASE. SectionHeader uses the Inter label-caps sub-role — the same visual intent (caps) but a different typeface and a different semantic register (section divider, not data-console eyebrow).

---

## Composition & deps — atoms/primitives and helpers

| Dependency | Source | Role |
|---|---|---|
| `cn` utility | `@camp404/ui/lib/utils` | Class merging for `className` prop override |
| `Link` (Next.js) | `next/link` | Navigation when `actionHref` is supplied (RSC-safe) |
| No other `@camp404/ui` atoms | — | The component is two inline text nodes in a flex row — no Button, no Badge, no other atom composited. A Button atom would fight the micro-typography size here. |

`@camp404/core` — no helpers required. `SectionHeader` is pure presentation with zero domain logic.

**Why not wrap `Button` for the action?** The board specifies `T "See all" [Inter/12px/500/$accent]` — a plain text node, not a button shape. Wrapping `Button` with its internal padding and shape constraints at 12px would distort the layout. The action renders as a bare `<a>` (with `actionHref`) or `<button>` (with `onAction`) styled with `text-xs font-medium text-accent`.

---

## Absorbs — candidates replaced by this component

From `component-library.md` merge map: `SectionHeader` is a direct PROMOTE. The merge map lists no other candidates that collapse into it. It absorbs:

1. The two inline `<h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">` section headings in `apps/web/app/captains/announcements/announcements-manager.tsx` (lines 277–279 "Drafts" and 329–331 "Published"). These are the only confirmed hand-rolled instances in `apps/web`.

No named component in the inventory shares this shape. `GhostBack`, `DetailHeader`, and `TopChrome` are sibling molecules with distinct anatomies — they are not candidates.

---

## Stories & tests

### Storybook stories

File: `packages/ui/src/components/section-header.stories.tsx`

| Story | Props | Purpose |
|---|---|---|
| `Plain` | `label="YOUR TOOLS"` | S07 canonical rendering — label only, no action, no count |
| `WithAction` | `label="SECTION"`, `action="See all"`, `actionHref="#"` | Board 01 canonical — label + right-aligned action link |
| `WithCount` | `label="Drafts"`, `count={2}` | Announcements "Drafts (2)" pattern |
| `WithCountZero` | `label="Drafts"`, `count={0}` | Count 0 renders no parenthetical (prop present but falsy) |
| `WithCountAndAction` | `label="Published"`, `count={5}`, `action="See all"`, `actionHref="#"` | Both props simultaneously |
| `WithOnAction` | `label="SECTION"`, `action="See all"`, `onAction={() => {}}` | Client handler (no `actionHref`) |
| `RankLabelViewOnly` | `label="TEAM LEAD · VIEW ONLY"` | Long label with interpunct — layout / truncation check |
| `AsH3` | `label="Subsection"`, `as="h3"` | Heading level override |
| `FocusVisible` | `label="SECTION"`, `action="See all"`, `actionHref="#"` | Focus ring visible on the action (use `play` function to `.focus()` the action) |

### Vitest / RTL test cases

File: `packages/ui/src/components/__tests__/section-header.test.tsx`

| Test | Description |
|---|---|
| Renders label | `label` text is present in the DOM |
| Renders UPPERCASE | Label text has `uppercase` in className or `text-transform: uppercase` in computed style |
| Renders action link | When `actionHref` supplied, action renders as `<a>` with correct `href` |
| Renders action button | When `onAction` supplied, action renders as `<button>` |
| onAction fires once | Click spy called exactly once |
| No action: action absent | When neither `action` nor `actionHref`/`onAction` supplied, no action element in DOM |
| Count shown when positive | `count={3}` renders `(3)` visible in the DOM alongside the label |
| Count hidden when zero | `count={0}` — parenthetical `(0)` is NOT rendered (falsy guard) |
| Count omitted when undefined | No `count` prop — no parenthetical at all |
| as="h3" override | Root label element is an `<h3>` |
| className override | Additional `className` propagated to root wrapper |
| Default heading level | Without `as` prop, label renders as `<h2>` |

### Accessibility notes

- The label element is a heading (`<h2>` by default, configurable via `as`). It must be the correct heading level for its document position — consumers are responsible for picking `h2` vs `h3` based on page outline depth.
- The action link (`<a>`) must have discernible text. The `action` string (e.g. "See all") is the accessible label. No additional `aria-label` needed if the text is meaningful.
- The action `<button>` variant must also have discernible text via the `action` prop value.
- The action focus ring (`focus-visible:ring-2 focus-visible:ring-ring`) is keyboard-only; no mouse focus ring.
- Colour contrast: `text-muted-foreground` on `$background` — `oklch(0.7 0.05 325)` on `oklch(0.15 0.05 295)` — passes AA (≥4.5:1 for 12px bold). `text-accent` on `$background` — `oklch(0.62 0.18 255)` on `oklch(0.15 0.05 295)` — verify against the finalised OKLCH values before shipping; electric blue at this lightness should clear AA.
- `aria-hidden` is NOT applied to the label — it is meaningful heading content.
- No reduced-motion concern: no animation or transition in this component.

---

## Build steps — ordered with acceptance criteria

**Prerequisite:** `foundations-tokens.md` token step must land first — `text-muted-foreground`, `text-accent`, `ring-ring`, `bg-background` must be confirmed present in `packages/ui/src/styles/globals.css`. Verify before step 1.

1. **Create `packages/ui/src/components/section-header.tsx`**
   - Implement the component per the API above.
   - Root: `<div className={cn("flex items-center justify-between px-0.5", className)}>`.
   - Label: `<{as} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}{count ? ` (${count})` : ""}</{as}>` — default `as="h2"`.
   - Action (conditional on `action` prop): if `actionHref`, render `<Link href={actionHref} className="text-xs font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">{action}</Link>`; if `onAction`, render `<button type="button" onClick={onAction} className="text-xs font-medium text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">{action}</button>`.
   - Guard: if `action` is provided but neither `actionHref` nor `onAction` is supplied, render the action as a `<span>` with `console.error` in dev.
   - **Acceptance:** component renders with correct flex row, both text nodes present, correct token classes; no TS errors; no `dark:` utilities; no raw hex; no `font-mono`.

2. **Export from `packages/ui/src/index.ts`** (or the package barrel)
   - Add `export { SectionHeader } from "./components/section-header"` and `export type { SectionHeaderProps }`.
   - **Acceptance:** `import { SectionHeader } from "@camp404/ui"` resolves without error in `apps/web`.

3. **Write Storybook stories** (`section-header.stories.tsx`)
   - Cover all stories listed above.
   - **Acceptance:** all 9 stories render in Storybook; `WithAction` story matches board 01 pixel spec (`pad:[0,2] jc:space_between`).

4. **Write Vitest / RTL tests** (`__tests__/section-header.test.tsx`)
   - Cover all 12 test cases listed above.
   - **Acceptance:** `pnpm --filter @camp404/ui test` green; no snapshot drift.

5. **Replace inline section headings in `announcements-manager.tsx`**
   - In `apps/web/app/captains/announcements/announcements-manager.tsx`, replace the two `<h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">` blocks:
     - Line 277–279: `<SectionHeader label="Drafts" count={drafts.length > 0 ? drafts.length : undefined} />`
     - Line 329–331: `<SectionHeader label="Published" count={published.length > 0 ? published.length : undefined} />`
   - Import `SectionHeader` from `@camp404/ui`.
   - Adjust the `mb-3` spacing to sit on the wrapping `<section>` or as a `className` override on `SectionHeader` to match the existing vertical rhythm.
   - **Acceptance:** Drafts and Published section headings render identically to before (uppercase label + optional count in parentheses); no raw `<h2>` className block remains; `pnpm build` green on `apps/web`.

---

## Consumers — molecules/organisms/surfaces that use SectionHeader

| Consumer | Surface file | Usage |
|---|---|---|
| AnnouncementsManager (Drafts) | `apps/web/app/captains/announcements/announcements-manager.tsx` | `label="Drafts"`, `count?` when `drafts.length > 0` |
| AnnouncementsManager (Published) | `apps/web/app/captains/announcements/announcements-manager.tsx` | `label="Published"`, `count?` when `published.length > 0` |
| Home (S07 superseded; S08 uses `RankGroupCard`) | `apps/web/app/page.tsx` (future) | S07 pattern: `label="YOUR TOOLS"` / `"TEAM LEAD · VIEW ONLY"` / `"CAPTAIN · VIEW ONLY"` — **note: S07 is superseded by S08 (decision #1); S08's RankGroupCard uses a GroupHead chip + name + tool-count, not SectionHeader. SectionHeader is NOT wired into the home control panel under the canonical S08 design.** |

The S07 instances (confirmed in `16-s07-home-dashboard.txt`) are from the superseded dashboard board; the canonical S08 board (`17-s08-control-panel.txt`) uses `RankGroupCard` GroupHead, not `SectionHeader`. The `information-architecture.md` table lists `SectionHeader` against `/captains/announcements` — consistent with the confirmed live usage. **The only active consumer requiring wiring on ship is `AnnouncementsManager`.**

Future surfaces that will reach for `SectionHeader` when built (per the spec's list-section pattern — "home groups, announcements Drafts/Published, generic `SECTION · See all`"):
- Any surface with a labelled list section (e.g. notifications, roster profile sections, tools group headers) — all future build scope.
- `AnnouncementsManager`'s organism plan should import `SectionHeader` from `@camp404/ui` once step 5 ships.
