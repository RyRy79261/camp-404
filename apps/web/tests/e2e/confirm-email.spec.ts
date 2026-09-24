import { test, expect, type Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "./_helpers";

// Members moved from Neon Auth with a password arrive with an unconfirmed
// email, and until they confirm it camp emails skip them and Google refuses to
// join their account. The Email card is how they fix that: on the invite gate
// (the one screen a locked-out account can always reach) and on Sign-in and
// security. A confirmed member never sees it.
//
// The store run has no email provider, so the card says why it cannot send
// instead of offering a button; the send itself is driven for real in
// tests/e2e-db/sign-in.spec.ts.

const emailCard = (page: Page) =>
  page.getByRole("heading", { name: "Email", exact: true });

async function onboardMember(page: Page, id: string, emailVerified: boolean) {
  await login(page, { id, email: `${id}@example.com`, emailVerified });
  await page.goto("/");
  await expect(page).toHaveURL(/\/signup\/required/);
  // The invite gate offers the card to an unconfirmed account only.
  await expect(
    page.getByRole("heading", { name: "One more thing" }),
  ).toBeVisible();
  await expect(emailCard(page)).toHaveCount(emailVerified ? 0 : 1);

  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(page.request, id);
}

async function openSecurity(page: Page) {
  await page.goto("/profile/security");
  await expect(
    page.getByRole("heading", { level: 1, name: "Sign-in and security" }),
  ).toBeVisible();
}

test.describe("confirm your email", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("an unconfirmed member sees the Email card on Sign-in and security", async ({
    page,
  }) => {
    await onboardMember(page, "unconfirmed-member", false);
    await openSecurity(page);

    await expect(emailCard(page)).toBeVisible();
    await expect(
      page.getByText(
        "This camp has not set up email yet, so your address can't be confirmed. Ask a captain.",
      ),
    ).toBeVisible();
  });

  test("a confirmed member does not", async ({ page }) => {
    await onboardMember(page, "confirmed-member", true);
    await openSecurity(page);

    // The page has rendered (the heading above, and the Password card), so the
    // absence below is real.
    await expect(
      page.getByRole("heading", { name: "Password", exact: true }),
    ).toBeVisible();
    await expect(emailCard(page)).toHaveCount(0);
  });
});
