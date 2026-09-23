import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, authMayServe } from "@camp404/auth";
import { toAuthenticatedUser } from "./session-user";
import { isE2ETestMode, TEST_USER_COOKIE } from "./test-mode";

/**
 * Minimal authenticated-user shape we use across the app. Both the Better
 * Auth session and the test-mode harness produce values matching this —
 * callers don't need to know which one they got. `id` is Better Auth's
 * `user.id`, which `users.auth_user_id` holds.
 */
export interface AuthenticatedUser {
  id: string;
  primaryEmail: string | null;
  displayName: string | null;
}

/**
 * Reads the current authenticated user. In E2E test mode, the
 * `camp404_test_user` cookie (set via POST /api/test/login) takes precedence
 * and Better Auth is bypassed entirely. Otherwise this reads the self-hosted
 * Better Auth session (@camp404/auth): an in-process database read, no network
 * hop to a hosted auth service.
 *
 * Returns null when there is no session, or when auth may not serve on this
 * deployment (`authMayServe`: a Vercel deployment without BETTER_AUTH_SECRET
 * fails closed rather than trust a cookie signed with the public placeholder).
 *
 * Nothing here writes a cookie. Neon Auth's session read did (it refreshed its
 * cache cookie), which Next forbids during a render, and 75 lines of fallback
 * existed to survive that. Better Auth hands a refreshed cookie back in the
 * response headers, which a server component simply does not apply; the
 * browser's next /api/auth request refreshes it.
 *
 * `cache()` scopes the result to ONE request: the layout, the page and the
 * member gate all ask, and each would otherwise be a separate read. React
 * discards it when the request ends, so one member's session can never be
 * handed to another.
 */
export const getAuthenticatedUser = cache(
  async (): Promise<AuthenticatedUser | null> => {
    if (isE2ETestMode()) {
      const fromCookie = await readTestUserCookie();
      if (fromCookie) return fromCookie;
    }
    if (!authMayServe(process.env)) return null;
    // No session is `null`; a THROW is a real failure (the database is
    // down), and it propagates to the error page rather than quietly showing
    // every member as signed out.
    const session = await auth.api.getSession({ headers: await headers() });
    return toAuthenticatedUser(session?.user);
  },
);

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
