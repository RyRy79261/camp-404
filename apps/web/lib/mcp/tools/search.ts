import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { canApproveRecipe, canRunLounge } from "@camp404/core";
import type { SearchViewer } from "@camp404/db/search";
import { searchCamp } from "../../search";
import { siteUrl } from "../capabilities";
import type { McpScope } from "../scope";
import { runTool } from "../tool-utils";

// Ctrl+K's "Everything" over MCP (#326, #350), through the box's own function
// (searchCamp in lib/search.ts) with the viewer the search route builds: the
// caller's rung and, for a lead, the teams they lead, so canRunLounge and
// canApproveRecipe answer as on the site. Each kind's rule is the page's,
// applied in the query (@camp404/db/search): an answer holds only what this
// person may open, a title hit or a short line around a text hit, never a body.

/** The search route's viewer, from the connector's scope. */
export function searchViewerOf(scope: McpScope): SearchViewer {
  // The route reads lead teams only for a team lead; a captain's rules do not
  // depend on them.
  const leadTeams = scope.viewerRank === "team_lead" ? scope.leadTeams : [];
  return {
    userId: scope.campUserId,
    rank: scope.viewerRank,
    runsLounge: canRunLounge(scope.viewerRank, leadTeams),
    reviewsRecipes: canApproveRecipe(scope.viewerRank, leadTeams),
  };
}

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "search_camp",
    {
      title: "Search the camp",
      description:
        "Search everything you may open in the app, as Ctrl+K's Everything does: recipes, Survival Guide chapters and duty cards, meetings, tasks, inventory, shifts, gear, people, the announcements you received, and more by your rank. Each hit has its kind, title, a detail line and the page's address; a hit inside the text (not the title) has `match`, a short line around the words. Never the full text: open it with the matching tool or the page.",
      inputSchema: z.object({ query: z.string().trim().min(1).max(80) }),
    },
    async (args, extra) =>
      runTool({
        toolName: "search_camp",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const entries = await searchCamp(searchViewerOf(scope), args.query);
          return {
            count: entries.length,
            entries: entries.map((e) => ({
              kind: e.kind,
              id: e.id,
              title: e.title,
              detail: e.detail,
              ...(e.card ? { dutyCard: true } : {}),
              ...(e.match ? { match: e.match } : {}),
              url: siteUrl(e.href),
            })),
          };
        },
      }),
  );
}
