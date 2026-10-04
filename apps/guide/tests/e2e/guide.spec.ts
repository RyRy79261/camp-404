import { expect, test } from "@playwright/test";
import { CANARY } from "../../lib/fixtures";

// survival-guide.camp-404.com (#250) against `next dev` with the fixture
// chapters (lib/fixtures.ts), which reach the pages through the same public
// rule and the same cut as the database's rows.
//
// The leak test: CANARY sits inside a members-only part of a public chapter,
// in a chapter kept members only, in a private section's chapter and in an
// unpublished one. It must appear in no response body: not the HTML, not the
// React Server Components data inlined with it (`__next_f`), not the RSC
// request a client navigation makes. Broken on purpose once (publicMarkdown
// made to return its input): every assertion on CANARY went red.

const PAGES = [
  "/",
  "/getting-to-the-tankwa",
  "/evening-clean-up",
  "/medical-plan",
  "/kitchen-and-fridge-rules",
  "/old-gate-times",
  "/never-used",
];

test("no members-only word reaches any public response", async ({
  request,
}) => {
  for (const path of PAGES) {
    for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
      const res = await request.get(path, { headers });
      const body = await res.text();
      expect(body, `${path} ${JSON.stringify(headers)}`).not.toContain(CANARY);
      expect(body).not.toContain("convoy");
      expect(body).not.toContain(":::members");
    }
  }
  const chapter = await (await request.get("/getting-to-the-tankwa")).text();
  expect(chapter).toContain("self.__next_f");
  expect(chapter).toContain("The dirt road");
  expect(chapter).toContain("There is more here for camp members.");
});

test("the contents lists only the public chapters, and Find filters them", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Survival Guide" }),
  ).toBeVisible();
  const toc = page.locator(".toc");
  await expect(toc.getByRole("link")).toHaveText([
    /Getting to the Tankwa/,
    /Packing list/,
    /Power etiquette/,
    /The sleeping area/,
    /Evening clean-up/,
  ]);
  await expect(page.getByText("Medical plan")).toHaveCount(0);
  await expect(page.getByText("Kitchen and fridge rules")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Getting to the Tankwa/ }),
  ).toContainText("The drive is part of the burn.");

  await page.getByLabel("Find a chapter").fill("generator");
  await expect(toc.getByRole("link")).toHaveText([/Power etiquette/]);
  // Words inside a members-only part are not there to find.
  await page.getByLabel("Find a chapter").fill("convoy");
  await expect(page.getByRole("status")).toContainText(
    "No chapter here mentions",
  );
});

test("a chapter shows one fixed line where a members-only part was cut", async ({
  page,
}) => {
  await page.goto("/getting-to-the-tankwa");
  await expect(
    page.getByRole("heading", { level: 1, name: "Getting to the Tankwa" }),
  ).toBeVisible();
  const gap = page.getByTestId("members-gap");
  await expect(gap).toHaveCount(1);
  await expect(gap).toHaveText(
    "There is more here for camp members. Read it in the app",
  );
  await expect(gap.getByRole("link")).toHaveAttribute(
    "href",
    "https://camp-404.com/guide/getting-to-the-tankwa",
  );
  await expect(page.getByText("The convoy plan")).toHaveCount(0);
  // A link to another public chapter stays on this site; an outside one
  // carries its short address for paper.
  await expect(
    page.locator(".chapter-body").getByRole("link", { name: "sleeping area" }),
  ).toHaveAttribute("href", "/the-sleeping-area");
  await expect(
    page.getByRole("link", { name: "Survival Guide", exact: true }).last(),
  ).toHaveAttribute("data-print-url", "afrikaburn.org/survival-guide");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("a chapter that is not public answers like one never written", async ({
  page,
}) => {
  for (const path of [
    "/medical-plan",
    "/kitchen-and-fridge-rules",
    "/old-gate-times",
    "/never-used",
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "This page isn't in the guide.",
      }),
    ).toBeVisible();
  }
});

test("every page says noindex, and robots.txt names no sitemap", async ({
  request,
}) => {
  for (const path of ["/", "/getting-to-the-tankwa", "/never-used"]) {
    const res = await request.get(path);
    expect(res.headers()["x-robots-tag"], path).toBe("noindex");
  }
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /");
  expect(robots.toLowerCase()).not.toContain("sitemap");
});

test("a duty card shows its parts and prints the app's card", async ({
  page,
}) => {
  await page.goto("/evening-clean-up");
  await expect(
    page.getByRole("heading", { level: 1, name: "Evening clean-up" }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Hard rules" })).toContainText(
    "Gas off at the bottle",
  );
  await expect(page.getByRole("button", { name: "Print card" })).toBeVisible();
  await expect(page.getByText("Used by")).toHaveCount(0);

  await page.emulateMedia({ media: "print" });
  const paper = page.getByTestId("duty-card");
  await expect(paper).toBeVisible();
  await expect(paper).toContainText("Camp 404 · Duty card · Kitchen");
  await expect(paper).toContainText("Never skip these");
  await expect(page.locator(".dc")).toBeHidden();
});

test("a chapter on paper drops the site and prints its address once", async ({
  page,
}) => {
  await page.goto("/getting-to-the-tankwa");
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation", { name: "Contents" })).toBeHidden();
  await expect(page.getByTestId("members-gap")).toBeHidden();
  await expect(page.locator(".pc-end")).toHaveText(
    /Read it online: survival-guide\.camp-404\.com\/getting-to-the-tankwa · version 6 · printed/,
  );
  const style = await page.locator("article style").first().textContent();
  expect(style).toContain(
    'content: "Camp 404 Survival Guide · Before you come"',
  );
  expect(style).toContain('counter(page) " of " counter(pages)');
});

test("on a phone, Contents opens the book over the page", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "phone only");
  await page.goto("/getting-to-the-tankwa");
  await page.getByRole("button", { name: "Contents" }).click();
  const sheet = page.locator("#contents-sheet");
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole("link", { name: "Getting to the Tankwa" }),
  ).toHaveAttribute("aria-current", "page");
  await sheet.getByRole("link", { name: "Packing list" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Packing list" }),
  ).toBeVisible();
  await expect(sheet).toHaveCount(0);
});
