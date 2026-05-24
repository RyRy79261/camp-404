import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { runTool } from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);

export function registerTeamTools(server: McpServer): void {
  server.registerTool(
    "get_team_budget",
    {
      title: "Get a team's budget",
      description:
        "Returns the assigned + perceived budget figures for one team. Readable by anyone.",
      inputSchema: { team: TeamEnum },
    },
    async (args, extra) =>
      runTool({
        toolName: "get_team_budget",
        extra,
        argsForAudit: args,
        handler: async () => {
          const db = createHttpDb();
          const [row] = await db
            .select()
            .from(schema.teamBudgets)
            .where(eq(schema.teamBudgets.team, args.team))
            .limit(1);
          return row ?? null;
        },
      }),
  );

  server.registerTool(
    "list_team_budgets",
    {
      title: "List every team's budget",
      description:
        "Returns every team_budgets row. Readable by anyone — useful for camp-wide planning views.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_team_budgets",
        extra,
        argsForAudit: null,
        handler: async () => {
          const db = createHttpDb();
          return await db.select().from(schema.teamBudgets);
        },
      }),
  );
}
