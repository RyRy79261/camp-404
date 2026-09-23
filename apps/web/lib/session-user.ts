import type { AuthenticatedUser } from "./auth";
import { isGodEmail } from "./access-control";

/** Loosely-typed slice of the Better Auth session user we map onto AuthenticatedUser. */
export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  emailVerified?: boolean | null;
};

/**
 * Map a Better Auth session user onto the app's AuthenticatedUser.
 *
 * A GOD_EMAILS address gets past the invite and approval gates, so it only
 * counts once the auth server has proven the person owns it (owner's call,
 * 2026-09-16: keep GOD_EMAILS as a recovery path, but only for a verified
 * email). Every god check in the app reads `primaryEmail`, so this is the one
 * place to enforce it: an unverified session that claims a god address keeps
 * its account, but not that email. Any other email passes through unchanged,
 * verified or not.
 */
export function toAuthenticatedUser(
  user: SessionUser | null | undefined,
): AuthenticatedUser | null {
  if (!user?.id) return null;
  const email = user.email ?? null;
  const unprovenGod = isGodEmail(email) && user.emailVerified !== true;
  return {
    id: user.id,
    primaryEmail: unprovenGod ? null : email,
    displayName: user.name ?? null,
    emailVerified: user.emailVerified === true,
  };
}
