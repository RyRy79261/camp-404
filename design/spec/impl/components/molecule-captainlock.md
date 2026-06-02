# CaptainLock — molecule plan

- **mapsTo:** PROMOTE (board 09 canvas reusable; hand-rolled in `apps/web/app/captains/camp-management/camp-management-roster.tsx`) · Target file: `packages/ui/src/components/captain-lock.tsx`

---

## Current state — does it exist? where? gap vs spec

No `captain-lock.tsx` (or equivalent) exists in `packages/ui/src/components/` — the directory contains 27 files (confirmed), none named `captain-lock`.

The pattern is hand-rolled inline in one confirmed app file and implied by the spec for three further surfaces that currently hard-redirect instead of rendering the locked treatment:

| File | What it renders | Gap vs spec |
|---|---|---|
| `apps/web/app/captains/camp-management/camp-management-roster.tsx` lines 278–289 | `Lock` icon + "Captain access only" + body text; absolutely positioned `bg-background/95` div over a blurred/opacity-40 table | Not a shared component; raw `bg-background/95` (off-token scrim); no `IconBadge` (`Lock` is a bare icon); no `skin` prop; uses `bg-emerald-500/15` and `bg-amber-500/15` status tints (600+ off-token uses, design-tokens.md §2.2). Not the spec's card anatomy (padded card `r:$radius fill:$card stroke:$border`, board 09). |
| `apps/web/app/captains/tools/page.tsx` | Hard `redirect("/")` for non-captains — no locked view at all | Decision #3 mandates preview-but-locked in-place; the redirect must be removed and replaced with `CaptainLock` (surface 16 spec §"Locked (non-captain) state"). |
| `apps/web/app/captains/announcements/page.tsx` | Hard `redirect("/")` for non-captains — no locked view at all | Same as above; surface 15 spec §"Preview-but-locked" requires `CaptainLock`. |
| Home rank-group cards (not yet built) | Not built | Home spec (surface 06) requires `CaptainLock` at `scope="group"` inside locked `RankGroupCard` organisms; currently the home page has no rank-group gating at all. |

