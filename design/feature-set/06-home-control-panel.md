# 06 — Home — role-based control panel

**Files covered:**
- `apps/web/app/page.tsx` — the `/` route (server component); runs the full gating spine, derives viewer rank, builds the three rank layers, renders `<ControlPanel>` + `<EnablePush>`.
- `apps/web/app/home-header.tsx` — right-hand header slot: notifications bell (with unread badge → `/notifications`) and avatar (photo/initials → `/profile`).
- `packages/ui/src/components/control-panel.tsx` — the reusable `ControlPanel` and its sub-components (`ControlPanelHeaderBar`, `CentreButton`, `LayerTabBar`, `QuadrantTile`, plus orphan `ControlPanelHeader`); rank model, types, helpers.
- `apps/web/app/landing-hero.tsx` — signed-out fallback (glitch "404" hero) returned by `page.tsx` when there is no authenticated user.
- `apps/web/components/push/enable-push.tsx` — web-push opt-in, mounted under the control panel on the authenticated home only.
- `apps/web/lib/users.ts` — `ensureCampUser`, `hasCampAccess`, `isApproved`, `isTeamLead`, `getBurnerProfile`, `getPendingRequiredActions`, real-vs-test backends.
- `apps/web/lib/required-actions.ts` — `nextGate` + `ACTION_ROUTES` registry (action_key → built gate route).
- `apps/web/lib/notifications.ts` — `countUnread` facade (real DB / test store split).
- `apps/web/lib/auth.ts` — `getAuthenticatedUser` (Neon Auth session, or test-user cookie under E2E_TEST_MODE).
- `apps/web/lib/initials.ts` — `initialsFrom` for the avatar fallback.
- Supporting (read for exact values, not re-rendered here): `packages/db/src/roster.ts` (`isTeamLead`), `packages/db/src/activations.ts` (`getPendingRequiredActions`, `PendingRequiredAction`), `packages/db/src/broadcasts.ts` (`countUnread`), `packages/db/src/schema.ts` (enums/columns).

**Purpose:** The home route (`/`) is Camp 404's role-based command centre — the answer to "what do I need to do, who needs what from me?" It first runs the full auth/access/onboarding/approval gating spine (`page.tsx:29-63`), bouncing any user who hasn't earned the app to the appropriate gate, then renders a single layered 2×2 quadrant navigation panel. The viewer's stored rank (+ derived team-lead) decides which of three layers (`camp_member` / `team_lead` / `captain`) are unlocked; layers above the viewer's clearance stay browsable but visually locked. A circular push-to-talk "TALK" button sits dead-centre, and the header carries a brand title, an unread-notifications bell, and the member's avatar. A best-effort web-push opt-in is mounted beneath it.

## Features

### `/` route gating + render (`apps/web/app/page.tsx`)
- `export const dynamic = "force-dynamic"` (`page.tsx:27`) — reads the Neon Auth session cookie every request; cannot be statically prerendered.
- **Gating spine, in order** (`page.tsx:29-63`):
  1. `getAuthenticatedUser()` → if `null`, returns `<LandingHero />` (signed-out branch; no redirect — renders inline) (`page.tsx:30-34`).
  2. `ensureCampUser(user)` then **invite gate**: `if (!hasCampAccess(campUser, user.primaryEmail)) redirect("/signup/required")` (`page.tsx:39-42`). God accounts (`GOD_EMAILS`) bypass; everyone else must hold a redeemed `inviteCode`.
  3. **Generic required_actions gate**: `const gate = nextGate(await getPendingRequiredActions(campUser.id)); if (gate) redirect(gate)` (`page.tsx:47-48`). Routes to the first pending **blocking** action that maps to a built page (today only `burner_profile` → `/onboarding/questionnaire`).
  4. **Belt-and-braces legacy fallback** (one release): `const profile = await getBurnerProfile(campUser.id); if (!profile?.completedAt) redirect("/onboarding/questionnaire")` (`page.tsx:53-56`). Explicitly marked to be dropped once `required_actions` seeding is confirmed in prod.
  5. **Captain-approval gate**: `if (!isApproved(campUser, user.primaryEmail)) redirect("/pending-approval")` (`page.tsx:61-63`).
