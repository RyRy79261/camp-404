import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ClearLogisticsPhaseInput, LOGISTICS_PHASES } from "@camp404/types";
import { clearLogisticsPhase } from "../../logistics";
import { CHECK_PHASE, LOGISTICS_PATH } from "../../logistics-copy";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// The Logistics page's Clear over MCP (#247): clearLogisticsPhase in
// lib/logistics.ts, the page's own. The write re-reads the actor (a captain or
// a Transport & Logistics lead) inside its transaction, is a compare-and-set
// on the version the caller read, clears the days, the place and the note,
// moves the meal plan's prep steps when Day 1 moves (and refuses when prep
// steps would lose their Day 1), and writes the audit row
// (logistics.phase_cleared); then the calendar mirror takes the phase's event
// off Google. Setting the days again is set_logistics_days.

export function registerLogisticsMoreTools(server: McpServer): void {
  server.registerTool(
    "clear_logistics_days",
    {
      title: "Clear a phase's days",
      description:
        "Clears one phase's days, place and note, as the Logistics page's Clear does; its event comes off the camp's Google Calendar. Give `expectedVersion`: the phase's `version` from list_logistics_days. If someone saved first, it is refused: read again. Setting days again is set_logistics_days.",
      inputSchema: z.object({
        phase: z.enum(LOGISTICS_PHASES),
        expectedVersion: z.number().int().min(1),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "clear_logistics_days",
        extra,
        argsForAudit: {
          phase: args.phase,
          expectedVersion: args.expectedVersion,
        },
        handler: async ({ scope }) => {
          const parsed = ClearLogisticsPhaseInput.safeParse(args);
          if (!parsed.success) throw new ToolError(CHECK_PHASE);
          const result = await clearLogisticsPhase(
            scope.campUserId,
            parsed.data,
          );
          if (!result.ok) throw new ToolError(result.error);
          return {
            phase: parsed.data.phase,
            calendar: result.calendar,
            url: siteUrl(LOGISTICS_PATH),
          };
        },
      }),
  );
}
