"use client";

import type { BuilderQuestionnaire, QuestionnaireResponses } from "@camp404/types";
import { BuilderWizard } from "@/components/questionnaire/builder-wizard";
import { saveBuilderResponses } from "./actions";

// Client island wrapping the shared BuilderWizard for the blocking runner. The
// activationId is bound into the server action so the wizard keeps its plain
// (responses, final) action contract.
export function BuilderRunner({
  activationId,
  definition,
  initialResponses,
  title,
}: {
  activationId: string;
  definition: BuilderQuestionnaire;
  initialResponses: QuestionnaireResponses;
  title: string;
}) {
  return (
    <BuilderWizard
      questionnaire={definition}
      initialResponses={initialResponses}
      action={saveBuilderResponses.bind(null, activationId)}
      persistProgress
      variant="runner"
      title={title}
      submitLabel="Finish"
    />
  );
}
