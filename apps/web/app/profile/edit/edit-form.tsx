"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { InputField } from "@camp404/ui/components/input-field";
import { AvatarUpload } from "@camp404/ui/components/avatar-upload";
import { cropResizeToSquare } from "@/lib/image";
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
    <form action={formAction} className="flex flex-col gap-4">
      <AvatarUpload
        value={imageUrl}
        onChange={setImageUrl}
        preprocessImage={cropResizeToSquare}
      />
      <input type="hidden" name="profileImageUrl" value={imageUrl ?? ""} />

      <InputField
        id="displayName"
        name="displayName"
        label="Display name"
        defaultValue={initialDisplayName}
        maxLength={80}
        required
        disabled={isPending}
      />

      {state && !state.ok && (
        <Alert variant="error">
          <TriangleAlert />
          <span>{state.error}</span>
        </Alert>
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
