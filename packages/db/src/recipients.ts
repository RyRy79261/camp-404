// Recipients: who a send reaches, and who it leaves out. Every send path asks
// here, so "who is in the camp" and "who said Not coming" are one rule each.
//
// A send is read for ONE year (the year a questionnaire send froze, or the
// camp's current one), and under a named Reach: which members count
// (approval) and what their answer to "Coming this year?" for that year does.
// The owner keeps two answers apart on purpose (2026-10-27): a group send or
// a private message reaches everyone but who said Not coming (Maybe and not
// answered included), and a tag in the camp's chats reaches only who said
// Coming (`isComingThisYear`).
//
// `splitAudience` is the pure half (no database), shared with the E2E test
// store; the reads below hand it the rows.

import {
  and,
  asc,
  eq,
  inArray,
  ne,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { isComingThisYear, telegramMention } from "@camp404/core";
import {
  PARTICIPATION_STATUSES,
  type ParticipationIntent,
  type ParticipationStatus,
} from "@camp404/types";
import type { DbOrTx } from "./audit";
import { createHttpDb } from "./index";
import * as schema from "./schema";
import type { broadcastScopeEnum } from "./schema";

/** What a member's answer for the send's year does to a send. */
export type YearRule =
  /** Everyone but who said Not coming (Maybe and not answered included). */
  | "not_said_not_coming"
  /** Only who said Coming, or was accepted (`isComingThisYear`). */
  | "said_coming"
  /** Whatever they said: they were picked by name. */
  | "any_answer";

/** Who counts as a member for a send, by their approval. */
export type ApprovalRule =
  /** In the camp: approved. */
  | "approved"
  /** Approved, or still waiting for a captain's approval. */
  | "approved_or_waiting"
  /** Any real member (the send already chose them some other way). */
  | "any";

/**
 * One named rule for who a kind of send reaches. A system actor or an erased
 * member is never reached under any of them.
 */
export interface Reach {
  approval: ApprovalRule;
  year: YearRule;
}

/**
 * A group send (an announcement, a questionnaire send, the opt-in note, a
 * team-leads event's invites, a fee reminder): approved members who did not
 * say Not coming.
 */
export const GROUP_SEND: Reach = {
  approval: "approved",
  year: "not_said_not_coming",
};

/**
 * A nudge to members who still owe a send (Remind, Ol' Jeb's "Post in
 * Telegram" list): the send's gates already chose them, so only who said Not
 * coming since is left out.
 */
export const OWED_NUDGE: Reach = {
  approval: "any",
  year: "not_said_not_coming",
};

/**
 * A tag in the camp's chats on a questionnaire reminder: of those who still
 * owe it, only who said Coming (owner, 2026-10-27).
 */
export const GROUP_TAG: Reach = { approval: "any", year: "said_coming" };

/**
 * The deadline reminder of a required action with no send
 * (`remindRequiredActionsDueSoon`): it still reaches members waiting for
 * approval (their gates are theirs), never one who was declined or said Not
 * coming.
 */
export const DEADLINE_REMINDER: Reach = {
  approval: "approved_or_waiting",
  year: "not_said_not_coming",
};

/**
 * Someone picked by name (an `individual` send, a people event, a new lead in
 * a post): whatever they said for the year.
 */
export const PICKED_BY_NAME: Reach = { approval: "any", year: "any_answer" };

/**
 * A camp member picked by name (the people an event is for): approved, and
 * whatever they said for the year.
 */
export const PICKED_CAMP_MEMBER: Reach = {
  approval: "approved",
  year: "any_answer",
};

/** Whether a member's stored answer for the year lets the send reach them. */
export function yearAllows(
  rule: YearRule,
  status: ParticipationStatus | null,
): boolean {
  switch (rule) {
    case "not_said_not_coming":
      return status !== "not_attending";
    case "said_coming":
      return isComingThisYear(status);
    case "any_answer":
      return true;
  }
}

/** The statuses `said_coming` reaches, from `isComingThisYear`. */
const COMING_STATUSES = PARTICIPATION_STATUSES.filter((s) =>
  isComingThisYear(s),
);

/**
 * The same rule as a WHERE on `schema.users` (joined in the caller's query),
 * for a send that selects its members in SQL: real members, the approval,
 * and the answer for `cycle` (not needed for {@link PICKED_BY_NAME}).
 */
export function reachWhere(reach: Reach, cycle?: number | SQL): SQL {
  const parts: SQL[] = [
    eq(schema.users.isSystem, false),
    eq(schema.users.sanitised, false),
  ];
  if (reach.approval === "approved") {
    parts.push(eq(schema.users.approvalStatus, "approved"));
  } else if (reach.approval === "approved_or_waiting") {
    parts.push(ne(schema.users.approvalStatus, "rejected"));
  }
  if (reach.year !== "any_answer") {
    if (cycle === undefined) throw new Error("This send needs its year.");
    parts.push(answerFor(schema.users.id, cycle, reach.year));
  }
  return and(...parts)!;
}

function answerFor(
  userId: AnyColumn,
  cycle: number | SQL,
  rule: "not_said_not_coming" | "said_coming",
): SQL {
  const p = schema.campParticipations;
  return rule === "not_said_not_coming"
    ? sql`not exists (
        select 1 from ${p}
        where ${p.userId} = ${userId}
          and ${p.cycle} = ${cycle}
          and ${p.status} = 'not_attending'
      )`
    : sql`exists (
        select 1 from ${p}
        where ${p.userId} = ${userId}
          and ${p.cycle} = ${cycle}
          and ${inArray(p.status, COMING_STATUSES)}
      )`;
}

/**
 * Who said Not coming for one year: the members a group send leaves out
 * (`notComingUserIds` of {@link splitAudience}). On the caller's handle, so a
 * send's transaction reads it on its own connection.
 */
export async function saidNotComing(
  db: DbOrTx,
  cycle: number,
): Promise<string[]> {
  const rows = await db
    .select({ userId: schema.campParticipations.userId })
    .from(schema.campParticipations)
    .where(
      and(
        eq(schema.campParticipations.cycle, cycle),
        eq(schema.campParticipations.status, "not_attending"),
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * A year the camp has just moved to: nobody has answered "Coming this year?"
 * for it, so a send there leaves nobody out. The rollover's re-gated sends
 * and its announcement read this; the next year has no number until then.
 */
export const NEW_YEAR_SAID_NOT_COMING: readonly string[] = [];

export type BroadcastScope = (typeof broadcastScopeEnum.enumValues)[number];

export interface AudienceData {
  /** Every camp user, with the flags needed to exclude non-real recipients. */
  members: Array<{
    id: string;
    isSystem: boolean;
    sanitised: boolean;
    /** Only `approved` members are in a group audience (see splitAudience). */
    approvalStatus: "pending" | "approved" | "rejected";
  }>;
  /** team_memberships rows. */
  memberships: Array<{ userId: string; team: string; isLead: boolean }>;
  /** User ids with driver_profiles.intends_to_drive = true (the derived driver). */
  driverUserIds: string[];
  /** broadcast_targets user ids (only used for scope = 'individual'). */
  targetUserIds: string[];
  /**
   * The riders of the sender's own car this year, read by the caller only
   * while the sender is driving (only used for scope = 'car'). Absent or
   * empty reaches nobody.
   */
  carRiderUserIds?: string[];
  /**
   * Members who said Not coming for the year the audience is read for
   * (`camp_participations.status = 'not_attending'`). Left out of every group
   * audience, captains included (owner, 2026-10-27); `individual` still
   * reaches them. Required, so no caller can forget the rule: read it with
   * {@link saidNotComing}, or {@link NEW_YEAR_SAID_NOT_COMING} for a year
   * nobody has answered yet.
   */
  notComingUserIds: readonly string[];
}

/** Who a send reaches, and who it leaves out because they said Not coming. */
export interface AudienceSplit {
  reaches: string[];
  /** In the group, but said Not coming this year. Empty for `individual`. */
  notComing: string[];
}

/**
 * Who a scoped send reaches, and who it leaves out because they said Not
 * coming this year (owner, 2026-10-27: "Not coming = no group sends"). Always
 * excludes system actors, sanitised accounts and the sender, and
 * de-duplicates. A team-scoped send with no `team` set reaches nobody.
 *
 * A group audience (everyone, a team, the team leads, the drivers, a car) is
 * approved members only (owner's call, 2026-09-16) under {@link GROUP_SEND}:
 * a pending or rejected applicant is not in the camp yet. `individual` is
 * {@link PICKED_BY_NAME}: a captain chose them, so any real member is reached
 * whatever they said. The send screens show the left-out count, and names to
 * team leads and up, who may read participation.
 */
export function splitAudience(
  broadcast: { scope: BroadcastScope; team: string | null },
  data: AudienceData,
  senderId: string | null,
): AudienceSplit {
  const real = new Set(
    data.members.filter((m) => !m.isSystem && !m.sanitised).map((m) => m.id),
  );
  const approved = new Set(
    data.members
      .filter((m) => real.has(m.id) && m.approvalStatus === "approved")
      .map((m) => m.id),
  );

  let ids: string[];
  switch (broadcast.scope) {
    case "everyone":
      ids = [...approved];
      break;
    case "team":
      ids = broadcast.team
        ? data.memberships
            .filter((m) => m.team === broadcast.team)
            .map((m) => m.userId)
        : [];
      break;
    case "team_leads":
      ids = data.memberships.filter((m) => m.isLead).map((m) => m.userId);
      break;
    case "drivers":
      ids = data.driverUserIds;
      break;
    case "individual":
      ids = data.targetUserIds;
      break;
    case "car":
      ids = data.carRiderUserIds ?? [];
      break;
    default: {
      // Exhaustiveness guard: a new BroadcastScope without a case here is a
      // compile error. Throwing (rather than falling back to []) means a scope
      // that somehow reaches this at runtime fails loudly instead of shipping a
      // send that silently reaches nobody.
      const _exhaustive: never = broadcast.scope;
      throw new Error(`Unhandled broadcast scope: ${String(_exhaustive)}`);
    }
  }

  const eligible = broadcast.scope === "individual" ? real : approved;
  const matched = [...new Set(ids)].filter(
    (id) => eligible.has(id) && id !== senderId,
  );
  if (broadcast.scope === "individual") {
    return { reaches: matched, notComing: [] };
  }
  const notComing = new Set(data.notComingUserIds);
  return {
    reaches: matched.filter((id) => !notComing.has(id)),
    notComing: matched.filter((id) => notComing.has(id)),
  };
}

/** A send by scope, as {@link sendAudience} reads it. */
export interface ScopedSend {
  scope: BroadcastScope;
  team: string | null;
  /** The people an `individual` send picked; ignored for any other scope. */
  targetUserIds?: readonly string[];
  /** The sender's car's riders, for a `car` send; ignored otherwise. */
  carRiderUserIds?: readonly string[];
}

/**
 * Who a scoped send reaches in `cycle`, and who it leaves out for saying Not
 * coming that year: that year's teams, leads and drivers, the real members,
 * and {@link splitAudience}'s rule. An announcement reads the camp's current
 * year; a questionnaire send the year it froze, and its Send preview the
 * year the send will freeze, so the preview and the send agree.
 */
export async function sendAudience(
  db: DbOrTx,
  send: ScopedSend,
  options: { cycle: number; senderId: string | null },
): Promise<AudienceSplit> {
  const { cycle } = options;
  const [members, memberships, drivers, notComing] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        isSystem: schema.users.isSystem,
        sanitised: schema.users.sanitised,
        approvalStatus: schema.users.approvalStatus,
      })
      .from(schema.users),
    send.scope === "team" || send.scope === "team_leads"
      ? db
          .select({
            userId: schema.teamMemberships.userId,
            team: schema.teamMemberships.team,
            isLead: schema.teamMemberships.isLead,
          })
          .from(schema.teamMemberships)
          .where(eq(schema.teamMemberships.cycle, cycle))
      : Promise.resolve([]),
    send.scope === "drivers"
      ? db
          .select({ userId: schema.driverProfiles.userId })
          .from(schema.driverProfiles)
          .where(
            and(
              eq(schema.driverProfiles.intendsToDrive, true),
              eq(schema.driverProfiles.cycle, cycle),
            ),
          )
      : Promise.resolve([] as { userId: string }[]),
    saidNotComing(db, cycle),
  ]);
  return splitAudience(
    send,
    {
      members,
      memberships,
      driverUserIds: drivers.map((d) => d.userId),
      targetUserIds: [...(send.targetUserIds ?? [])],
      carRiderUserIds: [...(send.carRiderUserIds ?? [])],
      notComingUserIds: notComing,
    },
    options.senderId,
  );
}

