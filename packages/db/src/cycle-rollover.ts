import { and, eq, inArray, sql } from "drizzle-orm";
import { createHttpDb, createPooledDb, type Database } from "./index";
import * as schema from "./schema";
import { computeAudience, type BroadcastScope } from "./audience";
import {
  openActivationTx,
  PUSH_SCOPES,
  type ActivationFanOut,
  type PooledTx,
} from "./activations";
import { closeActivationTx } from "./questionnaire-lifecycle";
import {
  advanceCycles,
  currentCycle,
  foundingCycles,
  isCycleYear,
  MAX_CYCLE_YEAR,
  resolveCodeCarryOver,
  resolveCycles,
  UNSET_CYCLE,
  type CampConfig,
  type CycleEntry,
} from "./camp-config";

// The year rollover — the captain-facing half of the cycle feature. See
// docs/superpowers/specs/2026-09-08-year-namespace-design.md §8.
//
// A cycle IS a year: one number, which increments and namespaces the rows
// stamped with it. Nothing here has a name.
//
// Three functions, deliberately split:
//
//   planRollover()    — a PURE READ. Zero writes, safe on every page load. It
//                       is what the confirm screen renders, and it is re-read
//                       INSIDE advanceCycle's lock so the preview and the
//                       execution can never disagree.
//   setFoundingYear() — the one-time answer to "what year is it?". Migration
//                       0019 could only default `cycle` to a sentinel, because
//                       a migration cannot know the year; this is the captain
//                       telling it, and it rewrites those sentinel rows in the
//                       same transaction that records the year.
//   advanceCycle()    — one pooled transaction that closes the `fresh` sends,
//                       opens their next-year replacements, advances the config,
//                       and writes the audit receipt.
//
// Three rules govern every line here:
//
//   1. NOTHING IS DESTROYED. "Fresh" means the member answers again, never that
//      last year's answer is gone. Closed activations go to `closed`; expired
//      gates go to `expired`. There is no DELETE in this module, by design.
//   2. THE ACTIVATION'S FROZEN COPY WINS. The replacement is stamped with the
//      new cycle and `carry_over = false` at open time; nothing downstream
//      re-reads the live config.
//   3. CARRY-OVER NEVER WIDENS A GATE. Hence the `notSent` bucket: a `fresh`
//      questionnaire with no open send is left alone rather than sent. A gate
//      the captain deliberately closed stays closed.
//
// Team memberships, team leads and car seats are deliberately NOT touched by
// advanceCycle — not copied forward, not deleted. They carry their own `cycle`
// (schema.ts), and every read filters to the camp's current year, so the new
// year simply starts with no rows while last year's stay on file and readable.
// Freshness is a READ rule here; copying forward would defy the owner's ruling
// and deleting would defy rule 1. The one write is setFoundingYear() moving
// pre-namespace rows off the sentinel, which is the same adoption it already
// does for sends and answers.

/**
 * The RESERVED code questionnaires (schema.ts:666). They can never hold a
 * `questionnaire_definitions` row, so their policy lives in the config map
 * (`camp_settings.config.questionnaireCarryOver`) and the planner carries its
 * own titles — the plan is a captain-facing preview and a bare key is not a
 * sentence. `driver_profiles` is only a defensive alias of `driver_profile` in
 * RESERVED_DEFINITION_KEYS, so it is not listed twice here.
 */
const CODE_QUESTIONNAIRES: ReadonlyArray<{ key: string; title: string }> = [
  { key: "burner_profile", title: "Burner profile" },
  { key: "dietary_requirements", title: "Dietary requirements" },
  { key: "driver_profile", title: "Driver profile" },
];

/**
 * What the rollover does NOT alter. Rendered as prominently as the change list
 * on the confirm screen (§8.2) — that is where a captain's fear lives, and
 * every line is a decision recorded in §10, not reassurance.
 */
