import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedTeam,
  setRank,
} from "./_helpers";

// #313 (owner approved 2026-10-02): a captain announces to specific people,
// one or several, and only they get it. A team lead is never offered the
// captain-only audiences. Against the in-memory test store.

const INVITE = "TEST-INVITE-E2E-ONLY-CODE";

/** A member with a row in the store, past onboarding. */
async function member(
  page: Page,
  request: APIRequestContext,
  id: string,
  displayName: string,
): Promise<void> {
  await login(page, { id, email: `${id}@example.com`, displayName });
  await redeemInviteAtGate(page, INVITE);
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
}

async function signInCaptain(page: Page, request: APIRequestContext) {
  await login(page, {
    id: "captain-auth",
    email: "god@example.com",
    displayName: "Captain Jo",
  });
  await page.goto("/");
  await completeOnboarding(request, "captain-auth");
  await setRank(request, "captain-auth", "captain");
}

test.describe("announcements to chosen people (#313)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a captain publishes to two chosen members and only they get it", async ({
    page,
    request,
  }) => {
    await member(page, request, "jess-auth", "Jess Naidoo");
    await member(page, request, "sipho-auth", "Sipho Ndlovu");
    await member(page, request, "rae-auth", "Rae Adams");
    await signInCaptain(page, request);

    await page.goto("/captains/announcements");
    await expect(
      page.getByRole("heading", { name: "Announcements & notifications" }),
    ).toBeVisible();
    await page.getByLabel("Title").fill("Your shade cloth is at the depot");
    await page
      .getByLabel("Message")
      .fill("Collect it from the Woodstock depot before Friday.");

    await page.getByLabel("Who it's for").click();
    await page.getByRole("option", { name: "Specific people…" }).click();
    const search = page.getByRole("searchbox", { name: "People" });
    await search.fill("jes");
    await page
      .getByRole("list", { name: "Matching people" })
      .getByRole("button", { name: /Jess Naidoo/ })
      .click();
    await expect(page.getByText("Goes to Jess Naidoo only.")).toBeVisible();
    await search.fill("ndl");
    await search.press("Enter");
    await expect(
      page.getByText("Goes to Jess Naidoo and Sipho Ndlovu."),
    ).toBeVisible();

    await page.getByLabel("How it lands").click();
    await page.getByRole("option", { name: /Quiet/ }).click();
    await page.getByRole("button", { name: "Save draft" }).click();

    const card = page
      .getByRole("listitem")
      .filter({ hasText: "Your shade cloth is at the depot" });
    await expect(card.getByText(/for Jess Naidoo and Sipho Ndlovu/)).toBeVisible();
    await card.getByRole("button", { name: "Publish to 2 people" }).click();
    const confirm = page.getByRole("dialog");
    await expect(
      confirm.getByText(/It goes to Jess Naidoo and Sipho Ndlovu now/),
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Publish to 2 members" }).click();
    await expect(page.getByText(/Published to 2 members/)).toBeVisible();

    // Each chosen member has it, and is told who else it went to.
    for (const id of ["jess-auth", "sipho-auth"]) {
      await login(page, { id, email: `${id}@example.com` });
      await page.goto("/notifications");
      await expect(
        page.getByRole("heading", { level: 1, name: "Notifications" }),
      ).toBeVisible();
      const row = page
        .getByRole("listitem")
        .filter({ hasText: "Your shade cloth is at the depot" });
      await expect(row).toBeVisible();
      await expect(row.getByText(/to you and 1 other/)).toBeVisible();
    }

    // The member nobody picked does not.
    await login(page, { id: "rae-auth", email: "rae-auth@example.com" });
    await page.goto("/notifications");
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeVisible();
    await expect(page.getByText("Your shade cloth is at the depot")).toHaveCount(
      0,
    );
  });

  test("a team lead is offered only their own team", async ({
    page,
    request,
  }) => {
    await member(page, request, "lead-auth", "Kai Lead");
    await seedTeam(request, "lead-auth", "kitchen", true);
    await page.goto("/captains/announcements");
    await expect(
      page.getByRole("heading", { name: "Announcements & notifications" }),
    ).toBeVisible();
    await expect(page.getByLabel("Who it's for")).toBeDisabled();
    await expect(page.getByLabel("Who it's for")).toHaveText(/Kitchen/);
    await expect(page.getByText("Drivers this year")).toHaveCount(0);
    await expect(page.getByText("Specific people…")).toHaveCount(0);
  });
});
