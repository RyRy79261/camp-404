# CustomizeMode — organism plan

- **mapsTo:** **NEW** (app-local; per `component-library.md` §CustomizeMode "NEW (app-local)"). The board introduces functionality that **does not exist in the live app at all** (the live home is a layered-quadrant `ControlPanel` with no customisation — surface 06 Divergence #4). It is home-exclusive and not a reusable `@camp404/ui` primitive.
- **Home:** **`apps/web`** (NOT `packages/ui`). It composes app-local rank/tile state and is mounted only by the home route; `component-library.md` and `molecule-gridtile.md` §Consumers both pin it to `apps/web/app/home/customize-mode.tsx`.
- **Target file:** `apps/web/app/home/customize-mode.tsx` (`"use client"`). Sub-components live beside it in the same `apps/web/app/home/` folder (created with this work): `draggable-tile-row.tsx`, `drop-slot.tsx`, `pinned-group.tsx`, `new-group-affordance.tsx` — OR co-located in `customize-mode.tsx` as un-exported components. The folder is NEW (`ls apps/web/app/home` → does not exist today; home logic lives in `apps/web/app/page.tsx` + `home-header.tsx` + `landing-hero.tsx` at the `app/` root).

> **Persistence is client-side only (LOCKED decision #4 — no new table).** The whole reorder/pin/group state lives in `localStorage`/cookie, never a server write. The redesign's *only* schema change is `captain_promotion_requests` (architecture.md §"The one schema change"); home-layout customisation is presentation state and **must not** introduce a table. Surface 06 §"Data & enums" NEW + §"Validation: Customize persistence ceiling" + Open Question #3 all confirm this.

---

## Current state — what exists today (the old design's component/route markup), cite files

**There is no Customize mode in the shipped app.** Confirmed by reading the live tree:

- `apps/web/app/page.tsx` — the home route. Renders `<ControlPanel layers={homeLayers} viewerRank={…} centre={{ label: "TALK" }} />` + `<EnablePush />`. It is the **layered-quadrant model**: a single 2×2 `QuadrantTile` grid with a bottom `LayerTabBar` (Me / Team Lead / Captain) switching one layer at a time, plus a centre push-to-talk `TALK` button. There is **no Customize pill, no drag, no reorder, no pinned group, no rank-group cards.** `homeLayers` is a static three-layer array (member/team_lead/captain), each with four hard-coded quadrants — note the dead links `My Teams → /members`, `My Tasks → /meals`, `My Profile → /onboarding/questionnaire` (surface 06 Divergence #5 flags these).
- `packages/ui/src/components/control-panel.tsx` — the `ControlPanel` organism it consumes (DEAD, on the DELETE list per CLAUDE.md "DEAD to DELETE: control-panel, control-grid, quadrant-nav"). Holds `ControlPanelRank = "camp_member" | "team_lead" | "captain"`, `RANK_ORDER`, and `rankLevel()` (lines 13–33) — these move to `@camp404/core` per architecture.md (identity-access plan 01) and are the clearance ladder CustomizeMode's host inherits. `QuadrantTile` (lines 285–363) is the closest live analogue to a draggable tile but is corner-aligned quadrant geometry, **not** the board's row geometry — it dies with the file.
- `packages/ui/src/components/control-grid.tsx` — holds a private unexported `GridTile` (lines 122–181) inside the dead `ControlGrid`. Also DELETE. No drag handle, no reorder. (`molecule-gridtile.md` §Current state documents this.)
- `apps/web/app/home-header.tsx` — the live right-cluster header (Bell + Avatar). Functionally equivalent to the spec's `TopChrome`; reconciled onto `TopChrome` separately (surface 06 OQ#8). **Not** part of CustomizeMode.

**No drag-and-drop library is installed.** `apps/web/package.json` has no `@dnd-kit/*`, `react-dnd`, or equivalent (verified). A drag mechanism is a NEW prerequisite (see Build steps §P-DND).

**Classification: NEW.** Build the entire editor (shell + 4 sub-components + client persistence) fresh in `apps/web/app/home/`. The only thing reused is `GridTile` (`@camp404/ui`, PROMOTE) inside `DraggableTileRow` via its `dragHandle` slot, and the rank ladder (`@camp404/core`).

---

## Composition — leaf components, core helpers, services; server/client split

### Server vs client split

CustomizeMode is **entirely `"use client"`.** It owns drag interaction state (pointer/keyboard), local reorder/pin/group state, and `localStorage` reads/writes — all browser-only. It is rendered **inside** the home route's client island, not on the server.

- **Server (`apps/web/app/page.tsx`, server component):** runs the gating spine, derives `viewerRank` via `core.deriveViewerRank`, fetches live data (unread count, per-tile derived badge counts where built), and passes the **default board tile/group definitions** + `viewerRank` down. It does **not** read `localStorage` (not available server-side) and does **not** persist layout.
- **Client (`CustomizeMode` + its parent client island):** hydrates the server-provided defaults, then overlays the user's persisted layout from `localStorage` on mount (so SSR shows the default board; first client paint reconciles to the saved layout — accept a one-frame default flash, or gate the customised render behind a mounted flag to avoid hydration mismatch). Customize toggle, drag, pin, new-group, and Done all run client-side.

### Leaf components it consumes (link plan files)

| Leaf | Plan | Package / path | Role in CustomizeMode |
|---|---|---|---|
| **GridTile** | [`molecule-gridtile.md`](./molecule-gridtile.md) (PROMOTE) | `@camp404/ui` · `packages/ui/src/components/grid-tile.tsx` | Wrapped by `DraggableTileRow` via the `dragHandle` slot. NOTE: the board's Customize **rows** are a denser horizontal layout (grip + icon + title + MOVING chip) than the populated `GridTile` card — `DraggableTileRow` may either (a) drive `GridTile` in a compact mode via `dragHandle` + `className`, or (b) be a thin bespoke row that reuses `IconBadge`/`Badge` directly. RECOMMEND (b) for the dense reorder row (the board geometry differs enough), reserving `GridTile` for the populated grid in `RankGroupCard`. Document the choice in the build. |
| **IconBadge** | [`atom-iconbadge.md`](./atom-iconbadge.md) (PROMOTE) | `@camp404/ui` · `icon-badge.tsx` | The per-tool icon inside a `DraggableTileRow` (tool icon `$primary`) and the section-header icons (`sliders-horizontal` `$accent`, `star` `$accent`). |
| **Badge** | [`atom-badge.md`](./atom-badge.md) (PROMOTE) | `@camp404/ui` · `badge.tsx` | The **MOVING** chip (`accent/15%` fill, `MOVING` mono/uppercase `$accent`) on the picked-up row, and the Pinned member-count chip. |
| **Divider** | [`atom-divider.md`](./atom-divider.md) (NEW) | `@camp404/ui` · `divider.tsx` | M4 rule between the rank-group region and the Customize/EnablePush region (lives on the home route, not strictly inside the card, but adjacent). |

### NEW sub-components (app-local, built with this organism)

Per `component-library.md` §CustomizeMode "Sub-components (NEW, app-local)" + surface 06 §"New (this surface)":

| Sub-component | Anatomy (surface 06 M5) | State |
|---|---|---|
| **DraggableTileRow** (`draggable-tile-row.tsx`) | Row `pad:[11,12] r:8`; `$card` fill + `$border` stroke at rest, **`$accent` stroke + `op:0.97`** while moving. `grip-vertical` handle (`$muted-foreground` rest / `$accent` moving) + tool icon (`$primary`) + title (Inter 13/600) + **MOVING** Badge while moving. | `idle` · `moving` |
| **DropSlot** (`drop-slot.tsx`) | Interstitial insertion indicator `pad:[10,0]` centered `r:8`, `accent/8%` fill (`#00dcff14`), `$accent` stroke; `corner-left-down` icon + "Drop here" (Inter 12/600 `$accent`). | shown only at the valid insertion index under the dragged tile |
| **PinnedGroup** (`pinned-group.tsx`) | Accent-highlighted card `pad:12 r:8`, `accent/12%` fill (`#00dcff1f`), `$accent` stroke. Header `star` (`$accent`) + "Pinned" (Inter 14/700) + count Badge. Contains pinned `DraggableTileRow`s. Foot = **DropZone** `pad:[12,0]` centered `r:7`, `accent/15%` fill (`#00dcff26`), `$accent` stroke; `plus` + "Release to add to Pinned" (shown while a tile is dragged over it). | empty (DropZone-only) · populated · drag-over (DropZone highlighted) |
| **NewGroupAffordance** (`new-group-affordance.tsx`) | Ghost/dashed add button `pad:[11,0]` centered `r:8`, transparent fill, `$muted-foreground` stroke, `op:0.8`; `plus` + "New group". | idle · creates an empty user-defined group (a new drop target) |

> Token reconciliations come from design-tokens.md §4: `#00dcff26 → accent/15%`, `#00dcff1f → accent/12%`, `#00dcff14 → accent/8%`, `#00dcff26 (icon wrap) → accent/15%`. **Captain/accent identity = `$accent`** (decision #6). No raw hex; no `[color:var(--color-*)]` verbose form (P1-5).

### Sibling organism (not consumed, but co-rendered on the same surface)

- **RankGroupCard** (NEW, app-local, `apps/web/app/home/rank-group-card.tsx`) — the populated rank-group view. Surface 06 M5 RECONCILE: "Customize mode is a **toggled state** — entering it converts the grid tiles into draggable rows." So the home route swaps `RankGroupCard` (populated) ⇄ `CustomizeMode` (editor) on the Customize toggle. They share the same tile model. CustomizeMode does **not** render RankGroupCard; the host route picks one or the other. (RankGroupCard has no standalone plan file yet — its `GridTile` wiring is tracked in `molecule-gridtile.md` §Build Step 6.)

### `@camp404/core` helpers

CustomizeMode is largely presentation + client state, but inherits the rank ladder for the locked-group rule:

| Helper | Source | Use |
|---|---|---|
| `rankLevel` / `RANK_ORDER` | `@camp404/core` (EXTRACTED from `control-panel.tsx:31` — architecture.md / plan 01) | Determine which groups are unlocked → which tiles are reorder/pin/drop-eligible (surface 06 §"Customize on locked groups": recommend **unlocked-scope only**; locked groups stay preview and are NOT drop targets). |
| `ViewerRank` | `@camp404/core` (or `@camp404/types` — plan 01 §Hybrid note) | Type of the `viewerRank` prop. |
| `requireClearance` / `deriveViewerRank` | `@camp404/core` (plan 01) | Consumed by the **host route** (`page.tsx`), not by CustomizeMode directly — the route derives `viewerRank` and passes only unlocked tiles into the editable set. |

> Per architecture.md §layering, `core` is pure (types only) and never imports `next/*` or `db`; CustomizeMode (an `apps/web` client component) may import `core` freely.

### Services / server-actions it calls

**NONE.** This is the load-bearing constraint. CustomizeMode performs **no server action, no API call, no DB write** (decision #4 — no new table; surface 06 §"Data & enums" NEW). All persistence is `localStorage`. No service-layer plan (01–09) owns home-layout customisation; it is deliberately serverless. (Contrast: `EnablePush`, the only async action on the home surface, hits `POST /api/push/tokens` — that is a *separate* component, not part of CustomizeMode.)

---

## API & data flow — props/inputs, what it fetches vs receives, state flow

### Props (received from the host home route)

```ts
import type { LucideIcon } from "lucide-react";
import type { ViewerRank } from "@camp404/core"; // or @camp404/types (plan 01)

/** A single launchable tool tile in the customize model. */
export interface CustomizeTile {
  id: string;                 // stable key (e.g. "camp-management")
  title: string;              // "Camp Management"
  icon: LucideIcon;           // per-tool lucide icon (icon map, surface 06 OQ#7)
  /** Home group this tile currently belongs to. */
  groupId: string;            // "captain" | "team_lead" | "team_member" | user-group id | "pinned"
}

/** A rank or user-defined group bucket. */
export interface CustomizeGroup {
  id: string;
  label: string;              // "Captain" | "Pinned" | user-named
  /** Minimum clearance to edit; rank groups carry their rank, user groups undefined. */
  rank?: ViewerRank;
  kind: "rank" | "pinned" | "custom";
}

export interface CustomizeModeProps {
  /** Default tile set + persisted-overlay seed (board default order from the server). */
  tiles: CustomizeTile[];
  /** Rank + user-defined + Pinned groups. */
  groups: CustomizeGroup[];
  /** Currently pinned tile ids (mirrors a "pinned" group membership). */
  pinned: string[];
  /** Viewer clearance — locked (higher-rank) groups are NOT editable/drop targets. */
  viewerRank: ViewerRank;
  /** Persist the new order to localStorage and exit (host flips back to RankGroupCard view). */
  onDone: (layout: CustomizeLayout) => void;
  /** Optional granular callbacks (host may just consume onDone). */
  onReorder?: (tileId: string, toIndex: number, groupId: string) => void;
  onPin?: (tileId: string) => void;
  onNewGroup?: () => void;
}

/** The serialised, persisted shape (localStorage key e.g. "camp404:home-layout:v1"). */
export interface CustomizeLayout {
  order: Record<string, string[]>; // groupId → ordered tileId[]
  pinned: string[];                // pinned tileId[]
  customGroups: { id: string; label: string }[];
  version: 1;
}
```

> Props names match `component-library.md` §CustomizeMode (`tiles`/`groups`/`pinned`/`onReorder`/`onPin`/`onNewGroup`/`onDone`).

### What it fetches vs receives

- **Receives (props):** the default board tile set, group buckets, viewer rank, and the persisted layout seed. Everything declarative comes down from the server route as defaults.
- **Reads (client, on mount):** `localStorage["camp404:home-layout:v1"]` → the user's saved `CustomizeLayout`, merged over the server defaults (new/removed default tiles reconciled by `id`; unknown saved ids dropped; missing tiles appended in default order).
- **Fetches:** nothing. No server round-trip ever.
- **Writes (client):** on `Done`, serialise the live model to `CustomizeLayout` and `localStorage.setItem`. No network.

### State flow

```text
page.tsx (server)
  └─ derive viewerRank (core.deriveViewerRank) + default tiles/groups
  └─ HomeClient ("use client" island)
       ├─ useState: customizeActive (Customize pill ⇄ Done)
       ├─ useLayout(): localStorage-backed model (order/pinned/customGroups), seeded by props
       ├─ customizeActive === false → <RankGroupCard …/> ×3  (populated / locked-preview)
       └─ customizeActive === true  → <CustomizeMode tiles groups pinned viewerRank onDone/>
              ├─ useState: dragging { tileId, fromGroup } | null
              ├─ useState: dropTarget { kind: "slot"|"zone", groupId, index } | null
              ├─ onDragStart → set dragging (row → moving, MOVING chip)
              ├─ onDragOver  → compute valid slot/zone (unlocked groups only) → set dropTarget
              ├─ onDrop      → mutate local model (reorder / move-to-group / pin)
              └─ onDone      → persist → onDone(layout) → host sets customizeActive=false
```

Drag is keyboard-accessible (see States §a11y): grip is focusable, Space picks up, arrows move between slots, Space drops, Esc cancels.

---

## States — every state incl. global matrix + gating

### Component states (surface 06 M5 + §States)

| State | Trigger | Render |
|---|---|---|
| **idle (editor open)** | Customize active, nothing dragging | Help line + DRAG TO REORDER list (static `DraggableTileRow`s) + DRAG INTO A GROUP (PinnedGroup + NewGroupAffordance) + Done pill. No DropSlot/DropZone shown. |
| **dragging** | a row picked up by grip | Picked row → `moving` (accent stroke, `op:0.97`, **MOVING** chip); `DropSlot` appears at the valid insertion index; over a group, that group's `DropZone` highlights ("Release to add to Pinned"/"Release to add to <group>"). |
| **drop / committed** | release on a valid target | Local model mutates; row returns to `idle`; tool-counts on (eventual) groups recompute; DropSlot/DropZone clear. |
| **saved** | Done pressed | `localStorage` written; `onDone(layout)` fires; host exits editor → populated `RankGroupCard` view reflects the new order. |
| **new-group created** | NewGroupAffordance tapped | An empty user-defined `CustomizeGroup{kind:"custom"}` appended; renders with its empty DropZone as a valid target. |

### Global matrix (mapped to this organism)

| Matrix row | CustomizeMode behaviour |
|---|---|
| **Empty** | A group with zero tiles after edits renders its header + an **empty DropZone** so it stays a valid drop target (surface 06 §"Empty Pinned / new group"). Empty Pinned shows the DropZone-only body. Tool-count `0`. |
| **Loading** | N/A in the editor itself — it hydrates from props + `localStorage` synchronously on mount. The host route is server-rendered (no panel skeleton, surface 06 §Loading). To avoid hydration mismatch, gate the localStorage-overlaid render behind a `mounted` flag (SSR/first-paint = default board, then reconcile). |
| **Error** | No server I/O → no fetch/submit error. The only failure mode is `localStorage` unavailable/quota (private mode): catch on read/write, fall back to in-memory state, and **do not** surface a blocking error — layout simply isn't persisted across reloads (acceptable; surface 06 §"persistence ceiling"). |
| **Submitting** | N/A — `Done` is a synchronous `localStorage` write, no pending/spinner state. |
| **Success** | `Done` → persisted → exit to populated view. No toast required (silent persist); a Toast confirmation is optional, not specced. |
| **Disabled / inert** | Tiles belonging to **locked (higher-rank) groups** are NOT in the editable set — they are not draggable, not droppable, not pinnable. The host passes only unlocked tiles to `tiles`; locked groups remain in their `RankGroupCard` preview (CaptainLock) and are absent from the editor. |

### Gating — preview-but-locked (the rank surface boundary)

CustomizeMode itself is **only reachable by users who have cleared the full gating spine** (auth → invite → required-actions → approval — the host `page.tsx` redirects everyone else before render). So the editor never renders for an ungated viewer.

**Within the editor, rank gating = scope restriction (LOCKED preview-but-locked, decision #3):**

- The editor exposes **only the viewer's unlocked tiles** (own rank + lower). Per `rankLevel(viewerRank) >= group.rank`: a captain edits all three rank groups; a team-lead edits Team Member + Team Lead; a plain member edits Team Member only.
- **Locked (higher-rank) groups are NOT drop targets and carry NO data** — they render as `RankGroupCard` + `CaptainLock scope="group"` ("VIEW ONLY · no data for your rank") in the populated view and are simply **omitted** from the editor's tile/group set. This is the security boundary (surface 06 §"Preview-but-locked must return NO data"): the server never sends locked-group tile data, so the editor cannot reorder/pin what it never received.
- This satisfies surface 06 OQ#4 (RECOMMEND unlocked-scope-only editing) and decision #3. CustomizeMode is **NOT a redirect/overlay** — it is an in-place toggled state over the unlocked tiles (CLAUDE.md: "preview-but-locked … render structure, no data, inert — NOT a redirect/overlay").

### a11y states

- Each grip handle: `role="button"` (or native `<button>`) with `aria-label="Drag <tile> to reorder"`, focusable. Space/Enter picks up (sets `aria-grabbed`/announces "picked up"); Arrow keys move; Space drops; Esc cancels (announces "cancelled, returned to original position").
- `aria-live="polite"` region announces drop-target changes ("Drop above Finances" / "Release to add to Pinned").
- DropSlot/DropZone are decorative visual indicators (`aria-hidden`); the live-region carries the meaning.
- Done pill is a native `<button>`; focus returns to the Customize pill on exit.
- Drag is **not** mouse-only — full keyboard parity is an acceptance criterion (the chosen DnD lib must support keyboard sensors; `@dnd-kit/core` does).

---

## Build steps — ordered, with prerequisites + acceptance + tests

### Prerequisites (must land before this organism)

| Prereq | Source plan | Why |
|---|---|---|
| **P0 — Foundations tokens + fonts** | `foundations-tokens.md` (architecture Phase 0) | accent tints (`accent/8/12/15%`), mono eyebrow face for MOVING chip, radius scale. Hard gate. |
| **P1 — `@camp404/core` scaffold + rank ladder** | architecture Phase 1/3, plan 01 | `rankLevel`/`RANK_ORDER`/`ViewerRank`/`deriveViewerRank`/`requireClearance` extracted from `control-panel.tsx` → `core`. CustomizeMode + host inherit the clearance scope from here. |
| **P2 — Leaf primitives** | `atom-iconbadge.md`, `atom-badge.md`, `atom-divider.md`, `molecule-gridtile.md` | IconBadge (Step 1), Badge (Step 1), Divider, GridTile (for the populated `RankGroupCard` sibling + optional row composition). |
| **P3 — RankGroupCard (sibling)** | `molecule-gridtile.md` §Step 6 (no standalone plan) | The populated ⇄ editor toggle needs the populated view to swap back to; build the two together. |
| **P-DND — drag mechanism decision** | NEW (this plan) | No DnD lib installed. RECOMMEND adding **`@dnd-kit/core`** + `@dnd-kit/sortable` to `apps/web` (keyboard sensor, accessible, React 19 compatible, ~10kb) rather than hand-rolling pointer math (hand-roll risks no keyboard support → fails a11y acceptance). Confirm with lead before adding the dep. Alternative: native HTML5 drag (no keyboard, rejected for a11y). |

### Steps

**Step 0 — Confirm persistence shape + DnD dep.** Lock the `localStorage` key (`camp404:home-layout:v1`), the `CustomizeLayout` schema, and the DnD library choice (P-DND). Resolve surface 06 OQ#3 (localStorage vs cookie — RECOMMEND localStorage; cookie only if SSR personalisation is wanted, which adds a server read and is out of scope for decision #4). *Acceptance:* decisions recorded; dep added to `apps/web/package.json` if `@dnd-kit`.

**Step 1 — Create `apps/web/app/home/` + the tile/icon model.** New folder. Define `CustomizeTile`/`CustomizeGroup`/`CustomizeLayout` types and the **per-tool icon map** (surface 06 OQ#7: Camp Management `shield`, Finances `wallet`, Camp Tools `megaphone`, My Teams `users`, My Tasks `list-checks`, Camp/Crew Tasks `clipboard-list`, etc.). *Acceptance:* the default board tile set is expressible; icon map covers every board tile.

**Step 2 — Build the NEW sub-components.** `DropSlot`, `NewGroupAffordance` (pure presentational, no drag deps) → then `DraggableTileRow` (grip + IconBadge + title + MOVING Badge; idle/moving) → then `PinnedGroup` (accent card + member-count Badge + foot DropZone). All to surface 06 M5 anatomy + the design-tokens reconciliations. *Acceptance:* each renders its idle + active variant; no raw hex; no verbose token classes; MOVING chip uses `Badge` accent variant.

**Step 3 — Build `CustomizeMode` shell.** Header (`sliders-horizontal` `$accent` + "Customize layout" + Done pill), help line, DRAG TO REORDER section (list of `DraggableTileRow` + interstitial `DropSlot`), DRAG INTO A GROUP section (`PinnedGroup` + `NewGroupAffordance`). Wire the DnD context (DndContext + sortable, keyboard + pointer sensors). *Acceptance:* the editor renders the full board sample (Camp Management/Finances/Camp Tools rows; Pinned with My Teams/My Tasks) matching board 17 (S08).

**Step 4 — Wire local state + reorder/pin/group logic.** `dragging`/`dropTarget` state; reorder within a group; move tile into a group; pin (add to `pinned` + Pinned group); create new group. **Enforce unlocked-scope-only** (locked groups not in the set; cannot drop into them). Tool-counts derive from live membership. *Acceptance:* drag-reorder, drag-into-Pinned, new-group, and pin all mutate the model correctly; locked-group tiles never appear.

**Step 5 — Persistence.** `useLayout` hook: seed from props, overlay `localStorage` on mount (behind a `mounted` flag), reconcile by `id`, write on `Done`. `try/catch` localStorage (private-mode fallback to in-memory). *Acceptance:* edit → Done → reload → layout restored; private mode → no crash, in-memory only; unknown/removed default tiles reconciled.

**Step 6 — Host integration (`page.tsx` + HomeClient island).** Rewire the home route off the dead `ControlPanel` onto the rank-group model: derive `viewerRank` via `core.deriveViewerRank`, render `RankGroupCard ×3` (populated + locked-preview) with a Customize pill that toggles to `CustomizeMode`. Delete `homeLayers`/`ControlPanel` usage. *Acceptance:* Customize pill enters the editor; Done exits and the populated grid reflects the new order; no `ControlPanel`/`TALK` button remains (surface 06 Divergences #1, #2).

**Step 7 — DELETE dead components.** Remove `packages/ui/src/components/control-panel.tsx`, `control-grid.tsx`, `quadrant-nav.tsx` (CLAUDE.md DELETE list) once `page.tsx` no longer imports them; drop their barrel exports. *Acceptance:* no `ControlPanel`/`ControlGrid`/`QuadrantNav` symbols exported; `pnpm build` green.

### Tests

- **Unit (`apps/web/.../home/__tests__/customize-mode.test.tsx`, vitest + RTL):**
  - Renders idle editor: help line, DRAG TO REORDER list, Pinned group, New group, Done present.
  - Picking up a row (Space on grip) → row enters `moving`, MOVING chip visible, `aria-grabbed`/live-region announces.
  - Keyboard reorder: ArrowDown moves DropSlot; Space drops → model order changes.
  - Drop into Pinned → tile id added to `pinned` and to Pinned group.
  - New group → empty custom group with DropZone appended.
  - **Locked-scope:** a tile from a locked higher-rank group is absent from the editable set (passed-in `tiles` excludes it) — never draggable.
  - **Persistence:** Done writes `localStorage`; remount re-seeds and restores order; private-mode (localStorage throws) → falls back to in-memory, no throw.
  - Done fires `onDone(layout)` with the serialised model.
  - Tool-count derives from live membership (0 for empty group).
- **Sub-component tests:** `DraggableTileRow` idle vs moving stroke/chip; `DropSlot` "Drop here" copy; `PinnedGroup` count Badge + DropZone copy; `NewGroupAffordance` ghost styling + onNewGroup.
- **a11y:** grip is a focusable button with `aria-label`; Esc cancels a drag and restores position; live-region present; DropSlot/DropZone `aria-hidden`.
- **E2E (Playwright, `apps/web`, optional but recommended):** open home → Customize → drag a tile → Done → reload → order persisted.

---

## Consumers — which surfaces mount it

| Surface | File | How it mounts |
|---|---|---|
| **Home (control panel)** | `apps/web/app/page.tsx` → `apps/web/app/home/` client island | The **only** consumer. Mounted as the toggled editor state of the home control panel: Customize pill (M1) flips the populated `RankGroupCard ×3` view to `CustomizeMode` (M5); Done flips back. Confirmed sole consumer by grep — `CustomizeMode`/`Customize mode`/`Customize layout` appear only in `design/spec/surfaces/06-home.md`. |

No other surface references CustomizeMode (`component-library.md` §CustomizeMode "Used by: home control panel"). It is home-exclusive and app-local — not promoted to `@camp404/ui`.
