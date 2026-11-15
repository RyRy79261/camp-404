import { shiftDayLabel, shiftTimeText } from "@camp404/core";
import { scopeActor } from "../mcp/scope";
import { getMyShifts, getShiftsView } from "../shifts";
import {
  blocked,
  personName,
  quote,
  str,
  type PreviewCtx,
  type PreviewFn,
} from "./preview-kit";

// Voice's rows for the Shifts page's set-up writes and a member's own
// AfrikaBurn shifts: the slot, shift or volunteer shift as it stands, read on
// the server, and the slot's version filled in from that read.

async function roster(ctx: PreviewCtx) {
  return getShiftsView({
    userId: ctx.scope.campUserId,
    ...scopeActor(ctx.scope),
    now: ctx.now,
  });
}

async function findSlot(ctx: PreviewCtx, slotId: string) {
  const view = await roster(ctx);
  for (const day of view.days) {
    const slot = day.slots.find((s) => s.id === slotId);
    if (slot) return { day, slot };
  }
  return null;
}

const NOT_YOURS = "Only a captain or a lead of its team sets this shift up.";

export const SHIFTS_MORE_PREVIEWS: Readonly<Record<string, PreviewFn>> = {
  async set_shift_slot_needed(args, ctx) {
    const needed = args.needed === true;
    const found = await findSlot(ctx, str(args.slotId));
    const what = needed ? "needed again" : "not needed";
    if (!found) {
      return blocked(
        `Mark a shift's day ${what}`,
        "That shift slot isn't on the roster.",
        args,
        "/shifts",
      );
    }
    const { day, slot } = found;
    const base = {
      sentence: `Mark ${slot.type.name}, ${day.label} ${slot.type.timeText}, ${what}`,
      facts: `Shifts · ${slot.type.teamLabel} · ${slot.taken} of ${slot.type.places} places taken · now ${slot.status === "open" ? "needed" : "not needed"}`,
      path: "/shifts",
      args: {
        slotId: slot.id,
        needed,
        expectedVersion: slot.version,
      },
      keys: [`slot:${slot.id}`],
    };
    if (!slot.type.canManage) return { ...base, blocked: NOT_YOURS };
    if (!slot.open) return { ...base, blocked: "Its day has started." };
    if ((slot.status === "open") === needed) {
      return {
        ...base,
        blocked: `It is already ${needed ? "needed" : "not needed"}.`,
      };
    }
    if (!needed && slot.taken > 0) {
      return {
        ...base,
        blocked: "Someone is on it; take them off first.",
      };
    }
    return base;
  },

  async place_member_on_shift(args, ctx) {
    const found = await findSlot(ctx, str(args.slotId));
    const who = await personName(args.userId);
    if (!found) {
      return blocked(
        `Put ${who} on a shift`,
        "That shift slot isn't on the roster.",
        args,
        "/shifts",
      );
    }
    const { day, slot } = found;
    const base = {
      sentence: `Put ${who} on ${slot.type.name}, ${day.label} ${slot.type.timeText}`,
      facts: `Shifts · ${slot.type.teamLabel} · ${slot.taken} of ${slot.type.places} places taken`,
      path: "/shifts",
      args: { slotId: slot.id, userId: str(args.userId) },
      keys: [`slot:${slot.id}`],
    };
    if (!slot.type.canManage) return { ...base, blocked: NOT_YOURS };
    if (!slot.open) return { ...base, blocked: "Its day has started." };
    if (slot.status !== "open") {
      return { ...base, blocked: "That day is marked not needed." };
    }
    if (slot.people?.some((p) => p.userId === str(args.userId))) {
      return { ...base, blocked: `${who} is already on it.` };
    }
    if (slot.taken >= slot.type.places) {
      return { ...base, blocked: "It is full." };
    }
    return base;
  },

  async take_member_off_shift(args, ctx) {
    const found = await findSlot(ctx, str(args.slotId));
    const who = await personName(args.userId);
    if (!found) {
      return blocked(
        `Take ${who} off a shift`,
        "That shift slot isn't on the roster.",
        args,
        "/shifts",
      );
    }
    const { day, slot } = found;
    const base = {
      sentence: `Take ${who} off ${slot.type.name}, ${day.label} ${slot.type.timeText}`,
      facts: `Shifts · ${slot.type.teamLabel} · ${slot.taken} of ${slot.type.places} places taken`,
      path: "/shifts",
      args: { slotId: slot.id, userId: str(args.userId) },
      keys: [`slot:${slot.id}`],
    };
    if (!slot.type.canManage) return { ...base, blocked: NOT_YOURS };
    if (!slot.open) return { ...base, blocked: "Its day has started." };
    if (!slot.people?.some((p) => p.userId === str(args.userId))) {
      return { ...base, blocked: `${who} is not on it.` };
    }
    return base;
  },

  async fill_shift_days(args, ctx) {
    const view = await roster(ctx);
    const type = view.types.find((t) => t.id === str(args.typeId));
    if (!type) {
      return blocked(
        "Add a shift's missing days",
        "That shift isn't on the roster.",
        args,
        "/shifts",
      );
    }
    const base = {
      sentence: `Add the missing Burn days to ${quote(type.name)}`,
      facts: `Shifts · ${type.teamLabel} · ${type.timeText} · ${type.missingDays} day${type.missingDays === 1 ? "" : "s"} without a slot`,
      path: "/shifts",
      args: { typeId: type.id },
      keys: [`shift-type:${type.id}`],
    };
    if (!type.canManage) return { ...base, blocked: NOT_YOURS };
    if (type.missingDays === 0) {
      return { ...base, blocked: "It has a slot on every Burn day already." };
    }
    return base;
  },

  async add_volunteer_shift(args) {
    const day = str(args.day);
    const start = typeof args.startMinute === "number" ? args.startMinute : 0;
    const length =
      typeof args.durationMinutes === "number" ? args.durationMinutes : 0;
    return {
      sentence: `Note your AfrikaBurn shift with ${quote(str(args.department))}, ${shiftDayLabel(day)} ${shiftTimeText(start, length)}`,
      facts: "My shifts · only so your camp shifts don't clash with it",
      path: "/shifts/mine",
      args,
      keys: [],
    };
  },

  async remove_volunteer_shift(args, ctx) {
    const mine = await getMyShifts(ctx.scope.campUserId, ctx.now);
    const shift = mine.volunteer.find((v) => v.id === str(args.id));
    if (!shift) {
      return blocked(
        "Take an AfrikaBurn shift off your list",
        "That AfrikaBurn shift isn't on your list.",
        args,
        "/shifts/mine",
      );
    }
    return {
      sentence: `Take your AfrikaBurn shift with ${quote(shift.department)}, ${shift.dayLabel} ${shift.timeText}, off your list`,
      facts: "My shifts · you can note it again any time",
      path: "/shifts/mine",
      args: { id: shift.id },
      keys: [`volunteer-shift:${shift.id}`],
    };
  },
};
