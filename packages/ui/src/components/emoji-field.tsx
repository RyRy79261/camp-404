"use client";

import * as React from "react";
import { cn } from "../lib/utils";
import {
  EMOJI_FONT_CLASS,
  insertIntoField,
  loadEmojis,
  rememberEmoji,
  searchEmojis,
  shortcodeAt,
  type Emoji,
} from "../lib/emoji";
import { EmojiButton } from "./emoji-picker";
import { Popover, PopoverAnchor, PopoverContent } from "./popover";

// What Input and Textarea share to offer emoji (owner, 2026-10-27, every text
// box): the ☺ button at the box's right edge, and Telegram's `:name` row, a
// strip of matches above the box while a shortcode is typed (← → to move,
// Enter or Tab to put one in, Esc to close). The box keeps its own classes;
// the ones that place it in its row (width, flex, margins, grid cells,
// display) move to the frame around it, so a form's layout does not change.

type Box = HTMLInputElement | HTMLTextAreaElement;

const LAYOUT =
  /^-?(m[trblxy]?-|w-|min-w-|max-w-|flex-|basis-|grow|shrink|self-|justify-self-|place-self-|col-|row-|order-|hidden$|block$|inline|contents$|sr-only$)/;

/** A box's classes split into the frame's (its place) and its own. */
export function splitLayoutClasses(className = ""): {
  frame: string;
  box: string;
} {
  const frame: string[] = [];
  const box: string[] = [];
  for (const c of className.split(/\s+/).filter(Boolean)) {
    const base = c.slice(c.lastIndexOf(":") + 1).replace(/^!/, "");
    (LAYOUT.test(base) ? frame : box).push(c);
  }
  return { frame: frame.join(" "), box: box.join(" ") };
}

function setRefs<T>(value: T, ...refs: (React.Ref<T> | undefined)[]) {
  for (const ref of refs) {
    if (typeof ref === "function") ref(value);
    else if (ref) (ref as React.RefObject<T>).current = value;
  }
}

/** The `:name` row's state and the key and input handlers that drive it. */
function useShortcodes(box: React.RefObject<Box | null>) {
  const [matches, setMatches] = React.useState<Emoji[]>([]);
  const [at, setAt] = React.useState(0);
  const start = React.useRef(-1);
  const asked = React.useRef(0);

  const close = React.useCallback(() => setMatches([]), []);

  const check = React.useCallback(() => {
    const el = box.current;
    if (!el) return;
    const caret = el.selectionStart ?? 0;
    const found = shortcodeAt(el.value.slice(0, caret));
    if (!found) {
      setMatches([]);
      return;
    }
    const ask = ++asked.current;
    loadEmojis()
      .then((list) => {
        if (ask !== asked.current) return;
        start.current = found.start;
        setMatches(searchEmojis(list, found.query, 8));
        setAt(0);
      })
      .catch(() => setMatches([]));
  }, [box]);

  const choose = React.useCallback(
    (i: number) => {
      const el = box.current;
      const emoji = matches[i];
      if (!el || !emoji) return;
      if (
        insertIntoField(el, emoji.char, start.current, el.selectionStart ?? 0)
      ) {
        rememberEmoji(emoji.char);
      }
      setMatches([]);
    },
    [box, matches],
  );

  /** True when the key was the row's (the box's own handler is skipped). */
  const onKey = (e: React.KeyboardEvent<Box>): boolean => {
    if (matches.length === 0 || e.nativeEvent.isComposing) return false;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const step = e.key === "ArrowRight" ? 1 : -1;
      setAt((at + step + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      choose(at);
    } else if (e.key === "Escape") {
      close();
    } else {
      return false;
    }
    e.preventDefault();
    e.stopPropagation();
    return true;
  };

  return { matches, at, choose, close, check, onKey };
}

type BoxProps =
  | React.InputHTMLAttributes<HTMLInputElement>
  | React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/** The box's own handlers, which the frame calls before its own work. */
type Handlers = {
  onKeyDown?: (e: React.KeyboardEvent<never>) => void;
  onInput?: (e: React.FormEvent<never>) => void;
  onBlur?: (e: React.FocusEvent<never>) => void;
};

/**
 * A text box with emoji: the box (`as`, with `boxProps` and `boxClassName`,
 * the box's own look) inside a frame with the ☺ button and the `:name` row.
 * The button sits on the right, centred, for a one-line box; at the bottom
 * right for a textarea. `className` is the caller's, split between the frame
 * (its place in the row) and the box.
 */
export function EmojiFrame<T extends Box>({
  as,
  className,
  boxClassName,
  forwardedRef,
  boxProps,
}: {
  as: "input" | "textarea";
  className?: string;
  boxClassName: string;
  forwardedRef: React.Ref<T>;
  boxProps: BoxProps;
}) {
  const box = React.useRef<T | null>(null);
  const { frame, box: own } = splitLayoutClasses(className);
  const sc = useShortcodes(box as React.RefObject<Box | null>);
  const ref = React.useCallback(
    (el: T | null) => setRefs(el, box, forwardedRef),
    [forwardedRef],
  );
  const hasWidth = /(^|\s|:)(w-|flex-|basis-|grow)/.test(frame);
  const Tag = as as React.ElementType;
  const { onKeyDown, onInput, onBlur } = boxProps as Handlers;

  return (
    <Popover
      open={sc.matches.length > 0}
      onOpenChange={(next) => {
        if (!next) sc.close();
      }}
    >
      <PopoverAnchor asChild>
        <div
          data-emoji-frame
          className={cn("relative", !hasWidth && "w-full", frame)}
        >
          <Tag
            {...boxProps}
            ref={ref}
            className={cn(boxClassName, own, "w-full pr-9")}
            onKeyDown={(e: React.KeyboardEvent<T>) => {
              if (sc.onKey(e)) return;
              onKeyDown?.(e as never);
            }}
            onInput={(e: React.FormEvent<T>) => {
              onInput?.(e as never);
              sc.check();
            }}
            onBlur={(e: React.FocusEvent<T>) => {
              onBlur?.(e as never);
              sc.close();
            }}
          />
          <EmojiButton
            disabled={boxProps.disabled}
            onPick={(char) => {
              const el = box.current;
              if (el) insertIntoField(el, char);
            }}
            onClose={() => box.current?.focus()}
            className={cn(
              "absolute right-1",
              as === "input" ? "top-1/2 -translate-y-1/2" : "bottom-1.5",
            )}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={4}
        className="flex w-auto gap-0.5 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        aria-label="Emoji matches"
      >
        {sc.matches.map((m, i) => (
          <button
            key={m.char}
            type="button"
            tabIndex={-1}
            title={`:${m.codes[0] ?? m.name.replace(/\s+/g, "_")}:`}
            aria-label={m.name}
            aria-pressed={i === sc.at}
            onMouseDown={(e) => {
              e.preventDefault();
              sc.choose(i);
            }}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-md text-[22px] leading-none hover:bg-muted",
              EMOJI_FONT_CLASS,
              i === sc.at && "bg-primary/20",
            )}
          >
            {m.char}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
