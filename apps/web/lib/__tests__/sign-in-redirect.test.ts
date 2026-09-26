import { describe, expect, it } from "vitest";
import { signInPath } from "../sign-in-redirect";

// Where a signed-out visitor is sent. `next` is a redirect target taken from a
// request, so it must stay on this app and name a console window; anything
// else is dropped, never "fixed".

describe("signInPath", () => {
  it("names the console page asked for, with its query", () => {
    expect(signInPath("/notifications")).toBe(
      "/auth/sign-in?next=%2Fnotifications",
    );
    expect(signInPath("/announcements/a-1")).toBe(
      "/auth/sign-in?next=%2Fannouncements%2Fa-1",
    );
    expect(signInPath("/questionnaires/q-1")).toBe(
      "/auth/sign-in?next=%2Fquestionnaires%2Fq-1",
    );
    expect(signInPath("/calendar?team=kitchen")).toBe(
      "/auth/sign-in?next=%2Fcalendar%3Fteam%3Dkitchen",
    );
  });

  it("leaves next off when nothing, or only the desktop, was asked for", () => {
    expect(signInPath(null)).toBe("/auth/sign-in");
    expect(signInPath(undefined)).toBe("/auth/sign-in");
    expect(signInPath("")).toBe("/auth/sign-in");
    expect(signInPath("/")).toBe("/auth/sign-in");
    expect(signInPath("/?x=1")).toBe("/auth/sign-in");
  });

  it("refuses a target off this app", () => {
    for (const target of [
      "https://evil.example/notifications",
      "//evil.example/notifications",
      "//notifications",
      "/\\evil.example/notifications",
      "\\\\evil.example",
      "/\t/evil.example",
      "javascript:alert(1)",
      "notifications",
    ]) {
      expect(signInPath(target), target).toBe("/auth/sign-in");
    }
  });

  // `matchProgram` alone would accept both of these, reading the raw text; the
  // browser does not. So the path is read the way a browser reads it
  // (`safeInternalPath`) before it is matched.
  it("reads the path the way a browser does before matching it", () => {
    // A backslash is a slash to a browser: this is three segments, no page.
    expect(signInPath("/announcements/a\\b")).toBe("/auth/sign-in");
    // A browser drops a tab inside a URL, so this is /notifications.
    expect(signInPath("/notific\tations")).toBe(
      "/auth/sign-in?next=%2Fnotifications",
    );
  });

  it("never points at a route handler or a sign-in page", () => {
    for (const target of [
      "/captains/camp-management/export",
      "/captains/questionnaires/k/responses/export",
      "/auth/sign-out",
      "/auth/sign-in?next=%2Fprofile",
      "/api/health",
      "/pending-approval",
      "/no-such-page",
    ]) {
      expect(signInPath(target), target).toBe("/auth/sign-in");
    }
  });

  it("drops a hash", () => {
    expect(signInPath("/captains/join-site#burn")).toBe(
      "/auth/sign-in?next=%2Fcaptains%2Fjoin-site",
    );
  });
});
