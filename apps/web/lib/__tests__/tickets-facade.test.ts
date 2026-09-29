import { beforeEach, describe, expect, it, vi } from "vitest";

// The tickets facade's member read: what a member gets of their own record is
// their own ticket status and nothing else. The DDT and the
// WAP are captain-only (#238), so they never leave the server on
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
  ddt: "allocated" as const,
  wap: "issued" as const,
  passesUpdatedByUserId: "cap-1",
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => vi.clearAllMocks());

describe("getMyTicket", () => {
  it("returns the member's OWN row for this year: status, DDT and WAP, and who set them never", async () => {
    vi.mocked(getTicket).mockResolvedValue(ROW);

    const mine = await getMyTicket("u1");

    // Exactly one read, of the member's own row.
    expect(getTicket).toHaveBeenCalledTimes(1);
    expect(getTicket).toHaveBeenCalledWith("u1", 2027);
    expect(listTickets).not.toHaveBeenCalled();
    expect(mine).toEqual({
      ticketStatus: "needs_directed_ticket",
      ddt: "allocated",
      wap: "issued",
    });
    expect(Object.keys(mine).sort()).toEqual(["ddt", "ticketStatus", "wap"]);
  });

  it("reads the defaults when nothing is said about the member", async () => {
    vi.mocked(getTicket).mockResolvedValue(null);
    expect(await getMyTicket("u1")).toEqual({
      ticketStatus: "unknown",
      ddt: "none",
      wap: "not_needed",
    });
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
      ddt: "allocated",
      wap: "issued",
    });
  });
});
