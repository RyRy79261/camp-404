import { test, expect, type Page } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
} from "./_helpers";

// The Profile's Telegram card (Ol' Jeb, the owner's approved mock-up of
// 2026-10-26): Off, then Waiting after Connect Telegram, then On once the
// member taps Start in Telegram (stood in for by /api/test/telegram-start,
// which uses the link the card made, as `/start <code>` does at the webhook).
// Then the notices setting and Disconnect.

const ID = "telegram-member";

async function onboard(page: Page) {
  await login(page, { id: ID, email: `${ID}@example.com` });
  await page.goto("/");
  await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
  await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  await completeOnboarding(page.request, ID);
}

test.beforeEach(async ({ request }) => {
  await resetTestState(request);
});

test("a member connects Telegram, picks their notices and disconnects", async ({
  page,
  context,
}) => {
  await onboard(page);
  // The link opens Telegram in a new tab; keep it off the network.
  await context.route("https://t.me/**", (route) =>
    route.fulfill({ status: 200, body: "Telegram" }),
  );
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Your profile", level: 1 }),
  ).toBeVisible();

  const card = page.locator("[data-telegram-card]");
  await expect(card).toHaveAttribute("data-telegram-card", "off");
  await expect(card).toContainText(
    "Get your camp notices from Ol' Jeb, the camp's Telegram bot.",
  );

  const opened = context.waitForEvent("page");
  await card.getByRole("button", { name: "Connect Telegram" }).click();
  const telegramTab = await opened;
  await expect(card).toHaveAttribute("data-telegram-card", "waiting");
  await expect(card).toContainText("Tap Start in your chat with Ol' Jeb.");
  const again = card.getByRole("link", { name: "Open Telegram again" });
  await expect(again).toHaveAttribute(
    "href",
    /^https:\/\/t\.me\/jebediah_404_bot\?start=/,
  );
  await expect(telegramTab).toHaveURL(
    /^https:\/\/t\.me\/jebediah_404_bot\?start=/,
  );
  await telegramTab.close();

  // The member taps Start in Telegram.
  const tapped = await page.request.post("/api/test/telegram-start", {
    data: { authUserId: ID, username: "cloud_404" },
  });
  expect(tapped.ok()).toBe(true);

  await expect(card).toHaveAttribute("data-telegram-card", "on", {
    timeout: 15_000,
  });
  await expect(card).toContainText("Ol' Jeb sends your notices to @cloud_404.");
  const mine = card.getByRole("radio", { name: /Only notices about me/ });
  const all = card.getByRole("radio", { name: /All my notices/ });
  await expect(mine).toBeChecked();
  await all.check();
  await expect(all).toBeChecked();
  await page.reload();
  await expect(
    page.locator("[data-telegram-card]").getByRole("radio", {
      name: /All my notices/,
    }),
  ).toBeChecked();

  await page
    .locator("[data-telegram-card]")
    .getByRole("button", { name: "Disconnect" })
    .click();
  await expect(page.locator("[data-telegram-card]")).toHaveAttribute(
    "data-telegram-card",
    "off",
  );
});
