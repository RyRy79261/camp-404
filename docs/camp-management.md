# Camp Management

> The captains' roster view: everyone who has signed up, their rank and
> status, whether their required questionnaires are done, whether they
> registered as a driver, and whether they're in South Africa. Reachable
> from the **Camp Management** tile on the captain layer of the home
> control panel.

## Goal

Give captains one screen to triage the whole camp at a glance. It is an
explicitly **growing** surface — new columns (dues, membership tier, arrival
windows, …) slot onto the existing flat row shape without reshaping callers.

## Access model — locked, not redirected

This is the deliberate part. A non-captain can still navigate to
`/captains/camp-management`, but they see the table chrome **greyed out and
empty** behind a "Captain access only" lock overlay. The page does **not**
`redirect()` them away.

Clearance is enforced server-side at the data layer, not in the client:

- `app/captains/camp-management/page.tsx` checks `campUser.rank === "captain"`.
- Only captains call `getCampManagementRoster()`. Everyone else gets `rows = []`
  and renders `<CampManagementRoster locked />`, so the browser never receives
  roster data it isn't cleared for.

On the home control panel (`app/page.tsx`) the captain layer is locked for
lower ranks anyway — the tile is non-interactive — so the page-level lock is
defence in depth for anyone who hits the URL directly.

## What each column means

`packages/db/src/roster.ts → getCampManagementRoster()` returns one row per
real (non-system, non-sanitised) camp member, aggregating:

- **Member** — display name + the teams they belong to (`team_memberships`).
- **Rank** — `users.rank`, with **Team Lead** derived from any
  `team_memberships.is_lead` (captain > lead > member).
- **Status** — `Onboarding` if the burner profile isn't finished, `Action
needed` if it is but blocking `required_actions` remain, else `Ready`.
- **Questionnaires** — a tick when there are zero pending blocking
  `required_actions` for the user.
- **Driver** — derived from `driver_profiles.intends_to_drive`.
- **In SA** — derived from the burner profile's `country` answer equalling
  `ZA` (`responses->>'country'`).
- **Country** — the resolved country name from the same answer.

The raw aggregation lives in SQL (correlated sub-selects keep the query a
single round-trip on the stateless HTTP driver); the view-model derivations
(status, country-name resolution, labels) live in the pure, unit-tested
`apps/web/lib/camp-roster.ts → toRosterRow()`.

## Rank plumbing

`getCampManagementRoster`'s sibling, `isTeamLead(userId)`, is what unlocks
the control panel's three layers in `app/page.tsx`: captain → captain layer,
lead of any team → team-lead layer, everyone else → their own. Previously the
home page hard-coded every viewer to `camp_member`; captains can now reach
their layer (and this page) for real.

## Notes

- No new table or migration — the view is read-only over existing data.
- The table renders with plain Tailwind (no shared `Table` component exists
  yet); a client-side text filter searches name, team, and country.
