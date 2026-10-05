import "server-only";

import type { NotificationEmail } from "@camp404/core";
import type { EmailSendResult } from "@camp404/db/email";
import { isEmailConfigured as isEmailConfiguredIn } from "./integration-config";

// Resend adapter for notification email (W4.3). A plain fetch to Resend's REST
// API, so no SDK dependency. One recipient per call: never several addresses in
// one message, which would show members each other's emails.
//
// Needs RESEND_API_KEY and RESEND_FROM_EMAIL (an address on a domain verified
// in Resend, e.g. "Camp 404 <notices@camp-404.com>"). Without them the drain
// is skipped (lib/background-work.ts) and nothing is marked sent.

const RESEND_URL = "https://api.resend.com/emails";

/**
 * How long one send may take. The drain sends one after another inside one
 * transaction, so a hung call must not hold it (and the page's time) open.
 */
export const EMAIL_SEND_TIMEOUT_MS = 10_000;

/**
 * Whether a refusal means "not now" rather than "never": a rate limit (429)
 * or the provider's own failure (5xx). Anything else (a bad address, an
 * unverified domain) will fail the same way every time.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function isEmailConfigured(): boolean {
  return isEmailConfiguredIn(process.env);
}

export async function sendEmail(
  to: string,
  email: NotificationEmail,
  options: { idempotencyKey: string },
): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error(
      "Email is not configured — set RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
  }
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // One delivery is one email, however many times a run is retried.
        "Idempotency-Key": options.idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });
  } catch (err) {
    // No answer (offline, or the timeout): the email may or may not have
    // gone, and the idempotency key makes the retry safe either way.
    // DOMException (the timeout's) is not an Error in every runtime.
    const name =
      typeof (err as { name?: unknown } | null)?.name === "string"
        ? (err as { name: string }).name
        : "error";
    return {
      ok: false,
      error: `Resend unreachable (${name})`,
      retryable: true,
    };
  }
  if (res.ok) return { ok: true };
  // Resend's error body names the problem (a bad address, an unverified
  // domain); it never echoes the key.
  const detail = await res.text().catch(() => "");
  return {
    ok: false,
    error: `Resend ${res.status}: ${detail.slice(0, 200)}`,
    ...(isRetryableStatus(res.status) ? { retryable: true } : {}),
  };
}
