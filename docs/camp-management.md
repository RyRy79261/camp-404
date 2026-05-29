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
- **Status** — `Onboarding` if the burner profile isn't finished,
  `Awaiting approval` if onboarded but pending a captain's vetting decision,
  `Rejected` if a captain denied them, `Action needed` if onboarded and
  approved but blocking `required_actions` remain, else `Ready`. Approval
  outranks generic actions because it gates the member out of the app
  entirely.
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

## Reviewing & approving applicants

Rows are **clickable**. A captain clicking a burner opens a modal with that
member's detail split into **Overview** (country, join date, onboarding state,
the invite code they redeemed, who invited them, and the inviter's note) and
**Profile** (their burner-profile answers, grouped by questionnaire page).
Detail is fetched on open via the captain-gated `getMemberDetailAction` so the
heavy questionnaire catalogue and raw answers never ship to the client until a
captain asks for them.

The modal footer is an **Actions** bar — reserved for things the captain needs
to *do*, not for editing the member's account data:

- **Reject** (destructive) and **Approve** (green) appear together only while a
  decision is outstanding (`approval_status = 'pending'`); once a decision is
  made they disappear and the modal shows who decided and when.
- **Ping** is greyed out — a future feature (nudge a member to check the app).

A new **Awaiting approval** filter toggle (with a count badge) narrows the
table to just the people in the vetting queue. `decideApprovalAction` persists
the decision through `decideUserApproval` and revalidates the page.

## Captain approval gate

Invite codes carry `invite_codes.requires_approval`. A **non-captain's** codes
always set it (only a captain can wave someone in unvetted); a **captain**
minting a code chooses — pre-approve the redeemer, or leave them for vetting —
and can also raise the code's use cap. Redeeming a vetting-required code creates
the account with `users.approval_status = 'pending'`; after onboarding that
member is held at `/pending-approval` (a blocking screen) until a captain
approves (→ app unlocks) or rejects (→ terminal "not approved" message).

Approval is a first-class `users.approval_status` lifecycle field rather than a
`required_actions` row, because it has a terminal `rejected` state the generic
gate can't express and is actioned by a captain, not completed by the user.
`isApproved()` in `apps/web/lib/users.ts` is the shared gate the protected
pages check after the invite + onboarding gates.

## Notes

- One migration (`0009`): `invite_codes.requires_approval` and the
  `users.approval_status` / `approval_decided_by_user_id` / `approval_decided_at`
  columns. The roster query is otherwise still read-only over existing data.
- The table renders with plain Tailwind (no shared `Table` component exists
  yet); a client-side text filter searches name, team, and country.
