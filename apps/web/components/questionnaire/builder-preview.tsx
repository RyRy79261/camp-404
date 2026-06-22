"use client";

import type { BuilderQuestionnaire, QuestionnaireResponses } from "@camp404/types";
import { toast } from "@camp404/ui/components/toast";
import { BuilderWizard } from "./builder-wizard";

// Author-side preview of a builder questionnaire: the REAL runner driven from
// empty (or supplied) answers with NO persistence and NO side effects — Next/Back
// advance locally and the final submit is a no-op. Lets a captain see exactly
// what members will see (branching, validation, progress) without dispatching.
// Reused by the builder editor's Preview (Phase C).
export function BuilderPreview({
  questionnaire,
  initialResponses = {},
  onComplete,
}: {
  questionnaire: BuilderQuestionnaire;
  initialResponses?: QuestionnaireResponses;
  onComplete?: () => void;
}) {
  return (
    <BuilderWizard
      questionnaire={questionnaire}
      initialResponses={initialResponses}
      action={async () => ({ ok: true as const })}
      persistProgress={false}
      variant="onboarding"
      title={questionnaire.title}
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
