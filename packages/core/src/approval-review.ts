import type { ApprovalStatus } from "@camp404/types";

// Which vetting decisions a captain may take on a member, and why one is
// refused. Owner's call (2026-09-16): a decision is not final. Approved can go
// to rejected and back, and either can be re-opened to pending, each with an
// optional reason and an audit row. The database write is a compare-and-set on
// the status the captain saw, so two captains cannot silently overwrite each
// other; this module says which moves exist at all.

/** What a captain can do from the decision panel. */
export type ReviewAction = "approve" | "reject" | "reopen";

/** The status each action moves the member to. */
export const REVIEW_TARGET: Record<ReviewAction, ApprovalStatus> = {
  approve: "approved",
  reject: "rejected",
  reopen: "pending",
};

const ACTIONS_FROM: Record<ApprovalStatus, readonly ReviewAction[]> = {
  pending: ["approve", "reject"],
  approved: ["reject", "reopen"],
  rejected: ["approve", "reopen"],
};

/** Whether moving a member from `from` to `to` is a decision that exists. */
export function isReviewTransition(
  from: ApprovalStatus,
  to: ApprovalStatus,
): boolean {
  return ACTIONS_FROM[from].some((action) => REVIEW_TARGET[action] === to);
}

/** The action that moves a member from `from` to `to`, or null when none does. */
export function reviewActionFor(
  from: ApprovalStatus,
  to: ApprovalStatus,
): ReviewAction | null {
  return (
    ACTIONS_FROM[from].find((action) => REVIEW_TARGET[action] === to) ?? null
  );
}

/** The member a decision is about, as the panel sees them. */
export interface ReviewSubject {
  status: ApprovalStatus;
  /** The deciding captain is looking at their own account. */
  isSelf: boolean;
  /** The member holds captain rank. */
  isCaptain: boolean;
}

export const REVIEW_REFUSAL = {
  self: "You can't decide on your own account.",
  // A captain who loses approval keeps captain rank, so they would still count
  // toward the sole-captain guard while unable to act. There is no demotion
  // path to pair this with, so removing a captain's access is refused.
  captain: "A captain can't be taken out of camp here.",
  stale: "That decision no longer applies to this member.",
} as const;

/**
 * Why `action` is refused for this member, as the sentence shown beside the
 * disabled control, or null when it is allowed.
 */
export function reviewRefusal(
  subject: ReviewSubject,
  action: ReviewAction,
): string | null {
  if (!ACTIONS_FROM[subject.status].includes(action)) {
    return REVIEW_REFUSAL.stale;
  }
  if (subject.isSelf) return REVIEW_REFUSAL.self;
  if (subject.isCaptain && subject.status === "approved") {
    return REVIEW_REFUSAL.captain;
  }
  return null;
}

/** One control on the decision panel. */
export interface ReviewOption {
  action: ReviewAction;
  /** Null when allowed; otherwise the sentence shown beside the control. */
  refusal: string | null;
}

/** Every decision that exists from the member's current status, in panel order. */
export function availableReviewActions(subject: ReviewSubject): ReviewOption[] {
  return ACTIONS_FROM[subject.status].map((action) => ({
    action,
    refusal: reviewRefusal(subject, action),
  }));
}
