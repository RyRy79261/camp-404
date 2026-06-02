# RosterToolbar — organism plan

- **mapsTo + home:** **NEW** (app-local) — per `component-library.md §RosterToolbar` ("mapsTo: NEW (app-local). Search Input (console-styled) + FilterChip row + Team dropdown over `teamEnum`"). It is roster-specific (one surface consumer), so it ships in **`apps/web`**, NOT `packages/ui`.
- **Target file:** `apps/web/app/captains/camp-management/roster-toolbar.tsx` (NEW — `"use client"`).

> This organism is the **search + multi-chip filter bar** that sits above the roster table/list on the captain camp-management surface. It owns no data fetch and no server action — it is a controlled presentation organism: the parent (`CampManagementRoster`) owns query/filter/team state, the actual row filtering, and all counts; `RosterToolbar` renders the controls and raises change events. It composes the **`FilterChip`** leaf (NEW), the reusable **`Input`** atom (console-styled search), and a **`Popover` + `Command`** team picker over `teamEnum`.

---

## Current state — what exists today (the old design's component/route markup)

`RosterToolbar` **does not exist** as a file. The search+filter block is inlined in the roster client component:

- **`apps/web/app/captains/camp-management/camp-management-roster.tsx` lines 112–157** — the "Counts strip + filter + search" block, rendered only `{!locked && (...)}` (line 113). Two pieces:
  - **Filter (lines 115–145):** a hand-rolled **two-button segmented toggle** (`inline-flex rounded-lg border p-0.5`) with `All ({rows.length})` and `Awaiting approval` + a count badge (`bg-sky-500/20 text-sky-400`, off-token). State is `type Filter = "all" | "awaiting"` (line 73), `useState<Filter>("all")` (line 83). `awaitingCount` is a `useMemo` over `rows` (lines 86–89).
  - **Search (lines 146–155):** a `relative w-72` wrapper with an absolutely-positioned `<Search>` lucide icon (line 147) over the reusable `Input` (lines 148–154), `pl-8`, placeholder "Search name, team, country…", `aria-label="Search the roster"`. State is `query`/`setQuery` (line 82); filtering happens in the parent's `filtered` memo (lines 91–103) over `displayName / rankLabel / country / teams` (NO handle, NO email).
- **Filter state + count logic owned by `CampManagementRoster`** (the would-be parent), not by any toolbar component: `Filter` union, `query`, `awaitingCount`, and the `filtered` memo all live there.
- **Locked (non-captain) behaviour today:** the whole toolbar is **hidden** under `{!locked && ...}` (line 113). This violates decision #3 (preview-but-locked) — chrome must render but be **inert**, not absent. See `molecule-filterchip.md` §Current state and `molecule-captainlock.md`.

