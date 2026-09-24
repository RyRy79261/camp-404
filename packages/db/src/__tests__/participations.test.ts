import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AuditAction } from "@camp404/core";
import {
  PARTICIPATION_INTENTS,
  PARTICIPATION_STATUSES,
  type ParticipationIntent,
  type ParticipationStatus,
} from "@camp404/types";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { withTransaction } from "../index";
import {
  applyParticipationIntent,
  ATTENDANCE_EDIT_KEY,
  decideParticipation,
  getParticipation,
  saveParticipationIntent,
} from "../participations";
import * as schema from "../schema";

// camp_participations against real Postgres: the production writers, the
// compare-and-set and the audit rows they must (and must not) write.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

// Typed from the audit list, so a misspelt key does not compile and match
// nothing.
const WITHDRAWN: AuditAction = "participation.withdrawn";
const DECIDED: AuditAction = "participation.decided";

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

async function seed(
  db: DB,
  userId: string,
  status: ParticipationStatus,
  cycle = 2027,
): Promise<void> {
  await db.insert(schema.campParticipations).values({ userId, cycle, status });
}

async function statusOf(
  db: DB,
  userId: string,
  cycle = 2027,
): Promise<ParticipationStatus | null> {
  const [row] = await db
    .select({ status: schema.campParticipations.status })
    .from(schema.campParticipations)
    .where(
      and(
        eq(schema.campParticipations.userId, userId),
        eq(schema.campParticipations.cycle, cycle),
      ),
    );
  return row?.status ?? null;
}

async function auditRows(db: DB, action: AuditAction) {
  return db
    .select()
    .from(schema.auditLog)
    .where(eq(schema.auditLog.action, action));
}

function answer(userId: string, intent: ParticipationIntent, cycle = 2027) {
  return withTransaction((tx) =>
    applyParticipationIntent(tx, { userId, cycle, intent }),
  );
}

// Where each (status, answer) lands, written out rather than recomputed from
// the rule, so this suite checks the stored row and not the rule against
// itself.
const LANDS: Record<
  ParticipationStatus,
  Record<ParticipationIntent, ParticipationStatus>
> = {
  applied: { yes: "applied", maybe: "maybe", no: "not_attending" },
  maybe: { yes: "applied", maybe: "maybe", no: "not_attending" },
  accepted: { yes: "accepted", maybe: "accepted", no: "not_attending" },
  waitlisted: { yes: "waitlisted", maybe: "waitlisted", no: "not_attending" },
  not_attending: { yes: "applied", maybe: "maybe", no: "not_attending" },
};

describe("applyParticipationIntent", () => {
  const h = useTestDb();

  it("records a first answer of the year as a new row", async () => {
    const db = h.db();
    const first: Record<ParticipationIntent, ParticipationStatus> = {
      yes: "applied",
      maybe: "maybe",
      no: "not_attending",
    };
    for (const intent of PARTICIPATION_INTENTS) {
      const member = await makeUser(db);
      const result = await answer(member.id, intent);
      expect(result).toEqual({
        status: first[intent],
        changed: true,
        withdrew: false,
      });
      expect(await statusOf(db, member.id)).toBe(first[intent]);
    }
    expect(await auditRows(db, WITHDRAWN)).toHaveLength(0);
  });

  it("moves every status by every answer as the rule says", async () => {
    const db = h.db();
    for (const from of PARTICIPATION_STATUSES) {
      for (const intent of PARTICIPATION_INTENTS) {
        const member = await makeUser(db);
        await seed(db, member.id, from);
        const result = await answer(member.id, intent);
        const to = LANDS[from][intent];
        expect(result.status, `${from} + ${intent}`).toBe(to);
        expect(result.changed, `${from} + ${intent}`).toBe(to !== from);
        expect(await statusOf(db, member.id), `${from} + ${intent}`).toBe(to);
      }
    }
  });

  it("leaves an accepted or waitlisted place alone on Yes or Maybe, with no audit row", async () => {
    const db = h.db();
    for (const held of ["accepted", "waitlisted"] as const) {
      for (const intent of ["yes", "maybe"] as const) {
        const member = await makeUser(db);
        await seed(db, member.id, held);
        const [before] = await db
          .select()
          .from(schema.campParticipations)
          .where(eq(schema.campParticipations.userId, member.id));

        expect(await answer(member.id, intent)).toEqual({
          status: held,
          changed: false,
          withdrew: false,
        });
        const [after] = await db
          .select()
          .from(schema.campParticipations)
          .where(eq(schema.campParticipations.userId, member.id));
        // Not even updated_at moved: nothing was written.
        expect(after).toEqual(before);
      }
    }
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
  });

  it("writes exactly one withdrawal audit row when No takes an accepted member off", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await seed(db, member.id, "accepted");

    expect(await answer(member.id, "no")).toEqual({
      status: "not_attending",
      changed: true,
      withdrew: true,
    });
    // Answering No again changes nothing and audits nothing more.
    expect(await answer(member.id, "no")).toMatchObject({ changed: false });

    const rows = await auditRows(db, WITHDRAWN);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: member.id,
      target: member.id,
      metadata: { cycle: 2027, from: "accepted" },
    });
    expect(await db.select().from(schema.auditLog)).toHaveLength(1);
  });

  it("does not audit a No from a member who held no place", async () => {
    const db = h.db();
    for (const from of ["applied", "maybe"] as const) {
      const member = await makeUser(db);
      await seed(db, member.id, from);
      expect(await answer(member.id, "no")).toMatchObject({ withdrew: false });
    }
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
  });

  it("touches only the year it is given", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await seed(db, member.id, "accepted", 2026);

    await answer(member.id, "no", 2027);
    expect(await statusOf(db, member.id, 2026)).toBe("accepted");
    expect(await statusOf(db, member.id, 2027)).toBe("not_attending");
    expect(await auditRows(db, WITHDRAWN)).toHaveLength(0);
  });
});

