"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Markdown } from "@tiptap/markdown";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
} from "lucide-react";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import {
  altFromFileName,
  filterSlashCommands,
  looksLikeMarkdown,
  slashQuery,
  type SlashCommand,
  type SlashCommandId,
} from "./slash-commands";

// The join page's editor (#264): a Notion-like Markdown editor on the repo's
// Tiptap (the Kitchen source editor's setup, plus Tiptap's own Markdown and
// Image extensions). What it offers, because the owner writes the page in
// Notion first:
//   - paste Notion's "Copy as Markdown" (or any Markdown): it is parsed, not
//     pasted as # and * characters;
//   - pictures: the toolbar button, "/picture", or paste or drop an image file.
//     Each is uploaded to the camp's store and linked as /api/join-image;
//   - a "/" menu at the start of a line or after a space.
// It reads and writes Markdown, which is what the join site renders. The
// extras the page does not render (strike, underline, code) are switched off.
//
// Client-only (Tiptap uses the DOM).

const PROSE_CLASS =
  "min-h-72 min-w-0 max-w-none break-words px-4 py-3 text-sm leading-relaxed focus:outline-none [&>*:first-child]:mt-0 " +
  "[&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-lg [&_h1]:font-semibold " +
  "[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold " +
  "[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold " +
  "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 " +
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 " +
  "[&_strong]:font-semibold [&_a]:text-accent [&_a]:underline " +
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground " +
  "[&_hr]:my-5 [&_hr]:border-border " +
  "[&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_img.ProseMirror-selectednode]:ring-2 [&_img.ProseMirror-selectednode]:ring-ring";

export const JOIN_PAGE_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    link: { openOnClick: false, autolink: true },
  }),
  Image.configure({ allowBase64: false }),
  Markdown,
];

/** Upload one picture; its /api/join-image link, or null (the toast said why). */
async function uploadPicture(file: File): Promise<string | null> {
  const form = new FormData();
  form.set("image", file);
  try {
    const res = await fetch("/api/uploads/join-image", {
      method: "POST",
      body: form,
    });
    const body = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!res.ok || !body.url) {
      toast.error(body.error ?? "The picture didn't upload. Try again.");
      return null;
    }
    return body.url;
  } catch {
    toast.error("The picture didn't upload. Check your connection.");
    return null;
  }
}

function imageFiles(list: FileList | null | undefined): File[] {
  return list ? [...list].filter((f) => f.type.startsWith("image/")) : [];
}

function runCommand(editor: Editor, id: SlashCommandId): void {
  const chain = editor.chain().focus();
  switch (id) {
    case "text":
      chain.setParagraph().run();
      return;
    case "heading":
      chain.setHeading({ level: 2 }).run();
      return;
    case "subheading":
      chain.setHeading({ level: 3 }).run();
      return;
    case "bullets":
      chain.toggleBulletList().run();
      return;
    case "numbers":
      chain.toggleOrderedList().run();
      return;
    case "quote":
      chain.toggleBlockquote().run();
      return;
    case "divider":
      chain.setHorizontalRule().run();
      return;
    case "image":
      // The file picker is the caller's; nothing to change in the text.
      return;
  }
}

interface SlashState {
  /** Where the "/" is, so the command can delete what was typed. */
  from: number;
  to: number;
  query: string;
  index: number;
  top: number;
  left: number;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}

