# TopChrome — molecule plan

- **mapsTo:** PROMOTE `apps/web/app/home-header.tsx`
- **Target file:** `packages/ui/src/components/top-chrome.tsx`

---

## Current state — does it exist? where? gap vs spec

**Source file (verified):** `apps/web/app/home-header.tsx`

The live component is called `HomeHeader`, not `TopChrome`. It is a partial
implementation of the canonical board 00 spec:

| Board spec element | Live `HomeHeader` | Gap |
|---|---|---|
| Wordmark `Camp` (Inter 20/700) + `404` (JetBrains Mono 20/700 `$primary`) | **ABSENT** — `HomeHeader` renders only the bell + avatar cluster; the wordmark lives directly in `ControlPanel`'s layout chrome (not extracted as a named element) | Missing wordmark; board 00 draws the full bar as one component |
| Bell: 40×40 `$muted` circle, `bell` icon, count badge (`$primary` fill, `$primary-foreground` text, hidden at 0) | Partial — renders a `rounded-full p-1.5` link with a `Bell` icon and an inline `<span>` badge; no 40×40 `$muted` circle wrapper; uses verbose `[color:var(--color-*)]` tokens (165 instances across the app, P1-5 codemod target) | Missing circle container; off-token styling |
| Badge text: 9px/700 as drawn on board 00 (`T "3" [Inter/9px/700/$primary-foreground]`) | Inline `text-[10px] font-semibold` — close but not the drawn 9px; absolute-positioned at `-right-0.5 -top-0.5` vs board's `abs(23,6)` | Minor size drift; positioning approximated |
| Count cap: `>99 → "99+"` | Implemented correctly (`notifications > 99 ? "99+" : notifications`) | No gap |
| Avatar: 40×40 `$secondary` circle, initials `$secondary-foreground`, or photo | Implemented via `@camp404/ui/avatar`; uses `h-8 w-8` (32px) — **8px short** of board's 40px | Size drift: 32 vs 40px |
| Bell and Avatar are `Link` wrappers | Implemented (bell → `/notifications`, avatar → `/profile`) | No gap |
| `aria-label` on bell with unread count | Implemented correctly | No gap |

**Board 00 anatomy (canonical):**

```
TopChrome {w:430 pad:16 jc:space_between ai:center fill:$background}
  Wordmark {gap:1 ai:center}
    T "Camp"  [Inter/20px/700/$foreground]
    T "404"   [JetBrains Mono/20px/700/$primary]
  Actions {gap:10 ai:center}
    Bell {w:40 h:40 jc:center ai:center r:999 fill:$muted}
      bell ($foreground) [lucide]
      Badge {w:16 h:16 jc:center ai:center r:999 fill:$primary stroke:$background abs(23,6)}
        T "3" [Inter/9px/700/$primary-foreground]
    Avatar {w:40 h:40 jc:center ai:center r:999 fill:$secondary}
      T "JR"  [Inter/14px/700/$secondary-foreground]
```

**Merge map:** no candidates are absorbed into `TopChrome` (the merge map table has
no row for it). `HomeHeader` is the sole source to reconcile; the wordmark fragment
in `ControlPanel` is the only other piece.

**Classification: PROMOTE** — the pattern is hand-rolled in `apps/web`; lift to
`packages/ui/src/components/top-chrome.tsx` as the single canonical bar.

**Dead component to delete once promoted:** `apps/web/app/home-header.tsx` (its
sole consumer is `apps/web/app/page.tsx` via `<HomeHeader …>`). Replace the import
with `@camp404/ui/components/top-chrome`.

---

## API — props, variants, sizes, states

### TS prop interface

