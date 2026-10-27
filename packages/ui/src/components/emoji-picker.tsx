"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Smile } from "lucide-react";
import { cn } from "../lib/utils";
import {
  EMOJI_FONT_CLASS,
  EMOJI_GROUPS,
  loadEmojis,
  readRecentEmoji,
  rememberEmoji,
  searchEmojis,
  type Emoji,
} from "../lib/emoji";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

// The emoji panel, Telegram's way (owner's approved mock-up, 2026-10-27): a
// search box, Recent, every group in a scrolling grid and the group tabs along
// the bottom. On a wide screen it opens as a popover by its button; on a phone
// as a sheet from the bottom of the screen (decided in the click, the one place
// a screen check may be read). Recent is kept in this browser only.

const COLUMNS = 8;
/** Below `md`: the panel opens as a sheet. Read only inside an event. */
const PHONE_QUERY = "(max-width: 767px)";

export function EmojiPanel({
  onPick,
  className,
}: {
  onPick: (char: string) => void;
  className?: string;
}) {
  const [emojis, setEmojis] = React.useState<Emoji[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [recent] = React.useState(readRecentEmoji);
  const [active, setActive] = React.useState<string>(
    recent.length ? "recent" : String(EMOJI_GROUPS[0].group),
  );
  const scroller = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let live = true;
    loadEmojis()
      .then((list) => live && setEmojis(list))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const sections = React.useMemo(() => {
    if (!emojis) return [];
    if (query.trim()) {
      return [
        {
          id: "results",
          label: "Results",
          list: searchEmojis(emojis, query).map((e) => e.char),
        },
      ];
    }
    return [
      ...(recent.length
        ? [{ id: "recent", label: "Recent", list: recent }]
        : []),
      ...EMOJI_GROUPS.map((g) => ({
        id: String(g.group),
        label: g.label,
        list: emojis.filter((e) => e.group === g.group).map((e) => e.char),
      })),
    ];
  }, [emojis, query, recent]);

  const names = React.useMemo(
    () => new Map((emojis ?? []).map((e) => [e.char, e.name])),
    [emojis],
  );

  function pick(char: string) {
    rememberEmoji(char);
    onPick(char);
  }

  function jump(id: string) {
    setQuery("");
    setActive(id);
    requestAnimationFrame(() => {
      const box = scroller.current;
      const head = box?.querySelector<HTMLElement>(
        `[data-emoji-section="${id}"]`,
      );
      if (box && head) box.scrollTop = head.offsetTop - box.offsetTop;
    });
  }

  function onScroll() {
    const box = scroller.current;
    if (!box || query) return;
    let current = sections[0]?.id;
    for (const head of box.querySelectorAll<HTMLElement>(
      "[data-emoji-section]",
    )) {
      if (head.offsetTop - box.offsetTop <= box.scrollTop + 8) {
        current = head.dataset.emojiSection;
      }
    }
    if (current && current !== active) setActive(current);
  }

  // Arrow keys walk the grid; Tab leaves it (one stop for the whole grid).
  function onGridKey(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    }[e.key];
    if (!step) return;
    const cells = [
      ...e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-emoji]"),
    ];
    const at = cells.indexOf(document.activeElement as HTMLButtonElement);
    const next = cells[Math.min(Math.max(at + step, 0), cells.length - 1)];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }

  const first = sections.find((s) => s.list.length)?.list[0];

  return (
    <div
      data-emoji-panel
      className={cn("flex w-full flex-col overflow-hidden", className)}
    >
      <div className="p-2">
        <input
          type="search"
          aria-label="Search emoji"
          placeholder="Search emoji"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && query.trim() && first) {
              e.preventDefault();
              pick(first);
            }
          }}
          className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        onKeyDown={onGridKey}
        role="group"
        aria-label="Emoji"
        className="h-64 overflow-y-auto px-2 pb-2 max-md:h-[45dvh]"
      >
        {failed ? (
          <p className="p-3 text-sm text-muted-foreground">
            The emoji did not load. Close this and try again.
          </p>
        ) : !emojis ? (
          <p className="p-3 text-sm text-muted-foreground">Loading emoji…</p>
        ) : (
          sections.map((s, si) => (
            <section key={s.id} aria-label={s.label}>
              <h3
                data-emoji-section={s.id}
                className="px-1 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground"
              >
                {s.label}
              </h3>
              {s.list.length === 0 ? (
                <p className="px-1 text-sm text-muted-foreground">
                  No emoji match that.
                </p>
              ) : (
                <div className="grid grid-cols-8">
                  {s.list.map((char, i) => (
                    <button
                      key={`${s.id}-${char}`}
                      type="button"
                      data-emoji={char}
                      tabIndex={si === 0 && i === 0 ? 0 : -1}
                      title={names.get(char)}
                      aria-label={names.get(char) ?? char}
                      onClick={() => pick(char)}
                      className={cn(
                        "grid h-9 place-items-center rounded-md text-[22px] leading-none hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        EMOJI_FONT_CLASS,
                      )}
                    >
                      {char}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ))
        )}
      </div>
      <div
        role="tablist"
        aria-label="Emoji groups"
        className="flex shrink-0 border-t border-border"
      >
        {[
          ...(recent.length
            ? [{ id: "recent", label: "Recent", icon: "🕘" }]
            : []),
          ...EMOJI_GROUPS.map((g) => ({
            id: String(g.group),
            label: g.label,
            icon: g.icon,
          })),
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={!query && active === t.id}
            aria-label={t.label}
            title={t.label}
            onClick={() => jump(t.id)}
            className={cn(
              EMOJI_FONT_CLASS,
              "flex-1 border-t-2 border-transparent py-1.5 text-base opacity-60 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              !query && active === t.id && "border-primary opacity-100",
            )}
          >
            {t.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The ☺ button and its panel. `onPick` gets the emoji; the caller puts it in
 * its box. The panel closes after a pick and hands focus back with `onClose`.
 */
export function EmojiButton({
  onPick,
  onClose,
  disabled,
  label = "Emoji",
  className,
}: {
  onPick: (char: string) => void;
  onClose?: () => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [sheet, setSheet] = React.useState(false);

  function picked(char: string) {
    setOpen(false);
    setSheet(false);
    onPick(char);
  }

  const button = (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      data-emoji-button
      // Keeps the caret in the box on a pointer press.
      onMouseDown={(e) => e.preventDefault()}
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        (open || sheet) && "text-primary",
        className,
      )}
    >
      <Smile className="h-4 w-4" aria-hidden />
    </button>
  );

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next && window.matchMedia(PHONE_QUERY).matches) {
            setSheet(true);
            return;
          }
          setOpen(next);
          if (!next) onClose?.();
        }}
      >
        <PopoverTrigger asChild>{button}</PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-[22rem] max-w-[calc(100vw-1rem)] p-0"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            onClose?.();
          }}
        >
          <EmojiPanel onPick={picked} />
        </PopoverContent>
      </Popover>
      <DialogPrimitive.Root
        open={sheet}
        onOpenChange={(next) => {
          setSheet(next);
          if (!next) onClose?.();
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[110] bg-black/50" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              onClose?.();
            }}
            className="fixed inset-x-0 bottom-0 z-[111] border-t border-border bg-popover pb-[env(safe-area-inset-bottom)] text-popover-foreground shadow-lg"
          >
            <DialogPrimitive.Title className="sr-only">
              Emoji
            </DialogPrimitive.Title>
            <EmojiPanel onPick={picked} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
