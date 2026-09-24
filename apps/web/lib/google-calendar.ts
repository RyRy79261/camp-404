import "server-only";

import { createSign, randomUUID } from "node:crypto";
import {
  CAMP_TIME_ZONE,
  nextCampDay,
  parseTeamTag,
  redactSecrets,
  teamEventTitle,
} from "@camp404/core";
import { calendarCredentials, type EnvBag } from "./integration-config";

// The camp's shared Google Calendar, read for the member home page's "coming
// up" list (owner, 2026-09-23: "we have a shared Google Calendar. It would be
// nice to manage or integrate that from here"), and written by the add-event
// page, where captains and team leads put events on it.
//
// HOW IT SIGNS IN. A Google service account made for the calendar alone
// (GOOGLE_CALENDAR_CLIENT_EMAIL / GOOGLE_CALENDAR_PRIVATE_KEY), not Firebase's
// push account. A captain shares the camp calendar with that account's email
// ("Make changes to events", so the app can add them) and sets
// GOOGLE_CALENDAR_ID. The token exchange is the service-account JWT flow,
// signed with node:crypto, so no Google SDK is added for a GET and a POST.
// Reads ask for the read-only scope; only a write asks for the wider one.
//
// WHAT IT SHOWS. Title, start, end, place and the team the event belongs to —
// never the description, guests or attachments, and nothing marked private.
// Recurring events arrive already expanded (singleEvents=true), so there is no
// recurrence maths here.
//
// WHOSE EVENT. An event made in the app carries its team twice: in the Google
// title, in the camp's convention "Power and Lighting Team - General meeting"
// (teamEventTitle in @camp404/core), so people in Google Calendar see it, and
// as a private extended property (`camp404Team`, the team key), which the app
// reads first. An event made in Google counts as a team's when its title is in
// that convention, or starts with "[Tag]" (the first convention, #260). Only
// the "[Tag]" is read here; the pages hold the camp's teams and match the
// convention (readTeamEvent). Guests are never read.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
/** What a read asks for: the events, and nothing it could change. */
const READ_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
/** What a write asks for. Used only by createCalendarEvent / deleteCalendarEvent. */
export const WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.events";
/** The private extended property that names an event's team, by key. */
export const TEAM_PROPERTY = "camp404Team";
const API_URL = "https://www.googleapis.com/calendar/v3/calendars";
/** How far ahead "coming up" looks. */
export const CALENDAR_WINDOW_DAYS = 60;
/** How many events the home page shows at most. */
export const CALENDAR_MAX_EVENTS = 6;

/** How far ahead, and how many events, one read asks Google for. */
export interface CalendarRange {
  days: number;
  max: number;
}

/** Home's "Coming up": the next few weeks, a handful of events. */
export const HOME_RANGE: CalendarRange = {
  days: CALENDAR_WINDOW_DAYS,
  max: CALENDAR_MAX_EVENTS,
};

/**
 * The Calendar page and the team pages: the year ahead, up to Google's own
 * page size, so one request answers it.
 */
export const CALENDAR_PAGE_RANGE: CalendarRange = { days: 365, max: 250 };
/** How long one read is reused, per server instance. */
const CACHE_MS = 5 * 60 * 1000;
/**
 * How long each Google request may take. Home waits for this read, so a
 * stalled token or events call must end as "unavailable", not hold the page.
 */
export const CALENDAR_TIMEOUT_MS = 5000;

