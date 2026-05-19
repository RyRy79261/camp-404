"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@camp404/ui/components/button";
import { redeemInviteCode, type RedeemInviteResult } from "./actions";

interface InviteCodeFormProps {
  /** Path to redirect to once the code is accepted. Must start with "/". */
  next?: string;
  cta?: string;
}

export function InviteCodeForm({
  next = "/handler/sign-up",
  cta = "Continue",
}: InviteCodeFormProps) {
  const [state, formAction, isPending] = useActionState<
    RedeemInviteResult | null,
    FormData
  >(redeemInviteCode, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label
        htmlFor="invite-code"
        className="text-sm font-medium text-[color:var(--color-foreground)]"
      >
        Invite code
      </label>
      <input
        id="invite-code"
        name="code"
        type="text"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        className="h-10 rounded-md border border-[color:var(--color-border)] bg-transparent px-3 text-sm tracking-widest"
        required
      />
      {state && !state.ok && (
        <p className="text-xs text-red-600" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={isPending}>
        {isPending ? "Checking…" : cta}
      </Button>
    </form>
  );
}
