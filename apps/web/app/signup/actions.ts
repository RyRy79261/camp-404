"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  INVITE_COOKIE,
  INVITE_COOKIE_MAX_AGE_SECONDS,
  isValidInviteCode,
} from "@/lib/access-control";

export type RedeemInviteResult =
  | { ok: true }
  | { ok: false; error: string };

// Only allow same-origin paths as redirect targets to avoid open-redirect.
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "/handler/sign-up";
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/handler/sign-up";
  }
  return value;
}

/**
 * Validate an invite code and — if valid — drop a signed HttpOnly cookie
 * that the post-signup flow reads to know the new account is allowed.
 * Redirects to the `next` form field (defaults to Stack's sign-up UI).
 */
export async function redeemInviteCode(
  _prev: RedeemInviteResult | null,
  formData: FormData,
): Promise<RedeemInviteResult> {
  const raw = formData.get("code");
  const code = typeof raw === "string" ? raw.trim() : "";
  if (!code) return { ok: false, error: "Please enter an invite code." };
  if (!isValidInviteCode(code)) {
    return { ok: false, error: "That invite code isn't valid." };
  }

  const cookieStore = await cookies();
  cookieStore.set(INVITE_COOKIE, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: INVITE_COOKIE_MAX_AGE_SECONDS,
  });

  redirect(safeNext(formData.get("next")));
}
