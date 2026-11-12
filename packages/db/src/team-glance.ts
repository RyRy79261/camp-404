import { and, count, eq, gte, isNotNull, sql } from "drizzle-orm";
import { isComingThisYear, SAFETY_COUNTS_READER } from "@camp404/core";
import type { ParticipationStatus } from "@camp404/types";
import { lockAllowed } from "./actor";
import { currentCycleNumber } from "./cycles";
import { createHttpDb } from "./index";
import * as schema from "./schema";

// The counts behind three team pages' "at a glance" panels (owner,
// 2026-11-12; apps/web/lib/team-glance.ts). COUNTS ONLY: nothing here returns
// a member's id, name or any value of theirs, and the safety figures are
// worked out in SQL as yes/no per member, so no emergency contact, allergy or
// note ever leaves the database for these panels. A count opens nobody's data,
// so none of these reads writes an audit row (the names are behind the
// roster and the Camp sheet, which do).
//
// The people counted are the roster's: real members (never a system actor or
// an erased "Lost Cat" stub), approved.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One approved member's yes/no facts, as the safety counts read them. */
export interface SafetyCountRow {
  status: ParticipationStatus | null;
  hasEmergencyContact: boolean;
  burnerProfileDone: boolean;
  anaphylactic: boolean;
  allergiesNoted: boolean;
}

/** The Safety team's figures over the people coming this year. */
export interface SafetyCounts {
  /** Said Coming, or a captain accepted them. */
  coming: number;
  noEmergencyContact: number;
  burnerProfileDone: number;
  anaphylactic: number;
  /** Any allergy or food reaction noted (anaphylaxis included). */
  allergiesNoted: number;
}

/** The counts from rows already read (the test store shares this). */
export function safetyCounts(rows: readonly SafetyCountRow[]): SafetyCounts {
  const coming = rows.filter((r) => isComingThisYear(r.status));
  return {
    coming: coming.length,
    noEmergencyContact: coming.filter((r) => !r.hasEmergencyContact).length,
    burnerProfileDone: coming.filter((r) => r.burnerProfileDone).length,
    anaphylactic: coming.filter((r) => r.anaphylactic).length,
    allergiesNoted: coming.filter((r) => r.allergiesNoted).length,
  };
}

/**
 * The Safety team's counts, for a captain or a Safety lead (checked here, on
 * the database's own read of the viewer, not only in the page); null for
 * anyone else.
 */
export async function getSafetyCountsFor(
  viewerId: string,
): Promise<SafetyCounts | null> {
  if (!UUID.test(viewerId)) return null;
  const db = createHttpDb();
  if (!(await lockAllowed(db, viewerId, SAFETY_COUNTS_READER))) return null;
  const cycle = await currentCycleNumber(db);
  const u = schema.users;
  const d = schema.dietaryRequirements;
  const rows = await db
    .select({
      status: schema.campParticipations.status,
      hasEmergencyContact: sql<boolean>`coalesce(jsonb_array_length(${u.emergencyContacts}) > 0, false)`,
      burnerProfileDone: sql<boolean>`${schema.burnerProfiles.completedAt} is not null`,
      anaphylactic: sql<boolean>`coalesce(${d.isAnaphylactic}, false)
        or coalesce(${d.foodReactions} @> '[{"reaction":"anaphylaxis"}]'::jsonb, false)`,
      allergiesNoted: sql<boolean>`coalesce(${d.isAnaphylactic}, false)
        or coalesce(jsonb_array_length(${d.foodReactions}) > 0, false)
        or coalesce(btrim(${d.allergies}) <> '', false)`,
    })
    .from(u)
    .innerJoin(
      schema.campParticipations,
      and(
        eq(schema.campParticipations.userId, u.id),
        eq(schema.campParticipations.cycle, cycle),
      ),
    )
    .leftJoin(schema.burnerProfiles, eq(schema.burnerProfiles.userId, u.id))
    .leftJoin(d, eq(d.userId, u.id))
    .where(
      and(
        eq(u.isSystem, false),
        eq(u.sanitised, false),
        eq(u.approvalStatus, "approved"),
      ),
    );
  return safetyCounts(rows);
}

/** How many approved members connected Ol' Jeb, of how many. */
export interface TelegramReach {
  connected: number;
  members: number;
}

/**
 * How many approved members have a private chat with Ol' Jeb open. The caller
 * gates it (TELEGRAM_REACH_READER): `telegram_dm_at` reads at captain one
 * member at a time, and this is a count of it.
 */
export async function countTelegramReach(): Promise<TelegramReach> {
  const u = schema.users;
  const [row] = await createHttpDb()
    .select({
      members: count(),
      connected: sql<number>`count(*) filter (where ${u.telegramDmAt} is not null)::int`,
    })
    .from(u)
    .where(
      and(
        eq(u.isSystem, false),
        eq(u.sanitised, false),
        eq(u.approvalStatus, "approved"),
      ),
    );
  return { connected: row?.connected ?? 0, members: row?.members ?? 0 };
}

/** Announcements published from `since` on (any audience). */
export async function countAnnouncementsSince(since: Date): Promise<number> {
  const b = schema.broadcasts;
  const [row] = await createHttpDb()
    .select({ n: count() })
    .from(b)
    .where(
      and(
        eq(b.kind, "announcement"),
        isNotNull(b.publishedAt),
        gte(b.publishedAt, since),
      ),
    );
  return row?.n ?? 0;
}
