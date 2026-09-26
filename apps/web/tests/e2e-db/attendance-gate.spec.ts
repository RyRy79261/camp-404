import { test, expect } from "@playwright/test";
import { resetTestState } from "../e2e/_helpers";
import { startButton, taskbar } from "../e2e/lib/console-nav";
import { signInCaptain } from "./_flows";

// Owner's report, 2026-09-25: with the blocking attendance check sent, the
// app loaded only that questionnaire; after answering it the app did not
// take them back automatically, and once back, the layouts were broken.

test("answering the blocking attendance check hands the member back to the app", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const captain = await signInCaptain(browser, request);

  await captain.goto("/captains/questionnaires");
  await captain
    .getByRole("button", { name: "Create this year's attendance check" })
    .click();
  await expect(captain).toHaveURL(/\/captains\/questionnaires\/.+\/send$/, {
    timeout: 60_000,
  });
  await expect(
    captain.getByRole("radio", { name: /^Everyone/, checked: true }),
  ).toBeVisible();
  await captain.getByRole("switch", { name: "Blocking" }).click();
  // Exact: the Send window's own title-bar buttons ("Close Send
  // questionnaire") and taskbar button carry the same words.
  await captain
    .getByRole("button", { name: "Send questionnaire", exact: true })
    .click();
  await captain.getByRole("button", { name: "Send to everyone" }).click();

  // The blocking send gates the captain too: the runner, alone.
  await expect(captain).toHaveURL(/\/questionnaires\/[0-9a-f-]{36}$/, {
    timeout: 60_000,
  });

  // Held: the form sits in the blocking layer on top, and the desktop behind
  // it (header and an empty taskbar still drawn, dimmed) is inert, with no
  // Start button to reach (owner, 2026-09-25).
  const layer = captain.locator("[data-os-blocking]");
  const desktop = captain.locator("#os-desktop");
  await expect(layer).toBeVisible();
  await expect(desktop).toHaveAttribute("inert", "");
  await expect(taskbar(captain)).toHaveCount(0);

  await captain.getByRole("radio", { name: /^Yes/ }).click();
  await captain.getByRole("button", { name: "Submit" }).click();
  // Submitting never flashes "couldn't save" on its way to the completion
  // screen (the redirect used to be caught as a failed save).
  let flashed = false;
  for (let i = 0; i < 30; i++) {
    if ((await captain.getByText(/couldn't save your answers/).count()) > 0) {
      flashed = true;
    }
    await captain.waitForTimeout(100);
  }
  expect(flashed).toBe(false);

  // Answered: the completion screen already sits on the live desktop, the
  // blocking layer gone and the taskbar back, with no reload (the layout used
  // to stay in its held state).
  await expect(
    captain.getByRole("heading", { level: 1, name: "Questionnaire complete" }),
  ).toBeVisible();
  await expect(layer).toHaveCount(0);
  await expect(desktop).not.toHaveAttribute("inert", "");
  await expect(startButton(captain)).toBeVisible();
  await expect(captain.getByText(/couldn't save your answers/)).toHaveCount(0);

  await captain.getByRole("link", { name: "Back to camp" }).click();
  await expect(captain).toHaveURL(/\/$/);
  await expect(captain.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(layer).toHaveCount(0);
  await expect(desktop).not.toHaveAttribute("inert", "");
  await expect(startButton(captain)).toBeVisible();
});
