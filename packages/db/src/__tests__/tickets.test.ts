import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AuditAction } from "@camp404/core";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import {
  getTicket,
  listTickets,
  setOwnTicketStatus,
  setTicketPass,
} from "../tickets";
import * as schema from "../schema";

// camp_tickets against real Postgres: the member's own upsert, the captain's
// compare-and-set on the two passes, and the audit row that must commit with
// the change (and only with it).

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

// Typed from the audit list, so a misspelt key does not compile.
const PASS_CHANGED: AuditAction = "ticket.pass_changed";

/** Tell the camp what year it is, the way setFoundingYear would. */
async function foundedAt(db: DB, year: number): Promise<void> {
  await db
    .insert(schema.campSettings)
    .values({ id: true })
    .onConflictDoNothing({ target: schema.campSettings.id });
  const [row] = await db
    .select({ config: schema.campSettings.config })
    .from(schema.campSettings)
    .limit(1);
  await db
    .update(schema.campSettings)
    .set({
      config: {
        ...row!.config,
        cycles: [
          { year, startedAt: `${year}-01-01T00:00:00.000Z`, endedAt: null },
        ],
      },
    })
    .where(eq(schema.campSettings.id, true));
}

async function audits(db: DB) {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, PASS_CHANGED));
}

describe("camp_tickets", () => {
  const h = useTestDb();

  it("a member with nothing said has no row, and reads as null", async () => {
    const db = h.db();
    const member = await makeUser(db);
    expect(await getTicket(member.id, 2027)).toBeNull();
    expect(await listTickets(2027)).toEqual([]);
  });

  it("the member's own ticket status is an upsert: the last answer wins, for that year only", async () => {
    const db = h.db();
    const member = await makeUser(db);

    await setOwnTicketStatus({
      userId: member.id,
      cycle: 2027,
      ticketStatus: "needs_directed_ticket",
    });
    await setOwnTicketStatus({
      userId: member.id,
      cycle: 2027,
      ticketStatus: "has_ticket",
    });
    await setOwnTicketStatus({
      userId: member.id,
      cycle: 2026,
      ticketStatus: "buying_own",
    });

    expect((await getTicket(member.id, 2027))?.ticketStatus).toBe("has_ticket");
    expect((await getTicket(member.id, 2026))?.ticketStatus).toBe("buying_own");
    // The passes stay at their defaults, and the member's answer is not
    // audited (it is their own).
    const row = await getTicket(member.id, 2027);
    expect(row?.directedTicket).toBe("none");
    expect(row?.earlyEntry).toBe("not_needed");
    expect(await audits(db)).toHaveLength(0);
    expect((await listTickets(2027)).map((r) => r.userId)).toEqual([member.id]);
  });

  it("a captain's change writes the row for this year, and one audit row with it", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const member = await makeUser(db);
    const captain = await makeUser(db, { rank: "captain" });

    const won = await setTicketPass({
      userId: member.id,
      actorUserId: captain.id,
      pass: "early_entry",
      from: "not_needed",
      to: "requested",
    });

    expect(won).toBe(true);
    const row = await getTicket(member.id, 2027);
    expect(row?.earlyEntry).toBe("requested");
    expect(row?.passesUpdatedByUserId).toBe(captain.id);
    const rows = await audits(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: captain.id,
      target: member.id,
      metadata: {
        cycle: 2027,
        pass: "early_entry",
        from: "not_needed",
        to: "requested",
      },
    });
  });

  it("keeps the member's own ticket status when a captain changes a pass", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const member = await makeUser(db);
    const captain = await makeUser(db, { rank: "captain" });
    await setOwnTicketStatus({
      userId: member.id,
      cycle: 2027,
      ticketStatus: "needs_directed_ticket",
    });

    await setTicketPass({
      userId: member.id,
      actorUserId: captain.id,
      pass: "directed_ticket",
      from: "none",
      to: "allocated",
    });

    const row = await getTicket(member.id, 2027);
    expect(row?.ticketStatus).toBe("needs_directed_ticket");
    expect(row?.directedTicket).toBe("allocated");
  });

  it("the second of two captains who saw the same value loses, and writes no audit row", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const member = await makeUser(db);
    const first = await makeUser(db, { rank: "captain" });
    const second = await makeUser(db, { rank: "captain" });

    const a = await setTicketPass({
      userId: member.id,
      actorUserId: first.id,
      pass: "directed_ticket",
      from: "none",
      to: "allocated",
    });
    const b = await setTicketPass({
      userId: member.id,
      actorUserId: second.id,
      pass: "directed_ticket",
      from: "none",
      to: "can_transfer",
    });

    expect([a, b]).toEqual([true, false]);
    const row = await getTicket(member.id, 2027);
    expect(row?.directedTicket).toBe("allocated");
    expect(row?.passesUpdatedByUserId).toBe(first.id);
    const rows = await audits(db);
    expect(rows.map((r) => r.actorId)).toEqual([first.id]);
  });

  it("a captain who saw a value that is not there, on a member with no row, loses without writing a row", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const member = await makeUser(db);
    const captain = await makeUser(db, { rank: "captain" });

    const won = await setTicketPass({
      userId: member.id,
      actorUserId: captain.id,
      pass: "early_entry",
      from: "issued",
      to: "not_needed",
    });

    expect(won).toBe(false);
    expect(await getTicket(member.id, 2027)).toBeNull();
    expect(await audits(db)).toHaveLength(0);
  });

  it("writes to the camp's current year only", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const member = await makeUser(db);
    const captain = await makeUser(db, { rank: "captain" });
    await db
      .insert(schema.campTickets)
      .values({ userId: member.id, cycle: 2026, earlyEntry: "issued" });

    await setTicketPass({
      userId: member.id,
      actorUserId: captain.id,
      pass: "early_entry",
      from: "not_needed",
      to: "requested",
    });

    const [last] = await db
      .select({ earlyEntry: schema.campTickets.earlyEntry })
      .from(schema.campTickets)
      .where(
        and(
          eq(schema.campTickets.userId, member.id),
          eq(schema.campTickets.cycle, 2026),
        ),
      );
    expect(last?.earlyEntry).toBe("issued");
    expect((await getTicket(member.id, 2027))?.earlyEntry).toBe("requested");
  });

  it("refuses a change to the value already there", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const captain = await makeUser(db, { rank: "captain" });
    await expect(
      setTicketPass({
        userId: member.id,
        actorUserId: captain.id,
        pass: "early_entry",
        from: "issued",
        to: "issued",
      }),
    ).rejects.toThrow(/already issued/);
  });
});
