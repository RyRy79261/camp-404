# Home (control panel) — functional brief

- **Route(s):** `/` (authenticated)
- **Canonical board(s):** `design/.spec-extract/boards/17-s08-control-panel.txt` (S08 Control panel)
- **Superseded-or-dropped:** `S07 Home dashboard` (board 16) — SUPERSEDED. Live `ControlPanel` 2×2 layered-quadrant component + centre **TALK** push-to-talk button — DROPPED (the quadrant/layer model and the home mic are both replaced; see Divergences and locked decision 5).
- **Breakpoints:** mobile-first **430px** only. This is a phone-shaped surface; the rank-group cards stack vertically and each tile grid is a fixed 2-column layout. No desktop terminal variant (that treatment belongs to the roster, decision 2). The product `max-w-lg` wrapper applies.

---

## Purpose

The home route is Camp 404's **control panel** — the single answer to *"everything you can run, captain first."* It is a launcher: rank-grouped cards, each holding a 2-column grid of tool tiles that deep-link into the app's working surfaces (roster, tools, forms, finances, tasks, profile). It is reached **only after** a viewer clears the full gating spine (auth → invite → onboarding/required-actions → captain-approval); anyone who hasn't earned the app is redirected to the relevant gate before this surface renders.

Three behaviours define it:
1. **Rank-grouped IA** — tools are organised into `Captain`, `Team Lead`, `Team Member` groups, captain-first. The viewer always sees **all three groups**; groups above the viewer's clearance render in **preview-but-locked** form (decision 3): structure/chrome rendered, no data, all tiles inert, `CaptainLock` treatment.
2. **Customize mode** — a drag-to-reorder editor (toggled by a header "Customize" button) lets the viewer rearrange tiles, drop them into groups, pin favourites into a **Pinned** group, and create new groups.
3. **EnablePush row** — a best-effort web-push opt-in button mounted beneath the groups, shown only when the browser permission is undecided.

---

## Layout & modules (decomposition)

Top → bottom, inside a single vertical scroll container (`Content`, gap 20, pad [20,16]) under the fixed `TopChrome` header.

### M0 — TopChrome (header) `⟶ <TopChrome>`
The shared top bar (board 00). Wordmark `Camp` (Inter 700) + `404` (JetBrains Mono 700, `$primary`); right cluster = **Bell** (40×40 `$muted` circle, `bell` icon, count badge top-right `$primary` fill / `$primary-foreground` text, hidden when 0) and **Avatar** (40×40 `$secondary` circle, initials in `$secondary-foreground`, or photo when `profileImageUrl` set). Bell → `/notifications`; Avatar → `/profile`.

### M1 — TitleRow
- **Left:** title `Control panel` (Inter 20/700/`$foreground`) + subtitle `Everything you can run. Captain first.` (Inter 12/`$muted-foreground`).
- **Right:** **Customize** pill button — `sliders-horizontal` icon + `Customize` label (Inter 13/600), `r:999`, `$muted` fill, `$border` stroke. Toggles Customize mode (M5). In Customize mode the in-card "Done" pill (M5) is the inverse toggle.

### M2 — Rank-group card (×3: Captain, Team Lead, Team Member)
Repeating module; one card per rank group. Card = vertical, gap 14, pad 14, `r:$radius`, `$muted` fill, `$border` stroke.
- **GroupHead** (space-between, center):
  - **Left:** a 30×30 rounded chip (`r:8`) holding the group icon, + group name (Inter 15/700/`$foreground`). Chip fill + icon per group:
    - Captain → chip `#ff008c26` (primary tint), `shield` icon (`$primary`).
    - Team Lead → chip `#00dcff26` (accent tint), `user-cog` icon (`$accent`).
    - Team Member → chip `#75188840` (secondary tint), `user` icon (`$secondary-foreground`).
  - **Right:** per-group **tool-count** label, e.g. `4 tools` (Inter 12/500/`$muted-foreground`). Count = number of tiles currently in the group (recomputed in Customize mode as tiles move/pin). RECONCILE: board shows literal `4 tools` on each group; treat the count as **derived** from the live tile list, not a constant.
