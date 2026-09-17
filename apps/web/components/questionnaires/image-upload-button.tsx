"use client";

import { useId, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@camp404/ui/components/button";

// "Upload a picture" for an image block or an option picture. Posts the file to
// Camp 404's builder image route rather than AB's FileUpload: the route checks
// that the author may change this questionnaire, and stores the picture in the
// app's own store, which is the only place a published image may come from
// (`isAllowedBuilderImageUrl`). Hands back the link the block stores. A Button
// over a hidden file input, like the avatar uploader.

export function ImageUploadButton({
  questionnaireKey,
  onUploaded,
  label = "Upload a picture",
  ariaLabel,
  size,
}: {
  questionnaireKey: string;
  onUploaded: (url: string) => void;
  /** The button's words ("Replace the picture" once one is set). */
  label?: string;
  /** A fuller name where several upload buttons share a screen. */
  ariaLabel?: string;
  size?: "sm" | "default";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(
        `/api/uploads/builder-image?${new URLSearchParams({ questionnaire: questionnaireKey })}`,
        { method: "POST", body: form },
      );
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !body.url) {
        setError(body.error ?? "The picture could not be uploaded.");
        return;
      }
      onUploaded(body.url);
    } catch {
      setError("The picture could not be uploaded. Check your connection.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void upload(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size={size}
        className="self-start"
        disabled={uploading}
        aria-label={ariaLabel}
        aria-describedby={error ? errorId : undefined}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 aria-hidden className="motion-safe:animate-spin" />
        ) : (
          <Upload aria-hidden />
        )}
        {uploading ? "Uploading…" : label}
      </Button>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
