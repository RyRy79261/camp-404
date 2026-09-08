# A minimal cycle key

**Three columns, one widened index, one JSONB key. No new tables.**

The design in one paragraph: the year lives in `camp_settings.config` as a `cycles`
array (zero DDL — the column is already JSONB). Each questionnaire definition gains a
`carry_over` boolean. Activations and responses gain a `cycle` integer. Advancing the
year is a captain action that, for each questionnaire whose `carry_over` is false,
does exactly what a captain already does by hand today — closes the open activation
and opens a fresh one — in one transaction, after showing a plan. Nothing is deleted.

---

## 0. What exists today — verified

| Claim | Evidence |
|---|---|
| No edition / cycle / season / year concept anywhere | `rg -w 'edition\|cycle\|season\|year' packages/db/src apps/web/lib` returns only `import cycle` comments (`packages/db/src/schema.ts:24`, `packages/db/src/relations.ts:10`) and questionnaire copy ("Your ideas for this year's burn", `apps/web/lib/questionnaire.ts:202`) |
| `camp_settings` is a singleton with a JSONB config | `packages/db/src/schema.ts:1422-1447` — PK is `boolean("id").default(true)` + a `check("camp_settings_singleton")`; `config` is `jsonb().$type<TeamsConfig>()` with an inline SQL default |
| The yearly reset is aspirational, not built | `packages/db/src/schema.ts:245` "persist across the yearly camp reset; per-burn data in other tables is cleared" and `:375` "persists across the yearly reset" — both are comments; nothing implements either |
| Opening an activation **re-arms** the gate in place | `packages/db/src/activations.ts:116-130` — `onConflictDoUpdate` on `(user_id, action_key)` sets `status: "pending", completedAt: null` |
| Closing an activation **expires** the gate without deleting | `packages/db/src/questionnaire-lifecycle.ts:246-254` — pending `required_actions` for that activation → `expired`; responses untouched |
| One open activation per key, enforced in the DB | `packages/db/src/schema.ts:568-572` (`questionnaire_activations_one_open_per_key_idx`), migration `0018_workable_praxagora.sql` |
| A member has at most one live obligation per key, ever | `packages/db/src/schema.ts:673-676` — `uniqueIndex("required_actions_user_action_idx").on(userId, actionKey)` |
| Responses are one-latest-answer per `(user, definition)` | `packages/db/src/schema.ts:1529-1532` — `uniqueIndex("questionnaire_responses_user_def_idx")` |
| A gate re-opens when the required version outruns the completed one | `packages/db/src/versions.ts:14-24` (`meetsRequiredVersion`) used at `packages/db/src/activations.ts:194-200` and `:352-357` |
| `classifyChange` compares only fields + `visibleIf` | `packages/types/src/questionnaire-builder.ts:461-486` — an unknown new top-level key on `BuilderQuestionnaire` is invisible to it, so it classifies as `cosmetic` |
| The gate router skips actions it can't route | `apps/web/lib/required-actions.ts:30-39`; consumed at `apps/web/app/page.tsx:55-56` and `apps/web/app/questionnaires/[activationId]/page.tsx:51-52` |
| The captain config surface + its locked read-modify-write | `apps/web/app/captains/camp-settings/page.tsx:35-37`, `apps/web/app/captains/camp-settings/actions.ts:44-63` (`requireCaptain`), `packages/db/src/camp-config.ts:184-208` (`mutateTeamsConfig`, `SELECT … FOR UPDATE` on the singleton) |
| Bootstrap uses the same singleton lock | `packages/db/src/bootstrap.ts:61-72` |
| Account erasure preserves the `users` row, deletes owned rows | `packages/db/src/account.ts:21-43` (`sanitisedUserPatch` — clears `termsVersion`/`termsConsentedAt`, keeps `duesPaid`, `approvalStatus`, `rank`), `:74-116` (explicit deletes, **`questionnaire_responses` is NOT among them**) |

Two findings that materially shrink this feature:

1. **`team_memberships` has no production write path.** The only
   `insert(schema.teamMemberships)` in the repo is `packages/db/src/__tests__/_factories.ts:39`;
   `packages/db/src/account.ts:96` only DELETEs. Corroborated at
   `docs/harvest/02-crosscut-dedup-and-dependencies.md:11`. There is nothing to reset.
2. **`users.dues_paid` / `dues_paid_at` are written by nothing.** They are read at
   `packages/db/src/roster.ts:61,105` and `apps/web/lib/mcp/tools/people.ts:120-121`
   only. Corroborated at `docs/harvest/ledger/02-ledger-actionable-478.md:440`.
   Same for `team_budgets` (read only by `apps/web/lib/mcp/tools/teams.ts`).

So two of the five "accidental carry-over" cases the harvest flagged
(`docs/harvest/01-build-plan.md:39`, `docs/harvest/04-completeness-critique.md:163-170`)
are **latent, not live**. This design's job for those two is to state the rule before the
write path lands, not to write reset code for data that doesn't exist.

---

## 1. Table-by-table: year-scoped, camp-lifetime, or infrastructure

The fourth column is the one that matters. It is `no` for **35 of 38** tables.

### Year-scoped (the read means "this burn")

