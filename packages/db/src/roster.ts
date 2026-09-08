import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createHttpDb } from "./index";
import * as schema from "./schema";
import { currentCycleNumber } from "./cycles";

// Camp-management roster — the captain-only "who is on camp and where are
// they up to" view. One row per real (non-system) camp member, aggregating
// the facets a captain triages by: rank, derived team-lead, onboarding +
// outstanding required actions, driver intent, and home country.
//
// Deliberately a flat, additive shape: this is an explicitly "growing"
// surface, so new columns slot on here (and into the table that renders it)
// without reshaping callers.

export interface CampManagementMember {
  id: string;
  displayName: string | null;
  /** Display handle (reuses telegram_handle; null if unset). */
  handle: string | null;
  rank: "captain" | "member";
  /** Captain-approval lifecycle: pending vetting, approved, or rejected. */
  approvalStatus: "pending" | "approved" | "rejected";
  /** Derived: leads at least one team (`team_memberships.is_lead`). */
  isLead: boolean;
  /** Teams the member belongs to, for context. */
  teams: string[];
  duesPaid: boolean;
  membershipTier: "full" | "build_week_only" | null;
  /** Burner-profile onboarding questionnaire finished. */
  onboardingComplete: boolean;
  /** Outstanding blocking required_actions (0 = all caught up). */
  pendingRequiredActions: number;
  /** Derived driver facet: registered intent to drive. */
  intendsToDrive: boolean;
  /** Driver questionnaire finished (vehicle + proficiency captured). */
  driverProfileComplete: boolean;
  /** ISO alpha-2 country code from the burner profile (NULL if unanswered). */
  country: string | null;
  createdAt: Date;
}

/**
 * Every real camp member with the facets the captains' camp-management view
 * triages by. System actors (the AI / voice agent) are excluded. Ordered by
 * display name for a stable page.
 *
 * Captain-only data: callers MUST gate this behind a captain rank check —
 * the page renders a locked, data-free shell for everyone else.
 */
export async function getCampManagementRoster(): Promise<
  CampManagementMember[]
> {
  const db = createHttpDb();
  // Teams, team leads and driver profiles are year-scoped, so this asks for
  // THIS year's. At a rollover those three columns go blank across the roster
  // and fill back in as captains re-establish them — which is the camp owner's
  // ruling ("who's part of what team ... same with team lead roles"). Last
  // year's rows are untouched and still readable; only the question changed.
  const cycle = await currentCycleNumber();
  const rows = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      handle: schema.users.telegramHandle,
      rank: schema.users.rank,
      approvalStatus: schema.users.approvalStatus,
      duesPaid: schema.users.duesPaid,
      membershipTier: schema.users.membershipTier,
      onboardingCompletedAt: schema.burnerProfiles.completedAt,
      country: sql<
        string | null
      >`${schema.burnerProfiles.responses}->>'country'`,
      intendsToDrive: sql<boolean>`coalesce(${schema.driverProfiles.intendsToDrive}, false)`,
      driverCompletedAt: schema.driverProfiles.completedAt,
      isLead: sql<boolean>`exists (
        select 1 from team_memberships tm
        where tm.user_id = ${schema.users.id} and tm.is_lead = true
          and tm.cycle = ${cycle}
      )`,
      teams: sql<
        string[]
      >`coalesce((select array_agg(tm.team order by tm.team) from team_memberships tm where tm.user_id = ${schema.users.id} and tm.cycle = ${cycle}), '{}')`,
      pendingRequiredActions: sql<number>`(
        select count(*)::int from required_actions ra
        where ra.user_id = ${schema.users.id}
          and ra.status = 'pending' and ra.blocking = true
      )`,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .leftJoin(
      schema.burnerProfiles,
      eq(schema.burnerProfiles.userId, schema.users.id),
    )
    .leftJoin(
      // The cycle predicate belongs in the JOIN, not the WHERE: driver_profiles
      // now holds one row per driver PER YEAR, so joining on user_id alone
      // would multiply a member into one roster row per year they drove.
      schema.driverProfiles,
      and(
        eq(schema.driverProfiles.userId, schema.users.id),
        eq(schema.driverProfiles.cycle, cycle),
      ),
    )
    .where(
      and(eq(schema.users.isSystem, false), eq(schema.users.sanitised, false)),
    )
    .orderBy(asc(schema.users.displayName));

  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    handle: r.handle,
    rank: r.rank,
    approvalStatus: r.approvalStatus,
    isLead: r.isLead,
    teams: r.teams ?? [],
    duesPaid: r.duesPaid,
    membershipTier: r.membershipTier,
    onboardingComplete: r.onboardingCompletedAt != null,
    pendingRequiredActions: r.pendingRequiredActions ?? 0,
    intendsToDrive: r.intendsToDrive,
    driverProfileComplete: r.driverCompletedAt != null,
    country: r.country,
    createdAt: r.createdAt,
  }));
}

