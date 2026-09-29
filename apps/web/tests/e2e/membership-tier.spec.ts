import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  completeOnboarding,
  login,
  resetTestState,
  seedTeam,
  setRank,
} from "./_helpers";

// "Staying for" (#129): how long a member stays, the whole event or build week
// only. A captain reads and sets it in the member panel; nobody else sees it
// (captain-only in MEMBER_FIELD_READERS), so a team lead and a plain member
// opening the same person get the public profile without it. Runs on the test
// store's twin of setMembershipTier.

/**
 * A camp user through the god email (clears access and approval), onboarded
 * and at `rank`. The last one signed in is the one the page sees.
 */
async function person(
  page: Page,
  request: APIRequestContext,
  id: string,
  displayName: string,
  rank: "captain" | "member" = "member",
) {
  await login(page, { id, email: "god@example.com", displayName });
  await page.goto("/"); // lazily creates the camp user row
  await completeOnboarding(request, id);
  await setRank(request, id, rank);
}

async function openProfile(page: Page, name: string) {
  await page.goto("/captains/camp-management");
  await expect(
    page.getByRole("heading", { level: 1, name: "Camp management" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Open ${name}'s profile` })
    .filter({ visible: true })
    .click();
  const panel = page.getByRole("region", { name: `${name} profile` });
  await expect(panel).toBeVisible();
  return panel;
}

/** The "Staying for" value in the panel's overview. */
function stayingFor(page: Page) {
  return page
    .locator("dt", { hasText: /^Staying for$/ })
    .locator("xpath=following-sibling::dd[1]");
}

test.describe("membership tier: staying for", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetTestState(request);
    await person(page, request, "tier-member", "Ada Stay");
  });

  test("a captain sets it in one tap, and it holds after a reload", async ({
    page,
    request,
  }) => {
    await person(page, request, "tier-captain", "Cy Captain", "captain");
    const panel = await openProfile(page, "Ada Stay");
    await expect(stayingFor(page)).toHaveText("Not set");

    const control = panel.getByRole("radiogroup", { name: "Staying for" });
    await control.getByRole("radio", { name: "Build week only" }).click();
    await expect(
      control.getByRole("radio", { name: "Build week only" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(stayingFor(page)).toHaveText("Build week only");

    // Stored, not only drawn: a fresh page reads it back.
    await openProfile(page, "Ada Stay");
    await expect(stayingFor(page)).toHaveText("Build week only");
    await expect(
      page
        .getByRole("radiogroup", { name: "Staying for" })
        .getByRole("radio", { name: "Build week only" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("a team lead opening the same member sees no stay and no control", async ({
    page,
    request,
  }) => {
    await person(page, request, "tier-lead", "Lu Lead");
    await seedTeam(request, "tier-lead", "kitchen", true);
    const panel = await openProfile(page, "Ada Stay");

    // Present first, so the absences are about a painted profile.
    await expect(panel.getByText("About", { exact: true })).toBeVisible();
    await expect(page.getByText("Staying for", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("radiogroup", { name: "Staying for" }),
    ).toHaveCount(0);
  });

  test("a plain member opening the same member sees no stay and no control", async ({
    page,
    request,
  }) => {
    await person(page, request, "tier-plain", "Mo Member");
    const panel = await openProfile(page, "Ada Stay");

    await expect(panel.getByText("About", { exact: true })).toBeVisible();
    await expect(page.getByText("Staying for", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("radiogroup", { name: "Staying for" }),
    ).toHaveCount(0);
  });
});
