"use client";

import { useActionState } from "react";
import { TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { InputField } from "@camp404/ui/components/input-field";
import { submitInviteCode, type SubmitInviteResult } from "./actions";

/**
 * Invite-code entry for an already-signed-in user. Posts to the
 * `submitInviteCode` server action, which claims the code onto their row and
 * redirects home on success; on failure the returned error renders inline.
 */
export function InviteGateForm({ email }: { email: string | null }) {
  const [state, formAction, isPending] = useActionState<
    SubmitInviteResult | null,
    FormData
  >(submitInviteCode, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-subtitle-hero font-bold text-card-foreground">
          One more thing
        </h1>
        <p className="text-label text-muted-foreground">
          {email ? (
            <>
              You&apos;re signed in as{" "}
              <span className="font-medium text-foreground">{email}</span>.{" "}
            </>
          ) : null}
          Camp 404 is invite-only — drop your code below to come aboard.
        </p>
      </div>

      <InputField
        id="invite-code"
        name="code"
        label="Invite code"
        placeholder="CAMP-XXXX-XXXX"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        required
      />

      {state && !state.ok && (
        <Alert variant="error">
          <TriangleAlert />
          <span>{state.error}</span>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Checking…" : "Enter camp"}
      </Button>

      <div className="flex justify-center">
        <a
          href="/auth/sign-out"
          className="text-label font-medium text-accent hover:underline"
        >
          Sign out
        </a>
      </div>
    </form>
  );
}