- **Viewer-rank derivation** (`page.tsx:73-78`): `campUser.rank === "captain"` → `"captain"`; else `await isTeamLead(campUser.id)` → `"team_lead"`; else `"camp_member"`. (Maps stored rank `captain | member` + derived team-lead onto UI-local `ControlPanelRank`.)
- **Parallelised reads**: `countUnread(campUser.id)` is kicked off as `unreadPromise` (`page.tsx:68`) alongside the `isTeamLead` probe rather than serially; awaited at `page.tsx:80`.
- **Avatar initials**: `initialsFrom(campUser.displayName ?? user.primaryEmail)` (`page.tsx:65`).
- Renders `<ControlPanel layers={homeLayers} viewerRank={viewerRank} header={<HomeHeader …/>} centre={{ label: "TALK" }} />` then `<EnablePush />` (`page.tsx:82-99`).

### Control panel shell (`control-panel.tsx` → `ControlPanel`)
- Root container: `flex h-[100dvh] w-full flex-col` on `--color-background` (`control-panel.tsx:127-132`). NOTE: full-bleed `w-full`, no `max-w-lg` wrapper here or in `layout.tsx` (which renders `{children}` directly in `<body>`); the product-wide `max-w-lg` constraint is not applied to this surface. `<!-- low-confidence: whether a max-width wrapper is expected here vs the panel intentionally going edge-to-edge; layout.tsx applies none -->`
- Structure top→bottom: header bar → quadrant grid + centre button → layer tab bar.
- Active-layer state: `const [active, setActive] = React.useState(() => clamp(initialLayer, 0, layers.length-1))` (`control-panel.tsx:111-113`); `initialLayer` defaults to `0`.
- `const layer = layers[active]; if (!layer) return null` (`control-panel.tsx:115-116`) — renders nothing if active index is out of range.
- `const unlocked = rankLevel(viewerRank) >= rankLevel(layer.rank)` (`control-panel.tsx:118`) — drives whether the four tiles of the active layer are interactive.
- Layer switch: `selectLayer(index)` sets active + fires `onLayerChange?.(index, next)` (`control-panel.tsx:120-124`).
- Quadrant grid: `grid grid-cols-2 grid-rows-2 gap-px` on `--color-border` (1px hairline gap = grid lines), keyed by `active` to re-trigger entry animation `animate-[cp-layer-in_200ms_ease-out]` (`control-panel.tsx:136-139`).

### Header bar (`ControlPanelHeaderBar`)
- Fixed `h-14`, bottom border `--color-border`, padded `px-4` (`control-panel.tsx:187`).
- Left: brand `title` (`text-base font-semibold tracking-tight`), default `"Camp 404"` (`control-panel.tsx:104, 188`).
- Right: the `header` slot node (here `<HomeHeader>`), in a `flex items-center gap-2` container (`control-panel.tsx:189`).

### Home header content (`home-header.tsx` → `HomeHeader`)
- **Bell link** → `/notifications` (`home-header.tsx:26-44`): `Bell` icon (`h-5 w-5`); `aria-label` is `Notifications (${notifications} unread)` when there are unread, else `"Notifications"`.
- **Unread badge**: rendered only when `notifications` is truthy. Displays the count, or `"99+"` when `notifications > 99` (`home-header.tsx:41`). Pinned top-right of the bell, `--color-primary` fill / `--color-primary-foreground` text.
- **Avatar link** → `/profile` (`home-header.tsx:45-54`), `aria-label="Your profile"`. `Avatar` `h-8 w-8`: shows `<AvatarImage src={imageUrl}>` when `imageUrl` set, otherwise `<AvatarFallback>{initials}</AvatarFallback>` (`text-xs`).

### Centre push-to-talk button (`CentreButton`)
- Rendered only when `centre` prop is supplied (`control-panel.tsx:166`); home always passes `{ label: "TALK" }`.
- Absolutely centred circle, `w-[22%] min-w-[5rem] max-w-[7rem]`, `aspect-square`, `--color-primary` fill, `ring-4` of `--color-background` (`control-panel.tsx:205`).
- Icon defaults to `<Mic className="h-5 w-5">`; label defaults to `"TALK"` (`control-panel.tsx:195-196`).
- Press handlers: `onPointerDown → centre.onPress`; `onPointerUp`, `onPointerLeave`, `onPointerCancel → centre.onRelease` (`control-panel.tsx:201-204`). NOTE: home passes neither `onPress` nor `onRelease`, so on the home surface the TALK button is a no-op (no voice wiring yet).
- `aria-label`: `centre.ariaLabel ?? label`.

