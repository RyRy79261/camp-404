"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plug } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { AuthShell } from "@/components/auth-shell";
import { authClient } from "@/lib/auth-client";
import { safeInternalPath } from "@/lib/safe-redirect";

/**
 * Sign-in bridge for the MCP OAuth authorize flow, drawn as the auth card.
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
  const next = safeInternalPath(params.get("next"));
  const { data: session, isPending } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isPending || !session?.user) return;
    // Hard navigation, not router.push — `next` is an API route the App
    // Router won't reach.
    window.location.replace(next);
  }, [isPending, session, next]);

  const onGoogle = async () => {
    setError(null);
    setLoading(true);
    const { error: err } = await authClient.signIn.social({
      provider: "google",
      callbackURL: typeof window !== "undefined" ? window.location.href : "/",
    });
    // On success the browser navigates to Google; we only land here on failure.
    if (err) {
      setError(err.message ?? "Sign-in failed.");
      setLoading(false);
    }
  };

  if (isPending) {
    return <Shell>Checking session…</Shell>;
  }

  if (session?.user) {
    return <Shell>Continuing to {next}…</Shell>;
  }

  return (
    <AuthShell icon={<Plug aria-hidden />}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl">Connect Claude</h1>
          <p className="text-sm text-muted-foreground">
            You&apos;ll see exactly what you&apos;re approving before anything
            connects.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onGoogle}
          disabled={loading}
        >
          Sign in with Google
        </Button>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <p className="text-center text-sm text-muted-foreground">
          New to Camp 404?{" "}
          <a
            className="font-medium text-primary hover:underline"
            href="/auth/sign-in"
          >
            Sign in
          </a>
        </p>
      </div>
    </AuthShell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AuthShell icon={<Plug aria-hidden />}>
      <p className="text-center text-sm text-muted-foreground">{children}</p>
    </AuthShell>
  );
}
