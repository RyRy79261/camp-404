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

// --- Two things, shown apart (owner, 2026-09-28) ---------------------------
//
// A member's year is two separate facts, and no label mixes them:
// - what the MEMBER said (`intent`): Coming, Maybe, Not coming, or no answer;
// - what the CAPTAINS decided: Accepted (on the camp's list this year),
//   Waiting list (said they are coming, but the camp is full), or not decided.
// The stored `status` still holds both (applied / maybe / not_attending are
// the member's answer with no decision; accepted / waitlisted are a decision).
// The helpers below split it for every screen, with no migration.

/** What the member said, in plain words. */
export const INTENT_LABEL: Readonly<Record<ParticipationIntent, string>> = {
  yes: "Coming",
  maybe: "Maybe",
  no: "Not coming",
};

/** A member with no answer for the year. */
export const NO_ANSWER_LABEL = "No answer yet";

/** A captain's decision for the year. */
export type ParticipationDecision = "accepted" | "waitlisted";

export const DECISION_LABEL: Readonly<Record<ParticipationDecision, string>> = {
  accepted: "Accepted",
  waitlisted: "Waiting list",
};

/** A member the captains have not decided on (or who said No). */
export const NOT_DECIDED_LABEL = "Not decided yet";

/** The captains' decision a stored status holds, or null for none. */
export function participationDecision(
  status: ParticipationStatus | null,
): ParticipationDecision | null {
  return status !== null && HELD.has(status)
    ? (status as ParticipationDecision)
    : null;
}

/**
 * The one group each stored status puts a member in, for filters and counts.
 * Each label says which half it is about, so none reads as both: "Coming, not
 * decided" is the member's Yes with no decision yet; "Accepted" and "Waiting
 * list" are the captains' decision, whatever the member said.
 */
export const STANDING_LABEL: Readonly<Record<ParticipationStatus, string>> = {
  applied: "Coming, not decided",
  maybe: "Maybe, not decided",
  accepted: "Accepted",
  waitlisted: "Waiting list",
  not_attending: "Not coming",
};

/**
 * Whether a member is coming this year, as the camp asks them things: they
 * said Yes (`applied`) or a captain accepted them (`accepted`). Not one who
 * said Maybe or No, not one on the waiting list, and not one who has not
 * answered "Coming this year?" at all. The gear rental and the logistics
 * attendance ask exactly these members.
 */
export function isComingThisYear(status: ParticipationStatus | null): boolean {
  return status === "applied" || status === "accepted";
}
