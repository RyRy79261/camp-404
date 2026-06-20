"use server";

import { redirect } from "next/navigation";
import { validateResponses, type SaveResult } from "@camp404/types";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  hasCampAccess,
  satisfyBurnerProfileAction,
  setIdDocuments,
  setProfileImage,
  upsertBurnerProfile,
} from "@/lib/users";
import { splitIdNumber } from "@camp404/db/id-documents";
import { QUESTIONNAIRE_VERSION } from "@/lib/questionnaire";
import { getQuestionnaireForResponses } from "@/lib/questionnaire-config";

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

  // For non-final saves we tolerate missing required answers (the user is
  // still working through pages); for final submission we enforce everything.
  if (final) {
    // Validate against ALL teams (incl. archived), so a team archived between
    // render and submit doesn't make a just-picked team fail validation.
    const questionnaire = await getQuestionnaireForResponses();
    const result = validateResponses(questionnaire, rawResponses);
    if (!result.ok) return { ok: false, errors: result.errors };
  }

  const responses =
    rawResponses && typeof rawResponses === "object"
      ? (rawResponses as Record<string, unknown>)
      : {};

  try {
    // Split the sensitive government ID number out of the generic responses
    // JSONB so it is never persisted plaintext; it goes to the encrypted users
    // column instead (decryptable only by the owner and captains).
    const { cleaned, idType, idNumber } = splitIdNumber(responses);

    await upsertBurnerProfile({
      userId: campUser.id,
      version: QUESTIONNAIRE_VERSION,
      responses: cleaned,
      markComplete: final,
    });

    // Encryption here throws if PGCRYPTO_KEY is unset/short. We catch it and
    // return a typed error so the wizard can show a retry message instead of
    // silently failing to advance. The boot-time env check (instrumentation.ts)
    // is what makes this misconfiguration loud at deploy.
    if (idNumber) await setIdDocuments(campUser.id, { idType, idNumber });

    // Mirror the optional profile photo onto the canonical users column so it
    // can be read cheaply everywhere (header, profile page) without parsing
    // the questionnaire JSON. Runs on progress + final saves alike.
    const image = cleaned["profile.image"];
    if (typeof image === "string") {
      await setProfileImage(campUser.id, image.length > 0 ? image : null);
    }

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
