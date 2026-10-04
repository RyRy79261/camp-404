"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lock,
  Quote,
  Unlink,
} from "lucide-react";
import { Button } from "@camp404/ui/components/button";
import { Input } from "@camp404/ui/components/input";
import { cn } from "@camp404/ui/lib/utils";
import {
  CHAPTER_EDITOR_EXTENSIONS,
  editorMarkdown,
  NOTES_EDITOR_EXTENSIONS,
} from "./markdown-extensions";
import {
  docFromValue,
  PARAGRAPH_EDITOR_EXTENSIONS,
  valueFromDoc,
} from "@/components/markdown/paragraph-text";

// The Survival Guide's text editor (#250; owner, 2026-10-01: "Just make a
// WYSIWYG Markdown editor"). The writer sees headings, bold and lists as
// members will, never Markdown signs; the chapter is still stored as Markdown
// (Tiptap's own Markdown extension reads it in and writes it out). Set up and
// styled like the recipe source editor (components/recipes/
// source-section-editor.tsx): a toolbar of plain buttons over the text, the
// box growing with its text. Tiptap's keyboard shortcuts work too (Ctrl+B,
// Ctrl+I, and "## " or "- " typed at the start of a line). Client-only
// (Tiptap uses the DOM).
//
// There is one editor (owner's rule): a "paragraphs" mode (for the Join
// site's words, @/components/markdown/paragraph-text) swaps in a dialect that
// keeps only paragraphs with bold and italic, with its own small toolbar, so
// the join site's words can never hold a heading, a list or a link.

const PROSE_CLASS =
  "min-h-full min-w-0 max-w-none break-words px-3 py-2 text-sm leading-relaxed focus:outline-none " +
  "[&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold " +
  "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold " +
  "[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-semibold " +
  "[&>*:first-child]:mt-0 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
  "[&_strong]:font-semibold [&_em]:italic " +
  "[&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground";

/**
 * A chapter's "Members only" part (#250): a dashed box in the accent colour,
 * tagged with what it is and where it does not go (its data-tag and
 * data-why, set by the node).
 */
const MEMBERS_ONLY_CLASS =
  "[&_[data-members-only]]:relative [&_[data-members-only]]:my-5 [&_[data-members-only]]:border [&_[data-members-only]]:border-dashed [&_[data-members-only]]:border-accent [&_[data-members-only]]:bg-accent/5 [&_[data-members-only]]:px-3 [&_[data-members-only]]:pb-1 [&_[data-members-only]]:pt-4 " +
  "[&_[data-members-only]]:before:absolute [&_[data-members-only]]:before:-top-2.5 [&_[data-members-only]]:before:left-2 [&_[data-members-only]]:before:bg-accent [&_[data-members-only]]:before:px-1.5 [&_[data-members-only]]:before:py-0.5 [&_[data-members-only]]:before:font-mono [&_[data-members-only]]:before:text-[10px] [&_[data-members-only]]:before:uppercase [&_[data-members-only]]:before:tracking-[0.15em] [&_[data-members-only]]:before:text-accent-foreground [&_[data-members-only]]:before:content-[attr(data-tag)] " +
  "[&_[data-members-only]]:after:absolute [&_[data-members-only]]:after:-top-2 [&_[data-members-only]]:after:right-2 [&_[data-members-only]]:after:bg-background [&_[data-members-only]]:after:px-1.5 [&_[data-members-only]]:after:text-[11px] [&_[data-members-only]]:after:text-accent [&_[data-members-only]]:after:content-[attr(data-why)]";

