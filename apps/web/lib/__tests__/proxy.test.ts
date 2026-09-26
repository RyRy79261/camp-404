// @vitest-environment node
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "../../proxy";
import { CAMP_PATH_HEADER } from "../camp-path";

// apps/web/proxy.ts (Next 16's middleware) hands the server gates the page a
// visitor asked for, so a signed-out visitor comes back to it after signing in.
// Its matcher is a NEGATIVE list, so a new console folder is covered without
// an edit; the first check here proves every (console) folder is. The rest pin
// what it must never touch, and that a header sent by the client never gets
// through.

const CONSOLE = path.resolve(__dirname, "../../app/(console)");

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });

/** The header the page will read, after the proxy has run on `url`. */
function forwardedPath(url: string, headers: Record<string, string> = {}) {
  const res = proxy(
    new NextRequest(new URL(url, "https://camp404.test"), { headers }),
  );
  // NextResponse.next({ request: { headers } }) passes the request headers on
  // as x-middleware-request-* response headers, with the list of overrides.
  const overridden = res.headers.get("x-middleware-override-headers") ?? "";
  expect(overridden.split(",")).toContain(CAMP_PATH_HEADER);
  return res.headers.get(`x-middleware-request-${CAMP_PATH_HEADER}`);
}

describe("the proxy matcher", () => {
  it("covers every top-level (console) folder", () => {
    const folders = readdirSync(CONSOLE, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
      .map((d) => d.name)
      .filter((name) => name !== "__tests__");
    expect(folders.length).toBeGreaterThan(10);
    for (const folder of folders) {
      expect(matches(`/${folder}`), folder).toBe(true);
      expect(matches(`/${folder}/deeper/page`), folder).toBe(true);
    }
    expect(matches("/")).toBe(true);
  });

  it("covers a console page whose dynamic segment holds a dot", () => {
    // An announcement id, a meeting, a team or a questionnaire key may carry
    // a dot. Skipping "anything with an extension" would let a spoofed header
    // through on exactly these pages.
    for (const p of [
      "/announcements/a.b",
      "/meetings/v1.2",
      "/teams/kitchen.z",
      "/tools/forms/intake.v2",
      "/questionnaires/x.json",
      "/announcements/favicon.ico",
    ]) {
      expect(matches(p), p).toBe(true);
    }
  });

  it("covers the gate pages outside the console that read the header", () => {
    for (const p of [
      "/pending-approval",
      "/signup/required",
      "/onboarding/questionnaire",
    ]) {
      expect(matches(p), p).toBe(true);
    }
  });

  it("never runs on the API, sign-in, Next's files or static assets", () => {
    for (const p of [
      "/api/auth/sign-in/email",
      "/api/health",
      "/api",
      "/auth",
      "/auth/sign-in",
      "/auth/sign-out",
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/.well-known/oauth-protected-resource",
      "/favicon.ico",
      "/icon.svg",
      "/manifest.webmanifest",
      "/firebase-messaging-sw.js",
      "/apple-icon",
      "/opengraph-image",
    ]) {
      expect(matches(p), p).toBe(false);
    }
  });
});

describe("proxy", () => {
  it("passes the page on as the path and query asked for", () => {
    expect(forwardedPath("/notifications?filter=unread")).toBe(
      "/notifications?filter=unread",
    );
    expect(forwardedPath("/announcements/a-1")).toBe("/announcements/a-1");
  });

  it("drops the router's _rsc cache-buster", () => {
    expect(forwardedPath("/tasks?_rsc=abc12")).toBe("/tasks");
    expect(forwardedPath("/calendar?team=kitchen&_rsc=abc12")).toBe(
      "/calendar?team=kitchen",
    );
  });

  it("overwrites a header the client sent", () => {
    expect(
      forwardedPath("/profile", { [CAMP_PATH_HEADER]: "//evil.example/x" }),
    ).toBe("/profile");
  });

  it("overwrites a spoofed header on a dotted console page too", () => {
    // The matcher runs first in production, so check it does run here, then
    // that the proxy forwards the URL's path, not the client's value.
    const url = "/announcements/a.b";
    expect(matches(url)).toBe(true);
    expect(forwardedPath(url, { [CAMP_PATH_HEADER]: "/captains/audit" })).toBe(
      url,
    );
  });

  it("never redirects or rewrites", () => {
    const res = proxy(new NextRequest("https://camp404.test/tasks"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
