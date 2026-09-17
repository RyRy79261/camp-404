"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { authClient } from "@/lib/auth-client";

/**
 * Email/password sign-up form, in the AfrikaBurn auth form's markup. We
 * deliberately don't ask for a name — it goes through silently as the email so Better Auth's required field is satisfied.
 * Camp 404's displayName is reconciled later from the burner profile if
 * we ever need a richer string.
 */
export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.signUp.email({
        email: trimmedEmail,
        password,
        name: trimmedEmail,
        callbackURL: "/",
      });
      if (result && "error" in result && result.error) {
        setError(result.error.message ?? "Sign up failed");
        setLoading(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      // Aim the return trip at /auth (not /) so Neon Auth's verifier
      // exchange — which runs inside the proxy middleware on /auth/* —
      // actually fires before we try to read the session. /auth/page.tsx
      // then forwards us home, which routes onward to the questionnaire.
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/auth",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign up failed");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Set a password or continue with Google. We&apos;ll ask the rest in the
          questionnaire.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="signup-confirm-password">Confirm password</Label>
        <Input
          id="signup-confirm-password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "Creating account…" : "Create account"}
      </Button>

      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          or
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={handleGoogle}
        disabled={loading}
      >
        Continue with Google
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          className="font-medium text-primary hover:underline"
          href="/auth/sign-in"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
