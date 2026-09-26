# 404 OS console: migration plan

Date: 2026-09-25. Status: proposal, nothing built yet. The owner picked the
Classic desktop from the three-look prototype on 2026-09-25 (decision 1,
ruled), then reviewed it again the same day and ruled decisions 3, 8 and 14
and several details (design doc, "The owner's second review"). His feedback
is folded in below. The prototype (branch `prototype/404-os-captain-desktop`,
route `/prototype/captain-desktop` in the Join app) is throwaway: every PR
here writes its piece again properly, with tests, and copies no prototype
code.

This is the delivery plan. It covers how the signed-in console (`apps/web`)
turns into a 404 OS desktop, in the style of `apps/join`. The companion docs:

- Design (architecture, routing, the manifest; the source of truth):
  `docs/specs/2026-09-25-404-os-console-design.md`
- Program catalogue (every page, its gate, its program name):
  `docs/specs/2026-09-25-404-os-program-catalogue.md`
- Visual language (tokens, chrome, controls, icons):
  `docs/specs/2026-09-25-404-os-visual-language.md`
- This plan: `docs/plans/2026-09-25-404-os-console-migration.md`

The short version: **the URL is the focused window.** Every page keeps its
path, its gate and its status codes. The header is replaced by a calm desktop
with plain names: icons that move like a real desktop (default: Me, Camp and
Captains columns on the left, the member's team folders on the right).
Only the focused window's page is mounted; other open windows show a frozen
copy of how they last looked and re-render fresh when focused (decision 3 A,
ruled). A blocking questionnaire draws on top of an inert desktop; the
server gates do not change. Phones get a home screen of big icons, not a
shrunk desktop.

## 0. Owner decisions, and which PR each one blocks

The design doc lists 14 decisions, with options and recommendations. The
numbers here are the same. Decisions 1, 2, 3, 7, 8, 11 and 14 are ruled. PR A (the
engine, proved on Join) needs none of the open ones.

| # | Question | Options | Needed before | Recommendation |
|---|----------|---------|---------------|----------------|
| 1 | Leave the AfrikaBurn look (2026-09-17 ruling) for 404 OS? | **Ruled 2026-09-25: yes, the Classic desktop; the skin follows Join.** Tiled workstation and Command deck rejected as too busy | done | Staged anyway: structure on current tokens first (PR C), each control's skin only after you approve its screenshot (PR D) |
| 2 | Programs a member cannot use: hidden or locked? | **Ruled 2026-09-26: A, hidden** (folders too). Every member still sees every team dashboard, read-only | done | n/a |
| 3 | Windows you are not looking at: what do they show? | **Ruled 2026-09-25: A, last-seen windows**, a frozen copy of the body, "Last seen hh:mm. Click to refresh.", fresh on focus | done | n/a |
| 4 | Which magenta fills the focused title bar and main buttons? | A: Join's `oklch(0.65 0.27 340)` with dark `os-bg` text, 5.3:1. B: the console's `oklch(0.72 0.2 345)` with the same dark text, 7.2:1. (Near-white on magenta, about 3.6:1, is not offered) | PR D | A |
| 5 | Do gate screens wear the OS look? | A: restyle `GateScreen`; split `AuthShell` so `/signup/required` changes and the sign-in pages do not; runner and onboarding wizard as separate items. A2: as A, sign-in pages too. B: leave all | PR D | A |
| 6 | Should the boot sequence play? | A: once per browser session, short, skippable; never in tests or reduced motion. B: never | PR D | A |
| 7 | Window cap and document reuse | **Ruled 2026-09-26: B, no cap**; each document its own window | done | n/a. PR C measures memory with many windows open |
| 8 | Own teams on the desktop, or only in the Teams folder? | **Ruled 2026-09-25: team folders on the right-hand side** ("Kitchen team"), led first and tagged LEAD, holding the team page and its tools; a My teams row on the phone | done | n/a. The tools per team are shaped with each lead |
| 9 | Window titles | Plain names settled by your feedback. A: plain names only. B: plus a quiet file-name suffix on the title chip | PR D | B on desktop |
| 10 | Body font | A: Montserrat 500. B: Inter | PR D | A |
| 11 | Driver programs | **Ruled 2026-09-26: A**, a My lift program (`/lift`) and a `getMyLift` test-store twin in PR B | done | n/a |
| 12 | AGENTS.md "copy AfrikaBurn's nearest equivalent" rule | A: "copy the nearest existing program's window composition, restyle with `--os-*` tokens". B: keep it | PR D | A, since decision 1 is A |
| 13 | Anything money-related for a Finance lead? | A: no change in this work. B: a Finance program now | none (A changes nothing) | A |
| 14 | Can members rearrange icons? | **Ruled 2026-09-25: yes**, and **2026-09-26: stored on the server** (a per-member JSONB value; a drizzle-kit migration in PR C; erasure deletes it) | done | n/a |

Settled by the owner's feedback (2026-09-25), no decision needed:

- the desktop stays calm: no dashboards or tickers on the wallpaper;
- the Today gadget is closed by default, opened from a right-edge handle, the
  choice remembered per browser;
- icons grouped by default (Me, Camp, Captains columns) with plain names;
- a phone version of the Classic desktop is required (PR C);
- the Terminal stays, and it and INKBLOT are shared with Join (PR A);
- hidden cats (PR D or later);
- team programs are bespoke, shaped with each lead after the shell (section 7);
- Ask 404 is future, out of scope (section 8).

Settled in the second review (owner, 2026-09-25), no decision needed:

- right-click menus on programs, the empty desktop, member folders and
  shortcuts; shortcuts show a small arrow; keyboard access (Shift+F10, the
  Menu key) in the real build (PR C);
- the account chip says "Leads N teams" (a name only for exactly one), the
  full list on hover (PR C);
- the system-health tray icon for every accepted member: a coarse flag for
  members, details for captains (PR B computes it, PR C draws it);
- the Start menu above everything but blocking forms and dialogs, at most
  half the screen high on desktop (PR C);
- a blocking questionnaire on top of everything, the desktop visible but
  inert behind it; server gates unchanged (PR C);
- no text selection on the desktop chrome; windows and dialogs keep it
  (PR C);
- only two cats, Jinn and Prince; easter eggs never labelled; Shadow Work
  and Jinn in the Teams folder (PR D or later);
- the shell stays cheap when idle (design doc, section 8; PR C measures).

Also standing: Kitchen windows need a layout approval before any Kitchen UI
work (memory: `kitchen-noble-notations-direction.md`). PR C only wraps the
existing Kitchen pages in a window frame and changes nothing inside them; say
so in the PR and get a yes on the screenshots anyway.

The native shell is also open: [UNRESOLVED 2026-09-25] the owner ruled a thin
Capacitor WebView (2026-09-16), but `apps/mobile/capacitor.config.ts` still
sets `webDir` and no `server.url`. The owner picks: switch it to `server.url`
in this work, or leave native out. No PR here depends on it.

## 1. Shape of the delivery

Four large PRs and one follow-up. Never stacked: each merges before the next
opens. Reasons, from the owner's standing rules:

- each open PR holds a Neon branch (`schema-migration` job, and AGENTS.md's
  "branches limit exceeded" note);
- each push is a Vercel preview, and Hobby allows 100 deploys per 24 h, so
  batch pushes;
- the owner prefers a few big PRs to long stacks.

| PR | Title (Conventional Commit) | Visible change | Effort |
|----|-----------------------------|----------------|--------|
| A | `feat(os): lift the 404 OS engine and terminal into @camp404/os, and INKBLOT into @camp404/games, so Join and the console share them` | None (Join identical) | 3–4 days |
| B | `feat(web): one server-built program manifest, and deep links survive sign-in` | None: header and Home render the same. Only the sign-in return changes | 3–4 days |
| C | `feat(web): the console becomes a calm desktop, with a phone home screen` | The whole shell | 14–18 days (about 9 E2E spec files change). The movable icon grid, right-click menus, member folders and team folders added about 3 days to the earlier 11–14 |
| D | `design(ui): the 404 OS skin, program icons, gate screens and hidden cats` | The look | 6–9 days, plus owner review rounds |
| E | `feat(web): windows fit their own width` | Wide pages in narrow windows | 3–5 days |

Effort is working days for one person with an agent, including tests and the
local CI gate. It is an estimate, not a measurement.

[CORRECTION 2026-09-26] PR C adds one migration: the per-member desktop
layout (decision 14 B). Otherwise no PR changes the schema, adds a migration, adds a cron job or adds an env var
(unless the owner wants the rollout flag in section 5; then it goes into
`.env.example` and `turbo.json` `globalEnv`, per AGENTS.md).

## 2. The phases

### PR A: the engine, proved on Join

**Why first.** It is useful whatever the decisions say. Join already has a
tested window manager and Playwright smoke suite (`e2e-join` job,
`.github/workflows/ci.yml:255`), so moving Join onto the package proves the
package before `apps/web` touches it.

**Files.**

- New `packages/os/` (`@camp404/os`), picked up by `pnpm-workspace.yaml`'s
  `packages/*` glob; add `lint`, `typecheck`, `test` scripts so Turbo fans out
  to it.
  - `src/window-manager.ts`: from `apps/join/lib/window-manager.ts` (217
    lines). Generic `wmReducer<K extends string>` over instance keys instead of
    the closed `AppId` union. New actions: `upsertUrl`, `setTitle` (in memory
    only), `hydrate`, `reclamp`, `pruneTo(allowedIds)` (top-level and child
    program ids).
  - `src/os-window.tsx` (`OsWindowFrame`): from
    `apps/join/components/os/os-window.tsx`. Changes:
    - Drawn as `<section aria-labelledby=… aria-roledescription="window">`, a
      labelled region, **not** `role="dialog"` as in Join. The accessible
      name is the plain program name; the title bar is not a heading.
      [CORRECTION 2026-09-26] Not a heading by default. Join's window bodies
      start at `h3` under the title's `h2`, so Join passes `titleHeading`
      and keeps its `h2`; the console leaves it off.
    - Esc. Today any Escape that bubbles up closes the window
      (`apps/join/components/os/os-window.tsx:123-128`), with no
      `defaultPrevented` check. React portals bubble through the component
      tree, so dismissing a Radix Select inside a window would also close the
      program. New rule: close only when `!e.defaultPrevented` and the target
      is inside the window's own DOM node.
    - Drag from the title bar only, throttled with `requestAnimationFrame`,
      positioned with `left`/`top` (never `transform`, which breaks dnd-kit and
      Radix popover coordinates).
    - The body is its own scroll container and a CSS `@container`, keyed by
      instance so one window's `scrollTop` never carries into another.
  - `src/taskbar.tsx`, `src/start-menu.tsx` (wrapped in
    `<nav aria-label="Console">`, so the landmark the E2E helper uses
    survives), `src/desktop-icon.tsx`, `src/icon-group.tsx`,
    `src/folder-window.tsx`, `src/use-phone.ts`, `src/boot.tsx`,
    `src/use-window-dirty.tsx` (a `.tsx`: it holds the providers).
  - **Terminal, subpath `@camp404/os/terminal`** (owner, 2026-09-25: the
    terminal and the game "should be their own package so we can share
    things between both of them"). The terminal is an OS part. Moves:
    - `apps/join/lib/terminal.ts` splits in two. The engine (parse a line,
      dispatch to a command table, `TermLine`, `TermResult` generic over the
      app's program key, `PROMPT`, history) goes to
      `packages/os/src/terminal/engine.ts`. Join's commands (fee, captains,
      apply, `ls teams|perks`, `cat`, its easter eggs), which import Join's
      fee, content and team data, stay in
      `apps/join/lib/terminal-commands.ts`.
    - `apps/join/components/os/windows/terminal.tsx` becomes
      `packages/os/src/terminal/terminal-window.tsx`, taking the command
      table and the welcome lines as props instead of `useJoinData`.
    - `apps/join/lib/terminal.test.ts` splits the same way: engine tests move
      to the package, command tests stay in Join.
  - `package.json` `exports`: `"."`, `"./terminal"`, and the CSS file below.
- **New package `packages/games`** (`@camp404/games`; owner, 2026-09-25:
  "we're actually gonna be hiding a number of games in the future, it might
  be worth having them in a games package, then the OS parts are their own
  package"). Every hidden game and toy lives here, one folder and one
  `exports` entry each; the OS package never imports it (the games package
  depends on `@camp404/os` for its CSS, never the other way). Most games are for the
  main app only (owner, 2026-09-25); Join imports only
  `@camp404/games/inkblot`.
  - **INKBLOT, `@camp404/games/inkblot`**:
    - `apps/join/lib/inkblot.ts` and `inkblot.test.ts` to
      `packages/games/src/inkblot/game.ts` (+ test), unchanged;
    - `apps/join/components/os/inkblot-sprites.ts` and `inkblot-cat.ts` to
      `packages/games/src/inkblot/`; the cat frames are also what the
      console's hidden cats draw (PR D);
    - `apps/join/components/os/windows/inkblot.tsx` and `inkblot-win.tsx` to
      `packages/games/src/inkblot/`, with Join's `INKBLOT` copy
      (`apps/join/lib/content.ts`) passed in as a prop. The wall photos'
      file names and places stay in the package for now (only the base URL is
      a prop, Join serves them from `apps/join/public/inkblot/`). Before PR C
      or D shows the game in `apps/web`, pass the frame list in as a prop or
      move the images into the package, and record which.
  - `@camp404/games/cats` and `@camp404/games/shadow-work` are created in PR
    D (the console's hidden cats), not here; PR A only makes the package and
    moves INKBLOT, so Join keeps working.
  - Wiring in Join: `transpilePackages`, the game's own CSS file (which
    carries its Tailwind `@source` line), and a `vitest.config.ts` in the
    package. Games load with `next/dynamic`. On Join this is a change from
    main, where INKBLOT was in the first bundle: the first time the game opens
    the window shows the game's background until its chunk arrives. Join's
    terminal fetches the chunk when it opens, so the `jinn-is-best` command
    normally finds it ready. [CORRECTION 2026-09-26] This
    said "in both apps"; `apps/web` imports nothing from either package until
    PR C, so its wiring moves there.
  - Theme only through `--os-*` CSS variables. Join does not depend on
    `@camp404/ui` (`apps/join/package.json`), and the package must not force it
    to.
- `apps/join/components/os/*.tsx` and `apps/join/lib/window-manager.ts`:
  import from `@camp404/os`; the terminal window imports from
  `@camp404/os/terminal` and INKBLOT from `@camp404/games/inkblot`; Join-only content (its other windows, pixel icons, its terminal
  commands, join data) stays in `apps/join`. The prototype route
  (`apps/join/app/prototype/captain-desktop`) is not moved; delete it in this
  PR or leave it, as the owner prefers. `apps/join/app/globals.css` maps its
  `os-*` tokens onto the package variables.
- Wiring, or the package builds but renders unstyled. [CORRECTION
  2026-09-26] This listed `apps/web` too. The web app imports nothing from
  `@camp404/os` or `@camp404/games` until PR C, so its wiring (the
  dependency, `transpilePackages`, the CSS imports) moves to PR C. PR A wires
  Join only:
  - `transpilePackages`: add `@camp404/os` and `@camp404/games` in
    `apps/join/next.config.ts` (today only types and core).
  - Tailwind v4 scans only the consuming app, so without an `@source` line the
    package's classes are purged. Each package ships a CSS file that carries
    its own `@source` line, its `--os-*` theme mapping and its animations
    (`@camp404/os/styles.css`, `@camp404/games/inkblot/styles.css`), and
    `apps/join/app/globals.css` imports both after `tailwindcss`.
  - `packages/os` devDependencies for the Esc test: `vitest`, `jsdom`,
    `@testing-library/react` (the versions `packages/ui` and `apps/web`
    already pin) and a Radix Select for the fixture, plus a `vitest.config.ts`
    with `environment: "jsdom"`. Join has none of these today and does not
    need them.

**Tests.**

- `apps/join/lib/window-manager.test.ts` moves to
  `packages/os/src/window-manager.test.ts`, plus cases for the new actions
  (`pruneTo` drops a key, including a child program; the next window is on
  top because `topWindow` reads the highest z, so the DOM focus hand-down is
  tested in PR C where the shell calls `pruneTo`;
  `reclamp` pulls a window back on screen).
- New Testing Library test: Esc inside an open Radix Select closes the Select,
  not the window. Break the guard on purpose and watch it fail (AGENTS.md
  "Verification"). Radix both prevents the Escape and sends it from a
  portal, so this test goes red only with both checks removed; a portal test
  and a `preventDefault` test pin each check alone.
- `FolderWindow` (no Join caller yet) gets a small render test. The taskbar,
  Start menu, boot screen, icon group and `usePhone` have no package tests;
  Join's Playwright suite covers them through Join.
- Terminal engine and INKBLOT game tests pass from the package; Join's
  command tests pass against the shared engine.
- Join Playwright (`apps/join/tests/e2e/smoke.spec.ts`, desktop plus the
  390 px project) must stay green. [CORRECTION 2026-09-26] This said Join had
  no `getByRole("dialog")` locator on its windows. It had twelve: every
  window was found as a dialog. Now that a window is a labelled region, they
  read `getByRole("region", …)`. The one that stays a dialog is INKBLOT's
  win screen ("GOODEST BOI"), a real dialog inside the game.

**E2E specs changed.** `apps/join/tests/e2e/smoke.spec.ts`: window locators
from `dialog` to `region`, nothing else.

**Exit criteria.**

- `pnpm turbo run lint typecheck test build` passes; `e2e-join` green with
  only the locator edits above.
- The Esc test goes red when the guard is removed.
- The join.camp-404.com preview behaves the same (screenshots, desktop and
  phone).

### PR B: one program manifest, before any UI changes

**Why.** "Which programs a member sees depends on their profile" is the
owner's actual ask, and it is the lowest-risk piece. Today two lists disagree:
`CONSOLE_NAV` (`apps/web/lib/console-nav.ts:26`) filters on rank only, and
`buildHome().modules` (`apps/web/lib/home.ts:386`) filters on rank, lead and
approval. `/captains/calendar` and `/kitchen/meal-plan` are reachable but not
in the nav. Shipping the manifest behind the current header proves it with
zero visual risk. Needs decisions 2 and 11 (8 is ruled: team folders).

**Files.**

- New `apps/web/lib/programs.ts` (plain module, never `"use server"`: such a
  file may export only async functions; first line `import "server-only"`, so
  the rank bars and predicates can never be bundled for the browser). The
  registry: one entry per program with `id`, `label`, `fileName`, `href`,
  `icon`, `folder`, `rank`, optional `requires(facts)`. `requires` may call
  only the existing core predicates: `hasClearance`, `canApproveRecipe`,
  `canRunProofread`, `canEditMealPlan`, `canEditPower`, `canSendToAudience`,
  `canWorkInTeam`. Lead programs use `isLead` /
  `hasClearance(rank, "team_lead")`. No new predicate is added. Pure
  `buildProgramManifest(facts, registry)` returns
  `{mode, desktop, folders, teamFolders, taskbarPins, startMenu, tray, pins,
  allowedChildren, version}`, with `mode` one of `full`, `restricted`,
  `held`. The client receives only
  `{id, label, fileName, href, icon, group, folder, mine?, badge?}` per
  program and `{team, label, lead, programs}` per team folder, never a rank
  to decide with or the reason a program is shown. Team folders: one per
  team the member is in this year, led first; each lists the team page and
  the team's tools the member may open (the prototype's `TEAM_TOOLS` as the
  starting set, shaped later with each lead). Tray items and pins are
  manifest fields per mode: restricted and held modes get no pins and no
  system-health item; held mode also drops badges and the Today gadget. The
  system-health item is a coarse `ok`/`warning` flag for an approved
  non-captain and carries details only for a captain. It is derived from
  `deriveSystemStatus` and the fact the request already reached the
  database, never from the 5 s probe in `getSystemStatus`
  (`apps/web/lib/system-probe.ts`) on every render.
  What the client can still learn: the viewer's own rank label and led-team
  names, rendered on the server as text (as today's header chip is), and, through
  `matchProgram`, the path-to-file-name map, captain routes included. Captain
  route titles are generic file names (for example `AUDIT.LOG`), never data.
  The pages' own gates and `forbidden-matrix.spec.ts` remain the security
  boundary.
- New `apps/web/lib/program-routes.ts`: `matchProgram(pathname)` returns
  `{programId, instanceKey, genericTitle}`. Replaces `activeNavHref`
  (`apps/web/lib/console-nav.ts:186`). The client `desktop-shell` imports it,
  so it must import nothing from `programs.ts`, `program-manifest.ts`, the
  core predicates or any rank constant; a lint rule or a unit test that reads
  its imports keeps it that way. It returns null for the two `route.ts` CSV
  exports under `(console)` (`captains/camp-management/export`,
  `captains/questionnaires/[key]/responses/export`): they are files, not
  windows, and their links stay plain `<a download>` anchors (never a
  prefetching `next/link`), so a client navigation never tries to open them
  as a window.
- New `apps/web/lib/program-manifest.ts` (`import "server-only"`):
  `getProgramManifest = cache(...)` built on `resolveMemberState()`
  (`apps/web/lib/member-gate.ts:71`), which stays the one caller of
  `runDueWorkAfterResponse`. Inputs:
  - **new:** a request-cached `getCampSettings()` (cycle plus teams config),
    replacing the 3+ reads of `camp_settings` per request;
  - **new:** one this-cycle memberships read, from which `isLead`, `ledTeams`
    and `myTeams` all follow. It replaces the separate `isTeamLead`,
    `getMyTeams` and `getLeadTeams` calls. The db read takes the cycle as an
    argument instead of calling `currentCycleNumber` inside;
  - `getInboxBadge` (already cached).
  **Neither new function has a test-store twin yet.** Both route through
  `usesTestStore()`, with test-store methods that apply the same
  year-scoping as the real backend. Without them every E2E persona gets an
  empty manifest, and `captainPageGate` would read the real database under
  `E2E_TEST_MODE`, so lead personas would lose clearance.
  Both caches are React `cache()` only, never `unstable_cache` or
  `"use cache"`, because they are keyed by viewer. An action that writes
  memberships and then re-renders reads memberships fresh after the write.
- `apps/web/lib/lifts.ts`: a test-store twin for `getMyLift` (decision 11 A),
  so the My lift program can be driven by Playwright. Today it returns null under
  E2E (`lifts.ts:13`). If the owner picks 11 B, skip this and record the
  deferral.
- `apps/web/lib/console-nav.ts` and `apps/web/lib/home.ts`: `consoleNavFor`
  and `buildHome().modules` become views of the manifest. The header and Home
  render from it, unchanged.
- `apps/web/lib/users.ts`, `apps/web/lib/captain-gate.ts`: `isTeamLead`,
  `getMyTeams`, `getLeadTeams` and `captainPageGate` read the shared cache.
- New `revalidateManifest()` helper (`revalidatePath("/", "layout")`, the
  pattern from commit 12eb18e,
  `apps/web/app/(console)/questionnaires/[activationId]/actions.ts:152`) in
  its own plain module, `apps/web/lib/manifest-revalidate.ts`, marked
  `import "server-only"`. Never export it from a `"use server"` file: as a
  sync export it breaks the page under `next dev` (typecheck and lint do not
  catch it), and as an async export it becomes a server-action endpoint any
  client can call. Called from every action that changes a manifest input:
  approvals, promotion accept, team assign/remove/lead, team settings, the
  cycle rollover and founding year, gate completions, `setPinnedAction`. It
  refreshes only the acting member's desktop; other members catch up as the
  design doc's "Staleness" section says.
- **The `?next=` fix.** Today three redirects send a signed-out visitor to a
  bare `/auth/sign-in`, so a push or email link loses its target:
  `requireMemberPage()` (`apps/web/lib/member-gate.ts:91`),
  `getAuthenticatedUserOrRedirect()` (`apps/web/lib/auth.ts:89-93`, which
  guards `/notifications`, `/announcements/[id]` and
  `/questionnaires/[activationId]`, the pages push, email and reminders open)
  and `redirect("/auth/sign-in")` in `apps/web/app/(console)/page.tsx:47`.
  One new helper, `signInRedirect()`, builds `/auth/sign-in?next=<path>` and
  all three use it. The sign-in form already honours `next`. The path comes
  from an `x-camp-path` request header set by a new `apps/web/proxy.ts`
  (Next 16's middleware; neither `proxy.ts` nor `middleware.ts` exists today):
  - the proxy always deletes an incoming `x-camp-path` and sets it from
    `request.nextUrl` (pathname and search), so a client-sent header never
    reaches `headers()`;
  - it uses a negative matcher (everything except `api`, `_next`, `auth` and
    static assets), not a list of console folders. It never touches
    `/api/auth/*`, so it is not a second switch next to `authMayServe`;
  - before a gate uses the value, it must pass `safeInternalPath`
    (`apps/web/lib/safe-redirect.ts`) and `matchProgram` (a known console
    page); otherwise `next` is omitted, so it never points at a route
    handler or `/auth/*`.
  The proxy runs on the Node runtime on every matched request, a new
  invocation per request on Hobby; this PR measures it. Fallback if the owner
  does not want a proxy, or the cost is material: each gate caller passes its
  own typed route literal.

**Tests.**

- `apps/web/lib/programs.test.ts`: manifest fixtures per profile (pending
  applicant, rejected applicant, plain member, lead of kitchen, lead of power,
  lead whose only led team is archived, captain), seeded from the `Team` and
  rank constants, never string literals (AGENTS.md: a fixture outside the
  vocabulary passes for the wrong reason). The applicant and plain-member
  fixtures assert no pins in restricted mode; the plain-member fixture gets
  a coarse health flag with no detail field; a held fixture has no pins,
  badges, counts or Today. Team folders: two teams, one led, give two
  folders, the led one first and tagged; a Finance member who is not a
  captain gets no Payments in the Finance folder.
- A unit test that the test-store and real memberships reads agree for a lead
  persona.
- PGlite: the single memberships read and the cached settings read against
  real queries, including the year rollover (lead programs vanish until
  captains reassign). Keep reads out of open transactions.
- Drift tests, each broken once on purpose:
  - every `apps/web/app/(console)/**/page.tsx` maps through `matchProgram`
    (a glob; 50 files today), and no `route.ts` under `(console)` does;
  - every `(console)` top-level segment is covered by the proxy matcher;
  - each registry entry's `rank` matches its page's gate bar. Next validates
    page exports, so a page cannot export a `PAGE_GATE` constant; the test
    reads the page source with a regex for `captainPageGate("<rung>")` and
    `requireMemberPage(` (member bar). Pages that call neither helper (for
    example `power/page.tsx`, `notifications`, the questionnaire runner) sit
    on an explicit allowlist, each with a one-line reason; a new page on
    neither the regex nor the list fails the test;
  - each action in the `revalidateManifest` list still calls it.
- `?next=` cases: external, protocol-relative (`//evil`) and backslash
  targets are refused; a spoofed `x-camp-path` is ignored; `next` never
  points at a route handler or `/auth/*`.
- Existing `console-nav` and `home` unit tests keep passing.

**E2E specs changed.**

- `anon-routes.spec.ts`: a signed-out visit to `/notifications`,
  `/announcements/<id>` and `/questionnaires/<id>` lands on
  `/auth/sign-in?next=…` and returns there after sign-in.

**Exit criteria.**

- Header and Home screenshots are identical before and after.
- All existing E2E and `e2e-db` (including `forbidden-matrix.spec.ts`) green.
- Each drift test goes red when broken.
- DB round trips on one console request are counted before and after (log the
  queries on PGlite or the local proxy) and do not go up (camp_settings 3+
  to 1, memberships 2-3 to 1).
- The proxy's cost per request is measured on the preview and reported in
  the PR.

**[CORRECTION 2026-09-26] As built.** Where the build differs from the text
above:

- `activeNavHref` is not replaced yet. Today's header has two links into one
  program (Profile and Sign-in & security are both the My account window), so
  `matchProgram` alone cannot say which one to light. It moved into
  `lib/program-routes.ts` beside `matchProgram` and goes with the header in
  PR C.
- My lift needed a route the plan did not name: `/lift`
  (`app/(console)/lift/page.tsx`, `requireMemberPage`, the same card Home
  shows). Nothing links to it yet, so the header and Home do not change; the
  desktop draws its icon in PR C. That makes 51 `(console)` pages, not 50.
  The test-store twin is seeded through `/api/test/seed-lift`.
- The manifest also carries `programs` (the programs that sit on the desktop
  itself, outside any folder), so `desktop` and `startMenu` can name items by
  id without repeating them.
- `captain-gate.ts` did not change: `captainPageGate` reads the lead flag
  through `isTeamLead`, which now reads the shared memberships cache.
- The test store's memberships read sorted by team NAME, while Postgres
  sorts `ORDER BY team` on the enum by its declared order. It now sorts by
  `Team.options`, and `memberships-agreement.test.ts` keeps the two equal.
- The system-health flag counts `deriveSystemStatus`'s attention items over
  the environment checks and the setup state (`readBootstrapState`, a
  request-cached read the layout already makes), never the timed probe.
- `revalidateManifest()` is also called by `markAllNotificationsReadAction`
  (the bell's count is a tray field). The list the test keeps is in
  `lib/__tests__/manifest-revalidate.test.ts`.
- "New event opens with an explanation for a lead whose led teams are all
  archived" (design doc, section 4) is a visible change on
  `/captains/calendar`, so it is not in this PR; it moves to PR C.
- The unit tests live in `apps/web/lib/__tests__/` (`programs.test.ts`,
  `program-manifest.test.ts`, `program-routes.test.ts`,
  `program-registry-drift.test.ts`, `proxy.test.ts`,
  `sign-in-redirect.test.ts`, `manifest-revalidate.test.ts`,
  `memberships-agreement.test.ts`, `lifts.test.ts`, `request-reads.test.ts`),
  the repo's convention.
- The anon-routes "returns there after sign-in" case drives the return leg
  through `/auth?next=`, the path Google and a finished sign-in take; the
  E2E test login stands in for the form.
- The per-request dedupe is guarded by `request-reads.test.ts`. React
  `cache()` is a pass-through outside a Server Components render, so no
  other unit test can see it; that file stands a per-request memoiser in for
  `cache()`, runs the app's own reads (`getCampSettings`, `getMyMemberships`,
  `isTeamLead`, `getLeadTeams`, `getMyLift`, `getProgramManifest`) against
  PGlite, and asserts one `camp_settings` config read and one
  `team_memberships` read per request. It went red with a `cache(` wrapper
  removed, with the memberships or lift read looking the year up again, and
  with the health flag calling the timed probe. The memoiser is a stand-in:
  that React's own `cache()` dedupes inside a real render is shown only by
  the statement-log run below.
- Round trips for the header's reads, counted on PGlite at the DATABASE
  layer (`memberships-agreement.test.ts`, a measurement for this table, not a
  guard on the app's path): 5 before (lead flag, teams config, my
  teams, each membership read looking the year up again); 4 after: 2 for
  the settings and memberships, and 2 for the lift (driver, then rider),
  which Home made on its own before and now shares with the manifest. So a
  console page that is not Home pays the lift's 2 reads it did not pay
  before, and still comes out one lower. `captainPageGate`'s own lead read
  (2 more before) is now shared too. The proxy's cost still has to be
  measured on a preview.
- Measured on one whole console request (2026-09-26, `next dev` against the
  local Postgres stack with `log_statement = all`, a member and a Kitchen
  lead, warm): `camp_settings` config reads went from 4-6 to 1, and
  `team_memberships` reads from 3-4 to 1, on `/`, `/tasks` and
  `/captains/questionnaires` alike. The lift's 2 reads are now on every
  console page (before, only on `/`). All app queries per request: `/tasks`
  18-20 to 14, `/` 25 to 16, `/captains/questionnaires` 15-20 to 15-16. The
  one `bootstrapped_at` read (the setup latch) stays.

### PR C: the console becomes a desktop

**Why.** This is the structural change the owner asked for, on the current
tokens. Decisions 3, 7 and 14 are ruled, including where the layout is
stored (14 B, on the server).

**Files.**

- `apps/web/app/(console)/layout.tsx`. It keeps its branches and still never
  redirects:
  - signed out, not bootstrapped: bare children (`layout.tsx:40-42`),
    untouched. Invite and burner-profile holds live outside `(console)`;
  - **held by a blocking questionnaire** (`block.reason ===
    "questionnaire"`): `<Desktop mode="held">`, the desktop drawn inert
    behind a blocking layer that holds the runner (owner, 2026-09-25). The
    held manifest has no pins, counts, badges, Today or last-seen copies;
    a member not yet approved gets the wallpaper only. `requireMemberPage`
    and `memberBlock` do not change: every other page still redirects to
    the runner, so the layer is only a picture;
  - approval **pending**: the restricted desktop (Today, Inbox, an
    "Application submitted" balloon; no pins, no system-health item) in place
    of today's bare column (`layout.tsx:37-39`). The predicate is
    `block?.reason === "approval" && campUser.approvalStatus === "pending"`,
    the same as `waiting` in `(console)/page.tsx:49-51`, moved into one shared
    helper in `lib/member-gate.ts` that both call;
  - **rejected** applicant: the bare branch. Keying on the reason alone would
    hand them a restricted desktop that says "Application submitted";
  - cleared member (`layout.tsx:44-63`):
    `<Desktop manifest><FocusedWindow>{children}</FocusedWindow></Desktop>`.
- **Held mid-session.** The gate pages inside `(console)` (the blocking
  runner and its `/complete` page) render a server `<HeldScreen>` marker.
  `<Desktop>` reads it through context, switches to held mode at once (drops
  pins, tray, Today and the last-seen copies, sets `inert` on `#os-desktop`,
  shows the layer) and calls `router.refresh()`, so the layout re-renders
  into the held branch.
- **The blocking layer** (`packages/os/src/blocking-layer.tsx`): a frame
  with no close, minimise or maximise, `role="dialog"` and `aria-modal`,
  focus trapped, Esc swallowed, Sign out inside. It sits above the Start
  menu and below the Radix band, so the runner's Selects and dialogs open
  (visual-language doc 4.9). `questionnaires/error.tsx` renders inside it.
- Wiring `apps/web` onto the packages (moved here from PR A): add
  `@camp404/os` and `@camp404/games` to its dependencies and to
  `transpilePackages` in `apps/web/next.config.ts` (today ui, types, core,
  ai-prompts), import `@camp404/os/styles.css` (and each game's CSS as it
  arrives) into the web app's Tailwind entry, and set the `--os-*`
  variables the package reads from the console's tokens.
- New `apps/web/components/os/desktop-shell.tsx`:
  - `usePathname` feeds `upsertUrl` through `matchProgram`;
  - focusing a background window calls `router.push(lastUrl)`; until the commit,
    the pressed control shows a pending state (`useLinkStatus` on links,
    `useTransition` on buttons); after it, the saved `scrollTop` is restored;
  - **close** calls `router.replace(nextTop?.lastUrl ?? "/")`; **minimise**
    sets the flag, then does the same replace. The App Router owns
    `history.state`, so "go back if the entry behind is the window
    underneath" cannot be built. Consequence, stated and tested: after a
    close, Back goes to whatever entry preceded the closed window's, and may
    reopen a window closed earlier as a fresh window;
  - on every back/forward restore of a program page, the window body stays
    hidden (the frame shows its title and "Checking…") until a
    `router.refresh()` has re-run the server gate; only then is the body
    shown. The client cache reuses pages on back/forward, so without this a
    member who lost access could see a cached captain-only page again. No
    age cutoff: a time limit is not an authorization check;
  - `router.refresh()` when the tab becomes visible after 5 minutes or more
    (an event, not a timer, so no cron rule is broken), and when a page
    renders a `CaptainLock` or a gate redirect, so the manifest and `pruneTo`
    catch up for members changed by someone else;
  - no window cap (decision 7 B): nothing closes a window but the member.
    Memory is bounded by the last-seen snapshot budget below instead.
- **Last-seen copies (decision 3 A).** New `packages/os/src/last-seen.ts`
  plus its use in `desktop-shell.tsx`: clone the focused body before any
  switch the desktop starts, on a capture-phase click on an in-window link,
  and when the page is idle after each commit; draw it in a closed shadow
  root with the app's stylesheets cloned in, `inert` and `aria-hidden`, with
  the "Last seen" line. Memory only; dropped on close, `pruneTo`, sign-out,
  user change and a change of manifest version (a demotion), so a
  captain-only copy never outlives the access; `data-os-private` elements
  blanked. A total snapshot budget (about 20 MB of serialized copy HTML
  across all windows): when it is exceeded, the least recently focused
  windows drop their copy and fall back to the icon and name; the windows
  themselves stay open. PR C measures memory with many windows open. Mark the private fields:
  the roster member panel's ID, safety and captain-notes sections, bank
  details in Payments, the ID and passport fields in My account. Start with
  a half-day spike that confirms a layout cannot re-render an old page's
  React tree (design doc, decision 3), and that the clone looks right for
  Roster, Tasks and Recipes.
- **Groups and plain names.** The registry's `group` field (Me, Camp,
  Captains) and plain `label`; `fileName` kept for the Terminal and
  decision 9 B.
- **The icon grid** (decision 14, ruled). New `packages/os/src/icon-grid.ts`,
  a pure module: the default layout (one column per group from the left, a
  long group wrapping; team folders down the right), snap to cell, the
  nearest free cell for icons in the way, fit after a resize, drop onto a
  member folder, and pruning a saved layout against the manifest. New
  `packages/os/src/desktop-icons.tsx` draws it: click selects, Ctrl, Cmd or
  Shift adds, box select from the empty desktop, drag moves the selection,
  double-click or Enter opens, no animation on drop; arrow-key roving focus,
  Space selects, `aria-selected` exposes the selection.
- **Right-click menus and member items.** New
  `packages/os/src/context-menu.tsx` (`role="menu"`, arrows, Esc, and
  Shift+F10 or the Menu key on the focused icon) and the folder-name
  dialog. The menus: on a program, Open, Create desktop shortcut, Add to
  *folder*, Add to a new folder; on the empty desktop, New folder, Line up
  icons; on a member folder, Open, Rename, Delete folder; on a shortcut,
  Open, Add to folder, Delete shortcut. Shortcuts show a small arrow.
  Member folders and shortcuts are desktop only.
- **Layout storage** (decision 14 B, ruled 2026-09-26: on the server). A
  per-member JSONB value holding icon cells, shortcut targets and member
  folders (program ids and folder names only), added to `schema.ts` with a
  drizzle-kit migration in this PR. Zod-checked on write (and on read; a bad
  value means the default layout) and pruned against the manifest on load.
  Read with the manifest; written from the client through a debounced
  server action. Erasure deletes it with the member's other rows, and it
  gets a test-store twin so Playwright can drive it. Not touched by
  sign-out, since it is not in the browser.
- **Team folders** from `manifest.teamFolders` on the right-hand side,
  "Kitchen team", led first, with a LEAD tag and the lead named in the
  accessible name.
- **Account chip**: name, rank chip, and for a lead "Leads Kitchen" or
  "Leads 3 teams", the full list in a tooltip on hover and focus and in the
  accessible name.
- **System-health tray icon** from the manifest's flag: a plain sentence
  in a balloon for a member, the count and a link to System status for a
  captain.
- **Start menu** above every window and all chrome, at most `50dvh` high
  on desktop, then scrolling.
- **No text selection on the chrome**: `user-select: none` on the desktop,
  icons, folders, header, taskbar, Start menu and menus; window bodies,
  dialogs and the blocking layer opt back in.
- **Performance** (design doc, section 8): decorative animation pauses on
  `visibilitychange` and under reduced motion, the clock ticks once a
  minute, no per-frame React state for sprites, and an idle-CPU check.
- **Today gadget.** `components/os/today-gadget.tsx`: closed by default, the
  right-edge handle, the `camp404.os.today-open` boolean in `localStorage`.
  Body is today's `HomeView` minus the module grid.
- **Terminal.** New `app/(console)/terminal/page.tsx` and
  `app/(console)/terminal/inkblot/page.tsx` (both `requireMemberPage()`),
  `apps/web/lib/terminal-commands.ts` (plain module): `help`, `ls`,
  `open <program>` over the client manifest (anything outside it answers "not
  found"), `whoami`, `clear`, `exit`, `play inkblot`, cat lines. No data
  reads or writes. Register both pages in `program-routes.ts` and
  `programs.ts`.
- **No full prefetch of a program URL.** Icons, Start items, taskbar buttons,
  background frames, folder windows and the pin strip use the default `<Link>`
  prefetch (which renders no page, since there is no `loading.tsx`), never
  `prefetch={true}` and never `router.prefetch(url)`. A full prefetch would
  mark the inbox and announcements read, run `resetStaleRuns` and kick due
  work with no user intent. A unit test (or lint rule) over `packages/os` and
  `apps/web/components/os` enforces it.
- `sessionStorage` key `camp404.os.v1:<campUserId>`, **layout only**:
  `{key, programId, lastUrl, rect, z, minimized, scrollTop}`, never titles
  (child titles carry personal data). On hydrate, drop any record whose
  `lastUrl` fails `safeInternalPath` or `matchProgram`, then `pruneTo` the
  fresh manifest including `allowedChildren`. Cleared by the sign-out view,
  and when the manifest mode changes or the session's user id differs from
  the key's. Selection state (a selected roster member) is never restored,
  because that would replay `getMemberDetailAction`'s audited read.
- **Form drafts are never stored in the browser**, with one exception: the
  four editors below autosave their draft to `sessionStorage` under their own
  key per user and instance, cleared on save, close, sign-out and a user-id
  mismatch. This is the design doc's one rule (sections 5 and 7). My forms
  answers, the burner profile, the questionnaire runner and the builder are
  never stored.
- **Dirty guards and draft autosave for four editors**: the meeting editor,
  the meal-plan editor, the Tiptap recipe source editor and the announcements
  composer (the microphone stops on close) register `useWindowDirty` and the
  autosave. None has a leave guard today, so no release ships windows that
  silently drop drafts.
- `apps/web/components/questionnaires/builder.tsx`: `useLeaveGuard`
  (`builder.tsx:158-209`) listens only for `<a href>` clicks on the document,
  so taskbar buttons and background-frame clicks that call `router.push` bypass
  it. Replace it with `useWindowDirty`, which is consulted on close,
  minimise, switch and launch, plus `beforeunload`.
- Non-focused windows: title bar plus an `inert`, `aria-hidden` body holding
  the last-seen copy (or icon and name after a hard load). Only one live page
  body is ever in the DOM; the copy is in a closed shadow root.
- Tray: `apps/web/components/notifications/notification-panel.tsx` moves in
  unchanged. `PinnedAnnouncements` becomes a strip above the window layer plus
  a tray item (cleared members only). Account, Report a problem and Log off
  move into the Start menu; **Log off reuses `SignOutLink`**, never a plain
  `/auth/sign-out` href, so the device's push token is removed first.
- `apps/web/app/(console)/page.tsx`: the signed-out `LandingHero` branch, the
  `/setup` redirect and the gate redirects stay as they are (the `?next=`
  change from PR B aside). The signed-in branch renders the Today gadget, closed by default
  (to-dos, tasks, coming up, lift, checklist) from
  `components/home/home-view.tsx`; the "Your modules" grid becomes the
  desktop icons.
- New `apps/web/app/(console)/not-found.tsx` ("Page not found") and
  `error.tsx` ("Tasks stopped responding", with the program's plain name, on `ErrorRecovery
  frame="inline"`). The three section boundaries (`captains/`, `tools/`,
  `questionnaires/` `error.tsx`) sit closer to the failing page and would win,
  so this PR reskins them (or deletes the first two). `questionnaires/error.tsx`
  must keep working in the bare, blocked branch. Still no `loading.tsx` and no
  Suspense around the window (commit cb8d9d8: a boundary makes `notFound()`
  answer 200 and puts the page in the DOM twice).
- Focus: when a navigation commits, focus moves to the page's `h1` (or
  `[data-autofocus]`); a "Skip to window" link comes first; the icon grid is
  one tab stop with arrow-key roving tabindex.
- **Phones: the mobile Classic desktop** (owner, 2026-09-25: "I'm going to
  need a mobile version"). CSS-first layout (full screen by default, windowed
  from `md:`), so the server's first paint is right at 390 px. `/` is a home
  screen of the same groups with big icons, then a My teams row of team
  folders; no member folders, shortcuts or icon moving; folders open as full-screen
  sheets; programs open full screen with a big Back/Close; a bottom bar holds
  Home, Open programs, the inbox bell and Today; Today opens as a sheet.
  Opening a window from the home screen or switcher pushes an entry; a
  popstate that lands on a different window's instance closes the window it
  left, so Android Back and iOS swipe-back pop the stack. Back never silently
  discards unsaved input: a window that is dirty (`useWindowDirty`) when Back
  closes it keeps its draft in memory for that window instance, and the
  draft is restored when the member reopens it in the same session (the four
  editors also keep their `sessionStorage` autosave). Design doc, section 5.
- Delete `components/console/console-header.tsx` and
  `components/console/console-nav.tsx`, keeping the `useLinkStatus` pending
  pulse on icons, Start items and taskbar buttons.
- Z-order: window layer `isolate` from z 20; taskbar and pinned strip z 90;
  Radix portals get a band above windows; Toaster, `AcknowledgementGate`
  (which also sets `inert` on `#os-desktop`) and `FeedbackGate` stay in
  `app/layout.tsx` above everything.
- `AGENTS.md`: `[CORRECTION 2026-09-xx]` on "Shell" (register a new page in
  `program-routes.ts` and `programs.ts`), "Loading", the E2E helper note and
  the loading.tsx gotcha (it names "the console header's next/link"). New
  gotchas: only one window body is mounted (a background window is an inert
  copy in a closed shadow root); no per-window Suspense; never
  `prefetch={true}` or `router.prefetch` on a program URL; the title bar is
  not a heading; any action that changes rank, teams, approval, gates or the
  cycle calls `revalidateManifest()`; a blocking questionnaire draws over an
  inert desktop, but the gate is still the server redirect, so never add a
  live field to the held manifest.

**Tests.**

- Unit: close and minimise call `router.replace`; storage hydrate drops
  invalid `lastUrl`s, prunes against the manifest and never reads a title;
  `matchProgram` instance keys (`/meetings` and `/meetings?team=x` are one
  window; `/meetings/<id>` is its own); the no-full-prefetch check; the icon
  grid module (default layout, snap, nearest free cell, fit after resize,
  drop into a folder, prune against the manifest, a bad saved value falls
  back to the default).
- E2E, new `apps/web/tests/e2e/os-shell.spec.ts` replacing
  `console-nav.spec.ts`:
  - icons per profile, asserting a present heading before any absence
    (AGENTS.md: `toHaveCount(0)` on an unpainted page passes for nothing);
  - Start menu keyboard (arrows, Esc returns focus to Start);
  - open two windows, switch, close focuses the next window down;
  - what Back does after a close (the rule above);
  - a background window shows its last-seen copy, `getByLabel` on the
    focused page still matches once, and a `data-os-private` field is blank
    in the copy;
  - refresh restores the stack as frames with icon and name;
  - the Today handle: closed on first visit, opens, stays open after reload;
  - the Terminal: `open roster` opens Roster; `open audit` as a plain member
    answers "not found";
  - Esc inside a Select keeps the program open;
  - the dirty guard asks before switching away from the builder;
  - a `notFound()` URL answers status 404 inside a window;
  - icons: click selects, Ctrl-click adds, a box selects several, a drag
    snaps them to new cells, double-click and Enter open, the layout
    survives a reload, "Line up icons" restores it;
  - right-click (and Shift+F10): make a shortcut (it shows the arrow), make
    and rename a folder, drag an icon into it, delete both;
  - team folders on the right for a lead persona, the led one tagged LEAD;
    the account chip says "Leads …";
  - the system-health icon: a member sees the plain sentence with no link;
    a captain's opens System status;
  - a held member on a hard load: the form is on top, the desktop behind is
    inert (an icon click does nothing), Esc does nothing, no pins or tray
    counts in the DOM;
  - a member held mid-session: signed in on the desktop, a blocking send is
    issued, they click an icon, and the runner shows on top with the
    desktop inert and no tray;
  - a rejected applicant opening `/notifications` gets no desktop;
  - the phone home screen at 360 and 390 px: groups, the My teams row, no
    member folders or shortcuts, a folder sheet, a full-screen program with
    Back/Close, the bottom bar, the Today sheet, and the stack plus Back;
  - idle CPU: two windows open, a few seconds with no input, main-thread
    task time from Chrome's metrics (CDP `Performance.getMetrics`) under the
    budget. If that proves flaky in CI, a manual Performance-panel check
    recorded in the PR instead.

**E2E specs changed.**

Built from a grep of `apps/web/tests/e2e` on 2026-09-25 (`"Your modules"`,
`getByRole("dialog"|"alertdialog")`, `lib/console-nav` imports). Re-run the
grep when PR C starts; the list will have moved.

The window frame is a labelled `<section>`, **not** a dialog. So the 25
`getByRole("dialog")` locators across the specs keep meaning Radix modals and
need no change, including the ones that assert absence
(`announcements.spec.ts:120` and `:351`, `kitchen-source-editor.spec.ts:227`,
`:263`) and the bare ones in `tasks.spec.ts`.

| Spec | Change |
|------|--------|
| `tests/e2e/lib/console-nav.ts` | Rewritten: `openConsoleNav`, `goViaConsoleNav`, `navEntry`, `consoleNavGroups` drive the Start menu and folders. Its one dialog locator (the phone "Menu" sheet) goes with the sheet. The importers (`authenticated`, `calendar`, `captain-preview-locked`, `system-status`, `team-lead`) should need no edits for the helper itself. |
| `console-nav.spec.ts` | Replaced by `os-shell.spec.ts`. |
| `home.spec.ts` | Rewrite the four "Your modules" grid assertions (lines 66, 90, 159, 191) as desktop-icon assertions. |
| `calendar.spec.ts` | Its three "Your modules" assertions (lines 88, 160, 165) become desktop-icon assertions. |
| `announcements.spec.ts` | "Your modules" assertion (line 141) becomes an icon assertion; the pinned banner moves to the strip, and the Read link must still land on `/announcements/<id>`. |
| `captain-preview-locked.spec.ts`, `team-lead.spec.ts`, `system-status.spec.ts` | Assertions about which destinations a rank sees change shape (icons, not menu entries). |
| All other specs | Expected unchanged: they navigate by URL, and URLs and h1s stay. |

Budget: about 9 spec files change. Allow a day of PR C for them.

Nothing in `tests/e2e-db` should change; `forbidden-matrix.spec.ts` stays the
proof that hidden icons are not the security boundary.

**Exit criteria.**

- Full CI gate and E2E green in the main checkout (memory: E2E only runs
  reliably there; one run at a time on port 3000). The nightly mobile-360 run
  (`mobile.yml`) passes on the branch before merge (run it by hand).
- `notFound()` answers 404 and page redirects are server 307s, in Playwright
  and on the Vercel preview.
- One live window body in the DOM at any time.
- An idle desktop uses near-zero CPU (the check above, or the manual
  recording).
- Desktop and phone screenshots sent to the owner, including a desktop with
  three programs open side by side.
- The PR lists flows with no E2E cover: the questionnaire runner and
  completion page (beyond the held-mid-session case), the builder, results,
  the cycle page, setup, and the audit log with data.

### PR D: the skin (after decisions 4, 5, 6, 9, 10, 12)

Decision 1 is ruled (the Classic desktop), so this PR goes ahead.

**Files.**

- `packages/ui/src/styles/globals.css`: a `.os-skin` token block next to
  `.camp-accent`, mapping the `os-*` palette onto the shadcn semantics
  (`background`, `card`, `popover`, `muted`, `border`, `input`, `primary`,
  `ring`, `accent`), `--radius: 0`, and `primary-foreground` per decision 4.
  The status colours (`destructive`, `success`, `warning`) reuse the
  console's existing values; no new palette (visual-language doc, 2.1).
  Join's reduced-motion stills merged after the blanket
  `animation-duration: 0.01ms !important` rule, with `!important`, so they
  win.
- `apps/web/app/layout.tsx`: Silkscreen via `next/font` (the TTF and licence
  are in `apps/join/assets`), for chrome, headings, buttons and badges only.
  Body face per decision 10.
- `packages/ui/src/components/*`: cva recipes for button (slab), input and
  textarea (a 1px bordered box; the underline field only for short fields in
  dense panels), card, badge, alert, table, dialog (`os-window-in` instead of
  zoom), toast, checkbox, switch, segmented control, spinner.
- A scoped codemod for `rounded-*` in `apps/web` (about 180 uses in 73 files)
  that keeps avatars and dots round.
- One line-art AppIcon per program; team PixelIcons reused.
- **Hidden cats** (owner, 2026-09-25), in `@camp404/games` (`cats` and `shadow-work`). Only two
  cats: Jinn (all black) and Prince (white and fluffy, black cap, back
  patch and tail). Prince asleep on the taskbar clock; Jinn peeking over the
  focused window now and then; the boot line; the Terminal's cat commands.
  In the Teams folder, pinned to the bottom of its window: Shadow Work, the
  camp's art piece, as a sprite generated from its real geometry, on its
  stand with its lattice of light, and Jinn asleep on top; move it and he
  wakes; throw it (arc, bounce), it rolls, he chases and bats it once, then
  sleeps on it again; dragging the window shakes them about. Never labelled
  anywhere. Decorative only: `aria-hidden` or a plain name, nothing depends
  on them. Stills under reduced motion and under `E2E_TEST_MODE`, no sound.
  The physics step is a pure, unit-tested function; the loop runs only
  while the Teams folder is open and sleeps when nothing moves (design doc,
  section 8). Visual-language doc, 4.6. May slip to its own small PR after
  D.
- The decision 9 B suffix on the title chip, if taken.
- `apps/web/components/auth-shell.tsx`, per decision 5 A: restyle
  `GateScreen` (pending approval, onboarding intro, setup, root 404/error) and
  split `AuthShell` so `/signup/required` changes while the sign-in pages keep
  today's look. The blocking runner and the onboarding wizard are listed as
  their own items.
- Boot once per browser session, after sign-in or on "Continue to desktop"
  (decision 6 A).
- `AGENTS.md` "Design": rewritten as a dated `[CORRECTION 2026-09-25]`: the
  Classic desktop ruling, the calm-desktop and plain-words rules, and
  decision 12's rule for new surfaces. The landing page exclusion
  (2026-09-23) stays word for word.

**Tests.** Unit snapshots of the changed cva classes; a contrast check (a
small script or unit test computing the AA ratio for small text on the filled
magenta, per decision 4); the Silkscreen lint-style check from the visual
doc, section 3.

**E2E specs changed.** None expected. `anon-routes`, `gate-ladder` and
`signup` assert exact headings on the gate and auth screens; keep the heading
text, or update those specs in the same commit.

**Exit criteria.**

- The owner approves each new control and program icon from screenshots
  (visual-language doc, section 7); Kitchen windows have layout approval.
- AA contrast measured in the browser and passing for small text on filled
  magenta.
- Silkscreen never in table cells, inputs or body text; no scanlines, noise or
  beam inside window bodies.
- Full gate green.

### PR E (follow-up): windows fit their own width

Pages use `md:`/`lg:`, which read the browser width, not the window's. Until a
page is converted, its window opens maximised on desktop.

- `md:`/`lg:` breakpoints become `@container` variants on Tasks, Roster, Power
  loads and fuel, Meal plan, Payments, questionnaire results, the builder,
  the recipe rail and `ResponsiveDataTable`.
- Sticky rails (recipe detail, invite, payments) stick to the window's scroll
  container.
- Playwright at two window sizes per converted page.

## 3. Order of programs

Because windows are routes, every program appears in PR C at once; there is
no per-program port. The order below is the order to **check** programs in PR
C (click through each, screenshot it) and to **convert** them in PR E.

1. **Read-only, low risk.** Inbox (`/notifications`), Calendar, Family tree,
   Meetings (list and note), the team windows (`/teams/[key]`), My forms and
   answers, Audit log, System status, Camp overview, announcement detail,
   My lift (decision 11), Terminal and INKBLOT.
2. **Forms in one window.** My account (profile, edit, security), Invites,
   New event, Camp settings, Join site, Payments, the optional questionnaire
   runner, meeting new and edit.
3. **Heavy or nested.** Tasks (dnd-kit), Roster (master-detail, audited
   reads, many dialogs, private fields to mark for the last-seen copy), Power
   (loads and fuel), Announcements (microphone), Questionnaires and its
   children (builder with dnd-kit and the dirty guard, send, results).
4. **Kitchen, last, with layout approval.** Recipes, recipe documents,
   Recipe review, the source editor (four Tiptap editors, 1 s poll,
   `maxDuration = 300`), Meal plan.
5. **Never windows.** The signed-out landing, `/auth/**`, `/mcp/connect`,
   `/privacy`, `/terms`, `global-error`, and the gates outside `(console)`
   (invite, burner profile, pending approval), which stay bare full-screen
   routes. The blocking questionnaire runner is not a window either: it is
   the blocking layer over an inert desktop. Full list in the program
   catalogue.

## 4. How CI stays green

- Each PR runs `pnpm turbo run lint typecheck test build` locally before it is
  pushed, and E2E in the main checkout. `ci-pass` needs `e2e`, `e2e-join` and
  `e2e-db` (`.github/workflows/ci.yml:363-413`).
- URLs, h1s and gates do not change, so most of the 30 specs run as they are.
  The one choke point is `tests/e2e/lib/console-nav.ts`; it is rewritten in
  the same commit as the shell.
- Only one page body is mounted, and a background window's copy sits in a
  closed shadow root that Playwright does not pierce, so strict mode does not
  see duplicates (the cb8d9d8 lesson). The window frame is not a dialog, so
  `getByRole("dialog")` still finds only Radix modals. The title bar is not a
  heading, so `getByRole("heading")` finds only the page's h1.
- PR B adds test-store twins for its two new reads and for `getMyLift`
  (decision 11 A), so every E2E persona gets a real manifest. A data function
  with no twin cannot be driven by Playwright; say so in the PR.
- The 360 px project runs nightly, not per PR. Run it by hand on PR C and PR E
  before merge.
- `schema-migration` "branches limit exceeded" is capacity, not code: re-run
  it. Keep one PR open at a time to avoid it.
- Pushes are batched (Hobby: 100 deploys per 24 h).

## 5. Rollback and feature flag

**Default: no flag, roll back by revert.** The only schema change is PR C's
migration, which only adds the desktop-layout table (or column); nothing
else reads it, so it is safe to leave in place if the UI is rolled back, and
a revert (or Vercel's instant rollback to the previous production
deployment) stays safe. Do not write a down-migration for it. Session
storage is versioned (`camp404.os.v1`), so a rollback leaves only a harmless
unused key; the draft keys are cleared on sign-out.

- PR A: revert restores Join's local copies.
- PR B: the header and Home render the same either way; a revert only loses
  the `?next=` return, the proxy and the read savings.
- PR C: the only risky one. Keep `console-header.tsx` and `console-nav.tsx`
  deleted only in PR C itself, so a single revert brings the header back.
- PR D: a revert returns the AfrikaBurn look; `.os-skin` is one class on
  `<html>`, so it can also be switched off by removing the class.

**Optional flag, owner's call.** If the owner wants to try the desktop on
production before everyone gets it, add `CONSOLE_SHELL=desktop|header` for
PR C only: the layout's member branch picks `<Desktop>` or the old
`<ConsoleHeader>`. It must go into `.env.example` and `turbo.json`
`globalEnv`. Cost: both shells stay in the code and both need E2E, so remove
the flag and the header in the next PR. Recommendation: no flag; the preview
deployment is the trial.

## 6. Risks to watch during the work

- A hidden icon is never security. Every page keeps its gate and every
  action keeps `captainActionGate` and its re-read inside the transaction.
- Stale desktops for other members: `revalidateManifest()` refreshes only the
  actor's desktop. Others catch up on a hard load, a visibility refresh after
  5 minutes, or the next time a page gate refuses them. An action that changes
  the actor's own inputs and forgets the call leaves wrong icons; the drift
  test covers the known list; review new actions for it.
- Radix portals and sticky layouts inside windows (about 25 and 10 files).
  PR C fixes z-order; PR E fixes sticky rails.
- A held member must never reach the desktop, or a blocking questionnaire
  has an escape. The desktop behind the form is `inert` and shows nothing
  live, but the real guard is unchanged: every page redirects to the runner.
  The held branch covers a hard load; the `<HeldScreen>` marker covers a
  member held mid-session. `os-shell.spec.ts` asserts both, including that
  an icon click behind the form does nothing.
- A saved layout could point at a program the member lost. It is pruned
  against the manifest on load, and every page keeps its gate.
- Animation cost: a cat or game loop that never sleeps keeps a laptop busy
  all day. The idle-CPU check in PR C, and again in PR D for the cats.
- Audited reads (roster detail), mark-read on render (`/notifications`,
  `/announcements/[id]`) and `resetStaleRuns` fire only for the focused
  window. Session restore must not pre-render background windows or restore
  a selection, and nothing may fully prefetch a program URL. The last-seen
  copy makes no request.
- A last-seen copy can keep a private field on screen if its component is not
  marked `data-os-private`. The drift test in the design doc (Security)
  covers the known fields; review new private fields for it.
- A last-seen copy is out of date by nature. The "Last seen" time and the
  tray and Today counts carry what is live.
- Every switch is a full server render. On a desert phone it can take
  seconds; the pending state on the pressed control is the only feedback.
- `proxy.ts` is new surface on every page request. Keep it to overwriting one
  header; PR B measures it and falls back to route literals if it is
  material.

## 7. After the shell: bespoke team programs

The owner, 2026-09-25: "each team lead will actually be telling me how they
want their module to be set up." PR C ships every team at `/teams/<key>`
with today's shared page in a window. After PR C (and ideally D) merges:

- one PR per team, in the order the owner picks, each shaped with that
  team's lead before any code (a layout the owner approves, as for Kitchen);
- the same talk settles which tools that team's folder holds; the
  prototype's starting set (Kitchen: Recipes, Meal plan, Recipe review;
  Power & Lighting: Power; Communications & HR: Announcements,
  Questionnaires, Join site; Finance: Payments) is only a starting point,
  and each tool still gates on the server;
- each is a bespoke component, with its own table where it needs one (bespoke
  over generic, AGENTS.md); no configurable team page;
- route, gate, group and icon stay; only the window body changes;
- this is the standing direction that each team gets its own dashboard
  (memory: `teams-bespoke-dashboards-and-task-board.md`).

## 8. Future, out of scope: Ask 404

Not a phase. The owner mentioned it as "maybe later": a helper program where a
member asks questions by text or voice. Voice would reuse the Groq Whisper
model already pinned (`apps/web/lib/groq.ts`, `whisper-large-v3-turbo`);
the answer would come from Claude over camp data the member may already read,
filtered on the server, never `ALWAYS_PRIVATE` fields, safety data only for
its readers and audited like a read. The full constraints are in the design
doc, "Future, out of scope: Ask 404". Nothing in PRs A to E builds toward it
beyond the Terminal's command table.
