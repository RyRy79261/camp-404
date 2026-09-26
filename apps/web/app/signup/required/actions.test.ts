import { beforeEach, describe, expect, it, vi } from "vitest";

// Invite codes are guessable (the env bootstrap codes are short), so
// redemption is throttled. Sign-up is open, which means a per-account budget
// alone resets with every new account: the address bucket is the one that
// holds. The load-bearing assertion is that a refused guess never reaches
// redeemInviteForUser.

vi.mock("@/lib/auth", () => ({ getAuthenticatedUserOrRedirect: vi.fn() }));
vi.mock("@/lib/users", () => ({ redeemInviteForUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimiter: { limit: vi.fn() },
  getClientIp: vi.fn(() => "1.2.3.4"),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { submitInviteCode } from "./actions";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { redeemInviteForUser } from "@/lib/users";
import { rateLimiter } from "@/lib/rate-limit";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

function codeForm(code: string): FormData {
  const form = new FormData();
  form.set("code", code);
  return form;
}

/** Refuse only the bucket whose key starts with `prefix`. */
function refuseBucket(prefix: string) {
  vi.mocked(rateLimiter.limit).mockImplementation(async (key: string) => ({
    ok: !key.startsWith(prefix),
    retryAfterSeconds: 120,
  }));
}

describe("submitInviteCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
      id: "auth-1",
      primaryEmail: "new@example.com",
      displayName: "New",
    } as never);
    vi.mocked(rateLimiter.limit).mockResolvedValue({
      ok: true,
      retryAfterSeconds: 0,
    });
    vi.mocked(redeemInviteForUser).mockResolvedValue({ ok: true } as never);
  });

  it("refuses when the per-address bucket is spent, without trying the code", async () => {
    refuseBucket("invite-redeem-ip:");
    const res = await submitInviteCode(null, codeForm("GUESS"));
    expect(res).toEqual({
      ok: false,
      error: expect.stringMatching(/^Too many attempts/),
    });
    expect(rateLimiter.limit).toHaveBeenCalledWith("invite-redeem-ip:1.2.3.4", {
      limit: 30,
      windowMs: 600_000,
    });
    expect(redeemInviteForUser).not.toHaveBeenCalled();
  });

  it("refuses when the per-account bucket is spent, without trying the code", async () => {
    refuseBucket("invite-redeem:auth-1");
    const res = await submitInviteCode(null, codeForm("GUESS"));
    expect(res).toMatchObject({ ok: false });
    expect(redeemInviteForUser).not.toHaveBeenCalled();
  });

  it("redeems the code and sends them home when both buckets allow it", async () => {
    await expect(submitInviteCode(null, codeForm("MEOW"))).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(redeemInviteForUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: "auth-1" }),
      "MEOW",
    );
    expect(redirect).toHaveBeenCalledWith("/");
    // The invite was the gate: the console layout redraws its manifest.
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("returns the redemption error for a wrong code", async () => {
    vi.mocked(redeemInviteForUser).mockResolvedValue({
      ok: false,
      error: "That code isn't valid.",
    } as never);
    const res = await submitInviteCode(null, codeForm("NOPE"));
    expect(res).toEqual({ ok: false, error: "That code isn't valid." });
  });
});
