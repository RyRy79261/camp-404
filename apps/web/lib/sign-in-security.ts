import "server-only";

import { headers } from "next/headers";
import { auth } from "@camp404/auth";
import { usesTestStore } from "./test-mode";

/**
 * Whether the signed-in member has a second way to prove it is them: two-factor
 * or at least one passkey. Null when it cannot be read (the E2E store has no
 * Better Auth session, or the read failed), so the home page leaves the item
 * out rather than claiming it either way.
 */
export async function isSignInSecured(): Promise<boolean | null> {
  if (usesTestStore()) return null;
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    if (!session) return null;
    if (session.user.twoFactorEnabled) return true;
    const passkeys = await auth.api.listPasskeys({ headers: h });
    return passkeys.length > 0;
  } catch {
    return null;
  }
}
