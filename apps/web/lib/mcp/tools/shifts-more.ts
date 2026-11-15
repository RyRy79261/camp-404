import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { shiftDayLabel, shiftTimeText } from "@camp404/core";
import { SHIFT_GONE, VOLUNTEER_SHIFT_GONE } from "@camp404/db/shifts";
import {
  AddVolunteerShiftInput,
  FillShiftDaysInput,
  RemoveVolunteerShiftInput,
  SetSlotNeededInput,
  ShiftMemberInput,
} from "@camp404/types";
import {
  addVolunteerShift,
  fillShiftDays,
  getMyShifts,
  getShiftsView,
  placeMemberOnShift,
  removeVolunteerShift,
  setSlotNeeded,
  takeMemberOffShift,
} from "../../shifts";
import { CHECK_SHIFT, RELOAD } from "../../shifts-copy";
import { siteUrl } from "../capabilities";
import { scopeActor, type McpScope } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// The rest of the Shifts pages over MCP, through their own functions
// (lib/shifts.ts → @camp404/db/shifts), on the pages' rules.
//
//  - Marking a day not needed, putting a member on a slot or taking them off,
//    and giving a shift its missing Burn days are a shift keeper's: the door
//    is the team-lead rung (the page's keeperGate); WHICH team's shifts is
//    checked inside each write, which re-reads and locks the actor (a lead of
//    THAT team, or a captain) and refuses in the page's words. Each writes
//    the page's audit row (shifts.slot_needed_set, shifts.member_placed,
//    shifts.member_removed, shifts.days_added) in the same transaction.
//    Marking a day is a compare-and-set on the slot's version the caller read.
//  - A member's own AfrikaBurn volunteer shifts are theirs alone: the caller's
//    id, never one passed in. Taking one off the list is an edit, not a
//    delete: adding it again restores it. No audit row, as on the site.
//  - Removing a shift and "Ask everyone" stay on the page.

const SHIFTS_PATH = "/shifts";
const MY_SHIFTS_PATH = "/shifts/mine";

function firstIssue(error: z.ZodError, fallback: string): string {
  return error.issues[0]?.message ?? fallback;
}

/** The roster's slot with this id, as this caller may see it. */
async function findSlot(scope: McpScope, slotId: string) {
  const view = await getShiftsView({
    userId: scope.campUserId,
    ...scopeActor(scope),
  });
  for (const day of view.days) {
    const slot = day.slots.find((s) => s.id === slotId);
    if (slot) return { day, slot };
  }
  return null;
}

async function presentSlot(scope: McpScope, slotId: string) {
  const found = await findSlot(scope, slotId);
  if (!found) throw new ToolError(SHIFT_GONE);
  const { day, slot } = found;
  return {
    slotId: slot.id,
    typeId: slot.typeId,
    shift: slot.type.name,
    team: slot.type.team,
    teamLabel: slot.type.teamLabel,
    day: day.day,
    dayLabel: day.label,
    time: slot.type.timeText,
    places: slot.type.places,
    taken: slot.taken,
    who: slot.names,
    // Ids only for whoever sets this shift up, as the page gives them.
    people: slot.people,
    mine: slot.mine,
    needed: slot.status === "open",
    open: slot.open,
    version: slot.version,
    youMayChange: slot.type.canManage,
    url: siteUrl(SHIFTS_PATH),
  };
}

