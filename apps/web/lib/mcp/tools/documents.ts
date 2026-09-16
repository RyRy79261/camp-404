import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { createHttpDb } from "@camp404/db";
import { slugify } from "@camp404/core";
import {
  createDocument,
  getDocumentBySlug,
  listDocumentDrafts,
  setDocumentPublished,
  updateDocument,
  type DocumentTeam,
} from "@camp404/db/documents";
import * as schema from "@camp404/db/schema";
import type { McpScope } from "../scope";
import {
  deny,
  notFound,
  runTool,
  ToolError,
  truncateList,
} from "../tool-utils";

const TeamEnum = z.enum(schema.teamEnum.enumValues);

export function registerDocumentTools(server: McpServer): void {
  server.registerTool(
    "list_documents",
    {
      title: "List published documents / manuals",
      description:
        "Returns published documents filtered by team / category. Captains and team leads find drafts with list_document_drafts.",
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
        "Returns one published document. Captains and team leads read drafts with get_document_draft.",
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

  registerDocumentAuthoringTools(server);
}

// --- Authoring (captain and team lead) --------------------------------------
// A captain writes any document. A team lead writes the documents of teams
// they lead this year; a document with no team is a captain's. Drafts stay
// out of list_documents and get_document until published.

const Slug = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Lowercase letters, digits and single hyphens, like kitchen-safety.",
  )
  .max(48);
const Title = z.string().trim().min(1).max(120);
const Category = z.string().trim().min(1).max(60);
const Markdown = z.string().max(100_000);

function canWriteDocument(
  scope: McpScope,
  document: { team: DocumentTeam | null },
): boolean {
  if (scope.isCaptain) return true;
  return document.team !== null && scope.leadTeams.includes(document.team);
}

async function writableDocument(scope: McpScope, slug: string) {
  const document = await getDocumentBySlug(slug);
  if (!document) notFound("No document with that slug.");
  if (!canWriteDocument(scope, document)) {
    deny("Only a captain or the lead of this document's team can change it.");
  }
  return document;
}

function registerDocumentAuthoringTools(server: McpServer): void {
  server.registerTool(
    "list_document_drafts",
    {
      title: "List unpublished documents",
      description:
        "A captain gets every draft; a team lead gets the drafts of teams they lead this year and the ones they wrote.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_document_drafts",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          if (scope.isCaptain) return truncateList(await listDocumentDrafts());
          if (scope.leadTeams.length === 0) {
            deny("Only a captain or a team lead can see drafts.");
          }
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
      title: "Get a document, draft or published",
      description:
        "A captain, or the lead of the document's team, reads a document whatever its state, with its version for update_document.",
      inputSchema: { slug: Slug },
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
      title: "Start a camp document",
      description:
        "A captain, or a team lead for a team they lead, starts an unpublished document in Markdown. The slug defaults to one made from the title. Publish it with publish_document when it is ready.",
      inputSchema: {
        title: Title,
        category: Category,
        team: TeamEnum.nullable().optional(),
        markdown: Markdown,
        slug: Slug.optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "create_document",
        extra,
        argsForAudit: {
          title: args.title,
          category: args.category,
          team: args.team ?? null,
          slug: args.slug,
        },
        handler: async ({ scope }) => {
          const team = args.team ?? null;
          if (!canWriteDocument(scope, { team })) {
            deny(
              team === null
                ? "A document with no team is a captain's. Name a team you lead."
                : "You don't lead that team this year.",
            );
          }
          const slug = args.slug ?? slugify(args.title);
          if (!Slug.safeParse(slug).success) {
            throw new ToolError("Give the document a slug, like kitchen-safety.");
          }
          const result = await createDocument({
            title: args.title,
            slug,
            category: args.category,
            team,
            markdown: args.markdown,
            authorId: scope.campUserId,
          });
          if (!result.ok) {
            throw new ToolError(`The slug "${slug}" is taken. Pick another.`);
          }
          return result.document;
        },
      }),
  );

  server.registerTool(
    "update_document",
    {
      title: "Edit a camp document",
      description:
        "Changes a document's title, category or Markdown and bumps its version. Pass the version you read: if someone saved in between, nothing changes and you read it again.",
      inputSchema: {
        slug: Slug,
        expectedVersion: z.number().int().min(1),
        title: Title.optional(),
        category: Category.optional(),
        markdown: Markdown.optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_document",
        extra,
        argsForAudit: { slug: args.slug, expectedVersion: args.expectedVersion },
        handler: async ({ scope }) => {
          await writableDocument(scope, args.slug);
          const { slug, expectedVersion, ...change } = args;
          if (Object.values(change).every((value) => value === undefined)) {
            throw new ToolError("Say at least one field to change.");
          }
          const result = await updateDocument({
            slug,
            expectedVersion,
            change,
            actorId: scope.campUserId,
          });
          if (!result.ok) {
            throw new ToolError(
              "Someone saved this document since you read it. Read it again.",
            );
          }
          return result.document;
        },
      }),
  );

  server.registerTool(
    "publish_document",
    {
      title: "Publish or unpublish a camp document",
      description:
        "A captain, or the lead of the document's team, publishes a document so every member can read it, or takes it back to a draft.",
      inputSchema: { slug: Slug, published: z.boolean() },
    },
    async (args, extra) =>
      runTool({
        toolName: "publish_document",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          await writableDocument(scope, args.slug);
          const row = await setDocumentPublished({
            slug: args.slug,
            published: args.published,
            actorId: scope.campUserId,
          });
          if (!row) notFound("No document with that slug.");
          return { slug: row.slug, published: row.published, version: row.version };
        },
      }),
  );
}
