// Who is coming this year. One answer per member per burn year, kept in
// camp_participations (@camp404/db), whose Postgres enum takes its values from
// PARTICIPATION_STATUSES, so the two lists cannot drift.
//
// The member answers Yes / Maybe / No (PARTICIPATION_INTENTS); a captain then
// accepts them or puts them on the waiting list. How an answer moves the
// status is participationAfterIntent in @camp404/core.

/**
 * Where a member stands for one year.
 *
 * - `applied`: the member said Yes (a captain reads it as "Coming").
 * - `maybe`: the member said Maybe.
 * - `accepted`: a captain gave them a place.
 * - `waitlisted`: a captain put them on the waiting list.
 * - `not_attending`: the member said No, or withdrew.
 */
export const PARTICIPATION_STATUSES = [
  "applied",
  "maybe",
  "accepted",
  "waitlisted",
  "not_attending",
] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

/** The member's own answer. Also the fixed option values of the question. */
export const PARTICIPATION_INTENTS = ["yes", "maybe", "no"] as const;
export type ParticipationIntent = (typeof PARTICIPATION_INTENTS)[number];
