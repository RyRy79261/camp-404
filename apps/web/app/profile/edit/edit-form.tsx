"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { updateProfile, type UpdateProfileResult } from "../actions";

interface ProfileEditFormProps {
  initialDisplayName: string;
  initialImageUrl: string | null;
}

export function ProfileEditForm({
  initialDisplayName,
  initialImageUrl,
}: ProfileEditFormProps) {
  // The photo URL is client state (set by the uploader after the image is
  // stored in Blob); it rides along to the server action via a hidden input.
  const [imageUrl, setImageUrl] = React.useState<string | null>(initialImageUrl);
  const [state, formAction, isPending] = useActionState<
    UpdateProfileResult | null,
    FormData
  >(updateProfile, null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <AvatarUpload value={imageUrl} onChange={setImageUrl} />
      <input type="hidden" name="profileImageUrl" value={imageUrl ?? ""} />

      <div className="grid gap-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          defaultValue={initialDisplayName}
          maxLength={80}
          required
          disabled={isPending}
        />
      </div>

      {state && !state.ok && (
        <p className="text-sm text-[color:var(--color-destructive)]" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" disabled={isPending}>
          <Link href="/profile">Cancel</Link>
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
