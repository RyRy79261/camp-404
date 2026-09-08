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

/** A caller's absolute deadline elapsed. Never retried — waiting is the failure. */
class DeadlineError extends Error {}

/** Milliseconds left before `deadline`, or Infinity when the caller set none. */
function remainingUntil(deadline: number | undefined): number {
  return deadline === undefined ? Infinity : deadline - Date.now();
}

// Cap the sleep at the time left so the last backoff cannot overshoot the
// deadline; the next attempt then exits on it immediately.
async function backoffSleep(attempt: number, deadline?: number): Promise<void> {
  const wait = Math.min(backoff(attempt), remainingUntil(deadline));
  if (wait > 0) await sleep(wait);
}

// One fetch plus its body read, aborted once `remaining` elapses. Node's fetch has
// no timeout of its own, so the deadline has to arrive as a signal: a server that
// accepts the connection and never answers would otherwise hang here forever, and
// a deadline consulted only between attempts never gets to fire. The signal stays
// armed across the body read — a response whose stream never completes hangs
// exactly like a request that is never answered.
async function fetchOnce(
  path: string,
  init: RequestInit,
  remaining: number,
): Promise<{ res: Response; body: string }> {
  const controller = new AbortController();
  const expiry: ReturnType<typeof setTimeout> | undefined = Number.isFinite(
    remaining,
  )
    ? setTimeout(() => controller.abort(), remaining)
    : undefined;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
    });
    return { res, body: await res.text() };
  } catch (err) {
    // Our own abort, not the network's: the caller is out of time.
    if (controller.signal.aborted) {
      throw new DeadlineError(`mail.tm ${path}: deadline exceeded`);
    }
    throw err;
  } finally {
    clearTimeout(expiry);
  }
}

// Retries only the transient classes (network error, 429, 5xx); a real 4xx (e.g.
// 422 "address already used") throws immediately rather than burning retries.
// `deadline` is an absolute Date.now() timestamp and bounds the whole call — the
// in-flight request included, not just the gaps between attempts.
async function req<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
  deadline?: number,
): Promise<T> {
  const headers = new Headers(init.headers);
  // mail.tm is API Platform: collection endpoints only return the `hydra:member`
  // wrapper under ld+json (plain application/json yields a bare array).
  headers.set("accept", "application/ld+json");
  if (init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const remaining = remainingUntil(deadline);
    if (remaining <= 0) {
      throw new DeadlineError(`mail.tm ${path}: deadline exceeded`);
    }
    let received: { res: Response; body: string };
    try {
      received = await fetchOnce(path, { ...init, headers }, remaining);
    } catch (err) {
      if (err instanceof DeadlineError) throw err;
      lastErr = err;
      await backoffSleep(attempt, deadline);
      continue;
    }
    const { res, body } = received;
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`mail.tm ${res.status} on ${path}`);
      await backoffSleep(attempt, deadline);
      continue;
    }
    if (!res.ok) {
      throw new Error(`mail.tm ${res.status} on ${path}: ${body}`);
    }
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
  try {
    while (Date.now() < deadline) {
      const list = await req<HydraList<MailMessage>>(
        "/messages",
        {},
        inbox.token,
        deadline,
      );
      for (const summary of list["hydra:member"]) {
        const full = await req<MailMessage>(
          `/messages/${summary.id}`,
          {},
          inbox.token,
          deadline,
        );
        if (match(full)) return full;
      }
      const pause = Math.min(2500, deadline - Date.now());
      if (pause > 0) await sleep(pause);
    }
  } catch (err) {
    // The deadline is this loop's own: report it as the timeout it is, not as a
    // transport failure. Anything else is a real error and propagates.
    if (!(err instanceof DeadlineError)) throw err;
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
