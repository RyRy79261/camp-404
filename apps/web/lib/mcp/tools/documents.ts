import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import { notFound, runTool, truncateList } from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);

export function registerDocumentTools(server: McpServer): void {
  server.registerTool(
    "list_documents",
    {
      title: "List published documents / manuals",
      description:
        "Returns published documents filtered by team / category. Drafts are not exposed in this batch — viewing/editing drafts is a captain / author tool that ships later.",
      inputSchema: {
        team: TeamEnum.optional(),
        category: z.string().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_documents",
        extra,
        argsForAudit: args,
        handler: async () => {
          const db = createHttpDb();
          const conditions = [eq(schema.documents.published, true)];
          if (args.team) conditions.push(eq(schema.documents.team, args.team));
          if (args.category)
            conditions.push(eq(schema.documents.category, args.category));
          const rows = await db
            .select()
            .from(schema.documents)
            .where(and(...conditions))
            .orderBy(asc(schema.documents.title));
          return truncateList(rows);
        },
      }),
  );

  server.registerTool(
    "get_document",
    {
      title: "Get a published document by slug",
      description:
        "Returns one published document. Drafts are not exposed in this batch.",
      inputSchema: { slug: z.string().min(1) },
    },
    async (args, extra) =>
      runTool({
        toolName: "get_document",
        extra,
        argsForAudit: args,
        handler: async () => {
          const db = createHttpDb();
          const [row] = await db
            .select()
            .from(schema.documents)
            .where(
              and(eq(schema.documents.slug, args.slug), eq(schema.documents.published, true)),
            )
            .limit(1);
          if (!row) notFound("No published document with that slug.");
          return row;
        },
      }),
  );
}
