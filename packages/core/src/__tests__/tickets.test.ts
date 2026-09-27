import { describe, expect, it } from "vitest";
import {
  DIRECTED_TICKET_STATUSES,
  EARLY_ENTRY_STATUSES,
  PARTICIPATION_STATUSES,
  TICKET_STATUSES,
} from "@camp404/types";
import {
  DEFAULT_TICKET,
  DIRECTED_TICKET_LABEL,
  EARLY_ENTRY_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_OPTION,
  deriveTicketCounts,
  stillNeedsTicket,
  type TicketFacts,
} from "../tickets";

const ticket = (over: Partial<TicketFacts> = {}): TicketFacts => ({
  ...DEFAULT_TICKET,
  ...over,
});

describe("ticket words", () => {
  it("has words for every stored value", () => {
    expect(Object.keys(TICKET_STATUS_OPTION).sort()).toEqual(
      [...TICKET_STATUSES].sort(),
    );
    expect(Object.keys(TICKET_STATUS_LABEL).sort()).toEqual(
      [...TICKET_STATUSES].sort(),
    );
    expect(Object.keys(DIRECTED_TICKET_LABEL).sort()).toEqual(
      [...DIRECTED_TICKET_STATUSES].sort(),
    );
    expect(Object.keys(EARLY_ENTRY_LABEL).sort()).toEqual(
      [...EARLY_ENTRY_STATUSES].sort(),
    );
  });
});

describe("stillNeedsTicket", () => {
  it("counts only an accepted member", () => {
    for (const status of PARTICIPATION_STATUSES) {
      expect(stillNeedsTicket(status)).toBe(status === "accepted");
    }
    expect(stillNeedsTicket(null)).toBe(false);
  });

  it("is settled by the member's own ticket or an allocated directed ticket", () => {
    expect(
      stillNeedsTicket("accepted", ticket({ ticketStatus: "has_ticket" })),
    ).toBe(false);
    expect(
      stillNeedsTicket("accepted", ticket({ directedTicket: "allocated" })),
    ).toBe(false);
    expect(
      stillNeedsTicket("accepted", ticket({ ticketStatus: "buying_own" })),
    ).toBe(true);
    expect(
      stillNeedsTicket(
        "accepted",
        ticket({
          ticketStatus: "needs_directed_ticket",
          directedTicket: "can_transfer",
        }),
      ),
    ).toBe(true);
  });
});

describe("deriveTicketCounts", () => {
  it("counts accepted members without a ticket and issued early-entry passes", () => {
    const members = [
      { id: "a", thisYear: "accepted" as const },
      { id: "b", thisYear: "accepted" as const },
      { id: "c", thisYear: "accepted" as const },
      { id: "d", thisYear: "waitlisted" as const },
      { id: "e", thisYear: null },
    ];
    const tickets = new Map<string, TicketFacts>([
      ["a", ticket({ ticketStatus: "has_ticket", earlyEntry: "issued" })],
      ["b", ticket({ earlyEntry: "requested" })],
      ["d", ticket({ earlyEntry: "issued" })],
      // A row for someone not in the list is not counted.
      ["zz", ticket({ earlyEntry: "issued" })],
    ]);
    expect(deriveTicketCounts(members, tickets)).toEqual({
      // b (no ticket yet) and c (no row: the defaults).
      needTicket: 2,
      earlyEntryIssued: 2,
    });
  });

  it("is zero for no members", () => {
    expect(deriveTicketCounts([], new Map())).toEqual({
      needTicket: 0,
      earlyEntryIssued: 0,
    });
  });
});
