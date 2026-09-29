import { beforeEach, describe, expect, it, vi } from "vitest";

// The readiness page's actions (#257): only a captain or a Power & Lighting
// lead, a Kitchen lead refused before the facade; the actor comes from the
// gate; the agreement refuses a phone number for the contact.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/power-site", () => ({
  startReadinessChecklist: vi.fn(async () => ({ ok: true, count: 9 })),
  addReadinessItem: vi.fn(async () => ({ ok: true, id: "item-1" })),
  updateReadinessItem: vi.fn(async () => ({ ok: true })),
  tickReadinessItem: vi.fn(async () => ({ ok: true })),
  removeReadinessItem: vi.fn(async () => ({ ok: true })),
  addWorkPlanToBoard: vi.fn(async () => ({
    ok: true,
    count: 6,
    fromCycle: null,
  })),
  saveSharingAgreement: vi.fn(async () => ({ ok: true, version: 1 })),
  removeSharingAgreement: vi.fn(async () => ({ ok: true })),
}));

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import { POWER_READINESS_PATH, POWER_REFUSAL } from "@/lib/power-copy";
import {
  addWorkPlanToBoard,
  saveSharingAgreement,
  startReadinessChecklist,
  tickReadinessItem,
} from "@/lib/power-site";
import { getLeadTeams } from "@/lib/users";
import {
  addWorkPlanAction,
  saveSharingAction,
  startChecklistAction,
  tickReadinessItemAction,
} from "./actions";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const LADDER: ViewerRank[] = ["camp_member", "team_lead", "captain"];

function actAs(rank: ViewerRank, led: string[] = [], id = "user-1") {
  vi.mocked(captainActionGate).mockImplementation(async (required, refusal) =>
    LADDER.indexOf(rank) >= LADDER.indexOf(required)
      ? { ok: true, campUser: { id } as never, rank }
      : { ok: false, error: refusal ?? "refused" },
  );
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

const AGREEMENT = {
  partnerCamp: "Camp Moonbeam",
  contactRole: "their power lead",
  generatorSource: "ours",
  generatorId: ID,
  watchCover: "They cover 00:00–08:00",
  expectedVersion: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  actAs("team_lead", ["power_and_lighting"], "lead-1");
});

describe("readiness actions", () => {
  it("refuse a Kitchen lead before the facade", async () => {
    actAs("team_lead", ["kitchen"]);
    expect(await startChecklistAction({ generatorId: ID })).toEqual({
      ok: false,
      error: POWER_REFUSAL,
    });
    expect(await tickReadinessItemAction({ itemId: ID, done: true })).toEqual({
      ok: false,
      error: POWER_REFUSAL,
    });
    expect(await addWorkPlanAction()).toEqual({
      ok: false,
      error: POWER_REFUSAL,
    });
    expect(await saveSharingAction(AGREEMENT)).toEqual({
      ok: false,
      error: POWER_REFUSAL,
    });
    expect(startReadinessChecklist).not.toHaveBeenCalled();
    expect(tickReadinessItem).not.toHaveBeenCalled();
    expect(addWorkPlanToBoard).not.toHaveBeenCalled();
    expect(saveSharingAgreement).not.toHaveBeenCalled();
  });

  it("tick an item as the signed-in lead", async () => {
    expect(
      await tickReadinessItemAction({ itemId: ID, done: true, actorId: "x" }),
    ).toEqual({ ok: true });
    expect(tickReadinessItem).toHaveBeenCalledWith({
      itemId: ID,
      done: true,
      actorId: "lead-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith(POWER_READINESS_PATH);
  });

  it("put the work plan on the board and refresh the task board", async () => {
    expect(await addWorkPlanAction()).toEqual({
      ok: true,
      data: { count: 6, fromCycle: null },
    });
    expect(addWorkPlanToBoard).toHaveBeenCalledWith({ actorId: "lead-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/tasks");
  });

  it("refuse a phone number for the neighbour's contact", async () => {
    expect(
      await saveSharingAction({ ...AGREEMENT, contactRole: "082 555 1234" }),
    ).toEqual({
      ok: false,
      error: "Give a role, not a phone number or an email address.",
    });
    expect(saveSharingAgreement).not.toHaveBeenCalled();
  });

  it("save the agreement as the signed-in lead", async () => {
    expect(await saveSharingAction(AGREEMENT)).toEqual({
      ok: true,
      data: { version: 1 },
    });
    expect(saveSharingAgreement).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerCamp: "Camp Moonbeam",
        partnerFuelPct: null,
        actorId: "lead-1",
      }),
    );
  });
});
