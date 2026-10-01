"use client";

import { useId, useState, type DragEvent } from "react";
import { FileText, ImageIcon, Upload, X } from "lucide-react";
import { cn } from "@camp404/ui/lib/utils";

// The receipts on a claim (#242), composed like AfrikaBurn's FileUpload in
// its file variant: a chip per chosen file with its name and a remove (x),
// then a dashed drop zone that adds more, and one line counting the files and
// their size against the limit. The files stay in the browser until the
// claim is sent (one request with the whole claim), so nothing is uploaded
// for a claim the member never sends.
//
// The same picker takes one file (`maxFiles` 1): a member's proof of payment
// and the Finance team's bank statement use it, so no screen shows the
// browser's bare "Choose File / No file chosen".

export const RECEIPT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb < 0.1 && bytes > 0 ? "0.1" : mb.toFixed(1)} MB`;
}

export function ReceiptPicker({
  id,
  files,
  onChange,
  maxFiles,
  maxBytes,
  disabled,
  invalid,
  describedBy,
  accept = RECEIPT_TYPES.join(","),
  inputLabel = "Receipts",
  addText,
  kindText = "A photo or a PDF",
}: {
  id?: string;
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles: number;
  maxBytes: number;
  disabled?: boolean;
  /** Marks the drop zone red while its error shows. */
  invalid?: boolean;
  describedBy?: string;
  /** The file types the input takes. */
  accept?: string;
  /** The input's accessible name. */
  inputLabel?: string;
  /** The drop zone's words ("Add a receipt"). */
  addText?: string;
  /** What kind of file, under the drop zone's words. */
  kindText?: string;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [dragging, setDragging] = useState(false);
  const full = files.length >= maxFiles;
  const total = files.reduce((sum, f) => sum + f.size, 0);
  const limit = megabytes(maxBytes).replace(".0", "");
  const single = maxFiles === 1;

  function add(picked: File[]) {
    if (picked.length === 0) return;
    // The same file picked twice is one receipt.
    const known = new Set(files.map((f) => `${f.name}:${f.size}`));
    const fresh = picked.filter((f) => !known.has(`${f.name}:${f.size}`));
    onChange([...files, ...fresh]);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled || full) return;
    add(Array.from(e.dataTransfer.files));
  }

  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 && (
        <ul aria-label="Chosen receipts" className="flex flex-col gap-2">
          {files.map((file, i) => {
            const Icon = file.type.startsWith("image/") ? ImageIcon : FileText;
            return (
              <li
                key={`${file.name}:${file.size}:${i}`}
                className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm"
              >
                <Icon
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate" title={file.name}>
                  {file.name}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {megabytes(file.size)}
                </span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange(files.filter((_, j) => j !== i))}
                    aria-label={`Remove ${file.name}`}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!full && (
        <label
          htmlFor={inputId}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center text-sm transition-colors",
            dragging
              ? "border-primary bg-primary/5 text-foreground"
              : invalid
                ? "border-destructive text-muted-foreground"
                : "border-input text-muted-foreground hover:border-primary/60 hover:text-foreground",
            disabled && "pointer-events-none opacity-70",
          )}
        >
          <Upload className="h-5 w-5" aria-hidden />
          <span>
            <span className="font-medium text-foreground">
              {addText ??
                (files.length === 0 ? "Add a receipt" : "Add another")}
            </span>{" "}
            or drop it here
          </span>
          <span className="text-xs">{kindText}</span>
          <input
            id={inputId}
            type="file"
            multiple={!single}
            accept={accept}
            aria-label={inputLabel}
            aria-invalid={invalid ? true : undefined}
            aria-describedby={describedBy}
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              add(Array.from(e.currentTarget.files ?? []));
              e.currentTarget.value = "";
            }}
          />
        </label>
      )}
      <p className="text-xs tabular-nums text-muted-foreground">
        {single
          ? `One file, up to ${limit}.`
          : files.length === 0
            ? `Up to ${maxFiles} files, ${limit} in all.`
            : `${files.length} of ${maxFiles} files · ${megabytes(total)} of ${limit}`}
      </p>
    </div>
  );
}
