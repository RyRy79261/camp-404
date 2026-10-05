import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getMyShifts,
  getShiftsView,
  leaveShift,
  signUpForShift,
} from "../../shifts";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// Camp shifts over MCP, through the Shifts pages' own functions
// (lib/shifts.ts → @camp404/db/shifts).
//
//  - The roster reads as getShiftsView shapes it for this viewer: who is on a
//    shift as "Dee M.", never ids (those reach only a shift's managers, on the
//    page). The set-up, the fairness view and placing people stay on the page.
//  - Signing up and leaving are the member's own: the caller's id, never one
//    passed in. The write locks the slot, refuses a day that has started, a
//    slot not needed, a second place and a full shift (the places limit is a
//    count under the slot's lock, so the last place goes to one person), in
//    the page's own words. No audit row: a member's own sign-up is theirs,
//    as on the site.

const SHIFTS_PATH = "/shifts";

const SlotId = z.string().uuid();

export function registerShiftTools(server: McpServer): void {
  server.registerTool(
    "list_shifts",
    {
      title: "List the camp's shifts",
      description:
        "This year's shift roster, as the Shifts page shows it: each Burn day, its slots (the shift, team, time, places and how many are taken, who is on it by short name, whether you are, whether it is still needed and still open), and the duty card to read. `slotId` is what sign_up_for_shift needs. Narrow with `day` (YYYY-MM-DD) or `team`.",
      inputSchema: {
        day: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        team: z.string().max(60).optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_shifts",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const view = await getShiftsView({
            userId: scope.campUserId,
            rank: scope.viewerRank,
            ledTeams: scope.viewerRank === "team_lead" ? scope.leadTeams : [],
          });
          return {
            cycle: view.cycle,
            myCount: view.myCount,
            reminder: view.reminder,
            days: view.days
              .filter((d) => !args.day || d.day === args.day)
              .map((d) => ({
                day: d.day,
                label: d.label,
                openPlaces: d.openPlaces,
                slots: d.slots
                  .filter((s) => !args.team || s.type.team === args.team)
                  .map((s) => ({
                    slotId: s.id,
                    shift: s.type.name,
                    team: s.type.team,
                    teamLabel: s.type.teamLabel,
                    time: s.type.timeText,
                    note: s.type.note,
                    places: s.type.places,
                    taken: s.taken,
                    who: s.names,
                    mine: s.mine,
                    needed: s.status === "open",
                    open: s.open,
                    dutyCard: s.type.dutyCard
                      ? {
                          title: s.type.dutyCard.title,
                          url: siteUrl(s.type.dutyCard.href),
                        }
                      : null,
                  })),
              }))
              .filter((d) => d.slots.length > 0 || !args.team),
            url: siteUrl(SHIFTS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "list_my_shifts",
    {
      title: "List my shifts",
      description:
        "Your own week, as My shifts shows it: the camp shifts you are on (day, shift, team, time, duty card, what else of yours clashes) and the AfrikaBurn volunteer shifts you noted, with the reminder when you are under the camp's minimum.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_my_shifts",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const mine = await getMyShifts(scope.campUserId);
          return {
            count: mine.count,
            reminder: mine.reminder,
            shifts: mine.shifts.map((s) => ({
              slotId: s.slotId,
              day: s.day,
              dayLabel: s.dayLabel,
              shift: s.name,
              teamLabel: s.teamLabel,
              time: s.timeText,
              note: s.note,
              open: s.open,
              clashesWith: s.clashesWith,
              dutyCard: s.dutyCard
                ? { title: s.dutyCard.title, url: siteUrl(s.dutyCard.href) }
                : null,
            })),
            volunteer: mine.volunteer.map((v) => ({
              department: v.department,
              day: v.day,
              dayLabel: v.dayLabel,
              time: v.timeText,
              clashesWith: v.clashesWith,
            })),
            url: siteUrl(`${SHIFTS_PATH}/mine`),
          };
        },
      }),
  );

  server.registerTool(
    "sign_up_for_shift",
    {
      title: "Sign up for a shift",
      description:
        "Takes a place on one shift slot for you, as the Shifts page's Sign up does. Refused when the shift is full, no longer needed, its day has started, or you are already on it. Says how many shifts you are on this year.",
      inputSchema: { slotId: SlotId },
    },
    async (args, extra) =>
      runTool({
        toolName: "sign_up_for_shift",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const result = await signUpForShift(scope.campUserId, {
            slotId: args.slotId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { slotId: args.slotId, signedUp: true, myCount: result.mine };
        },
      }),
  );

  server.registerTool(
    "leave_shift",
    {
      title: "Leave a shift",
      description:
        "Gives up your place on a shift slot, as the Shifts page's Leave does. Refused once its day has started. Says how many shifts you are on this year.",
      inputSchema: { slotId: SlotId },
    },
    async (args, extra) =>
      runTool({
        toolName: "leave_shift",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const result = await leaveShift(scope.campUserId, {
            slotId: args.slotId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { slotId: args.slotId, signedUp: false, myCount: result.mine };
        },
      }),
  );
}