### Layer tab bar (`LayerTabBar`)
- `<nav aria-label="Switch rank view">`, `h-14`, top border `--color-border` (`control-panel.tsx:227-229`).
- One button per layer, labelled with the short `RANK_TAB_LABEL` (`Me` / `Team Lead` / `Captain`) (`control-panel.tsx:253`).
- Locked tab (`rankLevel(viewerRank) < rankLevel(layer.rank)`) shows a `Lock` icon (`h-3 w-3`) and `aria-label` `"${RANK_LABEL[rank]} view (locked, view only)"`; unlocked label is `"${RANK_LABEL[rank]} view"` (`control-panel.tsx:233, 240-244, 254`).
- Active tab: `aria-pressed`, `--color-primary` text + an underline indicator pill (`control-panel.tsx:239, 247-261`).
- Clicking any tab (locked or not) calls `onSelect(index)` → switches the visible layer; locking only affects tile interactivity, never whether you can browse the layer.

### Quadrant tile (`QuadrantTile`)
- Body: icon row (`quadrant.icon` + `Lock` icon `h-3.5 w-3.5` when `locked`), `label` (`text-base font-semibold`), optional `hint` (`text-xs` muted) (`control-panel.tsx:296-311`).
- **Corner alignment** by `corner` via `CORNER_ALIGN` (`control-panel.tsx:269-274`): `tl` items-start/justify-start/left, `tr` items-end/justify-start/right, `bl` items-start/justify-end/left, `br` items-end/justify-end/right. (Tiles hug their outer corner; titles sit in the corner nearest the screen edge.)
- **Badge**: rendered only when `quadrant.badge != null && badge !== "" && badge !== 0` (`control-panel.tsx:313-314`); pinned to top edge per `BADGE_CORNER` (`tl`/`bl` → `top-3 left-3`; `tr`/`br` → `top-3 right-3`) so it never collides with bottom-row corner-aligned text (`control-panel.tsx:278-283`). Fill `--color-primary`. NOTE: home layers set no `badge` on any quadrant — feature exists but is unused on this surface.
- **Render mode** (`control-panel.tsx:331-362`):
  - `locked` → `<div aria-disabled="true" class="opacity-45">` (non-interactive, no link/onClick).
  - else `quadrant.href` set → `<a href>` with `onClick={onSelect}` (plain anchor, not Next `<Link>`).
  - else → `<button onClick={onSelect}>` (fires `onQuadrantSelect`).
  - NOTE on home: all `camp_member` tiles + captain `Camp Management`/`Camp Tools` have `href`; the rest (all `team_lead` tiles, captain `Camp Tasks`/`Finances`) have **no `href` and no `onQuadrantSelect` handler is passed by `page.tsx`** → unlocked-but-hrefless tiles render as buttons whose click does nothing. (See Validation/edge-cases.)

### Web push opt-in (`enable-push.tsx` → `EnablePush`)
- Mounted only on the authenticated home (`page.tsx:98`) so it never prompts signed-out visitors.
- State machine `"loading" | "unavailable" | "default" | "granted" | "denied"` (`enable-push.tsx:16`).
- On mount: detects FCM support (`getMessagingIfSupported`), `Notification`, `serviceWorker`; if unsupported → `"unavailable"`; reads `Notification.permission` → `granted` (auto-registers token) / `denied` / `default` (`enable-push.tsx:48-73`).
- Renders **nothing** unless `state === "default"` (`enable-push.tsx:100`); then shows a `secondary`/`sm` "Enable notifications" `Button` that calls `Notification.requestPermission()` on click (user gesture, required by Safari) and registers the FCM token on grant (`enable-push.tsx:102-124`).
- `registerToken()` registers `/firebase-messaging-sw.js`, gets an FCM token with `VAPID_KEY`, POSTs `{ token, platform: "web" }` to `/api/push/tokens` (`enable-push.tsx:25-42`).
- Foreground-message listener (only while `granted`): validates payload with zod `FcmNotification = { title: string.min(1), body?: string }` and shows a `Notification` with `icon: "/icon.svg"` (`enable-push.tsx:20-23, 78-98`). Single subscription, cleaned up on unmount.

