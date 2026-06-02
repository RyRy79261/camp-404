import { z } from "zod";

import { StoredRank } from "./roles";

// A node in the family-tree referral graph (who invited whom). The edge is
// invite_codes.created_by_user_id; `inviteCode` is the human-readable slug the
// user redeemed (rendered as "via <slug>"). A null inviterId is a root — an
// account that pre-dates the invite system.
export const ReferralUser = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  rank: StoredRank,
  inviteCode: z.string().nullable(),
  inviterId: z.string().nullable(),
});
export type ReferralUser = z.infer<typeof ReferralUser>;

// Recursive tree built from a flat ReferralUser[] (see @camp404/core buildTree,
// Phase 3 — which carries the cycle guard). descendantCount counts ALL
// generations below the node, not just direct children.
export interface TreeNode {
  user: ReferralUser;
  children: TreeNode[];
  descendantCount: number;
}
