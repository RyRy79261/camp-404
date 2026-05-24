"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

/**
 * Sign-in bridge for the MCP OAuth authorize flow.
 *
 * `/api/mcp/oauth/authorize` redirects unauthenticated callers here with
 * `?next=<authorize-url>`. We sign the user in (Better Auth's `signIn`
 * returns the user to *this* page per the gotcha — not to the explicit
 * `callbackURL`), then a `useSession` effect detects the established
 * session and forwards to `next` via a hard navigation so the authorize
 * endpoint re-runs with the cookie set.
 */
export default function MCPConnectPage() {
  return (
    <Suspense fallback={<Shell>Loading…</Shell>}>
      <MCPConnectInner />
    </Suspense>
  );
}

function MCPConnectInner() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !session?.user) return;
    // Hard navigation, not router.push — `next` is an API route the App
    // Router won't reach.
    window.location.replace(next);
  }, [isPending, session, next]);

  const onGoogle = async () => {
    setError(null);
    const { error: err } = await authClient.signIn.social({
      provider: "google",
      callbackURL: typeof window !== "undefined" ? window.location.href : "/",
    });
    if (err) setError(err.message ?? "Sign-in failed.");
  };

  if (isPending) {
    return <Shell>Checking session…</Shell>;
  }

  if (session?.user) {
    return <Shell>Continuing to {next}…</Shell>;
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">Connect Claude to Camp 404</h1>
      <p className="text-sm text-[color:var(--color-muted-foreground)]">
        Sign in to grant Claude access to your camp data. You'll see what
        you're approving before the connection completes.
      </p>
      <button
        type="button"
        onClick={onGoogle}
        className="mt-4 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-4 py-2 text-sm font-medium"
      >
        Sign in with Google
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <p className="mt-4 text-xs text-[color:var(--color-muted-foreground)]">
        Don't have a camp account yet?{" "}
        <a className="underline" href="/signup">
          Sign up first
        </a>
        .
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-4 px-6 py-12">
      {children}
    </main>
  );
}

function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/"; // protocol-relative attack
  return raw;
}