### Signed-out hero (`landing-hero.tsx` → `LandingHero`)
- Returned when there's no session (`page.tsx:33`). Full-screen glitch "404" art (scanlines/noise/scanbeam, RGB-split + tear-clip animations), brand line `"Camp 404"` and `"Error 404 — Camp not found"`.
- Single CTA: `Button` `size="lg"` "Are you lost?" → `<a href="/auth/sign-in">` (`landing-hero.tsx:32-34`). Terminal cursor flourish `"$ awaiting input_"`.
- All bespoke glitch CSS is inline in `glitchStyles` (`landing-hero.tsx:77-230`); references `--color-foreground`/`accent`/`primary`.

## User actions & interactions
- **Tap a quadrant tile** (unlocked + href): navigate via plain `<a>` to that destination. Home destinations (`page.tsx:103-179`):
  - camp_member: `My Teams` → `/members`; `My Tasks` → `/meals`; `My Profile` → `/onboarding/questionnaire`; `Tools` → `/tools`. **NOTE:** `My Teams` (`/members`, `page.tsx:107-111`) and `My Tasks` (`/meals`, `page.tsx:112-117`) are presented as working nav but are dead links — there is no `app/members/page.tsx`, no `app/meals/page.tsx`, and no `middleware.ts` rewrite, so both 404 on click. Same inert caveat as the hrefless team_lead/captain tiles (different mechanism: 404 vs no-op). Only `My Profile` (`/onboarding/questionnaire`) and `Tools` (`/tools`) actually resolve.
  - team_lead: all four tiles have **no href** (Team Roster / Team Tasks / Lead Profile / Team Tools).
  - captain: `Camp Management` → `/captains/camp-management`; `Camp Tools` → `/captains/tools`; `Camp Tasks` and `Finances` have **no href**.
- **Tap a quadrant tile** (unlocked, no href): fires `onQuadrantSelect(quadrant, corner, layer)` — but home passes no handler, so it's inert.
- **Tap a locked tile**: nothing (rendered as `aria-disabled` div).
- **Tap a layer tab** (`Me` / `Team Lead` / `Captain`): switch the visible layer, even when locked (browse-only).
- **Press/hold the centre TALK button**: would fire `onPress`/`onRelease`; home wires neither → inert on this surface.
- **Tap the bell** → `/notifications`. **Tap the avatar** → `/profile`.
- **Tap "Enable notifications"** (push `default` state only): request browser permission, register FCM token.
- **Signed-out: tap "Are you lost?"** → `/auth/sign-in`.

## States & presentations
Global-states rows that apply to this surface:
- **Empty** — unread badge: when `countUnread` returns `0` (or falsy), no badge renders (`home-header.tsx:36`). Avatar with no `imageUrl` falls back to initials (or `"?"` from `initialsFrom`). No quadrant badges anywhere on home.
- **Loading** — server-rendered; the page awaits all reads before returning, so there is no client loading state for the panel itself. Push opt-in has an internal `"loading"` state that renders nothing.
- **Populated** — normal authenticated render: header (title + bell[+badge] + avatar), the viewer's unlocked layer + locked higher layers, centre TALK, tab bar.
- **Validation-error** — N/A on this surface (no forms submitted from home). EnablePush handles permission failure by flipping state (`denied`/`unavailable`), not a validation banner.
- **Submitting/pending** — N/A for the panel. (Push permission request is the only async user action; no submit UI.)
- **Success** — N/A (no submit). Push grant → token registered silently, button disappears.
- **Disabled** — locked quadrant tiles render `aria-disabled="true"` at `opacity-45` with a `Lock` glyph. Unlocked-but-hrefless tiles are technically enabled buttons that do nothing (see edge cases). The camp_member `My Teams` (`/members`) and `My Tasks` (`/meals`) tiles look enabled and navigate, but their targets 404 (no page/route exists) — also dead, just via a different mechanism (see edge cases).
- **Invite-gated** — `!hasCampAccess` → `redirect("/signup/required")` (`page.tsx:40-42`).
- **Onboarding-incomplete** — `nextGate(pending blocking required_actions)` → `/onboarding/questionnaire` (and legacy `!profile.completedAt` fallback) (`page.tsx:47-56`).
- **Pending-approval** — `!isApproved` with `approvalStatus === "pending"` → `redirect("/pending-approval")` (`page.tsx:61-63`).
- **Rejected** — terminal: `approvalStatus === "rejected"` also fails `isApproved` → `redirect("/pending-approval")`. NOTE: `page.tsx` routes both `pending` and `rejected` to `/pending-approval`; the rejected-specific copy lives on that route, not here.
- **Captain-only-locked (rank below surface)** — higher-rank layers render **visible but locked**: tiles `opacity-45` + `Lock` icon, tabs labelled "(locked, view only)" + `Lock` glyph. Whether a layer is locked = `rankLevel(viewerRank) < rankLevel(layer.rank)`.
- **Signed-out** — `<LandingHero />` (not a redirect; rendered inline).
- **Layer-entry animation** — each layer switch replays `cp-layer-in_200ms_ease-out`.

