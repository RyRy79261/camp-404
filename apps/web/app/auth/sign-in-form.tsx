"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { Divider } from "@camp404/ui/components/divider";
import { InputField } from "@camp404/ui/components/input-field";
import { OAuthButton } from "@camp404/ui/components/google-button";
import { authClient } from "@/lib/auth-client";

/**
 * Email/password + Google sign-in form, mirroring the intake-tracker
 * login-04 block. No invite-code field — invite-only enforcement lives
 * after auth at the /signup/required gate.
 */

function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/")) return "/";
  if (raw.startsWith("//")) return "/";
  return raw;
}

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackURL = safeCallbackUrl(searchParams.get("callbackURL"));
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-forward when a social sign-in lands the user back here with an
  // active session and a non-default callbackURL. Mirrors the
  // intake-tracker pattern — without this the user sees the form again
  // even though they're already authenticated.
  useEffect(() => {
    if (sessionPending) return;
    if (!session?.user) return;
    if (callbackURL === "/") return;
    window.location.replace(callbackURL);
  }, [sessionPending, session, callbackURL]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Email is required");
      return;
    }
    if (!password) {
      setError("Password is required");
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.signIn.email({
        email: trimmedEmail,
        password,
        callbackURL,
      });
      if (result && "error" in result && result.error) {
        setError(result.error.message ?? "Sign in failed");
        setLoading(false);
        return;
      }
      router.replace(callbackURL);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      // Always route the social return-trip through /auth so Neon Auth's
      // verifier exchange (proxy middleware on /auth/*) fires before we
      // read the session. /auth/page.tsx forwards us home from there.
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/auth",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign in failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h1 className="text-subtitle-hero font-bold text-card-foreground">
          Welcome back
        </h1>
        <p className="text-label text-muted-foreground">
          Sign in to your Camp 404 account.
        </p>
      </div>

      <InputField
        id="signin-email"
        label="Email"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
      />

      <InputField
        id="signin-password"
        label="Password"
        type="password"
        placeholder="••••••••"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={loading}
      />

      <div className="flex justify-end">
        <Link
          href="/auth/forgot-password"
          className="text-label font-medium text-accent hover:underline"
        >
          Forgot your password?
        </Link>
      </div>

      {error && (
        <Alert variant="error">
          <TriangleAlert />
          <span>{error}</span>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>

      <div className="flex items-center gap-2.5">
        <Divider className="flex-1" />
        <span className="text-micro text-muted-foreground">
          Or continue with
        </span>
        <Divider className="flex-1" />
      </div>

      <OAuthButton onClick={handleGoogle} disabled={loading} />
    </form>
  );
}
