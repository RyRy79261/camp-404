"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
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
  const [imageUrl, setImageUrl] = React.useState<string | null>(
    initialImageUrl,
  );
  const [state, formAction, isPending] = useActionState<
    UpdateProfileResult | null,
    FormData
  >(updateProfile, null);

  return (
    <form
      action={formAction}
      className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start"
    >
      <AvatarUpload
        value={imageUrl}
        onChange={setImageUrl}
        preprocessImage={cropResizeToSquare}
      />
      <input type="hidden" name="profileImageUrl" value={imageUrl ?? ""} />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="displayName">
            Display name
            <span className="ml-1 text-primary" aria-hidden>
              *
            </span>
          </Label>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={initialDisplayName}
            maxLength={80}
            required
            disabled={isPending}
            aria-describedby="displayName-helper"
          />
          <p id="displayName-helper" className="text-xs text-muted-foreground">
            Up to 80 characters.
          </p>
        </div>

        {state && !state.ok && (
          <Alert variant="error">
            <TriangleAlert />
            <span>{state.error}</span>
          </Alert>
        )}

        {/* Cancel and Save sit together on the right. A link cannot be
            disabled, so while saving it says so and ignores the pointer. */}
        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button asChild variant="ghost">
            <Link
              href="/profile"
              aria-disabled={isPending || undefined}
              tabIndex={isPending ? -1 : undefined}
              className={
                isPending ? "pointer-events-none opacity-50" : undefined
              }
            >
              Cancel
            </Link>
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