## Enums, options & configurable values
- **`ControlPanelRank`** (UI-local, `control-panel.tsx:13`): `"camp_member" | "team_lead" | "captain"`.
- **`RANK_ORDER`** (`control-panel.tsx:16`): `["camp_member", "team_lead", "captain"]` — index doubles as clearance level via `rankLevel()`.
- **`RANK_LABEL`** (`control-panel.tsx:18-22`): `camp_member: "Camp Member"`, `team_lead: "Team Lead"`, `captain: "Captain"`.
- **`RANK_TAB_LABEL`** (`control-panel.tsx:25-29`): `camp_member: "Me"`, `team_lead: "Team Lead"`, `captain: "Captain"`.
- **`ControlPanelCorner`** (`control-panel.tsx:35`): `"tl" | "tr" | "bl" | "br"`.
- **Centre defaults**: `label = "TALK"` (`control-panel.tsx:195`); `icon = <Mic/>` (`control-panel.tsx:196`); `title` default `"Camp 404"` (`control-panel.tsx:104`); `initialLayer` default `0` (`control-panel.tsx:74, 103`); `viewerRank` default `"camp_member"` (`control-panel.tsx:72, 102`).
- **Badge truthiness**: shown unless `null`/`""`/`0` (`control-panel.tsx:314`).
- **Unread badge cap**: shows `"99+"` for counts `> 99` (`home-header.tsx:41`).
- **Push state enum** (`enable-push.tsx:16`): `"loading" | "unavailable" | "default" | "granted" | "denied"`; push payload posts `platform: "web"`.
- **Home layer config** (`page.tsx:103-179`) — verbatim labels/hints/icons:
  - camp_member: TL `My Teams` "Your crews" `Users` → `/members`; TR `My Tasks` "What's on you" `ListChecks` → `/meals`; BL `My Profile` "You & your data" `UserRound` → `/onboarding/questionnaire`; BR `Tools` "Meals, expenses…" `Wrench` → `/tools`.
  - team_lead: TL `Team Roster` "Members in your team" `Users`; TR `Team Tasks` "Assign & track work" `ListChecks`; BL `Lead Profile` "Your team setup" `UserRound`; BR `Team Tools` "Shifts, notices…" `Wrench`. (no hrefs)
  - captain: TL `Camp Management` "Roster & statuses" `Users` → `/captains/camp-management`; TR `Camp Tasks` "Camp-wide work board" `ListChecks`; BL `Finances` "Dues & reimbursements" `UserRound`; BR `Camp Tools` "Announcements, ops…" `Wrench` → `/captains/tools`. (TR/BL no hrefs)
- **Stored rank enum** `rank` (`schema.ts:31`): `["captain", "member"]`.
- **`approval_status` enum** (`schema.ts:41-45`): `["pending", "approved", "rejected"]`.
- **`required_action_type` enum** (`schema.ts:99-104`): `["questionnaire", "acknowledgement", "payment", "profile_update"]`.
- **`required_action_status` enum** (`schema.ts:106-111`): `["pending", "completed", "waived", "expired"]`.
- **`ACTION_ROUTES` registry** (`required-actions.ts:7-11`): `{ burner_profile: "/onboarding/questionnaire" }` (only key with a built page; `dietary_requirements`/`driver_profile` commented as future).
- **Brand tokens referenced** (`globals.css`): `--color-primary: oklch(0.65 0.27 340)`; `--color-accent: oklch(0.62 0.18 255)`; `--color-background: oklch(0.15 0.05 295)`; `--color-primary-foreground: oklch(0.99 0.005 340)`; `--radius: 0.625rem`.

