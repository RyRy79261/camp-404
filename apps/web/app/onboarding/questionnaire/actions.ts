"use server";

import { redirect } from "next/navigation";
import { validateResponses } from "@camp404/types";
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
import { QUESTIONNAIRE } from "@/lib/questionnaire";

export type SaveResult =
  | { ok: true }
  | { ok: false; errors: Record<string, string> };

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
    const result = validateResponses(QUESTIONNAIRE, rawResponses);
    if (!result.ok) return { ok: false, errors: result.errors };
  }

  const responses =
    rawResponses && typeof rawResponses === "object"
      ? (rawResponses as Record<string, unknown>)
      : {};

  // Split the sensitive government ID number out of the generic responses
  // JSONB so it is never persisted plaintext; it goes to the encrypted users
  // column instead (decryptable only by the owner and captains).
  const { cleaned, idType, idNumber } = splitIdNumber(responses);

  await upsertBurnerProfile({
    userId: campUser.id,
    version: QUESTIONNAIRE.version,
    responses: cleaned,
    markComplete: final,
  });

  // Persist the sensitive ID number only on the final submit. Progress saves
  // already strip it from the responses JSONB (splitIdNumber above), so it is
  // never stored plaintext; deferring the encrypted-column write means the
  // mid-onboarding "Next" between pages doesn't depend on the encryption path
  // (a missing/short PGCRYPTO_KEY surfaces a clear error at Finish instead of
  // silently blocking the user from advancing past the "About you" page).
  if (final && idNumber) await setIdDocuments(campUser.id, { idType, idNumber });

  // Mirror the optional profile photo onto the canonical users column so it
  // can be read cheaply everywhere (header, profile page) without parsing
  // the questionnaire JSON. Runs on progress + final saves alike.
  const image = cleaned["profile.image"];
  if (typeof image === "string") {
    await setProfileImage(campUser.id, image.length > 0 ? image : null);
  }

  if (final) {
    // Completing the profile satisfies the burner-profile required action that
    // gates the app (no-op under E2E test mode — the fallback gate covers it).
    await satisfyBurnerProfileAction(campUser.id);
    redirect("/");
  }
  return { ok: true };
}
