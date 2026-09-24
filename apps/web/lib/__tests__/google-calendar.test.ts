import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";

vi.mock("server-only", () => ({}));

import {
  calendarConfig,
  createCalendarEvent,
  deleteCalendarEvent,
  eventRequestBody,
  forgetCalendarCache,
  getUpcomingEvents,
  CALENDAR_PAGE_RANGE,
  signAssertion,
  toCalendarEvents,
  WRITE_SCOPE,
} from "../google-calendar";

// The camp calendar read: what may reach a member's page, the signed request
// Google trusts, and the two ways it says "nothing to show" without breaking
// the page.

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const ENV = {
  GOOGLE_CALENDAR_ID: "camp@group.calendar.google.com",
  GOOGLE_CALENDAR_CLIENT_EMAIL: "calendar@camp-404.iam.gserviceaccount.com",
  // Stored the way Vercel keeps it: literal \n.
  GOOGLE_CALENDAR_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
};

describe("toCalendarEvents", () => {
  it("keeps title, start and place, and drops cancelled, private and startless events", () => {
    expect(
      toCalendarEvents([
        {
          id: "a",
          summary: " Build day ",
          start: { date: "2026-10-03" },
          location: " Tankwa ",
        },
        {
          id: "b",
          summary: "Meeting",
          start: { dateTime: "2026-09-24T17:00:00Z" },
        },
        {
          id: "c",
          summary: "Gone",
          status: "cancelled",
          start: { date: "2026-10-01" },
        },
        {
          id: "d",
          summary: "Secret",
          visibility: "private",
          start: { date: "2026-10-01" },
        },
        { id: "e", summary: "No start" },
        { id: "f", start: { date: "2026-10-05" } },
      ]),
    ).toEqual([
      {
        id: "a",
        title: "Build day",
        start: "2026-10-03",
        allDay: true,
        location: "Tankwa",
        teamTag: null,
      },
      {
        id: "b",
        title: "Meeting",
        start: "2026-09-24T17:00:00Z",
        allDay: false,
        location: null,
        teamTag: null,
      },
      {
        id: "f",
        title: "Untitled event",
        start: "2026-10-05",
        allDay: true,
        location: null,
        teamTag: null,
      },
    ]);
  });
});

