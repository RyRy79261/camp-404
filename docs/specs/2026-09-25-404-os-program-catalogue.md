# 404 OS program catalogue

Status: proposal, 2026-09-25. Nothing here is built. The owner picked the
Classic desktop on 2026-09-25 (decision 1, ruled) and asked for plain names,
an ordered desktop, a Terminal and a phone version. In a second review the
same day he ruled decisions 3 (last-seen windows), 8 (team folders on the
right) and 14 (movable icons, member folders and shortcuts), made the
system-health warning visible to every accepted member, and put blocking
questionnaires on top of an inert desktop (design doc, "The owner's second
review"). The other decisions are open. Decision numbers below are the
design doc's.

This is one of four documents:

- Design: `docs/specs/2026-09-25-404-os-console-design.md`
- Program catalogue (this file): `docs/specs/2026-09-25-404-os-program-catalogue.md`
- Visual language: `docs/specs/2026-09-25-404-os-visual-language.md`
- Migration plan: `docs/plans/2026-09-25-404-os-console-migration.md`

## What this file is

It maps every `page.tsx` under `apps/web/app` (59 files, counted with
`find apps/web/app -name page.tsx`) to a 404 OS program, a child window, a
system window, or "stays outside the desktop".

The rules it follows come from the design doc:

- The URL is the focused window. Every page keeps its path, its gate, its
  `notFound()` and its `redirect()`.
- Only the focused window's body is mounted. Other open windows show a frozen
  last-seen copy (decision 3 A, ruled 2026-09-25); focusing one does
  `router.push(lastUrl)`.
- **Names are plain English** (owner, 2026-09-25: "some of the terminology
  might be a bit too geeky"). The Program column is what a member reads on
  icons, in the Start menu, the taskbar and the window title. The File name
  column is the old 404 OS name: it is used by the Terminal and, if decision
  9 B is taken, as a quiet suffix on the window title chip. Nothing a member
  must read depends on it.
- A desktop icon is cosmetic. The page's own gate is the security boundary.
  Hiding an icon never replaces `requireMemberPage` / `captainPageGate` /
  `CaptainLock` (`apps/web/lib/console-nav.ts:8-12` says the nav is not the
  boundary either).
- The manifest is built on the server from the same core predicates the pages
  use, and only those: `hasClearance`, `canApproveRecipe`, `canRunProofread`,
  `canEditMealPlan` (`packages/core/src/recipes.ts:46,61,73`), `canEditPower`
  (`packages/core/src/power.ts:34`), `canWorkInTeam`
  (`packages/core/src/meeting-notes.ts:31`), `canSendToAudience`
  (`packages/core/src/audience-authz.ts:62`). Lead programs use `isLead` /
  `hasClearance(rank, "team_lead")`. No new predicate is needed.
- A lead with an *invalid* team cannot exist. `team_memberships.team` is
  `teamEnum`, whose 14 values are exactly the `Team` Zod enum
  (`packages/types/src/roles.ts:10-25`). The `Team.safeParse` filters in the
  announcements and calendar pages are defensive only.
- The real edge case is a lead whose only led team is archived.
  `/captains/calendar` clears them (`captainPageGate("team_lead")`), but its
  composer offers only active teams they lead
  (`app/(console)/captains/calendar/page.tsx:40-45`), so today they get an
  empty team picker. In the manifest New event still shows for them and opens
  with an explanation instead of an empty picker.
- Document windows follow decision 7. Recommended (A): each document
  (`/meetings/<id>`, `/kitchen/recipes/<id>`, `/announcements/<id>`) is its
  own window, and open windows are capped at 8, closing the oldest background one.
  The alternatives are no cap (B) or one window per program with documents
  replacing each other (C). Existing `router.push` calls need no sweep (design
  doc, section 3). So after New meeting saves and pushes to `/meetings/<id>`
  (`app/(console)/meetings/meeting-editor.tsx:220`), its own window stays open
  as a background frame until the member closes it or the cap closes it.

### Legend

**Kind**
- **Icon**: a desktop or folder icon, in the Start menu.
- **Child**: a window opened from another program. No icon.
- **Tab**: a sub-view inside another program's window. Same window instance.
- **System**: a full-screen system window. No desktop behind it.
- **Outside**: not part of the desktop at all.

**Default size** (desktop only; on phones every window is full screen)
- **S**: 480 x 400. A dialog-sized window.
- **M**: 720 x 560.
- **L**: 960 x 680.
- **Max**: opens maximised. Used for wide pages until they move to
  `@container` queries (migration plan, PR E).

**Instances**
- **Single**: one window per program. A second launch focuses it. Query
  params (`?team=`, `?tab=`) change the same window.
- **Multi (key)**: one window per key, e.g. one per meeting id. Subject to
  decision 7 (reuse rule and window cap), not yet ruled on.

**Difficulty** is the cost of making the page work well inside a window, not
the cost of the frame itself (the frame is shared).
- **Easy**: read-only or a simple form.
- **Medium**: dialogs, wide tables, router-driven filters, or writes that must
  refresh another window.
- **Hard**: drag and drop, rich editors, polling, leave guards, or audited
  reads.

**Rank ladder**: `camp_member < team_lead < captain`
(`packages/core/src/access.ts`). `team_lead` is global: leading any team this
year raises a member everywhere (AGENTS.md, "team_lead clearance is GLOBAL").

## Groups and folders

The owner asked for the desktop to be ordered (2026-09-25: "things seem quite
random"). Every program belongs to one group. The groups give the default
desktop layout (one column per group, from the left), the Start menu
sections and the phone home screen rows. Icons can then be moved (decision
14, below).

| Group | What goes in it | Who gets it |
| --- | --- | --- |
| **Me** | Inbox, My forms, My account, Invites; My lift for a driver (decision 11) | Every approved member |
| **Camp** | Tasks, Calendar, Roster, Meetings, Family tree, Power; the **Teams** folder; the **Kitchen** folder | Every approved member |
| **Captains** | The Captains folder (Questionnaires, Announcements, New event, and the captain-only programs), then Terminal | The folder: `team_lead` or captain, not drawn for anyone else. Terminal: every approved member (for a plain member it ends the Camp column) |
| **Team folders** (right-hand side) | One folder per team the member is in this year (decision 8), led teams first, tagged LEAD | Every approved member with a team this year. On the phone, a "My teams" row |

Folders inside Camp:

| Folder | What goes in it | Who gets it |
| --- | --- | --- |
| Teams | One icon per active team, own teams first, led teams first among them (`navTeams`, `apps/web/lib/console-nav.ts:126-145`) | Every approved member |
| Kitchen | Recipes, Meal plan, and Recipe review for reviewers | Every approved member (Recipe review is conditional) |

A folder is itself a small window (`folder-window` in `@camp404/os`); on a
phone it opens as a full-screen sheet. It has no route; opening it does not
change the URL. The Teams folder also holds Shadow Work and Jinn at the
bottom of its window, unlabelled (visual-language doc 4.6).

### Team folders

Owner, 2026-09-25: "when you are a part of a team, that team folder shows up
on your desktop". Named "Kitchen team" so it is not mistaken for the Kitchen
folder in Camp. It holds the team's page, then the team's tools. A starting
set, from the prototype (`_proto/desktop-items.tsx`, `TEAM_TOOLS`); the
exact tools per team are shaped with each lead (see "Team programs"):

| Team folder | Holds (starting set) | Who sees each tool |
| --- | --- | --- |
| Kitchen team | Kitchen (team page), Recipes, Meal plan, Recipe review | Recipe review only for `canApproveRecipe` (a Kitchen lead or captain); the rest every member of the team |
| Power & Lighting team | Power & Lighting (team page), Power | Every member of the team; editing still needs `canEditPower` |
| Communications & HR team | Communications & HR (team page), Announcements, Questionnaires, Join site | Announcements and Questionnaires for `team_lead` and up; Join site for a captain only |
| Finance team | Finance (team page), Payments | Payments for a captain only (decision 13 A) |
| Any other team | The team page | Every member of the team |

A tool listed there is a shortcut, not a grant: the manifest lists it only
when the member may open it, and the page runs its own gate.

### Moving icons, folders and shortcuts

Decision 14, ruled 2026-09-25: the desktop behaves like a real desktop
(design doc, section 4). Click selects, Ctrl- or Shift-click adds, a box on
the empty desktop selects several, a drag moves the selection on a snapping
grid, double-click or Enter opens, "Line up icons" puts the default back.
The layout is saved per member (where: the small open question in decision
14; recommended, the browser).

Right-click menus:

| On | Menu |
| --- | --- |
| A program, in any folder or on the desktop | Open, Create desktop shortcut, Add to *folder* (one per folder of the member's), Add to a new folder |
| The empty desktop | New folder, Line up icons |
| A member's own folder | Open, Rename, Delete folder |
| A shortcut (small arrow on the icon) | Open, Add to folder, Delete shortcut |

Dragging an icon onto a member's folder puts it inside. Member folders and
shortcuts are desktop only; the phone home screen does not show them. They
hold program ids only, so they never open anything the manifest does not
already give the member. Shift+F10 or the Menu key opens the menu from the
keyboard.

## The catalogue

### Desktop root and "Me"

| Route | Program | File name | Icon idea | Group or folder | Kind | Who sees it, and why | Size | Instances | Sub-views in the window | Deep link | Difficulty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/` (signed in) | The desktop itself, with the Today gadget | none | none (it is the wallpaper) | none | Desktop | Any member with no block. A member held by a blocking questionnaire is redirected to the runner, which draws over an inert desktop. A pending applicant gets the restricted desktop (`app/(console)/page.tsx:49-51` lets `waiting` through; the layout uses the same predicate through one shared helper). A rejected applicant is sent to `/pending-approval` and never gets a desktop. Any other block redirects to `block.href` (`page.tsx:51`) | n/a | n/a | Today gadget (closed by default, right-edge handle): to-dos, your tasks, coming up, lift card, setup checklist, EnablePush (all from `buildHome`, `apps/web/lib/home.ts`) | `/` | Medium. `HomeView`'s module grid becomes the icons; the rest becomes the widget |
| `/` (signed out) | none | none | none | none | Outside | Everyone signed out gets `LandingHero` (`app/(console)/page.tsx:35-37`). Owner ruling 2026-09-23: never restyled | n/a | n/a | n/a | `/` | None. Do not touch |
| `/notifications` | Inbox | `INBOX.EXE` | Line-art envelope with a count badge | Me | Icon | Every member with camp access, including a pending applicant: gate is `hasCampAccess` only (`app/(console)/notifications/page.tsx:79-80`), not `requireMemberPage`. A rejected applicant can open it too, but in the layout's bare branch, with no desktop. Badge from `getInboxBadge` | M | Single | Tabs `All`, `Unread`, `Announcements` (`?filter=`); captain-promotion card; "Needs your answer" list | `/notifications?filter=unread` | Medium. It marks the drawn page read on render; safe only because a background window renders no page (its last-seen copy is inert HTML) and no program URL is fully prefetched |
| `/announcements/[id]` | the announcement's title | `<TITLE>.TXT` | none | none | Child of Inbox | Only a recipient: `getAnnouncementForMember` returns null otherwise, then `notFound()` (`app/(console)/announcements/[id]/page.tsx:42`). Gate is `hasCampAccess` (`:37`) | S | Multi (announcement id) | none | `/announcements/<uuid>` (push, email, pinned strip) | Easy. Marks read on render |
| `/profile` | My account | `MY_ACCOUNT.CPL` | Line-art ID card | Me | Icon | Every approved member: `requireMemberPage()` (`app/(console)/profile/page.tsx:50`) | M | Single, shared with `/profile/edit` and `/profile/security` | Tabs `Profile`, `Edit`, `Security` (today's `ProfileSections` pills). Log off moves to the Start menu and reuses `SignOutLink` | `/profile` | Easy |
| `/profile/edit` | My account, Edit tab | `MY_ACCOUNT.CPL` | n/a | n/a | Tab | Same gate (`app/(console)/profile/edit/page.tsx:26`). The camp-blurb note changes for a captain | M | Same window as `/profile` | Name, photo, blurb, delete account | `/profile/edit` | Medium. Avatar file drop must not start a window drag. Deleting the account must end the whole session, not close a window |
| `/profile/security` | My account, Security tab | `MY_ACCOUNT.CPL` | n/a | n/a | Tab | Same gate (`app/(console)/profile/security/page.tsx:105`) | M | Same window as `/profile` | Confirm email, password, 2FA, passkeys, sessions | `/profile/security` (email verify callback, home checklist) | Medium. TOTP and WebAuthn dialogs must layer above windows. Revoking this session logs off the desktop |
| `/tools` | none | none | none | none | Redirect | `redirect("/")` (`app/(console)/tools/page.tsx:7`) | n/a | n/a | n/a | `/tools` goes to the desktop | None. Keep the redirect |
| `/tools/forms` | My forms | `MYFORMS.EXE` | Line-art folder of pages | Me | Icon | Every approved member: `requireMemberPage()` (`app/(console)/tools/forms/page.tsx:26`). Lists only forms this member completed | M | Single | Explorer view: editable code forms and read-only answered questionnaires | `/tools/forms` | Easy |
| `/tools/forms/[key]` | the form's name (e.g. Attendance) | `<FORM>.DOC` | none | none | Child of My forms | Same gate (`app/(console)/tools/forms/[key]/page.tsx:35`). Unknown key is a 404 (`:38`); a form not yet done redirects to `/tools/forms` (`:43`) | M | Multi (form key) | The form and its change log (side pane or History tab) | `/tools/forms/attendance` (linked from Profile) | Medium. Multi-step form; needs the dirty guard |
| `/tools/forms/answers/[key]/[cycle]` | Answers | `ANSWERS.TXT` | none | none | Child of My forms | Same gate (`.../answers/[key]/[cycle]/page.tsx:36`). Only the member's own answers; otherwise 404 (`:45`) | S | Multi (key + cycle) | none | `/tools/forms/answers/<key>/<cycle>` | Easy |
| `/tools/invite` | Invites | `KEYGEN.EXE` | Line-art key | Me | Icon | Every approved member: `requireMemberPage()` (`app/(console)/tools/invite/page.tsx:17`). A captain sees every code and extra controls (`:20-24`); the same program, not a second icon | M | Single | Code list pane and mint-form pane | `/tools/invite` | Medium. The sticky side panel must stick to the window's scroll body |
| `/terminal` (new) | Terminal | `TERMINAL.EXE` | Line-art prompt `>_` | Captains column, last (ends Camp for a plain member) | Icon | Every approved member: `requireMemberPage()`. The console's command set over the member's own manifest: `help`, `ls`, `open <program>` (only programs in the manifest; anything else is "not found"), `whoami`, `clear`, `exit`, `play inkblot`, cat easter eggs (never listed by `help`). Reads and writes no data in v1 | M | Single | Scrollback and prompt (`TerminalWindow` from `@camp404/os/terminal`) | `/terminal` | Easy. A new page; register it in `program-routes.ts` and `programs.ts` |
| `/terminal/inkblot` (new) | INKBLOT | `INKBLOT.EXE` | none | none | Child of Terminal (or a hidden cat) | Every approved member, same gate. The shared game from `@camp404/games/inkblot`, loaded with `next/dynamic` only when it opens. No leaderboard in v1 (no schema change) | M | Single | The game canvas | `/terminal/inkblot` | Easy. Canvas copies blank into a last-seen copy |

### Camp

| Route | Program | File name | Icon idea | Group or folder | Kind | Who sees it, and why | Size | Instances | Sub-views in the window | Deep link | Difficulty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/tasks` | Tasks | `TASKS.EXE` | Line-art three-column board | Camp | Icon | Every approved member: `captainPageGate("camp_member")` (`app/(console)/tasks/page.tsx:23`). Add is offered to a captain, or a lead for teams they lead (`:27`). Badge: my open tasks | Max | Single | Kanban columns; add, edit and delete dialogs | `/tasks` (task notifications land here, `packages/core/src/notification-links.ts`) | Hard. dnd-kit inside a window: drag from the title bar only, no transforms on the frame |
| `/calendar` | Calendar | `CALENDAR.EXE` | Line-art page-a-day | Camp | Icon | Every approved member: `captainPageGate("camp_member")` (`app/(console)/calendar/page.tsx:48`). "Add event" shows for `team_lead` and up | M | Single | Team filter (`?team=`); a "New event" button that opens New event | `/calendar?team=kitchen` | Easy |
| `/teams/[key]` | the team's name (e.g. Kitchen) | `<TEAM>.TEAM` | The existing team PixelIcon (`TEAM_ICONS`) | Teams folder (Camp); own teams also as a team folder on the right (decision 8) | Icon | Every approved member. The folder lists active teams; the page also opens for an archived team the config still names (`app/(console)/teams/[key]/page.tsx:112-117`). Gate `captainPageGate("camp_member")` (`:111`). A key the config does not name is a 404 (`:117`). "New meeting" if `canWorkInTeam` (`:156`). Unread dot from `countUnreadByTeam` | M | Multi (team key) | Leads and members, upcoming events, open tasks, meeting notes | `/teams/<key>` | Easy. Its links open Calendar, Tasks, Meetings and Roster with the team filter. Bespoke per team later (see "Team programs") |
| `/captains/camp-management` | Roster | `ROSTER.DB` | Line-art card index | Camp | Icon | Every approved member. The captain gate here only picks the projection (`app/(console)/captains/camp-management/page.tsx:38`): captains get the full roster, a non-captain lead also reads "This year" (`:58`), everyone else the public roster | Max | Single | List pane, member detail pane, captain dialogs (approve, reject, promote, teams) | `/captains/camp-management?team=<key>`; CSV at `/captains/camp-management/export` | Hard for captains. `getMemberDetailAction` writes an audit row, so it must fire only on a real click. The program lives under `/captains` but is a member program; the registry maps it explicitly |
| `/family-tree` | Family tree | `LINEAGE.EXE` | Line-art branching tree | Camp | Icon | Every approved member: `requireMemberPage()` (`app/(console)/family-tree/page.tsx:11`). Codes shown only to a captain (`:16`) | M | Single | Search; expand and collapse | `/family-tree` | Easy |
| `/meetings` | Meetings | `MINUTES.EXE` | Line-art notepad with a pen | Camp | Icon | Every approved member: `captainPageGate("camp_member")` (`app/(console)/meetings/page.tsx:36`). "New meeting" when `canWorkInTeam` (`:72`) | M | Single | Folder view of notes; team filter (`?team=`) | `/meetings?team=<key>` | Easy |
| `/meetings/[id]` | the meeting's title | `<TITLE>.TXT` | none | none | Child of Meetings | Every approved member (`app/(console)/meetings/[id]/page.tsx:84`). Unknown id is a 404 (`:87`). "Edit" if `canWorkInTeam` (`:97`). "Add to tasks" for a captain or a lead of the note's team | M | Multi (meeting id) | Read view | `/meetings/<id>` | Easy |
| `/meetings/new` | New meeting | `NEWMEET.TXT` | none | none | Child of Meetings or a team window | Opens for every approved member (`app/(console)/meetings/new/page.tsx:33`), but only teams passing `canWorkInTeam` are offered (`:43`); no team and not captain shows a lock. The launch button shows only when it would not lock | L | Single | Long form, action-item rows | `/meetings/new?team=<key>` | Medium. Needs the dirty guard and the draft autosave (PR C). After create, the new note opens in its own window; this one stays in the background until closed (decision 7) |
| `/meetings/[id]/edit` | the meeting's title, editing | `<TITLE>.TXT` | n/a | n/a | Child | `captainPageGate("camp_member")` then a lock unless `canWorkInTeam` (`app/(console)/meetings/[id]/edit/page.tsx:30,39`) | L | Multi (meeting id) | Same editor as new | `/meetings/<id>/edit` | Medium. On a version conflict, reload this window only |
| `/power` | Power | `POWER.EXE` | Line-art plug and bolt | Camp | Redirect to Loads | `redirect(POWER_LOADS_PATH)` (`app/(console)/power/page.tsx:8`) | L | Single | n/a | `/power` | None. Keep the redirect; the icon points at `/power/loads` |
| `/power/loads` | Power, Loads tab | `POWER.EXE` | n/a | n/a | Tab | Every approved member reads (`app/(console)/power/loads/page.tsx:217`). Editing: `canEditPower` (`:219`), a captain or a Power & Lighting lead (`packages/core/src/power.ts:34-43`) | L | Single, shared with `/power/fuel` | Loads table, KPIs, editor dialog | `/power/loads` | Medium. Wide table |
| `/power/fuel` | Power, Fuel tab | `POWER.EXE` | n/a | n/a | Tab | Same, `canEditPower` (`app/(console)/power/fuel/page.tsx:231-233`) | L | Same window | Fuel plan, generator list | `/power/fuel` | Medium |

### Kitchen

Kitchen UI work needs the owner's layout approval first (memory note
`kitchen-noble-notations-direction.md`). The mapping below is structure only.

| Route | Program | File name | Icon idea | Group or folder | Kind | Who sees it, and why | Size | Instances | Sub-views in the window | Deep link | Difficulty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/kitchen/recipes` | Recipes | `COOKBOOK.EXE` | Line-art open book with a spoon | Kitchen folder (Camp) | Icon | Every approved member: `captainPageGate("camp_member")` (`app/(console)/kitchen/recipes/page.tsx:106`). Review count and link only when `canApproveRecipe` (`:108`) | L | Single | Recipe list; my suggestions; links to New recipe, Recipe review, Meal plan | `/kitchen/recipes` | Easy. `resetStaleRuns` on render is idempotent |
| `/kitchen/recipes/new` | New recipe | `IMPORT.EXE` | none | none | Child of Recipes | Every approved member: `requireMemberPage()` (`app/(console)/kitchen/recipes/new/page.tsx:14`) | S | Single | Paste box | `/kitchen/recipes/new` | Easy |
| `/kitchen/recipes/review` | Recipe review | `REVIEW.EXE` | Line-art magnifier over a page | Kitchen folder (Camp) | Icon (conditional) | Only when `canApproveRecipe(rank, ledTeams)`: a captain or a Kitchen lead (`packages/core/src/recipes.ts:46-54`). The page gates at `team_lead` (`app/(console)/kitchen/recipes/review/page.tsx:258`) then refuses others (`:285`) | L | Single | Suggestions to decide; batch send to Claude; older drafts | `/kitchen/recipes/review` | Hard. `maxDuration = 300` (`:49`) stays on this route; the run starts in this request's `after()` |
| `/kitchen/recipes/[id]` | the recipe's name | `<NAME>.RCP` | none | none | Child of Recipes or Recipe review | Every approved member for an accepted recipe; the submitter and reviewers at any status; everyone else 404 (`app/(console)/kitchen/recipes/[id]/page.tsx:560-576`) | L | Multi (recipe id) | `Recipe` / `History` tabs (`?tab=history`), plate chips (`?plates=`), decision rail for reviewers | `/kitchen/recipes/<id>?plates=40` | Hard. `maxDuration = 300` (`:63`); proofread poll; sticky rail must stick to the window body |
| `/kitchen/recipes/[id]/edit` | Edit recipe | `RECIPE.WRI` | none | none | Child of the recipe | Reviewers only: `captainPageGate("team_lead")` then `canApproveRecipe` (`app/(console)/kitchen/recipes/[id]/edit/page.tsx:44-49`). Non-editable status is 404 (`:65`) | Max | Multi (recipe id) | Four Tiptap sections, questions dialog, run panel | `/kitchen/recipes/<id>/edit` | Hard. Tiptap, 1 s poll, needs the dirty guard and draft autosave; desktop shortcuts must not steal keys |
| `/kitchen/recipes/[id]/versions/[version]` | the recipe's name, version n | `<NAME>.V<n>` | none | none | Child of the recipe | Same visibility as the recipe (`.../versions/[version]/page.tsx:49-59`). "Adjust with Claude" if `canRunProofread` | M | Multi (id + version) | Reader, lessons, add lesson | `/kitchen/recipes/<id>/versions/<n>` | Easy. `maxDuration = 300` (`:20`) |
| `/kitchen/recipes/[id]/sources/[version]` | Recipe source | `SOURCE.TXT` | none | none | Child of the recipe | Submitter or reviewer only; everyone else 404 (`.../sources/[version]/page.tsx:53-54`) | M | Multi (id + version) | none | `/kitchen/recipes/<id>/sources/<n>` | Easy |
| `/kitchen/meal-plan` | Meal plan | `MEALPLAN.XLS` | Line-art grid with a plate | Kitchen folder (Camp) | Icon | Every approved member reads (`app/(console)/kitchen/meal-plan/page.tsx:23`). Editing: `canEditMealPlan` (`:35`), a captain or Kitchen lead. Not in today's nav; linked from the recipe book | L | Single | Day-by-meal grid | `/kitchen/meal-plan` | Medium. Wide grid; dirty guard and draft autosave |

### Captains and leads

| Route | Program | File name | Icon idea | Group or folder | Kind | Who sees it, and why | Size | Instances | Sub-views in the window | Deep link | Difficulty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/captains/questionnaires` | Questionnaires | `FORMS.EXE` | Line-art clipboard | Captains folder | Icon | `team_lead` or captain: `captainPageGate("team_lead")` (`app/(console)/captains/questionnaires/page.tsx:43`), which clears any lead. Results links only for a captain (`:62`) | M | Single | Definition list; new, duplicate, delete draft | `/captains/questionnaires` | Medium. Create must open Edit questionnaire as a child |
| `/captains/questionnaires/[key]` | Edit questionnaire | `QBUILD.EXE` | none | none | Child of Questionnaires | `captainPageGate("team_lead")` (`.../[key]/page.tsx:31`), then author or captain; a second lock otherwise. 404 on unknown key (`:63,78`) | Max | Multi (key) | Sections, blocks, rules, lifecycle controls | `/captains/questionnaires/<key>` | Hard. dnd-kit; image upload; its document-wide `useLeaveGuard` must become `useWindowDirty` |
| `/captains/questionnaires/[key]/preview` | Preview | `QVIEW.EXE` | none | none | Child of Edit questionnaire | `captainPageGate("team_lead")` (`.../preview/page.tsx:29`) then `canViewBuilderDefinition`; 404 otherwise (`:53-60`) | S | Multi (key) | none | `/captains/questionnaires/<key>/preview` | Easy |
| `/captains/questionnaires/[key]/send` | Send questionnaire | `QSEND.EXE` | none | none | Child of Questionnaires or Edit questionnaire | `captainPageGate("team_lead")` (`.../send/page.tsx:52`); a lead also needs led teams (`:68`) or gets a lock | M | Multi (key) | Audience, team and member pickers, blocking, due date; "Block everyone?" dialog | `/captains/questionnaires/<key>/send?…prefill` | Medium |
| `/captains/questionnaires/[key]/metrics` | Results, Summary tab | `QSTATS.EXE` | none | none | Child of Questionnaires (captain only) | Captain only: `loadResults` calls `captainPageGate("captain")` (`.../metrics/results-data.ts:70`) | Max | Multi (key), shared with `/responses` | `Summary` / `Individual` tabs, year switch (`?cycle=`), remind, close send, CSV | `/captains/questionnaires/<key>/metrics?cycle=<n>` | Medium. Wide table |
| `/captains/questionnaires/[key]/responses` | Results, Individual tab | `QSTATS.EXE` | n/a | n/a | Tab | Same captain gate via `loadResults` | Max | Same window as metrics | Per-member rows, View dialog | `/captains/questionnaires/<key>/responses?cycle=<n>` | Medium |
| `/captains/questionnaires/[key]/responses/[userId]` | Answers: the member's name | `ANSWERS.TXT` | none | none | Child of Results | Captain via `loadResults`; 404 if no answer columns (`.../responses/[userId]/page.tsx:101`) | S | Multi (key + user + cycle) | none | `/captains/questionnaires/<key>/responses/<userId>?cycle=<n>` | Easy |
| `/captains/announcements` | Announcements | `BROADCAST.EXE` | Line-art megaphone | Captains folder | Icon | Captain or any `team_lead`, as the nav does today (`apps/web/lib/console-nav.ts:88-90`). The page clears a lead with at least one led team (`app/(console)/captains/announcements/page.tsx:24-33`), and every lead has one, because lead status comes from their led memberships. Its `Team.safeParse` filter is defensive only. A lead addresses only teams they lead (`canSendToAudience`) | L | Single | Composer, drafts, published list, pin controls, recorder | `/captains/announcements` | Medium. Dirty guard and draft autosave; the microphone must stop on close; pinning must refresh the manifest |
| `/captains/calendar` | New event | `NEWEVENT.EXE` | Line-art calendar with a plus | Captains folder (and a button in Calendar) | Icon | Captain or any `team_lead` (`app/(console)/captains/calendar/page.tsx:28-36`). Edge case: the composer offers only *active* teams the lead leads (`:40-45`), so a lead whose only led team is archived gets an empty picker today; the window opens with an explanation instead. Not in `CONSOLE_NAV`; linked from Home's Add event tile (`apps/web/lib/home.ts:441`) and the Calendar page's Add event button (`app/(console)/calendar/page.tsx:109`, shown to any rank above `camp_member`) | S | Single | Event form | `/captains/calendar` | Easy. Its `router.push('/')` after save focuses the desktop; the New event window stays open as a background frame (decision 7) |
| `/captains/overview` | Camp overview | `CAMPSTAT.EXE` | Line-art bar chart | Captains folder | Icon | Captain only: `captainPageGate("captain")` (`app/(console)/captains/overview/page.tsx:98`) | L | Single | Status board, readiness funnel, recent activity. The section-card grid is dropped: the desktop is the launcher | `/captains/overview` | Easy |
| `/captains/payments` | Payments | `LEDGER.DB` | Line-art ledger with an R | Captains folder | Icon | Captain only (`app/(console)/captains/payments/page.tsx:21`) | L | Single | Payments table, record form | `/captains/payments` | Medium. A write should refresh Roster (dues) |
| `/captains/camp-settings` | Camp settings | `SETTINGS.CPL` | Line-art sliders | Captains folder | Icon | Captain only (`app/(console)/captains/camp-settings/page.tsx:30`) | M | Single, shared with `/cycle` | `Teams` applet, `Year` applet | `/captains/camp-settings` | Easy. Team changes must refresh the manifest (team icons) |
| `/captains/camp-settings/cycle` | Camp settings, Year | `SETTINGS.CPL` | n/a | n/a | Tab | Captain only (`.../cycle/page.tsx:25`) | M | Same window | Founding year, or rollover plan and confirm | `/captains/camp-settings/cycle` | Medium. A rollover changes every member's teams and leads; the desktop must reload its manifest |
| `/captains/join-site` | Join site | `JOINSITE.EXE` | Line-art globe in a window | Captains folder | Icon | Captain only (`app/(console)/captains/join-site/page.tsx:18`) | L | Single | One section per Join window, burn dates, team lines | `/captains/join-site#<section>` | Easy. Hash anchors must scroll the window body |
| `/captains/audit` | Audit log | `AUDIT.LOG` | Line-art scroll | Captains folder | Icon | Captain only (`app/(console)/captains/audit/page.tsx:60`) | L | Single | Paged log (`?before=`) | `/captains/audit?before=<cursor>` | Easy |
| `/captains/system` | System status | `SYSMON.EXE` | Line-art heartbeat line | Captains folder | Icon | The page stays captain only (`app/(console)/captains/system/page.tsx:38`). Its tray warning is for every accepted member (owner, 2026-09-25): a non-captain gets a coarse `ok`/`warning` flag from the server and an icon that says something is not working, with no link and no details; a captain gets the count and the icon opens this page | M | Single | Core services, optional services, background work | `/captains/system` | Easy. The member flag is derived without the 5 s database probe (`apps/web/lib/system-probe.ts`), because every member's page computes it |
| `/captains/tools` | none | none | none | none | Redirect | `permanentRedirect("/")` (`app/(console)/captains/tools/page.tsx:8`) | n/a | n/a | n/a | Old bookmarks go to the desktop | None. Keep it |

### Questionnaire runner (inside `(console)`, two modes)

| Route | Program | File name | Icon idea | Group or folder | Kind | Who sees it, and why | Size | Instances | Sub-views in the window | Deep link | Difficulty |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/questionnaires/[activationId]` (optional send) | the questionnaire's title | `<TITLE>.FRM` | none (a Today to-do and an Inbox row launch it) | none | Child | A member whose own `required_actions` row for this activation is pending; gate is `hasCampAccess` (`app/(console)/questionnaires/[activationId]/page.tsx:41`), then an earlier blocking gate wins (`:76`) | M | Multi (activation id) | Multi-page runner | `/questionnaires/<uuid>` (push, email, reminders) | Medium. Dirty guard. Answers are never stored in the browser |
| `/questionnaires/[activationId]` (blocking send) | Blocking form, on top of everything | `<TITLE>.FRM` | n/a | n/a | System | Owner, 2026-09-25: it sits on top of everything with the desktop visible but inert behind it. The layout's held branch draws the desktop without pins, counts, Today, badges or last-seen copies, and the runner in the blocking layer: no close, Esc does nothing, focus trapped. A member held mid-session renders a `<HeldScreen>` marker: `<Desktop>` switches to held mode at once and calls `router.refresh()` into the held branch (design doc, section 1). The server redirect is still the gate. See "Blocking-gate programs" below | A centred window on desktop; full screen on phones | n/a | Runner, Sign out only | `/questionnaires/<uuid>` | Medium. The desktop behind must stay inert and show nothing live, on a hard load or mid-session |
| `/questionnaires/[activationId]/complete` | Last page of the form wizard | none | none | none | Child or System | Own row completed for this activation, else back to the runner (`.../complete/page.tsx:48`). Stays in the blocking layer, with the same `<HeldScreen>` marker, while the member is still held | M | Same key as its runner | "More required" or "All done"; the queue | `/questionnaires/<uuid>/complete` | Easy. "Continue to desktop" is where boot may play (decision 6) |

### Count check

The five tables above cover all 50 `(console)` pages that exist today, plus
the two new Terminal pages (`/terminal`, `/terminal/inkblot`, added in PR C).
The remaining 9 pages (`auth`, `auth/[path]`, `mcp/connect`,
`onboarding/questionnaire`, `pending-approval`, `privacy`, `setup`,
`signup/required`, `terms`) are in the last two sections. A drift test in PR B (migration plan) fails when a new
`(console)/**/page.tsx` has no entry in `apps/web/lib/program-routes.ts`.

## Icons per person: example desktops

These use the default program set from the design doc, the groups above and
plain names, in the default layout (before the member moves anything). They
assume the recommended answers: hidden, not locked (decision 2); a My lift
program for drivers (decision 11). Team folders follow decision 8, ruled. Teams in the examples are illustrative, but use real
keys from `teamEnum` (`packages/db/src/schema.ts:96`); active teams come from
camp settings. The Today gadget is closed by default on every desktop; its
handle sits on the right edge.

### 1. A new member waiting for approval

Facts: has redeemed an invite, finished the burner profile,
`approvalStatus = 'pending'`. Earlier holds (no invite, profile not done) show
no desktop at all; see "Blocking-gate programs".

Today the layout gives this person a bare content column
(`app/(console)/layout.tsx:37-38`) and Home renders a reduced model.

Desktop (restricted mode):
- **Me**: Inbox. It opens because `/notifications` gates on `hasCampAccess`
  only (`app/(console)/notifications/page.tsx:79`).
- The Today gadget, with only the setup checklist (`buildHome` skips teams,
  tasks, lift and calendar while waiting).
- A tray balloon: "Application submitted".
- Start menu: Inbox, Report a problem, Log off.
- No pins and no system-health tray item (restricted mode). No Terminal.

No Camp group, no folders. Every other page redirects them to
`/pending-approval` through `requireMemberPage`, so no other icon would open.

The restricted desktop is only for `approvalStatus = 'pending'`. A rejected
applicant gets the bare branch everywhere (persona list below).

### 2. A plain member

Facts: approved, `rank = 'member'`, on the Structures team this year, leads
nothing, not a driver.

- **Me**: Inbox, My forms, My account, Invites.
- **Team folders** (right-hand side): Structures team, holding the
  Structures page.
- **Camp**: Tasks (no Add button, `addTeams` is empty), Calendar (no "Add
  event"), Roster (public projection), Meetings, Family tree, Power
  (read-only); the Teams folder with every active team; the Kitchen folder
  with Recipes and Meal plan (read-only), no Recipe review.
- **Terminal**.
- Pins in their strip and tray item; the coarse system-health icon when
  something is wrong (no details, no link).

No Captains folder: their rank is `camp_member`, below every program in it.

### 3. A Kitchen team lead who is also a driver

Facts: approved, `rank = 'member'`, leads Kitchen this year, so the viewer rank
is `team_lead`. `driver_profiles.intends_to_drive = true`.

Everything the plain member has, plus:
- **Team folders**: Kitchen team first, tagged LEAD (led teams first),
  holding Kitchen, Recipes, Meal plan and Recipe review.
- **Me**: My lift (their own car or lift, from `getMyLift`), if the owner
  takes decision 11 A.
  `getMyLift` returns null under the E2E test store today
  (`apps/web/lib/lifts.ts:13`), so PR B adds its test-store twin. If the owner
  picks B (defer), the driver shows only as the "Driver" chip and the lift
  card in the Today gadget, as on Home today.
- **Camp**: the Kitchen folder gains Recipe review, because
  `canApproveRecipe("team_lead", ["kitchen"])` is true
  (`packages/core/src/recipes.ts:52`). Meal plan opens editable
  (`canEditMealPlan`), and Recipes shows the review count. Roster also shows
  "This year" status, read-only
  (`app/(console)/captains/camp-management/page.tsx:58`). Tasks lets them add
  tasks for Kitchen. Power stays read-only: `canEditPower` needs Power &
  Lighting (`packages/core/src/power.ts:40`).
- **Captains** folder: Questionnaires, Announcements and New event, as for
  any `team_lead`. Announcements can address only the Kitchen team
  (`canSendToAudience`).

Not shown: Results and every captain-only program. The questionnaire hub
hides results links from a lead (`app/(console)/captains/questionnaires/page.tsx:62`).

### 4. A captain

Facts: `rank = 'captain'`. Their own teams still get team folders on the
right. The fullest desktop of the four.

Everything above, with every edit on:
- Recipe review (captains pass `canApproveRecipe`), editable Meal plan and
  Power, the full Roster with triage, Family tree with invite codes, Invites
  with every code and pre-approve.
- **Captains** folder: Questionnaires, Announcements, New event, Camp
  overview, Payments, Camp settings, Join site, Audit log, System status.
- Child windows they can reach that others cannot: Results, and a
  respondent's Answers.
- The system-health tray icon with details: the warning count, and it opens
  System status.

A founder address (`FOUNDER_EMAILS`) adds nothing here. It only bypasses the
invite and approval gates (`apps/web/lib/access-control.ts`).

### 5. More personas to cover (not drawn in full)

These exercise the predicates the four above do not. Each becomes a
`buildProgramManifest` fixture in PR B, seeded from the `Team` and rank
constants, never from string literals.

- **A Power & Lighting lead.** Viewer rank `team_lead`; Power opens editable
  (`canEditPower`, `packages/core/src/power.ts:40`); no Recipe review and a
  read-only Meal plan (not Kitchen); the Captains folder with Questionnaires,
  Announcements and New event, Announcements addressing only Power &
  Lighting.
- **A lead whose only led team is archived.** Viewer rank `team_lead`, so the
  Captains folder holds Questionnaires, Announcements and New event. The team
  is not in the Teams folder (active teams only). New event opens with an
  explanation instead of today's empty team picker
  (`app/(console)/captains/calendar/page.tsx:40-45`).
- **A member just after the year rollover.** No team memberships and no lead
  flag in the new cycle, so no team folders, no Captains folder and no lead
  programs, even if they led a team last year.
- **A rejected applicant.** No desktop anywhere: the layout's bare branch.
  `/` sends them to `/pending-approval` (row 4b below). `/notifications` and
  `/announcements/<id>` still open for them (both gate on `hasCampAccess`
  only), but bare, never as a restricted desktop that says "Application
  submitted". An E2E case in PR C asserts it.
- **A lead of several teams.** One team folder per team, each tagged LEAD;
  the account chip says "Leads 3 teams", with the names on hover.
- **A captain who also leads a team.** The captain desktop, plus their led
  team's folder first on the right, tagged LEAD; Announcements is
  unrestricted (captain rule wins).
- **A founder before bootstrap.** No captain exists yet, so `/` sends them to
  `/setup` (Setup, row 0 below); no desktop until it finishes.

### On a phone

The same groups, as a home screen of big icons: Me, Camp, Captains (with
Terminal), then a "My teams" row with the member's team folders. No member
folders or shortcuts (desktop only), and no moving icons. Folders open as
full-screen sheets; programs open full
screen with a big Back/Close; a bottom bar holds Home, Open programs, the
inbox bell and Today (a sheet). Design doc, section 5.

## Team programs

The owner, 2026-09-25: "each team lead will actually be telling me how they
want their module to be set up." So the team windows (`/teams/<key>`) are
**bespoke per team**:

- The shell (PR C) ships every team with today's shared page, in a window.
- After the shell ships, each team's program is shaped with that team's lead,
  one team at a time, each its own PR. This follows the standing direction
  that each team gets its own dashboard (memory:
  `teams-bespoke-dashboards-and-task-board.md`).
- Bespoke over generic (AGENTS.md): a team program is its own component and,
  where it needs one, its own table. No configurable "team page builder".
- A team program keeps its route, gate and group; only the window body
  changes. Kitchen still needs the owner's layout approval first.
- The same talk with each lead settles which tools that team's folder holds
  (the starting set is in "Team folders" above).

## Pages that stay outside the desktop

These keep their routes, their look (unless the owner rules otherwise in the
skin PR, design doc decision 5) and their server behaviour. None of them gets a
taskbar (the blocking questionnaire, which is not in this table, shows an
inert one behind its form).

| Route | File | Why it stays outside |
| --- | --- | --- |
| `/` signed out | `app/(console)/page.tsx:35-37` → `app/landing-hero.tsx` | Owner ruling 2026-09-23: the landing keeps its own glitch design and is not restyled. The layout already returns it bare (`app/(console)/layout.tsx:40-41`) |
| `/auth` | `app/auth/page.tsx:28-29` | Redirect-only endpoint for the Google callback and the OAuth proxy. The URL is a contract |
| `/auth/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/sign-out` | `app/auth/[path]/page.tsx` | Email links, Google, passkey origin rules and `?next=` need these exact URLs and full page loads. Log off in the Start menu reuses `SignOutLink` (`apps/web/components/auth/sign-out-link.tsx`), never a plain `/auth/sign-out` href, so the device's push token is removed first |
| `/mcp/connect` | `app/mcp/connect/page.tsx` | A sign-in bridge for the Claude connector. It hard-navigates to an API route |
| `/privacy`, `/terms` | `app/privacy/page.tsx`, `app/terms/page.tsx` | Must stay public for Google's consent-screen checks. They may also appear in the Start menu under Help as Privacy and Terms, rendering the same component |
| root `not-found` and `error` | `app/not-found.tsx`, `app/error.tsx` | Stay as full-screen fallbacks. New `app/(console)/not-found.tsx` ("Page not found") and `error.tsx` ("Tasks stopped responding", with the program's plain name) render inside the focused window instead (design doc) |
| `global-error` | `app/global-error.tsx` | Cannot depend on the shell or its CSS |

## Blocking-gate programs

The member ladder is URL-based: `memberBlock` / `nextGate` return an href and
`requireMemberPage` redirects every page to it (`apps/web/lib/member-gate.ts`).
So every gate stays a route, and the layout never redirects, so gates
cannot loop. The gates outside `(console)` (invite, burner profile, pending
approval) own the whole screen as today. The blocking questionnaire, inside
`(console)`, now draws on top of an inert desktop (owner, 2026-09-25; design
doc, section 1). Only the picture changed: every other member page still
redirects to it. A member held mid-session is caught by the `<HeldScreen>`
marker on the runner and its `/complete` page.

Their look is decision 5. The shells do not map onto the gates one to one:
`GateScreen` draws `/pending-approval`, the onboarding gate's intro only, the
setup wizard and the root 404/error; `AuthShell` draws the sign-in pages,
`/signup/required` and `/mcp/connect`; the blocking runner and the onboarding
wizard use neither. Recommended (A): restyle `GateScreen`, and split
`AuthShell` so `/signup/required` changes while the sign-in pages keep
today's look; the runner and the wizard are their own items. A2 also
restyles the sign-in pages; B leaves all of them as they are. Either way it
is a look, not a structure change.

| Order | Route | System window | Who lands here | Closable | Notes |
| --- | --- | --- | --- | --- | --- |
| 0 | `/setup` | Setup (`SETUP.EXE`), a first-run installer | The first signed-in person on a camp with no captain (`app/(console)/page.tsx:42-44`; `app/setup/page.tsx:28-30`) | No | Runs once per deployment. No E2E spec today, only unit tests |
| 1 | `/signup/required` | Invite code (`INVITE.EXE`), an "enter your code" dialog | Signed in, no camp access (`app/signup/required/page.tsx:37-38` sends others away) | No; Sign out only | Shares `AuthShell` with the sign-in pages. Under decision 5 A, `AuthShell` is split so this page changes and the sign-in pages do not |
| 2 | `/onboarding/questionnaire` (`?start=1`) | Burner profile (`BURNER.EXE`), a setup wizard | Camp access, burner profile not done (`app/onboarding/questionnaire/page.tsx:43-54`) | No; Sign out only | Finishing it must refresh the layout so the desktop appears (the 12eb18e fix) |
| 3 | `/questionnaires/[activationId]` (blocking) | The questionnaire's title, as a system window | A pending blocking send for this member (`app/(console)/questionnaires/[activationId]/page.tsx:76`) | No; Sign out only | Lives inside `(console)`. Drawn in the blocking layer over an inert desktop that shows nothing live (wallpaper only for a member not yet approved). Esc does nothing and focus is trapped. If the member was held mid-session, its `<HeldScreen>` marker switches the desktop to held mode and refreshes the layout. The completion page's "Continue to desktop" hands back |
| 4a | `/pending-approval` (pending) | `/` shows the restricted desktop (`app/(console)/page.tsx:49-51`), but every other member page still redirects here (`requireMemberPage`, `apps/web/lib/member-gate.ts:51,92`). This route lives outside `(console)` and renders the "Application submitted" `GateScreen` (`app/pending-approval/page.tsx:52-58`), which leaves the desktop | Pending applicant who follows any link other than `/`, `/notifications` or an announcement | No; Log off only | Stays a full-screen gate route. Its look follows decision 5 (`GateScreen`) |
| 4b | `/pending-approval` (rejected) | `ACCESS DENIED` screen with the captain's reason | Rejected applicant (`app/pending-approval/page.tsx`). They never get a desktop, restricted or full | No; Log off only | Terminal state. Look follows decision 5 |

Above all of these, and above every window, sit the root-layout overlays
(`app/layout.tsx`): `AcknowledgementGate` (a system-modal takeover that also
makes `#os-desktop` inert), `FeedbackGate` and the `Toaster`. They stay in the
root layout so they still work on the gate screens.

## Owner decisions this catalogue depends on

All are listed, with options and recommendations, in the design doc's
"Decisions" section. The ones that change this file:

- **1** Ruled 2026-09-25: the Classic desktop. Groups, plain names, the
  Terminal and the phone home screen above follow the owner's feedback on it.
- **2** Hidden or locked icons. This file assumes hidden (A).
- **3** Ruled 2026-09-25: the last-seen copy (A).
- **7** Window cap and document reuse. This file assumes a cap of 8 and one
  window per document (A).
- **8** Ruled 2026-09-25: own teams as team folders on the right-hand side,
  tagged LEAD, with a "My teams" row on the phone.
- **9** Plain names are settled by the owner's feedback. Left open: whether
  the File name column shows as a quiet suffix on the window title chip (B,
  recommended on desktop) or only in the Terminal (A). Either way the title
  bar is not a heading, so it never double-matches the page's `h1`.
- **11** A My lift program for drivers, with a `getMyLift` test-store twin in
  PR B (A), or an explicit deferral (B).
- **13** No Finance program for the Finance lead in this work (A); Payments
  stays captain-only.
- **14** Ruled 2026-09-25: icons move, and members make their own folders
  and shortcuts (desktop only). Open: where the layout is stored (browser
  recommended).
