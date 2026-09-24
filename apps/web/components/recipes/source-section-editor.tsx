"use client";

import * as React from "react";
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Bold, Heading3, Italic, List, ListOrdered } from "lucide-react";
import type { SourceDoc } from "@camp404/types";
import { cn } from "@camp404/ui/lib/utils";

// One section of a recipe's source (#243, Kitchen): AfrikaBurn's bulletin
// MarkdownEditor (packages/ui/src/components/markdown-editor), with Tiptap
// JSON in and out instead of Markdown. Markdown works only as typing
// shortcuts ("- " a bullet, "1. " a numbered list, "**x**" bold, "*x*"
// italic, "# " a heading); the server stores the JSON and refuses any node
// or mark this editor does not offer (SourceDoc in @camp404/types), so the
// StarterKit extras the kitchen does not use are switched off here.
//
// The box grows with its text: no height cap and no inner scroll, so a long
// method is never cut off. Client-only (Tiptap uses the DOM).

const PROSE_CLASS =
  "min-w-0 max-w-none break-words px-3 py-2 text-sm leading-relaxed focus:outline-none " +
  "[&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold " +
  "[&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-base [&_h2]:font-semibold " +
  "[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold " +
  "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
  "[&_strong]:font-semibold";

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: false,
  }),
];

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-primary/15 text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex items-center gap-0.5 border-b border-input px-1.5 py-1">
      <ToolbarButton
        label="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" aria-hidden />
      </ToolbarButton>
      <ToolbarButton
        label="Heading"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="h-4 w-4" aria-hidden />
      </ToolbarButton>
    </div>
  );
}

export interface SourceSectionEditorProps {
  /** The section as the editor opens on it. */
  value: SourceDoc;
  /** Fired with the section's Tiptap JSON on every edit. */
  onChange?: (doc: SourceDoc) => void;
  /** Accessible label for the editable region: the section's name. */
  ariaLabel: string;
  className?: string;
}

export function SourceSectionEditor({
  value,
  onChange,
  ariaLabel,
  className,
}: SourceSectionEditorProps) {
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value as JSONContent,
    immediatelyRender: false,
    // Re-render on each change so the toolbar's aria-pressed follows the caret.
    shouldRerenderOnTransaction: true,
    editorProps: {
      // role="textbox" + aria-multiline: a bare contenteditable announces as a
      // generic group, not as something that can be typed into.
      attributes: {
        class: PROSE_CLASS,
        "aria-label": ariaLabel,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
    // The server checks the shape (SourceDoc); an attribute the editor adds
    // and the schema does not name is dropped there. getJSON() hands back
    // some `attrs` (a numbered list's, a heading's) as objects that are not
    // plain, which a server action cannot carry: React sends them as a
    // temporary reference and the server reads a function. A JSON round trip
    // makes the whole document plain.
    onUpdate: ({ editor: e }) =>
      onChange?.(JSON.parse(JSON.stringify(e.getJSON())) as SourceDoc),
  });

  return (
    <div
      className={cn(
        "min-w-0 rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      {editor ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}