export function registerShiftsMoreTools(server: McpServer): void {
  server.registerTool(
    "get_shift_slot",
    {
      title: "Read one shift slot",
      description:
        "One day's slot of a shift (its slotId from list_shifts): the shift, day, time, places taken and who is on it, whether it is still needed and still open, and its `version` (set_shift_slot_needed needs it). Whoever sets that shift up also gets `people` with their userIds, for take_member_off_shift.",
      inputSchema: z.object({ slotId: z.string().uuid() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_shift_slot",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => presentSlot(scope, args.slotId),
      }),
  );

  server.registerTool(
    "set_shift_slot_needed",
    {
      title: "Mark a shift's day needed or not",
      description:
        "Marks one day's slot of a shift not needed (needed: false), or needed again, as the Shifts page does: a captain for any team, a team lead for a team they lead. Give `expectedVersion` from get_shift_slot; if it changed since, nothing changes. Not needed only while nobody is on it, and only before its day. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        slotId: z.string().uuid(),
        needed: z.boolean(),
        expectedVersion: z.number().int().min(1),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_shift_slot_needed",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const parsed = SetSlotNeededInput.safeParse(args);
          if (!parsed.success) throw new ToolError(RELOAD);
          const result = await setSlotNeeded(scope.campUserId, parsed.data);
          if (!result.ok) throw new ToolError(result.error);
          return await presentSlot(scope, args.slotId);
        },
      }),
  );

  server.registerTool(
    "place_member_on_shift",
    {
      title: "Put a member on a shift",
      description:
        "Puts an approved member (userId) on one shift slot, as the Shifts page's Add person does: a captain for any team, a team lead for a team they lead. Refused when the shift is full, not needed, its day has started, or they are already on it. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        slotId: z.string().uuid(),
        userId: z.string().uuid(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "place_member_on_shift",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const parsed = ShiftMemberInput.safeParse(args);
          if (!parsed.success) throw new ToolError(RELOAD);
          const result = await placeMemberOnShift(
            scope.campUserId,
            parsed.data,
          );
          if (!result.ok) throw new ToolError(result.error);
          return await presentSlot(scope, args.slotId);
        },
      }),
  );

  server.registerTool(
    "take_member_off_shift",
    {
      title: "Take a member off a shift",
      description:
        "Takes a member (userId, from get_shift_slot's `people`) off one shift slot, as the Shifts page does: a captain for any team, a team lead for a team they lead. Refused once its day has started. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        slotId: z.string().uuid(),
        userId: z.string().uuid(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "take_member_off_shift",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const parsed = ShiftMemberInput.safeParse(args);
          if (!parsed.success) throw new ToolError(RELOAD);
          const result = await takeMemberOffShift(
            scope.campUserId,
            parsed.data,
          );
          if (!result.ok) throw new ToolError(result.error);
          return await presentSlot(scope, args.slotId);
        },
      }),
  );

  server.registerTool(
    "fill_shift_days",
    {
      title: "Add a shift's missing days",
      description:
        "Gives a shift (its id from list_shifts' `shiftTypes`) a slot on each Burn day still to come that it has none for, as the Shifts page's Add missing days does: a captain for any team, a team lead for a team they lead. Says how many days it added. Recorded in the camp's history under your name.",
      inputSchema: z.object({ typeId: z.string().uuid() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "fill_shift_days",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const parsed = FillShiftDaysInput.safeParse(args);
          if (!parsed.success) throw new ToolError(RELOAD);
          const result = await fillShiftDays(scope.campUserId, parsed.data);
          if (!result.ok) throw new ToolError(result.error);
          return {
            typeId: args.typeId,
            daysAdded: result.daysAdded,
            url: siteUrl(SHIFTS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "list_my_volunteer_shifts",
    {
      title: "List my AfrikaBurn volunteer shifts",
      description:
        "The AfrikaBurn volunteer shifts you noted this year (Rangers, Greeters, Sanctuary…), as My shifts lists them, each with the `id` remove_volunteer_shift needs and what of yours clashes with it.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_my_volunteer_shifts",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const mine = await getMyShifts(scope.campUserId);
          return {
            volunteer: mine.volunteer.map((v) => ({
              id: v.id,
              department: v.department,
              day: v.day,
              dayLabel: v.dayLabel,
              startMinute: v.startMinute,
              durationMinutes: v.durationMinutes,
              time: v.timeText,
              clashesWith: v.clashesWith,
            })),
            url: siteUrl(MY_SHIFTS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "add_volunteer_shift",
    {
      title: "Note an AfrikaBurn volunteer shift",
      description:
        "Notes one of your own AfrikaBurn volunteer shifts on My shifts, so your camp shifts don't clash with it: the `department`, the `day` (YYYY-MM-DD), `startMinute` (minutes after midnight on a quarter hour: 18:30 is 1110) and `durationMinutes` (whole quarter hours).",
      inputSchema: z.object({
        department: z.string().max(60),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        startMinute: z.number().int(),
        durationMinutes: z.number().int(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_volunteer_shift",
        extra,
        argsForAudit: { day: args.day },
        handler: async ({ scope }) => {
          const parsed = AddVolunteerShiftInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(firstIssue(parsed.error, CHECK_SHIFT));
          }
          const result = await addVolunteerShift(scope.campUserId, parsed.data);
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.id,
            department: parsed.data.department,
            day: parsed.data.day,
            dayLabel: shiftDayLabel(parsed.data.day),
            time: shiftTimeText(
              parsed.data.startMinute,
              parsed.data.durationMinutes,
            ),
            url: siteUrl(MY_SHIFTS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "remove_volunteer_shift",
    {
      title: "Take an AfrikaBurn volunteer shift off my list",
      description:
        "Takes one of your own AfrikaBurn volunteer shifts (its id from list_my_volunteer_shifts) off My shifts. Only your own.",
      inputSchema: z.object({ id: z.string().uuid() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "remove_volunteer_shift",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const parsed = RemoveVolunteerShiftInput.safeParse(args);
          if (!parsed.success) throw new ToolError(VOLUNTEER_SHIFT_GONE);
          const result = await removeVolunteerShift(
            scope.campUserId,
            parsed.data,
          );
          if (!result.ok) throw new ToolError(result.error);
          return { id: args.id, removed: true, url: siteUrl(MY_SHIFTS_PATH) };
        },
      }),
  );
}
