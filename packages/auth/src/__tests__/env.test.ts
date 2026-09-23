import { describe, expect, it } from "vitest";
import {
  authConfigWarnings,
  authMayServe,
  isEmailProviderConfigured,
  resolveBaseURL,
  resolvePasskeyOrigins,
  resolvePasskeyRpID,
  resolveRateLimit,
  resolveRequireEmailVerification,
  resolveTrustedOrigins,
  resolveUseSecureCookies,
} from "../env";

// How the auth config reads its environment. Each case seeds the opposite
// too, so an assertion cannot pass on a constant.

const PROD = {
  VERCEL_ENV: "production",
  VERCEL_URL: "camp-404-web-abc123.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "www.camp-404.com",
};

describe("authMayServe", () => {
  it("fails closed on a deployment without the secret, and nowhere else", () => {
    expect(authMayServe({ VERCEL_ENV: "production" })).toBe(false);
    expect(authMayServe({ VERCEL_ENV: "preview" })).toBe(false);
    expect(authMayServe({ VERCEL_ENV: "preview", BETTER_AUTH_SECRET: " " })).toBe(
      false,
    );
    expect(
      authMayServe({ VERCEL_ENV: "production", BETTER_AUTH_SECRET: "s".repeat(32) }),
    ).toBe(true);
    // Local dev and CI: no Vercel, the placeholder is allowed.
    expect(authMayServe({})).toBe(true);
  });
});

describe("resolveBaseURL", () => {
  it("prefers the explicit URL", () => {
    expect(
      resolveBaseURL({ ...PROD, BETTER_AUTH_URL: "https://www.camp-404.com" }),
    ).toBe("https://www.camp-404.com");
  });

  it("uses the production host in production, never the one-off deployment host", () => {
    expect(resolveBaseURL(PROD)).toBe("https://www.camp-404.com");
    expect(resolveBaseURL({ ...PROD, VERCEL_ENV: "preview" })).toBe(
      "https://camp-404-web-abc123.vercel.app",
    );
  });

  it("leaves it to the request when nothing is set", () => {
    expect(resolveBaseURL({})).toBeUndefined();
  });
});

describe("resolveTrustedOrigins", () => {
  it("trusts every host the deployment is served on, and the apex with and without www", () => {
    const origins = resolveTrustedOrigins({
      ...PROD,
      VERCEL_BRANCH_URL: "camp-404-web-git-main.vercel.app",
      AUTH_APEX_DOMAIN: "camp-404.com",
    });
    expect(origins.sort()).toEqual(
      [
        "https://camp-404-web-abc123.vercel.app",
        "https://camp-404-web-git-main.vercel.app",
        "https://camp-404.com",
        "https://www.camp-404.com",
      ].sort(),
    );
    // Never a wildcard.
    expect(origins.some((o) => o.includes("*"))).toBe(false);
  });
});

describe("passkey scope", () => {
  it("binds to the apex when the site is served under it, so www and bare share a passkey", () => {
    const env = { ...PROD, AUTH_APEX_DOMAIN: "camp-404.com" };
    expect(resolvePasskeyRpID(env)).toBe("camp-404.com");
    expect(resolvePasskeyOrigins(env)?.sort()).toEqual([
      "https://camp-404.com",
      "https://www.camp-404.com",
    ]);
  });

  it("leaves the scope to the request off the apex (a preview, localhost, no apex set)", () => {
    const preview = {
      ...PROD,
      VERCEL_ENV: "preview",
      AUTH_APEX_DOMAIN: "camp-404.com",
    };
    expect(resolvePasskeyRpID(preview)).toBeUndefined();
    expect(resolvePasskeyOrigins(preview)).toBeUndefined();
    expect(resolvePasskeyRpID(PROD)).toBeUndefined();
  });
});

describe("email verification", () => {
  const PROVIDER = { RESEND_API_KEY: "re_x", RESEND_FROM_EMAIL: "Camp <n@x>" };

  it("stays off unless turned on, because today's accounts were never verified", () => {
    expect(resolveRequireEmailVerification(PROVIDER)).toBe(false);
    expect(
      resolveRequireEmailVerification({
        ...PROVIDER,
        BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION: "true",
      }),
    ).toBe(true);
  });

  it("can never be on without a provider — a gate nobody can pass is a lockout", () => {
    expect(
      resolveRequireEmailVerification({
        RESEND_API_KEY: "re_x",
        BETTER_AUTH_REQUIRE_EMAIL_VERIFICATION: "true",
      }),
    ).toBe(false);
    expect(isEmailProviderConfigured({ RESEND_API_KEY: "re_x" })).toBe(false);
    expect(isEmailProviderConfigured(PROVIDER)).toBe(true);
  });
});

describe("secure cookies", () => {
  it("turns Secure off only for an explicit http origin", () => {
    expect(resolveUseSecureCookies({ BETTER_AUTH_URL: "http://localhost:3000" })).toBe(
      false,
    );
    expect(resolveUseSecureCookies(PROD)).toBeUndefined();
    expect(resolveUseSecureCookies({})).toBeUndefined();
  });
});

describe("rate limit tuning", () => {
  it("keeps Better Auth's defaults unless told, and raises the sensitive paths with the global", () => {
    expect(resolveRateLimit({})).toEqual({});
    const tuned = resolveRateLimit({
      AUTH_RATE_LIMIT_WINDOW_SECONDS: "10",
      AUTH_RATE_LIMIT_MAX: "500",
    });
    expect(tuned.max).toBe(500);
    expect(tuned.customRules?.["/sign-in/email"]).toEqual({
      window: 10,
      max: 500,
    });
  });
});

describe("authConfigWarnings", () => {
  it("says sign-in is off on a deployment with no secret", () => {
    expect(authConfigWarnings({ VERCEL_ENV: "preview" }).join(" ")).toMatch(
      /sign-in is OFF/,
    );
    expect(
      authConfigWarnings({
        VERCEL_ENV: "preview",
        BETTER_AUTH_SECRET: "s".repeat(32),
        RESEND_API_KEY: "re_x",
        RESEND_FROM_EMAIL: "n@x",
      }),
    ).toEqual([]);
  });
});
