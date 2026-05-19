"use server";

import { redirect } from "next/navigation";
import { upsertBurnerProfile } from "@camp404/db/burner-profile";
import { validateResponses } from "@camp404/types";
import { stackServerApp } from "@/stack";
import { ensureCampUser, hasCampAccess } from "@/lib/users";
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
  const stackUser = await stackServerApp.getUser({ or: "redirect" });
  const campUser = await ensureCampUser(stackUser);
  if (!hasCampAccess(campUser, stackUser.primaryEmail ?? null)) {
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

  if (final) redirect("/");
  return { ok: true };
}
