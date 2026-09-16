import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { useTestDb } from "./_harness";
import { makeUser } from "./_factories";
import { mutateTeamsConfig, renameTeam } from "../camp-config";
import * as schema from "../schema";

// A team settings change and its audit row share one transaction, on real rows.

describe("mutateTeamsConfig with an audit event", () => {
  const h = useTestDb();

  async function auditRows(action: string) {
    return h
      .db()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, action));
  }

  it("writes the change and its audit row together", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });

    const next = await mutateTeamsConfig(
      (config) => renameTeam(config, "kitchen", "Cuisine"),
      {
        actorId: captain.id,
        action: "camp.teams.renamed",
        target: "kitchen",
        metadata: { label: "Cuisine" },
      },
    );

    expect(next.teams.find((t) => t.key === "kitchen")?.label).toBe("Cuisine");
    expect(await auditRows("camp.teams.renamed")).toEqual([
      expect.objectContaining({
        actorId: captain.id,
        target: "kitchen",
        metadata: { label: "Cuisine" },
      }),
    ]);
  });

  it("writes neither when the change is refused", async () => {
    const captain = await makeUser(h.db(), { rank: "captain" });

    await expect(
      mutateTeamsConfig(
        () => {
          throw new Error("refused inside the lock");
        },
        {
          actorId: captain.id,
          action: "camp.teams.archived",
          target: "kitchen",
        },
      ),
    ).rejects.toThrow("refused inside the lock");

    expect(await auditRows("camp.teams.archived")).toEqual([]);
  });
});
