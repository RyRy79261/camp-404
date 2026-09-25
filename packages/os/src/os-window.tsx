"use client";

import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useLeaveGuard, WindowKeyProvider } from "./use-window-dirty";
import type { Edge, OsWindow, Rect } from "./window-manager";

type Props<K extends string> = {
  win: OsWindow<K>;
  title: string;
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
  onFocus: () => void;
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
  titleHeading = false,
  isTop,
  hidden,
  phone,
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
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wanted = el.querySelector<HTMLElement>("[data-autofocus]");
    (wanted ?? el).focus({ preventScroll: true });
  }, []);

  // Esc closes the window, but only an Esc nobody else used, pressed on
  // something really inside it. React sends a portal's events up through
  // the window too, so without the second check dismissing a select menu
  // or a popover drawn outside the window would close the program with it.
  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (!e.currentTarget.contains(e.target as Node)) return;
    e.stopPropagation();
    close();
  }

  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if (fills || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const { x, y } = win;
    track(e, (dx, dy) => onMove(x + dx, y + dy));
  }

  function startResize(edge: Edge, e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const from = { x: win.x, y: win.y, w: win.w, h: win.h };
    track(e, (dx, dy) => onResize(from, edge, dx, dy));
  }

  const placement = fills
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

  return (
    <section
      ref={ref}
      aria-roledescription="window"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-window={win.id}
      data-top={isTop || undefined}
      data-maximized={win.maximized || undefined}
      hidden={hidden}
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
      onKeyDown={onKeyDown}
      style={placement}
      className={`os-window-in pointer-events-auto flex flex-col border outline-none ${
        phone
          ? "fixed inset-x-0 top-0 bottom-10"
          : win.maximized
            ? "absolute inset-0"
            : "absolute"
      } ${
        isTop
          ? "border-os-primary shadow-[0_0_40px_-8px_var(--os-primary),8px_8px_0_0_rgb(0_0_0/0.45)]"
          : "border-os-line shadow-[6px_6px_0_0_rgb(0_0_0/0.4)]"
      } bg-os-panel`}
    >
      <div
        data-titlebar
        onPointerDown={startDrag}
        onDoubleClick={(e) => {
          if (phone || (e.target as HTMLElement).closest("button")) return;
          onToggleMaximize();
        }}
        className={`flex h-9 shrink-0 select-none items-center justify-between gap-2 border-b pl-3 pr-1 ${
          fills ? "" : "cursor-grab active:cursor-grabbing"
        } ${
          isTop
            ? "border-os-primary bg-os-primary text-os-primary-fg"
            : "border-os-line bg-os-chrome text-os-muted"
        }`}
      >
        <Title
          id={titleId}
          className="truncate font-pixel text-xs uppercase tracking-[0.2em]"
        >
          {title}
        </Title>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={minimize}
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
            aria-label={`Close ${title}`}
            title="Close"
            className={`${button} text-lg`}
          >
            ×
          </button>
        </div>
      </div>
      {/* Its own scroll box and size container, keyed by the window, so one
          window's scroll position never carries into another. */}
      <div
        key={win.id}
        className="@container min-h-0 flex-1 overflow-auto overscroll-contain"
      >
        <WindowKeyProvider windowKey={win.id}>{children}</WindowKeyProvider>
      </div>
      {!fills && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0 size-4 bg-[linear-gradient(135deg,transparent_50%,var(--os-line)_50%,var(--os-line)_60%,transparent_60%,transparent_70%,var(--os-line)_70%,var(--os-line)_80%,transparent_80%)]"
          />
          {GRIPS.map((g) => (
            <div
              key={g.edge}
              aria-hidden
              data-grip={g.edge}
              onPointerDown={(e) => startResize(g.edge, e)}
              className={`absolute z-10 ${g.className}`}
            />
          ))}
        </>
      )}
    </section>
  );
}
