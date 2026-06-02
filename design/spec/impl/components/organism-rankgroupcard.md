# RankGroupCard — organism plan

- **mapsTo:** **NEW** (app-local) — `component-library.md §RankGroupCard`: "GroupHead (IconBadge chip + name + tool-count) + 2-col GridTile grid. Locked higher-rank groups render CaptainLock + zero data."
- **Home:** **`apps/web`** (app-local organism — owns the home tile catalogue + clearance gating; not a `@camp404/ui` reusable). The board references it as a NEW per-surface component (`06-home.md §Components used → New (this surface): RankGroupCard`).
- **Target file:** `apps/web/app/home/rank-group-card.tsx` (server component) — co-resident with the rest of the home control panel (`customize-mode.tsx`, the home page composition). The home route file is `apps/web/app/page.tsx`.

> Why app-local, not `@camp404/ui`: RankGroupCard composes the app's home tile catalogue (Camp Management → `/captains/camp-management`, etc.), threads route hrefs, and decides locking from `ViewerRank` — surface-specific domain knowledge that does not belong in the presentation package (architecture.md §`@camp404/ui` "presentation only — no data-access, no `next/*`"). Its reusable parts (`GridTile`, `IconBadge`, `CaptainLock`, `Badge`) live in `@camp404/ui`; the *assembly + gating* is the app's job.

---

## Current state — what exists today (the old design's component/route markup)

The home control panel today is the **layered-quadrant** model, which the redesign **drops** (`06-home.md §Divergences #1`: "adopt the S08 rank-group cards (boards win); drop the quadrant/layer-tab model and the `ControlPanel` component"). There is **no `RankGroupCard`** anywhere — no file in `apps/web/app/home/` (the directory does not exist), no equivalent in `packages/ui`.

What renders the rank-grouped IA today:

| File | What it renders | Disposition |
|---|---|---|
| `apps/web/app/page.tsx:79-90` | Mounts `<ControlPanel layers={homeLayers} viewerRank={viewerRank} header={<HomeHeader …/>} centre={{ label: "TALK" }} />` — one layered 2×2 quadrant panel with a rank `LayerTabBar` and a centre **TALK** mic button | **REPLACE** the `ControlPanel` mount with a stack of three `RankGroupCard`s; **DROP** the centre `TALK` button (decision 5 — voice is field-level only). |
| `apps/web/app/page.tsx:92-181` | `homeLayers: ControlPanelLayer[]` — three layers (`camp_member` / `team_lead` / `captain`), each four `ControlPanelQuadrant`s (label/hint/href/icon). Dead links present: `My Teams → /members`, `My Tasks → /meals`, `My Profile → /onboarding/questionnaire` | **REPLACE** with the board's tile catalogue (`06-home.md §M2a/b/c`); fix the dead links — `My Profile → /profile` (OQ#1), future-destination tiles rendered inert, not wired to 404s (`06-home.md §"Future tiles must not pretend to navigate"`). |
| `packages/ui/src/components/control-panel.tsx` | The `ControlPanel` organism + private `QuadrantTile`; `:13` `ControlPanelRank`, `:16` `RANK_ORDER`, `:31` `rankLevel`, `:118` `unlocked = rankLevel(viewerRank) >= rankLevel(layer.rank)` (the canonical clearance comparator), `:300` per-quadrant `Lock` icon | **DELETE** (`component-library.md`: "DEAD to DELETE: control-panel, control-grid, quadrant-nav"). The `rankLevel`/`RANK_ORDER` comparator **EXTRACTs to `@camp404/core`** before deletion (architecture.md §Hybrid; service-layer 01 step 4) — RankGroupCard's locking inherits it from `core`, not from this dead file. |
| `apps/web/app/page.tsx:73-78` | `viewerRank` ternary (`rank==="captain" ? "captain" : isTeamLead ? "team_lead" : "camp_member"`) | **REUSE → `core.deriveViewerRank`** (service-layer 01 step 4). RankGroupCard receives the computed `viewerRank` from the page; it does not derive it. |
| `apps/web/app/home-header.tsx` (57 lines) | `HomeHeader` — wordmark + bell + avatar, passed as `ControlPanel header` | **PROMOTE → `TopChrome`** (`molecule-topchrome.md`). Not part of RankGroupCard; it is a sibling in the home composition. |

