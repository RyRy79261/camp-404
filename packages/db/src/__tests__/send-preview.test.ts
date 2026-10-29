import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeActivation, makeMembership, makeUser } from "./_factories";
import { openActivation, previewSendAudience } from "../activations";
import { setFoundingYear } from "../cycle-rollover";
import { currentCycleNumber } from "../cycles";
import * as schema from "../schema";

// The questionnaire Send screen's count is the recipients module's answer for
// the year the send will freeze, so it agrees with who the send then gates:
// that year's team, and that year's "Not coming", never another year's.

type DB = ReturnType<ReturnType<typeof useTestDb>["db"]>;

async function said(db: DB, userId: string, cycle: number, no: boolean) {
  await db.insert(schema.campParticipations).values({
    userId,
    cycle,
    status: no ? "not_attending" : "applied",
    intent: no ? "no" : "yes",
  });
}

describe("previewSendAudience", () => {
  const h = useTestDb();

  it("counts who the send then gates, for the send's year", async () => {
    const db = h.db();
    const captain = await makeUser(db, { rank: "captain" });
    expect(
      (await setFoundingYear({ year: 2027, actorUserId: captain.id })).ok,
    ).toBe(true);
    const year = await currentCycleNumber();
    expect(year).toBe(2027);
    const before = year - 1;

    // On the kitchen this year.
    const ayanda = await makeUser(db, { displayName: "Ayanda" });
    await makeMembership(db, {
      userId: ayanda.id,
      team: "kitchen",
      cycle: year,
    });
    // Said Not coming LAST year only: still reached this year.
    const bea = await makeUser(db, { displayName: "Bea" });
    await makeMembership(db, { userId: bea.id, team: "kitchen", cycle: year });
    await said(db, bea.id, before, true);
    await said(db, bea.id, year, false);
    // Said Not coming THIS year: left out, by name.
    const tash = await makeUser(db, { displayName: "Tash" });
    await makeMembership(db, { userId: tash.id, team: "kitchen", cycle: year });
    await said(db, tash.id, year, true);
    // On the kitchen last year only: not in this year's team.
    const cara = await makeUser(db, { displayName: "Cara" });
    await makeMembership(db, {
      userId: cara.id,
      team: "kitchen",
      cycle: before,
    });

    const preview = await previewSendAudience({
      scope: "team",
      team: "kitchen",
      targetUserIds: [],
    });
    expect(preview).toEqual({
      reaches: 2,
      notComing: [{ id: tash.id, name: "Tash" }],
    });

    const act = await makeActivation(db, {
      scope: "team",
      team: "kitchen",
      cycle: year,
    });
    expect(await openActivation(act.id)).toEqual({
      ok: true,
      created: preview.reaches,
    });
    const gated = await db
      .select({ userId: schema.requiredActions.userId })
      .from(schema.requiredActions);
    expect(gated.map((g) => g.userId).sort()).toEqual(
      [ayanda.id, bea.id].sort(),
    );
  });
});
