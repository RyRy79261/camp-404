import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import { useTestDb } from "./_harness";
import { makeUser, requiredActionsFor } from "./_factories";
import { backfillBurnerProfileActions } from "../maintenance";

// The one-off seed of burner_profile required actions for members who joined
// before signup seeding, on real rows.

describe("backfillBurnerProfileActions", () => {
  const h = useTestDb();

  it("gates an unfinished member and never re-gates a finished one", async () => {
    const finishedAt = new Date("2026-03-01T10:00:00Z");
    const finished = await makeUser(h.db());
    await h.db().insert(schema.burnerProfiles).values({
      userId: finished.id,
      version: "old",
      responses: {},
      completedAt: finishedAt,
    });
    const unfinished = await makeUser(h.db());
    const system = await makeUser(h.db(), { isSystem: true });
    const erased = await makeUser(h.db(), { sanitised: true });

    expect(await backfillBurnerProfileActions()).toEqual({
      scanned: 2,
      seededPending: 1,
      seededCompleted: 1,
    });

    const [done] = await requiredActionsFor(h.db(), finished.id);
    expect(done).toMatchObject({
      actionKey: "burner_profile",
      status: "completed",
      completedAt: finishedAt,
    });
    const [open] = await requiredActionsFor(h.db(), unfinished.id);
    expect(open).toMatchObject({
      actionKey: "burner_profile",
      status: "pending",
      version: null,
      blocking: true,
    });
    expect(await requiredActionsFor(h.db(), system.id)).toEqual([]);
    expect(await requiredActionsFor(h.db(), erased.id)).toEqual([]);
  });

  it("leaves an existing row alone, so a second run seeds nothing", async () => {
    const member = await makeUser(h.db());
    await h.db().insert(schema.requiredActions).values({
      userId: member.id,
      type: "questionnaire",
      actionKey: "burner_profile",
      title: "Complete your burner profile",
      version: "2026.06.04-v9",
    });

    expect(await backfillBurnerProfileActions()).toEqual({
      scanned: 1,
      seededPending: 0,
      seededCompleted: 0,
    });
    const [row] = await requiredActionsFor(h.db(), member.id);
    expect(row?.version).toBe("2026.06.04-v9");
  });
});