| # | Table | `schema.ts` | Needs a `cycle` column? |
|---|---|---|---|
| 1 | `questionnaire_activations` | :537 | **YES.** A send belongs to a cycle, and a response must inherit its cycle from the activation it was opened under (see §3.3 — the mid-submit rollover race). |
| 2 | `questionnaire_responses` | :1508 | **YES.** The `(user, definition)` unique index means a fresh answer would *overwrite* last year's. This is the only place where the current schema physically cannot hold two cycles of the data the owner asked to keep. |
| 3 | `required_actions` | :643 | No. `required_actions_user_action_idx` (:673) already means "one live obligation per key per user" — the table only ever holds the *current* cycle by construction. Its history lives in `questionnaire_responses` + `questionnaire_edits`. |
| 4 | `questionnaire_activation_targets` | :578 | No. Inherits its activation's cycle through the FK. |
| 5 | `questionnaire_edits` | :603 | No. Append-only log with `createdAt` (:637-641 index). Date-range against the cycle's `startedAt`/`endedAt` is exact. |
| 6 | `reimbursements` | :749 | No. `createdAt` + the terminal `reconciled` status already partition it; the camp closing its books *is* the year boundary. A cycle column would restate a date range. |
| 7 | `tasks` | :966 | No. `createdAt`/`completedAt`/`status`. |
| 8 | `adoptees` | :993 | No. `slotNumber` carries no uniqueness constraint, so a second year simply accumulates rows; `arrival`/`departure` are real dates. |
| 9 | `workshops`, `workshop_rsvps` | :1015, :1026 | No. `startsAt` is a real date — the range filter is exact. |
| 10 | `broadcasts`, `broadcast_targets`, `notification_deliveries` | :836, :883, :903 | No. A log; `createdAt` is the axis. |
| 11 | `car_members` | :455 | No. See §6.6 — the fix is a *fresh questionnaire*, not a column. |
| 12 | `telegram_invites` | :1229 | No. Already status-tracked with `joinedAt`. |
| 13 | `team_budgets` | :796 | **The one honest gap.** PK is `team`, so exactly one budget per team forever. Written by nothing today. §7 says leave it and record the rule. |

### Camp-lifetime (must survive every rollover)

| # | Table | `schema.ts` | Note |
|---|---|---|---|
| 14 | `users` | :248 | Identity, rank, approval, terms, invite provenance, sanitisation, AI consent — all lifetime. Two per-cycle stowaways: `dues_paid`/`dues_paid_at` (:265-266). See §6.3. |
| 15 | `burner_profiles` | :380 | The schema already declares it lifetime (:374-377). |
| 16 | `dietary_requirements` | :400 | Lifetime facet, "re-requested by activating the questionnaire with a new `version`" (:396-399) — the existing mechanism, no cycle needed. |
| 17 | `driver_profiles` | :421 | The *row* is lifetime; `intendsToDrive`/`arrivalAt`/`departureAt` are the year-scoped fields. Handled by version bump, §6.6. |
| 18 | `team_memberships` | :474 | Lifetime until someone changes it. §6.5. |
| 19 | `invite_codes` | :340 | Lifetime provenance — the family tree depends on it. |
| 20 | `captain_promotion_requests` | :501 | Lifetime audit (:511-517 explains why it never cascades). |
| 21 | `documents` | :719 | Lifetime manuals with their own `version` integer. |
| 22 | `inventory_items`, `inventory_updates` | :1049, :1122 | Lifetime asset register; `archivedAt` is the soft-removal. A tent exists across burns. |
| 23 | `recipes` | :686 | Lifetime cookbook. |
| 24 | `questionnaire_definitions` | :1457 | Lifetime. **Gains `carry_over`.** |
| 25 | `questionnaire_versions` | :1481 | Lifetime immutable snapshots — the reason last cycle's answers stay renderable. |
| 26 | `camp_settings` | :1422 | The singleton. **Holds the cycle, in `config`.** |
| 27 | `audit_log` | :1180 | Lifetime, append-only. |
| 28 | `telegram_chats` | :1210 | Lifetime registry. |

### Infrastructure (no product year meaning)

| # | Table | `schema.ts` |
|---|---|---|
| 29 | `push_tokens` | :807 |
| 30 | `telegram_announcements` | :1258 |
| 31 | `mcp_oauth_clients` | :1315 |
| 32 | `mcp_auth_codes` | :1333 |
| 33 | `mcp_access_tokens` | :1362 |
| 34 | `mcp_audit_log` | :1389 |

(38 tables total; the year-scoped block above lists 13 rows covering 16 tables.)

---

## 2. The exact Drizzle diff

Four edits to `packages/db/src/schema.ts`. No new tables. **No enum changes** — nothing
here needs `ALTER TYPE … ADD VALUE`.

### 2.1 `questionnaire_activations` (schema.ts:537)

