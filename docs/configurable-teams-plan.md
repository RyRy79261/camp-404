# Configurable teams

Status (checked against the code on 2026-09-24): **Phases 1–3 are built.
Phase 4 is done by hand, one team at a time, and that is now the rule.** The
plan below is kept as history.

## What is built

- **Config layer.** `packages/db/src/camp-config.ts` holds the team list in
  the `camp_settings.config` JSONB column (added by migration `0015`):
  `getTeamsConfig`, `activeTeams`, `teamLabelMap`, and `mutateTeamsConfig`,
  which rewrites the config under the `camp_settings` row lock and writes its
  audit row in the same transaction. `assertStableTeamKeys` refuses any change
  that adds or removes a team key. The roster, announcements, questionnaire
  sends, the task board and the rest read labels from this config.
- **Captain team editor.** `/captains/camp-settings`:
  `apps/web/app/(console)/captains/camp-settings/team-settings-manager.tsx`
  and `actions.ts`. A captain can rename, reorder and archive a team (at least
  two must stay active). There is no add or delete. Each change writes an
  `audit_log` row (`camp.teams.renamed`, `camp.teams.moved`,
  `camp.teams.archived`, `camp.teams.unarchived`); see
  `packages/db/src/__tests__/team-config-audit.test.ts`.
- **Config-driven questionnaire.** `resolveTeamBindings` in
  `apps/web/lib/questionnaire.ts` puts the live teams into the team-interest
  page (`TEAM_INTERESTS_PAGE_ID`) and the team-lead question
  (`TEAM_LEAD_QUESTION_ID`); `apps/web/lib/questionnaire-config.ts` reads the
  config for it. A new member sees the active teams; a stored answer is
  checked against all teams, archived ones included.