## Data model touched
(Field names exact; must agree with unit 29.)
- **`users`** (`schema.ts`) — read via `ensureCampUser`/`findUserByAuthId` → `CampUser` (`lib/users.ts:39-47`): `id`, `authUserId` (`auth_user_id`), `displayName` (`display_name`), `profileImageUrl` (`profile_image_url`), `inviteCode` (`invite_code`), `rank` (`rank`, default `"member"`), `approvalStatus` (`approval_status`, default per schema). The home page uses: `campUser.rank`, `campUser.approvalStatus` (via `isApproved`), `campUser.inviteCode` (via `hasCampAccess`), `campUser.displayName`, `campUser.profileImageUrl`, `campUser.id`. Auth fields `user.id`, `user.primaryEmail`, `user.displayName` come from `AuthenticatedUser` (`lib/auth.ts:13-17`).
- **`burner_profiles`** — read via `getBurnerProfile` → `BurnerProfileSummary { responses, completedAt, updatedAt, version }` (`lib/users.ts:155-167`). Home uses only `completedAt` (legacy fallback gate, `page.tsx:54`).
- **`required_actions`** — read via `getPendingRequiredActions` → `PendingRequiredAction { actionKey, type, title, version, blocking, dueAt, createdAt }` (`activations.ts:16-24, 203-226`); query filters `status = 'pending'` AND `blocking = true`, ordered `createdAt` ASC (`activations.ts:218-225`). `nextGate` reads `actionKey` + `blocking`.
- **`team_memberships`** — `isTeamLead(userId)` existence check: `team_memberships.user_id = userId AND is_lead = true` (`roster.ts:204-217`). Drives the derived `team_lead` rank. (`is_lead` is the only source of team-lead — never stored on `users`.)
- **`notification_deliveries`** — `countUnread(userId)` = `count(*)` where `user_id = userId AND read_at IS NULL` (`broadcasts.ts:496-508`). Feeds the bell badge.
- **`invite_codes`** (indirect) — `hasCampAccess`/`redeemInviteForUser` path; not read on a populated home render beyond the `inviteCode` already on the user row.
- **Test-mode backend**: under `E2E_TEST_MODE`, all of the above route through `testStore` (`lib/users.ts:410-460`, `lib/notifications.ts:84-115`); `getPendingRequiredActions` returns `[]` (`lib/users.ts:215`), and `isTeamLead` always returns `false` (the in-memory store models no team memberships) (`lib/users.ts:448`).

