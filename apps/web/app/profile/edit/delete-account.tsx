"use client";

import { useActionState } from "react";
import { TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { InputField } from "@camp404/ui/components/input-field";
import { deleteOwnAccount, type DeleteAccountResult } from "../actions";

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<
    DeleteAccountResult | null,
    FormData
  >(deleteOwnAccount, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        This permanently erases your personal data and removes you from camp
        rosters. Your account becomes an anonymous &ldquo;Lost Cat&rdquo; stub so
        the family tree stays intact — it can&rsquo;t be undone. Type{" "}
        <strong>DELETE</strong> to confirm.
      </p>
      <InputField
        id="confirm"
        name="confirm"
        label="Confirmation"
        placeholder="DELETE"
        autoComplete="off"
      />
      {state && !state.ok ? (
        <Alert variant="error">
          <TriangleAlert />
          <span>{state.error}</span>
        </Alert>
      ) : null}
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </Button>
    </form>
  );
}
