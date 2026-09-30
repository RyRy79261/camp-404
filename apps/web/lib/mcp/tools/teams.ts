import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { decimalToMinor } from "@camp404/core";
import { currentCycleNumber } from "@camp404/db/cycles";
import * as schema from "@camp404/db/schema";
import {
  getTeamBudget,
  listBudgetTotals,
  setTeamBudget,
} from "@camp404/db/team-budgets";
import { runTool, ToolError } from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);
const Amount = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "An amount in rands like 5000 or 5000.50.");

// Team budgets (#242): one amount per team per year, in rands. Every member
// reads each team's totals (budget, spent, left); captains and Finance leads
// set a budget, which the database checks again inside its transaction
// (canManageMoney). Amounts come back in whole cents.

export function registerTeamTools(server: McpServer): void {
  server.registerTool(
    "get_team_budget",
    {
      title: "Get a team's budget",
      description:
        "Returns this year's totals for one team, in whole rand cents: its budget (null when none is set), what it has spent (the claims its team said yes to), what is waiting for a yes, and what is left. Readable by any member.",
      inputSchema: { team: TeamEnum },
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
      inputSchema: {},
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

  server.registerTool(
    "set_team_budget",
    {
      title: "Set a team's budget for this year",
      description:
        "A captain or a Finance lead sets a team's one budget amount for this year, in rands (ZAR). Pass null to clear it.",
      inputSchema: {
        team: TeamEnum,
        amount: Amount.nullable().describe(
          'Rands, like "5000" or "5000.50"; null clears the budget.',
        ),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "set_team_budget",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const cents =
            args.amount === null ? null : decimalToMinor(args.amount);
          if (args.amount !== null && cents === null) {
            throw new ToolError("Give the amount in rands, like 5000.50.");
          }
          const cycle = await currentCycleNumber();
          const current = await getTeamBudget(args.team, cycle);
          const result = await setTeamBudget({
            team: args.team,
            cycle,
            amountCents: cents,
            expectedCents: current?.amountCents ?? null,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return { team: args.team, cycle, amountCents: cents };
        },
      }),
  );
}
