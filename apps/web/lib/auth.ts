import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { stackServerApp } from "@/stack";
import { isE2ETestMode, TEST_USER_COOKIE } from "./test-mode";

/**
 * Minimal authenticated-user shape we use across the app. Both Stack's
 * CurrentServerUser and the test-mode harness produce values matching
 * this — callers don't need to know which one they got.
 */
export interface AuthenticatedUser {
  id: string;
  primaryEmail: string | null;
  displayName: string | null;
}

/**
 * Reads the current authenticated user. In E2E test mode, the
 * `camp404_test_user` cookie (set via POST /api/test/login) takes
 * precedence and Stack is bypassed entirely. Otherwise this falls through
 * to Stack's session-cookie reader.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (isE2ETestMode()) {
    const fromCookie = await readTestUserCookie();
    if (fromCookie) return fromCookie;
  }
  const stackUser = await stackServerApp.getUser();
  if (!stackUser) return null;
  return {
    id: stackUser.id,
    primaryEmail: stackUser.primaryEmail ?? null,
    displayName: stackUser.displayName ?? null,
  };
}

/** Same as getAuthenticatedUser but redirects to sign-in when unauthenticated. */
export async function getAuthenticatedUserOrRedirect(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/handler/sign-in");
  return user;
}

async function readTestUserCookie(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TEST_USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<AuthenticatedUser>;
    if (typeof parsed.id !== "string" || !parsed.id) return null;
    return {
      id: parsed.id,
      primaryEmail: parsed.primaryEmail ?? null,
      displayName: parsed.displayName ?? null,
    };
  } catch {
    return null;
  }
}
