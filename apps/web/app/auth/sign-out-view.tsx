"use client";

import { useEffect, useState } from "react";
import { Button } from "@camp404/ui/components/button";
import { forgetAllWindows } from "@/components/os/window-storage";
import { loadDeviceToken } from "@/components/push/load-device-token";
import { authClient } from "@/lib/auth-client";

/**
 * How long sign-out waits for the token cleanup itself, counted from when its
 * code has loaded, so a slow download never eats the DELETE's time.
 */
export const FORGET_TOKEN_TIMEOUT_MS = 2000;

/** How long sign-out waits for the cleanup's code to download at all. */
export const LOAD_CLEANUP_TIMEOUT_MS = 10_000;

function wait(ms: number): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

/**
 * Load the push-token cleanup (a separate chunk: see load-device-token.ts),
 * then give the cleanup its own two seconds. A download that fails or takes
 * longer than LOAD_CLEANUP_TIMEOUT_MS is no reason to stay signed in.
 */
function forgetDeviceTokenInTime(): Promise<void> {
  return Promise.race([loadDeviceToken(), wait(LOAD_CLEANUP_TIMEOUT_MS)])
    .then((m) =>
      m
        ? Promise.race([m.forgetDeviceToken(), wait(FORGET_TOKEN_TIMEOUT_MS)])
        : null,
    )
    .then(() => undefined)
    .catch(() => undefined);
}

/**
 * /auth/sign-out: end the session, then go to sign-in. Every "Sign out" in the
 * app lands here (SignOutLink, and the redirect after erasing an account).
 * Neon Auth's hosted page did this before; with self-hosted Better Auth it is
 * ours, and without it a sign-out link would only have shown the sign-in form
 * to someone still signed in.
 *
 * Better Auth deletes the session row and clears the cookies. If that call
 * fails the screen says so, rather than leaving for sign-in as if it worked.
 *
 * It forgets this tab's desktop windows and editor drafts first, whatever the
 * way here: SignOutLink does it too, but erasure's server redirect and a
 * typed address never pass through that link.
 *
 * Then it forgets this device's push token, while the session still exists to
 * authorise the DELETE, so the next person on this phone does not get the last
 * member's notifications. That gets two seconds once its code has loaded (the
 * download, started on mount and already on "Sign out", gets up to ten); a
 * slow network never holds a member on a page they chose to leave. After erasure the session is already
 * gone and the DELETE is refused, but erasure deleted the tokens on the server,
 * and the Firebase side is still dropped here.
 */
export function SignOutView() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      forgetAllWindows(window.sessionStorage);
    } catch {
      // Storage refused (a private window): nothing was kept there.
    }
    forgetDeviceTokenInTime()
      .then(() => authClient.signOut())
      .then((result) => {
        if (cancelled) return;
        if (result?.error) {
          setFailed(true);
          return;
        }
        window.location.replace("/auth/sign-in");
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl">You may still be signed in</h1>
          <p role="alert" className="text-sm text-muted-foreground">
            Signing out didn&rsquo;t finish. Check your connection and try
            again.
          </p>
        </div>
        <Button onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  }

  return (
    <p role="status" className="text-center text-sm text-muted-foreground">
      Signing you out…
    </p>
  );
}
