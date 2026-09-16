"use client";

import type { BuilderQuestionnaire, QuestionnaireResponses } from "@camp404/types";
import { BuilderWizard } from "@/components/questionnaire/builder-wizard";
import { saveBuilderResponses } from "./actions";

// Client island wrapping the shared BuilderWizard for the blocking runner. The
// activationId is bound into the server action so the wizard keeps its plain
// (responses, final) action contract.

// Shown when the prefill came from an EARLIER cycle — a carry-over
// questionnaire re-sent in a new year (spec §9). The answers are last year's,
// and the loader reports completedAt as null, so the member still has to press
// Finish: this line is what tells them why the form isn't blank and that a
// reread is the point.
const CARRIED_OVER =
  "These are your answers from last year — check they're still right before you finish.";

export function BuilderRunner({
  activationId,
  definition,
  initialResponses,
  seededFromPriorCycle = false,
  title,
}: {
  activationId: string;
  definition: BuilderQuestionnaire;
  initialResponses: QuestionnaireResponses;
  seededFromPriorCycle?: boolean;
  title: string;
}) {
  return (
    <BuilderWizard
      questionnaire={definition}
      initialResponses={initialResponses}
      action={saveBuilderResponses.bind(null, activationId)}
      persistProgress
      variant="runner"
      notice={seededFromPriorCycle ? CARRIED_OVER : undefined}
      title={title}
      submitLabel="Finish"
    />
  );
}
