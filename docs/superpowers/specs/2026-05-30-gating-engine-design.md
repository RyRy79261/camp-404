# Sub-project E — required_actions gating engine (design + plan)

**Date:** 2026-05-30
**Status:** Implemented — option **(b)** belt-and-braces, with a one-release `completedAt` fallback (see the decision section).
**Program:** Camp 404 audit remediation, sub-project **E**. Builds on C (`resolveAudience`). **Highest blast radius in the program** — it changes how every authenticated user is routed.

## Problem (from the audit)

`required_actions` is declared the canonical "what blocks this user" table, and `questionnaire_activations` the captain fan-out — but both are **dormant**: nothing inserts a `required_actions` row, completing a questionnaire never satisfies one, `roster.pendingRequiredActions` always returns 0, and `list_my_required_actions` is always empty. Gating works today only via hardcoded `redirect()` chains in `page.tsx` (the tech debt AGENTS.md names).

## Design

### 1. Activation producer (`packages/db/src/activations.ts`)
`openActivation(activationId)`:
- Loads the `questionnaire_activations` row, sets `status='open'` + `openedAt`.
- Resolves the audience for the **questionnaire** scope (`everyone/team/team_leads/individual`; `opt_in` deferred — see below), reusing the pure scope→ids mapping from `@camp404/db/audience` (the team/lead/individual/everyone cases are identical to broadcasts).
- Upserts one `required_actions` row per recipient: `type='questionnaire'`, `actionKey=questionnaireKey`, `version`, `activationId`, `title`, `blocking`. The `(user_id, action_key)` unique index makes this idempotent and re-activation-safe (`ON CONFLICT … DO UPDATE` the version/title/status→pending).

### 2. Completion hooks (`satisfyRequiredAction`)
`satisfyRequiredAction(userId, actionKey, completedVersion)` — flips the matching pending row to `completed` (only when `completedVersion >= required version` via `meetsRequiredVersion`, which compares the numeric `-vN` suffix as an integer, not lexicographically; per the schema's "completion against an older version re-opens" rule).
- **Implemented (this PR):** burner profile — `saveBurnerProfile` (web) + `BURNER_PROFILE.save` (replay).
- **Deferred follow-up:** the MCP tool hooks (`update_my_burner_profile` / `update_my_dietary_requirements` / `update_my_driver_profile` on `markComplete`). The belt-and-braces `completedAt` fallback already covers an MCP-completed profile, so these hooks are a prerequisite for *removing* the fallback, not for this PR.

### 3. Seed the mandatory burner-profile gate
Today every member must finish the burner profile before home — that obligation must become a `required_actions` row so the generic gate sees it. Seed `actionKey='burner_profile'` (type questionnaire, blocking, version = current `QUESTIONNAIRE.version`) when the camp user row is first created (`redeemInviteForUser` / god bootstrap in `ensureCampUser`). Idempotent via the unique index.

### 4. Action registry + gate routing (`apps/web/lib/required-actions.ts`)
- A pure registry mapping `actionKey → { route }` (e.g. `burner_profile → /onboarding/questionnaire`). String-keyed per AGENTS.md "component mapping."
- `nextGate(actions)` — pure: given a user's pending blocking `required_actions`, return the route of the first one (stable order), or null. **Unit-tested.**
- A `getPendingRequiredActions(userId)` db read (returns pending blocking rows ordered).

### 5. Migrate `page.tsx` (and the shared gate)
Replace the hardcoded **burner-profile** redirect with the generic gate: after the invite gate, fetch pending blocking `required_actions` and `redirect(nextGate(...))` if any. **Keep hardcoded:** the invite gate (structural — precedes any required_actions) and the captain-approval gate (per the schema comment, legitimately bespoke). Net effect for today's users is identical: a member who hasn't finished onboarding has a pending `burner_profile` action → routed to `/onboarding/questionnaire`, exactly as now.

## Out of scope / deferred
- **`opt_in` scope** (members self-select, e.g. via team-interest sliders) is a pull model, not push fan-out — deferred with a clear `// TODO(opt_in)` and documented; E covers `everyone/team/team_leads/individual`.
- **Captain activation UI** — E ships the data-layer producer + a way to trigger it (a captain action / admin path); the rich compose UI can follow. No new dependency.
- Migrating the *other* ~8 pages' gate ladders — E does `page.tsx` + a shared helper they can adopt incrementally; a mass sweep is a follow-up.

## Files

| File | Action |
|---|---|
| `packages/db/src/activations.ts` | Create — `openActivation` producer + `satisfyRequiredAction` + `getPendingRequiredActions` |
| `packages/db/src/audience.ts` | Maybe extend `computeAudience` for the questionnaire scope set (no `drivers`; `opt_in` deferred) |
| `apps/web/lib/required-actions.ts` | Create — action registry + pure `nextGate` |
| `apps/web/lib/users.ts` | Seed burner-profile required_action on user creation; `satisfyRequiredAction` wrapper (+ test-store) |
| `apps/web/app/onboarding/questionnaire/actions.ts`, `lib/forms.ts` | Call `satisfyRequiredAction` on completion (web + replay). MCP tool hooks deferred — see §2. |
| `apps/web/app/page.tsx` | Generic gate via `nextGate`; keep invite + approval hardcoded |
| tests | `nextGate` + registry; `satisfyRequiredAction` version rule; producer audience reuse |

## Migration safety
- No schema change expected (tables exist) — confirm with `db:generate` (should be a no-op; if a column's needed, additive migration).
- The page-gate swap is **behaviour-preserving**; guarded by keeping the burner-profile obligation seeded for every member and a pure, tested `nextGate`.

---

## ⚠️ Decision needed — page-gate migration approach

This is the one change that re-routes every signed-in user. Two ways to land it:

- **(a) Clean swap** — `page.tsx` drives routing purely off `required_actions` (after seeding the burner-profile obligation + backfilling existing members a row). Cleanest end state; the risk is a seeding/backfill miss could mis-route someone.
- **(b) Belt-and-braces** — keep the existing `completedAt` check as a fallback alongside the new `required_actions` gate for one release, then drop the fallback once we've confirmed rows are seeded correctly. Safer rollout; slightly more code for one cycle.

**Decision: (b) was chosen and is what this PR implements.** `page.tsx` routes off `required_actions` (via `nextGate`) with the legacy `completedAt` check retained as a one-release fallback. Rollout: ship → confirm every member has a seeded `burner_profile` row (new members are seeded at signup; existing members need a one-off backfill) and add the MCP completion hooks → then remove the fallback.

I recommend **(b)** for the first landing given the blast radius, then a follow-up to remove the fallback. Which do you want?
