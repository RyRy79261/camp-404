"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import type { Edge, OsWindow, Rect } from "@/lib/window-manager";

type Props = {
  win: OsWindow;
  title: string;
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

/** Follow one pointer until it lets go. */
function track(
  e: PointerEvent<HTMLElement>,
  onMove: (dx: number, dy: number) => void,
) {
  const el = e.currentTarget;
  const x0 = e.clientX;
  const y0 = e.clientY;
  el.setPointerCapture(e.pointerId);
  const move = (ev: globalThis.PointerEvent) =>
    onMove(ev.clientX - x0, ev.clientY - y0);
  const up = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

export function OsWindowFrame({
  win,
  title,
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
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const titleId = `win-${win.id}-title`;
  const fills = phone || win.maximized;

  // Focus moves into a window when it opens: to the element that asks for it
  // (the terminal's prompt), else the window itself.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wanted = el.querySelector<HTMLElement>("[data-autofocus]");
    (wanted ?? el).focus({ preventScroll: true });
  }, []);

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
      role="dialog"
      aria-modal={false}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-window={win.id}
      data-top={isTop || undefined}
      data-maximized={win.maximized || undefined}
      hidden={hidden}
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      style={placement}
      className={`os-window-in pointer-events-auto flex flex-col border outline-none ${
        phone
          ? "fixed inset-x-0 top-0 bottom-10"
          : win.maximized
            ? "absolute inset-0"
            : "absolute"
      } ${
        isTop
          ? "border-os-primary shadow-[0_0_40px_-8px_var(--color-os-primary),8px_8px_0_0_rgb(0_0_0/0.45)]"
          : "border-os-line shadow-[6px_6px_0_0_rgb(0_0_0/0.4)]"
      } bg-os-panel`}
    >
      <div
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
        <h2
          id={titleId}
          className="truncate font-pixel text-xs uppercase tracking-[0.2em]"
        >
          {title}
        </h2>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onMinimize}
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
            onClick={onClose}
            aria-label={`Close ${title}`}
            title="Close"
            className={`${button} text-lg`}
          >
            ×
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {children}
      </div>
      {!fills && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 right-0 size-4 bg-[linear-gradient(135deg,transparent_50%,var(--color-os-line)_50%,var(--color-os-line)_60%,transparent_60%,transparent_70%,var(--color-os-line)_70%,var(--color-os-line)_80%,transparent_80%)]"
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