```ts
export interface TopChromeProps {
  /** Initials rendered in the avatar fallback (e.g. "JR"). "?" when null. */
  avatarInitials: string;
  /** Profile photo URL for the avatar, when the member has uploaded one. */
  avatarImageUrl?: string | null;
  /** Unread notification count. 0 / falsy → badge hidden. Capped at "99+". */
  unreadCount?: number;
  /**
   * Href for the bell icon.
   * @default "/notifications"
   */
  bellHref?: string;
  /**
   * Href for the avatar.
   * @default "/profile"
   */
  avatarHref?: string;
  className?: string;
}
```

### Variants

| Variant | Trigger | Rendered output |
|---|---|---|
| `badge-hidden` | `unreadCount` is 0, undefined, or null | Bell rendered; count badge absent |
| `badge-shown` | `unreadCount` is 1–99 | Badge shows the literal count |
| `count-capped` | `unreadCount > 99` | Badge shows "99+" |
| `photo` | `avatarImageUrl` is a non-empty string | Avatar renders the image via `AvatarImage` |
| `initials` | `avatarImageUrl` is absent/null | Avatar renders `AvatarFallback` with `avatarInitials` |

### Sizes

The component has one size: the full-width top bar as drawn on board 00
(`pad:16`, `jc:space_between`, `ai:center`, `fill:$background`). No size prop.
Internal fixed sizes: bell/avatar 40×40 (`h-10 w-10`), badge 16×16 (`h-4 w-4`).

### States

| State | Description |
|---|---|
| Default (unread = 0) | Bar renders; bell has no badge; avatar shows initials or photo |
| Unread (count > 0) | Bell badge visible with count or "99+" |
| Photo | `AvatarImage` renders; `AvatarFallback` is the Radix-native hidden fallback |
| Initials | `AvatarFallback` renders `avatarInitials`; `$secondary` fill, `$secondary-foreground` text |

---

## Tokens & type — exact design tokens + type-scale roles

All token references use the short Tailwind utility form (P1-5 normalisation — no
`[color:var(--color-*)]` verbose form).

### Layout tokens

| Element | Token / utility | Source |
|---|---|---|
| Bar background | `bg-background` | Board 00 `fill:$background` |
| Bar padding | `px-4 py-4` (16px each side) | Board 00 `pad:16` |
| Bar justify | `justify-between items-center` | Board 00 `jc:space_between ai:center` |

### Wordmark

| Part | Token / utility | Source |
|---|---|---|
| "Camp" text | `text-foreground font-sans text-xl font-bold` (Inter 20/700) | Board 00 `Inter/20px/700/$foreground` |
| "404" text | `text-primary font-mono text-xl font-bold` (JetBrains Mono 20/700) | Board 00 `JetBrains Mono/20px/700/$primary`; also §1.1 `--text-brand-label` (design-tokens.md) — nearest named role is the wordmark `$primary` mono accent |

The "404" fragment uses `font-mono` which resolves to `--font-mono` (JetBrains
Mono) once the foundations font-wiring step ships (design-tokens.md §1.3 / P1-6).
**Prerequisite:** foundations must land first.

### Bell button

