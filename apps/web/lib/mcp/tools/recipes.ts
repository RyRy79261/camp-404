import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import {
  listRecipeBook,
  suggestRecipe,
  suggestionTitle,
} from "@camp404/db/recipes";
import { SuggestRecipeInput } from "@camp404/types";
import { ToolError, runTool, truncateList } from "../tool-utils";

// Recipes through the Claude connector (#243). A member may suggest one by
// pasting its text; it lands as `suggested` for a Kitchen lead or a captain
// to approve in the app. Approving, having Claude write it up and accepting
// stay in the app. The listing is the camp's recipe book: recipes with an
// accepted version, readable by any approved member, with the plates each is
// written for and every plate count that has a result.

export function registerRecipeTools(server: McpServer): void {
  server.registerTool(
    "submit_recipe",
    {
      title: "Suggest a recipe",
      description:
        "Any camp member can suggest a recipe for the kitchen by giving its text (ingredients and method). The server never opens links, so a link alone is refused; a link may be added for reference. The name is optional and defaults to the text's first line. It lands as 'suggested' until a Kitchen lead or a captain approves it. Nothing is sent to an AI model unless a captain or a Kitchen lead later chooses to, and only if aiConsent is true.",
      inputSchema: {
        text: z.string().min(1),
        title: z.string().max(120).nullable().optional(),
        link: z.string().nullable().optional(),
        suitabilityNote: z.string().nullable().optional(),
        aiConsent: z.boolean().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "submit_recipe",
        extra,
        argsForAudit: { hasLink: Boolean(args.link) },
        handler: async ({ scope }) => {
          const parsed = SuggestRecipeInput.safeParse({
            title: args.title ?? undefined,
            source: "text",
            url: args.link ?? undefined,
            text: args.text,
            suitabilityNote: args.suitabilityNote ?? undefined,
            aiConsent: args.aiConsent ?? false,
          });
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ?? "That recipe is not valid.",
            );
          }
          const input = parsed.data;
          // The app's own write: it checks the member is approved and the
          // text is there, so the connector cannot skip a rule the form keeps.
          const result = await suggestRecipe({
            submitterId: scope.campUserId,
            title: input.title ?? null,
            source: input.source,
            sourceUrl: input.url ?? null,
            text: input.text,
            suitabilityNote: input.suitabilityNote ?? null,
            aiConsent: input.aiConsent,
            now: new Date(),
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: result.id,
            title: suggestionTitle(input.title ?? null, input.text),
            status: "suggested",
          };
        },
      }),
  );

  server.registerTool(
    "list_recipes",
    {
      title: "List the recipe book",
      description:
        "Returns the camp's recipe book: every recipe with an accepted version, by name, with the plates it is written for (plates) and every plate count that has a result (readyPlates). Suggestions still in review are not listed.",
      inputSchema: {
        submittedBy: z.string().uuid().optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "list_recipes",
        extra,
        argsForAudit: args,
        handler: async () => {
          const book = await listRecipeBook();
          let rows = book;
          if (args.submittedBy) {
            const mine = await createHttpDb()
              .select({ id: schema.recipes.id })
              .from(schema.recipes)
              .where(eq(schema.recipes.submitterId, args.submittedBy));
            const ids = new Set(mine.map((r) => r.id));
            rows = book.filter((r) => ids.has(r.id));
          }
          return truncateList(
            rows.map((r) => ({
              id: r.id,
              title: r.title,
              plates: r.plates,
              readyPlates: r.readyPlates,
              version: r.version,
            })),
          );
        },
      }),
  );
}