```ts
export const questionnaireActivations = pgTable(
  "questionnaire_activations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionnaireKey: text("questionnaire_key").notNull(),
    version: text("version").notNull(),
+   // The camp cycle this send belongs to — the `number` of the entry in
+   // camp_settings.config.cycles that was current at Send time. IMMUTABLE
+   // afterwards: a response filed against this activation inherits THIS value,
+   // so a member who is mid-form when a captain advances the year still files
+   // under the cycle their form was opened in. Default 1 = the founding cycle,
+   // which is where every pre-existing activation belongs.
+   cycle: integer("cycle").notNull().default(1),
    title: text("title").notNull(),
    description: text("description"),
    // … unchanged …
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

No index on `cycle`. At most ~8 questionnaires × a handful of cycles — the table will
have double-digit rows for the life of the camp. Adding one would be cargo cult.

### 2.2 `questionnaire_definitions` (schema.ts:1457)

```ts
export const questionnaireDefinitions = pgTable("questionnaire_definitions", {
  key: text("key").primaryKey(),
  title: text("title").notNull(),
  definition: jsonb("definition")
    .$type<Questionnaire | BuilderQuestionnaire>()
    .notNull(),
  status: questionnaireStatusEnum("status").notNull().default("draft"),
  version: text("version"),
+ // Rollover policy — the ONE thing a captain declares per questionnaire.
+ //   true  (default) — a completed answer survives a new cycle. advanceCycle
+ //                     leaves the open activation alone: the member stays done,
+ //                     and a member who never answered stays gated.
+ //   false           — re-asked every cycle. advanceCycle closes the open
+ //                     activation and opens a fresh one with the SAME scope /
+ //                     team / blocking, re-arming every targeted member's gate.
+ // Deliberately a COLUMN, not a field inside `definition`: it is operational
+ // (does the gate re-arm), not structural (nothing in the runner or validator
+ // reads it), so it is togglable on a LIVE questionnaire with no re-publish and
+ // no snapshot rewrite, and the rollover planner reads it in one SELECT rather
+ // than parsing JSONB. A code questionnaire with no row here (burner_profile is
+ // served from a template until a captain edits it) defaults to carrying over —
+ // which is exactly what schema.ts:374-377 and :396-399 already promise.
+ carryOver: boolean("carry_over").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});
```

### 2.3 `questionnaire_responses` (schema.ts:1508) — the only index change

```ts
export const questionnaireResponses = pgTable(
  "questionnaire_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    definitionKey: text("definition_key").notNull(),
    definitionVersion: text("definition_version").notNull(),
+   // Copied from questionnaire_activations.cycle at write time — never from the
+   // config's "current" cycle, so an in-flight submission can't be mis-filed by
+   // a rollover that lands between page 3 and Submit. Widens the latest-answer
+   // uniqueness from (user, definition) to (user, definition, cycle): a
+   // carry-over questionnaire keeps ONE row that a member amends forever, while
+   // a fresh one grows a NEW row each cycle and last cycle's answers stay
+   // readable. "Fresh" means the member must answer again — never that the old
+   // answer is destroyed.
+   cycle: integer("cycle").notNull().default(1),
    responses: jsonb("responses")
      .$type<QuestionnaireResponses>()
      .notNull()
      .default({}),
    activationId: uuid("activation_id").references(
      () => questionnaireActivations.id,
      { onDelete: "set null" },
    ),
    completedAt: timestamp("completed_at", { mode: "date" }),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (r) => ({
-   userDefIdx: uniqueIndex("questionnaire_responses_user_def_idx").on(
-     r.userId,
-     r.definitionKey,
-   ),
+   userDefCycleIdx: uniqueIndex(
+     "questionnaire_responses_user_def_cycle_idx",
+   ).on(r.userId, r.definitionKey, r.cycle),
    defIdx: index("questionnaire_responses_def_idx").on(r.definitionKey),
  }),
);
```

Renaming the index (rather than redefining the same name with a third column) makes
`drizzle-kit` emit a clean `DROP INDEX` + `CREATE UNIQUE INDEX` instead of trying to
diff it in place.

### 2.4 `camp_settings.config` — type widening only, zero DDL

```ts
-import type { TeamsConfig } from "./camp-config";
+import type { CampConfig } from "./camp-config";
 // …
     config: jsonb("config")
-      .$type<TeamsConfig>()
+      .$type<CampConfig>()
       .notNull()
       .default(sql`'{"teams":[…]}'::jsonb`),   // ← UNCHANGED
```

The seeded default keeps only `teams`. `resolveCyclesConfig` (§3.1) supplies cycle 1
when the key is absent, so **no data migration, no backfill, and the existing
"seeds match DEFAULT_CAMP_CONFIG" drift test** (`apps/web/lib/__tests__/camp-config.test.ts:84`
guards the import cycle; `packages/db/src/__tests__/camp-config.test.ts` guards the seed)
keeps passing untouched.

---

## 3. The carry-over model, end to end

### 3.1 Type → `packages/db/src/camp-config.ts` (extended, not replaced)

Same file, same style as `TeamConfigEntry` / `renameTeam` / `moveTeam` — pure
transforms, unit-testable without a DB, hand-rolled validation (the package
deliberately has no zod dependency, see the `resolveTeamsConfig` docstring).

```ts
/** One camp cycle — a burn year. `number` is monotonic; 1 is the founding cycle. */
export interface CycleEntry {
  number: number;
  /** Captain-authored, e.g. "AfrikaBurn 2027". Purely display. */
  label: string;
  startedAt: string;              // ISO
  /** null on exactly ONE entry: the current cycle. */
  endedAt: string | null;
}

export interface CampConfig extends TeamsConfig {
  /** Absent on a camp that has never advanced — resolves to [CYCLE_ONE]. */
  cycles?: CycleEntry[];
}

export const CYCLE_ONE: CycleEntry = {
  number: 1,
  label: "Cycle 1",
  startedAt: "1970-01-01T00:00:00.000Z",
  endedAt: null,
};

function isCycleEntry(value: unknown): value is CycleEntry { /* mirrors isTeamConfigEntry */ }

/** Coerce the stored JSONB to a usable cycle list; any malformation → [CYCLE_ONE]. */
export function resolveCycles(raw: unknown): CycleEntry[] {
  if (!raw || typeof raw !== "object") return [CYCLE_ONE];
  const cycles = (raw as { cycles?: unknown }).cycles;
  if (!Array.isArray(cycles) || cycles.length === 0 || !cycles.every(isCycleEntry)) {
    return [CYCLE_ONE];
  }
  return cycles as CycleEntry[];
}