| Element | Token / utility | Source |
|---|---|---|
| Circle container | `bg-muted rounded-full h-10 w-10 flex items-center justify-center` | Board 00 `w:40 h:40 r:999 fill:$muted` |
| Bell icon colour | `text-foreground` | Board 00 `bell ($foreground)` |
| Focus ring on Link wrapper | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` | Design system; `$ring = $primary` |
| Hover | `hover:bg-muted/80` | Not on board; standard interactive affordance |

### Count badge (positioned overlay)

| Element | Token / utility | Source |
|---|---|---|
| Badge fill | `bg-primary` | Board 00 `fill:$primary` |
| Badge stroke | `ring-1 ring-background` (or `outline outline-background`) | Board 00 `stroke:$background` — prevents badge bleeding into bell |
| Badge text | `text-primary-foreground` | Board 00 `$primary-foreground` |
| Badge text size | `text-[9px] font-bold leading-none` | Board 00 `Inter/9px/700` — 9px is smaller than `--text-micro` (10–11px); keep literal `text-[9px]` as a one-off badge-count size |
| Badge size | `h-4 w-4 min-w-4 rounded-full` (16px) | Board 00 `w:16 h:16 r:999` |
| Badge position | `absolute top-0 right-0 translate-x-1/4 -translate-y-1/4` | Board 00 `abs(23,6)` — approximated with Tailwind transform; exact pixel offset is implementation detail |

Type note: the 9px badge text sits below the named `--text-micro` floor (10px). It
is justified as a purely numerical count in a 16px circle — a badge-count idiom,
not prose. Keep `text-[9px]`; do not snap to 10px (would overflow a single-digit
badge).

### Avatar

| Element | Token / utility | Source |
|---|---|---|
| Container size | `h-10 w-10` (40px) | Board 00 `w:40 h:40` — corrects live `h-8 w-8` |
| Fallback fill | `bg-secondary` | Board 00 `fill:$secondary` |
| Fallback text | `text-secondary-foreground text-sm font-bold` (Inter 14/700) | Board 00 `Inter/14px/700/$secondary-foreground` |
| Shape | `rounded-full` (`--radius-full`) | Board 00 `r:999` |
| Focus ring on Link wrapper | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` | Design system |

---

## Composition & deps — atoms, primitives, helpers

### Direct atom/primitive dependencies

| Dep | Package | Role |
|---|---|---|
| `Avatar`, `AvatarImage`, `AvatarFallback` | `@camp404/ui/components/avatar` (REUSE — already in `packages/ui/src/components/avatar.tsx`) | Renders member photo or initials |
| `cn` | `@camp404/ui/lib/utils` | Tailwind class merging |
| `Link` (Next.js) | `next/link` | Bell and avatar nav targets |

**`Link` import note:** `next/link` is a Next.js dependency. `@camp404/ui` is
presentation-only and must not import `next/*` server code, but `next/link` is
a client-side component — it is allowed in a `"use client"` component.
Alternatively, the link wrappers can be passed as `bellHref`/`avatarHref` string
props and the component uses a plain `<a>` tag, which removes the Next.js dep from
the package entirely. **Preferred:** use plain `<a>` tags in `@camp404/ui` and
leave the `Link` optimisation to the app-layer wrapper. The consumer in
`apps/web/app/page.tsx` can wrap with `Link` if needed or pass rendered link
elements via render-props. This is the cleaner package boundary.

**Decision:** keep `<a>` in the package component; document that consumers
in a Next.js context may wrap with `Link` at the call site, or compose a
`NextTopChrome` thin wrapper in `apps/web` that passes `<Link>` nodes.

### `@camp404/core` helpers

| Helper | Package | Role | Status |
|---|---|---|---|
| `initialsFrom` | `@camp404/core` (plan 09 extraction target) | Derives "JR" from display name / email; "?" on null | Today lives in `apps/web/lib/initials.ts`; will move to `core` in Phase 3 (architecture.md §Hybrid extraction). The UI component does **not** call `initialsFrom` itself — the caller (page server component) computes initials and passes the `avatarInitials` string prop. `TopChrome` is pure-presentational. |

No `rankLevel` or clearance helpers are needed — `TopChrome` is a dumb display
bar; rank-awareness is the caller's responsibility.

---

## Absorbs — candidates replaced

The merge map in `component-library.md` has **no entry** absorbing other candidates
into `TopChrome`. The single source replaced is:

| Replaced | File | Action |
|---|---|---|
| `HomeHeader` | `apps/web/app/home-header.tsx` | **DELETE** once `TopChrome` is wired into `apps/web/app/page.tsx`. The `HomeHeader` export is consumed only at that one call site. |

The wordmark fragment ("Camp" + "404") currently rendered inside `ControlPanel` (or
its successor `RankGroupCard`/home page shell) must be reconsidered: the board draws
`TopChrome` as the **full bar including the wordmark**. The home page shell should
render `<TopChrome …>` as the header, not a partial cluster. Confirm with the home
surface (06-home.md §M0) — already documented there as open question #8.

