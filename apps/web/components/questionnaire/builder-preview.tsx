"use client";

import type { Questionnaire, QuestionnaireResponses } from "@camp404/types";
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
  questionnaire: Questionnaire;
  initialResponses?: QuestionnaireResponses;
  onComplete?: () => void;
}) {
  return (
    <QuestionnaireRunner
      questionnaire={questionnaire}
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
