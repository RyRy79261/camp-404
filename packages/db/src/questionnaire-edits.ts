import { and, desc, eq } from "drizzle-orm";
import type { QuestionnaireFieldChange } from "@camp404/types";
import { createHttpDb } from "./index";
import * as schema from "./schema";

export interface QuestionnaireEditRow {
  id: string;
  questionnaireKey: string;
  version: string;
  editedByUserId: string | null;
  changes: QuestionnaireFieldChange[];
  createdAt: Date;
}

/**
 * Append one edit-session row to the change log. Callers should skip the
 * insert entirely when `changes` is empty — a replay that altered nothing is
 * not worth a row.
 */
export async function recordQuestionnaireEdit(input: {
  userId: string;
  questionnaireKey: string;
  version: string;
  editedByUserId: string | null;
  changes: QuestionnaireFieldChange[];
}): Promise<void> {
  const db = createHttpDb();
  await db.insert(schema.questionnaireEdits).values({
    userId: input.userId,
    questionnaireKey: input.questionnaireKey,
    version: input.version,
    editedByUserId: input.editedByUserId,
    changes: input.changes,
  });
}

/**
 * Most-recent-first edit log for one user + questionnaire.
 */
export async function listQuestionnaireEdits(
  userId: string,
  questionnaireKey: string,
  limit = 20,
): Promise<QuestionnaireEditRow[]> {
  const db = createHttpDb();
  const rows = await db
    .select({
      id: schema.questionnaireEdits.id,
      questionnaireKey: schema.questionnaireEdits.questionnaireKey,
      version: schema.questionnaireEdits.version,
      editedByUserId: schema.questionnaireEdits.editedByUserId,
      changes: schema.questionnaireEdits.changes,
      createdAt: schema.questionnaireEdits.createdAt,
    })
    .from(schema.questionnaireEdits)
    .where(
      and(
        eq(schema.questionnaireEdits.userId, userId),
        eq(schema.questionnaireEdits.questionnaireKey, questionnaireKey),
      ),
    )
    .orderBy(desc(schema.questionnaireEdits.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    changes: (r.changes as QuestionnaireFieldChange[] | null) ?? [],
  }));
}
