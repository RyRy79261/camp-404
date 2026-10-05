import { afterEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

// Forgot-password must not tell anyone which addresses are members. Better
// Auth sends the reset email only when the account exists; awaited, that send
// made those answers slower. The emails run after the response instead
// (core-pkgs-1).

const after = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after }));

// A send that never finishes: an answer that waited on it would never come.
const sendAuthEmail = vi.hoisted(() =>
  vi.fn(() => new Promise<void>(() => undefined)),
);
vi.mock("../email", () => ({ sendAuthEmail }));

import { runAfterResponse } from "../background";
import { buildAuthOptions } from "../config";

afterEach(() => {
  after.mockReset();
  sendAuthEmail.mockClear();
});

function withinOneSecond<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("the answer waited")), 1_000),
    ),
  ]);
}

describe("auth emails run after the response", () => {
  it("answers forgot-password at once whether or not the account exists", async () => {
    const background = vi.fn();
    const options = buildAuthOptions({}, { runInBackground: background });
    const db: Record<string, unknown[]> = {
      user: [],
      session: [],
      account: [],
      verification: [],
      rateLimit: [],
      twoFactor: [],
      passkey: [],
    };
    const auth = betterAuth({
      ...options,
      database: memoryAdapter(db),
      rateLimit: { enabled: false },
      emailVerification: { ...options.emailVerification, sendOnSignUp: false },
    });
    await auth.api.signUpEmail({
      body: {
        name: "Ada",
        email: "ada@example.com",
        password: "a-long-enough-password-1",
      },
    });

    const member = await withinOneSecond(
      auth.api.requestPasswordReset({ body: { email: "ada@example.com" } }),
    );
    const stranger = await withinOneSecond(
      auth.api.requestPasswordReset({ body: { email: "nobody@example.com" } }),
    );
    expect(member).toEqual(stranger);

    // Only the member's reset was sent, and it went to the background.
    expect(sendAuthEmail).toHaveBeenCalledOnce();
    expect(background).toHaveBeenCalledOnce();
    expect(background.mock.calls[0]![0]).toBeInstanceOf(Promise);
  });

  it("uses Next's after() by default", () => {
    const options = buildAuthOptions({});
    const task = Promise.resolve();
    options.advanced.backgroundTasks.handler(task);
    expect(after).toHaveBeenCalledWith(task);
  });

  it("lets the work finish on its own outside a request", () => {
    after.mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    expect(() => runAfterResponse(Promise.resolve())).not.toThrow();
  });
});
