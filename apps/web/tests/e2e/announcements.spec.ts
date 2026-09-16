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
    // must resolve through the test store rather than hitting Neon.
    await login(page, { id: "god-auth", email: "god@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
    await completeOnboarding(request, "god-auth");

    await page.goto("/");
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("link", { name: /Notifications/ }),
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
    await page.getByLabel("Message").fill("Meet at the effigy at 20:00.");
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
    await expect(gate.getByText(/From Captain Jo/)).toBeVisible();

    // 5. Acknowledge dismisses it and it doesn't come back.
    await gate.getByRole("button", { name: "Acknowledge" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The pending queue is now empty for this member.
    const pending = await page.request.get("/api/notifications/pending");
    expect(pending.ok()).toBeTruthy();
    expect((await pending.json()).pending).toHaveLength(0);

    // 6. The inbox row opens the whole announcement on its own page.
    await page.goto("/notifications");
    await page.getByRole("link", { name: /Burn-night briefing/ }).click();
    await expect(page).toHaveURL(/\/announcements\/[0-9a-f-]{36}$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Burn-night briefing" }),
    ).toBeVisible();
    await expect(page.getByText("Meet at the effigy at 20:00.")).toBeVisible();
    await expect(page.getByText(/You acknowledged this on/)).toBeVisible();
    const readPage = page.url();

    // 7. The delivery is the permission: the author got no delivery, so the
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
