import { beforeEach, describe, expect, it, vi } from "vitest";

// The refuelling page's actions (#255). What matters here:
//  1. Only a captain or a lead of Power & Lighting: a lead of another team
//     (Kitchen) and a member are refused before the facade is called.
//  2. Every write names the signed-in actor and nothing else: an actorId in
//     the input is never used.
//  3. The log has no edit and no delete action: a correction and a strike-out
//     are new entries.
//  4. The low-fuel warning sends only its own field, checked merged onto the
//     current plan.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/power", () => ({
  getPowerPlan: vi.fn(),
  setPowerPlan: vi.fn(async () => ({ ok: true, version: 4 })),
}));
vi.mock("@/lib/power-site", () => ({
  addFuelCans: vi.fn(async () => ({ ok: true, count: 3 })),
  updateFuelCan: vi.fn(async () => ({ ok: true })),
  removeFuelCan: vi.fn(async () => ({ ok: true })),
  logRefuel: vi.fn(async () => ({ ok: true, id: "entry-1" })),
  correctRefuel: vi.fn(async () => ({ ok: true, id: "entry-2" })),
  strikeRefuel: vi.fn(async () => ({ ok: true, id: "entry-3" })),
}));

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import { getPowerPlan, setPowerPlan } from "@/lib/power";
import { POWER_FUEL_LOG_PATH, POWER_REFUSAL } from "@/lib/power-copy";
import {
  addFuelCans,
  correctRefuel,
  logRefuel,
  strikeRefuel,
} from "@/lib/power-site";
import { getLeadTeams } from "@/lib/users";
import * as actions from "./actions";

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

const REFUEL = {
  generatorId: ID,
  refuelledAt: "2027-04-25T06:00",
  litres: 10,
  fromCanId: ID,
  doneByUserId: "member-9",
};

const PLAN = {
  cycle: 2026,
  generatorId: ID,
  secondGeneratorNote: null,
  powerFactor: 0.8,
  daysOnSite: 11,
  firstPoweredDay: null,
  runFromHour: null,
  runToHour: null,
  lowLoadFactor: 1,
  safetyMarginPct: 20,
  canLitres: 20,
  cansOwned: 0,
  lowFuelDays: 2,
  version: 3,
  updatedAt: new Date("2026-09-20T08:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPowerPlan).mockResolvedValue(PLAN);
  actAs("team_lead", ["power_and_lighting"], "lead-1");
});

describe("who may act", () => {
  const calls: [string, () => Promise<{ ok: boolean }>][] = [
    [
      "addFuelCansAction",
      () =>
        actions.addFuelCansAction({
          count: 1,
          capacityLitres: 20,
          litres: 20,
          location: "storage",
        }),
    ],
    ["logRefuelAction", () => actions.logRefuelAction(REFUEL)],
    [
      "correctRefuelAction",
      () => actions.correctRefuelAction({ ...REFUEL, correctsEntryId: ID }),
    ],
    ["strikeRefuelAction", () => actions.strikeRefuelAction({ entryId: ID })],
    [
      "saveLowFuelDaysAction",
      () =>
        actions.saveLowFuelDaysAction({ lowFuelDays: 3, expectedVersion: 3 }),
    ],
  ];

  it.each(calls)("%s refuses a Kitchen lead and a member", async (_n, call) => {
    for (const [rank, led] of [
      ["team_lead", ["kitchen"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await call()).toEqual({ ok: false, error: POWER_REFUSAL });
    }
    expect(addFuelCans).not.toHaveBeenCalled();
    expect(logRefuel).not.toHaveBeenCalled();
    expect(correctRefuel).not.toHaveBeenCalled();
    expect(strikeRefuel).not.toHaveBeenCalled();
    expect(setPowerPlan).not.toHaveBeenCalled();
  });
});

describe("logRefuelAction", () => {
  it("names the signed-in actor, never one from the input", async () => {
    const result = await actions.logRefuelAction({
      ...REFUEL,
      actorId: "someone-else",
    });
    expect(result).toEqual({ ok: true, data: { id: "entry-1" } });
    expect(logRefuel).toHaveBeenCalledWith({
      ...REFUEL,
      hourMeter: null,
      note: null,
      fromPaper: false,
      actorId: "lead-1",
    });
    expect(revalidatePath).toHaveBeenCalledWith(POWER_FUEL_LOG_PATH);
  });

  it("returns the schema's sentence and writes nothing", async () => {
    expect(await actions.logRefuelAction({ ...REFUEL, litres: 0 })).toEqual({
      ok: false,
      error: "Give the litres put in.",
    });
    expect(logRefuel).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes on the write's refusal as it is", async () => {
    vi.mocked(logRefuel).mockResolvedValueOnce({
      ok: false,
      error: "That can holds only 4 L.",
    });
    expect(await actions.logRefuelAction(REFUEL)).toEqual({
      ok: false,
      error: "That can holds only 4 L.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("the log is append-only", () => {
  it("has no action that edits or deletes an entry", () => {
    const names = Object.keys(actions);
    expect(names.filter((n) => /refuel/i.test(n)).sort()).toEqual([
      "correctRefuelAction",
      "logRefuelAction",
      "strikeRefuelAction",
    ]);
  });
});

describe("saveLowFuelDaysAction", () => {
  it("sends only the warning's days, against the plan's version", async () => {
    expect(
      await actions.saveLowFuelDaysAction({
        lowFuelDays: 3,
        expectedVersion: 3,
        daysOnSite: 1,
      }),
    ).toEqual({ ok: true, data: { version: 4 } });
    expect(setPowerPlan).toHaveBeenCalledWith({
      actorId: "lead-1",
      patch: { lowFuelDays: 3 },
      expectedVersion: 3,
    });
  });

  it("refuses a negative number of days with the schema's sentence", async () => {
    expect(
      await actions.saveLowFuelDaysAction({
        lowFuelDays: -1,
        expectedVersion: 3,
      }),
    ).toEqual({ ok: false, error: "Use 0 days or more." });
    expect(setPowerPlan).not.toHaveBeenCalled();
  });
});
