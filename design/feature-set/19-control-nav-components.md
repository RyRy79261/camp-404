# 19 — Control Panel / Control Grid / Quadrant Nav

**Files covered:**
- `packages/ui/src/components/control-panel.tsx` — the LIVE rank-layered 2×2 quadrant home control panel (mobile, one layer at a time, push-to-talk centre, layer tab bar). Also exports the rank model (`ControlPanelRank`, `RANK_LABEL`, `rankLevel`) and the optional `ControlPanelHeader` default header content.
- `packages/ui/src/components/control-grid.tsx` — STORYBOOK-ONLY / DEAD desktop counterpart: lays out every rank layer at once as stacked sections of 4 tiles. Imports the rank model + types from `control-panel.tsx`. Not referenced by any app route; its sole importer is `control-grid.stories.tsx:13` (same dead/Storybook-only status as the `QuadrantNav` v0 prototype).
- `packages/ui/src/components/quadrant-nav.tsx` — PREPARED/UNUSED v0 single-layer four-quadrant nav with a circular push-to-talk centre. No rank model, no lock logic. Explicitly "Superseded by `ControlPanel`" (its story doc). Not referenced by any app route.
- `apps/web/app/page.tsx` — the SOLE live consumer (home, screen 06). Runs the gating spine, derives `viewerRank`, defines `homeLayers`, renders `<ControlPanel>`.
- `apps/web/app/home-header.tsx` — the header node passed into `ControlPanel`'s `header` slot on home: notifications bell + unread badge + avatar link.
- Stories (Storybook only, not shipped): `control-panel.stories.tsx`, `control-grid.stories.tsx`, `quadrant-nav.stories.tsx`.
- `packages/ui/src/styles/globals.css:58-68` — `@keyframes cp-layer-in` (layer-switch transition used by `ControlPanel`).

**Purpose:** Camp 404's home command-centre navigation surface. The live `ControlPanel` presents a 2×2 grid of action tiles ("quadrants") for exactly one *rank layer* at a time, with a circular push-to-talk centre button and a bottom tab bar that switches between three layers (camp member → team lead → captain). Layers above the viewer's own rank stay browsable but are rendered visible-but-locked (dimmed, lock icon, no interaction) — the brief's "captain-only-locked" gating expressed in the nav itself. `ControlGrid` is a desktop reflow of the same data (all layers shown at once), and `QuadrantNav` is the abandoned v0 single-layer prototype; both are prepared but currently unused.

## Features

### ControlPanel — root component (control-panel.tsx:100-177)
- Renders a full-viewport column: header bar (top) → quadrant grid (flex-1) → layer tab bar (bottom). Height `h-[100dvh]`, full width, background `var(--color-background)` (control-panel.tsx:127-132).
- Holds the active layer index in local state, initialised by clamping `initialLayer` into `[0, max(layers.length-1, 0)]` (control-panel.tsx:111-113).
- Resolves `layer = layers[active]`; if there is no layer at that index, renders `null` (early return) (control-panel.tsx:115-116).
- Computes `unlocked = rankLevel(viewerRank) >= rankLevel(layer.rank)` for the currently displayed layer; this single boolean gates all four tiles of the visible layer (control-panel.tsx:118).
- Renders the 2×2 grid as `grid-cols-2 grid-rows-2 gap-px` over a `var(--color-border)` background (the gap shows the border colour as hairlines between tiles). Grid carries `key={active}` and the `animate-[cp-layer-in_200ms_ease-out]` entrance animation, so switching layers replays the fade/scale-in (control-panel.tsx:136-139).
- Maps the four layer slots to four `QuadrantTile`s in fixed order: `topLeft`→`tl`, `topRight`→`tr`, `bottomLeft`→`bl`, `bottomRight`→`br`; each tile receives `locked={!unlocked}` and an `onSelect` that fires `onQuadrantSelect?.(quadrant, corner, layer)` (control-panel.tsx:140-164).
- Renders the push-to-talk `CentreButton` only when a `centre` prop is supplied (control-panel.tsx:166).
- Renders the `LayerTabBar` at the bottom (control-panel.tsx:169-174).