- **Grid:** 2 columns, vertical stack of `Row`s, gap 12; each `Row` holds two `⟶ <GridTile>` instances at `w:fill_container`.

#### M2a — Captain group tiles (4)
| Pos | Tile | Hint | Badge | Destination |
|---|---|---|---|---|
| TL | **Camp Management** | Roster & statuses | — | `/captains/camp-management` (built) |
| TR | **Camp Tasks** | Camp-wide work board | `12` | **future / not yet designed** (no board, no route) |
| BL | **Finances** | Dues & reimbursements | — | **future / not yet designed** (no board, no route) |
| BR | **Camp Tools** | Announcements, admin… | — | `/captains/tools` (built); `/captains/announcements` also exists |

#### M2b — Team Lead group tiles (4)
| Pos | Tile | Hint | Badge | Destination |
|---|---|---|---|---|
| TL | **Crew Roster** | Your crew's statuses | — | **future / not yet designed** (team-scoped roster view; no board) |
| TR | **Crew Tasks** | Assign & track work | `4` | **future / not yet designed** |
| BL | **Crew Forms** | Questionnaire responses | — | **future / not yet designed** |
| BR | **Crew Announcements** | Post to your crew | — | **future / not yet designed** |

#### M2c — Team Member group tiles (4)
| Pos | Tile | Hint | Badge | Destination |
|---|---|---|---|---|
| TL | **My Teams** | Your crews | `3` | **future / not yet designed** (member team view; no `/members` route exists) |
| TR | **My Tasks** | What's on you | `5` | **future / not yet designed** (no `/meals` / tasks route exists) |
| BL | **My Profile** | You & your data | — | `/profile` (built) — board overrides only label/hint; resolve destination to the built profile view (see Open questions) |
| BR | **Tools** | Meals, expenses… | — | `/tools` (built) |

### M3 — GridTile (the tool tile) `⟶ <GridTile>`
Reusable (board 03). Vertical, gap 14, pad 16, `r:$radius`, `$card` fill, `$border` stroke.
- **Head** (space-between): **IconBox** 46×46 rounded (`r:12`) tinted square holding the tool's lucide icon (`$primary`); optional **Badge** pill (`pad:[3,9]`, `r:999`, `#ff008c2e` fill, count in Inter 12/600/`$primary`).
- **TextCol:** title (Inter 16/600/`$foreground`) + hint (Inter 12/`$muted-foreground`).
- Board uses default `users` icon + `#ff008c2e` tint as the component default; each instance overrides title + hint (and, where shown, the badge count). Per-tile icons are implied by the Customize-mode list (see icon map below).

### M4 — Divider
1px `$border` horizontal rule between the rank groups and Customize mode / EnablePush.

### M5 — Customize mode (the drag-to-reorder editor) — `CustomizeMode` card
Card (vertical, gap 12, pad 14, `r:$radius`, `$muted` fill, `$border` stroke), shown when Customize is active. RECONCILE: the board renders M2 (groups) *and* M5 together for documentation; **in product, Customize mode is a toggled state** — entering it converts the grid tiles into draggable rows / surfaces M5's editor affordances. Treat M5 as the editing presentation of the same tile set, not a permanently separate region.

- **hd:** `sliders-horizontal` (`$accent`) + `Customize layout` (Inter 15/700); right = **Done** pill (`pad:[7,14]`, `r:999`, `$primary` fill, `Done` in Inter 13/600/`$primary-foreground`) → exits Customize mode.
- **Help line:** `Grab a tile by its handle and drag it to a new spot, or drop it into a group.` (Inter 12/`$muted-foreground`).

