# Overnight summary, 2026-09-28

Eleven PRs are open from the night of 2026-09-27. None is merged. Each one
passed `lint typecheck test build` locally and its own E2E on a production
build. Owner questions are listed with the builder's recommended default.

## The PRs

| PR   | Title (short)                         | Migration             |
| ---- | ------------------------------------- | --------------------- |
| #295 | Team programs                         | 0066_team_programs    |
| #297 | Applications, DDT and WAP             | 0066_camp_tickets     |
| #298 | Power: fuel on site, grid, readiness  | 0066_power_on_site    |
| #299 | Dues                                  | 0066_dues             |
| #300 | Inventory                             | 0066_inventory        |
| #301 | Lounge programme                      | 0066_lounge_programme |
| #302 | About Camp 404                        | none                  |
| #303 | Transport                             | 0066_transport        |
| #304 | Rating grids and the post-burn survey | none                  |
| #305 | Camp layout and neighbour page        | 0066_camp_layout      |
| #306 | Four security fixes                   | none                  |

**#295 Team programs.** Every team's page gets a description, recent
announcements, coming up, tasks, meetings and people; Power gets a "power
plan at a glance" panel. Only a captain or a lead of that team edits. The
"links" feature was removed (nothing outside the app). Owner questions: none
open; screenshots are waiting for approval.

**#297 Applications, DDT and WAP.** A `camp_tickets` row per member per
year (member's ticket status, the camp's DDT and WAP), and a captains'
Applications view that shows "Says" (the member) apart from "Decision"
(captains). Questions:

1. Who can be accepted or waiting-listed? _Default: only members who said
   Coming_ (today Maybe is allowed too; one line).
2. Leads now see a member's own answer on the roster. _Default: keep._
3. Should a member see their own DDT and WAP? _Default: no, hidden._
4. Vehicle pass. _Default: not stored._
5. What "Can transfer" means for a DDT. _Default: only "Allocated" counts as a
   ticket in hand._
6. May a captain set a member's own ticket status? _Default: no._

**#298 Power on site.** Refuelling tab (cans, append-only refuel log, days of
fuel left and a warning), Grid tab (points, runs, cable load warnings),
Readiness tab (generator checklist and a work plan onto the task board), and
printable sheets. Captains and Power leads change; everyone reads.
Questions:

1. Who may log refuelling? _Default: captains and Power leads now; generator
   watch members once shifts exist._
2. A read-only page for the neighbouring camp? _Default: no, the printed
   summary only._

**#299 Dues.** Members pledge a tier, send proof of payment (private file,
audited reads) and see their balance; captains and Finance leads keep fee
tiers, charges, refunds, a bank-statement CSV import (never stored) and
settle-ups. Adds `canManageMoney` (captain or Finance lead). Question:

1. Does an unpaid balance ever block a member? _Default: no, reminder only._
   (Also not built, by default: paying for someone else; the Finance team
   records one payment per person.)

**#300 Inventory.** The camp's gear: list, item page, suggest a change
(approved by the item team's lead or a captain), needs this year with
pledges, bookings with a per-item limit, loans to other camps. Questions:

1. Camp-wide gear has no team. _Default: file it under Transport & Logistics._
2. Who sees who booked? _Default: captains, the item team's leads, and the
   member themself._

**#301 Lounge programme.** Members offer activities and DJ sets; Ministry of
Vibes leads and captains decide and place them on a days × time-bands grid;
prints per day and a blank grid. No "DJ sample" link (nothing outside the
app). Question:

1. Drop the unused `workshops` and `workshop_rsvps` tables? _Default: yes, in
   a later one-line migration._

**#302 About Camp 404.** A members-only README.TXT program that reads the
same words as join.camp-404.com (edited in Join site). Questions:

1. Should Comms & HR leads edit these words too? _Default: no, captains
   only._
2. Should an applicant waiting for approval see About? _Default: no._

**#303 Transport.** Car list, lift requests, "your car" for drivers,
trailers for the Transport team, and a driver can message their own car
(new `car` audience in `canSendToAudience`). Questions:

1. Should all Transport & Logistics members edit, not only leads?
   _Default: leads only._
2. Show travel dates on the car list to every member? _Default: no; the
   car's driver and riders see them on My lift._

**#304 Rating grids and the post-burn survey.** New question type (rating
grid, as a scale or stars), leads-only questions, and a post-burn survey
template with one star row per planned meal. No schema change. Questions:

