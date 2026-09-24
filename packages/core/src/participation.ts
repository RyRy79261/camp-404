import type { ParticipationIntent, ParticipationStatus } from "@camp404/types";

// Who is coming this year: how a member's Yes / Maybe / No moves their status,
// and which moves a captain may make. The database write in
// @camp404/db/participations takes its answers from here.
//
// Owner's rulings behind the rules:
// - Yes and Maybe never lower a place a captain gave. A member who was accepted
//   or put on the waiting list and answers Yes (or Maybe) again keeps it.
// - No always wins. An accepted or waitlisted member who answers No is taken
//   off, and the caller writes that withdrawal to the audit log.
// - A captain decides only between Accepted and Waiting list, and only for a
//   member who said Yes or Maybe (or already holds one of the two). A member
//   who said No, or has not answered, has to answer Yes or Maybe first.

/** What a member's answer does: the status to write, or null for no change. */
export interface ParticipationChange {
  next: ParticipationStatus;
  /** True when the answer takes the member off a place a captain gave. */
  withdrew: boolean;
}

const HELD: ReadonlySet<ParticipationStatus> = new Set([
  "accepted",
  "waitlisted",
]);

/**
 * The status a member's answer moves them to, from where they stand now
 * (`null`: no answer yet this year). Null means nothing changes.
 */
export function participationAfterIntent(
  current: ParticipationStatus | null,
  intent: ParticipationIntent,
): ParticipationChange | null {
  const held = current !== null && HELD.has(current);
  switch (intent) {
    case "yes":
      if (held || current === "applied") return null;
      return { next: "applied", withdrew: false };
    case "maybe":
      if (held || current === "maybe") return null;
      return { next: "maybe", withdrew: false };
    case "no":
      if (current === "not_attending") return null;
      return { next: "not_attending", withdrew: held };
  }
}

/**
 * The answer a status stands for when no answer is on record: a captain's
 * Accept or Waiting list goes to a member who said Yes. Only fixtures and seeds
 * need it; the stored row keeps the member's real answer (`intent`).
 */
export const INTENT_IMPLIED_BY_STATUS: Readonly<
  Record<ParticipationStatus, ParticipationIntent>
> = {
  applied: "yes",
  accepted: "yes",
  waitlisted: "yes",
  maybe: "maybe",
  not_attending: "no",
};

const DECISIONS: Readonly<
  Partial<Record<ParticipationStatus, readonly ParticipationStatus[]>>
> = {
  accepted: ["applied", "maybe", "waitlisted"],
  waitlisted: ["applied", "maybe", "accepted"],
};

/** Whether a captain may move a member from `from` to `to`. */
export function isParticipationDecision(
  from: ParticipationStatus,
  to: ParticipationStatus,
): boolean {
  return DECISIONS[to]?.includes(from) ?? false;
}

/** The words a captain reads for each status. */
export const PARTICIPATION_LABEL: Readonly<
  Record<ParticipationStatus, string>
> = {
  applied: "Coming",
  maybe: "Maybe",
  accepted: "Accepted",
  waitlisted: "Waiting list",
  not_attending: "Not coming",
};

/** A member with no answer for the year. */
export const NOT_ANSWERED_LABEL = "Not answered";
