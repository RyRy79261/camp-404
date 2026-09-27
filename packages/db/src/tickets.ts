import { and, eq } from "drizzle-orm";
import { DEFAULT_TICKET } from "@camp404/core";
import type {
  DirectedTicketStatus,
  EarlyEntryStatus,
  TicketPass,
  TicketStatus,
} from "@camp404/types";
import { createHttpDb, withTransaction } from "./index";
import * as schema from "./schema";
import { writeAuditEvent } from "./audit";
import { currentCycleNumber } from "./cycles";

// The write path for `camp_tickets` (#238): a member's Burn ticket, the camp's
// directed ticket for them and their early-entry pass, one row per member per
// burn year. No row means nothing has been said yet, which reads as every
// column's default.
//
// The member writes only their own ticket status. A captain writes only the
// two passes, as a compare-and-set on the value they saw, audited in the same
// transaction. Who may call which is the caller's gate; this module gates
// nothing.
//
// Every function takes the year from its caller, or resolves it BEFORE opening
// a transaction (currentCycleNumber reads on its own handle, and PGlite has
// one connection).

export type TicketRow = typeof schema.campTickets.$inferSelect;

/** A member's row for one year, or null when nothing has been said. */
export async function getTicket(
  userId: string,
  cycle: number,
): Promise<TicketRow | null> {
  const [row] = await createHttpDb()
    .select()
    .from(schema.campTickets)
    .where(
      and(
        eq(schema.campTickets.userId, userId),
        eq(schema.campTickets.cycle, cycle),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Every row for one year. A member with no row has the defaults. */
export async function listTickets(cycle: number): Promise<TicketRow[]> {
  return createHttpDb()
    .select()
    .from(schema.campTickets)
    .where(eq(schema.campTickets.cycle, cycle));
}

/**
 * The member says where their own ticket stands, for one year. Their own data,
 * so a plain upsert: the last answer wins, and it is not audited (as the
 * member's own Yes / Maybe / No is not).
 */
export async function setOwnTicketStatus(input: {
  userId: string;
  cycle: number;
  ticketStatus: TicketStatus;
}): Promise<void> {
  const now = new Date();
  await createHttpDb()
    .insert(schema.campTickets)
    .values({
      userId: input.userId,
      cycle: input.cycle,
      ticketStatus: input.ticketStatus,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.campTickets.userId, schema.campTickets.cycle],
      set: { ticketStatus: input.ticketStatus, updatedAt: now },
    });
}

/** One captain-only change, typed so a pass only takes its own values. */
export type TicketPassChange =
  | {
      pass: Extract<TicketPass, "directed_ticket">;
      from: DirectedTicketStatus;
      to: DirectedTicketStatus;
    }
  | {
      pass: Extract<TicketPass, "early_entry">;
      from: EarlyEntryStatus;
      to: EarlyEntryStatus;
    };

/**
 * A captain records a member's directed ticket or early-entry pass for the
 * camp's current year.
 *
 * Compare-and-set on `from`, the value the captain saw (a member with no row
 * stands at the default): true when this call made the change, false when the
 * row had already moved (another captain changed it first). The winning call
 * writes a `ticket.pass_changed` audit row in the same transaction. A change
 * to the value already there throws: the caller never offers it.
 */
export async function setTicketPass(
  input: TicketPassChange & { userId: string; actorUserId: string },
): Promise<boolean> {
  if (input.from === input.to) {
    throw new Error(`setTicketPass: ${input.pass} is already ${input.to}`);
  }
  // Resolved BEFORE the transaction (see the module note).
  const cycle = await currentCycleNumber();
  return withTransaction(async (tx) => {
    const now = new Date();
    // A member nobody has said anything about yet has no row, and stands at
    // the defaults. When the captain saw the default, write that row first so
    // the compare-and-set below has a row to compare. (When they saw anything
    // else, a missing row is already a lost race.)
    const sawDefault =
      input.pass === "directed_ticket"
        ? input.from === DEFAULT_TICKET.directedTicket
        : input.from === DEFAULT_TICKET.earlyEntry;
    if (sawDefault) {
      await tx
        .insert(schema.campTickets)
        .values({
          userId: input.userId,
          cycle,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [schema.campTickets.userId, schema.campTickets.cycle],
        });
    }

    const where = and(
      eq(schema.campTickets.userId, input.userId),
      eq(schema.campTickets.cycle, cycle),
    );
    const rows =
      input.pass === "directed_ticket"
        ? await tx
            .update(schema.campTickets)
            .set({
              directedTicket: input.to,
              passesUpdatedByUserId: input.actorUserId,
              updatedAt: now,
            })
            .where(
              and(where, eq(schema.campTickets.directedTicket, input.from)),
            )
            .returning({ userId: schema.campTickets.userId })
        : await tx
            .update(schema.campTickets)
            .set({
              earlyEntry: input.to,
              passesUpdatedByUserId: input.actorUserId,
              updatedAt: now,
            })
            .where(and(where, eq(schema.campTickets.earlyEntry, input.from)))
            .returning({ userId: schema.campTickets.userId });
    if (rows.length === 0) return false;

    await writeAuditEvent(tx, {
      actorId: input.actorUserId,
      action: "ticket.pass_changed",
      target: input.userId,
      metadata: { cycle, pass: input.pass, from: input.from, to: input.to },
    });
    return true;
  });
}