/** The open cycle. Falls back to the highest-numbered entry if none is open. */
export function currentCycle(cycles: CycleEntry[]): CycleEntry {
  return (
    cycles.find((c) => c.endedAt === null) ??
    cycles.reduce((a, b) => (b.number > a.number ? b : a))
  );
}

/** PURE: close the open cycle and append the next. Throws on a duplicate number. */
export function advanceCycles(
  cycles: CycleEntry[],
  label: string,
  now: Date,
): CycleEntry[] {
  const current = currentCycle(cycles);
  const next = current.number + 1;
  if (cycles.some((c) => c.number === next)) {
    throw new Error(`Cycle ${next} already exists.`);
  }
  const iso = now.toISOString();
  return [
    ...cycles.map((c) => (c.number === current.number ? { ...c, endedAt: iso } : c)),
    { number: next, label, startedAt: iso, endedAt: null },
  ];
}

/** Read the camp's current cycle from the singleton. */
export async function getCurrentCycle(): Promise<CycleEntry> { /* one SELECT */ }
```

`apps/web/lib/camp-config.ts` (the E2E-aware facade, `:27-31`) gains a matching
`getCurrentCycle()`. Under `E2E_TEST_MODE` the test store seeds `DEFAULT_CAMP_CONFIG`,
which has no `cycles` key, so `resolveCycles` returns `[CYCLE_ONE]` **for free** —
Playwright keeps running with no database and no test-store change.

There is no `carryOver` field on `BuilderQuestionnaire`. If it were added there,
`classifyChange` (`packages/types/src/questionnaire-builder.ts:461-486`) would classify
the toggle as `cosmetic` — correct, but `publishDefinition` treats cosmetic as
"overwrite the current version's snapshot in place"
(`packages/db/src/questionnaire-lifecycle.ts:114-116, 137-143`), so flipping a policy
switch would silently rewrite a published immutable snapshot. That coupling is the
reason the flag is a column.

### 3.2 Storage

`questionnaire_definitions.carry_over`, default `true`. **Default true is the safe
default**: a questionnaire nobody has thought about does *nothing* at rollover. A
captain has to opt in to re-gating the camp.

### 3.3 The gating query — what the rollover actually reads

```ts
// packages/db/src/cycle.ts — planRollover(), pure read, no writes
const rows = await db
  .select({
    key: schema.questionnaireDefinitions.key,
    title: schema.questionnaireDefinitions.title,
    carryOver: schema.questionnaireDefinitions.carryOver,
    activationId: schema.questionnaireActivations.id,
    scope: schema.questionnaireActivations.scope,
    team: schema.questionnaireActivations.team,
    blocking: schema.questionnaireActivations.blocking,
    version: schema.questionnaireActivations.version,
  })
  .from(schema.questionnaireDefinitions)
  .leftJoin(
    schema.questionnaireActivations,
    and(
      eq(schema.questionnaireActivations.questionnaireKey, schema.questionnaireDefinitions.key),
      eq(schema.questionnaireActivations.status, "open"),
    ),
  )
  .where(eq(schema.questionnaireDefinitions.status, "published"));
