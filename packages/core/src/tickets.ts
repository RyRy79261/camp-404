import type {
  DirectedTicketStatus,
  EarlyEntryStatus,
  ParticipationStatus,
  TicketPass,
  TicketStatus,
} from "@camp404/types";

// Tickets and early entry for one burn year (#238): the words people read,
// and the counts the captains plan with. The rows live in camp_tickets
// (@camp404/db/tickets).
//
// Who reads what (MEMBER_FIELD_READERS in ./privacy):
// - the member reads and sets their own ticket status, and nothing else here;
// - captains read every row, and alone record the directed ticket and the
//   early-entry pass;
// - team leads read none of it (they read only who is coming).

/** The member's own ticket, in the member's words (the form's options). */
export const TICKET_STATUS_OPTION: Readonly<Record<TicketStatus, string>> = {
  unknown: "Not sorted yet",
  buying_own: "I'll buy my own",
  has_ticket: "I have my ticket",
  needs_directed_ticket: "I need a directed ticket from the camp",
};

/** The member's ticket, as a captain reads it in a column. */
export const TICKET_STATUS_LABEL: Readonly<Record<TicketStatus, string>> = {
  unknown: "Not sorted",
  buying_own: "Buying own",
  has_ticket: "Has ticket",
  needs_directed_ticket: "Needs directed",
};

export const DIRECTED_TICKET_LABEL: Readonly<
  Record<DirectedTicketStatus, string>
> = {
  none: "None",
  allocated: "Allocated",
  can_transfer: "Can transfer",
};

export const EARLY_ENTRY_LABEL: Readonly<Record<EarlyEntryStatus, string>> = {
  not_needed: "Not needed",
  requested: "Asked for",
  issued: "Issued",
};

/** What each captain-only pass is called. */
export const TICKET_PASS_LABEL: Readonly<Record<TicketPass, string>> = {
  directed_ticket: "Directed ticket",
  early_entry: "Early entry",
};

/** A member's ticket row as the counts need it; absent means the defaults. */
export interface TicketFacts {
  ticketStatus: TicketStatus;
  directedTicket: DirectedTicketStatus;
  earlyEntry: EarlyEntryStatus;
}

/** The ticket row every member has before anyone says anything. */
export const DEFAULT_TICKET: Readonly<TicketFacts> = {
  ticketStatus: "unknown",
  directedTicket: "none",
  earlyEntry: "not_needed",
};

/**
 * Whether an accepted member still has no ticket in hand: they have not said
 * they have one, and the camp has not allocated them a directed one. Only an
 * accepted member counts: someone without a place needs no ticket from us.
 */
export function stillNeedsTicket(
  status: ParticipationStatus | null,
  ticket: TicketFacts = DEFAULT_TICKET,
): boolean {
  return (
    status === "accepted" &&
    ticket.ticketStatus !== "has_ticket" &&
    ticket.directedTicket !== "allocated"
  );
}

export interface TicketCounts {
  /** Accepted members with no ticket in hand yet (stillNeedsTicket). */
  needTicket: number;
  /** Early-entry passes issued this year. */
  earlyEntryIssued: number;
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
  let earlyEntryIssued = 0;
  for (const m of members) {
    const ticket = tickets.get(m.id) ?? DEFAULT_TICKET;
    if (stillNeedsTicket(m.thisYear, ticket)) needTicket += 1;
    if (ticket.earlyEntry === "issued") earlyEntryIssued += 1;
  }
  return { needTicket, earlyEntryIssued };
}
