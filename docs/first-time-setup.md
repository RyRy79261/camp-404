# First-time setup (camp bootstrap)

How a brand-new Camp 404 deployment goes from an empty database to its first
onboarded captain — with **no hand-run SQL**. Shipped in PR #98.

## The flow

On a **fresh system** (no captain exists yet), the first person to sign in is
routed to the `/setup` wizard before any invite/onboarding gate:

1. They sign in via Neon Auth.
2. `apps/web/app/page.tsx` sees the camp isn't bootstrapped and redirects to
   `/setup`. This is the **universal** bootstrap path — god-email accounts go
   through it too.
3. The wizard's action (`completeSetupAction` → `runFirstTimeSetup` →
   `bootstrapFirstCaptain`) elects them the founding **captain** (`approved`),
   mints the root invite code, and stamps the latch — all in one transaction.
4. They're sent home, where the normal gates take over: they complete the
   onboarding questionnaire like everyone else. Setup only grants the rank +
   the first invite code.

The founding captain then hands out the root code to bring everyone else in.

## The root invite code

The root code is fixed: **`meowzit`** (`apps/web/lib/bootstrap.ts:FOUNDER_CODE`,
matching the `admin-cli bootstrap-founder` slug). It's minted unlimited
(`maxUses = null`), pre-approved (`requiresApproval = false`), and attributed to
no creator (`createdByUserId = null`) so the founder is a clean family-tree
root while members who later redeem it attach beneath the root.

To require captain vetting for new members instead, flip `requiresApproval` to
`true` where the code is minted in `packages/db/src/bootstrap.ts`.

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
leaves your Neon Auth login, the schema, and the migration history intact —
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

- **God-emails** (`GOD_EMAILS`) still work, but setup is now the universal
  bootstrap path. Full god-email deprecation is a deferred follow-up.
- **Configurable teams** is a planned follow-up; today the eight teams are the
  hardcoded `teamEnum` (`packages/db/src/schema.ts`).
