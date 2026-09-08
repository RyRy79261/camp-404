import { and, desc, eq, lte } from "drizzle-orm";
import type { QuestionnaireResponses } from "@camp404/types";
import { createHttpDb } from "./index";
import { questionnaireResponses } from "./schema";

// Generic response store for BUILDER questionnaires (code questionnaires keep
// their bespoke domain tables). One latest-answer row per (user, definition,
// cycle); the per-field change history lives in questionnaire_edits.
//
// `cycle` is the year namespace (see
// docs/superpowers/specs/2026-09-08-year-namespace-design.md). Both functions
// take it as a REQUIRED argument rather than defaulting to 1: every caller
// holds an activation and can supply `activation.cycle`, and a default would
// let a future caller silently write into the founding cycle.

export interface QuestionnaireResponseRow {
  responses: QuestionnaireResponses;
  definitionVersion: string;
  activationId: string | null;
  completedAt: Date | null;
  /**
   * Set when the row was carried in from an EARLIER cycle than the one asked
   * for — i.e. this is last year's answer seeding this year's form. Null when
   * the row belongs to the requested cycle.
   */
  seededFromCycle: number | null;
}

/**
 * Upsert a member's answers for one builder questionnaire (unique by
 * `(user, definitionKey, cycle)`). Called on every page advance (`completedAt`
 * null) and on final submit (`completedAt` set).
 *
 * Reads may fall back to an earlier cycle; writes never do. A carry-over member
 * who reaffirms last year's answer in year N gets a year-N row, which is what
 * correctly records that they reaffirmed it — and leaves year N-1's row intact.
 */
export async function upsertQuestionnaireResponse(input: {
  userId: string;
  definitionKey: string;
  definitionVersion: string;
  cycle: number;
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
      cycle: input.cycle,
      responses: input.responses,
      activationId,
      completedAt,
    })
    .onConflictDoUpdate({
      target: [
        questionnaireResponses.userId,
        questionnaireResponses.definitionKey,
        questionnaireResponses.cycle,
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

/**
 * A member's stored answers for one builder questionnaire in one cycle, or null.
 *
 * `opts` comes from the ACTIVATION the member is answering
 * (`activation.cycle` / `activation.carryOver`), never from the live config, so
 * an in-flight form stays consistent with the row it will write even if a
 * captain rolls the year over or flips the toggle mid-collection.
 */
export async function loadQuestionnaireResponse(
  userId: string,
  definitionKey: string,
  opts: { cycle: number; carryOver: boolean },
): Promise<QuestionnaireResponseRow | null> {
  const db = createHttpDb();
  const [row] = await db
    .select({
      responses: questionnaireResponses.responses,
      definitionVersion: questionnaireResponses.definitionVersion,
      activationId: questionnaireResponses.activationId,
      completedAt: questionnaireResponses.completedAt,
      cycle: questionnaireResponses.cycle,
    })
    .from(questionnaireResponses)
    .where(
      and(
        eq(questionnaireResponses.userId, userId),
        eq(questionnaireResponses.definitionKey, definitionKey),
        // carry: the newest answer AT OR BELOW this cycle, so a member amends
        //        last year's answers rather than retyping them.
        // fresh: strictly THIS cycle — no row means a genuinely blank form,
        //        which is what "it must do so fresh" means.
        opts.carryOver
          ? lte(questionnaireResponses.cycle, opts.cycle)
          : eq(questionnaireResponses.cycle, opts.cycle),
      ),
    )
    .orderBy(desc(questionnaireResponses.cycle))
    .limit(1);
  if (!row) return null;

  const seededFromCycle = row.cycle < opts.cycle ? row.cycle : null;
  return {
    responses: row.responses,
    definitionVersion: row.definitionVersion,
    activationId: row.activationId,
    // The seed trap: a row carried in from an earlier cycle MUST report
    // `completedAt: null`, or the prefilled form satisfies its own gate and
    // `carry` and `fresh` collapse into the same thing. Forced here, in the
    // loader, so no caller can forget to do it.
    completedAt: seededFromCycle === null ? row.completedAt : null,
    seededFromCycle,
  };
}