export const ROLLOVER_UNTOUCHED: readonly string[] = [
  "Approvals — nobody returns to the approval queue, and a rejected member stays rejected.",
  "Ranks — captains stay captains, members stay members.",
  "Teams and cars — last year's team lists, team leads and car seats are kept on file and stay readable forever. They start EMPTY for the new year: nobody is on a team, leads a team, or holds a seat until a captain sets it up again.",
  "Invites — invite codes and the family tree are untouched.",
  "Terms consent — consent is to a document, not to a year. Re-consent is a terms version bump.",
  "Answers — every previous year's answers stay readable. Nothing is deleted.",
  "Accounts — no account is created, sanitised, or removed.",
  "Closed sends — a send you already closed stays closed.",
];

/** One questionnaire in the plan, in whichever bucket it landed. */
export interface RolloverEntry {
  key: string;
  title: string;
  /** Its open activation, or null. At most one, by the one-open index. */
  activationId: string | null;
  /**
   * How many members the rollover will GATE for this questionnaire — non-zero
   * only in `reGate`, and computed with the same `computeAudience` that
   * `openActivation` uses, so the preview number IS the number that will be
   * gated. `carriesOver` and `notSent` are both no-ops, hence 0.
   */
  recipientCount: number;
  /**
   * False for the RESERVED code keys, which can never hold an activation (only
   * `sendActivation` inserts one and it requires a published definitions row).
   * A `fresh` code key therefore always lands in `notSent`, and the UI must not
   * tell the captain to "send it yourself" — they cannot.
   */
  sendable: boolean;
}

export interface RolloverPlan {
  /**
   * The year the camp is in now, or NULL when it has never said. Null is the
   * page's first screen: it asks the year rather than inventing one.
   */
  from: CycleEntry | null;
  /**
   * The obvious next year — the current one plus one — offered as the input's
   * starting value, NOT as the answer. A camp that skips a burn goes from 2026
   * straight to 2028, so the captain types the year; this only saves keystrokes.
   * Null when there is no current year, or when it is already MAX_CYCLE_YEAR.
   */
  suggestedYear: number | null;
  /** `fresh` with an open send: closed, then re-opened blank for the new year. */
  reGate: RolloverEntry[];
  /** `carry`: nothing happens. Answered members stay done, pending stay gated. */
  carriesOver: RolloverEntry[];
  /** `fresh` with NO open send: nothing happens. Send it yourself if you want it. */
  notSent: RolloverEntry[];
  /** Members holding a dues tick — the optional fourth checkbox (§8.2). */
  duesPaidCount: number;
  /** {@link ROLLOVER_UNTOUCHED}, carried on the plan so the page renders one object. */
  untouched: readonly string[];
}

/** The one-time founding write, as a receipt. */
export interface FoundingReport {
  /** The year the camp is now filing everything under. */
  year: number;
  /**
   * How many rows carried the pre-namespace sentinel and now carry the real
   * year. Reported rather than assumed: on a camp that has been running, these
   * are every send and every answer ever made.
   */
  activationsStamped: number;
  responsesStamped: number;
  /**
   * The year-scoped roster facts adopted in the same breath. Not tidiness:
   * reads of these three tables filter to the camp's year, so a row left on the
   * sentinel would DISAPPEAR from the roster the moment the year is named.
   */
  teamMembershipsStamped: number;
  driverProfilesStamped: number;
  carSeatsStamped: number;
  auditLogId: string;
}

export type SetFoundingYearResult =
  | { ok: true; report: FoundingReport }
  | { ok: false; reason: "already-founded" | "invalid-year" };

/** What actually happened to one re-gated questionnaire — the receipt row. */
export interface ReGateResult {
  key: string;
  title: string;
  /** The activation that was closed. Still readable; nothing is deleted. */
  closedActivationId: string;
  /** Its replacement — new cycle, `carryOver: false`, no due date. */
  newActivationId: string;
  /** Gates re-armed on the replacement. */
  gatesWritten: number;
}

