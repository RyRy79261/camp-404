import type { ApprovalStatus, StoredRank, ViewerRank } from "@camp404/types";

// Pure access-control & clearance logic — the gating spine, framework-agnostic.
// No I/O, no env, no next/*. The app layer wraps these: `isGodEmail` (env) feeds
// the `isGod` boolean, the `ACTION_ROUTES` registry feeds `nextGate`, and the
// preview-but-locked UI wrapper builds on `hasClearance`.

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
export function hasClearance(viewer: ViewerRank, required: ViewerRank): boolean {
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
export function deriveViewerRank(rank: StoredRank, isLead: boolean): ViewerRank {
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

/** A pending required action the gate spine may route to. */
export interface PendingAction {
  actionKey: string;
  blocking: boolean;
}

/**
 * The route of the first pending, BLOCKING action that maps to a built gate
 * (oldest first), or null when nothing blocks / nothing maps. `routes` is the
 * app's action-key → route registry, passed in to keep this pure — so a pending
 * action with no mapped route never strands a user behind a gate with no page.
 */
export function nextGate(
  actions: readonly PendingAction[],
  routes: Record<string, string>,
): string | null {
  for (const action of actions) {
    if (!action.blocking) continue;
    const route = routes[action.actionKey];
    if (route) return route;
  }
  return null;
}
