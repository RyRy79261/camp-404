// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TICKET } from "@camp404/core";
import { DDT_STATUSES, TICKET_STATUSES, WAP_STATUSES } from "@camp404/types";
import { useTestDb } from "../../../../packages/db/src/__tests__/_harness";
import { bothWays, outcome } from "./_agreement";

// Tickets, DDT and WAP (#238), through lib/tickets.ts, on the database and on
// the E2E store: a member's own ticket status, a captain's compare-and-set on
// a DDT or WAP (a missing row stands at DEFAULT_TICKET), and the captains'
// list. A change to the value already there is ticketPassNoChange in
// @camp404/core. See _agreement.ts.

const mode = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/test-mode", () => ({
  isE2ETestMode: () => mode.on,
  usesTestStore: () => mode.on,
  TEST_USER_COOKIE: "camp404_test_user",
}));

import { testStore } from "../test-store";
import {
  getMyTicket,
  listTicketsThisYear,
  setMyTicketStatus,
  setTicketPass,
} from "../tickets";

const HAVE = TICKET_STATUSES.find((s) => s !== DEFAULT_TICKET.ticketStatus)!;
const DDT = DDT_STATUSES.find((s) => s !== DEFAULT_TICKET.ddt)!;
const WAP = WAP_STATUSES.find((s) => s !== DEFAULT_TICKET.wap)!;

describe("tickets, DDT and WAP: the database and the test store agree", () => {
  const h = useTestDb();
  beforeEach(() => {
    mode.on = false;
    testStore.reset();
  });

  it("keeps a member's own ticket status and a captain's DDT and WAP, each once from what they saw", async () => {
    const { db, store } = await bothWays(mode, h, async (p) => {
      const before = await getMyTicket(p.member);
      await setMyTicketStatus({ userId: p.member, ticketStatus: HAVE });
      const pass = (
        userId: string,
        change: Parameters<typeof setTicketPass>[0],
      ) => outcome(() => setTicketPass({ ...change, userId }));
      const ddt = await pass(p.member, {
        userId: p.member,
        actorUserId: p.captain,
        pass: "ddt",
        from: DEFAULT_TICKET.ddt,
        to: DDT,
      });
      const staleDdt = await pass(p.member, {
        userId: p.member,
        actorUserId: p.captain,
        pass: "ddt",
        from: DEFAULT_TICKET.ddt,
        to: DDT,
      });
      const wapNoRow = await pass(p.other, {
        userId: p.other,
        actorUserId: p.captain,
        pass: "wap",
        from: DEFAULT_TICKET.wap,
        to: WAP,
      });
      const staleNoRow = await pass(p.financeLead, {
        userId: p.financeLead,
        actorUserId: p.captain,
        pass: "ticket",
        from: HAVE,
        to: DEFAULT_TICKET.ticketStatus,
      });
      const same = await pass(p.member, {
        userId: p.member,
        actorUserId: p.captain,
        pass: "wap",
        from: WAP,
        to: WAP,
      });
      const list = await listTicketsThisYear();
      return {
        before,
        ddt,
        staleDdt,
        wapNoRow,
        staleNoRow,
        same,
        member: await getMyTicket(p.member),
        other: await getMyTicket(p.other),
        financeLead: await getMyTicket(p.financeLead),
        list: [p.member, p.other, p.financeLead, p.captain].map(
          (id) => list.get(id) ?? null,
        ),
      };
    });
    expect(db).toMatchObject({
      before: DEFAULT_TICKET,
      ddt: { ok: true },
      staleDdt: { ok: false },
      wapNoRow: { ok: true },
      staleNoRow: { ok: false },
      same: { threw: `Error: setTicketPass: wap is already ${WAP}` },
      member: { ticketStatus: HAVE, ddt: DDT, wap: DEFAULT_TICKET.wap },
      other: { ...DEFAULT_TICKET, wap: WAP },
      financeLead: DEFAULT_TICKET,
    });
    expect(store).toEqual(db);
  });
});
