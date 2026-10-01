import { beforeEach, describe, expect, it, vi } from "vitest";

// The shift roster's actions (#248). What matters here:
//  1. Setting a shift up needs a captain or a lead OF ITS TEAM: a lead of
//     another team is refused before the facade is called, although their
//     clearance is the global team_lead rung. A member is refused too.
//  2. Signing up, leaving and a member's own AfrikaBurn shifts name the
//     signed-in member and nothing else, whatever the form sends.
//  3. "Ask everyone" is a captain's, and its notices go out after the
//     response.
// Each rule is checked again inside the write (packages/db, on PGlite).

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/captain-gate", () => ({ captainActionGate: vi.fn() }));
vi.mock("@/lib/users", () => ({ getLeadTeams: vi.fn(async () => []) }));
vi.mock("@/lib/shifts", () => ({
  saveShiftType: vi.fn(async () => ({ ok: true, daysAdded: 7 })),
  removeShiftType: vi.fn(async () => ({ ok: true })),
  fillShiftDays: vi.fn(async () => ({ ok: true, daysAdded: 1 })),
  setSlotNeeded: vi.fn(async () => ({ ok: true })),
  signUpForShift: vi.fn(async () => ({ ok: true, mine: 1 })),
  leaveShift: vi.fn(async () => ({ ok: true, mine: 0 })),
  placeMemberOnShift: vi.fn(async () => ({ ok: true })),
  takeMemberOffShift: vi.fn(async () => ({ ok: true })),
  askForShifts: vi.fn(async () => ({ ok: true, asked: 3, notified: 2 })),
  addVolunteerShift: vi.fn(async () => ({ ok: true, id: "v1" })),
  removeVolunteerShift: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/background-work", () => ({ deliverAfterResponse: vi.fn() }));

import { revalidatePath } from "next/cache";
import type { ViewerRank } from "@camp404/types";
import { captainActionGate } from "@/lib/captain-gate";
import { deliverAfterResponse } from "@/lib/background-work";
import {
  addVolunteerShift,
  askForShifts,
  placeMemberOnShift,
  saveShiftType,
  signUpForShift,
} from "@/lib/shifts";
import { ASK_SHIFTS_REFUSAL, SHIFTS_ACTION_REFUSAL } from "@/lib/shifts-copy";
import { getLeadTeams } from "@/lib/users";
import {
  addVolunteerShiftAction,
  askForShiftsAction,
  placeMemberOnShiftAction,
  saveShiftTypeAction,
  signUpForShiftAction,
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

const SLOT = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

const CLEAN = {
  team: "sanitation_and_water",
  name: " Morning clean ",
  startMinute: 480,
  durationMinutes: 120,
  places: 4,
  note: "",
  expectedVersion: 0,
};

describe("shift actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets a Sanitation lead add a cleaning shift, as themselves", async () => {
    actAs("team_lead", ["sanitation_and_water"], "lead-1");
    expect(await saveShiftTypeAction(CLEAN)).toEqual({
      ok: true,
      data: { daysAdded: 7 },
    });
    expect(saveShiftType).toHaveBeenCalledWith("lead-1", {
      team: "sanitation_and_water",
      name: "Morning clean",
      startMinute: 480,
      durationMinutes: 120,
      places: 4,
      note: null,
      expectedVersion: 0,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/shifts");
  });

  it("refuses a lead of another team, and a member, before the facade", async () => {
    actAs("team_lead", ["kitchen"]);
    expect(await saveShiftTypeAction(CLEAN)).toEqual({
      ok: false,
      error: SHIFTS_ACTION_REFUSAL,
    });
    actAs("camp_member");
    expect(await saveShiftTypeAction(CLEAN)).toEqual({
      ok: false,
      error: SHIFTS_ACTION_REFUSAL,
    });
    expect(
      await placeMemberOnShiftAction({ slotId: SLOT, userId: "u2" }),
    ).toEqual({
      ok: false,
      error: SHIFTS_ACTION_REFUSAL,
    });
    expect(saveShiftType).not.toHaveBeenCalled();
    expect(placeMemberOnShift).not.toHaveBeenCalled();
  });

  it("checks what was typed at the boundary", async () => {
    actAs("captain");
    expect(
      await saveShiftTypeAction({ ...CLEAN, durationMinutes: 13 * 60 }),
    ).toEqual({ ok: false, error: "A shift is 12 hours at most." });
    expect(await saveShiftTypeAction({ ...CLEAN, places: 0 })).toEqual({
      ok: false,
      error: "A shift needs at least 1 person.",
    });
    expect(saveShiftType).not.toHaveBeenCalled();
  });

  it("signs up the signed-in member only, whatever the form sends", async () => {
    actAs("camp_member", [], "me-1");
    expect(
      await signUpForShiftAction({ slotId: SLOT, userId: "someone-else" }),
    ).toEqual({ ok: true, data: { mine: 1 } });
    expect(signUpForShift).toHaveBeenCalledWith("me-1", { slotId: SLOT });
    expect(
      await addVolunteerShiftAction({
        department: "Rangers",
        day: "2027-04-29",
        startMinute: 600,
        durationMinutes: 240,
        userId: "someone-else",
      }),
    ).toEqual({ ok: true });
    expect(addVolunteerShift).toHaveBeenCalledWith("me-1", {
      department: "Rangers",
      day: "2027-04-29",
      startMinute: 600,
      durationMinutes: 240,
    });
  });

  it("asks everyone as a captain only, and delivers after the response", async () => {
    actAs("team_lead", ["sanitation_and_water"]);
    expect(await askForShiftsAction()).toEqual({
      ok: false,
      error: ASK_SHIFTS_REFUSAL,
    });
    expect(askForShifts).not.toHaveBeenCalled();
    actAs("captain", [], "cap-1");
    expect(await askForShiftsAction()).toEqual({
      ok: true,
      data: { asked: 3, notified: 2 },
    });
    expect(askForShifts).toHaveBeenCalledWith("cap-1");
    expect(deliverAfterResponse).toHaveBeenCalledTimes(1);
  });
});
