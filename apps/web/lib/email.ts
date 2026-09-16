import "server-only";

import type { NotificationEmail } from "@camp404/core";

// Resend adapter for notification email (W4.3). A plain fetch to Resend's REST
// API, so no SDK dependency. One recipient per call: never several addresses in
// one message, which would show members each other's emails.
//
// Needs RESEND_API_KEY and RESEND_FROM_EMAIL (an address on a domain verified
// in Resend, e.g. "Camp 404 <notices@camp-404.com>"). Without them the cron
// route answers 503 and nothing is marked sent.

const RESEND_URL = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function sendEmail(
  to: string,
  email: NotificationEmail,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error(
      "Email is not configured — set RESEND_API_KEY and RESEND_FROM_EMAIL.",
    );
  }
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (res.ok) return { ok: true };
  // Resend's error body names the problem (a bad address, an unverified
  // domain); it never echoes the key.
  const detail = await res.text().catch(() => "");
  return { ok: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` };
}
