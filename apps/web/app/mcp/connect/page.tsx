"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Card } from "@camp404/ui/components/card";
import { OAuthButton } from "@camp404/ui/components/google-button";
import { authClient } from "@/lib/auth-client";

/**
 * Sign-in bridge for the MCP OAuth authorize flow (board S20 — Bridge Card).
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
    <Shell>
      <h1 className="text-title font-bold text-foreground">Connect Claude</h1>
      <Card className="flex flex-col gap-4 p-5">
        <p className="text-sm text-card-foreground">
          You&apos;ll see exactly what you&apos;re approving before anything
          connects.
        </p>
        <OAuthButton
          label="Sign in with Google"
          onClick={onGoogle}
          disabled={loading}
        />
        {error && (
          <Alert variant="error">
            <TriangleAlert />
            <span>{error}</span>
          </Alert>
        )}
        <p className="text-center text-sm text-muted-foreground">
          New to Camp 404?{" "}
          <a
            className="font-semibold text-accent hover:underline"
            href="/auth/sign-in"
          >
            Sign in
          </a>
        </p>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
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
