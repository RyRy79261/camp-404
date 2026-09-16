import { and, asc, eq } from "drizzle-orm";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";
import { writeAuditEvent } from "./audit";
import { currentCycleNumber } from "./cycles";

// The production write path for `team_memberships` — the table that decides who
// is on which team and who leads it.
//
// Until this module existed the table had NO writer outside the test factory:
// every `team` / `team_leads` broadcast and questionnaire send resolved against
// an empty table, reached nobody, and reported success. Roster team badges,
// the safety-data `team_lead` branch and the derived `team_lead` clearance were
// all decoration hanging off rows nothing created.
//
// THE YEAR NAMESPACE. `team_memberships` is cycle-keyed: (user_id, team, cycle)
// is the primary key and EVERY production read filters on the camp's current
// year, because the camp owner ruled that team membership and team-lead roles
// go fresh each burn. The column carries `DEFAULT 1` — the pre-namespace
// sentinel, because a migration cannot know what year it is — so a write that
// omits `cycle` lands on the sentinel and is invisible to every year-scoped
// read: a row that exists and does nothing. Nothing here takes a cycle from its
// caller; every operation resolves `currentCycleNumber()` itself, so there is
// no argument a caller can forget or get wrong.
//
// Freshness is a READ rule, never a delete. `removeTeam` is scoped to the
// current year too, so last year's membership and lead flag stay on file and
// stay readable forever.

/** A `teamEnum` key. The database enum is the source of truth for the set. */
export type Team = (typeof schema.teamEnum.enumValues)[number];

/** One team a member belongs to in one year. */
export interface TeamMembership {
  team: Team;
  isLead: boolean;
  /** The burn year this membership belongs to. */
  cycle: number;
}

/** Whether `setLead` found a membership to modify. */
export type SetLeadResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: "not_a_member" };

export interface TeamWriteInput {
  userId: string;
  team: Team;
  /**
   * The captain performing the write, for `audit_log`. Optional only so a
   * system/CLI caller can write without inventing an actor; the app layer is
   * captain-gated and always passes one.
   */
  actorId?: string | null;
}

/**
 * A member's team memberships for the camp's CURRENT year, team-ordered.
 *
 * Deliberately year-scoped like every other production read: at a rollover this
 * returns an empty list for everyone until captains re-establish the teams,
 * which is the whole of what "teams go fresh" means. Prior years' rows are
 * untouched and still on file — they just are not the answer to this question.
 */
export async function getTeamMemberships(
  userId: string,
): Promise<TeamMembership[]> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber();
  return db
    .select({
      team: schema.teamMemberships.team,
      isLead: schema.teamMemberships.isLead,
      cycle: schema.teamMemberships.cycle,
    })
    .from(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.userId, userId),
        eq(schema.teamMemberships.cycle, cycle),
      ),
    )
    .orderBy(asc(schema.teamMemberships.team));
}

/**
 * Put a member on a team FOR THIS YEAR. Idempotent: assigning someone who is
 * already on the team is a no-op (`created: false`), never a duplicate-key
 * error — a captain double-clicking, or two captains acting on the same member,
 * must not surface a Postgres constraint as a failure.
 *
 * The membership is created NOT leading. `assignTeam` never touches an existing
 * row's `is_lead`, so it can never silently demote (or promote) a lead as a
 * side effect of a re-assignment; `setLead` is the only writer of that flag.
 *
 * One transaction so the membership and its audit row commit together.
 */
export async function assignTeam(
  input: TeamWriteInput,
): Promise<{ created: boolean; cycle: number }> {
  // Resolved BEFORE the transaction opens: currentCycleNumber() reads
  // camp_settings on its own handle, and issuing that from inside the pooled
  // transaction would be a second connection waiting on work the first one
  // holds.
  const cycle = await currentCycleNumber();
  return withTransaction(async (tx) => {
    const [row] = await tx
      .insert(schema.teamMemberships)
      .values({
        userId: input.userId,
        team: input.team,
        isLead: false,
        cycle,
      })
      .onConflictDoNothing({
        target: [
          schema.teamMemberships.userId,
          schema.teamMemberships.team,
          schema.teamMemberships.cycle,
        ],
      })
      .returning({ team: schema.teamMemberships.team });

    const created = row !== undefined;
    if (created) {
      await writeAuditEvent(tx, {
        actorId: input.actorId ?? null,
        action: "member.team_assigned",
        target: input.userId,
        metadata: { team: input.team, cycle },
      });
    }
    return { created, cycle };
  });
}

