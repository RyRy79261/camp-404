import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { PASSWORD_MIN_LENGTH } from "@camp404/core";
import { resetTestState } from "../e2e/_helpers";
import { waitForAuthMail } from "./_mail";

// The real login, end to end. Every other spec signs in through the test
// cookie (/api/test/login), which lib/auth.ts reads before Better Auth, so a
// broken sign-in could never fail CI. This context never calls the test login,
// so every step below goes through Better Auth against the real database:
// sign-up, sign-out, a wrong password, a right one, and a password reset whose
// link is read from the e2e mail capture file (nothing is ever sent).

// A new account has no invite yet, so a signed-in visit lands on the gate.
const INVITE_GATE = /\/signup\/required$/;

async function sessionCookies(context: BrowserContext) {
  return (await context.cookies()).filter(
    (c) => c.name.startsWith("camp404") && c.name.includes("session"),
  );
}

async function expectInviteGate(page: Page) {
  await expect(page).toHaveURL(INVITE_GATE);
  await expect(
    page.getByRole("heading", { name: "One more thing" }),
  ).toBeVisible();
}

/** The enumeration-safe refusal: it never says which half was wrong. The
 * filter skips Next's own (empty) route announcer, which is also an alert. */
async function expectRefused(page: Page) {
  await expect(
    page.getByRole("alert").filter({ hasText: /invalid email or password/i }),
  ).toBeVisible();
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/auth/sign-in");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function signOut(page: Page, context: BrowserContext) {
  await page.goto("/auth/sign-out");
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  expect(await sessionCookies(context)).toEqual([]);
}

test.beforeEach(async ({ request }) => {
  await resetTestState(request);
});

test("sign up, sign out, a wrong password, sign in, and reset the password", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = `member-${Date.now()}@example.com`;
  const password = "first-password-".padEnd(PASSWORD_MIN_LENGTH + 2, "x");
  const newPassword = "second-password-".padEnd(PASSWORD_MIN_LENGTH + 2, "y");

  // Sign up: Better Auth signs the new account in and home forwards it to the
  // invite gate, and a confirm-your-email link goes out.
  const signedUpAt = new Date();
  await page.goto("/auth/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expectInviteGate(page);
  expect((await sessionCookies(context)).length).toBeGreaterThan(0);
  expect(await waitForAuthMail(email, "verify", signedUpAt)).toContain(
    "/api/auth/verify-email?token=",
  );

  await signOut(page, context);

  // A wrong password is refused, with the enumeration-safe sentence.
  await signIn(page, email, "not-the-password-at-all");
  await expectRefused(page);
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  expect(await sessionCookies(context)).toEqual([]);

  // The right one gets in.
  await signIn(page, email, password);
  await expectInviteGate(page);

  // Forgot password: the link arrives in the capture file, not an inbox.
  await signOut(page, context);
  const since = new Date();
  await page.goto("/auth/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("heading", { name: "Reset link sent" }),
  ).toBeVisible();

  // Better Auth's /api/auth/reset-password/<token> checks the token and
  // redirects to our form with it.
  const link = await waitForAuthMail(email, "reset", since);
  await page.goto(link);
  await expect(page).toHaveURL(/\/auth\/reset-password\?token=/);
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);

  // The old password no longer works; the new one does.
  await signIn(page, email, password);
  await expectRefused(page);
  await signIn(page, email, newPassword);
  await expectInviteGate(page);

  await context.close();
});

// A GOD_EMAILS address only counts once it is confirmed (lib/session-user.ts),
// so the owner of one who is unconfirmed (a password member moved from Neon
// Auth) is held at the invite gate like a stranger. The gate's Email card is
// their way back in: confirm the address, and the same account walks on to
// onboarding without an invite.
test("an unconfirmed god address confirms its email at the invite gate and gets in", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = "god@example.com"; // GOD_EMAILS in playwright.db.config.ts
  const password = "owner-password-".padEnd(PASSWORD_MIN_LENGTH + 2, "z");

  await page.goto("/auth/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  // Unconfirmed, the god address is not trusted: the gate holds it.
  await expectInviteGate(page);
  await expect(
    page.getByRole("heading", { name: "Email", exact: true }),
  ).toBeVisible();

  const since = new Date();
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("status")).toContainText(
    `We’ve sent a link to ${email}.`,
  );

  // Better Auth's /api/auth/verify-email marks the address confirmed, signs
  // this browser in afresh (autoSignInAfterVerification) and follows the
  // card's callbackURL home, which now routes the god account to onboarding.
  const link = await waitForAuthMail(email, "verify", since);
  await page.goto(link);
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

  await context.close();
});
