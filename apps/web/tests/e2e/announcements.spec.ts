import { test, expect } from "@playwright/test";
import {
  completeOnboarding,
  login,
  redeemInviteAtGate,
  resetTestState,
  seedTeam,
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

    // The bell and Home's Announcements tile both open the inbox, so they must
    // show one count (getInboxBadge). The acknowledged announcement was read,
    // so it is counted by neither. The member finishes onboarding and is
    // approved, so Home draws the header with the bell and the tiles.
    // (Waiting questionnaires, the other half of the count, have no cover
    // here: the test store models no questionnaire sends.)
    await completeOnboarding(request, "member-auth");
    const approved = await request.post("/api/test/set-approval", {
      data: { authUserId: "member-auth", status: "approved" },
    });
    expect(approved.ok()).toBeTruthy();
    await page.goto("/");
    await expect(page).toHaveURL("/");
    const announcementsTile = page.getByRole("link", {
      name: /^Announcements/,
    });
    await expect(announcementsTile).toBeVisible();
    const bellName = await page
      .getByRole("button", { name: /^Notifications,/ })
      .getAttribute("aria-label");
    const tileName = await announcementsTile.getAttribute("aria-label");
    const countIn = (name: string | null) =>
      Number(/(\d+)/.exec(name ?? "")?.[1] ?? 0);
    expect(countIn(tileName)).toBe(countIn(bellName));
    expect(bellName).toBe("Notifications, none unread");

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

  test("a pinned announcement rides above every console page until it is unpinned", async ({
    page,
    request,
  }) => {
    // Pinning is the second axis beside "how it lands" (owner's call,
    // 2026-09-22): a QUIET announcement — no takeover, no pop-up — can still be
    // kept at the top. That is what this drives, so nothing the member sees is
    // the acknowledge gate.

    // 1. A member who is all the way through the ladder: the banner lives in
    //    the console shell, which a gated member never gets.
    await login(page, { id: "member-auth", email: "member@example.com" });
    await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "member-auth");

    // 2. The captain publishes a quiet announcement to the camp.
    await login(page, {
      id: "captain-auth",
      email: "god@example.com",
      displayName: "Captain Jo",
    });
    await page.goto("/");
    await completeOnboarding(request, "captain-auth");
    await setRank(request, "captain-auth", "captain");

    await page.goto("/captains/announcements");
    await page.getByLabel("Title").fill("Water points moved");
    await page.getByLabel("Message").fill("They're behind the kitchen now.");
    await page.getByLabel("How it lands").click();
    await page.getByRole("option", { name: /Quiet/ }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Publish to camp" }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Publish to 1 member" })
      .click();
    await expect(page.getByText(/Published to 1 member/)).toBeVisible();

    // 3. Pin it from the published card — a one-tap control on a list row.
    const card = page
      .getByRole("listitem")
      .filter({ hasText: "Water points moved" });
    await expect(card.getByText(/Not at the top/)).toBeVisible();
    await card.getByRole("button", { name: "Pin to top" }).click();
    await expect(page.getByText("Pinned to the top")).toBeVisible();

    // 4. The member finds it above the page, on more than one console page,
    //    with no way to dismiss it themselves.
    await login(page, { id: "member-auth", email: "member@example.com" });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { level: 1, name: /^Hi\b/ }),
    ).toBeVisible();
    const banner = page.getByRole("region", { name: "Pinned announcements" });
    await expect(banner.getByText("Water points moved")).toBeVisible();
    expect(await banner.getByRole("button").count()).toBe(0);

    await page.goto("/notifications");
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeVisible();
    await expect(banner.getByText("Water points moved")).toBeVisible();

    // The banner's link is the way through to the whole announcement.
    await banner.getByRole("link", { name: /Read/ }).click();
    await expect(page).toHaveURL(/\/announcements\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Water points moved" }),
    ).toBeVisible();

    // 5. The captain unpins, and it goes.
    await login(page, {
      id: "captain-auth",
      email: "god@example.com",
      displayName: "Captain Jo",
    });
    await page.goto("/captains/announcements");
    const pinnedCard = page
      .getByRole("listitem")
      .filter({ hasText: "Water points moved" });
    await expect(pinnedCard.getByText(/Sitting at the top/)).toBeVisible();
    await pinnedCard.getByRole("button", { name: "Unpin" }).click();
    await expect(page.getByText("Unpinned", { exact: true })).toBeVisible();

    await login(page, { id: "member-auth", email: "member@example.com" });
    await page.goto("/");
    // Assert the page HAS rendered before asserting the banner's absence —
    // toHaveURL resolves before paint, and an empty document has no banner
    // either.
    await expect(
      page.getByRole("heading", { level: 1, name: /^Hi\b/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Pinned announcements" }),
    ).toHaveCount(0);
    // It is unpinned, not unsent: the inbox still has it.
    await page.goto("/notifications");
    await expect(
      page.getByRole("link", { name: /Water points moved/ }),
    ).toBeVisible();
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

  // Owner, 2026-09-23: a captain "can send announcements to just specific
  // teams or just the team leaders".
  test("an announcement to the team leads reaches a lead and not a member", async ({
    page,
    request,
  }) => {
    // Both recipients must exist before fan-out.
    for (const [id, email] of [
      ["leads-lead", "lead@example.com"],
      ["leads-member", "crew@example.com"],
    ] as const) {
      await login(page, { id, email });
      await redeemInviteAtGate(page, "TEST-INVITE-E2E-ONLY-CODE");
      await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
      await completeOnboarding(request, id);
    }
    await seedTeam(request, "leads-lead", "kitchen", true);
    await seedTeam(request, "leads-member", "kitchen", false);

    await login(page, { id: "leads-cap", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "leads-cap");
    await setRank(request, "leads-cap", "captain");

    await page.goto("/captains/announcements");
    await page.getByLabel("Title").fill("Leads sync Tuesday");
    await page.getByLabel("Message").fill("Bring your team's numbers.");
    await page.locator("#announcement-audience").click();
    await page.getByRole("option", { name: "Team leads" }).click();
    await page.locator("#announcement-presentation").click();
    await page.getByRole("option", { name: /Quiet/ }).click();
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.getByRole("button", { name: "Publish to team leads" }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm.getByText(/1 member who leads a team/)).toBeVisible();
    await confirm.getByRole("button", { name: "Publish to 1 member" }).click();
    await expect(page.getByText(/Published to 1 member/)).toBeVisible();

    await login(page, { id: "leads-lead", email: "lead@example.com" });
    await page.goto("/notifications");
    await expect(page.getByText("Leads sync Tuesday")).toBeVisible();

    await login(page, { id: "leads-member", email: "crew@example.com" });
    await page.goto("/notifications");
    await expect(
      page.getByRole("heading", { level: 1, name: "Notifications" }),
    ).toBeVisible();
    await expect(page.getByText("Leads sync Tuesday")).toHaveCount(0);
  });
  test("deleting a draft asks first, and Cancel keeps it", async ({
    page,
    request,
  }) => {
    await login(page, { id: "del-cap", email: "god@example.com" });
    await page.goto("/");
    await completeOnboarding(request, "del-cap");
    await setRank(request, "del-cap", "captain");

    await page.goto("/captains/announcements");
    await page.getByLabel("Title").fill("Ice run rota");
    await page.getByLabel("Message").fill("Who fetches ice on Tuesday?");
    await page.getByRole("button", { name: "Save draft" }).click();

    const drafts = page.getByRole("region", { name: /^Drafts/ });
    const draftTitle = drafts.getByRole("heading", { name: "Ice run rota" });
    await expect(draftTitle).toBeVisible();

    // One misclick on Delete used to lose the draft; now it asks.
    await drafts.getByRole("button", { name: "Delete" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this draft?" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(/"Ice run rota" is deleted/)).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(draftTitle).toBeVisible();

    await drafts.getByRole("button", { name: "Delete" }).click();
    await confirm.getByRole("button", { name: "Delete draft" }).click();
    await expect(page.getByText("Draft deleted")).toBeVisible();
    await expect(drafts.getByText("No drafts.")).toBeVisible();
    await expect(draftTitle).toHaveCount(0);
  });
});
