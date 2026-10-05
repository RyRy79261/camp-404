import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  LOGISTICS_PHASES,
  LOGISTICS_PHASE_HINTS,
  LOGISTICS_PHASE_LABELS,
  SetLogisticsPhaseInput,
} from "@camp404/types";
import {
  isLogisticsCalendarConnected,
  listDeadlines,
  listLogisticsPhases,
  saveLogisticsPhase,
} from "../../logistics";
import { LOGISTICS_PATH } from "../../logistics-copy";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// The camp's days over MCP (#247, for the Notion import #239), on the
// Logistics page's rules and through its own function.
//
//  - Every approved member reads the phases (pack, travel, build, burn,
//    strike, unpack) as the page lists them, and the AfrikaBurn dates a
//    captain has set. Who can help on each day is the page's (a later PR).
//  - Setting a phase's days is saveLogisticsPhase in lib/logistics.ts, the
//    page's own: the write re-reads the actor (a captain or a Transport &
//    Logistics lead, canEditLogistics) inside its transaction, is a
//    compare-and-set on the version the caller read (0 for a phase with no
//    row yet), moves the meal plan's prep steps and their tasks when Day 1
//    moves, and writes the audit row (logistics.phase_set), all in one
//    transaction; then it puts the phase on the camp's Google Calendar. So a
//    call here is the page's Save, with nothing skipped.
//  - Clearing a phase, "Ask everyone" and the AfrikaBurn dates stay on the
//    website.

export function registerLogisticsTools(server: McpServer): void {
  server.registerTool(
    "list_logistics_days",
    {
      title: "List the camp's days",
      description:
        "This year's phases in the camp's order (pack, travel, build, burn, strike, unpack): the first and last day (YYYY-MM-DD, null when not set), the place and note, and `version`, which set_logistics_days needs. `calendar` says whether the phase is on the camp's Google Calendar yet. Also the AfrikaBurn dates a captain has set for the year.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_logistics_days",
        extra,
        argsForAudit: null,
        handler: async () => {
          const [rows, deadlines] = await Promise.all([
            listLogisticsPhases(),
            listDeadlines(),
          ]);
          const connected = isLogisticsCalendarConnected();
          const byPhase = new Map(rows.map((r) => [r.phase, r]));
          return {
            phases: LOGISTICS_PHASES.map((phase) => {
              const row = byPhase.get(phase);
              const dated = Boolean(row?.startDate);
              return {
                phase,
                label: LOGISTICS_PHASE_LABELS[phase],
                what: LOGISTICS_PHASE_HINTS[phase],
                startDate: row?.startDate ?? null,
                endDate: row?.endDate ?? null,
                place: row?.place ?? null,
                note: row?.note ?? null,
                version: row?.version ?? 0,
                calendar: !connected
                  ? "not_connected"
                  : !dated
                    ? null
                    : row!.calendarSyncedVersion === row!.version
                      ? "on"
                      : "not_yet",
              };
            }),
            afrikaburnDates: deadlines
              .filter((d) => d.dueDate || d.skipped)
              .map((d) => ({
                title: d.title,
                date: d.dueDate,
                noRoundThisYear: d.skipped,
                done: d.done,
                note: d.note,
              })),
            url: siteUrl(LOGISTICS_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "set_logistics_days",
    {
      title: "Set a phase's days",
      description:
        "Sets one phase's first and last day (YYYY-MM-DD, at most 31 days), and its place and note (a blank one clears it), as the Logistics page's Save does. Give `expectedVersion`: the phase's `version` from list_logistics_days (0 when it has no days yet). If someone saved first, it is refused: read again and retry. The phase goes on the camp's Google Calendar, and when Day 1 moves, the meal plan's prep steps move with it.",
      inputSchema: {
        phase: z.enum(LOGISTICS_PHASES),
        startDate: z.string(),
        endDate: z.string(),
        place: z.string().max(120).nullable().optional(),
        note: z.string().max(500).nullable().optional(),
        expectedVersion: z.number().int().min(0),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "set_logistics_days",
        extra,
        argsForAudit: {
          phase: args.phase,
          startDate: args.startDate,
          endDate: args.endDate,
          expectedVersion: args.expectedVersion,
        },
        handler: async ({ scope }) => {
          const parsed = SetLogisticsPhaseInput.safeParse(args);
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ??
                "Check the days and try again.",
            );
          }
          const result = await saveLogisticsPhase(
            scope.campUserId,
            parsed.data,
          );
          if (!result.ok) throw new ToolError(result.error);
          return {
            phase: parsed.data.phase,
            startDate: parsed.data.startDate,
            endDate: parsed.data.endDate,
            calendar: result.calendar,
            url: siteUrl(LOGISTICS_PATH),
          };
        },
      }),
  );
}
