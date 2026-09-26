# 404 OS console: architecture

Status: proposal, 2026-09-25; being built. PR A (#286, the packages) and PR B (the program manifest) are done. The owner picked
the look on 2026-09-25 (the Classic desktop, see
[The owner's pick](#the-owners-pick-2026-09-25)), then reviewed the
prototype a second time the same day (see
[The owner's second review](#the-owners-second-review-2026-09-25)). Ruled:
decisions 1, 3, 8 and 14 on 2026-09-25, then 2, 7 (no window cap) and where
the layout is stored (14 B, on the server) on 2026-09-26. The other decisions
are still open (see [Decisions](#decisions)).

Companion docs:

- This doc: `docs/specs/2026-09-25-404-os-console-design.md` (architecture)
- `docs/specs/2026-09-25-404-os-program-catalogue.md` (every page as a program: who sees it, its gate, its window)
- `docs/specs/2026-09-25-404-os-visual-language.md` (the skin: tokens, type, controls, icons, motion)
- `docs/plans/2026-09-25-404-os-console-migration.md` (the PR-by-PR plan)

The prototype the owner reviewed:

- Branch `prototype/404-os-captain-desktop` (local), in the Join app. Route
  `/prototype/captain-desktop` on `pnpm --filter @camp404/join dev`. Look A
  is the default; `?variant=A|B|C` shows the switcher, and `?blocking=1`
  shows the blocking form.
- Code: `apps/join/app/prototype/captain-desktop/`. The chosen look is
  `variant-a.tsx`, `variant-a-chrome.tsx`, `variant-a-icons.tsx`,
  `variant-a-window.tsx` and `_proto/*` (desktop items and the right-click
  menu in `_proto/desktop-items.tsx`, the blocking form in
  `_proto/blocking.tsx`, the cats in `_proto/cats.tsx` and
  `_proto/shadow-work.tsx`, listed in `_proto/cats.md`).
- **The prototype is throwaway.** It runs on fake data, with no gates, no
  server and no tests of the shell. Nothing in it is copied into `apps/web`
  or `packages/os`: each piece is written again properly, with tests, in the
  PRs of the migration plan. Read it for behaviour, not for code.

## Why

The owner loves the Join site (`apps/join`, "404 OS"): a fake desktop with a
boot screen, icons, windows that drag, stack and resize, a taskbar and a Start
menu, and a full-screen window stack on phones. The request is to make the
whole signed-in console work the same way:

- every page and module becomes its own **program**;
- which programs a member sees depends on **their profile**: rank, teams, lead
  status and driver status.

The second half is the real value. The console already has two lists of
"places this member can go", and they disagree:

- `CONSOLE_NAV` in `apps/web/lib/console-nav.ts:26` filters on rank only.
- `buildHome().modules` in `apps/web/lib/home.ts:386` uses rank, lead and
  approval, and adds badges.

`/captains/calendar` and `/kitchen/meal-plan` are reachable but not in the nav.
A desktop built from one server-filtered manifest fixes that. The window
chrome is how it looks.

One real edge case the manifest should handle: a lead whose only led team is
archived. `/captains/calendar` clears them (`captainPageGate("team_lead")`),
but the composer offers only active teams they lead
(`apps/web/app/(console)/captains/calendar/page.tsx:40-44`), so they get an
empty team picker. (A lead with an *invalid* team cannot exist:
`team_memberships.team` is `teamEnum`, whose 14 values are exactly the `Team`
Zod enum in `packages/types/src/roles.ts:10-25`, so the `Team.safeParse`
filters in the announcements and calendar pages are defensive only.)

## The owner's request, restated

1. Replace the AfrikaBurn-style header and nav with a 404 OS desktop.
2. Each page is a program in a window.
3. The set of programs on a member's desktop comes from their profile.
4. Keep what already works: gates, privacy, deep links, E2E, no cron.

## The owner's pick, 2026-09-25

A prototype showed three looks side by side (branch
`prototype/404-os-captain-desktop`, route
`apps/join/app/prototype/captain-desktop`):

- **A, Classic desktop**: Join-style floating windows, icons and a taskbar.
- **B, Tiled workstation**: panes tiled across the screen.
- **C, Command deck**: a dashboard of live panels.

**Ruled (owner, 2026-09-25): A, the Classic desktop.** His reasons, in
short: he can have several modules open at the same time; it is not as busy
as the others; things are contained in their own little programs. B and C
were rejected as "way too busy and overstimulating".

What else he said, and where each point lands:

| Owner's point | Where it lands |
| --- | --- |
| Several modules open at the same time is the favourite part | Decision 3, ruled A: last-seen windows show their content (section 3) |
| The Today gadget is good, but not open all the time | Closed by default, a right-edge handle opens it, the choice is remembered per browser (section 1) |
| "Things seem quite random"; order the desktop | A default layout of one column per group: Me, Camp, Captains (section 4). The second review made the icons movable |
| "Some of the terminology might be a bit too geeky" | Plain English names everywhere; a file name is at most a quiet suffix (decision 9) |
| A mobile version of the Classic desktop is needed | A phone home screen, not a shrunk desktop (section 5) |
| We do need the terminal | Terminal is a program for every member (section 4) |
| Hide more cats in here | Hidden cats, small and reduced-motion safe (PR D or later, visual-language doc 4.6). Narrowed in the second review: only Jinn and Prince |
| Terminal and the game as their own shared package, for Join and the app | `@camp404/os/terminal` (OS) and `@camp404/games` (INKBLOT, cats, Shadow Work; owner, later the same day: games get their own package), moved in PR A (section 2) |
| Each team lead will say how their module is set up | Team programs are bespoke per team, shaped with each lead after the shell ships (section 4) |
| Later: a helper you can ask questions, by voice too | Future, out of scope: [Ask 404](#future-out-of-scope-ask-404) |

**Design rule that follows: the desktop stays calm.** No dashboards, tickers,
live charts or scrolling feeds on the wallpaper. Information lives inside
programs and inside the Today gadget. The wallpaper holds icons, groups and
nothing that moves on its own (Join's scanline beam aside, which reduced
motion stops).

Decision 1 is therefore settled as A: the console leaves the AfrikaBurn look,
and the skin follows Join. The landing page exclusion (2026-09-23) stands.

## The owner's second review, 2026-09-25

Later the same day the owner used the reworked look A in the prototype and
ruled on the rest. Each ruling below is dated 2026-09-25 and is folded into
the section named.

| # | Ruling | Where it lands |
| --- | --- | --- |
| R1 | Decision 3 is ruled: **A, last-seen windows**. A background window shows a frozen copy of how it last looked, "Last seen hh:mm. Click to refresh." | Section 3; decision 3 |
| R2 | **Desktop icons behave like a real desktop.** Click selects; Ctrl- or Shift-click adds; a box drawn on the empty desktop selects several; a drag moves the selection on an invisible grid (it snaps, and icons in the way move to the nearest free cell); double-click or Enter opens. The layout is saved per member. "Line up icons" puts the default order back. No slide animation on drop. The default layout is one column per group (Me, Camp, Captains) on the left | Section 4 (desktop layout); decision 14; section 7 (where it is stored) |
| R3 | **Right-click menus.** On a program in any folder: Open, Create desktop shortcut, Add to *folder*, Add to a new folder. On the empty desktop: New folder, Line up icons. On a member's own folder: Open, Rename, Delete folder. On a shortcut: Open, Add to folder, Delete shortcut. Shortcuts show a small arrow. Dragging an icon onto a member's folder puts it inside. Member-made folders and shortcuts are desktop only, never on the phone. The real build opens the menu from the keyboard too (Shift+F10 and the Menu key) | Section 4 (desktop layout); section 6 |
| R4 | **Team folders.** Every team the member is in this year appears as a folder on the **right-hand side** of the desktop ("Kitchen team"), for members and leads alike, tagged LEAD on the teams they lead. It holds the team page and that team's tools. A member can put any team tool on the desktop from the right-click menu. The phone home screen gets a "My teams" row. Captains have the fullest desktop | Section 4; section 5; decision 8 |
| R5 | **The header says "Leads N teams"**, and a team's name only when exactly one, because one person can lead many teams. The full list shows on hover | Section 1 (tray and header) |
| R6 | **The system-health warning in the tray is for every accepted member**, not only captains. Members see only that something is wrong; captains get the details | Section 1; Security |
| R7 | **The Start menu sits above everything** except blocking forms and dialogs, and on desktop is at most half the screen height before it scrolls | Section 2 (layering) |
| R8 | **A blocking questionnaire sits on top of everything**, with the desktop visible but inert behind it: no close, Esc does nothing, focus stays inside. The server gates do not change | Section 1 (held members); Security |
| R9 | **No text selection on the desktop chrome** (icons, folders, header, taskbar, Start menu). Program windows and dialogs keep selectable text | Section 6 |
| R10 | **Only two real cats**: Jinn (all black, "who is best") and Prince (white and fluffy, black cap, black patch on his back, black fluffy tail; asleep on the taskbar clock). Easter eggs are never labelled ("if you know you know"). The Teams folder holds Shadow Work, the camp's art piece, with Jinn asleep on it | Section 2 (`@camp404/games`); visual-language doc 4.6; PR D or later |

Two more rules came with this review:

- **Performance.** The shell must stay cheap when nothing is happening
  (section 8).
- The points from the first review (the calm desktop, the Today gadget
  closed by default, plain words, the phone version, the shared terminal and
  game, Ask 404 as a future idea, bespoke team programs) all stand.

## Current state

### The console shell

- `apps/web/app/(console)/layout.tsx:25-64` is force-dynamic and never
  redirects. It has three branches:
  - `block.reason === "approval"`: a bare content column, no nav (`:37-39`).
    `memberBlock` returns that reason for **every** non-approved member,
    pending or rejected (`apps/web/lib/member-gate.ts:50-52`). Only `/`
    separates the two (`waiting`, `apps/web/app/(console)/page.tsx:49-51`).
  - signed out, not bootstrapped, or held by another gate: bare children
    (`:40-42`), so the landing page and gate pages own the screen.
  - a cleared member: `ConsoleHeader`, then `PinnedAnnouncements`, then the
    page (`:44-63`). Pins are kept out of every held and waiting branch on
    purpose ("Nobody sees a pin before they are through the door").
- `resolveMemberState` (`apps/web/lib/member-gate.ts:71-80`) is React
  `cache()`d. The layout and the page share one session read and one gate
  sync. It also calls `runDueWorkAfterResponse()` (`:77`), which is how the
  no-cron due work runs.
- **The sign-in redirect lives in three places, all bare `/auth/sign-in` with
  no `?next=`:**
  - `requireMemberPage()` (`apps/web/lib/member-gate.ts:91`), which takes no
    arguments;
  - `getAuthenticatedUserOrRedirect()` (`apps/web/lib/auth.ts:89-93`), which
    guards exactly the pages that push, email and reminder links open:
    `/notifications`, `/announcements/[id]`, `/questionnaires/[activationId]`
    and its `/complete` page (plus `/pending-approval`, `/onboarding/questionnaire`
    and `/signup/required`). These gate on `hasCampAccess`, not
    `requireMemberPage`;
  - `redirect("/auth/sign-in")` in `apps/web/app/(console)/page.tsx:47`.
  So a push or email link loses its target through sign-in.
- `captainPageGate` (`apps/web/lib/captain-gate.ts:56-67`) returns
  `{authUser, campUser, rank, cleared}`. 16 `page.tsx` files plus
  `captains/questionnaires/[key]/metrics/results-shell.tsx` (which covers the
  metrics, responses and `responses/[userId]` routes) render a `CaptainLock`
  when not cleared. The recipe review page also has a plain `Card` refusal for
  a lead who is not a Kitchen lead, and recipe edit
  (`kitchen/recipes/[id]/edit/page.tsx:49-57`) refuses only with a plain
  `Card`.
- `ConsoleHeader` (`apps/web/components/console/console-header.tsx:39-52`)
  reads `isTeamLead`, `getInboxBadge`, `getTeamsConfig` and `getMyTeams`, then
  calls `consoleNavFor(viewerRank, navTeams(...))`. The client gets only
  `{href, label}`, never the rank. Sign-out goes through `SignOutLink`
  (`apps/web/components/auth/sign-out-link.tsx`), which first removes the
  device's push token.
- There is no `middleware.ts` or `proxy.ts` in `apps/web`.
- Section error boundaries already exist: `app/(console)/captains/error.tsx`,
  `app/(console)/tools/error.tsx` and `app/(console)/questionnaires/error.tsx`,
  each `ErrorRecovery frame="inline"`. The root `app/error.tsx` and
  `app/not-found.tsx` are full-screen.
- The only leave guard in `apps/web` is the builder's `useLeaveGuard`
  (`apps/web/components/questionnaires/builder.tsx:158-209`, used at `:254`).
  The meeting, meal-plan, Tiptap source and announcement editors have none.
- Next keeps a layout mounted across navigation. Commit 12eb18e had to add
  `revalidatePath("/", "layout")`
  (`apps/web/app/(console)/questionnaires/[activationId]/actions.ts:152`) so a
  member who finished a blocking form got the header back.

### The Join engine

[CORRECTION 2026-09-26] PR A moved Join's engine into packages, so the
`apps/join` paths and line numbers this document cites for it are from
before that move. The files now: window manager
`packages/os/src/window-manager.ts`; window frame, taskbar, desktop icon and
boot screen `packages/os/src/{os-window,taskbar,desktop-icon,boot}.tsx`
(Join's `components/os/taskbar.tsx` and `desktop.tsx` now only fill them with
Join's content); terminal engine and window
`packages/os/src/terminal/{engine.ts,terminal-window.tsx}`, with Join's
commands in `apps/join/lib/terminal-commands.ts`; INKBLOT
`packages/games/src/inkblot/` (`game.ts`, `sprites.ts`, `cat.ts`,
`inkblot-window.tsx`, `inkblot-win.tsx`). The Esc rule described as missing
is in `os-window.tsx` now.

- One route. `apps/join/app/page.tsx` renders `<Os>`, and windows are a
  `useReducer` (`apps/join/components/os/os.tsx:43`). No URL, no history.
  Refresh drops every window.
- `wmReducer` (`apps/join/lib/window-manager.ts:125`) is pure and unit tested:
  open, close, closeAll, focus, minimize, toggleMaximize, move, resize. It is
  keyed by a closed `AppId` union, and `open` on an open id only focuses it.
  `MIN_SIZE` 260x160 (`:71`), `GRAB_MARGIN` 64 px (`:75`).
- Phone mode is `(max-width: 767px)` (`os.tsx:27`) through
  `useSyncExternalStore` with a server snapshot of `false` (`os.tsx:37`), so
  phones paint the desktop layout first and then flip.
- Esc closes a window on any bubbling Escape (`os-window.tsx:123-128`) with no
  `defaultPrevented` check. React portals bubble through the component tree,
  so dismissing a Radix Select inside a window would also close the program.
  Join has no such controls; the console has many.
- Every open window stays mounted. Fine for Join's 12 light programs. In the
  console it would duplicate DOM (the S:0 lesson in AGENTS.md) and fire
  render-time side effects for windows nobody is looking at.
- The terminal is a pure engine plus Join's own commands in one file
  (`apps/join/lib/terminal.ts`: `runCommand(input, data)` imports Join's fee,
  content and team data), drawn by `components/os/windows/terminal.tsx`. The
  INKBLOT game is a pure engine (`apps/join/lib/inkblot.ts`, tested in
  `inkblot.test.ts`), sprites (`components/os/inkblot-sprites.ts`,
  `inkblot-cat.ts`) and two views (`components/os/windows/inkblot.tsx`,
  `inkblot-win.tsx`); its only Join import is the `INKBLOT` copy from
  `lib/content.ts`.

### Platform limits (Next 16.3.4)

- One URL tree renders at a time, plus a fixed set of named `@slot`s. Slots
  cannot hold N user-chosen windows, and unmatched slots are lost on a hard
  load (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/default.md`).
- `notFound()` keeps a real 404, and `redirect()` a real 307, only before a
  Suspense boundary streams. That is why `(console)` has no `loading.tsx`
  (commit cb8d9d8).
- Dynamic routes with no `loading.js` are never prefetched by default
  (`01-app/02-guides/prefetching.md:31-35`), so every open, switch or resume is
  a full dynamic server render.
- The client cache reuses pages on browser back/forward
  (`01-app/04-glossary.md`, "Client Cache"). A Back-driven switch shows a
  cached payload: no gate re-check, no mark-read, possibly stale data.
- **`cacheComponents` is off** (`apps/web/next.config.ts` does not set it).
  With it on, Next keeps up to 3 recent routes mounted inside React
  `<Activity mode="hidden">`, which is `display: none`
  (`01-app/02-guides/preserving-ui-state.md`;
  `03-api-reference/05-config/01-next-config-js/cacheComponents.md`). That
  keeps state for Back; it never shows two routes at once. Turning it on also
  means runtime reads (`cookies()`, which every console page makes) must sit
  inside `<Suspense>` (`02-guides/migrating-to-cache-components.md`), the
  thing that makes `notFound()` answer 200 (commit cb8d9d8), and the same
  guide's Testing section warns that hidden routes stay in the DOM for
  non-role locators.
- `apps/web/vercel.json:18-20` sends `frame-ancestors 'none'` and
  `X-Frame-Options: DENY`, so an iframe per window is out.
- The service worker opens a notification with `w.navigate(link)` or
  `openWindow(link)` (`apps/web/app/firebase-messaging-sw.js/route.ts:53-59`):
  always a hard load.

## Chosen architecture: URL-first desktop, server-built manifest

One sentence: **the URL is the focused window; every other window shows a
frozen copy of how it last looked, and re-renders fresh from its last URL when
focused** (decision 3, ruled A, 2026-09-25).

```
app/layout.tsx  (Toaster, AcknowledgementGate, FeedbackGate: unchanged, above everything)
└─ app/(console)/layout.tsx
   ├─ signed out / not bootstrapped / rejected                 → bare children
   ├─ held by a blocking questionnaire (reason "questionnaire") → <Desktop mode="held">
   │    ├─ the desktop drawn behind, inert (no pins, counts, Today or copies)
   │    └─ <BlockingLayer>{children}</BlockingLayer>   ← the runner, on top
   ├─ approval pending (reason "approval" && status "pending") → <Desktop mode="restricted">
   └─ cleared member                                           → <Desktop manifest=…>
        ├─ skip link, wallpaper, icon grid (default: Me, Camp, Captains
        │  columns on the left; team folders on the right; the member's own
        │  folders and shortcuts wherever they put them)
        ├─ Today gadget (closed by default; right-edge handle)
        ├─ background frames (title bar + frozen last-seen copy, inert)
        ├─ <FocusedWindow>{children}</FocusedWindow>   ← the one live page
        └─ taskbar: Start menu, window buttons, tray (from the manifest)
```

Invite and burner-profile holds never reach this layout's desktop: their
routes (`/signup/required`, `/onboarding/questionnaire`) sit outside
`(console)`.

### 1. Shell

- The member branch of `apps/web/app/(console)/layout.tsx` stops drawing
  `ConsoleHeader` and draws a client `<Desktop>` fed by a server-built
  manifest. The route's `{children}` renders inside the one live window.
- The layout keeps its branches and still never redirects:
  - signed out or not bootstrapped: bare children, so `LandingHero`
    (`apps/web/app/landing-hero.tsx`) is untouched, as the owner ruled on
    2026-09-23;
  - invite and onboarding: bare children. Their routes sit outside
    `(console)` anyway, so they own the screen and cannot loop;
  - **blocking questionnaire** (`block.reason === "questionnaire"`): the
    **held desktop** (see "Blocking questionnaires" below). The runner draws
    on top; the desktop behind is inert;
  - approval pending: a **restricted desktop** (Today, Inbox, an "Application
    submitted" balloon) in place of today's bare column. The predicate is
    `block?.reason === "approval" && campUser.approvalStatus === "pending"`,
    the same as `waiting` in `(console)/page.tsx:49-51`, moved into one shared
    helper in `lib/member-gate.ts` that both call;
  - **rejected applicant**: the bare branch. Today they get the content column
    on `/notifications` and `/announcements/<id>` (both gate on
    `hasCampAccess` only); keying on the reason alone would hand them a
    restricted desktop that says "Application submitted". `/` still sends them
    to `/pending-approval`;
  - cleared member: the full desktop.
- **Blocking questionnaires** (owner, 2026-09-25: "Blocking questionnaires
  will sit on top of everything"). [CORRECTION 2026-09-25] An earlier draft
  of this doc drew no desktop at all for a held member (the bare branch) and
  had the `<HeldScreen>` marker hide every piece of chrome. The owner wants
  the desktop visible behind the form instead. **Only the look changes. The
  server gates stay exactly as they are**: `memberBlock` still names the
  gate, `requireMemberPage` still redirects every other member page to
  `/questionnaires/<id>`, and the layout still never redirects.
  - **What is drawn.** A blocking layer (the prototype's
    `_proto/blocking.tsx`): the runner in a window-like frame with no close,
    no minimise and no maximise, over a dimmed scrim. Behind it, the desktop
    in `held` mode: wallpaper, icons and an empty taskbar. The held manifest
    is built on the server and **leaves out** pins, tray counts and
    popovers, the system-health flag, the Today gadget, badges and every
    background window and last-seen copy. A held member who is not yet
    approved (the ladder puts questionnaires before approval) gets the
    wallpaper only, not the desktop they do not have yet.
  - **How it holds.** `#os-desktop` is `inert` while the layer is up (the way
    `AcknowledgementGate` already does it), focus starts in the form and is
    trapped there, and Esc does nothing (the layer stops it). Sign out is
    the one way out, as a button inside the layer. The runner's own Selects and dialogs portal above the
    layer (the z bands in section 2). Because Radix portals sit outside
    `#os-desktop`, `inert` does not reach an overlay the desktop already had
    open, so entering held mode first closes every desktop-owned overlay
    (visual-language doc 4.7a); the form's own overlays are untouched.
  - **Why it is still safe.** The layer decides nothing. It is a picture;
    the gate is the server redirect. If someone strips `inert` in the
    browser's dev tools and clicks an icon, the navigation runs
    `requireMemberPage` and lands back on the runner, the same as a typed
    URL does today. The held manifest carries nothing the member could not
    already see (their own icon names), and nothing that updates. This keeps
    the owner's 2026-09-16 rule: the server check owns the blocking
    questionnaire, and no client overlay decides a gate.
  - **Held mid-session.** The layout picks its branch only when it renders,
    and Next keeps it mounted across soft navigation. A member who becomes
    held while on the full desktop (a captain sends a blocking
    questionnaire, or `syncOpenGates` adds them to an open send) is
    redirected to `/questionnaires/<id>` on their next click, and that route
    is inside `(console)`. So the runner and its `/complete` page render a
    server `<HeldScreen>` marker. `<Desktop>` reads it through context,
    switches to held mode at once (drops pins, tray, Today and the last-seen
    copies, sets `inert`, shows the layer), and calls `router.refresh()` so
    the layout re-renders into the held branch built on the server. Page
    gates still refuse everything else in the meantime.
  - `/complete`: while the member is still held (another blocking form
    queued), it stays in the layer. When the last one is done, "Continue to
    desktop" refreshes the layout and the layer goes.
- `/` is the desktop. The signed-out branch, the `/setup` redirect and the gate
  redirects in `apps/web/app/(console)/page.tsx` stay as they are. A signed-in
  member gets `HomeView` trimmed to a **Today gadget** (to-dos, tasks, coming
  up, lift, checklist). The "Your modules" grid becomes the desktop icons.
- **The Today gadget is closed by default** (owner, 2026-09-25: "I don't like
  it being open the whole time"). A handle on the right edge of the desktop
  opens and closes it. The choice is remembered per browser in
  `localStorage` (`camp404.os.today-open`, a boolean and nothing else). The
  gadget is rendered on the server with the page, so opening it needs no
  request; while closed it is not in the DOM. Setup-checklist items that block
  nothing stay in it; a real block is still a gate route, never the gadget.
- **Tray and pins are manifest fields, per mode.** `NotificationPanel` moves
  into the tray. `PinnedAnnouncements` becomes a strip above the window layer
  plus a tray item, so a pin still cannot be missed. Restricted and held
  modes get no pins and no system-health item.
- **System health in the tray, for every accepted member** (owner,
  2026-09-25). A warning icon appears in the tray when something is wrong.
  What reaches the browser depends on rank, decided on the server:
  - an approved member who is not a captain gets a **coarse flag** only
    (`ok` or `warning`). The icon says "Something in the app is not working
    right now" and links nowhere. No service name, count, error text or
    background-job detail is in their payload;
  - a captain gets the details: the warning count, and the icon opens System
    status (`/captains/system`), which stays captain-only.
  The flag must be cheap, because every member's page now computes it.
  `getSystemStatus` (`apps/web/lib/system-probe.ts`) probes the database
  with up to a 5 s timeout; the tray must not run that probe on every
  render. It derives the flag from the environment checks
  (`deriveSystemStatus`) plus the fact that this request already reached the
  database. PR B confirms the cost.
- **The account chip** (the prototype draws it at the top right of the
  header; `variant-a-chrome.tsx`, `AHeader`) shows the member's name and
  rank chip, rendered on the server as today's header chip is. A lead gets a
  second line: "Leads Kitchen" when they lead exactly one team, "Leads 3
  teams" for more (owner, 2026-09-25: one person can lead many teams). The
  full list shows on hover, in a tooltip that also opens on keyboard focus,
  and is part of the chip's accessible name.
- Account and Report a problem move into the Start menu. **Log off reuses
  `SignOutLink`**, never a plain `/auth/sign-out` href, so the device's push
  token is still removed first.
- The root-layout overlays (`apps/web/app/layout.tsx`: Toaster,
  `AcknowledgementGate`, `FeedbackGate`) stay where they are, above the
  desktop. `AcknowledgementGate` also sets `inert` on `#os-desktop` while it
  holds the screen.

### 2. Window manager package: `@camp404/os`

A new `packages/os`, lifted from `apps/join`. Join moves onto it in the same
PR, which proves it against Join's own unit tests and its desktop and 390 px
smoke suite (`apps/join/tests/e2e/smoke.spec.ts`). It is themed only through
`--os-*` CSS variables, because Join does not depend on `@camp404/ui`.

- `window-manager.ts`: `wmReducer<K extends string>`, generic over an
  **instance key**, not a program id, so `/meetings/abc` and `/meetings/def`
  can be two windows. New actions:
  - `upsertUrl`: open or focus the window for a URL, and remember `lastUrl`;
  - `setTitle` (in-memory only, never persisted, see section 7);
  - `hydrate`: restore a saved stack;
  - `reclamp`: pull windows back on screen after a viewport resize
    (ResizeObserver; Join never does this);
  - `pruneTo(allowedIds)`: drop every window whose program id (top-level
    **or child**) the member no longer has. Run on hydrate and whenever the
    manifest version changes.
- `os-window.tsx` (`OsWindowFrame`):
  - drawn as `<section aria-labelledby=… aria-roledescription="window">` (a
    region), **not** `role="dialog"`. Real Radix modals keep `role="dialog"`.
    There are 25 `getByRole("dialog")` locators across the E2E specs, some
    asserting absence (`announcements.spec.ts:120` and `:351`,
    `kitchen-source-editor.spec.ts:227`, `:263`, `:273`) and some bare
    (`tasks.spec.ts`); an always-present dialog frame would break Playwright
    strict mode and the count checks, and a screen reader would say "dialog"
    on every page;
  - **Esc closes only if `!e.defaultPrevented` and the event target is inside
    the window's real DOM** (`currentTarget.contains(target)`), so a portalled
    Select or Popover cannot close the program;
  - drag starts from the title bar only, is rAF-throttled, and positions with
    left/top, never transforms, so dnd-kit (Tasks, the questionnaire builder)
    and Radix popovers keep correct coordinates;
  - eight resize grips, double-click to maximise;
  - the body is its own scroll container and an `@container`, keyed by
    `instanceKey` so window A's `scrollTop` never carries into B.
- Also in the package: taskbar, Start menu, desktop icon, the icon grid
  (selection, box select, snap-to-grid drag, section 4), the context menu,
  folder window (Teams, Kitchen, Captains, team folders, the member's own
  folders), the blocking layer, the Today handle and panel, the last-seen
  snapshot (decision 3 A), `usePhone`, Boot, and `useWindowDirty`. The grid's
  placement logic (default layout, snap, nearest free cell, fit after a
  resize) is a pure module with unit tests, like `wmReducer`.
- **Terminal, games and cats are shared too, in two packages** (owner,
  2026-09-25: the terminal and the game should be "their own package so we
  can share things between both of them"; later the same day: "we're
  actually gonna be hiding a number of games in the future, it might be worth
  having them in a games package, then the OS parts are their own package").
  - `@camp404/os` is the operating system: the window engine, desktop, icon
    grid, folders, taskbar, Start menu, Today, blocking layer and the
    terminal. The terminal is an OS part, exported as `@camp404/os/terminal`:
    a pure command engine (parse a line, look up a command, return lines and
    an optional "open this program"), history, the `TermLine`/`TermResult`
    types, generic over the app's program key, and the `TerminalWindow`
    view. No command set lives in the package. Join keeps its commands
    (`apps/join/lib/terminal-commands.ts`: fee, captains, apply, teams); the
    console gets its own (`apps/web/lib/terminal-commands.ts`).
  - `@camp404/games` holds every hidden game and toy, now and later:
    INKBLOT (the pure game `inkblot.ts`, its sprites and cat frames, its two
    views), the cats (the Jinn and Prince sprites, the clock cat) and the
    Shadow Work toy for the Teams folder (the art piece, its stand and light,
    Jinn, the throw, roll and shake physics). Each game is its own export
    (`@camp404/games/inkblot`, `@camp404/games/shadow-work`,
    `@camp404/games/cats`), its logic a pure module with unit tests, its copy
    passed in as props (Join's `INKBLOT` text from `lib/content.ts`), so the
    package reads no app content. A new game is a new folder and export here,
    never code in the OS package.
  - Most games live only in the main app (owner, 2026-09-25: "most of the
    games will only be available in the core app, not the join page").
    Join imports only `@camp404/games/inkblot`, which it has today; every
    other game and toy (cats, Shadow Work, games to come) is imported by
    `apps/web` alone. A game reaches Join only when the owner asks for it
    there. Because each game is its own export, Join's bundle never carries
    the others.
  - The boundary: `@camp404/games` may use `@camp404/os`'s tokens and its
    window props (a game is shown inside an OS window), but `@camp404/os`
    never imports a game. The app wires them together: the terminal's command
    table and the folders' contents (apps) decide where a game or cat
    appears. All games are decorative: `aria-hidden` or a plain label, and
    nothing in the app depends on playing them. Each app loads a game with
    `next/dynamic` only when it opens, so no game is in the first bundle.
  - Cost of two packages over one: a second `transpilePackages` entry and a
    second CSS import in each app, and a second test setup. [CORRECTION
    2026-09-26] This said a second Tailwind `@source` line in each app. PR A
    puts the `@source` line inside the CSS file each package ships
    (`@camp404/os/styles.css`, `@camp404/games/inkblot/styles.css`), so an
    app imports that file and writes no `@source` of its own. Worth it, since
    more games are coming and each should stay out of the OS.
- **Dirty registry.** `useWindowDirty(isDirty, message, draft)` is consulted
  on close, minimise, switch and launch, plus `beforeunload`. A Back cannot
  be asked about, so the `draft` it carries is kept in memory instead and
  restored on reopen (section 5, "Back keeps unsaved input"). It replaces the
  builder's `useLeaveGuard`
  (`apps/web/components/questionnaires/builder.tsx:158-209`). That guard's
  document-level capture listener (`:206`) intercepts only `<a href>` clicks:
  it would catch desktop icons and Start items drawn as links, but taskbar
  buttons and background-frame clicks that call `router.push` bypass it entirely.
- **Layering.** The window layer is `isolate` (z 20 and up). Taskbar and pin
  strip at z 90. **The Start menu sits above every window, the taskbar, the
  pins and the tray** (owner, 2026-09-25), with the right-click menu just
  above it. Only the blocking layer and dialogs (Radix portals) sit higher,
  then the Toaster and the acknowledgement takeover on top of everything.
  The blocking layer sits below the Radix band, so the runner's own Selects
  and dialogs open above it. Exact bands: visual-language doc 4.9.
- **Start menu height.** On desktop it is at most half the screen height
  (`max-h-[50dvh]` in the prototype) and scrolls inside after that. On a
  phone it is a full-screen sheet above the bottom bar.

### 3. Routing, deep links and the Back button

- All ~59 `page.tsx` files keep their paths, typed routes (`typedRoutes`,
  `apps/web/next.config.ts:13`), gates, 404s and 307s. No parallel or
  intercepting routes, no iframes, no `loading.tsx`, no per-window Suspense.
- `apps/web/lib/program-routes.ts` (a plain module, never a `"use server"`
  file) exports `matchProgram(pathname)` →
  `{programId, instanceKey, genericTitle}`. It replaces `activeNavHref`
  (`apps/web/lib/console-nav.ts:186`). [CORRECTION 2026-09-26] Not until PR
  C: today's header has two links into the My account program (Profile and
  Sign-in & security), which `matchProgram` cannot tell apart, so PR B moved
  `activeNavHref` into `program-routes.ts` and the header keeps using it.
  Rules:
  - sub-pages share an instance: `/profile`, `/profile/edit` and
    `/profile/security` are one window; so are `/power/loads` and
    `/power/fuel`;
  - documents get their own instance: `/meetings/<id>`,
    `/kitchen/recipes/<id>`, `/announcements/<id>`;
  - query params (`?team=`, `?tab=`, `?plates=`, `?cycle=`, `?before=`) stay in
    `lastUrl` and do not create a new window.
- Other open windows are client records
  `{key, programId, lastUrl, rect, z, minimized, scrollTop}`. Their frame
  shows a title bar with the generic title from `matchProgram(lastUrl)` and,
  under decision 3 A (ruled 2026-09-25), a **frozen copy of the body as it
  last looked**, with a
  quiet line "Last seen 14:02. Click to refresh." **Focusing one calls
  `router.push(lastUrl)`**, so it re-renders fresh on the server behind its own
  gate.
- **The last-seen copy (decision 3 A).** How it works:
  - When a window is about to lose focus, the desktop clones its body's DOM
    (`cloneNode(true)`): before any switch the desktop starts (icon, taskbar,
    Start menu, background frame), on a capture-phase click on an in-window
    link, and once the page is idle after each commit (so a switch the page
    starts itself, such as `router.push` after a save, still leaves a recent
    copy).
  - The copy is plain HTML. No React, no scripts, no event handlers, no
    requests. It is drawn inside a **closed shadow root** in the background
    frame, with the app's stylesheets cloned in, and the frame body is `inert`
    and `aria-hidden`. So Playwright (which does not pierce closed shadow
    roots), `getByLabel`, screen readers and the Tab key see one page only.
  - A clone keeps attributes, not live input values, so unsaved typing is not
    copied. Elements marked `data-os-private` are blanked in the copy: ID and
    passport numbers, bank details, the roster's safety and captain-notes
    panels. Canvases (INKBLOT) copy blank.
  - It lives in memory only, never in `sessionStorage`. After a hard load the
    background windows show their icon and name until opened. It is dropped on
    close, `pruneTo`, sign-out, a user-id change and **a change of manifest
    version** (a demotion or any other change of what the member may open),
    so a captain-only copy never survives losing access.
  - **A total snapshot budget.** There is no window cap (decision 7 B), and a
    per-body size limit (see Risks) does not bound the total, so every copy
    counts toward one budget: about 20 MB of serialized copy HTML across all
    windows (a constant in `last-seen.ts`, tuned by PR C's measurement).
    When a new copy would go over it, the least recently focused windows drop
    their copy, oldest first, and fall back to the icon-and-name state until
    they are focused again. The windows themselves stay open; only the
    picture goes. PR C measures memory with many windows open.
  - On phones only one window shows at a time, so the copy is used only as a
    thumbnail in the open-programs switcher, if at all.
- **During a switch.** `usePathname` changes only on commit, so the old page
  stays in the DOM until the new one arrives. Focus and z-order change on
  commit; until then the target taskbar button or icon shows a pending state
  (`useLinkStatus` on links, as `apps/web/components/console/console-nav.tsx`
  does today; `useTransition` on buttons). After commit the body's saved
  `scrollTop` is restored. Client state (filters, open panels) is not kept
  unless it lives in the URL.
- Because only the focused window mounts (the last-seen copy is inert HTML,
  not a mounted page):
  - there is no duplicate DOM, so Playwright strict mode holds;
  - audited reads (roster member detail), mark-read on render (`/notifications`,
    `/announcements/[id]`), `resetStaleRuns`, the 1 s recipe poll and the
    announcements microphone run only for the window the member is looking at;
  - `maxDuration = 300` on the recipe pages keeps working, because the page
    request is unchanged.
- **No full prefetch of a program URL.** That guarantee holds only while
  nothing renders page RSC ahead of a click. Desktop icons, Start items,
  taskbar buttons, background frames, folder windows and the pin strip use the
  default `<Link>` prefetch (which renders no page, since there is no
  `loading.tsx`), never `prefetch={true}` and never `router.prefetch(url)`. A
  full prefetch would mark the inbox and announcements read, run
  `resetStaleRuns` and kick due work with no user intent. Enforced by a unit
  test (or lint rule) over `packages/os` and `apps/web/components/os`. The desktop
  must also never restore selection state (a selected roster member) on focus,
  because that would replay `getMemberDetailAction`'s audited read without a
  click.
- Existing `router.push`, `<Link>`, action `redirect()` and `router.refresh()`
  calls need no sweep. A URL change opens or focuses the window it maps to.
- **Close** calls `router.replace(nextTop?.lastUrl ?? "/")`. The App Router
  owns `history.state` and no API reads the previous entry, so "go back if the
  entry behind is the window underneath" cannot be built. Consequence, stated
  and tested: after a close, Back goes to whatever entry preceded the closed
  window's, and may reopen a window closed earlier as a fresh window.
  **Minimise** sets the flag and then does the same replace.
- **Back/forward re-check.** The client router cache reuses pages on
  back/forward without running their server gate again, so a member who lost
  access (a demoted captain) could otherwise see a cached captain-only page.
  So on **every** back/forward restore of a program page, `<Desktop>` keeps
  the window body hidden (the frame shows its title and "Checking…") and
  calls `router.refresh()`, which re-runs the server gate and the layout's
  manifest read. Only when that refresh commits is the body shown; if the
  gate now refuses, the refreshed render is the refusal (a redirect,
  `notFound()` or `CaptainLock`), and the cached page is never drawn. There
  is no age cutoff: a time limit is not an authorization check. Mark-read and
  data catch up in the same refresh. A Playwright test demotes a captain,
  presses Back onto a captain page and asserts its content never appears.
- **Hard loads** (refresh, email, push, sign-in return): the URL's window is
  focused and the rest of the stack is rehydrated from `sessionStorage` as
  frames with no copy yet (icon and name), until each is opened.
- **Errors.** Add `apps/web/app/(console)/not-found.tsx` ("Page not found")
  and `error.tsx` ("Tasks stopped responding", built on `ErrorRecovery
  frame="inline"`). Both render inside the focused window; the desktop stays
  up. The three section boundaries (`captains/`, `tools/`, `questionnaires/`
  `error.tsx`) sit closer to the failing page and would win over the new one,
  so the same PR reskins them (or deletes the first two). The
  `questionnaires/error.tsx` boundary must keep working in the bare, blocked
  branch, where there is no desktop. A mistyped URL that matches no route
  still gets the root, full-screen `app/not-found.tsx`, not the in-window one.
  A Playwright test asserts that a missing meeting still answers 404.
- **The `?next=` fix.** One helper, `signInRedirect()`, builds
  `/auth/sign-in?next=<path>` and is used by all three redirects:
  `requireMemberPage` (`member-gate.ts:91`), `getAuthenticatedUserOrRedirect`
  (`lib/auth.ts:91`) and `(console)/page.tsx:47`. The sign-in form already
  honours `next`. The path comes from an `x-camp-path` request header set by a
  new `apps/web/proxy.ts` (Next 16's middleware):
  - the proxy **always deletes** an incoming `x-camp-path` and sets it from
    `request.nextUrl` (pathname and search), so a client-sent header never
    reaches `headers()`;
  - a negative matcher (everything except `api`, `_next`, `auth` and static
    assets), not a list of console folders, because console routes sit under
    about 15 top-level folders and a positive list silently misses a new one.
    A drift test checks every `(console)` top-level segment is covered. It
    never touches `/api/auth/*`, so it is not a second switch next to
    `authMayServe`;
  - before a gate uses the value, it must pass `safeInternalPath`
    (`apps/web/lib/safe-redirect.ts`) **and** `matchProgram` (a known console
    page); otherwise `next` is omitted. So `next` never points at a route
    handler (`/captains/camp-management/export`, `/auth/sign-out`) or
    `/auth/*`.
  Proxy runs on the Node runtime on every matched request, a new invocation
  per request on Hobby; PR B measures it. Fallback if the owner does not want a
  proxy: each gate caller passes its own typed route literal.
- Every existing deep link keeps working because URLs are windows:
  `notificationLink` (`packages/core/src/notification-links.ts:13-28`), push,
  email, Better Auth callbacks, `/mcp/connect?next=`, and the gate hrefs from
  `memberBlock` (`apps/web/lib/member-gate.ts:34-54`).

### 4. Program manifest (server-side)

- `apps/web/lib/programs.ts` (plain module, evolves `lib/console-nav.ts`): the
  registry plus a pure `buildProgramManifest(facts, registry)`. It returns
  `{mode, desktop, folders, teamFolders, taskbarPins, startMenu, tray, pins,
  allowedChildren, version}`. `mode` is `full`, `restricted` or `held`. The
  client receives only
  `{id, label, fileName, href, icon, group, folder, mine?, badge?}` per
  program, and per team folder `{team, label, lead, programs}`; never a rank
  or the reason a program is shown. The member's own facts that are drawn
  as text (their rank label, the "Leads …" line, the LEAD tag) are theirs to
  see and add nothing a gate relies on. `label` is the plain name (Roster);
  `fileName` (`ROSTER.DB`) is kept for the Terminal and the optional quiet
  suffix (decision 9). `allowedChildren` lists the child programs (Results,
  a respondent's Answers, Send questionnaire, Edit recipe, …) the member may
  hold, each at its own bar (Results = captain), so `pruneTo` can check every
  stored key.
- `consoleNavFor` and `buildHome().modules` become views of the manifest, so
  the nav and Home can no longer disagree.
- `apps/web/lib/program-manifest.ts`: `getProgramManifest = cache(...)`, built
  on `resolveMemberState()`, which stays the one caller of
  `runDueWorkAfterResponse`. Inputs:
  - **new:** a request-cached `getCampSettings()` giving both the cycle and
    the teams config (camp_settings is read 3+ times per request today:
    `getTeamsConfig` in `lib/camp-config.ts:45` and `currentCycleNumber` in
    `packages/db/src/cycles.ts:68`, which each db membership function calls
    itself);
  - **new:** **one** this-cycle memberships read, from which `isLead`,
    `ledTeams` and `myTeams` all follow. It replaces the separate
    `isTeamLead`, `getMyTeams` and `getLeadTeams` calls; `captainPageGate`
    moves onto the same cache. The db read takes the cycle as an argument
    instead of calling `currentCycleNumber` inside;
  - `getInboxBadge` (already cached).
  **Neither new function has a test-store twin yet.** Both are new lib
  functions that route through `usesTestStore()`, with test-store methods that
  apply the same year-scoping as the real backend. Without them every E2E
  persona gets an empty manifest, and `captainPageGate` would read the real
  database under `E2E_TEST_MODE`, so lead personas would lose clearance. A
  unit test shows the test-store and real outputs agree for a lead persona.
- **Caches are per request only.** Both are React `cache()`, never
  `unstable_cache` or `"use cache"`, because they are keyed by viewer. An
  action that writes memberships and then re-renders reads memberships fresh
  (bypassing the cache) after the write.
- `requires` predicates may call only existing core functions:
  `hasClearance`, `canApproveRecipe`, `canRunProofread`, `canEditMealPlan`,
  `canEditPower`, `canSendToAudience`, `canWorkInTeam`. Lead programs use
  `isLead` / `hasClearance(rank, "team_lead")`.
- **Groups** (owner, 2026-09-25: "things seem quite random ... order that
  desktop a little bit better"). Every program belongs to one group, in this
  order. The groups set the default desktop layout, the Start menu sections
  and the phone home screen rows:
  1. **Me**: Inbox, My forms, My account, Invites, My lift (decision 11).
  2. **Camp**: Tasks, Calendar, Roster, Meetings, Family tree, Power, and two
     folders: **Teams** (every active team) and **Kitchen** (Recipes, Meal
     plan, and Recipe review for reviewers).
  3. **Captains**: the Captains folder (only for `team_lead` and up), then
     Terminal. For a plain member, Terminal ends the Camp column.
  Names are plain English (catalogue doc). (The prototype puts Tasks and
  Calendar in Me; which group they sit in is a registry detail to settle in
  PR B, not a decision.)
- **Team folders** (owner, 2026-09-25: "when you are a part of a team, that
  team folder shows up on your desktop"). Decision 8, ruled:
  - every team the member is in **this year** gets a folder on the
    **right-hand side** of the desktop, named "Kitchen team" so it is not
    mistaken for the camp-wide Kitchen folder. Members and leads alike; led
    teams first, each tagged **LEAD**. From the same single memberships read
    as the rest of the manifest, so a year rollover empties it until
    captains reassign;
  - a team folder holds the team's page (`/teams/<key>`) and that team's
    tools. A starting set, from the prototype (`_proto/desktop-items.tsx`,
    `TEAM_TOOLS`): Kitchen: Recipes, Meal plan, Recipe review; Power &
    Lighting: Power; Communications & HR: Announcements, Questionnaires
    (the prototype calls it Forms), Join site; Finance: Payments (the
    prototype calls it Money). **The exact tools per team are shaped with
    each lead**, like the team programs below;
  - a tool in a team folder is a **shortcut, not a grant**. The manifest
    lists a tool there only when the member may open it (Recipe review only
    for `canApproveRecipe`, Join site and Payments only for a captain until
    decision 13 says otherwise), and the page still runs its own gate. A
    Finance member who is not a captain sees Payments in no folder;
  - the Teams folder in Camp still lists every active team;
  - captains have the fullest desktop: every group, every folder, and team
    folders for their own teams.
- **The desktop is a real desktop** (owner, 2026-09-25; decision 14,
  ruled). The prototype's behaviour (`variant-a-icons.tsx`,
  `DesktopIconGrid`):
  - icons sit on an invisible grid of cells over the whole desktop (96 px in
    the prototype), left of the Today handle;
  - click selects one; Ctrl-, Cmd- or Shift-click adds or removes; a box
    drawn from the empty desktop selects every icon it touches; Esc or a
    click on the empty desktop clears;
  - dragging moves the whole selection by whole cells. It snaps on drop;
    an icon in the way moves to the nearest free cell. No slide animation on
    drop: the icons are simply in their new cells;
  - double-click or Enter opens. A single click never opens;
  - dropping one icon onto a member's own folder puts it inside (a program
    is added, a shortcut is used up);
  - **default layout**: one column per group (Me, Camp, Captains) from the
    left, top to bottom, and the team folders down the right-hand side. When
    the screen is too short, a group runs into a second column. "Line up
    icons" (right-click on the empty desktop) puts the default back;
  - after a resize every icon stays on screen: one that no longer fits goes
    to its default cell, or the first free one;
  - the layout is saved per member on the server (section 7; decision 14
    B). It is pruned against the manifest on load: an icon for a program the
    member no longer has is dropped, never drawn.
- **Right-click menus** (owner, 2026-09-25; the prototype's
  `_proto/desktop-items.tsx`):
  - on a program, in any folder or on the desktop: **Open**, **Create
    desktop shortcut**, **Add to *folder*** (one line per folder of the
    member's), **Add to a new folder**;
  - on the empty desktop: **New folder**, **Line up icons**;
  - on a member's own folder: **Open**, **Rename**, **Delete folder**;
  - on a shortcut: **Open**, **Add to folder**, **Delete shortcut**.
  Shortcuts carry a small arrow in the corner and ", shortcut" in their
  accessible name. A new folder asks for its name at once (24 characters at
  most). Deleting a folder or a shortcut removes only the member's own item,
  never a program. The menu is `role="menu"` with arrow keys and Esc; the
  real build also opens it from the keyboard (Shift+F10 and the Menu key) on
  the focused icon.
- **Member folders and shortcuts are desktop only.** They hold program ids
  and names the member typed, nothing else. The phone home screen does not
  show them (section 5). They are never a way in: a shortcut to a program
  the member loses is pruned with it.
- Default program set (details per program in the catalogue doc):
  - every approved member: Inbox, Tasks, Calendar, Roster (at
    `/captains/camp-management`; the page still picks the projection by rank),
    Family tree, Meetings, Power, Recipes, Meal plan, My forms, Invites,
    My account, Terminal;
  - Teams folder: every active team; own teams also as team folders on the
    right (decision 8);
  - Kitchen folder: Recipe review only when `canApproveRecipe`;
  - Captains folder: Questionnaires, Announcements and New event (team_lead or
    captain); captains only: Camp overview, Payments, Camp settings (with the
    year applet), Join site, Audit log, System status. New event for a lead
    whose led teams are all archived opens with an explanation, not an empty
    picker ([CORRECTION 2026-09-26] in PR C: it changes what the page shows,
    and PR B changes nothing visible);
  - child windows with no icon: builder, preview, send, results, respondent
    detail, meeting and recipe documents, answers, announcement detail, the
    questionnaire runner and completion page, and INKBLOT (opened from the
    Terminal or a hidden cat);
  - driver programs: decision 11, ruled A (2026-09-26): My lift at `/lift`,
    with a `getMyLift` test-store twin, added in PR B. Participation gates nothing (owner rule)
    and the founder address grants no clearance.
- **Terminal** (owner, 2026-09-25: "We do need the terminal"). A route,
  `/terminal`, behind `requireMemberPage`, drawing the shared
  `TerminalWindow` with the console's command set. v1 reads and writes no
  data: `help`, `ls` (the member's own programs, by group), `open <program>`
  (only programs in the member's manifest; anything else answers "not found",
  the same as a program that does not exist, so it leaks no captain program
  names), `whoami` (name and rank label, as the tray already shows), `clear`,
  `exit`, `play inkblot` (opens INKBLOT at `/terminal/inkblot`) and a few
  cat easter eggs (`help` never lists them). The command set is a pure function of the client
  manifest and is unit tested like Join's `terminal.test.ts`.
- **Team programs are bespoke per team** (owner, 2026-09-25: "each team lead
  will actually be telling me how they want their module to be set up"). The
  shell ships every team at `/teams/<key>` with today's shared page. After
  the shell, each team's program is shaped with that team's lead, one team at
  a time, in line with the standing direction that each team gets its own
  dashboard (memory: `teams-bespoke-dashboards-and-task-board.md`). No
  generic, configurable team page: bespoke over generic (AGENTS.md). The
  same talk with each lead settles which tools that team's folder holds.
- **Staleness.** A `revalidateManifest()` helper
  (`revalidatePath("/", "layout")`, the 12eb18e pattern) is called by every
  action that changes a manifest input: approvals, promotion accept, team
  assign/remove/lead, team settings, cycle rollover and founding year, gate
  completions, `setPinnedAction`. **It refreshes only the desktop of the member
  who acted.** Approving someone, assigning a lead, demoting a captain or
  rolling the year changes *other* members' manifests, and their mounted
  layouts stay stale until one of:
  - a hard load;
  - `<Desktop>` calling `router.refresh()` when the tab becomes visible after
    5 minutes or more (an event, not a timer);
  - a page rendering a `CaptainLock` or a gate redirect: `<Desktop>` then
    calls `router.refresh()`, so the manifest and `pruneTo` catch up.
  Until then a demoted captain may still see Captains folder icons, and a
  member moved off a team may still see its team folder; every gate still
  refuses, so nothing leaks through a page. Their saved layout and
  shortcuts are pruned against the new manifest when it arrives.
  [2026-09-26, PR B as built] The manifest inputs that change for a member
  who did NOT act, and so are never revalidated for them (they wait for one
  of the three above):
  - their rank or approval, changed by a captain (approve, reject, demote)
    or by another member accepting a promotion;
  - their teams and lead flags, changed by a captain;
  - the team settings and the year, changed by a captain;
  - their lift (whether My lift shows): a driver seating or dropping them,
    and every lift change made through the MCP tools
    (`lib/mcp/tools/lifts.ts`, `lib/mcp/tools/profile.ts`), which run
    outside the member's browser, so no layout of theirs is refreshed even
    when they made the change themselves;
  - their inbox count, when someone sends them a notice.
  The drift test (`lib/__tests__/manifest-revalidate.test.ts`) covers only
  the hand-kept list of actions that change the actor's own inputs.

### 5. Phone model (below `md`): the mobile Classic desktop

The owner needs "a mobile version of the classic desktop" (2026-09-25). On a
phone it is a home screen, not a shrunk desktop:

- **Home screen.** `/` shows the same groups as the desktop (Me, Camp,
  Captains, with Terminal), each a labelled row of big icons (at least 64 px
  with the label, 44 px hit target minimum), 3 or 4 per row, then a **My
  teams** row with the member's team folders (LEAD tags included; owner,
  2026-09-25). No floating windows, no wallpaper widgets. The order is fixed:
  no dragging, no box select, and the member's own folders and shortcuts
  are not shown (they are desktop only).
- **Folders open as full-screen sheets** (Teams, Kitchen, Captains, the team
  folders): a title bar with the folder name and a big Close, then the icon
  grid. The right-click actions are desktop only.
- **Programs open full screen**, one at a time, with a title bar that has a big
  Back/Close control on the left (at least 44 px) and the plain program name.
  No drag, no resize, no maximise.
- **Bottom bar** (replaces the taskbar): Home, Open programs (a switcher list,
  with each window's plain name and, optionally, its last-seen thumbnail), the
  inbox bell, and Today. It pads by `env(safe-area-inset-bottom)` and hides
  while the soft keyboard is open.
- **Today is a sheet** that slides up from the bottom bar. It follows the same
  remembered open/closed choice as the desktop handle, but always starts
  closed on a hard load on a phone, so the home screen shows first.
- Layout is chosen by CSS: the frame is `fixed inset-x-0 top-0 bottom-[bar]`
  by default and switches with `md:` classes. The server's first paint is
  already right at 390 px, with none of Join's hydration flip. `usePhone`
  only turns drag on or off.
- **History semantics on phones.** Opening a window from the home screen or
  the switcher pushes an entry. Links inside a window keep their own
  behaviour (no sweep). A popstate that lands on a different window's
  instance closes the window it left, so background windows do not pile up.
  Android Back and iOS swipe-back therefore pop the stack; Join does not have
  this. The title-bar Back/Close is the main way out, because the installed
  PWA runs standalone and iOS shows no Back button there.
- **Back keeps unsaved input.** `popstate` cannot be cancelled, so
  `useWindowDirty` cannot ask before a browser Back, a hardware Back or a
  swipe, and a phone's Back closes the window it leaves (above). The design
  therefore **keeps the draft rather than asking**: a window that is dirty
  when a popstate closes it hands its unsaved values (the page passes them to
  `useWindowDirty` along with the dirty flag) to the desktop, which keeps
  them **in memory** for that window instance. When the member reopens the
  window in the same session, the draft is restored into the form and a
  line says "Unsaved changes restored" with a Discard button. The in-memory
  draft is never written to browser storage (so My forms and burner-profile
  answers, some of them `SAFETY_VISIBLE`, stay out of it), and it is dropped
  on save, on Discard, on sign-out, on a user-id change and on a change of
  manifest version. A hard load loses it; for the four editors below that is
  covered by their autosave. Close and minimise from the title bar still ask
  first through `useWindowDirty`.
- **Draft autosave.** On a phone Back is the most common switch; on a
  desktop the Back button does the same, and a hard load loses the in-memory
  draft. So the four editors that register `useWindowDirty` (meeting, meal plan, Tiptap
  recipe source, announcements composer) autosave their draft to
  `sessionStorage` at every width, under a separate key per user and
  instance, cleared on save, on close, on sign-out and on a user-id mismatch.
  This is the one exception to "layout only" in section 7. It is limited to
  those four editors, none of which hold ID, bank or safety fields.
- Wide pages (Tasks, Roster, Power, Meal plan, Payments, builder, recipe rail)
  move to `@container` queries in a later PR. Until then they open maximised on
  desktop.
- Native: the owner ruled a thin Capacitor WebView shell (2026-09-16), which
  means `server.url`. But `apps/mobile/capacitor.config.ts` still sets
  `webDir` (the static export, `../web/out`) and no `server.url`.
  [UNRESOLVED 2026-09-25] The owner picks: switch the config to `server.url`
  as part of this work, or leave native out of this work. Nothing here
  assumes either. The static export (`isMobileBuild`,
  `apps/web/next.config.ts:3`) stays deferred either way; a server-rendered
  desktop cannot be statically exported.

### 6. Keyboard and accessibility

- Each window is a labelled region (`<section aria-roledescription="window">`,
  see section 2), not a dialog. The title chip shows the plain name
  ("Roster"), and so does the accessible name (through `aria-labelledby`). If
  decision 9 B adds a quiet file-name suffix, it is `aria-hidden`, so neither
  a screen reader nor the route announcer reads "roster dot D B". The title bar is not a heading. Focus-in or
  pointer-down raises a window; close hands focus to the next window or the
  program's icon; minimise hands it to the taskbar button.
- **Focus on navigation.** When a navigation commits, focus moves to the
  page's `h1` (or `[data-autofocus]`). A "Skip to window" link is first in the
  DOM. The icon grid is a single tab stop with arrow-key roving tabindex, so a
  keyboard user does not Tab through 15 to 25 icons to reach the page.
- **The icon grid by keyboard.** Arrow keys move focus by cell, Enter opens,
  Space selects, Shift or Ctrl with an arrow adds to the selection, Esc
  clears it, and Shift+F10 or the Menu key opens the right-click menu for
  the focused icon (or for the desktop when nothing is focused). Moving
  icons by keyboard is optional; "Line up icons" is always reachable from
  the desktop's menu. The selection state is exposed (`aria-selected` on a
  `listbox`-style grid, or `aria-pressed`), not shown by the dotted box
  alone.
- **Text selection** (owner, 2026-09-25). The desktop chrome has none:
  icons, folders, the header, the taskbar, the Start menu and the context
  menu are `user-select: none`, as on a real desktop, so a drag or a
  double-click never paints a text selection over them. Program window
  bodies, dialogs and the blocking form opt back in, so their text can
  still be copied. (The prototype does this with `select-none` on the
  desktop and a `[data-selectable]` rule; `prototype-root.tsx`.)
- **The blocking layer** is a modal: `role="dialog"`, `aria-modal`, labelled
  by the form's title, focus trapped inside, Esc ignored, and the desktop
  behind `inert`.
- Start menu: Join's ARIA (`aria-haspopup="menu"`, `role="menu"`, arrow keys,
  Esc back to Start, click-away), wrapped in `<nav aria-label="Console">` so
  the landmark the E2E helper relies on survives.
- The title bar is not a heading, so `getByRole("heading")` finds only the
  page's `h1`, whatever decision 9 picks for the title text.
- Background frames are `inert` and `aria-hidden`, and the last-seen copy is
  in a closed shadow root: screen readers and the Tab key see one live window.
- The Today handle is a `<button aria-expanded aria-controls>` labelled "Show
  Today" / "Hide Today"; Esc closes the open gadget when focus is inside it.
- Gap to close: Join windows move and resize only by pointer. Add keyboard
  maximise/restore (already on a button) and a taskbar-driven window switch;
  keyboard move/resize is optional.
- Reduced motion: no boot, no window-in animation. Join's curated stills must
  win over the blanket rule in `packages/ui/src/styles/globals.css` (see the
  visual-language doc).

### 7. State persistence

- `sessionStorage` key `camp404.os.v1:<campUserId>` holds layout only:
  `{key, programId, lastUrl, rect, z, minimized, scrollTop}`. **Never
  titles, never the last-seen copy**: child titles and page copies carry
  personal data (a respondent's name, meeting, announcement and recipe
  titles, roster rows). A background frame's title comes from
  `matchProgram(lastUrl)`, a generic name with no record data; the page sets
  the real title only while it is focused, in memory.
- On hydrate: drop any record whose `lastUrl` fails `safeInternalPath` or
  `matchProgram`, then `pruneTo` against the fresh manifest, including
  `allowedChildren`. It never holds data and is never trusted as authority.
- Cleared by the sign-out view, and also when the manifest mode changes or the
  session's user id differs from the key's (session expiry, revocation from
  another device, account erasure, a shared device).
- **Form drafts and selections are never stored in the browser**, with one
  exception: the draft autosave in section 5, written only by the four editors
  named there, under its own key, with the same clearing rules. Everything
  else stays out of browser storage: My forms answers (dietary and allergy
  data is `SAFETY_VISIBLE`), the burner profile, the questionnaire runner, the
  builder, and every selection (a selected roster member, whose restore would
  replay an audited read). A background window with any other unsaved input
  relies on `useWindowDirty` to ask first, and on the in-memory draft kept
  across Back (section 5).
- `localStorage` holds one thing: `camp404.os.today-open`, a boolean for the
  Today gadget, per browser.
- **The desktop layout is stored on the server** (decision 14 B, owner,
  2026-09-26), so it follows the member to every device. It is one
  per-member JSONB value holding only `{cells: {itemId: {c, r}}, items:
  [shortcut {id, target} | folder {id, name, items}]}`: program ids, grid
  cells and the folder names the member typed; no titles, no record data, no
  URLs. It is:
  - a schema change in PR C: added to `packages/db/src/schema.ts` and
    generated with `db:generate` (drizzle-kit), never hand-written;
  - checked with Zod on write (the server action refuses anything else, and
    folder names keep their 24-character limit) and again on read, where a
    bad value means the default layout;
  - read with the manifest (no extra round trip) and pruned against it;
  - written from the client through a server action, debounced (one write
    after the member stops moving icons, not one per drop);
  - deleted by account erasure with the member's other rows, and given a
    test-store twin so Playwright can drive it.
  Nothing else about the desktop goes to `localStorage` or the database in
  v1.
- Boot plays at most once per browser session (after sign-in, or on "Continue
  to desktop" when the gates clear). Never under `E2E_TEST_MODE` or reduced
  motion, never in front of a server redirect.

### 8. Performance

The shell is on screen all day, on old laptops and phones in the desert. It
must cost next to nothing when nobody is touching it. Rules (owner,
2026-09-25):

- **Decorative animation pauses** when it cannot be seen: when the tab is
  hidden (`visibilitychange`), when its element is off screen or inside a
  closed or minimised window, and always under `prefers-reduced-motion`. The
  wallpaper beam, the cats' idle frames and the clock cat included.
- **Game loops run only while their window is open, and sleep when nothing
  moves.** INKBLOT and the Shadow Work toy stop their
  `requestAnimationFrame` loop when the window closes or minimises, and
  also when every body is at rest (Jinn asleep, the piece on its stand); a
  pointer event or a window drag wakes them. The prototype now does this
  (commit b09f3ba): the loop stops at rest, the ball is drawn once as an
  image, and cat frames are memoised. It still calls `setState` each frame
  while something moves; the real build should write positions from a ref.
- **No per-frame React re-render of large sprites.** A moving sprite is
  drawn once and moved by writing a transform or a canvas, from a ref, not
  by re-rendering a component tree each frame.
- **Timers are events where possible.** The clock ticks once a minute
  (aligned to the minute), the Jinn peek runs on a long random timeout, and
  nothing polls.
- **Budget.** An idle desktop (no pointer, no typing, windows open) uses
  near-zero CPU: no long tasks and no steady main-thread work. It is
  measured, not assumed: a Playwright check in the E2E job that reads
  Chrome's performance metrics (CDP `Performance.getMetrics`, task and
  script time over a few idle seconds), or a manual check with the
  Performance panel recorded in the PR. Measured on the prototype
  (headless Chromium, 1440x900, main-thread busy time as a share of one
  core, 2026-09-25): empty desktop 3%; Teams folder open with Jinn asleep
  79% before the fix, 4% after; Jinn playing 91% before, 36% after, only
  while something moves. PR C's check starts from these numbers.

## Rejected alternatives

| Option | Why not |
| --- | --- |
| **Look B, Tiled workstation** (prototype) | Owner, 2026-09-25: "way too busy and overstimulating". |
| **Look C, Command deck** (prototype) | Same ruling. Also breaks the calm-desktop rule: live panels on the wallpaper. |
| **Truly live background windows** (decision 3 B): a server function renders every background window's body; all mounted | Relies on server actions returning JSX, which Next barely documents. The router action queue is serial, so background renders queue behind the member's saves. Needs ~50 pages split into loader/view pairs. Mounted windows bring back duplicate DOM and fire mark-read and audited reads for windows nobody sees. Roughly twice the cost. Was option B of decision 3; the owner ruled A on 2026-09-25. |
| **A bare screen for a blocking questionnaire** (the earlier draft: no desktop behind, `<HeldScreen>` hides all chrome) | Owner, 2026-09-25: the form sits on top of everything with the desktop visible behind. The server gates were never the difference, so they stay; only the picture changed (section 1). |
| **A fixed icon order** (the earlier decision 14 A) | Owner, 2026-09-25: icons move like a real desktop and the layout is saved per member. |
| **Empty paused frames** (the earlier decision 3 A) | Safe, but a background window is a title bar over a blank body, so it does not give the owner "several modules open at the same time". Replaced by the last-seen copy. |
| **One window at a time** as the whole plan (one maximised frame, no drag) | Lowest risk, but drops what the owner loves on desktop: windows that drag, stack and resize. Its order (structure first, skin second) is kept. |
| **Parallel / intercepting routes** (`@window`, `(.)program`) | Slots are fixed names, not N user-chosen windows. Secondary windows vanish on every hard load (push, email, refresh). An intercepting copy of ~50 routes. Every slot renders on every request. |
| **An iframe per window** | Blocked by `apps/web/vercel.json:18-20` (DENY, `frame-ancestors 'none'`); loosening it is a clickjacking decision. Each window boots the whole app; Playwright needs `frameLocator` everywhere. |
| **Copy Join verbatim** (one route, all windows client state, one data context) | No deep links, so push, email and gate hrefs break. No per-page server gates, actions or rank-projected privacy. Refresh drops everything. |
| **`cacheComponents` / `<Activity>`** | Hides the previous routes with `display: none` and keeps only 3, so it never shows two windows at once (`preserving-ui-state.md`). Needs every `cookies()` read inside `<Suspense>`, which costs the real 404 and 307 (commit cb8d9d8). Leaves hidden duplicate DOM that breaks non-role locators. |

## Security

- **Hiding an icon is cosmetic.** Every page keeps `requireMemberPage`,
  `captainPageGate` and its `CaptainLock`. Every action keeps
  `captainActionGate` and its re-read inside the transaction
  (`lockSenderReach` in `packages/db/src/broadcasts.ts` for sends). A deep link
  to a program not on the desktop still renders the lock inside a window.
- **Role filtering stays on the server.** The manifest is built on the server;
  the client never receives a rank to decide with, or a program it may not
  open. A program a member may not use is absent from the payload, not
  hidden in CSS. The same holds for tray items, pins and team-folder tools:
  per mode, from the manifest. The member's own rank label and led-team
  names are drawn as text, as today's header chip is.
- **System health for members is a coarse flag.** The server decides what
  leaves it: a non-captain gets `ok` or `warning` and nothing else (no
  service names, counts, error text or job state); only a captain's payload
  carries details, and `/captains/system` stays captain-only. A unit test
  asserts a member's manifest holds no detail field.
- **Saved layouts are not authority.** The layout stored on the server
  (section 7) holds program ids, cells and folder names. It is checked with
  Zod on write and on read, and pruned against the manifest on load; an id
  the manifest does not hold is dropped, never drawn. A member can write only
  their own layout, and a forged write can at most draw an icon for a
  program the member already has.
- **Predicates are not reinvented.** The registry may only call core
  functions (`packages/core/src/access.ts`, `recipes.ts`, `power.ts`,
  `audience-authz.ts`), so a rule changes in one place.
- **Gates stay routes.** No client overlay decides a gate (owner,
  2026-09-16). A blocking questionnaire now draws on top of an inert desktop
  (owner, 2026-09-25), but the overlay is only a picture: every member page
  still runs `requireMemberPage` and redirects to the runner, so removing
  `inert` or the layer in the browser gets a member nowhere. The held
  desktop is built on the server without pins, counts, Today, badges or
  last-seen copies, so it shows nothing live. A member held mid-session is
  caught by the `<HeldScreen>` marker (section 1); until the refresh lands,
  the desktop drops that content on the client, and every page gate still
  redirects to the hold.
- **Private reads stay tied to intent.** Only the focused window mounts and no
  program URL is fully prefetched, so an audited read
  (`auditReadAfterResponse`) fires only when a captain actually opens a
  member. Restoring a session does not re-open member details: background
  frames do not render a page and selection is not restored.
- **The last-seen copy shows only what was already on this screen**, to this
  member, and makes no request. It is kept in memory, never stored, dropped on
  close, prune, sign-out and user change, and blanks `data-os-private`
  elements (ID, passport, bank, safety and captain-notes panels), so a
  captain's background Roster never keeps an ID number on screen. A drift test
  checks each component that renders an `ALWAYS_PRIVATE` or `SAFETY_VISIBLE`
  field carries the marker.
- **The Terminal gets no power the icons do not have.** `open` accepts only
  programs in the member's manifest and answers "not found" otherwise; the
  page it opens runs its own gate anyway.
- **Easter eggs are decorative.** The cats and Shadow Work read no data,
  make no request and open only INKBLOT, which every member has.
- **`sessionStorage` is layout only**: no titles, `lastUrl` validated,
  pruned by the manifest including child programs, cleared on sign-out, mode
  change or user mismatch. The draft autosave of the four editors (section 5)
  is the one bounded exception; no selection is ever stored.
- **`?next=`** is a redirect path: it goes through `safeInternalPath` and
  `matchProgram`, with tests that refuse external, protocol-relative
  (`//evil`) and backslash targets, route handlers and `/auth/*`. The proxy
  overwrites any client-sent `x-camp-path`.
- **No new secrets, env vars or cron.** The one schema change is the
  per-member desktop layout (decision 14 B, PR C). If a rollout flag is added
  it goes in `.env.example` and `turbo.json` `globalEnv`.

## Testing strategy

**Unit (Vitest)**

- `@camp404/os` reducer: Join's existing tests move with it, plus
  `upsertUrl`, `hydrate`, `reclamp`, `pruneTo` (including child programs).
- Testing Library: Esc inside an open Select closes the Select, not the window.
  Break the guard on purpose once and watch it go red.
- `buildProgramManifest` as a pure function over plain facts, like
  `home.test.ts`: one fixture per profile (pending applicant, rejected
  applicant, member, lead of kitchen, lead whose only led team is archived,
  captain), seeded from the `Team` and rank constants, never string literals.
  The applicant fixture asserts no pins and no system-health item in
  restricted mode; the plain-member fixture asserts a coarse health flag with
  no detail field; the held fixture asserts no pins, counts, Today or badges.
  Team folders: a member of two teams who leads one gets two folders, the
  led one first and tagged; a Finance member who is not a captain gets no
  Payments in the Finance folder.
- Icon grid (pure module): the default layout (group columns on the left,
  team folders on the right, a long group wrapping), snap, the nearest free
  cell for a displaced icon, fit after a resize, drop into a folder, and
  pruning of a saved layout against the manifest.
- The test-store and real memberships reads agree for a lead persona.
- Drift tests:
  - every `(console)/**/page.tsx` maps to a program in `matchProgram` (a glob);
  - every `(console)` top-level segment is covered by the proxy matcher;
  - each registry entry's bar equals its page's `captainPageGate` /
    `requireMemberPage` bar;
  - each action listed under Staleness calls `revalidateManifest()`;
  - no `prefetch={true}` or `router.prefetch` in the os components.
  Each must go red when deliberately broken.
- `?next=` cases: open-redirect targets refused, a spoofed `x-camp-path` is
  ignored, `next` never points at a route handler or `/auth/*`.
- `sessionStorage` hydrate drops invalid `lastUrl`s and never reads a title.
- Last-seen copy: built from a fixture page, it has no scripts, no live input
  values, blanks `data-os-private`, sits in a closed shadow root, and is
  dropped on close, prune and user change.
- Console terminal commands: `open` refuses a program outside the manifest
  with the same text as an unknown one; `ls` lists by group. Join's terminal
  tests keep passing against the shared engine.
- Today gadget: closed on first visit, the handle toggles it, the choice
  survives a reload.

**PGlite (`packages/db/src/__tests__/_harness.ts`)**

- The single memberships read and the cached settings read, against real
  queries, including the year rollover (lead programs vanish until captains
  reassign).
- Keep reads out of open transactions: PGlite has one connection.

**E2E (Playwright, `next dev`, `E2E_TEST_MODE=1`, one worker)**

- Rewrite `apps/web/tests/e2e/lib/console-nav.ts` (`openConsoleNav`,
  `goViaConsoleNav`, `navEntry`, `consoleNavGroups`) against the Start menu
  and folders. The 5 other specs that import it keep working.
- Replace `console-nav.spec.ts` with `os-shell.spec.ts`: icons per profile
  (assert a present heading before any absence), Start menu keyboard, open two
  windows, switch, close focuses the next window, **what Back does after a
  close** (the rule in section 3), refresh restores the stack, Esc inside a
  Select, the dirty guard, a 404 status inside a window, a background window
  shows its last-seen copy and `getByLabel` still matches once, the Today
  handle, the Terminal `open` command, icon select, box select, drag and
  snap, "Line up icons", a shortcut and a folder made from the right-click
  menu (and from Shift+F10), the layout surviving a reload, team folders on
  the right with the LEAD tag, a held member on a hard load (the form on top,
  the desktop behind inert, Esc does nothing, no tray or pins), **a member
  held mid-session** (signed in on the desktop, a blocking send is issued,
  they click an icon, and the runner shows on top with the desktop inert and
  no tray), a rejected applicant opening `/notifications` gets no desktop,
  the phone home screen (groups, the My teams row, no member folders, a
  folder sheet, a full-screen program with Back/Close, the bottom bar, Today
  as a sheet) and the phone stack plus Back at 360 and 390 px.
- An idle-desktop check (section 8): a few seconds with no input and two
  windows open, main-thread task time read from Chrome's metrics, under the
  budget.
- `anon-routes.spec.ts`: a signed-out visit to `/notifications`,
  `/announcements/<id>` and `/questionnaires/<id>` lands on
  `/auth/sign-in?next=…` and returns there after sign-in.
- Update `home.spec.ts` where it asserts the "Your modules" grid.
- Most other specs navigate by URL (`page.goto`, `toHaveURL`, level-1
  headings) and should survive unchanged, because URLs and `h1`s do not move,
  and the window frame is not a dialog, so the 25 `getByRole("dialog")`
  locators keep meaning Radix modals.
- The nightly `mobile-360` project (`apps/web/playwright.config.ts:50-53`)
  must pass.
- `tests/e2e-db` (forbidden-matrix) stays the proof that gates still refuse.
- No E2E cover today, and still none after: the questionnaire runner and
  completion page (beyond the held-mid-session case), builder, results, cycle,
  `/setup`, audit with data. Each PR says so.

## Risks

- **Stale desktop for other members.** `revalidateManifest()` fixes only the
  actor's own desktop. Members whose rank, teams, approval or cycle changed
  because of someone else converge on their next hard load, a visibility
  refresh, or the next time a page gate refuses them (which triggers
  `router.refresh()`). An action that changes the actor's own inputs and
  forgets `revalidateManifest()` leaves wrong icons; the call-site drift test
  catches it.
- **A last-seen copy can be out of date.** It is a picture of the past, not
  live data. Mitigation: the "Last seen 14:02" line on every copy, and a
  click refreshes it. Live counts (inbox, pins) live in the tray and the Today
  gadget, not in background windows.
- **A copy can look broken.** Canvases, images still loading and portalled
  content (an open Select) do not copy. Mitigation: copy once the page is
  idle; fall back to the icon and name when the body is over a size limit,
  or when the total snapshot budget (section 3) evicts it.
- **Background windows lose unsaved input** unless the page registers
  `useWindowDirty`. None of the meeting, meal-plan, Tiptap source and
  announcement editors has a leave guard today, so `useWindowDirty` (and the
  draft autosave) for those four moves into PR C: no release ships
  windows that silently drop drafts.
- **Every switch is a full server render.** Dynamic routes are not prefetched
  and prefetching is forbidden above, so on a desert phone a switch can take
  seconds. The pending state on the pressed control is the only feedback.
- **A saved layout is one more write path.** The layout is on the server
  (decision 14 B), so it follows the member, but a buggy client could write
  a broken one. Mitigation: Zod on write and read, a bad value falls back to
  the default layout, and nothing in it matters for access, so the worst case
  is "Line up icons".
- **The held desktop could show more than it should** if a later change
  adds a live field to the manifest and forgets held mode. The held fixture
  in the manifest tests guards it.
- **Animation cost.** Cats, Shadow Work and the wallpaper can keep a
  laptop's fan running if a loop never sleeps. Section 8's rules and the
  idle check guard it.
- **Viewport breakpoints inside windows.** Pages use `md:`/`lg:`, which read
  the browser width, not the window's. A narrow window on a wide screen shows
  the desktop layout. Mitigation: open wide programs maximised until they move
  to `@container`.
- **Portals and sticky layouts.** 25 files use Radix portals, 10 use sticky or
  fixed positioning. Needs the z band and a per-window scroll container.
- **Duplicate DOM** if anyone later "keeps windows alive". The rule is one
  mounted body; the last-seen copy stays inert HTML in a closed shadow root.
  AGENTS.md gets it as a gotcha, with the no-full-prefetch rule.
- **`proxy.ts` is new surface** on every page request: a Node invocation each
  time on Hobby. Keep it to overwriting one header; PR B measures the cost and
  falls back to route literals if it is material.
- **Design authority.** The owner ruled the Classic desktop on 2026-09-25
  (decision 1), which reverses the 2026-09-17 AfrikaBurn ruling in AGENTS.md
  "Design". Each control's skin still waits for his screenshot approval
  (PR D). Kitchen windows still need layout approval first.
- **Neon free tier.** More reads per request would hurt. The manifest must
  reduce them (camp_settings 3+ → 1, memberships 2-3 → 1). PR B measures it.
- **Deploy budget.** 100 deploys per 24 h on Hobby: 4 large PRs plus one
  follow-up, never stacked, pushes batched.

## Doc changes this triggers

Fixed in the same PR as the code, per the repo's "doc and code disagree" rule:

1. AGENTS.md "Design": `[CORRECTION 2026-09-25]` replacing the AfrikaBurn
   ruling with the Classic desktop (decision 1, ruled) and the calm-desktop
   rule, and the "copy AfrikaBurn's nearest equivalent for a new surface" rule
   per decision 12. The landing-page exclusion stays.
2. AGENTS.md "Shell": the header, `lib/console-nav.ts` and the Menu sheet
   become the desktop, `lib/programs.ts` and the Start menu. "A new page goes
   into a menu" becomes "register it in `program-routes.ts` and `programs.ts`".
3. AGENTS.md "Loading" and the no-`loading.tsx` gotcha: "the pressed nav item"
   and "the console header's `next/link`" become the launcher and taskbar. Add
   "no per-window Suspense", "only one window body is mounted (a background
   window shows an inert copy)", "never `prefetch={true}` or
   `router.prefetch` on a program URL" and "a blocking questionnaire draws
   over an inert desktop, but the gate is still the server redirect".
4. The E2E helper note: now drives the Start menu.
5. AGENTS.md workspace layout: `@camp404/os` (window engine, `/terminal`,
   `/inkblot`).

## Future, out of scope: Ask 404

Not a phase and not planned work. The owner raised it as "maybe later"
(2026-09-25): a helper program where a member asks questions about the camp,
by text or by voice.

- **Voice to text** would reuse what is already pinned: Groq's
  `whisper-large-v3-turbo` in `apps/web/lib/groq.ts`, behind
  `apps/web/app/api/voice/transcribe/route.ts`, with the recorder in
  `apps/web/components/voice/use-voice-recorder.ts`. (The owner said "Grok";
  the app's speech model is Groq's Whisper, so this assumes Groq.)
- **The answer** would come from Claude, using a model already pinned in the
  repo and a new prompt versioned in `@camp404/ai-prompts` (AGENTS.md: never
  swap a model or edit a prompt in place).
- **Privacy constraints, which decide whether it can be built at all:**
  - Only data the asking member may already read goes into the prompt,
    filtered on the server (`MEMBER_FIELD_READERS`, `rosterForViewer`, the
    same projections the pages use). Never filtered by asking the model to
    hold back.
  - `ALWAYS_PRIVATE` fields (ID, passport, bank) never go into a prompt, for
    anyone, captains included.
  - `SAFETY_VISIBLE` fields only for their readers (the member, team leads,
    captains), and an answer that used another member's safety data writes
    the same `audit_log` row opening it would (`auditReadAfterResponse`).
    Captain notes never reach a non-captain.
  - Sending member data to Anthropic, and audio to Groq, is a POPIA processing
    choice the owner makes before any build. Audio is not stored; whether
    questions and answers are kept, and for how long, is his call too.
  - Spend: each question is a paid call. It would need a per-member limit
    through `action_rate_limit`, and it runs at the member's action (no cron).

## Decisions

Open questions for the owner. Each has a recommendation. Decisions 1, 3, 8
and 14 are ruled (14 keeps one small open question). [CORRECTION 2026-09-26]
Decisions 2, 7 and 11 are ruled too (owner, 2026-09-26).

1. **Does the console leave the AfrikaBurn look (2026-09-17 ruling) for 404
   OS?** **Ruled (owner, 2026-09-25): yes, the Classic desktop (look A of the
   prototype); the skin follows Join.** Looks B and C were rejected as too
   busy. It still ships staged: structure first on current tokens (PR C), the
   skin (PR D) only after the owner approves screenshots of each control.
2. **Programs a member cannot use: hidden or shown locked?** **Ruled (owner,
   2026-09-26): A, hidden.** A program or folder a member cannot use (the
   Captains folder for a plain member, Recipe review for a non-Kitchen lead)
   is not on their desktop; a direct URL still shows the lock. But every
   member can see every team's dashboard: all teams stay in the Teams folder
   and each team page opens for every approved member, read-only, with no
   authority there (the actions on it keep their own gates).
3. **Windows you are not looking at: what do they show?** **Ruled (owner,
   2026-09-25): A, last-seen windows.** A background window shows a frozen
   copy of how it last looked, "Last seen hh:mm. Click to refresh." The
   options and evidence are kept below as the record.
   The owner's favourite part of the Classic desktop is having several
   modules open at the same time. The earlier recommendation (empty paused
   frames) did not give him that: every background window would be a title
   bar over a blank "paused" body.
   What Next 16.3.4 allows (checked in
   `apps/web/node_modules/next/dist/docs`, and `apps/web/next.config.ts`):
   - one route renders at a time. `cacheComponents` is off here; turned on, it
     keeps up to 3 old routes in `<Activity mode="hidden">`, which is
     `display: none` (`01-app/02-guides/preserving-ui-state.md`). It keeps
     state for Back; it never shows two windows at once. It would also force
     `cookies()` reads into `<Suspense>` (`migrating-to-cache-components.md`),
     which costs the real 404 and 307 (commit cb8d9d8);
   - parallel routes are fixed named slots and are lost on a hard load
     (`03-file-conventions/default.md`);
   - a layout's `children` is the router's placeholder for the current
     segment, so a desktop cannot keep an old page's React tree and show it
     again elsewhere (from how the App Router renders layouts; not checked in
     the Next source, and the PR C spike should confirm it).
   A: **Last-seen windows.** A background window shows a frozen copy of its
   body as it last looked (inert HTML in a closed shadow root, "Last seen
   14:02. Click to refresh."). Clicking it renders it fresh behind its gate.
   The copy is memory only, blanks private fields, and makes no request, so
   mark-read, audited reads and polls still run only for the window in front
   (section 3). After a hard load, background windows show icon and name until
   opened. About 2 extra days in PR C.
   B: **Truly live windows.** Every open window keeps rendering and updating.
   Needs a per-window server render (server actions returning JSX, a serial
   router queue, ~50 pages split into loader and view) or new route handlers
   for client fetching. Brings back duplicate live DOM, and fires mark-read,
   audited roster reads, `resetStaleRuns`, the recipe poll and the microphone
   for windows nobody is looking at. Roughly twice the cost of the shell.
   *Ruled A.* Nothing in the installed Next shows two routes at once, so B
   would mean building a second rendering path for every page. A gives the
   owner what he sees in the prototype (several programs open, each showing
   its content) and keeps every safety property of the paused design. Most
   console pages are read-mostly, so a copy looks the same as live until the
   data changes, and live counts already sit in the tray and the Today
   gadget.
4. **Which magenta fills the focused title bar and main buttons?** Join's
   near-white-on-magenta title bar measures about 3.6:1, an AA fail for small
   text, so it is not offered.
   A: Join's `oklch(0.65 0.27 340)` with `os-bg` (dark) text, 5.3:1.
   B: the console's `oklch(0.72 0.2 345)` with the same dark text, 7.2:1.
   *Recommend A* (the visual-language doc's default, sections 2.3 and 12):
   it keeps Join's colour and passes AA; B if you want more margin.
5. **Do gate screens wear the OS look?** The shared shells do not map onto the
   gates one to one:
   - `AuthShell` is the shell of the sign-in pages themselves
     (`app/auth/[path]/page.tsx:52-86`), `/signup/required` and `/mcp/connect`
     (`connect-client.tsx:65,104`);
   - `GateScreen` is used by `/pending-approval`, the onboarding gate's intro
     only (`app/onboarding/questionnaire/gate.tsx:26`), the setup wizard,
     `app/not-found.tsx` and `ErrorRecovery`'s standalone frame;
   - the blocking questionnaire runner (`/questionnaires/[activationId]`) and
     the onboarding wizard itself use neither.
   A: restyle `GateScreen` (pending approval, onboarding intro, setup, root
   404/error) and split `AuthShell` so `/signup/required` changes while the
   sign-in pages keep today's look; restyle the runner and onboarding wizard
   as separate work. A2: as A, but let the sign-in pages change too (restyle
   `AuthShell` whole). B: leave them all as they are.
   *Recommend A,* in the skin PR, with the runner and wizard listed as their
   own items. Routes and gates do not change.
6. **Should the boot sequence play?**
   A: once per browser session, short, skippable; never in tests or reduced
   motion. B: never.
   *Recommend A.*
7. **Window cap and document reuse.** **Ruled (owner, 2026-09-26): B, no
   cap.** Each document (`/meetings/<id>`) is its own window, and nothing
   closes a window but the member. Last-seen copies (decision 3) share one
   total snapshot budget (section 3): over it, the least recently focused
   windows drop their copy and show their icon and name, and stay open. PR C
   measures memory with many windows open.
8. **Do a member's own teams also sit on the desktop, or only in the Teams
   folder?** **Ruled (owner, 2026-09-25): on the desktop, as team folders.**
   Every team the member is in this year is a folder on the right-hand side
   ("Kitchen team"), led teams first and tagged LEAD, holding the team page
   and that team's tools; every team is still in the Teams folder. On the
   phone, a "My teams" row. This replaces the earlier option A (own teams as
   plain icons in the Me group). Which tools each team folder holds is
   shaped with each lead (section 4).
9. **Window titles.** Mostly settled by the owner's feedback (2026-09-25:
   "some of the terminology might be a bit too geeky"): icons, folders, the
   Start menu, the taskbar and the accessible name all use plain English
   names (Roster, Family tree, Invites). What is left:
   A: plain names only; file names live in the Terminal.
   B: plain name, plus the file name as a quiet suffix in the window title
   chip (`Roster  roster.db`, muted mono, `aria-hidden`, hidden on phones).
   *Recommend B* on desktop: it keeps a little of the Join flavour where it
   costs nothing, and nothing a member must read depends on it. A if the
   owner finds even that geeky. Either way the title bar is not a heading.
10. **Body font: Montserrat or Inter?**
    A: Montserrat 500 (already loaded and tuned). B: Inter (matches Join and
    the landing page).
    *Recommend A* (visual-language doc, section 3).
11. **Driver programs.** You named driver status as an input.
    A: a My lift program (the member's own car or lift, from `getMyLift` in
    `lib/lifts.ts`), shown to a member with `intends_to_drive` or an assigned
    lift, with the `getMyLift` test-store twin added in PR B as AGENTS.md
    requires. B: no driver program in this work; the deferral is recorded
    here.
    **Ruled (owner, 2026-09-26): A.** Built in PR B: the route is `/lift`
    (`requireMemberPage`), and the manifest offers it to a member who drives
    this year or has a seat in a car (`getMyLift` is not null).
12. **AGENTS.md's "copy AfrikaBurn's nearest equivalent for a new surface"
    rule.**
    A: replace it with "copy the nearest existing program's window composition
    and restyle with `--os-*` tokens; do not invent a design". B: keep it as
    is.
    *Recommend A,* since decision 1 is ruled A.
13. **Does a Finance lead get anything money-related?** Payments
    (`/captains/payments`) is captain-only today.
    A: no change in this work. B: a Finance program for the Finance lead now.
    *Recommend A;* a Finance program is its own feature.
14. **Can members rearrange icons?** **Ruled (owner, 2026-09-25): yes.**
    Icons move like a real desktop (select, box select, drag on a snapping
    grid, "Line up icons"), members make their own folders and shortcuts
    (desktop only), and the layout is saved per member (section 4).
    **Where the layout is stored: ruled (owner, 2026-09-26), B, on the
    server.** A per-member JSONB value (icon positions, member folders and
    shortcuts), Zod-checked on write, so it follows the member to every
    device. It is a schema change: a new migration generated by drizzle-kit
    in PR C, one more read on the desktop render (folded into the manifest
    read), writes debounced from the client through a server action, and
    erasure deletes it with the member's other rows. The prototype's
    `localStorage` store is replaced.

Delivery order and exit criteria per PR are in
`docs/plans/2026-09-25-404-os-console-migration.md`: A (`@camp404/os` with
`/terminal` and `/inkblot`, Join moves onto it), B (manifest, new cached reads
with test-store twins, `?next=`, `getMyLift` twin, no visible change), C
(desktop on current tokens: the movable icon grid, right-click menus, member
folders and shortcuts, team folders, Today handle, last-seen windows,
Terminal, the phone home screen, the blocking layer and held marker, dirty
guards and draft autosave for the four editors, the idle-CPU check), D (skin
and hidden cats, after decisions 4, 5, 6, 9, 10, 12), E (window-width
layouts). Then, one team at a time, the bespoke team programs and each team
folder's tools.