### ControlPanelHeaderBar (control-panel.tsx:179-192)
- Fixed-height (`h-14`) header with bottom border. Left: brand `title` (default `"Camp 404"`). Right: the caller's `header` slot node (control-panel.tsx:187-191).

### CentreButton — push-to-talk (control-panel.tsx:194-213)
- Circular button absolutely centred over the grid (`left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`, `z-20`). Sizing: `w-[22%] min-w-[5rem] max-w-[7rem]`, `aspect-square`, fully round (control-panel.tsx:204-205).
- Label defaults to `"TALK"`; icon defaults to a `Mic` (lucide) at `h-5 w-5`; ARIA label falls back to the visible label (control-panel.tsx:195-196, 200).
- Pointer-event wiring (NOT click): `onPointerDown → centre.onPress`, and `centre.onRelease` fires on `onPointerUp`, `onPointerLeave`, AND `onPointerCancel` (so leaving/cancelling the press also releases) — the press-and-hold contract for PTT (control-panel.tsx:201-204).
- Visual affordances: `active:scale-95` press feedback, `shadow-xl`, `ring-4 ring-[var(--color-background)]` (separates it from the grid), uses `var(--color-primary)` / `var(--color-primary-foreground)` (control-panel.tsx:205).

### LayerTabBar (control-panel.tsx:215-267)
- Fixed-height (`h-14`) bottom `<nav>` with `aria-label="Switch rank view"`, one equal-width button per layer (control-panel.tsx:227-230).
- Per-tab: `isActive = index === active`; `isLocked = rankLevel(viewerRank) < rankLevel(layer.rank)` (independent per-tab lock check, so locked layers can still be browsed/selected) (control-panel.tsx:232-233).
- Tab label uses the SHORT `RANK_TAB_LABEL` (`"Me"` / `"Team Lead"` / `"Captain"`) (control-panel.tsx:253).
- Locked tabs append a `Lock` icon (`h-3 w-3`) next to the label (control-panel.tsx:254).
- Active tab is bold + primary-coloured and shows a small underline pill (`absolute bottom-2 h-0.5 w-6 rounded-full`); inactive tabs are muted with a hover-to-foreground colour shift (control-panel.tsx:245-261).
- `aria-pressed={isActive}`; `aria-label` is `"{RANK_LABEL} view (locked, view only)"` when locked, else `"{RANK_LABEL} view"` — uses the LONG label here, vs short label visually (control-panel.tsx:239-244).
- Clicking any tab (locked or not) calls `onSelect(index)` → `selectLayer` → sets active + fires `onLayerChange?.(index, layer)` (control-panel.tsx:120-124, 238).

### QuadrantTile (control-panel.tsx:285-363)
- Body stack: icon row (icon + a `Lock` `h-3.5 w-3.5` appended when `locked`) → bold title (`quadrant.label`) → optional `quadrant.hint` (muted, `text-xs`) (control-panel.tsx:296-311).
- Corner-aligned content per `CORNER_ALIGN` so each tile's content hugs the grid's outer corner (control-panel.tsx:269-274, 326-329).
- Optional numeric/string `badge`: a rounded pill (`h-5 min-w-5`, primary background) pinned to the tile's TOP edge via `BADGE_CORNER` (always `top-3`, left for tl/bl, right for tr/br — kept at top so it never collides with the corner-aligned title stack) (control-panel.tsx:276-283, 313-324).
- Three render modes (mutually exclusive, checked in this order):
  1. **locked** → a non-interactive `<div aria-disabled="true">` with `opacity-45`. No href, no onClick. (control-panel.tsx:331-338)
  2. **href set** (and not locked) → renders as an `<a href>` with hover background; `onClick` still fires `onSelect` (so navigation + callback both happen) (control-panel.tsx:340-351).
  3. **otherwise** → a `<button type="button">` firing `onSelect` (control-panel.tsx:353-362).

