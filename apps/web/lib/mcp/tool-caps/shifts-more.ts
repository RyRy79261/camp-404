import { GATES, type ToolCapability } from "../gates";

// The Shifts page's set-up writes beyond adding and changing a shift, and a
// member's own AfrikaBurn volunteer shifts (lib/mcp/tools/shifts-more.ts).
// The set-up's door is the team-lead rung (GATES.shiftKeeper, the page's
// keeperGate); WHICH team's shifts is the write's own check (a lead of that
// team, or a captain). Volunteer shifts are any member's, for themselves.

export const SHIFTS_MORE_CAPABILITIES: Readonly<
  Record<string, ToolCapability>
> = {
  get_shift_slot: {
    kind: "read",
    area: "Shifts",
    gate: GATES.member,
    does: "One day's slot of a shift: its version, whether it is needed, and who is on it (with ids, for whoever sets that shift up).",
    page: "/shifts",
  },
  set_shift_slot_needed: {
    kind: "write",
    area: "Shifts",
    gate: GATES.shiftKeeper,
    does: "Mark one day of a shift not needed, or needed again, on the version you read (team leads: their own team's).",
    page: "/shifts",
  },
  place_member_on_shift: {
    kind: "write",
    area: "Shifts",
    gate: GATES.shiftKeeper,
    does: "Put a member on a shift slot (team leads: their own team's shifts).",
    page: "/shifts",
  },
  take_member_off_shift: {
    kind: "write",
    area: "Shifts",
    gate: GATES.shiftKeeper,
    does: "Take a member off a shift slot before its day (team leads: their own team's shifts).",
    page: "/shifts",
  },
  fill_shift_days: {
    kind: "write",
    area: "Shifts",
    gate: GATES.shiftKeeper,
    does: "Give a shift a slot on each Burn day to come that it has none for (team leads: their own team's).",
    page: "/shifts",
  },
  list_my_volunteer_shifts: {
    kind: "read",
    area: "Shifts",
    gate: GATES.member,
    does: "The AfrikaBurn volunteer shifts you noted this year, with their ids.",
    page: "/shifts/mine",
  },
  add_volunteer_shift: {
    kind: "write",
    area: "Shifts",
    gate: GATES.member,
    does: "Note one of your own AfrikaBurn volunteer shifts, so camp shifts don't clash with it.",
    page: "/shifts/mine",
  },
  remove_volunteer_shift: {
    kind: "write",
    area: "Shifts",
    gate: GATES.member,
    does: "Take one of your own AfrikaBurn volunteer shifts off your list.",
    page: "/shifts/mine",
  },
};
