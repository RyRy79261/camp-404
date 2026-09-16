"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  diffResponses,
  incompleteContactErrors,
  validateResponses,
} from "@camp404/types";
import { ID_NUMBER_KEY } from "@camp404/db/id-documents";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getReplayableForm, recordFormEdit } from "@/lib/forms";
import { identityAnswerErrors } from "@/lib/id-validation";
import { getQuestionnaireForResponses } from "@/lib/questionnaire-config";

export type SaveResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

/**
 * Persist a replayed (re-submitted) questionnaire. The replay wizard runs
 * with `persistProgress=false`, so only the final submit reaches here with
 * `final = true`; intermediate "Next" presses do not call this at all. On
 * the final submit we validate, diff the new answers against what was stored,
 * write the change log, and save. A replay that changed nothing saves the
 * (identical) answers but records no change-log row.
 */
export async function saveFormReplay(
  key: string,
  rawResponses: unknown,
  final: boolean,
): Promise<SaveResult> {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }
  // The page sends a pending applicant to /pending-approval, but this action is
  // reachable by a direct POST. Owner's call (2026-09-16): a pending applicant
  // cannot save form edits. Onboarding completion is checked below, where the
  // form's own completion is read.
  if (!isApproved(campUser, authUser.primaryEmail)) {
    return {
      ok: false,
      errors: { _root: "Your account is still awaiting approval." },
    };
  }

  const form = await getReplayableForm(key);
  if (!form) return { ok: false, errors: { _root: "Unknown form." } };

  // Nothing to persist until the user commits the whole form.
  if (!final) return { ok: true };

  // Validate + diff against ALL teams (incl. archived), not the active-only
  // picker (form.questionnaire) the user saw: the multi_select validator
  // silently DROPS values not in its options, so validating an old response
  // that picked a since-archived team against the active set would erase it on
  // re-save. The full catalogue is the superset that keeps it valid + labelled.
  const catalogue = await getQuestionnaireForResponses();
  const result = validateResponses(catalogue, rawResponses);
  if (!result.ok) return { ok: false, errors: result.errors };
  // The wizard checks these before it submits; a direct POST skips it.
  const identity = identityAnswerErrors(result.responses, new Date());
  if (Object.keys(identity).length > 0) {
    return {
      ok: false,
      errors: { ...identity, _root: "Check your ID number and date of birth." },
    };
  }
  const contactErrors = incompleteContactErrors(catalogue, result.responses);
  if (Object.keys(contactErrors).length > 0) {
    return {
      ok: false,
      errors: {
        ...contactErrors,
        _root: "Finish or clear your second emergency contact.",
      },
    };
  }

  const state = await form.load(campUser.id);
  if (!state?.completedAt) {
    return {
      ok: false,
      errors: { _root: "This form hasn't been completed yet." },
    };
  }

  // Exclude the government ID number from the change-log so its plaintext
  // never lands in questionnaire_edits (it lives encrypted on users, and the
  // owner's load() merges it back into both sides of the diff).
  const changes = diffResponses(
    catalogue,
    state.responses,
    result.responses,
  ).filter((c) => c.fieldId !== ID_NUMBER_KEY);

  await form.save(campUser.id, result.responses);

  if (changes.length > 0) {
    await recordFormEdit({
      userId: campUser.id,
      questionnaireKey: form.key,
      version: catalogue.version,
      editedByUserId: campUser.id,
      changes,
    });
  }

  revalidatePath(`/tools/forms/${key}`);
  revalidatePath("/tools/forms");
  return { ok: true };
}