describe("saveParticipationIntent", () => {
  const h = useTestDb();

  it("saves the answer and its change-log entry together", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await seed(db, member.id, "applied");

    const result = await saveParticipationIntent({
      userId: member.id,
      cycle: 2027,
      intent: "maybe",
      edit: {
        version: "1",
        editedByUserId: member.id,
        changes: [
          {
            fieldId: "attendance",
            label: "Coming this year?",
            from: "Yes",
            to: "Maybe",
          },
        ],
      },
    });

    expect(result).toEqual({ status: "maybe", changed: true, withdrew: false });
    const edits = await db.select().from(schema.questionnaireEdits);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({
      userId: member.id,
      questionnaireKey: ATTENDANCE_EDIT_KEY,
      version: "1",
    });
  });

  it("writes no change-log entry when there is none to write", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await saveParticipationIntent({
      userId: member.id,
      cycle: 2027,
      intent: "yes",
      edit: null,
    });
    expect(await statusOf(db, member.id)).toBe("applied");
    expect(await db.select().from(schema.questionnaireEdits)).toHaveLength(0);
  });
});

describe("decideParticipation", () => {
  const h = useTestDb();

  it("wins once, then loses a second call made from the same status", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await foundedAt(db, 2027);
    await seed(db, member.id, "applied");

    const input = {
      userId: member.id,
      from: "applied" as const,
      to: "accepted" as const,
      decidedByUserId: captain.id,
    };
    expect(await decideParticipation(input)).toBe(true);
    // A second captain working from the same screen: the row is no longer
    // `applied`, so nothing is overwritten and nothing more is audited.
    expect(await decideParticipation(input)).toBe(false);

    const [row] = await db
      .select()
      .from(schema.campParticipations)
      .where(eq(schema.campParticipations.userId, member.id));
    expect(row).toMatchObject({
      status: "accepted",
      decidedByUserId: captain.id,
      reason: null,
    });
    expect(row!.decidedAt).toBeInstanceOf(Date);

    const audit = await auditRows(db, DECIDED);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: captain.id,
      target: member.id,
      metadata: { cycle: 2027, from: "applied", to: "accepted" },
    });
  });

  it("decides this year's row only", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await foundedAt(db, 2027);
    await seed(db, member.id, "applied", 2026);

    expect(
      await decideParticipation({
        userId: member.id,
        from: "applied",
        to: "waitlisted",
        decidedByUserId: captain.id,
      }),
    ).toBe(false);
    expect(await statusOf(db, member.id, 2026)).toBe("applied");
    expect(await auditRows(db, DECIDED)).toHaveLength(0);
  });

  it("refuses to accept a member who said No", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    const member = await makeUser(db);
    await foundedAt(db, 2027);
    await seed(db, member.id, "not_attending");

    await expect(
      decideParticipation({
        userId: member.id,
        from: "not_attending",
        to: "accepted",
        decidedByUserId: captain.id,
      }),
    ).rejects.toThrow(/not a decision/);
    expect(await statusOf(db, member.id)).toBe("not_attending");
    expect(await db.select().from(schema.auditLog)).toHaveLength(0);
  });
});

describe("getParticipation", () => {
  const h = useTestDb();

  it("reads the member's row for the year asked, or null", async () => {
    const db = h.db();
    const member = await makeUser(db);
    await seed(db, member.id, "maybe", 2026);

    expect(await getParticipation(member.id, 2026)).toMatchObject({
      userId: member.id,
      cycle: 2026,
      status: "maybe",
    });
    expect(await getParticipation(member.id, 2027)).toBeNull();
  });
});
