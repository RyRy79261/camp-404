import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { AuditAction } from "@camp404/core";
import type { ParticipationStatus } from "@camp404/types";
import { useTestDb } from "./_harness";
import { addTarget, makeActivation, makeUser } from "./_factories";
import { completeBuilderResponse } from "../activations";
import * as schema from "../schema";

// A camp-authored Dietary or Transport questionnaire writes the facts the app
// already reads: dietary_requirements, and this year's driver_profiles row. A
// "Coming this year?" answer sets the member's camp_participations row.

describe("completeBuilderResponse with role answers", () => {
  const h = useTestDb();

  async function submit(
    userId: string,
    activationId: string,
    mirror: Parameters<typeof completeBuilderResponse>[0]["mirror"],
    cycle = 2027,
  ) {
    await completeBuilderResponse({
      userId,
      definitionKey: "transport",
      definitionVersion: "2",
      cycle,
      responses: {},
      activationId,
      mirror,
    });
  }

  it("creates the dietary row, then updates only the columns it has", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const act = await makeActivation(db, { questionnaireKey: "transport" });
    await db.insert(schema.dietaryRequirements).values({
      userId: member.id,
      version: "mcp",
      intolerances: "Lactose",
      notes: "Old note",
    });

    await submit(member.id, act.id, {
      dietary: { allergies: "Peanuts", isAnaphylactic: true },
      driver: null,
      participation: null,
    });

    const [row] = await db
      .select()
      .from(schema.dietaryRequirements)
      .where(eq(schema.dietaryRequirements.userId, member.id));
    expect(row).toMatchObject({
      allergies: "Peanuts",
      isAnaphylactic: true,
      intolerances: "Lactose",
      notes: "Old note",
      version: "transport@2",
    });
    expect(row!.completedAt).toBeInstanceOf(Date);
  });

  it("writes the driver row for the send's year and records when intent was given", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const act = await makeActivation(db, { questionnaireKey: "transport" });
    await db.insert(schema.driverProfiles).values({
      userId: member.id,
      cycle: 2026,
      intendsToDrive: true,
      version: "mcp",
    });

    await submit(member.id, act.id, {
      dietary: null,
      participation: null,
      driver: {
        intendsToDrive: true,
        arrivalAt: new Date("2027-04-26T00:00:00.000Z"),
      },
    });

    const rows = await db
      .select()
      .from(schema.driverProfiles)
      .where(eq(schema.driverProfiles.userId, member.id));
    const thisYear = rows.find((r) => r.cycle === 2027)!;
    expect(thisYear).toMatchObject({
      intendsToDrive: true,
      arrivalAt: new Date("2027-04-26T00:00:00.000Z"),
      version: "transport@2",
    });
    expect(thisYear.intentRegisteredAt).toBeInstanceOf(Date);
    // Last year's row is untouched.
    expect(rows.find((r) => r.cycle === 2026)).toMatchObject({
      intendsToDrive: true,
      version: "mcp",
    });
  });

  it("clears driving intent on a later submit that says no", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const act = await makeActivation(db, { questionnaireKey: "transport" });
    await submit(member.id, act.id, {
      dietary: null,
      participation: null,
      driver: { intendsToDrive: true },
    });
    await submit(member.id, act.id, {
      dietary: null,
      participation: null,
      driver: { intendsToDrive: false },
    });

    const [row] = await db
      .select({ intendsToDrive: schema.driverProfiles.intendsToDrive })
      .from(schema.driverProfiles)
      .where(
        and(
          eq(schema.driverProfiles.userId, member.id),
          eq(schema.driverProfiles.cycle, 2027),
        ),
      );
    expect(row).toEqual({ intendsToDrive: false });
  });

  it("writes neither table without role answers", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const act = await makeActivation(db, { questionnaireKey: "transport" });
    await submit(member.id, act.id, undefined);

    expect(await db.select().from(schema.dietaryRequirements)).toEqual([]);
    expect(await db.select().from(schema.driverProfiles)).toEqual([]);
    expect(await db.select().from(schema.campParticipations)).toEqual([]);
  });
});

