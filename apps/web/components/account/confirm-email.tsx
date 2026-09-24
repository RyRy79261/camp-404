"use client";

import * as React from "react";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { authClient } from "@/lib/auth-client";

// Confirm-your-email, for an account the auth server has not seen prove its
// address. Members moved from Neon Auth with a password were never asked, so
// they arrive unverified, and until they confirm: camp emails skip them,
// Google sign-in refuses to join their account and passkeys and two-factor
// cannot be added (on purpose, see @camp404/auth's config and email-proof),
// and a GOD_EMAILS owner has no recovery path.
//
// There is no AfrikaBurn equivalent, so this is composed exactly like the
// Password card on Sign-in and security: a title, a sentence, one button.
//
// No limiter of our own: Better Auth already allows /send-verification-email
// 3 times a minute per IP in production, and answers 429 past that.

export interface ConfirmEmailProps {
  /** The session's own address; Better Auth sends only to that one. */
  email: string;
  /** False when the camp has no way to send email (no provider set up). */
  deliverable: boolean;
  /** Where the link in the email lands once it has confirmed the address. */
  callbackURL: string;
  /** Overrides the sentence under the title, for a screen with its own context. */
  description?: React.ReactNode;
  /** Overrides the sentence shown when the camp cannot send email. */
  undeliverable?: React.ReactNode;
}

export function ConfirmEmail({
  email,
  deliverable,
  callbackURL,
  description,
  undeliverable,
}: ConfirmEmailProps) {
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  async function send() {
    setError(null);
    setPending(true);
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL,
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many requests. Wait a minute and try again."
            : result.error.code === "EMAIL_ALREADY_VERIFIED"
              ? "Your email is already confirmed. Reload the page."
              : "Couldn't send the link. Try again in a moment.",
        );
        return;
      }
      setSent(true);
    } catch {
      setError("Couldn't send the link. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email</CardTitle>
        <CardDescription>
          {deliverable
            ? (description ?? (
                <>
                  Confirm that <span className="text-foreground">{email}</span>{" "}
                  is yours. Camp emails only go to a confirmed address, and
                  Google sign-in, passkeys and two-factor need one too.
                </>
              ))
            : (undeliverable ??
              "This camp has not set up email yet, so your address can't be confirmed. Ask a captain.")}
        </CardDescription>
      </CardHeader>
      {deliverable ? (
        <CardContent className="flex flex-col gap-3">
          {sent ? (
            <p role="status" className="text-sm text-muted-foreground">
              We&rsquo;ve sent a link to{" "}
              <span className="text-foreground">{email}</span>. It expires in an
              hour.
            </p>
          ) : (
            <div>
              <Button size="sm" onClick={send} disabled={pending}>
                {pending ? "Sending…" : "Confirm my email"}
              </Button>
            </div>
          )}
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
