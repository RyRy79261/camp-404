"use server";

import { redirect } from "next/navigation";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { redeemInviteForUser } from "@/lib/users";

export type SubmitInviteResult = { ok: false; error: string };

/**
 * Post-auth invite gate. The user is already signed in via Neon Auth; this
 * claims the code they entered and stamps it onto their camp row (creating
 * the row on first redemption). On success we send them home, which routes
 * onward to the questionnaire / approval gates. On failure we return the
 * error for the form to surface — `useActionState` keeps them on the gate.
 */
export async function submitInviteCode(
  _prev: SubmitInviteResult | null,
  formData: FormData,
): Promise<SubmitInviteResult> {
  const authUser = await getAuthenticatedUserOrRedirect();
  const raw = formData.get("code");
  const code = typeof raw === "string" ? raw : "";

  const result = await redeemInviteForUser(authUser, code);
  if (!result.ok) return { ok: false, error: result.error };

  redirect("/");
}
