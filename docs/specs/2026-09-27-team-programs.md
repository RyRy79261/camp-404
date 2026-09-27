# Team programs on the 404 OS desktop

Status: first version built, 2026-09-27 (PR "feat(teams): every team gets its
own program"). Proposal read from `origin/main` at `2834404`; the owner's
rulings of 2026-09-27 are under "Decisions" below and replace the open
questions the proposal ended with.

## What the owner asked for

Each camp team gets its **own** program on the desktop. It is bespoke, not a
generic team engine (AGENTS.md, "Bespoke over generic"; owner, 2026-09-23:
"I don't want to have a generalized team thing yet because each team will
have their own control interface"). Teams stay defined in code.

- **Every approved member can open any team's program, read-only** (owner's
  decision 2, 2026-09-26).
- **Only the team's leads and the captains can change things in it.**
  `team_lead` clearance stays global. Team identity only decides which team
  a lead may act for, as `canApproveRecipe` does for the Kitchen and
  `canEditPower` does for Power.
- Each program is shaped with that team's lead, one team at a time (design
  doc, section 4: "Team programs are bespoke per team").

## 1. The teams, and what each has today

There are 14 teams. They come from `teamEnum` (`packages/db/src/schema.ts:98`)
and the `Team` Zod enum (`packages/types/src/roles.ts`). Their names, order
and archived flag are camp settings (`DEFAULT_TEAMS` in
`packages/db/src/camp-config.ts`). Captains can rename or archive a team, but
cannot add one.

Every team already has these, from the same code:

