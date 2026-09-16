"use server";

import { redirect } from "next/navigation";
import {
  boundDraftResponses,
  flattenQuestions,
  incompleteContactErrors,
  questionIdForRole,
  questionsWithRole,
  splitEmergencyContacts,
  validateResponses,
  type SaveResult,
} from "@camp404/types";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  getBurnerProfile,
  hasCampAccess,
  satisfyBurnerProfileAction,
  setEmergencyContacts,
  setIdDocuments,
  setProfileImage,
  upsertBurnerProfile,
} from "@/lib/users";
import { splitIdNumber } from "@camp404/db/id-documents";
import { identityAnswerErrors } from "@/lib/id-validation";
import { QUESTIONNAIRE_VERSION } from "@/lib/questionnaire";
import { getQuestionnaireForResponses } from "@/lib/questionnaire-config";

const IDENTITY_REFUSED = "Check your ID number and date of birth.";
const CONTACT_REFUSED = "Finish or clear your second emergency contact.";

/**
 * Persist questionnaire responses. If `final` is true the burner profile is
 * marked complete and the user is redirected home; otherwise we just save
 * progress and return so the wizard can advance to the next page.
 */
export async function saveBurnerProfile(
  rawResponses: unknown,
  final: boolean,
): Promise<SaveResult> {
  const authUser = await getAuthenticatedUserOrRedirect();
  const campUser = await ensureCampUser(authUser);
  if (!hasCampAccess(campUser, authUser.primaryEmail)) {
    redirect("/signup/required");
  }

  // Onboarding writes a profile once. After it is complete, a change goes
  // through My forms (saveFormReplay), which validates the whole form, keeps
  // the change log and gates on approval. The page already sends a completed
  // member home, but this action takes a direct POST: without this check a
  // draft save would replace a finished profile with partial answers, with no
  // record, including an applicant's while a captain reviews it.
  const existing = await getBurnerProfile(campUser.id);
  if (existing?.completedAt) {
    return {
      ok: false,
      errors: {
        _form:
          "Your profile is already complete. To change an answer, use My forms.",
      },
    };
  }

  // Validate against ALL teams (incl. archived), so a team archived between
  // render and submit doesn't make a just-picked team fail validation.
  const questionnaire = await getQuestionnaireForResponses();

  // For non-final saves we tolerate missing required answers (the user is
  // still working through pages); for final submission we enforce everything.
  // Either way what we PERSIST is the checked map, never the raw client
  // object — matching the replay path in app/tools/forms/[key]/actions.ts.
  let responses: Record<string, unknown>;
  if (final) {
    const result = validateResponses(questionnaire, rawResponses);
    if (!result.ok) return { ok: false, errors: result.errors };
    // The wizard checks these before it submits; a direct POST skips it.
    const identity = identityAnswerErrors(result.responses, new Date());
    if (Object.keys(identity).length > 0) {
      return { ok: false, errors: { ...identity, _form: IDENTITY_REFUSED } };
    }
    const contacts = incompleteContactErrors(questionnaire, result.responses);
    if (Object.keys(contacts).length > 0) {
      return { ok: false, errors: { ...contacts, _form: CONTACT_REFUSED } };
    }
    responses = result.responses;
  } else {
    const draft = boundDraftResponses(
      rawResponses,
      flattenQuestions(questionnaire).map((q) => q.id),
    );
    if (!draft.ok) {
      return {
        ok: false,
        errors: {
          _form:
            "We couldn't save that — your answers are unreadable or too large. Please reload and try again.",
        },
      };
    }
    responses = draft.responses;
  }

  try {
    // Split the sensitive government ID number out of the generic responses
    // JSONB so it is never persisted plaintext; it goes to the encrypted users
    // column instead (decryptable only by the owner and captains). The
    // emergency contacts come out the same way, by question role, onto
    // users.emergency_contacts, so reading them is one audited path.
    const split = splitIdNumber(responses);
    const { idType, idNumber } = split;
    const { cleaned, contacts } = splitEmergencyContacts(
      questionnaire,
      split.cleaned,
    );

    // The side writes come BEFORE the write that can mark the profile
    // complete. If one of them fails, nothing is complete yet, so the member
    // can simply submit again. The other way round, a failure left a
    // "complete" profile with the ID number or photo missing, and the check
    // above would then refuse the retry.
    //
    // Encryption here throws if PGCRYPTO_KEY is unset/short. We catch it and
    // return a typed error so the wizard can show a retry message instead of
    // silently failing to advance. The boot-time env check (instrumentation.ts)
    // is what makes this misconfiguration loud at deploy.
    if (idNumber) await setIdDocuments(campUser.id, { idType, idNumber });
    // Only a save that carries the contact page's answers touches the column,
    // so a progress save from an earlier page never clears contacts already on
    // file. A half-filled contact is not stored.
    const nameQuestions = questionsWithRole(
      questionnaire,
      "emergency_contact_name",
    );
    if (nameQuestions.some((q) => q.id in responses)) {
      await setEmergencyContacts(campUser.id, contacts);
    }

    // Mirror the optional profile photo onto the canonical users column so it
    // can be read cheaply everywhere (header, profile page) without parsing
    // the questionnaire JSON. Runs on progress + final saves alike. Found by
    // role, not by question id.
    const photoId = questionIdForRole(questionnaire, "profile_photo");
    const image = photoId ? cleaned[photoId] : undefined;
    if (typeof image === "string") {
      await setProfileImage(campUser.id, image.length > 0 ? image : null);
    }

    await upsertBurnerProfile({
      userId: campUser.id,
      version: QUESTIONNAIRE_VERSION,
      responses: cleaned,
      markComplete: final,
    });

    if (final) {
      // Completing the profile satisfies the burner-profile required action
      // that gates the app (no-op under E2E test mode — the fallback gate
      // covers it).
      await satisfyBurnerProfileAction(campUser.id);
    }
  } catch (err) {
    // Leave a server-side trace (which await threw) while keeping the
    // user-facing message generic — matches the catch pattern in the API
    // routes and the new error boundaries.
    console.error("saveBurnerProfile persistence failed", err);
    return {
      ok: false,
      errors: {
        _form:
          "We couldn't save your answers just now. Please try again — if it keeps happening, let a camp captain know.",
      },
    };
  }

  // redirect() throws a control-flow signal that must escape the try/catch
  // above, so it lives out here after persistence has succeeded.
  if (final) redirect("/");
  return { ok: true };
}
