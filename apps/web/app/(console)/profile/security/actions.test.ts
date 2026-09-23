import { beforeEach, describe, expect, it, vi } from "vitest";

// setFirstPassword — a password for a member who has only signed in with
// Google or a passkey. What matters:
//
//  1. It adds the password to the SIGNED-IN member's account: Better Auth gets
//     this request's headers and nothing that names another account.
//  2. Too short or too long never reaches Better Auth.
//  3. "Already has a password" is a sentence the member can act on, not the
//     generic failure.
//  4. The member is emailed that a password was added, and only on success.

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ cookie: "session=abc" })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUserOrRedirect: vi.fn() }));
vi.mock("@camp404/auth", () => ({
  auth: { api: { setPassword: vi.fn() } },
  sendAuthEmail: vi.fn(async () => true),
}));

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@camp404/core";
import { auth, sendAuthEmail } from "@camp404/auth";
import { getAuthenticatedUserOrRedirect } from "@/lib/auth";
import { setFirstPassword } from "./actions";

const GOOD = "correct horse battery staple";

/** The shape Better Auth throws: an APIError with the code in `body`. */
function authError(code: string) {
  return Object.assign(new Error(code), { body: { code, message: code } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedUserOrRedirect).mockResolvedValue({
    id: "auth-1",
    primaryEmail: "member@example.com",
    displayName: "Member",
  });
  vi.mocked(auth.api.setPassword).mockResolvedValue({ status: true } as never);
});

describe("setFirstPassword", () => {
  it("adds the password to the signed-in member's account and tells them", async () => {
    const result = await setFirstPassword(GOOD);

    expect(result).toEqual({ ok: true });
    const call = vi.mocked(auth.api.setPassword).mock.calls[0]![0] as {
      body: unknown;
      headers: Headers;
    };
    expect(call.body).toEqual({ newPassword: GOOD });
    expect(call.headers.get("cookie")).toBe("session=abc");
    expect(sendAuthEmail).toHaveBeenCalledWith(expect.anything(), {
      to: "member@example.com",
      kind: "password-set",
    });
  });

  it("refuses a password outside the rule before asking Better Auth", async () => {
    const short = await setFirstPassword("x".repeat(PASSWORD_MIN_LENGTH - 1));
    const long = await setFirstPassword("x".repeat(PASSWORD_MAX_LENGTH + 1));
    const missing = await setFirstPassword(undefined);

    expect(short).toEqual({
      ok: false,
      error: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
    });
    expect(long).toEqual({
      ok: false,
      error: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
    });
    expect(missing).toEqual({ ok: false, error: "Type a password." });
    expect(auth.api.setPassword).not.toHaveBeenCalled();
    expect(sendAuthEmail).not.toHaveBeenCalled();
  });

  it("accepts a password exactly at the minimum", async () => {
    const result = await setFirstPassword("x".repeat(PASSWORD_MIN_LENGTH));
    expect(result).toEqual({ ok: true });
  });

  it("says so when the account already has a password, and sends no email", async () => {
    vi.mocked(auth.api.setPassword).mockRejectedValue(
      authError("PASSWORD_ALREADY_SET"),
    );

    const result = await setFirstPassword(GOOD);

    expect(result).toEqual({
      ok: false,
      error:
        "Your account already has a password. Reload the page to change it.",
    });
    expect(sendAuthEmail).not.toHaveBeenCalled();
  });

  it("asks the member to sign in again when the session has ended", async () => {
    vi.mocked(auth.api.setPassword).mockRejectedValue(
      authError("UNAUTHORIZED"),
    );

    const result = await setFirstPassword(GOOD);

    expect(result).toEqual({
      ok: false,
      error: "Your session has ended. Sign in again, then add the password.",
    });
  });

  it("turns an unexpected failure into the generic error, not a crash", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(auth.api.setPassword).mockRejectedValue(new Error("db down"));

    const result = await setFirstPassword(GOOD);

    expect(result.ok).toBe(false);
    expect(sendAuthEmail).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
