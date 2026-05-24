"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { redeemInviteCode, type RedeemInviteResult } from "./actions";

interface InviteCodeFormProps {
  /** Path to redirect to once the code is accepted. Must start with "/". */
  next?: string;
  cta?: string;
}

export function InviteCodeForm({
  next = "/auth/sign-up",
  cta = "Continue",
}: InviteCodeFormProps) {
  const [state, formAction, isPending] = useActionState<
    RedeemInviteResult | null,
    FormData
  >(redeemInviteCode, null);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <Label htmlFor="invite-code">Invite code</Label>
      <Input
        id="invite-code"
        name="code"
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="characters"
        className="tracking-widest"
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
