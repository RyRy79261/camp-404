import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";

// Ol' Jeb in the camp's chats (step 2, the owner's approved mock-up of
// 2026-10-26): Camp settings' Ol' Jeb card lists the chats a captain added
// with `/notifyhere` (stood in for by /api/test/telegram-notifyhere, which
// asks what the webhook asks: a captain who connected Telegram), with Remove
// and the three ticks; the announcements composer offers "Also post in
// Telegram", ticked, for the whole camp.

const CAPTAIN = "ol-jeb-captain";

async function asCaptain(page: Page, request: APIRequestContext) {
  // A GOD_EMAILS address gets in with no invite (camp-settings.spec.ts).
  await login(page, { id: CAPTAIN, email: "god@example.com" });
  await page.goto("/"); // lazily creates the camp user row
  await completeOnboarding(request, CAPTAIN);
  await setRank(request, CAPTAIN, "captain");
}

/** Connect the captain's Telegram, as the Profile's card and Start do. */
async function connect(page: Page) {
  await page
    .context()
    .route("https://t.me/**", (route) =>
      route.fulfill({ status: 200, body: "Telegram" }),
    );
  await page.goto("/profile");
  const card = page.locator("[data-telegram-card]");
  const opened = page.context().waitForEvent("page");
  await card.getByRole("button", { name: "Connect Telegram" }).click();
  await (await opened).close();
  const tapped = await page.request.post("/api/test/telegram-start", {
    data: { authUserId: CAPTAIN, username: "captain_404" },
  });
  expect(tapped.ok()).toBe(true);
}

function notifyhere(
  request: APIRequestContext,
  authUserId: string,
  chatId: string,
  title: string,
  threadId: string | null = null,
) {
  return request.post("/api/test/telegram-notifyhere", {
    data: { authUserId, chatId, title, threadId },
  });
}

test.beforeEach(async ({ request }) => {
  await resetTestState(request);
});

test("a captain sees the chats Ol' Jeb posts in, changes what he posts and removes one", async ({
  page,
  request,
}) => {
  await asCaptain(page, request);

  // Not connected yet: /notifyhere is refused.
  expect(
    (
      await notifyhere(request, CAPTAIN, "-100500", "Camp 404 Announcements")
    ).status(),
  ).toBe(403);

  await page.goto("/captains/camp-settings");
  const card = page.locator("[data-ol-jeb-card]");
  await expect(card).toContainText("No chats yet");
  await expect(card).toContainText("/notifyhere@jebediah_404_bot");

  await connect(page);
  expect(
    (
      await notifyhere(request, CAPTAIN, "-100500", "Camp 404 Announcements")
    ).ok(),
  ).toBe(true);
  expect(
    (
      await notifyhere(
        request,
        CAPTAIN,
        "-100600",
        "Camp 404 › Announcements",
        "7",
      )
    ).ok(),
  ).toBe(true);

  await page.goto("/captains/camp-settings");
  const places = card.locator("[data-ol-jeb-place]");
  await expect(places).toHaveCount(2);
  await expect(places.nth(0)).toContainText("Camp 404 Announcements");
  await expect(places.nth(0)).toContainText("group");
  await expect(places.nth(1)).toContainText("topic");

  const meetings = card.getByRole("checkbox", {
    name: "New meetings in the Calendar",
  });
  await expect(meetings).toBeChecked();
  await meetings.click();
  await expect(meetings).not.toBeChecked();
  await page.reload();
  await expect(
    page
      .locator("[data-ol-jeb-card]")
      .getByRole("checkbox", { name: "New meetings in the Calendar" }),
  ).not.toBeChecked();

  await places.nth(1).getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("[data-ol-jeb-place]")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("[data-ol-jeb-place]")).toHaveCount(1);
});

test("the composer offers Also post in Telegram, ticked, for the whole camp", async ({
  page,
  request,
}) => {
  await asCaptain(page, request);
  await page.goto("/captains/announcements");
  await expect(
    page.getByRole("heading", { name: "Announcements & notifications" }),
  ).toBeVisible();
  // No chat yet: nothing to offer.
  await expect(
    page.getByRole("switch", { name: "Also post in Telegram" }),
  ).toHaveCount(0);

  await connect(page);
  await notifyhere(request, CAPTAIN, "-100500", "Camp 404 Announcements");
  await page.goto("/captains/announcements");
  const sw = page.getByRole("switch", { name: "Also post in Telegram" });
  await expect(sw).toBeChecked();
  await expect(page.locator("[data-telegram-post]")).toContainText(
    "Camp 404 Announcements",
  );

  await page.getByLabel("Title").fill("Build weekend moved");
  await page.getByLabel("Message").fill("The truck is booked for Saturday.");
  await page.getByRole("button", { name: /Save draft/ }).click();
  await expect(page.getByText("Also on Telegram")).toBeVisible();
});
