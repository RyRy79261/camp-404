# Verification — 19 control-nav-components

**Verdict:** accurate  ·  checked 71 claims, verified 68.
The doc is a high-fidelity, digit-accurate description of the control-panel/control-grid/quadrant-nav surface and its sole live consumer. The only real defect is a wrong file:line + wrong-function attribution for `isTeamLead`'s SQL (the cited lines point at a different roster function); the claimed behaviour is still correct. Everything else — class strings, enums, render-mode ordering, prop defaults, the "PTT not wired on home" ugly truth, and the dead/orphaned status of ControlGrid + QuadrantNav — confirms against source.

## Inaccuracies

| severity | doc claim | code reality | file:line |
|---|---|---|---|
| medium | `isTeamLead(campUser.id)` "resolves via `@camp404/db/roster`, whose SQL is `exists (… where tm.user_id = users.id and tm.is_lead = true)` (packages/db/src/roster.ts:21-22, 66-68)" | The cited lines are the WRONG function: roster.ts:21-22 is the `CampManagementMember.isLead` JSDoc and roster.ts:66-68 is the `exists(...)` subquery inside `getCampManagementRoster`, NOT `isTeamLead`. The real `isTeamLead` lives at roster.ts:204-217 and uses a Drizzle `select({team}).from(teamMemberships).where(and(eq(userId), eq(isLead,true))).limit(1)` — not a raw `exists` SQL string. Also, the live page calls `isTeamLead` from `@/lib/users` (a store wrapper), which routes to `dbIsTeamLead` only in the real backend; under E2E it returns `false`. | roster.ts:204-217; apps/web/lib/users.ts:244-247, 387-389, 448-450 |
| low | "`ControlPanelHeader` … only referenced by `control-grid.stories.tsx`" | Correct that it is the only *external* reference, but `ControlPanelHeaderProps` is also exported and `ControlPanelHeader` is defined in control-panel.tsx itself; grep confirms the lone consumer is control-grid.stories.tsx:14,107. Effectively accurate, listed only for completeness. | control-grid.stories.tsx:14,107 |
| low | keyframe "(globals.css:58-68)" / "globals.css:58-68" | The `@keyframes cp-layer-in` block is lines 59-68; line 58 is the leading comment. One-line drift on the start. | globals.css:58-68 |

## Omissions

| severity | missing behavior/state/enum | file:line |
|---|---|---|
| low | The live `viewerRank` derivation is wrapped through a store abstraction with an E2E test branch (`isE2ETestMode() ? testBackend : realBackend`) where the in-memory store always reports `isTeamLead → false`. The doc presents the derivation as a direct DB read; it does not mention the test-store path. Not user-facing, but relevant to "no fabricated/test-only behavior" diligence. | apps/web/lib/users.ts:244-247, 448-450 |
| low | `apps/web/scripts/pencil/capture-screenshots.ts:188,217` is a second (non-route) reference to ControlPanel via the live `/` page. Doc calls page.tsx the "SOLE live consumer," which is true for app routes; the screenshot script merely drives the same route. No correction needed. | apps/web/scripts/pencil/capture-screenshots.ts:188,217 |

