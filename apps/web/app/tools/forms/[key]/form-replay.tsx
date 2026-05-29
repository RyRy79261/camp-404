"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import type { Questionnaire, QuestionnaireResponses } from "@camp404/types";
import { QuestionnaireWizard } from "@/components/questionnaire/wizard";
import { saveFormReplay } from "./actions";

interface FormReplayProps {
  formKey: string;
  questionnaire: Questionnaire;
  initialResponses: QuestionnaireResponses;
}

/**
 * Client shell around the questionnaire wizard for the replay flow. The
 * wizard advances locally (no per-page saves) and only commits on the final
 * "Save changes" press; on success we surface a confirmation and refresh the
 * server component so the change log below updates in place.
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
      {saved && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-[color:var(--color-primary)] bg-[color:var(--color-muted)] px-4 py-3 text-sm"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[color:var(--color-primary)]" />
          <span>
            Saved. Your answers — and the change log below — are up to date.
          </span>
        </div>
      )}
      <QuestionnaireWizard
        questionnaire={questionnaire}
        initialResponses={initialResponses}
        action={(responses, final) => saveFormReplay(formKey, responses, final)}
        persistProgress={false}
        submitLabel="Save changes"
        onComplete={() => {
          setSaved(true);
          router.refresh();
        }}
      />
    </div>
  );
}
