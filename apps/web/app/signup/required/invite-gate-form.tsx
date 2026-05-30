"use client";

import { useActionState } from "react";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
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
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">One more thing</h1>
        <p className="text-balance text-sm text-[color:var(--color-muted-foreground)]">
          {email ? (
            <>
              You're signed in as{" "}
              <span className="font-medium text-[color:var(--color-foreground)]">
                {email}
              </span>
              .{" "}
            </>
          ) : null}
          Camp 404 is invite-only — drop your code below to come aboard.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="invite-code">Invite code</Label>
        <Input
          id="invite-code"
          name="code"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          required
        />
      </div>

      {state && !state.ok && (
        <p className="text-sm text-[color:var(--color-destructive)]" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Checking…" : "Enter camp"}
      </Button>

      <Button
        asChild
        variant="link"
        className="text-[color:var(--color-muted-foreground)]"
      >
        <a href="/auth/sign-out">Sign out</a>
      </Button>
    </form>
  );
}