#### M5a — DRAG TO REORDER section
- Section label `DRAG TO REORDER` (Inter 11/600/`$muted-foreground`).
- **Dragging tile (active):** a row (`pad:[11,12]`, `r:8`, `$card` fill, **`$accent` stroke**, `op:0.97`) with `grip-vertical` handle (`$accent`), the tool icon (`$primary`), tool title (Inter 13/600), and a **MOVING** chip (`#00dcff26` fill, `MOVING` Inter 10/700/`$accent`). This is the picked-up tile.
- **List (reorder target):** vertical stack, gap 8, of static draggable rows (`$card` fill, `$border` stroke, `grip-vertical` `$muted-foreground` handle, tool icon `$primary`, title Inter 13/600). Board sample rows: `Camp Management` (shield), `Finances` (wallet), `Camp Tools` (megaphone).
- **DropSlot (insertion indicator):** an interstitial slot between rows (`pad:[10,0]`, centered, `r:8`, `#00dcff14` fill, `$accent` stroke) showing `corner-left-down` icon (`$accent`) + `Drop here` (Inter 12/600/`$accent`). Appears at the valid insertion point under the dragged tile.

#### M5b — DRAG INTO A GROUP section
- Section label `DRAG INTO A GROUP` (Inter 11/600/`$muted-foreground`).
- **PinnedGroup:** a highlighted group card (`pad:12`, `r:8`, `#00dcff1f` fill, `$accent` stroke). Header = `star` icon (`$accent`) + `Pinned` (Inter 14/700) + member count (`2`, Inter 12/600/`$accent`). Contains pinned tile rows (board: `My Teams` users-icon, `My Tasks` list-checks-icon — same row shape as M5a).
  - **DropZone (group drop target):** at the foot of the group (`pad:[12,0]`, centered, `r:7`, `#00dcff26` fill, `$accent` stroke) showing `plus` (`$accent`) + `Release to add to Pinned` (Inter 12/600/`$accent`). Shown while a tile is dragged over the group.
- **NewGroup:** a dashed/ghost add-affordance (`pad:[11,0]`, centered, `r:8`, transparent fill, `$muted-foreground` stroke, `op:0.8`) = `plus` icon + `New group` (Inter 13/600/`$muted-foreground`). Creates an empty user-defined group as a drop target.

### M6 — EnablePush row `⟶ <Button-Outline>`
Full-width `Button-Outline` labelled **Enable notifications** at the foot of the content. Backed by the web-push state machine (see States). Renders **only** in the `default` (undecided) permission state; loading / unavailable / granted / denied all render **nothing** (per S23 board comments).

---

## Components used (reusable + new) — name · role · key props/variants

**Reusable / shared (from extraction index):**
- **TopChrome** — global header (wordmark + bell + avatar). Props: `unreadCount`, `avatarImageUrl`, `avatarInitials`. Variants: badge shown/hidden (count 0 → hidden, >99 → `99+`).
- **GridTile** — tool launcher tile. Props: `icon`, `iconTint`, `title`, `hint`, `badge?`, `href?`, `disabled` (locked/inert), `dragHandle?` (Customize mode). Variants: default · with-badge · locked (preview) · dragging.
- **Button-Outline** — used for EnablePush. Props: `label`, `onClick`, `disabled`. Variant here: full-width.
- **CaptainLock** — preview-but-locked treatment for above-clearance groups (board 09: lock-circle + "Captain access only" / clearance copy). Reused per decision 3. NEW USE: applied at **group** scope on home (overlay/replacement inside a locked rank-group card), not only at full-surface scope. Copy per decision 3: "VIEW ONLY · no data for your rank".

