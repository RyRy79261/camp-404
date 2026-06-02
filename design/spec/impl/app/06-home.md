# 06-home — app integration plan
- Route(s): `/` (authed) · routed page (`apps/web/app/page.tsx`, `export const dynamic = "force-dynamic"`)

This is the app-layer wiring for the control-panel surface (functional brief: `design/spec/surfaces/06-home.md`). It composes the home organisms — `TopChrome`, three `RankGroupCard`s, `CustomizeMode`, `EnablePush`, and (for the signed-out branch) `LandingHero` — over the existing G0→G3 gating spine. Plan-doc only; grounded in the live `apps/web/app/page.tsx` and the component/service plans linked below.

---

## Current state — the existing route/files today, and what the redesign changes

The home route is a single file: **`apps/web/app/page.tsx`** (`HomePage`, server component, `force-dynamic`). Confirmed by reading the live file. It does two jobs that the redesign treats very differently:

**(A) The gating spine (lines 29–63) — REUSE, near-verbatim.** The ordered chain is already correct and matches the brief's gate ordering (`06-home.md §Gating states` / `§Flows`):
- `getAuthenticatedUser()` (`@/lib/auth`) — null → `return <LandingHero />` (G0 held screen, NOT a redirect).
- `ensureCampUser(user)` + `hasCampAccess(campUser, user.primaryEmail)` (`@/lib/users`) — fail → `redirect("/signup/required")` (G1; god accounts bypass).
- `nextGate(await getPendingRequiredActions(campUser.id))` (`@/lib/required-actions` + `@/lib/users`) — truthy → `redirect(gate)` (G2; today `burner_profile` → `/onboarding/questionnaire`).
- Legacy fallback `getBurnerProfile(campUser.id)` → `!profile?.completedAt` → `redirect("/onboarding/questionnaire")` (G2b; brief flags it "to be dropped").
- `isApproved(campUser, user.primaryEmail)` — fail → `redirect("/pending-approval")` (G3; covers `pending` and `rejected`).

This whole block is owned by service-layer plan 01 and is REUSE. The redesign's only spine-internal change is **plan 01 step 4**: rewire the `viewerRank` ternary (`page.tsx:73-78`) to call `core.deriveViewerRank({ rank, isTeamLead })` instead of computing it inline. No gate is added, removed, or reordered.

