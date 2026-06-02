import { z } from "zod";

// Display status of a required-questionnaire queue item (surface 27). Derived
// app-side over required_actions — NOT a stored enum (no schema change).
export const QuestionnaireQueueStatus = z.enum([
  "complete",
  "next-up",
  "locked",
  "expired",
]);
export type QuestionnaireQueueStatus = z.infer<typeof QuestionnaireQueueStatus>;

// One row in the post-onboarding required-questionnaire queue (Safety /
// Dietary / Agreements …). The return shape of the queue read
// (@camp404/db listQuestionnaireQueue, surfaced via apps/web, Phase 2/4).
export const QuestionnaireQueueItem = z.object({
  key: z.string(),
  title: z.string(),
  status: QuestionnaireQueueStatus,
  questionCount: z.number().int().nonnegative().optional(),
  estimatedMinutes: z.number().int().nonnegative().optional(),
  completedAt: z.date().nullable().optional(),
});
export type QuestionnaireQueueItem = z.infer<typeof QuestionnaireQueueItem>;
