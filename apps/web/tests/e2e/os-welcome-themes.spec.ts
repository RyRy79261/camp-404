import { test, expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "./_helpers";
import { desktopOnly } from "./lib/dom";
import {
  desktopIcon,
  expectDesktop,
  liveWindow,
  startButton,
  startMenu,
  usesPhoneLayout,
} from "./lib/console-nav";

// The 404 OS welcome wizard (issue #289) and system themes (issue #290);
// docs/specs/2026-09-26-404-os-welcome-and-themes.md, "Checks". The E2E login
// counts the welcome as seen unless it is asked for (`welcome: true`), so
// every other spec's desktop is uncovered; these ask for it.

async function approvedMember(
  page: Page,
  request: APIRequestContext,
  id: string,
  welcome = false,
) {
  await login(page, {
    id,
    email: `${id}@example.com`,
    displayName: id,
    welcome,
  });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

const wizard = (page: Page) =>
  page.getByRole("dialog", { name: "Welcome to 404 OS" });

/** The next server action's answer (a save), whatever the page. */
function actionDone(page: Page) {
  return page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && !!r.request().headers()["next-action"],
  );
}

/** My account's Display section, in its window. */
async function openDisplay(page: Page) {
  await page.goto("/profile/display");
  await expect(
    page.getByRole("heading", { level: 1, name: "Display" }),
  ).toBeVisible();
}

test.describe("404 OS welcome and themes (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("the welcome shows once: skipped, it stays shut after a reload and on another device; Start opens it again", async ({
    page,
    request,
    browser,
  }, testInfo) => {
    desktopOnly(testInfo, "Start > Welcome is the desktop's Start menu");
    await approvedMember(page, request, "welcome-new", true);
    await page.goto("/");
    await expectDesktop(page);

    const panel = wizard(page);
    await expect(panel).toBeVisible();
    // Focus goes into the panel, to the step's heading.
    await expect(panel.getByRole("heading", { name: "Welcome" })).toBeFocused();
    await panel.getByRole("button", { name: "Next" }).click();
    await expect(
      panel.getByRole("heading", { name: "Opening things" }),
    ).toBeFocused();

    const saved = actionDone(page);
    await panel.getByRole("button", { name: "Skip for now" }).click();
    await expect(panel).toHaveCount(0);
    await saved;

    await page.reload();
    await expectDesktop(page);
    await expect(wizard(page)).toHaveCount(0);

    // Another device: the server remembers.
    const other = await browser.newContext();
    const second = await other.newPage();
    await login(second, { id: "welcome-new", welcome: true });
    await second.goto("/");
    await expectDesktop(second);
    await expect(wizard(second)).toHaveCount(0);
    await other.close();

    // Start > Welcome opens it again; Esc closes it and focus stays on the
    // desktop.
    await startButton(page).click();
    await startMenu(page).getByRole("menuitem", { name: "Welcome" }).click();
    await expect(wizard(page)).toBeVisible();
    await expect(
      wizard(page).getByRole("heading", { name: "Welcome" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(wizard(page)).toHaveCount(0);
    await expect(page.locator("#os-desktop :focus")).toHaveCount(1);
  });

  test("the panel stays on the right edge on every step, and Today's handle takes a click beside it", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone's panel fills the screen");
    await approvedMember(page, request, "welcome-right", true);
    await page.goto("/");
    await expectDesktop(page);
    const panel = wizard(page);
    await expect(panel).toBeVisible();
    const width = page.viewportSize()!.width;
    const inbox = (await desktopIcon(page, "Inbox").boundingBox())!;
    for (let i = 0; i < 7; i++) {
      // After its slide in has finished.
      await panel.evaluate((el) =>
        Promise.all(el.getAnimations().map((a) => a.finished)),
      );
      const box = (await panel.boundingBox())!;
      // Flush with the Today handle's 44 px, never over the icons.
      expect(Math.round(width - (box.x + box.width))).toBe(44);
      expect(box.x).toBeGreaterThan(inbox.x + inbox.width);
      if (i === 4) {
        await expect(
          panel.getByRole("heading", { name: "Today" }),
        ).toBeFocused();
        await page.getByRole("button", { name: /^Show Today/ }).click();
        await expect(
          page.getByRole("complementary", { name: "Today", exact: true }),
        ).toBeVisible();
      }
      if (i < 6) await panel.getByRole("button", { name: "Next" }).click();
    }
  });

  test("on a phone, Opening things says one tap opens, with no switch and no double-click", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await approvedMember(page, request, "welcome-phone", true);
    await page.goto("/");
    const panel = wizard(page);
    await expect(panel).toBeVisible();
    await panel.getByRole("button", { name: "Next" }).click();
    await expect(
      panel.getByRole("heading", { name: "Opening things" }),
    ).toBeFocused();
    await expect(
      panel.getByText("Tap a program once to open it."),
    ).toBeVisible();
    // Every mention of a double-click is the desktop's, out of sight here.
    for (const el of await panel.getByText(/double-click/i).all()) {
      await expect(el).toBeHidden();
    }
    await expect(
      panel.getByRole("switch", { name: /Open with one click/ }),
    ).toBeHidden();

    // Moving around and the home screen: the phone's own controls, and none
    // of the desktop's (dragging, right-click, the taskbar). No Programs
    // button on a phone: a program left open glows on the home screen.
    await panel.getByRole("button", { name: "Next" }).click();
    await expect(
      panel.getByRole("heading", { name: "Moving around" }),
    ).toBeFocused();
    await expect(panel.getByText(/glows there/)).toBeVisible();
    await expect(panel.getByText("Step 3 of 7")).toBeVisible();
    await expect(panel.getByText(/Back, at its top, closes it/)).toBeVisible();
    await expect(panel.locator("[data-welcome-demo]")).toBeHidden();
    await panel.getByRole("button", { name: "Next" }).click();
    await expect(
      panel.getByRole("heading", { name: "Your home screen" }),
    ).toBeFocused();
    await expect(panel.getByText(/under My teams/)).toBeVisible();
    for (const el of await panel.getByText(/right-click|drag/i).all()) {
      await expect(el).toBeHidden();
    }
  });

  test("an applicant waiting for approval gets no welcome; once approved, it opens on their first full desktop", async ({
    page,
    request,
  }) => {
    await request.post("/api/test/seed-invite", {
      data: { code: "WELCOME-WAIT", maxUses: 1, requiresApproval: true },
    });
    await login(page, {
      id: "welcome-wait",
      email: "welcome-wait@example.com",
      welcome: true,
    });
    await redeemInviteAtGate(page, "WELCOME-WAIT");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "welcome-wait");
    await page.goto("/");
    await expectDesktop(page);
    await expect(
      page.locator("#os-desktop[data-os-theme='night']"),
    ).toBeAttached();
    await expect(wizard(page)).toHaveCount(0);

    await request.post("/api/test/set-approval", {
      data: { authUserId: "welcome-wait", status: "approved" },
    });
    await page.goto("/");
    await expectDesktop(page);
    await expect(wizard(page)).toBeVisible();
  });

  test("a theme survives a reload and a new browser, and is in the server's first paint", async ({
    page,
    request,
    browser,
  }) => {
    await approvedMember(page, request, "theme-keeper");
    await openDisplay(page);
    const desktop = page.locator("#os-desktop");
    await expect(desktop).toHaveAttribute("data-os-theme", "night");

    const saved = actionDone(page);
    await page.getByRole("radio", { name: /^High contrast/ }).check();
    await saved;
    await expect(desktop).toHaveAttribute("data-os-theme", "high-contrast");
    // <html> follows, for the menus and dialogs portalled outside.
    await expect(page.locator("html")).toHaveAttribute(
      "data-os-theme",
      "high-contrast",
    );

    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Display" }),
    ).toBeVisible();
    await expect(desktop).toHaveAttribute("data-os-theme", "high-contrast");
    await expect(
      page.getByRole("radio", { name: /^High contrast/ }),
    ).toBeChecked();

    // A new browser: the server's own HTML already names the theme, so the
    // first paint is in it (no flash of 404 Night).
    const other = await browser.newContext();
    const second = await other.newPage();
    await login(second, { id: "theme-keeper" });
    const html = await (await second.request.get("/")).text();
    expect(html).toMatch(/id="os-desktop"[^>]*data-os-theme="high-contrast"/);
    await second.goto("/");
    await expectDesktop(second);
    await expect(second.locator("#os-desktop")).toHaveAttribute(
      "data-os-theme",
      "high-contrast",
    );
    await other.close();
  });

  test("Effects off takes the CRT layers and the glitch out of the page", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "effects-off");
    await openDisplay(page);
    const crt = page.locator(
      "#os-desktop :is(.os-scanlines, .os-noise, .os-grid, [data-os-scanbeam])",
    );
    // Present first, so the absence below means something.
    await expect(crt).toHaveCount(4);
    await expect(
      page.locator("#os-desktop [data-os-wordmark]"),
    ).not.toHaveCount(0);

    const saved = actionDone(page);
    await page.getByRole("switch", { name: /Effects off/ }).check();
    await saved;
    await expect(page.locator("#os-desktop")).toHaveAttribute(
      "data-os-effects",
      "off",
    );
    await expect(crt).toHaveCount(0);
    await expect(page.locator("#os-desktop [data-os-wordmark]")).toHaveCount(0);
    await expect(
      page.locator("#os-desktop [data-os-wordmark-still]").first(),
    ).toBeAttached();

    // Kept: a reload draws it off from the server.
    await page.reload();
    await expect(
      page.getByRole("heading", { level: 1, name: "Display" }),
    ).toBeVisible();
    await expect(crt).toHaveCount(0);
  });

  test("Open with one click opens an icon on a single click", async ({
    page,
    request,
  }, testInfo) => {
    desktopOnly(testInfo, "the phone always opens on one tap");
    await approvedMember(page, request, "one-click");
    await page.goto("/");
    await expectDesktop(page);
    // Off: one click selects, nothing opens.
    await desktopIcon(page, "Tasks").click();
    await expect(desktopIcon(page, "Tasks")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page).toHaveURL(/\/$/);

    await openDisplay(page);
    const saved = actionDone(page);
    await page.getByRole("switch", { name: /Open with one click/ }).check();
    await saved;
    // Close My account, back to the bare desktop.
    await liveWindow(page)
      .getByRole("button", { name: /^Close/ })
      .click();
    await expect(page).toHaveURL(/\/$/);

    await desktopIcon(page, "Tasks").click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Tasks" }),
    ).toBeVisible();
    expect(usesPhoneLayout(page)).toBe(false);
  });
});
