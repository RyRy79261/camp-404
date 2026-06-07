"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Tent, TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { CodeDisplay } from "@camp404/ui/components/code-display";
import { IconBadge } from "@camp404/ui/components/icon-badge";
import { completeSetupAction } from "./actions";

/**
 * First-time setup wizard. Shown once, on a fresh system, to the first
 * signed-in person. Confirms they're founding the camp; the action elects them
 * captain and mints the root invite code, then sends them into the normal
 * onboarding questionnaire. No new design board exists for this net-new
 * surface — it composes the shared leaves in the app's full-screen style
 * (cf. error / not-found).
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
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <IconBadge size="lg" tone="primary">
        <Tent aria-hidden />
      </IconBadge>

      <div className="flex flex-col items-center gap-2">
        <p className="font-mono text-micro font-bold uppercase tracking-wide text-accent">
          First-time setup
        </p>
        <h1 className="text-title font-bold text-foreground">Set up Camp 404</h1>
        <p className="text-subtitle-dense text-muted-foreground">
          You&rsquo;re the first one here, {displayName}. This makes you the
          founding{" "}
          <strong className="text-foreground">captain</strong>{" "}
          and creates your camp&rsquo;s root invite code to bring everyone else
          in.
        </p>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        <p className="text-caption text-muted-foreground">
          Your camp&rsquo;s root invite code
        </p>
        <CodeDisplay code={founderCode} aria-label="Root invite code" />
      </div>

      <p className="text-caption text-muted-foreground">
        Next you&rsquo;ll complete your own burner profile, like everyone else.
        This setup only ever runs once.
      </p>

      {error && (
        <Alert variant="error" className="w-full text-left">
          <TriangleAlert aria-hidden />
          <span>{error}</span>
        </Alert>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await completeSetupAction();
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
    </main>
  );
}