**Tokens/markup gaps vs board** (surface 14 §3, boards #37/#38): live filter is a unified segmented control, not 5 independent chips; live search is Inter, not the console `> ` prompt + blinking cursor-rect JetBrains-Mono treatment; off-token `sky-500/20`; only 2 filters vs the board's `All / Pending / Captains / Team: / Outstanding`; no team dropdown; no warning-tone Outstanding chip.

**Classification confirmed: NEW (app-local).** No `RosterToolbar`/`roster-toolbar` file exists in `packages/ui` or `apps/web` (grep zero results). The block must be **extracted** out of `camp-management-roster.tsx` into `roster-toolbar.tsx` and rebuilt to the board.

---

## Composition — leaves, core helpers, services, server/client split

### Server-component vs `"use client"` split
**`"use client"`.** RosterToolbar is interactive (typed search, chip toggles, popover open/close) and is a child of the already-client `CampManagementRoster` (`"use client"`, line 1). It performs **no I/O and calls no server action** — it is a pure controlled presentation organism. The data fetch (`getCampManagementRoster`) happens in the server `page.tsx`; the parent client component owns derived state.

### Leaf components it consumes (link plans)
| Leaf | Plan | Role in RosterToolbar |
|---|---|---|
| **`FilterChip`** (NEW, app-local) | `design/spec/impl/components/molecule-filterchip.md` | The 5 chips: `All N` (`toggle`/accent), `Pending N` (`toggle`/accent), `Captains N` (`toggle`/accent), `Team: {value}` (`dropdown`/accent), `Outstanding N` (`toggle`/`tone="warning"`). RosterToolbar passes each chip's `active`, `count`, `onToggle`/`onOpen`, and `disabled` (= `locked`). |
| **`Input`** (REUSE) | `design/spec/impl/components/atom-input.md` | The search field. Uses the documented **`search` variant host-wrapper pattern** (atom-input §"No `type="search"` visual affordance": `relative` wrapper + absolutely-positioned leading icon + `pl-8`). Board console skin = `> ` prompt glyph + blinking cursor-rect, `stroke:$accent`, JetBrains-Mono — applied via wrapper chrome + `className`, no `<input>` structural change. |
| **`Popover`** (REUSE) | `packages/ui/src/components/popover.tsx` | Anchors the team picker to the `Team:` dropdown chip; opened via the chip's `onOpen` (per `molecule-filterchip.md` §Composition: "the parent `RosterToolbar` mounts a Popover/Select over `teamEnum`"). |
| **`Command`** (REUSE) | `packages/ui/src/components/command.tsx` | The team list inside the popover: `Command` + `CommandInput`/`CommandList`/`CommandItem` over the 8 `teamEnum` values + an "All" reset row. (`Select` is an acceptable simpler alternative per `molecule-select.md`; `Command` gives type-to-filter for 8 teams + "All".) |
| `ChevronDown` / `TriangleAlert` / `Search` | `lucide-react` | Icons (dropdown chevron lives inside `FilterChip`; `TriangleAlert` inside the warning chip; `Search` in the input wrapper). |

### `@camp404/core` helpers
**None consumed directly by RosterToolbar.** It is pure presentation — no rank logic, no validation. (Consistent with `molecule-filterchip.md` §Composition "No `@camp404/core` helpers".)

### Counts + filter predicates (pure, app-resident — NOT in RosterToolbar)
The chip **counts** and the row **filtering** are derived by the parent from `apps/web/lib/camp-roster.ts` (pure view-model, stays app-resident per architecture §"Stay pure-but-in-app" and service-layer plan 05 §EXTEND):
- `deriveRosterStats(rows)` → `{ members, approved, incomplete, pending, captains, outstanding }` (NEW — service-layer 05). Feeds the chip count props.
- `matchesRosterQuery(row, query)` (NEW — search over name / **handle** / **email** / country / team).
- `matchesChip(row, chip)` / `matchesTeam(row, team)` (NEW — chip + team predicates).
RosterToolbar **receives counts as props and raises events**; it does not compute counts or filter rows itself. The team domain is `teamEnum` (`@camp404/types Team` / `packages/db schema.ts:51`, 8 values).

### Services / server-actions it calls
**None.** RosterToolbar invokes no server action. (For context, the surface's actions — `getMemberDetailAction`, `decideApprovalAction`, NEW `sendCaptainPromotionAction` — are owned by `MemberProfile`/dialogs, not the toolbar; service-layer plan `05-roster-approvals-promotion.md`.)

---

## API & data flow — props/inputs, fetch vs receive, state flow

**Controlled component.** All state lives in the parent `CampManagementRoster`; RosterToolbar receives values + callbacks.

```ts
import type { Team } from "@camp404/types"; // teamEnum domain (8 values)

/** Multi-chip filter selection (replaces the live "all" | "awaiting" union). */
export type RosterChip = "all" | "pending" | "captains" | "outstanding";

export interface RosterToolbarProps {
  /** Search box value (controlled). */
  query: string;
  /** Fired on every keystroke. Parent stores it; parent filters via matchesRosterQuery. */
  onQuery: (next: string) => void;

  /** The currently-active status/cohort chip. "all" = no narrowing. */
  filter: RosterChip;
  /** Toggle a chip. Selecting a non-"all" chip narrows; re-selecting → back to "all". */
  onToggleFilter: (chip: RosterChip) => void;

  /** Selected team (null = "All"/no team filter). */
  teamFilter: Team | null;
  /** Fired when a team (or "All") is picked in the popover. */
  onTeamFilter: (team: Team | null) => void;

  /** Live counts from deriveRosterStats(rows) — rendered in the chip labels. */
  counts: {
    all: number;        // total rows (Members)
    pending: number;    // approvalStatus === "pending"
    captains: number;   // rank === "captain"
    outstanding: number;// pendingRequiredActions > 0
  };

  /** Preview-but-locked (non-captain). Renders chrome but inert (decision #3). */
  locked: boolean;
  className?: string;
}
```

**Inputs vs fetches:** RosterToolbar **fetches nothing**. It receives `query`/`filter`/`teamFilter`/`counts`/`locked` and emits `onQuery`/`onToggleFilter`/`onTeamFilter`.

**State flow (round trip):**
```text
page.tsx (server) — getCampManagementRoster() → toRosterRow[] (captain) | [] (non-captain)
  → CampManagementRoster (client) owns: query, filter (RosterChip), teamFilter
       counts = deriveRosterStats(rows)         // pure, lib/camp-roster
       filtered = rows.filter(r =>
            matchesRosterQuery(r, query)
         && matchesChip(r, filter)
         && matchesTeam(r, teamFilter))         // pure predicates
  → <RosterToolbar query filter teamFilter counts locked onQuery onToggleFilter onTeamFilter/>
       ↑ user types / toggles a chip / picks a team
       └─ raises onQuery / onToggleFilter / onTeamFilter → parent setState → re-derive `filtered`
  → <RosterTable/RosterList rows={filtered} .../>  (siblings, separate organisms)
```

**Local UI state inside RosterToolbar:** only the team-popover open/closed boolean (`useState(false)`) — purely presentational, not lifted. Everything filter-meaningful is controlled from the parent.

**Forms:** RosterToolbar is **not a form** — no `<form>`, no action, no validation. (Search is a live filter, not a submit.) The "team picker" is a selection control, not a form field.

**Counts-must-reconcile invariant** (surface 14 §Validation): because counts come from `deriveRosterStats(rows)` (one source) and rows are filtered by the same pure predicates, the chip counts, stats strip, and visible rows are guaranteed consistent. RosterToolbar must NOT recompute counts locally.

---

## States — full matrix incl. gating

| State | Trigger | Toolbar render |
|---|---|---|
| **default / populated** | Captain, rows present | All 5 chips visible; `All N` active (accent fill+stroke+dot); search empty showing placeholder + `> ` prompt + blinking cursor-rect. |
| **active-filters** | A non-"all" chip toggled and/or a team picked and/or query typed | Selected chip → active (accent), others inactive; `Team:` chip shows the team label + `active` styling when `teamFilter !== null`; search box holds the typed query. (Visible-row narrowing is the table/list sibling's concern; toolbar reflects only chip/search state.) |
| **empty (no rows)** | Captain, zero members | Toolbar still renders; counts read `All 0 / Pending 0 / Captains 0 / Outstanding 0`. The "No members have signed up yet." message is rendered by the table/list, not the toolbar. |
| **filtered-to-zero** | Query/chip yields no rows | Toolbar unchanged (it reflects the active query/chip); the "No members match your search." / per-filter empty copy is the table/list's responsibility. |
| **loading** | n/a | RosterToolbar has no loading state — it owns no fetch. Inline member-profile fetch loading is the `MemberProfile` organism's concern. |
| **error** | n/a | RosterToolbar raises no action → no error state. Action errors surface in `MemberProfile`/dialog footers (service-layer 05). |
| **submitting / success** | n/a | Not applicable — no submit. |
| **disabled** | (subset of locked) | Individual chips disabled = `locked`; passed straight to each `FilterChip` (`disabled` → `opacity-50 pointer-events-none`, still rendered). |
| **preview-but-locked (non-captain) — the headline gating state** | `locked === true` (server sent zero rows; viewer rank ≠ captain) | **Chrome renders, controls inert** (decision #3). All 5 `FilterChip`s render with `disabled={true}` (visible, dimmed, no events); search `Input` renders `disabled` + `readOnly`, empty; the team popover never opens (`onOpen` no-ops). The toolbar is **NOT hidden** (fixing the live `{!locked}` bug at lines 113/146) and **NOT** an overlay/redirect — the shared `CaptainLock` panel is mounted by the surface elsewhere (see `molecule-captainlock.md` §Consumers / surface 14 §8), not by RosterToolbar. Counts shown are `0` (server withheld rows; no data leak — flows.md §3.3 invariant #2). |

Gating cross-refs: surface 14 §States "Preview-but-locked (non-captain viewer)"; `molecule-filterchip.md` §States `disabled`; `molecule-captainlock.md` (the panel is a sibling, not part of the toolbar).

---

## Build steps — ordered, with prerequisites + acceptance + tests

**Dependency prerequisites (must land first):**
1. **Foundations** (`foundations-tokens.md` Phase 0): `--color-warning` / `--color-warning-foreground` (Outstanding chip), `--radius`, `--font-mono` (JetBrains Mono) + the `--text-mono`/console type steps. Without `--color-warning` the warning chip cannot ship; without `--font-mono` the console search renders in a fallback face.
2. **`FilterChip`** (`molecule-filterchip.md` Steps 1–5) — the chip leaf must exist (it is `apps/web`-local, same route folder). RosterToolbar is literally `molecule-filterchip.md` Step 2's "create `roster-toolbar.tsx`".
3. **`Input` search/mono affordances** (`atom-input.md`) — documented host-wrapper search pattern (no structural blocker; usable today).
4. **`Popover` + `Command`** (REUSE, already in `@camp404/ui`).
5. **Pure derive/predicate helpers in `lib/camp-roster.ts`** (`deriveRosterStats`, `matchesRosterQuery`, `matchesChip`, `matchesTeam`; service-layer 05 §EXTEND, build steps 6) — so the parent can supply correct counts and filter rows. RosterToolbar itself does not import these, but its parent must, for the toolbar to be meaningful.
6. (Independent, not a blocker for the toolbar) `getCampManagementRoster` `@handle` EXTEND + `RosterRow.handle` (service-layer 05 step 5) — required for the board's "name, handle or email" search to actually match handle; toolbar can ship before it, search-by-handle lands with it.

> Note (MEMORY: green-CI-is-done): land the toolbar extraction as one green change; do not strand the dropdown/handle-search behind it.

### Step 1 — Expand the parent's filter model
In `camp-management-roster.tsx`, replace `type Filter = "all" | "awaiting"` (line 73) with `RosterChip = "all" | "pending" | "captains" | "outstanding"` (exported from `roster-toolbar.tsx`) + a separate `teamFilter: Team | null` state. Replace the single `awaitingCount` memo with `const counts = useMemo(() => deriveRosterStats(rows), [rows])`. Extend the `filtered` memo to `matchesRosterQuery(r, query) && matchesChip(r, filter) && matchesTeam(r, teamFilter)`.
- *Acceptance:* existing All/Pending(=ex-"awaiting") filtering preserved; three new chip filters + team filter apply; counts come from the single `deriveRosterStats` source.

### Step 2 — Create `roster-toolbar.tsx`
`"use client"`. Implement `RosterToolbarProps` (above). Layout: `role="group" aria-label="Filter roster"` row. Left: search `Input` in the console wrapper (`relative`, leading `Search`/`> ` glyph, `pl-8`, blinking cursor-rect chrome, `stroke:$accent`, `font-mono`, placeholder "Search by name, handle or email", `aria-label="Search the roster"`). Right: a `gap-2` chip row — `All` / `Pending` / `Captains` / `Team:` (dropdown) / `Outstanding` (warning). Pass `disabled={locked}` to every chip and `disabled readOnly` to the input when `locked`.
- *Acceptance:* renders all 5 chips + search; chips reflect `active`/`count`/`tone`; no off-token hex; no `next/*` or `@camp404/db` import; `aria-pressed` on toggle chips; mono face + accent stroke present.

### Step 3 — Wire the Team dropdown
On `Team:` chip `onOpen`, open a `Popover` anchored to the chip containing a `Command` list of the 8 `teamEnum` values (humanised labels) + an "All" reset row. Selecting a team → `onTeamFilter(team)` and close; "All" → `onTeamFilter(null)`. Chip `active = teamFilter !== null`; `selectedValue` = team label or "All". `Esc`/outside-click closes.
- *Acceptance:* clicking `Team: All` opens the picker; selecting a team narrows rows + updates the chip label; "All" clears; `Esc` closes; popover never opens when `locked`.

### Step 4 — Replace the inline block in `camp-management-roster.tsx`
Delete lines 112–157 (the `{!locked && ...}` counts/filter/search block) and mount `<RosterToolbar ... />` **unconditionally** (rendered in both captain and locked states — fixing the live hide-when-locked bug), passing the controlled props + `locked={locked}`. Remove now-unused imports (`Search`, the segmented-toggle markup).
- *Acceptance:* captain view behaves as before plus the new chips/team filter; non-captain view shows the toolbar **inert and visible** (not hidden), counts `0`; no `bg-sky-500/20` or other off-token tints remain in the extracted block.

### Step 5 — Tests (`roster-toolbar.test.tsx`, RTL)
| Test | Assertion |
|---|---|
| Renders search + 5 chips | `getByRole("group", {name:/filter roster/i})`; 5 `FilterChip` buttons present |
| Search is controlled | typing fires `onQuery` with the new value (mock) |
| Chip toggle raises event | clicking `Pending` fires `onToggleFilter("pending")` |
| Active chip styling | the chip matching `filter` has `aria-pressed="true"` / accent class |
| Counts rendered in labels | `All 42`, `Pending 3`, `Captains 4`, `Outstanding 7` text present from `counts` |
| Outstanding is warning tone | the Outstanding chip renders `TriangleAlert` + `bg-warning/12` |
| Team dropdown opens + selects | click `Team:` → popover with 8 teams + "All"; select → `onTeamFilter(team)`; "All" → `onTeamFilter(null)` |
| **Locked: rendered but inert** | with `locked`, all chips have `disabled` attr + `pointer-events-none`; search is `disabled`/`readOnly`; `onQuery`/`onToggleFilter` NOT fired on interaction; toolbar still in the document (not hidden) |
| Counts reconcile | given a fixture `rows`, parent `deriveRosterStats` counts equal the visible chip counts (parent-level integration assertion) |

- *Acceptance:* all pass via the project test runner; lint clean (no off-token hex, no `bg-background/95`, no `sky/emerald/amber` literals in the toolbar).

### Step 6 — Storybook (`roster-toolbar.stories.tsx`)
`Default` (captain, All active), `ActiveFilters` (Pending active + a team selected + query), `Empty` (all counts 0), `Locked` (all inert/dimmed, visible). 
- *Acceptance:* stories render without console errors; `Locked` shows the toolbar present-but-inert.

---

## Consumers — which surfaces mount it

| Consumer | File | How used |
|---|---|---|
| **`CampManagementRoster`** (the roster client root) | `apps/web/app/captains/camp-management/camp-management-roster.tsx` | Mounts `<RosterToolbar>` once at the top of the surface (both breakpoints — the responsive table/list pair sits below). Owns `query`/`filter`/`teamFilter` state, supplies `counts` from `deriveRosterStats`, passes `locked`, and consumes the three change callbacks to re-derive the filtered set fed to `RosterTable`/`RosterList`. |
| **Surface 14 — Captain roster & member detail** | `design/spec/surfaces/14-roster.md §3` ("Toolbar (search + multi-chip filters)"), route `/captains/camp-management` | The only surface that mounts RosterToolbar. Responsive single route: terminal-console (≥ sm, board #37) and mobile (< sm, board #38) — same toolbar, console chrome at the wider breakpoint. |

RosterToolbar has exactly **one** mounting surface (roster is the only filterable list in the spec). No other surface composes it.
