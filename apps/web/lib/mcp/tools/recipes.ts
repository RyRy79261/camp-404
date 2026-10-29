import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import * as schema from "@camp404/db/schema";
import {
  listRecipeBook,
  suggestRecipe,
  suggestionTitle,
} from "@camp404/db/recipes";
import { KITCHEN_REVIEWER } from "@camp404/core";
import {
  AddLessonInput,
  LINK_ONLY_REFUSAL,
  LINK_ONLY_TEXT,
  MAX_PLATES,
  RECIPE_TEXT_MAX,
  RetypeRecipeTextInput,
  SuggestRecipeInput,
} from "@camp404/types";
import { recipePath, recipeVersionPath } from "../../recipe-copy";
import {
  addLesson,
  getPlateCount,
  getRecipeDetail,
  getRecipeSource,
  renameRecipe,
  retypeRecipeText,
} from "../../recipes";
import { siteUrl } from "../capabilities";
import { scopeActor, type McpScope } from "../scope";
import { ToolError, notFound, runTool, truncateList } from "../tool-utils";

// Recipes through the Claude connector (#243). A member may suggest one by
// pasting its text; it lands as `suggested` for a Kitchen lead or a captain
// to approve in the app. Approving, having Claude write it up and accepting
// stay in the app. The listing is the camp's recipe book: recipes with an
// accepted version, readable by any approved member, with the plates each is
// written for and every plate count that has a result.
//
// A suggestion may come as sections (#239's Notion import has them). The
// suggestion form takes one text, and the write splits it into the source's
// sections where a line names one (sourceFromText: "Ingredients", "Method",
// …), so the sections are joined under those headings and land in the same
// sections. The form has no "serves", so neither does this: it goes in the
// notes as words.
//
// get_recipe reads what the recipe's page shows THIS person, decided as the
// page decides it: the book's parts for every approved member once it has an
// accepted version; before that, only the member who suggested it and the
// Kitchen's reviewers (canApproveRecipe) see it, and anyone else is told
// there is no such recipe. Claude's drafts and reports stay on the page.
//
// add_recipe_lesson is the version page's "Notes" form (addLesson): any
// approved member, on a recipe in the book.
//
// retype_recipe_text is the recipe page's "Retype text" (retypeRecipeText):
// a captain or a Kitchen lead replaces the working text of a recipe still in
// review, becomes its author, and the text is the recipe's next source
// version, audited, in one transaction. It takes the source version the
// caller read (get_recipe's `sourceVersion`), which the write checks under
// the recipe's lock. The name is not the reviewer's to change (the submitter
// renames it when asked for changes), and nothing is sent to Claude: the
// source editor's "Send for proofreading" is a person's click on the page.
//
// rename_recipe is renameRecipe (owner's option A, 2026-10-26): the same
// people rename a suggestion or a recipe in the book, a compare-and-set on
// the name they read, audited with the old and the new name. The website's
// button waits for the owner's approval of its layout.

/** The headings sourceFromText reads, one per source section, in order. */
const SECTION_HEADINGS = [
  ["ingredients", "Ingredients"],
  ["equipment", "Equipment"],
  ["steps", "Method"],
  ["notes", "Notes"],
] as const;

type Sections = Partial<
  Record<(typeof SECTION_HEADINGS)[number][0], string | null>
>;

/** A name is needed with sections: the text's first line would be a heading. */
export const SECTIONS_NEED_TITLE =
  "Give the recipe a name when you send it as sections.";

/**
 * The form refuses a recipe that is only a link. Joined under headings,
 * sections never look like one, so each section, and all of them together,
 * is checked before they are joined.
 */
function sectionsAreOnlyLinks(sections: Sections): boolean {
  const bodies = SECTION_HEADINGS.map(([key]) => sections[key]?.trim()).filter(
    (b): b is string => Boolean(b),
  );
  return (
    bodies.some((b) => LINK_ONLY_TEXT.test(b)) ||
    (bodies.length > 0 && LINK_ONLY_TEXT.test(bodies.join("\n")))
  );
}

/**
 * Who may read a recipe, as its page decides: anyone once it is in the book;
 * before that, its submitter and the Kitchen's reviewers. Anyone else is told
 * it does not exist.
 */
async function readableRecipe(recipeId: string, scope: McpScope) {
  const detail = await getRecipeDetail(recipeId);
  const privileged =
    detail !== null &&
    (detail.submitterId === scope.campUserId ||
      KITCHEN_REVIEWER.allows(scopeActor(scope)));
  if (!detail || (!privileged && detail.acceptedVersionId === null)) {
    notFound("No recipe with that id.");
  }
  return detail;
}

/** Sections as the one text the form takes, each under its heading. */
export function sectionsAsText(sections: Sections): string {
  return SECTION_HEADINGS.flatMap(([key, heading]) => {
    const body = sections[key]?.trim();
    return body ? [`${heading}\n${body}`] : [];
  }).join("\n\n");
}

