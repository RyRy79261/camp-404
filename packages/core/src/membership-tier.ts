// How long a member stays at the burn (`users.membership_tier`, #129): the
// whole event, or build week only. It is not a fee tier: what a member pays
// is the dues program's own (fee tiers are set each year by the Finance team).
// Captain-read only (MEMBER_FIELD_READERS).

import type { MembershipTier } from "@camp404/types";

/** What each value is called on screen, in the captain's member panel. */
export const MEMBERSHIP_TIER_LABEL: Record<MembershipTier, string> = {
  full: "Whole event",
  build_week_only: "Build week only",
};

/** The label for a stored value; "Not set" when the member never said. */
export function membershipTierLabel(tier: MembershipTier | null): string {
  return tier === null ? "Not set" : MEMBERSHIP_TIER_LABEL[tier];
}
