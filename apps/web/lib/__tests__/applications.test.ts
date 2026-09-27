import { describe, expect, it } from "vitest";
import { DEFAULT_TICKET, type TicketFacts } from "@camp404/core";
import {
  applicationRows,
  matchesApplicationFilter,
  type ApplicationMember,
} from "@/lib/applications";

// The Applications page's rows. The rule that matters: a team lead's rows
// carry NO ticket key, so a lead's browser never receives a captain's data.

const members: ApplicationMember[] = [
  {
    id: "b",
    displayName: "Ben",
    approvalStatus: "approved",
    participation: "accepted",
  },
  {
    id: "a",
    displayName: " Ada ",
    approvalStatus: "approved",
    participation: "applied",
  },
  {
    id: "p",
    displayName: "Pat",
    approvalStatus: "pending",
    participation: "applied",
  },
  {
    id: "r",
    displayName: "Rae",
    approvalStatus: "rejected",
    participation: null,
  },
  {
    id: "n",
    displayName: null,
    approvalStatus: "approved",
    participation: null,
  },
];

const tickets = new Map<string, TicketFacts>([
  [
    "b",
    {
      ticketStatus: "buying_own",
      directedTicket: "none",
      earlyEntry: "issued",
    },
  ],
]);

describe("applicationRows", () => {
  it("lists approved members only, by name", () => {
    const rows = applicationRows(members, tickets);
    expect(rows.map((r) => r.displayName)).toEqual([
      "Ada",
      "Ben",
      "Unnamed burner",
    ]);
  });

  it("gives a captain every member's ticket, the defaults where none is saved", () => {
    const rows = applicationRows(members, tickets);
    expect(rows.find((r) => r.id === "b")?.ticket).toEqual(tickets.get("b"));
    expect(rows.find((r) => r.id === "a")?.ticket).toEqual(DEFAULT_TICKET);
  });

  it("leaves the ticket key off a team lead's rows", () => {
    const rows = applicationRows(members, null);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "displayName",
        "id",
        "thisYear",
      ]);
    }
    expect(JSON.stringify(rows)).not.toMatch(/issued|buying_own|earlyEntry/);
  });
});

describe("matchesApplicationFilter", () => {
  const rows = applicationRows(members, tickets);
  const ids = (f: Parameters<typeof matchesApplicationFilter>[1]) =>
    rows.filter((r) => matchesApplicationFilter(r, f)).map((r) => r.id);

  it("filters by status, no answer, and no ticket yet", () => {
    expect(ids("all")).toEqual(["a", "b", "n"]);
    expect(ids("applied")).toEqual(["a"]);
    expect(ids("accepted")).toEqual(["b"]);
    expect(ids("none")).toEqual(["n"]);
    expect(ids("needs_ticket")).toEqual(["b"]);
  });

  it("finds nobody without a ticket on a lead's rows (they have no tickets)", () => {
    const leadRows = applicationRows(members, null);
    expect(
      leadRows.filter((r) => matchesApplicationFilter(r, "needs_ticket")),
    ).toEqual([]);
  });
});
