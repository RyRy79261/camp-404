# Year namespace + per-questionnaire carry-over (design + plan)

**Date:** 2026-09-08
**Status:** Proposed — awaiting the owner's calls in §12.
**Program:** Camp 404, post-harvest. Answers harvest item §14
(`docs/harvest/00-harvest-and-roadmap.md:54`, "the unasked product question: what happens in
year two?"). Builds on sub-project E (the `required_actions` gating engine,
`docs/superpowers/specs/2026-05-30-gating-engine-design.md`) and the builder's activation
lifecycle (migration `0018_workable_praxagora`).

**Decision in one paragraph.** The year is an integer stamped on two tables and a list in
`camp_settings.config`. It is not an entity, not a foreign key, and not on eleven tables.
`questionnaire_activations` and `questionnaire_responses` gain a `cycle integer NOT NULL
DEFAULT 1`; the response table's latest-answer unique index widens by that column;
`questionnaire_activations` and `questionnaire_definitions` each gain a `carry_over` policy.
`required_actions` is deliberately **not** cycle-keyed. Advancing the year is a captain
action that, for each questionnaire whose policy is `fresh`, does exactly what a captain
already does by hand — close the open activation, open a fresh one — in one transaction,
after showing a plan. Nothing is deleted. If nobody presses the button, the app behaves
exactly as it does today.

---

## 1. Problem

The owner, verbatim:

> "Regarding when we go to next year, I want the option for certain questionnaires to be
> configurable: whether the answers carry over to next year or whether, if I replay that
> questionnaire, it must do so fresh. Everything should be under a year namespace where
> captains can say whether we've progressed to a new year."

