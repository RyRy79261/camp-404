# Configurable teams — implementation plan (PARKED)

Status: **parked before implementation.** This captures the design/mapping
output so the work can resume cleanly. No feature code is written yet.

## Goal

Move the camp's team list out of hardcoded constants into editable config,
**seeded with the existing 8 teams** as defaults, so they can be relabelled /
reordered / archived (and later extended) without code changes.

## Hard constraint

The Postgres `teamEnum` (8 values: `kitchen`, `structures`,
`power_and_lighting`, `sanitation_and_water`, `health_and_safety`,
`art_and_activities`, `ministry_of_memes`, `ministry_of_vibes`) is the **type
backbone** — woven through ~9 tables (`team_memberships`, `team_budgets`,
`reimbursements`, `documents`, `questionnaire_activations`, `broadcasts`,
`inventory_*`, `tasks`) — and **stays**. "Configurable" means the active set +
display **labels** + **order** become config; the keys remain the enum. Adding a
brand-new team **key** later is a separate enum migration (Phase 4).

## The coupling (why this is staged, not one PR)

Teams are hardcoded in several places, the riskiest being the questionnaire:

- **`apps/web/lib/questionnaire.ts`** — a `TEAMS` const builds the
  `team_interest.{key}` sliders + the `team_lead.interests` multi-select.
  `QUESTIONNAIRE` is a **module-load `const`** imported by 7+ files
  (`onboarding/.../actions.ts`, `users.ts`, `forms.ts`, `member-detail.ts`,
  `wizard.tsx`, tests). Making it config-driven means an **async refactor across
  the onboarding gating spine** — the risky part.
- **`apps/web/app/captains/camp-management/roster-presentation.tsx`** — a
  *separate* `TEAMS` const + `teamLabel()` humanizer (note: it renders
  "Art and Activities" while the questionnaire renders "Art & Activities" —
  config unifies them).
- MCP tools, `control-panel`, `audience`/`activations`, `types/roles`,
  `core/access` — mostly use the enum **keys** (stable, safe).

### Version safety (analysed)

`required_actions.version` / `burner_profiles.version` gate **completeness, not
interpretation**. Therefore:
- Relabel a team or toggle `archived` → **no `QUESTIONNAIRE.version` bump**
  needed (response keys are the enum, unchanged; old responses stay valid and
  re-render with new labels).
- Remove a team **key** from the enum → version bump + data migration (Phase 4).
- Use an **ARCHIVE pattern** (team stays in the enum with `archived: true`,
  validation still accepts it, UI hides it) so validation never rejects a key
  that's still in stored responses.

## Design

- **Config layer:** a `config JSONB` column on the existing `camp_settings`
  singleton (NOT a new table) — reuses its `SELECT … FOR UPDATE` lock, no
  orphans, simplest migration. Shape: `{ teams: [{ key, label, order, archived }] }`.
  Migration `0015`: add the column with a `DEFAULT` seeding the 8 teams.
- **Shared accessor:** one `getTeamsConfig()` in a new
  `packages/db/src/camp-config.ts` (+ `TeamsConfig` type, `DEFAULT_TEAMS`
  fallback, `"./camp-config"` export). Every consumer reads this; the duplicate
  hardcoded label maps collapse into it.
- **Editing surface:** a captain-only settings page (e.g.
  `/captains/camp-settings`) — relabel inline, reorder, archive toggle (no
  delete — archive only). Not a `/setup` step (setup is one-time; team admin is
  ongoing).

## Phased rollout

1. **Phase 1 — config layer + roster repoint (LOW risk, recommended first PR).**
   Migration `0015` (`config` JSONB seeded with 8) · `camp-config.ts`
   `getTeamsConfig()`/`DEFAULT_TEAMS` · repoint the roster
   (`roster-presentation.tsx` / `roster-toolbar.tsx`) off its hardcoded
   `TEAMS`/`teamLabel` to the config (threaded from the server page). **The
   questionnaire stays on its static `TEAMS` const** — zero onboarding risk.
   Tests: accessor shape, roster renders from config, bootstrap seeds the
   default config, onboarding path unchanged.
2. **Phase 2 — captain team-settings page + config mutations (LOW).** The
   editing UI (relabel/reorder/archive) + server actions that write
   `camp_settings.config` (under the singleton lock).
3. **Phase 3 — questionnaire config-driven (MEDIUM).** Refactor `QUESTIONNAIRE`
   to an async `getQuestionnaireConfig()`, wire the team sliders + multi-select
   to config, thread through the import sites, adopt the ARCHIVE validation
   pattern. No version bump unless the questionnaire shape changes. This closes
   the label drift between roster and questionnaire.
4. **Phase 4 — enum growth (MEDIUM, on demand).** Adding/removing team **keys**:
   `ALTER TYPE teamEnum`, seed the config row, version bump + response migration
   if removing keys.

## Key risks

- **Label drift** between Phase 1 (roster reads config) and Phase 3
  (questionnaire still hardcoded) — if a captain relabels via Phase 2 before
  Phase 3 lands, the roster updates but the questionnaire shows the old label.
  Mitigation: ship Phase 3 promptly after 2, or gate the editing UI on Phase 3.
- **Async questionnaire refactor** touches the onboarding spine — needs the e2e
  onboarding test green throughout.
- **Enum immutability** — the editing UI must not offer "add new team" until
  Phase 4 (a new key needs an enum migration).