- **Adding a team key (Phase 4), done for Finance and five more.** Commit
  `3111f85` (PR #231) added `finance` to `teamEnum` in
  `packages/db/src/schema.ts`. Migration `0039_finance_team.sql` adds the enum
  value and the new-camp default; `0040_finance_team_in_camp_config.sql`
  appends Finance to a live camp's team list once, keeping any labels and
  archiving captains have set. Tested in
  `packages/db/src/__tests__/finance-team-migration.test.ts`. #236 added
  `transport_and_logistics`, `communications_and_hr` and `mutant_vehicle`
  (labels "Transport and Logistics", "Communications and HR", "Mutant
  Vehicle") the same way: `0044_new_teams.sql` adds the three enum values and
  the new-camp default, and `0045_new_teams_in_camp_config.sql` appends each
  to a live camp's list once, in that order. Tested in
  `packages/db/src/__tests__/new-teams-migration.test.ts`. The owner's final
  list (2026-09-24) added `sound` and `water` the same way
  (`0048_sound_and_water_teams.sql`, then
  `0049_sound_water_and_relabels_in_camp_config.sql`), and renamed three teams
  whose key stays, because Postgres cannot drop an enum value:
  `sanitation_and_water` is "Sanitation and MOOP" (a different team from
  Water), `health_and_safety` is "Safety", and `communications_and_hr` is
  "Communications & HR". 0049 renames a live camp's entry only while it still
  has the old default label, so a captain's own name is kept. Tested in
  `packages/db/src/__tests__/sound-water-teams-migration.test.ts`. The default
  labels live in `TEAM_DEFAULT_LABELS` (`@camp404/types`). `teamEnum` now has
  **14** values. The team-interest questions are optional, so a new team does
  not bump `QUESTIONNAIRE_VERSION`.
- **Cross-team task board.** `/tasks` (`apps/web/app/(console)/tasks/`), with
  columns To do, Doing and Done.

**Owner's ruling (2026-09-23):** new teams are added in code, one enum
migration each (plus a custom migration that appends the team to the live
config), never from a screen. Each team will get its own dashboard and tools,
so a team is a code change, not a settings row. Do not build an "add team"
button.

## What is not built

- **Removing a team key, or renaming a key.** Keys are fixed once they exist
  (`assertStableTeamKeys`); a captain can only relabel or archive. Removing a
  key would need a questionnaire version bump and a migration of stored
  answers (see Phase 4 below).
- **Per-team dashboards.** Wanted later, one bespoke page per team (for
  example the kitchen's recipes and shopping lists). None exists yet.

## Original plan (history)

This is the plan as written before the work started (when it was marked
PARKED). Paths in it predate the `(console)` route group: read
`apps/web/app/captains/…` as `apps/web/app/(console)/captains/…`.

### Goal

Move the camp's team list out of hardcoded constants into editable config,
**seeded with the existing 8 teams** as defaults, so they can be relabelled /
reordered / archived (and later extended) without code changes.

> **[CORRECTION 2026-09-24]** Eight was the founding set. Finance was added in
> code as the ninth (PR #231), then Transport and Logistics, Communications and
> HR and Mutant Vehicle (#236) made twelve, and Sound and Water (the owner's
> final list, 2026-09-24) made fourteen. The owner ruled that teams are
> extended in code, not from a screen.

### Hard constraint

The Postgres `teamEnum` (8 values: `kitchen`, `structures`,
`power_and_lighting`, `sanitation_and_water`, `health_and_safety`,
`art_and_activities`, `ministry_of_memes`, `ministry_of_vibes`) is the **type
backbone** — woven through ~9 tables (`team_memberships`, `team_budgets`,
`reimbursements`, `documents`, `questionnaire_activations`, `broadcasts`,
`inventory_*`, `tasks`) — and **stays**. "Configurable" means the active set +
display **labels** + **order** become config; the keys remain the enum. Adding a
brand-new team **key** later is a separate enum migration (Phase 4).

> **[CORRECTION 2026-09-24]** `teamEnum` now has **14** values: the eight above
> plus `finance` (migration `0039`), `transport_and_logistics`,
> `communications_and_hr` and `mutant_vehicle` (migration `0044`), and `sound`
> and `water` (migration `0048`). `sanitation_and_water` is now labelled
> "Sanitation and MOOP" and `health_and_safety` "Safety". A grep of
> `schema.ts` finds it in exactly 9 tables: `team_memberships`,
> `questionnaire_activations`, `documents`, `reimbursements`, `team_budgets`,
> `broadcasts`, `tasks`, `inventory_items`, `inventory_updates`. The list above
> is otherwise still right.

### The coupling (why this is staged, not one PR)

Teams are hardcoded in several places, the riskiest being the questionnaire:

- **`apps/web/lib/questionnaire.ts`** — a `TEAMS` const builds the
  `team_interest.{key}` sliders + the `team_lead.interests` multi-select.
  `QUESTIONNAIRE` is a **module-load `const`** imported by 7+ files
  (`onboarding/.../actions.ts`, `users.ts`, `forms.ts`, `member-detail.ts`,
  `wizard.tsx`, tests). Making it config-driven means an **async refactor across
  the onboarding gating spine** — the risky part.
- **`apps/web/app/captains/camp-management/roster-presentation.tsx`** — a
  _separate_ `TEAMS` const + `teamLabel()` humanizer (note: it renders
  "Art and Activities" while the questionnaire renders "Art & Activities" —
  config unifies them).
- MCP tools, `control-panel`, `audience`/`activations`, `types/roles`,
  `core/access` — mostly use the enum **keys** (stable, safe).

#### Version safety (analysed)

`required_actions.version` / `burner_profiles.version` gate **completeness, not
interpretation**. Therefore:

- Relabel a team or toggle `archived` → **no `QUESTIONNAIRE.version` bump**
  needed (response keys are the enum, unchanged; old responses stay valid and
  re-render with new labels).
- Remove a team **key** from the enum → version bump + data migration (Phase 4).
- Use an **ARCHIVE pattern** (team stays in the enum with `archived: true`,
  validation still accepts it, UI hides it) so validation never rejects a key
  that's still in stored responses.

### Design

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

### Phased rollout

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

### Key risks

- **Label drift** between Phase 1 (roster reads config) and Phase 3
  (questionnaire still hardcoded) — if a captain relabels via Phase 2 before
  Phase 3 lands, the roster updates but the questionnaire shows the old label.
  Mitigation: ship Phase 3 promptly after 2, or gate the editing UI on Phase 3.
- **Async questionnaire refactor** touches the onboarding spine — needs the e2e
  onboarding test green throughout.
- **Enum immutability** — the editing UI must not offer "add new team" until
  Phase 4 (a new key needs an enum migration). **[CORRECTION 2026-09-24]**
  Not "until": the owner ruled on 2026-09-23 that the UI never adds a team.
  Each new team is an enum migration in code.