function ToolbarButton({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
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
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
    <div className="flex shrink-0 flex-col gap-1 border-b border-input px-2 py-2">
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

/** The paragraphs mode's toolbar: the only marks its words can hold. */
function MarksToolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus();
  return (
    <div
      role="toolbar"
      aria-label="Text style"
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-input px-2 py-1"
    >
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
    </div>
  );
}

function Toolbar({
  editor,
  membersOnly,
}: {
  editor: Editor;
  membersOnly?: boolean;
}) {
  const [linking, setLinking] = React.useState(false);
  const chain = () => editor.chain().focus();
  return (
    <>
      <div
        role="toolbar"
        aria-label="Text style"
        className="flex shrink-0 flex-wrap items-center gap-1 border-b border-input px-2 py-1"
      >
        <ToolbarButton
          label="Heading"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          label="Subheading"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
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
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
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
        <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
        <ToolbarButton
          label="Link"
          active={editor.isActive("link") || linking}
          onClick={() => setLinking((on) => !on)}
        >
          <Link2 className="h-4 w-4" aria-hidden />
        </ToolbarButton>
        {editor.isActive("link") ? (
          <ToolbarButton
            label="Remove link"
            onClick={() => chain().extendMarkRange("link").unsetLink().run()}
          >
            <Unlink className="h-4 w-4" aria-hidden />
          </ToolbarButton>
        ) : null}
        {membersOnly ? (
          <>
            <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
            {/* Wraps the selected paragraphs, headings and lists in a part
                the public site never gets; inside one, unwraps it. */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => chain().toggleMembersOnly().run()}
              aria-pressed={editor.isActive("membersOnly")}
              title="Keep the selected part for camp members: it is not shown on the public site"
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-accent/60 px-2 font-mono text-[10px] uppercase tracking-[0.15em] text-accent transition-colors hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                editor.isActive("membersOnly") &&
                  "border-accent bg-accent text-accent-foreground hover:bg-accent",
              )}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Members only
            </button>
          </>
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
  /**
   * Fill the box it is put in, the text scrolling under a fixed toolbar, with
   * no frame of its own (the Write pane draws it). Otherwise a framed box at
   * least eight lines tall that grows with its text.
   */
  fill?: boolean;
  /**
   * "markdown" (the default): the value is Markdown, with headings, lists,
   * quotes and links. "paragraphs": the value is paragraphs with only bold
   * and italic, kept in the join site's own small dialect
   * (@/components/markdown/paragraph-text).
   */
  mode?: "markdown" | "paragraphs";
  /**
   * A Survival Guide chapter: "Members only" parts, with their toolbar
   * button, for the parts the public site never gets (#250).
   */
  membersOnly?: boolean;
  className?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  ariaLabel,
  describedBy,
  disabled,
  fill,
  mode = "markdown",
  membersOnly,
  className,
}: MarkdownEditorProps) {
  const paragraphs = mode === "paragraphs";
  const editor = useEditor({
    extensions: paragraphs
      ? PARAGRAPH_EDITOR_EXTENSIONS
      : membersOnly
        ? CHAPTER_EDITOR_EXTENSIONS
        : NOTES_EDITOR_EXTENSIONS,
    ...(paragraphs
      ? { content: docFromValue(value) }
      : { content: value, contentType: "markdown" as const }),
    immediatelyRender: false,
    // Re-render on each change so the toolbar's aria-pressed follows the caret.
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: membersOnly
          ? `${PROSE_CLASS} ${MEMBERS_ONLY_CLASS}`
          : PROSE_CLASS,
        "aria-label": ariaLabel,
        role: "textbox",
        "aria-multiline": "true",
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      },
    },
    onUpdate: ({ editor: e }) =>
      onChange(paragraphs ? valueFromDoc(e.getJSON()) : editorMarkdown(e)),
  });

  React.useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col bg-background",
        fill
          ? "h-full min-h-0"
          : "rounded-md border border-input focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      {editor ? (
        paragraphs ? (
          <MarksToolbar editor={editor} />
        ) : (
          <Toolbar editor={editor} membersOnly={membersOnly} />
        )
      ) : null}
      <EditorContent
        editor={editor}
        className={cn(
          "flex min-h-0 flex-1 flex-col [&>.ProseMirror]:flex-1",
          fill ? "overflow-y-auto" : "min-h-32",
        )}
      />
    </div>
  );
}