**New (this surface):**
- **RankGroupCard** — the repeating rank-group container (GroupHead + tool-count + grid). Props: `rank` (captain | team_lead | team_member), `icon`, `chipTint`, `tiles[]`, `toolCount`, `locked`.
- **CustomizePill** — the header toggle (label "Customize" / icon `sliders-horizontal`). Props: `active`, `onToggle`.
- **CustomizeModeCard** — the editor shell (M5): help text + DragToReorder + DragIntoGroup sections + Done.
- **DraggableTileRow** — single tile row in Customize mode (grip + icon + title + optional MOVING chip). Props: `icon`, `title`, `state` (idle | moving).
- **DropSlot** — insertion indicator between rows (`corner-left-down` + "Drop here").
- **PinnedGroup** — accent-highlighted favourites group with `DropZone` foot ("Release to add to Pinned").
- **NewGroupAffordance** — ghost "New group" add button.
- **EnablePush** — web-push opt-in wrapper (owns the permission state machine; renders `Button-Outline` only in `default`).

---

## States — every state/variant + the global matrix + gating states

**Global-matrix rows (mapped to this surface):**
- **Empty** — bell badge hidden when `countUnread = 0`/falsy; avatar falls back to initials (`?` when none). Tiles with no badge value render without the badge pill. A rank group with zero tiles after Customize edits shows the group head + tool-count `0 tools` and an empty grid (or, for user-defined/Pinned groups, the empty DropZone).
- **Loading** — server-rendered; the page awaits all reads (rank, team-lead probe, unread count) before returning, so there is no client skeleton for the panel. EnablePush has an internal `loading` state → renders nothing.
- **Populated** — normal authenticated render: header, three rank-group cards (own + locked higher), Divider, EnablePush (if `default`). Customize off.
- **Validation-error** — N/A (no forms submitted from home). A failed push-permission request flips the EnablePush state machine, not a banner.
- **Submitting/pending** — N/A for the panel. The only async user action is the push permission request (no submit UI).
- **Success** — N/A (no submit). Push grant → token registered silently, EnablePush button disappears.
- **Disabled / inert** — locked-group tiles are non-interactive (`aria-disabled`, dimmed, no href/handler). Future-destination tiles (Camp Tasks, Crew Tasks, Finances, Crew Forms, Crew Announcements, My Teams, My Tasks, Crew Roster) are rendered enabled-looking but their destinations are **not yet built** → flag as inert/dead until the surface exists (do NOT wire dead `<a href>` that 404s; prefer a no-op or "coming soon" affordance — see Open questions).

**Gating states (the spine that runs before this surface renders, `apps/web/app/page.tsx`):**
- **Signed-out** — no session → render `<LandingHero />` inline (glitch 404, "Are you lost?" → `/auth/sign-in`). Not a redirect.
- **Invite-gated** — `!hasCampAccess(campUser, email)` → `redirect("/signup/required")`. God accounts bypass.
- **Onboarding-incomplete** — `nextGate(pending blocking required_actions)` → first built gate (today `burner_profile` → `/onboarding/questionnaire`); legacy `!burnerProfile.completedAt` fallback to the same.
- **Pending-approval** — `!isApproved` with `approval_status = 'pending'` → `redirect("/pending-approval")`.
- **Rejected** — terminal; `approval_status = 'rejected'` also fails `isApproved` → `redirect("/pending-approval")` (rejected-specific copy lives on that route).

**Rank-gating states ON this surface (decision 3 — preview-but-locked):**
- **Own + lower groups (unlocked)** — full data, interactive tiles, real badge counts.
- **Higher-rank groups (preview-but-locked)** — the group card **renders its head + grid structure** but returns **NO data** (no real badge counts, hints generic), and **all tiles are inert**. Treatment = `CaptainLock` "VIEW ONLY · no data for your rank". NOT a redirect; NOT a blocking overlay over the whole page. Clearance rule: a group is unlocked iff `viewerRank ≥ group.rank` (captain | derived team_lead | member). A captain sees all three unlocked; a team-lead sees Team Member + Team Lead unlocked, Captain locked; a plain member sees only Team Member unlocked (Team Lead + Captain locked).
- **Customize mode (active)** — tiles become `DraggableTileRow`s; DRAG TO REORDER + DRAG INTO A GROUP sections shown; Done pill exits. OPEN: whether locked groups are editable in Customize mode (recommend: can reorder/pin within unlocked scope only; locked groups remain preview, not drop targets).
- **Layer/entry** — no per-layer animation (the layered-quadrant model is dropped); groups simply stack.

