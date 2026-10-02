"use client";

import * as React from "react";
import { Eye, PenLine } from "lucide-react";
import { SegmentedControl } from "@camp404/ui/components/segmented-control";
import { cn } from "@camp404/ui/lib/utils";
import { MarkdownBody } from "@/components/announcements/markdown-body";
import { InlineParagraphsValue } from "./inline-text";
import { MarkdownEditor } from "./markdown-editor";

// One long-text field written in the WYSIWYG Markdown editor with its live
// preview (owner, 2026-10-01: long text is a WYSIWYG Markdown editor with a
// preview beside it; on a phone the editor and the preview are two tabs). The
// Survival Guide's Write and Preview panes (components/guide/chapter-editor),
// at the size of one field: from a medium window up the two sit side by side
// at the same height, each growing with the text; below it a Write | Preview
// switch shows one at a time. The preview is the reader's own renderer
// (MarkdownBody), so it shows exactly what a member reads.

const PANE =
  "min-w-0 flex-col overflow-hidden rounded-md border border-input bg-background";

function PaneLabel({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="flex shrink-0 items-center gap-1.5 border-b border-input bg-muted/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
      {icon}
      {children}
    </p>
  );
}

export interface MarkdownFieldProps {
  /** The field's label: the editor's accessible name and the switch's. */
  label: string;
  value: string;
  onChange: (markdown: string) => void;
  /** Said in the preview while there is nothing written. */
  emptyPreview?: string;
  disabled?: boolean;
  /** The text box is at least this tall (Tailwind min-h class). */
  minHeight?: string;
  /** The editor's mode (MarkdownEditor): paragraphs keeps only bold and italic. */
  mode?: "markdown" | "paragraphs";
  /** Head the Write pane with its name, as the Preview pane is. */
  labelWrite?: boolean;
  className?: string;
}

export function MarkdownField({
  label,
  value,
  onChange,
  emptyPreview = "Nothing written yet. Start writing and it appears here.",
  disabled,
  minHeight = "min-h-32",
  mode = "markdown",
  labelWrite = false,
  className,
}: MarkdownFieldProps) {
  const [view, setView] = React.useState<"write" | "preview">("write");
  const settled = React.useDeferredValue(value);
  return (
    <div
      data-slot="markdown-field"
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <div className="page-md:hidden">
        <SegmentedControl
          aria-label={`${label}: write or preview`}
          value={view}
          onValueChange={(v) => setView(v === "preview" ? "preview" : "write")}
          options={[
            { value: "write", label: "Write" },
            { value: "preview", label: "Preview" },
          ]}
        />
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 page-md:grid-cols-2">
        <div
          data-testid="markdown-write"
          className={cn(
            PANE,
            "focus-within:ring-2 focus-within:ring-ring",
            view === "write" ? "flex" : "hidden page-md:flex",
          )}
        >
          {labelWrite ? (
            // On a phone the Write | Preview switch already names the pane.
            <div className="hidden page-md:block">
              <PaneLabel icon={<PenLine className="h-3 w-3" aria-hidden />}>
                Write
              </PaneLabel>
            </div>
          ) : null}
          <MarkdownEditor
            fill
            mode={mode}
            value={value}
            onChange={onChange}
            ariaLabel={label}
            disabled={disabled}
            className={cn("flex-1", minHeight)}
          />
        </div>
        <div
          data-testid="markdown-preview"
          className={cn(
            PANE,
            view === "preview" ? "flex" : "hidden page-md:flex",
          )}
        >
          <PaneLabel icon={<Eye className="h-3 w-3" aria-hidden />}>
            Preview: as members read it
          </PaneLabel>
          <div className={cn("flex-1 px-3 py-2", minHeight)}>
            {settled.trim() === "" ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <PenLine className="h-3.5 w-3.5" aria-hidden />
                {emptyPreview}
              </p>
            ) : mode === "paragraphs" ? (
              <InlineParagraphsValue value={settled} />
            ) : (
              <MarkdownBody className="text-sm">{settled}</MarkdownBody>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
