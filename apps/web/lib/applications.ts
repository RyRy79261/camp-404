import {
  DEFAULT_TICKET,
  stillNeedsTicket,
  type TicketFacts,
} from "@camp404/core";
import type { ParticipationIntent, ParticipationStatus } from "@camp404/types";

// The Applications page's rows (#238): who is coming this year, and for a
// captain each member's ticket, DDT and WAP. What the member said (`says`)
// and the captains' decision (read from `thisYear`) are kept apart. Pure, so the one rule that
// matters here is testable without a page: a team lead's rows carry NO ticket
// key at all. The server builds the rows; the browser never gets a captain's
// data to hide.

/** Only what the page needs of a roster member. */
export interface ApplicationMember {
  id: string;
  displayName: string | null;
  approvalStatus: "pending" | "approved" | "rejected";
  participation: ParticipationStatus | null;
  participationIntent: ParticipationIntent | null;
}

export interface ApplicationRow {
  id: string;
  displayName: string;
  /** Where the member stands this year, or null when they have not answered. */
  thisYear: ParticipationStatus | null;
  /** What the member themselves said this year, or null with no answer. */
  says: ParticipationIntent | null;
  /** A captain's rows only: the member's ticket record (defaults if none). */
  ticket?: TicketFacts;
}

/**
 * The page's rows: approved members only (the people "Everyone" reaches, the
 * same set the overview's "This year" card counts), by name. `tickets` is the
 * year's ticket records for a captain, or null for a team lead, whose rows
 * then carry no `ticket` key.
 */
export function applicationRows(
  members: readonly ApplicationMember[],
  tickets: ReadonlyMap<string, TicketFacts> | null,
): ApplicationRow[] {
  return members
    .filter((m) => m.approvalStatus === "approved")
    .map((m) => {
      const row: ApplicationRow = {
        id: m.id,
        displayName: m.displayName?.trim() || "Unnamed burner",
        thisYear: m.participation,
        says: m.participationIntent,
      };
      if (tickets) row.ticket = tickets.get(m.id) ?? { ...DEFAULT_TICKET };
      return row;
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * The page's filters: one group per stored status (STANDING_LABEL: "Coming,
 * not decided", "Accepted", …), no answer, or (captains) no ticket yet.
 */
export type ApplicationFilter =
  | "all"
  | ParticipationStatus
  | "none"
  | "needs_ticket";

/** Whether a row shows under a filter. */
export function matchesApplicationFilter(
  row: ApplicationRow,
  filter: ApplicationFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "none":
      return row.thisYear === null;
    case "needs_ticket":
      return (
        row.ticket !== undefined && stillNeedsTicket(row.thisYear, row.ticket)
      );
    default:
      return row.thisYear === filter;
  }
}
