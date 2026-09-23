import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";

vi.mock("server-only", () => ({}));

import {
  __resetCalendarCache,
  calendarConfig,
  getUpcomingEvents,
  signAssertion,
  toCalendarEvents,
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
  FIREBASE_PROJECT_ID: "camp-404",
  FIREBASE_CLIENT_EMAIL: "push@camp-404.iam.gserviceaccount.com",
  // Stored the way Vercel keeps it: literal \n.
  FIREBASE_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
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
      },
      {
        id: "b",
        title: "Meeting",
        start: "2026-09-24T17:00:00Z",
        allDay: false,
        location: null,
      },
      {
        id: "f",
        title: "Untitled event",
        start: "2026-10-05",
        allDay: true,
        location: null,
      },
    ]);
  });
});

describe("signAssertion", () => {
  it("signs a read-only calendar request Google can verify with the account's key", () => {
    const token = signAssertion(
      { clientEmail: ENV.FIREBASE_CLIENT_EMAIL, privateKey },
      1_790_000_000,
    );
    const [header, claims, signature] = token.split(".");
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${header}.${claims}`);
    expect(
      verifier.verify(publicKey, Buffer.from(signature!, "base64url")),
    ).toBe(true);
    expect(JSON.parse(Buffer.from(claims!, "base64url").toString())).toEqual({
      iss: ENV.FIREBASE_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/calendar.events.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_790_000_000,
      exp: 1_790_003_600,
    });
  });
});

describe("getUpcomingEvents", () => {
  beforeEach(() => {
    __resetCalendarCache();
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
      calendarConfig({ ...ENV, FIREBASE_PRIVATE_KEY: undefined }),
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
        },
      ],
    });
    await getUpcomingEvents(ENV, new Date(now.getTime() + 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await getUpcomingEvents(ENV, new Date(now.getTime() + 6 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(4);
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
