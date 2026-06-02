# Avatar — atom plan

- **mapsTo:** REUSE `packages/ui/src/components/avatar.tsx`
- **Target file:** `packages/ui/src/components/avatar.tsx`

---

## Current state — does it exist? where? gap vs spec

The component exists at `packages/ui/src/components/avatar.tsx`. It is the standard
shadcn/ui "new-york" Radix `@radix-ui/react-avatar` triple (`Avatar`, `AvatarImage`,
`AvatarFallback`) and is already in active use by the app.

**Current consumers (from grep):**
- `apps/web/app/home-header.tsx` — 32×32 (`h-8 w-8`), initials fallback `text-xs`
- `apps/web/app/profile/page.tsx` — 128×128 (`h-32 w-32`), initials fallback `text-3xl`

**Gaps vs spec (cite sources):**

1. **No `tint` prop.** The roster boards (`38-s17-roster-iteration-b-mobile.txt`,
   `37-s17-roster-iteration-b-terminal-console.txt`, `26-s17-captain-mgmt.txt`) draw
   mono-initial avatars on per-member solid-colour fills (`#ff008c`, `#751888`,
   `#00b3d6`, `#e0a800`, `#2fbf71`, `#7c5cff`, `#d65a8c`, `#3a7bd5`). The roster
   surface brief (`14-roster.md`) specifies "mono initials on a per-member tint" with
   the design-tokens spec §4 reconciliation #18 requiring these fills to be generated
   from "token-derived hues … rotate through `primary`/`accent`/`secondary`/
   `success`/`warning` at ~20% alpha, not arbitrary hex." No tint prop exists today.

2. **No `variant` prop.** The spec distinguishes four render modes: `photo` (AvatarImage
   present), `initials` (AvatarFallback with letter content), `glyph` (family-tree
   `user` lucide icon in `$muted` fill — `25-s16-family-tree.txt`), and `mono-tinted`
   (roster: solid fill + JetBrains Mono initials + square-rounded shape). Today the
   consumer must manually compose child elements; no variant contract enforces modes.

3. **No `glyphIcon` prop.** The family-tree board draws `user` (`$muted-foreground`)
   inside a `$muted`-fill circle. The MCP consent identity row (`29-s20-mcp-connect.txt`)
   draws `user` (`$primary`) inside a `primary/15%`-fill circle (32×32, `r:16`). Both
   require passing a lucide icon into the fallback slot.

4. **Fallback uses `$secondary` fill only.** Current `AvatarFallback` hardcodes
   `bg-[color:var(--color-secondary)] text-[color:var(--color-secondary-foreground)]`
   (`avatar.tsx` line 46). The spec requires the fallback background to respect the
   `tint` prop value when in `mono-tinted` mode, and the home/profile `initials` mode
   should use `$secondary` fill (matching the TopChrome board `00-topchrome.txt`:
   `fill:$secondary`, and profile-view board `18-s09-profile-view.txt`: `fill:$secondary`).
   The existing default is therefore correct for `initials` mode but needs to be
   overridable for other modes.

5. **Initials text face.** In roster/mono-tinted mode, the boards draw initials in
   **JetBrains Mono** (e.g. `[JetBrains Mono/12.5px/700/#ffffff]` in the terminal
   board, `[JetBrains Mono/12px/700/#ffffff]` in the captain-mgmt board). In
   `initials` mode (TopChrome, profile-view), the boards draw no explicit type spec on
   the initials — Inter/semibold is the correct face. The `font-mono` class must be
   applied only in `mono-tinted` variant. No font distinction exists today.

6. **Size is className-only today.** Size is passed via `className` by consumers
   (e.g. `h-8 w-8`, `h-32 w-32`). This is acceptable and consistent with the spec
   (`Props: className (size)`), but the named sizes from the boards should be
   documented as the canonical size vocabulary. No code change needed, just contract
   documentation.

7. **Profile-view size discrepancy.** `apps/web/app/profile/page.tsx` uses `h-32 w-32`
   (128px). The board `18-s09-profile-view.txt` draws `w:96 h:96` (96px). The surface
   spec (`07-profile-view.md`) explicitly flags this: "Live code: `h-32 w-32` (128px) …
   Board is canonical at 96px. Live code oversizes; align to board on build." Fix:
   change the profile-page className to `h-24 w-24` as a build step.

