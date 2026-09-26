"use client";

import {
  useEffect,
  useId,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { PHONE_QUERY } from "./use-phone";
import { useLeaveGuard, WindowKeyProvider } from "./use-window-dirty";
import type { Edge, OsWindow, Rect } from "./window-manager";

type Props<K extends string> = {
  win: OsWindow<K>;
  title: string;
  /**
   * The old file name's extension after the title, quiet (decision 9 B:
   * "Roster .db"). Hidden from assistive tech and on a phone; the window's
   * name is the title alone.
   */
  suffix?: string;
  /**
   * Something drawn over the frame's top edge, outside the body (a cat that
   * peeks over the focused window now and then). Decorative: the caller
   * keeps it `aria-hidden` and free of pointer events.
   */
  decoration?: ReactNode;
  /**
   * Draw the title as an h2. Off by default: in the console the page inside
   * the window owns the headings. Join's windows sit under its page h1 and
   * start at h3, so Join turns it on.
   */
  titleHeading?: boolean;
  isTop: boolean;
  /** Minimised, or under the top window on a phone: kept mounted, not shown. */
  hidden: boolean;
  /** Phone layout: full screen, no dragging or resizing under a thumb. */
  phone: boolean;
  /**
   * Chosen by CSS, not by `phone` (the console): full screen with a big
   * Back/Close below `md`, a floating window from `md` up, so the server's
   * first paint is already right on a phone. Dragging and resizing check the
   * screen when they start. The frame's bottom edge on a phone is the
   * `--os-phone-bar` variable (the bottom bar's height), 0 when unset.
   */
  responsive?: boolean;
  /**
   * With `responsive`: not shown on a phone, where one window shows at a
   * time (the app decides which).
   */
  phoneHidden?: boolean;
  /**
   * Move focus into the window when it first mounts (the element marked
   * data-autofocus, else the frame). On unless turned off: the console moves
   * focus itself when a page arrives, and never for a restored window.
   */
  autoFocus?: boolean;
  /** Opening is on its way (the page not there yet): the title bar blinks. */
  pending?: boolean;
  /**
   * A frozen copy behind the live window (the console's background page
   * windows). A pointer still raises it, but screen readers and the Tab key
   * see one live window: the frame is no landmark and is hidden from
   * assistive tech, and its title-bar buttons leave the tab order. The
   * taskbar is the keyboard's way to it.
   */
  background?: boolean;
  /**
   * The window wants to come forward: a press in it, or focus moving into
   * it. A press on a title-bar button (close, minimise) is not a request.
   */
  onFocus: (via: "pointer" | "focus") => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (from: Rect, edge: Edge, dx: number, dy: number) => void;
  children: ReactNode;
};

// Eight invisible grips around the frame: four edges, four corners.
const GRIPS: { edge: Edge; className: string }[] = [
  { edge: "n", className: "inset-x-2 -top-1 h-2 cursor-ns-resize" },
  { edge: "s", className: "inset-x-2 -bottom-1 h-2 cursor-ns-resize" },
  { edge: "e", className: "inset-y-2 -right-1 w-2 cursor-ew-resize" },
  { edge: "w", className: "inset-y-2 -left-1 w-2 cursor-ew-resize" },
  { edge: "nw", className: "-left-1 -top-1 size-3 cursor-nwse-resize" },
  { edge: "ne", className: "-right-1 -top-1 size-3 cursor-nesw-resize" },
  { edge: "sw", className: "-bottom-1 -left-1 size-3 cursor-nesw-resize" },
  { edge: "se", className: "-bottom-1 -right-1 size-4 cursor-nwse-resize" },
];

/**
 * Follow one pointer until it lets go, reporting at most once a frame: a
 * fast drag fires many moves between two paints, and only the last counts.
 * Letting go reports the final position at once.
 */
function track(
  e: PointerEvent<HTMLElement>,
  onMove: (dx: number, dy: number) => void,
) {
  const el = e.currentTarget;
  const x0 = e.clientX;
  const y0 = e.clientY;
  el.setPointerCapture(e.pointerId);
  let frame = 0;
  let pending: [number, number] | null = null;
  const flush = () => {
    frame = 0;
    if (!pending) return;
    const [dx, dy] = pending;
    pending = null;
    onMove(dx, dy);
  };
  const move = (ev: globalThis.PointerEvent) => {
    pending = [ev.clientX - x0, ev.clientY - y0];
    if (!frame) frame = requestAnimationFrame(flush);
  };
  const up = () => {
    cancelAnimationFrame(frame);
    flush();
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

/**
 * One window: a labelled region (not a dialog, which it is not: the rest of
 * the desktop stays usable), with a title bar to drag, eight grips to resize
 * and a body that scrolls on its own. Positioned with left and top, never a
 * transform, so drag-and-drop and popovers inside it measure true.
 */
export function OsWindowFrame<K extends string>({
  win,
  title,
  suffix,
  decoration,
  titleHeading = false,
  isTop,
  hidden,
  phone,
  responsive = false,
  phoneHidden = false,
  autoFocus = true,
  pending = false,
  background = false,
  onFocus,
  onClose,
  onMinimize,
  onToggleMaximize,
  onMove,
  onResize,
  children,
}: Props<K>) {
  const ref = useRef<HTMLElement>(null);
  const titleId = `${useId()}-title`;
  const Title = titleHeading ? "h2" : "span";
  const fills = phone || win.maximized;
  const mayLeave = useLeaveGuard();

  // A page with unsaved input is asked about first.
  const close = () => {
    if (mayLeave(win.id)) onClose();
  };
  const minimize = () => {
    if (mayLeave(win.id)) onMinimize();
  };

  // Focus moves into a window when it opens: to the element that asks for it
  // (the terminal's prompt), else the window itself.
  const focusOnMount = useRef(autoFocus);
  useEffect(() => {
    const el = ref.current;
    if (!el || !focusOnMount.current) return;
    const wanted = el.querySelector<HTMLElement>("[data-autofocus]");
    (wanted ?? el).focus({ preventScroll: true });
  }, []);

  // Esc closes the window, but only an Esc nobody else used, pressed on
  // something really inside it. React sends a portal's events up through
  // the window too, so without the second check dismissing a select menu
  // or a popover drawn outside the window would close the program with it.
  // Not from a field being typed in either: Esc there clears a search or
  // leaves an edit, and must not take the program (and the typing) with it.
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (!e.currentTarget.contains(e.target as Node)) return;
    if (isEditable(e.target)) return;
    e.stopPropagation();
    close();
  }

  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if (fills || e.button !== 0 || onPhoneNow()) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const { x, y } = win;
    track(e, (dx, dy) => onMove(x + dx, y + dy));
  }

  function startResize(edge: Edge, e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || onPhoneNow()) return;
    e.stopPropagation();
    const from = { x: win.x, y: win.y, w: win.w, h: win.h };
    track(e, (dx, dy) => onResize(from, edge, dx, dy));
  }

  // A responsive frame is a floating window only from md up, where CSS
  // reads its place from variables; inline left/top would win over the
  // phone's full-screen classes.
  function onPhoneNow() {
    return responsive && window.matchMedia(PHONE_QUERY).matches;
  }

  const placement: CSSProperties = responsive
    ? ({
        zIndex: 20 + win.z,
        "--win-x": `${win.x}px`,
        "--win-y": `${win.y}px`,
        "--win-w": `${win.w}px`,
        "--win-h": `${win.h}px`,
      } as CSSProperties)
    : fills
      ? { zIndex: 20 + win.z }
      : {
          zIndex: 20 + win.z,
          left: win.x,
          top: win.y,
          width: win.w,
          height: win.h,
        };

  const button =
    "grid size-7 place-items-center font-mono leading-none hover:bg-os-bg/30";

  const frameClass = responsive
    ? `max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:bottom-[var(--os-phone-bar,0px)] ${
        phoneHidden ? "max-md:hidden" : ""
      } md:border ${
        win.maximized
          ? "md:absolute md:inset-0"
          : "md:absolute md:left-[var(--win-x)] md:top-[var(--win-y)] md:h-[var(--win-h)] md:w-[var(--win-w)]"
      } ${
        isTop
          ? "border-os-primary md:shadow-[0_0_40px_-8px_var(--os-primary),8px_8px_0_0_rgb(0_0_0/0.45)]"
          : "border-os-line md:shadow-[6px_6px_0_0_rgb(0_0_0/0.4)]"
      }`
    : `border ${
        phone
          ? "fixed inset-x-0 top-0 bottom-10"
          : win.maximized
            ? "absolute inset-0"
            : "absolute"
      } ${
        isTop
          ? "border-os-primary shadow-[0_0_40px_-8px_var(--os-primary),8px_8px_0_0_rgb(0_0_0/0.45)]"
          : "border-os-line shadow-[6px_6px_0_0_rgb(0_0_0/0.4)]"
      }`;

  return (
    <section
      ref={ref}
      aria-roledescription={background ? undefined : "window"}
      aria-labelledby={background ? undefined : titleId}
      aria-hidden={background || undefined}
      tabIndex={-1}
      data-window={win.id}
      data-window-title={title}
      data-top={isTop || undefined}
      data-maximized={win.maximized || undefined}
      aria-busy={pending || undefined}
      hidden={hidden}
      onPointerDownCapture={(e) => {
        if ((e.target as HTMLElement).closest("[data-titlebar] button")) {
          return;
        }
        onFocus("pointer");
      }}
      onFocusCapture={() => onFocus("focus")}
      onKeyDown={onKeyDown}
      style={placement}
      className={`os-window-in pointer-events-auto flex flex-col outline-none ${frameClass} bg-os-panel`}
    >
      {decoration}
      <div
        data-titlebar
        onPointerDown={startDrag}
        onDoubleClick={(e) => {
          if (phone || onPhoneNow()) return;
          if ((e.target as HTMLElement).closest("button")) return;
          onToggleMaximize();
        }}
        className={`flex shrink-0 select-none items-center justify-between gap-2 border-b pr-1 ${
          responsive ? "h-12 md:h-9 md:pl-3" : "h-9 pl-3"
        } ${fills ? "" : responsive ? "md:cursor-grab md:active:cursor-grabbing" : "cursor-grab active:cursor-grabbing"} ${
          isTop
            ? "border-os-primary bg-os-primary text-os-primary-fg"
            : // The quiet colour lifted toward the text (5.5:1 on the chrome;
              // plain muted is 3.7:1).
              "border-os-line bg-os-chrome text-[color-mix(in_oklch,var(--os-muted)_60%,var(--os-fg))]"
        }`}
      >
        {responsive && (
          // A phone's way out: big, on the left, the first thing a thumb
          // finds (visual-language doc, section 9).
          <button
            type="button"
            onClick={close}
            tabIndex={background ? -1 : undefined}
            aria-label={`Back, close ${title}`}
            className="flex h-12 min-w-11 shrink-0 items-center gap-1 pl-2 pr-3 font-pixel text-xs uppercase hover:bg-os-bg/30 md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="square"
              strokeLinejoin="miter"
              aria-hidden
              className="size-5 shrink-0"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
            Back
          </button>
        )}
        <span
          className={`flex min-w-0 items-baseline gap-2 ${
            responsive ? "max-md:flex-1 max-md:justify-center" : ""
          }`}
        >
          <Title
            id={titleId}
            className={`truncate font-pixel text-xs uppercase tracking-[0.2em] ${
              responsive ? "max-md:text-center max-md:text-sm" : ""
            } ${pending ? "os-pending" : ""}`}
          >
            {title}
          </Title>
          {suffix && (
            <span
              aria-hidden
              data-suffix
              className={`shrink-0 font-mono text-[10px] normal-case tracking-normal opacity-55 ${
                responsive ? "max-md:hidden" : ""
              }`}
            >
              {suffix}
            </span>
          )}
        </span>
        {responsive && (
          // Balances the Back button, so the title sits in the middle.
          <span aria-hidden className="w-[4.75rem] shrink-0 md:hidden" />
        )}
        <div
          className={`flex shrink-0 items-center ${responsive ? "max-md:hidden" : ""}`}
        >
          <button
            type="button"
            onClick={minimize}
            tabIndex={background ? -1 : undefined}
            aria-label={`Minimise ${title}`}
            title="Minimise"
            className={button}
          >
            <span aria-hidden className="mt-2 block h-0.5 w-3 bg-current" />
          </button>
          {!phone && (
            <button
              type="button"
              onClick={onToggleMaximize}
              tabIndex={background ? -1 : undefined}
              aria-label={`${win.maximized ? "Restore" : "Full screen"} ${title}`}
              aria-pressed={!!win.maximized}
              title={win.maximized ? "Restore" : "Full screen"}
              className={button}
            >
              {win.maximized ? (
                <span aria-hidden className="relative block size-3">
                  <span className="absolute right-0 top-0 size-2 border border-current" />
                  <span className="absolute bottom-0 left-0 size-2 border border-current bg-inherit" />
                </span>
              ) : (
                <span
                  aria-hidden
                  className="block size-3 border border-t-2 border-current"
                />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={close}
            tabIndex={background ? -1 : undefined}
            aria-label={`Close ${title}`}
            title="Close"
            className={`${button} text-lg`}
          >
            ×
          </button>
        </div>
      </div>
      {/* Its own scroll box and size container, keyed by the window, so one
          window's scroll position never carries into another. Its text can be
          selected, though the desktop's chrome around it cannot. The page
          container: the kit's page-sm/md/lg/xl variants lay the page out by
          this box's width, not the screen's (@camp404/ui styles). */}
      <div
        key={win.id}
        data-window-body
        data-page-container
        className="@container/page min-h-0 flex-1 select-text overflow-auto overscroll-contain"
      >
        <WindowKeyProvider windowKey={win.id}>{children}</WindowKeyProvider>
      </div>
      {!fills && (
        <>
          <div
            aria-hidden
            className={`pointer-events-none absolute bottom-0 right-0 size-4 ${responsive ? "max-md:hidden" : ""} bg-[linear-gradient(135deg,transparent_50%,var(--os-line)_50%,var(--os-line)_60%,transparent_60%,transparent_70%,var(--os-line)_70%,var(--os-line)_80%,transparent_80%)]`}
          />
          {GRIPS.map((g) => (
            <div
              key={g.edge}
              aria-hidden
              data-grip={g.edge}
              onPointerDown={(e) => startResize(g.edge, e)}
              className={`absolute z-10 ${g.className} ${responsive ? "max-md:hidden" : ""}`}
            />
          ))}
        </>
      )}
    </section>
  );
}

/** Input types that take no typing: Esc on them may close the window. */
const NOT_TYPED = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/** Something the member types into, where Esc belongs to the field. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NOT_TYPED.has(target.type);
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  if (target.closest("[contenteditable]:not([contenteditable='false'])")) {
    return true;
  }
  // A Select's trigger is a button with role="combobox": nothing is typed
  // there, so Esc on it is the window's.
  const role = target.getAttribute("role");
  if (role === "combobox") return !(target instanceof HTMLButtonElement);
  return role === "searchbox" || role === "textbox";
}
