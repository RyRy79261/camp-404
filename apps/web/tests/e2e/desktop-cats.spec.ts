import { test, expect } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";
import { desktopOnly } from "./lib/dom";
import { desktopIcon, expectDesktop, osWindow } from "./lib/console-nav";

// The two cats who visit a program's window left open (@camp404/games's
// camp-cats; an easter egg, so never named in the page). The wait is 1.5
// minutes; the E2E harness shortens it to 2 s (lib/camp-cats.ts). The
// six-hour feeding limit lives in the browser's localStorage, so the store
// has no part in it and needs no twin.

/** The key the limit is kept under (@camp404/games/camp-cats). */
const FED_KEY = "camp404:bowls-filled-at";

async function asMember(page: Page, request: APIRequestContext, id: string) {
  await login(page, { id, email: "god@example.com" });
  await page.goto("/");
  await completeOnboarding(request, id);
  await setRank(request, id, "member");
}

function catsLayer(page: Page): Locator {
  return page.locator("[data-camp-cats]");
}
function cat(page: Page, kind: "orange" | "tortie"): Locator {
  return page.locator(`[data-camp-cat="${kind}"]`);
}

/** What is drawn on top at a cat's middle: the window, or the cat itself. */
async function topAtMiddle(page: Page, el: Locator): Promise<string> {
  const box = (await el.boundingBox())!;
  return page.evaluate(
    ([x, y]) => {
      const hit = document.elementFromPoint(x!, y!);
      return hit?.closest("section[data-window]") ? "window" : "desktop";
    },
    [box.x + box.width / 2, box.y + box.height / 2],
  );
}

/**
 * Animations running inside the cats' layer (none means nothing moves).
 * Polled: under reduced motion the kit turns every style change into a
 * 0.01 ms transition, which is "running" for a frame.
 */
async function catAnimations(page: Page): Promise<number> {
  return page.evaluate(() => {
    const layer = document.querySelector("[data-camp-cats]");
    return document.getAnimations().filter((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target;
      return !!t && !!layer?.contains(t) && a.playState === "running";
    }).length;
  });
}

async function openFamilyTree(page: Page) {
  await desktopIcon(page, "Family tree").dblclick();
  await expect(
    page.getByRole("heading", { level: 1, name: "Family tree" }),
  ).toBeVisible();
}

test.describe("the visiting cats (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("come under a window left open, go out when it moves, eat once, and not again within six hours", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "windows and desktop icons are the desktop's");
    test.setTimeout(120_000);
    await asMember(page, request, "cats-visit");
    await page.goto("/");
    await expectDesktop(page);
    await expect(catsLayer(page)).toHaveAttribute("data-camp-cats", "none");
    await openFamilyTree(page);

    // After the wait they are there, under the window: it is drawn over them.
    await expect(catsLayer(page)).toHaveAttribute("data-camp-cats", "waiting");
    await expect(cat(page, "orange")).toHaveCount(1);
    await expect(cat(page, "tortie")).toHaveCount(1);
    expect(await topAtMiddle(page, cat(page, "orange"))).toBe("window");
    expect(await topAtMiddle(page, cat(page, "tortie"))).toBe("window");
    // Never labelled: hidden from assistive tech, no words.
    await expect(catsLayer(page)).toHaveAttribute("aria-hidden", "true");
    expect(await catsLayer(page).textContent()).toBe("");

    // Drag the window off them (down and to the left).
    const bar = osWindow(page, "Family tree").locator("[data-titlebar]");
    const b = (await bar.boundingBox())!;
    await page.mouse.move(b.x + 200, b.y + 10);
    await page.mouse.down();
    await page.mouse.move(b.x + 100, b.y + 160, { steps: 8 });
    await page.mouse.move(b.x - 300, b.y + 360, { steps: 8 });
    await page.mouse.up();
    await expect(catsLayer(page)).toHaveAttribute("data-camp-cats", "going");

    // One scratches at the right-hand edge; the other sits on an icon.
    await expect(catsLayer(page)).toHaveAttribute("data-camp-cats", "settled", {
      timeout: 40_000,
    });
    await expect(cat(page, "orange")).toHaveAttribute("data-pose", "scratch");
    await expect(cat(page, "tortie")).toHaveAttribute("data-pose", "sassy");
    const layerBox = (await catsLayer(page).boundingBox())!;
    const orange = (await cat(page, "orange").boundingBox())!;
    expect(orange.x + orange.width).toBeCloseTo(layerBox.x + layerBox.width, 0);
    // The cats let clicks through to the icon under them.
    expect(await topAtMiddle(page, cat(page, "tortie"))).toBe("desktop");
    await expect(cat(page, "tortie")).toHaveCSS("pointer-events", "none");

    // Two bowls; a click fills both, and the time is kept in the browser.
    const bowls = page.locator("[data-camp-bowl]");
    await expect(bowls).toHaveCount(2);
    await expect(bowls.first()).toHaveAttribute("aria-hidden", "true");
    await bowls.first().click();
    await expect(bowls.first()).toHaveAttribute("data-camp-bowl", "full");
    expect(
      Number(await page.evaluate((k) => localStorage.getItem(k), FED_KEY)),
    ).toBeGreaterThan(0);
    await expect(catsLayer(page)).toHaveAttribute("data-camp-cats", "eating", {
      timeout: 40_000,
    });
    await expect(cat(page, "orange")).toHaveAttribute("data-pose", "eat");
    // Then each sits on an icon, the bowls are gone, and nothing moves.
    await expect(catsLayer(page)).toHaveAttribute("data-camp-cats", "done", {
      timeout: 40_000,
    });
    await expect(cat(page, "orange")).toHaveAttribute("data-pose", "perch");
    await expect(cat(page, "tortie")).toHaveAttribute("data-pose", "perch");
    await expect(bowls).toHaveCount(0);
    await expect.poll(() => catAnimations(page)).toBe(0);

    // Within six hours they come again (reduced motion: already in place),
    // but no bowls are put out.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Family tree" }),
    ).toBeVisible();
    await expect(catsLayer(page)).toHaveAttribute("data-camp-cats", "settled");
    await expect(cat(page, "orange")).toHaveCount(1);
    await expect(bowls).toHaveCount(0);
  });

  test("under reduced motion: already in place, nothing walks, and a feed shows the end", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "windows and desktop icons are the desktop's");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await asMember(page, request, "cats-still");
    await page.goto("/");
    await expectDesktop(page);
    await openFamilyTree(page);

    await expect(catsLayer(page)).toHaveAttribute("data-camp-cats", "settled");
    await expect(cat(page, "orange")).toHaveAttribute("data-pose", "scratch");
    await expect(cat(page, "tortie")).toHaveAttribute("data-pose", "sassy");
    await expect.poll(() => catAnimations(page)).toBe(0);
    const bowls = page.locator("[data-camp-bowl]");
    await expect(bowls).toHaveCount(2);
    await bowls.last().click();
    await expect(catsLayer(page)).toHaveAttribute("data-camp-cats", "done");
    await expect(cat(page, "orange")).toHaveAttribute("data-pose", "perch");
    await expect(bowls).toHaveCount(0);
    await expect.poll(() => catAnimations(page)).toBe(0);
  });
});
