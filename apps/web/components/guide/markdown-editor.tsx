"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Unlink,
} from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { cn } from "@camp404/ui/lib/utils";
import { editorMarkdown, GUIDE_EDITOR_EXTENSIONS } from "./markdown-extensions";

// The Survival Guide's text editor (#250; owner, 2026-10-01: "Just make a
// WYSIWYG Markdown editor"). The writer sees headings, bold and lists as
// members will, never Markdown signs; the chapter is still stored as Markdown
// (Tiptap's own Markdown extension reads it in and writes it out). Set up and
// styled like the recipe source editor (components/recipes/
// source-section-editor.tsx): a toolbar of plain buttons over the text, the
// box growing with its text. Tiptap's keyboard shortcuts work too (Ctrl+B,
// Ctrl+I, and "## " or "- " typed at the start of a line). Client-only
// (Tiptap uses the DOM).

const PROSE_CLASS =
  "min-h-48 min-w-0 max-w-none break-words px-3 py-2 text-sm leading-relaxed focus:outline-none " +
  "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold " +
  "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold " +
  "[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold " +
  "[&>*:first-child]:mt-0 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
  "[&_strong]:font-semibold [&_em]:italic " +
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground";

function ToolbarButton({
  onClick,
  active,
  label,
  wide,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  /** Shows its name as words, not an icon. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        wide ? "px-2 text-xs font-semibold" : "w-8",
        active && "bg-primary/15 text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** A link's address as the writer typed it, made into one a member can follow. */
export function linkHref(typed: string): string | null {
  const text = typed.trim();
  if (text === "") return null;
  if (/^(https?:|mailto:)/i.test(text)) return text;
  if (text.startsWith("/") && !text.startsWith("//")) return text;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return `mailto:${text}`;
  if (/^[^\s/]+\.[^\s]+$/.test(text)) return `https://${text}`;
  return null;
}

function LinkRow({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [address, setAddress] = React.useState(
    (editor.getAttributes("link").href as string | undefined) ?? "",
  );
  const [error, setError] = React.useState<string | null>(null);
  const inputId = React.useId();

  function apply() {
    const href = linkHref(address);
    if (!href) {
      setError("Type a web address, like afrikaburn.org.");
      return;
    }
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !editor.isActive("link")) {
      // Nothing selected: the address becomes the link's words.
      chain
        .insertContent({
          type: "text",
          text: address.trim(),
          marks: [{ type: "link", attrs: { href } }],
        })
        .run();
    } else {
      chain.extendMarkRange("link").setLink({ href }).run();
    }
    onDone();
  }

  return (
    <div className="flex flex-col gap-1 border-b border-input px-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={inputId} className="text-xs text-muted-foreground">
          Link to
        </label>
        <Input
          id={inputId}
          value={address}
          autoFocus
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
            if (e.key === "Escape") onDone();
          }}
          placeholder="afrikaburn.org"
          className="h-8 min-w-40 flex-1"
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
        <Button type="button" size="sm" onClick={apply}>
          Add link
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = React.useState(false);
  const chain = () => editor.chain().focus();
  return (
    <>
      <div
        role="toolbar"
        aria-label="Text style"
        className="flex flex-wrap items-center gap-0.5 border-b border-input px-1.5 py-1"
      >
        <ToolbarButton
          label="Heading"
          wide
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        >
          Heading
        </ToolbarButton>
        <ToolbarButton
          label="Subheading"
          wide
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
        >
          Subheading
        </ToolbarButton>
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => chain().toggleBold().run()}
        >
          <Bold className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => chain().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton
          label="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => chain().toggleBulletList().run()}
        >
          <List className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => chain().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => chain().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton
          label="Link"
          wide
          active={editor.isActive("link") || linking}
          onClick={() => setLinking((on) => !on)}
        >
          <Link2 className="mr-1 h-4 w-4" aria-hidden />
          Link
        </ToolbarButton>
        {editor.isActive("link") ? (
          <ToolbarButton
            label="Remove link"
            onClick={() => chain().extendMarkRange("link").unsetLink().run()}
          >
            <Unlink className="h-4 w-4" aria-hidden />
          </ToolbarButton>
        ) : null}
      </div>
      {linking ? (
        <LinkRow editor={editor} onDone={() => setLinking(false)} />
      ) : null}
    </>
  );
}

export interface MarkdownEditorProps {
  /** The Markdown the editor opens on. Read once, when it mounts. */
  value: string;
  /** Fired with the text as Markdown on every edit. */
  onChange: (markdown: string) => void;
  /** The editable region's accessible name: its field's label. */
  ariaLabel: string;
  /** Tied to the field's help text. */
  describedBy?: string;
  disabled?: boolean;
  className?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  ariaLabel,
  describedBy,
  disabled,
  className,
}: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: GUIDE_EDITOR_EXTENSIONS,
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    // Re-render on each change so the toolbar's aria-pressed follows the caret.
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: PROSE_CLASS,
        "aria-label": ariaLabel,
        role: "textbox",
        "aria-multiline": "true",
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      },
    },
    onUpdate: ({ editor: e }) => onChange(editorMarkdown(e)),
  });

  React.useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

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
