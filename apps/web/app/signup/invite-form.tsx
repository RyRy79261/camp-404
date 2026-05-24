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
  title?: string;
  subtitle?: string;
}

export function InviteCodeForm({
  next = "/auth/sign-up",
  cta = "Continue",
  title = "Welcome to Camp 404",
  subtitle = "Camp 404 is invite-only. Drop your code below and we'll get you logged in — password or Google, your call.",
}: InviteCodeFormProps) {
  const [state, formAction, isPending] = useActionState<
    RedeemInviteResult | null,
    FormData
  >(redeemInviteCode, null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-balance text-sm text-[color:var(--color-muted-foreground)]">
          {subtitle}
        </p>
      </div>

      <input type="hidden" name="next" value={next} />

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
        {isPending ? "Checking…" : cta}
      </Button>
    </form>
  );
}
