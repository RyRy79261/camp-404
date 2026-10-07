import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { currentCycleNumber } from "@camp404/db/cycles";
import * as schema from "@camp404/db/schema";
import { listBudgetTotals } from "@camp404/db/team-budgets";
import { runTool } from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);

// Team budgets (#242): one amount per team per year, in rands. Every member
// reads each team's totals (budget, spent, left). Setting a budget moves money,
// so it is website-only (owner, 2026-10-04): captains and Finance leads set it
// on the Budgets page. Amounts come back in whole cents.

export function registerTeamTools(server: McpServer): void {
  server.registerTool(
    "get_team_budget",
    {
      title: "Get a team's budget",
      description:
        "Returns this year's totals for one team, in whole rand cents: its budget (null when none is set), what it has spent (the claims its team said yes to), what is waiting for a yes, and what is left. Readable by any member.",
      inputSchema: z.object({ team: TeamEnum }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_team_budget",
        extra,
        argsForAudit: args,
        handler: async () => {
          const totals = await listBudgetTotals(await currentCycleNumber());
          return { team: args.team, ...totals[args.team] };
        },
      }),
  );

  server.registerTool(
    "list_team_budgets",
    {
      title: "List every team's budget",
      description:
        "Returns this year's totals for every team, in whole rand cents: budget, spent, waiting and left. Readable by any member.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_team_budgets",
        extra,
        argsForAudit: null,
        handler: async () => {
          const totals = await listBudgetTotals(await currentCycleNumber());
          return Object.entries(totals).map(([team, t]) => ({ team, ...t }));
        },
      }),
  );
}
