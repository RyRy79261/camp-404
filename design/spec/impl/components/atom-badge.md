# Badge — atom plan

- **mapsTo:** PROMOTE — hand-rolled inline `<span>` patterns scattered across `apps/web`
- **Target file:** `packages/ui/src/components/badge.tsx`

---

## Current state — does it exist? Where? Gap vs spec

There is **no `badge.tsx`** in `packages/ui/src/components/` today. The package exports
avatar, button, card, checkbox, combobox, command, dialog, input, label, popover, select,
slider, textarea — no badge primitive. Confirmed by directory listing.

Instead, every badge/pill in the app is a bespoke inline `<span>`. The live instances
found by audit:

| Location | Snippet | Maps to |
|---|---|---|
| `apps/web/app/profile/page.tsx:55` | `rounded-full bg-[color:var(--color-secondary)] px-3 py-0.5 text-xs font-semibold text-[color:var(--color-secondary-foreground)]` — RankPill (captain) | `tone="secondary" variant="solid"` |
| `apps/web/app/family-tree/family-tree.tsx:230` | `rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300` — Captain pill | `tone="accent" variant="soft-tint"` (amber→accent per §4 reconciliation #1) |
| `apps/web/app/family-tree/family-tree.tsx:235` | `rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary` — You pill | `tone="primary" variant="soft-tint"` |
| `apps/web/app/family-tree/family-tree.tsx:247` | `rounded-full bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground` — descendant-count pill | `tone="default" variant="soft-tint"` |
| `apps/web/app/notifications/page.tsx:78` | `rounded-full bg-[color:var(--color-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-primary-foreground)]` — "New" pill | `tone="primary" variant="solid"` |
| `apps/web/app/home-header.tsx:39` | `absolute ... rounded-full bg-[color:var(--color-primary)] px-1 text-[10px] font-semibold text-[color:var(--color-primary-foreground)]` — bell unread count | `tone="primary" variant="solid" size="xs"` |
| `apps/web/app/captains/announcements/announcements-manager.tsx:380` | `inline-flex ... rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground` — presentation pill | `tone="default" variant="outline"` |
| `apps/web/app/captains/camp-management/camp-management-roster.tsx:228,242` | `inline-flex rounded-full px-2 py-0.5 text-xs font-medium` + `STATUS_STYLE` map (`bg-emerald-500/15 text-emerald-400`, `bg-amber-500/15 text-amber-400`, `bg-sky-500/15 text-sky-400`, `bg-rose-500/15 text-rose-400`) | `tone="success/warning/info/destructive" variant="soft-tint"` |

Primitive-kit board (`33-s24-primitive-kit.txt`, lines 75–87) draws five canonical pill tones:
- `fill:$muted` text `$muted-foreground` → `tone="default"`
- `fill:#ff008c2e` text `$primary` → `tone="primary" variant="soft-tint"` (primary/18%)
- `fill:#00dcff26` text `$accent` → `tone="accent" variant="soft-tint"` (accent/15%)
- `fill:#75188840` text `$secondary-foreground` → `tone="secondary" variant="soft-tint"` (secondary/25%)
- `fill:#f83e5a1f` text `$destructive` → `tone="destructive" variant="soft-tint"` (destructive/12%)

The board draws only `soft-tint`; `solid` and `outline` variants are inferred from the
live `New` pill (primary solid) and the presentation pill (outline/border). All raw
hex fills must be replaced with token-at-alpha per `design-tokens.md §2.3`.

Gaps vs spec:
- No shared component: every callsite duplicates geometry + colour.
- Status pills (`ready/onboarding/awaiting_approval/rejected/pending`) in
  `camp-management-roster.tsx` use off-token `emerald/amber/sky/rose` raw classes —
  blocked pending NEW status tokens (`success`/`warning`/`info`) from
  `foundations-tokens.md`.
- Family-tree Captain pill uses `amber` — must migrate to `$accent` per
  `design-tokens.md §4 reconciliation #1`.
- `home-header.tsx` uses verbose `bg-[color:var(--color-primary)]` — P1-5 codemod target.
- `RequiredChip` (runner `BlockingTopBar`) and MOVING chip (customize mode) are board
  references not yet present in the current codebase; they will be NEW usages of Badge
  once the organism is built.

---

## API — props, variants, sizes, states

### TypeScript prop interface

```ts
import type { LucideIcon } from "lucide-react"

export type BadgeTone =
  | "default"       // muted fill, muted-foreground text — neutral/count pills
  | "primary"       // primary tint — New pill, bell count, RankPill (member), RequiredChip
  | "accent"        // accent tint — Captain identity (family-tree), info/heads-up
  | "secondary"     // secondary tint — captain-rank on profile (RankPill captain)
  | "success"       // success tint — Approved / Ready / saved (needs status tokens)
  | "warning"       // warning tint — Outstanding / Pending / Incomplete (needs status tokens)
  | "destructive"   // destructive tint — Error / Rejected / Blocked

export type BadgeVariant =
  | "solid"         // fully opaque fill — bell count, "New" pill
  | "soft-tint"     // transparent fill at canonical alpha — board's primary kit
  | "outline"       // border-only, no fill — presentation pill, meta chips

export type BadgeSize =
  | "xs"            // 10px / h-4 min-w-4 — bell unread count (constrained, absolute-positioned)
  | "sm"            // 11px / px-2 py-0.5 — standard status/role pills, default

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Colour tone. Controls fill + text colour pair. Default: "default". */
  tone?: BadgeTone
  /** Fill style. Default: "soft-tint". */
  variant?: BadgeVariant
  /** Size step. Default: "sm". */
  size?: BadgeSize
  /**
   * Optional leading icon (lucide-react LucideIcon).
   * Renders at 10×10 (xs) or 12×12 (sm), aria-hidden.
   * Used by RequiredChip (Lock icon) and presentation pills (Megaphone).
   */
  icon?: LucideIcon
  /** Icon preceding or trailing the label. Default: "leading". */
  iconPosition?: "leading" | "trailing"
}
```

### Variants × tones matrix (resolved tokens — no raw hex)

| tone | soft-tint fill | solid fill | outline | text |
|---|---|---|---|---|
| `default` | `bg-muted/60` | `bg-muted` | `border-border` | `text-muted-foreground` |
| `primary` | `bg-primary/18` | `bg-primary` | `border-primary` | `text-primary` / `text-primary-foreground` (solid) |
| `accent` | `bg-accent/15` | `bg-accent` | `border-accent` | `text-accent` / `text-accent-foreground` (solid) |
| `secondary` | `bg-secondary/25` | `bg-secondary` | `border-secondary` | `text-secondary-foreground` |
| `success` | `bg-success/15` | `bg-success` | `border-success` | `text-success` / `text-success-foreground` (solid) |
| `warning` | `bg-warning/15` | `bg-warning` | `border-warning` | `text-warning` / `text-warning-foreground` (solid) |
| `destructive` | `bg-destructive/12` | `bg-destructive` | `border-destructive` | `text-destructive` / `text-destructive-foreground` (solid) |

Note: `success` and `warning` tokens are NEW — defined in `design-tokens.md §2.2` and
added to `globals.css` by the foundations step. Badge ships only after that step lands.

### Size geometry

| size | padding | text | min-w | line-height | use-case |
|---|---|---|---|---|---|
| `xs` | `px-1` | `text-[10px] font-semibold` | `min-w-4 h-4` | `lh-1.2` | Bell unread count; absolute-positioned over icon |
| `sm` | `px-2 py-0.5` | `text-[11px] font-semibold` | — | `lh-1.2` | All status/role/info pills (default) |

Both sizes use `rounded-full` (`--radius-full: 9999px`). The `xs` variant uses
`flex items-center justify-center` for the centred numeral layout.

### States

Badge is presentational only — no interactive states. It has no hover, focus, or
active state. It must not receive keyboard focus unless the consumer intentionally wraps
it in a focusable element (e.g. a button). `aria-hidden` should be applied wherever the
badge is purely decorative and a screen-reader-accessible parent element already
conveys the information (e.g. the bell count where `aria-label` is on the `<Link>`).

---

## Tokens & type — exact design tokens + type-scale roles

### Colour tokens used

All from `packages/ui/src/styles/globals.css` `@theme` block (OKLCH):

- `--color-muted` / `--color-muted-foreground` — default tone
- `--color-primary` / `--color-primary-foreground` — primary tone
- `--color-accent` / `--color-accent-foreground` — accent tone
- `--color-secondary` / `--color-secondary-foreground` — secondary tone
- `--color-destructive` / `--color-destructive-foreground` — destructive tone
- `--color-success` / `--color-success-foreground` — **NEW** (foundations-tokens step)
- `--color-warning` / `--color-warning-foreground` — **NEW** (foundations-tokens step)
- `--color-border` — outline variant border

Alpha steps (Tailwind opacity modifiers, no raw hex):
- `/60` — default soft-tint (`muted/60`)
- `/25` — secondary soft-tint (`secondary/25`)
- `/18` — primary soft-tint (`primary/18`)
- `/15` — accent, success, warning soft-tint
- `/12` — destructive soft-tint

### Type-scale role

`--text-micro` (design-tokens.md §1.1):
- Inter, 10–11px, weight 600–700, lh 1.2
- 11px = standard pill (`sm` size)
- 10px = `xs` size ("New" pill, bell count)
- Never JetBrains Mono — pill text is Inter (confirmed by board: `Inter/11px/600`)

### Radius

`--radius-full` (`rounded-full`, 9999px) — both sizes. Confirmed by board `r:999` on
every pill node in `33-s24-primitive-kit.txt`.

---

## Composition & deps

```
badge.tsx
  ├── cva (class-variance-authority) — variant resolution, already a dep of @camp404/ui
  ├── cn (packages/ui/src/lib/utils.ts) — className merge, already used by all ui components
  └── LucideIcon (type import only, lucide-react peer dep) — optional icon slot
```

No Radix UI primitive required — Badge is a plain `<span>` with no interaction.
No `@camp404/core` helpers required — Badge has no domain logic.

cva pattern mirrors `button.tsx` exactly: `const badgeVariants = cva(base, { variants: { tone, variant, size }, defaultVariants })`.

---

## Absorbs

The following candidate names from `component-library.md` merge map are replaced by
`Badge`. No duplicate component ships for any of these:

| Absorbed candidate | Where it exists today | How Badge covers it |
|---|---|---|
| **RankPill** / `status-pill` | `apps/web/app/profile/page.tsx:55` inline span | `tone="secondary" variant="solid"` (captain) or `tone="primary" variant="soft-tint"` (member) |
| **captain-pill** | `apps/web/app/family-tree/family-tree.tsx:230` inline span | `tone="accent" variant="soft-tint"` (after amber→accent migration) |
| **you-pill** | `apps/web/app/family-tree/family-tree.tsx:235` inline span | `tone="primary" variant="soft-tint"` |
| **count-pill** | `apps/web/app/family-tree/family-tree.tsx:247` inline span; bell unread `home-header.tsx:39` | `tone="default"` (count) or `tone="primary" variant="solid" size="xs"` (bell) |
| **new-pill** | `apps/web/app/notifications/page.tsx:78` inline span | `tone="primary" variant="solid"` |
| **RequiredChip** | board-only (questionnaire runner `BlockingTopBar`), not yet built | `tone="destructive" variant="soft-tint" icon={Lock}` |
| **presentation-pill** | `apps/web/app/captains/announcements/announcements-manager.tsx:380` inline span | `tone="default" variant="outline" icon={Megaphone\|MessagesSquare}` |
| **MOVING chip** | board-only (customize mode), not yet built | `tone="accent" variant="soft-tint"` |
| **role-badge** | `camp-management-roster.tsx:228,242` STATUS_STYLE span | `tone="success/warning/info/destructive" variant="soft-tint"` |
| **team-badge** | not yet built (referenced in `MemberProfile`) | `tone="accent" variant="soft-tint"` |
| **S24 badges/pills** | board `33-s24-primitive-kit.txt` five-pill row | all five tones covered |

---

## Stories & tests

### Storybook stories (`badge.stories.tsx`)

```
Story: AllTones — renders one sm soft-tint Badge for each of the 7 tones side-by-side
Story: AllVariants — soft-tint / solid / outline for primary tone
Story: Sizes — xs (with numeral "5") + sm side-by-side
Story: WithIcon — sm + leading Lock icon (RequiredChip simulation)
Story: WithTrailingIcon — sm + trailing Megaphone (presentation pill)
Story: Capped — xs "99+" (bell count cap case)
Story: StatusPills — all tone/soft-tint combos labelled: Default, Primary, Accent,
       Secondary, Success, Warning, Destructive (maps directly to S24 board row)
Story: Composition/BellCount — Badge absolutely positioned over a Bell icon, matching
       the home-header pattern (visual regression target)
```

### Vitest / RTL test cases (`badge.test.tsx`)

```
renders children text
applies tone class — each of 7 tones produces correct bg/text utility
applies variant — solid / soft-tint / outline produce distinct className sets
applies size — xs yields h-4 min-w-4; sm yields standard padding
icon renders — LucideIcon is present in DOM, aria-hidden=true
icon absent — no icon element in DOM when icon prop omitted
custom className merges via cn (does not override required classes)
snapshot — soft-tint primary sm (canonical bell-count variant)
snapshot — solid primary xs (canonical New-pill variant)
```

### Accessibility notes

- Badge is `<span>` — non-interactive. Never receives `role="button"`.
- Where a badge is purely additive (bell unread count, "New" pill beside a title that
  is already labelled), the parent element's `aria-label` conveys the count; the badge
  itself should carry `aria-hidden="true"`.
- Where the badge IS the only accessible label for a piece of status (e.g. a stand-alone
  status cell in a table without other context), the consumer must provide
  `aria-label` or wrap in a `<td>` with a `title`.
- Icon within badge: always `aria-hidden` — the icon is decorative; label comes from
  `children`.
- Contrast: all tone/variant pairs must pass WCAG AA (4.5:1 for 11px/600) against the
  `--color-background` base. Validate during the status-token tuning step
  (`design-tokens.md §5 open item` — success/warning OKLCH values need contrast
  confirmation before shipping).

---

## Build steps

Steps are ordered; each acceptance criterion must pass before the next begins.

### Step 0 — Prerequisite: foundations-tokens land (not this ticket)

`design/spec/impl/foundations-tokens.md` must add `--color-success`,
`--color-success-foreground`, `--color-warning`, `--color-warning-foreground` to
`packages/ui/src/styles/globals.css` `@theme`. Badge's `success` and `warning` tones
are not usable without these tokens.

**Acceptance:** `globals.css` exports the four new OKLCH tokens and the Tailwind build
resolves `bg-success`, `text-success`, `bg-warning`, `text-warning` without error.

### Step 1 — Build `packages/ui/src/components/badge.tsx`

Create the file. Pattern:
1. Define `badgeVariants` via `cva` with:
   - base: `inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold leading-none`
   - variants: `tone` (7 values) × `variant` (3 values) × `size` (2 values)
   - defaultVariants: `{ tone: "default", variant: "soft-tint", size: "sm" }`
2. Export `BadgeProps` interface (see API section above).
3. Implement `Badge` as a `React.forwardRef<HTMLSpanElement, BadgeProps>` function
   component (no Radix, plain span).
4. Icon slot: when `icon` prop is present, render `<Icon className="shrink-0 aria-hidden" />` sized `w-2.5 h-2.5` (xs) or `w-3 h-3` (sm) at leading/trailing position with `aria-hidden={true}`.
5. Export `{ Badge, badgeVariants }`.

**Acceptance:**
- File compiles with zero TypeScript errors (`tsc --noEmit`).
- All 7 tones render distinct className sets in RTL test.
- No raw hex colours, no `emerald/amber/sky/rose` utilities, no `bg-[color:var(--)]`
  verbose forms — only short Tailwind token utilities.

### Step 2 — Write stories and tests

Add `badge.stories.tsx` and `badge.test.tsx` to `packages/ui/src/components/`.

**Acceptance:**
- All Storybook stories render without console errors in the dark theme.
- All vitest tests pass (`pnpm test --filter @camp404/ui`).
- Storybook visual snapshot for `AllTones` matches the S24 board's five-pill row.

### Step 3 — Migrate `apps/web` callsites

Replace every bespoke inline `<span>` identified in Current State with `<Badge>`.
Migration map:

| File | Line | Replace with |
|---|---|---|
| `apps/web/app/profile/page.tsx` | 55 | `<Badge tone="secondary" variant="solid">{rankLabel}</Badge>` |
| `apps/web/app/family-tree/family-tree.tsx` | 230 | `<Badge tone="accent" variant="soft-tint">Captain</Badge>` |
| `apps/web/app/family-tree/family-tree.tsx` | 235 | `<Badge tone="primary" variant="soft-tint">You</Badge>` |
| `apps/web/app/family-tree/family-tree.tsx` | 247 | `<Badge tone="default">{countDescendants(node)}</Badge>` |
| `apps/web/app/notifications/page.tsx` | 78 | `<Badge tone="primary" variant="solid">New</Badge>` |
| `apps/web/app/home-header.tsx` | 39 | `<Badge tone="primary" variant="solid" size="xs" aria-hidden>{capped}</Badge>` |
| `apps/web/app/captains/announcements/announcements-manager.tsx` | 380 | `<Badge tone="default" variant="outline" icon={meta.icon}>{meta.label}</Badge>` |
| `apps/web/app/captains/camp-management/camp-management-roster.tsx` | 228,242 | `<Badge tone={STATUS_TONE[r.status]} variant="soft-tint">{r.statusLabel}</Badge>` |

Also remove the `STATUS_STYLE` record in `camp-management-roster.tsx` — it becomes dead
code once Badge absorbs the per-tone colour logic.

**Acceptance:**
- `pnpm build` clean (no type errors, no Tailwind warnings).
- Visual regression: every migrated surface renders identically to its pre-migration
  screenshot (run `verify` skill or manual spot-check).
- `grep -r "bg-amber-500\|bg-emerald-500\|bg-sky-500\|bg-rose-500" apps/web` returns
  zero results for the migrated files.

### Step 4 — Export from `@camp404/ui`

Add `badge` to `packages/ui/src/index.ts` (or the package's barrel export).

**Acceptance:**
- `import { Badge } from "@camp404/ui/components/badge"` resolves in `apps/web`
  without path aliasing.
- `pnpm typecheck` passes across the monorepo.

---

## Consumers

The following molecules, organisms, and surfaces depend on Badge once built. These are
blocked on Badge shipping before their own build steps can complete.

### Molecules / organisms that directly compose Badge

| Consumer | Usage | Tone / variant |
|---|---|---|
| `TopChrome` (PROMOTE) | Bell unread count overlay | `tone="primary" variant="solid" size="xs"` |
| `GridTile` (PROMOTE) | Optional count badge on tool tile | `tone="default"` |
| `BlockingTopBar` (NEW, app-local) | RequiredChip in runner header | `tone="destructive" variant="soft-tint" icon={Lock}` |
| `NotificationRow` (NEW, app-local) | "New" pill beside notification title | `tone="primary" variant="solid"` |
| `AnnouncementsManager` (keep app-local) | Presentation pill (acknowledge/popup/feed) | `tone="default" variant="outline" icon={...}` |
| `RosterRow` (NEW, app-local) | Status/role badge per row | `tone="success/warning/info/destructive" variant="soft-tint"` |
| `MemberProfile` (NEW, app-local) | TeamBadges + status/rank | `tone="accent" / "secondary" variant="soft-tint"` |
| `QueueCard` (NEW, app-local) | Queue status (complete/next-up/locked/expired) | `tone` per status |
| `FamilyTree` (keep app-local) | Captain + You + descendant-count pills in `TreeRow` | accent/primary/default |
| `CustomizeMode` (NEW, app-local) — `DraggableTileRow` | MOVING chip during drag | `tone="accent" variant="soft-tint"` |
| `FilterChip` (NEW, app-local) | Count sub-badge inside filter chip | `tone="accent"` |

### Surfaces that render Badge through the above consumers

home (bell count via TopChrome, count via GridTile), notifications (New pill),
family-tree (Captain/You/count), profile-view (RankPill), roster (role/status badges),
captain announcements (presentation pill), questionnaire runner (RequiredChip via
BlockingTopBar), home customize mode (MOVING chip), completion-queue (queue status).
