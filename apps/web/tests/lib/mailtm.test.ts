import { afterEach, describe, expect, it, vi } from "vitest";

// Unit tests for the mail.tm helper's deadline handling. The helper is only used
// by the Playwright suite, but this file deliberately sits OUTSIDE tests/e2e/:
// playwright.config.ts points testDir at ./tests/e2e and its default testMatch
// claims `*.test.ts` alongside `*.spec.ts`, so a vitest file next to the helper
// would be collected by both runners.
//
// The property under test: `waitForEmail`'s deadline has to cancel the in-flight
// request, not merely be consulted between attempts. Node's fetch has no timeout,
// so a server that accepts a connection and never answers used to hang the poll
// past its timeout for as long as the socket stayed open.

import { waitForEmail, type Inbox } from "../e2e/lib/mailtm";

const inbox: Inbox = {
  address: "e2e-test@example.test",
  password: "pw",
  token: "tok",
};

/** A 200 whose body is `payload`, shaped like the bits of Response req reads. */
function ok(payload: unknown) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  };
}

const message = {
  id: "m1",
  from: { address: "no-reply@auth.test" },
  subject: "Verify your email",
  text: "code 123456",
};

describe("waitForEmail", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aborts a request that never answers instead of waiting past the deadline", async () => {
    // Accepts the call and never settles — the abort signal is its only exit.
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit = {}) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason ?? new Error("aborted")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const started = Date.now();
    await expect(waitForEmail(inbox, () => true, 300)).rejects.toThrow(
      "timed out waiting for a matching email",
    );
    // Real timers on purpose: before the signal existed this call never
    // returned, so "it settles at all" is half the assertion.
    expect(Date.now() - started).toBeLessThan(2_000);
    // A deadline abort is not a transient error, so no retry follows it.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("passes an already-armed signal to every request", async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit = {}) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("x")));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(waitForEmail(inbox, () => true, 200)).rejects.toThrow();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(true);
  });

  it("still retries an ordinary network error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(ok({ "hydra:member": [{ id: "m1" }] }))
      .mockResolvedValueOnce(ok(message));
    vi.stubGlobal("fetch", fetchMock);

    const pending = waitForEmail(
      inbox,
      (m) => m.subject === "Verify your email",
      90_000,
    );
    // Past the first backoff (~1s) with room to spare, well short of the 90s.
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(pending).resolves.toMatchObject({ id: "m1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry a real 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(waitForEmail(inbox, () => true, 90_000)).rejects.toThrow(
      "mail.tm 401 on /messages: Unauthorized",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
