import { beforeEach, describe, expect, it, vi } from "vitest";

// The grid plan's actions (#256): only a captain or a Power & Lighting lead,
// a Kitchen lead refused before the facade; the actor comes from the gate.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/power-site", () => ({
  addGridNode: vi.fn(async () => ({ ok: true, id: "node-1" })),
  updateGridNode: vi.fn(async () => ({ ok: true })),
  removeGridNode: vi.fn(async () => ({ ok: true })),
  assignLoadToGridNode: vi.fn(async () => ({ ok: true })),
  copyLastYearGrid: vi.fn(async () => ({ ok: true, count: 4 })),
}));

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import { POWER_GRID_PATH, POWER_REFUSAL } from "@/lib/power-copy";
import {
  addGridNode,
  assignLoadToGridNode,
  copyLastYearGrid,
} from "@/lib/power-site";
import { getLeadTeams } from "@/lib/users";
import {
  addGridNodeAction,
  assignLoadAction,
  copyLastYearGridAction,
} from "./actions";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const LOAD = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const LADDER: ViewerRank[] = ["camp_member", "team_lead", "captain"];

function actAs(rank: ViewerRank, led: string[] = [], id = "user-1") {
  vi.mocked(captainActionGate).mockImplementation(async (required, refusal) =>
    LADDER.indexOf(rank) >= LADDER.indexOf(required)
      ? { ok: true, campUser: { id } as never, rank }
      : { ok: false, error: refusal ?? "refused" },
  );
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

beforeEach(() => {
  vi.clearAllMocks();
  actAs("captain", [], "captain-1");
});

describe("grid actions", () => {
  it("refuse a Kitchen lead before the facade", async () => {
    actAs("team_lead", ["kitchen"]);
    expect(
      await addGridNodeAction({ name: "Genny", kind: "generator" }),
    ).toEqual({ ok: false, error: POWER_REFUSAL });
    expect(await assignLoadAction({ loadId: LOAD, nodeId: ID })).toEqual({
      ok: false,
      error: POWER_REFUSAL,
    });
    expect(await copyLastYearGridAction()).toEqual({
      ok: false,
      error: POWER_REFUSAL,
    });
    expect(addGridNode).not.toHaveBeenCalled();
    expect(assignLoadToGridNode).not.toHaveBeenCalled();
    expect(copyLastYearGrid).not.toHaveBeenCalled();
  });

  it("add a point as the signed-in captain", async () => {
    expect(
      await addGridNodeAction({
        name: "Kitchen",
        kind: "end_point",
        parentId: ID,
        cableRatedAmps: 10,
        actorId: "spoof",
      }),
    ).toEqual({ ok: true, data: { id: "node-1" } });
    expect(addGridNode).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Kitchen",
        parentId: ID,
        cableRatedAmps: 10,
        actorId: "captain-1",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(POWER_GRID_PATH);
  });

  it("give the schema's sentence for a point with no feed", async () => {
    expect(
      await addGridNodeAction({ name: "Kitchen", kind: "end_point" }),
    ).toEqual({ ok: false, error: "Say which point feeds it." });
    expect(addGridNode).not.toHaveBeenCalled();
  });

  it("take a load off the grid with null", async () => {
    actAs("team_lead", ["power_and_lighting"], "lead-1");
    expect(await assignLoadAction({ loadId: LOAD, nodeId: null })).toEqual({
      ok: true,
    });
    expect(assignLoadToGridNode).toHaveBeenCalledWith({
      loadId: LOAD,
      nodeId: null,
      actorId: "lead-1",
    });
  });
});
