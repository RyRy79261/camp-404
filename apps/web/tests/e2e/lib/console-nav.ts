import { expect, type Locator, type Page } from "@playwright/test";

// The console nav (issue #266) is a few links and then menus. On a desktop the
// links sit in the bar and each menu opens from its button; below Tailwind's
// `md` the whole nav folds into one "Menu" sheet. These helpers hide the
// difference, so a spec reads the same on chromium and on mobile-360.

/** Tailwind's `md`: below it the nav is one sheet. */
const SHEET_BELOW = 768;

export function usesNavSheet(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < SHEET_BELOW;
}

/** The nav landmark that is on screen at this width. */
export function consoleNav(page: Page): Locator {
  return page.getByRole("navigation", { name: "Console" });
}

/**
 * Open the part of the nav that holds `group` (a menu's name: "Teams",
 * "Camp", "Me", "Captains") and return it; with no group, the part that holds
 * the plain links (Home, Tasks, Calendar). On a phone that is the sheet, or the
 * menu's section inside it, opened.
 */
export async function openConsoleNav(
  page: Page,
  group?: string,
): Promise<Locator> {
  if (usesNavSheet(page)) {
    await consoleNav(page).getByRole("button", { name: "Menu" }).click();
    const sheet = page.getByRole("dialog", { name: "Menu" });
    await expect(sheet).toBeVisible();
    if (!group) return sheet;
    // Each menu is a section that opens and closes; open it if it is shut.
    const section = sheet.getByRole("region", { name: group, exact: true });
    const toggle = section.getByRole("button", { name: group, exact: true });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    return section;
  }
  if (!group) return consoleNav(page);
  await consoleNav(page)
    .getByRole("button", { name: group, exact: true })
    .click();
  const menu = page.getByRole("menu", { name: group, exact: true });
  await expect(menu).toBeVisible();
  return menu;
}

/** One entry in what `openConsoleNav` returned: a link, or a menu's item. */
export function navEntry(container: Locator, name: string): Locator {
  return container
    .getByRole("link", { name, exact: true })
    .or(container.getByRole("menuitem", { name, exact: true }));
}

/** Open the nav where `name` lives and follow it. */
export async function goViaConsoleNav(
  page: Page,
  name: string,
  group?: string,
): Promise<void> {
  const container = await openConsoleNav(page, group);
  await navEntry(container, name).click();
}

/**
 * The menus the viewer's nav draws, by name, read once the nav is on screen.
 * On a phone this opens the sheet and reads its section headings; close it
 * with Escape before carrying on.
 */
export async function consoleNavGroups(page: Page): Promise<string[]> {
  if (usesNavSheet(page)) {
    const sheet = await openConsoleNav(page);
    const regions = sheet.getByRole("region");
    await expect(
      regions.getByRole("heading", { name: "Me", exact: true }),
    ).toBeVisible();
    return trimmed(await regions.getByRole("heading").allTextContents());
  }
  const nav = consoleNav(page);
  await expect(
    nav.getByRole("button", { name: "Me", exact: true }),
  ).toBeVisible();
  return trimmed(await nav.getByRole("button").allTextContents());
}

function trimmed(texts: string[]): string[] {
  return texts.map((t) => t.trim());
}
