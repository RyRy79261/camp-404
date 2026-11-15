import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { GuideSlug } from "@camp404/types";
import { guideChapterPath } from "../../guide-copy";
import { markGuideChapterReviewed } from "../../guide";
import { siteUrl } from "../capabilities";
import { runTool, ToolError } from "../tool-utils";

// The guide editor's "Still right for this year" over MCP (the yearly
// "copy from last year and review" step), through the page's own write
// (lib/guide.ts → @camp404/db/documents markGuideChapterReviewed). The write
// re-reads the writer inside its transaction and asks the guide's writer rule
// (a captain any chapter, a team lead their teams'), refuses a chapter that is
// not published, and writes the page's audit row (document.reviewed) with the
// change. It changes nothing a reader sees.
//
// Unpublishing is already publish_document with `published: false`, the same
// write as the editor's Unpublish, so it has no second tool here.

export function registerGuideMoreTools(server: McpServer): void {
  server.registerTool(
    "mark_document_reviewed",
    {
      title: "Mark a chapter still right for this year",
      description:
        "Marks a published Survival Guide chapter or duty card as read and still right for this year, without changing it, as the guide editor's review does. A captain may mark any chapter; a team lead their teams'. Recorded in the camp's history under your name.",
      inputSchema: z.object({ slug: GuideSlug }),
    },
    async (args, extra) =>
      runTool({
        toolName: "mark_document_reviewed",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const result = await markGuideChapterReviewed({
            actorId: scope.campUserId,
            slug: args.slug,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            slug: args.slug,
            reviewedForYear: result.cycle,
            url: siteUrl(guideChapterPath(args.slug)),
          };
        },
      }),
  );
}
