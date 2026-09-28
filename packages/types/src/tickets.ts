// Tickets per member per burn year: the member's own Burn ticket, the camp's
// DDT (direct distribution ticket) for them, and their WAP (work access pass).
// Kept in camp_tickets
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
 * - `needs_directed_ticket`: they need one of the camp's DDTs. (The stored
 *   value keeps the table's first wording, so it needs no migration.)
 */
export const TICKET_STATUSES = [
  "unknown",
  "buying_own",
  "has_ticket",
  "needs_directed_ticket",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * The camp's DDT for this member. Captains only.
 *
 * - `none`: no DDT.
 * - `allocated`: the camp has allocated them one.
 * - `can_transfer`: they hold one that can be transferred to someone else.
 */
export const DDT_STATUSES = ["none", "allocated", "can_transfer"] as const;
export type DdtStatus = (typeof DDT_STATUSES)[number];

/**
 * The member's WAP, the pass that lets them in early for build. Captains
 * only.
 *
 * - `not_needed`: no pass (and the value before anyone says).
 * - `requested`: the camp has asked for one for them.
 * - `issued`: they have one.
 */
export const WAP_STATUSES = ["not_needed", "requested", "issued"] as const;
export type WapStatus = (typeof WAP_STATUSES)[number];

/**
 * What a captain may record on a member's ticket row (owner, 2026-09-28):
 * the member's ticket status too (a captain may set it for them), and the DDT
 * and WAP, which only a captain sets.
 */
export const TICKET_PASSES = ["ticket", "ddt", "wap"] as const;
export type TicketPass = (typeof TICKET_PASSES)[number];
