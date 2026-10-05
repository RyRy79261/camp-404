import { expect, type Locator, type Page } from "@playwright/test";
import { usesPhoneLayout } from "./console-nav";

// The Power program's answer rail. From a medium window up it sits beside
// the open section; on a phone it is /power's home list, and a section shows
// only itself with "‹ All of Power" back to it.

/**
 * Check a section's line on the rail says `text`, from the open section `title`
 * (its level-2 heading). On a phone this goes back to the home list, reads the
 * line there, and taps it to return to the section, as a member would.
 */
export async function expectRailLine(
  page: Page,
  line: RegExp,
  text: string,
  title: string,
): Promise<void> {
  const link: Locator = page
    .getByRole("navigation", { name: "Power" })
    .getByRole("link", { name: line });
  if (!usesPhoneLayout(page)) {
    await expect(link).toContainText(text);
    return;
  }
  await page.getByRole("link", { name: "‹ All of Power" }).click();
  await expect(page).toHaveURL(/\/power$/);
  await expect(link).toContainText(text);
  await link.click();
  await expect(
    page.getByRole("heading", { level: 2, name: title }),
  ).toBeVisible();
}
