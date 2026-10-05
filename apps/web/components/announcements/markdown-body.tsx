"use client";

import { useDeferredValue } from "react";
import { Eye } from "lucide-react";
import { MarkdownBody } from "@camp404/ui/components/markdown-body";

// The renderer itself lives in @camp404/ui (components/markdown-body.tsx), so
// the Survival Guide's public site renders through the same safety boundary
// (#250). This file keeps what only the app's composers use: the hint under a
// body field and the live preview.
//
// Import the renderer from @camp404/ui, never through this file. This one is
// a client module, so a server page that took MarkdownBody from here would
// send react-markdown and the whole remark/rehype stack to the browser, where
// a page that only shows the words renders them on the server for nothing.

/**
 * What a composer tells the captain, and what it shows them. Both composers
 * that write an announcement body use these — the announcements page and the
 * year-rollover panel — so neither can end up asking for markdown without
 * saying so, or saying so without showing the result.
 */
export const MARKDOWN_HINT =
  "Markdown supported — headings, bold, italic, links, lists.";

/** The hint line under a body field's label. Point the field's
 * `aria-describedby` at the same `id`, or a captain using a screen reader is
 * the one person not told. */
export function MarkdownHint({ id }: { id: string }) {
  return (
    <p id={id} className="text-xs text-muted-foreground">
      {MARKDOWN_HINT}
    </p>
  );
}

/**
 * The composer's live preview: the body as a member will read it, through the
 * very renderer they get. Mirrors AfrikaBurn's compose preview, which shows
 * the bulletin the way its recipients see it.
 *
 * Both composers stay a plain Textarea deliberately — a rich-text editor would
 * take the dictation pill's append point away from the announcements one — so
 * this is where a captain checks that what they typed became what they meant.
 *
 * `useDeferredValue` keeps the parse off the keystroke: React renders the
 * typed character first and re-renders the preview from the settled value, so
 * a 5000-character body cannot make the textarea stutter.
 */
export function MarkdownPreview({ body }: { body: string }) {
  const settled = useDeferredValue(body);
  if (settled.trim() === "") return null;
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <Eye className="h-3 w-3" aria-hidden />
        Preview
      </p>
      <MarkdownBody className="text-sm">{settled}</MarkdownBody>
    </div>
  );
}