function ToolbarButton({
  onClick,
  active,
  label,
  disabled,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        active && "bg-primary/15 text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export interface JoinPageEditorProps {
  /** The page as the editor opens on it, in Markdown. */
  value: string;
  /** Fired with the page's Markdown on every edit. */
  onChange: (markdown: string) => void;
  ariaLabel: string;
  className?: string;
}

export function JoinPageEditor({
  value,
  onChange,
  ariaLabel,
  className,
}: JoinPageEditorProps) {
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const editorRef = React.useRef<Editor | null>(null);
  const [slash, setSlash] = React.useState<SlashState | null>(null);
  const slashRef = React.useRef<SlashState | null>(null);
  // The "/" the captain closed with Escape stays closed until they move on.
  const dismissedAt = React.useRef<number | null>(null);
  const [uploading, setUploading] = React.useState(0);

  const showSlash = React.useCallback((next: SlashState | null) => {
    slashRef.current = next;
    setSlash(next);
  }, []);

  const insertPictures = React.useCallback(
    async (files: File[], at?: number) => {
      const editor = editorRef.current;
      if (!editor || files.length === 0) return;
      setUploading((n) => n + files.length);
      try {
        for (const file of files) {
          const url = await uploadPicture(file);
          if (!url) continue;
          const chain = editor.chain().focus();
          (at === undefined ? chain : chain.setTextSelection(at))
            .setImage({ src: url, alt: altFromFileName(file.name) })
            .run();
        }
      } finally {
        setUploading((n) => n - files.length);
      }
    },
    [],
  );

  // Read the text before the caret and open, move or close the "/" menu.
  const syncSlash = React.useCallback(
    (editor: Editor) => {
      const { selection } = editor.state;
      const $from = selection.$from;
      if (!selection.empty || $from.parent.type.name !== "paragraph") {
        showSlash(null);
        return;
      }
      const before = $from.parent.textBetween(
        0,
        $from.parentOffset,
        undefined,
        "\ufffc",
      );
      const query = slashQuery(before);
      if (query === null) {
        dismissedAt.current = null;
        showSlash(null);
        return;
      }
      const from = $from.pos - query.length - 1;
      if (dismissedAt.current === from) return;
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const caret = editor.view.coordsAtPos(from);
      const box = wrapper.getBoundingClientRect();
      const menuWidth = 240;
      showSlash({
        from,
        to: $from.pos,
        query,
        index:
          slashRef.current?.from === from
            ? Math.min(
                slashRef.current.index,
                Math.max(filterSlashCommands(query).length - 1, 0),
              )
            : 0,
        top: caret.bottom - box.top + 4,
        left: Math.max(
          0,
          Math.min(caret.left - box.left, box.width - menuWidth),
        ),
      });
    },
    [showSlash],
  );

  const choose = React.useCallback(
    (command: SlashCommand) => {
      const editor = editorRef.current;
      const state = slashRef.current;
      if (!editor || !state) return;
      editor
        .chain()
        .focus()
        .deleteRange({ from: state.from, to: state.to })
        .run();
      showSlash(null);
      if (command.id === "image") fileRef.current?.click();
      else runCommand(editor, command.id);
    },
    [showSlash],
  );

  const editor = useEditor({
    extensions: JOIN_PAGE_EXTENSIONS,
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
      },
      handleKeyDown: (_view, event) => {
        const state = slashRef.current;
        if (!state) return false;
        const options = filterSlashCommands(state.query);
        if (event.key === "Escape") {
          dismissedAt.current = state.from;
          showSlash(null);
          return true;
        }
        if (options.length === 0) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const step = event.key === "ArrowDown" ? 1 : -1;
          showSlash({
            ...state,
            index: (state.index + step + options.length) % options.length,
          });
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const command = options[state.index];
          if (command) choose(command);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const pictures = imageFiles(event.clipboardData?.files);
        if (pictures.length > 0) {
          void insertPictures(pictures);
          return true;
        }
        const text = event.clipboardData?.getData("text/plain") ?? "";
        const current = editorRef.current;
        if (current && text && looksLikeMarkdown(text)) {
          current.commands.insertContent(text, { contentType: "markdown" });
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const pictures = imageFiles(event.dataTransfer?.files);
        if (pictures.length === 0) return false;
        const at = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos;
        void insertPictures(pictures, at);
        return true;
      },
    },
    onCreate: ({ editor: e }) => {
      editorRef.current = e;
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.getMarkdown());
      syncSlash(e);
    },
    onSelectionUpdate: ({ editor: e }) => syncSlash(e),
    onBlur: () => showSlash(null),
  });

  // onCreate sets it too; this covers an editor Tiptap recreates.
  React.useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const options = slash ? filterSlashCommands(slash.query) : [];

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative min-w-0 rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring",
        className,
      )}
    >
      {editor ? (
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex flex-wrap items-center gap-0.5 border-b border-input px-1.5 py-1"
        >
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
            label="Heading"
            active={
              editor.isActive("heading", { level: 2 }) ||
              editor.isActive("heading", { level: 1 })
            }
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 className="h-4 w-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Subheading"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            <Heading3 className="h-4 w-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Bulleted list"
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
            label="Quote"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="h-4 w-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Divider"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </ToolbarButton>
          <ToolbarButton
            label="Add a picture"
            disabled={uploading > 0}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
          </ToolbarButton>
          {uploading > 0 ? (
            <span
              role="status"
              className="ml-auto px-2 text-xs text-muted-foreground"
            >
              Uploading…
            </span>
          ) : null}
        </div>
      ) : null}

      <EditorContent editor={editor} />

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a picture"
        onChange={(e) => {
          const files = imageFiles(e.target.files);
          e.target.value = "";
          void insertPictures(files);
        }}
      />

      {slash && options.length > 0 ? (
        <div
          role="listbox"
          aria-label="Insert"
          className="absolute z-20 max-h-64 w-60 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          style={{ top: slash.top, left: slash.left }}
        >
          {options.map((command, i) => (
            <button
              key={command.id}
              type="button"
              role="option"
              aria-selected={i === slash.index}
              ref={(el) => {
                if (el && i === slash.index)
                  el.scrollIntoView({ block: "nearest" });
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(command);
              }}
              className={cn(
                "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm",
                i === slash.index ? "bg-muted" : "hover:bg-muted/60",
              )}
            >
              <span className="font-medium">{command.label}</span>
              <span className="text-xs text-muted-foreground">
                {command.hint}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
