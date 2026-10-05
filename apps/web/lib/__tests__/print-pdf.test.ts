import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The PDF browser opens the print page with the member's cookies and reports
// its tab as visible. Whatever the page does, it must never reach the notice
// API: a pop-up claim there marks the member's pop-ups read in a browser
// nobody sees (web-other-routes-4).

const calls: string[] = [];
const routes: { pattern: string; handler: (route: unknown) => unknown }[] = [];
const page = {
  goto: vi.fn(async () => {
    calls.push("goto");
    return { ok: () => true };
  }),
  url: () => "https://camp-404.com/print/shifts",
  $: vi.fn(async () => ({})),
  evaluate: vi.fn(async () => undefined),
  pdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
};
const context = {
  addCookies: vi.fn(async () => undefined),
  route: vi.fn(
    async (pattern: string, handler: (route: unknown) => unknown) => {
      calls.push("route");
      routes.push({ pattern, handler });
    },
  ),
  newPage: vi.fn(async () => {
    calls.push("newPage");
    return page;
  }),
};
vi.mock("playwright-core", () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newContext: vi.fn(async () => context),
      close: vi.fn(async () => undefined),
    })),
  },
}));

import { PDF_BLOCKED_REQUESTS, renderPrintPdf } from "../print-pdf";

beforeEach(() => {
  calls.length = 0;
  routes.length = 0;
  vi.stubEnv("VERCEL_ENV", "");
});

describe("renderPrintPdf", () => {
  it("blocks the notice API before the page opens, and still makes the file", async () => {
    const result = await renderPrintPdf({
      origin: "https://camp-404.com",
      path: "/print/shifts",
      cookies: [{ name: "camp404.session_token", value: "t" }],
    });
    expect(result.ok).toBe(true);

    expect(routes.map((r) => r.pattern)).toEqual([PDF_BLOCKED_REQUESTS]);
    expect(PDF_BLOCKED_REQUESTS).toBe("**/api/notifications/**");
    expect(calls.indexOf("route")).toBeLessThan(calls.indexOf("newPage"));

    const route = { abort: vi.fn(async () => undefined), continue: vi.fn() };
    await routes[0]!.handler(route);
    expect(route.abort).toHaveBeenCalledOnce();
    expect(route.continue).not.toHaveBeenCalled();
  });
});
