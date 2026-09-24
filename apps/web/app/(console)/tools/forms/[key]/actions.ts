"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { diffResponses } from "@camp404/types";
import { ID_NUMBER_KEY } from "@camp404/db/id-documents";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { ensureCampUser, hasCampAccess, isApproved } from "@/lib/users";
import { getReplayableForm } from "@/lib/forms";

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

  // Each form owns its server checks, and names what to diff against (the
  // burner profile: every team, including archived ones).
  const result = await form.validate(rawResponses, new Date());
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
    result.diffAgainst,
    state.responses,
    result.responses,
  ).filter((c) => c.fieldId !== ID_NUMBER_KEY);

  // The answers and their change-log row are one write: a failure leaves
  // neither, never changed answers with no record.
  await form.save(
    campUser.id,
    result.responses,
    changes.length > 0 ? { editedByUserId: campUser.id, changes } : null,
  );

  revalidatePath(`/tools/forms/${key}`);
  revalidatePath("/tools/forms");
  return { ok: true };
}
