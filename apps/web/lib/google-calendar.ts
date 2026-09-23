import "server-only";

import { createSign } from "node:crypto";
import { calendarCredentials, type EnvBag } from "./integration-config";

// The camp's shared Google Calendar, read for the member home page's "coming
// up" list (owner, 2026-09-23: "we have a shared Google Calendar. It would be
// nice to manage or integrate that from here"). Read-only for now.
//
// HOW IT SIGNS IN. A Google service account made for the calendar alone
// (GOOGLE_CALENDAR_CLIENT_EMAIL / GOOGLE_CALENDAR_PRIVATE_KEY), not Firebase's
// push account. A captain shares the camp calendar with that account's email
// ("See all event details") and sets GOOGLE_CALENDAR_ID. The token exchange is the
// service-account JWT flow, signed with node:crypto, so no Google SDK is
// added for one GET.
//
// WHAT IT SHOWS. Title, start, end and place — never the description, guests
// or attachments, and nothing marked private. Recurring events arrive already
// expanded (singleEvents=true), so there is no recurrence maths here.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
/** How far ahead "coming up" looks. */
export const CALENDAR_WINDOW_DAYS = 60;
/** How many events the home page shows at most. */
export const CALENDAR_MAX_EVENTS = 6;
/** How long one read is reused, per server instance. */
const CACHE_MS = 5 * 60 * 1000;
/**
 * How long each Google request may take. Home waits for this read, so a
 * stalled token or events call must end as "unavailable", not hold the page.
 */
export const CALENDAR_TIMEOUT_MS = 5000;

export interface CalendarEvent {
  id: string;
  title: string;
  /** All-day: the date as YYYY-MM-DD. Timed: an ISO instant. */
  start: string;
  allDay: boolean;
  location: string | null;
}

export type CalendarResult =
  | { status: "ok"; events: CalendarEvent[] }
  | { status: "not_configured" }
  | { status: "unavailable" };

export interface CalendarConfig {
  calendarId: string;
  clientEmail: string;
  privateKey: string;
}

/** The calendar and the account that reads it, or null when either is unset. */
export function calendarConfig(env: EnvBag): CalendarConfig | null {
  const calendarId = env.GOOGLE_CALENDAR_ID?.trim();
  const credentials = calendarCredentials(env);
  if (!calendarId || !credentials) return null;
  return {
    calendarId,
    clientEmail: credentials.clientEmail,
    privateKey: credentials.privateKey,
  };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

/** The signed service-account assertion Google trades for an access token. */
export function signAssertion(
  config: Pick<CalendarConfig, "clientEmail" | "privateKey">,
  nowSeconds: number,
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: config.clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(config.privateKey).toString("base64url")}`;
}

interface GoogleEvent {
  id?: string;
  summary?: string;
  status?: string;
  visibility?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
}

/**
 * Turn Google's events into what the page may show. Drops cancelled and
 * private events and anything without a start; keeps only title, start and
 * place.
 */
export function toCalendarEvents(
  items: readonly GoogleEvent[],
): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const item of items) {
    if (!item.id || item.status === "cancelled") continue;
    if (item.visibility === "private" || item.visibility === "confidential") {
      continue;
    }
    const allDay = Boolean(item.start?.date);
    const start = item.start?.date ?? item.start?.dateTime;
    if (!start) continue;
    out.push({
      id: item.id,
      title: item.summary?.trim() || "Untitled event",
      start,
      allDay,
      location: item.location?.trim() || null,
    });
  }
  return out;
}

let cached: { at: number; result: CalendarResult } | null = null;

/**
 * The next events on the camp calendar. Never throws: an unset calendar is
 * `not_configured`, and any failure (sharing not done, API off, network) is
 * `unavailable`, so the home page says so instead of breaking.
 */
export async function getUpcomingEvents(
  env: EnvBag = process.env,
  now: Date = new Date(),
  timeoutMs: number = CALENDAR_TIMEOUT_MS,
): Promise<CalendarResult> {
  const config = calendarConfig(env);
  if (!config) return { status: "not_configured" };
  if (cached && now.getTime() - cached.at < CACHE_MS) return cached.result;

  let result: CalendarResult;
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: signAssertion(config, Math.floor(now.getTime() / 1000)),
      }),
    });
    if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}`);
    const { access_token } = (await tokenRes.json()) as {
      access_token?: string;
    };
    if (!access_token) throw new Error("no access token");

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`,
    );
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", now.toISOString());
    url.searchParams.set(
      "timeMax",
      new Date(now.getTime() + CALENDAR_WINDOW_DAYS * 86_400_000).toISOString(),
    );
    url.searchParams.set("maxResults", String(CALENDAR_MAX_EVENTS * 2));
    url.searchParams.set(
      "fields",
      "items(id,summary,status,visibility,location,start)",
    );
    const eventsRes = await fetch(url, {
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!eventsRes.ok) throw new Error(`events ${eventsRes.status}`);
    const body = (await eventsRes.json()) as { items?: GoogleEvent[] };
    result = {
      status: "ok",
      events: toCalendarEvents(body.items ?? []).slice(0, CALENDAR_MAX_EVENTS),
    };
  } catch (error) {
    console.error(
      "camp calendar read failed",
      error instanceof Error ? error.message : error,
    );
    result = { status: "unavailable" };
  }
  cached = { at: now.getTime(), result };
  return result;
}

/** @internal test-only: forget the cached read. */
export function __resetCalendarCache(): void {
  cached = null;
}
