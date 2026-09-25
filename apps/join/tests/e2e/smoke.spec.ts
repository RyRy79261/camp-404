import { expect, test } from "@playwright/test";
import { APPLY_URL } from "../../lib/content";

// The four promises of the brief: the boot skips, an icon opens its window,
// Esc closes it, and APPLY links to the form.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("status", { name: "Starting Camp 404 OS" }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("status")).toHaveCount(0);
  // README.TXT opens once the boot ends.
  await expect(page.getByRole("dialog", { name: "README.TXT" })).toBeVisible();
});

test("an icon opens its window and Esc closes it", async ({ page }) => {
  await page.getByRole("button", { name: "Close README.TXT" }).click();
  await expect(page.getByRole("dialog", { name: "README.TXT" })).toHaveCount(0);

  await page.getByRole("button", { name: "Open CREW.DB" }).click();
  const crew = page.getByRole("dialog", { name: "CREW.DB" });
  await expect(crew).toBeVisible();
  await expect(crew).toBeFocused();
  await expect(crew.getByRole("row", { name: /Caitlin/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(crew).toHaveCount(0);
  // Focus goes back to the icon that opened it.
  await expect(
    page.getByRole("button", { name: "Open CREW.DB" }),
  ).toBeFocused();
});

test("the terminal runs commands and opens APPLY.EXE", async ({ page }) => {
  await page.getByRole("button", { name: "Close README.TXT" }).click();
  await page.getByRole("button", { name: "Open TERMINAL" }).click();
  const prompt = page.getByLabel("burner@404:~$");
  await expect(prompt).toBeFocused();

  await prompt.fill("whoami");
  await prompt.press("Enter");
  await expect(page.getByRole("log")).toContainText("You are lost");

  await prompt.fill("apply");
  await prompt.press("Enter");
  await expect(page.getByRole("dialog", { name: "APPLY.EXE" })).toBeVisible();
});

test("APPLY links to the Google Form", async ({ page }) => {
  await page.getByRole("button", { name: "Open APPLY.EXE" }).click();
  const apply = page
    .getByRole("dialog", { name: "APPLY.EXE" })
    .getByRole("link", { name: /apply/i });
  await expect(apply).toHaveAttribute("href", APPLY_URL);
  await expect(apply).toHaveAttribute("target", "_blank");
});

test("the fee scale moves between tiers", async ({ page }) => {
  await page.getByRole("button", { name: "Close README.TXT" }).click();
  await page.getByRole("button", { name: "Open FEE.CALC" }).click();
  const fee = page.getByRole("dialog", { name: "FEE.CALC" });
  const slider = fee.getByRole("slider", {
    name: "What I could pay, in rands",
  });
  await expect(slider).toHaveAttribute("aria-valuetext", /Ideal/);
  await fee.getByRole("button", { name: /^Perfect World/ }).click();
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /\$800, Perfect World/,
  );
  await slider.fill("0");
  await expect(slider).toHaveAttribute("aria-valuetext", /Subsidy/);
});
