import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  chapterRefusal,
  createGuideChapter,
  getDocumentBySlug,
  getPublishedChapter,
  listDocumentDrafts,
  listPublishedChapters,
  publishGuideChapter,
  saveGuideChapter,
  unpublishGuideChapter,
} from "@camp404/db/documents";
import {
  DutyCardDraft,
  GUIDE_SITE_HOST,
  GuideCategory,
  GuideChapterKind,
  GuideChapterRef,
  GuideMarkdown,
  GuideSlug,
  NewGuideChapterInput,
  SaveGuideChapterInput,
  Team,
} from "@camp404/types";
import { guideSlugFor } from "../../guide-copy";
import type { McpScope } from "../scope";
import {
  deny,
  notFound,
  runTool,
  ToolError,
  truncateList,
} from "../tool-utils";

// The Survival Guide (#250) over MCP, on the guide editor's rules: the same
// topics, the same chapter and duty-card shapes (NewGuideChapterInput,
// SaveGuideChapterInput), the same writer rule (chapterRefusal: a captain any
// chapter, a team lead their teams' chapters, decided again inside each
// write's transaction), and publishing only the version the writer read
// (GuideChapterRef, a compare-and-set). Putting a section on the public site
// and keeping a chapter members only are a captain's, on the website.

const PUBLISHING = `Publishing makes the version readable by every member in the app's Survival Guide. If the chapter's topic is a public section (a captain's switch) and a captain has not kept the chapter members only, it also goes on the public site, ${GUIDE_SITE_HOST}, with every :::members … ::: part cut out: those parts stay in the app for members.`;

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the chapter and try again.";
}

function writer(scope: McpScope) {
  return { rank: scope.viewerRank, led: scope.leadTeams };
}

async function writableDocument(scope: McpScope, slug: string) {
  const document = await getDocumentBySlug(slug);
  if (!document) notFound("No chapter with that slug.");
  const refusal = chapterRefusal(writer(scope), document.team);
  if (refusal) deny(refusal);
  return document;
}

