import { beforeEach, describe, expect, it, vi } from "vitest";

// The logistics days' actions (#247). What matters here:
//  1. Setting days needs a captain or a lead of Transport and Logistics: a
//     lead of any other team is refused before the facade is called, although
//     their clearance is the global team_lead rung. A member is refused too.
//  2. Every write names the signed-in actor and nothing else.
//  3. What was typed is checked at the boundary.
// The rule is checked again inside each write (packages/db, on PGlite).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/logistics", () => ({
  saveLogisticsPhase: vi.fn(async () => ({ ok: true, calendar: "synced" })),
  clearLogisticsPhase: vi.fn(async () => ({ ok: true, calendar: "synced" })),
  setMyAttendance: vi.fn(async () => ({ ok: true, answer: "going" })),
  askForAttendance: vi.fn(async () => ({ ok: true, asked: 3, notified: 2 })),
}));
vi.mock("@/lib/background-work", () => ({ deliverAfterResponse: vi.fn() }));

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import { deliverAfterResponse } from "@/lib/background-work";
import {
  askForAttendance,
  clearLogisticsPhase,
  saveLogisticsPhase,
  setMyAttendance,
} from "@/lib/logistics";
import { ASK_REFUSAL, LOGISTICS_REFUSAL } from "@/lib/logistics-copy";
import { getLeadTeams } from "@/lib/users";
import {
  askForAttendanceAction,
  clearLogisticsPhaseAction,
  saveLogisticsPhaseAction,
  setMyAttendanceAction,
} from "./actions";

const LADDER: ViewerRank[] = ["camp_member", "team_lead", "captain"];

function actAs(rank: ViewerRank, led: string[] = [], id = "user-1") {
  vi.mocked(captainActionGate).mockImplementation(async (required, refusal) =>
    LADDER.indexOf(rank) >= LADDER.indexOf(required)
      ? { ok: true, campUser: { id } as never, rank }
      : { ok: false, error: refusal ?? "refused" },
  );
  vi.mocked(getLeadTeams).mockResolvedValue(led);
}

const BUILD = {
  phase: "build",
  startDate: "2027-04-24",
  endDate: "2027-04-26",
  place: " On site ",
  note: "",
  expectedVersion: 0,
};

describe("logistics actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a Transport and Logistics lead save, as themselves only", async () => {
    actAs("team_lead", ["transport_and_logistics"], "lead-1");
    expect(await saveLogisticsPhaseAction(BUILD)).toEqual({
      ok: true,
      data: { calendar: "synced" },
    });
    expect(saveLogisticsPhase).toHaveBeenCalledWith("lead-1", {
      phase: "build",
      startDate: "2027-04-24",
      endDate: "2027-04-26",
      place: "On site",
      note: null,
      expectedVersion: 0,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/logistics");
    expect(revalidatePath).toHaveBeenCalledWith("/calendar");
  });

  it("lets a captain save and clear", async () => {
    actAs("captain", [], "cap-1");
    expect((await saveLogisticsPhaseAction(BUILD)).ok).toBe(true);
    expect(
      await clearLogisticsPhaseAction({ phase: "build", expectedVersion: 1 }),
    ).toEqual({ ok: true, data: { calendar: "synced" } });
    expect(clearLogisticsPhase).toHaveBeenCalledWith("cap-1", {
      phase: "build",
      expectedVersion: 1,
    });
  });

  it("refuses a lead of another team before anything is written", async () => {
    actAs("team_lead", ["kitchen"]);
    expect(await saveLogisticsPhaseAction(BUILD)).toEqual({
      ok: false,
      error: LOGISTICS_REFUSAL,
    });
    expect(
      await clearLogisticsPhaseAction({ phase: "build", expectedVersion: 1 }),
    ).toEqual({ ok: false, error: LOGISTICS_REFUSAL });
    expect(saveLogisticsPhase).not.toHaveBeenCalled();
    expect(clearLogisticsPhase).not.toHaveBeenCalled();
  });

  it("refuses a member", async () => {
    actAs("camp_member", ["transport_and_logistics"]);
    expect(await saveLogisticsPhaseAction(BUILD)).toEqual({
      ok: false,
      error: LOGISTICS_REFUSAL,
    });
    expect(saveLogisticsPhase).not.toHaveBeenCalled();
  });

  it("says what is wrong with the days, and writes nothing", async () => {
    actAs("captain");
    expect(
      await saveLogisticsPhaseAction({ ...BUILD, endDate: "2027-04-20" }),
    ).toEqual({ ok: false, error: "The last day can't be before the first." });
    expect(
      await saveLogisticsPhaseAction({ ...BUILD, phase: "party" }),
    ).toMatchObject({ ok: false });
    expect(saveLogisticsPhase).not.toHaveBeenCalled();
  });

  it("passes a refusal from the write straight through", async () => {
    actAs("captain");
    vi.mocked(saveLogisticsPhase).mockResolvedValueOnce({
      ok: false,
      error: "Someone changed these days first. Reload the page.",
    });
    expect(await saveLogisticsPhaseAction(BUILD)).toEqual({
      ok: false,
      error: "Someone changed these days first. Reload the page.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("attendance actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets any member answer, as themselves only", async () => {
    actAs("camp_member", [], "member-1");
    expect(
      await setMyAttendanceAction({
        phase: "pack",
        answer: "going",
        expected: null,
        // An id in the form is ignored: the answer is always the actor's.
        userId: "someone-else",
      }),
    ).toEqual({ ok: true, data: { answer: "going" } });
    expect(setMyAttendance).toHaveBeenCalledWith("member-1", {
      phase: "pack",
      answer: "going",
      expected: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/logistics");
  });

  it("refuses an answer for a phase nobody is asked about", async () => {
    actAs("camp_member");
    expect(
      await setMyAttendanceAction({
        phase: "burn",
        answer: "going",
        expected: null,
      }),
    ).toMatchObject({ ok: false });
    expect(setMyAttendance).not.toHaveBeenCalled();
  });

  it("lets a captain ask everyone, and sends the notices after the response", async () => {
    actAs("captain", [], "cap-1");
    expect(await askForAttendanceAction()).toEqual({
      ok: true,
      data: { asked: 3, notified: 2 },
    });
    expect(askForAttendance).toHaveBeenCalledWith("cap-1");
    expect(deliverAfterResponse).toHaveBeenCalledOnce();
  });

  it("refuses the ask from a Transport and Logistics lead and a member", async () => {
    for (const [rank, led] of [
      ["team_lead", ["transport_and_logistics"]],
      ["camp_member", []],
    ] as const) {
      actAs(rank, [...led]);
      expect(await askForAttendanceAction()).toEqual({
        ok: false,
        error: ASK_REFUSAL,
      });
    }
    expect(askForAttendance).not.toHaveBeenCalled();
    expect(deliverAfterResponse).not.toHaveBeenCalled();
  });
});
