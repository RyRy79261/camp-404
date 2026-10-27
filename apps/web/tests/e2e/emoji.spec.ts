import { test, expect } from "@playwright/test";
import { completeOnboarding, login, resetTestState, setRank } from "./_helpers";
import { desktopOnly } from "./lib/dom";

// Emoji in every text box (owner's approved mock-up, 2026-10-27): the ☺ panel
// in a one-line box, Telegram's `:name` row in a box and in the long-text
// editor, and Recent remembering what was picked.

test.beforeEach(async ({ request }) => {
  await resetTestState(request);
});

test("a captain adds emoji from the panel and by :name, in a box and in the agenda", async ({
  page,
  request,
}, testInfo) => {
  desktopOnly(testInfo, "the phone's sheet is the same panel");
  await login(page, {
    id: "emoji-cap",
    email: "god@example.com",
    displayName: "Cap Tain",
  });
  await page.goto("/");
  await completeOnboarding(request, "emoji-cap");
  await setRank(request, "emoji-cap", "captain");

  await page.goto("/calendar?new=2026-10-28");
  const form = page.getByRole("form", { name: "New event" });
  const title = form.getByLabel("Title");
  await title.fill("Build weekend ");

  // The panel: search, pick, and it lands where the caret was.
  await form
    .getByRole("button", { name: "Emoji", exact: true })
    .first()
    .click();
  await page.getByRole("searchbox", { name: "Search emoji" }).fill("fire");
  await page.getByRole("button", { name: "fire", exact: true }).first().click();
  await expect(title).toHaveValue("Build weekend 🔥");

  // :name in the box: Enter takes the first match.
  await title.pressSequentially(" :hea");
  await expect(
    page.getByRole("dialog").getByRole("button", { name: "red heart" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(title).toHaveValue("Build weekend 🔥 ❤️");

  // A time is not a :name.
  const place = form.getByLabel("Place");
  await place.pressSequentially("18:30");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // :name in the agenda's editor.
  const agenda = form.getByRole("textbox", { name: "Agenda", exact: true });
  await agenda.click();
  await agenda.pressSequentially("Shade :tent");
  await expect(
    page.getByRole("listbox", { name: "Emoji matches" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(agenda).toContainText("Shade ⛺");

  // Recent remembers the picks, newest first.
  await title.click();
  await form
    .getByRole("button", { name: "Emoji", exact: true })
    .first()
    .click();
  const recent = page.getByRole("region", { name: "Recent" });
  await expect(recent.getByRole("button").first()).toHaveAccessibleName("tent");
});