```

The one-open-per-key index (`schema.ts:568-572`) guarantees the left join yields at
most one row per key. Three buckets fall out:

| `carryOver` | open activation | Bucket | What the rollover does |
|---|---|---|---|
| `true` | yes | **carries over** | Nothing. Completed members stay done; anyone still `pending` stays gated (their obligation never expired). |
| `true` | no | **carries over** | Nothing. |
| `false` | yes | **re-gate** | Close it, open a fresh one with identical scope/team/blocking, fan out the gates. |
| `false` | no | **not sent** | Nothing — and it is *listed in the plan* as "not currently sent; send it yourself if you want it this year". |

That last row is a deliberate refusal. The rollover must never *widen* what blocks a
member beyond what blocked them yesterday. A gate the captain deliberately closed
stays closed.

### 3.4 The member read path — where "fresh" is felt

Today the runner pre-fills from the single latest row
(`apps/web/app/questionnaires/[activationId]/page.tsx:67-70`). Under a fresh
questionnaire that would hand the member last year's answers, which defeats the point.
One function changes:

```ts
// packages/db/src/questionnaire-responses.ts
export async function loadQuestionnaireResponse(
  userId: string,
  definitionKey: string,
  opts: { cycle: number; carryOver: boolean },
): Promise<QuestionnaireResponseRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({ /* + cycle */ })
    .from(questionnaireResponses)
    .where(
      and(
        eq(questionnaireResponses.userId, userId),
        eq(questionnaireResponses.definitionKey, definitionKey),
        // carry-over: the most recent answer AT OR BEFORE this cycle (so a
        // captain re-sending a carry-over questionnaire in a new cycle still
        // pre-fills last cycle's answers to amend).
        // fresh: strictly THIS cycle — a new cycle starts from a blank form.
        opts.carryOver
          ? lte(questionnaireResponses.cycle, opts.cycle)
          : eq(questionnaireResponses.cycle, opts.cycle),
      ),
    )
    .orderBy(desc(questionnaireResponses.cycle))
    .limit(1);
  return row ?? null;
}
```

One query, one branch. The caller passes `activation.cycle` — **not** the config's
current cycle — so an in-flight form is consistent with the row it will write.

A carry-over prefill can return a row written against an older `definitionVersion`.
That is already handled: the runner renders the activation's pinned version
(`page.tsx:58-62`) and `validateBuilderResponses`
(`packages/types/src/questionnaire-builder.ts:276-312`) rebuilds the response map from
the *current* definition's fields, so stale field ids drop out on the first save.
Same behaviour as any breaking version bump today.

### 3.5 The member write path

`upsertQuestionnaireResponse` (`packages/db/src/questionnaire-responses.ts:22-55`) and
`completeBuilderResponse` (`packages/db/src/activations.ts:304-367`) each take a
`cycle: number` and change their `onConflictDoUpdate` target from
`[userId, definitionKey]` to `[userId, definitionKey, cycle]`. Both are only ever
called from the activation runner
(`apps/web/app/questionnaires/[activationId]/actions.ts:94, :102`), which already has
the activation in hand — so the caller change is `cycle: activation.cycle`.

`getActivationById` and `getOpenActivationForKey` add `cycle` to their select lists and
`ActivationRow`.

### 3.6 The metrics consequence, stated

`docs/questionnaire-builder.md:384-390` derives completion from
`required_actions.status = 'completed'`. A re-gate flips those rows back to `pending`
(the `onConflictDoUpdate` at `packages/db/src/activations.ts:121-129`), so cycle 1's
completion rate would be destroyed. It is not, because
`questionnaire_responses.(cycle, completedAt)` now records it permanently and exactly.
**§7.1 of the builder spec should derive completion from `questionnaire_responses`
scoped by `cycle`, not from `required_actions`.** One-line spec change, no code change
to preserve the data — the data is preserved by the column.

---

## 4. The rollover action, step by step

Route: `apps/web/app/captains/camp-settings/cycle/` — beside the existing team editor,
reusing `requireCaptain()` from `apps/web/app/captains/camp-settings/actions.ts:44-63`
verbatim (signed-in → camp-active → approved → captain clearance).

### Step 1 — Plan (read only, no writes)

`planRollover()` in `packages/db/src/cycle.ts` returns:

```ts
interface RolloverPlan {
  from: CycleEntry;
  toNumber: number;
  reGate: Array<{
    key: string; title: string;
    scope: Scope; team: Team | null; blocking: boolean; version: string;
    recipients: number;          // computeAudience() run in preview
  }>;
  carriesOver: Array<{ key: string; title: string; stillPending: number }>;
  notSent: Array<{ key: string; title: string }>;
  duesPaidCount: number;         // how many rows the optional reset would clear
  members: number;
}
```

`recipients` reuses `computeAudience` from `packages/db/src/audience.ts` — the same
function `openActivation` uses (`packages/db/src/activations.ts:4, 81-90`), so the
preview number is the number that will actually be gated.

The confirm screen is one page of plain sentences:

> **Advance to a new cycle**
> You're in **Cycle 1**. Advancing will:
> - Re-ask **3 questionnaires** of **47 members**: *Camp fees & tier*, *This year's shifts*, *Vehicle & lifts*
> - Leave **5 questionnaires** alone (their answers carry over). 2 members are still outstanding on *Burner profile* and stay outstanding.
> - Clear the **dues-paid tick** for 31 members. ☑︎ (uncheck to keep)
> - Post an announcement to everyone. ☑︎ (edit body)
>
> **Nothing is deleted.** Last cycle's answers stay readable. *Camp roles & bios* is
> marked fresh but isn't currently sent — send it yourself if you want it this year.
>
> Type the new cycle's name to confirm: `[ AfrikaBurn 2027 ]`

Typing the label to confirm is what makes this hard to do by accident — and it doubles
as the label input, so it isn't ceremony for its own sake.

### Step 2 — Execute

`advanceCycle({ label, actorUserId, resetDues, announcement })` — one pooled
transaction (`createPooledDb`; the HTTP driver has no transactions):

1. `INSERT … ON CONFLICT DO NOTHING` the singleton, then `SELECT … FOR UPDATE` it —
   the identical serialisation `mutateTeamsConfig` (`camp-config.ts:190-200`) and
   `bootstrapFirstCaptain` (`bootstrap.ts:63-72`) use. Two captains hammering the
   button serialise; the second sees the new cycle and returns
   `{ ok: false, reason: "already-advanced" }`.
2. `config.cycles = advanceCycles(resolveCycles(locked.config), label, now)` — stamp
   `endedAt` on the current entry, append `{ number: next, label, startedAt: now, endedAt: null }`.
   Write the config back.
3. For each `reGate` entry, inside the same tx:
   - `UPDATE questionnaire_activations SET status='closed', closed_at=now WHERE id=<old>`
   - `UPDATE required_actions SET status='expired' WHERE activation_id=<old> AND status='pending'`
   - `INSERT questionnaire_activations (questionnaire_key, version, cycle=next, title, scope, team, blocking, due_at=NULL, activated_by_user_id=actor, status='open', opened_at=now)`
   - copy `questionnaire_activation_targets` when `scope='individual'`
   - the `required_actions` upsert from `openActivation` (`activations.ts:102-130`) for
     `computeAudience(...)`
4. If `resetDues`: `UPDATE users SET dues_paid=false, dues_paid_at=NULL WHERE is_system=false AND dues_paid=true`, capturing the affected ids first.
5. `INSERT audit_log (actor_id=actor, action='cycle.advance', target=String(next), metadata={plan, duesCleared: [...ids], announcementBroadcastId})`.
6. If `announcement`: `INSERT broadcasts (kind='announcement', scope='everyone', presentation='acknowledge', published_at=now)` and the `notification_deliveries` fan-out — the body of `publishAnnouncement` (`packages/db/src/broadcasts.ts:228-289`).

**Reuse, honestly.** Steps 3's first two statements are the body of `closeActivation`
(`questionnaire-lifecycle.ts:234-255`) and the rest is `sendActivation` +
`openActivation` (`:334-364`, `activations.ts:94-133`). All three currently open their
own `createPooledDb()`, so calling them in a loop is 2N connections and no atomicity.
The change is mechanical: extract `closeActivationTx(tx, id)` and
`openActivationTx(tx, act, recipientIds)`, and make the existing exported functions
thin wrappers that open a pool and call them. ~40 lines moved, no behaviour change,
existing tests untouched.

**`audit_log` has no writer anywhere in the repo today** (`rg auditLog` hits only
`schema.ts:1180`). The rollover would be its first production writer. That's a plain
insert, but worth knowing you're lighting up a cold path.

### Step 3 — Report

The action returns the executed plan; the page renders it as a receipt with the
`audit_log` id. Re-running `planRollover()` afterwards shows the new state, so the
report is re-derivable rather than a stored artefact.

### Reversibility

Nothing is deleted:

- old activations → `closed`, rows intact, `closedAt` stamped;
- old pending gates → `expired` (a terminal non-gating state `getPendingRequiredActions`
  already filters out, `activations.ts:226-231`);
- **every answer from every prior cycle stays in `questionnaire_responses`** under its
  own `cycle` — that is the whole point of the column;
- the cleared dues ticks are listed by user id in the `audit_log` metadata.

**Optional `revertCycle()` (recommended, ~30 lines).** Pop the last `cycles` entry,
restore `endedAt = null` on the previous, and close every activation stamped with the
abandoned cycle number (their pending gates → `expired`; the carried-over activations
were never touched, so members simply stop being blocked). Guarded by
`SELECT count(*) FROM questionnaire_responses WHERE cycle = <abandoned>` = 0 — the
guard is what makes it cheap, because it means no member work can be lost. Once one
person has answered, the exit is forward: close the new activation with the existing
button and re-send. If a day of budget has to go, this is the one to cut.

---

## 5. What the member sees on first login after a rollover

Three cases, all through machinery that already exists. **No new member-facing UI.**

**A. Nothing was re-gated (the default).** Nothing at all. `nextGate`
(`apps/web/lib/required-actions.ts:30-39`) returns `null`, `apps/web/app/page.tsx:55-56`
falls through, home renders. A camp that leaves every questionnaire on `carry_over: true`
experiences a rollover as a label change and nothing else — which is correct, and is
why the default is `true`.

**B. Something was re-gated, blocking.** They log in, `nextGate` finds the freshly
`pending` blocking row and redirects to `/questionnaires/<newActivationId>`
(`required-actions.ts:35-37`). The runner renders the same pinned version they saw last
year with an **empty** form (§3.4). Multiple re-gated questionnaires queue in
`createdAt` order (`activations.ts:232`) — they clear one, land on the next.

**C. Something was re-gated, non-blocking.** They see nothing until they go looking.
That is why the rollover copies the old activation's `blocking` flag rather than
forcing `true`: it never makes a questionnaire more intrusive than the captain
originally made it.

**The announcement.** The one thing not automatic. One `broadcasts` row with
`presentation: 'acknowledge'` (`schema.ts:183-198`) produces the existing full-screen
takeover the member must dismiss — "We've moved to AfrikaBurn 2027. Here's what we're
asking you again." — before the questionnaire gate. It costs one insert plus the
`publishAnnouncement` fan-out, and it's the difference between "the app is broken, why
is it asking me this again" and "right, new year."

---

## 6. The named edge cases

### 6.1 A member who joined mid-cycle

Nothing special. Their `required_actions` rows and responses carry the same `cycle` as
everyone's. At rollover they are in the audience `computeAudience` returns (it selects
all non-system users, `activations.ts:59-77`), so they are re-gated like everyone. Their
cycle-1 answers stay readable under `cycle = 1`.

### 6.2 A member who joins *after* the rollover — a pre-existing hole this exposes

`openActivation` only fans out at open time. A member who signs up on day 2 of cycle 2
gets **no** `required_actions` row for any open activation. The schema promises
otherwise — `schema.ts:531-535`: "new joiners / team changes / opt-ins are reconciled
against still-open activations" — but no reconciler exists. The only per-signup seeding
is `seedBurnerProfileAction` (`apps/web/lib/users.ts:196-205`), which hardcodes
`burner_profile`.

**This is pre-existing, not caused by the rollover** — but the rollover makes it
visible, because it is the first time a camp will routinely have several open
activations at once. Required companion work, ~15 lines: `reconcileOpenActivations(userId)`
in `packages/db/src/activations.ts` — select the open activations, run each one's
audience predicate for this one user, `ensureRequiredAction` for the matches — called
from `ensureCampUser`. Do it in the same PR or the rollover ships a hole.

### 6.3 `users.dues_paid` / `dues_paid_at`

Written by nothing today (§0). The rule this design sets:

- **Dues are per-cycle and do not belong on `users`.** When the dues write path lands
  (harvest WP10, `docs/harvest/ledger/02-ledger-actionable-478.md:440`) it must carry a
  `cycle` — either as a `dues` row keyed `(user_id, cycle)` or, more in keeping with
  this design, as a `required_actions` row of `type = 'payment'`, `action_key = 'dues'`
  that a captain satisfies, re-armed each cycle exactly like a fresh questionnaire.
- **Until then**, `advanceCycle` resets the boolean behind a default-on checkbox, with
  the cleared user ids in the `audit_log` metadata.

This is the one step in the design that erases a fact rather than marking it, and it is
worth arguing. The alternative — leaving it — means a captain who advances the year
opens the roster and sees 60 green "dues paid" ticks. The app would be actively lying
about the exact thing the feature exists to fix. A reset that is announced in the plan,
opt-out on the confirm screen, and enumerated in the audit log clears the
"inspectable" bar, and it disappears the day the real ledger lands.

### 6.4 `users.approval_status`

**Carries over. Deliberately, and there is no checkbox.** Vetting is a judgement about a
*person*, not about a burn: it has a terminal `rejected` state, and the schema comment
(`:44-49`) is explicit that it is "a first-class membership-lifecycle field … actioned
by a captain, not completed by the user." Re-queueing 47 approved members every year is
a captain-hostile design that would make the year switch the most feared button in the
app. A camp that genuinely wants to re-vet does it per person on the existing
camp-management surface.

### 6.5 `users.terms_consented_at` / `terms_version`

**Carries over, because the right axis is `terms_version`, not cycle.** The columns
already model "which terms did you agree to". If the camp reissues terms for the new
year they bump `terms_version`, and the *existing* version comparison
(`meetsRequiredVersion`, `versions.ts:14-24`; applied at `activations.ts:194-200`)
re-opens the gate. The confirm screen offers "the camp has new terms this year", which
when ticked calls `ensureRequiredAction` for an `acknowledgement` row across the camp
and nothing else. No cycle column, no new mechanism.

(Note `sanitisedUserPatch` already clears both on account erasure,
`account.ts:36-37` — unaffected by any of this.)

### 6.6 Open `required_actions`, and the rows the rollover must not touch

- **Carry-over key, member completed** → row untouched, stays `completed`. They are done.
- **Carry-over key, member never answered** → row untouched, stays `pending`, still
  gates them. Correct: the obligation never expired.
- **Fresh key, member completed** → `expired`, then immediately re-upserted to `pending`
  against the new activation. Their cycle-1 answer row is untouched and permanent.
- **Fresh key, member never answered** → `expired`, then `pending` against the new
  activation. Still gated, now under cycle 2. No cycle-1 response row exists, so the
  historical read shows them as a cycle-1 non-responder — permanently and accurately.

**The invariant that falls out for free:** the rollover only ever writes
`required_actions` rows whose `activation_id` belongs to an activation it is closing or
opening. Any hand-seeded row — `burner_profile` from `seedBurnerProfileAction` has
`activationId = null`, and every `payment` / `profile_update` / `acknowledgement` row —
is invisible to it. State it as a test.

### 6.7 `team_memberships`

**Carries over.** No writer exists (§0), so there is nothing to reset today, and when
WP6 #130 lands the assignment UI it should **not** gain a cycle column. Team membership
is durable until someone changes it; the year turning is not a reason to unassign 47
people and hand a captain a blank org chart on day one of planning.

The satisfying part: "which team do you want to be on this year?" is a **fresh builder
questionnaire**. Set `carry_over: false` on it and the rollover re-asks the whole camp;
the captain reads the responses and applies them. The carry-over flag *is* the team
reshuffle mechanism — no extra feature needed.

### 6.8 `car_members` and `driver_profiles`'s year-scoped fields

`car_members` (who is riding with whom) and `driver_profiles.intendsToDrive` /
`arrivalAt` / `departureAt` are genuinely per-burn and genuinely carry over wrongly.
Neither gets a column. The driver questionnaire has no built page yet — it is absent
from `ACTION_ROUTES` (`apps/web/lib/required-actions.ts:9-13`, "their activations stay
pending but don't gate"), so this is theoretical today. When it is built, it is a
`carry_over: false` questionnaire whose completion rewrites the row, and the driver
re-picks passengers. The lifetime part of the row (licence, vehicle, off-road
experience) is what carries.

### 6.9 `team_budgets`

The one place the schema genuinely cannot hold two cycles: PK is `team`, one row per
team forever. Written by nothing. **Deliberately not fixed here** — repointing its PK is
a real migration for a table with no write path, and this design would rather record the
rule than pre-build for it: when a budget write path lands, its PK becomes
`(team, cycle)`. Written down so the next person doesn't have to rediscover it.

### 6.10 `questionnaire_responses` and account erasure

`sanitiseAccount` (`account.ts:74-116`) deletes eleven owned tables but **not**
`questionnaire_responses`. Pre-existing and out of scope — flagged because the cycle
column makes response rows accumulate rather than being overwritten, which raises the
stakes slightly. `docs/questionnaire-builder.md:429` lists response erasure as an
explicit v1 non-goal, so this stays where it is.

---

## 7. Migration plan under append-only rules

```
pnpm --filter @camp404/db db:generate     # → migrations/0019_<generated_name>.sql
pnpm --filter @camp404/db db:migrate
```

`0000_initial.sql` frozen, nothing under `migrations/` hand-written, `_journal.json`
gains one entry (`idx: 19`) after `0018_workable_praxagora`. Expected SQL:

```sql
ALTER TABLE "questionnaire_activations" ADD COLUMN "cycle" integer DEFAULT 1 NOT NULL;
ALTER TABLE "questionnaire_definitions" ADD COLUMN "carry_over" boolean DEFAULT true NOT NULL;
ALTER TABLE "questionnaire_responses"   ADD COLUMN "cycle" integer DEFAULT 1 NOT NULL;
DROP INDEX "questionnaire_responses_user_def_idx";
CREATE UNIQUE INDEX "questionnaire_responses_user_def_cycle_idx"
  ON "questionnaire_responses" USING btree ("user_id","definition_key","cycle");