export function registerDocumentTools(server: McpServer): void {
  server.registerTool(
    "list_documents",
    {
      title: "List the Survival Guide's chapters",
      description:
        "The guide's published chapters and duty cards, by title, as every member reads them in the app. Filter by topic or team. Captains and team leads find drafts with list_document_drafts.",
      inputSchema: z.object({
        team: Team.optional(),
        category: GuideCategory.optional().describe("The guide topic."),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "list_documents",
        extra,
        argsForAudit: args,
        handler: async () => {
          // What members read: each chapter's published version.
          const rows = await listPublishedChapters();
          return truncateList(
            rows.filter(
              (row) =>
                (!args.team || row.team === args.team) &&
                (!args.category || row.category === args.category),
            ),
          );
        },
      }),
  );

  server.registerTool(
    "get_document",
    {
      title: "Read a published chapter",
      description:
        "One published chapter or duty card, as members read it in the app (members-only parts included). Captains and team leads read drafts with get_document_draft.",
      inputSchema: z.object({ slug: z.string().min(1) }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_document",
        extra,
        argsForAudit: args,
        handler: async () => {
          const row = await getPublishedChapter(args.slug);
          if (!row) notFound("No published chapter with that slug.");
          return row;
        },
      }),
  );

  registerDocumentAuthoringTools(server);
}

function registerDocumentAuthoringTools(server: McpServer): void {
  server.registerTool(
    "list_document_drafts",
    {
      title: "List unpublished chapters",
      description:
        "A captain gets every draft; a team lead gets the drafts of teams they lead this year and the ones they wrote.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_document_drafts",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          if (scope.isCaptain) return truncateList(await listDocumentDrafts());
          return truncateList(
            await listDocumentDrafts({
              teams: scope.leadTeams,
              authorId: scope.campUserId,
            }),
          );
        },
      }),
  );

  server.registerTool(
    "get_document_draft",
    {
      title: "Read a chapter's working copy",
      description:
        "A captain, or a lead of the chapter's team, reads its working copy whatever its state, with its `version`: pass that version to update_document and publish_document.",
      inputSchema: z.object({ slug: GuideSlug }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_document_draft",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => await writableDocument(scope, args.slug),
      }),
  );

  server.registerTool(
    "create_document",
    {
      title: "Start a Survival Guide chapter or duty card",
      description:
        "Starts a draft in one of the guide's topics: a plain chapter in Markdown, or a duty card (kind duty_card, with its card: sub-roles, steps, hard rules, checklist and who to ask; it may be half-written until it is published). A captain may write any chapter; a team lead only one for a team they lead (a chapter with no team is a captain's). A part only members may read goes between a `:::members` line and a `:::` line. The address comes from the title. Publish it with publish_document.",
      inputSchema: z.object({
        kind: GuideChapterKind.default("chapter"),
        title: z.string(),
        category: GuideCategory.describe("The guide topic."),
        team: Team.nullable().optional(),
        markdown: GuideMarkdown.default(""),
        card: DutyCardDraft.nullable()
          .optional()
          .describe("Only for a duty card: its parts, any still empty."),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "create_document",
        extra,
        // Never the title's words: nothing said to voice is kept.
        argsForAudit: {
          kind: args.kind,
          category: args.category,
          team: args.team ?? null,
        },
        handler: async ({ scope }) => {
          const parsed = NewGuideChapterInput.safeParse({
            kind: args.kind,
            title: args.title,
            category: args.category,
            team: args.team ?? null,
            markdown: args.markdown,
            card:
              args.kind === "duty_card"
                ? (args.card ?? {
                    subRoles: [],
                    steps: [],
                    hardRules: [],
                    checklist: [],
                    askRole: "",
                  })
                : (args.card ?? null),
          });
          if (!parsed.success) throw new ToolError(firstIssue(parsed.error));
          const slug = guideSlugFor(
            parsed.data.title,
            Math.random().toString(36).slice(2, 7),
          );
          const result = await createGuideChapter({
            ...parsed.data,
            slug,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return result.document;
        },
      }),
  );

  server.registerTool(
    "update_document",
    {
      title: "Edit a chapter's draft",
      description:
        "Changes a chapter's title, topic, team, Markdown or (for a duty card) its card, and bumps its version. Pass the version you read: if someone saved in between, nothing changes and you read it again. Editing never publishes.",
      inputSchema: z.object({
        slug: GuideSlug,
        expectedVersion: z.number().int().min(1),
        title: z.string().optional(),
        category: GuideCategory.optional(),
        team: Team.nullable().optional(),
        markdown: GuideMarkdown.optional(),
        card: DutyCardDraft.optional(),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "update_document",
        extra,
        argsForAudit: {
          slug: args.slug,
          expectedVersion: args.expectedVersion,
        },
        handler: async ({ scope }) => {
          const parsed = SaveGuideChapterInput.partial({
            title: true,
            team: true,
            markdown: true,
            card: true,
          }).safeParse(args);
          if (!parsed.success) throw new ToolError(firstIssue(parsed.error));
          const { slug, expectedVersion, ...change } = parsed.data;
          if (Object.values(change).every((value) => value === undefined)) {
            throw new ToolError("Say at least one field to change.");
          }
          const result = await saveGuideChapter({
            slug,
            expectedVersion,
            change,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return result.document;
        },
      }),
  );

  server.registerTool(
    "publish_document",
    {
      title: "Publish a chapter, or take it off the guide",
      description: `Publishes the version you read (expectedVersion, from get_document_draft or update_document): if someone saved since, nothing is published and you read it again. Each publish that changes the chapter is a new version; old versions stay. A duty card must be complete to publish. ${PUBLISHING} published: false takes it off the guide (and the public site); its versions stay. Making a section public and keeping a chapter members only are a captain's, on the website.`,
      inputSchema: z.object({
        slug: GuideSlug,
        published: z.boolean(),
        expectedVersion: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Required to publish: the version you read."),
      }),
    },
    async (args, extra) =>
      runTool({
        toolName: "publish_document",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          if (!args.published) {
            const result = await unpublishGuideChapter({
              slug: args.slug,
              actorId: scope.campUserId,
            });
            if (!result.ok) throw new ToolError(result.error);
            return { slug: args.slug, published: false };
          }
          const ref = GuideChapterRef.safeParse(args);
          if (!ref.success) {
            throw new ToolError(
              "Say which version you read (expectedVersion): read the chapter with get_document_draft first.",
            );
          }
          const result = await publishGuideChapter({
            ...ref.data,
            actorId: scope.campUserId,
          });
          if (!result.ok) throw new ToolError(result.error);
          return {
            slug: args.slug,
            published: true,
            version: result.version,
            newVersion: result.created,
          };
        },
      }),
  );
}
