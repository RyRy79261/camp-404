"use server";

import { redirect } from "next/navigation";
import { validateBuilderResponses } from "@camp404/types";
import type { QuestionnaireResponses } from "@camp404/types";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getPendingRequiredActions,
  hasCampAccess,
} from "@/lib/users";
import {
  getActivationById,
  getRequiredAction,
  satisfyRequiredAction,
} from "@camp404/db/activations";
import { upsertQuestionnaireResponse } from "@camp404/db/questionnaire-responses";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";
import { nextGate } from "@/lib/required-actions";

export type SaveResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

const SAVE_FAILED =
  "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know.";

/**
 * Persist a builder questionnaire's responses for the signed-in member.
 * `activationId` is bound at the runner so the wizard keeps its (responses,
 * final) action shape. Re-verifies the access predicate on every call (never
 * trust the client), validates only on the final submit, upserts the
 * latest-answer row, and on submit satisfies the required action and routes to
 * the next gate.
 */
export async function saveBuilderResponses(
  activationId: string,
  rawResponses: unknown,
  final: boolean,
): Promise<SaveResult> {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }

  const activation = await getActivationById(activationId);
  if (!activation || activation.status !== "open") {
    return { ok: false, errors: { _form: "This form is closed." } };
  }
  // Access predicate — the viewer must have been targeted by this activation.
  const targeted = await getRequiredAction(campUser.id, activation.questionnaireKey);
  if (!targeted) {
    return { ok: false, errors: { _form: "You're not on this questionnaire." } };
  }

  const responses: QuestionnaireResponses =
    rawResponses && typeof rawResponses === "object"
      ? (rawResponses as QuestionnaireResponses)
      : {};

  let toStore = responses;
  if (final) {
    const definition = await getBuilderDefinition(
      activation.questionnaireKey,
      activation.version,
    );
    if (!definition) {
      return { ok: false, errors: { _form: "This form is unavailable." } };
    }
    const result = validateBuilderResponses(definition, responses);
    if (!result.ok) return { ok: false, errors: result.errors };
    toStore = result.responses;
  }

  try {
    await upsertQuestionnaireResponse({
      userId: campUser.id,
      definitionKey: activation.questionnaireKey,
      definitionVersion: activation.version,
      responses: toStore,
      activationId: activation.id,
      completedAt: final ? new Date() : null,
    });
    if (final) {
      await satisfyRequiredAction(
        campUser.id,
        activation.questionnaireKey,
        activation.version,
      );
    }
  } catch (err) {
    console.error("saveBuilderResponses persistence failed", err);
    return { ok: false, errors: { _form: SAVE_FAILED } };
  }

  // redirect() throws a control-flow signal, so it lives outside the try/catch.
  if (final) {
    const gate = nextGate(await getPendingRequiredActions(campUser.id));
    redirect(gate ?? "/");
  }
  return { ok: true };
}
