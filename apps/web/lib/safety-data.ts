import "server-only";

import { safetyReadBasis, type SafetyReadBasis } from "@camp404/core";
import type { EmergencyContact, ViewerRank } from "@camp404/types";
import { auditReadAfterResponse } from "./audit";
import { getEmergencyContacts } from "./users";

export type SafetyDataResult =
  | { allowed: false }
  | {
      allowed: true;
      basis: SafetyReadBasis;
      emergencyContacts: EmergencyContact[] | null;
    };

/**
 * A member's safety data for one viewer: the one read path for emergency
 * contacts. It authorises BEFORE it reads (safetyReadBasis: the member,
 * captains, any team lead), so a refused viewer never has the data in their
 * request at all. A non-self read that returns contacts writes a
 * `safety.emergency_contacts.view` audit row after the response.
 */
export async function resolveSafetyDataForViewer(
  viewer: { userId: string; rank: ViewerRank },
  memberId: string,
): Promise<SafetyDataResult> {
  const basis = safetyReadBasis({
    rank: viewer.rank,
    isSelf: viewer.userId === memberId,
  });
  if (!basis) return { allowed: false };

  const emergencyContacts = await getEmergencyContacts(memberId);
  if (basis !== "self" && emergencyContacts) {
    auditReadAfterResponse({
      actorId: viewer.userId,
      action: "safety.emergency_contacts.view",
      target: memberId,
      metadata: { basis },
    });
  }
  return { allowed: true, basis, emergencyContacts };
}
