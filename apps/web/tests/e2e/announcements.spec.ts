import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  setRank,
} from "./_helpers";

// Captain announcements & notifications, end to end against the in-memory
// test store (E2E_TEST_MODE=1 — see playwright.config.ts). Covers the marquee
// path: a captain composes and publishes an announcement, and a member is
// taken over by the full-screen acknowledge gate until they dismiss it.

test.describe("captain announcements (test-mode)", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("home renders the notifications bell for an approved member", async ({
    page,
    request,
  }) => {
    // Regression guard: the home page reads the member's unread count, which
    // must resolve through the test store rather than hitting Neon. The bell is
    // a Popover trigger now, not a link to the inbox — the count still has to
    // reach it, and its panel still has to open.
    await login(page, { id: "god-auth", email: "god@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "god-auth");

    await page.goto("/");
    await expect(page).toHaveURL("/");
    const bell = page.getByRole("button", { name: /^Notifications,/ });
    await expect(bell).toBeVisible();

    await bell.click();
    // Assert something PRESENT in the panel before anything about it, so the
    // checks cannot pass against a popover that never opened.
    const panel = page.getByRole("dialog");
    await expect(
      panel.getByRole("heading", { name: "Notifications" }),
    ).toBeVisible();
    // The panel fetches its rows on open; an empty inbox says so, and the way
    // through to the inbox is always there.
    await expect(panel.getByText(/Nothing here yet/)).toBeVisible();
    await panel.getByRole("link", { name: /See all/ }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeVisible();
  });

  test("a published announcement takes over a member's screen until acknowledged", async ({
    page,
    request,
  }) => {
    // 1. The recipient must exist before fan-out — sign in and redeem an
    //    invite so their member row is persisted.
    await login(page, { id: "member-auth", email: "member@example.com" });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    // 2. Become a captain (god email clears the access + approval gates; the
    //    seam grants captain rank) and open the announcements composer.
    await login(page, {
      id: "captain-auth",
      email: "god@example.com",
      displayName: "Captain Jo",
    });
    await page.goto("/");
    // Captain pages walk the member ladder too, so the captain finishes
    // onboarding first.
    await completeOnboarding(request, "captain-auth");
    await setRank(request, "captain-auth", "captain");

    await page.goto("/captains/announcements");
    await expect(
      page.getByRole("heading", { name: "Announcements & notifications" }),
    ).toBeVisible();

    // 3. Compose a draft (presentation defaults to the acknowledge variant)
    //    and publish it to the camp.
    await page.getByLabel("Title").fill("Burn-night briefing");
    // Written in markdown: a member reads it rendered where they read the
    // whole message, and plain everywhere it is clipped.
    await page.getByLabel("Message").fill("Meet at the **effigy** at 20:00.");
    await expect(page.getByText(/Markdown supported/)).toBeVisible();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Publish to camp" }).click();
    // Publishing cannot be taken back, so a confirmation names the audience
    // and how it will show before anything goes out.
    const confirm = page.getByRole("dialog");
    await expect(
      confirm.getByText("Full-screen — must acknowledge"),
    ).toBeVisible();
    await confirm.getByRole("button", { name: "Publish to 1 member" }).click();

    // Only the member receives it — the author is excluded from fan-out.
    await expect(page.getByText(/Published to 1 member/)).toBeVisible();

    // 4. Back as the member: the full-screen gate takes over.
    await login(page, { id: "member-auth", email: "member@example.com" });
    await page.goto("/");

    const gate = page.getByRole("dialog");
    await expect(gate).toBeVisible();
    await expect(
      gate.getByRole("heading", { name: "Burn-night briefing" }),
    ).toBeVisible();
    await expect(gate.getByText("Meet at the effigy at 20:00.")).toBeVisible();
    // The takeover is the whole message, so it renders the markdown.
    await expect(gate.locator("strong")).toHaveText("effigy");
    await expect(gate.getByText(/From Captain Jo/)).toBeVisible();

    // 5. Acknowledge dismisses it and it doesn't come back.
    await gate.getByRole("button", { name: "Acknowledge" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The pending queue is now empty for this member.
    const pending = await page.request.get("/api/notifications/pending");
    expect(pending.ok()).toBeTruthy();
    expect((await pending.json()).pending).toHaveLength(0);

    // 6. The inbox tabs are links: the filter lives in the URL, and it is
    //    applied to the list rather than to the tab strip.
    //
    //    Both locators are scoped to the tab strip's own nav landmark. The tab
    //    labels are not unique on the page — "Announcements" is also the
    //    console nav's composer link for a lead or captain, and the Unread tab
    //    grows a "· n" the moment anything is unread — so an unscoped
    //    getByRole would either hit strict mode or match the wrong link.
    await page.goto("/notifications");
    const tabs = page.getByRole("navigation", { name: "Filter notifications" });
    await tabs.getByRole("link", { name: /^Announcements/ }).click();
    await expect(page).toHaveURL(/\/notifications\?filter=announcements$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Burn-night briefing/ }),
    ).toBeVisible();

    // The member acknowledged it in step 5, which read it — so the Unread tab
    // is empty. Assert the page HAS rendered (the heading) before the absence.
    await tabs.getByRole("link", { name: /^Unread/ }).click();
    await expect(page).toHaveURL(/\/notifications\?filter=unread$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeVisible();
    await expect(page.getByText("You're all caught up.")).toBeVisible();
    await expect(
      page.getByRole("link", { name: /Burn-night briefing/ }),
    ).toHaveCount(0);

    // 7. The inbox row opens the whole announcement on its own page.
    await page.goto("/notifications");
    // A row is a glimpse: it carries the words, never the markers.
    const row = page.getByRole("link", { name: /Burn-night briefing/ });
    await expect(row).toContainText("Meet at the effigy at 20:00.");
    await expect(row.locator("strong")).toHaveCount(0);
    await row.click();
    await expect(page).toHaveURL(/\/announcements\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Burn-night briefing" }),
    ).toBeVisible();
    await expect(page.getByText("Meet at the effigy at 20:00.")).toBeVisible();
    // The page is the whole message, so here the markdown is rendered.
    await expect(page.locator("article strong")).toHaveText("effigy");
    await expect(page.getByText(/You acknowledged this on/)).toBeVisible();
    const readPage = page.url();

    // 8. The delivery is the permission: the author got no delivery, so the
    //    same link is a 404 for them.
    await login(page, {
      id: "captain-auth",
      email: "god@example.com",
      displayName: "Captain Jo",
    });
    const denied = await page.goto(readPage);
    expect(denied?.status()).toBe(404);
  });

  test("a pop-up announcement shows once as a toast that opens it", async ({
    page,
    request,
  }) => {
    await login(page, { id: "member-auth", email: "member@example.com" });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    await login(page, {
      id: "captain-auth",
      email: "god@example.com",
      displayName: "Captain Jo",
    });
    await page.goto("/");
    await completeOnboarding(request, "captain-auth");
    await setRank(request, "captain-auth", "captain");
    await page.goto("/captains/announcements");
    await page.getByLabel("Title").fill("Water run");
    await page.getByLabel("Message").fill("Truck leaves at 9.");
    await page.getByLabel("How it lands").click();
    await page.getByRole("option", { name: /Pop-up/ }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Publish to camp" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Publish to 1 member" })
      .click();
    await expect(page.getByText(/Published to 1 member/)).toBeVisible();

    // The member gets a toast, not a takeover. (Not on the inbox page: opening
    // the inbox reads everything in it, pop-ups included.)
    await login(page, { id: "member-auth", email: "member@example.com" });
    await page.goto("/");
    const popup = page.getByRole("status").filter({ hasText: "Water run" });
    await expect(popup).toBeVisible();
    await expect(popup.getByText("Truck leaves at 9.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // It showed once: the next load polls again and shows no toast.
    const polled = page.waitForResponse("**/api/notifications/pending");
    await page.reload();
    await polled;
    await expect(
      page.getByRole("status").filter({ hasText: "Water run" }),
    ).toHaveCount(0);

    // The inbox still lists it, and the row opens the announcement.
    await page.goto("/notifications");
    await page.getByRole("link", { name: /Water run/ }).click();
    await expect(page).toHaveURL(/\/announcements\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Water run" }),
    ).toBeVisible();
  });
});