// Full per-member detail behind the camp-management roster modal. Captain-
// only: callers MUST gate this behind a captain rank check. Pulls the
// burner-profile answers and invite provenance a captain reviews before
// approving or rejecting a pending applicant.

export interface CampMemberDetail {
  id: string;
  displayName: string | null;
  rank: "captain" | "member";
  approvalStatus: "pending" | "approved" | "rejected";
  approvalDecidedAt: Date | null;
  /** Display name of the captain who approved/rejected (NULL if undecided). */
  approvalDecidedByName: string | null;
  onboardingComplete: boolean;
  onboardingVersion: string | null;
  /** Raw burner-profile answers, keyed by question id, for the profile tabs. */
  responses: Record<string, unknown>;
  /**
   * Encrypted government ID columns. Present ONLY when the caller passed
   * `includeIdDocuments: true` — absent from every member-facing read, so the
   * ciphertext never enters a non-captain render scope. Decrypt only behind
   * the captain gate.
   */
  passportEncrypted?: string | null;
  saIdEncrypted?: string | null;
  /** The code this member redeemed to join (NULL for god/founder accounts). */
  inviteCode: string | null;
  /** Free-text note the inviter left when minting the code. */
  inviteNote: string | null;
  /** Display name of whoever issued the invite (NULL for root codes). */
  invitedByName: string | null;
  createdAt: Date;
}

export interface CampMemberDetailOptions {
  /**
   * SELECT the encrypted government-ID columns. Defaults to FALSE. Only a
   * caller that is already captain-gated AND about to decrypt should opt in;
   * a member-facing read must never pull the ciphertext out of Postgres.
   */
  includeIdDocuments?: boolean;
}

export async function getCampMemberDetail(
  userId: string,
  options: CampMemberDetailOptions = {},
): Promise<CampMemberDetail | null> {
  const includeIdDocuments = options.includeIdDocuments === true;
  const db = createHttpDb();
  const decider = alias(schema.users, "decider");
  const inviter = alias(schema.users, "inviter");
  const rows = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      rank: schema.users.rank,
      approvalStatus: schema.users.approvalStatus,
      approvalDecidedAt: schema.users.approvalDecidedAt,
      approvalDecidedByName: decider.displayName,
      onboardingCompletedAt: schema.burnerProfiles.completedAt,
      onboardingVersion: schema.burnerProfiles.version,
      responses: schema.burnerProfiles.responses,
      ...(includeIdDocuments
        ? {
            passportEncrypted: schema.users.passportEncrypted,
            saIdEncrypted: schema.users.saIdEncrypted,
          }
        : {}),
      inviteCode: schema.users.inviteCode,
      inviteNote: schema.inviteCodes.note,
      invitedByName: inviter.displayName,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .leftJoin(decider, eq(decider.id, schema.users.approvalDecidedByUserId))
    .leftJoin(
      schema.burnerProfiles,
      eq(schema.burnerProfiles.userId, schema.users.id),
    )
    .leftJoin(
      schema.inviteCodes,
      eq(schema.inviteCodes.code, schema.users.inviteCode),
    )
    .leftJoin(inviter, eq(inviter.id, schema.inviteCodes.createdByUserId))
    .where(eq(schema.users.id, userId))
    .limit(1);

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    displayName: r.displayName,
    rank: r.rank,
    approvalStatus: r.approvalStatus,
    approvalDecidedAt: r.approvalDecidedAt,
    approvalDecidedByName: r.approvalDecidedByName,
    onboardingComplete: r.onboardingCompletedAt != null,
    onboardingVersion: r.onboardingVersion,
    responses: (r.responses as Record<string, unknown>) ?? {},
    ...(includeIdDocuments
      ? {
          passportEncrypted: r.passportEncrypted,
          saIdEncrypted: r.saIdEncrypted,
        }
      : {}),
    inviteCode: r.inviteCode,
    inviteNote: r.inviteNote,
    invitedByName: r.invitedByName,
    createdAt: r.createdAt,
  };
}

/**
 * Whether a user leads at least one team THIS YEAR — the derived `team_lead`
 * rank used to unlock the control panel's team-lead layer. Cheap existence
 * check.
 *
 * Year-scoped, so a lead stops being one the moment the camp rolls over and
 * becomes one again when a captain reappoints them: "team lead roles ... have
 * to be fresh". Last year's `is_lead` row is still on file; it just does not
 * answer this year's question.
 */
export async function isTeamLead(userId: string): Promise<boolean> {
  const db = createHttpDb();
  const cycle = await currentCycleNumber();
  const rows = await db
    .select({ team: schema.teamMemberships.team })
    .from(schema.teamMemberships)
    .where(
      and(
        eq(schema.teamMemberships.userId, userId),
        eq(schema.teamMemberships.isLead, true),
        eq(schema.teamMemberships.cycle, cycle),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
