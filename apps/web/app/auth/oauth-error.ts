// The sentence the sign-in form shows when a Google sign-in comes back with
// `?error=<code>`. Better Auth sends every OAuth callback failure there
// (`onAPIError.errorURL` in @camp404/auth's config) instead of its own bare
// error page.
//
// The raw code and Better Auth's `error_description` are never shown: they
// are in the URL, so anyone can put anything in them, and they mean nothing to
// a camper.

/** Better Auth refused to join Google to a local account that has not
 * confirmed its email (`requireLocalEmailVerified`). The callback sends the
 * code with underscores; the spaced form is the internal one. */
const ACCOUNT_NOT_LINKED =
  "That Google account's email already has a Camp 404 account that hasn't confirmed its email yet. Sign in with your password, confirm your email under Sign-in and security, then Google will work.";

const SENTENCES: Record<string, string> = {
  "account not linked": ACCOUNT_NOT_LINKED,
  account_not_linked: ACCOUNT_NOT_LINKED,
  "email_doesn't_match":
    "That Google account uses a different email from your Camp 404 account. Choose the Google account with the same email, or sign in with your password.",
  unable_to_link_account:
    "Google couldn't be connected to your Camp 404 account. Sign in with your password, then try Google again.",
};

const GENERIC = "Google sign-in didn't finish. Try again.";

/**
 * The sentence for an OAuth error code, or null when there is no code (a
 * plain visit to the sign-in page).
 */
export function oauthErrorSentence(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  // Own keys only: a code like "__proto__" must not reach Object.prototype.
  return Object.hasOwn(SENTENCES, code) ? SENTENCES[code]! : GENERIC;
}
