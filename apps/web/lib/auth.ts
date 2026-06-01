import "server-only";

import { cookies, headers } from "next/headers";
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

// Neon Auth cookie names (these mirror the internal constants in
// @neondatabase/auth). Only cookies under this prefix are forwarded to the
// upstream auth server, and the session token is the one that proves there
// is a session to read.
const NEON_AUTH_COOKIE_PREFIX = "__Secure-neon-auth";
const NEON_AUTH_SESSION_TOKEN_COOKIE = `${NEON_AUTH_COOKIE_PREFIX}.session_token`;

/** Loosely-typed slice of the Neon Auth session user we map onto AuthenticatedUser. */
type SessionUser = { id: string; email?: string | null; name?: string | null };

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
  try {
    const { data: session } = await auth.getSession();
    return toAuthenticatedUser(session?.user);
  } catch (error) {
    // Neon Auth's getSession() refreshes its short-lived (5-min) session-data
    // cache cookie by writing a Set-Cookie. Next.js forbids cookie writes
    // during a Server Component render ("Cookies can only be modified in a
    // Server Action or Route Handler"), so once the cache expires that refresh
    // throws and 500s the page — including the home/landing route at `/`,
    // which renders for every visitor. Fall back to a read-only session read
    // (forwards the request cookies, ignores any Set-Cookie) so the render
    // succeeds. The client's useSession re-mints the cache cookie after
    // hydration via /api/auth, so only the SSR render right after expiry takes
    // this path. Re-throw anything that isn't the cookie-write error so real
    // failures (e.g. the auth server being down) still surface.
    if (!isCookieWriteError(error)) throw error;
    return readSessionWithoutCookieWrite();
  }
}

function toAuthenticatedUser(
  user: SessionUser | null | undefined,
): AuthenticatedUser | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    primaryEmail: user.email ?? null,
    displayName: user.name ?? null,
  };
}

/** Next.js throws this exact message when cookies are set during render. */
function isCookieWriteError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Cookies can only be modified")
  );
}

/**
 * Reads the session straight from the upstream Neon Auth server without
 * writing any cookies — the same request @neondatabase/auth makes internally
 * (forwarding the Neon Auth cookies, Origin, and proxy header), minus the
 * Set-Cookie write that is illegal during an RSC render. Returns null on any
 * failure so the caller degrades to "logged out" rather than 500ing.
 */
async function readSessionWithoutCookieWrite(): Promise<AuthenticatedUser | null> {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!baseUrl) return null;

  const cookieStore = await cookies();
  const neonCookies = cookieStore
    .getAll()
    .filter((c) => c.name.startsWith(NEON_AUTH_COOKIE_PREFIX));
  // No session token means there's no session to read — skip the round-trip.
  if (!neonCookies.some((c) => c.name === NEON_AUTH_SESSION_TOKEN_COOKIE)) {
    return null;
  }

  const headerStore = await headers();
  const origin =
    headerStore.get("origin") ||
    headerStore.get("referer")?.split("/").slice(0, 3).join("/") ||
    "";

  try {
    const url = new URL("get-session", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
    // Bypass the cache cookie and read the session directly from the token.
    url.searchParams.set("disableCookieCache", "true");
    const res = await fetch(url, {
      headers: {
        Cookie: neonCookies.map((c) => `${c.name}=${c.value}`).join("; "),
        Origin: origin,
        "x-neon-auth-proxy": "nextjs",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      user?: SessionUser | null;
    } | null;
    return toAuthenticatedUser(data?.user);
  } catch {
    return null;
  }
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
