import { randomUUID } from "node:crypto";

// Programmatic disposable-inbox client for the real-DB preview E2E suite. It lets
// the Playwright spec self-provision a fresh email address and read whatever the
// auth provider sends (e.g. a Neon Auth verification link / OTP) with NO agent or
// MCP in the loop — built on Node's global fetch, so it adds no dependency.
//
// Backend: mail.tm (https://docs.mail.tm). The API is keyless. mail.tm enforces a
// strict per-IP rate limit (~8 QPS) and has no SLA, so every call goes through a
// bounded retry/backoff and the poll interval stays well under the cap. If mail.tm
// is flaky, point BASE at the API-compatible mail.gw mirror.

const BASE = "https://api.mail.tm";

export interface Inbox {
  address: string;
  password: string;
  token: string;
}

export interface MailMessage {
  id: string;
  from: { address: string; name?: string };
  subject: string;
  intro?: string;
  text?: string;
  /** mail.tm returns HTML as an ARRAY of parts — joining it is the common trap. */
  html?: string[];
}

interface HydraList<T> {
  "hydra:member": T[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoff(attempt: number): number {
  return 1000 * 2 ** attempt + Math.floor(Math.random() * 250);
}

// Retries only the transient classes (network error, 429, 5xx); a real 4xx (e.g.
// 422 "address already used") throws immediately rather than burning retries.
async function req<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  // mail.tm is API Platform: collection endpoints only return the `hydra:member`
  // wrapper under ld+json (plain application/json yields a bare array).
  headers.set("accept", "application/ld+json");
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { ...init, headers });
    } catch (err) {
      lastErr = err;
      await sleep(backoff(attempt));
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`mail.tm ${res.status} on ${path}`);
      await sleep(backoff(attempt));
      continue;
    }
    if (!res.ok) {
      throw new Error(`mail.tm ${res.status} on ${path}: ${await res.text()}`);
    }
    const body = await res.text();
    return (body ? JSON.parse(body) : undefined) as T;
  }
  throw new Error(`mail.tm ${path} failed after retries: ${String(lastErr)}`);
}

/** Create a fresh disposable inbox on an active mail.tm domain and authenticate. */
export async function createInbox(): Promise<Inbox> {
  const domains =
    await req<HydraList<{ domain: string; isActive: boolean }>>("/domains");
  const domain = domains["hydra:member"].find((d) => d.isActive)?.domain;
  if (!domain) throw new Error("mail.tm: no active domain available");
  const address = `e2e-${randomUUID().slice(0, 12)}@${domain}`;
  const password = randomUUID();
  await req("/accounts", {
    method: "POST",
    body: JSON.stringify({ address, password }),
  });
  const { token } = await req<{ token: string }>("/token", {
    method: "POST",
    body: JSON.stringify({ address, password }),
  });
  return { address, password, token };
}

/** Poll the inbox until a message matches `match`, or time out. */
export async function waitForEmail(
  inbox: Inbox,
  match: (message: MailMessage) => boolean,
  timeoutMs = 90_000,
): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const list = await req<HydraList<MailMessage>>(
      "/messages",
      {},
      inbox.token,
    );
    for (const summary of list["hydra:member"]) {
      const full = await req<MailMessage>(
        `/messages/${summary.id}`,
        {},
        inbox.token,
      );
      if (match(full)) return full;
    }
    await sleep(2500);
  }
  throw new Error("mail.tm: timed out waiting for a matching email");
}

/** The message body as one plain-text string (text + every HTML part). */
export function bodyOf(message: MailMessage): string {
  return [message.text ?? "", ...(message.html ?? [])].join("\n");
}

/** The first URL in the message body, optionally constrained to a host substring. */
export function extractLink(message: MailMessage, host?: string): string | null {
  const urls = bodyOf(message).match(/https?:\/\/[^\s"'<>)]+/g) ?? [];
  const hit = host ? urls.find((url) => url.includes(host)) : urls[0];
  return hit ?? null;
}

/** The first 6-digit code in the message body (OTP-style verification). */
export function extractCode(message: MailMessage): string | null {
  return bodyOf(message).match(/\b\d{6}\b/)?.[0] ?? null;
}
