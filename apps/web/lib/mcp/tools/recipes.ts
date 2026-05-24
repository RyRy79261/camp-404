import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { runTool, truncateList } from "../tool-utils";

const SourceEnum = z.enum(schema.recipeSourceEnum.enumValues);
const StatusEnum = z.enum(schema.recipeStatusEnum.enumValues);

export function registerRecipeTools(server: McpServer): void {
  server.registerTool(
    "submit_recipe",
    {
      title: "Submit a recipe",
      description:
        "Any camp user can submit a recipe by URL, free text, or audio blob. The recipe lands in 'pending' and is normalised by the AI cron — it'll move to 'analysing' → 'ready' on the next cron run.",
      inputSchema: {
        source: SourceEnum,
        sourceUrl: z.string().url().nullable().optional(),
        rawText: z.string().nullable().optional(),
        audioBlobUrl: z.string().url().nullable().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "submit_recipe",
        extra,
        argsForAudit: { source: args.source },
        handler: async ({ scope }) => {
          if (args.source === "url" && !args.sourceUrl) {
            throw new Error("source='url' requires sourceUrl.");
          }
          if (args.source === "text" && !args.rawText) {
            throw new Error("source='text' requires rawText.");
          }
          if (args.source === "voice" && !args.audioBlobUrl) {
            throw new Error("source='voice' requires audioBlobUrl.");
          }
          const db = createHttpDb();
          const [row] = await db
            .insert(schema.recipes)
            .values({
              submitterId: scope.campUserId,
              source: args.source,
              sourceUrl: args.sourceUrl ?? null,
              rawText: args.rawText ?? null,
              audioBlobUrl: args.audioBlobUrl ?? null,
            })
            .returning();
          return row;
        },
      }),
  );

  server.registerTool(
    "list_recipes",
    {
      title: "List recipes",
      description:
        "Returns recipes filtered by status. Members see 'ready' + 'scheduled' only. Kitchen review (pending / analysing / rejected) is captain-tier and not exposed in this batch yet.",
      inputSchema: {
        status: z.enum(["ready", "scheduled"]).optional(),
        submittedBy: z.string().uuid().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_recipes",
        extra,
        argsForAudit: args,
        handler: async () => {
          const db = createHttpDb();
          const conditions = [
            args.status
              ? eq(schema.recipes.status, args.status)
              : inArray(schema.recipes.status, ["ready", "scheduled"]),
          ];
          if (args.submittedBy)
            conditions.push(eq(schema.recipes.submitterId, args.submittedBy));
          const rows = await db
            .select()
            .from(schema.recipes)
            .where(and(...conditions))
            .orderBy(desc(schema.recipes.createdAt));
          return truncateList(rows);
        },
      }),
  );

  // Captain/kitchen-lead writes (`schedule_recipe`, `reject_recipe`) ship
  // in the captain batch — they don't belong in the member-facing surface.
  void StatusEnum;
}
