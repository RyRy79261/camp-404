"use client";

import { useActionState } from "react";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { deleteOwnAccount, type DeleteAccountResult } from "../actions";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<
    DeleteAccountResult | null,
    FormData
  >(deleteOwnAccount, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-[color:var(--color-muted-foreground)]">
        This permanently erases your personal data and removes you from camp
        rosters. Your account becomes an anonymous &ldquo;Lost Cat&rdquo; stub so
        the family tree stays intact — it can&rsquo;t be undone. Type{" "}
        <strong>DELETE</strong> to confirm.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm">Confirmation</Label>
        <Input
          id="confirm"
          name="confirm"
          placeholder="DELETE"
          autoComplete="off"
        />
      </div>
      {state && !state.ok ? (
        <p
          role="alert"
          className="text-sm text-[color:var(--color-destructive)]"
        >
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </form>
  );
}