export interface RolloverReport {
  /** The plan as re-read INSIDE the lock — i.e. the one that was executed. */
  plan: RolloverPlan;
  /** The cycle now open. */
  to: CycleEntry;
  reGated: ReGateResult[];
  /** User ids whose dues tick was cleared. Empty unless `resetDues`. */
  duesCleared: string[];
  announcementBroadcastId: string | null;
  /** The `audit_log` row this rollover wrote — the receipt's permanent id. */
  auditLogId: string;
}

export interface AdvanceCycleInput {
  /** The year being started. Also the number the captain types to confirm. */
  year: number;
  actorUserId: string | null;
  /** Clear `users.dues_paid` (the §8.2 checkbox). Ids are recorded in the audit row. */
  resetDues?: boolean;
  /** Optional camp-wide announcement, delivered as a full-screen acknowledge. */
  announcement?: { title: string; body: string } | null;
}

export type AdvanceCycleResult =
  | { ok: true; report: RolloverReport }
  | {
      ok: false;
      reason: "already-advanced" | "invalid-year" | "no-founding-year";
    };

// The planner's reads are plain SELECTs, so they run identically on the
// stateless HTTP handle (the page-load path) and on a transaction handle
// (advanceCycle re-reading inside its lock). Drizzle types the two separately
// because their result HKTs differ, so the reader is a union.
type PlanReader = Database | PooledTx;

/** One `team_memberships` row, as the audience builder needs it. */
interface MembershipRow {
  userId: string;
  team: (typeof schema.teamEnum.enumValues)[number];
  isLead: boolean;
  cycle: number;
}

/** The open activation's fields the re-gate has to clone, plus its audience. */
interface OpenActivation {
  id: string;
  questionnaireKey: string;
  version: string;
  title: string;
  description: string | null;
  scope: (typeof schema.questionnaireScopeEnum.enumValues)[number];
  team: (typeof schema.teamEnum.enumValues)[number] | null;
  blocking: boolean;
  /** From `computeAudience` — exactly the ids `openActivationTx` will gate. */
  recipientIds: string[];
}

interface PlanInternals {
  plan: RolloverPlan;
  /** Keyed by questionnaire key. Not exposed — the plan is a preview, not a row. */
  open: Map<string, OpenActivation>;
}

function byTitle(a: RolloverEntry, b: RolloverEntry): number {
  return a.title.localeCompare(b.title);
}