**EnablePush internal states** (`"loading" | "unavailable" | "default" | "granted" | "denied"`): only `default` renders the button; the other four render nothing (S23).

---

## User actions — each action → result

- **Tap a tool tile** (unlocked, built destination) → navigate to that route (`Camp Management → /captains/camp-management`, `Camp Tools → /captains/tools`, `My Profile → /profile`, `Tools → /tools`).
- **Tap a tool tile** (unlocked, future destination) → inert/no-op (destination not yet designed). Flag, don't silently wire a 404.
- **Tap a tile in a locked (higher-rank) group** → nothing; tile is inert under preview-but-locked.
- **Tap Customize pill** → enter Customize mode (grid → editor).
- **Tap Done** → exit Customize mode, persist the new layout.
- **Drag a tile by its grip handle** → tile enters `moving` state (MOVING chip, accent stroke); valid insertion shows `DropSlot` ("Drop here").
- **Drop a tile onto a reorder slot** → tile moves to that position; tool-counts recompute.
- **Drag a tile over a group / Pinned** → group shows `DropZone` ("Release to add to Pinned"); releasing adds the tile to that group (and to Pinned for the Pinned group).
- **Tap New group** → create a new empty user-defined group as a drop target.
- **Tap the bell** → `/notifications`. **Tap the avatar** → `/profile`.
- **Tap Enable notifications** (push `default` only) → `Notification.requestPermission()` on the user gesture; on grant, register FCM token (POST `/api/push/tokens`, `platform: "web"`), button disappears.
- **Signed-out: tap "Are you lost?"** → `/auth/sign-in`.

---

## Data & enums — fields/enums touched (mapped to `schema.ts`)

- **`users`** — `rank` (`rankEnum` = `captain | member`, `schema.ts:31,231`) drives group unlock; `approvalStatus` (`approvalStatusEnum` = `pending | approved | rejected`, `:41-45,267`) gates entry; `inviteCode` (`:260`) for invite gate; `displayName` (`:223`) + `profileImageUrl` (`:229`) feed the avatar; `id` for all per-user reads.
- **Derived `team_lead`** — `team_memberships.is_lead = true` for the user (`teamMemberships`, `:446-462`); never stored on `users`. Drives whether the **Team Lead** group is unlocked.
- **`notification_deliveries`** — `count(*) where user_id = … AND read_at IS NULL` (`:830-887`) → bell badge count.
- **`required_actions`** — `getPendingRequiredActions` (status `pending` + `blocking = true`, ordered `createdAt`) → onboarding/approval gating before render (`requiredActionTypeEnum` `:99-104`; `requiredActionStatusEnum` `:106-111`).
- **`burner_profiles.completedAt`** (`:362`) — legacy onboarding fallback gate (to be dropped).
- **`invite_codes`** (indirect) — `hasCampAccess` path; `requiresApproval` decides `pending` enrolment (`:312-342`).
- **`push_tokens`** — EnablePush registers `{ token, platform: 'web' }`; `platformEnum` = `web | ios | android` (`:89`), `pushTokens` (`:734-753`).

**Per-tile badge counts** (board shows literal numbers; in product these are **derived live counts**, NEW wiring as destinations are built):
- Camp Tasks `12` / Crew Tasks `4` / My Tasks `5` → from `tasks` (`taskStatusEnum` `open`, scoped camp/team/assignee, `:893-916`).
- My Teams `3` → count of the member's `team_memberships` (`:446-462`).
- Pinned count → length of the user's pinned tile list (NEW client/persisted state).

