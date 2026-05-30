"use client";

import * as React from "react";
import { Camera, Loader2, X } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";
import { cropResizeToSquare } from "@/lib/image";

interface AvatarUploadProps {
  /** Current image URL, or null/empty when none is set. */
  value: string | null | undefined;
  /** Called with the uploaded image URL, or null when removed. */
  onChange: (url: string | null) => void;
  /** Diameter token. Defaults to a large circular control. */
  className?: string;
}

/**
 * Large circular avatar uploader. Tapping the circle opens the file
 * picker; the chosen image is centre-cropped + downscaled in the browser
 * (lib/image.ts) and POSTed to /api/uploads/avatar, which returns the
 * stored public URL. Shows the current photo with a "remove" affordance
 * once set. Used by onboarding and the profile editor.
 */
export function AvatarUpload({ value, onChange, className }: AvatarUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Local object-URL preview of the just-uploaded image, shown instead of the
  // authed avatar proxy (which 401s for a not-yet-approved member mid-
  // onboarding). Revoked on change / unmount.
  const [preview, setPreview] = React.useState<string | null>(null);
  React.useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await cropResizeToSquare(file);
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      const body = new FormData();
      body.append("image", new File([blob], "avatar.webp", { type: blob.type }));

      const res = await fetch("/api/uploads/avatar", {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Upload failed");
      }
      const data = (await res.json()) as { url: string };
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const displaySrc = preview ?? value;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={
            displaySrc ? "Change profile photo" : "Add a profile photo"
          }
          className={cn(
            "relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[color:var(--color-border)] bg-[color:var(--color-muted)] text-[color:var(--color-muted-foreground)] transition-colors hover:border-[color:var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)] disabled:opacity-60",
            value && "border-solid",
            className,
          )}
        >
          {displaySrc ? (
            <img
              src={displaySrc}
              alt="Profile preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <Camera className="h-8 w-8" aria-hidden />
              <span className="text-xs font-medium">Add photo</span>
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
            </div>
          )}
        </button>

        {displaySrc && !uploading && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPreview((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
              });
              onChange(null);
            }}
            aria-label="Remove profile photo"
            className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--color-destructive)] text-white shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-sm font-medium text-[color:var(--color-primary)] underline-offset-4 hover:underline disabled:opacity-60"
      >
        {uploading ? "Uploading…" : displaySrc ? "Change photo" : "Upload a photo"}
      </button>

      {error && (
        <p className="text-sm text-[color:var(--color-destructive)]" role="alert">
          {error}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFile(e.currentTarget.files?.[0] ?? undefined)}
      />
    </div>
  );
}
