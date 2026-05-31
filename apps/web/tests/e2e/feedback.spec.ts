import { test, expect } from "@playwright/test";
import { login, resetTestState } from "./_helpers";

// Shake-to-report files a GitHub issue. Real shake (devicemotion) can't be
// dispatched in CI, so the always-present report button is the deterministic
// trigger. Under E2E_TEST_MODE the action skips the real GitHub call and
// returns success, so this exercises the full UI path without hitting GitHub.

test.describe("shake-to-report feedback", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a signed-in member can file a bug via the report button", async ({
    page,
  }) => {
    // god email bypasses the invite/approval gates so we land in the app shell.
    await login(page, { id: "fb-user", email: "god@example.com" });
    await page.goto("/");

    // The report button is mounted globally in the root layout.
    await page
      .getByRole("button", { name: /report a bug or request a feature/i })
      .click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await page
      .getByLabel(/what went wrong/i)
      .fill("Publish button does nothing");
    await page.getByRole("button", { name: "Send report" }).click();

    await expect(page.getByText("Report filed")).toBeVisible();
  });
});
