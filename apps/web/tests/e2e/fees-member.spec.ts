import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedParticipation,
  setCollectingFees,
  setRank,
} from "./_helpers";

// The member's side of the camp fees sprint (test-mode, on the store's
// twins; mock-up steps 3 to 5). A member who says Coming is asked "What can
// you commit?" under their answer on My forms (the questionnaire's own
// completion page asks the same, but the store models no builder, so that
// path is covered by unit tests); My dues and the profile read the pledge
// back; and while the year is collecting fees the pay guide talks about the
// next payment, from the tray on a desktop and above the bottom bar on a
// phone, until "Remind me tomorrow". Amounts are made up.
//
// Intl writes no-break spaces ("R 9 000,00"), so money is matched with \s.

async function approvedMember(
  page: Page,
  request: APIRequestContext,
  id: string,
) {
  await login(page, { id, email: `${id}@example.com`, displayName: "Nova" });
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(request, id);
  const approved = await request.post("/api/test/set-approval", {
    data: { authUserId: id, status: "approved" },
  });
  expect(approved.ok()).toBeTruthy();
}

/** A captain through the god email, who may flip Collecting fees. */
async function captain(page: Page, request: APIRequestContext, id: string) {
  await login(page, { id, email: "god@example.com", displayName: "Cap" });
  await page.goto("/");
  await completeOnboarding(request, id);
  await setRank(request, id, "captain");
}

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 768;
}

test.describe("camp fees: the member's side", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("a member who says Coming pledges under their answer, and My dues and the profile read it back", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "fee-member");
    await seedParticipation(request, "fee-member", "applied");

    await page.goto("/tools/forms/attendance");
    await expect(
      page.getByRole("heading", { level: 1, name: "Coming this year?" }),
    ).toBeVisible();
    const step = page.getByRole("region", { name: "Your pledge" });
    await expect(step.getByText("What can you commit?")).toBeVisible();
    // It starts on the Recommended mark, about US$450.
    await expect(step.getByText("Recommended", { exact: true })).toBeVisible();
    // Any amount, typed; more than Perfect World would be fine too.
    await step.getByLabel("Or type it (R)").fill("9000");
    await expect(step.getByTestId("pledge-amount")).toHaveText(
      /^R\s9\s000,00$/,
    );
    await step
      .getByRole("radio", { name: /^Part by the end of November/ })
      .click();
    await step.getByRole("button", { name: "Send" }).click();
    await expect(
      page.getByText(
        "Sent. Nothing is charged until the captains give you a place.",
      ),
    ).toBeVisible();

    await page.goto("/dues");
    await expect(
      page.getByRole("heading", { level: 1, name: "My dues" }),
    ).toBeVisible();
    await expect(page.getByTestId("my-pledge")).toContainText(
      /You pledged R\s9\s000,00 \(near Ideal\), part by the end of November and the rest later\./,
    );
    // Next payment: half by the end of November, not the whole pledge.
    await expect(page.getByTestId("next-payment")).toContainText(
      /R\s4\s500,00 by 30 Nov/,
    );
    await expect(
      page.getByRole("list", { name: "Payment plan" }).getByRole("listitem"),
    ).toHaveCount(2);

    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { level: 1, name: "Your profile" }),
    ).toBeVisible();
    await expect(page.getByTestId("profile-pledge")).toContainText(
      /You pledged R\s9\s000,00 \(near Ideal\)/,
    );
    await expect(
      page.getByRole("link", { name: "Change your pledge" }),
    ).toHaveAttribute("href", "/dues");
  });

  test("a member who says Maybe is not asked to pledge there", async ({
    page,
    request,
  }) => {
    await approvedMember(page, request, "maybe-fee");
    await seedParticipation(request, "maybe-fee", "maybe");
    await page.goto("/tools/forms/attendance");
    await expect(
      page.getByRole("heading", { level: 1, name: "Coming this year?" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Your pledge" })).toHaveCount(
      0,
    );
  });

  test("while fees are collected, the pay guide shows the next payment until Remind me tomorrow", async ({
    page,
    request,
  }) => {
    await captain(page, request, "fee-cap");
    await approvedMember(page, request, "guide-member");
    await seedParticipation(request, "guide-member", "accepted");

    // The member pledges on My dues: nothing shows before collecting starts.
    await page.goto("/dues");
    await expect(
      page.getByRole("heading", { level: 1, name: "My dues" }),
    ).toBeVisible();
    await page.getByLabel("Or type it (R)").fill("7200");
    await page
      .getByRole("radio", { name: "All of it by the end of November" })
      .click();
    await page.getByRole("button", { name: "Save my pledge" }).click();
    await expect(page.getByTestId("next-payment")).toBeVisible();
    await expect(page.locator("[data-pay-guide]")).toHaveCount(0);

    await setCollectingFees(request, "fee-cap", true);

    await page.goto("/");
    await expect(page.locator("#os-desktop")).toBeVisible();
    if (isPhone(page)) {
      const banner = page.locator("[data-pay-guide-banner]");
      await expect(banner).toContainText(/R\s7\s200,00 (is|was) due by 30 Nov/);
      await banner.getByRole("button", { name: "How to pay" }).click();
      const sheet = page.getByRole("region", {
        name: "How to pay your camp fee",
      });
      await expect(sheet).toContainText(/Your first payment of R\s7\s200,00/);
      await expect(
        sheet.getByRole("button", { name: /^Copy C404-M\d{3}$/ }),
      ).toBeVisible();
      await sheet.getByRole("button", { name: "Remind me tomorrow" }).click();
      await expect(banner).toHaveCount(0);
    } else {
      const card = page.locator("[data-pay-guide]");
      await expect(card).toContainText(/R\s7\s200,00 (is|was) due by 30 Nov/);
      await card.getByRole("button", { name: "Show me how to pay" }).click();
      await expect(card).toContainText(/Your first payment of R\s7\s200,00/);
      await expect(
        card.getByRole("button", { name: /^Copy C404-M\d{3}$/ }),
      ).toBeVisible();
      await card.getByRole("button", { name: "From abroad" }).click();
      await expect(card).toContainText("South Africa has no IBAN");
      await card.getByRole("button", { name: "Remind me tomorrow" }).click();
      await expect(card).toHaveCount(0);
    }

    // Hidden for the day, in this browser: a reload keeps it away.
    await page.reload();
    await expect(page.locator("#os-desktop")).toBeVisible();
    await expect(page.locator("[data-pay-guide]")).toHaveCount(0);
    await expect(page.locator("[data-pay-guide-banner]")).toHaveCount(0);

    // My dues' How to pay opens it again all the same.
    await page.goto("/dues");
    await expect(
      page.getByRole("heading", { level: 1, name: "My dues" }),
    ).toBeVisible();
    await page
      .getByTestId("next-payment")
      .getByRole("button", { name: "How to pay" })
      .click();
    const opened = isPhone(page)
      ? page.getByRole("region", { name: "How to pay your camp fee" })
      : page.locator("[data-pay-guide]");
    await expect(opened).toContainText(/Your first payment of R\s7\s200,00/);
  });
});
