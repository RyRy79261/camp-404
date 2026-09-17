import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  canViewBuilderDefinition,
  definitionLimitErrors,
  validateQuestionnaireDefinition,
} from "@camp404/core";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import {
  BuilderQuestionnaire,
  Questionnaire,
  parseStoredDefinition,
  type ViewerRank,
} from "@camp404/types";
import { canEditQuestionnaire } from "@/lib/questionnaire-authoring";
import {
  createDraft,
  getBuilderDefinition,
  listDefinitionsForViewer,
  updateDefinition,
} from "@/lib/questionnaire-definitions";
import type { McpScope } from "../scope";
import {
  deny,
  notFound,
  runTool,
  ToolError,
  truncateList,
} from "../tool-utils";

// Questionnaire drafting over MCP (docs/mcp-tooling-proposal.md phase 7). An
// author (a captain or a team lead) drafts in chat; the builder shows the same
// draft. Publishing and sending stay in the app: a send fans out gates that
// block members, and a person presses that button. The rules are the builder
// actions' own: canEditQuestionnaire, the Zod schema and the size limits.
//
// Definitions go in and come out in the unified questionnaire model
// (`Questionnaire`, @camp404/types). A definition in the builder's older shape
// (pages of `blocks`) is still accepted and converted, so a client that learnt
// that shape keeps working; it is stored unified either way.

const BUILDER_PATH = (key: string) => `/captains/questionnaires/${key}`;
const Title = z.string().trim().min(1).max(120);

function authorRank(scope: McpScope): ViewerRank {
  if (scope.isCaptain) return "captain";
  if (scope.leadTeams.length > 0) return "team_lead";
  return "camp_member";
}

function requireAuthor(scope: McpScope): ViewerRank {
  const rank = authorRank(scope);
  if (rank === "camp_member") {
    deny("Only a captain or a team lead can draft questionnaires.");
  }
  return rank;
}

/**
 * A definition as a tool accepts it: the unified model, or the builder's older
 * shape (converted). Either parses; anything else is refused by the schema.
 */
const DefinitionInput = z.union([Questionnaire, BuilderQuestionnaire]);

/**
 * The input as the unified model: read the way a stored row is read, so a
 * builder-shaped definition converts and either shape gets its defaults.
 */
function unified(input: z.infer<typeof DefinitionInput>): Questionnaire {
  return parseStoredDefinition(input);
}

/** Refuse a definition the builder would refuse to save. */
function checkSaveable(definition: Questionnaire): void {
  const tooBig = definitionLimitErrors(definition);
  if (tooBig.length > 0) throw new ToolError(tooBig[0]!);
}

/**
 * What the author needs next: where it is, and what still blocks publishing —
 * the publish check's issues, each with its code, message, path, page and
 * block.
 */
function draftReceipt(key: string, definition: Questionnaire) {
  const validation = validateQuestionnaireDefinition(definition);
  return {
    key,
    title: definition.title ?? "",
    builderPath: BUILDER_PATH(key),
    publishProblems: validation.ok ? [] : validation.issues,
  };
}

export function registerQuestionnaireTools(server: McpServer): void {
  server.registerTool(
    "list_questionnaire_drafts",
    {
      title: "List builder questionnaires",
      description:
        "The questionnaires the builder hub shows you: a captain sees all; a team lead sees published and unpublished ones plus their own drafts.",
      inputSchema: {},
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_questionnaire_drafts",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const rank = requireAuthor(scope);
          const rows = await listDefinitionsForViewer({
            userId: scope.campUserId,
            rank,
          });
          return truncateList(
            rows.map((row) => ({
              ...row,
              mine: row.createdBy === scope.campUserId,
              builderPath: BUILDER_PATH(row.key),
            })),
          );
        },
      }),
  );

  server.registerTool(
    "get_questionnaire_draft",
    {
      title: "Read a builder questionnaire",
      description:
        "Returns the working definition the builder edits (in the unified questionnaire model), its status, and what still blocks publishing. Use it before update_questionnaire_draft.",
      inputSchema: { key: z.string().min(1) },
    },
    async (args, extra) =>
      runTool({
        toolName: "get_questionnaire_draft",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const rank = requireAuthor(scope);
          const meta = await getDefinitionMetaRow(args.key);
          // "Not found" for a draft this author may not see, so keys can't be probed.
          if (
            !meta ||
            !canViewBuilderDefinition({ userId: scope.campUserId, rank }, meta)
          ) {
            notFound("No questionnaire with that key.");
          }
          const definition = await getBuilderDefinition(args.key);
          if (!definition) notFound("No questionnaire with that key.");
          const edit = await canEditQuestionnaire(
            { campUser: { id: scope.campUserId }, rank },
            args.key,
          );
          return {
            ...draftReceipt(args.key, definition),
            status: meta.status,
            canEdit: edit.ok,
            definition,
          };
        },
      }),
  );

  server.registerTool(
    "create_questionnaire_draft",
    {
      title: "Draft a questionnaire",
      description:
        "A captain or a team lead starts a builder questionnaire as a draft, blank or from a full definition (the unified questionnaire model; the builder's older pages-of-blocks shape is also accepted). Returns its key, the builder page, and what still blocks publishing. Publishing and sending happen in the app.",
      inputSchema: {
        title: Title,
        definition: DefinitionInput.optional(),
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "create_questionnaire_draft",
        extra,
        argsForAudit: {
          title: args.title,
          pages: args.definition?.pages.length ?? 0,
        },
        handler: async ({ scope }) => {
          requireAuthor(scope);
          const definition = args.definition
            ? { ...unified(args.definition), title: args.title }
            : undefined;
          if (definition) checkSaveable(definition);
          const key = await createDraft({
            title: args.title,
            createdBy: scope.campUserId,
          });
          if (definition) {
            // The stored head keeps the version createDraft gave it.
            const blank = await getBuilderDefinition(key);
            await updateDefinition(key, {
              ...definition,
              version: blank?.version ?? definition.version,
            });
          }
          const stored = await getBuilderDefinition(key);
          if (!stored) throw new Error(`draft ${key} did not read back`);
          return draftReceipt(key, stored);
        },
      }),
  );

  server.registerTool(
    "update_questionnaire_draft",
    {
      title: "Replace a questionnaire's working definition",
      description:
        "Saves a whole definition over the working head, as the builder's autosave does (the unified questionnaire model; the builder's older pages-of-blocks shape is also accepted). A captain may change any questionnaire; a team lead only their own. On a published questionnaire the live version keeps serving open sends until a captain re-publishes in the app.",
      inputSchema: {
        key: z.string().min(1),
        definition: DefinitionInput,
      },
    },
    async (args, extra) =>
      runTool({
        toolName: "update_questionnaire_draft",
        extra,
        argsForAudit: {
          key: args.key,
          pages: args.definition.pages.length,
        },
        handler: async ({ scope }) => {
          const rank = requireAuthor(scope);
          const edit = await canEditQuestionnaire(
            { campUser: { id: scope.campUserId }, rank },
            args.key,
          );
          if (!edit.ok) {
            if (edit.error === "Questionnaire not found.") {
              notFound("No questionnaire with that key.");
            }
            deny(edit.error);
          }
          const current = await getBuilderDefinition(args.key);
          if (!current) notFound("No questionnaire with that key.");
          const definition = {
            ...unified(args.definition),
            version: current.version,
          };
          checkSaveable(definition);
          await updateDefinition(args.key, definition);
          return draftReceipt(args.key, definition);
        },
      }),
  );
}
