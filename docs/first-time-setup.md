# First-time setup (camp bootstrap)

How a brand-new Camp 404 deployment goes from an empty database to its first
onboarded captain — with **no hand-run SQL**. Shipped in PR #98.

## The flow

On a **fresh system** (no captain exists yet), every signed-in visit is
routed to the `/setup` wizard before any invite/onboarding gate. Who may
complete it depends on `GOD_EMAILS` (`mayFoundCamp` in
`apps/web/lib/bootstrap.ts`):

- **`GOD_EMAILS` set:** only a **verified** founding address may found the
  camp. Anyone else sees the refusal screen with a Sign out button. Sign-up is
  open, so without this a stranger could beat the founder to `/setup`. A
  founder whose address is not yet confirmed (they signed up with a password)
  gets the confirm-email card on the same screen, and the link brings them back
  to `/setup`. If the deployment cannot send email, the card says whoever runs
  it must set up email (or Google sign-in) first.
- **`GOD_EMAILS` unset:** the first signed-in account may found the camp, as it
  always could.

The steps, for an account that may:

1. They sign in (email and password, a passkey, or Google if it is set up).
2. `apps/web/app/page.tsx` sees the camp isn't bootstrapped and redirects to
   `/setup`. Every new camp starts here — god-email accounts go through it
   too.
3. The wizard's action (`completeSetupAction` → `runFirstTimeSetup` →
   `bootstrapFirstCaptain`) elects them the founding **captain** (`approved`),
   mints the root invite code, and stamps the latch — all in one transaction.
4. They're sent home, where the normal gates take over: they complete the
   onboarding questionnaire like everyone else. Setup only grants the rank +
   the first invite code.

The founding captain then hands out the root code to bring everyone else in.

## The root invite code

The root code is fixed: **`meowzit`** (`apps/web/lib/bootstrap.ts:FOUNDER_CODE`,
matching the `admin-cli bootstrap-founder` slug). The repo is public, so anyone
can read the word. It is therefore minted so that it cannot wave anyone in:

- **Every redeemer waits for a captain** (`requiresApproval = true`). They land
  on the approval queue in camp management, not in the camp.
- **The uses are capped** at `FOUNDER_CODE_MAX_USES` (100,
  `packages/db/src/bootstrap.ts`). After that, members invite members from
  `/tools/invite`.
- **It has no creator** (`createdByUserId = null`), so the founder is a clean
  family-tree root and members who redeem it attach beneath the root.

This is the owner's call (2026-09-16): keep the word, add approval and a cap.
Migration `0022_founder_code_policy` applies the same policy to a root code
minted before the change.

To close the code early, for example if it leaks beyond the camp, revoke it. A
captain can do it in the app: **Tools → Invite**, under "All invite codes". Or
from the admin CLI:

```bash
DATABASE_URL=... pnpm --filter @camp404/admin-cli dev revoke-invite --code meowzit
```

Members who already joined keep their place. The revoke writes an
`invite.revoked` audit row.

## The once-only guarantee

- The wizard is reachable **only** while no captain exists (`page.tsx` /
  `/setup` both gate on `isCampBootstrapped()`).
- `bootstrapFirstCaptain` serializes every attempt on a `SELECT … FOR UPDATE`
  of the `camp_settings` singleton row, so two concurrent first-logins can't
  both win, and it bails if the latch is stamped **or** a captain already
  exists. After the first captain exists it can never fire again.
- `camp_settings.bootstrapped_at` is the latch (migration `0014`).

## Resetting to a fresh start (testing)

To re-test first launch, wipe all app data so the system looks brand-new. This
leaves your login, the schema, and the migration history intact —
only Camp 404 domain rows are cleared. **Run against a Neon branch/fork, not
production, unless you really mean it.**

**Preflight — run this first and confirm you're on the fork, not production.**
The Neon SQL editor can't prompt interactively, so this is your manual gate:
check the database/branch you're connected to before running the destructive
block below. If it's your production branch, **stop**.

```sql
-- Which database / role / schema am I about to nuke?
SELECT current_database(), current_user, current_schema();
-- Also confirm the Neon branch selector (top of the SQL editor) shows the
-- per-PR fork — NOT main/production — before continuing.
```

Once you've confirmed it's the throwaway fork:

```sql
BEGIN;
TRUNCATE TABLE
  users, invite_codes, team_memberships, captain_promotion_requests, camp_settings,
  burner_profiles, dietary_requirements, driver_profiles, car_members,
  required_actions, questionnaire_activations, questionnaire_activation_targets,
  questionnaire_edits,
  broadcasts, broadcast_targets, notification_deliveries, push_tokens,
  telegram_chats, telegram_invites, telegram_announcements,
  documents, reimbursements, team_budgets, recipes, tasks, adoptees,
  workshops, workshop_rsvps, inventory_items, inventory_updates,
  mcp_oauth_clients, mcp_auth_codes, mcp_access_tokens, mcp_audit_log, audit_log
RESTART IDENTITY CASCADE;
COMMIT;
```

Then sign in → `/setup` runs again.

## Notes / follow-ups

- **God-emails** (`GOD_EMAILS`) stay as a recovery path, and when set they
  also decide who may run setup (see The flow). A god address only counts once the auth server has
  verified it (owner's call, 2026-09-16): an unverified session that claims
  one keeps its account but not the email (`apps/web/lib/session-user.ts`),
  so sign-up with the owner's address cannot walk past the gates.
- **Configurable teams** is a planned follow-up; today the eight teams are the
  hardcoded `teamEnum` (`packages/db/src/schema.ts`).
  [CORRECTION 2026-09-24] Configurable teams shipped (see
  `docs/configurable-teams-plan.md`): captains relabel, reorder and archive
  teams in camp settings. The keys are still `teamEnum`, now fourteen.