```

Five statements. Three `ADD COLUMN NOT NULL`, each with an explicit `DEFAULT` — exactly
the AGENTS.md rule. No `ALTER TYPE`. No new table. No `camp_settings` DDL.

**Risk: low.** The only non-additive statement is the index swap, and it is safe by
construction: the new index is strictly weaker than the old one (any row set satisfying
3-column uniqueness satisfied the 2-column version), and the `ADD COLUMN` immediately
before it stamps every existing row `cycle = 1`, so no duplicate can appear during the
swap. `questionnaire_responses` holds one row per member per builder questionnaire —
double digits — so the rewrite is instantaneous. No backfill script, no data migration,
no downtime, and **if nobody ever presses the button the app behaves exactly as it does
today**: every read defaults to cycle 1, every questionnaire carries over, every gate
works as before.

**Test coverage** (using the PGlite harness at `packages/db/src/__tests__/_harness.ts`
with the `__setDbOverride` DI seam — real Drizzle queries, in-process Postgres):

- pure: `resolveCycles` fallbacks, `currentCycle`, `advanceCycles` (throws on duplicate)
- integration: a carry-over questionnaire is untouched by a rollover; a fresh one
  re-arms every gate; a completed cycle-1 answer is still readable after the fresh
  questionnaire is re-answered in cycle 2 (two rows, both intact); a `carry_over: false`
  definition with **no** open activation is left alone; a `required_actions` row with
  `activation_id = null` is never touched; a second concurrent `advanceCycle` returns
  `already-advanced`; a mid-form submit stamped from `activation.cycle` files under the
  old cycle
- E2E: unchanged — the test store returns `[CYCLE_ONE]` for free

---

## 8. What I deliberately did NOT do, and why

**No `cycles` table.** The camp will have between 1 and ~20 rows for its entire
existence, all read together, never joined, and edited only by one person once a year.
That is a config value, and `camp_settings.config` is already the place this codebase
puts config values with pure accessors and a locked read-modify-write
(`camp-config.ts:184-208`). A table would cost a migration, a FK from two other tables,
a relations entry, and a new read module, to buy referential integrity over an array
that is written once a year.

**No `cycle` on `users`.** "Which cycle is this member in" is the wrong question — the
member is in the camp, and their *obligations* are per-cycle. Putting a cycle on `users`
would mean either a row per member per year (a membership table by another name) or a
"current cycle" denormalisation that can drift from `camp_settings`.

**No `cycle` on `required_actions`.** It looks like the obvious candidate and it is a
trap. `required_actions_user_action_idx` (`schema.ts:673-676`) already restricts the
table to one live obligation per key per user — it is *already* current-cycle-only. A
cycle column would demand widening that index, which would then permit a member to be
gated by both cycle 1's and cycle 2's copy of the same questionnaire simultaneously and
put two entries in `nextGate`'s queue. The current index is load-bearing; leave it.

**No `cycle` on the 35 other tables.** Every one of them is either lifetime, or already
partitioned by a real date the cycle's `startedAt`/`endedAt` can range-filter against
exactly. A cycle column on `reimbursements` or `tasks` would restate `createdAt`.

**No wipe-and-reseed.** The harvest offers it as a legitimate option for 30-80 people
(`04-completeness-critique.md:167-170`). It fails the owner's explicit requirement —
"last year's roster" — and it needs an ops runbook, which is the thing this design is
supposed to avoid.

**No `carryOver` inside `BuilderQuestionnaire`.** §3.1: `classifyChange` would rate the
toggle `cosmetic`, and cosmetic re-publishes overwrite the live immutable snapshot in
place. Flipping a policy switch should not rewrite a published version.

**No background job, no cron, no scheduled rollover.** A captain presses a button once a
year. `dispatchDueBroadcasts` exists for deferred announcements if the camp wants the
announcement scheduled; the rollover itself is synchronous and finishes in one
transaction.

**No `dueAt` carried onto re-sent activations.** Last year's deadline is meaningless in
the new cycle, and a past-due gate is flagged as overdue on every surface. New
activations get `dueAt = null`; the captain sets one if they want one.

**No index on `questionnaire_activations.cycle`.** Double-digit table.

**No undo button in the minimum.** §4 proposes `revertCycle()` as the recommended
fourth day, guarded on "no responses in the new cycle yet". The minimum leans on the
plan-then-type-to-confirm flow plus the fact that nothing is destroyed.

**Not fixed here, but written down:** `team_budgets`' single-row-per-team PK (§6.9), the
missing joiner reconciler (§6.2 — this one is required companion work, not deferred),
`questionnaire_responses` missing from `sanitiseAccount` (§6.10), and the §7.1 metrics
derivation moving from `required_actions` to `questionnaire_responses` (§3.6).

---

## 9. Shape of the work

| Day | Work |
|---|---|
| 1 | Schema diff (§2), `db:generate` + migrate, `CycleEntry`/`resolveCycles`/`currentCycle`/`advanceCycles` + pure unit tests |
| 2 | `closeActivationTx` / `openActivationTx` extraction, `planRollover`, `advanceCycle`, PGlite integration tests |
| 3 | Cycle-aware `loadQuestionnaireResponse` / `upsert` / `completeBuilderResponse` + runner wiring, `carry_over` toggle in the builder's lifecycle controls, the plan/confirm/report page under `captains/camp-settings/cycle` |
| 4 (optional) | `revertCycle`, `reconcileOpenActivations` (§6.2 — promote into day 2 if day 4 is cut), the announcement checkbox |

Three days for the feature, four with the safety net. One person. Understandable in a
year because there is nothing to understand beyond "the year is a number in the config,
questionnaires say whether they carry over, and advancing the year re-sends the ones
that don't."
