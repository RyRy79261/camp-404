// The auth email seam. Better Auth's hooks (sendResetPassword,
// sendVerificationEmail, onPasswordReset) call through here.
//
// Adapted from AfrikaBurn's @quagga/auth/email. It delivers through Resend with
// the same two variables the app's notification email uses (RESEND_API_KEY,
// RESEND_FROM_EMAIL), and otherwise LOGS, so a reset can be followed locally.
// It never throws: a Better Auth hook that throws fails the whole request, and
// every caller here is announcing something that has already happened.

import type { AuthEnv } from "./env";
import { isEmailProviderConfigured } from "./env";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Reset and verification links expire after Better Auth's default, 1 hour. */
const TOKEN_EXPIRY_HOURS = 1;

export type AuthEmailKind =
  | "reset"
  | "verify"
  | "password-reset-completed"
  | "password-set";

export interface AuthEmailInput {
  to: string;
  kind: AuthEmailKind;
  /** Required for "reset" and "verify"; ignored otherwise. */
  url?: string | undefined;
}

interface AuthEmailBody {
  subject: string;
  text: string;
}

const SIGN_OFF = "\n\n— Camp 404";

/** Build the subject and text of an auth email. Exported for its test. */
export function buildAuthEmail(input: AuthEmailInput): AuthEmailBody {
  switch (input.kind) {
    case "reset":
      return {
        subject: "Reset your Camp 404 password",
        text:
          "Someone (hopefully you) asked to reset the password for this Camp " +
          "404 account.\n\n" +
          `Reset it here. The link works once and expires in ${TOKEN_EXPIRY_HOURS} hour:\n` +
          `${input.url ?? ""}\n\n` +
          "If you didn't ask for this, ignore this email. Your password stays " +
          "the same." +
          SIGN_OFF,
      };
    case "verify":
      return {
        subject: "Confirm your Camp 404 email",
        text:
          "Confirm this email address for your Camp 404 account.\n\n" +
          `Confirm here. The link expires in ${TOKEN_EXPIRY_HOURS} hour:\n` +
          `${input.url ?? ""}\n\n` +
          "If this wasn't you, ignore this email." +
          SIGN_OFF,
      };
    case "password-reset-completed":
      return {
        subject: "Your Camp 404 password was changed",
        text:
          "The password for this Camp 404 account was just reset, and every " +
          "device that was signed in has been signed out.\n\n" +
          "If this was you, there is nothing to do.\n\n" +
          "If it wasn't, reset your password again straight away from the " +
          "sign-in page, and tell a captain." +
          SIGN_OFF,
      };
    case "password-set":
      return {
        subject: "A password was added to your Camp 404 account",
        text:
          "A password was just added to this Camp 404 account. You can now " +
          "sign in with your email and that password, as well as the way you " +
          "signed in before.\n\n" +
          "If this was you, there is nothing to do.\n\n" +
          'If it wasn\'t, use "Forgot your password?" on the sign-in page ' +
          "straight away to replace it, and tell a captain." +
          SIGN_OFF,
      };
  }
}

/**
 * Send one auth email to one recipient. Returns whether Resend accepted it
 * (false when the provider is unset, which logs instead). Never throws.
 *
 * One recipient by type: every auth email is addressed to exactly one person,
 * and an array here would be one careless call from putting a second address
 * in the `To:` header.
 */
export async function sendAuthEmail(
  env: AuthEnv,
  input: AuthEmailInput,
): Promise<boolean> {
  const { subject, text } = buildAuthEmail(input);
  if (!isEmailProviderConfigured(env)) {
    // Locally the link is the whole point of the log. On a deployment it is a
    // working key to someone's account sitting in the logs, so it is withheld.
    const logged =
      env.VERCEL_ENV && input.url
        ? text.replace(input.url, "[link withheld from deployment logs]")
        : text;
    console.info(
      `[auth:email:console] (email not configured) → ${input.to}\n` +
        `  subject: ${subject}\n  ${logged.replace(/\n/g, "\n  ")}`,
    );
    return false;
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [input.to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      console.error(
        `[auth:email] Resend responded ${res.status}: ${detail.slice(0, 200)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[auth:email] send failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
