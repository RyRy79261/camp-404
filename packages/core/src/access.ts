import type { ApprovalStatus, StoredRank, ViewerRank } from "@camp404/types";

// Pure access-control & clearance logic — the gating spine, framework-agnostic.
// No I/O, no env, no next/*. The app layer wraps these: `isGodEmail` (env) feeds
// the `isGod` boolean, and the preview-but-locked UI wrapper builds on
// `hasClearance`. The required-action router (`nextGate`) lives in the app,
// next to its route registry (apps/web/lib/required-actions.ts).

/** The viewer clearance ladder, low → high. Index = clearance level. */
export const RANK_ORDER: readonly ViewerRank[] = [
  "camp_member",
  "team_lead",
  "captain",
];

/** Clearance level of a viewer rank (higher = more access). */
export function rankLevel(rank: ViewerRank): number {
  return RANK_ORDER.indexOf(rank);
}

/**
 * Whether `viewer` clears the bar for a surface/layer requiring `required`.
 * The basis of preview-but-locked: `false` ⇒ the app renders the surface's
 * structure locked with NO data; `true` ⇒ full access.
 */
export function hasClearance(
  viewer: ViewerRank,
  required: ViewerRank,
): boolean {
  return rankLevel(viewer) >= rankLevel(required);
}

/** The decision a preview-but-locked surface makes: cleared + the ranks it
 *  compared, so the page can gate its data fetch and feed a CaptainLock. */
export interface ClearanceResult {
  cleared: boolean;
  viewerRank: ViewerRank;
  requiredRank: ViewerRank;
}

/**
 * The single preview-but-locked decision (D3), uniform across every captain
 * surface so they withhold data identically instead of via bespoke gates:
 * `cleared = viewer ≥ required`. The returned shape is what a page passes to
 * its data-fetch guard and to `CaptainLock`.
 */
export function requireClearance(
  viewerRank: ViewerRank,
  requiredRank: ViewerRank,
): ClearanceResult {
  return {
    cleared: hasClearance(viewerRank, requiredRank),
    viewerRank,
    requiredRank,
  };
}

/** Derive the viewer clearance rank from the stored rank + derived team-lead. */
export function deriveViewerRank(
  rank: StoredRank,
  isLead: boolean,
): ViewerRank {
  if (rank === "captain") return "captain";
  return isLead ? "team_lead" : "camp_member";
}

/**
 * Camp-access gate: a god email or any redeemed invite code grants access.
 * `isGod` is supplied by the app (env-backed `isGodEmail`) to keep this pure.
 */
export function hasCampAccess(
  user: { inviteCode: string | null },
  isGod: boolean,
): boolean {
  return isGod || !!user.inviteCode;
}

/**
 * Approval gate: god emails are always approved; everyone else must be
 * explicitly `approved` (pending/rejected are blocked).
 */
export function isApproved(
  user: { approvalStatus: ApprovalStatus },
  isGod: boolean,
): boolean {
  return isGod || user.approvalStatus === "approved";
}

/**
 * Whether a viewer may see a builder questionnaire: list it, preview it, or
 * copy it. Every camp member sees every one, drafts included (owner,
 * 2026-10-23: "questionnaires, their states, and their draft states should be
 * essentially viewable by everyone in the camp"). Changing one is still its
 * author's or a captain's.
 */
export function canViewBuilderDefinition(
  viewer: { rank: ViewerRank; userId: string },
  _definition: {
    status: "draft" | "published" | "unpublished";
    createdBy: string | null;
  },
): boolean {
  return hasClearance(viewer.rank, "camp_member");
}