---

## Stories & tests

### Storybook stories (`top-chrome.stories.tsx`)

| Story | Props | Purpose |
|---|---|---|
| `Default` | `avatarInitials="JR"`, `unreadCount=0` | Baseline: badge hidden, initials avatar |
| `UnreadBadge` | `avatarInitials="JR"`, `unreadCount=3` | Badge shown with literal count |
| `BadgeCapped` | `avatarInitials="JR"`, `unreadCount=150` | "99+" displayed |
| `WithPhoto` | `avatarInitials="JR"`, `avatarImageUrl="https://…"` | Avatar renders image |
| `PhotoFallback` | `avatarInitials="JR"`, `avatarImageUrl="broken-url"` | Image fails → initials shown (Radix native fallback) |
| `LongInitials` | `avatarInitials="ABC"` (3 chars) | Confirm clip / overflow in 40px circle |
| `NullInitials` | `avatarInitials="?"` | Fallback "?" renders correctly |

### Vitest / RTL test cases (`top-chrome.test.tsx`)

| Test | Assertion |
|---|---|
| Renders wordmark "Camp" + "404" | Both text nodes present; "404" has `font-mono` class |
| Bell link `aria-label` at 0 unread | `aria-label="Notifications"` (no count) |
| Bell link `aria-label` at N unread | `aria-label="Notifications (3 unread)"` |
| Badge hidden when `unreadCount=0` | Badge `<span>` not in document |
| Badge hidden when `unreadCount` omitted | Badge `<span>` not in document |
| Badge shows count when `unreadCount=7` | Badge text content `"7"` |
| Badge shows "99+" when `unreadCount=100` | Badge text content `"99+"` |
| Bell href navigates to `/notifications` | Bell link `href="/notifications"` |
| Avatar href navigates to `/profile` | Avatar link `href="/profile"` |
| Avatar shows initials in fallback | `AvatarFallback` text = `avatarInitials` |
| Avatar renders `AvatarImage` when `avatarImageUrl` provided | `<img>` present with correct `src` |
| Custom `bellHref` prop | Bell link uses supplied href |
| Custom `avatarHref` prop | Avatar link uses supplied href |

### Accessibility notes

- Bell `<a>` must carry a descriptive `aria-label`:
  - No unread: `"Notifications"`
  - With unread: `"Notifications (N unread)"` (where N is the actual count or
    `"99+"` when capped).
- The count badge `<span>` is `aria-hidden="true"` — the count is expressed in
  the link's `aria-label`, not in the visual badge, to avoid double-announcing.
- Avatar `<a>` must carry `aria-label="Your profile"` (matches live code; confirms
  it is not redundant with the `AvatarImage` alt which should be `alt=""`).
- Both link wrappers need `focus-visible` ring styles using `$ring` (`$primary`).
- Wordmark is presentational chrome — wrap in `aria-hidden="true"` or an
  `aria-label`-bearing `<header>` landmark at the page level (the bar itself is not
  a `<nav>`; `<header>` is appropriate).
- Ensure the 40×40 touch targets meet WCAG 2.5.8 (24×24 minimum; 40×40 exceeds
  it).

---

## Build steps — ordered + acceptance criteria

**Prerequisite:** foundations-tokens.md Phase 0 must have shipped (status tokens in
`globals.css`, `--font-mono` / `--font-sans` wiring, radius scale). `font-mono`
resolving to JetBrains Mono is required before the "404" wordmark looks correct.

### Step 1 — Create `packages/ui/src/components/top-chrome.tsx`

Build the component to the board 00 spec:

- Full bar: `flex w-full items-center justify-between px-4 py-4 bg-background`
- Wordmark: `<span>Camp</span>` (Inter, `text-foreground`) +
  `<span className="font-mono text-primary">404</span>` (JetBrains Mono via
  `font-mono` token)
