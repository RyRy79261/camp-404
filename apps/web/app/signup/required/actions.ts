"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { humanDuration } from "@camp404/core";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { redeemInviteForUser } from "@/lib/users";
import { getClientIp, rateLimiter } from "@/lib/rate-limit";

export type SubmitInviteResult = { ok: false; error: string };

/**
 * Post-auth invite gate. The user is already signed in; this
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

  // Throttle brute-forcing of invite codes (esp. the short env bootstrap
  // codes). Two buckets, because neither holds alone: an IP limit is evaded
  // by changing address, and a per-account limit is evaded by signing up
  // again, since sign-up is open and every new account starts a fresh budget.
  // The address bucket is wider so a household or festival Wi-Fi sharing one
  // IP can still get everyone in.
  const buckets = [
    [`invite-redeem:${authUser.id}`, 10],
    [`invite-redeem-ip:${getClientIp(await headers())}`, 30],
  ] as const;
  for (const [key, limit] of buckets) {
    const limited = await rateLimiter.limit(key, {
      limit,
      windowMs: 10 * 60_000,
    });
    if (!limited.ok) {
      return {
        ok: false,
        error: `Too many attempts. Try again in ${humanDuration(limited.retryAfterSeconds)}.`,
      };
    }
  }

  const raw = formData.get("code");
  const code = typeof raw === "string" ? raw : "";

  const result = await redeemInviteForUser(authUser, code);
  if (!result.ok) return { ok: false, error: result.error };

  redirect("/");
}