The clearance *presentation* (per-layer lock + `Lock` icon) exists in `control-panel.tsx:300` but at **layer/quadrant scope** with a redirect-free dim. The redesign moves this to **group scope** with `CaptainLock` + **zero data** (decision 3 — a security boundary, not visual dimming). RankGroupCard is the NEW container that owns that group-scoped gating.

**Classification: NEW (app-local).** Build it fresh against board `17-s08-control-panel.txt` (`06-home.md §M2`). The dead `ControlPanel` quadrant model is deleted; nothing migrates structurally.

---

## Composition — leaves, core helpers, services, server/client split

### Leaf components it consumes (link plan files)

| Leaf | Package | Plan | Role in RankGroupCard |
|---|---|---|---|
| **GridTile** | `@camp404/ui/components/grid-tile` | [molecule-gridtile.md](./molecule-gridtile.md) | The tool tile. 2 per `Row`, 4 per group. Props threaded per tile: `icon`, `iconTone`, `title`, `hint`, `badge?`, `href?`, `disabled`. In Customize mode wrapped by `DraggableTileRow` via its `dragHandle` slot (that wrapping is `CustomizeMode`'s job, not RankGroupCard's). |
| **IconBadge** | `@camp404/ui/components/icon-badge` | [atom-iconbadge.md](./atom-iconbadge.md) | The GroupHead chip — 30×30 rounded tinted square holding the group icon. Board draws `w:30 h:30 r:8`; snap to `IconBadge size="sm" shape="rounded"` (34px sm step, `atom-iconbadge.md §Sizes`). Tone per group: `primary` (Captain), `accent` (Team Lead), `secondary` (Team Member). |
| **CaptainLock** | `@camp404/ui/components/captain-lock` | [molecule-captainlock.md](./molecule-captainlock.md) | Rendered **inside a locked group** at `scope="group"` (no card shell) with `skin="console"` for the "VIEW ONLY · no data for your rank" eyebrow (`06-home.md §M2 gating`, `molecule-captainlock.md §Consumers → RankGroupCard`). Replaces the group's grid entirely when locked. |
| **Badge** | `@camp404/ui/components/badge` | [atom-badge.md](./atom-badge.md) | (Indirect) the per-tile count pill lives inside `GridTile` (`molecule-gridtile.md`), and the GroupHead's `N tools` count is plain text, not a Badge — see API. Listed for completeness; RankGroupCard does not mount `Badge` directly. |