## Validation, edge cases & business rules
- **Gate ordering is load-bearing** (`page.tsx:29-63`): auth → invite → required-actions → legacy-profile → approval. Reordering changes which gate a partially-onboarded user hits first.
- **God accounts** (`GOD_EMAILS`, case-insensitive CSV env, `access-control.ts:28-30`) bypass both the invite gate (`hasCampAccess`) and the approval gate (`isApproved`) — they're auto-created as `rank: "member"`, `approvalStatus: "approved"` on first sign-in (`lib/users.ts:70-80`).
- **Synthetic non-persisted user**: a signed-in user with no row and no invite gets a throwaway `CampUser` with `id: ""`, `inviteCode: null` so `hasCampAccess` is false and they're bounced to `/signup/required` without writing an orphan row (`lib/users.ts:84-95`). The empty `id` is never used because the redirect fires first.
- **`nextGate` never strands a user**: it skips any pending action whose `actionKey` has no mapped route (`required-actions.ts:23-29`) — a blocking action with no built page does not gate. Non-blocking actions are skipped too.
- **Legacy `completedAt` fallback is intentional dead-weight** (one release), to be removed once `required_actions` seeding is confirmed in prod (`page.tsx:50-56`).
- **Rejected vs pending both → `/pending-approval`**: `isApproved` is false for any non-`approved` status; the route disambiguates.
- **Rank/clearance rule**: a layer is interactive iff `rankLevel(viewerRank) >= rankLevel(layer.rank)`; higher layers stay browsable but locked. Captains see all three layers unlocked; a team-lead sees member+team-lead unlocked, captain locked; a plain member sees only the member layer unlocked.
- **Hrefless unlocked tiles are inert** (UGLY TRUTH): all four `team_lead` tiles and captain `Camp Tasks`/`Finances` have no `href`, and `page.tsx` passes **no `onQuadrantSelect`** handler. For an unlocked viewer these render as enabled `<button>`s whose `onClick` does nothing — features stubbed pending destination pages.
- **camp_member `My Teams`/`My Tasks` hrefs are dead links** (UGLY TRUTH): the camp_member layer wires `My Teams → /members` (`page.tsx:107-111`) and `My Tasks → /meals` (`page.tsx:112-117`) as plain `<a href>` tiles, so they look like working nav — but there is no `app/members/page.tsx`, no `app/meals/page.tsx`, and no `middleware.ts` rewrite to redirect them, so both routes 404 on click. Same net result as the hrefless team_lead/captain tiles (a tap that goes nowhere) via a different mechanism: 404 navigation vs no-op button. Only `My Profile → /onboarding/questionnaire` and `Tools → /tools` actually resolve on this layer. Consistent with unit 00's IA route table (`00-overview.md` §5), which lists only built routes and therefore carries **no** `/members` or `/meals` row — the two docs agree these destinations have no page.
- **TALK button is inert on home** (UGLY TRUTH): `centre={{ label: "TALK" }}` only — no `onPress`/`onRelease`, so the centre button is non-functional on this surface (voice pipeline not wired in).
- **Quadrant nav uses a plain `<a>`, not Next `<Link>`** (`control-panel.tsx:342`) — full document navigation, not client-side routing. (The header uses `<Link>`; the panel does not.)
- **`ControlPanel` returns `null`** if `layers[active]` is undefined (`control-panel.tsx:115-116`); `active` is clamped to `[0, layers.length-1]` on init but `initialLayer` out of range is clamped, not errored.
- **Unread badge hidden on 0/falsy**; capped display at `"99+"`.
- **Avatar `initialsFrom`** splits on whitespace/`@`/`.`, takes first 2 parts' first letters uppercased, returns `"?"` when nothing usable (`initials.ts:6-17`).
- **EnablePush is best-effort**: renders nothing when push is unsupported/denied/granted; only the `default` (undecided) state shows the button; permission must be requested on a user gesture (Safari). FCM payload validated with zod before constructing a `Notification`.
- **No `max-w-lg` constraint applied** to the control panel on this surface (`w-full` / `h-[100dvh]`, `layout.tsx` adds no wrapper).
- **Global feedback layer** is mounted app-wide in `layout.tsx` (`AcknowledgementGate`, `FeedbackGate aiAvailable={!!ANTHROPIC_API_KEY}`) — present over the home surface but owned by the global feedback unit, not this one.

## Sub-components / variants
- **`ControlPanel`** (exported) — the surface used by home. Active component.
- **`ControlPanelHeaderBar`** — internal; brand title + header slot.
- **`CentreButton`** — internal; push-to-talk circle (rendered only when `centre` supplied).
- **`LayerTabBar`** — internal; rank tab switcher with locked-tab affordances.
- **`QuadrantTile`** — internal; three render modes (locked div / `<a href>` / `<button>`); badge + corner-alignment logic.
- **`HomeHeader`** (`home-header.tsx`, exported) — the concrete header slot passed by home (bell + avatar). Active.
- **`EnablePush`** (`enable-push.tsx`, exported) — web-push opt-in. Active.
- **`LandingHero`** (`landing-hero.tsx`, exported) — signed-out fallback. Active.
- **`ControlPanelHeader`** (`control-panel.tsx:376-401`, exported) — ORPHAN on this surface: a generic default header (Sign-in/userName button + Settings gear, `onAuth`/`onSettings`). NOT used by `page.tsx` (home passes `<HomeHeader>` instead). Kept as the component's default-header offering; `Settings`/`UserRound` lucide imports exist only for it. Flag as dead on the home path. `<!-- low-confidence: whether ControlPanelHeader is used by any other route; not referenced from page.tsx -->`
- **Helpers/types exported** from `control-panel.tsx`: `ControlPanelRank`, `RANK_LABEL`, `rankLevel`, `ControlPanelCorner`, `ControlPanelQuadrant`, `ControlPanelLayer`, `ControlPanelCentre`, `ControlPanelProps`, `ControlPanelHeaderProps`. (`RANK_ORDER`, `RANK_TAB_LABEL`, `clamp`, `CORNER_ALIGN`, `BADGE_CORNER` are module-private.)
