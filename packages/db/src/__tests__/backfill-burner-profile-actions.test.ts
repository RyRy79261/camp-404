import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as schema from "../schema";
import { useTestDb } from "./_harness";
import { makeUser, requiredActionsFor } from "./_factories";

// The data migration that seeds burner_profile required actions for members
// who joined before signup seeding. The harness applies every migration to an
// empty database, so these tests add the rows first and then run the
// migration's own SQL again, on real rows.

const BACKFILL_SQL = readFileSync(
  new URL(
    "../../migrations/0029_backfill_burner_profile_actions.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("0029_backfill_burner_profile_actions", () => {
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

    await h.client().exec(BACKFILL_SQL);

    const [done] = await requiredActionsFor(h.db(), finished.id);
    expect(done).toMatchObject({
      type: "questionnaire",
      actionKey: "burner_profile",
      title: "Complete your burner profile",
      status: "completed",
      completedAt: finishedAt,
    });
    const [open] = await requiredActionsFor(h.db(), unfinished.id);
    expect(open).toMatchObject({
      actionKey: "burner_profile",
      status: "pending",
      version: null,
      blocking: true,
      completedAt: null,
    });
    expect(await requiredActionsFor(h.db(), system.id)).toEqual([]);
    expect(await requiredActionsFor(h.db(), erased.id)).toEqual([]);
  });

  it("leaves an existing row alone, so running it twice changes nothing", async () => {
    const member = await makeUser(h.db());
    await h.db().insert(schema.requiredActions).values({
      userId: member.id,
      type: "questionnaire",
      actionKey: "burner_profile",
      title: "Complete your burner profile",
      version: "2026.06.04-v9",
    });

    await h.client().exec(BACKFILL_SQL);
    await h.client().exec(BACKFILL_SQL);

    const rows = await requiredActionsFor(h.db(), member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.version).toBe("2026.06.04-v9");
  });
});
