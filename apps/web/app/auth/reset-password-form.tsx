"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PASSWORD_MIN_LENGTH } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { Field } from "@camp404/ui/components/field";
import { PasswordInput } from "@camp404/ui/components/password-input";
import { toast } from "@camp404/ui/components/toast";
import { authClient } from "@/lib/auth-client";

// Set a new password from an emailed link, in the AfrikaBurn contributors
// app's form. Better Auth's `reset-password` checks the token, and
// `revokeSessionsOnPasswordReset` (@camp404/auth) signs every device out,
// which is what the note under the button promises.
//
// Split in two so the form only ever exists with a token in hand: a missing
// or refused token is a different screen, not a disabled state.

export function ResetPasswordForm({ token }: { token: string | null }) {
  if (!token) return <UnusableLink />;
  return <ResetForm token={token} />;
}

function UnusableLink() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">This link can&rsquo;t be used</h1>
        <p className="text-sm text-muted-foreground">
          Reset links work once and expire after an hour. This one has been
          used, has expired, or lost its code on the way.
        </p>
      </div>
      <Button asChild>
        <Link href="/auth/forgot-password">Send a new link</Link>
      </Button>
    </div>
  );
}

function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const longEnough = password.length >= PASSWORD_MIN_LENGTH;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!longEnough) {
      setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setPending(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        setError(
          /token/i.test(result.error.message ?? "")
            ? "This link has expired or was already used. Send yourself a new one."
            : (result.error.message ?? "That didn't work. Try again."),
        );
        return;
      }
      toast.success("Password reset. Sign in with the new one.");
      router.push("/auth/sign-in");
    } catch {
      setError("Something went wrong. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Set a new password
        </p>
        <h1 className="text-2xl">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">
          Pick something long and memorable. This link works once.
        </p>
      </div>

      <Field
        label="New password"
        htmlFor="reset-password"
        help={`At least ${PASSWORD_MIN_LENGTH} characters — passphrases welcome`}
      >
        <PasswordInput
          id="reset-password"
          name="newPassword"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          required
        />
      </Field>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending || !longEnough}>
        {pending ? "Resetting…" : "Reset password"}
      </Button>

      <p className="text-xs text-muted-foreground">
        This signs you out everywhere. You&rsquo;ll enter the new password on
        each device.
      </p>
    </form>
  );
}
