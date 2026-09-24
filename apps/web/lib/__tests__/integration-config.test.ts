import { describe, expect, it } from "vitest";
import {
  envList,
  feedbackTracker,
  firebaseAdminCredentials,
  founderEmails,
  founderEmailsUseOldName,
  isEmailConfigured,
  isWebPushConfigured,
  webPushConfigFromEnv,
} from "../integration-config";

describe("founder addresses", () => {
  it("reads FOUNDER_EMAILS first, and the old GOD_EMAILS name only when it is empty", () => {
    expect(
      founderEmails({ FOUNDER_EMAILS: "a@x.io", GOD_EMAILS: "b@x.io" }),
    ).toEqual(["a@x.io"]);
    expect(
      founderEmails({ FOUNDER_EMAILS: " ", GOD_EMAILS: "b@x.io" }),
    ).toEqual(["b@x.io"]);
    expect(founderEmails({})).toEqual([]);
  });

  it("says when only the old name is set", () => {
    expect(founderEmailsUseOldName({ GOD_EMAILS: "b@x.io" })).toBe(true);
    expect(
      founderEmailsUseOldName({
        FOUNDER_EMAILS: "a@x.io",
        GOD_EMAILS: "b@x.io",
      }),
    ).toBe(false);
    expect(founderEmailsUseOldName({})).toBe(false);
  });
});

describe("integration config", () => {
  it("splits an env list and drops empty entries", () => {
    expect(envList(" a@x.com, ,b@x.com ")).toEqual(["a@x.com", "b@x.com"]);
    expect(envList(undefined)).toEqual([]);
  });

  it("needs both Resend settings for email", () => {
    expect(isEmailConfigured({ RESEND_API_KEY: "k" })).toBe(false);
    expect(
      isEmailConfigured({ RESEND_API_KEY: "k", RESEND_FROM_EMAIL: "a@b.c" }),
    ).toBe(true);
  });

  it("needs all three push credentials, and restores the PEM newlines", () => {
    expect(firebaseAdminCredentials({ FIREBASE_PROJECT_ID: "p" })).toBeNull();
    expect(
      firebaseAdminCredentials({
        FIREBASE_PROJECT_ID: "p",
        FIREBASE_CLIENT_EMAIL: "e",
        FIREBASE_PRIVATE_KEY: "line1\\nline2",
      }),
    ).toEqual({ projectId: "p", clientEmail: "e", privateKey: "line1\nline2" });
  });

  it("needs every browser push key, the VAPID key included", () => {
    const env = {
      NEXT_PUBLIC_FIREBASE_API_KEY: "a",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "p",
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "s",
      NEXT_PUBLIC_FIREBASE_APP_ID: "i",
    };
    expect(isWebPushConfigured(webPushConfigFromEnv(env))).toBe(false);
    expect(
      isWebPushConfigured(
        webPushConfigFromEnv({ ...env, NEXT_PUBLIC_FIREBASE_VAPID_KEY: "v" }),
      ),
    ).toBe(true);
  });

  it("resolves the bug-report repository, or says why not", () => {
    expect(feedbackTracker({})).toEqual({ ok: false, reason: "no_token" });
    expect(
      feedbackTracker({
        GITHUB_FEEDBACK_TOKEN: "t",
        GITHUB_FEEDBACK_REPO: "x",
      }),
    ).toEqual({ ok: false, reason: "bad_repo" });
    expect(feedbackTracker({ GITHUB_FEEDBACK_TOKEN: "t" })).toEqual({
      ok: true,
      token: "t",
      owner: "RyRy79261",
      name: "camp-404",
    });
  });
});
