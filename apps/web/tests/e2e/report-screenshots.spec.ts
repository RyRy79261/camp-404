import { test, expect, type Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  setRank,
} from "./_helpers";

// #313 (owner approved 2026-10-02): a member attaches a screenshot to a bug
// report; it stays private in Camp 404 (never on GitHub); a captain sees it on
// Report screenshots and deletes it. A member is refused the page. Against
// the in-memory test store (it keeps the picture's bytes in place of the
// private blob).

/** Open the report dialog the way the Start menu's "Report a problem" does. */
async function openReport(page: Page) {
  const heading = page
    .getByRole("dialog")
    .getByRole("heading", { name: "Report a bug" });
  // The dialog listens once the page has hydrated; ask again until it does.
  await expect(async () => {
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("camp404:report-problem")),
    );
    await expect(heading).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe("bug report screenshots (#313)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("attach a screenshot, a captain sees it, then deletes it", async ({
    page,
    request,
  }) => {
    await login(page, {
      id: "jess-auth",
      email: "jess@example.com",
      displayName: "Jess Naidoo",
    });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "jess-auth");
    await page.goto("/");

    // A real picture: the page as the member sees it.
    const picture = await page.screenshot();

    await openReport(page);
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel(/what went wrong/i)
      .fill("Waiting list button won't save\nIt said it couldn't save.");
    await dialog.getByLabel("Screenshot file").setInputFiles({
      name: "Screenshot 2026-10-02 at 10.14.png",
      mimeType: "image/png",
      buffer: picture,
    });
    await expect(dialog.getByRole("img", { name: "Your screenshot" })).toBeVisible();
    await expect(dialog.getByText(/Kept private\./)).toBeVisible();
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(dialog.getByText("Report filed")).toBeVisible();
    await expect(
      dialog.getByText(/Your screenshot is not on GitHub\./),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // A member cannot open the captains' page.
    await page.goto("/captains/report-screenshots");
    await expect(
      page.getByRole("heading", { level: 1, name: "Report screenshots" }),
    ).toBeVisible();
    await expect(page.getByText(/captain-only/)).toBeVisible();
    // Nor the picture, whoever holds its address.
    const shots = await page.request.get("/api/report-screenshot/x");
    expect(shots.status()).toBe(403);

    // A captain sees it, opens it, and deletes it.
    await login(page, {
      id: "captain-auth",
      email: "god@example.com",
      displayName: "Captain Jo",
    });
    await page.goto("/");
    await completeOnboarding(request, "captain-auth");
    await setRank(request, "captain-auth", "captain");
    await page.goto("/captains/report-screenshots");
    const row = page.getByRole("listitem", {
      name: "Waiting list button won't save",
    });
    await expect(row).toBeVisible();
    await expect(row.getByText(/Jess Naidoo/).filter({ visible: true })).toBeVisible();
    await row.getByRole("button", { name: "Open" }).click();
    const full = row.getByRole("img", { name: /full size/ });
    await expect(full).toBeVisible();
    await expect
      .poll(() => full.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(row.getByText(/It said it couldn't save/)).toBeVisible();

    await row.getByRole("button", { name: "Delete screenshot" }).click();
    const confirm = row.getByRole("group", { name: "Delete this screenshot?" });
    await expect(confirm.getByText(/The GitHub issue stays/)).toBeVisible();
    await confirm.getByRole("button", { name: "Delete screenshot" }).click();
    await expect(page.getByText("No screenshots.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("No screenshots.")).toBeVisible();
  });
});
