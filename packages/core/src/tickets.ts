import type {
  DdtStatus,
  WapStatus,
  ParticipationStatus,
  TicketStatus,
} from "@camp404/types";

// Tickets for one burn year (#238): the member's own ticket, the camp's DDT
// (direct distribution ticket) and the WAP (work access pass). The words people read,
// and the counts the captains plan with. The rows live in camp_tickets
// (@camp404/db/tickets).
//
// Who reads what (MEMBER_FIELD_READERS in ./privacy; owner, 2026-09-28):
// - the member reads their own row (ticket status, DDT and WAP) and sets only
//   their own ticket status; they never read another member's;
// - captains read every row, may set a member's ticket status for them, and
//   alone set the DDT and the WAP;
// - team leads read none of it (they read only who is coming).

/** The member's own ticket, in the member's words (the form's options). */
export const TICKET_STATUS_OPTION: Readonly<Record<TicketStatus, string>> = {
  unknown: "I haven't sorted it yet",
  buying_own: "I'll buy my own",
  has_ticket: "I have my ticket",
  needs_directed_ticket:
    "I want a DDT (direct distribution ticket) from the camp",
};

/**
 * The member's ticket, as a captain reads it in a column: the member's own
 * answer, so "Wants a DDT" (their request), never a word that could be read as
 * the camp's DDT itself.
 */
export const TICKET_STATUS_LABEL: Readonly<Record<TicketStatus, string>> = {
  unknown: "No answer",
  buying_own: "Buying own",
  has_ticket: "Has ticket",
  needs_directed_ticket: "Wants a DDT",
};

/** The camp's DDT for a member, as the captains set it. */
export const DDT_LABEL: Readonly<Record<DdtStatus, string>> = {
  none: "Not given",
  allocated: "Given",
  can_transfer: "Can pass on",
};

/** The member's WAP (work access pass), as the captains set it. */
export const WAP_LABEL: Readonly<Record<WapStatus, string>> = {
  not_needed: "Not needed",
  requested: "Requested",
  issued: "Issued",
};

/**
 * The member's own DDT, in words that answer what they asked for: a member
 * who wants a DDT and has none yet reads "Asked for, not given yet", not a
 * bare "Not given" that sounds like a refusal.
 */
export function myDdtLabel(ticket: TicketFacts): string {
  if (ticket.ddt === "none") {
    return ticket.ticketStatus === "needs_directed_ticket"
      ? "Asked for, not given yet"
      : DDT_LABEL.none;
  }
  return ticket.ddt === "can_transfer"
    ? "Given, and you may pass it on"
    : DDT_LABEL.allocated;
}

/**
 * Whether the member asked the camp for a DDT and the camp has given one, so
 * their own answer is met: they still buy it, then say they have their ticket.
 */
export function ddtRequestMet(ticket: TicketFacts): boolean {
  return (
    ticket.ticketStatus === "needs_directed_ticket" && ticket.ddt !== "none"
  );
}

/**
 * Whether a ticket status may be recorded for a member, by them or by a
 * captain: only for someone who might come this year, so not before they
 * answer and not once they say Not coming. The DDT and WAP are not bound by
 * it: a captain may arrange those for anyone.
 */
export function mayRecordTicket(status: ParticipationStatus | null): boolean {
  return status !== null && status !== "not_attending";
}

/** A member's ticket row as the counts need it; absent means the defaults. */
export interface TicketFacts {
  ticketStatus: TicketStatus;
  ddt: DdtStatus;
  wap: WapStatus;
}

/** The ticket row every member has before anyone says anything. */
export const DEFAULT_TICKET: Readonly<TicketFacts> = {
  ticketStatus: "unknown",
  ddt: "none",
  wap: "not_needed",
};

/**
 * Whether an accepted member still has no ticket in hand: they have not said
 * they have one, and the camp has not allocated them a DDT. Only an
 * accepted member counts: someone without a place needs no ticket from us.
 */
export function stillNeedsTicket(
  status: ParticipationStatus | null,
  ticket: TicketFacts = DEFAULT_TICKET,
): boolean {
  return (
    status === "accepted" &&
    ticket.ticketStatus !== "has_ticket" &&
    ticket.ddt !== "allocated"
  );
}

export interface TicketCounts {
  /** Accepted members with no ticket in hand yet (stillNeedsTicket). */
  needTicket: number;
  /** WAP passes issued this year. */
  wapIssued: number;
}

/**
 * The ticket figures for one year, over the members given (the caller picks
 * who counts, e.g. approved members only) and the year's ticket rows keyed by
 * member id.
 */
export function deriveTicketCounts(
  members: readonly { id: string; thisYear: ParticipationStatus | null }[],
  tickets: ReadonlyMap<string, TicketFacts>,
): TicketCounts {
  let needTicket = 0;
  let wapIssued = 0;
  for (const m of members) {
    const ticket = tickets.get(m.id) ?? DEFAULT_TICKET;
    if (stillNeedsTicket(m.thisYear, ticket)) needTicket += 1;
    if (ticket.wap === "issued") wapIssued += 1;
  }
  return { needTicket, wapIssued };
}
