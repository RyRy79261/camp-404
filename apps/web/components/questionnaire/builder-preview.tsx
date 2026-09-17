"use client";

import {
  fromBuilderQuestionnaire,
  isBuilderDefinition,
  type BuilderQuestionnaire,
  type Questionnaire,
  type QuestionnaireResponses,
} from "@camp404/types";
import { toast } from "@camp404/ui/components/toast";
import { QuestionnaireRunner } from "./runner";

const noSave = async () => ({ ok: true as const });

// Author-side preview of a questionnaire: the REAL runner driven from empty (or
// supplied) answers with NO persistence and NO side effects — Next/Back advance
// locally and the final submit is a no-op. Lets a captain see exactly what
// members will see (branching, validation, progress) without dispatching.
export function BuilderPreview({
  questionnaire,
  initialResponses = {},
  onComplete,
}: {
  /** The unified model; the builder's own shape is still accepted. */
  questionnaire: Questionnaire | BuilderQuestionnaire;
  initialResponses?: QuestionnaireResponses;
  onComplete?: () => void;
}) {
  const definition: Questionnaire = isBuilderDefinition(questionnaire)
    ? fromBuilderQuestionnaire(questionnaire as BuilderQuestionnaire)
    : (questionnaire as Questionnaire);
  return (
    <QuestionnaireRunner
      questionnaire={definition}
      initialResponses={initialResponses}
      action={noSave}
      preview
      submitLabel="Finish preview"
      onComplete={
        onComplete ??
        (() =>
          toast.success(
            "Preview complete — this is the end of the questionnaire.",
          ))
      }
    />
  );
}
