import { test, expect } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";

// The member export under E2E_TEST_MODE: the download route walks the member
// ladder and hands a plain member only the member roster's columns. A god
// email clears the invite and approval gates, so setRank decides the rank.

test.describe("member export (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member downloads the roster columns and nothing private", async ({
    page,
    request,
  }) => {
    await login(page, { id: "export-member", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "export-member");
    await setRank(request, "export-member", "member");

    await page.goto("/captains/camp-management");
    await expect(page.getByRole("link", { name: /Export CSV/ })).toBeVisible();

    const res = await page.request.get("/captains/camp-management/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(
      /^attachment; filename="camp-404-members-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    const [header] = (await res.text()).replace(/^\uFEFF/, "").split("\r\n");
    // Approval is here on the owner's 2026-09-22 ruling \u2014 the file says what
    // the roster says. Email, ID, dues and the join date stay captain-only.
    expect(header).toBe("Name,Handle,Rank,Teams,Country,Approval");
  });
});
