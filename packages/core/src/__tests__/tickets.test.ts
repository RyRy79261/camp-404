import { describe, expect, it } from "vitest";
import {
  DDT_STATUSES,
  WAP_STATUSES,
  PARTICIPATION_STATUSES,
  TICKET_STATUSES,
} from "@camp404/types";
import {
  DEFAULT_TICKET,
  DDT_LABEL,
  WAP_LABEL,
  TICKET_STATUS_LABEL,
  TICKET_STATUS_OPTION,
  ddtRequestMet,
  deriveTicketCounts,
  mayRecordTicket,
  myDdtLabel,
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
    expect(Object.keys(DDT_LABEL).sort()).toEqual([...DDT_STATUSES].sort());
    expect(Object.keys(WAP_LABEL).sort()).toEqual([...WAP_STATUSES].sort());
  });
});

describe("the member's own DDT words", () => {
  it("says a requested DDT is asked for, not refused", () => {
    expect(myDdtLabel(ticket({ ticketStatus: "needs_directed_ticket" }))).toBe(
      "Asked for, not given yet",
    );
    expect(myDdtLabel(ticket())).toBe("Not given");
    expect(myDdtLabel(ticket({ ticketStatus: "buying_own" }))).toBe(
      "Not given",
    );
  });

  it("says a given DDT is given, and whether it may be passed on", () => {
    expect(
      myDdtLabel(
        ticket({ ticketStatus: "needs_directed_ticket", ddt: "allocated" }),
      ),
    ).toBe("Given");
    expect(myDdtLabel(ticket({ ddt: "can_transfer" }))).toBe(
      "Given, and you may pass it on",
    );
  });

  it("knows when the member's request for a DDT is met", () => {
    expect(
      ddtRequestMet(
        ticket({ ticketStatus: "needs_directed_ticket", ddt: "allocated" }),
      ),
    ).toBe(true);
    expect(
      ddtRequestMet(
        ticket({ ticketStatus: "needs_directed_ticket", ddt: "can_transfer" }),
      ),
    ).toBe(true);
    expect(
      ddtRequestMet(ticket({ ticketStatus: "needs_directed_ticket" })),
    ).toBe(false);
    // A DDT the member did not ask for is not "their request met".
    expect(ddtRequestMet(ticket({ ddt: "allocated" }))).toBe(false);
  });
});

describe("stillNeedsTicket", () => {
  it("counts only an accepted member", () => {
    for (const status of PARTICIPATION_STATUSES) {
      expect(stillNeedsTicket(status)).toBe(status === "accepted");
    }
    expect(stillNeedsTicket(null)).toBe(false);
  });

  it("is settled by the member's own ticket or an allocated DDT", () => {
    expect(
      stillNeedsTicket("accepted", ticket({ ticketStatus: "has_ticket" })),
    ).toBe(false);
    expect(stillNeedsTicket("accepted", ticket({ ddt: "allocated" }))).toBe(
      false,
    );
    expect(
      stillNeedsTicket("accepted", ticket({ ticketStatus: "buying_own" })),
    ).toBe(true);
    expect(
      stillNeedsTicket(
        "accepted",
        ticket({
          ticketStatus: "needs_directed_ticket",
          ddt: "can_transfer",
        }),
      ),
    ).toBe(true);
  });
});

describe("deriveTicketCounts", () => {
  it("counts accepted members without a ticket and issued WAPs", () => {
    const members = [
      { id: "a", thisYear: "accepted" as const },
      { id: "b", thisYear: "accepted" as const },
      { id: "c", thisYear: "accepted" as const },
      { id: "d", thisYear: "waitlisted" as const },
      { id: "e", thisYear: null },
    ];
    const tickets = new Map<string, TicketFacts>([
      ["a", ticket({ ticketStatus: "has_ticket", wap: "issued" })],
      ["b", ticket({ wap: "requested" })],
      ["d", ticket({ wap: "issued" })],
      // A row for someone not in the list is not counted.
      ["zz", ticket({ wap: "issued" })],
    ]);
    expect(deriveTicketCounts(members, tickets)).toEqual({
      // b (no ticket yet) and c (no row: the defaults).
      needTicket: 2,
      wapIssued: 2,
    });
  });

  it("is zero for no members", () => {
    expect(deriveTicketCounts([], new Map())).toEqual({
      needTicket: 0,
      wapIssued: 0,
    });
  });
});

describe("mayRecordTicket", () => {
  it("allows a ticket only for a member who said Coming or Maybe", () => {
    for (const status of PARTICIPATION_STATUSES) {
      expect(mayRecordTicket(status)).toBe(status !== "not_attending");
    }
    expect(mayRecordTicket(null)).toBe(false);
  });
});
