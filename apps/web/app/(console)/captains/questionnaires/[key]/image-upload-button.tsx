"use client";

import { useId, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@camp404/ui/components/button";

// "Upload a picture" for an image block. Posts the file to the builder image
// route and hands back the link the block stores. No board draws the builder;
// this is a Button over a hidden file input, like the avatar uploader.

export function ImageUploadButton({
  questionnaireKey,
  onUploaded,
}: {
  questionnaireKey: string;
  onUploaded: (url: string) => void;
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
        disabled={uploading}
        aria-describedby={error ? errorId : undefined}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 aria-hidden className="motion-safe:animate-spin" />
        ) : (
          <Upload aria-hidden />
        )}
        {uploading ? "Uploading…" : "Upload a picture"}
      </Button>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
