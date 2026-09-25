import { test, expect } from "@playwright/test";
import type { APIRequestContext, Locator, Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  resetTestState,
  seedTeam,
  setRank,
} from "./_helpers";
import { desktopOnly } from "./lib/dom";
import {
  consoleNav,
  consoleNavGroups,
  navEntry,
  openConsoleNav,
  usesNavSheet,
} from "./lib/console-nav";

// The grouped console nav (issue #266): links, then the Teams, Camp, Me and
// Captains menus, filtered by rank on the server. On a phone it is one sheet.
// lib/console-nav.ts hides that difference, so every test here runs at both
// widths unless it says otherwise.

test.describe("console nav — menus (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  async function asRank(
    page: Page,
    request: APIRequestContext,
    authUserId: string,
    rank: "captain" | "member",
  ) {
    await login(page, { id: authUserId, email: "god@example.com" });
    await page.goto("/"); // lazily creates the camp user row
    await completeOnboarding(request, authUserId);
    await setRank(request, authUserId, rank);
  }

  /** The entries of a menu (or the sheet's section), in order. */
  function entries(container: Locator) {
    return container.getByRole("menuitem").or(container.getByRole("link"));
  }

  test("a captain opens the Captains menu; a member's nav has none", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "menu-captain", "captain");
    await page.goto("/");
    const captains = await openConsoleNav(page, "Captains");
    await expect(entries(captains)).toHaveText([
      "Camp overview",
      "Questionnaires",
      "Announcements",
      "Payments",
      "Camp settings",
      "Audit",
      "System status",
    ]);
    await navEntry(captains, "Camp settings").click();
    await expect(page).toHaveURL("/captains/camp-settings");
    await expect(
      page.getByRole("heading", { level: 1, name: "Camp settings" }),
    ).toBeVisible();

    await asRank(page, request, "menu-member", "member");
    await page.goto("/");
    const groups = await consoleNavGroups(page);
    // Present first: the member's own menus are drawn.
    expect(groups).toEqual(["Teams", "Camp", "Me"]);
    expect(groups).not.toContain("Captains");
  });

  test("a member's own team leads the Teams menu and opens its page", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "menu-sound", "member");
    await seedTeam(request, "menu-sound", "sound");
    await page.goto("/");

    const teams = await openConsoleNav(page, "Teams");
    // Sound is near the end of the camp's order; the member is on it, so it
    // comes first. Kitchen, the camp's first team, follows it.
    await expect(entries(teams).nth(0)).toHaveText("Sound");
    await expect(entries(teams).nth(1)).toHaveText("Kitchen");
    await navEntry(teams, "Sound").click();
    await expect(page).toHaveURL("/teams/sound");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sound" }),
    ).toBeVisible();
  });

  test("a team a captain archives leaves the Teams menu", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "menu-archive", "captain");
    await page.goto("/captains/camp-settings");
    const water = page.getByRole("switch", { name: "Water active" });
    await expect(water).toBeChecked();
    await water.click();
    await expect(water).not.toBeChecked();

    await page.goto("/");
    const teams = await openConsoleNav(page, "Teams");
    await expect(navEntry(teams, "Kitchen")).toBeVisible();
    await expect(navEntry(teams, "Sound")).toBeVisible();
    await expect(navEntry(teams, "Water")).toHaveCount(0);
  });

  test("the page open is lit, and only the closest entry", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "menu-lit", "member");
    await page.goto("/profile/security");
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign-in and security" }),
    ).toBeVisible();

    const me = await openConsoleNav(page, "Me");
    await expect(navEntry(me, "Sign-in & security")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(navEntry(me, "Profile")).toBeVisible();
    await expect(navEntry(me, "Profile")).not.toHaveAttribute(
      "aria-current",
      /.*/,
    );
  });

  test("the keyboard opens a menu, moves through it, and Esc hands focus back", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone has one sheet, covered in the next test");
    await asRank(page, request, "menu-keys", "captain");
    await page.goto("/");

    const trigger = consoleNav(page).getByRole("button", {
      name: "Captains",
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Captains", exact: true });
    await expect(menu).toBeVisible();
    await expect(navEntry(menu, "Camp overview")).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(navEntry(menu, "Questionnaires")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Enter on an item follows it.
    await page.keyboard.press("ArrowDown");
    await expect(menu).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(navEntry(menu, "Questionnaires")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/captains/questionnaires");
    await expect(
      page.getByRole("heading", { level: 1, name: "Questionnaires" }),
    ).toBeVisible();
    // The menu closes once the page it led to arrives.
    await expect(menu).toHaveCount(0);
  });

  test("on a phone the nav is one sheet, with no sideways scroll", async ({
    page,
    request,
  }) => {
    await asRank(page, request, "menu-phone", "captain");
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    expect(usesNavSheet(page)).toBe(true);

    const button = consoleNav(page).getByRole("button", { name: "Menu" });
    await expect(button).toBeVisible();
    const noSideScroll = () =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      );
    expect(await noSideScroll()).toBe(true);

    await button.focus();
    await page.keyboard.press("Enter");
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect(sheet).toBeVisible();
    for (const group of ["Teams", "Camp", "Me", "Captains"]) {
      await expect(
        sheet.getByRole("region", { name: group, exact: true }),
      ).toBeVisible();
    }
    expect(await noSideScroll()).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(button).toBeFocused();

    // A link in the sheet goes there, and the sheet closes on arrival.
    await button.click();
    await navEntry(
      sheet.getByRole("region", { name: "Camp", exact: true }),
      "Family tree",
    ).click();
    await expect(page).toHaveURL("/family-tree");
    await expect(sheet).toHaveCount(0);
  });
});