- Bell: `<a>` wrapping a 40×40 `bg-muted rounded-full` circle; `Bell` lucide icon
  in `text-foreground`; count badge absolutely positioned, `bg-primary ring-1
  ring-background text-primary-foreground text-[9px] font-bold` `h-4 w-4 rounded-full`,
  hidden at 0; capped at "99+"
- Avatar: `<a>` wrapping `<Avatar className="h-10 w-10">` with `AvatarImage` +
  `AvatarFallback` (`bg-secondary text-secondary-foreground text-sm font-bold`)
- All tokens in short Tailwind form (no `[color:var(--color-*)]` verbose form)
- `"use client"` directive (contains `<a>` interactive elements)

**Acceptance:** component renders in isolation; Storybook stories all pass visual
review; no `[color:var(--)]` verbose tokens; `font-mono` applied to "404".

### Step 2 — Export from `@camp404/ui`

Add the export to `packages/ui/src/index.ts` (or the package's barrel / per the
existing export pattern in `packages/ui/package.json`):

```ts
export { TopChrome } from "./components/top-chrome";
export type { TopChromeProps } from "./components/top-chrome";
```

**Acceptance:** `import { TopChrome } from "@camp404/ui/components/top-chrome"`
resolves cleanly from `apps/web`.

### Step 3 — Wire into `apps/web/app/page.tsx`

Replace:

```tsx
import { HomeHeader } from "./home-header";
// ...
header={
  <HomeHeader
    initials={initials}
    imageUrl={campUser.profileImageUrl}
    notifications={unreadNotifications}
  />
}
```

with:

```tsx
import { TopChrome } from "@camp404/ui/components/top-chrome";
// ...
// Render TopChrome as the page header, above the ControlPanel / RankGroupCard grid
<TopChrome
  avatarInitials={initials}
  avatarImageUrl={campUser.profileImageUrl}
  unreadCount={unreadNotifications}
/>
```

Note: `HomeHeader` was passed as a `header` prop into `ControlPanel`. The board
draws `TopChrome` as a **top-level bar above the content scroll**, not embedded
inside `ControlPanel`. The home page refactor (06-home.md) will restructure the
shell; at this step, wire `TopChrome` into whatever top position the current or
redesigned shell supports. Coordinate with the home surface impl plan.

**Acceptance:** home page renders the full wordmark + bell + avatar bar; bell badge
reflects live `countUnread`; avatar is 40px and shows photo or initials.

### Step 4 — Delete `apps/web/app/home-header.tsx`

Once Step 3 is verified green on CI, delete the old file and confirm no other
import sites remain:

```bash
grep -r "home-header\|HomeHeader" apps/web --include="*.tsx" --include="*.ts"
```

**Acceptance:** grep returns no results; CI green.

### Step 5 — RTL tests

Write `packages/ui/src/components/top-chrome.test.tsx` covering the test matrix
above.

**Acceptance:** all tests pass via `pnpm --filter @camp404/ui test`.

### Step 6 — Storybook stories

Write `packages/ui/src/components/top-chrome.stories.tsx` covering the stories
above.

**Acceptance:** all stories render without console errors in Storybook.

---

## Consumers — which surfaces use TopChrome

| Consumer | File | Current pattern | Post-promote |
|---|---|---|---|
| Home (control panel) | `apps/web/app/page.tsx` | `<HomeHeader …>` prop passed to `ControlPanel` | Replace with `<TopChrome …>` rendered above the grid shell |

`TopChrome` is the **shared app header** (`component-library.md`: "Used by: home
(shared app header; reconcile live `HomeHeader` onto it)"). Board 00 is consumed
only by board S07 Home dashboard and board S08 Control panel (both map to the home
route). No other surface uses the top chrome bar — surfaces like notifications and
tools-hub have their own `DetailHeader` (board 02) with a back button.

If future surfaces need a persistent top-chrome bar (e.g. a persistent `<header>`
in the root layout), `TopChrome` is the canonical component to use. For now, one
consumer.