**NEW (this surface — no schema today):**
- **Customize layout persistence** — the user's tile order / group assignments / pinned set / user-created groups. This is presentation state not modelled in `schema.ts`. RECONCILE: decision 4 states `captain_promotion_requests` is the **only** schema change in the redesign → home-layout customisation must be stored **client-side** (localStorage / cookie) or deferred, NOT a new table. Flag as a build reconciliation.
- **Future tile destinations** — Camp Tasks, Finances, Crew Roster, Crew Tasks, Crew Forms, Crew Announcements, My Teams, My Tasks have **no board and no built route** → mark "future / not yet designed".

---

## Validation & edge cases

- **Gate ordering is load-bearing:** auth → invite → required-actions → legacy-profile → approval. Reordering changes which gate a partially-onboarded user hits.
- **God accounts** (`GOD_EMAILS`) bypass invite + approval gates; created `rank: member`, `approval_status: approved`.
- **Rank derivation:** stored `rank` is only `captain | member`; team-lead is derived from `team_memberships.is_lead`. A member who leads a team unlocks the Team Lead group without a stored rank change.
- **Preview-but-locked must return NO data** (decision 3): locked higher-rank groups must not leak real badge counts, member lists, or any backend data — render structure + `CaptainLock` copy only. This is a security boundary, not just visual dimming.
- **Future tiles must not pretend to navigate:** do not wire dead `<a href>` that 404s (the live code's `My Teams → /members`, `My Tasks → /meals` dead-link bug). Render as inert / "coming soon" until built.
- **Tool-count consistency:** `N tools` must equal the live tile count in the group; after Customize edits / pinning, counts recompute (board's static `4 tools` is illustrative).
- **Customize persistence ceiling:** no new table (decision 4) → layout persists client-side; on a fresh device the default board layout is shown. Acceptable for one ~30–80-person camp.
- **Push opt-in is best-effort:** permission must be requested on a user gesture (Safari); FCM payload validated (zod) before constructing a `Notification`; renders nothing outside `default`.
- **Badge truthiness:** a tile badge renders only when its count is non-null and non-zero; bell badge hidden at 0, capped `99+`.
- **Empty Pinned / new group:** show the empty group with its DropZone so it remains a valid drop target.
- **`max-w-lg` applies** to this surface (430px mobile-first); no full-bleed override.

---

## Flows — entry → key transitions → exits

**Entry:** request `/` → `force-dynamic` reads session.
- No session → render `LandingHero` (exit via "Are you lost?" → `/auth/sign-in`).
- Session present → run gating spine. Any failed gate → redirect out (`/signup/required`, `/onboarding/questionnaire`, `/pending-approval`). All gates pass → derive viewer rank (+ team-lead), read unread count, render control panel.

**Core launcher flow:** view rank-group cards (own + lower unlocked, higher preview-but-locked) → tap a tile → deep-link to a built surface (e.g. `/captains/camp-management`, `/tools`, `/profile`) OR inert if future. Bell → `/notifications`; avatar → `/profile`.

**Customize flow:** tap Customize pill → editor mode → drag tiles (grip → MOVING → DropSlot reorder, or DropZone into a group / Pinned) / tap New group → tap Done → layout persists, return to populated view.

**Push flow:** if permission `default`, EnablePush button shown → tap → browser prompt → grant registers FCM token (button vanishes) / deny → button vanishes (state `denied` renders nothing).

---

## Divergences from feature-set reference — and resolution per locked decisions

The reference contract (`design/feature-set/06-home-control-panel.md`) documents the **live code**, which is a different design from the canonical S08 board. Boards win (decision 1).

1. **Layout model — quadrant vs rank-group cards.** Reference: a single layered **2×2 QuadrantTile** panel with a rank **LayerTabBar** (`Me / Team Lead / Captain`) switching one visible layer at a time. Board S08: **three stacked rank-group cards**, each a 2-column `GridTile` grid, all visible at once. **Resolution: adopt the S08 rank-group cards (boards win); drop the quadrant/layer-tab model and the `ControlPanel` component.**
2. **Centre TALK push-to-talk button.** Reference: a circular centre **TALK** mic button (inert on home today). **Resolution: DROPPED per decision 5** — voice is field-level dictation only (`DictatePill → S21 RecorderPanel`); no home mic. S08 has no centre button — consistent.
3. **Rank gating — locked-but-browsable tiles vs preview-but-locked groups.** Reference: higher layers render dimmed (`opacity-45` + `Lock`) but tabs are still browsable. **Resolution: apply decision 3 preview-but-locked at GROUP scope** — locked higher-rank groups render structure + `CaptainLock` "VIEW ONLY · no data for your rank", return NO data, fully inert. (Code's hard-redirect on `/captains/*` is separately replaced by the same pattern on those surfaces.)
4. **Customize / drag-to-reorder mode.** Reference: **absent** (live home has no customisation). Board S08: full Customize mode (grip drag, DropSlot, Pinned group + DropZone, New group). **Resolution: spec it from the board** — it is new functionality the board introduces; persist client-side only (no new table, decision 4).
5. **Tile set + destinations.** Reference tiles (`My Teams → /members`, `My Tasks → /meals`) are dead links; team-lead/captain tiles are hrefless no-ops. Board tiles partly differ (Camp Tasks, Crew Roster/Tasks/Forms/Announcements, Finances). **Resolution: use the board's tile set; mark Camp Tasks, Crew Tasks, Finances, Crew Forms, Crew Announcements, Crew Roster, My Teams, My Tasks as "future / not yet designed" (decision: home build-reconciliation) — document, don't silently orphan; do not wire 404 links.**
6. **EnablePush.** Reference + S23 board agree: button shown only in `default`, all other push states render nothing. **No divergence** — carry as-is.

---

## Open questions / build reconciliations

1. **My Profile destination.** S08 tile `My Profile` "You & your data" has no override href; the built profile view is `/profile` (`apps/web/app/profile/page.tsx`), while the live code wired it to `/onboarding/questionnaire`. RECOMMEND `/profile`. Confirm.
2. **Camp Tools vs Announcements.** Captain `Camp Tools` ("Announcements, admin…") — both `/captains/tools` and `/captains/announcements` exist. Is Camp Tools a hub that links onward to announcements, or should the tile go straight to one? Confirm IA.
3. **Customize-mode persistence.** Decision 4 caps schema changes to `captain_promotion_requests` only. Where does the customised layout / pinned set / user-created groups persist — localStorage, a cookie, or is Customize mode deferred to a later phase? (No new table allowed.)
4. **Customize on locked groups.** Can a viewer reorder/pin within preview-but-locked groups, or only within unlocked scope? RECOMMEND unlocked-only; locked groups stay preview and are not drop targets.
5. **Future-tile affordance.** For the un-built destinations, what does a tap do — silent no-op, a disabled/"coming soon" badge, or hide the tile until built? RECOMMEND a visible-but-inert "coming soon" affordance so the IA reads complete without 404s.
6. **Tool-count + badge sourcing.** Confirm derived counts (Camp/Crew/My Tasks from `tasks`; My Teams from `team_memberships`) and that locked-group tiles show NO real counts (decision 3).
7. **Per-tile icons.** Customize-mode rows imply icons (Camp Management `shield`, Finances `wallet`, Camp Tools `megaphone`, My Teams `users`, My Tasks `list-checks`, Camp/Crew Tasks `clipboard-list`); the populated `GridTile` heads should carry the same per-tool icon map. Codify the full icon set per tile.
8. **TopChrome reuse vs HomeHeader.** Board uses shared `TopChrome` (wordmark + bell + avatar). The live code's `HomeHeader` is functionally equivalent; reconcile onto the shared `TopChrome` component for consistency.
