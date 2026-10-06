import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { attendanceIsOpen, campDayKey } from "@camp404/core";
import {
  ATTENDANCE_ANSWER_LABELS,
  ATTENDANCE_PHASES,
  AttendanceAnswer,
  AttendancePhase,
  LOGISTICS_PHASE_LABELS,
} from "@camp404/types";
import {
  getAttendanceView,
  isAskedForAttendance,
  listLogisticsPhases,
  setMyAttendance,
} from "../../logistics";
import { LOGISTICS_PATH } from "../../logistics-copy";
import { ledgerCycle } from "../../payments";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// Who can help on the camp's working days (pack, build, strike, unpack) over
// MCP, through the Logistics page's own functions (lib/logistics.ts).
//
//  - The board reads as getAttendanceView shapes it for this viewer: who said
//    what, by name, for everyone; who has not answered by name only for team
//    leads and captains (a member gets the count), as on the page.
//  - Answering is the member's own (the caller's id, never one passed in) and
//    a compare-and-set on the answer they saw (`expected`, null when they had
//    not answered): an answer changed elsewhere meanwhile is refused with the
//    page's sentence. A phase whose first day has come takes no answers. No
//    audit row: the site writes none for a member's own answer.

export function registerAttendanceTools(server: McpServer): void {
  server.registerTool(
    "get_logistics_attendance",
    {
      title: "Who can help on the camp's days",
      description:
        "For pack, build, strike and unpack: the phase's dates, whether it still takes answers, your own answer (going, maybe, cant, or null), who said what, and how many who are coming have not answered (team leads and captains also get their names). Whether a captain asked you to answer.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_logistics_attendance",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const cycle = await ledgerCycle();
          const [view, phases, asked] = await Promise.all([
            getAttendanceView({
              userId: scope.campUserId,
              rank: scope.viewerRank,
              cycle,
            }),
            listLogisticsPhases(),
            isAskedForAttendance(scope.campUserId),
          ]);
          const today = campDayKey(new Date());
          const dates = new Map(phases.map((p) => [p.phase, p]));
          return {
            asked,
            phases: ATTENDANCE_PHASES.map((phase) => {
              const row = dates.get(phase);
              const board = view.phases.find((p) => p.phase === phase);
              return {
                phase,
                label: LOGISTICS_PHASE_LABELS[phase],
                startDate: row?.startDate ?? null,
                endDate: row?.endDate ?? null,
                open: attendanceIsOpen(row?.startDate, today),
                mine: view.mine[phase] ?? null,
                going: board?.names.going ?? [],
                maybe: board?.names.maybe ?? [],
                cant: board?.names.cant ?? [],
                notAnsweredCount: view.notAnsweredCount[phase],
                ...(view.namesWhoHaveNotAnswered
                  ? { notAnswered: board?.notAnswered ?? [] }
                  : {}),
              };
            }),
            url: siteUrl(LOGISTICS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_my_logistics_attendance",
    {
      title: "Say whether I can help on a phase",
      description: `Your own answer for one phase (pack, build, strike, unpack): going, maybe or cant (${Object.values(ATTENDANCE_ANSWER_LABELS).join(", ")}), as the Logistics page's buttons. Give \`expected\`: your answer as get_logistics_attendance read it (null when you had not answered). If it changed since, nothing changes and you are told to read it again. Refused once the phase's first day has come.`,
      inputSchema: z.object({
        phase: AttendancePhase,
        answer: AttendanceAnswer,
        expected: AttendanceAnswer.nullable(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_my_logistics_attendance",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const result = await setMyAttendance(scope.campUserId, {
            phase: args.phase,
            answer: args.answer,
            expected: args.expected,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { phase: args.phase, answer: result.answer };
        },
      }),
  );
}