Group icon set (per `06-home.md §M2 GroupHead` + OQ#7), all `lucide-react`:
- Captain → `Shield` · tone `primary`
- Team Lead → `UserCog` · tone `accent`
- Team Member → `User` · tone `secondary`

Per-tile icons (`06-home.md §M2a/b/c` + OQ#7 icon map): Camp Management `Shield`, Camp Tasks `ClipboardList`, Finances `Wallet`, Camp Tools `Megaphone`, Crew Roster `Users`, Crew Tasks `ClipboardList`, Crew Forms `FileText`, Crew Announcements `Megaphone`, My Teams `Users`, My Tasks `ListChecks`, My Profile `UserRound`, Tools `Wrench`.

### `@camp404/core` helpers

RankGroupCard is **presentational** for its own anatomy but is gated by `core` clearance logic. It does **not** import `@camp404/db` or call SQL.

| Helper | Source | Use |
|---|---|---|
| `rankLevel` / `RANK_ORDER` | `@camp404/core` (EXTRACTed from `control-panel.tsx:31`; architecture.md §Hybrid, service-layer 01 step 4) | The clearance comparator. A group is unlocked iff `rankLevel(viewerRank) >= rankLevel(group.rank)` (`06-home.md §Rank-gating`). |
| `requireClearance(viewerRank, requiredRank)` | `@camp404/core` (NEW — service-layer 01 §Target API) | Returns `{ cleared, viewerRank, requiredRank }`. The **single preview-but-locked decision**. The page (or RankGroupCard's parent) calls it per group to decide `locked` + whether to pass tile data. |
| `deriveViewerRank({ rank, isTeamLead })` | `@camp404/core` (NEW — service-layer 01 step 4) | Computes `ViewerRank` from stored `rank` + derived team-lead. Called by `apps/web/app/page.tsx`, **not** by RankGroupCard — the page passes the result down. |
| `ViewerRank` type | `@camp404/types` (`roles.ts`, NEW — architecture.md §types additions) | `camp_member ｜ team_lead ｜ captain`. RankGroupCard's `viewerRank` prop type. |

> Locking decision can live either in the page (compute `locked` per group, pass tiles or `[]`) **or** inside RankGroupCard given `viewerRank`. **Recommended:** the **page** computes `cleared` via `requireClearance` and withholds tile data server-side (passes `tiles: []` + `locked: true`), because **data-withhold is a server boundary** (`06-home.md §"Preview-but-locked must return NO data"`; `flows.md §3.3 invariant #2`: dimming a populated render is a data leak). RankGroupCard then only needs `locked` to choose `CaptainLock` vs grid — it never receives locked-group data to leak.

### Services / server-actions it calls

**None directly.** RankGroupCard fetches nothing and calls no server action. It is rendered with data the home page (`page.tsx`) has already gated and resolved. The data sources that feed its props (page-side, all server reads):

| Prop source | Read (service-layer plan) | Notes |
|---|---|---|
| `viewerRank` | `deriveViewerRank(rank, isTeamLead)` where `isTeamLead` ← `isTeamLead(userId)` (`packages/db/roster.ts:204`, service-layer 01) | Drives unlock per group. |
| per-tile `badge` counts (unlocked groups only) | **Future** — `06-home.md §Data`: Camp/Crew/My Tasks from `tasks`; My Teams from `team_memberships`. These destinations are **not yet built**; badges are illustrative until the read lands. RankGroupCard accepts `badge?` per tile and renders it when truthy; the page supplies `undefined` until the count read exists. | No service call this pass; the prop is wired-ready. |
| locked-group tiles | **zero data** — page passes `tiles: []` for locked groups (no badge counts, no real hints). | Security boundary (decision 3). |

There is **no form** in RankGroupCard — no action, no validation. (The only async action on the home surface is `EnablePush`, a sibling component, not this organism.)

### Server-component vs `"use client"` split

- **RankGroupCard is a server component (no `"use client"`).** It is static structure rendered from already-resolved props (`06-home.md §States Loading`: "server-rendered; the page awaits all reads… so there is no client skeleton for the panel"). It has no state, no event handlers in the populated/locked view.
- The **leaves it mounts** carry their own directives: `GridTile` is `"use client"` (interactive `<button>`/`<a>`, `molecule-gridtile.md §Build step 1`); `IconBadge`/`CaptainLock` are presentational (no client directive required). A server component may render client-component children — RankGroupCard stays a server component and lets `GridTile` be the client boundary.
- **Customize mode is a separate client organism** (`CustomizeMode` / `DraggableTileRow`, `apps/web/app/home/customize-mode.tsx`) — it owns the drag state machine and `"use client"`. RankGroupCard's static grid is **swapped for** the Customize editor when active (`06-home.md §M5 RECONCILE`: "Customize mode is a toggled state… the editing presentation of the same tile set"). RankGroupCard itself does not own the toggle or the drag state; the home page (a client wrapper around the toggle) decides which to render. RankGroupCard accepts an optional `customizing` flag and, when set, renders its tiles as `DraggableTileRow`s (delegating to the `CustomizeMode` sub-components) instead of static `GridTile`s — or, simpler, the page renders `CustomizeMode` in place of the `RankGroupCard` stack while editing. **Recommended:** the latter (cleaner server/client split) — RankGroupCard stays purely the populated/locked renderer; CustomizeMode is the editor. See `molecule-gridtile.md §Consumers` + the `CustomizeMode` plan.

---

## API & data flow — props/inputs, fetch vs receive, state flow

### Props (TypeScript)

```ts
import type { LucideIcon } from "lucide-react";
import type { IconBadgeTone } from "@camp404/ui/components/icon-badge";
import type { ViewerRank } from "@camp404/types"; // "camp_member" | "team_lead" | "captain"

/** A single tool tile within a rank group (the data the page resolves per tile). */
export interface RankGroupTile {
  /** Lucide icon for the GridTile head IconBadge. */
  icon: LucideIcon;
  title: string;
  hint?: string;
  /** Count badge — truthy renders the pill; undefined/0 hides it. Withheld (undefined) for locked groups. */
  badge?: number | string | null;
  /** Destination route. Absent → inert/coming-soon tile (future destination not yet built). */
  href?: string;
  /** True for future-destination tiles whose route is not built yet → rendered inert. */
  comingSoon?: boolean;
}

export interface RankGroupCardProps {
  /** Which rank group this card represents — drives the clearance comparison + chip identity. */
  rank: ViewerRank; // "captain" | "team_lead" | "camp_member"
  /** Human label — "Captain", "Team Lead", "Team Member". */
  name: string;
  /** GroupHead chip icon (Shield / UserCog / User). */
  icon: LucideIcon;
  /** GroupHead chip tone (primary / accent / secondary). */
  chipTone: IconBadgeTone;
  /**
   * The tiles to render. For LOCKED groups the page passes [] (zero data) — the
   * card renders CaptainLock instead of the grid. For unlocked groups, 4 tiles.
   */
  tiles: RankGroupTile[];
  /**
   * Locked = preview-but-locked. When true: render GroupHead structure + a group-scope
   * CaptainLock in place of the grid; no tile data is present (page already withheld it).
   * Computed page-side via requireClearance(viewerRank, rank).cleared === false.
   */
  locked: boolean;
  /**
   * Derived tool count shown at GroupHead right ("4 tools"). Equals tiles.length for
   * unlocked groups; for locked groups, suppressed or shown as the generic group size
   * (recommend: omit the count for locked groups so no real cardinality leaks — see States).
   */
  toolCount?: number;
  className?: string;
}
```

### What it fetches vs receives

- **Fetches: nothing.** RankGroupCard receives all props from `apps/web/app/page.tsx`.
- **Receives:** `rank` + `name` + `icon` + `chipTone` (static identity from the home catalogue), `tiles` (resolved + gated server-side), `locked` (from `requireClearance`), `toolCount` (derived `tiles.length`).
- **Page-side data flow (the home composition, `page.tsx`):**
  1. Gating spine runs (auth → invite → required-actions → approval). Any fail → redirect (`06-home.md §Gating states`).
  2. `viewerRank = deriveViewerRank({ rank: campUser.rank, isTeamLead: await isTeamLead(campUser.id) })`.
  3. For each of the three groups: `const { cleared } = requireClearance(viewerRank, group.rank)`. If `cleared`, resolve `tiles` (with badge counts where reads exist); else `tiles = []`, `locked = true`.
  4. Render `<RankGroupCard rank icon chipTone name tiles locked toolCount={cleared ? tiles.length : undefined} />` ×3, captain-first.

### State flow

RankGroupCard is **stateless**. All state is upstream: clearance decided server-side (`requireClearance`), Customize toggle owned by the page's client wrapper, push permission owned by the sibling `EnablePush`. The card is a pure function of its props.

---

## States — every state incl. the global matrix + gating

| State | Trigger | Render |
|---|---|---|
| **Populated (unlocked)** | `locked === false`, `tiles.length > 0` | GroupHead (IconBadge chip `chipTone` + `name` + `N tools` text) + 2-col grid of interactive `GridTile`s; real badge counts where available; built-destination tiles navigate, future tiles inert. |
| **Preview-but-locked** (captain/rank surface) | `locked === true` (`requireClearance(...).cleared === false`) | GroupHead structure renders (chip + name); the **grid is replaced by `<CaptainLock scope="group" skin="console" />`** ("VIEW ONLY · no data for your rank"); **zero tiles**, **zero badge counts**, all controls inert. The page withheld tile data server-side — nothing to dim. Tool-count omitted (no cardinality leak). This is a **security boundary**, not visual dimming (`06-home.md §"Preview-but-locked must return NO data"`; `flows.md §3.3 invariant #2`). |
| **Empty (unlocked, zero tiles)** | `locked === false`, `tiles.length === 0` (e.g. all tiles moved out in Customize, or a user-created/Pinned group emptied) | GroupHead + `0 tools` + an empty grid (or, for Pinned/new groups, the `DropZone` rendered by CustomizeMode). RankGroupCard itself renders an empty grid; the `DropZone` belongs to Customize mode. |
| **Loading** | Page awaits all reads before returning | **No client skeleton** — the panel is server-rendered after data resolves (`06-home.md §States Loading`). RankGroupCard never renders a loading shimmer. |
| **Error** | A page-side read throws | Handled by the route/error boundary (`apps/web/app/error.tsx` / segment boundary), **not** by RankGroupCard. The card receives only resolved data; it has no error state of its own. |
| **Submitting / Success** | N/A | No form, no submit in RankGroupCard (`06-home.md §States`: "N/A for the panel"). |
| **Disabled / inert tiles** | A tile is `comingSoon` (future destination) or in a locked group | `GridTile disabled` (`opacity-50 pointer-events-none`, `aria-disabled`), no `href`/handler — never a dead `<a href>` that 404s (`06-home.md §"Future tiles must not pretend to navigate"`). |
| **Customize (editing)** | Page toggles Customize | RankGroupCard's static grid is **swapped for** the `CustomizeMode` editor (recommended split) — tiles become `DraggableTileRow`s; locked groups stay preview and are **not** drop targets (`06-home.md §OQ#4` recommend: unlocked-only). |

### Gating matrix (the spine runs before this surface — page-level, not RankGroupCard)

`06-home.md §Gating states`: signed-out → `LandingHero`; invite-gated → `/signup/required`; onboarding-incomplete → `/onboarding/questionnaire`; pending/rejected → `/pending-approval`. RankGroupCard renders **only after** all gates pass — it never handles the spine. Its only gating responsibility is the **per-group rank lock** (preview-but-locked), driven by the `locked` prop.

Clearance truth table (the `locked` value per group × viewer):

| viewerRank | Captain group | Team Lead group | Team Member group |
|---|---|---|---|
| `captain` | unlocked | unlocked | unlocked |
| `team_lead` | **locked** | unlocked | unlocked |
| `camp_member` | **locked** | **locked** | unlocked |

(Matches `06-home.md §Rank-gating`: "a group is unlocked iff `viewerRank ≥ group.rank`".)

---

## Build steps — ordered, with prerequisites + acceptance + tests

### Prerequisites (must land first)

- **P0 — Foundations tokens/fonts** (`foundations-tokens.md`, architecture Phase 0): status tokens, `--text-*`/`--font-*`, radius scale. Gates every leaf's tokens.
- **P0 — `@camp404/core` scaffold + types** (architecture Phase 1; service-layer 01 steps 1, 4): `ViewerRank` in `@camp404/types`; `rankLevel`/`RANK_ORDER` EXTRACTed; `deriveViewerRank` + `requireClearance` NEW in `core`. RankGroupCard's gating depends on these.
- **Leaf P0s:** `IconBadge` ([atom-iconbadge.md](./atom-iconbadge.md) step 1–2) → unblocks GroupHead chip + GridTile + CaptainLock; `Badge` ([atom-badge.md](./atom-badge.md)) → unblocks GridTile count pill; `GridTile` ([molecule-gridtile.md](./molecule-gridtile.md)) → the grid cell; `CaptainLock` ([molecule-captainlock.md](./molecule-captainlock.md), incl. `scope="group"` + `skin="console"`) → the locked-group treatment. `RankGroupCard` cannot ship before all four leaves land.

### Step 1 — Define the home tile catalogue
In `apps/web/app/home/` define the static three-group catalogue (rank · name · icon · chipTone · per-tile icon/title/hint/href/comingSoon) from `06-home.md §M2a/b/c` + the OQ#7 icon map. Fix the dead links: `My Profile → /profile` (OQ#1), `Camp Tools → /captains/tools`; mark Camp Tasks / Finances / Crew Roster / Crew Tasks / Crew Forms / Crew Announcements / My Teams / My Tasks as `comingSoon` (no href).
**Acceptance:** catalogue has exactly 3 groups × 4 tiles; no `href` points at an unbuilt route; built routes resolve (`/captains/camp-management`, `/captains/tools`, `/profile`, `/tools`).

### Step 2 — Build `apps/web/app/home/rank-group-card.tsx` (server component)
Compose: GroupHead (`<IconBadge icon={icon} tone={chipTone} size="sm" shape="rounded" />` + `name` in Inter 15/700 + `toolCount` "N tools" in Inter 12/500 muted, omitted when `locked`); when `locked` render `<CaptainLock scope="group" skin="console" />` in place of the grid; else render a 2-col grid (`grid grid-cols-2 gap-3`) of `<GridTile … iconTone={chipTone} disabled={tile.comingSoon} />`. Card shell: vertical, gap 14, pad 14, `rounded-[--radius]`, `bg-muted`, `border border-border` (`06-home.md §M2`). No `"use client"`. Short-form tokens only; no raw hex.
**Acceptance:** unlocked render shows 4 tiles + correct chip tone + derived count; locked render shows GroupHead + group-scope CaptainLock + **zero** GridTiles and **no** count; no raw hex / verbose token classes.

### Step 3 — Wire into the home page (`apps/web/app/page.tsx`)
Replace the `<ControlPanel … centre={{ label: "TALK" }} />` mount with `<TopChrome …/>` + a vertical stack of three `<RankGroupCard>` (captain-first), each gated by `requireClearance(viewerRank, group.rank)`; pass `tiles: []` + `locked: true` for non-cleared groups (server-side data withhold); pass real tiles otherwise. Drop the `TALK` centre button (decision 5). Add the `Divider` + `EnablePush` siblings below the stack (`06-home.md §M4/M6`).
**Acceptance:** captain sees 3 unlocked groups; team-lead sees Team Member + Team Lead unlocked, Captain locked; member sees only Team Member unlocked. Locked groups carry **no** tile/badge data in the server response (assert no payload). No `TALK` button. No dead `<a href>` that 404s.

### Step 4 — Customize-mode handoff (separate organism)
Confirm the page renders `CustomizeMode` in place of the RankGroupCard stack while editing (recommended split); locked groups are not drop targets (OQ#4). Tracked in the `CustomizeMode` plan; this step only verifies RankGroupCard stays the populated/locked renderer and is unmounted (not edited) during Customize.
**Acceptance:** toggling Customize swaps to the editor; exiting returns to the RankGroupCard stack; locked groups never become drop targets.

### Step 5 — Delete the dead `ControlPanel`
After Step 3, the `ControlPanel` mount is gone. Delete `packages/ui/src/components/control-panel.tsx` (and `control-grid.tsx`, `quadrant-nav.tsx`) per the DELETE list — but **only after** `rankLevel`/`RANK_ORDER` have been EXTRACTed to `core` (service-layer 01 step 4) so no consumer regresses.
**Acceptance:** no `ControlPanel` import remains in `apps/web`; `rankLevel` resolves from `@camp404/core`; `pnpm build` + `pnpm lint` green.

### Tests

| Test | Type | Assertion |
|---|---|---|
| Unlocked render | RTL (jsdom) | 4 `GridTile`s present; GroupHead chip has `chipTone` fill; "4 tools" text present. |
| Locked render shows CaptainLock | RTL | `CaptainLock` present (`VIEW ONLY · no data for your rank`); **zero** GridTiles; no count text. |
| Locked render leaks no tile data | RTL/unit | Given `locked` + `tiles=[]`, no tile title/badge string appears in the DOM. |
| Coming-soon tile is inert | RTL | A `comingSoon` tile renders as `aria-disabled` `<div>`, no `href`. |
| Empty unlocked group | RTL | `tiles=[]`, `locked=false` → "0 tools" + empty grid, no CaptainLock. |
| `requireClearance` gating matrix | unit (`@camp404/core`) | captain clears all 3; team_lead clears member+lead not captain; member clears only member (service-layer 01 step 4 test). |
| Page-level data-withhold (E2E) | Playwright via `E2E_TEST_MODE` | Login as `rank:"member"` → home returns 200, Captain + Team Lead groups render CaptainLock, **no** captain/lead tile payload in the HTML; as `rank:"captain"` → all groups populated. Mirrors `flows.md §3.3 invariant #2`. |
| No `TALK` button | E2E/RTL | No element labelled "TALK" on the home route. |
| a11y | RTL/axe | GroupHead icon `aria-hidden`; locked group's `CaptainLock` is the accessible explanation; inert tiles not focusable. |

---

## Consumers — which surfaces mount it

| Surface | File | How it mounts RankGroupCard |
|---|---|---|
| **Home (control panel)** — surface 06 | `apps/web/app/page.tsx` (route `/`, authenticated) | The **sole** consumer. Mounts three `RankGroupCard`s (Captain, Team Lead, Team Member), captain-first, inside the vertical scroll content under `TopChrome`, above the `Divider` + `EnablePush`. Each card is gated by `requireClearance`; locked higher-rank groups render `CaptainLock` + zero data. (`06-home.md §M2`; `component-library.md §RankGroupCard "Used by: home control panel"`.) |

No other surface uses RankGroupCard — it is home-exclusive (the rank-grouped tool launcher IA is unique to the control panel). Future member/crew surfaces, if built, get their own organisms rather than forking this one.
