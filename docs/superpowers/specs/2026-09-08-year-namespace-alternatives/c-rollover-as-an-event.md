# The rollover is an event, not a namespace

*A year design for Camp 404. Every claim about today's code is cited `file:line`.*

---

## 0. The one-paragraph version

Camp 404 does not need a `cycle_id` on eleven tables. It needs **one append-only
ledger of rollover events** (`camp_cycles`), and a cycle stamp on exactly the **two
tables that are upserted in place** and therefore cannot be dated by a timestamp:
`required_actions` and `questionnaire_responses`. Everything else in the schema is
either an append-only event (its `created_at` already tells you which year it belongs
to), or genuinely camp-lifetime. Per-questionnaire carry-over is **one enum column**,
`carry` or `fresh`, and it does not drive a rollover code path at all — it is a filter,
applied in two places: which members get a gate when an activation fans out, and
whether a read of last year's answers falls through into this year's form. Rolling the
year over is then literally *"close every open activation, then send them again"* —
two functions that already exist and already work.

**The year lives on the obligation, not on the answer.** A member's dietary answer is
one row that is theirs forever. What is year-scoped is *whether they still owe you one*.

---

## 1. What exists today (verified)

### 1.1 There is no year concept. Confirmed.

```
rg -w 'edition|cycle|season|year' packages/db/src apps/web/lib
```
returns only: an import-cycle comment (`packages/db/src/schema.ts:24`), a relations
cycle-guard comment (`packages/db/src/relations.ts:10`), and three pieces of
questionnaire *copy* — `"Your ideas for this year's burn"`
(`apps/web/lib/questionnaire.ts:202`), `"Leave blank if this would be your first year
with us."` (`:313`), `"Coming to burn this year?"` (`:351`). No column, no table, no
enum, no query.

The schema *comments* already promise a mechanism that does not exist:

- `packages/db/src/schema.ts:243-245` — *"Account + history persist across the yearly
  camp reset; per-burn data in other tables is cleared."* Nothing clears anything.
- `packages/db/src/schema.ts:376-378` (`burner_profiles`) — *"One row per user;
  persists across the yearly reset."*

`docs/harvest/00-harvest-and-roadmap.md:54` states the problem exactly and calls it
*"the unasked product question"*, and `:373` marks it **"decide before the dues
ledger"**. This document is that decision.

### 1.2 The gating spine

`required_actions` (`packages/db/src/schema.ts:643-685`) is the single generic
"what blocks this user" table:

| column | line | note |
|---|---|---|
| `action_key` | `:657` | stable questionnaire key |
| `version` | `:661` | *"A completion recorded against an older version re-opens the gate."* |
| `activation_id` | `:663` | the activation that created the row |
| `status` | `:670` | `pending / completed / waived / expired` (`:124-129`) |
| `completed_at` | `:674` | **when they satisfied it** |
| unique `(user_id, action_key)` | `:677-680` | `required_actions_user_action_idx` |