8. **`initialsFrom` location.** Currently lives at `apps/web/lib/initials.ts`. Per
   `design/spec/impl/service-layer/09-platform-crosscutting.md` and
   `design/spec/impl/architecture.md`, it is earmarked for extraction to
   `@camp404/core`. The Avatar plan depends on that move (or the app continues
   importing directly until the extraction pass).

---

## API — props, variants, sizes, states

### TS prop interface sketch

```ts
import type { LucideIcon } from "lucide-react";

/** Per-member tint for the mono-tinted roster variant.
 *  Each value is a CSS custom-property expression resolving to a solid colour
 *  derived from a canonical token (see Tokens section).
 *  Consumers pass a pre-computed tint string; the component never generates it. */
export type AvatarTint =
  | "primary"
  | "accent"
  | "secondary"
  | "success"
  | "warning"
  | string; // escape hatch for exact token-at-alpha expressions

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  /** URL of the proxied photo. Renders AvatarImage when truthy. */
  src?: string | null;
  /** Fallback initials (up to 2 chars). Rendered when no src.
   *  Pass the output of `initialsFrom()` — "?" when null. */
  initials?: string;
  /** Render a lucide icon instead of initials. Used by family-tree (glyph
   *  variant) and MCP consent (identity row). */
  glyphIcon?: LucideIcon;
  /** Per-member solid fill for the mono-tinted roster variant.
   *  Accepts a canonical token name or a CSS value. When set, variant
   *  is implicitly "mono-tinted". */
  tint?: AvatarTint;
  /** Size override via Tailwind classes (e.g. "h-8 w-8"). Canonical
   *  sizes: h-7 w-7 (28px tree), h-8 w-8 (32px TopChrome/MCP), h-9 w-9 (34–36px
   *  roster mobile), h-10 w-10 (40px TopChrome board default), h-16 w-16 (64px
   *  roster profile), h-24 w-24 (96px profile-view). */
  className?: string;
}
```

### Variants

| Variant | When rendered | Fill | Initials face | Shape |
|---|---|---|---|---|
| `photo` | `src` truthy (AvatarImage present) | N/A | N/A | `rounded-full` |
| `initials` | No `src`, no `tint`, no `glyphIcon` | `$secondary` | Inter / semibold | `rounded-full` |
| `glyph` | `glyphIcon` prop set | `$muted` | N/A (icon) | `rounded-full` |
| `mono-tinted` | `tint` prop set | token-derived solid colour | JetBrains Mono / 700 / white | `rounded` (roster square `r:4–6`) or `rounded-full` (captain-mgmt list `r:999`) |

The shape of `mono-tinted` variants follows the parent organism's geometry:
- Roster terminal table: `r:4` (square-rounded, 34×34px)
- Roster mobile rows: `r:4` (square-rounded, 34×34px)
- Roster member profile hero: `r:8` (56×56px) — `rounded-lg`
- Captain-mgmt list rows: `r:999` (38×38px) — `rounded-full`

Shape defaults to `rounded-full`; consumers override via `className` or a future
`shape` prop. The boards are the authority; no shape prop is needed at the atom level —
`className` covers it.

### Sizes (canonical board vocabulary)

| Context | Board px | Tailwind class | Source board |
|---|---|---|---|
| Family tree node | 30 | `h-8 w-8` (snap 30→32) | `25-s16-family-tree.txt` |
| MCP consent identity | 32 | `h-8 w-8` | `29-s20-mcp-connect.txt` |
| Roster mobile row | 34 | `h-9 w-9` | `38-s17-roster-iteration-b-mobile.txt` |
| TopChrome / home header | 40 | `h-10 w-10` | `00-topchrome.txt` |
| Captain-mgmt list | 38 | `h-10 w-10` (snap 38→40) | `26-s17-captain-mgmt.txt` |
| Roster terminal row | 34 | `h-9 w-9` | `37-s17-roster-iteration-b-terminal-console.txt` |
| Roster profile hero | 56–64 | `h-16 w-16` | both roster boards |
| Profile view | 96 | `h-24 w-24` | `18-s09-profile-view.txt` |

