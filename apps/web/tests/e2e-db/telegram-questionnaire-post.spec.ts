import { test, expect, type Page } from "@playwright/test";
import { resetTestState } from "../e2e/_helpers";
import { buildQuestionnaire } from "./_flows";
import { signInAs } from "./personas";

// "Post in Telegram" on a sent questionnaire (owner's mock-up, 2026-10-27):
// its author (or a captain) picks who Ol' Jeb tags in the camp's chats. On a
// real database: the store models no questionnaire send.

test.describe.configure({ timeout: 300_000 });

const POLL = {
  title: "Pizza night",
  key: "pizza-night",
  prompt: "Which topping?",
};

async function sendToEveryone(author: Page): Promise<void> {
  await author.goto("/captains/questionnaires");
  await author.getByRole("link", { name: `Send ${POLL.title}` }).click();
  await expect(
    author.getByRole("radio", { name: /^Everyone/, checked: true }),
  ).toBeVisible({ timeout: 60_000 });
  await author
    .getByRole("button", { name: "Send questionnaire", exact: true })
    .click();
  await expect(author).toHaveURL(
    new RegExp(`/captains/questionnaires/${POLL.key}$`),
    { timeout: 60_000 },
  );
}

test("the author posts a sent questionnaire in Telegram, tagging who they pick", async ({
  browser,
  request,
}) => {
  await resetTestState(request);
  const lead = await signInAs(browser, request, "team_lead");
  await signInAs(browser, request, "captain");
  const member = await signInAs(browser, request, "camp_member");

  // A captain who connected Ol' Jeb adds the camp's chat; the member has a
  // Telegram username but never tapped Start.
  const place = await request.post("/api/test/telegram-notifyhere", {
    data: {
      authUserId: "persona-captain",
      chatId: "-100800",
      title: "Camp 404 Announcements",
    },
  });
  expect(place.ok()).toBe(true);
  const handle = await request.post("/api/test/seed-telegram", {
    data: { authUserId: "persona-camp_member", handle: "mem_404" },
  });
  expect(handle.ok()).toBe(true);

  await buildQuestionnaire(lead, POLL);
  await sendToEveryone(lead);

  // A plain member sees the sent questionnaire, but not the button.
  await member.goto("/captains/questionnaires");
  await expect(
    member.getByRole("link", { name: `Answer ${POLL.title}` }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    member.getByRole("button", { name: `Post ${POLL.title} in Telegram` }),
  ).toHaveCount(0);

  await lead.goto("/captains/questionnaires");
  await lead
    .getByRole("button", { name: `Post ${POLL.title} in Telegram` })
    .click();
  const dialog = lead.getByRole("dialog", { name: "Post in Telegram" });
  await expect(dialog.getByText(POLL.title, { exact: true })).toBeVisible();
  await expect(
    // Everyone the send still waits on (the lead, the captain, the member,
    // and any account an earlier spec left behind).
    dialog.getByRole("button", { name: /Hasn't answered \(\d+\)/ }),
  ).toHaveAttribute("aria-pressed", "true", { timeout: 60_000 });
  // The member can be tagged and is ticked; the connected captain gets a
  // private message instead; the lead has no Telegram username.
  await expect(
    dialog.getByRole("checkbox", { name: "camp_member" }),
  ).toBeChecked();
  await expect(
    dialog.getByRole("checkbox", { name: "captain" }),
  ).not.toBeChecked();
  await expect(dialog.getByText("connected · gets a DM")).toBeVisible();
  await expect(
    dialog.getByRole("checkbox", { name: "team_lead" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("checkbox", { name: "Camp 404 Announcements" }),
  ).toBeChecked();

  await dialog
    .getByRole("button", { name: "Post now · tags 1 person" })
    .click();
  await expect(
    lead.getByText(
      "Ol' Jeb is posting it, tagging 1 person. 1 person also gets a private message.",
    ),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
