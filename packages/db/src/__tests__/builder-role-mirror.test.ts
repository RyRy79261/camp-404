import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeActivation, makeUser } from "./_factories";
import { completeBuilderResponse } from "../activations";
import * as schema from "../schema";

// A camp-authored Dietary or Transport questionnaire writes the facts the app
// already reads: dietary_requirements, and this year's driver_profiles row.

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
      driver: { intendsToDrive: true },
    });
    await submit(member.id, act.id, {
      dietary: null,
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
  });
});
