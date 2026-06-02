# GhostBack — molecule plan

- **mapsTo:** PROMOTE (no `@camp404/ui/ghost-back.tsx` exists; pattern is inlined per surface in `apps/web`)
- **Target file:** `packages/ui/src/components/ghost-back.tsx`

---

## Current state — does it exist? where? gap vs spec

**Does not exist in `@camp404/ui`.** Confirmed by `ls packages/ui/src/components/` — no `ghost-back.tsx` present.

**Six consumer surfaces each hand-roll a divergent inline version:**

| Surface file | Live markup | Label | href |
|---|---|---|---|
| `apps/web/app/tools/invite/page.tsx` (lines 24–28) | `<Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5"><a href="/tools"><ChevronLeft className="h-4 w-4" /> Tools</a></Button>` | "Tools" | `/tools` |
| `apps/web/app/tools/forms/page.tsx` (lines 45–51) | `<Link href="/tools" className="mb-6 inline-flex items-center gap-1 text-sm text-[color:var(--color-muted-foreground)] hover:text-[color:var(--color-foreground)]"><ChevronLeft className="h-4 w-4" />Tools</Link>` | "Tools" | `/tools` |
| `apps/web/app/tools/forms/[key]/page.tsx` (lines 58–64) | Same `Link` + inline className pattern as above | "My forms" | `/tools/forms` |
| `apps/web/app/family-tree/page.tsx` (lines 27–29) | `<Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5"><a href="/tools"><ChevronLeft className="h-4 w-4" /> Tools</a></Button>` | "Tools" | `/tools` |
| `apps/web/app/captains/tools/page.tsx` (lines 57–60) | `<Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5"><a href="/"><ChevronLeft className="h-4 w-4" /> Captains</a></Button>` | "Captains" | `/` |
| `apps/web/app/captains/announcements/page.tsx` (lines 36–39) | `<Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5"><a href="/captains/tools"><ChevronLeft className="h-4 w-4" /> Camp tools</a></Button>` | "Camp tools" | `/captains/tools` |
| `apps/web/app/captains/camp-management/page.tsx` (lines 37–39) | `<Button asChild variant="ghost" size="sm" className="mb-4 gap-1.5"><a href="/"><ChevronLeft className="h-4 w-4" /> Captains</a></Button>` | "Captains" (spec says "Camp tools") | `/captains/tools` (spec) |

**Gaps vs spec (`component-library.md` + surface briefs):**

| Gap | Live code (common pattern) | Spec |
|---|---|---|
| Implemented as | `Button asChild variant="ghost" size="sm"` or raw `Link` + inline verbose token class | Standalone `ghost-back.tsx` molecule from `@camp404/ui` |
| Icon size | `h-4 w-4` (16×16) | Spec draws 20×20 (`h-5 w-5`) based on surface brief pad/gap proportions |
| Label typography | `text-sm` (14px) via Button defaults or inline `text-sm` | `Inter/15px/500/$muted-foreground` per surface briefs (`11-invite-tool.md §1`, `12-my-forms.md §1`, `16-captain-tools.md §1`) |
| Gap between icon + label | `gap-1.5` (6px) via Button / `gap-1` (4px) via Link | `gap:4` board spec |
| Padding | `mb-4` bottom margin + Button internal padding | `pad:[14,12]` → `py-3.5 px-3` |
| Token encoding | Mix: Button ghost variant + raw `text-[color:var(--color-muted-foreground)]` verbose form (recs P1-5 violation) | `text-muted-foreground` short-form |
| hover | Button ghost handles it; Link consumer: `hover:text-[color:var(--color-foreground)]` | `hover:text-foreground` (short-form) |
| Roster console label font | Not yet built | `JetBrains Mono/13px/500/$muted-foreground` (terminal board `37-s17-…txt` line 10) |
| `camp-management` label | "Captains" → `/` (live) | "Camp tools" → `/captains/tools` (spec, `14-roster.md §1`) |