## Spot-confirmed
- `ControlPanel` root spans control-panel.tsx:100-177; full-viewport column `flex h-[100dvh] w-full flex-col bg-[color:var(--color-background)]` (127-132). ✓
- Active layer state clamped `clamp(initialLayer, 0, Math.max(layers.length - 1, 0))` (111-113); `clamp` defined 90-92. ✓
- `const layer = layers[active]; if (!layer) return null;` early return (115-116). ✓
- `unlocked = rankLevel(viewerRank) >= rankLevel(layer.rank)` single boolean for the visible layer (118). ✓
- Grid `grid h-full w-full grid-cols-2 grid-rows-2 gap-px bg-[color:var(--color-border)] animate-[cp-layer-in_200ms_ease-out]` with `key={active}` (136-139). ✓
- Four tiles in tl/tr/bl/br order each `locked={!unlocked}` and `onSelect={() => onQuadrantSelect?.(quadrant, corner, layer)}` (140-164). ✓
- `{centre && <CentreButton centre={centre} />}` — PTT only when `centre` supplied (166). ✓
- HeaderBar `h-14 shrink-0 … border-b`, brand `title` left default `"Camp 404"` (179-192; default at 104). ✓
- CentreButton: label default `"TALK"` (195), icon default `<Mic className="h-5 w-5" aria-hidden />` (196), aria falls back to label (200). ✓
- Pointer wiring: `onPointerDown={centre.onPress}`, `onRelease` on `onPointerUp` + `onPointerLeave` + `onPointerCancel` (201-204). ✓
- Centre classes: `absolute left-1/2 top-1/2 z-20`, `aspect-square w-[22%] min-w-[5rem] max-w-[7rem]`, `rounded-full`, `active:scale-95`, `shadow-xl`, `ring-4 ring-[color:var(--color-background)]`, primary bg/fg (205). ✓
- LayerTabBar `<nav aria-label="Switch rank view">`, `h-14 shrink-0`, equal-width buttons (227-230). ✓
- Per-tab `isActive = index === active`; `isLocked = rankLevel(viewerRank) < rankLevel(layer.rank)` (232-233). ✓
- Tab visible label uses `RANK_TAB_LABEL` (253); locked tab appends `<Lock className="h-3 w-3" aria-hidden />` (254). ✓
- Active tab pill `absolute bottom-2 h-0.5 w-6 rounded-full bg-[color:var(--color-primary)]` (257-260); active = `font-semibold text-primary`, inactive muted w/ hover-to-foreground (245-250). ✓
- `aria-pressed={isActive}`; aria-label `"{RANK_LABEL} view (locked, view only)"` when locked else `"{RANK_LABEL} view"` (239-244). ✓
- Tab click `onClick={() => onSelect(index)}` → `selectLayer` sets active + `onLayerChange?.(index, next)` (120-124, 238). ✓
- QuadrantTile body: icon row (icon + `<Lock className="h-3.5 w-3.5">` when locked) → bold title → optional `text-xs` muted hint (296-311). ✓
- `CORNER_ALIGN` (269-274) and `BADGE_CORNER` (278-283) values verbatim; badge always `top-3`, left for tl/bl, right for tr/br. ✓
- Three render modes in order: locked `<div aria-disabled="true">` `opacity-45` (331-338) → `href` `<a>` with `onClick={onSelect}` + hover bg (340-351) → `<button type="button">` (353-362). ✓
- Badge truthiness: `quadrant.badge != null && quadrant.badge !== "" && quadrant.badge !== 0` (313-314); pill `h-5 min-w-5 … bg-primary` (318). ✓
- `ControlPanelHeader` (365-401): auth `<button>` `UserRound` + `userName ?? "Sign in"` (383-390); settings `<button aria-label="Settings">` `Settings` icon (391-398). ✓
- `ControlPanelRank = "camp_member" | "team_lead" | "captain"` (13); `RANK_ORDER = ["camp_member","team_lead","captain"]` (16); `rankLevel = RANK_ORDER.indexOf(rank)` (31-33). ✓
- `RANK_LABEL` Camp Member/Team Lead/Captain (18-22); `RANK_TAB_LABEL` Me/Team Lead/Captain (25-29). ✓
- `ControlPanelCorner = "tl" | "tr" | "bl" | "br"` (35). ✓
- Prop defaults: `viewerRank="camp_member"` (102), `initialLayer=0` w/ "personal context" comment (73,103), `title="Camp 404"` (104). ✓
- Interfaces verbatim: `ControlPanelQuadrant {label,hint?,href?,icon?,badge?:number|string}` (37-46); `ControlPanelLayer {rank,topLeft,topRight,bottomLeft,bottomRight}` (48-55); `ControlPanelCentre {label?,icon?,ariaLabel?,onPress?,onRelease?}` (57-66); `ControlPanelProps` (68-88). ✓
- `@keyframes cp-layer-in`: `opacity 0→1`, `transform scale(0.98)→scale(1)` (globals.css:59-68); applied 200ms ease-out via the grid class. ✓
- ControlGrid (50-83): defaults `viewerRank="camp_member"` (52); renders all layers as `ControlGridSection` inside `mx-auto … max-w-5xl … min-h-[100dvh]` (57-82). ✓
- ControlGrid header shows `RANK_LABEL[viewerRank]` left + header slot right (64-69). ✓
- `ControlGridSection` (85-120): heading `RANK_LABEL[layer.rank]`; locked → `<Lock h-3 w-3>` + "View only" pill (96-105); tiles `grid sm:grid-cols-2 lg:grid-cols-4` over `QUADRANTS` (108-117). ✓
- `GridTile` (122-181): `min-h-[8rem]`, `rounded-[var(--radius)]`; locked → dashed-border `aria-disabled` div `opacity-50` (151-162); `href` → `<a>`; else `<button>`. **No `badge` rendered** — confirmed, badge logic absent from control-grid.tsx. ✓
- `QUADRANTS` order array (control-grid.tsx:16-24): tl/topLeft, tr/topRight, bl/bottomLeft, br/bottomRight. ✓
- QuadrantNav (quadrant-nav.tsx): single layer, four `<a href>` tiles in `grid-cols-2 grid-rows-2 gap-px` over `var(--color-border)`, `h-[100dvh]` (39-49); centre PTT `h-24 w-24 z-10 aria-label={centre.label}` with `onPointerDown`/`onPointerUp`/`onPointerLeave` and **no `onPointerCancel`** (51-60). ✓
- QuadrantNav tile alignment pushes content TOWARD centre (tl → `items-end justify-end pb-12 pr-12`) (72-77). ✓
- QuadrantNav JSDoc "v0 layout, to be validated in Figma" (26-30); story "Superseded by `ControlPanel` … kept for reference." (quadrant-nav.stories.tsx:14-17). ✓
- HomeHeader (home-header.tsx): bell `<Link href="/notifications">` aria-label `"Notifications (${notifications} unread)"` when unread else `"Notifications"` (26-35); badge shown only when `notifications` truthy, `notifications > 99 ? "99+" : notifications` (36-43); avatar `<Link href="/profile" aria-label="Your profile">` `AvatarImage` when `imageUrl` else `AvatarFallback` initials (45-54). ✓
- page.tsx: `export const dynamic = "force-dynamic"` (27); gating spine 29-63 (LandingHero for `!user`, `/signup/required` on no camp access, `nextGate` redirect, `/onboarding/questionnaire` legacy fallback on missing `completedAt`, `/pending-approval` if not approved). ✓
- `viewerRank` derivation 73-78: `campUser.rank === "captain"` → captain; else `await isTeamLead(...)` → team_lead; else camp_member. ✓
- Live render: `<ControlPanel layers={homeLayers} viewerRank header={<HomeHeader .../>} centre={{ label: "TALK" }} />` + `<EnablePush />` (82-99). ✓
- Ugly truth confirmed: `centre={{ label: "TALK" }}` has NO `onPress`/`onRelease` (94); no `onQuadrantSelect`/`onLayerChange` wired anywhere in app (grep clean). ✓
- `homeLayers` labels/hints/hrefs/icons verbatim (103-179): camp_member My Teams→/members, My Tasks→/meals, My Profile→/onboarding/questionnaire, Tools→/tools; team_lead Team Roster/Team Tasks/Lead Profile/Team Tools with NO hrefs; captain Camp Management→/captains/camp-management, Camp Tasks (no href), Finances (no href), Camp Tools→/captains/tools. Icons Users/ListChecks/UserRound/Wrench all `h-5 w-5` (page.tsx:2). ✓
- Dead/orphaned status confirmed by grep: ControlGrid only in control-grid.stories.tsx; QuadrantNav only in quadrant-nav.stories.tsx; neither imported by any `apps/web/app` route. ✓
- DB rank: `rankEnum = pgEnum("rank", ["captain", "member"])` (schema.ts:31); `users.rank` NOT NULL default `"member"` (schema.ts:231). ✓
- schema.ts:453-454 comment: "A user who is a lead on any team should also carry `users.rank = 'team_lead'`." — aspirational; `team_lead` is NOT in the enum today. Doc's "future, does not exist today" framing confirmed. ✓
- Rank-model decoupling JSDoc at control-panel.tsx:7-13 ("Kept separate from the `Role` enum … until that derivation is settled"). ✓
- Stories enumerated: control-panel.stories.tsx has `CampMember`/`TeamLead`/`Captain`/`LockedLayer` + `DemoHeader` (146-167, 101-119); control-grid.stories.tsx uses `ControlPanelHeader` (107); quadrant-nav.stories.tsx has `Default` (18). ✓

## Low-confidence / could-not-verify
- The doc references "unit 29" for the DB rank model and "the unit on the voice pipeline" — cross-unit consistency not checked here; only the schema lines this doc cites were verified.
- Whether `cp-layer-in` actually replays on every `key={active}` change is a React/Tailwind runtime behavior; the static class + `key` are present, but the visual replay was not exercised.
- The doc's `RANK_ORDER`/`RANK_TAB_LABEL` "(internal)" annotation: confirmed neither is `export`ed (no `export` keyword on lines 16, 25) — internal status correct, though they are imported by control-grid.tsx only via the exported `RANK_LABEL`/`rankLevel`, not the internal ones.
