"use client";

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import type { OsWindow } from "@/lib/window-manager";

type Props = {
  win: OsWindow;
  title: string;
  isTop: boolean;
  /** Phone layout: full screen, no dragging or resizing under a thumb. */
  phone: boolean;
  onFocus: () => void;
  onClose: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (w: number, h: number) => void;
  children: ReactNode;
};

export function OsWindowFrame({
  win,
  title,
  isTop,
  phone,
  onFocus,
  onClose,
  onMove,
  onResize,
  children,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const titleId = `win-${win.id}-title`;

  // Focus moves into a window when it opens: to the element that asks for it
  // (the terminal's prompt), else the window itself.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wanted = el.querySelector<HTMLElement>("[data-autofocus]");
    (wanted ?? el).focus({ preventScroll: true });
  }, []);

  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if (phone || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const startX = e.clientX - win.x;
    const startY = e.clientY - win.y;
    const bar = e.currentTarget;
    bar.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) =>
      onMove(ev.clientX - startX, ev.clientY - startY);
    const up = () => {
      bar.removeEventListener("pointermove", move);
      bar.removeEventListener("pointerup", up);
      bar.removeEventListener("pointercancel", up);
    };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
    bar.addEventListener("pointercancel", up);
  }

  function startResize(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const originX = e.clientX - win.w;
    const originY = e.clientY - win.h;
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    const move = (ev: globalThis.PointerEvent) =>
      onResize(ev.clientX - originX, ev.clientY - originY);
    const up = () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  }

  const placement = phone
    ? { zIndex: 20 + win.z }
    : {
        zIndex: 20 + win.z,
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
      };

  return (
    <section
      ref={ref}
      role="dialog"
      aria-modal={false}
      aria-labelledby={titleId}
      tabIndex={-1}
      data-window={win.id}
      data-top={isTop || undefined}
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
        phone ? "fixed inset-0" : "absolute"
      } ${
        isTop
          ? "border-os-primary shadow-[0_0_0_1px_var(--color-os-primary),0_0_40px_-8px_var(--color-os-primary),8px_8px_0_0_rgb(0_0_0/0.45)]"
          : "border-os-line shadow-[6px_6px_0_0_rgb(0_0_0/0.4)]"
      } bg-os-panel`}
    >
      <div
        onPointerDown={startDrag}
        className={`flex h-9 shrink-0 select-none items-center justify-between gap-2 border-b px-3 ${
          phone ? "" : "cursor-grab active:cursor-grabbing"
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
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title}`}
          className="-mr-1 grid size-7 place-items-center font-mono text-lg leading-none hover:bg-os-bg/30"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
        {children}
      </div>
      {!phone && (
        <div
          aria-hidden
          onPointerDown={startResize}
          className="absolute bottom-0 right-0 size-4 cursor-se-resize bg-[linear-gradient(135deg,transparent_50%,var(--color-os-line)_50%,var(--color-os-line)_60%,transparent_60%,transparent_70%,var(--color-os-line)_70%,var(--color-os-line)_80%,transparent_80%)]"
        />
      )}
    </section>
  );
}
