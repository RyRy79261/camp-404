"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@camp404/ui/components/button";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { authClient } from "@/lib/auth-client";

// Forgot password, in the AfrikaBurn contributors app's form. Under Neon Auth
// this screen was Neon's hosted page; self-hosting means building it.
//
// ENUMERATION-SAFE BY DESIGN: the same sentence shows whether or not an account
// has that email, and it shows in place of the form rather than after a
// redirect, because a redirect that only happens on success is itself an
// answer. Better Auth answers success either way too.

const SENT =
  "If an account uses that email, we've sent it a link to reset the password.";

export function ForgotPasswordForm({ emailEnabled }: { emailEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!emailEnabled) {
    // A reset link can only arrive by email. Saying so beats a form that
    // pretends to send one.
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl">Password reset is off</h1>
          <p className="text-sm text-muted-foreground">
            This camp has not set up email yet, so a reset link has no way to
            reach you. Ask a captain for help getting back in.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/auth/sign-in">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter the email you sign in with.");
      return;
    }
    setPending(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: trimmed,
        redirectTo: "/auth/reset-password",
      });
      // Only a transport or rate-limit failure lands here; an unknown email
      // does not, so this cannot say whether an account exists.
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many requests. Wait a few minutes and try again."
            : "Something went wrong. Try again in a moment.",
        );
        return;
      }
      setSent(true);
    } catch {
      setError("Something went wrong. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Check your inbox
          </p>
          <h1 className="text-2xl">Reset link sent</h1>
        </div>
        <p role="status" className="text-sm text-muted-foreground">
          {SENT}
        </p>
        <p className="text-xs text-muted-foreground">
          The link works once and expires in an hour. If nothing arrives, check
          your spam folder before asking for another.
        </p>
        <Button variant="outline" asChild>
          <Link href="/auth/sign-in">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Account recovery
        </p>
        <h1 className="text-2xl">Forgot your password?</h1>
        <p className="text-sm text-muted-foreground">
          Enter the email you sign in with and we&rsquo;ll send a single-use
          reset link.
        </p>
      </div>

      <Field label="Email" htmlFor="forgot-email">
        <Input
          id="forgot-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          required
        />
      </Field>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link
          href="/auth/sign-in"
          className="font-medium text-primary hover:underline"
        >
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
