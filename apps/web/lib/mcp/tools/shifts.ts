import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { SHIFT_TYPE_CHANGED, shiftKeeper } from "@camp404/core";
import { SHIFT_GONE } from "@camp404/db/shifts";
import { SaveShiftTypeInput } from "@camp404/types";
import {
  getMyShifts,
  getShiftsView,
  leaveShift,
  saveShiftType,
  signUpForShift,
} from "../../shifts";
import { SHIFTS_ACTION_REFUSAL } from "../../shifts-copy";
import { siteUrl } from "../capabilities";
import { scopeActor, type McpScope } from "../scope";
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
//  - Adding and changing a shift is saveShiftType, the set-up dialog's write:
//    the same check that the caller is a captain or a lead of THAT team
//    (shiftKeeper, asked here for the answer and again by the write on the
//    rows it locks, for the old team and the new), the same compare-and-set
//    on the version read, the same Burn-day slots and the same audit row
//    (shifts.type_added / shifts.type_changed). The dialog sends the whole
//    shift; update_shift_type takes only what changes and fills the rest from
//    the shift as it stands, and only at the version the caller read.
//    Removing a shift, marking a day not needed, placing people and asking
//    everyone stay on the page.

const SHIFTS_PATH = "/shifts";

const SlotId = z.string().uuid();

/** The fields the set-up dialog sends, beside the id and the version. */
const TYPE_KEYS = [
  "team",
  "name",
  "startMinute",
  "durationMinutes",
  "places",
  "note",
  "dutyCardId",
] as const;

const typeFields = {
  name: z.string().min(1).max(60),
  startMinute: z
    .number()
    .int()
    .min(0)
    .max(24 * 60 - 15)
    .describe("Minutes after midnight, on a quarter hour: 18:30 is 1110."),
  durationMinutes: z
    .number()
    .int()
    .min(15)
    .max(12 * 60)
    .describe("Whole quarter hours."),
  places: z.number().int().min(1).max(20),
  note: z.string().max(300).nullable().optional(),
  dutyCardId: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .describe("A Survival Guide duty card's id, or null for none."),
};

/** The Shifts page's roster for this caller, as the page reads it. */
function rosterFor(scope: McpScope) {
  return getShiftsView({ userId: scope.campUserId, ...scopeActor(scope) });
}

/**
 * The set-up dialog's Save, from a whole shift: the Zod boundary, the
 * screen's answer on the team, then the page's own write.
 */
async function saveType(scope: McpScope, input: Record<string, unknown>) {
  const parsed = SaveShiftTypeInput.safeParse(input);
  if (!parsed.success) {
    throw new ToolError(
      parsed.error.issues[0]?.message ?? "Check the shift and try again.",
    );
  }
  if (!shiftKeeper(parsed.data.team).allows(scopeActor(scope))) {
    throw new ToolError(
      `${SHIFTS_ACTION_REFUSAL} On the website: ${siteUrl(SHIFTS_PATH)}`,
    );
  }
  const result = await saveShiftType(scope.campUserId, parsed.data);
  if (!result.ok) throw new ToolError(result.error);
  return { parsed: parsed.data, daysAdded: result.daysAdded };
}