async function buildPlan(db: PlanReader): Promise<PlanInternals> {
  const [settings] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  const cycles = resolveCycles(settings?.config);
  const from = currentCycle(cycles);

  // Every published definition, LEFT JOINed to its open activation. The
  // one-open partial unique index guarantees at most one, so the join never
  // multiplies rows. A draft/unpublished definition is excluded: it cannot
  // have an open send (unpublishDefinition closes them on the way out).
  const rows = await db
    .select({
      key: schema.questionnaireDefinitions.key,
      title: schema.questionnaireDefinitions.title,
      carryOver: schema.questionnaireDefinitions.carryOver,
      activationId: schema.questionnaireActivations.id,
      activationKey: schema.questionnaireActivations.questionnaireKey,
      activationCycle: schema.questionnaireActivations.cycle,
      version: schema.questionnaireActivations.version,
      activationTitle: schema.questionnaireActivations.title,
      description: schema.questionnaireActivations.description,
      scope: schema.questionnaireActivations.scope,
      team: schema.questionnaireActivations.team,
      blocking: schema.questionnaireActivations.blocking,
    })
    .from(schema.questionnaireDefinitions)
    .leftJoin(
      schema.questionnaireActivations,
      and(
        eq(
          schema.questionnaireActivations.questionnaireKey,
          schema.questionnaireDefinitions.key,
        ),
        eq(schema.questionnaireActivations.status, "open"),
      ),
    )
    .where(eq(schema.questionnaireDefinitions.status, "published"));

  const openIds = rows
    .map((r) => r.activationId)
    .filter((id): id is string => id !== null);
  // The years those open sends were stamped with — normally just the current
  // one. Team membership is year-scoped, so each send's audience is read from
  // ITS OWN year (the frozen copy, rule 2), not from the year being opened.
  // That is also what keeps the rollover from widening or silently emptying a
  // gate: the members who owe this form today are exactly the ones re-armed on
  // the blank replacement, and the preview says so.
  const openCycles = [
    ...new Set(
      rows
        .filter((r) => r.activationId !== null)
        .map((r) => r.activationCycle!),
    ),
  ];

  // The audience inputs, fetched once and shared across every open activation
  // — the same three reads openActivation makes, so the preview number is the
  // number that will be gated.
  const [members, memberships, targets, dues] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
      })
      .from(schema.users),
    openCycles.length > 0
      ? db
          .select({
            userId: schema.teamMemberships.userId,
            team: schema.teamMemberships.team,
            isLead: schema.teamMemberships.isLead,
            cycle: schema.teamMemberships.cycle,
          })
          .from(schema.teamMemberships)
          .where(inArray(schema.teamMemberships.cycle, openCycles))
      : Promise.resolve([] as MembershipRow[]),
    openIds.length > 0
      ? db
          .select({
            activationId: schema.questionnaireActivationTargets.activationId,
            userId: schema.questionnaireActivationTargets.userId,
          })
          .from(schema.questionnaireActivationTargets)
          .where(
            inArray(
              schema.questionnaireActivationTargets.activationId,
              openIds,
            ),
          )
      : Promise.resolve([] as { activationId: string; userId: string }[]),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.users)
      .where(
        and(
          eq(schema.users.isSystem, false),
          eq(schema.users.duesPaid, true),
        ),
      ),
  ]);

  const membershipsByCycle = new Map<number, MembershipRow[]>();
  for (const m of memberships) {
    const list = membershipsByCycle.get(m.cycle);
    if (list) list.push(m);
    else membershipsByCycle.set(m.cycle, [m]);
  }

  const targetsByActivation = new Map<string, string[]>();
  for (const t of targets) {
    const list = targetsByActivation.get(t.activationId);
    if (list) list.push(t.userId);
    else targetsByActivation.set(t.activationId, [t.userId]);
  }

  const open = new Map<string, OpenActivation>();
  const reGate: RolloverEntry[] = [];
  const carriesOver: RolloverEntry[] = [];
  const notSent: RolloverEntry[] = [];

  for (const row of rows) {
    // The policy comes off the DEFINITION here, not off the activation: the
    // plan answers "what should happen at the next rollover", and the frozen
    // activation copy answers "what did the send in flight agree to". Only the
    // fresh activation this rollover opens gets its own frozen copy.
    if (row.carryOver) {
      carriesOver.push({
        key: row.key,
        title: row.title,
        activationId: row.activationId,
        recipientCount: 0,
        sendable: true,
      });
      continue;
    }
    if (!row.activationId) {
      // The most important refusal in the design: a `fresh` questionnaire with
      // no open send is NOT sent. The rollover must never widen what blocks a
      // member beyond what blocked them yesterday.
      notSent.push({
        key: row.key,
        title: row.title,
        activationId: null,
        recipientCount: 0,
        sendable: true,
      });
      continue;
    }

    const recipientIds = PUSH_SCOPES.has(row.scope!)
      ? computeAudience(
          { scope: row.scope as BroadcastScope, team: row.team },
          {
            members,
            memberships: membershipsByCycle.get(row.activationCycle!) ?? [],
            driverUserIds: [],
            targetUserIds: targetsByActivation.get(row.activationId) ?? [],
          },
          null,
        )
      : [];
    open.set(row.key, {
      id: row.activationId,
      questionnaireKey: row.activationKey!,
      version: row.version!,
      title: row.activationTitle!,
      description: row.description,
      scope: row.scope!,
      team: row.team,
      blocking: row.blocking!,
      recipientIds,
    });
    reGate.push({
      key: row.key,
      title: row.title,
      activationId: row.activationId,
      recipientCount: recipientIds.length,
      sendable: true,
    });
  }

  // The code keys ride the config map. They can never hold an activation, so
  // they only ever land in `carriesOver` (nothing happens) or `notSent` (the
  // captain has said "ask again", and the rollover honestly reports it cannot).
  for (const code of CODE_QUESTIONNAIRES) {
    const entry: RolloverEntry = {
      key: code.key,
      title: code.title,
      activationId: null,
      recipientCount: 0,
      sendable: false,
    };
    if (resolveCodeCarryOver(settings?.config, code.key) === "carry") {
      carriesOver.push(entry);
    } else {
      notSent.push(entry);
    }
  }

  return {
    plan: {
      from,
      // Offered, not decided — see RolloverPlan.suggestedYear.
      suggestedYear:
        from && from.year < MAX_CYCLE_YEAR ? from.year + 1 : null,
      reGate: reGate.sort(byTitle),
      carriesOver: carriesOver.sort(byTitle),
      notSent: notSent.sort(byTitle),
      duesPaidCount: dues[0]?.count ?? 0,
      untouched: ROLLOVER_UNTOUCHED,
    },
    open,
  };
}

