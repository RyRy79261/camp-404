// The auth email seam. Better Auth's hooks (sendResetPassword,
// sendVerificationEmail, onPasswordReset) call through here.
//
// Adapted from AfrikaBurn's @quagga/auth/email. It delivers through Resend with
// the same two variables the app's notification email uses (RESEND_API_KEY,
// RESEND_FROM_EMAIL), and otherwise LOGS, so a reset can be followed locally.
// It never throws: a Better Auth hook that throws fails the whole request, and
// every caller here is announcing something that has already happened.

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { renderEmailLayout } from "@camp404/core";
import type { AuthEnv } from "./env";
import { isEmailProviderConfigured, resolveAuthEmailCaptureFile } from "./env";

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
  html: string;
}

const SIGN_OFF = "— Camp 404";

const FOOTER =
  "You get this email because this address has a Camp 404 account.";

/** What one auth email says, before it is laid out as text and as HTML. */
interface AuthEmailWords {
  subject: string;
  title: string;
  /** Before the link. */
  intro: readonly string[];
  /**
   * The link: its button words, how long it lasts, and the sentence the text
   * part puts before the bare link.
   */
  link?: { button: string; note: string; lead: string; url: string };
  /** After the link. */
  outro: readonly string[];
}

function authEmailWords(input: AuthEmailInput): AuthEmailWords {
  switch (input.kind) {
    case "reset":
      return {
        subject: "Reset your Camp 404 password",
        title: "Reset your password",
        intro: [
          "Someone (hopefully you) asked to reset the password for this Camp " +
            "404 account.",
        ],
        link: {
          button: "Reset password",
          note: `The link works once and expires in ${TOKEN_EXPIRY_HOURS} hour.`,
          lead: `Reset it here. The link works once and expires in ${TOKEN_EXPIRY_HOURS} hour:`,
          url: input.url ?? "",
        },
        outro: [
          "If you didn't ask for this, ignore this email. Your password stays " +
            "the same.",
        ],
      };
    case "verify":
      return {
        subject: "Confirm your Camp 404 email",
        title: "Confirm your email",
        intro: ["Confirm this email address for your Camp 404 account."],
        link: {
          button: "Confirm email",
          note: `The link expires in ${TOKEN_EXPIRY_HOURS} hour.`,
          lead: `Confirm here. The link expires in ${TOKEN_EXPIRY_HOURS} hour:`,
          url: input.url ?? "",
        },
        outro: ["If this wasn't you, ignore this email."],
      };
    case "password-reset-completed":
      return {
        subject: "Your Camp 404 password was changed",
        title: "Your password was changed",
        intro: [
          "The password for this Camp 404 account was just reset, and every " +
            "device that was signed in has been signed out.",
          "If this was you, there is nothing to do.",
          "If it wasn't, reset your password again straight away from the " +
            "sign-in page, and tell a captain.",
        ],
        outro: [],
      };
    case "password-set":
      return {
        subject: "A password was added to your Camp 404 account",
        title: "A password was added",
        intro: [
          "A password was just added to this Camp 404 account. You can now " +
            "sign in with your email and that password, as well as the way you " +
            "signed in before.",
          "If this was you, there is nothing to do.",
          'If it wasn\'t, use "Forgot your password?" on the sign-in page ' +
            "straight away to replace it, and tell a captain.",
        ],
        outro: [],
      };
  }
}

/** Build the subject, text and HTML of an auth email. Exported for its test. */
export function buildAuthEmail(input: AuthEmailInput): AuthEmailBody {
  const words = authEmailWords(input);
  const linkText = words.link ? [`${words.link.lead}\n${words.link.url}`] : [];
  const text = [...words.intro, ...linkText, ...words.outro, SIGN_OFF].join(
    "\n\n",
  );
  const html = renderEmailLayout({
    label: "Your account",
    title: words.title,
    paragraphs: words.intro,
    button: words.link
      ? { text: words.link.button, url: words.link.url }
      : undefined,
    afterButton: [...(words.link ? [words.link.note] : []), ...words.outro],
    footer: FOOTER,
  });
  return { subject: words.subject, text, html };
}

/**
 * E2E only: append the email as one JSON line to the capture file, so a
 * Playwright run can read the link without a real inbox. Returns whether the
 * line was written. Never throws.
 */
async function captureAuthEmail(
  file: string,
  input: AuthEmailInput,
  body: AuthEmailBody,
): Promise<boolean> {
  try {
    await mkdir(dirname(file), { recursive: true });
    const line = JSON.stringify({
      at: new Date().toISOString(),
      to: input.to,
      kind: input.kind,
      subject: body.subject,
      text: body.text,
      url: input.url ?? null,
    });
    await appendFile(file, `${line}\n`, "utf8");
    return true;
  } catch (err) {
    console.error(
      `[auth:email:capture] write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}

/**
 * Send one auth email to one recipient. Returns whether Resend accepted it
 * (false when the provider is unset, which logs instead). Never throws.
 *
 * Under the e2e harness, and only there (resolveAuthEmailCaptureFile refuses
 * on any deployment), the email is written to the capture file instead and
 * nothing is sent.
 *
 * One recipient by type: every auth email is addressed to exactly one person,
 * and an array here would be one careless call from putting a second address
 * in the `To:` header.
 */
export async function sendAuthEmail(
  env: AuthEnv,
  input: AuthEmailInput,
): Promise<boolean> {
  const body = buildAuthEmail(input);
  const { subject, text, html } = body;
  const captureFile = resolveAuthEmailCaptureFile(env);
  if (captureFile) return captureAuthEmail(captureFile, input, body);
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
        html,
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
