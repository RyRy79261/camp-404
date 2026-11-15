import { canViewBuilderDefinition } from "@camp404/core";
import { carryOverFor } from "@camp404/db/cycles";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import { canEditQuestionnaire } from "../questionnaire-authoring";
import { getBuilderDefinition } from "../questionnaire-definitions";
import {
  blocked,
  quote,
  str,
  type PreviewCtx,
  type PreviewFn,
} from "./preview-kit";

// Voice's rows for the builder's other saves: the questionnaire as it stands,
// read on the server (its title, never Claude's words), and why it cannot be
// done when the caller may not.

const HUB = "/captains/questionnaires";

/** The questionnaire's title and row, when the hub shows it to this person. */
async function visible(ctx: PreviewCtx, key: string) {
  const meta = await getDefinitionMetaRow(key);
  if (
    !meta ||
    !canViewBuilderDefinition(
      { rank: ctx.scope.viewerRank, userId: ctx.scope.campUserId },
      meta,
    )
  ) {
    return null;
  }
  const definition = await getBuilderDefinition(key);
  return { meta, title: definition?.title?.trim() || key };
}

const TEMPLATE_LABELS: Record<string, string> = {
  post_burn_survey: "the post-burn survey",
};

export const QUESTIONNAIRES_MORE_PREVIEWS: Readonly<Record<string, PreviewFn>> =
  {
    async duplicate_questionnaire(args, ctx) {
      const found = await visible(ctx, str(args.key));
      if (!found) {
        return blocked(
          "Duplicate a questionnaire",
          "No questionnaire with that key.",
          args,
          HUB,
        );
      }
      return {
        sentence: `Copy ${quote(found.title)} into a new draft of yours`,
        facts: "Questionnaires · a draft: nothing is published or sent",
        path: `${HUB}/${found.meta.key}`,
        args: { key: found.meta.key },
        keys: [],
      };
    },

    async create_questionnaire_from_template(args) {
      const template = str(args.template);
      return {
        sentence: `Start a draft from ${TEMPLATE_LABELS[template] ?? quote(template)}`,
        facts:
          "Questionnaires · meal ratings from this year's meal plan · nothing is published or sent",
        path: HUB,
        args: { template },
        keys: [],
      };
    },

    async set_questionnaire_anonymous_results(args, ctx) {
      const anonymous = args.anonymous === true;
      const key = str(args.key);
      const found = await visible(ctx, key);
      const sentence = anonymous
        ? "Hide names on a questionnaire's shared results"
        : "Show names on a questionnaire's shared results";
      if (!found) {
        return blocked(sentence, "No questionnaire with that key.", args, HUB);
      }
      const base = {
        sentence: `${anonymous ? "Hide" : "Show"} names on the shared results of ${quote(found.title)}`,
        facts: `Questionnaires · names now ${found.meta.anonymousResults ? "hidden" : "shown"} · captains always read names`,
        path: `${HUB}/${found.meta.key}`,
        args: { key: found.meta.key, anonymous },
        keys: [`questionnaire:${found.meta.key}`],
      };
      const edit = await canEditQuestionnaire(
        { campUser: { id: ctx.scope.campUserId }, rank: ctx.scope.viewerRank },
        found.meta.key,
      );
      if (!edit.ok) return { ...base, blocked: edit.error };
      if (found.meta.anonymousResults === anonymous) {
        return {
          ...base,
          blocked: `Names are already ${anonymous ? "hidden" : "shown"}.`,
        };
      }
      return base;
    },

    async set_questionnaire_carry_over(args, ctx) {
      const carryOver = args.carryOver === true;
      const found = await visible(ctx, str(args.key));
      const sentence = carryOver
        ? "Keep a questionnaire's answers into next year"
        : "Ask a questionnaire again each year";
      if (!found) {
        return blocked(sentence, "No questionnaire with that key.", args, HUB);
      }
      const now = (await carryOverFor(found.meta.key)) === "carry";
      const base = {
        sentence: carryOver
          ? `Keep everyone's answers to ${quote(found.title)} into next year`
          : `Ask ${quote(found.title)} again on a blank form each new year`,
        facts: `Questionnaires · now ${now ? "answers carry over" : "asked again each year"}`,
        path: `${HUB}/${found.meta.key}`,
        args: { key: found.meta.key, carryOver },
        keys: [`questionnaire:${found.meta.key}`],
      };
      if (!ctx.scope.isCaptain) {
        return { ...base, blocked: "Only a captain can do this." };
      }
      if (now === carryOver) {
        return { ...base, blocked: "That is already its year policy." };
      }
      return base;
    },
  };
