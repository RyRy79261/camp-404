import { expect, test } from "@playwright/test";
import { SIGNUP_URL } from "../../lib/content";

// The four promises of the brief: the boot skips, an icon opens its window,
// Esc closes it, and APPLY links to sign-up.

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("status", { name: "Starting Camp 404 OS" }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("status")).toHaveCount(0);
  // README.TXT opens once the boot ends.
  await expect(page.getByRole("region", { name: "README.TXT" })).toBeVisible();
});

test("an icon opens its window and Esc closes it", async ({ page }) => {
  await page.getByRole("button", { name: "Close README.TXT" }).click();
  await expect(page.getByRole("region", { name: "README.TXT" })).toHaveCount(0);

  await page.getByRole("button", { name: "Open CREW.DB" }).click();
  const crew = page.getByRole("region", { name: "CREW.DB" });
  await expect(crew).toBeVisible();
  await expect(crew).toBeFocused();
  await expect(crew.getByRole("row", { name: /Ryan/ })).toBeVisible();

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
  await expect(page.getByRole("region", { name: "APPLY.EXE" })).toBeVisible();
});

test("APPLY links to sign-up and asks for an invite code", async ({ page }) => {
  await page.getByRole("button", { name: "Close README.TXT" }).click();
  await page.getByRole("button", { name: "Open APPLY.EXE" }).click();
  const apply = page
    .getByRole("region", { name: "APPLY.EXE" })
    .getByRole("link", { name: /sign up/i });
  await expect(apply).toHaveAttribute("href", SIGNUP_URL);
  await expect(page.getByRole("region", { name: "APPLY.EXE" })).toContainText(
    "invite code",
  );
});

test("the fee scale moves between tiers", async ({ page }) => {
  await page.getByRole("button", { name: "Close README.TXT" }).click();
  await page.getByRole("button", { name: "Open FEE.CALC" }).click();
  const fee = page.getByRole("region", { name: "FEE.CALC" });
  const slider = fee.getByRole("slider", {
    name: "What I could pay, in rands",
  });
  await expect(slider).toHaveAttribute("aria-valuetext", /Ideal/);
  await fee.getByRole("button", { name: /^Perfect World/ }).click();
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /\$1,000, Perfect World/,
  );
  await slider.fill("0");
  await expect(slider).toHaveAttribute("aria-valuetext", /Subsidy/);
});

test("a window minimises to the taskbar, comes back, goes full screen and resizes", async ({
  page,
}, testInfo) => {
  const readme = page.getByRole("region", { name: "README.TXT" });

  await page.getByRole("button", { name: "Minimise README.TXT" }).click();
  await expect(readme).toBeHidden();
  // Its taskbar button brings it back, and minimises it again when on top.
  const task = page
    .getByRole("toolbar", { name: "Taskbar" })
    .getByRole("button", { name: "README.TXT", exact: true });
  await task.click();
  await expect(readme).toBeVisible();
  await expect(task).toHaveAttribute("aria-pressed", "true");
  await task.click();
  await expect(readme).toBeHidden();
  await task.click();
  await expect(readme).toBeVisible();

  // A phone window is already full screen and has no grips.
  test.skip(testInfo.project.name === "phone", "desktop only");

  const before = (await readme.boundingBox())!;
  const grip = readme.locator('[data-grip="e"]');
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2 - 120, g.y + g.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  const after = (await readme.boundingBox())!;
  expect(Math.round(before.width - after.width)).toBe(120);
  expect(Math.round(after.x)).toBe(Math.round(before.x));

  await page.getByRole("button", { name: "Full screen README.TXT" }).click();
  const full = (await readme.boundingBox())!;
  expect(full.width).toBeGreaterThan(before.width);
  await page.getByRole("button", { name: "Restore README.TXT" }).click();
  expect(Math.round((await readme.boundingBox())!.width)).toBe(
    Math.round(after.width),
  );
});

test("the Start menu opens any program", async ({ page }) => {
  await page.getByRole("button", { name: "Start" }).click();
  const menu = page.getByRole("menu", { name: "Start" });
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await menu.getByRole("menuitem", { name: "MAP.GPS" }).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole("region", { name: "MAP.GPS" })).toBeVisible();

  await page.getByRole("button", { name: "Start" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Start" })).toHaveCount(0);
  // Esc shut the menu, not the window under it.
  await expect(page.getByRole("region", { name: "MAP.GPS" })).toBeVisible();
});

test("the terminal hides a game behind jinn-is-best", async ({ page }) => {
  await page.getByRole("button", { name: "Close README.TXT" }).click();
  // Not on the desktop, not in the Start menu.
  await expect(page.getByRole("button", { name: /INKBLOT/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Start" }).click();
  const menu = page.getByRole("menu", { name: "Start" });
  await expect(menu.getByRole("menuitem", { name: "TERMINAL" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /INKBLOT/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  await page.getByRole("button", { name: "Open TERMINAL" }).click();
  const prompt = page.getByLabel("burner@404:~$");
  await prompt.fill("jinn-is-best");
  await prompt.press("Enter");
  const game = page.getByRole("region", { name: "INKBLOT.EXE" });
  await expect(game).toBeVisible();
  await expect(game.getByRole("application")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(game).toHaveCount(0);
});

test("clearing INKBLOT.EXE says GOODEST BOI and keeps a speed-of-chaos board", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Close README.TXT" }).click();
  await page.getByRole("button", { name: "Open TERMINAL" }).click();
  const prompt = page.getByLabel("burner@404:~$");
  await prompt.fill("jinn-is-best");
  await prompt.press("Enter");
  const game = page.getByRole("region", { name: "INKBLOT.EXE" });
  await game.getByRole("application").press("Enter");

  // Development builds expose the game so a test can finish it at once.
  await page.evaluate(() => {
    const g = (
      window as unknown as {
        __inkblot: () => {
          seconds: number;
          items: { state: string; surface: unknown; vy: number }[];
        };
      }
    ).__inkblot();
    g.seconds = 42.3;
    for (const it of g.items) {
      it.state = "falling";
      it.surface = null;
      it.vy = 400;
    }
  });

  const win = page.getByRole("dialog", { name: "GOODEST BOI" });
  await expect(win).toBeVisible();
  await expect(win).toContainText("0:42.");
  const initials = win.getByLabel(/enter your initials/i);
  await expect(initials).toBeFocused();
  await initials.pressSequentially("jin!");
  await expect(initials).toHaveValue("JIN");
  await initials.press("Enter");
  await expect(win.getByRole("listitem").first()).toContainText("JIN");

  // Stored in this browser for next time.
  const stored = await page.evaluate(() =>
    window.localStorage.getItem("inkblot.leaderboard.v1"),
  );
  expect(stored).toContain('"JIN"');

  await win.getByRole("button", { name: /knock it all over again/i }).click();
  await expect(win).toHaveCount(0);
});
