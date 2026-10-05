import { after } from "next/server";

/**
 * Keep `promise` running after the response, inside the request's lifetime
 * (Next's after(), Vercel's waitUntil underneath). Better Auth hands its
 * emails here, so an answer never waits on Resend.
 *
 * Why it matters: forgot-password sends only when the address has an account.
 * Awaited, that send made the answer slower exactly then, and the timing told
 * anyone which addresses are members. In the background, every answer takes
 * the same path back.
 *
 * Outside a request (a script, a unit test) after() throws; the promise is
 * already running and Better Auth has already attached its error log, so it
 * simply finishes on its own.
 */
export function runAfterResponse(promise: Promise<unknown>): void {
  try {
    after(promise);
  } catch {
    // Not in a request: nothing to extend.
  }
}
