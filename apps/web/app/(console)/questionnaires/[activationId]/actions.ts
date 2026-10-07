"use server";

import { revalidateManifest } from "@/lib/manifest-revalidate";
import { redirect } from "next/navigation";
import { QuestionnaireResponses, type SaveResult } from "@camp404/types";
import {
  answersLeadsOnly,
  boundDraftResponses,
  errorLogText,
  questionnaireForViewer,
  questionnaireRoleMirror,
  validateSubmission,
} from "@camp404/core";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { viewerSeesLeadsOnly } from "@/lib/questionnaire-viewer";
import {
  completeBuilderResponse,
  getActivationById,
  getOptInAccess,
  getRequiredAction,
} from "@camp404/db/activations";
import { upsertQuestionnaireResponse } from "@camp404/db/questionnaire-responses";
import { getBuilderDefinition } from "@/lib/questionnaire-definitions";

const SAVE_FAILED =
  "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know.";
const SAVE_REJECTED =
  "We couldn't save that — your answers are unreadable or too large. Please reload and try again.";
const ALREADY_ANSWERED =
  "You've already answered this. Your answers are in My forms.";
const LEADS_ONLY_REFUSED =
  "Some of these answers are for team leads only. Reload the page and try again.";

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
  // An optional questionnaire (#313) has no gate: any camp member may answer
  // it once, while it is open. Its writes below are compare-and-sets on "not
  // finished yet", so a second submit or a late draft cannot reopen it.
  const optIn = activation.scope === "opt_in";
  if (optIn) {
    const access = await getOptInAccess(campUser.id, activation);
    if (access === "completed") {
      return { ok: false, errors: { _form: ALREADY_ANSWERED } };
    }
    if (access !== "answer") {
      return { ok: false, errors: { _form: "This form is closed." } };
    }
  } else {
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
  const fullDefinition = await getBuilderDefinition(
    activation.questionnaireKey,
    activation.version,
  );
  if (!fullDefinition) {
    return { ok: false, errors: { _form: "This form is unavailable." } };
  }
  // "Team leads and up" questions (#251): a member's runner never shows them,
  // so an answer to one is a hand-made request and is refused whole. The rest
  // is checked against the definition as this member sees it, so a required
  // leads-only question never blocks them.
  const viewer = {
    seesLeadsOnly: await viewerSeesLeadsOnly(campUser, fullDefinition),
  };
  if (answersLeadsOnly(fullDefinition, viewer, responses)) {
    return { ok: false, errors: { _form: LEADS_ONLY_REFUSED } };
  }
  const definition = questionnaireForViewer(fullDefinition, viewer);

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

  let written: boolean;
  try {
    if (final) {
      // Atomic: upsert the completed response + satisfy the gate in one
      // transaction, so a response can't be marked complete while the gate
      // stays pending.
      written = await completeBuilderResponse({
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
        firstSubmitOnly: optIn,
      });
    } else {
      written = await upsertQuestionnaireResponse({
        userId: campUser.id,
        definitionKey: activation.questionnaireKey,
        definitionVersion: activation.version,
        cycle: activation.cycle,
        responses: toStore,
        activationId: activation.id,
        completedAt: null,
        keepCompleted: optIn,
      });
    }
  } catch (err) {
    console.error(
      "saveBuilderResponses persistence failed",
      errorLogText(err, process.env),
    );
    return { ok: false, errors: { _form: SAVE_FAILED } };
  }
  // Lost the race to another submit of the same optional questionnaire.
  if (optIn && !written) {
    return { ok: false, errors: { _form: ALREADY_ANSWERED } };
  }

  // redirect() throws a control-flow signal, so it lives outside the try/catch.
  // Every final submit lands on the S27 completion screen, which says what is
  // next: the next required questionnaire, or back to camp.
  if (final) {
    // The console layout drew this member bare while the gate held them, and
    // Next keeps a layout across in-app navigation, so without this the
    // completion screen and every page after it stayed headerless until a
    // reload (owner's report, 2026-09-25). Refresh from the root layout down.
    revalidateManifest();
    // An optional questionnaire goes back to My forms, which says it is saved
    // and moves it under Submitted questionnaires.
    redirect(
      optIn
        ? `/tools/forms?answered=${activation.id}`
        : `/questionnaires/${activation.id}/complete`,
    );
  }
  return { ok: true };
}
