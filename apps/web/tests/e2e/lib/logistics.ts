import { expect, type Locator, type Page } from "@playwright/test";

// The Logistics days, set from the Logistics page as a captain or a
// Transport and Logistics lead does. The meal plan takes its Day 1 and its
// days on site from them (the owner, 2026-10-03): Day 1 is the first Build
// day, else the first Burn day.

/** Press until what it opens shows (a click before hydration does nothing). */
async function pressUntil(control: Locator, shown: () => Promise<void>) {
  await expect(async () => {
    if (await control.isVisible()) await control.click({ timeout: 2_000 });
    await shown();
  }).toPass({ timeout: 20_000 });
}

/** Open a phase's dialog on the Logistics page ("Build", "Burn"). */
export async function openPhase(page: Page, phase: string): Promise<Locator> {
  await page.goto("/logistics");
  await expect(
    page.getByRole("heading", { level: 1, name: "Logistics" }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", { name: phase });
  await pressUntil(page.getByRole("button", { name: `Edit ${phase}` }), () =>
    expect(dialog).toBeVisible({ timeout: 2_000 }),
  );
  return dialog;
}

/** Set a phase's first and last day (YYYY-MM-DD) and save it. */
export async function setPhaseDays(
  page: Page,
  phase: string,
  first: string,
  last: string,
): Promise<void> {
  const dialog = await openPhase(page, phase);
  await dialog.getByLabel("First day").fill(first);
  await dialog.getByLabel("Last day").fill(last);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(`${phase} saved`)).toBeVisible();
  await expect(dialog).toBeHidden();
}
