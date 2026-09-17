"use client";

import type { Questionnaire, QuestionnaireResponses } from "@camp404/types";
import { saveBuilderResponses } from "@/app/(console)/questionnaires/[activationId]/actions";
import { QuestionnaireRunner } from "./runner";

// Shown when the prefill came from an EARLIER cycle — a carry-over
// questionnaire re-sent in a new year. The answers are last year's, and the
// loader reports completedAt as null, so the member still has to submit: this
// line is what tells them why the form isn't blank and that a reread is the
// point.
const CARRIED_OVER =
  "These are your answers from last year — check they're still right before you finish.";

/**
 * Member-facing fill wrapper: binds the activation id to the shared
 * QuestionnaireRunner. The server action re-checks access, validates, saves,
 * and on the final submit completes the required action and moves on to the
 * completion screen.
 *
 * Drafts are saved on the server as the member goes (and on every Next), not on
 * the device, so a questionnaire started on a phone can be finished on a laptop.
 */
export function QuestionnaireFill({
  activationId,
  questionnaire,
  initialResponses,
  seededFromPriorCycle = false,
  gate = false,
  respondentSeed,
}: {
  activationId: string;
  questionnaire: Questionnaire;
  initialResponses: QuestionnaireResponses;
  seededFromPriorCycle?: boolean;
  /** Gate styling (a blocking send): answered-count progress + full-width submit. */
  gate?: boolean;
  /** Per-respondent shuffle seed (the member id). Combined with the activation
   * id it keeps a shuffled page/option order stable across reloads. */
  respondentSeed?: string;
}) {
  const seed = respondentSeed
    ? `${activationId}:${respondentSeed}`
    : activationId;

  return (
    <div className="flex flex-col gap-6">
      {seededFromPriorCycle && (
        <p role="status" className="text-sm text-muted-foreground">
          {CARRIED_OVER}
        </p>
      )}
      <QuestionnaireRunner
        questionnaire={questionnaire}
        initialResponses={initialResponses}
        action={(responses, final) =>
          saveBuilderResponses(activationId, responses, final)
        }
        persistProgress
        autosave
        resume
        answeredProgress={gate}
        fullWidthSubmit={gate}
        shuffleSeed={seed}
      />
    </div>
  );
}
