import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONSOLE_ROUTE_HANDLERS,
  PROGRAM_ROUTES,
  matchProgram,
} from "../program-routes";

// matchProgram maps a console URL to the program window it opens. Two drift
// checks keep it honest against the real route tree: every console page has a
// row (a new page with none fails here, not in a member's browser), and every
// row has a page. It is shipped to browsers, so a third check reads its
// imports: it must never pull in a rank or a predicate.

const APP = path.resolve(__dirname, "../../app");
const CONSOLE = path.join(APP, "(console)");

/** `/meetings/[id]/edit` for every file named `name` under app/(console). */
function consoleRoutes(name: "page.tsx" | "route.ts"): string[] {
  return (readdirSync(CONSOLE, { recursive: true }) as string[])
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => file === name || file.endsWith(`/${name}`))
    .map((file) => `/${file.slice(0, -name.length)}`.replace(/\/$/, "") || "/")
    .sort();
}

/** A URL for a route pattern: each `[param]` filled with a sample value. */
const sample = (pattern: string) =>
  pattern.replace(/\[([^\]]+)\]/g, (_m, name: string) => `sample-${name}`);

describe("matchProgram", () => {
  it("opens one window for a program's sub-pages", () => {
    for (const p of ["/profile", "/profile/edit", "/profile/security"]) {
      expect(matchProgram(p)).toEqual({
        programId: "account",
        instanceKey: "account",
        genericTitle: "MY_ACCOUNT.CPL",
      });
    }
    expect(matchProgram("/power/fuel")?.instanceKey).toBe(
      matchProgram("/power/loads")?.instanceKey,
    );
  });

  it("gives each document its own window", () => {
    expect(matchProgram("/meetings/m-1")).toEqual({
      programId: "meeting",
      instanceKey: "meeting:m-1",
      genericTitle: "MEETING.TXT",
    });
    expect(matchProgram("/meetings/m-2")?.instanceKey).toBe("meeting:m-2");
    expect(matchProgram("/kitchen/recipes/r-1/versions/3")?.instanceKey).toBe(
      "recipe-version:r-1:3",
    );
  });

  it("prefers a static segment over the dynamic one beside it", () => {
    expect(matchProgram("/meetings/new")?.programId).toBe("new-meeting");
    expect(matchProgram("/kitchen/recipes/new")?.programId).toBe("new-recipe");
    expect(matchProgram("/kitchen/recipes/review")?.programId).toBe(
      "recipe-review",
    );
  });

  it("reads a trailing slash as the same page", () => {
    expect(matchProgram("/tasks/")?.programId).toBe("tasks");
  });

  it("ignores a query string and a hash", () => {
    expect(matchProgram("/calendar?team=kitchen")?.instanceKey).toBe(
      "calendar",
    );
    expect(matchProgram("/captains/join-site#burn")?.programId).toBe(
      "join-site",
    );
  });

  it("titles a document generically, never with its data", () => {
    expect(matchProgram("/announcements/secret-plans")?.genericTitle).toBe(
      "ANNOUNCE.TXT",
    );
    expect(
      matchProgram("/captains/questionnaires/k/responses/u-1")?.genericTitle,
    ).toBe("ANSWERS.TXT");
  });

  it("matches nothing that is not a console window", () => {
    for (const p of [
      "/captains/camp-management/export",
      "/captains/questionnaires/k/responses/export",
      "/auth/sign-in",
      "/auth/sign-out",
      "/api/health",
      "/pending-approval",
      "/nope",
      "/meetings/a/b/c",
      "notifications",
      "",
      "/meetings/%2F..%2Fx",
      "//notifications",
      "//evil.example/notifications",
      "/\\evil.example",
    ]) {
      expect(matchProgram(p), p).toBeNull();
    }
  });
});

describe("program routes against the route tree", () => {
  const pages = consoleRoutes("page.tsx");
  const handlers = consoleRoutes("route.ts");

  it("finds the console pages", () => {
    expect(pages.length).toBeGreaterThan(40);
    expect(pages).toContain("/meetings/[id]/edit");
  });

  it("maps every console page to a program, through its own row", () => {
    const unmapped = pages.filter(
      (page) => !PROGRAM_ROUTES.some((r) => r.pattern === page),
    );
    expect(
      unmapped,
      `app/(console){${unmapped.join(", ")}}/page.tsx has no row in lib/program-routes.ts`,
    ).toEqual([]);
    for (const page of pages) {
      const row = PROGRAM_ROUTES.find((r) => r.pattern === page)!;
      expect(matchProgram(sample(page))?.programId, page).toBe(row.programId);
    }
  });

  it("has a page for every row", () => {
    const orphans = PROGRAM_ROUTES.map((r) => r.pattern).filter(
      (pattern) => !pages.includes(pattern),
    );
    expect(orphans).toEqual([]);
  });

  it("maps no route handler under (console), and knows each one", () => {
    expect(handlers.length).toBeGreaterThan(0);
    expect([...CONSOLE_ROUTE_HANDLERS].sort()).toEqual(handlers);
    for (const handler of handlers) {
      expect(matchProgram(sample(handler)), handler).toBeNull();
    }
  });
});

describe("lib/program-routes.ts is safe to ship to a browser", () => {
  it("imports nothing at all, so no rank or predicate can ride along", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../program-routes.ts"),
      "utf8",
    );
    const imports = [
      ...source.matchAll(
        /^\s*(?:import|export)[^;]*?from\s+["']([^"']+)["']/gm,
      ),
      ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
      ...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g),
      ...source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);
    expect(imports).toEqual([]);
  });
});
