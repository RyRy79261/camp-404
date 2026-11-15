// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("../../shifts", () => ({
  getShiftsView: vi.fn(),
  getMyShifts: vi.fn(),
}));
vi.mock("../reads", () => ({
  readNames: vi.fn(async () => new Map([["u-cook", "Cee Cook"]])),
}));

import { getMyShifts, getShiftsView } from "../../shifts";
import type { McpScope } from "../../mcp/scope";
import { SHIFTS_MORE_PREVIEWS } from "../previews-shifts-more";

const scope: McpScope = {
  campUserId: "11111111-1111-4111-8111-111111111111",
  rank: "member",
  viewerRank: "team_lead",
  leadTeams: ["kitchen"],
  memberTeams: ["kitchen"],
  isDriver: false,
  isCaptain: false,
};
const ctx = { scope, now: new Date("2026-10-06T10:00:00Z") };

const TYPE = {
  id: "type1",
  name: "Dishes",
  team: "kitchen",
  teamLabel: "Kitchen",
  places: 2,
  timeText: "18:00–19:00",
  canManage: true,
  missingDays: 2,
};
function view(slot: Record<string, unknown> = {}, type = TYPE) {
  return {
    types: [type],
    days: [
      {
        day: "2027-04-29",
        label: "Thu 29 Apr",
        slots: [
          {
            id: "slot1",
            status: "open",
            version: 3,
            taken: 1,
            open: true,
            people: [{ userId: "u-other", name: "Oh T.", you: false }],
            type,
            ...slot,
          },
        ],
      },
    ],
  };
}

describe("shift set-up previews", () => {
  it("marks a day not needed with the version read, and blocks it while someone is on it", async () => {
    vi.mocked(getShiftsView).mockResolvedValue(
      view({ taken: 0, people: [] }) as never,
    );
    const p = await SHIFTS_MORE_PREVIEWS.set_shift_slot_needed!(
      { slotId: "slot1", needed: false, expectedVersion: 1 },
      ctx,
    );
    expect(p.sentence).toBe("Mark Dishes, Thu 29 Apr 18:00–19:00, not needed");
    expect(p.args).toEqual({
      slotId: "slot1",
      needed: false,
      expectedVersion: 3,
    });
    expect(p.blocked).toBeUndefined();

    vi.mocked(getShiftsView).mockResolvedValue(view() as never);
    expect(
      (
        await SHIFTS_MORE_PREVIEWS.set_shift_slot_needed!(
          { slotId: "slot1", needed: false },
          ctx,
        )
      ).blocked,
    ).toBe("Someone is on it; take them off first.");
  });

  it("names the person placed, and blocks a full shift or another team's", async () => {
    vi.mocked(getShiftsView).mockResolvedValue(view() as never);
    const p = await SHIFTS_MORE_PREVIEWS.place_member_on_shift!(
      { slotId: "slot1", userId: "u-cook" },
      ctx,
    );
    expect(p.sentence).toBe("Put Cee Cook on Dishes, Thu 29 Apr 18:00–19:00");
    expect(p.blocked).toBeUndefined();

    vi.mocked(getShiftsView).mockResolvedValue(view({ taken: 2 }) as never);
    expect(
      (
        await SHIFTS_MORE_PREVIEWS.place_member_on_shift!(
          { slotId: "slot1", userId: "u-cook" },
          ctx,
        )
      ).blocked,
    ).toBe("It is full.");

    vi.mocked(getShiftsView).mockResolvedValue(
      view({}, { ...TYPE, canManage: false }) as never,
    );
    expect(
      (
        await SHIFTS_MORE_PREVIEWS.take_member_off_shift!(
          { slotId: "slot1", userId: "u-other" },
          ctx,
        )
      ).blocked,
    ).toBe("Only a captain or a lead of its team sets this shift up.");
  });

  it("says how many days a shift is missing", async () => {
    vi.mocked(getShiftsView).mockResolvedValue(view() as never);
    const p = await SHIFTS_MORE_PREVIEWS.fill_shift_days!(
      { typeId: "type1" },
      ctx,
    );
    expect(p.facts).toContain("2 days without a slot");
    expect(p.blocked).toBeUndefined();
  });

  it("names the caller's own AfrikaBurn shift from their list", async () => {
    vi.mocked(getMyShifts).mockResolvedValue({
      volunteer: [
        {
          id: "v1",
          department: "Rangers",
          dayLabel: "Wed 28 Apr",
          timeText: "10:00–14:00",
        },
      ],
    } as never);
    const p = await SHIFTS_MORE_PREVIEWS.remove_volunteer_shift!(
      { id: "v1" },
      ctx,
    );
    expect(p.sentence).toBe(
      "Take your AfrikaBurn shift with “Rangers”, Wed 28 Apr 10:00–14:00, off your list",
    );
    expect(
      (await SHIFTS_MORE_PREVIEWS.remove_volunteer_shift!({ id: "v2" }, ctx))
        .blocked,
    ).toBe("That AfrikaBurn shift isn't on your list.");
  });
});
