import { test, expect } from "@playwright/test";
import { login, redeemInviteAtGate, resetTestState } from "./_helpers";

// Invite codes are redeemed at the post-auth gate (/signup/required): the
// user signs in via Neon Auth first, then enters a code to come aboard.
// Bootstrap (env) codes and DB-backed codes follow slightly different paths
// through `claimInviteCode`. These specs assert the user ends up with the
// code recorded on their camp user row in both cases, and that provenance is
// tracked back to the issuer.

test.describe("invite-code redemption", () => {
  test.beforeEach(async ({ request }) => {
    await resetTestState(request);
  });

  test("env (bootstrap) code: redeems at the gate, persists on the user row", async ({
    page,
    request,
  }) => {
    await login(page, { id: "fresh-auth", email: "fresh@example.com" });
    await redeemInviteAtGate(page, "TEST-INVITE");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    const lookup = await request.get("/api/test/inspect?authUserId=fresh-auth");
    const body = (await lookup.json()) as { user: { inviteCode: string } };
    expect(body.user.inviteCode).toBe("TEST-INVITE");
  });

  test("DB code: alice's invite is tracked back to alice after bob redeems it", async ({
    page,
    request,
  }) => {
    // 1. Alice (a god) signs in — this lazy-creates her camp user row.
    await login(page, { id: "alice-auth", email: "god@example.com" });
    await page.goto("/");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    const aliceLookup = await request.get(
      "/api/test/inspect?authUserId=alice-auth",
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
    //    redeem a valid code after signing in.
    await login(page, { id: "bob-auth", email: "bob@example.com" });
    await redeemInviteAtGate(page, "BERLIN-CREW");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    // 4. Provenance check: bob's user row points at BERLIN-CREW, the
    //    BERLIN-CREW row points at alice, and the use_count went up by 1.
    const bobLookup = await request.get(
      "/api/test/inspect?authUserId=bob-auth",
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

  test("approval-required code creates a PENDING account", async ({
    page,
    request,
  }) => {
    // A non-captain's invites always require vetting. Seed one and redeem it.
    await request.post("/api/test/seed-invite", {
      data: { code: "VET-ME", maxUses: 1, requiresApproval: true },
    });

    await login(page, { id: "vet-auth", email: "vet@example.com" });
    // Redeeming claims the code; onboarding still owes answers so they land
    // on the questionnaire — but the row is already stamped `pending`.
    await redeemInviteAtGate(page, "VET-ME");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    const lookup = await request.get("/api/test/inspect?authUserId=vet-auth");
    const body = (await lookup.json()) as {
      user: { inviteCode: string; approvalStatus: string };
    };
    expect(body.user.inviteCode).toBe("VET-ME");
    expect(body.user.approvalStatus).toBe("pending");
  });

  test("pre-approved code creates an APPROVED account", async ({
    page,
    request,
  }) => {
    await request.post("/api/test/seed-invite", {
      data: { code: "WAVE-IN", maxUses: 1, requiresApproval: false },
    });

    await login(page, { id: "wave-auth", email: "wave@example.com" });
    await redeemInviteAtGate(page, "WAVE-IN");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    const lookup = await request.get("/api/test/inspect?authUserId=wave-auth");
    const body = (await lookup.json()) as {
      user: { approvalStatus: string };
    };
    expect(body.user.approvalStatus).toBe("approved");
  });

  test("sign-in without an invite is bounced and persists NO camp row", async ({
    page,
    request,
  }) => {
    // A non-god user signs in via Neon Auth without redeeming an invite.
    await login(page, { id: "stray-auth", email: "stray@example.com" });

    // Hitting / runs ensureCampUser. With no code on file they're bounced to
    // the invite gate...
    await page.goto("/");
    await expect(page).toHaveURL(/\/signup\/required/);

    // ...and crucially, NO orphan "signed in, no invite" row is written for
    // them. They only earn a row once they actually redeem an invite.
    const lookup = await request.get("/api/test/inspect?authUserId=stray-auth");
    const body = (await lookup.json()) as { user: unknown };
    expect(body.user).toBeNull();
  });

  test("DB code: an exhausted code can't be claimed by a second user", async ({
    page,
    request,
  }) => {
    // Seed a single-use code; alice burns it, then bob tries the same code.
    await request.post("/api/test/seed-invite", {
      data: { code: "ONE-SHOT", maxUses: 1 },
    });

    // Alice claims it at the gate.
    await login(page, { id: "alice-auth", email: "alice@example.com" });
    await redeemInviteAtGate(page, "ONE-SHOT");
    await expect(page).toHaveURL(/\/onboarding\/questionnaire/);

    // Bob signs in and tries the now-exhausted code — the claim fails and he
    // stays on the gate with an error.
    await login(page, { id: "bob-auth", email: "bob@example.com" });
    await redeemInviteAtGate(page, "ONE-SHOT");
    await expect(
      page.getByRole("alert").filter({ hasText: /isn't valid/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/signup\/required/);

    // And no row was persisted for bob.
    const lookup = await request.get("/api/test/inspect?authUserId=bob-auth");
    const body = (await lookup.json()) as { user: unknown };
    expect(body.user).toBeNull();
  });
});
