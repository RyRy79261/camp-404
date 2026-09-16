// Audience resolution for broadcasts. Given a broadcast's scope and the
// relevant membership data, compute the set of recipient user ids. This half
// is PURE (no DB) so it is fully unit-testable; `broadcasts.ts` fetches the
// data and calls `computeAudience`.

// Type-only, so this module stays runtime-pure — nothing from drizzle is
// emitted. Deriving the union (rather than restating it) means a new
// `broadcastScopeEnum` member is a compile error in the switch below, not a
// broadcast that silently resolves to nobody.
import type { broadcastScopeEnum } from "./schema";

export type BroadcastScope = (typeof broadcastScopeEnum.enumValues)[number];

export interface AudienceData {
  /** Every camp user, with the flags needed to exclude non-real recipients. */
  members: Array<{
    id: string;
    isSystem: boolean;
    sanitised: boolean;
    /** Only `approved` members are in a group audience (see computeAudience). */
    approvalStatus: "pending" | "approved" | "rejected";
  }>;
  /** team_memberships rows. */
  memberships: Array<{ userId: string; team: string; isLead: boolean }>;
  /** User ids with driver_profiles.intends_to_drive = true (the derived driver). */
  driverUserIds: string[];
  /** broadcast_targets user ids (only used for scope = 'individual'). */
  targetUserIds: string[];
}

/**
 * Recipient user ids for a broadcast. Always excludes system actors, sanitised
 * accounts, and the sender, and de-duplicates. A team-scoped broadcast with no
 * `team` set resolves to nobody (the caller must set the team).
 *
 * A group audience (everyone, a team, the team leads, the drivers) is approved
 * members only (owner's call, 2026-09-16). A pending or rejected applicant is
 * not in the camp yet: they must not get the full-screen announcement takeover,
 * nor be gated by a camp-wide questionnaire. `individual` is the exception: a
 * captain picked that person by name.
 */
export function computeAudience(
  broadcast: { scope: BroadcastScope; team: string | null },
  data: AudienceData,
  senderId: string | null,
): string[] {
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
  return [...new Set(ids)].filter((id) => eligible.has(id) && id !== senderId);
}
