import { test, expect } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";

// The questionnaire Send/Activate screen is captain-only. A non-captain is
// stopped at the clearance gate BEFORE any database read (the page derives rank
// without the isTeamLead DB call and returns the CaptainLock), so this is
// observable under E2E_TEST_MODE even though the builder's data layer is not
// test-store-backed. A god email clears the access + approval gates so setRank
// toggles only the clearance gate under test.
test.describe("questionnaire Send screen — captain gate (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a non-captain sees the locked shell and no Send form", async ({
    page,
    request,
  }) => {
    await login(page, { id: "send-member", email: "god@example.com" });
    await page.goto("/"); // lazily creates the camp user row
    await completeOnboarding(request, "send-member");
    await setRank(request, "send-member", "member");

    await page.goto("/captains/questionnaires/any-key/send");

    // No redirect home — preview-but-locked chrome on the same URL.
    await expect(page).toHaveURL("/captains/questionnaires/any-key/send");
    await expect(
      page.getByRole("heading", { name: "Send to members" }),
    ).toBeVisible();
    await expect(
      page.getByText(/only captains can send questionnaires/i),
    ).toBeVisible();
    // The Send form is withheld: no audience picker, no Send button.
    await expect(page.getByText(/who should answer/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Send$/ })).toHaveCount(0);
  });
});