Size is always passed via `className`. No named `size` prop — stays consistent with the
existing shadcn convention and the spec entry ("Props: className (size)").

### States

| State | Description |
|---|---|
| `image-loaded` | `AvatarImage` visible; `AvatarFallback` hidden by Radix |
| `loading` | `AvatarImage` in flight; Radix shows `AvatarFallback` during delay |
| `fallback` | No `src`, or `AvatarImage` load error; shows initials / glyph / mono-tinted fill |

---

## Tokens & type — exact design tokens + type-scale roles used

### Colour tokens

| Use | Token | Source |
|---|---|---|
| Default fallback fill (`initials` variant) | `bg-secondary` | `00-topchrome.txt` `fill:$secondary`; `18-s09-profile-view.txt` `fill:$secondary` |
| Default fallback text (`initials` variant) | `text-secondary-foreground` | Existing `avatar.tsx` line 47; confirmed by board |
| Glyph fill (`glyph` variant) | `bg-muted` | `25-s16-family-tree.txt` `fill:$muted` |
| Glyph icon colour (tree) | `text-muted-foreground` | `25-s16-family-tree.txt` `user ($muted-foreground)` |
| Glyph fill (MCP identity) | `bg-primary/15` | `29-s20-mcp-connect.txt` `fill:#ff008c2e` → `primary/18%` per tokens spec §4 #4; board draws `r:16` so `rounded-full` |
| Glyph icon colour (MCP) | `text-primary` | `29-s20-mcp-connect.txt` `user ($primary)` |
| Mono-tinted fill | token-derived hue set (see below) | `14-roster.md`; tokens spec §4 #18 |
| Mono-tinted text | `#ffffff` (white) | All roster boards; text always on a solid fill — no token needed |

