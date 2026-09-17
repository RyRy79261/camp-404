import type { Locator, Page, TestInfo } from "@playwright/test";
import { test } from "@playwright/test";

/**
 * The app's own alerts. Next renders a route announcer with role="alert" on
 * every page (id `__next-route-announcer__`, in a shadow root Playwright
 * pierces), so a bare `getByRole("alert")` collides with it in strict mode.
 * Pass `hasText` to pick one alert out.
 */
export function appAlerts(page: Page, hasText?: string | RegExp): Locator {
  const alerts = page
    .getByRole("alert")
    .and(page.locator(":not(#__next-route-announcer__)"));
  return hasText === undefined ? alerts : alerts.filter({ hasText });
}

/** The phone-width project that runs nightly (playwright.config.ts). */
export const MOBILE_PROJECT = "mobile-360";

/**
 * Skip this test on the phone-width project. For a test that drives a
 * desktop-only layout (a table's columns, a hover), not for hiding a phone
 * bug: say why in `reason`.
 */
export function desktopOnly(testInfo: TestInfo, reason: string): void {
  test.skip(testInfo.project.name === MOBILE_PROJECT, reason);
}
