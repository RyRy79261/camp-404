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
    expect(row?.ddt).toBe("none");
    expect(row?.wap).toBe("not_needed");
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
      pass: "wap",
      from: "not_needed",
      to: "requested",
    });

    expect(won).toBe(true);
    const row = await getTicket(member.id, 2027);
    expect(row?.wap).toBe("requested");
    expect(row?.passesUpdatedByUserId).toBe(captain.id);
    const rows = await audits(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: captain.id,
      target: member.id,
      metadata: {
        cycle: 2027,
        pass: "wap",
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
      pass: "ddt",
      from: "none",
      to: "allocated",
    });

    const row = await getTicket(member.id, 2027);
    expect(row?.ticketStatus).toBe("needs_directed_ticket");
    expect(row?.ddt).toBe("allocated");
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
      pass: "ddt",
      from: "none",
      to: "allocated",
    });
    const b = await setTicketPass({
      userId: member.id,
      actorUserId: second.id,
      pass: "ddt",
      from: "none",
      to: "can_transfer",
    });

    expect([a, b]).toEqual([true, false]);
    const row = await getTicket(member.id, 2027);
    expect(row?.ddt).toBe("allocated");
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
      pass: "wap",
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
      .values({ userId: member.id, cycle: 2026, wap: "issued" });

    await setTicketPass({
      userId: member.id,
      actorUserId: captain.id,
      pass: "wap",
      from: "not_needed",
      to: "requested",
    });

    const [last] = await db
      .select({ wap: schema.campTickets.wap })
      .from(schema.campTickets)
      .where(
        and(
          eq(schema.campTickets.userId, member.id),
          eq(schema.campTickets.cycle, 2026),
        ),
      );
    expect(last?.wap).toBe("issued");
    expect((await getTicket(member.id, 2027))?.wap).toBe("requested");
  });

  it("refuses a change to the value already there", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const captain = await makeUser(db, { rank: "captain" });
    await expect(
      setTicketPass({
        userId: member.id,
        actorUserId: captain.id,
        pass: "wap",
        from: "issued",
        to: "issued",
      }),
    ).rejects.toThrow(/already issued/);
  });

  it("a captain sets a member's ticket status: compare-and-set, audited, and a second captain who saw the old value loses", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const member = await makeUser(db);
    const first = await makeUser(db, { rank: "captain" });
    const second = await makeUser(db, { rank: "captain" });

    const a = await setTicketPass({
      userId: member.id,
      actorUserId: first.id,
      pass: "ticket",
      from: "unknown",
      to: "has_ticket",
    });
    const b = await setTicketPass({
      userId: member.id,
      actorUserId: second.id,
      pass: "ticket",
      from: "unknown",
      to: "buying_own",
    });

    expect([a, b]).toEqual([true, false]);
    const row = await getTicket(member.id, 2027);
    expect(row?.ticketStatus).toBe("has_ticket");
    // A ticket status is not a pass: who last set the DDT or WAP is unchanged.
    expect(row?.passesUpdatedByUserId).toBeNull();
    const rows = await audits(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: first.id,
      target: member.id,
      metadata: {
        cycle: 2027,
        pass: "ticket",
        from: "unknown",
        to: "has_ticket",
      },
    });
  });

  it("a captain's ticket status does not overwrite an answer the member gave since", async () => {
    const db = h.db();
    await foundedAt(db, 2027);
    const member = await makeUser(db);
    const captain = await makeUser(db, { rank: "captain" });
    await setOwnTicketStatus({
      userId: member.id,
      cycle: 2027,
      ticketStatus: "buying_own",
    });

    const won = await setTicketPass({
      userId: member.id,
      actorUserId: captain.id,
      pass: "ticket",
      from: "unknown",
      to: "needs_directed_ticket",
    });

    expect(won).toBe(false);
    expect((await getTicket(member.id, 2027))?.ticketStatus).toBe("buying_own");
    expect(await audits(db)).toHaveLength(0);
  });
});
