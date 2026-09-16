import { describe, expect, it } from "vitest";
import { GET } from "./route";

// The service worker is generated as a string, so a typo in it only shows up
// in a browser. This parses it, and pins the tap handler.

describe("GET /firebase-messaging-sw.js", () => {
  it("serves JavaScript that parses", async () => {
    const body = await GET().text();
    // Parse only: the Function body is never called, so importScripts and
    // firebase are not needed.
    expect(() => new Function(body)).not.toThrow();
  });

  it("opens a notification's in-app link on tap, and the inbox otherwise", async () => {
    const body = await GET().text();
    expect(body).toContain('addEventListener("notificationclick"');
    expect(body).toContain('"/notifications"');
    expect(body).toContain("openWindow(link)");
  });
});