- **A team page**, `/teams/[key]`, shown as `TEAM.EXE`. It is one shared page
  (#267's "common frame", built with #268). It has four cards: Coming up (the
  team's calendar events), Open tasks (the team's cards from `/tasks`),
  Meetings (with New meeting for the team's members and captains), and People
  this year (leads and members).
- **An icon in the Teams folder** (Camp column) for every active team.
- **A team folder on the right-hand side** for each team the member is on this
  year ("Kitchen team", tagged LEAD for a lead). It holds the team page, plus
  `TEAM_TOOLS` (`apps/web/lib/programs.ts`) when the member may open them.
- **Calendar events** named "`<Team>` Team - …" (`teamEventTitle`), filtered
  with `/calendar?team=<key>`.
- **Tasks** carry a `team`. Captains add tasks for any team, a lead only for
  the teams they lead.
- **Announcements** can be sent to one team (scope `team`). Only that team's
  members receive them. [CORRECTION 2026-09-27] Since ruling 3 they are also
  listed on the team's program, for every member to read.
- **Meeting notes** (`/meetings?team=`), which use `canWorkInTeam` (team
  members and captains).
- The tables `team_budgets`, `reimbursements`, `inventory_items` and
  `documents` have a `team` column, but no screen uses them yet.

What each team has beyond that:

| Team (key)                                          | Its own tools today                                                                                                                 | Team-folder tools (`TEAM_TOOLS`)                                              | Planned in the epics                                                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Kitchen (`kitchen`)                                 | Recipe book, recipe review, source editor with Claude proofreading, meal plan (`/kitchen/**`, #262). Kitchen leads and captains act | Recipes, Meal plan, Recipe review                                             | #243 sub-recipes and batch prep, #244 menu planner (partly the meal plan), snacks section, #245 shopping list, dietary cross-check and costing |
| Structures (`structures`)                           | None                                                                                                                                | None                                                                          | None named. Inventory (#246) and the layout builder (#271) touch it                                                                            |
| Power and Lighting (`power_and_lighting`)           | Load list and fuel estimate (`/power/loads`, `/power/fuel`, #263). P&L leads and captains edit (`canEditPower`)                     | Power                                                                         | #255 fuel stock and refuelling log, #256 grid plan (circuits, cables), #257 generator readiness and sharing                                    |
| Sanitation and MOOP (`sanitation_and_water`)        | None                                                                                                                                | None                                                                          | None named. Survival Guide chapters on MOOP and bins (#250)                                                                                    |
| Safety (`health_and_safety`)                        | None. Safety data is read through the roster, not a team tool                                                                       | None                                                                          | None named. Safety playbook chapter (#250)                                                                                                     |
| Art and Activities (`art_and_activities`)           | None                                                                                                                                | None                                                                          | Parking lot: art-project and grant register (#235)                                                                                             |
| Ministry of Memes (`ministry_of_memes`)             | None                                                                                                                                | None                                                                          | None                                                                                                                                           |
| Ministry of Vibes (`ministry_of_vibes`)             | None. `workshops` tables exist, unused                                                                                              | None                                                                          | #269 activity and DJ offers, the lounge programme grid                                                                                         |
| Finance (`finance`)                                 | None of its own. Payments (`/captains/payments`) is captain-only                                                                    | Payments (captains only)                                                      | #240 dues and refunds, #242 budgets (discovery first) and reimbursements. #267 says: link, don't copy                                          |
| Transport and Logistics (`transport_and_logistics`) | None of its own. My lift (`/lift`) shows a member their own car                                                                     | None                                                                          | #270 cars, trailers, drivers, riders, and a driver messaging their car. #247 logistics calendar                                                |
| Communications & HR (`communications_and_hr`)       | None of its own                                                                                                                     | Announcements, Questionnaires, Join site (camp-wide tools, at their own bars) | None named                                                                                                                                     |
| Mutant Vehicle (`mutant_vehicle`)                   | None                                                                                                                                | None                                                                          | None named. MV registration deadline in #247                                                                                                   |
| Sound (`sound`)                                     | None                                                                                                                                | None                                                                          | None named                                                                                                                                     |
| Water (`water`)                                     | None                                                                                                                                | None                                                                          | None named. Water intent deadline in #247                                                                                                      |

Epic state on 2026-09-27. #236 and #237 are closed. #266 is closed. Power
#263 and Kitchen #262 are merged, but #243, #244, #252 and #253–#257 are
still open as issues. #267 (team dashboards), #268 (meeting notes, built),
#269, #270 and #271 are open.

## 2. What the epics say, and where they now disagree

- **#267 (team dashboards)** asks for the common frame (built), plus a remit
  line, the team's links [CORRECTION 2026-09-27: no links, see ruling 6], a
  budget summary after #242, a start-of-year lead
  checklist, and a team tools area under the frame. Nothing after the frame is
  built.
- **Who may act.** #267 (2026-09-24) says **team members** work in a team's
  tools (`canWorkInTeam`). Meeting notes are built that way, and so are #269
  and #270. The owner's current ask is **leads and captains**, which matches
  Power (`canEditPower`), the Kitchen review (`canApproveRecipe`) and adding
  tasks. This is question 1 below.
- **Finance** (#242 owner note): budgets start with discovery. The Finance
  dashboard links to the money screens. Each team shows its own budget
  summary only once the budget model is settled.
- **Kitchen**: sub-recipes and batch prep (#243 note), and snacks as their own
  section (#244 note). No Kitchen screen may be built until the owner approves
  its layout (he rejected two layouts on 2026-09-24).
- **Power**: the MVP (#253, #254) shipped in #263. #255–#257 remain.
- **Transport** (#270) needs a new broadcast audience (`car`) in
  `canSendToAudience`. That is a security-sensitive change, not a first slice.

## 3. What a team's folder and program show today, and what's missing

Today:

- Every team's program is the **same page**. Kitchen and Sound look the same
  apart from their data.
- A team folder holds that page and, for four teams only, shortcuts to
  camp-wide tools.

Missing:

- **Anything specific to the team**, even on the teams that have tools.
  - The Power program does not show the power plan's headline figures (peak
    load, generator load, fuel for the burn). You must open Power to see them.
  - The Kitchen program does not show the meal plan or the recipes waiting
    for review.
- **The team's announcements.** Nothing lists what a team has sent.
- **A line saying what the team does (its remit).** There is no column for
  it yet. (The team's links were also listed here; the owner ruled them out,
  ruling 6.)
- **Authority shown on the page.** "You lead this team" is shown as a badge,
  but the page gives a lead no tools of its own, only New meeting.
- **Ten teams have no tools at all.** Their folder holds only their page.

## 4. Proposal

### The shape

Each team gets its own program component (for example
`components/teams/power-program.tsx`). `/teams/[key]` stays the route and the
window. The page picks the team's own component by key from a code map.
Teams without one keep today's shared page. It is a map in code, not a
configurable engine. Each program:

- reuses the existing cards (Coming up, Open tasks, Meetings, People) where
  they fit, so a first version is mostly composition;
- adds at most one or two panels of its own, read from data that already
  exists;
- shows edit controls only to captains and the team's leads. Each action
  still runs its own gate on the server (a team folder is a shortcut, never a
  grant).

The look follows AGENTS.md "Design" as corrected on 2026-09-26: copy the
**nearest existing program window**, which is today's team page (Home's
layout: main cards on the left, people on the right), with the soft in-window
colours. The older rule, "copy AfrikaBurn's nearest page", is kept only as a
record. The AfrikaBurn repo exists at
`/home/ryan/repos/Personal/afrikaburn-contributors-app`. Its nearest page is
the registration detail page, `apps/org/app/(console)/registrations/[id]/page.tsx`:
one group's page, with its details, its people and an action card
(Placement). The team page already follows that composition, and the console
dashboard `apps/org/app/(console)/page.tsx` (KPI cards, then a grid of cards)
is the model for a figures row.

### A first version per team (only data that exists)

| Team                                                                                                             | Panels (first version)                                                                                                                                                                                                                                                         | Later tools (from the epics)                                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Power and Lighting**                                                                                           | 1. **Power plan at a glance**: peak load, generator load % with its green/amber/red band, litres and jerry cans for the burn, from `powerTotals`, `generatorLoadPct` and `fuelForPlan` in `@camp404/core`. Links to Load list and Fuel. 2. Coming up and Open tasks. 3. People | #255 fuel log, #256 grid plan, #257 readiness and sharing                                                             |
| **Kitchen**                                                                                                      | 1. **This year's meal plan** in short (days, plates per meal) and **recipes waiting for review** (count, visible to all, actions for reviewers). 2. Coming up and Open tasks. 3. People. _Layout needs the owner's approval first_                                             | Snacks, #244 menu planner, #245 shopping list, batch prep                                                             |
| **Transport and Logistics**                                                                                      | 1. **Cars this year**: drivers, seats offered and seats left, riders count, from `driver_profiles` and `car_members` (names and cars only). 2. Coming up and Open tasks. 3. People                                                                                             | #270 trailers, matching, the `car` message audience. #247 logistics calendar                                          |
| **Finance**                                                                                                      | 1. Links to Payments (captains) and a plain "budgets are being worked out" note. 2. Coming up and Open tasks. 3. People                                                                                                                                                        | #240 dues and refunds, #242 claims, then budgets after discovery                                                      |
| **Ministry of Vibes**                                                                                            | Coming up, Open tasks, People (the shared page)                                                                                                                                                                                                                                | #269 offers and lounge programme                                                                                      |
| **Communications & HR**                                                                                          | Shared page, plus its folder's links (Announcements, Questionnaires, Join site)                                                                                                                                                                                                | None named                                                                                                            |
| **Structures, Sanitation and MOOP, Safety, Art and Activities, Ministry of Memes, Mutant Vehicle, Sound, Water** | Shared page, until each lead says what they need                                                                                                                                                                                                                               | Inventory for the team (#246), Survival Guide chapters (#250), the layout builder (#271), AfrikaBurn deadlines (#247) |

**Announcements on a program.** [CORRECTION 2026-09-27] The owner ruled that
every member reads a team's announcements on its program (ruling 3 below).
Who receives them does not change.

### Build first: Power and Lighting

- **Its tools exist and are merged** (#263), so the first version is a
  read-only summary of data that already exists, plus links. The panel needs
  no new schema and no new permission (the description table of ruling 4 is
  shared by every team).
- **Its rule is already the one the owner asked for.** `canEditPower` lets a
  P&L lead or a captain edit and lets everyone else read. No predicate needs
  changing.
- **Kitchen is blocked.** The owner must approve any Kitchen layout first, and
  rejected two.
- **Transport needs new security work.** It needs a new audience scope and a
  lock on the car's riders, which is too much for a first slice.
- The pattern it sets (a code map by key, the shared cards, one own panel,
  edit only for leads and captains) is then copied team by team.

## Decisions (owner, 2026-09-27)

The five questions the proposal ended with are answered, and a sixth ruling
came with the review; all six are built in the first version.

1. **Who may change things in a team's program: only a lead OF THAT TEAM, or a
   captain.** Team identity decides authority here, as `canApproveRecipe` and
   `canEditPower` do. The rule is one pure, tested function,
   `canEditTeamProgram(rank, ledTeams, teamKey)` in
   `packages/core/src/team-programs.ts`, and it fails closed (an unknown rank
   or a key that is not a team answers no, a captain's included). Surfaces
   that already exist keep their own rules: meeting notes stay open to the
   team's members this year (`canWorkInTeam`), which is wider than this
   ruling. The owner settled it on
   review (2026-09-27): meeting notes can be added by anyone on the team, as
   today. Ruling 1's "leads and captains" covers the team program's own tools
   and its description, not meeting notes.
2. **Power and Lighting goes first.** Its program has a read-only "Power plan
   at a glance" panel: peak load, generator load (% of rated kVA with its
   green/amber/red band), litres for the burn (with the safety margin) and
   jerry cans. It is worked out with the existing power calculations
   (`powerTotals`, `generatorLoadPct`, `loadBand`, `fuelForPlan`,
   `jerryCansNeeded`, through `apps/web/lib/power-glance.ts`), shown to every
   member, with "Edit the load list / fuel plan" links for those who may edit
   (a captain or a P&L lead) and "See" links for everyone else.
3. **Every member reads a team's announcements on its program.** A card lists
   the team's announcements, newest first, capped at five
   (`TEAM_ANNOUNCEMENT_LIMIT`). The server sends only what went out
   (published and fanned out): no draft, nothing waiting for its time, and no
   pin, audience count or read receipt (`listTeamAnnouncements` in
   `packages/db/src/broadcasts.ts`). Notifications do not change: they still
   go only to the team's members, and a captain or lead sends them as before.
4. **A team's short description is written by its leads and captains.** One
   small table, `team_programs` (one row per team, not year-scoped; migration
   `0066_team_programs`, add-only: team, description, version, updated_at).
   Checked with Zod at the boundary (`TeamProgramInput` in `@camp404/types`:
   up to 300 characters) and by a CHECK constraint in the table. The write (`saveTeamProgram` in
   `packages/db/src/team-programs.ts`) runs on the pooled driver in one
   transaction: it re-reads the actor's rank and led teams inside it
   (`lockSenderReach`), is a compare-and-set on `version`, and writes an
   `audit_log` row (`team.program_changed`) in the same transaction. It holds
   no member data (no author column; the audit row says who), so erasure has
   nothing to clear there. It is separate from the join site's one-line team
   description (`camp.teams.described`, captains only, public).
5. **Every team gets a program with the basics now**: its description, its
   own panels (Power only, for now), its announcements, its coming
   events, its open tasks, its meetings and its people, on today's TEAM.EXE
   page (`/teams/[key]`). Each team's own tools come later, shaped with its
   lead, as entries in `TEAM_PANELS` (`apps/web/components/teams/team-panels.tsx`,
   a map in code by team key). Every active team is in the Teams folder, and
   a member's own team folders on the right each open with that team's
   program (unchanged from before, and tested in `programs.test.ts`).
6. **No outside links: everything happens inside the app.** (Owner,
   2026-09-27, on review of the first version.) The whole point of Camp 404
   is that nothing happens outside the app: no Google Drive, no spreadsheets,
   no Google Forms. A team program never offers or shows links to outside
   tools, so the team links #267 asked for are not built, and the
   description is the only thing a lead writes. What a team needs that lives
   in an outside tool today becomes a tool inside the app, shaped with the
   team's lead.