1. Copy a survey comment into a recipe's notes? _Default: wait for the menu
   (#244) and a kitchen layout approval._
2. Anonymous surveys? _Default: no._

**#305 Camp layout.** A drawing of the camp's plot (SITEPLAN.DWG), edited by
captains and Structures leads, versioned; an opt-in public neighbour page
(off by default, captain-only) that shows the plan and arrivals per day,
no names. Questions:

1. Should all Structures members edit? _Default: leads only._
2. Should neighbours see generator or shared-resource notes? _Default: no._
3. Should neighbours see the side notes ("Road", "Dune")? _Default: no._

**#306 Security fixes.** Sign-out always forgets the push token; a
re-registered push token no longer carries the last member's topics; a
deployment with no founder address set lets nobody found the camp; the
onboarding page stops promising a questionnaire that is never sent.
Question:

1. `/notifications` gating. _Default: leave it as it is._

## Merge order

Eight PRs each add a migration numbered **0066**. Only the first to merge
keeps 0066. Every later one must be **regenerated**, never renamed:

1. rebase (or merge) the branch onto the new `main`;
2. delete the branch's own `0066_*.sql`, its `meta/0066_snapshot.json` and its
   journal entry (take `main`'s `_journal.json`);
3. run `pnpm --filter @camp404/db db:generate` so drizzle-kit writes the next
   number;
4. run `migration-journal.test.ts` and the gate, then push once.

A renamed migration keeps an old journal `when`, and the migrator skips it in
production with no error (AGENTS.md).

**Recommended order:**

1. **#306, #302, #304** (no migration; any order). Nothing to regenerate, and
   each merge frees a Neon branch.
2. **#295** Team programs: keeps **0066**. Smallest schema change (one table);
   #298 and #301 plan follow-ups on it.
3. **#297** Applications: regenerate → 0067.
4. **#299** Dues: regenerate → 0068. Shares `privacy.ts` and the profile page
   with #297, and hooks the fee into the accept decision, so it goes after.
5. **#300** Inventory: regenerate → 0069. Gear rentals (#241) will build on
   #299's charges.
6. **#298** Power: regenerate → 0070.
7. **#301** Lounge: regenerate → 0071.
8. **#303** Transport: regenerate → 0072. Shares `broadcasts.ts` with #295
   and `cycle-rollover.ts` with #297 and #300.
9. **#305** Camp layout: regenerate → 0073. Shares a test route with #303.

Expect small text conflicts in shared files on every rebase:
`packages/db/src/schema.ts`, `packages/core/src/index.ts`,
`packages/types/src/index.ts`, `apps/web/lib/test-store.ts`,
`apps/web/lib/programs.ts` and `program-routes.ts`, the program icons,
`audit-actions.ts`, and `AGENTS.md` (#295, #297, #299, #305). They are lists
that each PR appended to; keep both sides.

**Deploys:** each regenerated branch is one push (one preview) and each merge
one production deploy: about 20 in total, well under the free plan's 100 a
day. Push each regenerated branch once, when its gate is green.

## Neon branch limit

Every open PR holds a Neon branch (`preview/<branch>`, made by the Vercel
Neon integration), and the `schema-migration` CI job makes one more per run.
With this many PRs open, new runs fail with **"branches limit exceeded"**.
That is capacity, not code: re-run the failed job once branches are free.
Merging or closing a PR frees its branch (`neon-pr-cleanup.yml` deletes it).
Merging the three PRs without a migration first frees room for the
regenerated ones.

Until some PRs merge, overnight builders with a migration commit locally and
report "ready to push" instead of opening a PR (`feat/tier-reminders` has a
worktree but no commits yet).

## Discovery docs written tonight (need your answers)

- `docs/specs/2026-09-28-team-budgets-and-reimbursements.md` (#242)
- `docs/specs/2026-09-28-shift-roster.md` (#248)
- `docs/specs/2026-09-28-logistics-calendar.md` (#247): **the camp calendar
  still lives in Google Calendar**; the doc proposes moving it into the app.
- `docs/specs/2026-09-28-kitchen-menu-and-shopping.md` (#244, #245): two
  layouts per screen for your approval.
- `docs/specs/2026-09-28-survival-guide-and-printables.md` (#250, #249)
- `docs/specs/2026-09-28-importer.md` (#239): proposes an upload page in the
  app instead of the admin CLI.