describe("signAssertion", () => {
  it("signs a read-only calendar request Google can verify with the account's key", () => {
    const token = signAssertion(
      { clientEmail: ENV.GOOGLE_CALENDAR_CLIENT_EMAIL, privateKey },
      1_790_000_000,
    );
    const [header, claims, signature] = token.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(
      verifier.verify(publicKey, Buffer.from(signature!, "base64url")),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toEqual({
      iss: ENV.GOOGLE_CALENDAR_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/calendar.events.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_790_000_000,
      exp: 1_790_003_600,
    });
  });
});

describe("getUpcomingEvents", () => {
  beforeEach(() => {
    forgetCalendarCache();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("needs both the calendar and the account", () => {
    expect(calendarConfig(ENV)).not.toBeNull();
    expect(calendarConfig({ ...ENV, GOOGLE_CALENDAR_ID: " " })).toBeNull();
    expect(
      calendarConfig({ ...ENV, GOOGLE_CALENDAR_PRIVATE_KEY: undefined }),
    ).toBeNull();
  });

  it("reads its own account, with the key's newlines restored, and never Firebase's", () => {
    expect(calendarConfig(ENV)).toEqual({
      calendarId: ENV.GOOGLE_CALENDAR_ID,
      clientEmail: ENV.GOOGLE_CALENDAR_CLIENT_EMAIL,
      privateKey,
    });
    expect(
      calendarConfig({
        GOOGLE_CALENDAR_ID: ENV.GOOGLE_CALENDAR_ID,
        FIREBASE_PROJECT_ID: "camp-404",
        FIREBASE_CLIENT_EMAIL: "push@camp-404.iam.gserviceaccount.com",
        FIREBASE_PRIVATE_KEY: ENV.GOOGLE_CALENDAR_PRIVATE_KEY,
      }),
    ).toBeNull();
  });

  it("is not_configured without a calendar, and never calls Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getUpcomingEvents({})).toEqual({ status: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the next events, expanded and in order, and reuses the read for five minutes", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
        return Response.json({ access_token: "tok" });
      }
      const u = new URL(String(url));
      expect(u.searchParams.get("singleEvents")).toBe("true");
      expect(u.searchParams.get("orderBy")).toBe("startTime");
      expect(u.pathname).toContain(encodeURIComponent(ENV.GOOGLE_CALENDAR_ID));
      return Response.json({
        items: [
          { id: "a", summary: "Build day", start: { date: "2026-10-03" } },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date("2026-09-23T08:00:00Z");

    const first = await getUpcomingEvents(ENV, now);
    expect(first).toEqual({
      status: "ok",
      events: [
        {
          id: "a",
          title: "Build day",
          start: "2026-10-03",
          allDay: true,
          location: null,
          teamTag: null,
        },
      ],
    });
    await getUpcomingEvents(ENV, new Date(now.getTime() + 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await getUpcomingEvents(ENV, new Date(now.getTime() + 6 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("reads the year ahead for the Calendar page, cached apart from Home's read", async () => {
    const asked: { days: number; max: string | null }[] = [];
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
        return Response.json({ access_token: "tok" });
      }
      const u = new URL(String(url));
      asked.push({
        days: Math.round(
          (Date.parse(u.searchParams.get("timeMax")!) -
            Date.parse(u.searchParams.get("timeMin")!)) /
            86_400_000,
        ),
        max: u.searchParams.get("maxResults"),
      });
      return Response.json({
        items: Array.from({ length: 9 }, (_, n) => ({
          id: `e${n}`,
          summary: `Event ${n}`,
          start: { date: "2026-10-03" },
        })),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date("2026-09-23T08:00:00Z");

    const home = await getUpcomingEvents(ENV, now);
    const page = await getUpcomingEvents(
      ENV,
      now,
      undefined,
      CALENDAR_PAGE_RANGE,
    );
    expect(asked).toEqual([
      { days: 60, max: "12" },
      { days: 365, max: "500" },
    ]);
    // Home keeps its handful; the page gets every event Google sent.
    expect(home.status === "ok" && home.events).toHaveLength(6);
    expect(page.status === "ok" && page.events).toHaveLength(9);
    // Each is reused on its own: neither read asks Google again.
    await getUpcomingEvents(ENV, now);
    await getUpcomingEvents(ENV, now, undefined, CALENDAR_PAGE_RANGE);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("gives up on a stalled request and reports unavailable, so Home is not held", async () => {
    // A fetch that never answers on its own; it ends only when aborted.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string | URL, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    );
    const started = Date.now();
    expect(await getUpcomingEvents(ENV, new Date(), 50)).toEqual({
      status: "unavailable",
    });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("is unavailable, not an error page, when Google refuses (calendar not shared)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).includes("oauth2")
          ? Response.json({ access_token: "tok" })
          : new Response("forbidden", { status: 404 }),
      ),
    );
    expect(await getUpcomingEvents(ENV)).toEqual({ status: "unavailable" });
  });
});

/** The claims of a signed assertion, once its signature checks out. */
function verifiedClaims(assertion: string): Record<string, unknown> {
  const [header, claims, signature] = assertion.split(".");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${claims}`);
  expect(verifier.verify(publicKey, Buffer.from(signature!, "base64url"))).toBe(
    true,
  );
  return JSON.parse(Buffer.from(claims!, "base64url").toString()) as Record<
    string,
    unknown
  >;
}

/** The assertion a token request carried. */
function assertionOf(init: RequestInit | undefined): string {
  return new URLSearchParams(String(init?.body)).get("assertion")!;
}

describe("whose event", () => {
  it("reads the team from the private property first, and the title's tag after", () => {
    const [fromProperty, fromTitle, untagged] = toCalendarEvents([
      {
        id: "a",
        summary: "[Cuisine] Briefing",
        start: { date: "2026-10-01" },
        extendedProperties: { private: { camp404Team: "kitchen" } },
      },
      { id: "b", summary: "[Finance] Budget", start: { date: "2026-10-01" } },
      { id: "c", summary: "Build day", start: { date: "2026-10-01" } },
    ]);
    // The title stays as written; the pages decide whether the tag comes off
    // (readTeamEvent in @camp404/core, which holds the "[Tag]" reader too).
    expect(fromProperty).toMatchObject({
      title: "[Cuisine] Briefing",
      teamTag: "kitchen",
    });
    expect(fromTitle).toMatchObject({
      title: "[Finance] Budget",
      teamTag: "Finance",
    });
    expect(untagged).toMatchObject({ title: "Build day", teamTag: null });
  });

  it("asks Google for the team property, and never for the description or guests", async () => {
    forgetCalendarCache();
    let fields = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).includes("oauth2")) {
          return Response.json({ access_token: "tok" });
        }
        fields = new URL(String(url)).searchParams.get("fields") ?? "";
        return Response.json({ items: [] });
      }),
    );
    await getUpcomingEvents(ENV, new Date("2026-09-23T08:00:00Z"));
    vi.unstubAllGlobals();
    expect(fields).toBe(
      "items(id,summary,status,visibility,location,start,extendedProperties/private)",
    );
    expect(fields).not.toMatch(/description|attendees/);
  });
});

describe("eventRequestBody", () => {
  it("writes an all-day team event titled in the camp's convention, with the property, ending the next day", () => {
    expect(
      eventRequestBody({
        title: "Stock take",
        description: "Bring the list.",
        team: { key: "kitchen", label: "Kitchen" },
        date: "2026-09-30",
        allDay: true,
      }),
    ).toEqual({
      // Owner, 2026-09-24: "Power Team - General meeting", not "[Kitchen] …".
      summary: "Kitchen Team - Stock take",
      description: "Bring the list.",
      // Google's end date is exclusive: across the month end.
      start: { date: "2026-09-30" },
      end: { date: "2026-10-01" },
      extendedProperties: { private: { camp404Team: "kitchen" } },
    });
    expect(
      eventRequestBody({
        title: "New year",
        description: null,
        team: null,
        date: "2026-12-31",
        allDay: true,
      }),
    ).toEqual({
      summary: "New year",
      start: { date: "2026-12-31" },
      end: { date: "2027-01-01" },
    });
  });

  it("names a team once, whatever its label", () => {
    const title = (label: string) =>
      eventRequestBody({
        title: "General meeting",
        description: null,
        team: { key: "power_and_lighting", label },
        date: "2026-10-01",
        allDay: true,
      }).summary;
    expect(title("Power and Lighting")).toBe(
      "Power and Lighting Team - General meeting",
    );
    // A label that already says "Team" is not doubled.
    expect(title("Power Team")).toBe("Power Team - General meeting");
  });

  it("writes a timed event at camp time, +02:00", () => {
    expect(
      eventRequestBody({
        title: "Camp meeting",
        description: null,
        team: null,
        date: "2026-10-01",
        allDay: false,
        start: "18:00",
        end: "19:30",
      }),
    ).toEqual({
      summary: "Camp meeting",
      start: {
        dateTime: "2026-10-01T18:00:00+02:00",
        timeZone: "Africa/Johannesburg",
      },
      end: {
        dateTime: "2026-10-01T19:30:00+02:00",
        timeZone: "Africa/Johannesburg",
      },
    });
  });
});

describe("writing to the calendar", () => {
  const body = eventRequestBody({
    title: "Camp meeting",
    description: null,
    team: null,
    date: "2026-10-01",
    allDay: true,
  });

  beforeEach(() => {
    forgetCalendarCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("asks for the write scope only to write; a read keeps the read-only scope", async () => {
    const scopes: unknown[] = [];
    let posted: { url: string; init?: RequestInit } | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
          scopes.push(verifiedClaims(assertionOf(init)).scope);
          return Response.json({ access_token: "tok" });
        }
        if (init?.method === "POST") {
          posted = { url: String(url), init };
          return Response.json({ id: "google-event-1" });
        }
        return Response.json({ items: [] });
      }),
    );

    expect(await createCalendarEvent(ENV, body)).toBe("google-event-1");
    await getUpcomingEvents(ENV);
    expect(scopes).toEqual([
      WRITE_SCOPE,
      "https://www.googleapis.com/auth/calendar.events.readonly",
    ]);
    expect(WRITE_SCOPE).toBe("https://www.googleapis.com/auth/calendar.events");
    expect(posted!.url).toBe(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ENV.GOOGLE_CALENDAR_ID)}/events`,
    );
    expect(JSON.parse(String(posted!.init?.body))).toEqual(body);
    expect(new Headers(posted!.init?.headers).get("authorization")).toBe(
      "Bearer tok",
    );
    // The default signer still signs a read.
    expect(
      verifiedClaims(
        signAssertion(
          { clientEmail: ENV.GOOGLE_CALENDAR_CLIENT_EMAIL, privateKey },
          1,
        ),
      ).scope,
    ).toBe("https://www.googleapis.com/auth/calendar.events.readonly");
  });

  it("throws when Google refuses, and logs the status but never the key, assertion or token", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    });
    const assertions: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).includes("oauth2")) {
          assertions.push(assertionOf(init));
          return Response.json({ access_token: "secret-token-value" });
        }
        return new Response("forbidden", { status: 403 });
      }),
    );
    await expect(createCalendarEvent(ENV, body)).rejects.toThrow("create 403");
    expect(logged.join("\n")).toContain("403");

    // A failure whose message quotes the key (in either form) is scrubbed.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error(
          `boom ${privateKey} ${ENV.GOOGLE_CALENDAR_PRIVATE_KEY} ${ENV.GOOGLE_CALENDAR_CLIENT_EMAIL}`,
        );
      }),
    );
    await expect(createCalendarEvent(ENV, body)).rejects.toThrow("boom");

    const all = logged.join("\n");
    expect(all).not.toContain("PRIVATE KEY");
    expect(all).not.toContain(privateKey.split("\n")[1]!);
    expect(all).not.toContain(ENV.GOOGLE_CALENDAR_CLIENT_EMAIL);
    expect(all).not.toContain("secret-token-value");
    expect(assertions).toHaveLength(1);
    expect(all).not.toContain(assertions[0]!);
  });

  it("refuses to write to a calendar that is not set up, without calling Google", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(createCalendarEvent({}, body)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes an event to undo a create, and reports failure without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const calls: { url: string; method?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).includes("oauth2")) {
          return Response.json({ access_token: "tok" });
        }
        calls.push({ url: String(url), method: init?.method });
        return new Response(null, { status: 204 });
      }),
    );
    expect(await deleteCalendarEvent(ENV, "google-event-1")).toBe(true);
    expect(calls).toEqual([
      {
        url: `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ENV.GOOGLE_CALENDAR_ID)}/events/google-event-1`,
        method: "DELETE",
      },
    ]);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    expect(await deleteCalendarEvent(ENV, "google-event-1")).toBe(false);
  });

  it("counts an event that is not there as taken off", async () => {
    // The undo after a failed create: Google never saved it, so 404.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) =>
        String(url).includes("oauth2")
          ? Response.json({ access_token: "tok" })
          : new Response("not found", { status: 404 }),
      ),
    );
    expect(await deleteCalendarEvent(ENV, "google-event-1")).toBe(true);
  });
});
