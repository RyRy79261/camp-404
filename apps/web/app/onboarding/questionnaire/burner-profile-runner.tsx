"use client";

import type { Questionnaire, QuestionnaireResponses } from "@camp404/types";
import { profileAnswerChecks } from "@/components/questionnaire/answer-checks";
import { QuestionnaireRunner } from "@/components/questionnaire/runner";
import { saveBurnerProfile } from "./actions";

/**
 * The burner profile in the shared runner. Every Next saves the answers so far,
 * so a half-filled sign-up survives a reload; the final submit completes the
 * profile and the action sends the member home.
 */
export function BurnerProfileRunner({
  questionnaire,
  initialResponses,
}: {
  questionnaire: Questionnaire;
  initialResponses: QuestionnaireResponses;
}) {
  return (
    <QuestionnaireRunner
      questionnaire={questionnaire}
      initialResponses={initialResponses}
      action={saveBurnerProfile}
      persistProgress
      checkAnswers={profileAnswerChecks(questionnaire)}
    />
  );
}
