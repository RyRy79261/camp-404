import { test, expect } from "@playwright/test";
import { login, resetTestState } from "./_helpers";

// Bootstrap (env) codes and DB-backed codes follow slightly different
// paths through `redeemInviteCode` / `claimInviteCode`. These specs assert
// the user ends up with the code recorded on their camp user row in both
// cases.

test.describe("invite-code redemption", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("env (bootstrap) code: redeems on /signup, persists on the user row", async ({
    page,
    request,
  }) => {
    // First half of the flow — anonymous user submits the code.
    await page.goto("/signup");
    await page.getByLabel("Invite code").fill("TEST-INVITE");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/handler\/sign-up/);

    // Now simulate the Stack signup completing by logging in our test user.
    // The redeem cookie was set on the previous request and is reused here.
    await login(request, { email: "fresh@example.com" });

    // Hitting / triggers ensureCampUser, which sees the cookie and persists
    // the code onto the user's row. The redirect then takes them to the
    // questionnaire (i.e. they passed the invite gate).
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);
  });

  test("invalid code: stays on /signup with an error, no cookie set", async ({
    page,
  }) => {
    await page.goto("/signup");
    await page.getByLabel("Invite code").fill("NOPE");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("alert")).toContainText(/isn't valid/i);
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "camp404_invite")).toBeUndefined();
  });

  test("DB code: alice's invite is tracked back to alice after bob redeems it", async ({
    page,
    request,
  }) => {
    // 1. Alice (a god) signs in — this lazy-creates her camp user row.
    await login(request, { id: "alice-stack", email: "god@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    const aliceLookup = await request.get(
      "/api/test/inspect?stackUserId=alice-stack",
    );
    const alice = (await aliceLookup.json()) as { user: { id: string } };

    // 2. Mint an invite code attributed to alice, with a use cap and note.
    const seedRes = await request.post("/api/test/seed-invite", {
      data: {
        code: "BERLIN-CREW",
        createdByUserId: alice.user.id,
        note: "Berlin crew",
        maxUses: 5,
      },
    });
    expect(seedRes.ok()).toBeTruthy();

    // 3. Bob arrives. He's NOT a god — the only way past the gate is to
    //    redeem a valid code. Submit at /signup first (sets cookie), then
    //    switch the test session over to bob and hit /.
    await page.goto("/signup");
    await page.getByLabel("Invite code").fill("BERLIN-CREW");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/handler\/sign-up/);

    await login(request, { id: "bob-stack", email: "bob@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    // 4. Provenance check: bob's user row points at BERLIN-CREW, the
    //    BERLIN-CREW row points at alice, and the use_count went up by 1.
    const bobLookup = await request.get(
      "/api/test/inspect?stackUserId=bob-stack",
    );
    const bob = (await bobLookup.json()) as {
      user: { id: string; inviteCode: string };
      inviteCode: { createdByUserId: string; useCount: number; note: string };
    };
    expect(bob.user.inviteCode).toBe("BERLIN-CREW");
    expect(bob.inviteCode.createdByUserId).toBe(alice.user.id);
    expect(bob.inviteCode.useCount).toBe(1);
    expect(bob.inviteCode.note).toBe("Berlin crew");
  });

  test("DB code: exhausted code can't be claimed even with a stale cookie", async ({
    page,
    request,
    context,
  }) => {
    // Seed a single-use code, then simulate it being burned by alice
    // before bob tries to use it.
    await request.post("/api/test/seed-invite", {
      data: { code: "ONE-SHOT", maxUses: 1 },
    });

    // Alice claims it.
    await login(request, { id: "alice-stack", email: "alice@example.com" });
    await context.addCookies([
      {
        name: "camp404_invite",
        value: "ONE-SHOT",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    // Now bob arrives with the same code in his cookie. Claim should fail
    // and he should get bounced to /signup/required.
    await login(request, { id: "bob-stack", email: "bob@example.com" });
    await context.addCookies([
      {
        name: "camp404_invite",
        value: "ONE-SHOT",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/signup\/required/);
  });
});
