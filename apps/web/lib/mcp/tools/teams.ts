import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Currency } from "@camp404/types";
import * as schema from "@camp404/db/schema";
import {
  getTeamBudget,
  listTeamBudgets,
  setTeamBudget,
} from "@camp404/db/team-budgets";
import { canWriteTeam } from "../scope";
import { deny, runTool, ToolError } from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);
const Amount = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "An amount like 5000 or 5000.50.");

export function registerTeamTools(server: McpServer): void {
  server.registerTool(
    "get_team_budget",
    {
      title: "Get a team's budget",
      description:
        "Returns this year's assigned + perceived budget figures for one team, or null when none is set. Readable by anyone.",
      inputSchema: { team: TeamEnum },
    },
    async (args, extra) =>
      runTool({
        toolName: "get_team_budget",
        extra,
        argsForAudit: args,
        handler: async () => await getTeamBudget(args.team),
      }),
  );

  server.registerTool(
    "list_team_budgets",
    {
      title: "List every team's budget",
      description:
        "Returns this year's team budgets. Readable by anyone — useful for camp-wide planning views.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_team_budgets",
        extra,
        argsForAudit: null,
        handler: async () => await listTeamBudgets(),
      }),
  );

  server.registerTool(
    "set_team_budget",
    {
      title: "Set a team's budget for this year",
      description:
        "A captain, or the lead of the team, sets this year's budget figures. Fields left out keep their value; pass null to clear an amount or the notes.",
      inputSchema: {
        team: TeamEnum,
        assignedAmount: Amount.nullable().optional(),
        perceivedAmount: Amount.nullable().optional(),
        currency: Currency.optional(),
        notes: z.string().max(2000).nullable().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "set_team_budget",
        extra,
        // The notes stay out of the log: free text a captain typed.
        argsForAudit: {
          team: args.team,
          assignedAmount: args.assignedAmount,
          perceivedAmount: args.perceivedAmount,
          currency: args.currency,
        },
        handler: async ({ scope }) => {
          if (!canWriteTeam(scope, args.team)) {
            deny("Only a captain or the lead of this team can set its budget.");
          }
          const { team, ...change } = args;
          if (Object.values(change).every((value) => value === undefined)) {
            throw new ToolError("Say at least one field to set.");
          }
          // The SDK checks the schema first; this is the handler's own
          // guard, for a caller that reaches it without that check.
          if (
            change.currency !== undefined &&
            !Currency.safeParse(change.currency).success
          ) {
            throw new ToolError("Currency must be ZAR, USD or EUR.");
          }
          return await setTeamBudget({
            team,
            change,
            actorId: scope.campUserId,
          });
        },
      }),
  );
}
