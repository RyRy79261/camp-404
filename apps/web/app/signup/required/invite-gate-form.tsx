"use client";

import { useActionState } from "react";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { submitInviteCode, type SubmitInviteResult } from "./actions";
import { SignOutLink } from "@/components/auth/sign-out-link";

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
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl">One more thing</h1>
        <p className="text-sm text-muted-foreground">
          Camp 404 is invite-only — drop your code below to come aboard.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-code">Invite code</Label>
        <Input
          id="invite-code"
          name="code"
          placeholder="CAMP-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          required
        />
      </div>

      {state && !state.ok && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? "Checking…" : "Enter camp"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {email ? (
          <>
            Signed in as <span className="text-foreground">{email}</span>
            {" · "}
          </>
        ) : null}
        <SignOutLink className="font-medium text-primary hover:underline" />
      </p>
    </form>
  );
}
