"use client";

import * as React from "react";
import { Camera, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Spinner } from "./spinner";

export interface AvatarUploadProps {
  /** Current image URL, or null/empty when none is set. */
  value: string | null | undefined;
  /** Called with the uploaded image URL, or null when removed. */
  onChange: (url: string | null) => void;
  /**
   * Browser-side transform run on the picked file before upload (e.g. a
   * centre-crop + WebP resize). Defaults to passing the file through untouched
   * so the leaf carries no app-specific image logic.
   */
  preprocessImage?: (file: File) => Promise<Blob | File>;
  /** Endpoint that accepts `FormData { image }` and returns `{ url }`. */
  uploadUrl?: string;
  className?: string;
}

const passthrough = async (file: File): Promise<File> => file;

/**
 * Board S11 avatar uploader. A 120px circular control: tapping it opens the
 * file picker; the chosen image is preprocessed (injected — keeps this leaf
 * free of app image logic) and POSTed to `uploadUrl`, which returns the stored
 * proxy URL. While in flight a scrim + spinner cover the circle; once set, the
 * photo shows with a destructive "remove" affordance. Errors revert the circle
 * to empty and surface a centred message, with the trigger relabelled
 * "Try again". Promoted into @camp404/ui so onboarding + profile-edit share it.
 */
export function AvatarUpload({
  value,
  onChange,
  preprocessImage = passthrough,
  uploadUrl = "/api/uploads/avatar",
  className,
}: AvatarUploadProps) {
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
      const blob = await preprocessImage(file);
      // The useEffect cleanup (keyed on `preview`) revokes the previous URL.
      setPreview(URL.createObjectURL(blob));
      const body = new FormData();
      body.append(
        "image",
        new File([blob], "avatar.webp", { type: blob.type || "image/webp" }),
      );

      const res = await fetch(uploadUrl, { method: "POST", body });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Upload failed");
      }
      const data = (await res.json()) as { url: string };
      onChange(data.url);
    } catch (err) {
      // Revert the circle to its empty appearance (board S11 ERROR state).
      setPreview(null);
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const displaySrc = preview ?? value;
  const hasImage = Boolean(displaySrc);
  const triggerLabel = uploading
    ? "Uploading…"
    : error
      ? "Try again"
      : hasImage
        ? "Change photo"
        : "Upload a photo";

  return (
    <div className={cn("flex flex-col items-center gap-3.5", className)}>
      <div className="relative">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={hasImage ? "Change profile photo" : "Add a profile photo"}
          className={cn(
            "relative flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-full border-2 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
            uploading && "bg-muted",
            hasImage && !uploading
              ? "border-solid border-primary"
              : "border-dashed border-border hover:border-primary",
          )}
        >
          {hasImage ? (
            <img
              src={displaySrc ?? undefined}
              alt="Profile preview"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex flex-col items-center gap-1.5">
              <Camera className="h-8 w-8" aria-hidden />
              <span className="text-xs font-normal">Add photo</span>
            </span>
          )}
          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-[var(--overlay)]">
              <Spinner size="lg" className="text-foreground" label="Uploading photo" />
            </span>
          )}
        </button>

        {hasImage && !uploading && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setPreview(null);
              onChange(null);
            }}
            aria-label="Remove profile photo"
            className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {error && (
        <div className="flex flex-col items-center gap-1 text-center" role="alert">
          <p className="text-label font-semibold text-destructive">Upload failed</p>
          <p className="text-label text-destructive">{error}</p>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {triggerLabel}
      </Button>

      <p className="text-label text-muted-foreground">
        A clear photo of your face works best.
      </p>

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