Camp 404 has no edition, cycle, season or year concept. `rg -w 'edition|cycle|season|year'
over packages/db/src apps/web/lib` returns only `import cycle` comments
(`packages/db/src/schema.ts:24`, `packages/db/src/relations.ts:10`) and questionnaire copy
(`apps/web/lib/questionnaire.ts:202`). Two schema comments *promise* a yearly reset —
`schema.ts:245` ("persist across the yearly camp reset; per-burn data in other tables is
cleared") and `schema.ts:375` ("persists across the yearly reset") — and nothing implements
either.

Three concrete failures on a second burn:

1. **A member's answer is destroyed or wrongly kept, and you cannot tell which.**
   `questionnaire_responses` is unique on `(user_id, definition_key)`
   (`schema.ts:1529-1532`). Re-answering *overwrites* last year's answer in place. There is
   physically nowhere to put a second year of answers.
2. **A gate can never fire twice.** `required_actions` is unique on `(user_id, action_key)`
   (`schema.ts:673-676`) — but this one is fine, and §4 explains why keeping it that way is
   the design's load-bearing choice, not its weakness.
3. **Facts that mean "this year" silently persist.** `users.dues_paid`, `approval_status`,
   `terms_consented_at`, open `required_actions`, `team_memberships` — the five the harvest
   flagged. §8 takes each one and says what happens to it, including the two that turn out
   to be latent rather than live.

---

## 2. What exists today — verified against source

Every claim below was read this session. Where a competing design got a fact wrong, §11 says so.

| Claim | Evidence |
|---|---|
| `camp_settings` is a singleton with a JSONB `config` | `schema.ts:1421-1447` — PK is `boolean("id").default(true)` + `check("camp_settings_singleton")`; `config` is `jsonb().$type<TeamsConfig>()` with an inline SQL default |
| `resolveTeamsConfig` **preserves** unknown top-level keys | `camp-config.ts:76-87` — validates `teams` then returns `raw as TeamsConfig` |
| …but the three config transforms **destroy** them | `camp-config.ts:108-118`, `:121-131`, `:138-151` — each returns a fresh `{ teams: … }` literal. **See §3.0 — this is a P0 prerequisite fix.** |
| The singleton read-modify-write lock | `camp-config.ts:184-208` (`mutateTeamsConfig`, `INSERT … ON CONFLICT DO NOTHING` then `SELECT … FOR UPDATE`); same shape at `bootstrap.ts:60-72` |
| Opening an activation **re-arms** the gate in place | `activations.ts:102-130` — `onConflictDoUpdate` on `(user_id, action_key)` sets `status:"pending", completedAt:null` |
| Closing an activation **expires** the gate without deleting | `questionnaire-lifecycle.ts:242-254`; the comment at `:225` calls `expired` a "non-gating terminal state, NOT deleted — preserves metrics" |
| One OPEN activation per key, enforced in the DB | `schema.ts:571-573` (`questionnaire_activations_one_open_per_key_idx`), migration 0018 |
| A send copies `version` + `title` off the definition | `questionnaire-lifecycle.ts:337-340` — the self-contained-copy pattern |
| **The only production INSERT into `questionnaire_activations`** | `questionnaire-lifecycle.ts:336`, inside `sendActivation`, which hard-requires a `questionnaire_definitions` row with `status='published'` (`:312-324`). The other INSERT is the test factory (`_factories.ts:51`). |
| **Code questionnaires can never have an activation** | `RESERVED_DEFINITION_KEYS` (`questionnaire-definitions.ts:11-16` — four entries, three questionnaires) blocks a definitions row for `burner_profile` / `dietary_requirements` / `driver_profile`, and `sendActivation` refuses without one. |
| **`dietary_requirements` and `driver_profile` have no bespoke page** | `ACTION_ROUTES` (`apps/web/lib/required-actions.ts:9-13`) maps only `burner_profile`; `find apps/web/app -type d` shows no `/dietary` or `/driver` route. Their gates would be pending-but-unroutable, and `nextGate` skips them (`:35-38`). |
| `classifyChange` sees only fields + `visibleIf` | `packages/types/src/questionnaire-builder.ts:461-486` — a new top-level key on `BuilderQuestionnaire` classifies as `cosmetic` |
| A cosmetic publish **overwrites the snapshot in place** | `questionnaire-lifecycle.ts:114-116` + `:137-143` |
| `BuilderQuestionnaire` is a bare `z.object` | `questionnaire-builder.ts:123-127` — unknown keys are stripped on parse, and `publishDefinition` writes `parsed.data` as the snapshot (`:123`, `:133`) |
| The runner's access predicate | `apps/web/app/questionnaires/[activationId]/page.tsx:42-48` — `getRequiredAction(user, key)` must return a **pending** row whose `activationId` is **this** activation |
| The runner's prefill | same file, `:67-70` — `loadQuestionnaireResponse(user, key)`, the single latest row |
| **Four unfiltered `(user, actionKey)` single-row reads** | `activations.ts:179-192` (`satisfyRequiredAction`), `:280-293` (`getRequiredAction`), `:338-351` (inside `completeBuilderResponse`), `apps/web/lib/mcp/tools/identity.ts:92-96`. All `.limit(1)` with **no `ORDER BY`**. **See §4 — this is why `required_actions` must stay one-row-per-key.** |
| The home gate still has a `completedAt` belt-and-braces fallback | `apps/web/app/page.tsx:60-64` — sub-project E's one-release fallback is still in the tree |
| `team_memberships` has **no production writer** | The only `insert(schema.teamMemberships)` in the repo is `_factories.ts:39`. Corroborated at `docs/harvest/00-harvest-and-roadmap.md:30`. |
| `users.dues_paid` / `dues_paid_at` are **written by nothing** | Read at `roster.ts:61,105` and `apps/web/lib/mcp/tools/people.ts:120-121`; never written outside test fixtures |
| `audit_log` has **no writer anywhere** | `rg 'auditLog'` matches only `schema.ts`. Writing to it lights a cold path. |
| The new-joiner reconciler is promised and absent | `schema.ts:534-535` ("new joiners / team changes / opt-ins are reconciled against still-open activations"); `ensureRequiredAction` has exactly one caller, `apps/web/lib/users.ts:198`, hardcoded to `burner_profile` |
| Account erasure keeps `duesPaid` / `approvalStatus` / `rank`, clears terms | `account.ts:21-43` (`sanitisedUserPatch`) |
| Account erasure does **not** delete `questionnaire_responses` | `account.ts:74-116` — twelve explicit deletes, that table is not among them |
| Migrations are at 0018; drift test pins the config seed in three places | `packages/db/migrations/0018_workable_praxagora.sql`; `apps/web/lib/__tests__/camp-config.test.ts:79-107` |
| The PGlite harness truncates every public table between files | `packages/db/src/__tests__/_harness.ts`, `reset()` |

### 2.1 Table-by-table (all 38)

Only three tables change. The point of the table is the fourth column being `no` 35 times.

**Year-scoped.** `questionnaire_activations` (`:537`) — **stamped**, a send belongs to a year.
`questionnaire_responses` (`:1508`) — **stamped**, the only table that physically cannot hold
two years of the data the owner asked to keep. `required_actions` (`:643`) — **not stamped**,
see §4. `questionnaire_activation_targets` (`:578`) inherits via FK. `questionnaire_edits`
(`:603`), `reimbursements` (`:749`), `tasks` (`:966`), `adoptees` (`:993`), `workshops` /
`workshop_rsvps` (`:1015`, `:1026`), `broadcasts` / `broadcast_targets` /
`notification_deliveries` (`:836`, `:883`, `:903`), `car_members` (`:455`),
`telegram_invites` (`:1229`) — all append-only with a real `created_at`/`starts_at`, so a
date bracket against the cycle's `startedAt`/`endedAt` is exact and a column would restate
it. `team_budgets` (`:796`) is genuinely year-scoped and genuinely unfixable without a PK
change; §9.3 records the rule and leaves it.

**Camp-lifetime.** `users` (`:248`), `burner_profiles` (`:380`, documented lifetime at
`:374-377`), `dietary_requirements` (`:400`), `driver_profiles` (`:421`), `team_memberships`
(`:474`), `invite_codes` (`:340`), `captain_promotion_requests` (`:501`), `documents`
(`:719`), `inventory_items` / `inventory_updates` (`:1049`, `:1122`), `recipes` (`:686`),
`questionnaire_definitions` (`:1457` — **gains `carry_over`**), `questionnaire_versions`
(`:1481`), `camp_settings` (`:1421` — **holds the cycle list**), `audit_log` (`:1180`),
`telegram_chats` (`:1210`).

**Infrastructure, no product year meaning.** `push_tokens` (`:807`),
`telegram_announcements` (`:1258`), `mcp_oauth_clients` (`:1315`), `mcp_auth_codes`
(`:1333`), `mcp_access_tokens` (`:1362`), `mcp_audit_log` (`:1389`).

---

## 3. Decision, and the alternatives

**Chosen: a cycle integer on two tables plus a cycle list in `camp_settings.config`.**

Two alternatives were designed in full and rejected.

**(a) A first-class `camp_cycles` entity with a `cycle_id` FK on fourteen tables, plus a
`cycle_memberships` archive.** Rejected on three grounds. First, the FK **cannot** be
`NOT NULL` in one generated append-only migration — `drizzle-kit` emits DDL only, a column
`DEFAULT` cannot contain a subquery, and an FK validates against an empty parent table — so
it ships nullable with a lazy adopt step and a real post-deploy window where a cycle-filtered
read returns nothing. Second, it needs a surrogate PK on `team_memberships` (`schema.ts:487`)
and `team_budgets` (`:797`) — non-additive DDL, on two tables **nothing in the repo writes**.
Third, it costs ~45-55 query sites across ~15 files and about two weeks, to make explicit
what a `created_at` bracket already encodes for seventeen tables. For one camp of 30-80
people that is the expensive version of the right idea.

**(b) A `camp_cycles` ledger plus a `cycle_ordinal` on `required_actions` and
`questionnaire_responses`, with every other year scope derived from timestamps.** The
derivation argument is right and §2.1 above adopts it wholesale. It was rejected for exactly
one thing: putting `cycle_ordinal` on `required_actions`. See §4.

Both alternatives contributed materially; §11 lists what was taken.

### 3.0 Prerequisite — the config transforms drop unknown keys (P0)

`renameTeam` (`camp-config.ts:108-118`), `setTeamArchived` (`:121-131`) and `moveTeam`
(`:138-151`) each return a fresh `{ teams: … }` object literal. Every other top-level key in
`camp_settings.config` is silently discarded. Since the year namespace and the code-key
carry-over map both live in that column, **a captain renaming a team would reset the camp to
cycle 1 and wipe the carry-over policy.**

None of the three designs caught this. It is a three-line fix and it ships first:

```ts
// camp-config.ts — renameTeam / setTeamArchived / moveTeam
return { ...config, teams: /* … as before … */ };
```

plus one regression test asserting an unknown key survives all three transforms. Independent
of this feature, this is a latent data-loss bug in the configurable-teams work already
shipped.

---

## 4. Why `required_actions` is NOT cycle-keyed

This is the design's load-bearing decision and the one place it diverges from both
alternatives.

`required_actions` is unique on `(user_id, action_key)` (`schema.ts:673-676`). That index
already makes the table **current-cycle-only by construction**: a member has at most one live
obligation per key, ever. Its history lives in `questionnaire_responses` (now cycle-stamped)
and `questionnaire_edits`.

Widening it to include a cycle breaks four production queries that read `(user, actionKey)`
with `.limit(1)` and **no `ORDER BY`**:

| Site | What breaks after the first rollover |
|---|---|
| `activations.ts:179-192` — `satisfyRequiredAction` | May pick last year's `completed` row, see `status !== "pending"`, return `false`. **The burner-profile gate then never satisfies** and the member is stuck in a permanent `/` → `/onboarding/questionnaire` redirect loop. |
| `activations.ts:280-293` — `getRequiredAction` (the runner's access predicate) | May return last year's `expired` row, so `page.tsx:46-48` renders `<RunnerEdgeCard kind="closed" />` — "This form is closed" — to a member who has a live pending gate. |
| `activations.ts:338-351` — inside `completeBuilderResponse` | Same as `satisfyRequiredAction`, inside the atomic submit. A completed response coexisting with a pending gate is the exact invariant that function exists to prevent. |
| `apps/web/lib/mcp/tools/identity.ts:92-96` | Same class; the MCP acknowledgement tool updates by the id it just read. |

Each is individually a two-line fix. Collectively they are a class of silent,
non-deterministic, hard-to-reproduce breakage introduced by a schema change whose benefit is
a historical record we already have elsewhere. Keeping the narrow index means:

- `getPendingRequiredActions` (`activations.ts:209-233`) — the query on **every authenticated
  page load** — is unchanged, unjoined, and unslowed.
- `nextGate` (`apps/web/lib/required-actions.ts:30-40`) and `apps/web/app/page.tsx:55-56` are
  untouched.
- `roster.ts:76-80`'s `pendingRequiredActions` subquery is untouched.
- A member can never be gated by two cycles of the same questionnaire at once, without
  needing a second partial unique index to restore that invariant.

The rollover therefore does not insert new `required_actions` rows; it **re-arms the existing
ones**, which is what `openActivation`'s `onConflictDoUpdate` already does (`:116-130`).

---

## 5. The exact schema diff (pasteable Drizzle)

Four edits to `packages/db/src/schema.ts`. No new tables. No new enum. No `ALTER TYPE`.

### 5.1 `questionnaire_activations` (`schema.ts:537`)

```ts
export const questionnaireActivations = pgTable(
  "questionnaire_activations",
  {
    // … unchanged through updatedAt …

    // The camp cycle current at Send time. Immutable afterwards, so a response
    // inherits the cycle its form was OPENED in rather than the config's cycle
    // at submit time (kills the mid-submit rollover race). Default 1 stamps
    // every existing row into the founding cycle — no backfill script.
    cycle: integer("cycle").notNull().default(1),

    // The carry-over policy, COPIED off the definition at Send time exactly as
    // `version` and `title` already are (questionnaire-lifecycle.ts:337-340),
    // and exactly as notification_deliveries.presentation is copied off
    // broadcasts (schema.ts:917-922). Flipping the definition toggle affects
    // the NEXT send, never the one in flight.
    carryOver: boolean("carry_over").notNull().default(true),
  },
  (a) => ({
    keyIdx: index("questionnaire_activations_key_idx").on(a.questionnaireKey),
    statusIdx: index("questionnaire_activations_status_idx").on(a.status),
    oneOpenPerKey: uniqueIndex("questionnaire_activations_one_open_per_key_idx")
      .on(a.questionnaireKey)
      .where(sql`${a.status} = 'open'`),
  }),
);
```

No index on `cycle` — this table is double-digit rows for the camp's life.

### 5.2 `questionnaire_definitions` (`schema.ts:1457`)

```ts
export const questionnaireDefinitions = pgTable("questionnaire_definitions", {
  // … unchanged through updatedAt …

  // Per-questionnaire rollover policy. TRUE (the default) = answers carry over;
  // the rollover leaves this questionnaire alone. FALSE = the rollover closes
  // the open send and opens a fresh one, so members answer again on a blank
  // form. A COLUMN, not a field inside `definition`: classifyChange
  // (questionnaire-builder.ts:461-486) reads only the field map and the
  // visibleIf map, so a toggle would classify as `cosmetic` — and a cosmetic
  // re-publish overwrites the immutable version snapshot in place
  // (questionnaire-lifecycle.ts:114-116, 137-143), letting a policy switch
  // retroactively rewrite what a past collection ran under. As a column it is
  // also togglable with no re-publish and readable in one SELECT by the planner.
  carryOver: boolean("carry_over").notNull().default(true),
});
```

### 5.3 `questionnaire_responses` (`schema.ts:1508`) — the one index change

```ts
export const questionnaireResponses = pgTable(
  "questionnaire_responses",
  {
    // … unchanged through updatedAt …

    // Copied from questionnaire_activations.cycle at write time. Carry-over
    // keeps ONE row a member amends forever; `fresh` grows a NEW row each cycle.
    // "Fresh" means the member must answer again — never that the old answer is
    // destroyed.
    cycle: integer("cycle").notNull().default(1),
  },
  (r) => ({
    // WAS: uniqueIndex("questionnaire_responses_user_def_idx").on(userId, definitionKey)
    userDefCycleIdx: uniqueIndex(
      "questionnaire_responses_user_def_cycle_idx",
    ).on(r.userId, r.definitionKey, r.cycle),
    defIdx: index("questionnaire_responses_def_idx").on(r.definitionKey),
  }),
);
```

Renaming rather than redefining makes `drizzle-kit` emit a clean `DROP INDEX` +
`CREATE UNIQUE INDEX`.

### 5.4 `camp_settings.config` — type widening only, **zero DDL**

```ts
    config: jsonb("config")
      .$type<CampConfig>()          // was TeamsConfig
      .notNull()
      .default(sql`'{"teams":[…]}'::jsonb`),   // BYTE-IDENTICAL — do not touch
```

The inline SQL literal is unchanged, so the three-way seed-drift test
(`apps/web/lib/__tests__/camp-config.test.ts:79-107`) keeps passing untouched and no data
migration runs. New keys are absent on every existing row and resolve to defaults.

### 5.5 The generated migration — `0019_*.sql`, six statements

```sql
ALTER TABLE "questionnaire_activations"  ADD COLUMN "cycle"      integer NOT NULL DEFAULT 1;
ALTER TABLE "questionnaire_activations"  ADD COLUMN "carry_over" boolean NOT NULL DEFAULT true;
ALTER TABLE "questionnaire_definitions"  ADD COLUMN "carry_over" boolean NOT NULL DEFAULT true;
ALTER TABLE "questionnaire_responses"    ADD COLUMN "cycle"      integer NOT NULL DEFAULT 1;
DROP INDEX  "questionnaire_responses_user_def_idx";
CREATE UNIQUE INDEX "questionnaire_responses_user_def_cycle_idx"
  ON "questionnaire_responses" ("user_id","definition_key","cycle");
```

Four `ADD COLUMN NOT NULL`, each with an explicit `DEFAULT` — the AGENTS.md rule. One index
swap, safe by construction: the new three-column unique index is **strictly weaker** than the
two-column one it replaces (any row set satisfying the new constraint satisfied the old), and
the `ADD COLUMN` immediately before stamps every existing row `cycle = 1` so no duplicate can
appear mid-swap. The table holds one row per member per builder questionnaire — double digits
for this camp — so the rewrite is instantaneous. `0000_initial.sql` untouched, nothing
hand-written, no backfill, no downtime.

---

## 6. Type changes

### 6.1 `packages/db/src/camp-config.ts` — extended, not replaced

`@camp404/db` deliberately has no zod dependency; these mirror `isTeamConfigEntry` /
`renameTeam` / `moveTeam` in style and are pure, so they unit-test with no database.

```ts
/** One camp cycle — a burn year. `number` is monotonic; 1 is the founding cycle. */
export interface CycleEntry {
  number: number;
  /** Captain-authored, e.g. "AfrikaBurn 2027". Purely display; never parsed. */
  label: string;
  startedAt: string;            // ISO
  /** null on exactly ONE entry: the current cycle. */
  endedAt: string | null;
}

export type CarryOverPolicy = "carry" | "fresh";

export interface CampConfig extends TeamsConfig {
  /** Absent on a camp that has never advanced — resolves to [CYCLE_ONE]. */
  cycles?: CycleEntry[];
  /** Policy for the RESERVED code keys, which can never have a definitions row. */
  questionnaireCarryOver?: Record<string, CarryOverPolicy>;
}

export const CYCLE_ONE: CycleEntry = {
  number: 1,
  label: "Cycle 1",
  startedAt: "1970-01-01T00:00:00.000Z",
  endedAt: null,
};

/** Coerce stored JSONB to a cycle list; any malformation → [CYCLE_ONE]. */
export function resolveCycles(raw: unknown): CycleEntry[];

/** The open cycle; falls back to the highest-numbered entry if none is open. */
export function currentCycle(cycles: CycleEntry[]): CycleEntry;

/** PURE: stamp endedAt on the open entry, append the next. Throws on a duplicate. */
export function advanceCycles(cycles: CycleEntry[], label: string, now: Date): CycleEntry[];

/**
 * PER-KEY fallback, deliberately NOT the wholesale fallback resolveTeamsConfig
 * uses at :76-87 — one bad entry must not discard the captain's other choices.
 */
export function resolveCodeCarryOver(raw: unknown, key: string): CarryOverPolicy;

/** PURE toggle for the captain control, in the setTeamArchived (:121-131) shape. */
export function setCodeCarryOver(
  config: CampConfig, key: string, policy: CarryOverPolicy,
): CampConfig;

/** One SELECT against the singleton. */
export async function getCurrentCycle(): Promise<CycleEntry>;
```

`apps/web/lib/camp-config.ts` (the E2E-aware facade, `:27-31`) gains a matching
`getCurrentCycle()`. Under `E2E_TEST_MODE` the test store seeds `DEFAULT_CAMP_CONFIG`, which
has no `cycles` key, so `resolveCycles` returns `[CYCLE_ONE]` **for free** — Playwright keeps
running with no database and no test-store change.

### 6.2 `@camp404/types` — nothing changes

**There is no `carryOver` field on `BuilderQuestionnaire`.** Two independent reasons:

1. `classifyChange` (`questionnaire-builder.ts:461-486`) walks only the field map and the
   `visibleIf` map, so toggling the flag would classify as `cosmetic` — and `publishDefinition`
   treats cosmetic as "overwrite the current version's snapshot in place"
   (`questionnaire-lifecycle.ts:114-116`, `:137-143`). A policy switch would silently rewrite
   a published immutable snapshot, retroactively changing what a past collection ran under.
2. `BuilderQuestionnaire` is a bare `z.object` (`:123-127`), so an unknown key is stripped on
   parse and `publishDefinition` writes `parsed.data` as the snapshot. Adding the field to the
   zod schema fixes the stripping but not (1).

The only `@camp404/types` change is optional and cosmetic: export the `CarryOverPolicy` union
if the web app wants it for form typing. It is not required.

Add a **regression test** in `packages/types` asserting `classifyChange` ignores unknown
top-level keys, so a future contributor "fixing" it into a deep comparison trips a test rather
than a production version bump.

---

## 7. The carry-over model, end to end

### 7.1 Declared

| Questionnaire class | Where the policy lives | Default |
|---|---|---|
| Builder questionnaires | `questionnaire_definitions.carry_over` (boolean column) | `true` — carry |
| The three RESERVED code keys | `camp_settings.config.questionnaireCarryOver[key]` | `burner_profile: carry`; the other two see §12 OD3 |
| Anything unknown | — | `carry` |

One resolver, `carryOverFor(key)`, in a new `packages/db/src/cycles.ts`. Precedence is
definition column → config map → `carry`. The two sources are disjoint in practice:
`RESERVED_DEFINITION_KEYS` (`questionnaire-definitions.ts:11-16`) means a code key can never
have a definitions row, and a builder key is never in the map. The layering mirrors how a
stored definition already resolves team bindings against live camp config at read time
(`schema.ts:1452-1455`).

**Default `carry` is the safe default here**, and this is a deliberate reversal of two of the
three source designs. Their argument for defaulting to `fresh` — "a needless re-ask costs two
minutes, a wrongly-carried answer is silent" — is right about a *single answer* and wrong
about a *button*. The rollover fans a default out across every questionnaire at once; a
`fresh` default means a captain who presses the button without reading carefully re-gates
the entire camp on everything, which is the failure mode most likely to make this the most
feared button in the app. With `carry` as the default the button does nothing until a captain
opts a specific questionnaire in — and the confirm screen (§8.2) names every questionnaire
that will re-ask, so the loud-failure argument is satisfied by the preview rather than by the
default. **This is OD1 in §12; the owner can flip it with a one-word change.**

### 7.2 Frozen at Send

`sendActivation` copies `carry_over` off the definition (or the config map) into
`questionnaire_activations.carry_over`, alongside `version` and `title`
(`questionnaire-lifecycle.ts:337-340`), and stamps `cycle` from `getCurrentCycle()`. Every
downstream read uses the **activation's** frozen copy, never the definition's live one. A
captain flipping the toggle mid-collection affects the next send, never the one in flight —
and a member mid-form is never kicked out.

### 7.3 Enforced in exactly three places

**(a) Fan-out — `openActivation` (`activations.ts:81-100`), between `computeAudience` and the
insert.** When `act.carryOver` is true, subtract every member who already holds a `completed`
`required_actions` row for this key whose version satisfies `meetsRequiredVersion` (already
imported at `activations.ts:5`). `required_actions` is the satisfaction oracle for **both**
questionnaire classes — builder questionnaires write `questionnaire_responses`, code
questionnaires write bespoke domain tables, but every one of them flips a `required_actions`
row to `completed` — so the filter is storage-agnostic. ~20 lines, one extra ≤80-row query
per send.

This is what makes carry-over answer the owner's actual sentence — *"if I replay that
questionnaire, it must do so fresh"* — **year-round, on any send**, not only at a rollover.
The version rule keeps it honest: a BREAKING edit mints a new version, so last year's
completion fails `meetsRequiredVersion` and a carry key re-gates everyone anyway; a COSMETIC
re-send does not.

**The rule that closes the silent hole:** a member with **no** completed prior response is
gated even under `carry`. Carry-over means "don't re-ask someone who already answered", never
"let everyone through".

**(b) Prefill — `loadQuestionnaireResponse` (`questionnaire-responses.ts:59-80`)**, which
gains `opts: { cycle: number; carryOver: boolean }`:

```ts
    .where(and(
      eq(questionnaireResponses.userId, userId),
      eq(questionnaireResponses.definitionKey, definitionKey),
      // carry: the newest answer AT OR BELOW this cycle, so a member amends
      //        last year's answers rather than retyping them.
      // fresh: strictly THIS cycle — no row means a genuinely blank form,
      //        which is what "it must do so fresh" means.
      opts.carryOver
        ? lte(questionnaireResponses.cycle, opts.cycle)
        : eq(questionnaireResponses.cycle, opts.cycle),
    ))
    .orderBy(desc(questionnaireResponses.cycle))
    .limit(1);
```

The caller passes `activation.cycle` and `activation.carryOver` — never the config's current
cycle — so an in-flight form stays consistent with the row it will write.

**The seed trap, called out explicitly:** the runner's prefill read must report
`completedAt: null` for a row carried in from an earlier cycle, or a prefilled form satisfies
its own gate and `carry` and `fresh` collapse into the same thing. The returned row gains
`seededFromCycle: number | null`; when it is non-null the caller forces `completedAt` to
null and the runner shows one line of copy (§9).

**(c) Write — always the current activation's cycle.** `upsertQuestionnaireResponse`
(`:22-55`) and `completeBuilderResponse` (`activations.ts:304-367`) each take `cycle` and
change their `ON CONFLICT` target from `[userId, definitionKey]` to
`[userId, definitionKey, cycle]`. Both are only ever called from the runner
(`apps/web/app/questionnaires/[activationId]/actions.ts:94`, `:102`), which already holds the
activation, so the caller change is `cycle: activation.cycle`. Reads may fall back to an
earlier cycle; **writes never do** — a carry member who reaffirms an answer in year N gets a
year-N row, correctly recording that they reaffirmed it.

`getActivationById` and `getOpenActivationForKey` add `cycle` and `carryOver` to their select
lists and to `ActivationRow`.

### 7.4 The gating query does not change

`getPendingRequiredActions` (`activations.ts:209-233`) stays `status='pending' AND
blocking=true`. `nextGate` and `apps/web/app/page.tsx:55-56` are untouched. The query that
runs on every authenticated page load is not modified, not joined, and not slowed. That is
§4's dividend.

### 7.5 The metrics consequence, stated

`docs/questionnaire-builder.md:386-390` derives completion from
`required_actions.status='completed'`. A re-gate flips those rows back to `pending`
(`activations.ts:121-129`), so cycle 1's completion rate would be destroyed. It is not — it
lives permanently and exactly in `questionnaire_responses.(cycle, completedAt)` — but **the
builder spec's §7.1 derivation must move to reading from there, scoped by cycle.** One-line
spec change; no code is needed to preserve the data, because the column preserves it.

---

## 8. The rollover action

**Route:** `apps/web/app/captains/camp-settings/cycle/`, beside the existing team editor,
reusing `requireCaptain()` from `apps/web/app/captains/camp-settings/actions.ts:44-63`
verbatim (signed-in → camp-active → **approved** → captain clearance — note the twin in
`camp-management/actions.ts` omits the approval check; use the camp-settings one).

### 8.1 Step 1 — `planRollover()`, a pure read, zero writes

Safe to call on every page load. One LEFT JOIN of `questionnaire_definitions` to its open
activation (the one-open index, `schema.ts:571-573`, guarantees at most one), filtered to
`status='published'`, plus recipient counts from `computeAudience` (`audience.ts`) — the same
function `openActivation` uses, so the preview number **is** the number that will be gated.

Four buckets:

| policy | open activation? | bucket | what the rollover does |
|---|---|---|---|
| `carry` | yes | carries over | Nothing. Completed members stay done; still-pending members stay gated, because their obligation never expired. |
| `carry` | no | carries over | Nothing. |
| `fresh` | yes | **re-gate** | Close it; open a fresh one with identical scope / team / blocking, `cycle = next`, `dueAt = NULL`; re-arm the gates. |
| `fresh` | no | **not sent** | Nothing — and it is listed in the plan as *"not currently sent; send it yourself if you want it this year."* |

That last row is a deliberate refusal: **the rollover must never widen what blocks a member
beyond what blocked them yesterday.** A gate the captain deliberately closed stays closed.

`dueAt` is deliberately not carried — last year's deadline would flag every re-gated
questionnaire as overdue the moment it opens.

Returns `{ from, toNumber, reGate[], carriesOver[], notSent[], duesPaidCount, untouched[] }`.

### 8.2 Step 2 — the confirm screen

Plain sentences, no jargon, and **the `untouched` list is as prominent as the change list**,
because that is where a captain's fear lives:

> **You are in Cycle 1 ("2026"). Advancing starts Cycle 2.**
>
> **Will re-ask (3 questionnaires, 47 members each):** Dietary requirements · Arrival and
> departure · Team preferences. Each starts on a **blank form**. Their 2026 answers stay
> readable.
>
> **Will carry over (5 questionnaires):** Burner profile · Skills · … Members who already
> answered stay done. Members who never answered stay gated.
>
> **Not currently sent (2):** Workshop pitch · Kitchen shifts. Send these yourself if you
> want them this year.
>
> **Nothing else changes.** Nobody's approval, rank, team, invite, terms consent, or answers
> are reset or deleted. No account is touched. Closed sends stay closed.
>
> ☐ Also post an announcement to everyone (editable text)
>
> **Type `2027` to confirm.**

Confirmation requires typing **the new cycle's label** — the GitHub type-the-repo-name
pattern. It is hard to do by accident and it doubles as the label input, so it is not
ceremony for its own sake.

If `duesPaidCount > 0` a fourth checkbox appears — *"Clear the dues tick for N members"*,
default on. Today that count is zero for every camp (§2: `dues_paid` is written by nothing),
so the checkbox is simply absent, and the day a dues writer lands the lever already exists.

### 8.3 Step 3 — `advanceCycle({ label, actorUserId, resetDues, announcement })`

One pooled transaction (`createPooledDb` — the HTTP driver has no transactions):

1. `INSERT … ON CONFLICT DO NOTHING` the singleton, then `SELECT … FOR UPDATE` it — the
   identical serialisation `mutateTeamsConfig` (`camp-config.ts:190-200`) and
   `bootstrapFirstCaptain` (`bootstrap.ts:63-72`) use. A second concurrent captain gets
   `{ ok: false, reason: "already-advanced" }`.
2. **Re-read the plan inside the lock**, so a send racing in just before the commit is caught
   — the pattern `unpublishDefinition` already uses at `questionnaire-lifecycle.ts:185-197`.
3. `config.cycles = advanceCycles(...)`: stamp `endedAt` on the current entry, append
   `{ number: next, label, startedAt: now, endedAt: null }`. Write back with the spread from
   §3.0 so nothing else in `config` is lost.
4. For each `reGate` entry, in the same transaction: `closeActivationTx` (status `closed`,
   `closedAt`, still-pending `required_actions` → `expired`), then insert a new activation
   (same `questionnaire_key` / `version` / `title` / `scope` / `team` / `blocking`,
   `cycle = next`, `carry_over = false`, `due_at = NULL`, `status = 'open'`), copy
   `activation_targets` when `scope='individual'`, and run `openActivationTx`'s
   `required_actions` upsert over `computeAudience`.
5. If `resetDues`: capture the ids, then `UPDATE users SET dues_paid=false, dues_paid_at=NULL
   WHERE is_system=false AND dues_paid=true`.
6. `INSERT audit_log (action='camp.cycle.advanced', actorUserId, metadata={plan, duesCleared:[ids],
   announcementBroadcastId})`. **Note: `audit_log` has no writer anywhere in the repo today**
   — this lights a cold path, and the `metadata` column's `$type<>()` fix flagged in the
   harvest belongs in the same commit.
7. If `announcement`: `INSERT broadcasts (kind='announcement', scope='everyone',
   presentation='acknowledge')` plus the `notification_deliveries` fan-out from
   `publishAnnouncement` (`broadcasts.ts`).

**The `…Tx` extraction.** Step 4 is the body of `closeActivation`
(`questionnaire-lifecycle.ts:234-255`) plus `sendActivation` / `openActivation`
(`:334-364`, `activations.ts:94-133`). All three open their own `createPooledDb()`, so a loop
over the exported functions would be 2N connections and no atomicity. Extract
`closeActivationTx(tx, id)` and `openActivationTx(tx, act, recipientIds)`; make the exported
functions thin pool-opening wrappers. ~40 lines moved, no behaviour change, existing tests
untouched.

### 8.4 Step 4 — the report

The action returns the executed plan; the page renders it as a receipt carrying the
`audit_log` id. Re-running `planRollover()` shows the new state, so the report is
re-derivable rather than stored.

### 8.5 Reversibility

Nothing is deleted. Old activations → `closed` with rows intact. Old pending gates →
`expired`, a terminal non-gating state `getPendingRequiredActions` already filters out
(`activations.ts:226-231`). Every prior cycle's answers stay in `questionnaire_responses`
under their own `cycle`. Cleared dues ticks are enumerated by user id in the audit metadata.

`revertCycle()` (~30 lines, Phase 5): pop the last `cycles` entry, restore `endedAt = null`
on the previous, close every activation stamped with the abandoned number, re-open the ones
this rollover closed and un-expire their gates — guarded on
`SELECT count(*) FROM questionnaire_responses WHERE cycle = <abandoned>` being **0** and the
abandoned cycle being the **maximum**. That guard is what makes it cheap: no member work can
be lost. Once anyone has answered, the exit is forward, and the honest guarantee is not
reversibility but that **nothing was ever destroyed**.

---

## 9. What the member sees on first login after a rollover

**Most members, most rollovers: nothing.** No pending gates, `nextGate` returns null,
`page.tsx` falls straight through to home — except the optional announcement, which arrives
as the existing full-screen `presentation='acknowledge'` takeover (`schema.ts:185-198`), the
same one the camp already uses.

**A member with a re-gated questionnaire** is redirected into it exactly as for any send
(`page.tsx:55-56` → `nextGate` → `/questionnaires/<newActivationId>`). The form is **blank**.
One line of copy above it, sourced from `activation.carryOver`:

> *This starts fresh for 2027 — your 2026 answers are still on file.*

**A member whose carry-over questionnaire was re-sent in the new cycle** (a captain's own
send, not the rollover) sees their previous answers prefilled, with:

> *Prefilled from your 2026 answer. Check it's still right.*

— and `completedAt` reported as null, so they must actually press submit.

---

## 10. Edge cases

**A member who joined mid-cycle.** Nothing special. They hold whatever `required_actions`
rows they were given; a `fresh` re-gate re-arms them like everyone else, and their prefill is
blank because they have no prior-cycle row. `carry` leaves them alone if they completed,
gates them if they did not (§7.3's rule).

**A member who joins *after* a rollover — a pre-existing hole this feature makes routine.**
`openActivation` only fans out at open time. A member created afterwards gets **no**
`required_actions` row for any open activation, so `getRequiredAction` returns null and the
runner shows `<RunnerEdgeCard kind="not-invited" />`. This is broken today
(`schema.ts:534-535` promises a reconciler; `ensureRequiredAction` has one caller,
`apps/web/lib/users.ts:198`, hardcoded to `burner_profile`), but a rollover makes new opens
routine. **`reconcileOpenActivations(userId)`, called from `ensureCampUser`, ships in Phase 1
or the feature ships a hole.** It is a `SELECT` of open activations, `computeAudience` per
activation, and the same `ensureRequiredAction` upsert.

**A member who never answered last year's questionnaire.** Gated under **both** policies.
`fresh` re-gates everyone in scope. `carry` does not skip them, because they hold no
`completed` row. This is the case a naive design gets wrong by only re-gating on `fresh`.

**An accidental rollover.** Plan → type-the-new-label → receipt, and nothing is destroyed
(§8.5). `revertCycle()` is available while no member has answered in the new cycle.

**Two captains pressing at once.** The `SELECT … FOR UPDATE` on the singleton serialises
them; the loser gets `already-advanced`.

**A rollover mid-submit.** The member's in-flight form carries `activation.cycle`, frozen at
Send. Their save lands in the old cycle's row, which is correct — they were answering last
year's form. If that activation was closed by the rollover, the runner's
`activation.status !== "open"` check (`page.tsx:54`) shows the closed card on their next
request, exactly as a manual close does today.

**Historical readability.** Every prior cycle's answers stay in `questionnaire_responses`
under their own `cycle`, renderable against `questionnaire_versions`' immutable snapshot for
the version they were answered under. "Show me the 2026 roster" is one `WHERE cycle = 1`.

**`users.dues_paid` / `dues_paid_at`.** Written by nothing today. The checkbox exists but is
hidden while the count is zero (§8.2). **The rule the harvest actually cares about: the dues
ledger, when it is built, must be cycle-keyed from day one** (`docs/harvest/00-harvest-and-roadmap.md:54`
— "a dues ledger with no cycle key is the expensive version of this mistake"). This spec
records that rule; it does not pre-build the ledger.

**`users.approval_status`.** **Never reset. Say it loudly on the confirm screen.** It has a
terminal `rejected` state (`schema.ts:283-289`), and resetting everyone to `pending` would
lock all 80 people behind `/pending-approval` (`page.tsx:69-71`) and dump 80 rows into a
captain's approval queue on day one of the new year. A camp that genuinely wants annual
re-vetting does it per person on the camp-management surface. "Are you coming this year?" is
a `fresh` questionnaire, not a vetting reset.

**`users.terms_consented_at` / `terms_version`.** Version-scoped, not year-scoped. Consent is
to a *document*, not to a year. The re-consent lever is bumping `terms_version`, which already
works and needs no rollover code. Clearing `terms_consented_at` would destroy the POPIA
evidence that consent was ever given. `sanitisedUserPatch` (`account.ts:21-43`) clears it for
erasure, which is a different thing.

**Open `required_actions`.** Handled entirely by §4: they are re-armed in place, never
duplicated. A `carry` questionnaire's still-pending rows are left pending — the member still
owes the answer, and the year changing does not forgive it.

**`team_memberships`.** Carried. Emptying them would destroy every `is_lead` that
`deriveViewerRank` and `computeAudience` depend on — and there is nothing to reset anyway,
because the table has no production writer (`_factories.ts:39` is the only INSERT). "Which
team are you on this year" is a `fresh` questionnaire; "who joined this year" derives free
from `created_at`. **Rule recorded, no reset code shipped.**

**`car_members` and `driver_profiles`.** `driver_profiles.intends_to_drive` is the stale-fact
hazard: `broadcasts.ts:72-75` computes the drivers audience as `intends_to_drive = true` with
**no time bound**, so after a rollover a captain broadcasting "drivers, convoy leaves at
06:00" reaches people who are not coming, and `roster.ts:67`, `camp-roster.ts:109` and
`mcp.ts:56-64` still show them as drivers. Making `driver_profile` a `fresh` questionnaire
re-opens their gate but does **not** clear the boolean. **Not fixed in this spec** — see
§12 OD3 and §13 — but named so it is a known gap rather than a surprise.

**`team_budgets`.** Genuinely year-scoped and genuinely unfixable here: its PK is bare `team`
(`schema.ts:796-797`) with no timestamp, so it physically cannot hold two years, and last
year's budget is unrecoverable the moment someone edits it. Written by nothing today.
**Rule recorded** — when a finance writer lands, the PK becomes
`primaryKey({ columns: [team, cycle] })` — and deliberately not pre-built, because repointing
a PK is real migration risk on a table with no write path.

**`adoptees.slot_number`.** Collides across cycles. Nothing breaks at the DB level (no unique
index), but the adoption page would list 2026's slots 1-8 next to 2027's unless it brackets
by `created_at`. Known gap, listed in §13.

**Account erasure.** `sanitiseAccount` (`account.ts:74-116`) deletes twelve owned tables but
**not** `questionnaire_responses`. Cycle-scoping widens that hole, because an erased member's
answers now accumulate across cycles. Pre-existing, out of scope, and it should be fixed in
the same release — one `tx.delete(schema.questionnaireResponses)`.

---

## 11. What was taken from the two rejected designs

From **"rollover as an event"**: the whole derivation argument for the seventeen append-only
tables (§2.1) — a `created_at` bracket is exact and a column would restate it; the per-key
config map for the RESERVED code keys with a **per-key** fallback (§6.1, §7.1), which closes
the one real gap in the winning design, since a `carry_over` column cannot express a policy
for a questionnaire that has no definitions row; **freezing the policy onto the activation at
Send** (§7.2), a cleaner answer to the mid-submit race than the winner's own; the
**carry-over fan-out filter** in `openActivation` guarded by `meetsRequiredVersion` (§7.3a),
which is what makes carry-over answer the owner's sentence year-round rather than only at a
rollover; the "max cycle AND untouched" undo guard (§8.5); and the stale-driver and
finance-bracket hazards (§10, §13).

From **"first-class cycles"**: the preview's **`untouched` list**, stated as prominently as
the change list (§8.2); the **runner seed trap** — a prefilled fresh form must report
`completedAt: null` or it satisfies its own gate (§7.3b) — which only that design named; the
rule that a `carry` key still gates a member with no completed prior response (§7.3); and the
`questionnaire_responses` hole in `sanitiseAccount` (§10).

Rejected: the fourteen-table `cycle_id` fan-out and `cycle_memberships` (two weeks, a
nullable-FK deploy window, and surrogate PKs on two tables nothing writes); `cycle_ordinal` on
`required_actions` (§4); and the derived `users.dues_paid` predicate, which silently breaks
the day a writer sets `dues_paid = true` without `dues_paid_at`.

### Factual errors found in the source designs

- **"A `fresh` code questionnaire re-gates via a new activation"** — false. The only
  production INSERT into `questionnaire_activations` is inside `sendActivation`
  (`questionnaire-lifecycle.ts:336`), which requires a published `questionnaire_definitions`
  row, and `RESERVED_DEFINITION_KEYS` forbids one for the three code keys. **Consequence for
  this spec: the rollover can only re-gate builder questionnaires.** §12 OD3.
- **`required_actions` widening was costed as four `ON CONFLICT` targets.** It is four
  `ON CONFLICT` targets *plus* four unordered `(user, actionKey)` `.limit(1)` reads (§4), one
  of which can lock the whole camp out of the app. Neither design found them.
- **No design flagged that `renameTeam` / `setTeamArchived` / `moveTeam` drop unknown config
  keys** (`camp-config.ts:108-151`), which would silently reset the year namespace (§3.0).
- Minor: index line numbers were off by one to five in two designs
  (`required_actions_user_action_idx` is `:673-676`; `questionnaire_responses_user_def_idx` is
  `:1529-1532`; the one-open index is `:571-573`, declared in `schema.ts`, not only in
  migration 0018). `RESERVED_DEFINITION_KEYS` has **four** entries, not three
  (`driver_profiles` is an alias guard).
- Corroborated and kept: `team_memberships` has no production writer; `users.dues_paid` is
  written by nothing; `audit_log` has no writer at all; `sanitiseAccount` does not delete
  `questionnaire_responses`; `classifyChange` ignores unknown top-level keys.

---

## 12. Open decisions for the owner

**OD1 — the default carry-over policy.** This spec defaults to **carry** so the button does
nothing until a questionnaire is opted in, and relies on the confirm screen to make re-asks
visible. Two of three designers argued for **fresh** ("a wrongly-carried answer is silent; a
needless re-ask costs two minutes"). Their argument is strong for a single answer and weak
for a camp-wide button. One-word change either way. **Your call.**

**OD2 — should the rollover be able to re-ask the burner profile?** `schema.ts:374-377` says
`burner_profiles` "persists across the yearly reset", and `burner_profile` is the one code
questionnaire with a real page (`/onboarding/questionnaire`), so re-gating it **blocks the
entire camp on day one of the new year**. This spec sets it to `carry` and the rollover never
touches it. If you want an annual "confirm your details" pass, the right shape is a separate
`fresh` builder questionnaire, not re-opening onboarding.

**OD3 — `dietary_requirements` and `driver_profile` policy, and whether to build their pages.**
Right now their policy is inert: they have no bespoke page (`ACTION_ROUTES`, `required-actions.ts:9-13`),
no activation is possible, and `nextGate` skips them. Setting them `fresh` records intent and
changes nothing. Two questions: (a) do you want "are you driving this year / has your diet
changed" asked annually — and if so, is the answer to build those two pages, or to move both
onto the questionnaire builder (which gets them cycle-scoped responses and rollover for free)?
(b) The stale-driver hazard (§10) is live either way: after a rollover, a "drivers" broadcast
reaches last year's drivers. Fix it now with a time bound, or accept it until the pages exist?

**OD4 — the cycle label.** Free text the captain types ("2027", "AfrikaBurn 2027"), never
parsed, and it is also the type-to-confirm string. Confirm that is what you want rather than a
year integer.

**OD5 — `revertCycle` in scope or not?** It is Phase 5 (~half a day) and the first thing to
cut. The safety story without it is plan-then-type-to-confirm plus "nothing is destroyed",
which is genuinely sufficient — but you would recover from an accidental rollover by hand
(close the new activations, re-open the old ones), not by a button.

**OD6 — dues.** This spec does **not** reset `users.dues_paid` (nothing writes it), and
instead records the rule that the dues ledger must be cycle-keyed when built. Confirm you are
happy deferring, or say the word and the checkbox ships enabled.

---

## 13. Known gaps this spec does not close

Named so they are decisions, not surprises.

- **Code questionnaires cannot be re-gated by the rollover** (§11). Only builder
  questionnaires have a re-sendable activation.
- **`driver_profiles.intends_to_drive` goes stale across cycles** and the drivers broadcast
  audience has no time bound (`broadcasts.ts:72-75`).
- **`adoptees.slot_number` collides across cycles**; the adoption page must bracket by
  `created_at`.
- **`team_budgets` still physically cannot hold two cycles** (PK is bare `team`).
- **`sanitiseAccount` does not delete `questionnaire_responses`** — pre-existing, widened by
  cycle-scoping, one line to fix.
- **A carry-over prefill can return a row written against an older `definitionVersion`.**
  `validateBuilderResponses` rebuilds the map from the current definition, so stale field ids
  drop silently on first save. Not new — identical to today's behaviour on any breaking bump
  — but the cycle-spanning prefill makes it reachable more often.
- **Cycles live in JSONB**, so there is no referential integrity between
  `questionnaire_activations.cycle` and the config. A hand-edited config could orphan a
  stamped number. Accepted for an array written once a year by one person — the same trade
  the teams config already makes.

---

## 14. Files

| File | Action |
|---|---|
| `packages/db/src/camp-config.ts` | **Fix** the three transforms to spread (§3.0). **Add** `CycleEntry` / `CampConfig` / `CYCLE_ONE` / `resolveCycles` / `currentCycle` / `advanceCycles` / `resolveCodeCarryOver` / `setCodeCarryOver` / `getCurrentCycle` |
| `packages/db/src/schema.ts` | Four column additions + one index rename (§5) |
| `packages/db/migrations/0019_*.sql` | **Generated** by `db:generate`. Never hand-written |
| `packages/db/src/cycles.ts` | **New** — `carryOverFor`, `planRollover`, `advanceCycle`, `revertCycle` |
| `packages/db/src/activations.ts` | `openActivationTx` extraction; the carry-over fan-out filter; `cycle` on `completeBuilderResponse` and its `ON CONFLICT`; `cycle`/`carryOver` on `ActivationRow`; **`reconcileOpenActivations(userId)`** |
| `packages/db/src/questionnaire-lifecycle.ts` | `closeActivationTx` extraction; `sendActivation` stamps `cycle` + `carryOver` |
| `packages/db/src/questionnaire-responses.ts` | `opts: {cycle, carryOver}` on load; `cycle` on upsert + its `ON CONFLICT`; `seededFromCycle` on the returned row |
| `packages/db/src/questionnaire-definitions.ts` | Read/write the `carry_over` column |
| `apps/web/lib/camp-config.ts` | `getCurrentCycle()` on the E2E-aware facade |
| `apps/web/lib/users.ts` | Call `reconcileOpenActivations` from `ensureCampUser` |
| `apps/web/app/questionnaires/[activationId]/page.tsx`, `actions.ts` | Pass `activation.cycle` / `activation.carryOver`; the two copy lines (§9) |
| `apps/web/app/captains/questionnaires/[key]/lifecycle-controls.tsx` + `actions.ts` | The per-questionnaire carry-over toggle |
| `apps/web/app/captains/camp-settings/cycle/page.tsx` + `actions.ts` | **New** — plan / confirm / receipt |
| `docs/questionnaire-builder.md` | §7.1 completion derives from `questionnaire_responses` scoped by cycle (§7.5) |

---

## 15. Phased plan

Each phase is independently shippable and leaves the app working.

**Phase 1 — prerequisite fixes.** The config-transform spread (§3.0) + regression test;
`reconcileOpenActivations(userId)` wired into `ensureCampUser` (§10) + PGlite integration test.
No schema change.
**Done when:** an unknown top-level config key survives all three team transforms, and a
member created after an activation opened receives that activation's gate on first login.
*Both fix live bugs and are worth landing on their own.*

**Phase 2 — schema + pure transforms.** The four columns, the index swap,
`db:generate` → 0019, `drizzle-kit check`. `CycleEntry` / `resolveCycles` / `currentCycle` /
`advanceCycles` / `resolveCodeCarryOver` / `setCodeCarryOver` with unit tests (no DB needed —
they mirror `renameTeam` / `moveTeam` exactly).
**Done when:** `0019_*.sql` contains exactly the six statements in §5.5, `drizzle-kit check`
passes, the pure transforms are unit-tested, and the full suite is green with **no behaviour
change** — every read defaults to cycle 1, every questionnaire carries over, every gate works
as today.

**Phase 3 — carry-over reads and writes.** `sendActivation` stamps `cycle` + `carryOver`; the
cycle-aware load / upsert / complete; the `openActivation` carry filter; `seededFromCycle`;
the runner wiring and copy; the captain toggle in the builder's lifecycle controls.
**Done when:** PGlite integration tests prove a `fresh` re-send yields a blank form with
`completedAt: null`, a `carry` re-send prefills the prior cycle's answer, a `carry` re-send
**skips** a member who already completed at a satisfying version, and **gates** a member who
never answered.

**Phase 4 — the rollover.** The `…Tx` extraction; `planRollover`; `advanceCycle`; the
plan/confirm/receipt page; the `audit_log` write (plus the `metadata` `$type<>()` fix).
**Done when:** an integration test advances a camp holding one `carry` and one `fresh`
published questionnaire plus one closed one, and asserts all four buckets of §8.1, that the
old activation is `closed` with its gates `expired` (not deleted), that the new activation
carries `cycle = 2` and `dueAt = null`, that cycle 1's responses are still readable, and that
a second concurrent call returns `already-advanced`.

**Phase 5 — optional.** `revertCycle` with its untouched-and-max guard; the announcement
checkbox; the `sanitiseAccount` response-delete fix.
**Done when:** a rollover followed by `revertCycle` returns `planRollover()` to its
pre-rollover output, and `revertCycle` **refuses** once any response exists at the new cycle.

### Effort — honestly

**4-5 days for one person**, not the 3 the minimal design claimed and not the 2 weeks the
maximal one did. Day 1 is Phase 1 (two real bug fixes, and `reconcileOpenActivations` needs
`computeAudience` per open activation, which is more than a one-liner). Day 2 is Phase 2. Day
3 is Phase 3 — the carry filter and the `seededFromCycle` plumbing touch six functions and
two UI surfaces. Days 4-5 are Phase 4; the `…Tx` extraction is mechanical but the
plan/confirm/receipt page is three states of real UI and `audit_log` is a cold path with no
existing writer to copy. Phase 5 is half a day.

**Least confident about:** (a) whether the owner actually wants `dietary_requirements` and
`driver_profile` re-asked annually, which is the difference between "record a policy" and
"build two pages" (OD3); (b) the `carry`-vs-`fresh` default (OD1) — the argument is genuinely
balanced and I have made a judgement call, not found a right answer; (c) whether
`reconcileOpenActivations` on every `ensureCampUser` is cheap enough — it is a `SELECT` of
open activations plus an audience computation per request, and for a camp of 80 with ≤10
activations it should be, but it wants an `EXPLAIN` before it ships rather than after.

---

## 16. Tests

**Pure, no DB** (`packages/db/src/__tests__/`, vitest):
`resolveCycles` on absent / empty / malformed / valid input → `[CYCLE_ONE]` or the list ·
`currentCycle` with one open entry, with none open, with a gap · `advanceCycles` stamps
`endedAt`, appends, throws on a duplicate number, does not mutate its input ·
`resolveCodeCarryOver` per-key fallback: one bad entry does not discard the others ·
`setCodeCarryOver` preserves every other config key · **the three team transforms preserve an
unknown top-level key** (§3.0 regression).

**`packages/types`:** `classifyChange` returns `cosmetic` for an unknown added top-level key
(guards §6.2 against a future "deep comparison" fix).

**PGlite integration** (`_harness.ts` + `__setDbOverride`):
migration 0019 applies and stamps every pre-existing row `cycle = 1` · the index swap accepts
two rows differing only by `cycle` and still rejects a duplicate within one cycle ·
`sendActivation` freezes `cycle` and `carryOver` off the definition · `openActivation` with
`carryOver = true` skips a completed member and includes a never-answered one ·
`openActivation` with `carryOver = true` **includes** a member whose completion is against an
older version (`meetsRequiredVersion`) · `loadQuestionnaireResponse` fresh → null in a new
cycle; carry → the prior cycle's row with `seededFromCycle` set · `completeBuilderResponse`
writes a second row rather than overwriting · `advanceCycle` end to end: four buckets, gates
expired not deleted, cycle-1 responses still readable, `audit_log` row written · concurrent
`advanceCycle` → one `ok`, one `already-advanced` · `revertCycle` succeeds on an untouched
cycle and refuses once a response exists · `reconcileOpenActivations` gives a
created-afterwards member the open activation's gate.

**Component** (`vitest` + Testing Library): the confirm screen refuses until the label is
typed exactly; the plan renders the `untouched` list; the dues checkbox is absent when the
count is zero.

**E2E:** none required. The test store seeds `DEFAULT_CAMP_CONFIG`, which has no `cycles`
key, so `resolveCycles` returns `[CYCLE_ONE]` and Playwright behaviour is unchanged.