The live code is classified **divergent inline stub** across all six consumers. All six are removed and replaced when `GhostBack` ships.

---

## API — props, variants, sizes, states

### Props

```ts
interface GhostBackProps {
  /**
   * Back-link label text rendered after the chevron icon.
   * Examples: "Tools", "My forms", "Camp tools", "Captains".
   */
  label: string;

  /**
   * Destination href for the back navigation.
   * Rendered as a Next.js <Link> for RSC compatibility.
   */
  href: string;

  /**
   * Visual skin variant.
   * - "default"  — Inter 15px/500, $muted-foreground (used on all non-terminal surfaces).
   * - "console"  — JetBrains Mono 13px/500, $muted-foreground (roster terminal console,
   *                matching the terminal board's data-console face per decision #2).
   */
  variant?: "default" | "console";

  /** Optional className forwarded to the root wrapper for layout overrides. */
  className?: string;
}
```

### Variants

| Variant | Description | Board authority |
|---|---|---|
| `default` | Inter 15px/500 `$muted-foreground` label. Used by invite-tool, my-forms (both pages), family-tree, captain-tools, announcements. | `11-invite-tool.md §1`, `12-my-forms.md §1`, `16-captain-tools.md §1`, `15-announcements.md §1` |
| `console` | JetBrains Mono 13px/500 `$muted-foreground` label. Roster terminal console only. | Board `37-s17-roster-iteration-b-terminal-console.txt` line 10: `T "Camp tools" [JetBrains Mono/13px/500/$muted-foreground]` |

### Sizes

Single size — no `size` prop. The chevron icon is always `h-5 w-5` (20×20). Padding and gap are fixed at `py-3.5 px-3` / `gap-1` (board `pad:[14,12] gap:4`).

### States

| State | Description |
|---|---|
| `default` | Chevron + label at `text-muted-foreground` |
| `hover` | Label (and icon) transitions to `text-foreground` (`hover:text-foreground`) |
| `focus-visible` | Link receives `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` |

No disabled state — a back link is never disabled. No loading state.

---

## Tokens & type — design tokens and type-scale roles

All from `design/spec/design-tokens.md` and `design/spec/component-library.md`. **No raw hex, no inline px, no `dark:` utilities.**

| Element | Token(s) | Type role |
|---|---|---|
| Root wrapper layout | `inline-flex items-center gap-1 py-3.5 px-3` | — (board `pad:[14,12] gap:4`) |
| Chevron icon colour (default) | `text-muted-foreground` | — |
| Chevron icon colour (hover) | `text-foreground` (via `hover:text-foreground` on wrapper) | — |
| Chevron icon size | `h-5 w-5` | — |
| Label colour (default) | `text-muted-foreground` | `--text-body-strong` step (Inter 15px/500) |
| Label font size — `default` variant | `text-[15px] font-medium` | `--text-body-strong` (15px is the allowed long-form exception per `design-tokens.md §1.2` — body floor is 14px; surface briefs explicitly draw 15px for this affordance) |
| Label font size — `console` variant | `font-mono text-[13px] font-medium` | `--text-mono` (JetBrains Mono 13px/500; `design-tokens.md §1.1`) |
| Label colour (hover) | `text-foreground` (inherited from wrapper `group-hover`) | — |
| Focus ring | `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none` | — |

**Typography note:** Surface briefs (`11-invite-tool.md §1`, `12-my-forms.md §1`, `16-captain-tools.md §1`) all describe the label as "Inter 15px/500 $muted-foreground". The global body floor is 14px; 15px is explicitly allowed for this lightweight ghost affordance because the surface briefs draw it — treat as a peer exception alongside the 15px long-read body copy rule.

