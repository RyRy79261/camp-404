# IconBadge — atom plan

- **mapsTo:** PROMOTE `apps/web` (multiple inline hand-rolls) · Target file: `packages/ui/src/components/icon-badge.tsx`

---

## Current state — does it exist? where? gap vs spec

No `icon-badge.tsx` exists in `packages/ui/src/components/` (confirmed by directory listing — 25 files, none named `icon-badge`).

The pattern is hand-rolled in at least four places across `apps/web`, each with a different size, shape, and off-token tint:

| File | Shape drawn | Size | Tint (board / live code) | Gap vs spec |
|---|---|---|---|---|
| `apps/web/app/pending-approval/page.tsx` L54–55 | `rounded-full` flex div | `h-14 w-14` (56 px) | `bg-destructive/10` or `bg-amber-500/15` | Off-token: `amber-500/15` must become `warning/15%`; size is the spec `md` band (44–48 px) overshooting to 56 — normalise to `lg` (60 px) or snap to `md`. Board S06 draws 64 px → `lg`. |
| `apps/web/app/tools/page.tsx` L76 | `rounded-md` flex span | `h-10 w-10` (40 px) | `bg-muted/40` | Shape `rounded-md` with no tint = muted `rounded` variant; matches spec `sm` (34 px) overshoot → snap to `sm`. |
| `apps/web/app/captains/tools/page.tsx` L78 | `rounded-md` flex span | `h-10 w-10` (40 px) | `bg-muted/40 border` | Same as above; adds a border the spec does not prescribe for `muted`. |
| `apps/web/app/notifications/page.tsx` L71–73 | bare `text-muted-foreground` span (no background) | no circle | — | Degenerate case: no icon container — icon is inline. Does not satisfy the spec circle; the NotificationRow redesign will replace with `IconBadge`. |

Board-confirmed instances that will become `IconBadge` once built:

| Board / surface | Element drawn | Size | Tint |
|---|---|---|---|
| `09-captainlock.txt` — `LockCircle` | 48×48 `r:999` | `md` | `#ff008c2e` → `primary/18%` |
| `08-emptystate.txt` — `EsCircle` | 64×64 `r:999` | `lg` | `$muted` |
| `03-gridtile.txt` — `IconBox` | 46×46 `r:12` | `md` | `#ff008c2e` → `primary/18%` |
| `15-s06-approval-gate.txt` — pending `Badge` | 64×64 `r:999` | `lg` | `#00dcff26` → `accent/15%` |
| `15-s06-approval-gate.txt` — rejected `Badge` | 64×64 `r:999` | `lg` | `#f83e5a1f` → `destructive/12%` |
| `34-s25-questionnaire-gate.txt` — `ic` | 60×60 `r:999` | `lg` | `#ff008c2e` → `primary/18%` |
| `31-s22-global-overlays.txt` — AckTakeover `ic` | 60×60 `r:999` | `lg` | `#ff008c2e` → `primary/18%` |
| `31-s22-global-overlays.txt` — QuestionnaireBlock `ic` | 56×56 `r:999` | `lg` (snap 56→60) | `#ff008c2e` → `primary/18%` |
| `31-s22-global-overlays.txt` — ShakeReporter `ic` | 40×40 `r:999` | `sm` (snap 40→34 or use md) | `#00dcff26` → `accent/15%` |
| `31-s22-global-overlays.txt` — ErrorBoundary `ic` | 56×56 `r:999` | `lg` (snap 56→60) | `#f83e5a1f` → `destructive/12%` |
| `36-s27-questionnaire-complete-queue.txt` — `Check Circle` | 88×88 `r:44` | `lg` | `#00dcff24` → `accent/15%` |
| `29-s20-mcp-connect.txt` — Identity Row `Avatar` | 32×32 `r:16` | `sm` | `#ff008c2e` → `primary/18%` |
| `29-s20-mcp-connect.txt` — `Scope Icon Wrap` | 34×34 `r:8` | `sm` | `#00dcff26` → `accent/15%` |

**Size normalisation from boards** (stray px → canonical step):
- 32 px → `sm` (34 px)
- 34 px → `sm`
- 40 px → `sm` (rounded up) or dedicated `md` low end; snap to `sm`
- 44–48 px → `md`
- 46 px → `md`
- 56 px → `lg` (60 px)
- 60 px → `lg`
- 64 px → `lg`
- 88 px → `lg` (boards use it once for completion-hero; keep `lg` as the ceiling; completion-hero passes `size="lg"`)