/**
 * What advancing the cycle would do. A pure read — zero writes, safe to call on
 * every page load — and the exact shape the confirm screen renders (§8.1/§8.2).
 *
 * The four buckets:
 *
 * | policy | open send? | bucket        | what happens                       |
 * |--------|-----------|---------------|------------------------------------|
 * | carry  | yes       | `carriesOver` | nothing                            |
 * | carry  | no        | `carriesOver` | nothing                            |
 * | fresh  | yes       | `reGate`      | closed, re-opened blank for the new cycle |
 * | fresh  | no        | `notSent`     | nothing — send it yourself if you want it |
 *
 * `plan.from` is null on a camp that has never named a year. That is not an
 * error: it is the cycle page's first screen, which asks.
 */
export async function planRollover(): Promise<RolloverPlan> {
  const { plan } = await buildPlan(createHttpDb());
  return plan;
}

/**
 * Name the camp's founding year — the one-time write that turns the year
 * namespace on.
 *
 * Migrations 0019 and 0020 defaulted `cycle` to UNSET_CYCLE on every
 * pre-existing row because a migration cannot know what year it is. This is the
 * captain saying so, and it does BOTH halves in one transaction: it records the
 * founding CycleEntry and it rewrites every sentinel-stamped row — activations,
 * responses, team memberships, driver profiles and the car seats that hang off
 * them — to the real year. Deliberately a captain-triggered data write and not
 * a DDL migration: the year is an answer, not a schema fact.
 *
 * It cannot run twice: the `already-founded` guard reads the cycle list under
 * the same `SELECT … FOR UPDATE` lock every other config write takes, so a
 * second press (or a second captain) changes nothing. Nothing is destroyed
 * either way — the rewrite is a bijection on one cycle value, so the
 * `(user, definition, cycle)` uniqueness it moves under still holds.
 */
