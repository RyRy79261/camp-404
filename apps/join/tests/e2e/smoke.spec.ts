import { expect, test, type Page } from "@playwright/test";
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
});

const README_HINT = "Open README.TXT, start here";

// In the taskbar: README's "start here" would match a bare name "Start" too.
const startButton = (page: Page) =>
  page
    .getByRole("toolbar", { name: "Taskbar" })
    .getByRole("button", { name: "Start" });

test("README.TXT waits, glowing, until it is opened once on this device", async ({
  page,
}) => {
  // Nothing opens by itself; the README icon says "start here" instead.
  const hinted = page.getByRole("button", { name: README_HINT });
  await expect(hinted).toBeVisible();
  await expect(hinted).toHaveAttribute("data-hint", "");
  await expect(page.getByRole("region", { name: "README.TXT" })).toHaveCount(0);

  await hinted.click();
  await expect(page.getByRole("region", { name: "README.TXT" })).toBeVisible();
  const plain = page.getByRole("button", {
    name: "Open README.TXT",
    exact: true,
  });
  await expect(plain).not.toHaveAttribute("data-hint");

  // A returning visitor (and a reboot) gets a quiet desktop.
  await page.reload();
  await expect(
    page.getByRole("status", { name: "Starting Camp 404 OS" }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(plain).toBeVisible();
  await expect(page.getByRole("button", { name: README_HINT })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "README.TXT" })).toHaveCount(0);
});

test("opening README from the Start menu also stops the glow", async ({
  page,
}) => {
  await startButton(page).click();
  await page
    .getByRole("menu", { name: "Start" })
    .getByRole("menuitem", { name: "README.TXT" })
    .click();
  await expect(page.getByRole("region", { name: "README.TXT" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open README.TXT", exact: true }),
  ).toBeAttached();
  await expect(page.getByRole("button", { name: README_HINT })).toHaveCount(0);
});

test("an icon opens its window and Esc closes it", async ({ page }) => {
  await expect(page.getByRole("region", { name: "README.TXT" })).toHaveCount(0);

  // Named as its section of About Camp 404, with the section's words.
  await page
    .getByRole("button", { name: "Open The Crew", exact: true })
    .click();
  const crew = page.getByRole("region", { name: "The Crew", exact: true });
  await expect(crew).toBeVisible();
  await expect(crew).toBeFocused();
  await expect(
    crew.getByText(
      "The 404 crew is a total 50 people with space for 10 orphans",
    ),
  ).toBeVisible();
  await expect(crew.getByRole("row", { name: /Ryan/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(crew).toHaveCount(0);
  // Focus goes back to the icon that opened it.
  await expect(
    page.getByRole("button", { name: "Open The Crew", exact: true }),
  ).toBeFocused();
});

test("the terminal runs commands and opens APPLY.EXE", async ({ page }) => {
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
  await page.getByRole("button", { name: "Open FEE.CALC" }).click();
  const fee = page.getByRole("region", { name: "FEE.CALC" });
  const slider = fee.getByRole("slider", {
    name: "What I could pay, in rands",
  });
  await expect(slider).toHaveAttribute("aria-valuetext", /Ideal/);
  await fee.getByRole("button", { name: /^Perfect World/ }).click();
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    /US\$1\s000, Perfect World/,
  );
  await slider.fill("0");
  await expect(slider).toHaveAttribute("aria-valuetext", /Subsidy/);
});

test("a window minimises to the taskbar, comes back, goes full screen and resizes", async ({
  page,
}, testInfo) => {
  await page.getByRole("button", { name: README_HINT }).click();
  const readme = page.getByRole("region", { name: "README.TXT" });
  await expect(readme).toBeVisible();

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
  await startButton(page).click();
  const menu = page.getByRole("menu", { name: "Start" });
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await menu.getByRole("menuitem", { name: "Where is 404?" }).click();
  await expect(menu).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Where is 404?" }),
  ).toBeVisible();

  await startButton(page).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Start" })).toHaveCount(0);
  // Esc shut the menu, not the window under it.
  await expect(
    page.getByRole("region", { name: "Where is 404?" }),
  ).toBeVisible();
});

test("About Camp 404 shows every section on one page, with its contents", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open About Camp 404" }).click();
  // The page's hidden summary for search engines is also "About Camp 404".
  const about = page.locator('[data-window="about"]');
  await expect(about).toBeVisible();
  const contents = about.getByRole("navigation", { name: "List of contents" });
  await expect(contents.getByRole("button")).toHaveCount(7);
  // The Notion page's highlights read as highlights, never as their signs.
  await expect(
    about.locator("mark", {
      hasText: "Camp members are encouraged to arrive no later than",
    }),
  ).toHaveCount(1);
  await expect(about.getByText("==")).toHaveCount(0);

  await contents.getByRole("button", { name: /The Crew/ }).click();
  const crew = about.getByRole("region", { name: "The Crew", exact: true });
  await expect(crew).toBeInViewport();
  // The jump moves focus to the section, so the next Tab goes on from it:
  // to the first link after it, in Responsibilities.
  await expect(crew).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    about.getByRole("link", { name: "teams that create 404" }),
  ).toBeFocused();

  // A link inside the words jumps the same way.
  await about.getByRole("link", { name: "HERE", exact: true }).click();
  const put = about.getByRole("region", {
    name: "Responsibilities - What You Put In",
  });
  await expect(put).toBeFocused();
  await expect(put).toBeInViewport();
});

test("the terminal hides a game behind jinn-is-best", async ({ page }) => {
  // Not on the desktop, not in the Start menu.
  await expect(page.getByRole("button", { name: /INKBLOT/ })).toHaveCount(0);
  await startButton(page).click();
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