**Shape:** boards draw both `r:999` (circle) and `r:8/r:12` (rounded square). These map to the `shape` prop — `circle` or `rounded`.

---

## API — props, variants, sizes, states

```ts
import type { LucideIcon } from "lucide-react";

export type IconBadgeTone =
  | "primary"
  | "accent"
  | "secondary"
  | "success"
  | "warning"
  | "destructive"
  | "muted";

export type IconBadgeSize = "sm" | "md" | "lg";
export type IconBadgeShape = "circle" | "rounded";

export interface IconBadgeProps {
  /** A Lucide icon component (e.g. Lock, Megaphone). Rendered at ~40–55% of container size. */
  icon: LucideIcon;
  /** Semantic colour tone. Maps to token-at-alpha fill + matching foreground text/icon colour. */
  tone?: IconBadgeTone; // default: "primary"
  /** Container size. sm ≈ 34 px · md ≈ 44–46 px · lg ≈ 60–64 px */
  size?: IconBadgeSize; // default: "md"
  /** Border-radius shape. circle = rounded-full · rounded = rounded-lg (r:8–12 equivalent) */
  shape?: IconBadgeShape; // default: "circle"
  /** Accessible label for the icon. Defaults to aria-hidden if omitted. */
  "aria-label"?: string;
  className?: string;
}
```

### Variants (tone × tint fill × icon colour)

| tone | fill | icon colour | Board source |
|---|---|---|---|
| `primary` | `bg-primary/18` | `text-primary` | GridTile IconBox, CaptainLock lock-circle, questionnaire-gate ic, AckTakeover ic, MCP avatar |
| `accent` | `bg-accent/15` | `text-accent` | EmptyLog muted circle (info tint), S06 pending clock, ShakeReporter bug ic, MCP scope wrap, completion-hero check |
| `secondary` | `bg-secondary/25` | `text-secondary-foreground` | (Captain-rank pills; here for GroupHead icon on captain rank-group) |
| `success` | `bg-success/15` | `text-success` | Approval-gate approved state (future; not drawn yet — token placeholder) |
| `warning` | `bg-warning/15` | `text-warning` | S06 pending clock in live code (`amber-500/15`) → normalise once warning token lands |
| `destructive` | `bg-destructive/12` | `text-destructive` | S06 rejected shield-x, ErrorBoundary triangle-alert |
| `muted` | `bg-muted` | `text-muted-foreground` | EmptyState EsCircle, MCP 403 gate lock-wrap |

### Sizes

| size | Tailwind classes | px | Icon inside |
|---|---|---|---|
| `sm` | `size-[34px]` | 34 | `size-4` (16 px) |
| `md` | `size-[46px]` | 46 | `size-5` (20 px) |
| `lg` | `size-[60px]` | 60 | `size-7` (28 px) |

> The board draws 64 px and 88 px circles for large states. 60 px is the canonical `lg` step (snaps 56/60/64 → lg). CompletionHero uses `size="lg"` and the difference is imperceptible on mobile. Do not introduce a fourth size step.

### Shape

| shape | radius class |
|---|---|
| `circle` | `rounded-full` |
| `rounded` | `rounded-lg` (≈ `--radius` 10 px, maps board `r:8–12`) |

### States

- **static** — default presentational state (pure display, no interaction).
- **spinner-overlay** — host-driven: the host wraps `IconBadge` with a `Spinner` overlay (e.g. `AvatarUpload` uploading state); `IconBadge` itself carries no loading state.

---

## Tokens & type — exact design tokens + type-scale roles

`IconBadge` is a container only; it carries no text. Tokens used:

