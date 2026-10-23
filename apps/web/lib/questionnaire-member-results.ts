import "server-only";

import { notFound } from "next/navigation";
import {
  canReadQuestionnaireResults,
  sharedResults,
  type SharedResults,
} from "@camp404/core";
import { flattenQuestions, type ViewerRank } from "@camp404/types";
import { UNSET_CYCLE } from "@camp404/db/camp-config";
import { getDefinitionMetaRow } from "@camp404/db/questionnaire-definitions";
import {
  hasAnsweredQuestionnaire,
  listActivationResponses,
} from "@camp404/db/questionnaire-results";
import { getCurrentCycle } from "./camp-config";
import { getBuilderDefinition } from "./questionnaire-definitions";

// What the members who answered a questionnaire read back (owner, 2026-10-23:
// "if you've completed the questionnaire you can see the results, a bit like
// when you do a poll on Telegram"). The gate and the cut both run here, on the
// server, before anything reaches the page: a member who has not answered
// gets no answer read at all, and one who has gets `sharedResults` from
// @camp404/core (the opinion questions only, counts, and names unless the
// questionnaire is anonymous). Captains keep their own full results page.

export interface MemberResultsView extends SharedResults {
  key: string;
  title: string;
  cycle: number;
  /** Finished answers counted. */
  respondents: number;
  anonymous: boolean;
}

export type MemberResultsAccess =
  | { ok: true; view: MemberResultsView }
  /** Never sent, so nobody has answered it. */
  | { ok: false; reason: "draft"; title: string }
  /** The viewer has not answered it this year. */
  | { ok: false; reason: "unanswered"; title: string };

/** Load one questionnaire's member results for the camp's current year. */
export async function loadMemberResults(
  key: string,
  viewer: { userId: string; rank: ViewerRank },
): Promise<MemberResultsAccess> {
  const meta = await getDefinitionMetaRow(key);
  if (!meta) notFound();
  const definition = await getBuilderDefinition(key);
  if (!definition) notFound();
  const title = definition.title || key;
  if (meta.status === "draft") return { ok: false, reason: "draft", title };

  // The year every write files answers under (currentCycleNumber): the
  // current one, or the sentinel before a captain names the founding year.
  const cycle = (await getCurrentCycle())?.year ?? UNSET_CYCLE;

  const answered = await hasAnsweredQuestionnaire({
    userId: viewer.userId,
    definitionKey: key,
    cycle,
  });
  if (
    !canReadQuestionnaireResults({
      rank: viewer.rank,
      isAuthor: meta.createdBy === viewer.userId,
      answered,
    })
  ) {
    return { ok: false, reason: "unanswered", title };
  }

  const rows = await listActivationResponses({ definitionKey: key, cycle });
  const respondents = rows
    .filter((r) => r.completedAt !== null)
    .map((r) => ({
      name: r.displayName?.trim() || "Unnamed member",
      responses: r.responses ?? {},
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    view: {
      key,
      title,
      cycle,
      respondents: respondents.length,
      anonymous: meta.anonymousResults,
      ...sharedResults({
        questions: flattenQuestions(definition),
        respondents,
        anonymous: meta.anonymousResults,
      }),
    },
  };
}