That unique index is the whole problem in one line. **One row per person per
obligation, for life.** The harvest already spotted this
(`docs/harvest/units/03-questionnaire-runner-ui.md`: *"a `(user, action_key)` unique
index means the gate fires once in a person's lifetime, ever"*).

The engine around it:

- `openActivation` (`packages/db/src/activations.ts:40-137`) — computes the audience via
  `computeAudience` (`:81-90`), then `INSERT … ON CONFLICT (user_id, action_key) DO
  UPDATE SET status='pending', completed_at=null` (`:102-130`).
- `ensureRequiredAction` (`:144-166`) — idempotent single-row seed, `ON CONFLICT DO
  NOTHING`. Called at signup for `burner_profile`
  (`apps/web/lib/users.ts:196-205`).
- `satisfyRequiredAction` (`:173-206`) — version-aware completion, refuses a completion
  against an older version via `meetsRequiredVersion` (`packages/db/src/versions.ts:14-24`).
- `getPendingRequiredActions` (`:209-233`) — `status='pending' AND blocking=true`,
  oldest first. **This query is the hot path**, run on every home-page load
  (`apps/web/app/page.tsx:55`) and on the runner (`apps/web/app/questionnaires/[activationId]/page.tsx:51`).
- `nextGate` (`apps/web/lib/required-actions.ts:30-40`) — routes the first blocking
  action to a bespoke page from `ACTION_ROUTES` (`:9-13`), or to
  `/questionnaires/<activationId>` for a builder questionnaire.

### 1.3 The definition / version / activation / response spine

- `questionnaire_definitions` (`schema.ts:1457-1479`) — head definition, `status`
  (`draft/published/unpublished`, `:151-155`), `version` (latest published).
- `questionnaire_versions` (`schema.ts:1481-1506`) — immutable `(key, version)`
  snapshots. `publishDefinition` (`questionnaire-lifecycle.ts:67-153`) mints a new
  version on a **breaking** change and **overwrites the snapshot in place** on a
  cosmetic one (`:137-143`).
- `classifyChange` (`packages/types/src/questionnaire-builder.ts:461-486`) compares
  **only** the field map (`:467-474`) and the `visibleIf` map (`:479-484`). It reads
  nothing else from `BuilderQuestionnaire` (`:123-128`).
- `questionnaire_activations` (`schema.ts:537-575`) — a captain's act of requiring a
  questionnaire from an audience. **Copies `version` and `title` off the definition at
  send time** (`questionnaire-lifecycle.ts:337-340`). Partial unique index
  `…_one_open_per_key_idx` (`schema.ts:568-573`) enforces at most one open per key.
- `questionnaire_responses` (`schema.ts:1508-1535`) — *"One latest-answer row per
  (user, definition)"*, unique `(user_id, definition_key)` (`:1528-1531`). Upserted on
  **every page advance** (`questionnaire-responses.ts:22-56`) and atomically on final
  submit with the gate flip (`activations.ts:304-367`).
- `closeActivation` (`questionnaire-lifecycle.ts:228-260`) — status → `closed`, and its
  still-pending `required_actions` → **`expired`**, explicitly *"not delete — preserves
  metrics"* (`:226`).

### 1.4 The captain config surface

`camp_settings` (`schema.ts:1422-1455`) is a boolean-PK singleton with a `CHECK`
(`:1451-1453`) and a `config` JSONB column (`:1443-1449`) seeded with the eight teams.
`camp-config.ts` is the whole pattern in 212 lines: a hand-rolled
`resolveTeamsConfig` that falls back wholesale on malformed input (`:76-87`), pure
transforms (`renameTeam` `:108`, `setTeamArchived` `:121`, `moveTeam` `:138`), a
key-set guard (`assertStableTeamKeys` `:167-176`), and `mutateTeamsConfig` — a
`SELECT … FOR UPDATE` read-modify-write on the singleton (`:184-212`), the same lock
`bootstrapFirstCaptain` uses (`bootstrap.ts:61-72`). The app reaches it through an
E2E-aware facade (`apps/web/lib/camp-config.ts:27-48`), and the captain UI is
`apps/web/app/captains/camp-settings/` — a `requireCaptain()` gate + Zod parse +
locked write per action (`actions.ts:44-63`, `:75-148`).

A drift test pins the seed JSON in three places by regex
(`apps/web/lib/__tests__/camp-config.test.ts:79-107`). **Anything added to
`DEFAULT_CAMP_CONFIG` breaks it** — so this design does not touch it.

### 1.5 Erasure

`sanitisedUserPatch` (`packages/db/src/account.ts:21-43`) keeps `id`, `inviteCode`,
`rank`, `approvalStatus`, `duesPaid`; nulls `termsVersion` / `termsConsentedAt`
(`:36-37`). `sanitiseAccount` (`:55-130`) deletes `required_actions` (`:93`) and
`team_memberships` (`:96`) outright. Nothing needs to change here — but see §7.7.

---

## 2. Table-by-table: year-scoped, camp-lifetime, or infrastructure

All 38 tables. **"Derivable"** means the row is append-only and its cycle is a
timestamp comparison against `camp_cycles.started_at` — no column needed.

### 2.1 Year-scoped, and derivable (no schema change) — 17 tables

| table | line | the field that dates it |
|---|---|---|
| `questionnaire_activations` | `537` | `opened_at`. Immutable once opened (builder spec §6.3) — the timestamp is sound. |
| `questionnaire_activation_targets` | `578` | via parent activation |
| `questionnaire_edits` | `603` | `created_at` |
| `captain_promotion_requests` | `501` | `created_at` |
| `reimbursements` | `749` | `created_at` — **see §8.1, the highest-risk derivation** |
| `broadcasts` | `836` | `created_at` |
| `broadcast_targets` | `883` | via parent |
| `notification_deliveries` | `903` | `created_at` |
| `tasks` | `966` | `created_at` |
| `adoptees` | `993` | `created_at` — **`slot_number` collides across years, see §8.2** |
| `workshops` | `1015` | `starts_at` |
| `workshop_rsvps` | `1026` | via parent |
| `inventory_updates` | `1122` | `created_at` |
| `car_members` | `455` | `created_at` (PK is `(driver, member)`, no lifecycle column) |
| `telegram_invites` | `1229` | `created_at` |
| `telegram_announcements` | `1258` | `created_at` |
| `audit_log` | `1180` | `created_at` |

### 2.2 Year-scoped, and NOT derivable (this is where the design spends its budget) — 2 tables

| table | line | why derivation fails |
|---|---|---|
| `required_actions` | `643` | Upserted in place by `openActivation` (`activations.ts:116-130`). `completed_at` moves. Unique `(user, key)` means a second year's obligation **cannot exist**. → **`cycle_ordinal`** |
| `questionnaire_responses` | `1508` | Upserted on every page advance (`questionnaire-responses.ts:43-55`). `updated_at` cannot tell "answered this year" from "tweaked last year's answer this year", and a fresh re-answer would **overwrite** last year's. → **`cycle_ordinal`** |

### 2.3 Lifetime row, year-scoped obligation (no schema change; policy only) — 3 tables

The three code questionnaires. One authoritative row per user, forever; what is
year-scoped is the *gate*, which lives in `required_actions`.

| table | line | default policy | why |
|---|---|---|---|
| `burner_profiles` | `380` | **carry** | name, emergency contacts, previous burns — identity |
| `dietary_requirements` | `400` | **fresh** | allergies change; the kitchen must not trust a two-year-old answer (`is_anaphylactic`, `:407`) |
| `driver_profiles` | `421` | **fresh** | `intends_to_drive`, `arrival_at`, `departure_at`, `seats_offered` are literally this year's logistics |

### 2.4 Mixed — 1 table

`users` (`248`). Column by column:

| column | line | verdict |
|---|---|---|
| `id`, `auth_user_id`, `display_name`, `profile_image_url` | `249-256` | lifetime |
| `rank`, `is_system` | `258-262` | lifetime — **never reset** (§7.2) |
| `dues_paid` / `dues_paid_at` | `265-266` | **year-scoped → derived** (§7.1) |
| `membership_tier` | `264` | year-scoped. Written by nothing today; when it is written, it belongs in the attendance questionnaire, not on `users` (§9) |
| `passport_encrypted`, `sa_id_encrypted`, `eft_details_encrypted` | `269-271` | lifetime |
| `skills`, `emergency_contacts` | `273, 279` | lifetime |
| `previous_afrikaburns`, `previous_burning_mans`, `first_time` | `275-277` | lifetime. **Deliberately not auto-incremented** (§9) |
| `invite_code` | `287` | lifetime (family-tree lineage) |
| `approval_status` + decided-by/at | `295-303` | lifetime — **never reset** (§7.2) |
| `terms_version` / `terms_consented_at` | `305-306` | **version-scoped, not year-scoped** (§7.3) |
| `sanitised`, `lost_cat_number` | `307-309` | lifetime |
| `telegram_handle` / `telegram_user_id` | `316-317` | lifetime |
| `ai_data_consent` | `328` | lifetime |

### 2.5 Camp-lifetime — 8 tables

`recipes` (`686`) — a good recipe is forever; `scheduled_for` dates a serving, derivable.
`documents` (`719`) — manuals.
`inventory_items` (`1049`) — the asset register; `archived_at` (`:1105`) is its lifecycle.
`invite_codes` (`340`) — a code minted last year still works; `revoked_at`/`expires_at` exist if a captain wants to retire them.
`team_memberships` (`474`) — **carried by decision** (§7.4).
`questionnaire_definitions` (`1457`), `questionnaire_versions` (`1481`) — the catalogue.
`camp_settings` (`1422`) — the singleton.

### 2.6 Year-scoped and NOT derivable, deliberately left alone — 1 table

`team_budgets` (`796`). PK is `team` (`:797`) — one row per team, forever. There is no
`created_at`; last year's budget is unrecoverable the moment someone edits it. It is
**year-scoped and the design does not fix it**, because there is no finance UI yet and
changing its PK now would be speculative. §9 names it as deliberate debt and states the
fix: `primaryKey({ columns: [team, cycleOrdinal] })` when the ledger is built.

### 2.7 Infrastructure — 7 tables

`push_tokens` (`807`), `telegram_chats` (`1210`), `mcp_oauth_clients` (`1315`),
`mcp_auth_codes` (`1333`), `mcp_access_tokens` (`1362`), `mcp_audit_log` (`1389`),
plus `drizzle.__drizzle_migrations`.

**Tally:** 17 derivable + 2 stamped + 3 policy-only + 1 mixed + 8 lifetime + 1 debt +
7 infrastructure = 39 rows covering the 38 tables (`users` counted once). **Two tables
get a column.**

---

## 3. The schema diff (exact Drizzle)

All of it goes in `packages/db/src/schema.ts`. Nothing is hand-written into
`packages/db/migrations/`.

### 3.1 New enum — additive

```ts
// Per-questionnaire rollover policy. `carry` = last year's answer still counts
// when the camp moves into a new cycle (the member is not re-gated, and the
// replay form pre-fills from it). `fresh` = the member must answer again, on a
// BLANK form; their previous answer is untouched and still readable under its
// own cycle. Default `fresh` — silent carry-over is the dangerous direction
// (docs/harvest/00-harvest-and-roadmap.md:54), so the safe default is "ask again".
export const carryOverPolicyEnum = pgEnum("carry_over_policy", [
  "carry",
  "fresh",
]);
```

`CREATE TYPE` is additive. This is **not** an `ALTER TYPE … ADD VALUE`, so the
AGENTS.md last-resort rule does not apply.

### 3.2 New table `camp_cycles` — additive

```ts
// --- Camp cycles ---------------------------------------------------------
// The camp's year namespace, recorded as an append-only ledger of ROLLOVER
// EVENTS rather than as a foreign key on every table. One row per burn cycle:
// when it opened, who opened it, and — in `plan` — exactly what the rollover
// did, captured at the moment it ran. Cycle membership of an append-only row
// (a reimbursement, a task, an activation) is DERIVED by bracketing its
// created_at between started_at and the next cycle's started_at; only the two
// upsert-in-place ledgers (required_actions, questionnaire_responses) carry an
// explicit `cycle_ordinal`, because their timestamps move.
//
// `ordinal` is the PK — a small monotonic integer minted by the app, which
// makes it usable as a NOT NULL column default on the two stamped tables
// (a uuid could not be). Cycle 1 is seeded lazily by ensureCurrentCycle(),
// the same idempotent insert bootstrap.ts:64-67 does on camp_settings.
// The CURRENT cycle is the row with `ended_at IS NULL`; the rollover stamps
// the outgoing row's ended_at and inserts the next in one transaction.
export const campCycles = pgTable(
  "camp_cycles",
  {
    ordinal: integer("ordinal").primaryKey(),
    // Captain-typed display label — "2027", "AfrikaBurn 2027". Never parsed.
    label: text("label").notNull(),
    startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
    // NULL = the current cycle. Set when the NEXT cycle opens.
    endedAt: timestamp("ended_at", { mode: "date" }),
    openedByUserId: uuid("opened_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // The decision record: the preview the captain confirmed, frozen. Per
    // questionnaire key — the policy that was in force, the audience size, the
    // activation ids closed and re-sent. This is what makes an accidental
    // rollover inspectable AND undoable (§6.4) without a single extra column.
    plan: jsonb("plan")
      .$type<RolloverPlan>()
      .notNull()
      .default(sql`'{"entries":[],"reopened":[]}'::jsonb`),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (c) => ({
    // At most ONE open cycle. Mirrors captain_promotion_open_per_target_idx
    // (:528-530) and questionnaire_activations_one_open_per_key_idx (:568-573).
    oneOpen: uniqueIndex("camp_cycles_one_open_idx")
      .on(c.endedAt)
      .where(sql`${c.endedAt} IS NULL`),
  }),
);
```

> **Note on `camp_cycles_one_open_idx`:** a unique index on a single always-NULL
> column does not constrain anything in Postgres (NULLs are distinct). Write it as
> `uniqueIndex(...).on(sql`(true)`).where(sql`${c.endedAt} IS NULL`)` — a unique index
> on a constant expression over the partial predicate, which is the standard
> "at most one row matching P" idiom. Verify the generated SQL before committing;
> if drizzle-kit will not emit it, drop the index and rely on
> `openNextCycle`'s `SELECT … FOR UPDATE` on the outgoing row, which already
> serialises the only writer.

`RolloverPlan` is a type-only import into `schema.ts`, exactly as `TeamsConfig` is
(`schema.ts:24-26`), so there is no runtime import cycle:

```ts
// packages/db/src/cycles.ts
export interface RolloverPlanEntry {
  questionnaireKey: string;
  title: string;
  carryOver: "carry" | "fresh";
  /** Activation closed by the rollover (null when nothing was open). */
  closedActivationId: string | null;
  /** Activation the rollover opened in the new cycle. */
  openedActivationId: string | null;
  /** How many members were re-gated. */
  gated: number;
  /** How many kept last year's completion (carry only). */
  carriedOver: number;
}
export interface RolloverPlan {
  entries: RolloverPlanEntry[];
  /** Activation ids whose pending gates the rollover expired — the undo key. */
  reopened: string[];
}
```

### 3.3 `required_actions` — one additive column, one index swap

```ts
export const requiredActions = pgTable(
  "required_actions",
  {
    // … unchanged through completedAt …

    // Which camp cycle this obligation belongs to. Stamped, not derived: this
    // row is upserted in place (activations.ts:116-130) so its timestamps move.
    // Default 1 back-fills every existing row into the founding cycle — no data
    // migration, no backfill script. Deliberately NOT a foreign key, for the
    // same reason questionnaire_responses.definition_key isn't one (:1503-1505):
    // the ledger must survive independently of the cycle table.
    cycleOrdinal: integer("cycle_ordinal").notNull().default(1),
  },
  (ra) => ({
    // WAS: uniqueIndex("required_actions_user_action_idx").on(userId, actionKey)
    // The old index made the gate fire once per person per key FOR LIFE. Widened
    // by cycle so a new year mints a NEW row and last year's `completed` row
    // survives intact as the historical record.
    userActionCycleIdx: uniqueIndex("required_actions_user_action_cycle_idx").on(
      ra.userId,
      ra.actionKey,
      ra.cycleOrdinal,
    ),
    // The invariant the old index used to give for free: a member can never see
    // the same gate twice. Forces the rollover to EXPIRE last cycle's pending
    // row before inserting this cycle's. Same shape as the two partial unique
    // indexes already in this file.
    onePendingPerKey: uniqueIndex("required_actions_one_pending_per_key_idx")
      .on(ra.userId, ra.actionKey)
      .where(sql`${ra.status} = 'pending'`),
    userStatusIdx: index("required_actions_user_status_idx").on(
      ra.userId,
      ra.status,
    ),
  }),
);
```

### 3.4 `questionnaire_responses` — one additive column, one index swap

```ts
export const questionnaireResponses = pgTable(
  "questionnaire_responses",
  {
    // … unchanged …
    // One latest-answer row per (user, definition, CYCLE). A `fresh` questionnaire
    // in a new cycle gets a NEW row, so the runner starts blank and last year's
    // answers are never overwritten — they are simply an older row.
    cycleOrdinal: integer("cycle_ordinal").notNull().default(1),
  },
  (r) => ({
    // WAS: uniqueIndex("questionnaire_responses_user_def_idx").on(userId, definitionKey)
    userDefCycleIdx: uniqueIndex("questionnaire_responses_user_def_cycle_idx").on(
      r.userId,
      r.definitionKey,
      r.cycleOrdinal,
    ),
    defIdx: index("questionnaire_responses_def_idx").on(r.definitionKey),
    // Backs the carry-over read-fallback (§4.3): newest row at or below the
    // current cycle, one index scan.
    userDefCycleDescIdx: index("questionnaire_responses_user_def_cycle_desc_idx").on(
      r.userId,
      r.definitionKey,
      r.cycleOrdinal,
    ),
  }),
);
```

*(`userDefCycleIdx` already serves the descending scan; the third index is optional
and can be dropped if `EXPLAIN` shows the unique index is used.)*

### 3.5 `questionnaire_definitions` — one additive column

```ts
  // Rollover policy for THIS questionnaire. Deliberately a COLUMN, not a field
  // inside `definition`: keeping it out of the authored document means
  // classifyChange (questionnaire-builder.ts:461-486) never sees it, so toggling
  // it can never be misread as a breaking change, it never enters an immutable
  // questionnaire_versions snapshot, and a cosmetic re-publish (which overwrites
  // the current snapshot in place, questionnaire-lifecycle.ts:137-143) can never
  // retroactively rewrite what a past collection's policy was.
  carryOver: carryOverPolicyEnum("carry_over").notNull().default("fresh"),
```

### 3.6 `questionnaire_activations` — one additive column

```ts
    // The policy IN FORCE for this collection, copied off the definition at Send
    // time — exactly as `version` and `title` are (questionnaire-lifecycle.ts:337-340),
    // and exactly as notification_deliveries.presentation is copied off broadcasts
    // (:918-921) so the gate never has to join back. Flipping the definition's
    // toggle therefore affects the NEXT send and never the one in flight.
    carryOver: carryOverPolicyEnum("carry_over").notNull().default("fresh"),
```

### 3.7 `camp_settings.config` — **no DDL at all**

The three code questionnaires (`burner_profile`, `dietary_requirements`,
`driver_profile`) can never have a `questionnaire_definitions` row — they are in
`RESERVED_DEFINITION_KEYS` (`questionnaire-definitions.ts:11-16`). Their policy lives
in the existing JSONB, read with the existing fallback discipline:

```ts
// packages/db/src/camp-config.ts — ADDED, nothing existing touched.

export type CarryOverPolicy = "carry" | "fresh";

// Policy for questionnaires with no questionnaire_definitions row — i.e. the
// three RESERVED code keys. Identity carries; allergies and vehicles do not.
export const DEFAULT_CARRY_OVER: Record<string, CarryOverPolicy> = {
  burner_profile: "carry",
  dietary_requirements: "fresh",
  driver_profile: "fresh",
};

/**
 * Coerce the stored `questionnaireCarryOver` map out of the untyped config
 * JSONB. Per-key fallback (NOT the wholesale fallback resolveTeamsConfig uses
 * at :76-87) — a config written before this feature simply has no key, and one
 * bad entry must not discard the captain's other choices.
 *
 * Deliberately does NOT extend DEFAULT_CAMP_CONFIG: the seed-drift test
 * (apps/web/lib/__tests__/camp-config.test.ts:79-107) pins the `{"teams":…}`
 * literal in three places by regex and compares with toEqual. Widening the seed
 * would break it and force a pointless ALTER COLUMN … SET DEFAULT.
 */
export function resolveCarryOverMap(raw: unknown): Record<string, CarryOverPolicy> {
  const stored =
    raw && typeof raw === "object"
      ? (raw as { questionnaireCarryOver?: unknown }).questionnaireCarryOver
      : undefined;
  const out = { ...DEFAULT_CARRY_OVER };
  if (stored && typeof stored === "object") {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      if (value === "carry" || value === "fresh") out[key] = value;
    }
  }
  return out;
}

/** Pure transform for the captain toggle — the setTeamArchived (:121-131) shape. */
export function setCarryOver(
  config: Record<string, unknown>,
  key: string,
  policy: CarryOverPolicy,
): Record<string, unknown> {
  const current = resolveCarryOverMap(config);
  return { ...config, questionnaireCarryOver: { ...current, [key]: policy } };
}
```

Written through the existing `mutateTeamsConfig` lock (`camp-config.ts:184-212`) —
which needs its transform signature widened from `TeamsConfig` to the whole config
object, or a sibling `mutateCampConfig` added alongside it. Either is a few lines;
note that `assertStableTeamKeys` (`:167-176`) must keep running on the `teams` half.

### 3.8 Summary of generated migration `0019_*.sql`

Additive:
- `CREATE TYPE "carry_over_policy" AS ENUM('carry','fresh')`
- `CREATE TABLE "camp_cycles" (…)` + its partial unique index
- `ALTER TABLE "required_actions" ADD COLUMN "cycle_ordinal" integer NOT NULL DEFAULT 1`
- `ALTER TABLE "questionnaire_responses" ADD COLUMN "cycle_ordinal" integer NOT NULL DEFAULT 1`
- `ALTER TABLE "questionnaire_definitions" ADD COLUMN "carry_over" "carry_over_policy" NOT NULL DEFAULT 'fresh'`
- `ALTER TABLE "questionnaire_activations" ADD COLUMN "carry_over" "carry_over_policy" NOT NULL DEFAULT 'fresh'`
- `CREATE UNIQUE INDEX "required_actions_one_pending_per_key_idx" …`

Non-additive (two lines, discussed in §8.5):
- `DROP INDEX "required_actions_user_action_idx"` → `CREATE UNIQUE INDEX "required_actions_user_action_cycle_idx"`
- `DROP INDEX "questionnaire_responses_user_def_idx"` → `CREATE UNIQUE INDEX "questionnaire_responses_user_def_cycle_idx"`

Every `ADD COLUMN NOT NULL` carries an explicit `DEFAULT`, per AGENTS.md. **No
backfill script. No data migration. Zero rows change value.**

---

## 4. The carry-over model, end to end

### 4.1 Type

```ts
// packages/types — or packages/db/src/camp-config.ts, which is where the
// resolver lives and which @camp404/db already exports.
export type CarryOverPolicy = "carry" | "fresh";
```

It is **not** added to `BuilderQuestionnaire` (`questionnaire-builder.ts:123-128`). If
it were, `classifyChange` would ignore it (it reads only `fieldMap` `:391-395` and
`visibleIfMap` `:442-454`), so a toggle would classify as **cosmetic** — which is the
*right* outcome (flipping the policy must never force everyone to re-answer) reached by
accident. But a cosmetic publish overwrites the current version's snapshot in place
(`questionnaire-lifecycle.ts:137-143`), so the flag would retroactively rewrite what
an already-sent version says its policy was. A policy read at fan-out time must not be
rewritable after the fan-out. **So it is a column, and the activation freezes a copy.**

### 4.2 Storage and resolution

One resolver, two stores, documented precedence:

```ts
// packages/db/src/cycles.ts

/**
 * The rollover policy for a questionnaire key. A questionnaire_definitions row
 * wins when one exists (builder questionnaires); otherwise the camp_settings
 * config map (the three RESERVED code keys, which can never have a row —
 * questionnaire-definitions.ts:11-16); otherwise `fresh`. The two branches are
 * disjoint in practice, so precedence never actually arbitrates.
 */
export async function carryOverFor(key: string): Promise<CarryOverPolicy> {
  const db = createHttpDb();
  const [def] = await db
    .select({ carryOver: questionnaireDefinitions.carryOver })
    .from(questionnaireDefinitions)
    .where(eq(questionnaireDefinitions.key, key))
    .limit(1);
  if (def) return def.carryOver;
  const [row] = await db.select({ config: campSettings.config }).from(campSettings).limit(1);
  return resolveCarryOverMap(row?.config)[key] ?? "fresh";
}
```

`sendActivation` (`questionnaire-lifecycle.ts:310-387`) already reads the definition
row for `status`/`version`/`title` at `:312-320`; add `carryOver` to that select and to
the insert at `:337-347`. **One field in an existing query, one field in an existing
insert.**

### 4.3 The two places the policy is read

Everything the flag does, it does in exactly two predicates.

**(a) Fan-out — who gets a gate.** In `openActivation`
(`packages/db/src/activations.ts:81-100`), between `computeAudience` and the insert:

```ts
// Carry-over: a member whose stored completion for this key already MEETS this
// activation's version keeps it — no new gate. `required_actions` is the
// satisfaction oracle for BOTH questionnaire classes: builder questionnaires
// write questionnaire_responses, the three code questionnaires write bespoke
// domain tables, but every one of them flips a required_actions row to
// `completed` (activations.ts:173-206 / :338-362). So this filter is storage-
// agnostic. A `fresh` activation skips this block entirely and gates everyone.
//
// The version rule is what keeps `carry` honest year-round, not just at
// rollover: a BREAKING edit mints a new version (questionnaire-lifecycle.ts:118),
// so meetsRequiredVersion fails for last year's completion and the carry-over
// key re-gates everyone anyway. A COSMETIC re-send does not.
let audience = recipientIds;
if (act.carryOver === "carry") {
  const done = await httpDb
    .select({
      userId: schema.requiredActions.userId,
      version: schema.requiredActions.version,
    })
    .from(schema.requiredActions)
    .where(
      and(
        eq(schema.requiredActions.actionKey, act.questionnaireKey),
        eq(schema.requiredActions.status, "completed"),
      ),
    );
  const satisfied = new Set(
    done
      .filter((r) => !r.version || meetsRequiredVersion(act.version, r.version))
      .map((r) => r.userId),
  );
  audience = recipientIds.filter((id) => !satisfied.has(id));
}
```

`meetsRequiredVersion` is already imported at `activations.ts:5`. Roughly 20 lines,
one extra query per send (≤80 rows), inside the existing function.

**(b) Read — does the form pre-fill.** `loadQuestionnaireResponse`
(`questionnaire-responses.ts:59-80`) gains two arguments:

```ts
/**
 * A member's answers for one builder questionnaire in the given cycle.
 *
 * `carry` falls back to the newest row at or below `cycleOrdinal`, so last
 * year's answers pre-fill this year's form and the member confirms rather than
 * retypes. `fresh` reads ONLY the current cycle — no row means a genuinely
 * blank form, which is what "it must do so fresh" means. The older row is never
 * read, never written, never deleted: it is simply an older row.
 */
export async function loadQuestionnaireResponse(
  userId: string,
  definitionKey: string,
  cycleOrdinal: number,
  carryOver: CarryOverPolicy,
): Promise<QuestionnaireResponseRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({ /* … + cycleOrdinal … */ })
    .from(questionnaireResponses)
    .where(
      and(
        eq(questionnaireResponses.userId, userId),
        eq(questionnaireResponses.definitionKey, definitionKey),
        carryOver === "carry"
          ? lte(questionnaireResponses.cycleOrdinal, cycleOrdinal)
          : eq(questionnaireResponses.cycleOrdinal, cycleOrdinal),
      ),
    )
    .orderBy(desc(questionnaireResponses.cycleOrdinal))
    .limit(1);
  return row ?? null;
}
```

**Reads fall back; writes always land in the current cycle.**
`upsertQuestionnaireResponse` (`:22-56`) and `completeBuilderResponse`
(`activations.ts:304-367`) take `cycleOrdinal` and put it in the values and in the
`onConflictDoUpdate` target. A carry-over member who replays a form in year N therefore
*copies* their answer into a year-N row on first keystroke — which correctly records
that they reaffirmed it this year, and leaves year N-1 intact.

For the three **code** questionnaires there is no `questionnaire_responses` row; the
same idea is one comparison against the domain table's own `completed_at`:

```ts
// apps/web/lib — the bespoke pages (burner profile, dietary, driver).
// A `fresh` code questionnaire whose domain row was last completed BEFORE this
// cycle opened renders blank; the domain row is overwritten on submit and the
// before→after diff lands in questionnaire_edits (schema.ts:603-641), which is
// the history for this class. See §8.3 for what that history cannot answer.
const startBlank =
  policy === "fresh" &&
  (!domainRow?.completedAt || domainRow.completedAt < cycle.startedAt);
```

### 4.4 The gating query does not change

`getPendingRequiredActions` (`activations.ts:209-233`) stays exactly as written:
`status='pending' AND blocking=true`, oldest first. The
`required_actions_one_pending_per_key_idx` partial unique index guarantees at most one
pending row per (user, key) across all cycles, so there is nothing to disambiguate.
`nextGate` (`apps/web/lib/required-actions.ts:30-40`) is untouched. `app/page.tsx:55`
is untouched. **The hot path does not read `camp_cycles` at all.**

That is the single strongest argument for this design over a namespace design: the
query that runs on every authenticated page load in the app is not modified, not
joined, and not slowed.

---

## 5. Where the current cycle comes from

```ts
// packages/db/src/cycles.ts

export interface Cycle { ordinal: number; label: string; startedAt: Date }

/**
 * The open cycle, seeding cycle 1 if the ledger is empty — the same idempotent
 * "ensure the row exists then use it" bootstrap.ts:64-67 does on camp_settings,
 * so a deploy of this feature needs no hand-run SQL and no seed migration.
 * Label defaults to the current calendar year; the captain can rename it.
 */
export async function ensureCurrentCycle(): Promise<Cycle> { /* INSERT … ON CONFLICT DO NOTHING, then SELECT */ }

/** The open cycle, or null on a system that has never run ensureCurrentCycle. */
export async function getCurrentCycle(): Promise<Cycle | null> { /* WHERE ended_at IS NULL ORDER BY ordinal DESC LIMIT 1 */ }
```

Callers: the runner page, the replay tool, the rollover, the captain settings page, and
the two derived predicates in §7.1/§7.5. Not the home page. The app-side facade mirrors
`apps/web/lib/camp-config.ts:27-48` so E2E runs without a database — the test store
returns `{ ordinal: 1, label: "2026", startedAt: new Date(0) }`.

---

## 6. The rollover, step by step

### 6.1 Where it lives

`/captains/camp-settings`, below the team editor — the surface that already exists
(`apps/web/app/captains/camp-settings/page.tsx`), with the same preview-but-locked
treatment (`page.tsx:14-19`) and the same `requireCaptain()` gate
(`actions.ts:44-63`). A new section, "Camp year", showing the current cycle's label,
when it started, and a **Start a new year** button.

### 6.2 Step 1 — the plan (a pure function, zero writes)

```ts
export async function planRollover(nextLabel: string): Promise<RolloverPlan>;
```

Reads: the open cycle; every open activation
(`questionnaire_activations WHERE status='open'`); each key's `carryOver`; each key's
completed set. Produces one `RolloverPlanEntry` per key, plus the counts for the
side effects in §7. It writes nothing and is safe to render on every page load.

### 6.3 Step 2 — the preview screen

Plain sentences, one per questionnaire, no jargon:

> **Starting Camp 404 2027.**
>
> - **Dietary requirements — starts fresh.** All 47 members will be asked again, on a
>   blank form. Their 2026 answers stay readable on their profile.
> - **Burner profile — carries over.** 44 members keep their answers and see nothing.
>   3 who never finished it in 2026 will still be asked.
> - **Kitchen shift preferences — starts fresh.** 12 members will be asked again.
>
> Also:
> - 4 open questionnaires will be closed and re-sent.
> - Dues will read as unpaid for everyone until they are recorded for 2027.
> - Nobody's approval, rank, team, or answers are deleted. Nothing here is permanent —
>   you can undo this until the first person answers something.

Confirmation requires **typing the new label** (`2027`) — the destructive-confirm
pattern; the codebase already requires a confirm dialog for everyone+blocking sends
(`docs/questionnaire-builder.md` §6.4). It is hard to do by accident and it says what
it will do before it does it, per the brief.

### 6.4 Step 3 — one transaction

```ts
export async function openNextCycle(input: {
  label: string;
  openedByUserId: string;
}): Promise<{ ok: true; ordinal: number } | { ok: false; error: string }>;
```

Inside a single `createPooledDb()` transaction (`camp-config.ts:189` / `bootstrap.ts:61`
shape):

1. `SELECT … FOR UPDATE` the open `camp_cycles` row — serialises concurrent captains
   exactly as `mutateTeamsConfig` (`:196-199`) and `bootstrapFirstCaptain`
   (`:68-72`) do. Re-read the plan inside the lock so a concurrent send cannot slip past
   the preview (the pattern `unpublishDefinition` uses at
   `questionnaire-lifecycle.ts:185-197`).
2. `UPDATE camp_cycles SET ended_at = now WHERE ordinal = current`.
3. `INSERT camp_cycles (ordinal = current+1, label, started_at = now, opened_by_user_id, plan)`.
4. For each open activation, inline `closeActivation`'s body
   (`questionnaire-lifecycle.ts:242-254`): `status='closed'`, `closed_at=now`, and its
   still-pending `required_actions` → **`expired`**. This is what frees the
   `required_actions_one_pending_per_key_idx` slot for step 5. Record the activation ids
   in `plan.reopened`.
5. For each closed activation whose definition is still `published`, inline
   `sendActivation`'s body (`:334-364`) + `openActivation`'s body (`activations.ts:94-133`):
   a new activation row with the same `scope` / `team` / `blocking`, `due_at = null`,
   `version` = the definition's **currently published** version, and
   `carry_over` = the definition's current policy; then fan out `required_actions` at
   `cycle_ordinal = current+1`, with the §4.3(a) carry-over filter applied.
6. `INSERT audit_log (action: 'camp.cycle.opened', target: ordinal, metadata: plan)` —
   `audit_log` already exists (`schema.ts:1180-1208`).
7. Optionally (checkboxes on the preview, **all default OFF**): close open `tasks`
   from the outgoing cycle; revoke unused `invite_codes`; publish the announcement
   in §7.6.

Steps 4 and 5 are *the two functions that already exist*. The rollover is a loop over
them. For 80 members and ≤10 questionnaires that is under 1000 rows in one transaction.

> **Refactor note:** `closeActivation`, `sendActivation` and `openActivation` each open
> their own pool (`createPooledDb()` / `createHttpDb()`). To run them inside one
> transaction, extract each body into a `…Tx(tx, …)` form and have the existing
> exported function be a thin pool-owning wrapper. That is a mechanical change to three
> functions and it also makes them unit-testable against the PGlite harness
> (`packages/db/src/__tests__/_harness.ts`) without pool juggling.

### 6.5 Step 4 — undo

```ts
export async function undoCycle(ordinal: number): Promise<UndoResult>;
```

Allowed only when `ordinal` is the max **and** the cycle is untouched:

```sql
select 1 from questionnaire_responses where cycle_ordinal = $1
union all
select 1 from required_actions where cycle_ordinal = $1 and status <> 'pending'
limit 1
```

Empty ⇒ undoable. Then, in one transaction:

1. `DELETE required_actions WHERE cycle_ordinal = $1`
2. `DELETE questionnaire_activations WHERE id IN (plan.entries[].openedActivationId)`
3. `UPDATE questionnaire_activations SET status='open', closed_at=null WHERE id = ANY(plan.reopened)`
4. `UPDATE required_actions SET status='pending' WHERE activation_id = ANY(plan.reopened) AND status='expired'`
   — safe because a row expired by an *earlier* manual close belongs to an activation
   this rollover did not re-open, so it is not in the set.
5. `UPDATE camp_cycles SET ended_at = null WHERE ordinal = $1 - 1`
6. `DELETE camp_cycles WHERE ordinal = $1`
7. `INSERT audit_log (action: 'camp.cycle.undone')`

Every step is a straight inverse because **the rollover only ever appended rows and
flipped two enum values.** Nothing was deleted, so nothing has to be resurrected. After
the first member answers anything, undo is refused and the captain is told to close and
re-send by hand instead — the honest boundary.

---

## 7. The accidental-carry-over cases

### 7.1 `users.dues_paid` — derived, not reset

`dues_paid` (`schema.ts:265`) is read by the roster (`roster.ts:61,105`) and **written
by nothing** — `rg` finds no writer anywhere in `apps/web` or `packages`. The harvest
flagged the same thing (`00-harvest-and-roadmap.md:205`: *"a boolean written by
nothing"*).

Resetting it on rollover would lose last year's fact. Instead:

```ts
// The paid-for-THIS-CYCLE predicate. dues_paid_at is the record; dues_paid
// becomes a derived value, never written by the rollover. Zero writes, no data
// loss, and an undone rollover needs no repair.
const duesPaid = user.duesPaidAt != null && user.duesPaidAt >= cycle.startedAt;
```

Change `roster.ts:61` to select `duesPaidAt` and compute `duesPaid` in the mapper at
`:105`. Because `dues_paid_at` is null everywhere today, the derived value is `false`
for everyone — **byte-identical to current behaviour, zero migration risk.**

This is also the answer the harvest asked for before the ledger is built
(`00-harvest-and-roadmap.md:364`): **the dues ledger keys off a timestamp compared to
the cycle boundary, not off a boolean.** When `payments` lands it needs no `cycle_id`
either — `created_at` bracketed by cycle starts is the cycle.

### 7.2 `users.approval_status` and `rank` — never reset. Say it loudly.

`approval_status` (`schema.ts:295-297`) is **vetting** — "is this person allowed in this
camp at all" — not "are they coming this year". `isApproved` (`packages/core/src/access.ts:76-79`)
redirects a non-`approved` user to `/pending-approval` (`app/page.tsx:70`). Resetting it
on rollover would lock the entire camp out of the app on day one of the new year and
dump 60 people into a captain's approval queue. That is the single most catastrophic
thing a rollover could do.

Same for `rank` — resetting captains would lock the camp out of its own admin.

If the camp wants "are you coming this year?", that is a **questionnaire** — the copy
already exists (`apps/web/lib/questionnaire.ts:351`, *"Coming to burn this year?"*).
Make it a `fresh` builder questionnaire and it re-gates every year for free. The
mechanism this design builds is precisely the right home for that question.

`planRollover` should state this in the preview: *"Nobody's approval or rank changes."*

### 7.3 `users.terms_consented_at` — version-scoped, not year-scoped

`terms_version` / `terms_consented_at` (`schema.ts:305-306`) are written nowhere today
(only nulled by `sanitisedUserPatch`, `account.ts:36-37`). The re-consent mechanism is
**already** the version pair: bump `terms_version` and the stored consent no longer
matches. Annual re-consent is therefore a captain bumping the terms version — a lever
that already exists and needs no rollover code.

**The rollover does not touch these columns.** Coupling consent to the calendar would
also be wrong on its own terms: consent is to a document, not to a year.

### 7.4 `team_memberships` — carried, with the confirmation as a questionnaire

`team_memberships` (`schema.ts:474-499`) has PK `(user_id, team)`, an `is_lead` boolean,
and a `created_at` — no lifecycle column. Emptying it on rollover would destroy every
lead assignment, which `deriveViewerRank` uses for clearance and which `computeAudience`
uses for the `team` and `team_leads` scopes (`audience.ts:44-52`).

**Decision: memberships carry.** "Which team are you on this year" is a `fresh`
questionnaire, and a captain acts on the answers in the roster editor they already have
(`apps/web/app/captains/camp-management/`). The derivation is free anyway: `created_at
>= cycle.startedAt` answers "who joined kitchen this year" with no column.

### 7.5 Open `required_actions` — expired by the activation close

Covered by §6.4 step 4. But note the ordering constraint the new partial unique index
imposes: **expire before insert, in the same transaction.** The index makes the
"member sees the same gate twice" bug impossible rather than merely unlikely.

### 7.6 The stale-driver hazard (not flagged in the harvest)

`broadcasts.ts:75` computes the drivers audience as
`driver_profiles.intends_to_drive = true` with **no time bound**, feeding
`computeAudience`'s `drivers` scope (`audience.ts:53-54`). After a rollover, everyone
who drove last year is still in the drivers audience, still shows `isDriver` on the
roster (`roster.ts:67`, `camp-roster.ts:109`), and still appears as a driver over MCP
(`mcp.ts:56-64`). A captain broadcasting "drivers, convoy leaves at 06:00" reaches
people who are not coming.

`driver_profile` being **fresh** re-opens their gate, but `intends_to_drive` stays
`true` until they re-answer. One predicate fixes it, in the same shape as §7.1:

```ts
// broadcasts.ts:73-76 — a driver is someone who declared intent IN THIS CYCLE.
.where(and(
  eq(schema.driverProfiles.intendsToDrive, true),
  gte(schema.driverProfiles.completedAt, cycle.startedAt),
))
```

Same change in `roster.ts:67` and `mcp.ts:56-64`. `car_members` (`schema.ts:455-472`)
needs no change: it is only meaningful alongside a current driver profile, and its
`created_at` dates it if a reader ever needs to.

### 7.7 Account erasure

`sanitiseAccount` deletes all of a user's `required_actions` (`account.ts:93`)
regardless of cycle, which stays correct — a sanitised user has no obligations in any
year. It does not touch `questionnaire_responses` (only `questionnaire_edits`, `:90`),
which also stays correct: those rows already outlive erasure by design and now simply
span cycles. **No change to `account.ts`.**

---

## 8. Where derivation gets expensive or ambiguous — honestly

The angle's premise is that timestamps beat foreign keys. Here is where that is
weakest.

### 8.1 The finance read is the most likely silent bug

`reimbursements` (`schema.ts:749`) is perfectly derivable — but the derivation is
*opt-in on the reader*. A finance page that sums `reimbursements` without a cycle
bracket silently reports two years of spend as this year's. With a `cycle_id` column
that mistake is at least visible in the query; with a timestamp bracket it is invisible
by omission. **Mitigation:** put a single `cycleWindow(cycle)` helper in
`packages/db/src/cycles.ts` returning `{ from, to }`, and require every year-scoped
aggregate to take it as an argument so omitting it is a type error, not a wrong number.
This is the cost of the design and it should be paid up front, not discovered in
year two.

### 8.2 `adoptees.slot_number` collides across cycles

`adoptees` (`schema.ts:993-1013`) has `slot_number integer NOT NULL` with no unique
index, so nothing breaks at the DB level — but the adoption page will list 2026's
slots 1-8 next to 2027's slots 1-8 unless it brackets by `created_at`. Real derivation
cost. Same mitigation as §8.1.

### 8.3 The code questionnaires keep only a diff, not a snapshot

For `burner_profiles` / `dietary_requirements` / `driver_profiles` the domain row is
overwritten on a fresh re-answer. History is `questionnaire_edits` (`schema.ts:603-641`),
which stores a per-field before→after diff (`changes`, `:630-633`) — and only on
**re-submits**, per its own comment (`:608-610`: *"When a user revisits a questionnaire
they have already completed and re-submits it"*). So "what was Sam's 2026 diet" is
reconstructible by replaying diffs backwards, which is thin.

Builder questionnaires do not have this problem — their old answers are literally an
older row. **Named limitation.** The cheap fix, if it ever bites, is the one the memory
says is wanted anyway: move the three code questionnaires onto the builder, and they
inherit cycle-scoped responses for free.

### 8.4 "Completed in cycle N" for a code questionnaire is slightly fuzzy

`burner_profiles.completed_at` moves when the member edits. A member who tweaks a 2026
answer in 2027 will count as having completed it in 2027. For a 60-person camp's
completion tallies that is acceptable; for anything that matters, `required_actions`
(cycle-stamped, one row per obligation per cycle) is the exact answer and should be the
source. Say so in the metrics code.

### 8.5 The two index swaps are the design's only real schema risk

`DROP INDEX required_actions_user_action_idx` + `CREATE UNIQUE INDEX
required_actions_user_action_cycle_idx` is the one non-additive step. Facts:

- No data is lost. The new key is a strict superset of the old one, so every existing
  row still satisfies it (all at `cycle_ordinal = 1`).
- drizzle-kit runs a migration in a transaction, so there is no window where the
  constraint is absent to another connection.
- The `ON CONFLICT` targets in `openActivation` (`activations.ts:116-120`),
  `ensureRequiredAction` (`:163-165`), `upsertQuestionnaireResponse`
  (`questionnaire-responses.ts:43-47`) and `completeBuilderResponse`
  (`activations.ts:325-329`) must be updated in the same commit or the upserts throw.
  **This is the one place a partial rollout breaks the app**, so schema and code ship
  together.
- Rollback: re-create the old narrow index. It will only succeed while every user has at
  most one row per key — i.e. before the first rollover. After the first rollover the
  rollback is de-duplicate-then-recreate, which is why the undo path in §6.5 matters.

### 8.6 What the event model cannot do at all

`team_budgets` (§2.6). Its PK is `team`; there is no timestamp to derive from and no
history to recover. The event model has nothing to offer here, and this design does not
pretend otherwise — it leaves it, and names the fix.

---

## 9. What I deliberately did not do

**Did not add `cycle_id` to eleven tables.** The donor's `editions` model
(`docs/harvest/00-harvest-and-roadmap.md:208`, marked **DECIDE**) tags every row. For
one camp of 30-80 people that buys a wide backfill, a `WHERE cycle_id = $1` on every
query, and a whole class of "forgot the filter" bugs, in exchange for making explicit
something 17 of those tables already encode in `created_at`. Two columns instead of
eleven.

**Did not put `carryOver` inside `BuilderQuestionnaire`.** §4.1 — a cosmetic re-publish
overwrites the version snapshot in place (`questionnaire-lifecycle.ts:137-143`), which
would let a captain retroactively rewrite the policy a past collection ran under.

**Did not change `getPendingRequiredActions` or `nextGate`.** The hot path on every
authenticated page load is untouched. The partial unique index does the disambiguation
the query would otherwise have had to do.

**Did not clear, delete, or reset anything.** No row's value changes on rollover except
two enum flips (`activation.status` → `closed`, its pending gates → `expired`), both of
which the codebase already performs on a manual close and both of which the undo
reverses.

**Did not reset `approval_status`, `rank`, `terms_consented_at`, or
`team_memberships`.** §7.2, §7.3, §7.4. Each has a reason; the first would be
catastrophic.

**Did not auto-increment `previous_afrikaburns` / `previous_burning_mans`**
(`schema.ts:275-276`). A rollover would be guessing that everyone attended. If the camp
wants it, it is an answer on the fresh attendance questionnaire, not an inference.

**Did not add a `cycle_ordinal` to `questionnaire_activations`.** Activations are
immutable once opened (`docs/questionnaire-builder.md` §6.3), so `opened_at` derives
the cycle exactly. This is the design showing its own restraint: where derivation is
genuinely sound, no column.

**Did not add a background job, a cron, or an ops runbook.** The rollover is one
captain pressing one button inside one transaction. `ensureCurrentCycle` seeds cycle 1
lazily, so deploying this needs no hand-run SQL.

**Did not fix `team_budgets`.** §2.6, §8.6. Deliberate debt, named, with the fix
written down: `primaryKey({ columns: [team, cycleOrdinal] })` when the finance work
lands.

**Did not touch `DEFAULT_CAMP_CONFIG` or the seeded column default.** §3.7 — the
drift test (`apps/web/lib/__tests__/camp-config.test.ts:79-107`) pins that literal in
three places, and a per-key resolver makes widening it unnecessary.

---

## 10. What the member sees

**Most members, most rollovers: almost nothing.** A member whose questionnaires are all
`carry` and who finished them has no pending gates, so `getPendingRequiredActions`
returns nothing, `nextGate` returns null, and `app/page.tsx:55` falls straight through
to the home screen. The only visible change is the announcement.

**The announcement.** The rollover publishes one `broadcasts` row with `presentation =
'acknowledge'` (`schema.ts:180-186`) — the existing full-screen takeover the camp
already uses for terms-style messages. *"Camp 404 is now in 2027. A few things need
doing again."* One insert into machinery that already exists; no new UI.

**A member with fresh gates.** After acknowledging, the home page redirects into the
first blocking gate exactly as it does for any send. The runner should say why —
a line in the runner chrome sourced from `activation.carryOver === 'fresh'` plus the
cycle label: *"This one starts fresh for 2027 — your 2026 answers are still on your
profile."* Copy only, no schema.

**A member who joined mid-cycle** (`users.created_at` inside the outgoing cycle) is not
special-cased. They already have `required_actions` rows at the outgoing ordinal from
`ensureRequiredAction` at signup (`apps/web/lib/users.ts:196-205`) and from any
open activation. The rollover treats them like everyone else: their pending rows are
expired with the close, and the re-send gates them by the same carry-over filter. If
they completed the burner profile in November, `carry` skips them; if dietary is
`fresh`, they are asked again in January like everyone else — which is correct, because
"fresh" is about the *cycle*, not about elapsed time.

> `ensureRequiredAction` (`activations.ts:144-166`) needs one new field: stamp
> `cycleOrdinal` with the current cycle rather than letting the column default to 1.
> Someone signing up in cycle 3 must not get a cycle-1 obligation.

**A member who never answered last year's questionnaire.** Two cases, and the design
handles both without a special branch:

- **`fresh` key.** Their cycle N-1 pending row is expired by the close, and the re-send
  gates everyone in scope, so they get a clean cycle-N pending row and a blank form.
  Their unfinished N-1 attempt (if they got partway) stays as a row with `completed_at
  IS NULL` at ordinal N-1 — inspectable, never read again.
- **`carry` key.** They have no `completed` `required_actions` row, so the §4.3(a)
  filter does **not** skip them: they are gated again. Correct — "carries over" means
  "last year's answer still counts", and they do not have one. This is the case a naive
  design gets wrong by only re-gating on `fresh`.

**On the member's profile.** Last year's answers are readable because they are still
there: `questionnaire_responses WHERE user_id = $1 AND cycle_ordinal = $2`, joined to
`camp_cycles` for the label. "Sam's 2026 dietary answers" is one query with no archive
table and no special path. The 2026 roster is `questionnaire_responses` +
`required_actions` at ordinal 2, plus `created_at`-bracketed reads of the derivable
tables.

---

## 11. Build order

1. **Schema + generated migration `0019`** (§3), with the four `ON CONFLICT` target
   updates in the same commit (§8.5). Covered by the PGlite harness
   (`packages/db/src/__tests__/_harness.ts`): replay the migrations, assert the widened
   indexes, assert the partial pending index rejects a second pending row.
2. **`packages/db/src/cycles.ts`** — `ensureCurrentCycle` / `getCurrentCycle` /
   `carryOverFor` / `cycleWindow`, plus the `@camp404/db` export map entry
   (`packages/db/package.json`) and the E2E facade in `apps/web/lib/`.
3. **Carry-over reads and fan-out** (§4.3) — `openActivation`'s filter, the widened
   `loadQuestionnaireResponse` / `upsertQuestionnaireResponse` / `completeBuilderResponse`
   signatures, the `startBlank` predicate on the three bespoke pages. Ship this alone
   and it is already useful: `carry` questionnaires stop re-gating people who answered.
4. **The captain toggle** — `carry_over` on the builder's `lifecycle-controls.tsx`, and
   the config-map toggle for the three code keys on `/captains/camp-settings`.
5. **`planRollover` + the preview + `openNextCycle`** (§6). Pure planner first, unit
   tested; the transaction after.
6. **`undoCycle`** (§6.5).
7. **The derived predicates** (§7.1 dues, §7.6 drivers) and the `cycleWindow`
   discipline on the year-scoped readers (§8.1, §8.2).

Steps 1-4 are useful without 5-7. Step 5 is the only one that needs the
`…Tx(tx, …)` refactor of the three lifecycle functions.
