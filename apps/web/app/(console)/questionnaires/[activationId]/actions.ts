"use server";

import { redirect } from "next/navigation";
import { QuestionnaireResponses, type SaveResult } from "@camp404/types";
import {
  boundDraftResponses,
  questionnaireRoleMirror,
  validateSubmission,
} from "@camp404/core";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import {
  completeBuilderResponse,
  getActivationById,
  getRequiredAction,
} from "@camp404/db/activations";
import { upsertQuestionnaireResponse } from "@camp404/db/questionnaire-responses";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";

const SAVE_FAILED =
  "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know.";
const SAVE_REJECTED =
  "We couldn't save that — your answers are unreadable or too large. Please reload and try again.";

/**
 * Persist a builder questionnaire's responses for the signed-in member.
 * `activationId` is bound at the runner so the wizard keeps its (responses,
 * final) action shape. Re-verifies the access predicate on every call (never
 * trust the client), reads the activation's pinned version as the unified
 * model, bounds every draft save against it (boundDraftResponses) and runs the
 * branch- and visibility-aware validator on the final submit
 * (validateSubmission), upserts the latest-answer row for the activation's
 * cycle, and on submit satisfies the required action — copying role answers
 * into the app's tables (questionnaireRoleMirror) — and goes to the S27
 * completion screen, which routes onward.
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
  // Access predicate — the viewer must have a PENDING obligation for this
  // questionnaire. A completed/waived/expired row must NOT write: a stale
  // partial save (completedAt=null) would otherwise wipe a completed row's
  // completedAt and diverge from required_actions.status.
  const targeted = await getRequiredAction(
    campUser.id,
    activation.questionnaireKey,
  );
  if (
    !targeted ||
    targeted.status !== "pending" ||
    targeted.activationId !== activation.id
  ) {
    return { ok: false, errors: { _form: "This form is closed." } };
  }

  // Structurally validate on EVERY save (not just final) so a malformed client
  // payload can never land in the responses JSONB. Per-field / required checks
  // still run only on final, so partial progress with empty requireds resumes.
  const parsed = QuestionnaireResponses.safeParse(rawResponses);
  if (!parsed.success) {
    return {
      ok: false,
      errors: {
        _form: "We couldn't read your answers. Please reload and try again.",
      },
    };
  }
  const responses = parsed.data;

  // The version-pinned definition is now needed on EVERY save, not just the
  // final one: a draft is bounded against ITS field ids below.
  const definition = await getBuilderDefinition(
    activation.questionnaireKey,
    activation.version,
  );
  if (!definition) {
    return { ok: false, errors: { _form: "This form is unavailable." } };
  }

  let toStore: QuestionnaireResponses;
  if (final) {
    // Only the questions the member is ASKED — shown, on the path their
    // answers walk — are required; any other valid answer is kept.
    const result = validateSubmission(definition, responses);
    if (!result.ok) return { ok: false, errors: result.errors };
    toStore = result.responses;
  } else {
    // Non-final: no per-field / required checks — partial progress with empty
    // requireds must resume — but the draft is restricted to the definition's
    // own question ids and size-capped before it reaches the JSONB. (DEFERRED.md
    // "Server-side validation": size cap + key allow-list on non-final saves.)
    const draft = boundDraftResponses(definition, responses);
    if (!draft.ok) return { ok: false, errors: { _form: SAVE_REJECTED } };
    toStore = draft.responses;
  }

  try {
    if (final) {
      // Atomic: upsert the completed response + satisfy the gate in one
      // transaction, so a response can't be marked complete while the gate
      // stays pending.
      await completeBuilderResponse({
        userId: campUser.id,
        definitionKey: activation.questionnaireKey,
        definitionVersion: activation.version,
        // The activation's FROZEN cycle, never the live config's: a rollover
        // landing mid-form must not move this answer into the next year.
        cycle: activation.cycle,
        responses: toStore,
        activationId: activation.id,
        // Answers marked for the app's own tables (allergies, driving this
        // year, arrival day…) land there in the same transaction.
        mirror: questionnaireRoleMirror(definition, toStore),
      });
    } else {
      await upsertQuestionnaireResponse({
        userId: campUser.id,
        definitionKey: activation.questionnaireKey,
        definitionVersion: activation.version,
        cycle: activation.cycle,
        responses: toStore,
        activationId: activation.id,
        completedAt: null,
      });
    }
  } catch (err) {
    console.error("saveBuilderResponses persistence failed", err);
    return { ok: false, errors: { _form: SAVE_FAILED } };
  }

  // redirect() throws a control-flow signal, so it lives outside the try/catch.
  // Every final submit lands on the S27 completion screen, which says what is
  // next: the next required questionnaire, or back to camp.
  if (final) {
    redirect(`/questionnaires/${activation.id}/complete`);
  }
  return { ok: true };
}