/**
 * Take a member off a team FOR THIS YEAR. Idempotent (`removed: false` when
 * they were not on it).
 *
 * DECISION — removing the last lead of a team is ALLOWED, and so is removing a
 * lead's membership outright. A team with no lead is a legitimate state, not a
 * corrupt one: the year namespace already guarantees that EVERY team is
 * leaderless the moment the camp rolls over, so "a team must always have a
 * lead" is an invariant the system violates by design once a year. Refusing
 * here would also strand a captain trying to remove someone who has left camp
 * behind a "promote a replacement first" step they may not be able to take. The
 * only consequence of a leaderless team is that a `team_leads` broadcast skips
 * it, which is accurate.
 *
 * Scoped to the current cycle, so last year's row — membership AND lead flag —
 * survives untouched. Nothing in the year namespace is ever destroyed.
 */
export async function removeTeam(
  input: TeamWriteInput,
): Promise<{ removed: boolean; cycle: number }> {
  const cycle = await currentCycleNumber();
  return withTransaction(async (tx) => {
    const [row] = await tx
      .delete(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.userId, input.userId),
          eq(schema.teamMemberships.team, input.team),
          eq(schema.teamMemberships.cycle, cycle),
        ),
      )
      .returning({ isLead: schema.teamMemberships.isLead });

    const removed = row !== undefined;
    if (removed) {
      await writeAuditEvent(tx, {
        actorId: input.actorId ?? null,
        action: "member.team_removed",
        target: input.userId,
        // `wasLead` is the bit that matters on review: removing a lead is a
        // clearance change, not just a roster edit.
        metadata: { team: input.team, cycle, wasLead: row.isLead },
      });
    }
    return { removed, cycle };
  });
}

/**
 * Set (or clear) a member's lead flag on a team FOR THIS YEAR.
 *
 * DECISION — `setLead` on someone who is not on the team is REFUSED
 * (`not_a_member`); it does NOT create the membership. Leading a team is a
 * modifier on a membership, not a membership of its own, and an auto-create
 * would let a wrong id mint a team membership — and, with it, `team_lead`
 * clearance — through a control whose label says nothing about joining. The
 * caller assigns first, then promotes; the UI does exactly that.
 *
 * Idempotent: setting the flag to the value it already has reports
 * `changed: false` and writes no audit row. The read and the write share one
 * transaction, so the "are they on the team" check cannot go stale between
 * them.
 */
export async function setLead(
  input: TeamWriteInput & { isLead: boolean },
): Promise<SetLeadResult> {
  const cycle = await currentCycleNumber();
  return withTransaction(async (tx) => {
    const [existing] = await tx
      .select({ isLead: schema.teamMemberships.isLead })
      .from(schema.teamMemberships)
      .where(
        and(
          eq(schema.teamMemberships.userId, input.userId),
          eq(schema.teamMemberships.team, input.team),
          eq(schema.teamMemberships.cycle, cycle),
        ),
      )
      .limit(1);

    if (!existing) return { ok: false as const, reason: "not_a_member" as const };
    if (existing.isLead === input.isLead) {
      return { ok: true as const, changed: false };
    }

    await tx
      .update(schema.teamMemberships)
      .set({ isLead: input.isLead })
      .where(
        and(
          eq(schema.teamMemberships.userId, input.userId),
          eq(schema.teamMemberships.team, input.team),
          eq(schema.teamMemberships.cycle, cycle),
        ),
      );
    await writeAuditEvent(tx, {
      actorId: input.actorId ?? null,
      action: "member.team_lead_set",
      target: input.userId,
      metadata: { team: input.team, cycle, isLead: input.isLead },
    });
    return { ok: true as const, changed: true };
  });
}
