"use client";

import { useEffect, useState } from "react";
import { Button } from "@camp404/ui/components/button";
import { forgetAllWindows } from "@/components/os/window-storage";
import { authClient } from "@/lib/auth-client";

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
    authClient
      .signOut()
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
