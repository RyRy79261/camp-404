import { describe, expect, it } from "vitest";
import { DEFAULT_TICKET, type TicketFacts } from "@camp404/core";
import {
  NO_FILTERS,
  applicationCountLine,
  applicationRows,
  filterApplicationRows,
  type ApplicationFilters,
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
    participationIntent: "maybe",
  },
  {
    id: "a",
    displayName: " Ada ",
    approvalStatus: "approved",
    participation: "applied",
    participationIntent: "yes",
  },
  {
    id: "p",
    displayName: "Pat",
    approvalStatus: "pending",
    participation: "applied",
    participationIntent: "yes",
  },
  {
    id: "r",
    displayName: "Rae",
    approvalStatus: "rejected",
    participation: null,
    participationIntent: null,
  },
  {
    id: "n",
    displayName: null,
    approvalStatus: "approved",
    participation: null,
    participationIntent: null,
  },
];

const tickets = new Map<string, TicketFacts>([
  [
    "b",
    {
      ticketStatus: "buying_own",
      ddt: "none",
      wap: "issued",
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

  it("keeps what the member said apart from the captains' decision", () => {
    const ben = applicationRows(members, tickets).find((r) => r.id === "b");
    expect(ben).toMatchObject({ thisYear: "accepted", says: "maybe" });
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
        "says",
        "thisYear",
      ]);
    }
    expect(JSON.stringify(rows)).not.toMatch(/issued|buying_own|wap/);
  });
});

describe("applicationRows: the answer and the decision", () => {
  it("keeps what the member said apart from the captains' decision", () => {
    const rows = applicationRows(members, null);
    // Ben was accepted after saying Maybe: both show, neither overwrites.
    expect(rows.find((r) => r.id === "b")).toMatchObject({
      thisYear: "accepted",
      says: "maybe",
    });
    expect(rows.find((r) => r.id === "a")?.says).toBe("yes");
    expect(rows.find((r) => r.id === "n")?.says).toBeNull();
  });
});

describe("filterApplicationRows", () => {
  const rows = applicationRows(members, tickets);
  const ids = (f: Partial<ApplicationFilters>) =>
    filterApplicationRows(rows, { ...NO_FILTERS, ...f }).map((r) => r.id);

  it("filters by this year's status, or no answer", () => {
    expect(ids({})).toEqual(["a", "b", "n"]);
    expect(ids({ year: "applied" })).toEqual(["a"]);
    expect(ids({ year: "accepted" })).toEqual(["b"]);
    expect(ids({ year: "none" })).toEqual(["n"]);
  });

  it("Coming is everyone who said Yes, decided or not", () => {
    const more = applicationRows(
      [
        ...members,
        {
          id: "c",
          displayName: "Cat",
          approvalStatus: "approved",
          participation: "accepted",
          participationIntent: "yes",
        },
      ],
      tickets,
    );
    const coming = filterApplicationRows(more, {
      ...NO_FILTERS,
      year: "coming",
    }).map((r) => r.id);
    // Ada said Yes, not decided; Cat said Yes, accepted. Ben said Maybe and
    // was accepted: not Coming.
    expect(coming).toEqual(["a", "c"]);
  });

  it("filters by ticket, apart from the year", () => {
    expect(ids({ ticket: "needs_ticket" })).toEqual(["b"]);
    expect(ids({ ticket: "wap_requested" })).toEqual([]);
    const more = applicationRows(
      members,
      new Map<string, TicketFacts>([
        [
          "a",
          {
            ticketStatus: "needs_directed_ticket",
            ddt: "none",
            wap: "requested",
          },
        ],
        [
          "b",
          {
            ticketStatus: "needs_directed_ticket",
            ddt: "allocated",
            wap: "issued",
          },
        ],
      ]),
    );
    const pick = (f: Partial<ApplicationFilters>) =>
      filterApplicationRows(more, { ...NO_FILTERS, ...f }).map((r) => r.id);
    // Ben's DDT is given: he no longer waits on one.
    expect(pick({ ticket: "wants_ddt" })).toEqual(["a"]);
    expect(pick({ ticket: "wap_requested" })).toEqual(["a"]);
    // Both filters at once.
    expect(pick({ ticket: "wants_ddt", year: "accepted" })).toEqual([]);
  });

  it("finds a name by any part of it, any case", () => {
    expect(ids({ query: "BE" })).toEqual(["b"]);
    expect(ids({ query: "  " })).toEqual(["a", "b", "n"]);
  });

  it("finds nobody by ticket on a lead's rows (they have no tickets)", () => {
    const leadRows = applicationRows(members, null);
    expect(
      filterApplicationRows(leadRows, {
        ...NO_FILTERS,
        ticket: "needs_ticket",
      }),
    ).toEqual([]);
  });
});

describe("applicationCountLine", () => {
  it("counts the members, and on a captain's rows who still needs a ticket", () => {
    expect(applicationCountLine(applicationRows(members, tickets))).toBe(
      "3 members, 1 still needs a ticket",
    );
    expect(applicationCountLine(applicationRows(members, null))).toBe(
      "3 members",
    );
    expect(applicationCountLine([])).toBe("0 members");
  });
});