describe("completeBuilderResponse with a Coming this year answer", () => {
  const h = useTestDb();
  type DB = ReturnType<typeof h.db>;
  const WITHDRAWN: AuditAction = "participation.withdrawn";

  /** The camp's live year is 2028; every send below was frozen at 2027. */
  async function liveYear2028(db: DB) {
    await db
      .insert(schema.campSettings)
      .values({ id: true })
      .onConflictDoNothing({ target: schema.campSettings.id });
    const [row] = await db
      .select({ config: schema.campSettings.config })
      .from(schema.campSettings);
    await db
      .update(schema.campSettings)
      .set({
        config: {
          ...row!.config,
          cycles: [
            {
              year: 2028,
              startedAt: "2028-01-01T00:00:00.000Z",
              endedAt: null,
            },
          ],
        },
      })
      .where(eq(schema.campSettings.id, true));
  }

  async function sendTo(db: DB, userId: string) {
    const act = await makeActivation(db, {
      questionnaireKey: "coming-this-year",
      cycle: 2027,
      blocking: true,
    });
    await addTarget(db, act.id, userId);
    await db.insert(schema.requiredActions).values({
      userId,
      actionKey: "coming-this-year",
      type: "questionnaire",
      title: "Coming this year?",
      version: "1",
      activationId: act.id,
      blocking: true,
    });
    return act;
  }

  async function answer(
    userId: string,
    activationId: string,
    intent: "yes" | "maybe" | "no",
  ) {
    await completeBuilderResponse({
      userId,
      definitionKey: "coming-this-year",
      definitionVersion: "1",
      cycle: 2027,
      responses: { coming: intent },
      activationId,
      mirror: { dietary: null, driver: null, participation: { intent } },
    });
  }

  async function places(db: DB, userId: string) {
    return db
      .select({
        cycle: schema.campParticipations.cycle,
        status: schema.campParticipations.status,
      })
      .from(schema.campParticipations)
      .where(eq(schema.campParticipations.userId, userId));
  }

  it("records the answer for the send's year, not the live one, and clears the gate", async () => {
    const db = h.db();
    await liveYear2028(db);
    const member = await makeUser(db);
    const act = await sendTo(db, member.id);

    await answer(member.id, act.id, "yes");

    expect(await places(db, member.id)).toEqual([
      { cycle: 2027, status: "applied" },
    ]);
    const [gate] = await db
      .select({ status: schema.requiredActions.status })
      .from(schema.requiredActions)
      .where(eq(schema.requiredActions.userId, member.id));
    expect(gate).toEqual({ status: "completed" });
  });

  it("takes an accepted member off on No, with one withdrawal audit row", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const act = await sendTo(db, member.id);
    await db.insert(schema.campParticipations).values({
      userId: member.id,
      cycle: 2027,
      status: "accepted" satisfies ParticipationStatus,
    });

    await answer(member.id, act.id, "no");

    expect(await places(db, member.id)).toEqual([
      { cycle: 2027, status: "not_attending" },
    ]);
    const audits = await db
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, WITHDRAWN));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: member.id,
      target: member.id,
      metadata: { cycle: 2027, from: "accepted" },
    });
  });

  it("leaves an accepted place alone on Maybe", async () => {
    const db = h.db();
    const member = await makeUser(db);
    const act = await sendTo(db, member.id);
    await db.insert(schema.campParticipations).values({
      userId: member.id,
      cycle: 2027,
      status: "accepted",
    });
    const before = await db.select().from(schema.campParticipations);

    await answer(member.id, act.id, "maybe");

    expect(await db.select().from(schema.campParticipations)).toEqual(before);
    expect(await db.select().from(schema.auditLog)).toEqual([]);
  });
});
