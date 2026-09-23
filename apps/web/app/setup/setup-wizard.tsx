"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Tent, TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { Card, CardContent } from "@camp404/ui/components/card";
import { CodeDisplay } from "@camp404/ui/components/code-display";
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
 */
export function SetupRefused({ message }: { message: string }) {
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

      <div className="flex items-center justify-center">
        <Button asChild variant="outline">
          <SignOutLink />
        </Button>
      </div>
    </GateScreen>
  );
}
