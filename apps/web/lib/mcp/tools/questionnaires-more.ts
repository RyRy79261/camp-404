import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  canViewBuilderDefinition,
  mealPlanRatingRows,
  QUESTIONNAIRE_TEMPLATES,
} from "@camp404/core";
import { carryOverFor } from "@camp404/db/cycles";
import {
  getDefinitionMetaRow,
  setDefinitionAnonymousResults,
  setDefinitionCarryOver,
} from "@camp404/db/questionnaire-definitions";
import { getMealPlan } from "../../meal-plan";
import { canEditQuestionnaire } from "../../questionnaire-authoring";
import {
  createDraftFromTemplate,
  duplicateDefinition,
} from "../../questionnaire-definitions";
import { usesTestStore } from "../../test-mode";
import { siteUrl } from "../capabilities";
import type { McpScope } from "../scope";
import { runTool, ToolError } from "../tool-utils";

// The questionnaire builder's other saves over MCP, through the same
// functions its actions call (app/(console)/captains/questionnaires/actions.ts),
// on the same rules:
//
//  - Duplicating reads the whole definition, so it is offered only on what
//    the hub shows this person (canViewBuilderDefinition); an unknown key and
//    one they may not see answer the same "not found". The copy is a fresh
//    draft of their own.
//  - A template is the builder's "Start from a template": a draft of the
//    caller's own, its meal ratings one row per meal on this year's meal plan.
//    Nothing is published or sent.
//  - "Anonymous results" is its author's or a captain's
//    (canEditQuestionnaire); the db write refuses names back on once anyone
//    answered with no names, or while a send is open, and writes the audit
//    row (questionnaire.anonymous_results_set) with the change.
//  - The year policy is a captain's, audited (questionnaire.carry_over_set).
//  - Publishing, sending, closing, reminding, deleting a draft and the
//    attendance check stay on the website.

const HUB_PATH = "/captains/questionnaires";
const builderPath = (key: string) => `${HUB_PATH}/${key}`;
const NOT_FOUND = "Questionnaire not found.";
const Key = z.string().min(1).max(200);

function author(scope: McpScope) {
  return { campUser: { id: scope.campUserId }, rank: scope.viewerRank };
}

/** The questionnaire's row, when the hub shows it to this person. */
async function visibleMeta(scope: McpScope, key: string) {
  const meta = await getDefinitionMetaRow(key);
  if (
    !meta ||
    !canViewBuilderDefinition(
      { rank: scope.viewerRank, userId: scope.campUserId },
      meta,
    )
  ) {
    throw new ToolError(NOT_FOUND);
  }
  return meta;
}

export function registerQuestionnairesMoreTools(server: McpServer): void {
  server.registerTool(
    "get_questionnaire_settings",
    {
      title: "Read a questionnaire's settings",
      description:
        "A builder questionnaire's status, whether its shared results hide names (`anonymousResults`), whether you may change that (`canEdit`), and for a captain whether its answers carry over to next year (`carryOver`).",
      inputSchema: z.object({ key: Key }),
    },
    async (args, extra) =>
      runTool({
        toolName: "get_questionnaire_settings",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const meta = await visibleMeta(scope, args.key);
          const edit = await canEditQuestionnaire(author(scope), args.key);
          return {
            key: meta.key,
            status: meta.status,
            anonymousResults: meta.anonymousResults,
            canEdit: edit.ok,
            // The year policy is read by captains only, as on the page.
            carryOver: scope.isCaptain
              ? (await carryOverFor(args.key)) === "carry"
              : undefined,
            url: siteUrl(builderPath(meta.key)),
          };
        },
      }),
  );

  server.registerTool(
    "duplicate_questionnaire",
    {
      title: "Duplicate a questionnaire",
      description:
        "Copies a builder questionnaire you can see (its key, from list_questionnaire_drafts) into a new draft of your own, titled “… (copy)”, as the builder's Duplicate does. Returns the new key. Nothing is published or sent.",
      inputSchema: z.object({ key: Key }),
    },
    async (args, extra) =>
      runTool({
        toolName: "duplicate_questionnaire",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          await visibleMeta(scope, args.key);
          const key = await duplicateDefinition({
            key: args.key,
            createdBy: scope.campUserId,
          });
          if (!key) {
            throw new ToolError("Couldn't duplicate this questionnaire.");
          }
          return { key, url: siteUrl(builderPath(key)) };
        },
      }),
  );

  server.registerTool(
    "create_questionnaire_from_template",
    {
      title: "Start a questionnaire from a template",
      description:
        "Starts a draft of your own from a ready-made template, as the builder's Start from a template does. `post_burn_survey`: the survey after the Burn, its meal ratings one row per meal on this year's meal plan. Returns the new key; nothing is published or sent.",
      inputSchema: z.object({ template: z.enum(QUESTIONNAIRE_TEMPLATES) }),
    },
    async (args, extra) =>
      runTool({
        toolName: "create_questionnaire_from_template",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          if (usesTestStore()) {
            throw new ToolError(
              "Templates need the questionnaire builder's database.",
            );
          }
          const mealRows = mealPlanRatingRows(await getMealPlan());
          const key = await createDraftFromTemplate({
            template: args.template,
            createdBy: scope.campUserId,
            mealRows,
          });
          return { key, url: siteUrl(builderPath(key)) };
        },
      }),
  );

  server.registerTool(
    "set_questionnaire_anonymous_results",
    {
      title: "Hide or show names on a questionnaire's results",
      description:
        "Sets whether the members who answered read this questionnaire's results with no names (anonymous: true), as the builder's Anonymous results does: its author or a captain. Names cannot come back once anyone answered with no names, or while a send is open. Captains always read names. Recorded in the camp's history under your name.",
      inputSchema: z.object({ key: Key, anonymous: z.boolean() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_questionnaire_anonymous_results",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const edit = await canEditQuestionnaire(author(scope), args.key);
          if (!edit.ok) throw new ToolError(edit.error);
          const outcome = await setDefinitionAnonymousResults(
            args.key,
            args.anonymous,
            scope.campUserId,
          );
          if (outcome === "missing") throw new ToolError(NOT_FOUND);
          if (outcome === "answered") {
            throw new ToolError(
              "People already answered this with no names, so names stay hidden.",
            );
          }
          if (outcome === "open") {
            throw new ToolError(
              "People may be answering this now with no names. Close the send to show names.",
            );
          }
          return {
            key: args.key,
            anonymousResults: args.anonymous,
            url: siteUrl(builderPath(args.key)),
          };
        },
      }),
  );

  server.registerTool(
    "set_questionnaire_carry_over",
    {
      title: "Set a questionnaire's year policy",
      description:
        "Says what happens to a builder questionnaire when the camp starts a new year, as the builder's year policy does: carryOver true keeps everyone's answers; false asks everyone in its audience again on a blank form. Captains only. Recorded in the camp's history under your name.",
      inputSchema: z.object({ key: Key, carryOver: z.boolean() }),
    },
    async (args, extra) =>
      runTool({
        toolName: "set_questionnaire_carry_over",
        extra,
        argsForAudit: args,
        handler: async ({ scope }) => {
          const meta = await getDefinitionMetaRow(args.key);
          if (!meta) throw new ToolError(NOT_FOUND);
          await setDefinitionCarryOver(
            args.key,
            args.carryOver,
            scope.campUserId,
          );
          return {
            key: args.key,
            carryOver: args.carryOver,
            url: siteUrl(builderPath(args.key)),
          };
        },
      }),
  );
}
