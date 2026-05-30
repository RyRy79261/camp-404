// Audience resolution for broadcasts. Given a broadcast's scope and the
// relevant membership data, compute the set of recipient user ids. This half
// is PURE (no DB) so it is fully unit-testable; `broadcasts.ts` fetches the
// data and calls `computeAudience`. Mirrors `broadcastScopeEnum` in schema.ts.

export type BroadcastScope =
  | "everyone"
  | "team"
  | "team_leads"
  | "drivers"
  | "individual";

export interface AudienceData {
  /** Every camp user, with the flags needed to exclude non-real recipients. */
  members: Array<{ id: string; isSystem: boolean; sanitised: boolean }>;
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
 */
export function computeAudience(
  broadcast: { scope: BroadcastScope; team: string | null },
  data: AudienceData,
  senderId: string | null,
): string[] {
  const real = new Set(
    data.members.filter((m) => !m.isSystem && !m.sanitised).map((m) => m.id),
  );

  let ids: string[];
  switch (broadcast.scope) {
    case "everyone":
      ids = [...real];
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
    default:
      ids = [];
  }

  return [...new Set(ids)].filter((id) => real.has(id) && id !== senderId);
}
