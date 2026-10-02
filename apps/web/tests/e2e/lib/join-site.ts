import type { Page } from "@playwright/test";

/**
 * Open one section of the Join site editor. On a desktop the sections are a
 * list beside the open one; on a phone the list is its own screen, so this
 * goes back to it first when a section is open.
 */
export async function openJoinSection(page: Page, name: string) {
  const back = page.getByRole("button", { name: "All sections" });
  if (await back.isVisible()) await back.click();
  await page
    .getByRole("navigation", { name: "Sections" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .filter({ visible: true })
    .first()
    .click();
}
