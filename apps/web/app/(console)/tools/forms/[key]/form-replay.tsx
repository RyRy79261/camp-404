"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Questionnaire, QuestionnaireResponses } from "@camp404/types";
import { profileAnswerChecks } from "@/components/questionnaire/answer-checks";
import { QuestionnaireRunner } from "@/components/questionnaire/runner";
import { saveFormReplay } from "./actions";
import { SavedBanner } from "./saved-banner";

interface FormReplayProps {
  formKey: string;
  questionnaire: Questionnaire;
  initialResponses: QuestionnaireResponses;
}

/**
 * Client shell around the questionnaire runner for the replay flow. The
 * runner advances locally (no per-page saves) and only commits on the final
 * "Save changes" press, so the change log compares the stored answers with the
 * finished edit, not with half-saved progress. On success we surface a
 * confirmation and refresh the server component so the change log updates in
 * place.
 */
export function FormReplay({
  formKey,
  questionnaire,
  initialResponses,
}: FormReplayProps) {
  const router = useRouter();
  const [saved, setSaved] = React.useState(false);

  return (
    <div className="flex flex-1 flex-col gap-4">
      {saved && <SavedBanner />}
      <QuestionnaireRunner
        questionnaire={questionnaire}
        initialResponses={initialResponses}
        action={(responses, final) => saveFormReplay(formKey, responses, final)}
        submitLabel="Save changes"
        checkAnswers={profileAnswerChecks(questionnaire)}
        // "Saved" is only true until the next edit.
        onResponsesChange={() => setSaved(false)}
        onComplete={() => {
          setSaved(true);
          router.refresh();
        }}
      />
    </div>
  );
}
