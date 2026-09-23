import { afterEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_MIN_LENGTH } from "@camp404/core";
import { buildAuthOptions } from "../config";
import { buildAuthEmail, sendAuthEmail } from "../email";

// The options that make this login safer than the one it replaces. Each is a
// line someone could delete without any other test noticing.

describe("buildAuthOptions", () => {
  const options = buildAuthOptions({});

  it("enforces the form's password rule on the server", () => {
    expect(options.emailAndPassword.minPasswordLength).toBe(
      PASSWORD_MIN_LENGTH,
    );
  });

  it("signs every device out on a password reset", () => {
    expect(options.emailAndPassword.revokeSessionsOnPasswordReset).toBe(true);
  });

  it("keeps the change-email endpoint unmounted", () => {
    expect(options.user.changeEmail.enabled).toBe(false);
  });

  it("stores rate-limit counters in the database, shared by every instance", () => {
    expect(options.rateLimit.storage).toBe("database");
  });

  it("offers two-factor and passkeys", () => {
    expect(options.plugins.map((p) => p.id).sort()).toEqual([
      "passkey",
      "two-factor",
    ]);
  });

  it("offers Google only when both keys are set", () => {
    expect("socialProviders" in options).toBe(false);
    expect(
      "socialProviders" in
        buildAuthOptions({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }),
    ).toBe(true);
    expect(
      "socialProviders" in buildAuthOptions({ GOOGLE_CLIENT_ID: "id" }),
    ).toBe(false);
  });

  it("sends a verification mail on sign-up only when one can be delivered", () => {
    expect(options.emailVerification.sendOnSignUp).toBe(false);
    expect(
      buildAuthOptions({ RESEND_API_KEY: "re_x", RESEND_FROM_EMAIL: "n@x" })
        .emailVerification.sendOnSignUp,
    ).toBe(true);
    expect(
      buildAuthOptions({ E2E_TEST_MODE: "1", AUTH_EMAIL_CAPTURE_FILE: "/f" })
        .emailVerification.sendOnSignUp,
    ).toBe(true);
    expect(
      buildAuthOptions({
        E2E_TEST_MODE: "1",
        AUTH_EMAIL_CAPTURE_FILE: "/f",
        VERCEL_ENV: "production",
      }).emailVerification.sendOnSignUp,
    ).toBe(false);
  });

  it("signs with the real secret when one is set", () => {
    expect(buildAuthOptions({ BETTER_AUTH_SECRET: "real-secret" }).secret).toBe(
      "real-secret",
    );
    expect(options.secret).not.toBe("real-secret");
  });
});

describe("auth email", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("puts the link in the reset email", () => {
    const email = buildAuthEmail({
      to: "a@example.com",
      kind: "reset",
      url: "https://www.camp-404.com/reset?token=abc",
    });
    expect(email.text).toContain("https://www.camp-404.com/reset?token=abc");
  });

  it("tells the member a password was added, and how to undo it", () => {
    const email = buildAuthEmail({ to: "a@example.com", kind: "password-set" });
    expect(email.subject).toContain("password was added");
    expect(email.text).toContain("Forgot your password?");
  });

  it("keeps a working reset link out of a deployment's logs", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const url = "https://www.camp-404.com/reset?token=secret-token";

    await sendAuthEmail(
      { VERCEL_ENV: "production" },
      {
        to: "a@example.com",
        kind: "reset",
        url,
      },
    );
    expect(log.mock.calls.flat().join(" ")).not.toContain("secret-token");

    // Locally the link is the point of the log.
    await sendAuthEmail({}, { to: "a@example.com", kind: "reset", url });
    expect(log.mock.calls.flat().join(" ")).toContain("secret-token");
  });

  it("sends to exactly one recipient through Resend, and never throws", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = { RESEND_API_KEY: "re_x", RESEND_FROM_EMAIL: "Camp <n@x>" };

    expect(
      await sendAuthEmail(env, {
        to: "a@example.com",
        kind: "verify",
        url: "u",
      }),
    ).toBe(true);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.to).toEqual(["a@example.com"]);
    expect(body.from).toBe("Camp <n@x>");

    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    expect(
      await sendAuthEmail(env, {
        to: "a@example.com",
        kind: "verify",
        url: "u",
      }),
    ).toBe(false);
  });
});