export interface CalendarEvent {
  id: string;
  /** As written on the calendar, team prefix and all. */
  title: string;
  /** All-day: the date as YYYY-MM-DD. Timed: an ISO instant. */
  start: string;
  allDay: boolean;
  location: string | null;
  /**
   * The team the event names, as written: a team key from the event's private
   * property, or the "[Tag]" on its title. Null for a camp-wide event. Home
   * matches it against the camp's teams.
   */
  teamTag: string | null;
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
  scope: string = READ_SCOPE,
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: config.clientEmail,
      scope,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(config.privateKey).toString("base64url")}`;
}

/**
 * Trade a signed assertion for an access token with `scope`. Throws with the
 * HTTP status only: the assertion and the token never reach a message.
 */
async function accessToken(
  config: CalendarConfig,
  scope: string,
  now: Date,
  timeoutMs: number,
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signAssertion(config, Math.floor(now.getTime() / 1000), scope),
    }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token) throw new Error("no access token");
  return access_token;
}

/** A calendar's events URL, with or without one event's id. */
function eventsUrl(calendarId: string, eventId?: string): URL {
  const base = `${API_URL}/${encodeURIComponent(calendarId)}/events`;
  return new URL(eventId ? `${base}/${encodeURIComponent(eventId)}` : base);
}

interface GoogleEvent {
  id?: string;
  summary?: string;
  status?: string;
  visibility?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string | undefined> };
}

/**
 * Turn Google's events into what the page may show. Drops cancelled and
 * private events and anything without a start; keeps only title, start, place
 * and team. The team's private property wins over a "[Tag]" on the title. The
 * title stays as written: only the pages know the camp's teams, so they take a
 * team's prefix off it (readTeamEvent), and leave "[Cancelled] ..." or
 * "[TBC] ..." alone.
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
    const { tag } = parseTeamTag(item.summary);
    const property = item.extendedProperties?.private?.[TEAM_PROPERTY]?.trim();
    out.push({
      id: item.id,
      title: item.summary?.trim() || "Untitled event",
      start,
      allDay,
      location: item.location?.trim() || null,
      teamTag: property || tag,
    });
  }
  return out;
}

/** One cached read per range ("60:6", "365:250"). */
const cached = new Map<string, { at: number; result: CalendarResult }>();

/**
 * The next events on the camp calendar, `range.days` ahead and at most
 * `range.max` of them. Never throws: an unset calendar is `not_configured`,
 * and any failure (sharing not done, API off, network) is `unavailable`, so
 * the page says so instead of breaking.
 */
export async function getUpcomingEvents(
  env: EnvBag = process.env,
  now: Date = new Date(),
  timeoutMs: number = CALENDAR_TIMEOUT_MS,
  range: CalendarRange = HOME_RANGE,
): Promise<CalendarResult> {
  const config = calendarConfig(env);
  if (!config) return { status: "not_configured" };
  const key = `${range.days}:${range.max}`;
  const hit = cached.get(key);
  if (hit && now.getTime() - hit.at < CACHE_MS) return hit.result;

  let result: CalendarResult;
  try {
    const token = await accessToken(config, READ_SCOPE, now, timeoutMs);
    const url = eventsUrl(config.calendarId);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("timeMin", now.toISOString());
    url.searchParams.set(
      "timeMax",
      new Date(now.getTime() + range.days * 86_400_000).toISOString(),
    );
    // Twice what is shown, up to Google's page size: cancelled and private
    // events come back too and are dropped below.
    url.searchParams.set("maxResults", String(Math.min(range.max * 2, 2500)));
    url.searchParams.set(
      "fields",
      "items(id,summary,status,visibility,location,start,extendedProperties/private)",
    );
    const eventsRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!eventsRes.ok) throw new Error(`events ${eventsRes.status}`);
    const body = (await eventsRes.json()) as { items?: GoogleEvent[] };
    result = {
      status: "ok",
      events: toCalendarEvents(body.items ?? []).slice(0, range.max),
    };
  } catch (error) {
    console.error("camp calendar read failed", logSafe(error, env));
    result = { status: "unavailable" };
  }
  cached.set(key, { at: now.getTime(), result });
  return result;
}

/**
 * Forget the cached reads, so the next Home or Calendar shows an event just
 * added. Other server instances keep theirs for up to CACHE_MS.
 */
export function forgetCalendarCache(): void {
  cached.clear();
}

/**
 * An error as one loggable line: our own errors carry an HTTP status only, and
 * anything else is scrubbed of every secret this process holds.
 */
function logSafe(error: unknown, env: EnvBag): string {
  const message = error instanceof Error ? error.message : String(error);
  const config = calendarConfig(env);
  let out = redactSecrets(message, env);
  // The key as the signer uses it: with real newlines, which the env's
  // escaped form does not match.
  if (config) out = out.split(config.privateKey).join("[redacted]");
  return out;
}

// --- Writing ----------------------------------------------------------------

/** What the add-event form hands over, already checked. */
export interface NewCalendarEvent {
  title: string;
  /** Written to Google only; the app never shows it. */
  description: string | null;
  team: { key: string; label: string } | null;
  /** The camp day, YYYY-MM-DD. */
  date: string;
  allDay: boolean;
  /** HH:MM in camp time, for a timed event. */
  start?: string;
  /** HH:MM in camp time, the same day, after `start`. */
  end?: string;
}

type GoogleTime = { date: string } | { dateTime: string; timeZone: string };

/** The events.insert body Google receives. */
export interface CalendarEventBody {
  /**
   * Our own id for the event, so a create that timed out can still be taken
   * off: Google may have saved it before the answer was lost.
   */
  id?: string;
  summary: string;
  description?: string;
  start: GoogleTime;
  end: GoogleTime;
  extendedProperties?: { private: { [TEAM_PROPERTY]: string } };
}

/**
 * The Google event for a new camp event. A team goes on twice: in the title,
 * in the camp's convention ("Power and Lighting Team - General meeting"), for
 * people reading Google Calendar, and as a private property, for the app.
 * An all-day event ends on the next day because Google's end date is
 * exclusive. A timed one is written at the camp's fixed +02:00 offset
 * (Johannesburg has no daylight saving).
 */
export function eventRequestBody(input: NewCalendarEvent): CalendarEventBody {
  const time = (hhmm: string) => ({
    dateTime: `${input.date}T${hhmm}:00+02:00`,
    timeZone: CAMP_TIME_ZONE,
  });
  const body: CalendarEventBody = {
    summary: teamEventTitle(input.team?.label ?? null, input.title),
    ...(input.description ? { description: input.description } : {}),
    start: input.allDay ? { date: input.date } : time(input.start ?? "00:00"),
    end: input.allDay
      ? { date: nextCampDay(input.date) }
      : time(input.end ?? input.start ?? "00:00"),
  };
  if (input.team) {
    body.extendedProperties = { private: { [TEAM_PROPERTY]: input.team.key } };
  }
  return body;
}

/**
 * A new Google event id: Google allows base32hex (0-9, a-v), 5 to 1024
 * characters, and a UUID's hex digits are inside that.
 */
export function newCalendarEventId(): string {
  return randomUUID().replaceAll("-", "");
}

/**
 * Put an event on the camp calendar and return its id. Throws when the
 * calendar is not set up or Google refuses; the log line carries the HTTP
 * status and never the key, the assertion or a token.
 */
export async function createCalendarEvent(
  env: EnvBag,
  body: CalendarEventBody,
  now: Date = new Date(),
  timeoutMs: number = CALENDAR_TIMEOUT_MS,
): Promise<string> {
  const config = calendarConfig(env);
  if (!config) throw new Error("calendar not configured");
  try {
    const token = await accessToken(config, WRITE_SCOPE, now, timeoutMs);
    const res = await fetch(eventsUrl(config.calendarId), {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`create ${res.status}`);
    const { id } = (await res.json()) as { id?: string };
    if (!id) throw new Error("create returned no id");
    return id;
  } catch (error) {
    const line = logSafe(error, env);
    console.error("camp calendar write failed", line);
    // No `cause`: the original error may quote the key or a token, and the
    // scrubbed line is all a caller may carry further.
    // eslint-disable-next-line preserve-caught-error
    throw new Error(line);
  }
}

/**
 * Take an event off the camp calendar. Used only to undo a create that failed
 * or whose audit row could not be saved. Never throws: false when it did not happen.
 */
export async function deleteCalendarEvent(
  env: EnvBag,
  eventId: string,
  now: Date = new Date(),
  timeoutMs: number = CALENDAR_TIMEOUT_MS,
): Promise<boolean> {
  const config = calendarConfig(env);
  if (!config) return false;
  try {
    const token = await accessToken(config, WRITE_SCOPE, now, timeoutMs);
    const res = await fetch(eventsUrl(config.calendarId, eventId), {
      method: "DELETE",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${token}` },
    });
    // 404 or 410: it is not there, which is what was wanted.
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`delete ${res.status}`);
    }
    return true;
  } catch (error) {
    console.error("camp calendar undo failed", logSafe(error, env));
    return false;
  }
}
