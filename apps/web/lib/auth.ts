import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/neon-auth";
import { isE2ETestMode, TEST_USER_COOKIE } from "./test-mode";

/**
 * Minimal authenticated-user shape we use across the app. Both Neon
 * Auth's session and the test-mode harness produce values matching
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
 * precedence and Neon Auth is bypassed entirely. Otherwise this falls
 * through to Neon Auth's session reader.
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  if (isE2ETestMode()) {
    const fromCookie = await readTestUserCookie();
    if (fromCookie) return fromCookie;
  }
  const { data: session } = await auth.getSession();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    primaryEmail: session.user.email ?? null,
    displayName: session.user.name ?? null,
  };
}

/** Same as getAuthenticatedUser but redirects to sign-in when unauthenticated. */
export async function getAuthenticatedUserOrRedirect(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/auth/sign-in");
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