const sectionText = z.string().max(20_000).nullable().optional();

export function registerRecipeTools(server: McpServer): void {
  server.registerTool(
    "submit_recipe",
    {
      title: "Suggest a recipe",
      description:
        "Any camp member can suggest a recipe for the kitchen by giving its text (ingredients and method), or its `sections` (ingredients, equipment, steps, notes; give one or the other, and a `title` with sections). The server never opens links, so a link alone is refused; a link may be added for reference. The name is optional and defaults to the text's first line. There is no serves field on the form: say how many it serves in the notes. It lands as 'suggested' until a Kitchen lead or a captain approves it in the app. Nothing is sent to an AI model unless a captain or a Kitchen lead later chooses to, and only if aiConsent is true.",
      inputSchema: z.object({
        text: z.string().min(1).optional(),
        sections: z
          .object({
            ingredients: sectionText,
            equipment: sectionText,
            steps: sectionText,
            notes: sectionText,
          })
          .optional(),
        title: z.string().max(120).nullable().optional(),
        link: z.string().nullable().optional(),
        suitabilityNote: z.string().nullable().optional(),
        aiConsent: z.boolean().optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "submit_recipe",
        extra,
        argsForAudit: {
          hasLink: Boolean(args.link),
          asSections: Boolean(args.sections),
        },
        handler: async ({ scope }) => {
          if (args.text && args.sections) {
            throw new ToolError(
              "Give the recipe as text or as sections, not both.",
            );
          }
          if (args.sections) {
            if (!args.title?.trim()) throw new ToolError(SECTIONS_NEED_TITLE);
            if (sectionsAreOnlyLinks(args.sections)) {
              throw new ToolError(LINK_ONLY_REFUSAL);
            }
          }
          const text = args.sections
            ? sectionsAsText(args.sections)
            : (args.text ?? "");
          const parsed = SuggestRecipeInput.safeParse({
            title: args.title ?? undefined,
            source: "text",
            url: args.link ?? undefined,
            text,
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
      inputSchema: z.object({
        submittedBy: z.string().uuid().optional(),
      }),
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

  server.registerTool(
    "get_recipe",
    {
      title: "Read a recipe",
      description:
        "One recipe as its page shows it to you. In the book: the accepted version (`recipe`: ingredients, steps, notes), the plates it is written for, every plate count that has a result (`readyPlates`), the amounts at `plates` when that count has a result (else at the version's own count, with `askedPlatesNotReady`), how it was scaled, and the cooks' notes (`lessons`). Before the book, only its submitter and the Kitchen's reviewers see it: its status and the working text. For captains and Kitchen leads, `sourceVersion` is what retype_recipe_text needs. Nothing here sends anything to Claude.",
      inputSchema: z.object({
        recipeId: z.string().uuid(),
        plates: z.number().int().min(1).max(MAX_PLATES).optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_recipe",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const detail = await readableRecipe(args.recipeId, scope);
          const url = siteUrl(recipePath(detail.id));
          const current = detail.currentVersion;
          // The source version retype_recipe_text names: for the Kitchen's
          // reviewers, who alone may retype (0 when it has none).
          const sourceVersion = KITCHEN_REVIEWER.allows(scopeActor(scope))
            ? ((await getRecipeSource(detail.id))?.version ?? 0)
            : undefined;
          if (!current) {
            return {
              sourceVersion,
              id: detail.id,
              title: detail.title,
              status: detail.status,
              inTheBook: false,
              suggestedBy: detail.submitterName,
              suggestedAt: detail.createdAt,
              sourceUrl: detail.sourceUrl,
              text: detail.text,
              suitabilityNote: detail.suitabilityNote,
              changesNote: detail.changesNote,
              rejectionReason: detail.rejectionReason,
              url,
            };
          }
          const ready = detail.plateCounts.map((c) => c.plates);
          const wanted = args.plates ?? null;
          const shown =
            wanted !== null && ready.includes(wanted) ? wanted : current.plates;
          const count = await getPlateCount(current.id, shown);
          const versions = new Map(detail.versions.map((v) => [v.id, v]));
          return {
            id: detail.id,
            title: detail.title,
            status: detail.status,
            sourceVersion,
            inTheBook: true,
            version: current.version,
            versionId: current.id,
            writtenFor: current.plates,
            readyPlates: ready,
            plates: shown,
            askedPlatesNotReady:
              wanted !== null && !ready.includes(wanted) ? wanted : null,
            recipe: current.recipe,
            amounts: count?.lines ?? null,
            pots: count?.pots ?? null,
            countNotes: count?.source === "proofread" ? count.notes : [],
            howThisWasScaled: current.scalingNotes,
            lessons: detail.lessons.map((l) => ({
              version: versions.get(l.versionId)?.version ?? null,
              versionId: l.versionId,
              body: l.body,
              burn: l.cycle,
              by: l.authorName,
              at: l.createdAt,
            })),
            url,
          };
        },
      }),
  );

  server.registerTool(
    "add_recipe_lesson",
    {
      title: "Add a note on cooking a recipe",
      description:
        "Adds a note on what the kitchen learned cooking a recipe in the book, as the version page's Notes form does. It goes on the version given (`versionId`, from get_recipe), or on the current one when none is given. Any camp member.",
      inputSchema: z.object({
        recipeId: z.string().uuid(),
        versionId: z.string().uuid().optional(),
        body: z.string().min(1).max(2_000),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "add_recipe_lesson",
        extra,
        argsForAudit: { recipeId: args.recipeId, versionId: args.versionId },
        handler: async ({ scope }) => {
          // The recipe page's rule, whatever the arguments: a recipe the
          // caller may not read does not exist for them.
          const detail = await readableRecipe(args.recipeId, scope);
          if (!detail.acceptedVersionId) {
            throw new ToolError(
              "This recipe is not in the book yet, so it has no version to note.",
            );
          }
          const versionId = args.versionId ?? detail.acceptedVersionId;
          const parsed = AddLessonInput.safeParse({
            recipeId: args.recipeId,
            versionId,
            body: args.body,
          });
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ?? "That note is not valid.",
            );
          }
          const result = await addLesson({
            ...parsed.data,
            authorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          const version = detail.versions.find(
            (v) => v.id === parsed.data.versionId,
          )?.version;
          return {
            id: result.id,
            recipeId: parsed.data.recipeId,
            versionId: parsed.data.versionId,
            url: siteUrl(
              version
                ? recipeVersionPath(parsed.data.recipeId, version)
                : recipePath(parsed.data.recipeId),
            ),
          };
        },
      }),
  );

  server.registerTool(
    "retype_recipe_text",
    {
      title: "Retype a recipe's text",
      description:
        "Replaces the working text of a recipe still in review (suggested, approved or proofread; not one in the book) as the recipe page's Retype text does: you become the text's author, and it is saved as the recipe's next source version, recorded under your name. Give its `text`, or its `sections` (ingredients, equipment, steps, notes; one or the other), and the `sourceVersion` get_recipe gave you as `expectedSourceVersion` (0 when it has none). If someone changed it since you read it, it is refused: read again. The name stays as it is, and nothing is sent to Claude: sending it is a person's click on the page.",
      inputSchema: z.object({
        recipeId: z.string().uuid(),
        expectedSourceVersion: z.number().int().min(0),
        text: z.string().min(1).max(RECIPE_TEXT_MAX).optional(),
        sections: z
          .object({
            ingredients: sectionText,
            equipment: sectionText,
            steps: sectionText,
            notes: sectionText,
          })
          .optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "retype_recipe_text",
        extra,
        // Never the words themselves.
        argsForAudit: {
          recipeId: args.recipeId,
          expectedSourceVersion: args.expectedSourceVersion,
          asSections: Boolean(args.sections),
        },
        handler: async ({ scope }) => {
          if (args.text && args.sections) {
            throw new ToolError(
              "Give the recipe as text or as sections, not both.",
            );
          }
          const parsed = RetypeRecipeTextInput.safeParse({
            recipeId: args.recipeId,
            text: args.sections
              ? sectionsAsText(args.sections)
              : (args.text ?? ""),
          });
          if (!parsed.success) {
            throw new ToolError(
              parsed.error.issues[0]?.message ?? "That text is not valid.",
            );
          }
          // The page's own write: it checks the reviewer again, the recipe's
          // status and the source version under the recipe's lock, and
          // writes the audit row in the same transaction.
          const result = await retypeRecipeText({
            ...parsed.data,
            actorId: scope.campUserId,
            expectedSourceVersion: args.expectedSourceVersion,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: parsed.data.recipeId,
            // The write refused any other base, so this is the new version.
            sourceVersion: args.expectedSourceVersion + 1,
            url: siteUrl(recipePath(parsed.data.recipeId)),
          };
        },
      }),
  );

  server.registerTool(
    "rename_recipe",
    {
      title: "Rename a recipe",
      description:
        "Renames a recipe, a suggestion or one in the book. Give the new `title` and the name you read (`expectedTitle`, get_recipe's `title`); if someone renamed it since, it is refused: read again. Only the name changes: the versions in the book keep their words, and nothing is sent to Claude. Recorded under your name with the old and the new name.",
      inputSchema: z.object({
        recipeId: z.string().uuid(),
        title: z.string().min(1).max(120),
        expectedTitle: z.string().min(1).max(200),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "rename_recipe",
        extra,
        argsForAudit: { recipeId: args.recipeId },
        handler: async ({ scope }) => {
          // The write checks the reviewer again, locks the recipe and writes
          // the audit row in the same transaction.
          const result = await renameRecipe({
            recipeId: args.recipeId,
            actorId: scope.campUserId,
            title: args.title,
            expectedTitle: args.expectedTitle,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            id: args.recipeId,
            title: result.title,
            url: siteUrl(recipePath(args.recipeId)),
          };
        },
      }),
  );
}
