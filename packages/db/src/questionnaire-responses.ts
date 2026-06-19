import { and, eq } from "drizzle-orm";
import type { QuestionnaireResponses } from "@camp404/types";
import { createHttpDb } from "./index";
import { questionnaireResponses } from "./schema";

// Generic response store for BUILDER questionnaires (code questionnaires keep
// their bespoke domain tables). One latest-answer row per (user, definition);
// the per-field change history lives in questionnaire_edits.

export interface QuestionnaireResponseRow {
  responses: QuestionnaireResponses;
  definitionVersion: string;
  activationId: string | null;
  completedAt: Date | null;
}

/**
 * Upsert a member's answers for one builder questionnaire (unique by
 * `(user, definitionKey)`). Called on every page advance (`completedAt` null)
 * and on final submit (`completedAt` set).
 */
export async function upsertQuestionnaireResponse(input: {
  userId: string;
  definitionKey: string;
  definitionVersion: string;
  responses: QuestionnaireResponses;
  activationId?: string | null;
  completedAt?: Date | null;
}): Promise<void> {
  const db = createHttpDb();
  const activationId = input.activationId ?? null;
  const completedAt = input.completedAt ?? null;
  await db
    .insert(questionnaireResponses)
    .values({
      userId: input.userId,
      definitionKey: input.definitionKey,
      definitionVersion: input.definitionVersion,
      responses: input.responses,
      activationId,
      completedAt,
    })
    .onConflictDoUpdate({
      target: [
        questionnaireResponses.userId,
        questionnaireResponses.definitionKey,
      ],
      set: {
        definitionVersion: input.definitionVersion,
        responses: input.responses,
        activationId,
        completedAt,
        updatedAt: new Date(),
      },
    });
}

/** A member's stored answers for one builder questionnaire, or null. */
export async function loadQuestionnaireResponse(
  userId: string,
  definitionKey: string,
): Promise<QuestionnaireResponseRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      responses: questionnaireResponses.responses,
      definitionVersion: questionnaireResponses.definitionVersion,
      activationId: questionnaireResponses.activationId,
      completedAt: questionnaireResponses.completedAt,
    })
    .from(questionnaireResponses)
    .where(
      and(
        eq(questionnaireResponses.userId, userId),
        eq(questionnaireResponses.definitionKey, definitionKey),
      ),
    )
    .limit(1);
  return row ?? null;
}