export async function setFoundingYear(input: {
  year: number;
  actorUserId: string | null;
}): Promise<SetFoundingYearResult> {
  if (!isCycleYear(input.year)) {
    return { ok: false, reason: "invalid-year" };
  }

  const now = new Date();
  const { db, pool } = createPooledDb();
  try {
    return await db.transaction(async (tx) => {
      await tx
        .insert(schema.campSettings)
        .values({ id: true })
        .onConflictDoNothing({ target: schema.campSettings.id });
      const [locked] = await tx
        .select({ config: schema.campSettings.config })
        .from(schema.campSettings)
        .where(eq(schema.campSettings.id, true))
        .for("update");

      const stored =
        locked?.config && typeof locked.config === "object"
          ? (locked.config as CampConfig)
          : ({} as CampConfig);
      if (resolveCycles(stored).length > 0) {
        return { ok: false as const, reason: "already-founded" as const };
      }

      // SPREAD the stored object: `cycles` is one key in a shared JSONB column
      // and rebuilding it would silently discard the team config beside it.
      await tx
        .update(schema.campSettings)
        .set({
          config: { ...stored, cycles: foundingCycles(input.year, now) },
          updatedAt: now,
        })
        .where(eq(schema.campSettings.id, true));

      // Adopt everything sent or answered before the camp had a year. RETURNING
      // counts in the same statement that writes, so the receipt can never
      // drift from what actually moved.
      const activations = await tx
        .update(schema.questionnaireActivations)
        .set({ cycle: input.year })
        .where(eq(schema.questionnaireActivations.cycle, UNSET_CYCLE))
        .returning({ id: schema.questionnaireActivations.id });
      const responses = await tx
        .update(schema.questionnaireResponses)
        .set({ cycle: input.year })
        .where(eq(schema.questionnaireResponses.cycle, UNSET_CYCLE))
        .returning({ id: schema.questionnaireResponses.id });

      // The same adoption for the three year-scoped roster tables. `driver_
      // profiles` FIRST and the seats ride its ON UPDATE CASCADE: car_members'
      // composite FK points at (user_id, cycle), so a car and its seats cannot
      // move apart. Which is also why the seats are COUNTED before the update
      // rather than returned by one.
      const [seats] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.carMembers)
        .where(eq(schema.carMembers.cycle, UNSET_CYCLE));
      const drivers = await tx
        .update(schema.driverProfiles)
        .set({ cycle: input.year })
        .where(eq(schema.driverProfiles.cycle, UNSET_CYCLE))
        .returning({ userId: schema.driverProfiles.userId });
      const teams = await tx
        .update(schema.teamMemberships)
        .set({ cycle: input.year })
        .where(eq(schema.teamMemberships.cycle, UNSET_CYCLE))
        .returning({ userId: schema.teamMemberships.userId });

      const [audit] = await tx
        .insert(schema.auditLog)
        .values({
          actorId: input.actorUserId,
          action: "camp.cycle.founded",
          target: String(input.year),
          metadata: {
            year: input.year,
            activationsStamped: activations.length,
            responsesStamped: responses.length,
            teamMembershipsStamped: teams.length,
            driverProfilesStamped: drivers.length,
            carSeatsStamped: seats?.count ?? 0,
          },
        })
        .returning({ id: schema.auditLog.id });

      return {
        ok: true as const,
        report: {
          year: input.year,
          activationsStamped: activations.length,
          responsesStamped: responses.length,
          teamMembershipsStamped: teams.length,
          driverProfilesStamped: drivers.length,
          carSeatsStamped: seats?.count ?? 0,
          auditLogId: audit!.id,
        },
      };
    });
  } finally {
    await pool.end();
  }
}

/**
 * Advance the camp to the next cycle, in ONE pooled transaction (§8.3).
 *
 * Concurrency: every attempt serialises behind a `SELECT … FOR UPDATE` on the
 * `camp_settings` singleton — the identical lock `mutateTeamsConfig` and
 * `bootstrapFirstCaptain` take. The loser sees the year already present in the
 * cycle list and returns `already-advanced`. The YEAR is the idempotency key
 * precisely because the confirm screen makes the captain type it, so two
 * captains pressing at once type the same number.
 *
 * A year only ever goes forwards, so a year that is not later than the current
 * one is refused as `invalid-year` rather than silently reordering the list.
 * A camp with no founding year is sent back to the page's first screen.
 *
 * Nothing is deleted. Closed sends stay closed, prior years' answers stay
 * readable, and the cleared dues ids are enumerated in the audit row so even
 * the one destructive-looking option is recoverable by hand.
 */