/** A member a questionnaire send still waits on, with what posts need. */
export interface OwingMember {
  userId: string;
  name: string;
  /** Their `@handle` (`telegramMention`), or null: they cannot be tagged. */
  mention: string | null;
  /** They connected Ol' Jeb, so they get a private message instead. */
  connected: boolean;
  /** What they said for the year, or null for no answer. */
  intent: ParticipationIntent | null;
  status: ParticipationStatus | null;
}

/**
 * The members a questionnaire send still waits on (its pending gates), split
 * by `reach` for `cycle`: who it reaches and who it leaves out. Never a
 * system actor or an erased member. Ordered by member id.
 */
export async function owingMembers(
  db: DbOrTx,
  send: { activationId: string; questionnaireKey: string },
  reach: Reach,
  cycle: number,
): Promise<{ reaches: OwingMember[]; leftOut: OwingMember[] }> {
  const rows = await db
    .selectDistinct({
      userId: schema.users.id,
      name: schema.users.displayName,
      handle: schema.users.telegramHandle,
      dmAt: schema.users.telegramDmAt,
      approvalStatus: schema.users.approvalStatus,
      intent: schema.campParticipations.intent,
      status: schema.campParticipations.status,
    })
    .from(schema.requiredActions)
    .innerJoin(schema.users, eq(schema.users.id, schema.requiredActions.userId))
    .leftJoin(
      schema.campParticipations,
      and(
        eq(schema.campParticipations.userId, schema.users.id),
        eq(schema.campParticipations.cycle, cycle),
      ),
    )
    .where(
      and(
        eq(schema.requiredActions.activationId, send.activationId),
        eq(schema.requiredActions.actionKey, send.questionnaireKey),
        eq(schema.requiredActions.status, "pending"),
        eq(schema.users.isSystem, false),
        eq(schema.users.sanitised, false),
      ),
    )
    .orderBy(asc(schema.users.id));
  const reaches: OwingMember[] = [];
  const leftOut: OwingMember[] = [];
  for (const r of rows) {
    const member: OwingMember = {
      userId: r.userId,
      name: r.name?.trim() || "Camp member",
      mention: telegramMention(r.handle),
      connected: r.dmAt !== null,
      intent: r.intent ?? null,
      status: r.status ?? null,
    };
    const approved =
      reach.approval === "any" ||
      r.approvalStatus === "approved" ||
      (reach.approval === "approved_or_waiting" &&
        r.approvalStatus !== "rejected");
    (approved && yearAllows(reach.year, member.status)
      ? reaches
      : leftOut
    ).push(member);
  }
  return { reaches, leftOut };
}

/** One member picked by name (a new lead in a post), or null when gone. */
export async function pickedMember(
  userId: string,
  db: DbOrTx = createHttpDb(),
): Promise<{ name: string; mention: string | null } | null> {
  const [row] = await db
    .select({
      name: schema.users.displayName,
      handle: schema.users.telegramHandle,
    })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), reachWhere(PICKED_BY_NAME)))
    .limit(1);
  if (!row) return null;
  return {
    name: row.name?.trim() || "Camp member",
    mention: telegramMention(row.handle),
  };
}

/** A member a send leaves out, by name, for a send screen. */
export interface LeftOutMember {
  id: string;
  name: string;
}

/** The display names of members a send leaves out, A to Z. */
export async function leftOutNames(
  db: DbOrTx,
  ids: readonly string[],
): Promise<LeftOutMember[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.displayName })
    .from(schema.users)
    .where(inArray(schema.users.id, [...ids]));
  return rows
    .map((r) => ({ id: r.id, name: r.name?.trim() || "Camp member" }))
    .sort(
      (a, b) => a.name.localeCompare(b.name, "en") || a.id.localeCompare(b.id),
    );
}
