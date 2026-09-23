"use server";

import { headers } from "next/headers";
import { auth, sendAuthEmail } from "@camp404/auth";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@camp404/core";
import { runAction, type ActionResult } from "@/lib/action-result";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";

// A first password for a member who has only ever signed in with Google or a
// passkey. Changing a password asks for the current one, which such a member
// does not have; before this, their only way in was to sign out and use
// "Forgot your password?".
//
// Better Auth's `setPassword` is server-only by design, so it is called here
// with the member's own session headers: it adds a password to the account
// that session belongs to, and refuses if one exists. It checks the length
// again with the same numbers.

/** Better Auth nests its error code in `body`; two copies of the package are
 *  installed, so `instanceof APIError` cannot be trusted across them. */
function authErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("body" in err)) {
    return undefined;
  }
  const body = (err as { body?: { code?: unknown } }).body;
  return typeof body?.code === "string" ? body.code : undefined;
}

export async function setFirstPassword(
  newPassword: unknown,
): Promise<ActionResult> {
  return runAction("setFirstPassword", async () => {
    const authUser = await getAuthenticatedUserOrRedirect();

    if (typeof newPassword !== "string") {
      return { ok: false, error: "Type a password." };
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return {
        ok: false,
        error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
      };
    }
    if (newPassword.length > PASSWORD_MAX_LENGTH) {
      return {
        ok: false,
        error: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
      };
    }

    try {
      await auth.api.setPassword({
        body: { newPassword },
        headers: await headers(),
      });
    } catch (err) {
      switch (authErrorCode(err)) {
        case "PASSWORD_ALREADY_SET":
          return {
            ok: false,
            error:
              "Your account already has a password. Reload the page to change it.",
          };
        case "PASSWORD_TOO_SHORT":
          return {
            ok: false,
            error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
          };
        case "PASSWORD_TOO_LONG":
          return {
            ok: false,
            error: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
          };
        case "UNAUTHORIZED":
          return {
            ok: false,
            error:
              "Your session has ended. Sign in again, then add the password.",
          };
        default:
          throw err;
      }
    }

    // A password is a new way into the account. If a stolen session added it,
    // this email is how the member finds out. It never throws.
    if (authUser.primaryEmail) {
      await sendAuthEmail(process.env, {
        to: authUser.primaryEmail,
        kind: "password-set",
      });
    }
    return { ok: true };
  });
}
