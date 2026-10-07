"use client";

import * as React from "react";
import { ImageIcon, Lock } from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { cn } from "@camp404/ui/lib/utils";
import { SCREENSHOT_UPLOAD, downscaleForUpload } from "@/lib/image";
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TOO_BIG,
  SCREENSHOT_TYPES,
  SCREENSHOT_WRONG_TYPE,
} from "@/lib/report-screenshot-copy";

// "Add a screenshot" in the bug report (#313, approved mock-up option A): one
// picture, picked from a file, or pasted or dropped on a desktop. The picture
// is checked here for a quick answer and again, by its bytes, on the server.
// It is kept privately in Camp 404 and never goes to GitHub; the note under it
// says so. The preview is marked `data-os-private`, so the desktop's
// last-seen copy of a background window never shows it.

/** A picture the member chose, with the address its preview is drawn from. */
export interface ChosenScreenshot {
  file: File;
  previewUrl: string;
}

/** Why a file cannot be a report's screenshot, or null when it can. */
export function screenshotProblem(file: File): string | null {
  if (!Object.hasOwn(SCREENSHOT_TYPES, file.type)) return SCREENSHOT_WRONG_TYPE;
  if (file.size > SCREENSHOT_MAX_BYTES) return SCREENSHOT_TOO_BIG;
  return null;
}

/**
 * A picture over the upload limit made smaller in the browser (a 4K or
 * phone screenshot is often 6 to 10 MB as a PNG), so it fits under Vercel's
 * request limit. One under the limit is sent as it is.
 */
export async function fitScreenshot(file: File): Promise<File> {
  if (file.size <= SCREENSHOT_MAX_BYTES) return file;
  return downscaleForUpload(file, SCREENSHOT_UPLOAD);
}

/** "412 KB", "1.4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The first image file among pasted or dropped items, if any. */
export function firstImage(
  files: FileList | readonly File[] | null,
): File | null {
  if (!files) return null;
  for (const file of Array.from(files)) {
    if (file.type.startsWith("image/")) return file;
  }
  return null;
}

export function ReportScreenshotField({
  value,
  onChange,
  disabled = false,
}: {
  value: ChosenScreenshot | null;
  onChange: (next: ChosenScreenshot | null) => void;
  disabled?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [shrinking, setShrinking] = React.useState(false);

  function accept(file: File) {
    const why = screenshotProblem(file);
    setProblem(why);
    if (why) return;
    onChange({ file, previewUrl: URL.createObjectURL(file) });
  }

  function take(file: File | null) {
    if (!file || disabled || shrinking) return;
    if (!Object.hasOwn(SCREENSHOT_TYPES, file.type)) {
      setProblem(SCREENSHOT_WRONG_TYPE);
      return;
    }
    if (file.size <= SCREENSHOT_MAX_BYTES) {
      accept(file);
      return;
    }
    setProblem(null);
    setShrinking(true);
    void fitScreenshot(file)
      .then(accept, () => setProblem(SCREENSHOT_TOO_BIG))
      .finally(() => setShrinking(false));
  }

  function remove() {
    // The preview's address is the browser's own copy of the file.
    if (value) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    setProblem(null);
  }

  // Paste anywhere in the dialog, on a desktop: a screenshot is usually on
  // the clipboard. Text pastes into the description as before.
  React.useEffect(() => {
    if (value || disabled) return;
    function onPaste(e: ClipboardEvent) {
      const file = firstImage(e.clipboardData?.files ?? null);
      if (!file) return;
      e.preventDefault();
      take(file);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // take() reads only props and setters, so a new one each render changes
    // nothing the listener needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- take() reads only props and setters
  }, [value, disabled]);

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-border p-3"
      onDragOver={(e) => {
        if (value || disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (value || disabled) return;
        e.preventDefault();
        setDragging(false);
        take(firstImage(e.dataTransfer.files));
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Screenshot</p>
          <p className="text-xs text-muted-foreground">
            Optional. One picture of what you saw.
          </p>
        </div>
        {!value && (
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="max-sm:hidden"
          >
            <ImageIcon aria-hidden /> Add a screenshot
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={Object.keys(SCREENSHOT_TYPES).join(",")}
        aria-label="Screenshot file"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          take(e.currentTarget.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />

      {value ? (
        <div className="flex items-center gap-3">
          {/* A local object URL: the browser's own copy of the file. */}
          <img
            src={value.previewUrl}
            alt="Your screenshot"
            data-os-private
            className="h-16 w-24 shrink-0 border border-border object-cover object-top"
          />
          <div className="min-w-0 flex-1 text-sm">
            <p className="break-words">
              {value.file.name || "Pasted screenshot"}
            </p>
            <p className="text-xs text-muted-foreground">
              {fileSize(value.file.size)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={remove}
            disabled={disabled}
          >
            Remove
          </Button>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            className="sm:hidden"
          >
            <ImageIcon aria-hidden /> Add a screenshot
          </Button>
          <p
            className={cn(
              "border border-dashed border-border p-4 text-center text-xs text-muted-foreground max-sm:hidden",
              dragging && "border-primary text-foreground",
            )}
          >
            or paste one here (Ctrl+V), or drop the file here
          </p>
        </>
      )}

      {shrinking && (
        <p role="status" className="text-xs text-muted-foreground">
          Making the picture smaller…
        </p>
      )}

      {problem && (
        <p role="alert" className="text-xs text-destructive">
          {problem}
        </p>
      )}

      <p className="flex items-start gap-2 border-l-2 border-primary bg-primary/10 px-3 py-2 text-xs leading-relaxed">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">Kept private.</strong> The
          screenshot stays in Camp 404 and never goes on the public tracker.
          Only captains can see it, and they delete it once the bug is fixed.
        </span>
      </p>
    </div>
  );
}
