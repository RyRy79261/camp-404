"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import { EmojiButton } from "@camp404/ui/components/emoji-picker";
import {
  EMOJI_FONT_CLASS,
  loadEmojis,
  rememberEmoji,
  searchEmojis,
  shortcodeAt,
  type Emoji,
} from "@camp404/ui/lib/emoji";
import { cn } from "@camp404/ui/lib/utils";

// Emoji in the long-text editors (owner, 2026-10-27: Telegram's way, in every
// text box): the toolbar's ☺ opens the panel, and `:name` typed in the text
// opens a row of matches by the caret (← → to move, Enter or Tab to put one
// in, Esc to close). The plain boxes' twin is EmojiFrame in @camp404/ui.

/** The toolbar's ☺: puts the emoji where the caret is. */
export function EditorEmojiButton({ editor }: { editor: Editor }) {
  return (
    <EmojiButton
      className="h-8 w-8"
      disabled={!editor.isEditable}
      onPick={(char) => editor.chain().focus().insertContent(char).run()}
      onClose={() => editor.commands.focus()}
    />
  );
}

/** The `:name` row for an editor, drawn by the caret. */
export function EditorShortcodes({ editor }: { editor: Editor }) {
  const [matches, setMatches] = React.useState<Emoji[]>([]);
  const [at, setAt] = React.useState(0);
  const [place, setPlace] = React.useState<{ left: number; top: number }>();
  const range = React.useRef<{ from: number; to: number } | null>(null);
  const asked = React.useRef(0);
  // The latest row, for the editor's key listener (set after each render).
  const live = React.useRef({ matches, at });
  React.useEffect(() => {
    live.current = { matches, at };
  }, [matches, at]);

  const choose = React.useCallback(
    (i: number) => {
      const emoji = live.current.matches[i];
      const r = range.current;
      if (!emoji || !r) return;
      editor.chain().focus().insertContentAt(r, emoji.char).run();
      rememberEmoji(emoji.char);
      setMatches([]);
    },
    [editor],
  );

  React.useEffect(() => {
    const check = () => {
      const { selection } = editor.state;
      if (!selection.empty || !editor.isFocused) {
        setMatches([]);
        return;
      }
      const $from = selection.$from;
      const before = $from.parent.textBetween(
        0,
        $from.parentOffset,
        undefined,
        "￼",
      );
      const found = shortcodeAt(before);
      if (!found) {
        setMatches([]);
        return;
      }
      const ask = ++asked.current;
      const from = selection.from - (before.length - found.start);
      loadEmojis()
        .then((list) => {
          if (ask !== asked.current) return;
          range.current = { from, to: selection.from };
          const c = editor.view.coordsAtPos(from);
          setPlace({ left: c.left, top: c.top });
          setMatches(searchEmojis(list, found.query, 8));
          setAt(0);
        })
        .catch(() => setMatches([]));
    };
    const close = () => setMatches([]);
    // Before ProseMirror: a key the row takes never reaches the editor.
    const onKey = (e: KeyboardEvent) => {
      const { matches: m, at: i } = live.current;
      if (m.length === 0 || e.isComposing) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        setAt((i + (e.key === "ArrowRight" ? 1 : -1) + m.length) % m.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        choose(i);
      } else if (e.key === "Escape") {
        close();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    editor.on("update", check);
    editor.on("selectionUpdate", check);
    editor.on("blur", close);
    const dom = editor.view.dom;
    dom.addEventListener("keydown", onKey, true);
    return () => {
      editor.off("update", check);
      editor.off("selectionUpdate", check);
      editor.off("blur", close);
      dom.removeEventListener("keydown", onKey, true);
    };
  }, [editor, choose]);

  if (matches.length === 0 || !place) return null;
  return createPortal(
    <div
      role="listbox"
      aria-label="Emoji matches"
      className="fixed z-[110] flex gap-0.5 rounded-lg border bg-popover p-1 shadow-lg"
      style={{
        left: place.left,
        top: place.top - 4,
        transform: "translateY(-100%)",
      }}
    >
      {matches.map((m, i) => (
        <button
          key={m.char}
          type="button"
          role="option"
          tabIndex={-1}
          aria-selected={i === at}
          aria-label={m.name}
          title={`:${m.codes[0] ?? m.name.replace(/\s+/g, "_")}:`}
          onMouseDown={(e) => {
            e.preventDefault();
            choose(i);
          }}
          className={cn(
            "grid h-9 w-9 place-items-center rounded-md text-[22px] leading-none hover:bg-muted",
            EMOJI_FONT_CLASS,
            i === at && "bg-primary/20",
          )}
        >
          {m.char}
        </button>
      ))}
    </div>,
    document.body,
  );
}
