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
 * The page's two filters, apart as the owner keeps them apart (2026-09-28):
 * "This year" is the member's answer and the captains' decision, one stored
 * status each (STANDING_LABEL: "Coming, not decided", "Accepted", …) or no
 * answer; "Ticket" (captains only) is where their ticket, DDT or WAP stands.
 */
export type YearFilter = "all" | ParticipationStatus | "none";

export type TicketFilter =
  | "any"
  | "needs_ticket"
  | "wants_ddt"
  | "wap_requested";

export interface ApplicationFilters {
  year: YearFilter;
  ticket: TicketFilter;
  /** Part of a name, any case; blank matches everyone. */
  query: string;
}

export const NO_FILTERS: ApplicationFilters = {
  year: "all",
  ticket: "any",
  query: "",
};

/** Whether a row shows under a "This year" filter. */
export function matchesYearFilter(
  row: ApplicationRow,
  year: YearFilter,
): boolean {
  if (year === "all") return true;
  if (year === "none") return row.thisYear === null;
  return row.thisYear === year;
}

/**
 * Whether a row shows under a "Ticket" filter. A team lead's rows carry no
 * ticket, so every ticket filter but "any" finds nobody on them.
 */
export function matchesTicketFilter(
  row: ApplicationRow,
  ticket: TicketFilter,
): boolean {
  if (ticket === "any") return true;
  if (!row.ticket) return false;
  switch (ticket) {
    case "needs_ticket":
      return stillNeedsTicket(row.thisYear, row.ticket);
    case "wants_ddt":
      return (
        row.ticket.ticketStatus === "needs_directed_ticket" &&
        row.ticket.ddt === "none"
      );
    case "wap_requested":
      return row.ticket.wap === "requested";
  }
}

/** The rows the filters keep, in the order given. */
export function filterApplicationRows(
  rows: readonly ApplicationRow[],
  filters: ApplicationFilters,
): ApplicationRow[] {
  const q = filters.query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      matchesYearFilter(r, filters.year) &&
      matchesTicketFilter(r, filters.ticket) &&
      (q === "" || r.displayName.toLowerCase().includes(q)),
  );
}

/**
 * The count line over the table ("12 members, 2 still need a ticket"), for
 * the rows showing. The ticket half only on a captain's rows, which carry
 * the tickets.
 */
export function applicationCountLine(rows: readonly ApplicationRow[]): string {
  const people = `${rows.length} ${rows.length === 1 ? "member" : "members"}`;
  if (!rows.some((r) => r.ticket)) return people;
  const need = rows.filter(
    (r) => r.ticket && stillNeedsTicket(r.thisYear, r.ticket),
  ).length;
  return need === 0
    ? people
    : `${people}, ${need} still ${need === 1 ? "needs" : "need"} a ticket`;
}
