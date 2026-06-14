"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { diffResponses, validateResponses } from "@camp404/types";
import { ID_NUMBER_KEY } from "@camp404/db/id-documents";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
import { getReplayableForm, recordFormEdit } from "@/lib/forms";
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
