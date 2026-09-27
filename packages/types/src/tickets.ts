// Tickets and early entry, per member per burn year. Kept in camp_tickets
// (@camp404/db), whose Postgres enums take their values from these lists, so
// the two cannot drift. The words a person reads are in @camp404/core
// (tickets.ts).
//
// Only what the captains plan with is stored: no ticket numbers, barcodes,
// order references or payment details.

/**
 * Where the member's own Burn ticket stands. The member sets it; captains read
 * it.
 *
 * - `unknown`: not sorted yet (and the value before anyone says).
 * - `buying_own`: they will buy their own in the ticket sale.
 * - `has_ticket`: they have one.
 * - `needs_directed_ticket`: they need one of the camp's directed tickets.
 */
export const TICKET_STATUSES = [
  "unknown",
  "buying_own",
  "has_ticket",
  "needs_directed_ticket",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * The camp's directed ticket for this member. Captains only.
 *
 * - `none`: no directed ticket.
 * - `allocated`: the camp has allocated them one.
 * - `can_transfer`: they hold one that can be transferred to someone else.
 */
export const DIRECTED_TICKET_STATUSES = [
  "none",
  "allocated",
  "can_transfer",
] as const;
export type DirectedTicketStatus = (typeof DIRECTED_TICKET_STATUSES)[number];

/**
 * The member's early-entry pass (for build). Captains only.
 *
 * - `not_needed`: no pass (and the value before anyone says).
 * - `requested`: the camp has asked for one for them.
 * - `issued`: they have one.
 */
export const EARLY_ENTRY_STATUSES = [
  "not_needed",
  "requested",
  "issued",
] as const;
export type EarlyEntryStatus = (typeof EARLY_ENTRY_STATUSES)[number];

/** The two things only a captain records on a member's ticket row. */
export const TICKET_PASSES = ["directed_ticket", "early_entry"] as const;
export type TicketPass = (typeof TICKET_PASSES)[number];
