import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";

// Pages that stream a slow part behind a <Suspense> skeleton, BELOW their
// gate (AGENTS.md, "No loading.tsx under app/(console)/"). What the pattern
// must never cost: the gate's redirect is still the server's, a notFound() is
// still a 404, and nothing is drawn twice (a boundary above the page left the
// server's copy in a hidden <div id="S:0"> beside the client's).

const STREAMED = [
  { path: "/calendar", heading: "Calendar", rank: "member" as const },
  { path: "/captains/audit", heading: "Audit log", rank: "captain" as const },
];

async function signedIn(
  page: Page,
  request: APIRequestContext,
  id: string,
  rank: "captain" | "member",
) {
  await login(page, { id, email: "god@example.com", displayName: id });
  await page.goto("/"); // lazily creates the camp user row
  await completeOnboarding(request, id);
  await setRank(request, id, rank);
}

test.describe("streamed pages keep the gate on the server (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  for (const { path } of STREAMED) {
    test(`${path}: signed out is a server redirect to sign in`, async ({
      request,
    }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status()).toBe(307);
      expect(res.headers().location).toMatch(/\/auth\/sign-in/);
    });
  }

  test("a notFound() page still answers 404", async ({ page, request }) => {
    await signedIn(page, request, "stream-404", "member");
    const res = await page.goto(
      "/meetings/00000000-0000-4000-8000-000000000000",
    );
    expect(res?.status()).toBe(404);
  });

  for (const { path, heading, rank } of STREAMED) {
    test(`${path}: the heading and the streamed part are in the page once`, async ({
      page,
      request,
    }) => {
      await signedIn(page, request, `stream-${rank}`, rank);
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      const h1 = page.getByRole("heading", { level: 1, name: heading });
      await expect(h1).toBeVisible();
      // The streamed part has landed: its skeleton is gone.
      await expect(
        page.locator('[role="status"][aria-busy="true"]'),
      ).toHaveCount(0);
      // Counted in the DOM, hidden copies included: no second copy of the
      // page, of its heading or of the streamed part.
      const counts = await page.evaluate((name) => {
        const h1s = [...document.querySelectorAll("h1")].filter(
          (h) => h.textContent?.trim() === name,
        ).length;
        const hiddenCopies = [
          ...document.querySelectorAll<HTMLElement>('div[hidden][id^="S:"]'),
        ].filter((d) => d.querySelector("h1, main, section, table")).length;
        return { h1s, hiddenCopies };
      }, heading);
      expect(counts).toEqual({ h1s: 1, hiddenCopies: 0 });
    });
  }
});