**(B) The control-panel render (lines 82–179) — REPLACE.** Everything below the spine is the dropped layered-quadrant model:
- `page.tsx:84-95` mounts `<ControlPanel layers={homeLayers} viewerRank={viewerRank} header={<HomeHeader …/>} centre={{ label: "TALK" }} />` — one layered 2×2 `QuadrantTile` panel with a rank `LayerTabBar` and a centre **TALK** mic button. **DROP** (`06-home.md §Divergences #1, #2`; decision 5).
- `page.tsx:103-179` `homeLayers: ControlPanelLayer[]` — three layers, each four quadrants. Contains the dead links the brief calls out: `My Teams → /members`, `My Tasks → /meals` (neither route exists — confirmed `ls`: no `apps/web/app/members` / `apps/web/app/meals`), and `My Profile → /onboarding/questionnaire`. **REPLACE** with the board tile catalogue (`06-home.md §M2a/b/c`); fix `My Profile → /profile` (OQ#1); render future-destination tiles inert (no 404 `<a href>`).
- `page.tsx:97-98` `<EnablePush />` — **REUSE as-is** (`apps/web/components/push/enable-push.tsx`; organism-enablepush.md).

Other live files in the home composition:
- **`apps/web/app/home-header.tsx`** (`HomeHeader`, 57 lines) — bell + avatar cluster passed as `ControlPanel header`. Bell → `/notifications`, avatar → `/profile`, badge capped `>99 → "99+"`, avatar `h-8 w-8` (32px). **PROMOTE → `TopChrome`** (`molecule-topchrome.md`); DELETE after wiring.
- **`apps/web/app/landing-hero.tsx`** (`LandingHero` + local `Glitch404`) — **REUSE** unchanged (organism-landinghero.md); the G0 held screen.
- **`packages/ui/src/components/control-panel.tsx`** + `control-grid.tsx` + `quadrant-nav.tsx` — DEAD, on the DELETE list. `rankLevel`/`RANK_ORDER` (the canonical clearance comparator at `control-panel.tsx:31`) **EXTRACTs to `@camp404/core` before deletion** (plan 01 step 4); delete only after no consumer regresses.

There is **no `apps/web/app/home/` directory today** (confirmed `ls`) — the rank-group cards + customize editor are net-new files created under it. Error/not-found boundaries already exist at the app root (`apps/web/app/error.tsx`, `not-found.tsx`, `global-error.tsx`) and are REUSE — the home route inherits them, no per-segment boundary added. The `max-w-lg` wrapper is NOT in `layout.tsx` (confirmed — `layout.tsx` just renders `{children}`); the brief's `max-w-lg` (430px) wrapper must be applied by the home page's own content shell.

---

## File structure — target files in apps/web (CREATE/MODIFY/DELETE)

| File | Disposition | Role |
|---|---|---|
| `apps/web/app/page.tsx` | **MODIFY** | Keep the spine (A) verbatim except the `deriveViewerRank` rewire. Replace the `ControlPanel` mount (B) with: `<TopChrome>` + the home content shell (`max-w-lg`) wrapping a `HomeClient` island. Drop `homeLayers`, `ControlPanel`, `HomeHeader`, the `TALK` centre. Keep `<EnablePush />`. |
| `apps/web/app/home/home-client.tsx` | **CREATE** (`"use client"`) | The client island that owns the Customize toggle (Customize pill ⇄ Done): renders the three `RankGroupCard`s (populated/locked) when off, swaps to `CustomizeMode` when on. Receives server-resolved tiles/groups/viewerRank + the persisted-layout seed via props. |
| `apps/web/app/home/rank-group-card.tsx` | **CREATE** (server-capable; see Components) | The repeating rank-group container (organism-rankgroupcard.md). One per group, captain-first. |
| `apps/web/app/home/customize-mode.tsx` | **CREATE** (`"use client"`) | The drag-to-reorder editor (organism-customizemode.md). |
| `apps/web/app/home/draggable-tile-row.tsx` | **CREATE** (`"use client"`) | Customize-mode tile row (grip + icon + title + MOVING chip). |
| `apps/web/app/home/drop-slot.tsx` | **CREATE** | Insertion indicator ("Drop here"). |
| `apps/web/app/home/pinned-group.tsx` | **CREATE** | Pinned favourites group + DropZone. |
| `apps/web/app/home/new-group-affordance.tsx` | **CREATE** | Ghost "New group" add button. |
| `apps/web/app/home/tile-catalogue.ts` | **CREATE** | The static three-group × four-tile catalogue + per-tool icon map (rank · name · chipTone · icon · title · hint · href · comingSoon). Single source for both `RankGroupCard` and `CustomizeMode`. |
| `apps/web/app/home/use-layout.ts` | **CREATE** (`"use client"`) | `localStorage`-backed layout hook (`camp404:home-layout:v1`); seed from props, overlay on mount behind a `mounted` flag, write on Done. **No server write** (decision 4). |
| `apps/web/app/home-header.tsx` | **DELETE** | Replaced by `TopChrome` (after `page.tsx` rewire is green). |
| `apps/web/app/landing-hero.tsx` | **REUSE** (unchanged) | G0 held screen. |
| `apps/web/components/push/enable-push.tsx` | **REUSE** (unchanged) | M6 EnablePush. |
| `apps/web/app/error.tsx`, `not-found.tsx`, `global-error.tsx` | **REUSE** (unchanged) | Inherited route boundaries; no per-segment boundary added. |

**No server action, no `/api` route handler is created for this surface.** The only network call from home is the existing `POST /api/push/tokens` (REUSE; owned by EnablePush, not added here). Customize-mode persistence is `localStorage` only — explicitly no action, no table (decision 4; `06-home.md §"Customize persistence ceiling"`).

> **`"use client"` boundary note.** `RankGroupCard` is a server component in the standalone plan (organism-rankgroupcard.md §server/client split). But the Customize toggle is client state, so the populated-vs-editor swap must live in a client component (`home-client.tsx`). A client parent can still render `RankGroupCard` as a child; since `RankGroupCard` takes only serialisable-shaped props EXCEPT `icon: LucideIcon` (a function, not serialisable across the RSC boundary), the cleanest split is: **`home-client.tsx` is `"use client"` and imports the catalogue + lucide icons directly** (icons are fine inside a client tree), rendering `RankGroupCard` as a client-tree component. Server-side `page.tsx` passes only the *data* (viewerRank, per-group `locked`, badge counts, the persisted seed) — never the icon components — and `home-client.tsx` resolves icons from the catalogue by tile `id`. This keeps the RSC boundary serialisable and is the recommended resolution of organism-rankgroupcard.md's "page computes `locked`, withholds data" rule.

---

## Components composed — the list (link plans) and where each renders

| Component | Plan | Package / file | Server vs client | Where it renders |
|---|---|---|---|---|
| **LandingHero** | [organism-landinghero.md](../components/organism-landinghero.md) | app-local `apps/web/app/landing-hero.tsx` (REUSE) | server | G0 branch only — `if (!user) return <LandingHero />`. |
| **TopChrome** | [molecule-topchrome.md](../components/molecule-topchrome.md) | `@camp404/ui` (PROMOTE from `HomeHeader`) | client (`<a>` wrappers) | Top of the authed render; `avatarInitials` + `avatarImageUrl` + `unreadCount` props from server. Bell → `/notifications`, avatar → `/profile`. |
| **RankGroupCard** ×3 | [organism-rankgroupcard.md](../components/organism-rankgroupcard.md) | app-local `apps/web/app/home/rank-group-card.tsx` (NEW) | rendered inside the `home-client` tree (see boundary note) | The three rank groups, captain-first. `locked` per group from `requireClearance`; locked groups get group-scope `CaptainLock` + zero tiles. |
| **GridTile** | [molecule-gridtile.md](../components/molecule-gridtile.md) | `@camp404/ui` (PROMOTE) | client (`<button>`/`<a>`/inert `<div>`) | 4 per unlocked `RankGroupCard`, in a 2-col grid. `disabled` for `comingSoon` future tiles. |
| **IconBadge** | [atom-iconbadge.md](../components/atom-iconbadge.md) | `@camp404/ui` (PROMOTE) | presentational | GroupHead chip (per `RankGroupCard`) + IconBox inside each `GridTile`. |
| **Badge** | [atom-badge.md](../components/atom-badge.md) | `@camp404/ui` (PROMOTE) | presentational | Per-tile count pill (inside `GridTile`); the MOVING chip + Pinned count (Customize). |
| **CaptainLock** | [molecule-captainlock.md](../components/molecule-captainlock.md) | `@camp404/ui` (PROMOTE) | presentational | Inside each LOCKED `RankGroupCard` at `scope="group" skin="console"` — "VIEW ONLY · no data for your rank". |
| **CustomizeMode** (+ DraggableTileRow, DropSlot, PinnedGroup, NewGroupAffordance) | [organism-customizemode.md](../components/organism-customizemode.md) | app-local `apps/web/app/home/*` (NEW) | client | Swapped in for the `RankGroupCard` stack when Customize is active. |
| **Divider** | [atom-divider.md](../components/atom-divider.md) | `@camp404/ui` (NEW) | presentational | M4 rule between the rank-group region and the EnablePush/Customize region. |
| **EnablePush** | [organism-enablepush.md](../components/organism-enablepush.md) | app-local `apps/web/components/push/enable-push.tsx` (REUSE) | client | M6 row at the foot; renders the `Button` only in `default` permission state, `null` otherwise. |
| **CustomizePill** | (covered by organism-customizemode.md §host integration; small app-local control) | app-local (in `home-client.tsx` or `customize-mode.tsx`) | client | M1 header toggle (`sliders-horizontal` + "Customize"); flips `customizeActive`. |

---

## Services & data — service-layer functions / actions / core helpers it calls

All data is **fetched server-side in `page.tsx`** and passed as props into the client island; the client island fetches nothing (only reads `localStorage` for the layout overlay). No server action originates on this surface.

**Spine reads (service-layer plan 01, all `server-only`, all REUSE):**
- `getAuthenticatedUser()` — `@/lib/auth`. G0 branch.
- `ensureCampUser(user)`, `hasCampAccess(campUser, email)`, `isApproved(campUser, email)`, `isTeamLead(userId)` — `@/lib/users`. (`hasCampAccess`/`isApproved` bodies move to `core` with app shims — plan 01; call-sites unchanged.)
- `getPendingRequiredActions(campUser.id)` + `nextGate(...)` — `@/lib/users` + `@/lib/required-actions`. G2.
- `getBurnerProfile(campUser.id)` — `@/lib/users`. G2b legacy fallback.

**Post-gate reads (server-side, feed props):**
- `countUnread(campUser.id)` — `apps/web/lib/notifications.ts:121` (REUSE; service-layer 04). → `TopChrome unreadCount`. Kicked off in parallel with the team-lead probe (live code already does `unreadPromise`).
- `initialsFrom(campUser.displayName ?? user.primaryEmail)` — `@/lib/initials` (moves to `core/text` — plan 09; call-site stable). → `TopChrome avatarInitials`. `campUser.profileImageUrl` → `avatarImageUrl`.

**`@camp404/core` helpers (NEW/EXTRACTED — plan 01):**
- `deriveViewerRank({ rank: campUser.rank, isTeamLead: await isTeamLead(campUser.id) }) → ViewerRank` — replaces the `page.tsx:73-78` ternary.
- `requireClearance(viewerRank, group.rank) → { cleared, viewerRank, requiredRank }` — called per group in `page.tsx`. The single preview-but-locked decision (decision 3). If `cleared`, resolve the group's tiles (with badge counts where reads exist); else pass `tiles: []` + `locked: true` (server-side data withhold — security boundary).
- `rankLevel` / `RANK_ORDER` — the comparator behind `requireClearance`; EXTRACTED from `control-panel.tsx:31`.
- `ViewerRank` type — `@camp404/types` (`roles.ts`, NEW): `camp_member | team_lead | captain`.

**Per-tile badge counts (NEW wiring, deferred):** the board's literal numbers (Camp Tasks `12`, My Teams `3`, etc.) are derived live counts from `tasks` / `team_memberships` (`06-home.md §Data`). Those destinations are **not yet built**, so the page supplies `badge: undefined` for now; the prop is wired-ready. Locked groups carry **no** badge counts (decision 3).

**What is fetched server-side vs passed as props:** EVERYTHING data-bearing is fetched in `page.tsx` (spine + unread + initials + viewerRank + per-group `locked`/`tiles`). The client island receives: `viewerRank`, the three groups' `{ locked, tiles-data-or-empty }`, the avatar/unread props for `TopChrome`, and the catalogue (icons resolved client-side from tile `id`). The client island reads `localStorage` for the customize-layout overlay. **No customize state is ever persisted server-side** (decision 4).

---

## Gating — gate level + preview-but-locked treatment

Two gating layers apply, and both are load-bearing:

**1. The G0→G3 entry spine (page-level, runs before any render).** Owned by plan 01; REUSE. Order is `auth → invite → required-actions → legacy-profile → approval`. Reordering changes which gate a partially-onboarded user hits (`06-home.md §"Gate ordering is load-bearing"`). God accounts (`GOD_EMAILS`) bypass invite + approval. The control panel renders **only** when all gates pass.

**2. Per-group rank gating ON the surface — preview-but-locked (decision 3).** This IS a rank surface, applied at **group scope** (not full-surface). For each of the three groups, `page.tsx` calls `requireClearance(viewerRank, group.rank)`:

| viewerRank | Captain group | Team Lead group | Team Member group |
|---|---|---|---|
| `captain` | unlocked | unlocked | unlocked |
| `team_lead` | **locked** | unlocked | unlocked |
| `camp_member` | **locked** | **locked** | unlocked |

For LOCKED groups, the page passes `tiles: []` + `locked: true` — **the server never sends locked-group tile data, badge counts, or hints** (a security boundary, not visual dimming; `06-home.md §"Preview-but-locked must return NO data"`). `RankGroupCard` then renders GroupHead structure + `<CaptainLock scope="group" skin="console" />` ("VIEW ONLY · no data for your rank") in place of the grid, with the tool-count omitted (no cardinality leak). It is **NOT a redirect** and **NOT a full-page overlay** — it is the in-place rendered locked group. In Customize mode, locked groups are NOT drop targets and not in the editable set (`06-home.md §OQ#4`; recommend unlocked-scope-only).

`EnablePush` is **rank-agnostic** — no `CaptainLock` applies to it (every member sees it identically; organism-enablepush.md §States).

---

## States

**Page-level / gating states (the spine):**
- **Signed-out (G0)** — `LandingHero` rendered inline (NOT a redirect).
- **Invite-gated (G1)** — `redirect("/signup/required")`.
- **Onboarding-incomplete (G2/G2b)** — `redirect("/onboarding/questionnaire")`.
- **Pending / rejected (G3)** — `redirect("/pending-approval")`.

**Authed control-panel states:**
- **Loading** — the page **awaits all reads** (spine, unread, team-lead probe) before returning; there is **no client skeleton** for the panel (`06-home.md §Loading`). The island hydrates synchronously from props; the customize-layout overlay is gated behind a `mounted` flag (SSR shows the default board, first client paint reconciles to the saved layout — accept a one-frame default, or hold the customised render until mounted to avoid hydration mismatch).
- **Populated** — `TopChrome` + three `RankGroupCard`s (own + lower unlocked, higher preview-but-locked) + Divider + `EnablePush` (only if push `default`). Customize off.
- **Empty** — bell badge hidden when `unreadCount` falsy; avatar falls back to initials ("?" when none); tiles without a badge value render no pill; an unlocked group emptied by Customize shows `0 tools` + empty grid (or DropZone for Pinned/new groups).
- **Error** — a page-side read throwing is caught by the inherited `apps/web/app/error.tsx`; the panel components have no error state of their own.
- **Submitting / Success / Validation-error** — **N/A for the panel** (no form, no submit). The only async user action is the push permission request (flips the EnablePush state machine, not a banner) and the Customize `Done` write (synchronous `localStorage`, no spinner).
- **Disabled / inert** — `comingSoon` future-destination tiles (Camp Tasks, Finances, Crew Roster/Tasks/Forms/Announcements, My Teams, My Tasks) render as `GridTile disabled` (`aria-disabled`, dimmed, no `href`/handler) — never a dead `<a href>` that 404s (`06-home.md §"Future tiles must not pretend to navigate"`).

**Gating states on-surface:**
- **Unlocked group** — full data, interactive tiles, real badge counts (where reads exist).
- **Preview-but-locked group** — GroupHead + group-scope `CaptainLock`; zero tiles, zero counts, all inert.
- **Customize (active)** — `RankGroupCard` stack swapped for `CustomizeMode`; tiles become `DraggableTileRow`s; locked groups stay preview and are not drop targets.

**EnablePush internal states** (`loading | unavailable | default | granted | denied`): only `default` renders the button; the other four render `null` (S23/S26).

---

## Build steps — ordered, with prerequisites + acceptance + e2e/test notes

**Prerequisites (must land before the home wiring):**
- **P0 — Foundations tokens + fonts** (`foundations-tokens.md`, arch Phase 0): status tokens, `--text-*`/`--font-*`, radius, `--font-mono` (JetBrains Mono) for the "404" wordmark.
- **P1 — `@camp404/core` scaffold + types** (arch Phase 1; plan 01 step 4): `ViewerRank` in `@camp404/types`; `rankLevel`/`RANK_ORDER` EXTRACTED; `deriveViewerRank` + `requireClearance` NEW.
- **P2 — Leaf primitives:** `IconBadge`, `Badge`, `Divider`, `GridTile`, `CaptainLock` (incl. `scope="group"` + `skin="console"`), `TopChrome` (PROMOTE from `HomeHeader`).
- **P3 — Home organisms:** `RankGroupCard` (organism-rankgroupcard.md) and `CustomizeMode` (organism-customizemode.md), including the `@dnd-kit/core` dependency decision (organism-customizemode.md §P-DND — confirm with lead before adding the dep).

**Step 1 — Define the tile catalogue (`apps/web/app/home/tile-catalogue.ts`).** Encode the three groups × four tiles + per-tool icon map (`06-home.md §M2a/b/c` + OQ#7: Camp Management `Shield`, Camp Tasks `ClipboardList`, Finances `Wallet`, Camp Tools `Megaphone`, Crew Roster `Users`, Crew Tasks `ClipboardList`, Crew Forms `FileText`, Crew Announcements `Megaphone`, My Teams `Users`, My Tasks `ListChecks`, My Profile `UserRound`, Tools `Wrench`). Built hrefs: `Camp Management → /captains/camp-management`, `Camp Tools → /captains/tools`, `My Profile → /profile` (OQ#1), `Tools → /tools` — all confirmed to exist (`ls`). Mark the eight future tiles `comingSoon` (no href). *Acceptance:* exactly 3 groups × 4 tiles; every LIVE tile `href` resolves to an existing route; `comingSoon`/FUTURE tiles are inert and carry no `href`; no `href` points at an unbuilt route.

**Step 2 — Rewire the spine's `viewerRank` (`page.tsx`).** Replace the `page.tsx:73-78` ternary with `deriveViewerRank({ rank: campUser.rank, isTeamLead: await isTeamLead(campUser.id) })`. Keep the rest of the spine (lines 29–63) verbatim. *Prereq:* P1. *Acceptance:* gating behaviour unchanged; `core.deriveViewerRank` returns the same three values for the three inputs (plan 01 step 4 test).

**Step 3 — Build the home client island (`home-client.tsx`).** `"use client"`. Props: `viewerRank`, the three groups' `{ locked, tiles-data }` (data, not icons), `TopChrome` props, the persisted-layout seed. Owns `customizeActive` state + the `useLayout` hook. Off → render three `RankGroupCard`s (resolve icons from the catalogue by tile `id`); on → render `CustomizeMode`. Render the M1 CustomizePill. *Prereq:* P2, P3, Steps 1–2. *Acceptance:* island hydrates from props with no fetch; Customize pill toggles the editor; Done returns to the populated stack.

**Step 4 — Rewire `page.tsx` render (B).** Remove the `ControlPanel` mount, `homeLayers`, `HomeHeader` import, and the `TALK` centre. Render `<TopChrome avatarInitials avatarImageUrl unreadCount />` + a `max-w-lg` content shell (gap 20, pad [20,16]) wrapping `<HomeClient …/>`, a `<Divider />`, and `<EnablePush />`. Compute per-group `{ cleared } = requireClearance(viewerRank, group.rank)`; pass real tiles when cleared, `tiles: []` + `locked: true` otherwise. *Prereq:* Step 3. *Acceptance:* captain sees 3 unlocked groups; team-lead sees Member+Lead unlocked, Captain locked; member sees only Member unlocked; locked groups carry **no** tile/badge payload in the server HTML; no `TALK` button; no dead `<a href>`; `<EnablePush />` still mounts once at the foot.

**Step 5 — Customize mode + persistence.** Wire `CustomizeMode` + `use-layout.ts` (`localStorage` key `camp404:home-layout:v1`, seed-from-props + mount overlay + write-on-Done, `try/catch` for private mode). Enforce unlocked-scope-only editing (locked groups absent from the editable set). *Prereq:* Step 4 + P3. *Acceptance:* edit → Done → reload → layout restored; private mode → no crash, in-memory only; locked-group tiles never draggable; no server/network write.

**Step 6 — Delete dead files.** Delete `apps/web/app/home-header.tsx` (after `TopChrome` is wired, Step 4 green). Delete `packages/ui/src/components/control-panel.tsx` + `control-grid.tsx` + `quadrant-nav.tsx` (after `rankLevel`/`RANK_ORDER` are in `core` and no consumer imports them). *Acceptance:* `grep -r "HomeHeader\|ControlPanel\|control-grid\|quadrant-nav" apps/web packages/ui` returns nothing; `rankLevel` resolves from `@camp404/core`; `pnpm build` + `pnpm lint` green.

**Acceptance (surface-level):** the authed `/` renders the wordmark + bell (live `countUnread`) + avatar bar, three captain-first rank groups with correct per-viewer locking, an inert/coming-soon affordance for every unbuilt tile, the Customize toggle round-trip, and the EnablePush row only in push-`default`.

**E2E / test notes (`E2E_TEST_MODE` seam):**
- The spine is exercisable under `E2E_TEST_MODE` via the `camp404_test_user` cookie (test-backend `users`/`isTeamLead`). Playwright: login as `rank:"member"` → `/` 200, Captain + Team Lead groups render `CaptainLock`, **no** captain/lead tile payload in the HTML; login as `rank:"captain"` → all three groups populated. Mirrors `flows.md §3.3 invariant #2` (dimming a populated render is a data leak — assert the payload is absent, not merely hidden).
- `registerPushToken` is a **no-op under `E2E_TEST_MODE`** (organism-enablepush.md), so Playwright exercises the EnablePush render branches without DB writes; assert the button shows in `default` and no POST hits the DB in test mode.
- Assert **no element labelled "TALK"** on `/` (decision 5 regression fence) and **no `<a href="/members">` / `<a href="/meals">`** (dead-link regression).
- Customize E2E: open `/` → Customize → drag a tile → Done → reload → order persisted (organism-customizemode.md §E2E).
- Unit (`core`): `requireClearance` truth table + `deriveViewerRank` three inputs (plan 01 step 4).

---

## Open items — surface-specific decisions (cross-ref `open-questions.md` / `06-home.md §Open questions`)

1. **My Profile destination** (`06-home.md §OQ#1`) — RECOMMEND `/profile` (the built profile view); the live code wired it to `/onboarding/questionnaire`. Confirm.
2. **Camp Tools vs Announcements** (`06-home.md §OQ#2`) — both `/captains/tools` and `/captains/announcements` exist. Is `Camp Tools` a hub linking onward to announcements, or a direct link to one? RECOMMEND `/captains/tools` (the live mapping). Confirm IA.
3. **Customize persistence** (`06-home.md §OQ#3`; decision 4) — `localStorage` (RECOMMEND, key `camp404:home-layout:v1`), cookie (adds a server read), or defer Customize entirely. No new table allowed. Lock before building Step 5.
4. **Customize on locked groups** (`06-home.md §OQ#4`) — RECOMMEND unlocked-scope-only; locked groups stay preview and are not drop targets.
5. **Future-tile affordance** (`06-home.md §OQ#5`) — RECOMMEND a visible-but-inert "coming soon" `GridTile disabled` so the IA reads complete without 404s (vs silent no-op or hiding the tile). Confirm copy/treatment.
6. **Tool-count + badge sourcing** (`06-home.md §OQ#6`) — confirm derived counts (Camp/Crew/My Tasks from `tasks`; My Teams from `team_memberships`) and that locked-group tiles show NO real counts. Badges are `undefined` until the destination reads land.
7. **DnD library** (organism-customizemode.md §P-DND) — RECOMMEND `@dnd-kit/core` + `@dnd-kit/sortable` (keyboard-accessible, React 19 compatible). Confirm the dep before adding to `apps/web/package.json`.
8. **`max-w-lg` shell ownership** — the wrapper is not in `layout.tsx`; the home page applies it. Confirm whether other authed surfaces should share a layout-level wrapper later (out of scope this surface).
9. **EnablePush button width** (organism-enablepush.md §Build step 2) — `06-home.md §M6` says full-width; live code is centred `size="sm"`. Reconcile with the home-surface owner (no functional change either way).
10. **`HomeHeader` → `TopChrome` reconciliation** (`06-home.md §OQ#8`) — confirmed PROMOTE; corrects avatar 32→40px and off-token classes. Tracked in molecule-topchrome.md.
