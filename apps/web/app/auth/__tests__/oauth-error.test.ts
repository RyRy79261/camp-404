import { describe, expect, it } from "vitest";
import { oauthErrorSentence } from "../oauth-error";

// A refused Google link used to end on Better Auth's bare error page. Now the
// code comes back to the sign-in form, which must say what to do in a
// sentence and never echo what is in the URL.

describe("oauthErrorSentence", () => {
  it("says nothing on a plain visit", () => {
    expect(oauthErrorSentence(null)).toBeNull();
    expect(oauthErrorSentence(undefined)).toBeNull();
    expect(oauthErrorSentence("")).toBeNull();
  });

  it("explains how to fix a refused link, in either spelling of the code", () => {
    for (const code of ["account not linked", "account_not_linked"]) {
      const sentence = oauthErrorSentence(code);
      expect(sentence).toContain("hasn't confirmed its email yet");
      expect(sentence).toContain("Sign-in and security");
    }
  });

  it("names the other two link failures plainly", () => {
    expect(oauthErrorSentence("email_doesn't_match")).toContain(
      "different email",
    );
    expect(oauthErrorSentence("unable_to_link_account")).toContain(
      "couldn't be connected",
    );
  });

  it("falls back to a generic sentence and never echoes the code", () => {
    const code = "<script>alert(1)</script>";
    const sentence = oauthErrorSentence(code);
    expect(sentence).toBe("Google sign-in didn't finish. Try again.");
    expect(sentence).not.toContain(code);
    expect(oauthErrorSentence("state_mismatch")).toBe(
      "Google sign-in didn't finish. Try again.",
    );
  });
});