| Purpose | Token | Notes |
|---|---|---|
| Primary tint fill | `bg-primary/18` | `#ff008c2e` → `primary/18%` (design-tokens.md §4 reconciliation #4) |
| Primary icon | `text-primary` | — |
| Accent tint fill | `bg-accent/15` | `#00dcff26` → `accent/15%` (reconciliation #7) |
| Accent icon | `text-accent` | — |
| Secondary tint fill | `bg-secondary/25` | `#75188840` → `secondary/25%` (reconciliation #3) |
| Secondary icon | `text-secondary-foreground` | — |
| Success tint fill | `bg-success/15` | NEW status token — must land before `success` tone ships (design-tokens.md §2.2) |
| Success icon | `text-success` | — |
| Warning tint fill | `bg-warning/15` | NEW status token — live code currently `amber-500/15` (reconciliation of pending-approval page) |
| Warning icon | `text-warning` | — |
| Destructive tint fill | `bg-destructive/12` | `#f83e5a1f` / `#f83e5a1a` → snap to `destructive/12%` (reconciliation #12) |
| Destructive icon | `text-destructive` | — |
| Muted fill | `bg-muted` | `$muted` — EmptyState EsCircle, MCP 403 lock wrap |
| Muted icon | `text-muted-foreground` | — |
| Shape — circle | `rounded-full` | `r:999` (radius §3, `--radius-full`) |
| Shape — rounded | `rounded-lg` | `r:8–12` → snaps to `--radius` (md, 10 px) via `rounded-lg` |
| Focus ring (if ever interactive) | `ring-ring` | Not interactive by default; ring only if wrapped in focusable host |

No text/type tokens used inside `IconBadge` itself. Icon sizing is structural (`size-4/5/7`), not a type-scale role.

**Prerequisite:** `--color-success`, `--color-success-foreground`, `--color-warning`, `--color-warning-foreground` must be added to `packages/ui/src/styles/globals.css` `@theme` before the `success` and `warning` tones ship. These are defined in design-tokens.md §2.2 (P0-2). This is a hard dependency — gate the `success`/`warning` tone variants on that token PR.

---

## Composition & deps — atoms/primitives + helpers

- **`cn`** from `packages/ui/src/lib/utils` — class merging (same pattern as `button.tsx`).
- **`cva` + `VariantProps`** from `class-variance-authority` — tone × size × shape variant matrix.
- **`LucideIcon`** type from `lucide-react` — icon prop typing. The rendered icon element is passed as a component, not a string, following the existing `button.tsx` / `card.tsx` pattern.
- **No Radix primitive** — `IconBadge` is a plain `<span>` (or `<div>`); no interactive semantics.
- **No `@camp404/core` helpers** — pure presentational; no domain logic.

The component is a `forwardRef<HTMLSpanElement, IconBadgeProps>` to allow host consumers to attach refs for positioning overlays (e.g. `TopChrome` bell badge positioning).

---

## Absorbs — candidates replaced (from the merge map)

From the merge map entry in `component-library.md`:

| Absorbed candidate | Where it lives today | Disposition |
|---|---|---|
| **IconChip** | NavCard context — inline `h-10 w-10 rounded-md bg-muted/40` in `apps/web/app/tools/page.tsx` and `captains/tools/page.tsx` | DELETE inline span; NavCard molecule uses `<IconBadge size="sm" shape="rounded" tone="muted">` |
| **IconBox** | GridTile component — inline `w:46 h:46 r:12 fill:#ff008c2e` (board `03-gridtile.txt`) | DELETE inline div; GridTile molecule uses `<IconBadge size="md" shape="rounded" tone="primary">` |
| **CaptainLock lock-circle** | `09-captainlock.txt` — `LockCircle w:48 h:48 r:999 fill:#ff008c2e` | CaptainLock molecule uses `<IconBadge size="md" shape="circle" tone="primary" icon={Lock}>` |
| **EmptyState circle** | `08-emptystate.txt` — `EsCircle w:64 h:64 r:999 fill:$muted` | EmptyState molecule uses `<IconBadge size="lg" shape="circle" tone="muted">` |
| **completion-hero circle** | `36-s27-questionnaire-complete-queue.txt` — `Check Circle w:88 h:88` | CompletionHero molecule uses `<IconBadge size="lg" shape="circle" tone="accent" icon={Check}>` |
| **notification icon-circle** | `31-s22-global-overlays.txt` — multiple `ic` wrappers | AckTakeover, QuestionnaireBlock, ErrorBoundary, ShakeReporter all use `<IconBadge>` |
| **S06 status circle** | `15-s06-approval-gate.txt` — two `Badge` divs (64×64) | `apps/web/app/pending-approval/page.tsx` L54–63 inline div → replaced by `<IconBadge size="lg" shape="circle" tone="destructive&#124;warning">` |
| **MCP scope icon wrap** | `29-s20-mcp-connect.txt` — `Scope Icon Wrap w:34 h:34 r:8 fill:#00dcff26` | MCPConsent uses `<IconBadge size="sm" shape="rounded" tone="accent" icon={Shield}>` |
| **MCP user avatar circle** | `29-s20-mcp-connect.txt` — `Avatar w:32 h:32 r:16 fill:#ff008c2e` | MCPConsent uses `<IconBadge size="sm" shape="circle" tone="primary" icon={User}>` |

No other component in `packages/ui/src/components/` overlaps with this shape — the existing `avatar.tsx` is a distinct image/initials pattern with a different contract.

---

## Stories & tests — Storybook stories + test cases

### Storybook stories (`packages/ui/src/components/icon-badge.stories.tsx`)

```text
AllTones         — renders one IconBadge per tone (7 tones), size="md", shape="circle", icon=Lock
AllSizes         — renders sm/md/lg for tone="primary", shape="circle"
AllShapes        — renders shape="circle" and shape="rounded" side by side, tone="accent"
GridTileUse      — size="md" shape="rounded" tone="primary" icon=Users (mirrors board 03)
CaptainLockUse   — size="md" shape="circle" tone="primary" icon=Lock (mirrors board 09)
EmptyStateUse    — size="lg" shape="circle" tone="muted" icon=Inbox (mirrors board 08)
ApprovalPending  — size="lg" shape="circle" tone="warning" icon=Clock (mirrors S06 pending)
ApprovalRejected — size="lg" shape="circle" tone="destructive" icon=ShieldX (mirrors S06 rejected)
CompletionCheck  — size="lg" shape="circle" tone="accent" icon=Check (mirrors S27)
```

### Vitest / RTL test cases (`packages/ui/src/components/__tests__/icon-badge.test.tsx`)

1. **Renders without crash** — mounts `<IconBadge icon={Lock} />`, expects a DOM element.
2. **Default tone is `primary`** — rendered element has the `bg-primary/18` class.
3. **Default size is `md`** — element has `size-[46px]`.
4. **Default shape is `circle`** — element has `rounded-full`.
5. **tone="muted" applies `bg-muted`** — class present, not `bg-muted/18`.
6. **shape="rounded" applies `rounded-lg`** — not `rounded-full`.
7. **size="sm" applies `size-[34px]`, icon is `size-4`**.
8. **size="lg" applies `size-[60px]`, icon is `size-7`**.
9. **aria-label provided** — element has `aria-label` attribute; icon has `aria-hidden="true"`.
10. **aria-label omitted** — the inner icon element has `aria-hidden="true"`; container has no `aria-label`.
11. **className merges correctly** — extra `className="mt-2"` appears in rendered classes.
12. **All 7 tones render** — smoke test that no tone throws.

### a11y notes

- Icon is purely decorative in all current uses — the label lives in the surrounding molecule (CaptainLock title, EmptyState heading, NavCard title). The icon itself gets `aria-hidden="true"` unconditionally.
- The container is a non-interactive `<span>` with `role` unset (implicit `presentation`). No `tabIndex`.
- When the consumer needs the circle to carry the only accessible name (e.g. a standalone notification icon with no adjacent label), they pass `aria-label` to `IconBadge`; the component threads it to the container element and keeps the icon `aria-hidden`.
- Colour alone does not convey meaning — the tones are tints only; the icon glyph is the semantic signal (lock = locked, check = done, triangle-alert = error). This is consistent with WCAG 1.4.1.

---

## Build steps — ordered + acceptance criteria

**Prerequisite (P0-blocker):** `--color-success` + `--color-success-foreground` + `--color-warning` + `--color-warning-foreground` OKLCH values added to `packages/ui/src/styles/globals.css` `@theme`. `IconBadge` can ship without `success`/`warning` tones if the token PR is sequenced after, but stories + tests must gate those variants until the tokens land.

### Step 1 — Create `packages/ui/src/components/icon-badge.tsx`
- Define `IconBadgeTone`, `IconBadgeSize`, `IconBadgeShape` types.
- Define `IconBadgeProps` interface (as above).
- Implement with `cva` for the variant matrix (tone × size × shape).
- `forwardRef<HTMLSpanElement, IconBadgeProps>`.
- Inner icon rendered as `<Icon className={iconSize} aria-hidden="true" />`.
- Export named: `IconBadge`, `IconBadgeProps`, `IconBadgeTone`, `IconBadgeSize`, `IconBadgeShape`.
- **Acceptance:** component renders all 7 tones × 3 sizes × 2 shapes without error; no raw hex in className strings.

### Step 2 — Export from package barrel
- Add `export * from "./components/icon-badge"` to `packages/ui/src/index.ts` (or the equivalent barrel file).
- **Acceptance:** `import { IconBadge } from "@camp404/ui"` resolves in a consuming package.

### Step 3 — Storybook stories
- Create `packages/ui/src/components/icon-badge.stories.tsx` with all stories listed above.
- **Acceptance:** Storybook builds without error; all 9 stories render visually matching the board references.

### Step 4 — Vitest / RTL tests
- Create `packages/ui/src/components/__tests__/icon-badge.test.tsx` with the 12 test cases listed above.
- **Acceptance:** `pnpm test --filter @camp404/ui` passes green.

### Step 5 — Replace `apps/web/app/tools/page.tsx` inline chip
- Swap `<span className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted/40">` + icon child for `<IconBadge size="sm" shape="rounded" tone="muted" icon={...} />`.
- **Acceptance:** visual output unchanged; no `border` or raw `bg-muted/40` class in JSX.

### Step 6 — Replace `apps/web/app/captains/tools/page.tsx` inline chip
- Same swap as Step 5.
- **Acceptance:** same criteria.

### Step 7 — Replace `apps/web/app/pending-approval/page.tsx` inline circles
- Replace the conditional className div (L53–63) with `<IconBadge size="lg" shape="circle" tone={rejected ? "destructive" : "warning"} icon={rejected ? ShieldX : Clock} />`.
- Remove the `amber-500/15` raw Tailwind utility — this is a reconciliation #4 token fix.
- **Acceptance:** no `amber-500` or `bg-destructive/10` raw classes; `warning` tone used for pending state (depends on `--color-warning` token landing first, otherwise use `accent` as a temporary placeholder and note the TODO).

### Step 8 — CI / lint check
- Run `pnpm lint --filter @camp404/ui` and `pnpm lint --filter apps/web`.
- **Acceptance:** no new lint errors; no raw hex tints introduced.

---

## Consumers — which molecules/organisms/surfaces use IconBadge

### Molecules (depend on IconBadge)

| Molecule | Usage |
|---|---|
| **TopChrome** | Bell icon container (the round button shell is a separate Button; the unread indicator is a Badge — but if TopChrome uses an icon-circle variant, it uses `IconBadge`) |
| **NavCard** | Icon chip (IconChip replacement) — `size="sm" shape="rounded" tone="muted"` |
| **GridTile** | IconBox — `size="md" shape="rounded" tone="primary"` |
| **EmptyState** | EsCircle — `size="lg" shape="circle" tone="muted"` |
| **CaptainLock** | LockCircle — `size="md" shape="circle" tone="primary" icon={Lock}` |

### Organisms (depend on IconBadge)

| Organism | Usage |
|---|---|
| **NotificationRow** | Presentation icon circle (acknowledge/popup/feed) |
| **CompletionHero** | Success check circle — `size="lg" shape="circle" tone="accent" icon={Check}` |
| **QueueCard** | Status icon (complete/next-up) |
| **QuestionnaireBlock** | clipboard-list ic — `size="lg" shape="circle" tone="primary"` |
| **AcknowledgementGate** | megaphone ic — `size="lg" shape="circle" tone="primary"` |
| **ReportBugDialog** (ShakeReporter) | bug ic — `size="sm" shape="circle" tone="accent"` |
| **ErrorBoundary** | triangle-alert ic — `size="lg" shape="circle" tone="destructive"` |
| **RankGroupCard** | GroupHead icon chip |
| **MCPConsent** | Scope icon wrap (`sm` rounded `accent`) + user avatar circle (`sm` circle `primary`) |

### App surfaces (direct use, pre-organism refactor)

| Surface | File |
|---|---|
| Pending-approval gate | `apps/web/app/pending-approval/page.tsx` |
| Tools hub | `apps/web/app/tools/page.tsx` |
| Captain tools hub | `apps/web/app/captains/tools/page.tsx` |
