"use client";

import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

/**
 * The Better Auth client. Same-origin fetches to this app's /api/auth/* — no
 * base URL needed. The plugin clients mirror the server plugins in
 * @camp404/auth:
 *   - twoFactorClient: authClient.twoFactor.enable / verifyTotp /
 *     verifyBackupCode / disable / generateBackupCodes. When a password
 *     sign-in needs the second factor, `signIn.email` answers
 *     `twoFactorRedirect` instead of a session and the sign-in form shows the
 *     code step in place (AfrikaBurn's pattern), so no redirect is wired here.
 *   - passkeyClient: authClient.passkey.addPasskey / deletePasskey,
 *     authClient.signIn.passkey.
 */
export const authClient = createAuthClient({
  plugins: [twoFactorClient(), passkeyClient()],
});