### ControlPanelHeader — optional default header content (control-panel.tsx:365-401)
- Exported helper meant for the `header` slot. NOT used by the live app (home uses `HomeHeader` instead) — only referenced by `control-grid.stories.tsx`.
- Renders an auth button: `UserRound` icon + `userName`, or the literal `"Sign in"` when `userName` is omitted; fires `onAuth` on click (control-panel.tsx:383-390).
- Renders a settings icon button (`Settings`, `aria-label="Settings"`) firing `onSettings` (control-panel.tsx:391-398).

### HomeHeader — the live header slot node (apps/web/app/home-header.tsx)
- Notifications `<Link href="/notifications">` with a `Bell` icon; dynamic `aria-label` = `"Notifications (${notifications} unread)"` when there are unread, else `"Notifications"` (home-header.tsx:26-35).
- Unread badge: rounded primary pill shown only when `notifications` is truthy; displays the count, or the literal `"99+"` when `notifications > 99` (home-header.tsx:36-43).
- Avatar `<Link href="/profile" aria-label="Your profile">`: shows `AvatarImage` when `imageUrl` is set, else `AvatarFallback` with `initials` (home-header.tsx:45-54).

### page.tsx — live home wiring (apps/web/app/page.tsx)
- `export const dynamic = "force-dynamic"` (reads the auth session cookie per request) (page.tsx:27).
- Gating spine before the panel ever renders (page.tsx:29-63): unauthenticated → `<LandingHero/>`; no camp access → redirect `/signup/required`; pending blocking required action (`nextGate`) → redirect to that gate; legacy fallback (no `profile.completedAt`) → redirect `/onboarding/questionnaire`; not approved → redirect `/pending-approval`.
- Derives `viewerRank` (page.tsx:73-78): `campUser.rank === "captain"` → `"captain"`; else if `await isTeamLead(campUser.id)` → `"team_lead"`; else `"camp_member"`.
- Renders `<ControlPanel layers={homeLayers} viewerRank={viewerRank} header={<HomeHeader …/>} centre={{ label: "TALK" }} />` plus `<EnablePush/>` (web-push opt-in) (page.tsx:82-99).
- **Note (ugly truth):** the live `centre` prop supplies only `{ label: "TALK" }` — NO `onPress`/`onRelease`. So the push-to-talk button on home is visible and labelled but currently does nothing on press/release. Likewise `onQuadrantSelect` and `onLayerChange` are NOT wired in the app; tile navigation works purely via each quadrant's `href`. (page.tsx:94; confirmed no other handler wiring in `apps/web/app` or `apps/web/components`.)

### ControlGrid — desktop reflow (PREPARED/UNUSED) (control-grid.tsx:50-83)
- Same `layers` / `viewerRank` data shape as `ControlPanel`; intended to be selected by viewport so a screen feeds both the same props (control-grid.tsx:41-49).
- Renders ALL layers at once, each as a `ControlGridSection`, inside a centred `max-w-5xl` column (`min-h-[100dvh]`) (control-grid.tsx:57-82).
- Header bar shows `RANK_LABEL[viewerRank]` on the left and the `header` slot on the right (control-grid.tsx:64-69).
- `ControlGridSection` (control-grid.tsx:85-120): section heading = `RANK_LABEL[layer.rank]`; when `locked` (per-layer `rankLevel(viewerRank) < rankLevel(layer.rank)`), shows a `Lock` + `"View only"` pill. Tiles laid out responsively (`grid sm:grid-cols-2 lg:grid-cols-4`) using the shared `QUADRANTS` order array.
- `GridTile` (control-grid.tsx:122-181): same body stack as `ControlPanel`'s tile (icon + optional lock + label + optional hint), `min-h-[8rem]`, rounded `var(--radius)`. **Locked** → dashed-border `aria-disabled` div at `opacity-50`. **href** → `<a>`; **else** → `<button>`. NOTE: `GridTile` does NOT render a `badge` (the grid drops the quadrant badge feature that `ControlPanel` has).