export function registerShiftTools(server: McpServer): void {
  server.registerTool(
    "list_shifts",
    {
      title: "List the camp's shifts",
      description:
        "This year's shift roster, as the Shifts page shows it: each Burn day, its slots (the shift, team, time, places and how many are taken, who is on it by short name, whether you are, whether it is still needed and still open), and the duty card to read. `slotId` is what sign_up_for_shift needs. `shiftTypes` lists each shift's set-up, with the `id` and `version` update_shift_type needs. Narrow with `day` (YYYY-MM-DD) or `team`.",
      inputSchema: z.object({
        day: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        team: z.string().max(60).optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_shifts",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const view = await rosterFor(scope);
          return {
            cycle: view.cycle,
            myCount: view.myCount,
            reminder: view.reminder,
            shiftTypes: view.types
              .filter((t) => !args.team || t.team === args.team)
              .map((t) => ({
                id: t.id,
                shift: t.name,
                team: t.team,
                teamLabel: t.teamLabel,
                startMinute: t.startMinute,
                durationMinutes: t.durationMinutes,
                time: t.timeText,
                places: t.places,
                note: t.note,
                version: t.version,
                youMayChange: t.canManage,
                // The set-up's pick, published or not: only for who sets it up.
                dutyCardId: t.canManage ? t.dutyCardId : undefined,
              })),
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
      inputSchema: z.object({}),
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
      inputSchema: z.object({ slotId: SlotId }),
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
      inputSchema: z.object({ slotId: SlotId }),
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

  server.registerTool(
    "create_shift_type",
    {
      title: "Add a shift",
      description:
        "Adds a shift for a team, as the Shifts page's Add shift does: a captain for any team, a team lead for a team they lead. It gets a slot on every Burn day still to come. `startMinute` is minutes after midnight on a quarter hour (18:30 is 1110); `durationMinutes` is whole quarter hours, 15 to 720; `places` is 1 to 20. Leave `dutyCardId` out to take last year's card for a shift of the same name. Recorded in the camp's history under your name.",
      inputSchema: z.object({ team: z.string().max(60), ...typeFields }),
    },
    async (args, extra) =>
      runTool({
        toolName: "create_shift_type",
        extra,
        argsForAudit: { team: args.team, name: args.name },
        handler: async ({ scope }) => {
          const { parsed, daysAdded } = await saveType(scope, {
            ...args,
            id: null,
            expectedVersion: 0,
          });
          // The roster lists shifts at one time in the order they were added,
          // so the newest of that team, name and time is this one.
          const view = await rosterFor(scope);
          const made = view.types
            .filter(
              (t) =>
                t.team === parsed.team &&
                t.name === parsed.name &&
                t.startMinute === parsed.startMinute,
            )
            .at(-1);
          return {
            id: made?.id ?? null,
            shift: parsed.name,
            team: parsed.team,
            version: made?.version ?? 1,
            daysAdded,
            url: siteUrl(SHIFTS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "update_shift_type",
    {
      title: "Change a shift",
      description:
        "Changes a shift's set-up, as the Shifts page's Edit does: a captain for any team, a team lead for a team they lead (moving it to another team needs that team too). Give its `id`, the `expectedVersion` you read (list_shifts' `shiftTypes`) and only what changes; the rest stays as it is, and null clears the note or the duty card. If someone changed it since you read it, it is refused: read again. Refused once one of its days has started, and when fewer places would leave someone out. Recorded in the camp's history under your name.",
      inputSchema: z.object({
        id: z.string().uuid(),
        expectedVersion: z.number().int().min(1),
        team: z.string().max(60).optional(),
        name: typeFields.name.optional(),
        startMinute: typeFields.startMinute.optional(),
        durationMinutes: typeFields.durationMinutes.optional(),
        places: typeFields.places.optional(),
        note: typeFields.note,
        dutyCardId: typeFields.dutyCardId,
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_shift_type",
        extra,
        // Which fields changed, never the note's words.
        argsForAudit: {
          id: args.id,
          expectedVersion: args.expectedVersion,
          fields: TYPE_KEYS.filter((k) => args[k] !== undefined),
        },
        handler: async ({ scope }) => {
          const view = await rosterFor(scope);
          const current = view.types.find((t) => t.id === args.id);
          if (!current) throw new ToolError(SHIFT_GONE);
          // The fields left out are filled from this read, so it must be the
          // version the caller read; the write checks the version again.
          if (current.version !== args.expectedVersion) {
            throw new ToolError(SHIFT_TYPE_CHANGED);
          }
          const whole: Record<string, unknown> = {
            id: args.id,
            expectedVersion: args.expectedVersion,
          };
          for (const key of TYPE_KEYS) {
            // A duty card left out stays as it is (the write keeps it).
            if (key === "dutyCardId" && args.dutyCardId === undefined) continue;
            whole[key] = args[key] !== undefined ? args[key] : current[key];
          }
          // Asked on the shift's own team first, as the write does.
          if (!shiftKeeper(current.team).allows(scopeActor(scope))) {
            throw new ToolError(
              `${SHIFTS_ACTION_REFUSAL} On the website: ${siteUrl(SHIFTS_PATH)}`,
            );
          }
          const { parsed, daysAdded } = await saveType(scope, whole);
          return {
            id: args.id,
            shift: parsed.name,
            team: parsed.team,
            version: args.expectedVersion + 1,
            daysAdded,
            url: siteUrl(SHIFTS_PATH),
          };
        },
      }),
  );
}
