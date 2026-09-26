import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { auth, authMayServe } from "@camp404/auth";
import { toAuthenticatedUser } from "./session-user";
import { isE2ETestMode, TEST_USER_COOKIE } from "./test-mode";
import { signInRedirect } from "./sign-in-redirect";

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
  /**
   * Whether the auth server has proven the member owns their address. Members
   * moved from Neon Auth with a password were never asked, so they start
   * false; the confirm-email card (Sign-in and security, and the invite gate)
   * is how they fix it. Not a gate on its own: `primaryEmail` already withholds
   * an unproven GOD_EMAILS address.
   */
  emailVerified: boolean;
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
    const session = await readSession();
    return toAuthenticatedUser(session?.user);
  },
);

/**
 * The address the session holds, even an unproven GOD_EMAILS address that
 * `primaryEmail` withholds. It exists for one job: asking the auth server to
 * send a confirm-your-email link, which Better Auth only sends to the
 * session's own address. Never use it for a gate or a god check; those read
 * `primaryEmail`.
 */
export async function getAddressToConfirm(): Promise<string | null> {
  if (isE2ETestMode()) {
    const fromCookie = await readTestUserCookie();
    if (fromCookie) return fromCookie.primaryEmail;
  }
  const session = await readSession();
  return session?.user.email ?? null;
}

/** One Better Auth session read per request, shared by the two readers above. */
const readSession = cache(async () => {
  if (!authMayServe(process.env)) return null;
  // No session is `null`; a THROW is a real failure (the database is down),
  // and it propagates to the error page rather than quietly showing every
  // member as signed out.
  return auth.api.getSession({ headers: await headers() });
});

/**
 * Same as getAuthenticatedUser but redirects to sign-in when unauthenticated,
 * with `?next=` naming the page when it is a console window, so a push or email
 * link survives signing in (lib/sign-in-redirect.ts).
 */
export async function getAuthenticatedUserOrRedirect(): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) return signInRedirect();
  return user;
}

async function readTestUserCookie(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(TEST_USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      decodeURIComponent(raw),
    ) as Partial<AuthenticatedUser>;
    if (typeof parsed.id !== "string" || !parsed.id) return null;
    return {
      id: parsed.id,
      primaryEmail: parsed.primaryEmail ?? null,
      displayName: parsed.displayName ?? null,
      // Verified unless a spec says otherwise, so every existing login stays
      // as it was; a spec passes `emailVerified: false` to see the
      // confirm-email card.
      emailVerified: parsed.emailVerified !== false,
    };
  } catch {
    return null;
  }
}