**Tint token-derived hue set** (per tokens spec §4 reconciliation #18):

The boards draw raw solid fills (`#ff008c`, `#751888`, `#00b3d6`, `#e0a800`, `#2fbf71`,
`#7c5cff`, `#d65a8c`, `#3a7bd5`). These must be replaced with a fixed set of
token-derived hues. Proposed canonical palette (5 entries, cycle by
`userId.charCodeAt(0) % 5`):

| Slot | Token | Solid fill expression |
|---|---|---|
| 0 | primary | `oklch(from var(--color-primary) l c h)` |
| 1 | accent | `oklch(from var(--color-accent) l c h)` |
| 2 | secondary | `oklch(from var(--color-secondary) l c h)` |
| 3 | success | `oklch(from var(--color-success) l c h)` |
| 4 | warning | `oklch(from var(--color-warning) l c h)` |

A pure helper `avatarTintFor(userId: string): AvatarTint` (zero deps, deterministic
cycle) should live in `@camp404/core` alongside `initialsFrom`. It returns one of the
five canonical token names. The component maps the token name to a CSS variable via
an inline style or a Tailwind arbitrary value. **White text is always safe on all five
filled hues** (confirmed against the dark palette — all have OKLCH lightness ≤ 0.80 at
full opacity).

### Type-scale roles

| Use | Role token | Font | Size / weight |
|---|---|---|---|
| `initials` variant text | `--text-caption` (ad-hoc overridden by consumer via `className`) | Inter | ~12–16px / 600; size follows circle diameter |
| `mono-tinted` initials | `--text-mono` | JetBrains Mono | 12–13px / 700 (`font-mono font-bold`) |
| Glyph icon | N/A (SVG size via `h-4 w-4` or `h-5 w-5`) | — | — |

In practice, consumers pass size via `className`; the atom sets `font-mono font-bold` on
the fallback when `tint` is provided (mono-tinted mode) and keeps `font-sans font-semibold`
otherwise.

---

## Composition & deps — atoms/primitives + helpers used

| Dep | Type | Reason |
|---|---|---|
| `@radix-ui/react-avatar` | external primitive | Handles image load state, fallback timing, ARIA |
| `cn` (from `packages/ui/src/lib/utils.ts`) | internal util | Conditional className merging |
| `initialsFrom` (from `@camp404/core`, currently `apps/web/lib/initials.ts`) | pure helper | Consumers call before passing `initials` prop; the atom does not call it directly |
| `avatarTintFor` (NEW, `@camp404/core`) | pure helper | Consumers call to get the tint token name from `userId`; atom does not call it |
| Lucide `LucideIcon` type | type-only import | For `glyphIcon?: LucideIcon` prop typing |

The Avatar atom itself is **purely presentational**: it does not call `initialsFrom` or
`avatarTintFor` — consumers (TopChrome, RosterRow, FamilyTree) call helpers and pass
the computed values as props. This keeps the atom logic-free and matches the layering
rule (`@camp404/ui` may import `@camp404/types` and `@camp404/core`; `@camp404/ui`
never imports `@camp404/db` or `next/*`).

---

## Absorbs — candidates replaced (from merge map)

The merge map does not list Avatar as a canonical absorber. The spec entry in
`component-library.md` confirms the component-library merge table did **not** collapse
any other candidate into Avatar — the "Absorbs" row is empty.

However, the following bespoke avatar-shaped patterns must be removed once the enhanced
Avatar ships:

| Pattern | Location | Absorbed by |
|---|---|---|
| Inline `<span>` initials circle in old TopChrome drafts | — (not present in live code; `home-header.tsx` already uses the Avatar primitive) | Already resolved |
| Family-tree node's hand-composed `rounded-full border bg-muted/40` + `user` icon (`25-s16-family-tree.txt`) | `apps/web` family-tree component (future file) | Avatar `variant="glyph"` |
| MCP consent identity avatar (`w:32 h:32 r:16 fill:#ff008c2e` + `user ($primary)`) | `apps/web/app/mcp/connect/` | Avatar `glyphIcon={User}` + `className="h-8 w-8 bg-primary/15"` |

---

## Stories & tests

### Storybook stories

```
Avatar.stories.tsx
  - Default (initials, "RN", h-10 w-10)
  - With photo (src set, 40px)
  - Photo with fallback (src=broken URL, shows initials)
  - Initials only — single char ("?")
  - Glyph — tree variant (user icon, $muted fill, 30px)
  - Glyph — MCP identity (user icon, bg-primary/15, 32px)
  - Mono-tinted — each of the 5 tint slots (34px, rounded square)
  - Mono-tinted — hero size (56px, rounded-lg)
  - Size gallery — all canonical sizes (h-7 through h-24)
  - Loading state — src slow-loaded (Storybook `delay` parameter)
```

### Test cases (vitest + RTL)

```
avatar.test.tsx
  rendering
  - renders AvatarImage when src is truthy
  - renders AvatarFallback with initials when src is null
  - renders "?" initials when initials prop is "?"
  - renders glyphIcon when glyphIcon prop is set and no src
  - applies font-mono and font-bold classes when tint prop is set
  - does NOT apply font-mono when tint is absent
  - applies bg-secondary text-secondary-foreground in default initials mode
  - forwards className to root element
  - merges className with default rounded-full
  a11y
  - AvatarImage has no role (presentational, alt="" is correct; AvatarFallback
    is aria-hidden when image loads — confirm Radix behaviour)
  - glyphIcon rendered element has aria-hidden
  snapshot
  - matches snapshot for each variant (photo/initials/glyph/mono-tinted)
```

### a11y notes

- The avatar circle is **purely decorative** in all roster and header contexts;
  the Link or Row that wraps it carries the accessible name (e.g. "Your profile"
  on `home-header.tsx` line 47).
- When used standalone (e.g. MCP identity row), the parent element should carry
  `aria-label` or a visible label.
- `AvatarImage alt=""` is correct for decorative photos; supply `alt={name}` only
  when the image is the sole identifier (e.g. profile-view where it is the heading
  visual anchor).
- `glyphIcon` elements rendered inside the fallback must be `aria-hidden`.
- Radix `AvatarFallback` has `delayMs` — keep default (600ms) to avoid flicker on
  slow photo loads.

---

## Build steps — ordered + acceptance criteria

**Prerequisite (from architecture + cross-cutting plans):** `initialsFrom` extraction
to `@camp404/core` is a separate task. The Avatar enhancement does NOT block on it —
consumers continue to import `initialsFrom` from `@/lib/initials` until the extraction
pass. `avatarTintFor` is new and should land in `@camp404/core` as part of this work.

### Step 1 — add `avatarTintFor` helper to `@camp404/core`

Create `packages/core/src/initials.ts` (or co-locate `avatarTintFor` with `initialsFrom`
once extracted; for now add to a new `packages/core/src/avatar.ts`).

```ts
// packages/core/src/avatar.ts
export type AvatarTint = "primary" | "accent" | "secondary" | "success" | "warning";

const TINTS: AvatarTint[] = ["primary", "accent", "secondary", "success", "warning"];

/** Deterministic per-member tint from any stable string ID. */
export function avatarTintFor(id: string): AvatarTint {
  const sum = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return TINTS[sum % TINTS.length]!;
}
```

**Acceptance:** unit tests pass for determinism (same `id` always returns same tint),
distribution across the 5 slots with a sample set of real-looking UUIDs.

### Step 2 — extend Avatar atom

Edit `packages/ui/src/components/avatar.tsx`:

- Add `glyphIcon?: LucideIcon` to `AvatarProps`; extend `AvatarFallback` to render the
  icon when provided (icon gets `aria-hidden`, sized `h-4 w-4` by default, inherits
  `className`).
- Add `tint?: AvatarTint | string` to `AvatarProps`; when `tint` is set, apply
  `font-mono font-bold text-white` on `AvatarFallback` and expose the tint value as
  a CSS custom property via inline style (`--avatar-tint: var(--color-{tint})`).
  Use `bg-[var(--avatar-tint)]` in the fallback class.
- Export `AvatarTint` type from the component file.
- Update the JSDoc comment to document all variants.

**Acceptance:** Storybook shows all 4 variants correctly; no TypeScript errors;
existing consumers (`home-header.tsx`, `profile/page.tsx`) continue to compile and
render unchanged.

### Step 3 — fix profile-view size (consumer fix, not atom)

In `apps/web/app/profile/page.tsx` line 46: change `h-32 w-32 text-3xl` →
`h-24 w-24 text-2xl`.

**Acceptance:** profile page renders 96px avatar, matching `18-s09-profile-view.txt`.

### Step 4 — token-spellings on AvatarFallback

Replace verbose token syntax in `avatar.tsx` lines 46–47:
- `bg-[color:var(--color-secondary)]` → `bg-secondary`
- `text-[color:var(--color-secondary-foreground)]` → `text-secondary-foreground`

Per `design/spec/design-tokens.md` §4 #22 (standardise on short Tailwind form).

**Acceptance:** visual output unchanged; no verbose `[color:var(--)]` in the file.

### Step 5 — write / update tests

Add `packages/ui/src/components/__tests__/avatar.test.tsx` (or update if it exists)
with the cases listed in Stories & tests.

**Acceptance:** all vitest/RTL cases pass; no a11y violations in Storybook a11y addon.

---

## Consumers — molecules/organisms/surfaces that use Avatar

| Consumer | Variant used | Size | Source |
|---|---|---|---|
| `TopChrome` (molecule — PROMOTE) | photo or initials | `h-10 w-10` (40px) | `00-topchrome.txt`; `apps/web/app/home-header.tsx` |
| Profile view page (`app/profile/page.tsx`) | photo or initials | `h-24 w-24` (96px, fix from 128px) | `18-s09-profile-view.txt` |
| `AvatarUpload` (molecule — PROMOTE) | photo or initials (the display circle, not the upload trigger) | configurable via `className` | `design/spec/surfaces/08-profile-edit.md` |
| `RosterRow` (organism — NEW, app-local) | mono-tinted + initials | `h-9 w-9` (34px) table/mobile | `38-s17-roster-iteration-b-mobile.txt`, `37-s17-roster-iteration-b-terminal-console.txt` |
| `MemberProfile` (organism — NEW, app-local) | mono-tinted, hero size | `h-16 w-16` (56–64px) | `26-s17-captain-mgmt.txt`, `37-s17-roster-iteration-b-terminal-console.txt` |
| `FamilyTree` / `TreeRow` (organism — NEW, app-local) | glyph (`user`, `$muted` fill) | `h-8 w-8` (snap 30→32) | `25-s16-family-tree.txt` |
| `MCPConsent` identity row (organism — keep app-local) | glyph (`user`, `bg-primary/15`) | `h-8 w-8` (32px) | `29-s20-mcp-connect.txt` |