**Board source:** `design/.spec-extract/boards/09-captainlock.txt` (canvas reusable #09).  
Board anatomy:
```
CaptainLock  {vertical w:360 gap:10 pad:24 ai:center r:$radius fill:$card stroke:$border}
  LockCircle {w:48 h:48 jc:center ai:center r:999 fill:#ff008c2e}
    lock  [$primary]
  "Captain access only"   [Inter/15px/700/$foreground]
  "This data is visible to captains. Your rank doesn't have clearance for this view."
    [Inter/12px/normal/$muted-foreground]
```

**Further board usages that confirm props shape:**
- `28-s19-captain-tools.txt` — `<CaptainLock>` with override "This tooling is captain-only. Your rank doesn't have clearance for these tools." (overrides the body copy).
- `26-s17-captain-mgmt.txt` — `<CaptainLock>` with overrides "Captains only" (title) / "Camp management is visible to captains. Your rank doesn't include it." (body).
- `38-s17-roster-iteration-b-mobile.txt` — `<CaptainLock w:fill_container>` same overrides; rendered at full surface width (not the board's `w:300` centred version).
- `16-s07-home-dashboard.txt` — grouped preview treatment "CAPTAIN · VIEW ONLY" / "Open to preview — no data for your rank." — this is the `scope="group"` variant (no card shell; inline within a rank-group card).

**Token gap:** `#ff008c2e` (LockCircle fill) must become `bg-primary/18` per design-tokens.md §4 reconciliation #4. The hand-rolled roster overlay uses `bg-background/95` — off-token scrim, not the spec card surface.

---

## API — props, variants, sizes, states

```ts
/**
 * CaptainLockScope controls the rendered anatomy:
 * - "surface"  → full card shell (pad:24, card bg, border, centered column).
 *                Used at page/surface level (roster, captain-tools, announcements).
 * - "group"    → inline treatment (no card shell, reduced padding).
 *                Used inside RankGroupCard for locked rank-groups on home.
 */
export type CaptainLockScope = "surface" | "group";

/**
 * CaptainLockSkin controls copy/chrome tone:
 * - "default"  → Inter body copy; used on all standard surfaces.
 * - "console"  → JetBrains Mono eyebrow + "VIEW ONLY · no data for your rank" line
 *                for the roster terminal skin (board 38-s17-roster-iteration-b-mobile).
 */
export type CaptainLockSkin = "default" | "console";

export interface CaptainLockProps {
  /**
   * Override the default title "Captain access only".
   * Board examples: "Captains only" (S17), same as default on S19.
   * @default "Captain access only"
   */
  title?: string;
  /**
   * Override the default body copy.
   * @default "This data is visible to captains. Your rank doesn't have clearance for this view."
   */
  body?: string;
  /**
   * Anatomy variant.
   * "surface" = full padded card (pad:24 r:$radius fill:$card stroke:$border) — surface-level gates.
   * "group"   = inline, no card shell — home rank-group locked preview.
   * @default "surface"
   */
  scope?: CaptainLockScope;
  /**
   * Visual/copy tone.
   * "default" = Inter copy only.
   * "console" = mono eyebrow "VIEW ONLY · no data for your rank" above the standard copy;
   *             mirrors the roster terminal skin (board 38 + surface 14 spec).
   * @default "default"
   */
  skin?: CaptainLockSkin;
  className?: string;
}
```

### Variants

| scope | skin | Anatomy |
|---|---|---|
| `surface` | `default` | Card shell (rounded, `$card` bg, `$border` stroke, 24 px padding, `ai:center`); `IconBadge(lock, primary, md, circle)` + title (15px/700) + body (12px/muted-foreground) |
| `surface` | `console` | Same card shell; mono eyebrow "VIEW ONLY · no data for your rank" (`font-mono` 11px/700 `$accent` UPPERCASE) above the title + body |
| `group` | `default` | No card shell; reduced gap/padding; same icon + title + body inline within a rank-group card |
| `group` | `console` | Same as group/default + mono eyebrow |

### States

- **static** — always static, non-dismissable (convention §"Gating": never a redirect or blocking scrim; controls behind it inert and zero data is the host's responsibility).
- No hover, no focus, no dismiss, no loading state. The component is pure presentational chrome.

---

## Tokens & type — exact design tokens + type-scale roles used

| Purpose | Token | Source |
|---|---|---|
| Card background | `bg-card` | `$card` — board 09 `fill:$card` |
| Card border | `border` / `ring-1 ring-border` | `$border` — board 09 `stroke:$border` |
| Card radius | `rounded-[--radius]` (10 px md) | `$radius` — board 09 `r:$radius` |
| Lock circle fill | `bg-primary/18` | `#ff008c2e` → `primary/18%` (design-tokens.md §4 reconciliation #4) |
| Lock icon | `text-primary` | `$primary` — board 09 `lock ($primary)` |
| Title | `text-foreground` | `$foreground` — board 09 `Inter/15px/700/$foreground` |
| Body | `text-muted-foreground` | `$muted-foreground` — board 09 `Inter/12px/normal/$muted-foreground` |
| Console eyebrow | `text-accent` | `$accent` — design-tokens.md §1.1 eyebrow role |

### Type-scale roles (design-tokens.md §1.1)

| Element | Role | Face | Size / weight |
|---|---|---|---|
| Title | `--text-subtitle` (dense list-row `CardTitle` step) | Inter | 15px / 700 |
| Body copy | `--text-caption` | Inter | 12px / 400–500 |
| Console eyebrow | `--text-eyebrow` | JetBrains Mono | 11px / 700 / UPPERCASE / `2px` tracking |

> Title uses the 15px step of `--text-subtitle`, which design-tokens.md §1.2 locks as "dense list-row `CardTitle`" — explicitly cited as a `CaptainLock` case.  
> No mono face on the default skin; the `console` skin adds one eyebrow line in JetBrains Mono (`font-mono`).

---

## Composition & deps — atoms/primitives + `@camp404/core` helpers

- **`IconBadge`** from `packages/ui/src/components/icon-badge.tsx` (PROMOTE, atom-iconbadge plan) — renders the 48 px (md) circle. Prop call: `<IconBadge icon={Lock} tone="primary" size="md" shape="circle" aria-hidden />`. The `Lock` icon is imported from `lucide-react`.
- **`cn`** from `packages/ui/src/lib/utils` — class merging.
- **`@camp404/core` `requireClearance`** — NOT consumed by `CaptainLock` itself. `CaptainLock` is a pure presentational component; `requireClearance` is the access-control helper used by the page/server layer to decide whether to render `CaptainLock` and withhold data. The component has zero domain-logic dependency. (Architecture plan §Hybrid extraction: `requireClearance` → `core`, plan 01.)
- No Radix primitives — the component is a plain `<div>` (surface scope) or `<p>`/`<aside>` wrapper (group scope).
- No `cva` needed — variant count is small enough to handle with `cn` + conditional classes.

**Dependency prerequisite:** `IconBadge` must be built (atom-iconbadge plan, build step 1) before `CaptainLock` can ship. The `bg-primary/18` tint is already an existing token; no new token is required by `CaptainLock` itself.

---

## Absorbs — candidates replaced (from the merge map)

From the merge map in `component-library.md`, the `IconBadge` merge map entry explicitly lists:

| Absorbed candidate | Location | Disposition |
|---|---|---|
| **CaptainLock lock-circle** | Board `09-captainlock.txt` — `LockCircle w:48 h:48 r:999 fill:#ff008c2e` | `CaptainLock` uses `<IconBadge size="md" shape="circle" tone="primary" icon={Lock}>` — the lock-circle becomes a composed `IconBadge` call, not a raw div |

Additional candidates that `CaptainLock` itself replaces (the bespoke inline hand-rolls):

| Absorbed inline pattern | Location | Disposition |
|---|---|---|
| Inline locked overlay div (lines 278–289) | `apps/web/app/captains/camp-management/camp-management-roster.tsx` | DELETE inline overlay; roster mounts `<CaptainLock>` instead. The blurred/opacity-40 table skeleton (`pointer-events-none opacity-40 blur-[2px]`) remains on the TABLE element (that is the host's preview-structure responsibility, not CaptainLock's); only the centred overlay card is replaced. |
| Hard `redirect("/")` for non-captains | `apps/web/app/captains/tools/page.tsx` | Remove redirect; render `<CaptainLock scope="surface" body="This tooling is captain-only. Your rank doesn't have clearance for these tools." />` in place of the tool list. |
| Hard `redirect("/")` for non-captains | `apps/web/app/captains/announcements/page.tsx` | Remove redirect; render `<CaptainLock scope="surface" body="VIEW ONLY · no data for your rank." />` (or default body) with no announcement data passed. |

`MemberReadOnly` / `RedactedID` / `LockedActions` (the terminal board's bespoke read-only panel, noted in surface 14 spec line 9 and component-library.md §Notes "DROPPED") are also replaced by `CaptainLock` + `CodeDisplay redacted` — but those are organisms, not part of this component's direct absorb list.

---

## Stories & tests

### Storybook stories (`packages/ui/src/components/captain-lock.stories.tsx`)

```
Default          — scope="surface" skin="default"; default title + body (mirrors board 09)
TitleBodyOverride — scope="surface" skin="default"; overrides title="Captains only" body="Camp management is visible to captains. Your rank doesn't include it." (mirrors S17)
ToolingOverride   — scope="surface" skin="default"; body="This tooling is captain-only. Your rank doesn't have clearance for these tools." (mirrors S19)
ConsoleSkin       — scope="surface" skin="console"; default title + body (mirrors S17 mobile / roster terminal)
GroupScope        — scope="group" skin="default"; no card shell, inline (mirrors home rank-group preview)
GroupConsoleSkin  — scope="group" skin="console"; "CAPTAIN · VIEW ONLY" eyebrow (mirrors S07 home captain section)
```

### Vitest / RTL test cases (`packages/ui/src/components/__tests__/captain-lock.test.tsx`)

1. **Renders without crash** — mounts `<CaptainLock />`, expects a DOM element.
2. **Default title rendered** — text "Captain access only" is in the document.
3. **Default body rendered** — the default clearance copy string is in the document.
4. **title prop overrides default** — pass `title="Captains only"`, expect that string; original default absent.
5. **body prop overrides default** — pass custom body string; expect it in the document.
6. **scope="surface" renders card shell** — element has `bg-card` class (or equivalent) and a border class.
7. **scope="group" does NOT render card shell** — same card background class is absent.
8. **skin="console" renders eyebrow** — "VIEW ONLY · no data for your rank" text visible; `font-mono` class present on that element.
9. **skin="default" does NOT render eyebrow** — "VIEW ONLY" text absent.
10. **Lock icon is aria-hidden** — the icon element has `aria-hidden="true"`.
11. **className merges** — extra `className="mt-4"` appears in rendered element's class list.
12. **Component is non-interactive** — no `button`, `a`, or element with `tabIndex >= 0` in the rendered output.

### a11y notes

- The component is a static informational region. It should carry `role="status"` or be wrapped in a live-region by the host surface when first mounting (so screen-reader users hear the lock message without having to navigate to it). `CaptainLock` itself does NOT auto-announce — it is the host's responsibility to manage focus or `aria-live` on the parent region.
- Title text at 15px/700 provides sufficient weight contrast for readability at dark-only palette values.
- The `Lock` icon is `aria-hidden`; the adjacent title "Captain access only" is the accessible label for the region. No separate `aria-label` is required on the container because the title is always rendered.
- No dismiss affordance: WCAG 2.1.2 (No Keyboard Trap) is trivially satisfied — there is nothing to trap focus on.
- The `console` skin eyebrow is UPPERCASE text; it must use `aria-label` or `aria-hidden` with adjacent visible equivalent to avoid all-caps reading issues. Recommended: render the eyebrow as a `<p>` with `aria-hidden="true"` and add a visually-hidden equivalent with normal casing, OR accept that "VIEW ONLY · no data for your rank" reads acceptably when uppercased (screen readers read characters, not visual styling). The spec treats it as an annotation (`$muted-foreground` eyebrow), so `aria-hidden` on the caps element + the title as the accessible heading is the simpler path.

---

## Build steps — ordered + acceptance criteria

### Step 0 — Prerequisite check: `IconBadge` exists

Confirm `packages/ui/src/components/icon-badge.tsx` is built and exported (atom-iconbadge plan, step 1–2). `CaptainLock` composes it; if `IconBadge` has not landed yet, stub the lock circle as `<span className="flex size-[46px] items-center justify-center rounded-full bg-primary/18 text-primary"><Lock className="size-5 aria-hidden" /></span>` and mark a TODO comment for the `IconBadge` swap.

**Acceptance:** `import { IconBadge } from "@camp404/ui"` resolves, OR a stub is documented.

### Step 1 — Create `packages/ui/src/components/captain-lock.tsx`

- Define `CaptainLockScope`, `CaptainLockSkin`, `CaptainLockProps` types (as above).
- Implement `scope="surface"` anatomy: a centred column `<div>` with `cn("flex flex-col items-center gap-2.5 rounded-[--radius] border bg-card p-6 text-center", className)`.
- Implement `scope="group"` anatomy: same column but without the `bg-card border rounded-[--radius] p-6` shell (bare `flex flex-col items-center gap-2.5`).
- `skin="console"` adds a `<p className="font-mono text-[11px] font-bold uppercase tracking-[2px] text-accent aria-hidden">VIEW ONLY · no data for your rank</p>` eyebrow above the title.
- `<IconBadge icon={Lock} tone="primary" size="md" shape="circle" aria-hidden />` renders the lock circle.
- Title: `<p className="text-[15px] font-bold text-foreground">{title ?? "Captain access only"}</p>`.
- Body: `<p className="text-xs text-muted-foreground leading-relaxed">{body ?? "This data is visible to captains. Your rank doesn't have clearance for this view."}</p>`.
- Export named: `CaptainLock`, `CaptainLockProps`, `CaptainLockScope`, `CaptainLockSkin`.

**Acceptance:** component renders all 4 variant combinations without error; no raw hex in any className string; no interactive elements present.

### Step 2 — Export from package barrel

- Add `export * from "./components/captain-lock"` to `packages/ui/src/index.ts`.

**Acceptance:** `import { CaptainLock } from "@camp404/ui"` resolves in a consuming package.

### Step 3 — Storybook stories

- Create `packages/ui/src/components/captain-lock.stories.tsx` with the 6 stories listed above.

**Acceptance:** Storybook builds without error; all 6 stories render visually; `Default` story matches board `09-captainlock.txt` anatomy (centred card, lock circle, title, body).

### Step 4 — Vitest / RTL tests

- Create `packages/ui/src/components/__tests__/captain-lock.test.tsx` with the 12 test cases listed above.

**Acceptance:** `pnpm test --filter @camp404/ui` passes green.

### Step 5 — Replace inline overlay in `camp-management-roster.tsx`

Replace lines 278–289 of `apps/web/app/captains/camp-management/camp-management-roster.tsx`:

```tsx
// BEFORE
{locked && (
  <div className="absolute inset-0 flex items-center justify-center">
    <div className="flex max-w-sm flex-col items-center gap-2 rounded-lg border bg-background/95 px-6 py-5 text-center shadow-sm">
      <Lock className="h-6 w-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">Captain access only</p>
      <p className="text-sm text-muted-foreground">
        Camp management data is visible to captains. Your rank doesn't have clearance for this view.
      </p>
    </div>
  </div>
)}

// AFTER
{locked && (
  <div className="absolute inset-0 flex items-center justify-center">
    <CaptainLock
      skin="console"
      title="Captains only"
      body="Camp management is visible to captains. Your rank doesn't include it."
      className="max-w-sm shadow-sm"
    />
  </div>
)}
```

Keep the `pointer-events-none select-none opacity-40 blur-[2px]` on the `<div>` wrapping the table — that is the host's preview-structure responsibility.  
Remove the `Lock` import from `lucide-react` if it is no longer used elsewhere in the file.

**Acceptance:** visual output matches board S17 + S26 reference; no inline `bg-background/95`, no `bg-emerald-500/15`, no `bg-amber-500/15` in the locked branch; Playwright/visual snapshot passes if present.

### Step 6 — Convert `captains/tools/page.tsx` hard redirect → preview-but-locked

Remove the `if (campUser.rank !== "captain") { redirect("/"); }` block from `apps/web/app/captains/tools/page.tsx`.

Pass the `isCaptain` flag down to the render and conditionally replace the tool list with `<CaptainLock body="This tooling is captain-only. Your rank doesn't have clearance for these tools." />`.

Pass the same `isCaptain` flag from the server — the data (`TOOLS` array) is a static source constant so no server data is withheld here, but the pattern must be consistent with the no-data grammar per surface 16 spec §"Locked (non-captain) state" invariant.

**Acceptance:** a non-captain user navigates to `/captains/tools`; the page renders chrome (GhostBack + Intro); the tool list is replaced by a `CaptainLock` panel; no redirect occurs; no tool cards (links) are rendered.

### Step 7 — Convert `captains/announcements/page.tsx` hard redirect → preview-but-locked

Remove the `if (campUser.rank !== "captain") { redirect("/"); }` block.

Pass `isCaptain` to `AnnouncementsManager`. When `isCaptain === false`, the server passes zero announcements and `AnnouncementsManager` renders `<CaptainLock />` in place of the composer + lists.

**Acceptance:** a non-captain user navigates to `/captains/announcements`; chrome renders; composer and list are replaced by `CaptainLock`; zero announcement data is present in the response; no redirect.

### Step 8 — CI / lint check

Run `pnpm lint --filter @camp404/ui` and `pnpm lint --filter apps/web`.

**Acceptance:** no new lint errors; no raw hex tints introduced; no `bg-background/95` or `emerald/amber` tints in any modified file.

---

## Consumers — which molecules/organisms/surfaces use CaptainLock

### Organisms (compose CaptainLock)

| Organism | Usage |
|---|---|
| **RankGroupCard** | Renders `<CaptainLock scope="group" ...>` inside a locked rank-group card on the home control panel. The `RankGroupCard` organism (app-local) gates `tiles` data before passing — zero tile data for locked groups. |
| **AnnouncementsManager** | Renders `<CaptainLock>` in place of the composer + list when `isCaptain === false`. |

### App surfaces (direct placement)

| Surface | File | Scope / skin |
|---|---|---|
| Roster (camp management) | `apps/web/app/captains/camp-management/camp-management-roster.tsx` | `scope="surface" skin="console"` — replaces the current inline overlay |
| Captain tools | `apps/web/app/captains/tools/page.tsx` | `scope="surface" skin="default"` — replaces the hard redirect |
| Captain announcements | `apps/web/app/captains/announcements/page.tsx` | `scope="surface" skin="default"` — replaces the hard redirect (via `AnnouncementsManager` prop) |
| Home rank-group (via `RankGroupCard`) | `apps/web/app/page.tsx` (via `RankGroupCard` organism) | `scope="group"` — locked Captain and Team Lead sections |

### Decision cross-references

- **Decision #3** (`component-library.md` Conventions §Gating): "preview-but-locked = `CaptainLock` + inert controls + zero data; never a redirect or blocking scrim." This component IS that treatment.
- **`flows.md` §3.3 invariant #2**: "Preview-but-locked withholds data server-side — `L` cells render shell + `CaptainLock`, server sends zero rows. Dimming a populated render is a data leak and is non-conformant."
- **Architecture plan** (`design/spec/impl/architecture.md`) §Phase 4: "Preview-but-locked conversion (plan 01): `/captains/tools` + `/captains/announcements` from hard-redirect → `requireClearance` + shell + `CaptainLock` (data withheld)." Steps 6–7 above land the presentation half of that conversion; `requireClearance` in `@camp404/core` is the complementary logic-layer gate.