**Console variant note:** The roster terminal board (`37-s17-…txt` line 10) draws the back label in JetBrains Mono 13px/500, matching the data-console motif (decision #2). This is the only surface that uses `variant="console"`. `font-mono` resolves to `--font-mono` (JetBrains Mono) once `design-tokens.md §1.3` font wiring lands.

---

## Composition & deps — atoms/primitives and helpers

| Dependency | Source | Role |
|---|---|---|
| `cn` utility | `@camp404/ui/lib/utils` | Class merging for `variant` + `className` prop overrides |
| `ChevronLeft` | `lucide-react` | Back arrow icon; `aria-hidden` |
| `Link` | `next/link` | Navigation anchor (RSC-safe; replaces the `<a>` + `Button asChild` mix in live code) |

No other `@camp404/ui` atoms. `GhostBack` does **not** compose the `Button` atom — the live code's `Button asChild variant="ghost"` is the source of the divergent internal padding and `text-sm` 14px size. A direct `Link` with explicit Tailwind utilities is smaller and more exact against the boards.

`@camp404/core` — no helpers required. `GhostBack` is pure presentation with zero domain logic.

**Why not wrap `Button`?**
The `Button` atom's `ghost` variant applies `text-sm` (14px) via its default size classes and its `hover:bg-accent hover:text-accent-foreground` hover style — neither matches the spec's 15px Inter + `hover:text-foreground` treatment. Overriding these inside `asChild` creates fragile coupling. A standalone `Link` with explicit utilities is smaller, clearer, and spec-exact.

---

## Absorbs — candidates replaced

The `component-library.md` merge map lists no multi-candidate collapse for `GhostBack` — it is a direct PROMOTE with no named inventory alias. It absorbs the **six inline back affordances** listed in the Current State table above:

1. `apps/web/app/tools/invite/page.tsx` lines 24–28 — `Button asChild` ghost link "Tools".
2. `apps/web/app/tools/forms/page.tsx` lines 45–51 — raw `Link` "Tools".
3. `apps/web/app/tools/forms/[key]/page.tsx` lines 58–64 — raw `Link` "My forms".
4. `apps/web/app/family-tree/page.tsx` lines 27–29 — `Button asChild` ghost link "Tools".
5. `apps/web/app/captains/tools/page.tsx` lines 57–60 — `Button asChild` ghost link "Captains".
6. `apps/web/app/captains/announcements/page.tsx` lines 36–39 — `Button asChild` ghost link "Camp tools".
7. `apps/web/app/captains/camp-management/page.tsx` lines 37–39 — `Button asChild` ghost link (label and href also need correction per spec).

`DetailHeader` (sibling molecule) is **not** absorbed and not the same component. `DetailHeader` is a 40×40 round-pill back button with an inline page title — a heavier chrome treatment for notifications and the tools hub. `GhostBack` is a lightweight inline ghost link with no pill and no title. They are kept distinct.

---

## Stories & tests

### Storybook stories

File: `packages/ui/src/components/ghost-back.stories.tsx`

| Story | Props | Purpose |
|---|---|---|
| `Default` | `label="Tools"`, `href="/tools"` | Canonical default variant — matches invite-tool board |
| `MyForms` | `label="My forms"`, `href="/tools/forms"` | Second-level back (form replay) |
| `CampTools` | `label="Camp tools"`, `href="/captains/tools"` | Captain-surface back |
| `Captains` | `label="Captains"`, `href="/"` | Captain hub back |
| `ConsoleVariant` | `label="Camp tools"`, `href="/captains/tools"`, `variant="console"` | Roster terminal skin — JetBrains Mono label |
| `FocusVisible` | `label="Tools"`, `href="/tools"` | Keyboard focus ring (use `play` fn to `.focus()` the link) |

### Vitest / RTL test cases

File: `packages/ui/src/components/__tests__/ghost-back.test.tsx`

| Test | Description |
|---|---|
| Renders label text | `label` string is visible in the DOM |
| Renders chevron icon | `ChevronLeft` is present and `aria-hidden` |
| Href is correct | The rendered `<a>` has `href` matching the `href` prop |
| Default variant: Inter face | Root element does NOT carry `font-mono` class |
| Console variant: mono face | Root element carries `font-mono` class when `variant="console"` |
| className override | Additional `className` is forwarded to the root wrapper |
| Link is the interactive element | The anchor (not a `<button>`) carries the back navigation |

### Accessibility notes

- The `<Link>` element (rendered as `<a>`) is the interactive control. Its text content — the `label` prop — is the accessible name. No separate `aria-label` needed when the label text is descriptive ("Tools", "My forms").
- `ChevronLeft` icon: add `aria-hidden={true}` so screen readers do not announce the raw SVG alongside the label text.
- Focus ring: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none` — only appears on keyboard navigation (`:focus-visible`), not on mouse click.
- No `role` override needed — a plain `<a>` is already `role="link"`.
- Reduced-motion: no animation or `transition-*` utilities on this component. The colour transition on hover (if a `transition-colors` utility is added for polish) should be guarded with `motion-safe:transition-colors` to respect `prefers-reduced-motion`.
- Colour contrast: `text-muted-foreground` (`oklch(0.70 0.05 325)`) on `bg-background` (`oklch(0.15 0.05 295)`) — passes WCAG AA (non-interactive meta text; interactive state shifts to `text-foreground` `oklch(0.97 0.02 330)` which is high-contrast).

---

## Build steps — ordered with acceptance criteria

**Prerequisite:** `--radius`, `text-muted-foreground`, `text-foreground`, `ring-ring`, and `font-mono` are confirmed present in `packages/ui/src/styles/globals.css`. The `font-mono` Tailwind utility resolves to `--font-mono` once `design-tokens.md §1.3` font-wiring lands; until then `font-mono` falls back to `ui-monospace` which is close enough for dev. Verify before step 1.

1. **Create `packages/ui/src/components/ghost-back.tsx`**
   - Implement the component per the API above.
   - Root element: `<Link href={href} className={cn("inline-flex items-center gap-1 py-3.5 px-3 text-muted-foreground hover:text-foreground", variant === "console" ? "font-mono text-[13px] font-medium" : "text-[15px] font-medium", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>`.
   - `<ChevronLeft className="h-5 w-5" aria-hidden />` (icon before label).
   - `<span>{label}</span>` (label text).
   - No `dark:` utilities; no raw hex; no `text-[color:var(--color-*)]` verbose form.
   - **Acceptance:** component renders; TypeScript compiles with no errors; no `dark:` utilities; no raw hex; `pnpm --filter @camp404/ui typecheck` green.

2. **Export from `packages/ui/src/index.ts`** (or the package barrel)
   - Add `export { GhostBack } from "./components/ghost-back"` and `export type { GhostBackProps }`.
   - **Acceptance:** `import { GhostBack } from "@camp404/ui"` resolves in `apps/web` without error.

3. **Write Storybook stories** (`ghost-back.stories.tsx`)
   - Cover all 6 stories listed above.
   - **Acceptance:** all stories render in Storybook; `Default` story matches board proportions (gap, padding, 15px Inter, muted colour); `ConsoleVariant` renders JetBrains Mono.

4. **Write Vitest / RTL tests** (`__tests__/ghost-back.test.tsx`)
   - Cover all test cases listed above.
   - **Acceptance:** `pnpm --filter @camp404/ui test` green; no snapshot drift.

5. **Replace inline back affordance in `apps/web/app/tools/invite/page.tsx`**
   - Remove lines 24–28 (`Button asChild` ghost wrapper + `ChevronLeft` import if no longer needed).
   - Import `GhostBack` from `@camp404/ui`.
   - Render `<GhostBack label="Tools" href="/tools" className="mb-4" />`.
   - **Acceptance:** invite page renders ghost back "Tools"; clicking navigates to `/tools`; no `Button` ghost wrapper remains.

6. **Replace inline back affordance in `apps/web/app/tools/forms/page.tsx`**
   - Remove lines 45–51 (raw `Link` + verbose `text-[color:var(--color-muted-foreground)]` classes).
   - Render `<GhostBack label="Tools" href="/tools" className="mb-6" />`.
   - **Acceptance:** my-forms list page renders ghost back "Tools"; verbose token class removed.

7. **Replace inline back affordance in `apps/web/app/tools/forms/[key]/page.tsx`**
   - Remove lines 58–64 (same raw `Link` pattern).
   - Render `<GhostBack label="My forms" href="/tools/forms" className="mb-6" />`.
   - **Acceptance:** form-replay page renders ghost back "My forms".

8. **Replace inline back affordance in `apps/web/app/family-tree/page.tsx`**
   - Remove lines 27–29 (`Button asChild` ghost wrapper).
   - Render `<GhostBack label="Tools" href="/tools" className="mb-4" />`.
   - **Acceptance:** family-tree page renders ghost back "Tools".

9. **Replace inline back affordance in `apps/web/app/captains/tools/page.tsx`**
   - Remove lines 57–60.
   - Render `<GhostBack label="Captains" href="/" className="mb-4" />`.
   - **Acceptance:** captain-tools page renders ghost back "Captains"; back navigates to `/`.

10. **Replace inline back affordance in `apps/web/app/captains/announcements/page.tsx`**
    - Remove lines 36–39.
    - Render `<GhostBack label="Camp tools" href="/captains/tools" className="mb-4" />`.
    - **Acceptance:** announcements page renders ghost back "Camp tools"; back navigates to `/captains/tools`.

11. **Replace + correct inline back affordance in `apps/web/app/captains/camp-management/page.tsx`**
    - Remove lines 37–39 (live code has wrong label "Captains" → `/` ; spec says "Camp tools" → `/captains/tools`).
    - Render `<GhostBack label="Camp tools" href="/captains/tools" variant="console" className="mb-4" />`.
    - Apply `variant="console"` — this is the terminal-console surface; board `37-s17-…txt` line 10 draws the label in JetBrains Mono.
    - **Acceptance:** roster page renders "Camp tools" in JetBrains Mono; back navigates to `/captains/tools`; live label/href bug corrected.

12. **Clean up orphaned imports across all replaced consumers**
    - Remove unused `ChevronLeft` lucide import from each file where it was only used by the inline back affordance.
    - Remove unused `Button` import from files where it was only used for the ghost back wrapper (verify no other `Button` usages remain in each file before removing).
    - **Acceptance:** no unused-import TypeScript/lint warnings; `pnpm build` green on `apps/web`.

---

## Consumers — molecules/organisms/surfaces that use GhostBack

| Consumer | Surface file | `label` | `href` | `variant` |
|---|---|---|---|---|
| Invite tool | `apps/web/app/tools/invite/page.tsx` | "Tools" | `/tools` | `default` |
| My forms — list | `apps/web/app/tools/forms/page.tsx` | "Tools" | `/tools` | `default` |
| My forms — replay | `apps/web/app/tools/forms/[key]/page.tsx` | "My forms" | `/tools/forms` | `default` |
| Family tree | `apps/web/app/family-tree/page.tsx` | "Tools" | `/tools` | `default` |
| Captain tools | `apps/web/app/captains/tools/page.tsx` | "Captains" | `/` | `default` |
| Announcements | `apps/web/app/captains/announcements/page.tsx` | "Camp tools" | `/captains/tools` | `default` |
| Roster console | `apps/web/app/captains/camp-management/page.tsx` | "Camp tools" | `/captains/tools` | `console` |

`GhostBack` is surface-top-level chrome in all seven consumers. No organism or molecule composes it — it renders directly in the page `<main>`. The `InviteForm` organism (`invite-form.tsx`) and `AnnouncementsManager` organism (`announcements-manager.tsx`) do not render it — it lives in the surrounding page shell.

`DetailHeader` (sibling molecule) is not a consumer and not the same component; see Absorbs section.
