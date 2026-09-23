"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Tent, TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { CodeDisplay } from "@camp404/ui/components/code-display";
import { ConfirmEmail } from "@/components/account/confirm-email";
import { GateScreen } from "@/components/auth-shell";
import { SignOutLink } from "@/components/auth/sign-out-link";
import { completeSetupAction } from "./actions";

/**
 * First-time setup wizard. Shown once, on a fresh system, to the first
 * signed-in person. Confirms they're founding the camp; the action elects them
 * captain and mints the root invite code, then sends them into the normal
 * onboarding questionnaire. Drawn as the AfrikaBurn organiser gate screen.
 */
export function SetupWizard({
  displayName,
  founderCode,
}: {
  displayName: string;
  founderCode: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <GateScreen
      icon={<Tent aria-hidden />}
      eyebrow="First-time setup"
      title="Set up Camp 404"
      description={
        <>
          You&rsquo;re the first one here, {displayName}. This makes you the
          founding <strong className="text-foreground">captain</strong> and
          creates your camp&rsquo;s root invite code to bring everyone else in.
        </>
      }
    >
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
          <p className="text-xs text-muted-foreground">
            Your camp&rsquo;s root invite code
          </p>
          <CodeDisplay code={founderCode} aria-label="Root invite code" />
          <p className="mt-2 text-xs text-muted-foreground">
            Next you&rsquo;ll complete your own burner profile, like everyone
            else. This setup only ever runs once.
          </p>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="error">
          <TriangleAlert aria-hidden />
          <span>{error}</span>
        </Alert>
      )}

      <div className="flex items-center justify-center">
        <Button
          type="button"
          size="lg"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                const result = await completeSetupAction();
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                router.push("/");
              } catch {
                setError(
                  "Couldn't set up the camp just now. Please try again — if it keeps happening, check the server logs.",
                );
              }
            })
          }
        >
          {pending ? "Setting up…" : "Set up camp & become captain"}
        </Button>
      </div>
    </GateScreen>
  );
}

/**
 * What /setup shows an account that may not found the camp (see
 * `mayFoundCamp`): the wizard's own gate and card, with the reason in place of
 * the root code, and a way out to sign in with the founding address.
 *
 * An account whose email is unconfirmed also gets the Email card: a founder
 * who signed up with a password is refused until they confirm, and every
 * visit on a fresh camp lands here, so this page has to offer the link. The
 * copy stays neutral: it never says whether this address is the founding one.
 */
export function SetupRefused({
  message,
  confirm = null,
}: {
  message: string;
  /** Set only while the signed-in address is unconfirmed. */
  confirm?: { email: string; deliverable: boolean } | null;
}) {
  return (
    <GateScreen
      icon={<Tent aria-hidden />}
      eyebrow="First-time setup"
      title="Set up Camp 404"
    >
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
          <p className="text-sm text-muted-foreground">{message}</p>
        </CardContent>
      </Card>

      {confirm ? (
        <ConfirmEmail
          email={confirm.email}
          deliverable={confirm.deliverable}
          callbackURL="/setup"
          description={
            <>
              Confirm that{" "}
              <span className="text-foreground">{confirm.email}</span> is yours.
              If it is the founding address, this page lets you set up the camp
              once it is confirmed.
            </>
          }
          undeliverable="This deployment can't send email yet, so this address can't be confirmed here. Whoever runs it needs to set up email (or Google sign-in) before the camp can be founded."
        />
      ) : null}

      <div className="flex items-center justify-center">
        <Button asChild variant="outline">
          <SignOutLink />
        </Button>
      </div>
    </GateScreen>
  );
}
