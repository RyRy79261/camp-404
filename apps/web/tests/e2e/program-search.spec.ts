import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";
import { desktopOnly } from "./lib/dom";
import {
  bottomBar,
  expectDesktop,
  liveWindow,
  usesPhoneLayout,
} from "./lib/console-nav";

// Ctrl+K program search (issue #326, step 1). The box lists what the
// member's manifest holds, which the server filters by rank, so a plain
// member never finds a captain's program; Enter opens the program's window
// the way the Start menu does.

async function asRank(
  page: Page,
  request: APIRequestContext,
  id: string,
  rank: "captain" | "member",
) {
  // The founder address lets a member in without an invite; the rank the
  // test sets is what the manifest reads (as os-shell.spec.ts does).
  await login(page, { id, email: "god@example.com", displayName: id });
  await page.goto("/");
  await completeOnboarding(request, id);
  await setRank(request, id, rank);
  await page.goto("/");
  await expectDesktop(page);
}

function searchBox(page: Page) {
  return page.getByRole("dialog", { name: "Search programs" });
}

function result(page: Page, name: string | RegExp) {
  return searchBox(page).getByRole("option", { name });
}

/** Ctrl+K, once the desktop has hydrated (the listener is React's). */
async function pressCtrlK(page: Page) {
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(searchBox(page)).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

test.describe("Ctrl+K program search (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("Ctrl+K opens it, typing finds Power, Enter opens its window, Esc gives focus back", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone opens search from its bottom bar, below");
    await asRank(page, request, "search-member", "member");

    await pressCtrlK(page);
    const input = searchBox(page).getByRole("combobox");
    await expect(input).toBeFocused();
    await input.fill("pow");
    const power = result(page, /^Power,/);
    await expect(power).toBeVisible();
    // The program's group on the right, and it is the first row, picked.
    await expect(power).toContainText("Power and Lighting");
    await expect(power).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");

    await expect(searchBox(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/power\/loads$/);
    await expect(liveWindow(page)).toHaveAttribute(
      "data-window-title",
      "Power",
    );

    // Opened once, it is Recent in the empty box, even with its window in
    // focus.
    await pressCtrlK(page);
    await expect(searchBox(page).getByText("Recent")).toBeVisible();
    await expect(result(page, /^Power,/)).toBeVisible();

    // Arrows move, Esc shuts it and gives focus back.
    await page.keyboard.press("Escape");
    await expect(searchBox(page)).toHaveCount(0);
    const startButton = page.locator("[data-os-start-button]");
    await startButton.focus();
    await pressCtrlK(page);
    await searchBox(page).getByRole("combobox").fill("my");
    const first = searchBox(page).locator('[aria-selected="true"]');
    const firstName = await first.textContent();
    await page.keyboard.press("ArrowDown");
    await expect(first).not.toHaveText(firstName ?? "");
    await page.keyboard.press("Escape");
    await expect(searchBox(page)).toHaveCount(0);
    await expect(startButton).toBeFocused();
  });

  test("a plain member never finds a captain's program; a captain does", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the same list on a phone, opened below");
    await asRank(page, request, "search-plain", "member");
    await pressCtrlK(page);
    const input = searchBox(page).getByRole("combobox");
    await input.fill("camp");
    // Present first: the member's own Camp programs are found...
    await expect(result(page, /^Camp layout,/)).toBeVisible();
    // ...and the captains' are not.
    await expect(result(page, /^Camp settings,/)).toHaveCount(0);
    await expect(result(page, /^Camp overview,/)).toHaveCount(0);
    await input.fill("audit log");
    await expect(
      searchBox(page).getByText(/Search finds programs for now/),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await asRank(page, request, "search-captain", "captain");
    await pressCtrlK(page);
    await searchBox(page).getByRole("combobox").fill("camp");
    await expect(result(page, /^Camp settings,/)).toBeVisible();
    await expect(result(page, "Camp settings, Captains")).toBeVisible();
  });

  test("on a phone, the bottom bar's Search opens it full screen", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    expect(usesPhoneLayout(page)).toBe(true);
    await asRank(page, request, "search-phone", "member");

    const button = bottomBar(page).getByRole("button", {
      name: "Search programs",
    });
    await expect(async () => {
      await button.click();
      await expect(searchBox(page)).toBeVisible({ timeout: 1_000 });
    }).toPass();
    // Full screen: as wide as the phone, from the top.
    const box = (await searchBox(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(389);
    expect(box.y).toBeLessThanOrEqual(1);
    // Every cell of the bottom bar still fits on the screen.
    for (const cell of await bottomBar(page).getByRole("button").all()) {
      const b = (await cell.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(390);
    }

    await searchBox(page).getByRole("combobox").fill("pow");
    await result(page, /^Power,/).click();
    await expect(page).toHaveURL(/\/power\/loads$/);
    await expect(searchBox(page)).toHaveCount(0);

    // Cancel shuts it.
    await button.click();
    await expect(searchBox(page)).toBeVisible();
    await searchBox(page).getByRole("button", { name: "Cancel" }).click();
    await expect(searchBox(page)).toHaveCount(0);
  });
});