export async function advanceCycle(
  input: AdvanceCycleInput,
): Promise<AdvanceCycleResult> {
  if (!isCycleYear(input.year)) return { ok: false, reason: "invalid-year" };

  const now = new Date();
  const { db, pool } = createPooledDb();
  try {
    return await db.transaction(async (tx) => {
      // 1. Ensure the singleton exists, then lock it for the whole rollover.
      await tx
        .insert(schema.campSettings)
        .values({ id: true })
        .onConflictDoNothing({ target: schema.campSettings.id });
      const [locked] = await tx
        .select({ config: schema.campSettings.config })
        .from(schema.campSettings)
        .where(eq(schema.campSettings.id, true))
        .for("update");

      const stored =
        locked?.config && typeof locked.config === "object"
          ? (locked.config as CampConfig)
          : ({} as CampConfig);
      const cycles = resolveCycles(stored);
      const from = currentCycle(cycles);
      if (!from) {
        // The camp never said what year it is, so there is no "next" one. The
        // page's first screen (setFoundingYear) is where this goes.
        return { ok: false as const, reason: "no-founding-year" as const };
      }
      if (cycles.some((c) => c.year === input.year)) {
        return { ok: false as const, reason: "already-advanced" as const };
      }
      if (input.year <= from.year) {
        return { ok: false as const, reason: "invalid-year" as const };
      }

      // 2. Re-read the plan INSIDE the lock, so a send that raced in just
      //    before this commit is caught — the pattern unpublishDefinition
      //    already uses.
      const { plan, open } = await buildPlan(tx);

      // 3. Advance the cycle list. SPREAD the stored object: `cycles` is one
      //    key in a shared JSONB column and rebuilding it from scratch would
      //    silently discard the team config beside it.
      const nextCycles = advanceCycles(cycles, input.year, now);
      // Non-null by construction: advanceCycles appends exactly one open entry.
      const to = currentCycle(nextCycles)!;
      await tx
        .update(schema.campSettings)
        .set({ config: { ...stored, cycles: nextCycles }, updatedAt: now })
        .where(eq(schema.campSettings.id, true));

      // 4. Re-gate every `fresh` questionnaire with an open send. Note what is
      //    absent: nothing here reads or writes team_memberships, car_members
      //    or driver_profiles. The new year starts with no rows in them by
      //    construction, which is what makes teams, team leads and car seats
      //    fresh without a single delete.
      const reGated: ReGateResult[] = [];
      for (const entry of plan.reGate) {
        const old = open.get(entry.key);
        if (!old) continue;

        // Close first: status → closed, still-pending gates → expired (a
        // terminal, non-gating state — NOT deleted). This also clears the
        // one-open partial unique index for the replacement below.
        const closed = await closeActivationTx(tx, old.id);
        if (!closed.ok) {
          // Unreachable — we read the row in this same transaction — but a
          // half-applied rollover is worse than a rolled-back one.
          throw new Error(
            `Couldn't close the open send for "${entry.key}": ${closed.error}`,
          );
        }

        const [created] = await tx
          .insert(schema.questionnaireActivations)
          .values({
            questionnaireKey: old.questionnaireKey,
            version: old.version,
            title: old.title,
            description: old.description,
            scope: old.scope,
            team: old.team,
            blocking: old.blocking,
            // dueAt is deliberately NOT carried: last year's deadline would
            // flag every re-gated questionnaire as overdue the moment it opens.
            dueAt: null,
            activatedByUserId: input.actorUserId,
            status: "draft",
            cycle: to.year,
            // `fresh` is the only reason this row exists, so its frozen copy
            // must say so — a `carryOver: true` replacement would subtract the
            // members who answered last year, which is exactly what fresh
            // refuses to do.
            carryOver: false,
          })
          .returning({ id: schema.questionnaireActivations.id });
        const newId = created!.id;

        // Individual sends carry their recipients in a side table; copy them
        // so the replacement's audience is byte-for-byte the planned one.
        if (old.scope === "individual" && old.recipientIds.length > 0) {
          await tx.insert(schema.questionnaireActivationTargets).values(
            old.recipientIds.map((userId) => ({
              activationId: newId,
              userId,
            })),
          );
        }

        const fanOut: ActivationFanOut = {
          id: newId,
          questionnaireKey: old.questionnaireKey,
          version: old.version,
          title: old.title,
          blocking: old.blocking,
          dueAt: null,
          carryOver: false,
        };
        reGated.push({
          key: entry.key,
          title: entry.title,
          closedActivationId: old.id,
          newActivationId: newId,
          gatesWritten: await openActivationTx(tx, fanOut, old.recipientIds),
        });
      }

      // 5. Optionally clear the dues ticks. RETURNING captures the ids in the
      //    same statement that clears them, so the audit list can never drift
      //    from what was actually cleared.
      let duesCleared: string[] = [];
      if (input.resetDues) {
        const cleared = await tx
          .update(schema.users)
          .set({ duesPaid: false, duesPaidAt: null })
          .where(
            and(
              eq(schema.users.isSystem, false),
              eq(schema.users.duesPaid, true),
            ),
          )
          .returning({ id: schema.users.id });
        duesCleared = cleared.map((u) => u.id);
      }

      // 6. Optional camp-wide announcement, as the existing full-screen
      //    acknowledge takeover. Published + dispatched inline (like
      //    publishAnnouncement) rather than left for the dispatch cron, so the
      //    rollover is one atomic act.
      let announcementBroadcastId: string | null = null;
      if (input.announcement) {
        const [broadcast] = await tx
          .insert(schema.broadcasts)
          .values({
            senderId: input.actorUserId,
            kind: "announcement",
            scope: "everyone",
            title: input.announcement.title,
            body: input.announcement.body,
            presentation: "acknowledge",
            publishedAt: now,
            dispatchedAt: now,
          })
          .returning({
            id: schema.broadcasts.id,
            channel: schema.broadcasts.channel,
          });
        announcementBroadcastId = broadcast!.id;
        const recipients = await tx
          .select({
            id: schema.users.id,
            isSystem: schema.users.isSystem,
            sanitised: schema.users.sanitised,
          })
          .from(schema.users);
        const audience = computeAudience(
          { scope: "everyone", team: null },
          {
            members: recipients,
            memberships: [],
            driverUserIds: [],
            targetUserIds: [],
          },
          input.actorUserId,
        );
        if (audience.length > 0) {
          await tx.insert(schema.notificationDeliveries).values(
            audience.map((userId) => ({
              broadcastId: broadcast!.id,
              userId,
              title: input.announcement!.title,
              body: input.announcement!.body,
              channel: broadcast!.channel,
              presentation: "acknowledge" as const,
              refType: "announcement",
              refId: broadcast!.id,
            })),
          );
        }
      }

      // 7. The receipt. `audit_log` has no other writer in the repo — this is
      //    a cold path — and the metadata is deliberately the WHOLE plan plus
      //    what was executed, because §8.5's guarantee is not reversibility but
      //    that every change is enumerated and nothing was destroyed.
      const metadata: Record<string, unknown> = {
        from: plan.from,
        to,
        reGate: plan.reGate,
        carriesOver: plan.carriesOver,
        notSent: plan.notSent,
        reGated,
        duesCleared,
        announcementBroadcastId,
      };
      const [audit] = await tx
        .insert(schema.auditLog)
        .values({
          actorId: input.actorUserId,
          action: "camp.cycle.advanced",
          target: String(to.year),
          metadata,
        })
        .returning({ id: schema.auditLog.id });

      return {
        ok: true as const,
        report: {
          plan,
          to,
          reGated,
          duesCleared,
          announcementBroadcastId,
          auditLogId: audit!.id,
        },
      };
    });
  } finally {
    await pool.end();
  }
}
