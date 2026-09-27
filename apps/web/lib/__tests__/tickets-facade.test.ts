import { beforeEach, describe, expect, it, vi } from "vitest";

// The tickets facade's member read: what a member gets of their own record is
// their own ticket status and nothing else. The directed ticket and the
// early-entry pass are captain-only (#238), so they never leave the server on
// the member's read.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/test-mode", () => ({ usesTestStore: () => false }));
vi.mock("@camp404/db/cycles", () => ({
  currentCycleNumber: vi.fn(async () => 2027),
}));
vi.mock("@camp404/db/tickets", () => ({
  getTicket: vi.fn(),
  listTickets: vi.fn(),
  setOwnTicketStatus: vi.fn(),
  setTicketPass: vi.fn(),
}));

import {
  getTicket,
  listTickets,
  setOwnTicketStatus,
} from "@camp404/db/tickets";
import {
  getMyTicket,
  listTicketsThisYear,
  setMyTicketStatus,
} from "@/lib/tickets";

const ROW = {
  userId: "u1",
  cycle: 2027,
  ticketStatus: "needs_directed_ticket" as const,
  directedTicket: "allocated" as const,
  earlyEntry: "issued" as const,
  passesUpdatedByUserId: "cap-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => vi.clearAllMocks());

describe("getMyTicket", () => {
  it("returns the member's own status for this year, and no captain-only pass", async () => {
    vi.mocked(getTicket).mockResolvedValue(ROW);

    const mine = await getMyTicket("u1");

    expect(getTicket).toHaveBeenCalledWith("u1", 2027);
    expect(mine).toEqual({ ticketStatus: "needs_directed_ticket" });
    expect(Object.keys(mine)).toEqual(["ticketStatus"]);
  });

  it("reads as not sorted when the member has said nothing", async () => {
    vi.mocked(getTicket).mockResolvedValue(null);
    expect(await getMyTicket("u1")).toEqual({ ticketStatus: "unknown" });
  });
});

describe("setMyTicketStatus", () => {
  it("writes to the camp's current year", async () => {
    await setMyTicketStatus({ userId: "u1", ticketStatus: "has_ticket" });
    expect(setOwnTicketStatus).toHaveBeenCalledWith({
      userId: "u1",
      ticketStatus: "has_ticket",
      cycle: 2027,
    });
  });
});

describe("listTicketsThisYear", () => {
  it("keys this year's records by member", async () => {
    vi.mocked(listTickets).mockResolvedValue([ROW]);
    const map = await listTicketsThisYear();
    expect(listTickets).toHaveBeenCalledWith(2027);
    expect(map.get("u1")).toEqual({
      ticketStatus: "needs_directed_ticket",
      directedTicket: "allocated",
      earlyEntry: "issued",
    });
  });
});
