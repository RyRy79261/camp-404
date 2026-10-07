import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DrizzleQueryError } from "drizzle-orm";

import { runAction } from "@/lib/action-result";

describe("runAction", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a successful result straight through", async () => {
    const result = await runAction("ok", async () => ({
      ok: true as const,
      requestId: "req-1",
    }));
    expect(result).toEqual({ ok: true, requestId: "req-1" });
  });

  it("passes a typed failure straight through, message intact", async () => {
    // Validation/authz failures are the action's own copy — not our business.
    const result = await runAction("gate", async () => ({
      ok: false as const,
      error: "Captain access only.",
    }));
    expect(result).toEqual({ ok: false, error: "Captain access only." });
  });

  it("converts a throw into the typed failure arm", async () => {
    const result = await runAction("boom", async () => {
      throw new Error("kaboom");
    });
    expect(result.ok).toBe(false);
  });

  it("does not leak a DB error message nested under .cause", async () => {
    // The shape packages/db throws: a wrapper Error whose `.cause` carries the
    // driver's message, which names the table, column and sometimes the value.
    const driver = new Error(
      'duplicate key value violates unique constraint "invite_codes_pkey"',
    );
    const dbError = new Error("Failed query: insert into invite_codes", {
      cause: driver,
    });

    const result = await runAction("createInvite", async () => {
      throw dbError;
    });

    expect(result.ok).toBe(false);
    const message = (result as { error: string }).error;
    expect(message).not.toContain("invite_codes");
    expect(message).not.toContain("duplicate key");
    expect(message).not.toContain("Failed query");
    expect(message).toBe("Something went wrong. Please try again.");
  });

  it("logs the error's class for the server operator", async () => {
    await runAction("boom", async () => {
      throw new TypeError("kaboom");
    });
    expect(console.error).toHaveBeenCalledWith("[action:boom]", "TypeError");
  });

  it("logs a failed query's class and SQLSTATE, never the values it was saving", async () => {
    // drizzle's own error: the message is the query and its params, here a
    // member's emergency contact and allergy.
    const pg = Object.assign(new Error("value too long"), { code: "22001" });
    const err = new DrizzleQueryError(
      'update "users" set "emergency_contacts" = $1, "allergies" = $2',
      ['[{"name":"Mom","phone":"+27 82 555 0100"}]', "peanuts"],
      pg,
    );
    await runAction("saveProfile", async () => {
      throw err;
    });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("DrizzleQueryError (22001)");
    expect(logged).not.toContain("0100");
    expect(logged).not.toContain("peanuts");
    expect(logged).not.toContain("emergency_contacts");
  });

  it("re-throws Next's redirect control flow instead of swallowing it", async () => {
    // `redirect()` signals by throwing; an action that redirects on success
    // must keep working when wrapped.
    const redirectError = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/profile;307;",
    });
    await expect(
      runAction("profile", async () => {
        throw redirectError;
      }),
    ).rejects.toBe(redirectError);
  });

  it("handles a non-Error throw", async () => {
    const result = await runAction("weird", async () => {
      throw "just a string";
    });
    expect(result).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
  });

  it("builds an action's own failure arm when it has one", async () => {
    const result = await runAction(
      "publish",
      async (): Promise<{ ok: true } | { ok: false; errors: string[] }> => {
        throw new Error('relation "questionnaire_versions" does not exist');
      },
      (message) => ({ ok: false as const, errors: [message], issues: [] }),
    );
    expect(result).toEqual({
      ok: false,
      errors: ["Something went wrong. Please try again."],
      issues: [],
    });
  });
});