### QuadrantNav — v0 prototype (PREPARED/UNUSED) (quadrant-nav.tsx:31-91)
- Single layer only: four `QuadrantNavItem`s (`{label, href, icon?}`) laid out in a `grid-cols-2 grid-rows-2 gap-px` over `var(--color-border)`, full `h-[100dvh]` (quadrant-nav.tsx:39-49).
- Each tile is always an `<a href>` (no lock logic, no rank, no badge, no callbacks). Corner alignment pushes content TOWARD the centre (e.g. tl → `items-end justify-end pb-12 pr-12`) — opposite of `ControlPanel`'s outward-corner alignment (quadrant-nav.tsx:65-90).
- Centre PTT button: circular `h-24 w-24`, `z-10`, `aria-label={centre.label}`, pointer wiring `onPointerDown→onPress`, `onPointerUp`/`onPointerLeave→onRelease` (NO `onPointerCancel`, unlike `ControlPanel`'s centre) (quadrant-nav.tsx:51-60).
- Explicitly superseded; "v0 layout, to be validated in Figma" (quadrant-nav.tsx:26-30, quadrant-nav.stories.tsx:14-17).

## User actions & interactions
- **Switch rank layer** — tap a tab in the bottom tab bar (`ControlPanel`) to change the visible layer; works for locked layers too (browse-only). Fires `onLayerChange`. (control-panel.tsx:120-124, 238)
- **Activate a quadrant** — tap/click an unlocked tile. If it has an `href` it navigates (`<a>`); regardless it fires `onQuadrantSelect(quadrant, corner, layer)`. Locked tiles are inert (`aria-disabled`, no handler). (control-panel.tsx:340-362)
- **Push-to-talk** — press-and-hold the centre button: pointer-down → `onPress`; pointer-up / pointer-leave / pointer-cancel → `onRelease`. (control-panel.tsx:201-204) Live home does not yet bind these handlers.
- **Open notifications** — tap the bell in the header (`HomeHeader`) → `/notifications`. (home-header.tsx:26-35)
- **Open own profile** — tap the avatar in the header → `/profile`. (home-header.tsx:45-54)
- **Live home tile destinations** (from `homeLayers`, only the camp_member + captain layers carry `href`s):
  - camp_member: My Teams → `/members`; My Tasks → `/meals`; My Profile → `/onboarding/questionnaire`; Tools → `/tools`. (page.tsx:104-130)
  - team_lead layer (Team Roster / Team Tasks / Lead Profile / Team Tools): NO `href`s → tiles are non-navigating buttons (no `onQuadrantSelect` wired → effectively inert). (page.tsx:131-153)
  - captain: Camp Management → `/captains/camp-management`; Camp Tasks → (no href); Finances → (no href); Camp Tools → `/captains/tools`. (page.tsx:154-178)
- **(ControlPanelHeader default, unused live)** — auth button → `onAuth`; settings button → `onSettings`. (control-panel.tsx:383-398)

## States & presentations
Mapping to the global-states rows that apply to this surface:
- **Populated** — at least one layer; `layers[active]` resolves; tiles render labels/hints/icons/badges. (control-panel.tsx:115)
- **Empty** — `layers[active]` undefined → `ControlPanel` renders `null` (no built-in empty placeholder). The home page always passes the fixed 3-layer `homeLayers`, so this only occurs with malformed input. (control-panel.tsx:116)
- **Disabled / Captain-only-locked (the headline state here)** — any layer whose `rank` exceeds `rankLevel(viewerRank)` is *visible but locked*: tabs show a `Lock` icon + `aria-label "(locked, view only)"`; tiles render as `aria-disabled` divs at `opacity-45` (ControlPanel) / `opacity-50` + dashed border (ControlGrid) with a `Lock` glyph and no interactivity. This is the brief's visible-but-locked / captain-only-locked contract realised inside the nav. (control-panel.tsx:233, 242, 331-338; control-grid.tsx:76, 100-105, 151-162)
- **Active-tab indicator** — current layer's tab is bold/primary with an underline pill. (control-panel.tsx:247-261)
- **Layer-switch transition** — `cp-layer-in` keyframe: `opacity 0→1`, `scale 0.98→1` over 200ms ease-out, replayed via `key={active}`. (control-panel.tsx:138; globals.css:58-68)
- **Badge state** — quadrant badge renders only when `badge != null && badge !== "" && badge !== 0`; HomeHeader notification badge collapses values `>99` to `"99+"`. (control-panel.tsx:313-314; home-header.tsx:41)
- **Press feedback** — centre button `active:scale-95`; tiles/tabs/header buttons have hover background/colour transitions. (control-panel.tsx:205, 345, 357)
- **Header notification states** — no unread → bell only, `aria-label "Notifications"`, badge hidden; unread → badge + count in aria-label. (home-header.tsx:28-43)
- **Avatar fallback** — photo when `imageUrl` set, else initials. (home-header.tsx:50-53)
- **Submitting / Success / Validation-error** — NOT expressed by this surface; it is pure navigation with no forms. (The upstream gating states — invite-gated, onboarding-incomplete, pending-approval, rejected — are handled by `page.tsx`'s redirect spine BEFORE the panel renders, never inside the panel.) (page.tsx:29-63)

## Enums, options & configurable values
- **`ControlPanelRank`** (UI-local, control-panel.tsx:13): exactly `"camp_member" | "team_lead" | "captain"`. Deliberately separate from the stored two-rank DB enum.
- **`RANK_ORDER`** (control-panel.tsx:16): `["camp_member", "team_lead", "captain"]` — array index = clearance level (0,1,2). `rankLevel()` returns `RANK_ORDER.indexOf(rank)` (control-panel.tsx:31-33).
- **`RANK_LABEL`** (control-panel.tsx:18-22): `camp_member:"Camp Member"`, `team_lead:"Team Lead"`, `captain:"Captain"`.
- **`RANK_TAB_LABEL`** (control-panel.tsx:25-29): `camp_member:"Me"`, `team_lead:"Team Lead"`, `captain:"Captain"` (short tab variant; "Camp Member" doesn't fit).
- **`ControlPanelCorner`** (control-panel.tsx:35): `"tl" | "tr" | "bl" | "br"`.
- **`CORNER_ALIGN`** (control-panel.tsx:269-274): tl `items-start justify-start text-left`; tr `items-end justify-start text-right`; bl `items-start justify-end text-left`; br `items-end justify-end text-right`.
- **`BADGE_CORNER`** (control-panel.tsx:278-283): tl `top-3 left-3`; tr `top-3 right-3`; bl `top-3 left-3`; br `top-3 right-3`.
- **`QUADRANTS`** order array (control-grid.tsx:16-24): `[{tl,topLeft},{tr,topRight},{bl,bottomLeft},{br,bottomRight}]`.
- **Centre defaults** (control-panel.tsx:195-196): label `"TALK"`; icon `<Mic className="h-5 w-5"/>`; aria falls back to label.
- **`ControlPanel` prop defaults**: `viewerRank="camp_member"` (control-panel.tsx:102), `initialLayer=0` (page comment: "personal context", control-panel.tsx:73,103), `title="Camp 404"` (control-panel.tsx:104). `ControlGrid` `viewerRank="camp_member"` (control-grid.tsx:54).
- **Notification badge cap** (home-header.tsx:41): `"99+"` above 99.
- **`homeLayers`** (live nav content, page.tsx:103-179): three layers as listed under User actions. Labels/hints verbatim — camp_member: My Teams/"Your crews", My Tasks/"What's on you", My Profile/"You & your data", Tools/"Meals, expenses…"; team_lead: Team Roster/"Members in your team", Team Tasks/"Assign & track work", Lead Profile/"Your team setup", Team Tools/"Shifts, notices…"; captain: Camp Management/"Roster & statuses", Camp Tasks/"Camp-wide work board", Finances/"Dues & reimbursements", Camp Tools/"Announcements, ops…". Icons used: `Users`, `ListChecks`, `UserRound`, `Wrench` (all `h-5 w-5`). (page.tsx:2, 103-179)
- **`@keyframes cp-layer-in`** params (globals.css:58-68): `opacity 0→1`, `transform scale(0.98)→scale(1)`; applied 200ms ease-out.

## Data model touched
This is a presentation/navigation surface — it takes plain props and touches NO table directly. The live consumer (`page.tsx`) reads these (must agree with unit 29):
- **`users.rank`** — DB `rankEnum("rank")` = `["captain", "member"]`, NOT NULL, default `"member"` (packages/db/src/schema.ts:31, 231). Mapped to `ControlPanelRank` in `page.tsx`: `captain`→`captain`; otherwise team-lead/member decided below.
- **`team_memberships.is_lead`** (DERIVED team-lead) — `isTeamLead(userId)` resolves via `@camp404/db/roster`: a Drizzle `select({ team: teamMemberships.team }).from(teamMemberships).where(and(eq(teamMemberships.userId, userId), eq(teamMemberships.isLead, true))).limit(1)`, returning `rows.length > 0` — NOT a raw `exists(...)` SQL string (packages/db/src/roster.ts:204-217). Drives the `"team_lead"` `viewerRank`. NOTE: the live page does not import this directly — it calls `isTeamLead` via `@/lib/users` (the store wrapper), which returns `false` under E2E. (page.tsx:76)
- **`CampUser`** fields read on home: `id`, `rank`, `displayName`, `profileImageUrl`, plus approval/access checks (`hasCampAccess`, `isApproved`, `getBurnerProfile().completedAt`, `getPendingRequiredActions`) used by the upstream gating spine, not by the panel itself. (page.tsx:39-78)
- Header inputs: `initials` (from `initialsFrom(displayName ?? primaryEmail)`), `profileImageUrl`, unread count from `countUnread(campUser.id)`. (page.tsx:65-92)
- **Component-level interfaces** (props, not persisted): `ControlPanelQuadrant {label, hint?, href?, icon?, badge?: number|string}` (control-panel.tsx:37-46); `ControlPanelLayer {rank, topLeft, topRight, bottomLeft, bottomRight}` (control-panel.tsx:48-55); `ControlPanelCentre {label?, icon?, ariaLabel?, onPress?, onRelease?}` (control-panel.tsx:57-66); `ControlPanelProps` (control-panel.tsx:68-88); `ControlGridProps` (control-grid.tsx:26-39); `QuadrantNavItem {label, href, icon?}` + `QuadrantNavProps` (quadrant-nav.tsx:6-24).

## Validation, edge cases & business rules
- **`initialLayer` clamping** — clamped to `[0, max(layers.length-1, 0)]`; out-of-range values are pulled in-bounds rather than erroring. (control-panel.tsx:90-92, 111-113)
- **Missing active layer** — `layers[active]` undefined → render `null` (no crash, no fallback UI). (control-panel.tsx:116)
- **Lock rule (interaction gate)** — a tile is interactive iff `rankLevel(viewerRank) >= rankLevel(layer.rank)`. The displayed grid uses one `unlocked` boolean (control-panel.tsx:118); the tab bar evaluates lock per-tab (control-panel.tsx:233); `ControlGrid` evaluates per-section (control-grid.tsx:76). Locked tiles never get an `href` or `onClick` wired — even if the quadrant data carries an `href`, the locked branch (a plain `<div>`) is chosen first, so locked links are non-navigable. (control-panel.tsx:331-351)
- **Browsing locked layers is allowed** — tab clicks always switch the active layer regardless of lock; only the tiles are inert. This is intentional ("visible but locked"). (control-panel.tsx:238)
- **Badge truthiness rule** — a quadrant badge is suppressed for `null`/`undefined`/`""`/`0`; any other number or non-empty string shows. (control-panel.tsx:313-314)
- **Notification badge** — suppressed when falsy; capped display `"99+"` for `>99`. (home-header.tsx:36-43)
- **Centre release safety** — `onRelease` is bound to pointer-up AND pointer-leave AND pointer-cancel, so a hold that drifts off the button or is interrupted still releases (no stuck-recording). (control-panel.tsx:202-204) `QuadrantNav`'s centre omits `onPointerCancel` (looser). (quadrant-nav.tsx:55-57)
- **Rank-model decoupling** — the UI's three-tier `ControlPanelRank` is intentionally NOT the DB's two-rank enum; `team_lead` exists only in the UI layer and is derived at the call site (`page.tsx`) from `is_lead`, never stored. Comments flag this is "kept separate until that derivation is settled." (control-panel.tsx:7-13; schema.ts:454 comment notes a future `users.rank='team_lead'` that does NOT exist today.)
- **Auth-button label fallback** — `ControlPanelHeader` shows `"Sign in"` when `userName` is absent. (control-panel.tsx:389)
- **Accessibility** — decorative icons/badges use `aria-hidden`; tabs expose `aria-pressed` + descriptive `aria-label`; locked tiles use `aria-disabled="true"`; centre/header buttons carry explicit `aria-label`s. (throughout)

## Sub-components / variants
**ControlPanel (LIVE, control-panel.tsx):** `ControlPanel` (root) · `ControlPanelHeaderBar` · `CentreButton` · `LayerTabBar` · `QuadrantTile` (three modes: locked div / `<a>` / `<button>`) · `ControlPanelHeader` (exported default-header helper — only consumed by `control-grid.stories.tsx`, NOT by the live app, which substitutes `HomeHeader`). Exported rank model: `ControlPanelRank`, `RANK_ORDER`(internal), `RANK_LABEL`, `RANK_TAB_LABEL`(internal), `rankLevel`.

**ControlGrid (STORYBOOK-ONLY / DEAD, control-grid.tsx):** `ControlGrid` (root) · `ControlGridSection` · `GridTile` (locked dashed div / `<a>` / `<button>`). Desktop all-layers-at-once reflow of the same props. NOT imported by any app route — its SOLE importer is `control-grid.stories.tsx:13` (parity with the `QuadrantNav` v0/unused caveat below). **Drops the per-quadrant `badge`** that `ControlPanel` supports. Flag: dead/orphaned in production (Storybook-only).

**QuadrantNav (DEAD/ORPHANED v0, quadrant-nav.tsx):** `QuadrantNav` (root) · `QuadrantTile` (always `<a>`). Single-layer, no rank/lock/badge, content aligned toward centre, centre PTT omits `onPointerCancel`. Explicitly "Superseded by `ControlPanel`… kept for reference." Only referenced by `quadrant-nav.stories.tsx`. Flag: dead/orphaned.

**Stories (Storybook-only, not shipped):** `control-panel.stories.tsx` demonstrates `CampMember`/`TeamLead`/`Captain`/`LockedLayer` variants and a `DemoHeader`; `control-grid.stories.tsx` (uses `ControlPanelHeader`); `quadrant-nav.stories.tsx` (`Default`). These illustrate states but are not part of the runtime surface.

**Centre push-to-talk note:** the PTT centre is a confirmed feature of all three components, but on the live home screen its `onPress`/`onRelease` are not wired (`centre={{ label: "TALK" }}` only) — a restyle must preserve the press-and-hold button and its pointer-event contract so the eventual voice pipeline (unit on the voice pipeline) can attach to it.
