"use server";

import { redirect } from "next/navigation";
import { validateResponses } from "@camp404/types";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import {
  ensureCampUser,
  hasCampAccess,
  setProfileImage,
  upsertBurnerProfile,
} from "@/lib/users";
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

  await upsertBurnerProfile({
    userId: campUser.id,
    version: QUESTIONNAIRE.version,
    responses,
    markComplete: final,
  });

  // Mirror the optional profile photo onto the canonical users column so it
  // can be read cheaply everywhere (header, profile page) without parsing
  // the questionnaire JSON. Runs on progress + final saves alike.
  const image = responses["profile.image"];
  if (typeof image === "string") {
    await setProfileImage(campUser.id, image.length > 0 ? image : null);
  }

  if (final) redirect("/");
  return { ok: true };
}
