import "server-only";

import { DEFAULT_TICKET, type TicketFacts } from "@camp404/core";
import type { TicketStatus } from "@camp404/types";
import { currentCycleNumber as dbCurrentCycleNumber } from "@camp404/db/cycles";
import {
  getTicket as dbGetTicket,
  listTickets as dbListTickets,
  setOwnTicketStatus as dbSetOwnTicketStatus,
  setTicketPass as dbSetTicketPass,
  type TicketPassChange,
  type TicketRow,
} from "@camp404/db/tickets";
import { usesTestStore } from "./test-mode";
import { testStore } from "./test-store";

// Tickets and early entry (#238): the facade over `@camp404/db/tickets`,
// routed through the in-memory test store under E2E_TEST_MODE so Playwright
// can drive the member's own ticket and the captains' Applications page.
// Every caller gates the viewer itself; this module gates nothing. What each
// read returns is already cut to its reader: the member's own read carries
// only their ticket status, never the captain-only passes.

export type { TicketFacts, TicketPassChange };

interface TicketsBackend {
  currentCycleNumber(): Promise<number>;
  getTicket(userId: string, cycle: number): Promise<TicketRow | null>;
  listTickets(cycle: number): Promise<TicketRow[]>;
  setOwnTicketStatus(input: {
    userId: string;
    cycle: number;
    ticketStatus: TicketStatus;
  }): Promise<void>;
  setTicketPass(
    input: TicketPassChange & { userId: string; actorUserId: string },
  ): Promise<boolean>;
}

// Each entry calls through at CALL time, so a unit test's vi.mock of the db
// module still intercepts it.
const realBackend: TicketsBackend = {
  currentCycleNumber: () => dbCurrentCycleNumber(),
  getTicket: (userId, cycle) => dbGetTicket(userId, cycle),
  listTickets: (cycle) => dbListTickets(cycle),
  setOwnTicketStatus: (input) => dbSetOwnTicketStatus(input),
  setTicketPass: (input) => dbSetTicketPass(input),
};

const testBackend: TicketsBackend = {
  async currentCycleNumber() {
    return testStore.currentCycleNumber();
  },
  async getTicket(userId, cycle) {
    return testStore.getTicket(userId, cycle);
  },
  async listTickets(cycle) {
    return testStore.listTickets(cycle);
  },
  async setOwnTicketStatus(input) {
    testStore.setOwnTicketStatus(input);
  },
  // The store keeps no audit log, so the captain's id stops at the row.
  async setTicketPass(input) {
    return testStore.setTicketPass(input);
  },
};

function backend(): TicketsBackend {
  return usesTestStore() ? testBackend : realBackend;
}

/** What a member may read of their own ticket record: their own answer. */
export interface MyTicket {
  ticketStatus: TicketStatus;
}

/**
 * The member's own ticket status for the camp's current year (the default
 * when they have said nothing). Never the directed ticket or the early-entry
 * pass: those are the captains' (#238).
 */
export async function getMyTicket(userId: string): Promise<MyTicket> {
  const b = backend();
  const cycle = await b.currentCycleNumber();
  const row = await b.getTicket(userId, cycle);
  return { ticketStatus: row?.ticketStatus ?? DEFAULT_TICKET.ticketStatus };
}

/** The member says where their own ticket stands, for this year. */
export async function setMyTicketStatus(input: {
  userId: string;
  ticketStatus: TicketStatus;
}): Promise<void> {
  const b = backend();
  const cycle = await b.currentCycleNumber();
  await b.setOwnTicketStatus({ ...input, cycle });
}

/**
 * Every member's ticket record for the camp's current year, keyed by member
 * id. A member with no record is absent (read them as DEFAULT_TICKET).
 * Captain-only data: only a captain's page may call it.
 */
export async function listTicketsThisYear(): Promise<Map<string, TicketFacts>> {
  const b = backend();
  const cycle = await b.currentCycleNumber();
  const rows = await b.listTickets(cycle);
  return new Map(
    rows.map((r) => [
      r.userId,
      {
        ticketStatus: r.ticketStatus,
        directedTicket: r.directedTicket,
        earlyEntry: r.earlyEntry,
      },
    ]),
  );
}

/**
 * A captain records a member's directed ticket or early-entry pass for this
 * year. False when the value had already moved from `from`.
 */
export function setTicketPass(
  input: TicketPassChange & { userId: string; actorUserId: string },
): Promise<boolean> {
  return backend().setTicketPass(input);
}
