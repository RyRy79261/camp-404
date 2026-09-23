"use client";

import * as React from "react";
import { PASSWORD_MIN_LENGTH } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import { Field } from "@camp404/ui/components/field";
import { PasswordInput } from "@camp404/ui/components/password-input";
import { toast } from "@camp404/ui/components/toast";
import { setFirstPassword } from "./actions";

// The first password for a member who signs in with Google or a passkey. The
// change-password form asks for a current password such a member never had,
// so this is that form without the first field, in the same order and words.

export function SetFirstPassword({ onSet }: { onSet: () => void }) {
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await setFirstPassword(password);
      if (result.ok) {
        setPassword("");
        toast.success("Password added. You can now sign in with it.");
        onSet();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field
        label="New password"
        htmlFor="account-first-password"
        help={`At least ${PASSWORD_MIN_LENGTH} characters — passphrases welcome. Spaces are fine, and you can paste from a password manager.`}
      >
        <PasswordInput
          id="account-first-password"
          name="newPassword"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={pending}
          required
        />
      </Field>

      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <div>
        <Button
          type="submit"
          size="sm"
          disabled={password.length < PASSWORD_MIN_LENGTH || pending}
        >
          {pending ? "Adding…" : "Add password"}
        </Button>
      </div>
    </form>
  );
}
